export type DataMode = 'demo' | 'live' | 'live-degraded'
export type Confidence = 'confirmed' | 'reported' | 'inferred'
export type FacilityStatus = 'available' | 'temporarily_unavailable' | 'unknown'

export const WORKFLOW_SCENARIO_IDS = [
  'liwan-fire',
  'yuexiu-police-current',
  'yuexiu-medical',
  'yuexiu-traffic',
  'yuexiu-urban-order',
  'tianhe-major',
] as const
export type WorkflowScenarioId = typeof WORKFLOW_SCENARIO_IDS[number]

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

export interface WorkflowReportDraft {
  selectedPlanId: string
  resourceCount: number
  fireOptionId: string
  medicalOptionId: string
  trafficOptionId: string
  decisionNote: string
}

export interface SaveWorkflowReportInput {
  expectedVersion: number
  reportDraft: WorkflowReportDraft
}

export interface WorkflowReportVersion {
  scenarioId: WorkflowScenarioId
  version: number
  reportDraft: WorkflowReportDraft | null
  storageState: 'fixture-baseline' | 'persisted'
  updatedBy?: string
  updatedAt?: number
  duplicate: boolean
}

export interface WorkflowReportService {
  getReport(scenarioId: WorkflowScenarioId): Promise<WorkflowReportVersion>
  saveReport(
    scenarioId: WorkflowScenarioId,
    input: SaveWorkflowReportInput,
    context: WriteContext,
  ): Promise<WorkflowReportVersion>
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type PlanVersionStatus = 'draft' | 'approved' | 'stale' | 'blocked'

export type ActionRunStatus =
  | 'previewed' | 'confirmed' | 'queued' | 'running' | 'succeeded'
  | 'failed' | 'unknown' | 'reconciling' | 'cancelled' | 'expired'

export type DutyStatus = 'available' | 'en_route' | 'engaged' | 'offline' | 'unknown'

export interface EvidenceSourceResponse {
  id: string
  sourceSystem: string
  externalEventId: string
  schemaVersion: string
  sourceSequence?: number
  occurredAt?: number
  receivedAt?: number
  confidence: Confidence
}

export interface IncidentResponse {
  id: string
  mode: DataMode
  title: string
  status: string
  currentVersion: number
  currentPlanVersion: number
  location?: [number, number]
  payload: JsonValue
  createdAt: number
  updatedAt: number
}

export interface FacilityResponse {
  id: string
  name: string
  location: [number, number]
  status: FacilityStatus
  statusVersion: number
  updatedAt: number
  source?: EvidenceSourceResponse
  publicReference?: PublicPoiReference
}

export interface PublicPoiReference {
  id: string
  kind: 'hospital' | 'fire_station' | 'police'
  name: string
  location: [number, number]
  sourceFeatureKey: string
  snapshot: {
    id: string
    datasetName: string
    sourceSystem: string
    sourceUrl: string
    license: string
    capturedAt: number
    contentSha256: string
  }
}

export interface MedicalCandidate {
  facilityId: string
  routeId: string
  etaSeconds: number
  etaRange: [number, number]
  receivingStatus: FacilityStatus
  riskDelta: number
  degraded: boolean
  sourceIds: string[]
}

export interface PlanResponse {
  id: string
  incidentId: string
  version: number
  inputVersion: number
  inputSnapshotHash: string
  status: PlanVersionStatus
  blockedReason?: string
  candidates: MedicalCandidate[]
  approvedBy?: string
  approvedAt?: number
  invalidatedAt?: number
  createdAt: number
}

export interface ActionRunResponse {
  actionRunId: string
  actionType: string
  incidentId: string
  status: ActionRunStatus
  planVersion: number
  expectedIncidentVersion: number
  previewHash: string
  expiresAt: number
  riskLevel: string
  requiresHumanApproval: boolean
  previousFacilityId: string
  candidateFacilityIds: string[]
  selectedFacilityId: string
  confirmedBy?: string
  confirmedAt?: number
  executedAt?: number
  result?: JsonValue
  failure?: JsonValue
  duplicate: boolean
}

export interface TaskPackageResponse {
  id: string
  incidentId: string
  planVersion: number
  version: number
  mode: string
  simulated: boolean
  actionRunId: string
  facilityId: string
  status: string
  payload: JsonValue
  createdAt: number
  updatedAt: number
}

export interface FeedbackResponse {
  id: string
  taskPackageId: string
  externalFeedbackId: string
  status: TaskFeedbackStatus
  occurredAt: number
  receivedAt: number
  detail?: string
  duplicate: boolean
}

/** 迟到事件只登记，不改变事实。 */
export interface AdapterEventLateResponse {
  eventId: string
  incidentId: string
  facilityId: string
  status: 'late'
  currentFacilityVersion: number
  traceId: string
}

export interface AdapterEventAppliedResponse {
  eventId: string
  incidentId: string
  incidentVersion: number
  facilityId: string
  facilityStatus: FacilityStatus
  facilityStatusVersion: number
  previousFacilityStatus: string
  stalePlanVersions: number[]
  planVersion: number
  planId: string
  planStatus: PlanVersionStatus
  blockedReason: string | null
  inputSnapshotHash: string
  candidates: MedicalCandidate[]
  traceId: string
  simulated: boolean
  duplicate?: boolean
}

export type AdapterEventResponse = AdapterEventLateResponse | AdapterEventAppliedResponse

export interface ContextResponse {
  incident: IncidentResponse
  facilities: FacilityResponse[]
}

export interface DecisionLineageEntry {
  id: string
  incidentId: string
  eventType: string
  actorId: string
  sourceIds: JsonValue
  inputVersion?: number
  outputVersion?: number
  actionRunId?: string
  detail: JsonValue
  createdAt: number
}

export interface ResourceUnitResponse {
  id: string
  unitType: 'fire_engine' | 'ambulance' | 'police' | 'uav' | 'other'
  displayName: string
  callsign?: string
  location: [number, number]
  headingDeg?: number
  speedMps?: number
  dutyStatus: DutyStatus
  incidentId?: string
  taskPackageId?: string
  confidence: Confidence
  recordedAt: number
  simulated: boolean
}

export interface BoardRoute {
  id: string
  kind: 'plan_candidate' | 'issued_task'
  facilityId: string
  etaSeconds: number
  etaRange: [number, number]
  planVersion: number
  degraded: boolean
  selected: boolean
}

/** 调度台一次读完的读模型。 */
export interface BoardResponse {
  incident: IncidentResponse
  planVersion: PlanResponse | null
  units: ResourceUnitResponse[]
  facilities: FacilityResponse[]
  routes: BoardRoute[]
  actionRuns: Array<Pick<ActionRunResponse,
    'actionRunId' | 'actionType' | 'status' | 'planVersion' | 'selectedFacilityId' | 'executedAt'>>
  taskPackages: TaskPackageResponse[]
  generatedAt: number
}

export interface MedicalService {
  ingestAdapterEvent(input: FacilityStatusChangedInput, context: WriteContext): Promise<AdapterEventResponse>
  previewAdjustResources(input: AdjustResourcesPreviewInput, context: WriteContext): Promise<ActionRunResponse>
  confirmActionRun(actionRunId: string, input: ConfirmActionRunInput, context: WriteContext): Promise<ActionRunResponse>
  executeActionRun(actionRunId: string, input: ExecuteActionRunInput, context: WriteContext): Promise<ExecuteResult>
  recordTaskFeedback(taskPackageId: string, input: TaskFeedbackInput, context: WriteContext): Promise<FeedbackResponse>
  getIncident(incidentId: string): Promise<IncidentResponse>
  getContext(incidentId: string): Promise<ContextResponse>
  getActionRun(actionRunId: string): Promise<ActionRunResponse>
  getPlans(incidentId: string): Promise<{ items: PlanResponse[] }>
  getTaskPackages(incidentId: string): Promise<{ items: TaskPackageResponse[] }>
  getDecisionLineage(incidentId: string): Promise<{ items: DecisionLineageEntry[] }>
  getBoard(incidentId: string): Promise<BoardResponse>
}

/** execute 只受理不投递，所以返回的是待发送状态，不是执行结果。 */
export interface ExecuteResult {
  actionRunId: string
  status: 'queued'
  taskPackage: TaskPackageResponse
  simulated: boolean
  traceId: string
  duplicate?: boolean
}
