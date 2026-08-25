import type {
  CityChatErrorPayload,
  CityChatRequest,
  CityChatResponse,
  CityChatServiceStatus,
} from './chatContract'

export const CITY_CHAT_API_ENDPOINT = '/api/chat'

export class CityChatApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number
  readonly requestId?: string

  constructor(message: string, options: { code: string; retryable: boolean; status: number; requestId?: string }) {
    super(message)
    this.name = 'CityChatApiError'
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
    this.requestId = options.requestId
  }
}

async function readJson(response: Response) {
  try {
    return await response.json() as unknown
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isTextArray(value: unknown, requireNonEmpty = false): value is string[] {
  return Array.isArray(value) && (!requireNonEmpty || value.length > 0) && value.every(isText)
}

function isServiceStatus(value: unknown): value is CityChatServiceStatus {
  return isRecord(value)
    && typeof value.configured === 'boolean'
}

function isChatResponse(value: unknown): value is CityChatResponse {
  if (!isRecord(value)
    || !isText(value.requestId)
    || !isText(value.conversationId)
    || !isText(value.asOf)
    || !isText(value.contextVersion)
    || !isRecord(value.answer)) return false
  if (value.intent !== undefined && (!isRecord(value.intent)
    || !['dispatch_triage', 'resource_compare', 'impact_analysis', 'dispatch_draft'].includes(String(value.intent.id))
    || !isText(value.intent.label))) return false
  const answer = value.answer
  if (!['answered', 'needs_confirmation', 'insufficient_context'].includes(String(answer.status))
    || !isText(answer.title)
    || !isText(answer.directAnswer)
    || !Array.isArray(answer.evidence)
    || !Array.isArray(answer.unknowns)
    || !Array.isArray(answer.options)
    || !Array.isArray(answer.sources)
    || !isTextArray(answer.followUps)) return false
  if (!answer.evidence.every((item) => isRecord(item)
    && isText(item.label)
    && isText(item.value)
    && ['fact', 'reported', 'simulated', 'inference'].includes(String(item.kind))
    && isTextArray(item.sourceIds, true))) return false
  if (!answer.unknowns.every((item) => isRecord(item)
    && isText(item.label)
    && isText(item.whyItMatters)
    && isText(item.confirmWith))) return false
  if (!answer.options.every((item) => isRecord(item)
    && isText(item.optionId)
    && isText(item.label)
    && isText(item.benefit)
    && isText(item.tradeoff))) return false
  if (!answer.sources.every((item) => isRecord(item) && isText(item.id) && isText(item.label))) return false
  if (answer.recommendation !== null && (!isRecord(answer.recommendation)
    || !isText(answer.recommendation.actionId)
    || !isText(answer.recommendation.action)
    || !isText(answer.recommendation.rationale)
    || !isText(answer.recommendation.impact)
    || typeof answer.recommendation.approvalRequired !== 'boolean')) return false
  return true
}

function invalidSuccessPayload(kind: 'status' | 'answer') {
  return new CityChatApiError(
    kind === 'status' ? '智能服务状态格式无效，请刷新后重试。' : '智能服务返回格式无效，本次没有展示业务回答。',
    { code: 'CHAT_RESPONSE_INVALID', retryable: true, status: 502 },
  )
}

function apiError(response: Response, payload: unknown) {
  const body = isRecord(payload) ? payload as Partial<CityChatErrorPayload> : null
  const error = isRecord(body?.error) ? body.error : null
  return new CityChatApiError(
    typeof error?.message === 'string' ? error.message : '智能服务暂时不可用，请稍后重试。',
    {
      code: typeof error?.code === 'string' ? error.code : 'CHAT_REQUEST_FAILED',
      retryable: typeof error?.retryable === 'boolean' ? error.retryable : response.status >= 500,
      status: response.status,
      requestId: typeof error?.requestId === 'string' ? error.requestId : undefined,
    },
  )
}

let statusPromise: Promise<CityChatServiceStatus> | null = null

export function getCityChatStatus(options?: { refresh?: boolean }) {
  if (!statusPromise || options?.refresh) {
    statusPromise = fetch(CITY_CHAT_API_ENDPOINT, {
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      const payload = await readJson(response)
      if (!response.ok) throw apiError(response, payload)
      if (!isServiceStatus(payload)) throw invalidSuccessPayload('status')
      return payload
    }).catch((error: unknown) => {
      statusPromise = null
      throw error
    })
  }
  return statusPromise
}

export async function sendCityChat(request: CityChatRequest, options?: { signal?: AbortSignal }) {
  const response = await fetch(CITY_CHAT_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal: options?.signal,
  })
  const payload = await readJson(response)
  if (!response.ok) throw apiError(response, payload)
  if (!isChatResponse(payload)) throw invalidSuccessPayload('answer')
  return payload
}
