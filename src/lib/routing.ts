/**
 * 路径求解编排。A/B 双图、封路重算、不可达降级。
 *
 * `solve()` 本体在 `src/engine/routing/route.ts`，这里是产品层：同一封路
 * 条件下并行求特权图 / 基线图 / 120，失败时保留上次可行解并说明原因。
 * 从 pages/routingViewModel 抽到 lib，新旧都能 import，不要复制两份。
 */
import {
  GUANGDA,
  buildGraph,
  estimate,
  forkLabel,
  forksOnRoute,
  nearestNode,
  solve,
  type Graph,
  type IntersectionTask,
  type LngLat,
  type Plan,
  type RouteResult,
  type Scenario,
  type SiteInfo,
} from '@/engine'

/**
 * 120 到场路线的起点由页面层从资源快照中解析后传入。
 *
 * 这里不挑选“最近”或“最合适”的医院：公开 POI 无法说明急救网络归属、
 * 车辆可用状态或床位状态。调用方必须传入已经确定的演示起点。
 */
export interface MedicalSupportOrigin {
  name: string
  location: LngLat
}

export interface MedicalSupportEndpoint {
  name: string
  location: LngLat
}

/**
 * 与消防 A/B 方案并行的医疗支援路线，不是第三个处置方案。
 */
export interface MedicalSupportRoute {
  id: 'medical-support'
  origin: MedicalSupportOrigin
  destination: MedicalSupportEndpoint
  path: LngLat[]
  wayIds: string[]
  /** 供地图和协同摘要精确判定与 A/B 共线路段。 */
  segmentIds: string[]
  meters: number
  etaSeconds: number
  etaRange: [number, number]
  /** 仅按完全相同的路段 id 判定，不以同一条 OSM way 粗略代替。 */
  sharedSegmentIdsByPlan: {
    planA: string[]
    planB: string[]
  }
}

export interface RoutingRuntime {
  roads: GeoJSON.FeatureCollection
  privileged: Graph
  baseline: Graph
  fromNode: string
  toNode: string
  fromSnapMeters: number
  toSnapMeters: number
  medicalOrigin: MedicalSupportOrigin
  medicalFromNode: string
  medicalFromSnapMeters: number
}

export interface ClosedWay {
  id: string
  name: string
}

export type RoutingChange =
  | { type: 'close'; way: ClosedWay }
  | { type: 'restore'; way: ClosedWay }
  | { type: 'clear' }

export type RoutingViewResult =
  | {
      ok: true
      plans: [Plan, Plan]
      medicalRoute: MedicalSupportRoute
      routeWayIds: { planA: string[]; planB: string[]; medical: string[] }
      gainSeconds: number
      message: string
    }
  | {
      ok: false
      message: string
    }

export function createRoutingRuntime(
  roads: GeoJSON.FeatureCollection,
  site: SiteInfo,
  medicalOrigin: MedicalSupportOrigin,
): RoutingRuntime {
  const privileged = buildGraph(roads, true)
  const baseline = buildGraph(roads, false)
  const from = nearestNode(privileged, GUANGDA.location)
  const to = nearestNode(privileged, site.center)
  const medicalFrom = nearestNode(privileged, medicalOrigin.location)

  if (!from.ok) throw new Error(`光大消防中队无法吸附到路网：${from.reason ?? '未知原因'}`)
  if (!to.ok) throw new Error(`事发点无法吸附到路网：${to.reason ?? '未知原因'}`)
  if (!medicalFrom.ok) {
    throw new Error(`120 出发医院「${medicalOrigin.name}」无法吸附到路网：${medicalFrom.reason ?? '未知原因'}`)
  }

  return {
    roads,
    privileged,
    baseline,
    fromNode: from.node,
    toNode: to.node,
    fromSnapMeters: from.distance,
    toSnapMeters: to.distance,
    medicalOrigin,
    medicalFromNode: medicalFrom.node,
    medicalFromSnapMeters: medicalFrom.distance,
  }
}

export function buildRoutingView(
  runtime: RoutingRuntime,
  scenario: Scenario,
  closedWays: ClosedWay[],
  change?: RoutingChange,
): RoutingViewResult {
  const closedWayIds = new Set(closedWays.map((way) => way.id))
  const routeA = solve(runtime.privileged, runtime.fromNode, runtime.toNode, { closedWayIds })
  const routeB = solve(runtime.baseline, runtime.fromNode, runtime.toNode, { closedWayIds })
  const medicalRoute = solve(runtime.privileged, runtime.medicalFromNode, runtime.toNode, { closedWayIds })

  if (!routeA.ok || !routeB.ok || !medicalRoute.ok) {
    return {
      ok: false,
      message: failureMessage(routeA, routeB, medicalRoute),
    }
  }

  const leakedA = routeA.wayIds.find((wayId) => closedWayIds.has(wayId))
  const leakedB = routeB.wayIds.find((wayId) => closedWayIds.has(wayId))
  const leakedMedical = medicalRoute.wayIds.find((wayId) => closedWayIds.has(wayId))
  if (leakedA || leakedB || leakedMedical) {
    const leaked = [
      leakedA ? `路线 A 仍含 way ${leakedA}` : null,
      leakedB ? `路线 B 仍含 way ${leakedB}` : null,
      leakedMedical ? `120 到场路线仍含 way ${leakedMedical}` : null,
    ]
      .filter(Boolean)
      .join('；')
    return {
      ok: false,
      message: `封路完整性校验失败：${leaked}。已保留上一次可行路径，请撤销最近封路或清空。`,
    }
  }

  const intersections = makeIntersectionTasks(runtime.privileged, routeA, scenario.alarmAt)
  const planA = makePlanA(routeA, intersections, scenario)
  const planB = makePlanB(routeB, scenario)
  const supportRoute = makeMedicalSupportRoute(medicalRoute, routeA, routeB, runtime.medicalOrigin, {
    name: scenario.site.name,
    location: scenario.site.center,
  })
  const gainSeconds = planB.metrics.etaSeconds - planA.metrics.etaSeconds

  return {
    ok: true,
    plans: [planA, planB],
    medicalRoute: supportRoute,
    routeWayIds: { planA: routeA.wayIds, planB: routeB.wayIds, medical: medicalRoute.wayIds },
    gainSeconds,
    message: successMessage(runtime, closedWayIds, closedWays.length, change),
  }
}

function successMessage(
  runtime: RoutingRuntime,
  closedWayIds: Set<string>,
  closedCount: number,
  change?: RoutingChange,
): string {
  if (!change) {
    return closedCount === 0
      ? '已按当前路网快照完成 A/B/120 求解'
      : `已封闭 ${closedCount} 条 OSM way，并完成 A/B/120 重算`
  }

  if (change.type === 'clear') return '已清空封路，A/B/120 已恢复当前路网基线'
  if (change.type === 'restore') {
    return `已恢复「${change.way.name}」（way ${change.way.id}），A/B/120 已按剩余封路重算`
  }

  const previousClosedWayIds = new Set(closedWayIds)
  previousClosedWayIds.delete(change.way.id)
  const previousA = solve(runtime.privileged, runtime.fromNode, runtime.toNode, {
    closedWayIds: previousClosedWayIds,
  })
  const previousB = solve(runtime.baseline, runtime.fromNode, runtime.toNode, {
    closedWayIds: previousClosedWayIds,
  })
  const previousMedical = solve(runtime.privileged, runtime.medicalFromNode, runtime.toNode, {
    closedWayIds: previousClosedWayIds,
  })
  const affected: string[] = []
  if (previousA.ok && previousA.wayIds.includes(change.way.id)) affected.push('A')
  if (previousB.ok && previousB.wayIds.includes(change.way.id)) affected.push('B')
  if (previousMedical.ok && previousMedical.wayIds.includes(change.way.id)) affected.push('120')

  if (affected.length === 0) {
    return `已封闭「${change.way.name}」（way ${change.way.id}）；该道路不在封路前 A/B/120 路线上，路线无需调整`
  }
  return `已封闭「${change.way.name}」（way ${change.way.id}）；命中封路前路线 ${affected.join('/')}，A/B/120 已在同一封路条件下重算`
}

function makeMedicalSupportRoute(
  route: Extract<RouteResult, { ok: true }>,
  routeA: Extract<RouteResult, { ok: true }>,
  routeB: Extract<RouteResult, { ok: true }>,
  origin: MedicalSupportOrigin,
  destination: MedicalSupportEndpoint,
): MedicalSupportRoute {
  const eta = estimate(route.steps)
  const segmentIds = route.steps.map((step) => step.segment.id)

  return {
    id: 'medical-support',
    origin,
    destination,
    path: route.path,
    wayIds: route.wayIds,
    segmentIds,
    meters: route.meters,
    etaSeconds: eta.seconds,
    etaRange: eta.range,
    sharedSegmentIdsByPlan: {
      planA: sharedSegmentIds(segmentIds, routeA.steps),
      planB: sharedSegmentIds(segmentIds, routeB.steps),
    },
  }
}

function sharedSegmentIds(
  segmentIds: string[],
  routeSteps: Extract<RouteResult, { ok: true }>['steps'],
): string[] {
  const routeSegments = new Set(routeSteps.map((step) => step.segment.id))
  return segmentIds.filter((segmentId) => routeSegments.has(segmentId))
}

function makePlanA(
  route: Extract<RouteResult, { ok: true }>,
  intersections: IntersectionTask[],
  scenario: Scenario,
): Plan {
  const eta = estimate(route.steps)
  const reversedCount = route.steps.filter((step) => step.reversed).length

  return {
    id: 'plan-a',
    eventId: scenario.event.id,
    label: 'A',
    privileged: true,
    path: route.path,
    actions: [
      {
        type: '派遣',
        target: GUANGDA.name,
        detail: GUANGDA.vehicles.join('、'),
        approvalLevel: 'human',
      },
      {
        type: '请求开路',
        target: '交管指挥中心',
        detail: `沿途 ${intersections.length} 个路网分叉节点候选，按预计通过时刻滚动清空`,
        approvalLevel: 'human',
        intersections,
      },
      { type: '通知医疗', target: '广州市第一人民医院', approvalLevel: 'auto' },
      { type: '通知物业', target: '龙城市场管理处', approvalLevel: 'auto' },
    ],
    metrics: {
      etaSeconds: eta.seconds,
      etaRange: eta.range,
      constraintsViolated: [],
      intersectionCount: intersections.length,
      controlImpact: '中',
      failureRisk: '低',
      degraded: false,
    },
    rationale:
      reversedCount > 0
        ? `在演示紧急车辆规则下，路线使用 ${reversedCount} 个单行路段的反向通行能力；沿途分叉节点按预计通过时刻滚动清空。`
        : '当前路线没有使用单行路反向通行能力；仍按紧急车辆速度模型估算到场时间。',
    requiresHumanApproval: true,
  }
}

function makePlanB(route: Extract<RouteResult, { ok: true }>, scenario: Scenario): Plan {
  const eta = estimate(route.steps)
  return {
    id: 'plan-b',
    eventId: scenario.event.id,
    label: 'B',
    privileged: false,
    path: route.path,
    actions: [
      {
        type: '派遣',
        target: GUANGDA.name,
        detail: GUANGDA.vehicles.join('、'),
        approvalLevel: 'human',
      },
      { type: '通知医疗', target: '广州市第一人民医院', approvalLevel: 'auto' },
      { type: '通知物业', target: '龙城市场管理处', approvalLevel: 'auto' },
    ],
    metrics: {
      etaSeconds: eta.seconds,
      etaRange: eta.range,
      constraintsViolated: ['普通车辆规则不允许逆向使用单行路'],
      intersectionCount: 0,
      controlImpact: '低',
      failureRisk: '中',
      degraded: false,
    },
    rationale: '普通车辆通行规则基线，不使用单行路反向通行能力；与方案 A 使用同一起点、终点和速度模型。',
    requiresHumanApproval: true,
  }
}

function makeIntersectionTasks(
  graph: Graph,
  route: Extract<RouteResult, { ok: true }>,
  alarmAt: number,
): IntersectionTask[] {
  const forks = forksOnRoute(graph, route.steps, alarmAt)
  const picked = representativeForks(forks)
  return picked.map((fork, index) => ({
    intersectionId: `route-fork-${index + 1}-${fork.node}`,
    name: forkLabel(fork),
    location: fork.location,
    passAt: fork.passAt,
    leadSeconds: fork.leadSeconds,
    releaseAt: fork.releaseAt,
    suggestedAction: '信号配时与交警到位（信号属性为模拟）',
  }))
}

function representativeForks<T>(items: T[]): T[] {
  if (items.length <= 4) return items
  const positions = [0.2, 0.45, 0.7, 0.9]
  return positions.map((position) => items[Math.min(items.length - 1, Math.floor(items.length * position))])
}

function failureMessage(routeA: RouteResult, routeB: RouteResult, medicalRoute: RouteResult): string {
  const failures = [
    !routeA.ok ? `方案 A：${routeA.message}` : null,
    !routeB.ok ? `方案 B：${routeB.message}` : null,
    !medicalRoute.ok ? `120 到场路线：${medicalRoute.message}` : null,
  ].filter(Boolean)
  return `${failures.join('；')}。已保留上一次可行路径，请撤销最近封路或清空。`
}
