import { createHash, randomUUID } from 'node:crypto'

import type { CityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'
import type {
  FacilityStatusChangedInput,
  MedicalService,
  WriteContext,
} from './types.ts'

type Row = Record<string, unknown>

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value)
}

function unixSeconds(value: unknown): number {
  return Math.floor(new Date(String(value)).getTime() / 1000)
}

function incidentResponse(row: Row) {
  return {
    id: row.id,
    mode: row.mode,
    title: row.title,
    status: row.status,
    currentVersion: number(row.current_version),
    currentPlanVersion: number(row.current_plan_version),
    payload: row.payload,
    createdAt: unixSeconds(row.created_at),
    updatedAt: unixSeconds(row.updated_at),
  }
}

function planResponse(row: Row) {
  return {
    id: row.id,
    incidentId: row.incident_id,
    version: number(row.version),
    inputVersion: number(row.input_version),
    inputSnapshotHash: row.input_snapshot_hash,
    status: row.status,
    candidates: row.candidates,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ? unixSeconds(row.approved_at) : undefined,
    invalidatedAt: row.invalidated_at ? unixSeconds(row.invalidated_at) : undefined,
    createdAt: unixSeconds(row.created_at),
  }
}

function facilityResponse(row: Row) {
  return {
    id: row.id,
    name: row.name,
    location: [number(row.longitude), number(row.latitude)],
    status: row.status,
    statusVersion: number(row.status_version),
    updatedAt: unixSeconds(row.updated_at),
    source: row.evidence_source_id
      ? {
          id: row.evidence_source_id,
          sourceSystem: row.source_system,
          externalEventId: row.external_event_id,
          schemaVersion: row.schema_version,
          sourceSequence: row.source_sequence === null ? undefined : number(row.source_sequence),
          occurredAt: row.occurred_at ? unixSeconds(row.occurred_at) : undefined,
          receivedAt: row.received_at ? unixSeconds(row.received_at) : undefined,
          confidence: row.confidence,
        }
      : undefined,
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
          return { ...(existingRows[0].response as Record<string, unknown>), duplicate: true }
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
          return { ...((conflict?.response as Record<string, unknown>) ?? {}), duplicate: true }
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
            status: 'late',
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
          WHERE id <> ${input.facilityId} AND status = 'available'
          ORDER BY demo_eta_seconds ASC, demo_risk_score ASC, id ASC
          LIMIT 2
        `
        const candidates = alternatives.map((row) => ({
          facilityId: row.id,
          routeId: `route-${input.incidentId}-${row.id}`,
          etaSeconds: number(row.demo_eta_seconds),
          etaRange: [number(row.demo_eta_low_seconds), number(row.demo_eta_high_seconds)],
          receivingStatus: row.status,
          riskDelta: number(row.demo_risk_score),
          degraded: true,
          sourceIds: [evidenceId],
        }))
        if (input.status === 'temporarily_unavailable' && candidates.length < 2) {
          throw new CityosApiError(409, 'INSUFFICIENT_ALTERNATIVES', '可用替代接收点不足两个。')
        }

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
            id, incident_id, version, input_version, input_snapshot_hash, status, candidates
          ) VALUES (
            ${planId}, ${input.incidentId}, ${nextPlanVersion}, ${nextIncidentVersion},
            ${snapshotHash}, 'draft', ${transaction.json(candidates)}
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
            (${randomUUID()}, ${input.incidentId}, 'plan.recalculated', 'deterministic-engine',
             ${transaction.json([evidenceId])}, ${nextIncidentVersion}, ${nextPlanVersion},
             ${transaction.json({ planId, snapshotHash, candidates, stalePlanVersions: result.stalePlanVersions })})
        `
        await transaction`
          INSERT INTO cityos.outbox (aggregate_type, aggregate_id, event_type, payload)
          VALUES ('incident', ${input.incidentId}, 'incident.plan.recalculated', ${transaction.json(result)})
        `
        await transaction`
          UPDATE cityos.adapter_event
          SET processing_status = 'processed', response = ${transaction.json(result)}, processed_at = now()
          WHERE id = ${input.eventId}
        `
        return result
      })
    },

    async getIncident(incidentId: string) {
      return incidentResponse(await requireIncident(sql, incidentId))
    },

    async getContext(incidentId: string) {
      const incident = await requireIncident(sql, incidentId)
      const facilities = await sql`
        SELECT f.*, e.source_system, e.external_event_id, e.schema_version,
               e.source_sequence, e.occurred_at, e.received_at, e.confidence
        FROM cityos.facility f
        LEFT JOIN cityos.evidence_source e ON e.id = f.evidence_source_id
        ORDER BY f.demo_eta_seconds ASC, f.id ASC
      `
      return {
        incident: incidentResponse(incident),
        facilities: facilities.map((row) => facilityResponse(row as Row)),
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
      return { items: tasks }
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
