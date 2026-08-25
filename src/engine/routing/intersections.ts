/**
 * 关键路口候选与开路时间窗。纯函数。
 *
 * 口径要说在前面：这里挑出来的是**路网分叉节点候选**，不是信号控制
 * 路口。真实信号灯的几何没进快照，荔湾实测有 237 个信号灯路口，那是
 * 计数不是点位。哪些分叉点真的有信号灯，Phase 1 是模拟标注。
 */

import type { LngLat } from '../types'
import type { Graph } from './graph'
import { incidentSegments, uniqueNeighbors, undirectedDegree } from './graph'
import type { RouteStep } from './route'

/** 开路提前量，秒。**占位值，依据待补**，见 docs/数据边界.md E 组 */
export const DEFAULT_LEAD_SECONDS = 75

/** 时间窗在车辆通过后再保持多久，秒。同样是占位值 */
export const DEFAULT_HOLD_SECONDS = 60

export interface ForkOnRoute {
  /** 图节点 key */
  node: string
  location: LngLat
  /** 无向拓扑度，相接的不同路段条数 */
  degree: number
  /** 相接路段的名称，去重。用于生成「甲路 × 乙路」这样的路口名 */
  roadNames: string[]
  /** 预计通过时刻，Unix 秒 */
  passAt: number
  /** 从起点到这里的累计秒数 */
  cumulativeSeconds: number
  /** 提前多少秒开始清空 */
  leadSeconds: number
  /** 解除时刻 */
  releaseAt: number
}

/**
 * 找出路径途经的分叉节点候选，并推算各自的通过时刻。
 *
 * @param minDegree 至少相接几条不同路段才算候选，默认 3
 */
export function forksOnRoute(
  graph: Graph,
  steps: RouteStep[],
  alarmAt: number,
  options: { minDegree?: number; leadSeconds?: number; holdSeconds?: number } = {},
): ForkOnRoute[] {
  const minDegree = options.minDegree ?? 3
  const leadSeconds = options.leadSeconds ?? DEFAULT_LEAD_SECONDS
  const holdSeconds = options.holdSeconds ?? DEFAULT_HOLD_SECONDS

  const out: ForkOnRoute[] = []
  const seen = new Set<string>()

  for (const step of steps) {
    // 走完这一段落在哪个节点上，取决于是不是逆着段的方向走
    const node = step.reversed ? step.segment.from : step.segment.to
    if (seen.has(node)) continue
    seen.add(node)

    const degree = undirectedDegree(graph, node)
    if (degree < minDegree) continue

    const location = graph.nodes.get(node)
    if (!location) continue

    const passAt = Math.round(alarmAt + step.cumulativeSeconds)
    out.push({
      node,
      location,
      degree,
      roadNames: roadNamesAt(graph, node),
      passAt,
      cumulativeSeconds: step.cumulativeSeconds,
      leadSeconds,
      releaseAt: passAt + holdSeconds,
    })
  }

  return out
}

/** 该节点相接路段的名称，去重后按出现顺序 */
function roadNamesAt(graph: Graph, node: string): string[] {
  const names: string[] = []
  for (const segment of incidentSegments(graph, node)) {
    if (segment.name && !names.includes(segment.name)) names.push(segment.name)
  }
  return names
}

/** 拿两条路名拼一个路口名，拼不出来就退回坐标 */
export function forkLabel(fork: ForkOnRoute): string {
  if (fork.roadNames.length >= 2) {
    return `${fork.roadNames[0]} × ${fork.roadNames[1]}`
  }
  if (fork.roadNames.length === 1) {
    return `${fork.roadNames[0]} 路口`
  }
  return `${fork.location[1].toFixed(4)}, ${fork.location[0].toFixed(4)}`
}

/**
 * 交叉验证：无向度应当等于唯一相邻节点数。
 *
 * 两者不等说明存在重边（同一对节点之间有多条段），路网里确实可能出现，
 * 但数量应该很少。SelfTest 用这个函数确认拓扑度算法没写错。
 */
export function degreeMatchesNeighbors(graph: Graph, node: string): boolean {
  return undirectedDegree(graph, node) === uniqueNeighbors(graph, node).length
}
