import { randomUUID } from 'node:crypto'

import {
  parseAdjustResourcesPreview,
  parseConfirmActionRun,
  parseExecuteActionRun,
  parseFacilityStatusChanged,
  parseMode,
  parseTaskFeedback,
  parseWorkflowReportSave,
  parseWorkflowScenarioId,
} from './contracts.ts'
import {
  CAPABILITIES,
  createAuthService,
  extractCredential,
  hasCapability,
  parseLoginInput,
  type AuthService,
  type Capability,
  type Principal,
} from './auth.ts'
import { getCityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'
import { createMedicalService } from './medical-service.ts'
import {
  createPostgresLlmAuditReader,
  type LlmAuditReader,
} from './llm-audit.ts'
import type { MedicalService, WriteContext } from './types.ts'
import type { WorkflowReportService } from './types.ts'
import { createWorkflowReportService } from './workflow-report-service.ts'

type Environment = Record<string, string | undefined>

const MAX_BODY_BYTES = 128 * 1024

interface RuntimeDependencies {
  service?: MedicalService
  authService?: AuthService
  llmAuditReader?: LlmAuditReader
  workflowReportService?: WorkflowReportService
  randomId?: () => string
}

function jsonResponse(payload: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
}

function apiPath(request: Request) {
  const url = new URL(request.url)
  const rewrittenPath = url.searchParams.get('path')
  if (url.pathname === '/api/cityos' && rewrittenPath !== null) {
    return `/v1/${rewrittenPath.replace(/^\/+/, '')}`.replace(/\/+$/, '')
  }
  return url.pathname.replace(/\/+$/, '') || '/'
}

function requireHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim()
  if (!value) throw new CityosApiError(400, 'MISSING_WRITE_CONTEXT', `${name} 请求头不能为空。`)
  return value
}

function writeContext(request: Request, traceId: string, principal: Principal | null): WriteContext {
  const mode = parseMode(request.headers.get('x-data-mode'))
  if (mode === 'live-degraded') {
    throw new CityosApiError(409, 'DEGRADED_MODE_READ_ONLY', '降级模式只允许读取，不能执行写操作。')
  }
  return {
    actorId: principal?.actorId ?? requireHeader(request, 'X-Actor-Id'),
    idempotencyKey: requireHeader(request, 'Idempotency-Key'),
    mode,
    traceId,
  }
}

async function readJson(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new CityosApiError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求体必须使用 application/json。')
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new CityosApiError(413, 'REQUEST_TOO_LARGE', '请求体超过 128 KiB。')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new CityosApiError(400, 'INVALID_JSON', '请求体不是有效 JSON。')
  }
}

function serviceFor(env: Environment, dependencies: RuntimeDependencies) {
  return dependencies.service ?? createMedicalService(getCityosDatabase(env))
}

function authFor(env: Environment, dependencies: RuntimeDependencies) {
  return dependencies.authService ?? createAuthService(getCityosDatabase(env))
}

function workflowReportFor(env: Environment, dependencies: RuntimeDependencies) {
  return dependencies.workflowReportService ?? createWorkflowReportService(getCityosDatabase(env))
}

function authMode(env: Environment) {
  const mode = env.CITYOS_AUTH_MODE?.trim().toLowerCase() ?? 'optional'
  if (!['optional', 'required'].includes(mode)) {
    throw new CityosApiError(503, 'INVALID_AUTH_CONFIGURATION', 'CITYOS_AUTH_MODE 必须是 optional 或 required。')
  }
  return mode as 'optional' | 'required'
}

async function authorize(
  request: Request,
  env: Environment,
  dependencies: RuntimeDependencies,
  capability: Capability,
) {
  const rawCredential = extractCredential(request)
  if (!rawCredential && authMode(env) === 'optional') return null
  if (!rawCredential) throw new CityosApiError(401, 'AUTH_REQUIRED', '需要登录或 API Key。')
  const principal = await authFor(env, dependencies).authenticate(rawCredential)
  if (!principal) throw new CityosApiError(401, 'INVALID_CREDENTIALS', '登录态或 API Key 无效。')
  if (!hasCapability(principal, capability)) {
    throw new CityosApiError(403, 'FORBIDDEN', `当前角色缺少能力：${capability}。`)
  }
  return principal
}

async function routeRequest(request: Request, env: Environment, dependencies: RuntimeDependencies, traceId: string) {
  const path = apiPath(request)
  if (request.method === 'POST' && path === '/v1/auth/login') {
    const result = await authFor(env, dependencies).login(parseLoginInput(await readJson(request)))
    return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
  }
  if (request.method === 'GET' && path === '/v1/auth/me') {
    const rawCredential = extractCredential(request)
    if (!rawCredential) throw new CityosApiError(401, 'AUTH_REQUIRED', '需要登录或 API Key。')
    const principal = await authFor(env, dependencies).authenticate(rawCredential)
    if (!principal) throw new CityosApiError(401, 'INVALID_CREDENTIALS', '登录态或 API Key 无效。')
    return jsonResponse({ principal }, 200, { 'X-Trace-Id': traceId })
  }
  if (request.method === 'POST' && path === '/v1/auth/logout') {
    const rawCredential = extractCredential(request)
    if (rawCredential) await authFor(env, dependencies).revoke(rawCredential)
    return jsonResponse({ status: 'ok' }, 200, { 'X-Trace-Id': traceId })
  }

  if (request.method === 'GET' && path === '/v1/ops/llm-calls') {
    const principal = await authorize(request, env, dependencies, CAPABILITIES.opsAuditRead)
    if (!principal) throw new CityosApiError(401, 'AUTH_REQUIRED', '审计记录需要登录后访问。')
    const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      throw new CityosApiError(400, 'INVALID_LIMIT', 'limit 必须是 1 到 100 的整数。')
    }
    const reader = dependencies.llmAuditReader
      ?? createPostgresLlmAuditReader(getCityosDatabase(env))
    return jsonResponse(await reader(requestedLimit), 200, { 'X-Trace-Id': traceId })
  }

  const workflowReportMatch = /^\/v1\/workflow-scenarios\/([^/]+)\/report$/.exec(path)
  if (workflowReportMatch) {
    const scenarioId = parseWorkflowScenarioId(decodeURIComponent(workflowReportMatch[1]))
    if (request.method === 'GET') {
      await authorize(request, env, dependencies, CAPABILITIES.incidentRead)
      const result = await workflowReportFor(env, dependencies).getReport(scenarioId)
      return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
    }
    if (request.method === 'POST') {
      const principal = await authorize(request, env, dependencies, CAPABILITIES.workflowReportWrite)
      const context = writeContext(request, traceId, principal)
      if (context.mode !== 'demo') {
        throw new CityosApiError(409, 'WORKFLOW_REPORT_DEMO_ONLY', '演示工作流报告只允许在 demo 模式保存。')
      }
      const input = parseWorkflowReportSave(await readJson(request))
      const result = await workflowReportFor(env, dependencies).saveReport(scenarioId, input, context)
      return jsonResponse(result, 201, { 'X-Trace-Id': traceId })
    }
  }

  const incidentMatch = /^\/v1\/incidents\/([^/]+)(?:\/(context|plans|task-packages|decision-lineage|board))?$/.exec(path)
  if (request.method === 'GET' && incidentMatch) {
    await authorize(request, env, dependencies, CAPABILITIES.incidentRead)
    const incidentId = decodeURIComponent(incidentMatch[1])
    const resource = incidentMatch[2]
    const service = serviceFor(env, dependencies)
    if (!resource) return jsonResponse(await service.getIncident(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'context') return jsonResponse(await service.getContext(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'board') return jsonResponse(await service.getBoard(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'plans') return jsonResponse(await service.getPlans(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'task-packages') return jsonResponse(await service.getTaskPackages(incidentId), 200, { 'X-Trace-Id': traceId })
    return jsonResponse(await service.getDecisionLineage(incidentId), 200, { 'X-Trace-Id': traceId })
  }

  if (request.method === 'POST' && path === '/v1/adapter-events') {
    const principal = await authorize(request, env, dependencies, CAPABILITIES.adapterEventWrite)
    const context = writeContext(request, traceId, principal)
    const input = parseFacilityStatusChanged(await readJson(request))
    const result = await serviceFor(env, dependencies).ingestAdapterEvent(input, context)
    return jsonResponse(result, 202, { 'X-Trace-Id': traceId })
  }

  if (request.method === 'POST' && path === '/v1/actions/adjust_resources/preview') {
    const principal = await authorize(request, env, dependencies, CAPABILITIES.adjustResourcesPreview)
    const context = writeContext(request, traceId, principal)
    const input = parseAdjustResourcesPreview(await readJson(request))
    const result = await serviceFor(env, dependencies).previewAdjustResources(input, context)
    return jsonResponse(result, 201, { 'X-Trace-Id': traceId })
  }

  const actionRunReadMatch = /^\/v1\/action-runs\/([^/]+)$/.exec(path)
  if (request.method === 'GET' && actionRunReadMatch) {
    await authorize(request, env, dependencies, CAPABILITIES.incidentRead)
    const actionRunId = decodeURIComponent(actionRunReadMatch[1])
    const result = await serviceFor(env, dependencies).getActionRun(actionRunId)
    return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
  }

  const actionMatch = /^\/v1\/action-runs\/([^/]+)\/(confirm|execute)$/.exec(path)
  if (request.method === 'POST' && actionMatch) {
    const actionRunId = decodeURIComponent(actionMatch[1])
    if (actionMatch[2] === 'confirm') {
      const principal = await authorize(request, env, dependencies, CAPABILITIES.adjustResourcesConfirm)
      const context = writeContext(request, traceId, principal)
      const result = await serviceFor(env, dependencies)
        .confirmActionRun(actionRunId, parseConfirmActionRun(await readJson(request)), context)
      return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
    }
    const principal = await authorize(request, env, dependencies, CAPABILITIES.adjustResourcesExecute)
    const context = writeContext(request, traceId, principal)
    // 202：只表示已受理并进入待发送，不表示已送达。终态由前端轮询 GET /v1/action-runs/{id}。
    const result = await serviceFor(env, dependencies)
      .executeActionRun(actionRunId, parseExecuteActionRun(await readJson(request)), context)
    return jsonResponse(result, 202, { 'X-Trace-Id': traceId })
  }

  const feedbackMatch = /^\/v1\/tasks\/([^/]+)\/feedback$/.exec(path)
  if (request.method === 'POST' && feedbackMatch) {
    const principal = await authorize(request, env, dependencies, CAPABILITIES.taskFeedbackWrite)
    const context = writeContext(request, traceId, principal)
    const taskPackageId = decodeURIComponent(feedbackMatch[1])
    const result = await serviceFor(env, dependencies)
      .recordTaskFeedback(taskPackageId, parseTaskFeedback(await readJson(request)), context)
    return jsonResponse(result, 201, { 'X-Trace-Id': traceId })
  }

  throw new CityosApiError(404, 'ROUTE_NOT_FOUND', '接口不存在。')
}

export async function handleCityosRequest(
  request: Request,
  env: Environment,
  dependencies: RuntimeDependencies = {},
) {
  const traceId = dependencies.randomId?.() ?? randomUUID()
  try {
    return await routeRequest(request, env, dependencies, traceId)
  } catch (error) {
    const known = error instanceof CityosApiError
    const databaseMissing = error instanceof Error && error.message === 'CITYOS_DATABASE_URL is not configured'
    const status = known ? error.status : 503
    const payload = {
      error: {
        code: known ? error.code : databaseMissing ? 'DATABASE_NOT_CONFIGURED' : 'SERVICE_UNAVAILABLE',
        message: known
          ? error.message
          : databaseMissing
            ? 'CityOS 数据库尚未配置。'
            : 'CityOS 后端暂时不可用。',
        retryable: known ? error.retryable : true,
        traceId,
        ...(known && error.currentVersion !== undefined ? { currentVersion: error.currentVersion } : {}),
      },
    }
    return jsonResponse(payload, status, { 'X-Trace-Id': traceId })
  }
}
