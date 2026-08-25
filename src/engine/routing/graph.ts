/**
 * 荔湾路网图。纯函数，无副作用。
 *
 * 关键一点：必须逐坐标段建图，不能只把 way 的首尾当节点。
 *
 * OSM 的 way 在路口处共享的是中间坐标点，不是端点。只按端点建图会得到
 * 7,794 个节点、6,980 条边、1,956 个度≥3 节点，漏掉老城区绝大多数路口；
 * 逐坐标段建图是 36,758 个节点、39,535 条段、5,539 个度≥3 节点。
 *
 * 数据源 public/data/liwan_roads.geojson，由 data/processed 同步而来，
 * 见 scripts/sync_public_data.py。
 */

import type { LngLat } from '../types'
import { meters, nodeKey } from './geo'

/** 一段路。segmentId 形如 `27317865:3`，冒号前是 OSM way id */
export interface Segment {
  id: string
  wayId: string
  from: string
  to: string
  /** 段长，米。建图时算好，求解时不再重算 */
  length: number
  /** 道路等级，决定基准速度 */
  highway: string
  /** 单行道。true 时基线模式只能正向走 */
  oneway: boolean
  name: string | null
  geometry: [LngLat, LngLat]
}

/** 有向边。反向边只在特权模式下存在 */
export interface Edge {
  segmentId: string
  to: string
  /** 是否逆着单行道方向。界面上要能指出「这一段是逆行」 */
  reversed: boolean
}

export interface Graph {
  /** nodeKey → 坐标 */
  nodes: Map<string, LngLat>
  /** segmentId → 段 */
  segments: Map<string, Segment>
  /** nodeKey → 出边。特权模式的邻接表比基线多出反向边 */
  adjacency: Map<string, Edge[]>
  /**
   * nodeKey → 相接的 segmentId，**方向无关**。
   *
   * 拓扑度必须从这里算，不能数 adjacency 的出边：基线模式下，单行道
   * 终点节点根本没有那条段的出边，同一个路口在两种模式下会算出不同的度。
   * 路口是路网的拓扑属性，不该随消防车有没有逆行豁免而变。
   */
  incident: Map<string, string[]>
  /** OSM way id → 该 way 的全部 segmentId。地图点一条路时整条封闭 */
  wayIndex: Map<string, string[]>
  /** 建图时是否放开了单行道逆行 */
  privileged: boolean
}

interface RoadProps {
  id: string | number
  highway: string
  oneway: boolean | null
  name: string | null
}

/** 各等级基准速度，km/h。**模拟值**，无公开来源，见 docs/数据边界.md E 组 */
export const BASE_SPEED_KMH: Record<string, number> = {
  motorway: 70,
  motorway_link: 45,
  trunk: 55,
  trunk_link: 40,
  primary: 45,
  primary_link: 35,
  secondary: 40,
  secondary_link: 30,
  tertiary: 35,
  tertiary_link: 28,
  unclassified: 28,
  residential: 25,
  living_street: 15,
  service: 15,
}

export const DEFAULT_SPEED_KMH = 25

/**
 * 建图。
 *
 * @param roads liwan_roads.geojson
 * @param privileged 放开单行道逆行。这是 A/B 两个方案的唯一定义差别
 */
export function buildGraph(
  roads: GeoJSON.FeatureCollection,
  privileged: boolean,
): Graph {
  const nodes = new Map<string, LngLat>()
  const segments = new Map<string, Segment>()
  const adjacency = new Map<string, Edge[]>()
  const incident = new Map<string, string[]>()
  const wayIndex = new Map<string, string[]>()

  const link = (from: string, edge: Edge) => {
    const list = adjacency.get(from)
    if (list) list.push(edge)
    else adjacency.set(from, [edge])
  }

  // 方向无关，段的两个端点都记一次
  const touch = (node: string, segmentId: string) => {
    const list = incident.get(node)
    if (list) list.push(segmentId)
    else incident.set(node, [segmentId])
  }

  for (const feature of roads.features) {
    if (feature.geometry.type !== 'LineString') continue
    const props = feature.properties as unknown as RoadProps
    const wayId = String(props.id)
    const coords = feature.geometry.coordinates as LngLat[]
    const oneway = props.oneway === true
    const ids: string[] = []

    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i]
      const b = coords[i + 1]
      const from = nodeKey(a)
      const to = nodeKey(b)
      // 量化后重合的点跳过，否则会生成零长自环
      if (from === to) continue

      const id = `${wayId}:${i}`
      nodes.set(from, a)
      nodes.set(to, b)
      segments.set(id, {
        id,
        wayId,
        from,
        to,
        length: meters(a, b),
        highway: props.highway,
        oneway,
        name: props.name,
        geometry: [a, b],
      })
      ids.push(id)
      touch(from, id)
      touch(to, id)

      link(from, { segmentId: id, to, reversed: false })
      // 双向路本来就能反着走；单行道只有特权模式才放开
      if (!oneway || privileged) {
        link(to, { segmentId: id, to: from, reversed: oneway })
      }
    }

    if (ids.length) wayIndex.set(wayId, ids)
  }

  return { nodes, segments, adjacency, incident, wayIndex, privileged }
}

/**
 * 拓扑度，按**无向**口径算。
 *
 * 不能用 adjacency 的出边条数：那是有向的，特权模式给每条单行道额外
 * 加了反向边，同一个路口在基线模式和特权模式会算出两个不同的度
 * （实测基线 2,508 个度≥3 节点，特权 5,539 个）。路口是路网的拓扑
 * 属性，不该随消防车有没有逆行豁免而变。
 *
 * 这里数的是与该节点相接的**不同段**的条数。
 */
export function undirectedDegree(graph: Graph, node: string): number {
  return graph.incident.get(node)?.length ?? 0
}

/** 与某节点相接的段。方向无关，直接读建图时建好的索引 */
export function incidentSegments(graph: Graph, node: string): Segment[] {
  const out: Segment[] = []
  for (const id of graph.incident.get(node) ?? []) {
    const segment = graph.segments.get(id)
    if (segment) out.push(segment)
  }
  return out
}

/** 与某节点直接相连的其他节点。用于交叉验证拓扑度 */
export function uniqueNeighbors(graph: Graph, node: string): string[] {
  const seen = new Set<string>()
  for (const segment of incidentSegments(graph, node)) {
    seen.add(segment.from === node ? segment.to : segment.from)
  }
  return [...seen]
}

/**
 * 路网分叉节点候选。
 *
 * **不能称为信号控制路口。** 真实信号灯几何没进快照，荔湾实测有 237 个
 * 信号灯路口，但那是计数不是点位。这里给出的是路网拓扑上相接三条以上
 * 不同路段的节点，哪些真的有信号灯属于模拟标注。
 *
 * 按无向口径算，所以基线图与特权图返回同一批节点。
 */
export function forkCandidates(graph: Graph): string[] {
  const out: string[] = []
  for (const [node, ids] of graph.incident) {
    if (ids.length >= 3) out.push(node)
  }
  return out
}
