import { CityosApiError } from './errors.ts'
import type {
  Confidence,
  DataMode,
  FacilityStatus,
  FacilityStatusChangedInput,
  AdjustResourcesPreviewInput,
  ConfirmActionRunInput,
  ExecuteActionRunInput,
  TaskFeedbackInput,
  TaskFeedbackStatus,
} from './types.ts'

const MODES = new Set<DataMode>(['demo', 'live', 'live-degraded'])
const CONFIDENCE = new Set<Confidence>(['confirmed', 'reported', 'inferred'])
const FACILITY_STATUS = new Set<FacilityStatus>(['available', 'temporarily_unavailable', 'unknown'])
const REASON_CODES = new Set([
  'source_reported_unavailable',
  'source_recovered',
  'unverified',
])
const FEEDBACK_STATUSES = new Set<TaskFeedbackStatus>([
  'accepted', 'en_route', 'arrived', 'completed', 'exception', 'unknown',
])

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 必须是对象。`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 不能为空。`)
  }
  return value.trim()
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 必须是正整数。`)
  }
  return Number(value)
}

function unixSeconds(value: unknown, name: string): number {
  const seconds = positiveInteger(value, name)
  if (seconds < 946684800) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 不是有效的 Unix 秒。`)
  }
  return seconds
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 必须是 1 到 10 项的数组。`)
  }
  const values = value.map((item, index) => text(item, `${name}[${index}]`))
  if (new Set(values).size !== values.length) {
    throw new CityosApiError(400, 'INVALID_REQUEST', `${name} 不能包含重复项。`)
  }
  return values
}

export function parseMode(value: string | null): DataMode {
  if (!value || !MODES.has(value as DataMode)) {
    throw new CityosApiError(400, 'INVALID_DATA_MODE', 'X-Data-Mode 必须是 demo、live 或 live-degraded。')
  }
  return value as DataMode
}

export function parseFacilityStatusChanged(value: unknown): FacilityStatusChangedInput {
  const body = record(value, '请求体')
  const source = record(body.source, 'source')
  const mode = text(body.mode, 'mode') as DataMode
  const confidence = text(source.confidence, 'source.confidence') as Confidence
  const status = text(body.status, 'status') as FacilityStatus
  const reasonCode = text(body.reasonCode, 'reasonCode')

  if (!MODES.has(mode)) throw new CityosApiError(400, 'INVALID_REQUEST', 'mode 不受支持。')
  if (!CONFIDENCE.has(confidence)) throw new CityosApiError(400, 'INVALID_REQUEST', 'confidence 不受支持。')
  if (!FACILITY_STATUS.has(status)) throw new CityosApiError(400, 'INVALID_REQUEST', 'facility status 不受支持。')
  if (!REASON_CODES.has(reasonCode)) throw new CityosApiError(400, 'INVALID_REQUEST', 'reasonCode 不受支持。')
  if (body.eventType !== 'facility.status.changed') {
    throw new CityosApiError(400, 'UNSUPPORTED_EVENT_TYPE', 'P0 只接收 facility.status.changed。')
  }

  const sourceSequence = source.sourceSequence === undefined
    ? undefined
    : positiveInteger(source.sourceSequence, 'source.sourceSequence')

  return {
    eventId: text(body.eventId, 'eventId'),
    eventType: 'facility.status.changed',
    mode,
    incidentId: text(body.incidentId, 'incidentId'),
    facilityId: text(body.facilityId, 'facilityId'),
    status,
    reasonCode: reasonCode as FacilityStatusChangedInput['reasonCode'],
    aggregateVersion: positiveInteger(body.aggregateVersion, 'aggregateVersion'),
    idempotencyKey: text(body.idempotencyKey, 'idempotencyKey'),
    source: {
      sourceSystem: text(source.sourceSystem, 'source.sourceSystem'),
      externalEventId: text(source.externalEventId, 'source.externalEventId'),
      schemaVersion: text(source.schemaVersion, 'source.schemaVersion'),
      sourceSequence,
      occurredAt: unixSeconds(source.occurredAt, 'source.occurredAt'),
      receivedAt: unixSeconds(source.receivedAt, 'source.receivedAt'),
      confidence,
    },
  }
}

export function parseAdjustResourcesPreview(value: unknown): AdjustResourcesPreviewInput {
  const body = record(value, '请求体')
  return {
    incidentId: text(body.incidentId, 'incidentId'),
    planVersion: positiveInteger(body.planVersion, 'planVersion'),
    expectedIncidentVersion: positiveInteger(body.expectedIncidentVersion, 'expectedIncidentVersion'),
    previousFacilityId: text(body.previousFacilityId, 'previousFacilityId'),
    candidateFacilityIds: stringList(body.candidateFacilityIds, 'candidateFacilityIds'),
    selectedFacilityId: text(body.selectedFacilityId, 'selectedFacilityId'),
  }
}

export function parseConfirmActionRun(value: unknown): ConfirmActionRunInput {
  const body = record(value, '请求体')
  return {
    previewHash: text(body.previewHash, 'previewHash'),
    expectedPlanVersion: positiveInteger(body.expectedPlanVersion, 'expectedPlanVersion'),
  }
}

export function parseExecuteActionRun(value: unknown): ExecuteActionRunInput {
  const body = record(value, '请求体')
  if (body.expectedStatus !== 'confirmed') {
    throw new CityosApiError(400, 'INVALID_REQUEST', 'expectedStatus 必须是 confirmed。')
  }
  return { expectedStatus: 'confirmed' }
}

export function parseTaskFeedback(value: unknown): TaskFeedbackInput {
  const body = record(value, '请求体')
  const status = text(body.status, 'status') as TaskFeedbackStatus
  if (!FEEDBACK_STATUSES.has(status)) {
    throw new CityosApiError(400, 'INVALID_REQUEST', 'feedback status 不受支持。')
  }
  const detail = body.detail === undefined ? undefined : text(body.detail, 'detail')
  return {
    externalFeedbackId: text(body.externalFeedbackId, 'externalFeedbackId'),
    status,
    expectedCurrentStatus: text(body.expectedCurrentStatus, 'expectedCurrentStatus'),
    occurredAt: unixSeconds(body.occurredAt, 'occurredAt'),
    receivedAt: unixSeconds(body.receivedAt, 'receivedAt'),
    detail,
  }
}
