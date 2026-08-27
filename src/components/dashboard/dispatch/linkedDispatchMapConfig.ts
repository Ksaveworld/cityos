import type { ExecutionRouteRole, ExecutionUnitKind } from '../execution/executionPlayback'

export type LinkedDispatchEventId = 'ev-police-station-delay' | 'ev-major-tianhe'
export type LinkedDispatchMapVariant = 'police_current' | 'major'

export interface LinkedDispatchDataOrigin {
  position: string
  resourceState: '模拟、待核实'
  eta: '演示估算、待核实'
  route: '本地 OSM 静态路网计算'
}

export interface LinkedDispatchMapTarget {
  label: string
  position: [number, number]
}

export interface LinkedDispatchMapOption {
  optionId: string
  code: 'A' | 'B'
  optionLabel: string
  pointLabel: string
  position: [number, number]
  targetLabel: string
  routeLabel: string
  routeRole: ExecutionRouteRole
  unitKind: ExecutionUnitKind
  color: [number, number, number, number]
  etaMinutes: number
  resourceState: string
  recommendationReason: string
  verificationNote: string
  location: string
  owner: string
  vehicles: string
  taskNote: string
  dataOrigin: LinkedDispatchDataOrigin
}

export interface LinkedDispatchMapConfig {
  eventId: LinkedDispatchEventId
  scenarioId: 'yuexiu-police-current' | 'tianhe-major'
  mapVariant: LinkedDispatchMapVariant
  mapTitle: string
  mapArea: string
  mapSummary: string
  mapCenter: [number, number]
  mapZoom: number
  incidentLabel: string
  incidentPosition: [number, number]
  targets: LinkedDispatchMapTarget[]
  initialGuide: string
  options: [LinkedDispatchMapOption, LinkedDispatchMapOption]
}

const POLICE_DATA_ORIGIN: LinkedDispatchDataOrigin = {
  position: '公开静态警务 POI 坐标（OSM 快照）；单元标签为模拟',
  resourceState: '模拟、待核实',
  eta: '演示估算、待核实',
  route: '本地 OSM 静态路网计算',
}

const MAJOR_DATA_ORIGIN: LinkedDispatchDataOrigin = {
  position: '公开底图位置参考；集结点与保障单元为模拟',
  resourceState: '模拟、待核实',
  eta: '演示估算、待核实',
  route: '本地 OSM 静态路网计算',
}

export const LINKED_DISPATCH_MAP_CONFIGS: Record<LinkedDispatchEventId, LinkedDispatchMapConfig> = {
  'ev-police-station-delay': {
    eventId: 'ev-police-station-delay',
    scenarioId: 'yuexiu-police-current',
    mapVariant: 'police_current',
    mapTitle: '广州站外围疏导调整',
    mapArea: '越秀区广州火车站广场 · 演示事件',
    mapSummary: '签收超时异常与两个备用疏导单元',
    mapCenter: [113.2574, 23.1488],
    mapZoom: 15.2,
    incidentLabel: '广州站东侧入口压力点（模拟）',
    incidentPosition: [113.2584, 23.1479],
    targets: [
      { label: '广州站东侧入口压力点（模拟）', position: [113.2584, 23.1479] },
    ],
    initialGuide: '点击地图上任一候选疏导单元，或在右栏选择备用方案。',
    options: [
      {
        optionId: 'police-west-square',
        code: 'A',
        optionLabel: '站区西广场疏导组',
        pointLabel: '站区西广场疏导组（模拟）',
        position: [113.2554755, 23.1484543],
        targetLabel: '广州站东侧入口压力点（模拟）',
        routeLabel: '110 候选 A · 西广场疏导',
        routeRole: 'primary',
        unitKind: 'police',
        color: [47, 111, 218, 220],
        etaMinutes: 6.4,
        resourceState: '可联络（模拟）· 签收待核实',
        recommendationReason: '靠近当前入口压力点，演示 ETA 较短；在岗、通道和签收条件仍需人工核实。',
        verificationNote: '页面未接入疏导单元实时在岗、通道和签收回传，确认前仍需人工核实。',
        location: '站外广场西侧',
        owner: '站区外围协调负责人',
        vehicles: '疏导单元 1 组（模拟）',
        taskNote: '仅更新调度草案；可联络（模拟）、签收待核实，预计到达约 6.4 分钟（演示估算）。人工确认后才生成新任务包版本。',
        dataOrigin: POLICE_DATA_ORIGIN,
      },
      {
        optionId: 'police-huanshi-west',
        code: 'B',
        optionLabel: '环市西路外围协同组',
        pointLabel: '环市西路外围协同组（模拟）',
        position: [113.2543193, 23.1449007],
        targetLabel: '广州站东侧入口压力点（模拟）',
        routeLabel: '110 候选 B · 环市西路协同',
        routeRole: 'secondary',
        unitKind: 'police',
        color: [91, 91, 214, 215],
        etaMinutes: 8.1,
        resourceState: '可联络（模拟）· 签收待核实',
        recommendationReason: '作为外围备选可保留站区内岗位；演示 ETA 较长，需核实跨片区联络和通道条件。',
        verificationNote: '页面未接入疏导单元实时在岗、通道和签收回传，确认前仍需人工核实。',
        location: '环市西路站区入口',
        owner: '站区外围协调负责人',
        vehicles: '疏导单元 1 组（模拟）',
        taskNote: '仅更新调度草案；可联络（模拟）、签收待核实，预计到达约 8.1 分钟（演示估算）。人工确认后才生成新任务包版本。',
        dataOrigin: POLICE_DATA_ORIGIN,
      },
    ],
  },
  'ev-major-tianhe': {
    eventId: 'ev-major-tianhe',
    scenarioId: 'tianhe-major',
    mapVariant: 'major',
    mapTitle: '体育中心重点分区补位',
    mapArea: '天河体育中心周边 · 演示事件',
    mapSummary: '岗位缺口与两个备用保障单元',
    mapCenter: [113.3195, 23.1404],
    mapZoom: 15,
    incidentLabel: '重点分区岗位缺口（模拟）',
    incidentPosition: [113.3195, 23.1404],
    targets: [
      { label: '体育中心重点入口（模拟）', position: [113.3195, 23.1433] },
      { label: '体育中心南侧入口（模拟）', position: [113.3195, 23.1373] },
    ],
    initialGuide: '点击地图上任一候选保障单元，或在右栏选择补位方案。',
    options: [
      {
        optionId: 'major-tianhe-support',
        code: 'A',
        optionLabel: '天河外围保障组',
        pointLabel: '天河外围保障组（模拟）',
        position: [113.3163, 23.1412],
        targetLabel: '体育中心重点入口（模拟）',
        routeLabel: '布防候选 A · 天河外围补位',
        routeRole: 'primary',
        unitKind: 'police',
        color: [47, 111, 218, 220],
        etaMinutes: 10.1,
        resourceState: '可联络（模拟）· 到位条件待核实',
        recommendationReason: '与重点入口的演示分区责任更直接，演示 ETA 较短；岗位可用性与客流分布仍需现场核实。',
        verificationNote: '页面未接入保障单元实时编组、客流分布和到位条件，确认前仍需现场核实。',
        location: '体育中心重点入口',
        owner: '重点分区负责人',
        vehicles: '保障岗位 2 组（模拟）',
        taskNote: '仅更新布防草案；可联络（模拟）、到位条件待核实，预计到位约 10.1 分钟（演示估算）。人工确认后才生成新任务包版本。',
        dataOrigin: MAJOR_DATA_ORIGIN,
      },
      {
        optionId: 'major-haizhu-mobile',
        code: 'B',
        optionLabel: '海珠机动保障组',
        pointLabel: '海珠机动保障组（模拟）',
        position: [113.3227, 23.1393],
        targetLabel: '体育中心南侧入口（模拟）',
        routeLabel: '布防候选 B · 海珠机动补位',
        routeRole: 'secondary',
        unitKind: 'police',
        color: [124, 58, 237, 215],
        etaMinutes: 12,
        resourceState: '可联络（模拟）· 到位条件待核实',
        recommendationReason: '机动单元可补南侧入口并保留重点区原岗位；演示 ETA 较长，需核实跨区协调和临时管制。',
        verificationNote: '页面未接入保障单元实时编组、客流分布和到位条件，确认前仍需现场核实。',
        location: '体育中心南侧入口',
        owner: '现场总协调',
        vehicles: '机动岗位 2 组（模拟）',
        taskNote: '仅更新布防草案；可联络（模拟）、到位条件待核实，预计到位约 12.0 分钟（演示估算）。人工确认后才生成新任务包版本。',
        dataOrigin: MAJOR_DATA_ORIGIN,
      },
    ],
  },
}

export function getLinkedDispatchMapConfig(eventId: string | null | undefined) {
  return eventId && eventId in LINKED_DISPATCH_MAP_CONFIGS
    ? LINKED_DISPATCH_MAP_CONFIGS[eventId as LinkedDispatchEventId]
    : null
}

export function getLinkedDispatchMapOption(eventId: string, optionId: string | null | undefined) {
  return getLinkedDispatchMapConfig(eventId)?.options.find((option) => option.optionId === optionId) ?? null
}

export function findLinkedDispatchMapOption(optionId: string | null | undefined) {
  if (!optionId) return null
  for (const config of Object.values(LINKED_DISPATCH_MAP_CONFIGS)) {
    const option = config.options.find((candidate) => candidate.optionId === optionId)
    if (option) return option
  }
  return null
}
