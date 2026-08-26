export type DataMode = 'demo' | 'live' | 'live-degraded'
export type Confidence = 'confirmed' | 'reported' | 'inferred'
export type FacilityStatus = 'available' | 'temporarily_unavailable' | 'unknown'

export interface EvidenceSourceInput {
  sourceSystem: string
  externalEventId: string
  schemaVersion: string
  sourceSequence?: number
  occurredAt: number
  receivedAt: number
  confidence: Confidence
}

export interface FacilityStatusChangedInput {
  eventId: string
  eventType: 'facility.status.changed'
  mode: DataMode
  incidentId: string
  facilityId: string
  status: FacilityStatus
  reasonCode: 'source_reported_unavailable' | 'source_recovered' | 'unverified'
  aggregateVersion: number
  idempotencyKey: string
  source: EvidenceSourceInput
}

export interface WriteContext {
  actorId: string
  idempotencyKey: string
  mode: DataMode
  traceId: string
}

export interface AdjustResourcesPreviewInput {
  incidentId: string
  planVersion: number
  expectedIncidentVersion: number
  previousFacilityId: string
  candidateFacilityIds: string[]
  selectedFacilityId: string
}

export interface ConfirmActionRunInput {
  previewHash: string
  expectedPlanVersion: number
}

export interface ExecuteActionRunInput {
  expectedStatus: 'confirmed'
}

export type TaskFeedbackStatus = 'accepted' | 'en_route' | 'arrived' | 'completed' | 'exception' | 'unknown'

export interface TaskFeedbackInput {
  externalFeedbackId: string
  status: TaskFeedbackStatus
  expectedCurrentStatus: string
  occurredAt: number
  receivedAt: number
  detail?: string
}

export interface MedicalService {
  ingestAdapterEvent(input: FacilityStatusChangedInput, context: WriteContext): Promise<unknown>
  previewAdjustResources(input: AdjustResourcesPreviewInput, context: WriteContext): Promise<unknown>
  confirmActionRun(actionRunId: string, input: ConfirmActionRunInput, context: WriteContext): Promise<unknown>
  executeActionRun(actionRunId: string, input: ExecuteActionRunInput, context: WriteContext): Promise<unknown>
  recordTaskFeedback(taskPackageId: string, input: TaskFeedbackInput, context: WriteContext): Promise<unknown>
  getIncident(incidentId: string): Promise<unknown>
  getContext(incidentId: string): Promise<unknown>
  getActionRun(actionRunId: string): Promise<unknown>
  getPlans(incidentId: string): Promise<unknown>
  getTaskPackages(incidentId: string): Promise<unknown>
  getDecisionLineage(incidentId: string): Promise<unknown>
}
