import { randomUUID } from 'node:crypto'

import type { CityosDatabase } from './db.ts'

type Row = Record<string, unknown>

/**
 * 投递终态只有四种。分不清「没送到」和「送到了但没收到回音」的系统，
 * 会在第二次重试时造成重复派遣，所以 unknown 必须和 failed 分开。
 */
export type DeliveryOutcome =
  | { kind: 'succeeded' }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown'; reason: string }

export interface DeliveryJob {
  actionRunId: string
  taskPackageId: string
  incidentId: string
  previousFacilityId: string
  selectedFacilityId: string
  /** 下游幂等键。同一个 ActionRun 无论投递几次，对下游都是同一个请求。 */
  externalRequestId: string
  traceId: string
}

export type MedicalDeliveryAdapter = (job: DeliveryJob) => Promise<DeliveryOutcome>

/**
 * 模拟医疗接收适配器。默认成功；演示时通过 CITYOS_MEDICAL_SIMULATOR_OUTCOME
 * 注入明确失败或响应丢失。每次投递都重新读环境变量，不做缓存。
 */
export function createSimulatedMedicalAdapter(
  env: Record<string, string | undefined>,
): MedicalDeliveryAdapter {
  return async () => {
    switch ((env.CITYOS_MEDICAL_SIMULATOR_OUTCOME ?? 'succeed').trim()) {
      case 'fail':
        return { kind: 'failed', reason: 'SIMULATED_DOWNSTREAM_REJECT' }
      case 'lose-response':
        return { kind: 'unknown', reason: 'SIMULATED_RESPONSE_LOST' }
      default:
        return { kind: 'succeeded' }
    }
  }
}

async function claimOne(sql: CityosDatabase) {
  return sql.begin(async (transaction) => {
    const [row] = await transaction`
      SELECT * FROM cityos.outbox
      WHERE status = 'pending'
        AND event_type = 'action.deliver'
        AND available_at <= now()
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `
    if (!row) return null
    await transaction`
      UPDATE cityos.outbox
      SET status = 'processing', attempts = attempts + 1
      WHERE id = ${row.id as number}
    `
    return row as Row
  })
}

async function settle(
  sql: CityosDatabase,
  job: DeliveryJob,
  outboxId: number,
  outcome: DeliveryOutcome,
) {
  await sql.begin(async (transaction) => {
    const [action] = await transaction`
      SELECT * FROM cityos.action_run WHERE id = ${job.actionRunId} FOR UPDATE
    `
    // 只有仍处于 queued 的投递才允许落终态，避免 worker 覆盖人工取消或过期。
    if (!action || action.status !== 'queued') {
      await transaction`
        UPDATE cityos.outbox SET status = 'done', processed_at = now() WHERE id = ${outboxId}
      `
      return
    }

    if (outcome.kind === 'succeeded') {
      const result = {
        ...(action.result as Row),
        status: 'succeeded',
        deliveredAt: Math.floor(Date.now() / 1000),
      }
      await transaction`
        UPDATE cityos.action_run
        SET status = 'succeeded', result = ${transaction.json(result)}, executed_at = now()
        WHERE id = ${job.actionRunId}
      `
    } else {
      const failure = {
        reason: outcome.reason,
        externalRequestId: job.externalRequestId,
        // unknown 表示请求可能已经生效，禁止重发，只能进入对账。
        retryable: false,
        traceId: job.traceId,
      }
      await transaction`
        UPDATE cityos.action_run
        SET status = ${outcome.kind}, failure = ${transaction.json(failure)}, executed_at = now()
        WHERE id = ${job.actionRunId}
      `
    }

    await transaction`
      INSERT INTO cityos.decision_lineage (
        id, incident_id, event_type, actor_id, action_run_id, detail
      ) VALUES (
        ${randomUUID()}, ${job.incidentId}, ${`action.${outcome.kind}`}, 'cityos-outbox-worker',
        ${job.actionRunId},
        ${transaction.json({
          taskPackageId: job.taskPackageId,
          externalRequestId: job.externalRequestId,
          adapter: 'cityos-medical-simulator',
          simulated: true,
          ...(outcome.kind === 'succeeded' ? {} : { reason: outcome.reason }),
        })}
      )
    `
    await transaction`
      UPDATE cityos.outbox SET status = 'done', processed_at = now() WHERE id = ${outboxId}
    `
  })
}

export interface DrainReport {
  claimed: number
  succeeded: number
  failed: number
  unknown: number
}

/**
 * 领取并投递待发送的动作。每批固定上限；一个工作项一个事务，
 * 单条失败不会阻塞同批其他工作项。
 */
export async function drainMedicalOutbox(
  sql: CityosDatabase,
  deliver: MedicalDeliveryAdapter,
  { limit = 10 }: { limit?: number } = {},
): Promise<DrainReport> {
  const report: DrainReport = { claimed: 0, succeeded: 0, failed: 0, unknown: 0 }

  for (let index = 0; index < limit; index += 1) {
    const row = await claimOne(sql)
    if (!row) break
    report.claimed += 1

    const payload = row.payload as Row
    const job: DeliveryJob = {
      actionRunId: String(payload.actionRunId),
      taskPackageId: String(payload.taskPackageId),
      incidentId: String(payload.incidentId),
      previousFacilityId: String(payload.previousFacilityId),
      selectedFacilityId: String(payload.selectedFacilityId),
      externalRequestId: String(payload.externalRequestId),
      traceId: String(payload.traceId ?? ''),
    }

    let outcome: DeliveryOutcome
    try {
      outcome = await deliver(job)
    } catch (error) {
      // 适配器自己抛异常，说明请求可能已经发出但结果不明，按 unknown 处理。
      outcome = { kind: 'unknown', reason: error instanceof Error ? error.message : 'ADAPTER_THREW' }
    }

    await settle(sql, job, row.id as number, outcome)
    report[outcome.kind] += 1
  }

  return report
}

export interface OutboxWorkerHandle {
  stop(): Promise<void>
}

/**
 * 与 API 同进程启动，避免漏起。worker 没跑时 ActionRun 会一直停在 queued，
 * 这是有意为之：比伪造一个成功状态诚实。
 */
export function startMedicalOutboxWorker(
  sql: CityosDatabase,
  deliver: MedicalDeliveryAdapter,
  { intervalMs = 400, limit = 10 }: { intervalMs?: number; limit?: number } = {},
): OutboxWorkerHandle {
  let stopped = false
  let running: Promise<void> = Promise.resolve()

  const timer = setInterval(() => {
    if (stopped) return
    running = running
      .then(() => drainMedicalOutbox(sql, deliver, { limit }))
      .then(() => undefined)
      .catch((error) => {
        console.error('[cityos] outbox worker 本轮失败', error)
      })
  }, intervalMs)
  timer.unref?.()

  return {
    async stop() {
      stopped = true
      clearInterval(timer)
      await running
    },
  }
}
