/**
 * 引擎自检。**仅 DEV 可访问**，生产构建里不挂载。
 *
 * 仓库没有测试运行器，加 vitest 属于新增依赖（CLAUDE.md「不要新增依赖，
 * 先问我」），本轮决定不加，走这个页面。断言结果同时打到 console，
 * 便于 read_console_messages 自动读取。
 *
 * 访问 http://localhost:5173/#/selftest
 */

import { useEffect, useState } from 'react'

import {
  bandsOverlap,
  buildGraph,
  degreeMatchesNeighbors,
  estimate,
  forkCandidates,
  forksOnRoute,
  GUANGDA,
  createScenario,
  nearestNode,
  privilegeGain,
  solve,
  undirectedDegree,
  uniqueNeighbors,
  type Graph,
  type RouteResult,
} from '@/engine'
import {
  buildRoutingView,
  createRoutingRuntime,
  type MedicalSupportOrigin,
} from './routingViewModel'
import {
  deriveExecutionFrame,
  validateExecutionDefinition,
} from '@/components/dashboard/execution/executionPlayback'
import { HISTORY_516_EXECUTIONS } from '@/components/dashboard/historical/history516Execution'
import {
  STATION_EXECUTIONS,
  STATION_PUBLIC_FACTS,
  STATION_SIMULATION_RUNS,
} from '@/components/dashboard/historical/stationHistory'
import { REVIEW_REPORTS } from '@/components/dashboard/review/reviewReports'

interface Check {
  name: string
  pass: boolean
  detail: string
}

export default function SelfTest() {
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [ms, setMs] = useState(0)

  useEffect(() => {
    const t0 = performance.now()
    runSelfTest()
      .then((r) => {
        setChecks(r)
        setMs(Math.round(performance.now() - t0))
        const failed = r.filter((c) => !c.pass)
        for (const c of r) {
          console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  ${c.detail}`)
        }
        console.log(
          failed.length ? `SELFTEST FAIL ${failed.length}/${r.length}` : `SELFTEST PASS ${r.length}/${r.length}`,
        )
      })
      .catch((e: Error) => {
        console.log(`SELFTEST ERROR ${e.message}`)
        setChecks([{ name: '自检本身抛异常', pass: false, detail: e.message }])
      })
  }, [])

  if (!checks) return <Shell>跑自检</Shell>

  const failed = checks.filter((c) => !c.pass).length
  return (
    <Shell>
      <div className="mb-4 flex items-baseline gap-3">
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            failed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {failed ? `${failed} 项未通过` : `全部 ${checks.length} 项通过`}
        </span>
        <span className="font-mono text-xs tabular-nums text-slate-400">{ms} ms</span>
      </div>
      <table className="w-full text-left text-xs">
        <tbody>
          {checks.map((c) => (
            <tr key={c.name} className="border-b border-slate-100 align-top">
              <td className="w-16 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                    c.pass ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {c.pass ? 'PASS' : 'FAIL'}
                </span>
              </td>
              <td className="py-2 pr-4 font-medium text-slate-700">{c.name}</td>
              <td className="py-2 font-mono tabular-nums text-slate-500">{c.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-slate-50 p-8 text-slate-900">
      <h1 className="mb-1 text-sm font-semibold">引擎自检</h1>
      <p className="mb-6 text-xs text-slate-500">
        仅 DEV。结果同时打到 console，可用 read_console_messages 读取。
      </p>
      {children}
    </div>
  )
}

/** 可由浏览器自检页和无头验证复用，避免两套断言漂移。 */
export async function runSelfTest(): Promise<Check[]> {
  const out: Check[] = []
  const ok = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail })

  // ---- 统一执行回放 ----
  const baselineExecutionValidation = validateExecutionDefinition(HISTORY_516_EXECUTIONS.baseline)
  const cityosExecutionValidation = validateExecutionDefinition(HISTORY_516_EXECUTIONS.cityos)
  ok(
    '5·16 两套执行回放定义有效',
    baselineExecutionValidation.ok && cityosExecutionValidation.ok,
    [...baselineExecutionValidation.errors, ...cityosExecutionValidation.errors].join('；') || 'baseline / cityos',
  )
  const cityosNormalEnd = deriveExecutionFrame(HISTORY_516_EXECUTIONS.cityos, {
    playheadSec: HISTORY_516_EXECUTIONS.cityos.durationSec,
    branch: 'normal',
  })
  ok(
    '正常执行分支全部车辆到场',
    cityosNormalEnd.units.every((unit) => unit.status === 'arrived'),
    `${cityosNormalEnd.units.filter((unit) => unit.status === 'arrived').length}/${cityosNormalEnd.units.length}`,
  )
  ok(
    '正常执行分支全部任务完成',
    cityosNormalEnd.tasks.every((task) => task.status === 'completed'),
    `${cityosNormalEnd.tasks.filter((task) => task.status === 'completed').length}/${cityosNormalEnd.tasks.length}`,
  )
  const cityosNormalMid = deriveExecutionFrame(HISTORY_516_EXECUTIONS.cityos, { playheadSec: 10, branch: 'normal' })
  ok(
    '正常分支不显示可选异常告警',
    cityosNormalMid.visibleAlerts.every((alert) => !alert.blocking) && cityosNormalMid.blockingAlert === null,
    `${cityosNormalMid.visibleAlerts.length} 条可见告警`,
  )
  const cityosBlocked = deriveExecutionFrame(HISTORY_516_EXECUTIONS.cityos, { playheadSec: 12, branch: 'blocked' })
  ok(
    '异常分支在阻断时刻暂停',
    cityosBlocked.playheadSec === 9 && cityosBlocked.blockingAlert?.id === 'cityos-alert-blocked',
    `T+${cityosBlocked.playheadSec}s / ${cityosBlocked.blockingAlert?.id ?? 'none'}`,
  )
  ok(
    '异常分支同步阻断关联任务',
    cityosBlocked.tasks.some((task) => task.id === 'cityos-task-traffic' && task.status === 'blocked'),
    cityosBlocked.tasks.map((task) => `${task.id}:${task.status}`).join(' / '),
  )
  ok(
    '执行回放动态对象均标注演示',
    Object.values(HISTORY_516_EXECUTIONS).every((definition) => [
      ...definition.units.map((item) => item.label),
      ...definition.intersections.map((item) => item.label),
      ...definition.tasks.map((item) => item.label),
      ...definition.onsiteNodes.map((item) => item.label),
    ].every((label) => label.startsWith('演示'))),
    '车辆 / 路口 / 任务 / 现场节点',
  )
  const stationExecutionValidation = Object.values(STATION_EXECUTIONS).map(validateExecutionDefinition)
  ok(
    '广州站两套执行回放定义有效',
    stationExecutionValidation.every((validation) => validation.ok),
    stationExecutionValidation.flatMap((validation) => validation.errors).join('；') || 'baseline / cityos',
  )
  const stationNormalEnd = deriveExecutionFrame(STATION_EXECUTIONS.cityos, {
    playheadSec: STATION_EXECUTIONS.cityos.durationSec,
    branch: 'normal',
  })
  ok(
    '广州站正常分支到场并完成任务',
    stationNormalEnd.units.every((unit) => unit.status === 'arrived')
      && stationNormalEnd.tasks.every((task) => task.status === 'completed'),
    `${stationNormalEnd.units.filter((unit) => unit.status === 'arrived').length} 车 / ${stationNormalEnd.tasks.filter((task) => task.status === 'completed').length} 任务`,
  )
  const stationBlocked = deriveExecutionFrame(STATION_EXECUTIONS.cityos, { playheadSec: 12, branch: 'blocked' })
  ok(
    '广州站异常分支同步暂停',
    stationBlocked.playheadSec === 9 && stationBlocked.blockingAlert?.id === 'station-cityos-alert-blocked',
    `T+${stationBlocked.playheadSec}s / ${stationBlocked.blockingAlert?.id ?? 'none'}`,
  )
  ok(
    '广州站公开事实使用 9 人当日口径',
    STATION_PUBLIC_FACTS.some((fact) => fact.value.includes('9 人受伤（当日通报口径）'))
      && STATION_PUBLIC_FACTS.every((fact) => !fact.value.includes('13 人')),
    `${STATION_PUBLIC_FACTS.length} 项公开事实与缺口`,
  )
  ok(
    '广州站两条演示轨输入可比',
    STATION_SIMULATION_RUNS.baseline.assumptionSetId === STATION_SIMULATION_RUNS.cityos.assumptionSetId
      && STATION_SIMULATION_RUNS.baseline.mapSnapshot === STATION_SIMULATION_RUNS.cityos.mapSnapshot
      && STATION_SIMULATION_RUNS.baseline.modelVersion === STATION_SIMULATION_RUNS.cityos.modelVersion,
    STATION_SIMULATION_RUNS.baseline.assumptionSetId ?? 'missing',
  )

  // ---- CityOS 对比报告 ----
  const reviewReports = Object.values(REVIEW_REPORTS)
  const expectedReviewIds = ['kb-516', 'kb-routine', 'kb-police', 'kb-medical', 'kb-traffic', 'kb-major']
  const riskRank: Record<string, number> = { '较低': 0, '注意': 1, '较高': 2 }
  ok(
    '六份 CityOS 对比报告齐全',
    reviewReports.length === expectedReviewIds.length && expectedReviewIds.every((id) => Boolean(REVIEW_REPORTS[id])),
    reviewReports.map((report) => report.id).join(' / '),
  )
  ok(
    '六份报告的 CityOS 演示 ETA 均更短',
    reviewReports.every((report) => report.cityos.etaMinutes < report.baseline.etaMinutes),
    reviewReports.map((report) => `${report.id}:${(report.baseline.etaMinutes - report.cityos.etaMinutes).toFixed(1)}分`).join(' / '),
  )
  ok(
    '六份报告的关键资源覆盖风险均改善',
    reviewReports.every((report) => (
      (riskRank[report.cityos.coverageRisk] ?? 99) < (riskRank[report.baseline.coverageRisk] ?? 99)
      && report.comparison.some((row) => row.metric === '关键资源覆盖风险' && row.outcome === 'improved')
    )),
    reviewReports.map((report) => `${report.id}:${report.baseline.coverageRisk}→${report.cityos.coverageRisk}`).join(' / '),
  )
  ok(
    '报告比较状态与可比性一致',
    reviewReports.every((report) => report.comparison.every((row) => row.comparable === (row.outcome !== 'not-comparable'))),
    `${reviewReports.reduce((sum, report) => sum + report.comparison.length, 0)} 行`,
  )
  ok(
    '公开案例与全演示案例事实边界分开',
    reviewReports.every((report) => report.kind === 'public-case'
      ? report.facts.length > 0 && report.simulatedPremise === undefined
      : report.facts.length === 0 && Boolean(report.simulatedPremise)),
    `${reviewReports.filter((report) => report.kind === 'public-case').length} 公开案例 / ${reviewReports.filter((report) => report.kind === 'simulated-case').length} 全演示案例`,
  )

  const [roads, site, resources] = await Promise.all([
    fetch('/data/liwan_roads.geojson').then((r) => r.json()),
    fetch('/data/liwan_site.json').then((r) => r.json()),
    fetch('/data/liwan_resources.geojson').then((r) => r.json()),
  ])
  const medicalOrigin = resolveMedicalOrigin(resources)
  const routingRuntime = createRoutingRuntime(roads, site, medicalOrigin)

  const tb = performance.now()
  const priv = buildGraph(roads, true)
  const base = buildGraph(roads, false)
  const buildMs = Math.round(performance.now() - tb)

  // ---- 建图规模 ----
  ok('逐坐标段建图，节点数', priv.nodes.size === 36758, `${priv.nodes.size}`)
  ok('段数', priv.segments.size === 39535, `${priv.segments.size}`)
  ok('way 数与源文件一致', priv.wayIndex.size === 6980, `${priv.wayIndex.size}`)

  const countEdges = (g: Graph) =>
    [...g.adjacency.values()].reduce((n, l) => n + l.length, 0)
  const eb = countEdges(base)
  const ep = countEdges(priv)
  ok('基线有向边', eb === 53808, `${eb}`)
  ok('特权有向边', ep === 79070, `${ep}`)
  ok('特权多出的边等于单行道段数', ep - eb === 25262, `${ep - eb}`)
  ok('建图耗时在 500 ms 内', buildMs < 500, `${buildMs} ms`)

  // ---- 拓扑度必须与 privileged 无关 ----
  const fp = forkCandidates(priv)
  const fb = forkCandidates(base)
  const same = fp.length === fb.length && fp.every((n, i) => n === fb[i])
  ok('分叉节点候选不受特权模式影响', same, `特权 ${fp.length} / 基线 ${fb.length}`)

  const mismatch = fp.filter((n) => !degreeMatchesNeighbors(priv, n)).length
  ok(
    '无向度与唯一相邻节点数一致（差异即重边）',
    mismatch < fp.length * 0.01,
    `${mismatch} / ${fp.length} 不等`,
  )

  const sample = fp[0]
  ok(
    '拓扑度按无向 incident 算',
    undirectedDegree(priv, sample) === undirectedDegree(base, sample),
    `样本度 ${undirectedDegree(priv, sample)}，邻居 ${uniqueNeighbors(priv, sample).length}`,
  )

  // ---- 吸附 ----
  const from = nearestNode(priv, GUANGDA.location)
  const to = nearestNode(priv, site.center)
  const medicalFrom = nearestNode(priv, medicalOrigin.location)
  ok('光大起点吸附成功', from.ok, `${from.distance.toFixed(1)} m`)
  ok('事发点吸附成功', to.ok, `${to.distance.toFixed(1)} m`)
  ok('120 出发医院唯一公开点位并吸附成功', medicalFrom.ok, `${medicalOrigin.name} / ${medicalFrom.distance.toFixed(1)} m`)

  // ---- 求解 ----
  const ts = performance.now()
  const A = solve(priv, from.node, to.node, {})
  const solveMs = Math.round(performance.now() - ts)
  const B = solve(base, from.node, to.node, {})
  const M = solve(priv, medicalFrom.node, to.node, {})
  const baselineView = buildRoutingView(routingRuntime, createScenario(site), [])
  ok('特权方案 A 有解', A.ok, A.ok ? `${Math.round(A.seconds)} s / ${Math.round(A.meters)} m` : A.message)
  ok('基线方案 B 有解', B.ok, B.ok ? `${Math.round(B.seconds)} s / ${Math.round(B.meters)} m` : B.message)
  ok('120 到场路线有解', M.ok, M.ok ? `${Math.round(M.seconds)} s / ${Math.round(M.meters)} m` : M.message)
  ok(
    '页面层 120 路线字段完整',
    baselineView.ok
      && baselineView.medicalRoute.path.length > 1
      && baselineView.medicalRoute.wayIds.length > 0
      && baselineView.medicalRoute.meters > 0
      && baselineView.medicalRoute.etaSeconds > 0
      && baselineView.medicalRoute.etaRange[0] <= baselineView.medicalRoute.etaSeconds
      && baselineView.medicalRoute.etaSeconds <= baselineView.medicalRoute.etaRange[1],
    baselineView.ok
      ? `${baselineView.medicalRoute.wayIds.length} way / ${Math.round(baselineView.medicalRoute.meters)} m / ${Math.round(baselineView.medicalRoute.etaSeconds)} s`
      : baselineView.message,
  )
  ok('单次求解在 200 ms 内', solveMs < 200, `${solveMs} ms`)

  if (!A.ok || !B.ok || !M.ok) return out

  ok('特权路径不长于基线', A.seconds <= B.seconds, `${Math.round(B.seconds - A.seconds)} s`)
  ok('特权路径确实用到了逆行段', A.steps.some((s) => s.reversed), `${A.steps.filter((s) => s.reversed).length} 段`)
  ok('基线路径没有逆行段', B.steps.every((s) => !s.reversed), `${B.steps.filter((s) => s.reversed).length} 段`)

  // ---- 误差带 ----
  const eA = estimate(A.steps)
  const eB = estimate(B.steps)
  const eM = estimate(M.steps)
  ok('误差带包含默认系数下的 ETA', eA.range[0] <= A.seconds && A.seconds <= eA.range[1], `[${Math.round(eA.range[0])}, ${Math.round(eA.range[1])}] 含 ${Math.round(A.seconds)}`)
  ok('误差带不是 A 与 B 的两端', !(Math.abs(eA.range[0] - A.seconds) < 1 && Math.abs(eA.range[1] - B.seconds) < 1), '语义已纠正')
  ok('收益等于基线减特权', Math.abs(privilegeGain(B.seconds, A.seconds) - (B.seconds - A.seconds)) < 1e-6, `${Math.round(privilegeGain(B.seconds, A.seconds))} s`)
  ok('120 ETA 落在误差带内', eM.range[0] <= M.seconds && M.seconds <= eM.range[1], `[${eM.range.map(Math.round)}] 含 ${Math.round(M.seconds)}`)
  const overlap = bandsOverlap(eA.range, eB.range)

  ok(
    '当前 A/B 误差带重叠',
    overlap,
    `A [${eA.range.map(Math.round)}] / B [${eB.range.map(Math.round)}]`,
  )

  ok(
    '分离的误差带判为不重叠',
    !bandsOverlap([100, 200], [201, 300]),
    '边界分离',
  )

  // ---- 封路重算 ----
  const worstWay = A.wayIds[Math.floor(A.wayIds.length / 2)]
  const closed = solve(priv, from.node, to.node, { closedWayIds: new Set([worstWay]) })
  ok('封一条路后仍有解', closed.ok, closed.ok ? `${Math.round(closed.seconds)} s` : closed.message)
  ok('新路径不再经过被封的路', closed.ok && !closed.wayIds.includes(worstWay), `封 ${worstWay}`)
  ok('封路后耗时不减少', closed.ok && closed.seconds >= A.seconds - 1e-6, closed.ok ? `${Math.round(closed.seconds - A.seconds)} s` : '无解')

  // ---- 封路正确性矩阵 ----
  const aWays = new Set(A.wayIds)
  const bWays = new Set(B.wayIds)
  const medicalWays = new Set(M.wayIds)
  const aOnly = A.wayIds.find((wayId) => !bWays.has(wayId))
  const bOnly = B.wayIds.find((wayId) => !aWays.has(wayId))
  const shared = A.wayIds.find((wayId) => bWays.has(wayId))
  const medicalOnly = M.wayIds.find((wayId) => !aWays.has(wayId) && !bWays.has(wayId))
  const offRoute = [...priv.wayIndex.keys()].find((wayId) => !aWays.has(wayId) && !bWays.has(wayId) && !medicalWays.has(wayId))
  const sameWays = (left: string[], right: string[]) =>
    left.length === right.length && left.every((wayId, index) => wayId === right[index])
  const changedFrom = (result: RouteResult, original: Extract<RouteResult, { ok: true }>) =>
    !result.ok || !sameWays(result.wayIds, original.wayIds)
  const solveClosed = (graph: Graph, wayId: string) =>
    solve(graph, from.node, to.node, { closedWayIds: new Set([wayId]) })

  ok('矩阵样本：A 独有 / B 独有 / 120 独有 / 共有 / 路径外均存在', Boolean(aOnly && bOnly && medicalOnly && shared && offRoute), `${aOnly} / ${bOnly} / ${medicalOnly} / ${shared} / ${offRoute}`)

  if (aOnly) {
    const nextA = solveClosed(priv, aOnly)
    const nextB = solveClosed(base, aOnly)
    ok('封 A 独有道路：A 改线或不可达', changedFrom(nextA, A), `way ${aOnly}`)
    ok('封 A 独有道路：B 保持原路径', nextB.ok && sameWays(nextB.wayIds, B.wayIds), `way ${aOnly}`)
    ok('封 A 独有道路：新 A 不含封路', !nextA.ok || !nextA.wayIds.includes(aOnly), `way ${aOnly}`)
  }

  if (bOnly) {
    const nextA = solveClosed(priv, bOnly)
    const nextB = solveClosed(base, bOnly)
    ok('封 B 独有道路：A 保持原路径', nextA.ok && sameWays(nextA.wayIds, A.wayIds), `way ${bOnly}`)
    ok('封 B 独有道路：B 改线或不可达', changedFrom(nextB, B), `way ${bOnly}`)
    ok('封 B 独有道路：新 B 不含封路', !nextB.ok || !nextB.wayIds.includes(bOnly), `way ${bOnly}`)
  }

  if (shared) {
    const nextA = solveClosed(priv, shared)
    const nextB = solveClosed(base, shared)
    ok('封 A/B 共有道路：A 改线或不可达', changedFrom(nextA, A), `way ${shared}`)
    ok('封 A/B 共有道路：B 改线或不可达', changedFrom(nextB, B), `way ${shared}`)
    ok('封 A/B 共有道路：新路径均不含封路', (!nextA.ok || !nextA.wayIds.includes(shared)) && (!nextB.ok || !nextB.wayIds.includes(shared)), `way ${shared}`)
  }

  if (medicalOnly) {
    const nextMedical = solve(priv, medicalFrom.node, to.node, { closedWayIds: new Set([medicalOnly]) })
    const way = { id: medicalOnly, name: '120 独有测试道路' }
    const scenarioView = createScenario(site)
    const view = buildRoutingView(routingRuntime, scenarioView, [way], { type: 'close', way })
    const restoredView = buildRoutingView(routingRuntime, scenarioView, [], { type: 'restore', way })
    const clearedView = buildRoutingView(routingRuntime, scenarioView, [], { type: 'clear' })
    ok('封 120 独有道路：120 改线或不可达', changedFrom(nextMedical, M), `way ${medicalOnly}`)
    ok('封 120 独有道路：新路线不含封路', !nextMedical.ok || !nextMedical.wayIds.includes(medicalOnly), `way ${medicalOnly}`)
    ok(
      '封 120 独有道路：统一视图重算且不泄漏',
      !view.ok || !view.medicalRoute.wayIds.includes(medicalOnly),
      view.message,
    )
    ok(
      '撤销 120 封路后恢复基线路线',
      baselineView.ok
        && restoredView.ok
        && sameWays(restoredView.medicalRoute.wayIds, baselineView.medicalRoute.wayIds),
      restoredView.message,
    )
    ok(
      '清空封路后恢复 120 基线路线',
      baselineView.ok
        && clearedView.ok
        && sameWays(clearedView.medicalRoute.wayIds, baselineView.medicalRoute.wayIds),
      clearedView.message,
    )
  }

  if (offRoute) {
    const nextA = solveClosed(priv, offRoute)
    const nextB = solveClosed(base, offRoute)
    ok('封路径外道路：A 无需调整', nextA.ok && sameWays(nextA.wayIds, A.wayIds), `way ${offRoute}`)
    ok('封路径外道路：B 无需调整', nextB.ok && sameWays(nextB.wayIds, B.wayIds), `way ${offRoute}`)

    const way = { id: offRoute, name: '路径外测试道路' }
    const view = buildRoutingView(routingRuntime, createScenario(site), [way], { type: 'close', way })
    ok('封路径外道路：UI 明确路线无需调整', view.ok && view.message.includes('不在封路前 A/B/120 路线上，路线无需调整'), view.message)
  }

  // ---- 不可达 ----
  const seal = new Set<string>()
  for (const seg of priv.segments.values()) {
    const c = priv.nodes.get(seg.from)
    if (!c) continue
    const d = Math.hypot((c[0] - site.center[0]) * 102400, (c[1] - site.center[1]) * 111320)
    if (d < 260) seal.add(seg.wayId)
  }
  const dead = solve(priv, from.node, to.node, { closedWayIds: seal })
  ok('围死终点返回不可达而非抛异常', !dead.ok && dead.reason === 'unreachable', `封 ${seal.size} 条`)

  // ---- 路口候选 ----
  const forks = forksOnRoute(priv, A.steps, 0)
  ok('路径上有分叉节点候选', forks.length > 0, `${forks.length} 个`)
  ok('候选度全部不小于 3', forks.every((f) => f.degree >= 3), `最小 ${Math.min(...forks.map((f) => f.degree))}`)
  const monotonic = forks.every((f, i) => i === 0 || f.passAt >= forks[i - 1].passAt)
  ok('通过时刻单调递增', monotonic, `${forks[0]?.cumulativeSeconds.toFixed(0)} s 到 ${forks[forks.length - 1]?.cumulativeSeconds.toFixed(0)} s`)

  return out
}

function resolveMedicalOrigin(resources: GeoJSON.FeatureCollection): MedicalSupportOrigin {
  const matches = resources.features.filter(
    (feature) => feature.geometry?.type === 'Point' && feature.properties?.name === '广州市第一人民医院',
  )
  const geometry = matches.length === 1 ? matches[0].geometry : null
  if (!geometry || geometry.type !== 'Point') {
    throw new Error(`120 出发医院公开点位不唯一或坐标无效：${matches.length}`)
  }
  const [lng, lat] = geometry.coordinates
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('120 出发医院公开点位坐标无效')
  }
  return { name: '广州市第一人民医院', location: [lng, lat] }
}
