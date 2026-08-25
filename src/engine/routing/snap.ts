/**
 * 起终点吸附。纯函数。
 *
 * 消防站和事发楼栋都是 POI，不是路网上的节点，必须先吸附到最近的
 * 图节点才能求解。吸附距离过大说明这个点根本不在路网覆盖范围内，
 * 宁可报错也不要静默用一个几百米外的节点当起点。
 */

import type { LngLat } from '../types'
import { meters } from './geo'
import type { Graph } from './graph'

/** 超过这个距离视为吸附失败，米 */
export const SNAP_LIMIT_M = 200

export interface SnapResult {
  ok: boolean
  node: string
  /** 吸附距离，米。界面上要显示，让人知道起点被挪了多远 */
  distance: number
  reason?: string
}

/**
 * 找最近的图节点。
 *
 * 线性扫 36,758 个节点，在浏览器里是零点几毫秒，不值得为它建空间索引。
 * 真要优化再说，先把正确性做对。
 */
export function nearestNode(graph: Graph, point: LngLat): SnapResult {
  let best = ''
  let bestD = Infinity

  for (const [key, coord] of graph.nodes) {
    const d = meters(point, coord)
    if (d < bestD) {
      bestD = d
      best = key
    }
  }

  if (!best) {
    return { ok: false, node: '', distance: Infinity, reason: '路网为空' }
  }
  if (bestD > SNAP_LIMIT_M) {
    return {
      ok: false,
      node: best,
      distance: bestD,
      reason: `最近的路网节点在 ${Math.round(bestD)} m 外，超过 ${SNAP_LIMIT_M} m 上限`,
    }
  }
  return { ok: true, node: best, distance: bestD }
}
