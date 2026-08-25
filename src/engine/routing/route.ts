/**
 * 路径求解。纯函数。
 *
 * Dijkstra 加二叉堆。荔湾图规模 36,758 节点、特权模式 79,070 条有向边，
 * 实测耗时见 SelfTest 页，不在这里写死数字。
 *
 * 不可达时返回 { ok: false }，不抛异常。评委封路把终点封死是必然会
 * 发生的事，界面要能提示并撤销，卡死是最糟的失败模式。
 */

import type { LngLat } from '../types'
import { travelSeconds } from './cost'
import type { Graph, Segment } from './graph'

export interface RouteOptions {
  /** 被封闭的 OSM way id。整条路封，不是单段 */
  closedWayIds?: ReadonlySet<string>
  /** 紧急车辆系数 */
  speedFactor?: number
}

export interface RouteStep {
  segment: Segment
  reversed: boolean
  seconds: number
  /** 走完这一段时的累计秒数，从起点算起 */
  cumulativeSeconds: number
}

export type RouteResult =
  | {
      ok: true
      /** 途经节点坐标，喂给 deck.gl */
      path: LngLat[]
      /** 逐段明细，路口判定和逆行标注都靠它 */
      steps: RouteStep[]
      seconds: number
      meters: number
      /** 用到的 way，判断某条路封了会不会影响这条路径 */
      wayIds: string[]
      /** 有没有逆行段。没有的话特权规则在这条路径上没起作用 */
      hasReversed: boolean
    }
  | { ok: false; reason: 'unreachable' | 'same-node'; message: string }

/** 二叉最小堆。只存 (节点, 距离)，够用 */
class Heap {
  private keys: string[] = []
  private vals: number[] = []

  get size() {
    return this.keys.length
  }

  push(key: string, val: number) {
    this.keys.push(key)
    this.vals.push(val)
    let i = this.keys.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.vals[p] <= this.vals[i]) break
      this.swap(p, i)
      i = p
    }
  }

  pop(): [string, number] | null {
    if (!this.keys.length) return null
    const topKey = this.keys[0]
    const topVal = this.vals[0]
    const lastKey = this.keys.pop()!
    const lastVal = this.vals.pop()!
    if (this.keys.length) {
      this.keys[0] = lastKey
      this.vals[0] = lastVal
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let small = i
        if (l < this.vals.length && this.vals[l] < this.vals[small]) small = l
        if (r < this.vals.length && this.vals[r] < this.vals[small]) small = r
        if (small === i) break
        this.swap(small, i)
        i = small
      }
    }
    return [topKey, topVal]
  }

  private swap(a: number, b: number) {
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]]
  }
}

export function solve(
  graph: Graph,
  fromNode: string,
  toNode: string,
  options: RouteOptions = {},
): RouteResult {
  const closed = options.closedWayIds ?? new Set<string>()
  const factor = options.speedFactor ?? 1

  if (fromNode === toNode) {
    return { ok: false, reason: 'same-node', message: '起点与终点吸附到了同一个节点' }
  }

  const dist = new Map<string, number>([[fromNode, 0]])
  const prev = new Map<string, { node: string; segmentId: string; reversed: boolean }>()
  const done = new Set<string>()
  const heap = new Heap()
  heap.push(fromNode, 0)

  while (heap.size) {
    const top = heap.pop()
    if (!top) break
    const [node, d] = top
    if (done.has(node)) continue
    done.add(node)
    if (node === toNode) break

    for (const edge of graph.adjacency.get(node) ?? []) {
      const segment = graph.segments.get(edge.segmentId)
      if (!segment) continue
      if (closed.has(segment.wayId)) continue
      if (done.has(edge.to)) continue

      const next = d + travelSeconds(segment, edge.reversed, factor)
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next)
        prev.set(edge.to, { node, segmentId: edge.segmentId, reversed: edge.reversed })
        heap.push(edge.to, next)
      }
    }
  }

  if (!dist.has(toNode)) {
    return {
      ok: false,
      reason: 'unreachable',
      message:
        closed.size > 0
          ? `当前封闭 ${closed.size} 条道路的组合下无可行路径`
          : '路网上找不到从起点到终点的路径',
    }
  }

  // 回溯
  const steps: RouteStep[] = []
  const nodesReversed: string[] = [toNode]
  let cursor = toNode
  while (cursor !== fromNode) {
    const back = prev.get(cursor)
    if (!back) break
    const segment = graph.segments.get(back.segmentId)!
    steps.push({
      segment,
      reversed: back.reversed,
      seconds: travelSeconds(segment, back.reversed, factor),
      cumulativeSeconds: 0,
    })
    nodesReversed.push(back.node)
    cursor = back.node
  }
  steps.reverse()
  nodesReversed.reverse()

  let acc = 0
  let length = 0
  for (const step of steps) {
    acc += step.seconds
    step.cumulativeSeconds = acc
    length += step.segment.length
  }

  const path = nodesReversed.map((key) => graph.nodes.get(key)!).filter(Boolean)

  return {
    ok: true,
    path,
    steps,
    seconds: acc,
    meters: length,
    wayIds: [...new Set(steps.map((s) => s.segment.wayId))],
    hasReversed: steps.some((s) => s.reversed),
  }
}
