import { createHash, randomUUID } from 'node:crypto'

import type { CityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'
import type {
  ActionRunResponse,
  AdapterEventAppliedResponse,
  Confidence,
  ExecuteResult,
  PlanVersionStatus,
  AdjustResourcesPreviewInput,
  BoardResponse,
  BoardRoute,
  ConfirmActionRunInput,
  ContextResponse,
  ExecuteActionRunInput,
  FacilityResponse,
  FacilityStatusChangedInput,
  FeedbackResponse,
  IncidentResponse,
  JsonValue,
  MedicalCandidate,
  MedicalService,
  PlanResponse,
  ResourceUnitResponse,
  TaskFeedbackInput,
  TaskPackageResponse,
  WriteContext,
} from './types.ts'

type Row = Record<string, unknown>

/** 具名接口没有索引签名，过不了驱动的 JSONValue 约束，这里只做类型侧适配。 */
function pgJson(value: unknown) {
  return value as Parameters<CityosDatabase['json']>[0]
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function unixSeconds(value: unknown): number {
  return Math.floor(new Date(String(value)).getTime() / 1000)
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function sameMembers(left: string[], right: string[]) {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index])
}

function actionRunResponse(row: Row, duplicate = false): ActionRunResponse {
  const preview = row.preview as Row
  return {
    actionRunId: String(row.id),
    actionType: String(row.action_type),
    incidentId: String(row.incident_id),
    status: row.status as ActionRunResponse['status'],
    planVersion: number(row.plan_version),
    expectedIncidentVersion: number(row.expected_incident_version),
    previewHash: String(row.preview_hash),
    expiresAt: unixSeconds(row.expires_at),
    riskLevel: String(preview.riskLevel),
    requiresHumanApproval: preview.requiresHumanApproval === true,
    previousFacilityId: String(preview.previousFacilityId),
    candidateFacilityIds: preview.candidateFacilityIds as string[],
    selectedFacilityId: String(preview.selectedFacilityId),
    confirmedBy: row.confirmed_by === null ? undefined : String(row.confirmed_by),
    confirmedAt: row.confirmed_at ? unixSeconds(row.confirmed_at) : undefined,
    executedAt: row.executed_at ? unixSeconds(row.executed_at) : undefined,
    result: (row.result ?? undefined) as JsonValue | undefined,
    failure: (row.failure ?? undefined) as JsonValue | undefined,
    duplicate,
  }
}

function taskPackageResponse(row: Row): TaskPackageResponse {
  return {
    id: String(row.id),
    incidentId: String(row.incident_id),
    planVersion: number(row.plan_version),
    version: number(row.version),
    mode: String(row.mode),
    simulated: row.simulated === true,
    actionRunId: String(row.action_run_id),
    facilityId: String(row.facility_id),
    status: String(row.status),
    payload: row.payload as JsonValue,
    createdAt: unixSeconds(row.created_at),
    updatedAt: unixSeconds(row.updated_at),
  }
}

function feedbackResponse(row: Row, duplicate = false): FeedbackResponse {
  return {
    id: String(row.id),
    taskPackageId: String(row.task_package_id),
    externalFeedbackId: String(row.external_feedback_id),
    status: row.status as FeedbackResponse['status'],
    occurredAt: unixSeconds(row.occurred_at),
    receivedAt: unixSeconds(row.received_at),
    detail: row.detail === null ? undefined : String(row.detail),
    duplicate,
  }
}

function incidentResponse(row: Row): IncidentResponse {
  return {
    id: String(row.id),
    mode: row.mode as IncidentResponse['mode'],
    title: String(row.title),
    status: String(row.status),
    currentVersion: number(row.current_version),
    currentPlanVersion: number(row.current_plan_version),
    location: row.longitude === null || row.longitude === undefined
      ? undefined
      : [number(row.longitude), number(row.latitude)],
    payload: row.payload as JsonValue,
    createdAt: unixSeconds(row.created_at),
    updatedAt: unixSeconds(row.updated_at),
  }
}

function planResponse(row: Row): PlanResponse {
  return {
    id: String(row.id),
    incidentId: String(row.incident_id),
    version: number(row.version),
    inputVersion: number(row.input_version),
    inputSnapshotHash: String(row.input_snapshot_hash),
    status: row.status as PlanResponse['status'],
    blockedReason: row.blocked_reason === null ? undefined : String(row.blocked_reason),
    candidates: row.candidates as MedicalCandidate[],
    approvedBy: row.approved_by === null ? undefined : String(row.approved_by),
    approvedAt: row.approved_at ? unixSeconds(row.approved_at) : undefined,
    invalidatedAt: row.invalidated_at ? unixSeconds(row.invalidated_at) : undefined,
    createdAt: unixSeconds(row.created_at),
  }
}

function facilityResponse(row: Row): FacilityResponse {
  return {
    id: String(row.id),
    name: String(row.name),
    location: [number(row.longitude), number(row.latitude)],
    status: row.status as FacilityResponse['status'],
    statusVersion: number(row.status_version),
    updatedAt: unixSeconds(row.updated_at),
    source: row.evidence_source_id
      ? {
          id: String(row.evidence_source_id),
          sourceSystem: String(row.source_system),
          externalEventId: String(row.external_event_id),
          schemaVersion: String(row.schema_version),
          sourceSequence: row.source_sequence === null ? undefined : number(row.source_sequence),
          occurredAt: row.occurred_at ? unixSeconds(row.occurred_at) : undefined,
          receivedAt: row.received_at ? unixSeconds(row.received_at) : undefined,
          confidence: row.confidence as Confidence,
        }
      : undefined,
    publicReference: row.public_poi_id
      ? {
          id: String(row.public_poi_id),
          kind: row.public_poi_kind as NonNullable<FacilityResponse['publicReference']>['kind'],
          name: String(row.public_poi_name),
          location: [number(row.public_poi_longitude), number(row.public_poi_latitude)],
          sourceFeatureKey: String(row.public_poi_source_feature_key),
          snapshot: {
            id: String(row.dataset_snapshot_id),
            datasetName: String(row.dataset_name),
            sourceSystem: String(row.dataset_source_system),
            sourceUrl: String(row.dataset_source_url),
            license: String(row.dataset_license),
            capturedAt: unixSeconds(row.dataset_captured_at),
            contentSha256: String(row.dataset_content_sha256),
          },
        }
      : undefined,
  }
}

/**
 * 只返回本事件真正涉及的接收点：出现在任一方案候选里的、已下发任务指向的、
 * 或有适配器事件报过状态的。不再返回全局设施表。
 */
async function incidentFacilities(sql: CityosDatabase, incidentId: string): Promise<FacilityResponse[]> {
  const rows = await sql`
    WITH involved AS (
      SELECT DISTINCT candidate->>'facilityId' AS facility_id
      FROM cityos.plan_version p,
           LATERAL jsonb_array_elements(p.candidates) AS candidate
      WHERE p.incident_id = ${incidentId}
      UNION
      SELECT facility_id FROM cityos.task_package WHERE incident_id = ${incidentId}
      UNION
      SELECT facility_id FROM cityos.adapter_event WHERE incident_id = ${incidentId}
    )
    SELECT f.*, e.source_system, e.external_event_id, e.schema_version,
           e.source_sequence, e.occurred_at, e.received_at, e.confidence,
           poi.id AS public_poi_id, poi.kind AS public_poi_kind,
           poi.name AS public_poi_name, poi.longitude AS public_poi_longitude,
           poi.latitude AS public_poi_latitude,
           poi.source_feature_key AS public_poi_source_feature_key,
           snapshot.id AS dataset_snapshot_id, snapshot.dataset_name,
           snapshot.source_system AS dataset_source_system,
           snapshot.source_url AS dataset_source_url, snapshot.license AS dataset_license,
           snapshot.captured_at AS dataset_captured_at,
           snapshot.content_sha256 AS dataset_content_sha256
    FROM cityos.facility f
    JOIN involved i ON i.facility_id = f.id
    LEFT JOIN cityos.evidence_source e ON e.id = f.evidence_source_id
    LEFT JOIN cityos.reference_poi poi ON poi.id = f.reference_poi_id
    LEFT JOIN cityos.dataset_snapshot snapshot ON snapshot.id = poi.dataset_snapshot_id
    ORDER BY f.demo_eta_seconds ASC, f.id ASC
  `
  return rows.map((row) => facilityResponse(row as Row))
}

function resourceUnitResponse(row: Row): ResourceUnitResponse {
  return {
    id: String(row.id),
    unitType: row.unit_type as ResourceUnitResponse['unitType'],
    displayName: String(row.display_name),
    callsign: row.callsign === null ? undefined : String(row.callsign),
    location: [number(row.longitude), number(row.latitude)],
    headingDeg: row.heading_deg === null ? undefined : number(row.heading_deg),
    speedMps: row.speed_mps === null ? undefined : number(row.speed_mps),
    dutyStatus: row.duty_status as ResourceUnitResponse['dutyStatus'],
    incidentId: row.incident_id === null ? undefined : String(row.incident_id),
    taskPackageId: row.task_package_id === null ? undefined : String(row.task_package_id),
    confidence: row.confidence as ResourceUnitResponse['confidence'],
    recordedAt: unixSeconds(row.recorded_at),
    simulated: row.simulated === true,
  }
}

async function requireIncident(sql: CityosDatabase, incidentId: string) {
  const [row] = await sql`
    SELECT * FROM cityos.incident WHERE id = ${incidentId}
  `
  if (!row) throw new CityosApiError(404, 'INCIDENT_NOT_FOUND', '事件不存在。')
  return row as Row
}

export function createMedicalService(sql: CityosDatabase): MedicalService {
  return {
    async ingestAdapterEvent(input: FacilityStatusChangedInput, context: WriteContext) {
      if (input.idempotencyKey !== context.idempotencyKey) {
        throw new CityosApiError(409, 'IDEMPOTENCY_KEY_MISMATCH', '请求头与请求体幂等键不一致。')
      }
      if (input.mode !== context.mode) {
        throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '请求头与请求体运行模式不一致。')
      }

      return sql.begin(async (transaction) => {
        const existingRows = await transaction`
          SELECT response FROM cityos.adapter_event
          WHERE source_system = ${input.source.sourceSystem}
            AND external_event_id = ${input.source.externalEventId}
        `
        if (existingRows[0]?.response) {
          return {
            ...(existingRows[0].response as unknown as AdapterEventAppliedResponse),
            duplicate: true,
          }
        }

        const evidenceId = `source-${createHash('sha256')
          .update(`${input.source.sourceSystem}:${input.source.externalEventId}`)
          .digest('hex')
          .slice(0, 24)}`
        const occurredAt = new Date(input.source.occurredAt * 1000).toISOString()
        const receivedAt = new Date(input.source.receivedAt * 1000).toISOString()

        await transaction`
          INSERT INTO cityos.evidence_source (
            id, source_system, external_event_id, schema_version, source_sequence,
            occurred_at, received_at, confidence, payload
          ) VALUES (
            ${evidenceId}, ${input.source.sourceSystem}, ${input.source.externalEventId},
            ${input.source.schemaVersion}, ${input.source.sourceSequence ?? null},
            ${occurredAt}, ${receivedAt}, ${input.source.confidence},
            ${transaction.json({ eventId: input.eventId, mode: input.mode })}
          )
          ON CONFLICT (source_system, external_event_id) DO NOTHING
        `

        const insertedEvents = await transaction`
          INSERT INTO cityos.adapter_event (
            id, source_system, external_event_id, incident_id, facility_id,
            aggregate_version, source_sequence, idempotency_key, payload
          ) VALUES (
            ${input.eventId}, ${input.source.sourceSystem}, ${input.source.externalEventId},
            ${input.incidentId}, ${input.facilityId}, ${input.aggregateVersion},
            ${input.source.sourceSequence ?? null}, ${input.idempotencyKey},
            ${transaction.json({
              eventId: input.eventId,
              eventType: input.eventType,
              mode: input.mode,
              incidentId: input.incidentId,
              facilityId: input.facilityId,
              status: input.status,
              reasonCode: input.reasonCode,
              aggregateVersion: input.aggregateVersion,
              idempotencyKey: input.idempotencyKey,
              source: {
                sourceSystem: input.source.sourceSystem,
                externalEventId: input.source.externalEventId,
                schemaVersion: input.source.schemaVersion,
                sourceSequence: input.source.sourceSequence,
                occurredAt: input.source.occurredAt,
                receivedAt: input.source.receivedAt,
                confidence: input.source.confidence,
              },
            })}
          )
          ON CONFLICT DO NOTHING
          RETURNING id
        `
        if (!insertedEvents[0]) {
          const [conflict] = await transaction`
            SELECT response FROM cityos.adapter_event
            WHERE source_system = ${input.source.sourceSystem}
              AND external_event_id = ${input.source.externalEventId}
          `
          return {
            ...((conflict?.response ?? {}) as unknown as AdapterEventAppliedResponse),
            duplicate: true,
          }
        }

        const [incident] = await transaction`
          SELECT * FROM cityos.incident WHERE id = ${input.incidentId} FOR UPDATE
        `
        if (!incident) throw new CityosApiError(404, 'INCIDENT_NOT_FOUND', '事件不存在。')
        if (incident.mode !== input.mode) {
          throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '事件与适配器事件运行模式不一致。')
        }

        const [facility] = await transaction`
          SELECT * FROM cityos.facility WHERE id = ${input.facilityId} FOR UPDATE
        `
        if (!facility) throw new CityosApiError(404, 'FACILITY_NOT_FOUND', '接收设施不存在。')

        const lateByVersion = input.aggregateVersion <= number(facility.status_version)
        const lateBySequence = input.source.sourceSequence !== undefined
          && facility.last_source_sequence !== null
          && input.source.sourceSequence <= number(facility.last_source_sequence)

        if (lateByVersion || lateBySequence) {
          const response = {
            eventId: input.eventId,
            incidentId: input.incidentId,
            facilityId: input.facilityId,
            status: 'late' as const,
            currentFacilityVersion: number(facility.status_version),
            traceId: context.traceId,
          }
          await transaction`
            UPDATE cityos.adapter_event
            SET processing_status = 'late', response = ${transaction.json(response)}, processed_at = now()
            WHERE id = ${input.eventId}
          `
          await transaction`
            INSERT INTO cityos.decision_lineage (
              id, incident_id, event_type, actor_id, source_ids, input_version, output_version, detail
            ) VALUES (
              ${randomUUID()}, ${input.incidentId}, 'adapter_event.late', ${context.actorId},
              ${transaction.json([evidenceId])}, ${input.aggregateVersion},
              ${number(facility.status_version)}, ${transaction.json(response)}
            )
          `
          return response
        }

        const previousIncidentVersion = number(incident.current_version)
        const nextIncidentVersion = previousIncidentVersion + 1
        const previousFacilityStatus = String(facility.status)

        await transaction`
          UPDATE cityos.facility
          SET status = ${input.status}, status_version = ${input.aggregateVersion},
              last_source_sequence = ${input.source.sourceSequence ?? null},
              evidence_source_id = ${evidenceId}, updated_at = now()
          WHERE id = ${input.facilityId}
        `
        await transaction`
          UPDATE cityos.incident
          SET current_version = ${nextIncidentVersion}, updated_at = now()
          WHERE id = ${input.incidentId}
        `

        const stalePlans = await transaction`
          UPDATE cityos.plan_version
          SET status = 'stale', invalidated_at = now()
          WHERE incident_id = ${input.incidentId} AND status = 'approved'
          RETURNING id, version
        `

        const alternatives = await transaction`
          SELECT id, name, status, demo_eta_seconds, demo_eta_low_seconds,
                 demo_eta_high_seconds, demo_risk_score
          FROM cityos.facility
          -- 只按状态筛选。下线的接收点已经被 status 排除；再排除「事件所指的那家」
          -- 会让恢复事件把刚恢复的接收点挡在自己触发的这次重算之外。
          WHERE status = 'available'
          ORDER BY demo_eta_seconds ASC, demo_risk_score ASC, id ASC
          LIMIT 2
        `
        const candidates: MedicalCandidate[] = alternatives.map((row) => ({
          facilityId: String(row.id),
          routeId: `route-${input.incidentId}-${row.id}`,
          etaSeconds: number(row.demo_eta_seconds),
          etaRange: [number(row.demo_eta_low_seconds), number(row.demo_eta_high_seconds)] as [number, number],
          receivingStatus: row.status as MedicalCandidate['receivingStatus'],
          riskDelta: number(row.demo_risk_score),
          degraded: true,
          sourceIds: [evidenceId],
        }))
        // 算不出可行方案不能反过来删掉输入事实。事实照常保存、旧批准照常失效，
        // 只是这一版方案标记为 blocked，不进入 preview/confirm。
        const blockedReason = input.status === 'temporarily_unavailable' && candidates.length < 2
          ? 'INSUFFICIENT_ALTERNATIVES'
          : null
        const planStatus: PlanVersionStatus = blockedReason === null ? 'draft' : 'blocked'

        const nextPlanVersion = number(incident.current_plan_version) + 1
        const snapshot = {
          incidentId: input.incidentId,
          incidentVersion: nextIncidentVersion,
          unavailableFacilityId: input.facilityId,
          facilityStatus: input.status,
          facilityStatusVersion: input.aggregateVersion,
          candidates,
        }
        const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
        const planId = `plan-${input.incidentId}-v${nextPlanVersion}`

        await transaction`
          INSERT INTO cityos.plan_version (
            id, incident_id, version, input_version, input_snapshot_hash, status,
            candidates, blocked_reason
          ) VALUES (
            ${planId}, ${input.incidentId}, ${nextPlanVersion}, ${nextIncidentVersion},
            ${snapshotHash}, ${planStatus}, ${transaction.json(pgJson(candidates))}, ${blockedReason}
          )
        `
        await transaction`
          UPDATE cityos.incident
          SET current_plan_version = ${nextPlanVersion}, updated_at = now()
          WHERE id = ${input.incidentId}
        `

        const result = {
          eventId: input.eventId,
          incidentId: input.incidentId,
          incidentVersion: nextIncidentVersion,
          facilityId: input.facilityId,
          facilityStatus: input.status,
          facilityStatusVersion: input.aggregateVersion,
          previousFacilityStatus,
          stalePlanVersions: stalePlans.map((row) => number(row.version)),
          planVersion: nextPlanVersion,
          planId,
          planStatus,
          blockedReason,
          inputSnapshotHash: snapshotHash,
          candidates,
          traceId: context.traceId,
          simulated: input.mode === 'demo',
        }

        await transaction`
          INSERT INTO cityos.decision_lineage (
            id, incident_id, event_type, actor_id, source_ids, input_version, output_version, detail
          ) VALUES
            (${randomUUID()}, ${input.incidentId}, 'facility.status.changed', ${context.actorId},
             ${transaction.json([evidenceId])}, ${previousIncidentVersion}, ${nextIncidentVersion},
             ${transaction.json({ facilityId: input.facilityId, from: previousFacilityStatus, to: input.status })}),
            (${randomUUID()}, ${input.incidentId},
             ${blockedReason === null ? 'plan.recalculated' : 'plan.blocked'}, 'deterministic-engine',
             ${transaction.json([evidenceId])}, ${nextIncidentVersion}, ${nextPlanVersion},
             ${transaction.json(pgJson({
               planId, snapshotHash, candidates, blockedReason,
               stalePlanVersions: result.stalePlanVersions,
             }))})
        `
        await transaction`
          INSERT INTO cityos.outbox (aggregate_type, aggregate_id, event_type, payload)
          VALUES ('incident', ${input.incidentId}, 'incident.plan.recalculated', ${transaction.json(pgJson(result))})
        `
        await transaction`
          UPDATE cityos.adapter_event
          SET processing_status = 'processed', response = ${transaction.json(pgJson(result))}, processed_at = now()
          WHERE id = ${input.eventId}
        `
        return result
      })
    },

    async previewAdjustResources(input: AdjustResourcesPreviewInput, context: WriteContext) {
      const requestDocument = {
        incidentId: input.incidentId,
        planVersion: input.planVersion,
        expectedIncidentVersion: input.expectedIncidentVersion,
        previousFacilityId: input.previousFacilityId,
        candidateFacilityIds: input.candidateFacilityIds,
        selectedFacilityId: input.selectedFacilityId,
      }
      const requestHash = hashJson(requestDocument)
      return sql.begin(async (transaction) => {
        await transaction`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${input.incidentId}:adjust_resources:${context.idempotencyKey}`}, 0::bigint)
          )
        `
        const [existing] = await transaction`
          SELECT * FROM cityos.action_run
          WHERE incident_id = ${input.incidentId}
            AND action_type = 'adjust_resources'
            AND idempotency_key = ${context.idempotencyKey}
        `
        if (existing) {
          const storedRequest = existing.request as Row
          if (storedRequest.requestHash !== requestHash) {
            throw new CityosApiError(409, 'IDEMPOTENCY_KEY_REUSED', '该幂等键已经用于不同的预览请求。')
          }
          return actionRunResponse(existing as Row, true)
        }

        const [incident] = await transaction`
          SELECT * FROM cityos.incident WHERE id = ${input.incidentId} FOR UPDATE
        `
        if (!incident) throw new CityosApiError(404, 'INCIDENT_NOT_FOUND', '事件不存在。')
        if (incident.mode !== context.mode) {
          throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '事件与请求运行模式不一致。')
        }
        if (number(incident.current_version) !== input.expectedIncidentVersion) {
          throw new CityosApiError(409, 'INCIDENT_VERSION_CONFLICT', '事件版本已经变化，请重新生成预览。', {
            currentVersion: number(incident.current_version),
          })
        }
        if (number(incident.current_plan_version) !== input.planVersion) {
          throw new CityosApiError(409, 'PLAN_VERSION_CONFLICT', '方案已不是当前版本。', {
            currentVersion: number(incident.current_plan_version),
          })
        }

        const [plan] = await transaction`
          SELECT * FROM cityos.plan_version
          WHERE incident_id = ${input.incidentId} AND version = ${input.planVersion}
          FOR UPDATE
        `
        if (!plan) throw new CityosApiError(404, 'PLAN_NOT_FOUND', '方案版本不存在。')
        if (plan.status === 'blocked') {
          throw new CityosApiError(409, 'PLAN_BLOCKED',
            `当前输入下没有可行方案（${String(plan.blocked_reason)}），不能生成预览。`, { retryable: false })
        }
        if (plan.status !== 'draft' || number(plan.input_version) !== input.expectedIncidentVersion) {
          throw new CityosApiError(409, 'PLAN_NOT_APPROVABLE', '方案已过期或输入版本不一致。')
        }
        const candidates = plan.candidates as Array<{ facilityId?: unknown }>
        const planCandidateIds = candidates.map((candidate) => String(candidate.facilityId))
        if (!sameMembers(planCandidateIds, input.candidateFacilityIds)) {
          throw new CityosApiError(409, 'CANDIDATE_SET_CHANGED', '候选资源集合已经变化，请重新读取方案。')
        }
        if (!planCandidateIds.includes(input.selectedFacilityId)) {
          throw new CityosApiError(400, 'INVALID_SELECTED_FACILITY', '所选接收点不属于当前方案候选项。')
        }
        const [selected, previous] = await transaction`
          SELECT id, status FROM cityos.facility
          WHERE id IN (${input.selectedFacilityId}, ${input.previousFacilityId})
          ORDER BY id
        `.then((rows) => [
          rows.find((row) => row.id === input.selectedFacilityId),
          rows.find((row) => row.id === input.previousFacilityId),
        ])
        if (!selected || selected.status !== 'available') {
          throw new CityosApiError(409, 'SELECTED_FACILITY_UNAVAILABLE', '所选接收点当前不可用。')
        }
        if (!previous || previous.status !== 'temporarily_unavailable') {
          throw new CityosApiError(409, 'PREVIOUS_FACILITY_STATE_CHANGED', '原接收点状态已经变化，请重新计算。')
        }

        const actionRunId = randomUUID()
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
        const preview = {
          actionRunId,
          actionType: 'adjust_resources',
          incidentId: input.incidentId,
          planVersion: input.planVersion,
          expectedIncidentVersion: input.expectedIncidentVersion,
          expiresAt: Math.floor(expiresAt.getTime() / 1000),
          riskLevel: 'high',
          requiresHumanApproval: true,
          previousFacilityId: input.previousFacilityId,
          candidateFacilityIds: planCandidateIds,
          selectedFacilityId: input.selectedFacilityId,
        } as const
        const previewHash = hashJson(preview)

        const [created] = await transaction`
          INSERT INTO cityos.action_run (
            id, incident_id, action_type, status, actor_id, idempotency_key,
            plan_version, expected_incident_version, preview_hash, expires_at,
            request, preview
          ) VALUES (
            ${actionRunId}, ${input.incidentId}, 'adjust_resources', 'previewed',
            ${context.actorId}, ${context.idempotencyKey}, ${input.planVersion},
            ${input.expectedIncidentVersion}, ${previewHash}, ${expiresAt.toISOString()},
            ${transaction.json({ ...requestDocument, requestHash })},
            ${transaction.json(preview)}
          )
          RETURNING *
        `
        await transaction`
          INSERT INTO cityos.decision_lineage (
            id, incident_id, event_type, actor_id, input_version, output_version,
            action_run_id, detail
          ) VALUES (
            ${randomUUID()}, ${input.incidentId}, 'action.previewed', ${context.actorId},
            ${input.expectedIncidentVersion}, ${input.planVersion}, ${actionRunId},
            ${transaction.json({ previewHash, selectedFacilityId: input.selectedFacilityId })}
          )
        `
        return actionRunResponse(created as Row)
      })
    },

    async confirmActionRun(actionRunId: string, input: ConfirmActionRunInput, context: WriteContext) {
      const requestHash = hashJson(input)
      const outcome = await sql.begin(async (transaction) => {
        const [action] = await transaction`
          SELECT * FROM cityos.action_run WHERE id = ${actionRunId} FOR UPDATE
        `
        if (!action) throw new CityosApiError(404, 'ACTION_RUN_NOT_FOUND', 'ActionRun 不存在。')
        if (action.confirm_idempotency_key === context.idempotencyKey && ['confirmed', 'succeeded'].includes(String(action.status))) {
          if (action.confirm_request_hash !== requestHash) {
            throw new CityosApiError(409, 'IDEMPOTENCY_KEY_REUSED', '该幂等键已经用于不同的确认请求。')
          }
          return actionRunResponse(action as Row, true)
        }
        if (action.confirm_idempotency_key) {
          throw new CityosApiError(409, 'ACTION_ALREADY_CONFIRMED', '该 ActionRun 已由其他确认请求处理。')
        }
        if (action.status !== 'previewed') {
          throw new CityosApiError(409, 'ACTION_NOT_PREVIEWED', '只有 previewed ActionRun 可以确认。')
        }
        if (new Date(String(action.expires_at)).getTime() <= Date.now()) {
          await transaction`UPDATE cityos.action_run SET status = 'expired' WHERE id = ${actionRunId}`
          await transaction`
            INSERT INTO cityos.decision_lineage (
              id, incident_id, event_type, actor_id, input_version, output_version,
              action_run_id, detail
            ) VALUES (
              ${randomUUID()}, ${action.incident_id}, 'action.expired', ${context.actorId},
              ${action.expected_incident_version}, ${action.plan_version}, ${actionRunId},
              ${transaction.json({ phase: 'confirm' })}
            )
          `
          return { expired: true as const }
        }
        if (action.preview_hash !== input.previewHash) {
          throw new CityosApiError(409, 'PREVIEW_HASH_MISMATCH', 'Preview 内容与确认请求不一致。')
        }
        if (number(action.plan_version) !== input.expectedPlanVersion) {
          throw new CityosApiError(409, 'PLAN_VERSION_CONFLICT', '确认请求引用了错误的方案版本。', {
            currentVersion: number(action.plan_version),
          })
        }
        const [incident] = await transaction`
          SELECT * FROM cityos.incident WHERE id = ${action.incident_id} FOR UPDATE
        `
        if (!incident || incident.mode !== context.mode) {
          throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '事件与请求运行模式不一致。')
        }
        if (number(incident.current_version) !== number(action.expected_incident_version)
          || number(incident.current_plan_version) !== number(action.plan_version)) {
          throw new CityosApiError(409, 'ACTION_INPUT_STALE', '事件输入已变化，旧预览不能确认。', {
            currentVersion: number(incident.current_version),
          })
        }
        const [plan] = await transaction`
          SELECT * FROM cityos.plan_version
          WHERE incident_id = ${action.incident_id} AND version = ${action.plan_version}
          FOR UPDATE
        `
        if (!plan || plan.status !== 'draft' || number(plan.input_version) !== number(action.expected_incident_version)) {
          throw new CityosApiError(409, 'PLAN_NOT_APPROVABLE', '方案已过期，不能确认。')
        }

        await transaction`
          UPDATE cityos.plan_version
          SET status = 'approved', approved_by = ${context.actorId}, approved_at = now()
          WHERE id = ${plan.id}
        `
        const [confirmed] = await transaction`
          UPDATE cityos.action_run
          SET status = 'confirmed', confirmed_by = ${context.actorId}, confirmed_at = now(),
              confirm_idempotency_key = ${context.idempotencyKey}, confirm_request_hash = ${requestHash}
          WHERE id = ${actionRunId}
          RETURNING *
        `
        await transaction`
          INSERT INTO cityos.decision_lineage (
            id, incident_id, event_type, actor_id, input_version, output_version,
            action_run_id, detail
          ) VALUES (
            ${randomUUID()}, ${action.incident_id}, 'action.confirmed', ${context.actorId},
            ${action.expected_incident_version}, ${action.plan_version}, ${actionRunId},
            ${transaction.json({ previewHash: input.previewHash, planVersion: input.expectedPlanVersion })}
          )
        `
        return actionRunResponse(confirmed as Row)
      })
      if ('expired' in outcome) {
        throw new CityosApiError(409, 'ACTION_PREVIEW_EXPIRED', 'Action Preview 已过期，请重新生成。')
      }
      return outcome
    },

    async executeActionRun(actionRunId: string, input: ExecuteActionRunInput, context: WriteContext) {
      const requestHash = hashJson(input)
      const outcome = await sql.begin(async (transaction) => {
        const [action] = await transaction`
          SELECT * FROM cityos.action_run WHERE id = ${actionRunId} FOR UPDATE
        `
        if (!action) throw new CityosApiError(404, 'ACTION_RUN_NOT_FOUND', 'ActionRun 不存在。')
        // 执行是异步的，同键重放可能落在 queued 和任一终态上，一律返回已存结果。
        if (action.execute_idempotency_key === context.idempotencyKey) {
          if (action.execute_request_hash !== requestHash) {
            throw new CityosApiError(409, 'IDEMPOTENCY_KEY_REUSED', '该幂等键已经用于不同的执行请求。')
          }
          return { ...(action.result as unknown as ExecuteResult), duplicate: true }
        }
        if (action.execute_idempotency_key) {
          throw new CityosApiError(409, 'ACTION_ALREADY_EXECUTED', '该 ActionRun 已由其他执行请求处理。')
        }
        if (input.expectedStatus !== 'confirmed' || action.status !== 'confirmed') {
          throw new CityosApiError(409, 'ACTION_NOT_CONFIRMED', '未确认的 ActionRun 不能执行。')
        }
        if (new Date(String(action.expires_at)).getTime() <= Date.now()) {
          await transaction`UPDATE cityos.action_run SET status = 'expired' WHERE id = ${actionRunId}`
          await transaction`
            UPDATE cityos.plan_version
            SET status = 'draft', approved_by = NULL, approved_at = NULL
            WHERE incident_id = ${action.incident_id}
              AND version = ${action.plan_version}
              AND status = 'approved'
          `
          await transaction`
            INSERT INTO cityos.decision_lineage (
              id, incident_id, event_type, actor_id, input_version, output_version,
              action_run_id, detail
            ) VALUES (
              ${randomUUID()}, ${action.incident_id}, 'action.expired', ${context.actorId},
              ${action.expected_incident_version}, ${action.plan_version}, ${actionRunId},
              ${transaction.json({ phase: 'execute', approvalReset: true })}
            )
          `
          return { expired: true as const }
        }
        const [incident] = await transaction`
          SELECT * FROM cityos.incident WHERE id = ${action.incident_id} FOR UPDATE
        `
        if (!incident || incident.mode !== context.mode) {
          throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '事件与请求运行模式不一致。')
        }
        if (incident.mode !== 'demo') {
          throw new CityosApiError(503, 'LIVE_ADAPTER_NOT_CONFIGURED', '真实任务适配器尚未配置，未执行任何下发。', {
            retryable: false,
          })
        }
        if (number(incident.current_version) !== number(action.expected_incident_version)
          || number(incident.current_plan_version) !== number(action.plan_version)) {
          throw new CityosApiError(409, 'ACTION_INPUT_STALE', '事件输入已变化，旧确认不能执行。', {
            currentVersion: number(incident.current_version),
          })
        }
        const [plan] = await transaction`
          SELECT * FROM cityos.plan_version
          WHERE incident_id = ${action.incident_id} AND version = ${action.plan_version}
          FOR UPDATE
        `
        if (!plan || plan.status !== 'approved') {
          throw new CityosApiError(409, 'PLAN_NOT_APPROVED', '方案未批准或已失效。')
        }

        const preview = action.preview as Row
        const selectedFacilityId = String(preview.selectedFacilityId)
        const [facility] = await transaction`
          SELECT id, status FROM cityos.facility WHERE id = ${selectedFacilityId} FOR UPDATE
        `
        if (!facility || facility.status !== 'available') {
          throw new CityosApiError(409, 'SELECTED_FACILITY_UNAVAILABLE', '所选接收点当前不可用。')
        }
        await transaction`
          UPDATE cityos.action_run
          SET status = 'queued', execute_idempotency_key = ${context.idempotencyKey},
              execute_request_hash = ${requestHash}
          WHERE id = ${actionRunId}
        `
        const [versionRow] = await transaction`
          SELECT COALESCE(MAX(version), 0) + 1 AS next_version
          FROM cityos.task_package WHERE incident_id = ${action.incident_id}
        `
        const taskVersion = number(versionRow.next_version)
        const taskPackageId = `task-${action.incident_id}-v${taskVersion}`
        const payload = {
          adapter: 'cityos-medical-simulator',
          instruction: 'update_receiving_facility',
          previousFacilityId: String(preview.previousFacilityId),
          selectedFacilityId,
          traceId: context.traceId,
        }
        const [task] = await transaction`
          INSERT INTO cityos.task_package (
            id, incident_id, plan_version, version, mode, simulated,
            action_run_id, facility_id, status, payload
          ) VALUES (
            ${taskPackageId}, ${action.incident_id}, ${action.plan_version}, ${taskVersion},
            ${incident.mode}, true, ${actionRunId}, ${selectedFacilityId}, 'issued',
            ${transaction.json(payload)}
          )
          RETURNING *
        `
        await transaction`
          INSERT INTO cityos.task_assignment (id, task_package_id, assignee, status, payload)
          VALUES (
            ${randomUUID()}, ${taskPackageId}, 'medical-receiving-simulator', 'issued',
            ${transaction.json({ selectedFacilityId })}
          )
        `
        // 任务包已生成即「待发送」；投递由 worker 完成，落终态前不算已送达。
        const result = {
          actionRunId,
          status: 'queued' as const,
          taskPackage: taskPackageResponse(task as Row),
          simulated: true,
          traceId: context.traceId,
        }
        await transaction`
          UPDATE cityos.action_run
          SET result = ${transaction.json(pgJson(result))}
          WHERE id = ${actionRunId}
        `
        await transaction`
          INSERT INTO cityos.decision_lineage (
            id, incident_id, event_type, actor_id, input_version, output_version,
            action_run_id, detail
          ) VALUES (
            ${randomUUID()}, ${action.incident_id}, 'action.queued', ${context.actorId},
            ${action.plan_version}, ${taskVersion}, ${actionRunId},
            ${transaction.json({ taskPackageId, selectedFacilityId, simulated: true })}
          )
        `
        await transaction`
          INSERT INTO cityos.outbox (aggregate_type, aggregate_id, event_type, payload)
          VALUES ('action_run', ${actionRunId}, 'action.deliver', ${transaction.json({
            actionRunId,
            taskPackageId,
            incidentId: String(action.incident_id),
            previousFacilityId: String(preview.previousFacilityId),
            selectedFacilityId,
            // 下游幂等键。同一个 ActionRun 无论投递几次，对下游都是同一个请求。
            externalRequestId: actionRunId,
            traceId: context.traceId,
          })})
        `
        return result
      })
      if ('expired' in outcome) {
        throw new CityosApiError(409, 'ACTION_PREVIEW_EXPIRED', 'Action Preview 已过期，不能执行。')
      }
      return outcome
    },

    async recordTaskFeedback(taskPackageId: string, input: TaskFeedbackInput, context: WriteContext) {
      const requestHash = hashJson(input)
      return sql.begin(async (transaction) => {
        await transaction`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${taskPackageId}:${context.idempotencyKey}:${input.externalFeedbackId}`}, 0::bigint)
          )
        `
        const [duplicate] = await transaction`
          SELECT * FROM cityos.execution_feedback
          WHERE external_feedback_id = ${input.externalFeedbackId}
             OR (task_package_id = ${taskPackageId} AND idempotency_key = ${context.idempotencyKey})
          ORDER BY created_at ASC
          LIMIT 1
        `
        if (duplicate) {
          if (duplicate.task_package_id !== taskPackageId || duplicate.request_hash !== requestHash) {
            throw new CityosApiError(409, 'FEEDBACK_IDEMPOTENCY_CONFLICT', '反馈标识已经用于其他内容。')
          }
          return feedbackResponse(duplicate as Row, true)
        }
        const [task] = await transaction`
          SELECT * FROM cityos.task_package WHERE id = ${taskPackageId} FOR UPDATE
        `
        if (!task) throw new CityosApiError(404, 'TASK_PACKAGE_NOT_FOUND', '任务包不存在。')
        if (task.mode !== context.mode) {
          throw new CityosApiError(409, 'DATA_MODE_MISMATCH', '任务与请求运行模式不一致。')
        }
        if (task.status !== input.expectedCurrentStatus) {
          throw new CityosApiError(409, 'TASK_STATUS_CONFLICT', '任务状态已经变化。')
        }
        const transitions: Record<string, string[]> = {
          issued: ['accepted', 'exception', 'unknown'],
          accepted: ['en_route', 'exception', 'unknown'],
          en_route: ['arrived', 'exception', 'unknown'],
          arrived: ['completed', 'exception', 'unknown'],
          unknown: ['accepted', 'en_route', 'arrived', 'completed', 'exception'],
        }
        if (!(transitions[String(task.status)] ?? []).includes(input.status)) {
          throw new CityosApiError(409, 'INVALID_FEEDBACK_TRANSITION', '该反馈不符合任务状态机。')
        }
        const feedbackId = randomUUID()
        const [feedback] = await transaction`
          INSERT INTO cityos.execution_feedback (
            id, task_package_id, external_feedback_id, status, detail,
            occurred_at, received_at, actor_id, idempotency_key, request_hash
          ) VALUES (
            ${feedbackId}, ${taskPackageId}, ${input.externalFeedbackId}, ${input.status},
            ${input.detail ?? null}, ${new Date(input.occurredAt * 1000).toISOString()},
            ${new Date(input.receivedAt * 1000).toISOString()}, ${context.actorId},
            ${context.idempotencyKey}, ${requestHash}
          )
          RETURNING *
        `
        await transaction`
          UPDATE cityos.task_package
          SET status = ${input.status}, updated_at = now()
          WHERE id = ${taskPackageId}
        `
        await transaction`
          UPDATE cityos.task_assignment
          SET status = ${input.status}, updated_at = now()
          WHERE task_package_id = ${taskPackageId}
        `
        await transaction`
          INSERT INTO cityos.decision_lineage (
            id, incident_id, event_type, actor_id, output_version, action_run_id, detail
          ) VALUES (
            ${randomUUID()}, ${task.incident_id}, 'task.feedback.recorded', ${context.actorId},
            ${task.version}, ${task.action_run_id},
            ${transaction.json({
              taskPackageId,
              externalFeedbackId: input.externalFeedbackId,
              from: task.status,
              to: input.status,
              detail: input.detail,
            })}
          )
        `
        return feedbackResponse(feedback as Row)
      })
    },

    async getIncident(incidentId: string) {
      return incidentResponse(await requireIncident(sql, incidentId))
    },

    async getContext(incidentId: string): Promise<ContextResponse> {
      const incident = await requireIncident(sql, incidentId)
      return {
        incident: incidentResponse(incident),
        facilities: await incidentFacilities(sql, incidentId),
      }
    },

    async getActionRun(actionRunId: string) {
      const [row] = await sql`
        SELECT * FROM cityos.action_run WHERE id = ${actionRunId}
      `
      if (!row) throw new CityosApiError(404, 'ACTION_RUN_NOT_FOUND', 'ActionRun 不存在。')
      return actionRunResponse(row as Row)
    },

    /**
     * 调度台读模型。一次返回事件、当前方案、单位、接收点、路线和执行状态，
     * 前端轮询这一个端点即可。路线只来自当前方案候选和已下发任务，不编造点位。
     */
    async getBoard(incidentId: string): Promise<BoardResponse> {
      const incident = await requireIncident(sql, incidentId)
      const currentPlanVersion = number(incident.current_plan_version)

      const [planRow] = await sql`
        SELECT * FROM cityos.plan_version
        WHERE incident_id = ${incidentId} AND version = ${currentPlanVersion}
      `
      const planVersion = planRow ? planResponse(planRow as Row) : null

      const unitRows = await sql`
        SELECT * FROM cityos.resource_live
        ORDER BY unit_type ASC, id ASC
      `
      const taskRows = await sql`
        SELECT * FROM cityos.task_package
        WHERE incident_id = ${incidentId}
        ORDER BY version DESC
      `
      const actionRows = await sql`
        SELECT * FROM cityos.action_run
        WHERE incident_id = ${incidentId}
        ORDER BY created_at DESC
      `

      const taskPackages = taskRows.map((row) => taskPackageResponse(row as Row))
      const selectedFacilityId = taskPackages[0]?.facilityId
      const routes: BoardRoute[] = []

      for (const candidate of (planVersion?.candidates ?? []) as MedicalCandidate[]) {
        routes.push({
          id: candidate.routeId,
          kind: 'plan_candidate',
          facilityId: candidate.facilityId,
          etaSeconds: candidate.etaSeconds,
          etaRange: candidate.etaRange,
          planVersion: currentPlanVersion,
          degraded: candidate.degraded,
          selected: candidate.facilityId === selectedFacilityId,
        })
      }
      for (const task of taskPackages) {
        // 已下发任务指向的接收点，如果不在当前候选里也要画出来——
        // 现场正在跑的路线不能因为方案换了版本就从图上消失。
        if (routes.some((route) => route.facilityId === task.facilityId)) continue
        routes.push({
          id: `route-${incidentId}-${task.facilityId}`,
          kind: 'issued_task',
          facilityId: task.facilityId,
          etaSeconds: 0,
          etaRange: [0, 0],
          planVersion: task.planVersion,
          degraded: true,
          selected: task.id === taskPackages[0]?.id,
        })
      }

      return {
        incident: incidentResponse(incident),
        planVersion,
        units: unitRows.map((row) => resourceUnitResponse(row as Row)),
        facilities: await incidentFacilities(sql, incidentId),
        routes,
        actionRuns: actionRows.map((row) => {
          const action = actionRunResponse(row as Row)
          return {
            actionRunId: action.actionRunId,
            actionType: action.actionType,
            status: action.status,
            planVersion: action.planVersion,
            selectedFacilityId: action.selectedFacilityId,
            executedAt: action.executedAt,
          }
        }),
        taskPackages,
        generatedAt: Math.floor(Date.now() / 1000),
      }
    },

    async getPlans(incidentId: string) {
      await requireIncident(sql, incidentId)
      const rows = await sql`
        SELECT * FROM cityos.plan_version
        WHERE incident_id = ${incidentId}
        ORDER BY version DESC
      `
      return { items: rows.map((row) => planResponse(row as Row)) }
    },

    async getTaskPackages(incidentId: string) {
      await requireIncident(sql, incidentId)
      const tasks = await sql`
        SELECT * FROM cityos.task_package
        WHERE incident_id = ${incidentId}
        ORDER BY version DESC
      `
      return { items: tasks.map((row) => taskPackageResponse(row as Row)) }
    },

    async getDecisionLineage(incidentId: string) {
      await requireIncident(sql, incidentId)
      const rows = await sql`
        SELECT id, incident_id, event_type, actor_id, source_ids, input_version,
               output_version, action_run_id, detail, created_at
        FROM cityos.decision_lineage
        WHERE incident_id = ${incidentId}
        ORDER BY created_at ASC, id ASC
      `
      return {
        items: rows.map((row) => ({
          id: row.id,
          incidentId: row.incident_id,
          eventType: row.event_type,
          actorId: row.actor_id,
          sourceIds: row.source_ids,
          inputVersion: row.input_version === null ? undefined : number(row.input_version),
          outputVersion: row.output_version === null ? undefined : number(row.output_version),
          actionRunId: row.action_run_id ?? undefined,
          detail: row.detail,
          createdAt: unixSeconds(row.created_at),
        })),
      }
    },
  }
}
