export type TrafficStrategyRouteId = 'A' | 'B' | 'C'
export type TrafficStrategyRouteRole = 'second-alternative' | 'current-blocked' | 'recommended'

export interface TrafficStrategyRoute {
  id: TrafficStrategyRouteId
  role: TrafficStrategyRouteRole
  title: string
  etaMinutes: number
  etaLabel: string
  roadStatus: string
  mapStatus: string
  recommendationReason: string
  displayLabel: string
  color: [number, number, number, number]
  labelOffset?: [number, number]
  presetPath?: Array<[number, number]>
  avoidRoadAtLabel?: string
  dataOrigin: {
    geometry: '本地 OSM 静态路网预置' | '本地 OSM 静态路网求解'
    eta: '演示估算'
    roadState: '模拟待核实'
    rationale: '页面策略规则'
  }
}

export const TRAFFIC_PREVIOUS_CONVENTIONAL_ETA_MINUTES = 12

/**
 * 第二备选路线由仓库内 liwan_roads.geojson 离线求解并简化为 1 m 容差。
 * 路径封闭万福路受阻 way 924342440 后，经西南外围路网折返；除终点附近
 * 必要汇入段外，主体不与 B/C 共用走廊。前段包含 service 支路，车辆宽度
 * 与实际通行条件仍需人工核实，不能把静态路网可达写成已确认畅通。
 */
export const TRAFFIC_SECOND_ALTERNATIVE_PATH: Array<[number, number]> = [
  [113.2628, 23.1215],
  [113.2624091, 23.1213328],
  [113.2621168, 23.1211044],
  [113.2618856, 23.1208306],
  [113.261523, 23.1204463],
  [113.2611959, 23.1200397],
  [113.2610735, 23.1199419],
  [113.2609321, 23.119779],
  [113.2611585, 23.1194621],
  [113.2611128, 23.1193337],
  [113.2609965, 23.1192015],
  [113.2607358, 23.1189729],
  [113.2604504, 23.1192253],
  [113.2601582, 23.1195339],
  [113.2595153, 23.1191592],
  [113.2589798, 23.1199039],
  [113.2589456, 23.1199799],
  [113.2589116, 23.1201386],
  [113.2592014, 23.1215967],
  [113.2592152, 23.1218438],
  [113.2593321, 23.122038],
  [113.2594574, 23.1221332],
  [113.259675, 23.1222113],
  [113.2616166, 23.1226927],
  [113.2620893, 23.1227803],
  [113.2628694, 23.1228999],
  [113.2631215, 23.1229655],
  [113.2633059, 23.1230745],
  [113.2638601, 23.1235133],
  [113.2646674, 23.1239437],
  [113.2654498, 23.124431],
  [113.265995, 23.1247],
  [113.2661341, 23.124761],
  [113.2673777, 23.1252028],
  [113.2675403, 23.1252251],
  [113.2683786, 23.1252671],
  [113.2684, 23.1253],
]

const COMMON_DATA_ORIGIN: TrafficStrategyRoute['dataOrigin'] = {
  geometry: '本地 OSM 静态路网求解',
  eta: '演示估算',
  roadState: '模拟待核实',
  rationale: '页面策略规则',
}

export const TRAFFIC_STRATEGY_ROUTES: readonly TrafficStrategyRoute[] = [
  {
    id: 'A',
    role: 'second-alternative',
    title: '第二备选路线',
    etaMinutes: 11,
    etaLabel: 'ETA 约 11 分钟（演示估算）',
    roadStatus: '外围支路条件待核实（模拟）',
    mapStatus: '外围支路 · 待核实',
    recommendationReason: '主体与当前受阻路线、系统推荐路线分离；演示 ETA 比原 12 分钟常规路线少 1 分钟。前段服务道路需核实车辆宽度。',
    displayLabel: '路线 A · 第二备选 11 分钟',
    color: [59, 130, 246, 215],
    labelOffset: [58, -32],
    presetPath: TRAFFIC_SECOND_ALTERNATIVE_PATH,
    dataOrigin: {
      ...COMMON_DATA_ORIGIN,
      geometry: '本地 OSM 静态路网预置',
    },
  },
  {
    id: 'B',
    role: 'current-blocked',
    title: '当前执行路线',
    etaMinutes: 8,
    etaLabel: '原 ETA 约 8 分钟（演示估算）',
    roadStatus: '前方受阻（模拟待核实）',
    mapStatus: '当前 · 受阻',
    recommendationReason: '原演示 ETA 最短，但受阻状态未解除，不建议继续执行；需人工核实阻塞范围与恢复时间。',
    displayLabel: '路线 B · 当前受阻 · 原 ETA 8 分钟',
    color: [229, 72, 77, 215],
    dataOrigin: { ...COMMON_DATA_ORIGIN },
  },
  {
    id: 'C',
    role: 'recommended',
    title: '系统推荐路线',
    etaMinutes: 10,
    etaLabel: 'ETA 约 10 分钟（演示估算）',
    roadStatus: '绕开已知受阻点（模拟待核实）',
    mapStatus: '推荐 · 绕开受阻',
    recommendationReason: '绕开当前已知受阻点，演示 ETA 比第二备选少 1 分钟；仅形成系统推荐草案，仍需负责人确认。',
    displayLabel: '路线 C · 系统推荐 10 分钟',
    color: [48, 164, 108, 225],
    labelOffset: [88, 4],
    avoidRoadAtLabel: '万福路受阻点（模拟）',
    dataOrigin: { ...COMMON_DATA_ORIGIN },
  },
]

export function getTrafficStrategyRoute(id: TrafficStrategyRouteId): TrafficStrategyRoute {
  const route = TRAFFIC_STRATEGY_ROUTES.find((candidate) => candidate.id === id)
  if (!route) throw new Error(`未知交通策略路线：${id}`)
  return route
}
