import { createHash, randomBytes, randomUUID } from 'node:crypto'

import postgres from 'postgres'

import { AUTH_ROLES, hashPassword } from '../server/cityos/auth.ts'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]
  const value = process.argv[index + 1]
  if (!key?.startsWith('--') || value === undefined) throw new Error('参数必须使用 --name value 格式。')
  args.set(key.slice(2), value)
}

const kind = args.get('kind') ?? 'user'
const role = args.get('role')
if (!AUTH_ROLES.includes(role)) throw new Error(`--role 必须是 ${AUTH_ROLES.join(', ')} 之一。`)

const databaseUrl = process.env.CITYOS_DATABASE_URL
  ?? 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'
const sql = postgres(databaseUrl, { max: 1 })

try {
  if (kind === 'user') {
    const email = args.get('email')?.trim().toLowerCase()
    const displayName = args.get('name')?.trim()
    const password = process.env.CITYOS_AUTH_PASSWORD
    if (!email || !displayName || !password) {
      throw new Error('用户需要 --email、--name，并通过 CITYOS_AUTH_PASSWORD 环境变量提供密码。')
    }
    const passwordHash = await hashPassword(password)
    const userId = randomUUID()
    await sql.begin(async (transaction) => {
      const [user] = await transaction`
        INSERT INTO cityos.auth_user (id, email, display_name, password_hash)
        VALUES (${userId}, ${email}, ${displayName}, ${passwordHash})
        ON CONFLICT ((lower(email))) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          status = 'active',
          updated_at = now()
        RETURNING id
      `
      await transaction`
        DELETE FROM cityos.auth_role_grant
        WHERE principal_type = 'user' AND principal_id = ${String(user.id)}
      `
      await transaction`
        INSERT INTO cityos.auth_role_grant (principal_type, principal_id, role)
        VALUES ('user', ${String(user.id)}, ${role})
      `
    })
    console.log(JSON.stringify({ kind: 'user', email, role }))
  } else if (kind === 'api-key') {
    const name = args.get('name')?.trim()
    const actorId = args.get('actor')?.trim()
    if (!name || !actorId) throw new Error('API Key 需要 --name 和 --actor。')
    const rawKey = `cityos_${randomBytes(32).toString('base64url')}`
    const keyId = randomUUID()
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO cityos.auth_api_key (id, name, key_prefix, key_hash, actor_id)
        VALUES (
          ${keyId}, ${name}, ${rawKey.slice(0, 12)},
          ${createHash('sha256').update(rawKey).digest('hex')}, ${actorId}
        )
      `
      await transaction`
        INSERT INTO cityos.auth_role_grant (principal_type, principal_id, role)
        VALUES ('api_key', ${keyId}, ${role})
      `
    })
    console.log(JSON.stringify({ kind: 'api_key', name, actorId, role, apiKey: rawKey }))
  } else {
    throw new Error('--kind 必须是 user 或 api-key。')
  }
} finally {
  await sql.end()
}
