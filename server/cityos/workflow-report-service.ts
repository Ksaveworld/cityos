import { createHash, randomUUID } from 'node:crypto'

import type { CityosDatabase } from './db.ts'
import { CityosApiError } from './errors.ts'
import type {
  SaveWorkflowReportInput,
  WorkflowReportService,
  WorkflowReportVersion,
  WorkflowScenarioId,
  WriteContext,
} from './types.ts'

type Row = Record<string, unknown>

function pgJson(value: unknown) {
  return value as Parameters<CityosDatabase['json']>[0]
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function unixSeconds(value: unknown): number {
  return Math.floor(new Date(String(value)).getTime() / 1000)
}

function persistedResponse(row: Row, duplicate = false): WorkflowReportVersion {
  return {
    scenarioId: String(row.scenario_id) as WorkflowScenarioId,
    version: Number(row.version),
    reportDraft: row.report_draft as WorkflowReportVersion['reportDraft'],
    storageState: 'persisted',
    updatedBy: String(row.actor_id),
    updatedAt: unixSeconds(row.created_at),
    duplicate,
  }
}

function fixtureBaseline(scenarioId: WorkflowScenarioId): WorkflowReportVersion {
  return {
    scenarioId,
    version: 1,
    reportDraft: null,
    storageState: 'fixture-baseline',
    duplicate: false,
  }
}

export function createWorkflowReportService(sql: CityosDatabase): WorkflowReportService {
  return {
    async getReport(scenarioId) {
      const [row] = await sql`
        SELECT scenario_id, version, report_draft, actor_id, created_at
        FROM cityos.workflow_report_version
        WHERE scenario_id = ${scenarioId}
        ORDER BY version DESC
        LIMIT 1
      `
      return row ? persistedResponse(row as Row) : fixtureBaseline(scenarioId)
    },

    async saveReport(scenarioId, input: SaveWorkflowReportInput, context: WriteContext) {
      if (context.mode !== 'demo') {
        throw new CityosApiError(409, 'WORKFLOW_REPORT_DEMO_ONLY', '演示工作流报告只允许在 demo 模式保存。')
      }
      const requestHash = hashJson(input)
      return sql.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(hashtext(${scenarioId}))`

        const [replayed] = await transaction`
          SELECT scenario_id, version, report_draft, actor_id, request_hash, created_at
          FROM cityos.workflow_report_version
          WHERE scenario_id = ${scenarioId} AND idempotency_key = ${context.idempotencyKey}
        `
        if (replayed) {
          if (String(replayed.request_hash) !== requestHash) {
            throw new CityosApiError(409, 'IDEMPOTENCY_KEY_REUSED', '同一 Idempotency-Key 不能用于不同报告修改。')
          }
          return persistedResponse(replayed as Row, true)
        }

        const [latest] = await transaction`
          SELECT version
          FROM cityos.workflow_report_version
          WHERE scenario_id = ${scenarioId}
          ORDER BY version DESC
          LIMIT 1
        `
        const currentVersion = latest ? Number(latest.version) : 1
        if (input.expectedVersion !== currentVersion) {
          throw new CityosApiError(409, 'WORKFLOW_VERSION_CONFLICT', '报告版本已更新，请重新载入后再应用修改。', {
            currentVersion,
          })
        }

        const [created] = await transaction`
          INSERT INTO cityos.workflow_report_version (
            id, scenario_id, version, report_draft, actor_id,
            idempotency_key, request_hash
          ) VALUES (
            ${randomUUID()}, ${scenarioId}, ${currentVersion + 1},
            ${transaction.json(pgJson(input.reportDraft))}, ${context.actorId},
            ${context.idempotencyKey}, ${requestHash}
          )
          RETURNING scenario_id, version, report_draft, actor_id, created_at
        `
        return persistedResponse(created as Row)
      })
    },
  }
}
