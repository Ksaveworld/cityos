import { randomUUID } from 'node:crypto'

import {
  parseAdjustResourcesPreview,
  parseConfirmActionRun,
  parseExecuteActionRun,
  parseFacilityStatusChanged,
  parseMode,
  parseTaskFeedback,
} from './contracts.ts'
import { getCityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'
import { createMedicalService } from './medical-service.ts'
import type { MedicalService, WriteContext } from './types.ts'

type Environment = Record<string, string | undefined>

const MAX_BODY_BYTES = 128 * 1024

interface RuntimeDependencies {
  service?: MedicalService
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

function writeContext(request: Request, traceId: string): WriteContext {
  const mode = parseMode(request.headers.get('x-data-mode'))
  if (mode === 'live-degraded') {
    throw new CityosApiError(409, 'DEGRADED_MODE_READ_ONLY', '降级模式只允许读取，不能执行写操作。')
  }
  return {
    actorId: requireHeader(request, 'X-Actor-Id'),
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

async function routeRequest(request: Request, env: Environment, dependencies: RuntimeDependencies, traceId: string) {
  const path = apiPath(request)
  const incidentMatch = /^\/v1\/incidents\/([^/]+)(?:\/(context|plans|task-packages|decision-lineage))?$/.exec(path)
  if (request.method === 'GET' && incidentMatch) {
    const incidentId = decodeURIComponent(incidentMatch[1])
    const resource = incidentMatch[2]
    const service = serviceFor(env, dependencies)
    if (!resource) return jsonResponse(await service.getIncident(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'context') return jsonResponse(await service.getContext(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'plans') return jsonResponse(await service.getPlans(incidentId), 200, { 'X-Trace-Id': traceId })
    if (resource === 'task-packages') return jsonResponse(await service.getTaskPackages(incidentId), 200, { 'X-Trace-Id': traceId })
    return jsonResponse(await service.getDecisionLineage(incidentId), 200, { 'X-Trace-Id': traceId })
  }

  if (request.method === 'POST' && path === '/v1/adapter-events') {
    const context = writeContext(request, traceId)
    const input = parseFacilityStatusChanged(await readJson(request))
    const result = await serviceFor(env, dependencies).ingestAdapterEvent(input, context)
    return jsonResponse(result, 202, { 'X-Trace-Id': traceId })
  }

  if (request.method === 'POST' && path === '/v1/actions/adjust_resources/preview') {
    const context = writeContext(request, traceId)
    const input = parseAdjustResourcesPreview(await readJson(request))
    const result = await serviceFor(env, dependencies).previewAdjustResources(input, context)
    return jsonResponse(result, 201, { 'X-Trace-Id': traceId })
  }

  const actionRunReadMatch = /^\/v1\/action-runs\/([^/]+)$/.exec(path)
  if (request.method === 'GET' && actionRunReadMatch) {
    const actionRunId = decodeURIComponent(actionRunReadMatch[1])
    const result = await serviceFor(env, dependencies).getActionRun(actionRunId)
    return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
  }

  const actionMatch = /^\/v1\/action-runs\/([^/]+)\/(confirm|execute)$/.exec(path)
  if (request.method === 'POST' && actionMatch) {
    const context = writeContext(request, traceId)
    const actionRunId = decodeURIComponent(actionMatch[1])
    if (actionMatch[2] === 'confirm') {
      const result = await serviceFor(env, dependencies)
        .confirmActionRun(actionRunId, parseConfirmActionRun(await readJson(request)), context)
      return jsonResponse(result, 200, { 'X-Trace-Id': traceId })
    }
    // 202：只表示已受理并进入待发送，不表示已送达。终态由前端轮询 GET /v1/action-runs/{id}。
    const result = await serviceFor(env, dependencies)
      .executeActionRun(actionRunId, parseExecuteActionRun(await readJson(request)), context)
    return jsonResponse(result, 202, { 'X-Trace-Id': traceId })
  }

  const feedbackMatch = /^\/v1\/tasks\/([^/]+)\/feedback$/.exec(path)
  if (request.method === 'POST' && feedbackMatch) {
    const context = writeContext(request, traceId)
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
