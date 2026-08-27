import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'

import type { CityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'

export const AUTH_ROLES = ['viewer', 'operator', 'supervisor', 'system_adapter', 'admin'] as const
export type AuthRole = typeof AUTH_ROLES[number]

export const CAPABILITIES = {
  incidentRead: 'incident:read',
  adjustResourcesPreview: 'action:adjust_resources:preview',
  adjustResourcesConfirm: 'action:adjust_resources:confirm',
  adjustResourcesExecute: 'action:adjust_resources:execute',
  adapterEventWrite: 'adapter:event:write',
  taskFeedbackWrite: 'task:feedback:write',
  workflowReportWrite: 'workflow:report:write',
  opsAuditRead: 'ops:audit:read',
} as const
export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES]

const ALL_CAPABILITIES = Object.values(CAPABILITIES)
const ROLE_CAPABILITIES: Record<AuthRole, readonly Capability[]> = {
  viewer: [CAPABILITIES.incidentRead],
  operator: [
    CAPABILITIES.incidentRead,
    CAPABILITIES.adjustResourcesPreview,
    CAPABILITIES.adjustResourcesExecute,
    CAPABILITIES.workflowReportWrite,
  ],
  supervisor: [
    CAPABILITIES.incidentRead,
    CAPABILITIES.adjustResourcesPreview,
    CAPABILITIES.adjustResourcesConfirm,
    CAPABILITIES.adjustResourcesExecute,
    CAPABILITIES.workflowReportWrite,
    CAPABILITIES.opsAuditRead,
  ],
  system_adapter: [CAPABILITIES.adapterEventWrite, CAPABILITIES.taskFeedbackWrite],
  admin: ALL_CAPABILITIES,
}

const SESSION_TTL_SECONDS = 24 * 60 * 60
const PASSWORD_KEY_BYTES = 32
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1

export interface Principal {
  kind: 'user' | 'api_key'
  principalId: string
  actorId: string
  name: string
  roles: AuthRole[]
  capabilities: Capability[]
}

export interface LoginInput {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  tokenType: 'Bearer'
  expiresAt: number
  principal: Principal
}

export interface AuthService {
  authenticate(rawCredential: string): Promise<Principal | null>
  login(input: LoginInput): Promise<LoginResponse>
  revoke(rawCredential: string): Promise<void>
}

type Row = Record<string, unknown>

function credentialHash(raw: string) {
  return createHash('sha256').update(raw).digest('hex')
}

function derivePassword(password: string, salt: Buffer, options = { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

export async function hashPassword(password: string) {
  if (password.length < 10) throw new Error('密码至少需要 10 个字符。')
  const salt = randomBytes(16)
  const key = await derivePassword(password, salt)
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltHex, keyHex] = encoded.split('$')
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltHex || !keyHex) return false
  const options = { N: Number(n), r: Number(r), p: Number(p) }
  if (!Number.isInteger(options.N) || !Number.isInteger(options.r) || !Number.isInteger(options.p)
    || options.N < 2 || options.N > 1_048_576 || options.r < 1 || options.r > 32 || options.p < 1 || options.p > 16
    || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(keyHex)) return false
  const expected = Buffer.from(keyHex, 'hex')
  if (expected.length !== PASSWORD_KEY_BYTES) return false
  try {
    const actual = await derivePassword(password, Buffer.from(saltHex, 'hex'), options)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && (AUTH_ROLES as readonly string[]).includes(value)
}

export function capabilitiesForRoles(roles: readonly AuthRole[]) {
  return [...new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role]))].sort() as Capability[]
}

export function hasCapability(principal: Principal, capability: Capability) {
  return principal.capabilities.includes(capability)
}

export function extractCredential(request: Request) {
  const apiKey = request.headers.get('x-api-key')?.trim()
  if (apiKey) return apiKey
  const authorization = request.headers.get('authorization')?.trim()
  if (!authorization) return null
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  return match?.[1]?.trim() || null
}

export function parseLoginInput(value: unknown): LoginInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CityosApiError(400, 'INVALID_LOGIN', '登录请求格式不正确。')
  }
  const email = 'email' in value && typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const password = 'password' in value && typeof value.password === 'string' ? value.password : ''
  if (!email || !password) throw new CityosApiError(400, 'INVALID_LOGIN', '邮箱和密码不能为空。')
  return { email, password }
}

function principal(translation: Row, rolesRows: readonly Row[]): Principal | null {
  const roles = rolesRows.map((row) => row.role).filter(isAuthRole)
  if (roles.length === 0) return null
  return {
    kind: translation.kind as Principal['kind'],
    principalId: String(translation.principal_id),
    actorId: String(translation.actor_id),
    name: String(translation.name),
    roles,
    capabilities: capabilitiesForRoles(roles),
  }
}

async function rolesFor(sql: CityosDatabase, kind: Principal['kind'], principalId: string) {
  return sql`
    SELECT role FROM cityos.auth_role_grant
    WHERE principal_type = ${kind} AND principal_id = ${principalId}
    ORDER BY role
  ` as Promise<Row[]>
}

export function createAuthService(sql: CityosDatabase): AuthService {
  return {
    async authenticate(rawCredential: string) {
      const digest = credentialHash(rawCredential)
      const [session] = await sql`
        SELECT 'user' AS kind, users.id AS principal_id, users.email AS actor_id,
               users.display_name AS name
        FROM cityos.auth_session sessions
        JOIN cityos.auth_user users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ${digest}
          AND sessions.revoked_at IS NULL
          AND sessions.expires_at > now()
          AND users.status = 'active'
      `
      if (session) return principal(session as Row, await rolesFor(sql, 'user', String(session.principal_id)))

      const [apiKey] = await sql`
        UPDATE cityos.auth_api_key
        SET last_used_at = now()
        WHERE key_hash = ${digest}
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
        RETURNING 'api_key' AS kind, id AS principal_id, actor_id, name
      `
      if (!apiKey) return null
      return principal(apiKey as Row, await rolesFor(sql, 'api_key', String(apiKey.principal_id)))
    },

    async login(input: LoginInput) {
      const [user] = await sql`
        SELECT id, email, display_name, password_hash
        FROM cityos.auth_user
        WHERE lower(email) = ${input.email.trim().toLowerCase()} AND status = 'active'
      `
      if (!user || !await verifyPassword(input.password, String(user.password_hash))) {
        throw new CityosApiError(401, 'INVALID_CREDENTIALS', '邮箱或密码错误。')
      }
      const roles = await rolesFor(sql, 'user', String(user.id))
      const userPrincipal = principal({
        kind: 'user',
        principal_id: user.id,
        actor_id: user.email,
        name: user.display_name,
      }, roles)
      if (!userPrincipal) throw new CityosApiError(403, 'NO_ROLE_GRANT', '账号尚未分配角色。')

      const rawToken = randomBytes(32).toString('base64url')
      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
      await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO cityos.auth_session (id, user_id, token_hash, expires_at)
          VALUES (
            ${randomUUID()}, ${String(user.id)}, ${credentialHash(rawToken)},
            ${new Date(expiresAt * 1000).toISOString()}
          )
        `
        await transaction`
          UPDATE cityos.auth_user SET last_login_at = now(), updated_at = now()
          WHERE id = ${String(user.id)}
        `
      })
      return { accessToken: rawToken, tokenType: 'Bearer', expiresAt, principal: userPrincipal }
    },

    async revoke(rawCredential: string) {
      await sql`
        UPDATE cityos.auth_session SET revoked_at = now()
        WHERE token_hash = ${credentialHash(rawCredential)} AND revoked_at IS NULL
      `
    },
  }
}
