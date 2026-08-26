/**
 * 医疗 P0 真库验收门。
 *
 * 单元测试用的是 fake service，证明不了 SQL、事务、幂等和状态机在真实
 * PostgreSQL 上成立。这个脚本直接打 HTTP handler，跑完整链路并断言不变量。
 *
 *   npm run db:up && npm run db:migrate && npm run db:seed && npm run db:smoke
 *
 * 脚本会清空并重建 cityos schema，只能对着本地开发库跑。
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const { closeCityosDatabases, getCityosDatabase } = await import('../server/cityos/db.ts')

const DATABASE_URL = process.env.CITYOS_DATABASE_URL
  ?? 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'

if (!/localhost|127\.0\.0\.1/.test(DATABASE_URL)) {
  console.error('拒绝执行：db:smoke 会重建 schema，只允许对本地库运行。')
  process.exit(1)
}

const { handleCityosRequest } = await import('../server/cityos/http.ts')
const { createSimulatedMedicalAdapter, drainMedicalOutbox } = await import('../server/cityos/worker.ts')

const env = { CITYOS_DATABASE_URL: DATABASE_URL }
const INCIDENT = 'ev-medical-panfu'
const now = Math.floor(Date.now() / 1000)

let pass = 0
let fail = 0
const lines = []

function check(name, ok, detail) {
  if (ok) pass += 1
  else fail += 1
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
}

async function call(method, path, { body, actor = 'user-smoke', key, mode = 'demo' } = {}) {
  const headers = { 'X-Data-Mode': mode }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (actor) headers['X-Actor-Id'] = actor
  if (key) headers['Idempotency-Key'] = key
  const response = await handleCityosRequest(
    new Request(`http://local${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
  return { status: response.status, json: await response.json() }
}

const BASE_SOURCE = {
  sourceSystem: 'medical-adapter-sim',
  externalEventId: 'ext-smoke-1',
  schemaVersion: 'medical-p0-v1',
  sourceSequence: 2,
  occurredAt: now - 60,
  receivedAt: now - 30,
  confidence: 'confirmed',
}

function facilityEvent({ source, ...overrides } = {}) {
  return {
    eventId: 'evt-smoke',
    eventType: 'facility.status.changed',
    mode: 'demo',
    incidentId: INCIDENT,
    facilityId: 'facility-shiyi',
    status: 'temporarily_unavailable',
    reasonCode: 'source_reported_unavailable',
    aggregateVersion: 2,
    idempotencyKey: 'idem-adapter-1',
    ...overrides,
    source: { ...BASE_SOURCE, ...source },
  }
}

/**
 * 走完 preview → confirm → execute，返回 actionRunId。
 * 候选集必须与当前方案完全一致，所以像真实客户端一样先读方案，不硬编码。
 */
async function runToQueued(suffix, previousFacilityId, selectedFacilityId) {
  const incident = await call('GET', `/v1/incidents/${INCIDENT}`)
  const planVersion = incident.json.currentPlanVersion
  const incidentVersion = incident.json.currentVersion

  const plans = await call('GET', `/v1/incidents/${INCIDENT}/plans`)
  const current = plans.json.items.find((p) => p.version === planVersion)
  const candidateFacilityIds = current.candidates.map((c) => c.facilityId)

  const preview = await call('POST', '/v1/actions/adjust_resources/preview', {
    key: `idem-preview-${suffix}`,
    body: {
      incidentId: INCIDENT,
      planVersion,
      expectedIncidentVersion: incidentVersion,
      previousFacilityId,
      candidateFacilityIds,
      selectedFacilityId,
    },
  })
  const actionRunId = preview.json.actionRunId
  await call('POST', `/v1/action-runs/${actionRunId}/confirm`, {
    key: `idem-confirm-${suffix}`,
    body: { previewHash: preview.json.previewHash, expectedPlanVersion: planVersion },
  })
  const execute = await call('POST', `/v1/action-runs/${actionRunId}/execute`, {
    key: `idem-exec-${suffix}`,
    body: { expectedStatus: 'confirmed' },
  })
  return { actionRunId, preview, execute, planVersion, incidentVersion }
}

try {
  // 每次从空库开始，顺带证明迁移能在空库跑通、重复跑会 skip。
  const sqlReset = getCityosDatabase(env)
  await sqlReset.unsafe('DROP SCHEMA IF EXISTS cityos CASCADE')
  await closeCityosDatabases()
  execFileSync('node', ['scripts/db-migrate.mjs'], { stdio: 'pipe', env: { ...process.env, CITYOS_DATABASE_URL: DATABASE_URL } })
  const second = execFileSync('node', ['scripts/db-migrate.mjs'], { stdio: 'pipe', env: { ...process.env, CITYOS_DATABASE_URL: DATABASE_URL } }).toString()
  check('1 重复迁移全部 skip', !second.includes('applied'), second.trim().split('\n').filter((l) => l.startsWith('skip')).join(' '))
  execFileSync('node', ['scripts/db-seed.mjs'], { stdio: 'pipe', env: { ...process.env, CITYOS_DATABASE_URL: DATABASE_URL } })
  execFileSync('node', ['scripts/db-seed.mjs'], { stdio: 'pipe', env: { ...process.env, CITYOS_DATABASE_URL: DATABASE_URL } })

  const sql = getCityosDatabase(env)
  const [counts] = await sql`
    SELECT (SELECT count(*) FROM cityos.incident) AS incidents,
           (SELECT count(*) FROM cityos.facility) AS facilities
  `
  check('2 重复种子不翻倍', Number(counts.incidents) === 1 && Number(counts.facilities) === 3,
    `incident=${counts.incidents} facility=${counts.facilities}`)

  // ---- 事实接入 ----
  const event = facilityEvent({})
  const ingest = await call('POST', '/v1/adapter-events', { body: event, key: event.idempotencyKey })
  check('3 医院不可用事件入库', ingest.status === 202 && ingest.json.status !== 'late', `status=${ingest.status}`)

  const replay = await call('POST', '/v1/adapter-events', { body: event, key: event.idempotencyKey })
  check('4 重复事件不产生第二次副作用', replay.json.duplicate === true, `duplicate=${replay.json.duplicate}`)

  const late = facilityEvent({
    eventId: 'evt-smoke-late',
    status: 'available',
    reasonCode: 'source_recovered',
    aggregateVersion: 1,
    idempotencyKey: 'idem-adapter-late',
    source: { externalEventId: 'ext-smoke-late', sourceSequence: 1 },
  })
  const lateResult = await call('POST', '/v1/adapter-events', { body: late, key: late.idempotencyKey })
  check('5 乱序旧事件只登记为迟到', lateResult.json.status === 'late', `处理=${lateResult.json.status}`)

  const context = await call('GET', `/v1/incidents/${INCIDENT}/context`)
  const shiyi = context.json.facilities.find((f) => f.id === 'facility-shiyi')
  check('6 迟到事件没有改写事实', shiyi.status === 'temporarily_unavailable', `status=${shiyi.status}`)

  const plans = await call('GET', `/v1/incidents/${INCIDENT}/plans`)
  check('7 旧批准方案已失效', plans.json.items.find((p) => p.version === 1)?.status === 'stale')
  check('8 已生成新方案版本', plans.json.items[0].version > 1, `latest=v${plans.json.items[0].version}`)

  // ---- 场景一：正常投递 ----
  const ok = await runToQueued('ok', 'facility-shiyi', 'facility-red-cross')
  check('9 execute 返回 202 待发送', ok.execute.status === 202 && ok.execute.json.status === 'queued',
    `status=${ok.execute.status} state=${ok.execute.json.status}`)

  const beforeDrain = await call('GET', `/v1/action-runs/${ok.actionRunId}`)
  check('10 投递前 ActionRun 停在 queued', beforeDrain.json.status === 'queued', `status=${beforeDrain.json.status}`)

  const tasksEarly = await call('GET', `/v1/incidents/${INCIDENT}/task-packages`)
  check('11 任务包在待发送阶段已生成', tasksEarly.json.items.length === 1, `count=${tasksEarly.json.items.length}`)

  const drainOk = await drainMedicalOutbox(sql, createSimulatedMedicalAdapter({}), { limit: 5 })
  check('12 worker 投递成功', drainOk.succeeded === 1, JSON.stringify(drainOk))

  const afterDrain = await call('GET', `/v1/action-runs/${ok.actionRunId}`)
  check('13 投递后落 succeeded', afterDrain.json.status === 'succeeded', `status=${afterDrain.json.status}`)

  const drainAgain = await drainMedicalOutbox(sql, createSimulatedMedicalAdapter({}), { limit: 5 })
  check('14 worker 空转不重复投递', drainAgain.claimed === 0, JSON.stringify(drainAgain))

  const execReplay = await call('POST', `/v1/action-runs/${ok.actionRunId}/execute`, {
    key: 'idem-exec-ok', body: { expectedStatus: 'confirmed' },
  })
  check('15 execute 同键重放返回原结果', execReplay.json.duplicate === true, `duplicate=${execReplay.json.duplicate}`)

  const execNewKey = await call('POST', `/v1/action-runs/${ok.actionRunId}/execute`, {
    key: 'idem-exec-other', body: { expectedStatus: 'confirmed' },
  })
  check('16 换键重复执行被拒', execNewKey.status === 409, `code=${execNewKey.json.error?.code}`)

  // ---- 回执 ----
  const taskId = tasksEarly.json.items[0].id
  const feedback = await call('POST', `/v1/tasks/${taskId}/feedback`, {
    key: 'idem-fb-1',
    body: {
      externalFeedbackId: 'fb-1', status: 'accepted', expectedCurrentStatus: 'issued',
      occurredAt: now, receivedAt: now, detail: '接收点已签收',
    },
  })
  check('17 回执入库', feedback.status === 201, `status=${feedback.status}`)

  const badFeedback = await call('POST', `/v1/tasks/${taskId}/feedback`, {
    key: 'idem-fb-2',
    body: {
      externalFeedbackId: 'fb-2', status: 'completed', expectedCurrentStatus: 'issued',
      occurredAt: now, receivedAt: now,
    },
  })
  check('18 回执状态跳级被拒', badFeedback.status === 409, `code=${badFeedback.json.error?.code}`)

  // ---- 场景二：医院恢复后重新进入候选，再验证响应丢失落 unknown ----
  const recover = facilityEvent({
    eventId: 'evt-smoke-recover', status: 'available', reasonCode: 'source_recovered',
    aggregateVersion: 3, idempotencyKey: 'idem-adapter-recover',
    source: { externalEventId: 'ext-smoke-recover', sourceSequence: 3 },
  })
  const recovered = await call('POST', '/v1/adapter-events', { body: recover, key: recover.idempotencyKey })
  check('19 恢复事实入库', recovered.status === 202 && recovered.json.status !== 'late',
    `status=${recovered.status} code=${recovered.json.error?.code}`)

  const afterRecover = await call('GET', `/v1/incidents/${INCIDENT}/plans`)
  const recoveredPlan = afterRecover.json.items[0]
  check('20 恢复的医院重新进入候选',
    recoveredPlan.candidates.some((c) => c.facilityId === 'facility-shiyi'),
    recoveredPlan.candidates.map((c) => c.facilityId).join(','))

  const downAgain = facilityEvent({
    eventId: 'evt-smoke-2', facilityId: 'facility-red-cross', aggregateVersion: 2,
    idempotencyKey: 'idem-adapter-2',
    source: { externalEventId: 'ext-smoke-2', sourceSequence: 2 },
  })
  await call('POST', '/v1/adapter-events', { body: downAgain, key: downAgain.idempotencyKey })
  const lost = await runToQueued('lost', 'facility-red-cross', 'facility-shiyi')
  check('21 新一轮 execute 进入待发送', lost.execute.status === 202 && lost.execute.json.status === 'queued',
    `status=${lost.execute.status} state=${lost.execute.json.status} code=${lost.execute.json.error?.code}`)

  const drainLost = await drainMedicalOutbox(
    sql,
    createSimulatedMedicalAdapter({ CITYOS_MEDICAL_SIMULATOR_OUTCOME: 'lose-response' }),
    { limit: 5 },
  )
  check('22 响应丢失落 unknown 而不是 failed', drainLost.unknown === 1 && drainLost.failed === 0, JSON.stringify(drainLost))

  const lostRun = await call('GET', `/v1/action-runs/${lost.actionRunId}`)
  check('23 unknown 明确标记不可重试', lostRun.json.status === 'unknown' && lostRun.json.failure?.retryable === false,
    `status=${lostRun.json.status} retryable=${lostRun.json.failure?.retryable}`)

  const drainAfterLost = await drainMedicalOutbox(sql, createSimulatedMedicalAdapter({}), { limit: 5 })
  check('24 unknown 之后不会被自动重发', drainAfterLost.claimed === 0, JSON.stringify(drainAfterLost))

  // ---- 边界 ----
  const liveMode = await call('POST', '/v1/adapter-events', { body: { ...event, mode: 'live' }, key: 'idem-live' })
  check('25 运行模式不一致被拒', liveMode.status === 409, `code=${liveMode.json.error?.code}`)

  const noKey = await call('POST', '/v1/adapter-events', { body: event })
  check('26 缺 Idempotency-Key 被拒', noKey.status === 400, `code=${noKey.json.error?.code}`)

  const degraded = await call('POST', '/v1/adapter-events', { body: event, key: 'idem-x', mode: 'live-degraded' })
  check('27 降级模式只读', degraded.status === 409, `code=${degraded.json.error?.code}`)

  // ---- 审计链 ----
  const lineage = await call('GET', `/v1/incidents/${INCIDENT}/decision-lineage`)
  const types = lineage.json.items.map((i) => i.eventType)
  const required = [
    'facility.status.changed', 'plan.recalculated', 'action.previewed',
    'action.confirmed', 'action.queued', 'action.succeeded', 'action.unknown',
    'task.feedback.recorded',
  ]
  const missing = required.filter((t) => !types.includes(t))
  check('28 审计链覆盖全链路', missing.length === 0, missing.length ? `缺 ${missing.join(',')}` : `${types.length} 条`)

  const [delivery] = await sql`
    SELECT count(*) FILTER (WHERE status = 'pending') AS pending,
           count(*) FILTER (WHERE status = 'done') AS done
    FROM cityos.outbox WHERE event_type = 'action.deliver'
  `
  check('29 投递流没有堆积', Number(delivery.pending) === 0, `pending=${delivery.pending} done=${delivery.done}`)

  // incident.plan.recalculated 目前没有消费者，会无限堆积。等前端实时推送落地后
  // 由推送 worker 消费；在那之前这里只把积压量报出来，不假装它已经被处理。
  const unconsumed = await sql`
    SELECT event_type, count(*) AS pending
    FROM cityos.outbox WHERE status = 'pending' GROUP BY 1 ORDER BY 1
  `
  if (unconsumed.length > 0) {
    lines.push(`NOTE  以下 outbox 事件流尚无消费者：${unconsumed.map((r) => `${r.event_type}=${r.pending}`).join(' ')}`)
  }
} catch (error) {
  fail += 1
  lines.push(`FAIL  未捕获异常  ${error?.stack ?? error}`)
} finally {
  console.log(lines.join('\n'))
  console.log(`\n通过 ${pass}，失败 ${fail}`)
  await closeCityosDatabases()
  process.exit(fail === 0 ? 0 : 1)
}
