import {
  WORKFLOW_SCENARIO_IDS,
  type ActionRunResponse,
  type AdapterEventResponse,
  type AdjustResourcesPreviewInput,
  type BoardResponse,
  type ConfirmActionRunInput,
  type DataMode,
  type DecisionLineageEntry,
  type ExecuteActionRunInput,
  type ExecuteResult,
  type FacilityStatusChangedInput,
  type SaveWorkflowReportInput,
  type WorkflowReportVersion,
} from '../../../../server/cityos/types.ts'

export type CityosBackendMode = 'api' | 'offline-demo'

export interface CityosApiFailure {
  code: string
  message: string
  traceId?: string
  retryable: boolean
  currentVersion?: number
}

export class CityosApiError extends Error {
  readonly status: number
  readonly failure: CityosApiFailure

  constructor(status: number, failure: CityosApiFailure) {
    super(failure.message)
    this.name = 'CityosApiError'
    this.status = status
    this.failure = failure
  }
}

export interface CityosWriteContext {
  actorId: string
  idempotencyKey: string
  mode: DataMode
}

export interface CityosApiClient {
  getBoard(incidentId: string, signal?: AbortSignal): Promise<BoardResponse>
  getActionRun(actionRunId: string, signal?: AbortSignal): Promise<ActionRunResponse>
  getDecisionLineage(incidentId: string, signal?: AbortSignal): Promise<{ items: DecisionLineageEntry[] }>
  getWorkflowReport(scenarioId: string, signal?: AbortSignal): Promise<WorkflowReportVersion>
  ingestFacilityStatus(input: FacilityStatusChangedInput, context: CityosWriteContext): Promise<AdapterEventResponse>
  previewAdjustResources(input: AdjustResourcesPreviewInput, context: CityosWriteContext): Promise<ActionRunResponse>
  confirmActionRun(actionRunId: string, input: ConfirmActionRunInput, context: CityosWriteContext): Promise<ActionRunResponse>
  executeActionRun(actionRunId: string, context: CityosWriteContext): Promise<ExecuteResult>
  saveWorkflowReport(
    scenarioId: string,
    input: SaveWorkflowReportInput,
    context: CityosWriteContext,
  ): Promise<WorkflowReportVersion>
}

interface CityosApiClientOptions {
  baseUrl?: string
  fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBaseUrl(value: string | undefined) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value)
}

function fallbackFailure(status: number): CityosApiFailure {
  return {
    code: status === 0 ? 'CITYOS_API_UNREACHABLE' : 'CITYOS_API_ERROR',
    message: status === 0 ? 'CityOS 后端暂时不可用。' : `CityOS 后端返回 HTTP ${status}。`,
    retryable: status === 0 || status >= 500,
  }
}

function readFailure(payload: unknown, status: number): CityosApiFailure {
  if (!isRecord(payload) || !isRecord(payload.error)) return fallbackFailure(status)
  const error = payload.error
  return {
    code: typeof error.code === 'string' ? error.code : 'CITYOS_API_ERROR',
    message: typeof error.message === 'string' ? error.message : fallbackFailure(status).message,
    traceId: typeof error.traceId === 'string' ? error.traceId : undefined,
    retryable: error.retryable === true,
    currentVersion: typeof error.currentVersion === 'number' ? error.currentVersion : undefined,
  }
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return null
  }
}

export function resolveCityosBackendMode(value = import.meta.env.VITE_CITYOS_BACKEND_MODE): CityosBackendMode {
  return value === 'api' ? 'api' : 'offline-demo'
}

export function supportsWorkflowReportPersistence(scenarioId: string) {
  return WORKFLOW_SCENARIO_IDS.some((candidate) => candidate === scenarioId)
}

export function createCityosIdempotencyKey(scope: string) {
  return `${scope}:${crypto.randomUUID()}`
}

export function createCityosApiClient(options: CityosApiClientOptions = {}): CityosApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? import.meta.env.VITE_CITYOS_API_BASE_URL)
  const fetcher = options.fetcher ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        cache: 'no-store',
        ...init,
        headers: {
          Accept: 'application/json',
          ...init.headers,
        },
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new CityosApiError(0, fallbackFailure(0))
    }

    const payload = await readJson(response)
    if (!response.ok) throw new CityosApiError(response.status, readFailure(payload, response.status))
    return payload as T
  }

  function write<T>(path: string, body: unknown, context: CityosWriteContext) {
    return request<T>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': context.idempotencyKey,
        'X-Actor-Id': context.actorId,
        'X-Data-Mode': context.mode,
      },
      body: JSON.stringify(body),
    })
  }

  return {
    getBoard(incidentId, signal) {
      return request<BoardResponse>(`/v1/incidents/${encodePathSegment(incidentId)}/board`, { signal })
    },
    getActionRun(actionRunId, signal) {
      return request<ActionRunResponse>(`/v1/action-runs/${encodePathSegment(actionRunId)}`, { signal })
    },
    getDecisionLineage(incidentId, signal) {
      return request<{ items: DecisionLineageEntry[] }>(`/v1/incidents/${encodePathSegment(incidentId)}/decision-lineage`, { signal })
    },
    getWorkflowReport(scenarioId, signal) {
      return request<WorkflowReportVersion>(`/v1/workflow-scenarios/${encodePathSegment(scenarioId)}/report`, { signal })
    },
    ingestFacilityStatus(input, context) {
      return write<AdapterEventResponse>('/v1/adapter-events', input, context)
    },
    previewAdjustResources(input, context) {
      return write<ActionRunResponse>('/v1/actions/adjust_resources/preview', input, context)
    },
    confirmActionRun(actionRunId, input, context) {
      return write<ActionRunResponse>(`/v1/action-runs/${encodePathSegment(actionRunId)}/confirm`, input, context)
    },
    executeActionRun(actionRunId, context) {
      const input: ExecuteActionRunInput = { expectedStatus: 'confirmed' }
      return write<ExecuteResult>(`/v1/action-runs/${encodePathSegment(actionRunId)}/execute`, input, context)
    },
    saveWorkflowReport(scenarioId, input, context) {
      return write<WorkflowReportVersion>(
        `/v1/workflow-scenarios/${encodePathSegment(scenarioId)}/report`,
        input,
        context,
      )
    },
  }
}
