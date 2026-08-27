import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Layers3, Minus, Plus, RefreshCw, RotateCcw, X } from 'lucide-react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
  type FilterSpecification,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { TripsLayer } from '@deck.gl/geo-layers'
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension, type PathStyleExtensionProps } from '@deck.gl/extensions'
import { MapboxOverlay } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'

import {
  GUANGDA,
  buildGraph,
  meters,
  nearestNode,
  solve,
  type Graph,
  type Plan,
  type Segment,
  type SiteInfo,
} from '@/engine'
import { OriginMark } from '@/components/dashboard/Provenance'
import {
  MapPoiMarkers,
  MapSignalCallouts,
  type PoiMarkerDatum,
  type SignalCalloutDatum,
} from '@/components/dashboard/map/MapPoiMarkers'
import {
  POI_CONFIDENCE_BY_SCENARIO_KIND,
  POI_KIND_BY_SCENARIO_KIND,
  POI_SPECS,
  type PoiKind,
} from '@/components/dashboard/map/poiCatalog'
import { WeatherHud, WeatherOverlay } from '@/components/dashboard/weather/WeatherFx'
import { CURRENT_WEATHER } from '@/components/dashboard/weather/weatherConditions'
import { ROUTINE_HIGH_RISE } from '@/components/dashboard/fireModes'
import type { MapLayerVisibility } from '@/components/dashboard/mapLayers'
import type { RoutineHospitalTransfer } from '@/components/dashboard/dispatch/hospitalStrategyRoutes'
import {
  DISPATCH_FACILITIES,
  dispatchFacilityEtaLabel,
  dispatchFacilityPlanningState,
  getDispatchFacility,
  isDispatchSelectableFacilityId,
  type DispatchFacilityId,
} from '@/components/dashboard/dispatch/dispatchData'
import { useCommandMapInteraction } from '@/components/dashboard/dispatch/CommandMapInteractionContext'
import {
  CommandMedicalMapMarker,
  CommandTrafficMapMarkers,
  type CommandMedicalRouteTarget,
  type CommandMedicalUnitMarkerDatum,
  type CommandTrafficRouteAnnotation,
  type CommandTrafficUnitMarkerDatum,
} from '@/components/dashboard/dispatch/CommandTrafficMapMarkers'
import type {
  ExecutionFrame,
  ExecutionIntersectionFrame,
  ExecutionOnsiteNodeDefinition,
  ExecutionRoadCue,
  ExecutionRouteRole,
  ExecutionUnitFrame,
} from '@/components/dashboard/execution/executionPlayback'
import type { MedicalSupportRoute } from '@/pages/routingViewModel'
import {
  SCENARIO_MAP_CONFIGS,
  type ScenarioMapArea,
  type ScenarioMapPoint,
  type ScenarioMapVariant,
  type ScenarioPointRouteRequest,
  type ScenarioRoadState,
  type ScenarioTrafficRouteRequest,
} from '@/components/dashboard/ScenarioMap'

// Vite 的开发服务器能直接解析 MapLibre 默认的相对 worker 路径，但生产构建
// 不会自动把动态拼出的 maplibre-gl-worker.mjs 写入 dist。显式交给 Vite 发射
// worker 资源，避免 Vercel 将缺失路径回退成 index.html 后触发 MIME 错误。
setWorkerUrl(mapLibreWorkerUrl)

const BASEMAP = 'https://tiles.openfreemap.org/styles/positron'
const BASEMAP_TIMEOUT_MS = 8000
/** 在线样式已加载、但瓦片连续报错这么多次后退回本地底图 */
const ONLINE_TILE_ERROR_LIMIT = 4
const LOCAL_BASEMAP = '/data/liwan_haizhu_basemap.png'
const LOCAL_BASEMAP_BOUNDS = {
  west: 113.21419102368037,
  south: 23.078126269065322,
  east: 113.28716050239234,
  north: 23.122872031353282,
} as const
const STATION_LOCAL_BASEMAP = '/data/guangzhou_station_basemap.png'
const STATION_LOCAL_BASEMAP_BOUNDS = {
  west: 113.24862974537564,
  south: 23.14280543961341,
  east: 113.2661702546244,
  north: 23.15479429225216,
} as const
const OPENFREEMAP_NULL_FILTER_LAYERS = new Set([
  'road_shield_us',
  'highway-shield-us-interstate',
  'highway-shield-non-us',
])
const FIRE = '#E5484D'
const PRIMARY = '#5B5BD6'
const BASELINE = '#697386'
const MEDICAL = '#0E9AA7'
const MEDICAL_ROUTE_SOURCE_ID = 'medical-support-route'
const MEDICAL_ROUTE_LAYER_ID = 'medical-support-route-line'
const ROUTINE_BUILDING_ID = '751595345'
const CITY_MASSING_LAYER_ID = 'city-buildings-massing'
const ROUTINE_CONTEXT_LAYER_ID = 'routine-context-buildings'
const ROUTINE_FLOORS_SOURCE_ID = 'routine-floors'
const ROUTINE_FLOOR_SLABS_LAYER_ID = 'routine-floor-slabs'
const ROUTINE_SMOKE_LAYER_ID = 'routine-smoke-plume'
const ROUTINE_BUILDING_FILTER: FilterSpecification = ['==', ['get', 'id'], ROUTINE_BUILDING_ID]
const ROUTINE_BUILDING_EXCLUSION_FILTER: FilterSpecification = ['!=', ['get', 'id'], ROUTINE_BUILDING_ID]
const ROUTINE_CAMERA = {
  center: [113.253289, 23.113914] as [number, number],
  zoom: 17.6,
  pitch: 62,
  bearing: -105,
  duration: 2200,
} as const
const ROUTINE_ORBIT_MIN_BEARING = -135
const ROUTINE_ORBIT_MAX_BEARING = -75
const ROUTINE_ORBIT_STEP = 0.05
const DASHED_PATH_STYLE = new PathStyleExtension({ dash: true })
const ROAD_CLASS_PRIORITY: Record<string, number> = {
  motorway: 12,
  motorway_link: 11,
  trunk: 10,
  trunk_link: 9,
  primary: 8,
  primary_link: 7,
  secondary: 6,
  secondary_link: 5,
  tertiary: 4,
  tertiary_link: 3,
  unclassified: 2,
  residential: 2,
  living_street: 1,
  service: 0,
}
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'local-basemap': {
      type: 'image',
      url: LOCAL_BASEMAP,
      coordinates: [
        [LOCAL_BASEMAP_BOUNDS.west, LOCAL_BASEMAP_BOUNDS.north],
        [LOCAL_BASEMAP_BOUNDS.east, LOCAL_BASEMAP_BOUNDS.north],
        [LOCAL_BASEMAP_BOUNDS.east, LOCAL_BASEMAP_BOUNDS.south],
        [LOCAL_BASEMAP_BOUNDS.west, LOCAL_BASEMAP_BOUNDS.south],
      ],
    },
    'station-local-basemap': {
      type: 'image',
      url: STATION_LOCAL_BASEMAP,
      coordinates: [
        [STATION_LOCAL_BASEMAP_BOUNDS.west, STATION_LOCAL_BASEMAP_BOUNDS.north],
        [STATION_LOCAL_BASEMAP_BOUNDS.east, STATION_LOCAL_BASEMAP_BOUNDS.north],
        [STATION_LOCAL_BASEMAP_BOUNDS.east, STATION_LOCAL_BASEMAP_BOUNDS.south],
        [STATION_LOCAL_BASEMAP_BOUNDS.west, STATION_LOCAL_BASEMAP_BOUNDS.south],
      ],
    },
  },
  layers: [
    {
      id: 'fallback-background',
      type: 'background',
      paint: { 'background-color': '#EEF1F5' },
    },
    {
      id: 'local-basemap-raster',
      type: 'raster',
      source: 'local-basemap',
      paint: {
        'raster-opacity': 1,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
      },
    },
    {
      id: 'station-local-basemap-raster',
      type: 'raster',
      source: 'station-local-basemap',
      paint: {
        'raster-opacity': 1,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
      },
    },
  ],
}

function normalizeOpenFreeMapStyle(style: StyleSpecification) {
  for (const layer of style.layers) {
    if (!OPENFREEMAP_NULL_FILTER_LAYERS.has(layer.id) || !('filter' in layer)) continue
    const filter = layer.filter as unknown[] | undefined
    if (filter?.[0] === 'all') {
      // ref_length 在非道路盾牌要素上可能为 null；显式排除，避免 MapLibre 6 控制台告警。
      filter[1] = ['<=', ['coalesce', ['get', 'ref_length'], 99], 6]
    }
  }
  return style
}

interface MapData {
  buildings: GeoJSON.FeatureCollection
}

interface MapBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

interface RoadSelection {
  id: string
  name: string
  planIds?: Array<'A' | 'B' | '120'>
}

interface RoadProperties {
  id: string | number
  name?: string | null
  highway?: string | null
}

interface RouteSegmentDatum {
  path: [Plan['path'][number], Plan['path'][number]]
  active: boolean
  color: [number, number, number]
  shared: boolean
}

interface RouteTripDatum {
  path: Plan['path']
  timestamps: number[]
}

/**
 * 激光脉冲用的整条路线。8/21 评审：「整个地图上的这种道路重叠效果都不太好看，
 * 能做成不同颜色的脉冲吗，要有那种激光脉冲的感觉」。
 *
 * 原来每条路线都是一根不透明实线。两条方案走同一段路时只能靠 casing + 芯线
 * 叠着画，第三条（120 虚线）再压上来，同一段柏油上摞三层颜色，谁在上面全看
 * 描画顺序——读起来是脏，不是信息。
 *
 * 现在改成「暗轨 + 跑光」：静线压到很淡只留走向，颜色身份交给沿线跑过去的
 * 那道光。**每条路线给一个不同的相位**，同一段共线路上两道光是先后经过而不是
 * 叠在一起，重叠反而变成能读出来的信息——这条路两个方案都要用。
 */
interface PulseRouteDatum {
  id: string
  label: string
  path: Plan['path']
  timestamps: number[]
  color: [number, number, number]
  /** 0–1，错开各条线的起跑时刻 */
  phase: number
  width: number
  /** 转折节点：光点经过时触发一圈雷达波纹。不是每个折点都算，见 turnNodes */
  nodes: Array<{ position: [number, number]; t: number }>
  /** 同一 TripsLayer 内的错时副本；增加脉冲数量但不增加 WebGL 图层数。 */
  trips: RouteTripDatum[]
}

/** 光点位置 + 粒子拖尾 */
interface PulseHeadDatum {
  id: string
  position: [number, number]
  color: [number, number, number]
  /** 0–1，越靠尾部越小越淡 */
  intensity: number
  radius: number
}

/** 节点雷达波纹 */
interface PulseRippleDatum {
  id: string
  position: [number, number]
  color: [number, number, number]
  /** 0–1，波纹从触发到消散的进度 */
  age: number
}

/** 一组光从进场到完全离场的周期：慢一档，读起来更像连续流动而不是闪过。 */
const PULSE_CYCLE_MS = 2400
/** 三列错相位脉冲维持密度；不增加 TripsLayer 数量。 */
const PULSE_COUNT = 3
/** 拖尾长度（时间轴单位，路线全长记 100） */
const PULSE_TRAIL = 9
/** 粒子拖尾的颗数 */
const PULSE_PARTICLES = 5
/** 波纹存活时长，单位同时间轴（路线全长记 100） */
const RIPPLE_SPAN = 7
/** 路况只是道路状态，不和车辆路线争夺视觉层级。 */
const ROAD_STATUS_WIDTH_PX = 2
const BLOCKED_ROAD_WIDTH_PX = 2.4

function lightenColor(color: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(color[0] + (255 - color[0]) * amount),
    Math.round(color[1] + (255 - color[1]) * amount),
    Math.round(color[2] + (255 - color[2]) * amount),
  ]
}

/**
 * 挑出值得打波纹的节点。
 *
 * 路网折线一条几十上百个顶点，每个都打一圈波纹就是满屏噪点，和「克制」正好相反。
 * 只取真正的转折——方向变化超过阈值，且和上一个已选节点隔开足够距离——再加上终点。
 * 读起来就是「车拐弯了 / 到达了」，而不是「折线在这里有个顶点」。
 */
function turnNodes(path: Plan['path'], timestamps: number[]): Array<{ position: [number, number]; t: number }> {
  if (path.length < 2) return []
  const nodes: Array<{ position: [number, number]; t: number }> = []
  const MIN_GAP = 6 // 时间轴单位，避免连续小折角连打
  const MIN_TURN = Math.PI / 9 // 20°
  let lastT = -MIN_GAP

  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1]
    const current = path[index]
    const next = path[index + 1]
    const incoming = Math.atan2(current[1] - previous[1], current[0] - previous[0])
    const outgoing = Math.atan2(next[1] - current[1], next[0] - current[0])
    let turn = Math.abs(outgoing - incoming)
    if (turn > Math.PI) turn = Math.PI * 2 - turn
    if (turn < MIN_TURN) continue
    if (timestamps[index] - lastT < MIN_GAP) continue
    lastT = timestamps[index]
    nodes.push({ position: current, t: timestamps[index] })
  }

  nodes.push({ position: path[path.length - 1], t: 100 })
  return nodes
}

/** 按时间轴取路线上的点。timestamps 是按长度归一化的，所以走出来的速度是匀的 */
function pointAtTimestamp(path: Plan['path'], timestamps: number[], t: number): [number, number] {
  if (path.length === 0) return [0, 0]
  if (path.length === 1 || t <= 0) return path[0]
  if (t >= 100) return path[path.length - 1]
  let index = 1
  while (index < timestamps.length && timestamps[index] < t) index += 1
  const from = path[index - 1]
  const to = path[index] ?? from
  const span = (timestamps[index] ?? 100) - timestamps[index - 1]
  const ratio = span <= 0 ? 0 : (t - timestamps[index - 1]) / span
  return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
}

/**
 * 把整条路线朝法线方向平移若干米，用来分开共线路段。
 *
 * 8/21 评审：「要考虑到他们重叠的观感不能太差」。相位错开解决的是「光」的重叠，
 * 但底下的静线还是实打实摞在一起——两条线走同一段路时，上面那条把下面那条完全
 * 盖住，看上去就是少了一条。
 *
 * 做法和地铁线路图一样：共线时排成平行细线。偏移量按米给（不是按像素），
 * 所以放大到街道尺度能看清是两条，缩到城市尺度自然并回一条——那个尺度本来
 * 也不需要分辨哪条车道。
 *
 * 线仍然贴着这条路走，偏的是画法不是走向；几米的横向位移在任何缩放级别下都
 * 不会让人读错是哪条街。
 */
function offsetPath(path: Plan['path'], offsetMeters: number): Plan['path'] {
  if (offsetMeters === 0 || path.length < 2) return path
  return path.map((point, index) => {
    const previous = path[Math.max(0, index - 1)]
    const next = path[Math.min(path.length - 1, index + 1)]
    const dx = next[0] - previous[0]
    const dy = next[1] - previous[1]
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length === 0) return point
    // 法线方向；经度方向要按纬度做余弦修正，否则高纬度处偏移会被拉长
    const latitudeScale = Math.cos((point[1] * Math.PI) / 180) || 1
    const normalX = -dy / length
    const normalY = dx / length
    return [
      point[0] + (normalX * offsetMeters) / (111320 * latitudeScale),
      point[1] + (normalY * offsetMeters) / 111320,
    ] as [number, number]
  })
}

/** 路线点位不等距，按累计长度给时间戳，光速才是匀的 */
function pathTimestamps(path: Plan['path']): number[] {
  if (path.length < 2) return path.map(() => 0)
  const lengths: number[] = [0]
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const dx = path[index][0] - path[index - 1][0]
    const dy = path[index][1] - path[index - 1][1]
    total += Math.sqrt(dx * dx + dy * dy)
    lengths.push(total)
  }
  if (total === 0) return path.map((_, index) => (index / (path.length - 1)) * 100)
  return lengths.map((length) => (length / total) * 100)
}

/**
 * 用错时 timestamp 副本在同一个 TripsLayer 里画多道脉冲。
 * 每道脉冲保留一份跨周期副本，避免光头越过终点后到下一周期起点时出现长空窗。
 */
function pulseTrips(path: Plan['path'], timestamps: number[]): RouteTripDatum[] {
  const cycleSpan = 100 + PULSE_TRAIL
  return Array.from({ length: PULSE_COUNT }, (_, pulseIndex) => {
    const offset = (pulseIndex / PULSE_COUNT) * cycleSpan
    return [-cycleSpan, 0].map((cycleOffset) => ({
      path,
      timestamps: timestamps.map((timestamp) => timestamp + offset + cycleOffset),
    }))
  }).flat()
}

interface ExecutionPositionDatum {
  id: string
  position: [number, number]
  label: string
}

interface ExecutionUnitDatum extends ExecutionPositionDatum {
  kind: ExecutionUnitFrame['kind']
  status: ExecutionUnitFrame['status']
}

interface ExecutionIntersectionDatum extends ExecutionPositionDatum {
  status: ExecutionIntersectionFrame['status']
}

interface ExecutionRoadCueDatum extends ExecutionRoadCue {
  path: Array<[number, number]>
}

interface ExecutionOnsiteDatum extends ExecutionPositionDatum {
  kind: ExecutionOnsiteNodeDefinition['kind']
}

interface MedicalOriginDatum {
  position: [number, number]
}

interface StrategyIntersectionDatum {
  position: [number, number]
  name: string
}

interface ResourcePointDatum {
  id: string
  position: [number, number]
  kind: 'hospital' | 'fire_station'
  name: string
}

interface TrafficSegmentDatum {
  path: [number, number][]
  color: [number, number, number, number]
  state: ScenarioRoadState
}

interface RoadContextDatum {
  path: [number, number][]
}

interface MapPointDatum {
  position: [number, number]
}

interface ClosedRoadDatum {
  path: [number, number][]
  id: string
}

interface BlockedRoadMarkerDatum {
  id: string
  position: [number, number]
}

interface ScenarioPathDatum {
  path: Array<[number, number]>
  color: [number, number, number, number]
  layer: 'traffic' | 'routes'
  width: number
  kind: 'point-route' | 'road-segment' | 'detour'
  endpointLabels: [string, string]
  displayLabel?: string
  dispatchFacilityId?: DispatchFacilityId
  roadName?: string
  roadState?: ScenarioRoadState
}

interface ScenarioRouteArrowDatum {
  id: string
  position: [number, number]
  angle: number
  color: [number, number, number, number]
}

interface OrderedScenarioWay {
  wayId: string
  roadName: string
  path: Array<[number, number]>
  nodes: string[]
  segments: Segment[]
  eventNodeIndex: number
}

interface ScenarioRoutingState {
  paths: ScenarioPathDatum[]
  pending: boolean
  errors: string[]
  roadNames: string[]
  endpointPoints: ScenarioMapPoint[]
}

interface Props {
  site: SiteInfo
  roads: GeoJSON.FeatureCollection
  plans: Plan[]
  routeWayIds: { planA: string[]; planB: string[]; medical?: string[] }
  /** 120 协同路线不是第三个方案，单独从页面层传入。 */
  medicalRoute?: MedicalSupportRoute | null
  activePlanId: string
  /** 仅在进入方案阶段、切换方案或面板调宽完成后请求聚焦。 */
  focusActiveRoute?: boolean
  focusRevision?: number
  /** 用户选择事件时递增；即使重复点击当前事件，也要重新回到该事件中心。 */
  scenarioFocusRevision?: number
  /** 城市事件/资源选中点。只移动同一 MapLibre 实例，不重建画布。 */
  cityFocusPosition?: [number, number] | null
  cityFocusRevision?: number
  /** 只是开关。逐帧进度由本组件内部 ref 驱动，不进 React state */
  animate: boolean
  /** 是否展示行动路线；关闭时仍保留路况、事件锚点等非车辆信息。 */
  taskRoutesVisible?: boolean
  /** 是否允许行动路线进入脉冲态；false 时可保留静态方案预览。 */
  routePulseAllowed?: boolean
  /** 历史执行只展示当前批准方案，未批准方案不进入地图。 */
  pulseActivePlanOnly?: boolean
  /** 历史演示舞台使用统一 playhead；null 时回落到本组件的常规演示动画。 */
  historyPlayhead?: number | null
  historyTrack?: 'baseline' | 'cityos' | null
  /** 同一 playhead 派生出的车辆、路口、道路、任务与现场节点快照。 */
  executionFrame?: ExecutionFrame | null
  /** Strategy 之后才显示当前方案的关键开路节点，避免总览态变成点位看板。 */
  showStrategyMarkers: boolean
  closedWays: RoadSelection[]
  routeStale: boolean
  onCloseWay: (way: RoadSelection) => void
  onRemoveClosedWay: (wayId: string) => void
  layers: MapLayerVisibility
  /**
   * 总览态的城市告警落点。左栏告警流里列了什么，地图上就该有对应的点，
   * 点一下能进对应事件——否则「城市在运行」这件事只在文字里，地图是空的。
   */
  cityAlertMarkers?: PoiMarkerDatum[]
  /** 资源调度态的单位点位。和告警点一样属于城市尺度，不画路线。 */
  dispatchUnitMarkers?: PoiMarkerDatum[]
  resourceReferenceVisible: boolean
  onResourceReferenceVisibleChange: (visible: boolean) => void
  showResourceReferenceControl?: boolean
  showSimulationProvenance?: boolean
  onStaticResourceSelect?: () => void
  scenarioVariant: ScenarioMapVariant | null
  /** 已人工确认的接收医院与固定策略路径；点位立即更新，路线仍受任务下发门控。 */
  routineHospitalTransfer?: RoutineHospitalTransfer | null
  /** 资源调度预览可同时展示候选接收路线；当前选中项仍由 routineHospitalTransfer 指定。 */
  routineHospitalCandidates?: RoutineHospitalTransfer[]
  /** 场景 POI 只有显式传入回调时才可点，避免地图浏览态误吃点击。 */
  onScenarioPointSelect?: (point: ScenarioMapPoint) => void
  /** 在线瓦片不可用时也保留本地路网底纹，便于核对方案路线确实沿道路生成。 */
  showRoadNetworkContext?: boolean
}

const EMPTY_ROUTINE_HOSPITAL_TRANSFERS: RoutineHospitalTransfer[] = []

export const CityMap = memo(function CityMap({
  site,
  roads,
  plans,
  routeWayIds,
  medicalRoute = null,
  activePlanId,
  focusActiveRoute = false,
  focusRevision = 0,
  scenarioFocusRevision = 0,
  cityFocusPosition = null,
  cityFocusRevision = 0,
  animate,
  taskRoutesVisible = true,
  routePulseAllowed = true,
  pulseActivePlanOnly = false,
  historyPlayhead = null,
  historyTrack = null,
  executionFrame = null,
  showStrategyMarkers,
  closedWays,
  routeStale,
  onCloseWay,
  onRemoveClosedWay,
  layers,
  cityAlertMarkers,
  dispatchUnitMarkers,
  resourceReferenceVisible,
  onResourceReferenceVisibleChange,
  showResourceReferenceControl = true,
  showSimulationProvenance = true,
  onStaticResourceSelect,
  scenarioVariant,
  routineHospitalTransfer = null,
  routineHospitalCandidates = EMPTY_ROUTINE_HOSPITAL_TRANSFERS,
  onScenarioPointSelect,
  showRoadNetworkContext = false,
}: Props) {
  const commandMapInteraction = useCommandMapInteraction()
  const container = useRef<HTMLDivElement>(null)
  const legend = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const executionCameraKey = useRef<string | null>(null)
  const routineOrbitStopped = useRef(false)
  const onlineReload = useRef<() => void>(() => undefined)
  const onlineAttempt = useRef(0)
  const onlineAbort = useRef<AbortController | null>(null)
  const onlineTimer = useRef<number | null>(null)
  const onlineStyleApplied = useRef(false)
  const onlineStyleLoaded = useRef(false)
  const onlineTileErrors = useRef(0)
  const [ready, setReady] = useState(false)
  // 白模依赖在线矢量瓦片，离线回退时整层不存在；暴露出来方便一眼确认当前是哪种状态
  const [cityMassingOn, setCityMassingOn] = useState(false)
  const [styleRevision, setStyleRevision] = useState(0)
  const [data, setData] = useState<MapData | null>(null)
  const [resourceData, setResourceData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [tianheRoads, setTianheRoads] = useState<GeoJSON.FeatureCollection | null>(null)
  const [tianheRoadsError, setTianheRoadsError] = useState(false)
  // 减少动态效果时不跑激光脉冲。此时静线要恢复到正常粗细和不透明度，
  // 否则地图上只剩几条几乎看不见的淡痕——脉冲是补充，不能是唯一的可读性来源。
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  const [selectedRoad, setSelectedRoad] = useState<RoadSelection | null>(null)
  const [selectedResourcePoiId, setSelectedResourcePoiId] = useState<string | null>(null)
  const [pitch, setPitch] = useState(0)
  const [basemapStatus, setBasemapStatus] = useState<'loading' | 'online' | 'fallback'>('loading')
  const scenarioConfig = scenarioVariant ? SCENARIO_MAP_CONFIGS[scenarioVariant] : null
  const previousScenarioVariant = useRef<ScenarioMapVariant | null>(scenarioVariant)
  useEffect(() => {
    if (scenarioVariant === 'routine' && previousScenarioVariant.current !== 'routine') {
      routineOrbitStopped.current = false
    }
    previousScenarioVariant.current = scenarioVariant
  }, [scenarioVariant])
  const scenarioSignalCallout = useMemo<SignalCalloutDatum | null>(() => {
    if (!scenarioConfig?.signals) return null
    const anchor = scenarioConfig.points.find((point) => point.label === scenarioConfig.signals?.anchorLabel)
    if (!anchor) return null
    return {
      id: `${scenarioVariant}-signals`,
      position: anchor.position,
      anchorLabel: scenarioConfig.signals.anchorLabel,
      labels: scenarioConfig.signals.labels,
    }
  }, [scenarioConfig, scenarioVariant])
  const stopRoutineOrbit = useCallback(() => {
    routineOrbitStopped.current = true
  }, [])
  const displayRoads = scenarioVariant === 'major' && tianheRoads
    ? tianheRoads
    : roads
  const routeFitPadding = useCallback(() => ({
    top: 76,
    // 右侧事件面板是地图外的 sibling，不应计入 MapLibre 的 padding；只避开地图内图例。
    right: Math.ceil(legend.current?.getBoundingClientRect().width ?? 174) + 24,
    bottom: 104,
    left: 104,
  }), [])

  const routineContextBuildingIds = useMemo(() => {
    if (!data) return []

    const [targetLng, targetLat] = ROUTINE_CAMERA.center
    const lngMetersPerDegree = 111320 * Math.cos(23.11 * Math.PI / 180)
    return data.buildings.features.flatMap((feature) => {
      const rawId = feature.properties?.id
      if (rawId === undefined || rawId === null || String(rawId) === ROUTINE_BUILDING_ID) return []
      if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return []

      const positions = feature.geometry.type === 'Polygon'
        ? feature.geometry.coordinates.flat()
        : feature.geometry.coordinates.flat(2)
      if (positions.length === 0) return []

      const [lngSum, latSum] = positions.reduce<[number, number]>(
        ([sumLng, sumLat], [lng, lat]) => [sumLng + lng, sumLat + lat],
        [0, 0],
      )
      const lng = lngSum / positions.length
      const lat = latSum / positions.length
      const dx = (lng - targetLng) * lngMetersPerDegree
      const dy = (lat - targetLat) * 110570
      return Math.hypot(dx, dy) <= 200 ? [String(rawId)] : []
    })
  }, [data])

  const routineFloors = useMemo<GeoJSON.FeatureCollection>(() => {
    const building = data?.buildings.features.find((feature) =>
      String(feature.properties?.id) === ROUTINE_BUILDING_ID &&
      (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'),
    )
    if (!building) return { type: 'FeatureCollection', features: [] }

    return {
      type: 'FeatureCollection',
      features: Array.from({ length: ROUTINE_HIGH_RISE.totalFloors }, (_, index) => {
        const floor = index + 1
        const state = floor === ROUTINE_HIGH_RISE.fireFloor
          ? 'fire'
          : floor === ROUTINE_HIGH_RISE.smokeFloor
            ? 'smoke'
            : floor === ROUTINE_HIGH_RISE.reportedFloor
              ? 'reported'
              : floor === ROUTINE_HIGH_RISE.refugeFloor
                ? 'refuge'
                : 'plain'

        return {
          type: 'Feature',
          id: `${ROUTINE_BUILDING_ID}-floor-${floor}`,
          geometry: building.geometry,
          properties: { ...building.properties, floor, state },
        }
      }),
    }
  }, [data])

  const planBounds = useMemo(() => {
    const coordinates = plans.flatMap((plan) => plan.path)
    const lngs = coordinates.map(([lng]) => lng)
    const lats = coordinates.map(([, lat]) => lat)
    return {
      minLng: Math.min(...lngs),
      minLat: Math.min(...lats),
      maxLng: Math.max(...lngs),
      maxLat: Math.max(...lats),
    }
  }, [plans])
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? plans[0],
    [plans, activePlanId],
  )
  const focusRouteBounds = useMemo(
    () => getPathBounds([
      ...(activePlan?.path ?? []),
      ...(medicalRoute?.path ?? []),
    ]),
    [activePlan, medicalRoute],
  )
  // 城市总览态一条路线都不画。总览讲的是「城市当前有哪些异常」，
  // 画某一个事件的到场路线，等于在城市图上强调了一件事、忽略了其他四件。
  // 路线属于点进具体事件之后的处置视图。
  //
  // 这个开关必须覆盖到每一种画线的方式，漏一个就会看见一条来路不明的线：
  //   deck 图层 —— exclusiveSegments / sharedSegments / trafficSegments / 路线流光
  //   MapLibre 原生图层 —— 120 到场路线（虚线走原生 dash，不走 deck 扩展）
  const cityOverviewMode = Boolean(cityAlertMarkers || dispatchUnitMarkers)

  const medicalRouteData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (scenarioConfig || cityOverviewMode || !layers.routes || !taskRoutesVisible || !medicalRoute || medicalRoute.path.length < 2) {
      return { type: 'FeatureCollection', features: [] }
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { id: medicalRoute.id, kind: '120' },
        geometry: { type: 'LineString', coordinates: medicalRoute.path },
      }],
    }
  }, [layers.routes, medicalRoute, scenarioConfig, cityOverviewMode, taskRoutesVisible])
  const medicalOrigins = useMemo<MedicalOriginDatum[]>(
    () => !scenarioConfig && !cityOverviewMode && layers.routes && taskRoutesVisible && medicalRoute
      ? [{ position: medicalRoute.origin.location }]
      : [],
    [layers.routes, medicalRoute, scenarioConfig, cityOverviewMode, taskRoutesVisible],
  )

  useEffect(() => {
    let alive = true
    fetch('/data/liwan_buildings.geojson')
      .then((response) => response.json())
      .then((buildings) => {
        if (alive) setData({ buildings })
      })
    return () => {
      alive = false
    }
  }, [])

  // 资源点默认不请求也不展示。用户主动打开“资源参考”时，再取少量公开
  // 点位作为路线研判辅助，避免首页制造“正在实时调度全城资源”的错觉。
  // 城市总览态也要这份数据：地图上只有五个告警点太空，铺上公开的消防站、医院、
  // 派出所才像一座在运行的城市。用的是同一份公开 OSM POI，不是编的坐标。
  const needsResourceData = resourceReferenceVisible || cityOverviewMode
  useEffect(() => {
    if (!needsResourceData || resourceData) return
    let alive = true
    fetch('/data/liwan_resources.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`资源参考点 HTTP ${response.status}`)
        return response.json()
      })
      .then((resources) => {
        if (alive) setResourceData(resources)
      })
      .catch(() => {
        // 参考图层不可用不应影响路线推演；恢复关闭状态即可。
        if (alive) onResourceReferenceVisibleChange(false)
      })
    return () => {
      alive = false
    }
  }, [needsResourceData, resourceData, onResourceReferenceVisibleChange])

  useEffect(() => {
    const needsTianheRoads = scenarioVariant === 'major'
    if (!needsTianheRoads || tianheRoads || tianheRoadsError) return
    let alive = true
    fetch('/data/tianhe_scenario_roads.geojson')
      .then((response) => {
        if (!response.ok) throw new Error(`天河路网 HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      })
      .then((nextRoads) => {
        if (alive) setTianheRoads(nextRoads)
      })
      .catch(() => {
        if (alive) setTianheRoadsError(true)
      })
    return () => {
      alive = false
    }
  }, [scenarioVariant, tianheRoads, tianheRoadsError])

  useEffect(() => {
    if (!container.current || map.current) return
    const instance = new MapLibreMap({
      container: container.current,
      style: FALLBACK_STYLE,
      center: site.center,
      zoom: 13.2,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      minZoom: 12.7,
    })
    map.current = instance

    // 总览态与事件处置态共用同一个 MapLibre 实例。外层栅格切换宽度时
    // window 并没有 resize；显式观察容器才能让 MapLibre 与 deck.gl 同步
    // 更新 viewport，避免画布尺寸改变后再次出现路线/标点错位或裁切。
    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => instance.resize())
    })
    resizeObserver.observe(container.current)

    const clearOnlineTimer = () => {
      if (onlineTimer.current !== null) window.clearTimeout(onlineTimer.current)
      onlineTimer.current = null
    }

    const applyFallback = (attempt: number) => {
      if (attempt !== onlineAttempt.current || onlineStyleLoaded.current) return
      clearOnlineTimer()
      onlineAbort.current?.abort()
      onlineAbort.current = null
      setBasemapStatus('fallback')
      if (onlineStyleApplied.current) {
        onlineStyleApplied.current = false
        // MapLibre 6 的生产构建在 image → vector 差量切换时，可能把新旧
        // TileManager 留在 paused 状态。完整重建样式，避免灰板与零瓦片请求。
        instance.setStyle(FALLBACK_STYLE, { diff: false })
      }
    }

    const startOnlineLoad = () => {
      const attempt = onlineAttempt.current + 1
      onlineAttempt.current = attempt
      onlineStyleApplied.current = false
      onlineStyleLoaded.current = false
      onlineTileErrors.current = 0
      onlineAbort.current?.abort()
      clearOnlineTimer()
      setBasemapStatus('loading')

      const controller = new AbortController()
      onlineAbort.current = controller
      onlineTimer.current = window.setTimeout(() => applyFallback(attempt), BASEMAP_TIMEOUT_MS)

      void fetch(BASEMAP, { signal: controller.signal, cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`OpenFreeMap style HTTP ${response.status}`)
          return response.json() as Promise<StyleSpecification>
        })
        .then((style) => {
          if (attempt !== onlineAttempt.current || controller.signal.aborted) return
          onlineStyleApplied.current = true
          instance.setStyle(normalizeOpenFreeMapStyle(style), { diff: false })
        })
        .catch(() => applyFallback(attempt))
    }

    const onStyleLoad = () => {
      if (!overlay.current) {
        const nextOverlay = new MapboxOverlay({ interleaved: false, layers: [] })
        instance.addControl(nextOverlay)
        overlay.current = nextOverlay
      }
      setReady(true)
      setStyleRevision((revision) => revision + 1)
    }

    // style.load 只代表样式 JSON、sprite 与 source metadata 已挂载，不代表
    // 任何矢量瓦片真正画出来。生产环境曾在这里过早显示「在线底图」，
    // 实际 TileManager 仍暂停，页面因此是一块灰板。只有地图进入 idle 且
    // 当前瓦片全部加载后，才把在线底图判为成功。
    const onMapIdle = () => {
      if (!onlineStyleApplied.current || onlineStyleLoaded.current) return
      if (!instance.getSource('openmaptiles') || !instance.isStyleLoaded() || !instance.areTilesLoaded()) return
      onlineStyleLoaded.current = true
      clearOnlineTimer()
      onlineAbort.current = null
      setBasemapStatus('online')
    }

    // 在线样式加载成功之后瓦片才开始挂，也要退回本地底图。
    // 原来只兜底 style.load 之前的失败；一旦样式加载成功，后面瓦片全取不到
    // 也没人管，界面就停在标着「在线底图」的白板上，再也回不去。
    const fallbackAfterLoad = () => {
      if (!onlineStyleLoaded.current) return
      onlineStyleLoaded.current = false
      onlineStyleApplied.current = false
      onlineTileErrors.current = 0
      setBasemapStatus('fallback')
      instance.setStyle(FALLBACK_STYLE, { diff: false })
    }

    const onMapError = () => {
      if (onlineStyleApplied.current && !onlineStyleLoaded.current) {
        applyFallback(onlineAttempt.current)
        return
      }
      if (onlineStyleLoaded.current) {
        onlineTileErrors.current += 1
        if (onlineTileErrors.current >= ONLINE_TILE_ERROR_LIMIT) fallbackAfterLoad()
      }
    }

    onlineReload.current = startOnlineLoad
    instance.on('style.load', onStyleLoad)
    instance.on('idle', onMapIdle)
    instance.on('error', onMapError)
    startOnlineLoad()

    return () => {
      onlineAttempt.current += 1
      onlineAbort.current?.abort()
      onlineAbort.current = null
      clearOnlineTimer()
      onlineReload.current = () => undefined
      instance.off('style.load', onStyleLoad)
      instance.off('idle', onMapIdle)
      instance.off('error', onMapError)
      resizeObserver.disconnect()
      window.cancelAnimationFrame(resizeFrame)
      instance.remove()
      map.current = null
      overlay.current = null
      setReady(false)
    }
    // pitch is controlled imperatively after construction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site])

  // 适配视口只在首次就绪和底图样式切换时做。
  // 原来 planBounds 也在依赖里，于是每次封路重算都会把地图重新拉回默认取景、
  // 并把用户手动切到的 3D 倾角复位（实测封一条路 zoom 从 13.21 掉到 12.95）。
  // 封路后调度员正盯着某一段看，视口不该被抢走。
  const planBoundsRef = useRef(planBounds)
  planBoundsRef.current = planBounds
  const focusRouteBoundsRef = useRef(focusRouteBounds)
  focusRouteBoundsRef.current = focusRouteBounds
  const focusActiveRouteRef = useRef(focusActiveRoute)
  focusActiveRouteRef.current = focusActiveRoute

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance) return
    if (scenarioVariant === 'routine') {
      const visibleTransfers = [routineHospitalTransfer, ...routineHospitalCandidates]
        .filter((transfer): transfer is RoutineHospitalTransfer => Boolean(transfer))
        .filter((transfer, index, transfers) => transfers.findIndex((candidate) => candidate.id === transfer.id) === index)
      const transferBounds = visibleTransfers.length > 0
        ? getPathBounds(visibleTransfers.flatMap((transfer) => transfer.path))
        : null
      if (transferBounds) {
        stopRoutineOrbit()
        instance.resize()
        instance.stop()
        instance.fitBounds(
          [
            [transferBounds.minLng, transferBounds.minLat],
            [transferBounds.maxLng, transferBounds.maxLat],
          ],
          {
            padding: routeFitPadding(),
            maxZoom: 15,
            pitch: 0,
            bearing: 0,
            duration: styleRevision <= 1 || reducedMotion ? 0 : 520,
          },
        )
        setPitch(0)
        return
      }
      instance.flyTo(ROUTINE_CAMERA)
      setPitch(ROUTINE_CAMERA.pitch)
      return
    }
    if (scenarioConfig) {
      // 事件卡进入详情会同时改变外层栅格宽度。先同步 MapLibre 的容器尺寸，
      // 再起镜头动画，避免随后 ResizeObserver 把中心从事件锚点推开。
      instance.resize()
      instance.stop()
      instance.easeTo({
        center: scenarioConfig.center,
        zoom: scenarioConfig.zoom,
        pitch: 0,
        bearing: 0,
        duration: styleRevision <= 1 ? 0 : 420,
      })
      setPitch(0)
      return
    }

    const bounds = (focusActiveRouteRef.current ? focusRouteBoundsRef.current : null) ?? planBoundsRef.current
    instance.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      {
        padding: routeFitPadding(),
        maxZoom: 14,
        pitch: 0,
        bearing: 0,
        duration: styleRevision <= 1 ? 0 : 300,
      },
    )
    setPitch(0)
  }, [ready, reducedMotion, routeFitPadding, routineHospitalCandidates, routineHospitalTransfer, scenarioConfig, scenarioFocusRevision, scenarioVariant, stopRoutineOrbit, styleRevision])

  // 只有明确进入方案阶段、切换当前方案或父级完成面板调宽后才重新聚焦。
  // 路线重算会更新 ref，但不在依赖中，封路时不会抢走用户正在查看的视口。
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !focusActiveRoute || scenarioConfig || scenarioVariant === 'routine') return
    const bounds = focusRouteBoundsRef.current
    if (!bounds) return
    // 右侧面板调宽会先改变 map 容器宽度；这里显式 resize，再计算 bounds，
    // 不依赖 ResizeObserver 与 React effect 的先后时序。
    instance.resize()
    instance.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      {
        padding: routeFitPadding(),
        maxZoom: 15.5,
        pitch: 0,
        bearing: 0,
        duration: 320,
      },
    )
    setPitch(0)
  }, [activePlanId, focusActiveRoute, focusRevision, ready, routeFitPadding, scenarioConfig, scenarioVariant])

  useEffect(() => {
    const instance = map.current
    // 在线样式通过 setStyle() 异步替换本地底图时，ready 仍保留上一份样式的状态。
    // 这段时间调用 addSource/addLayer 会抛出「Style is not done loading」，并让
    // React 整棵页面卸载。等待现有 style.load → styleRevision 再重新执行即可。
    if (!ready || !instance || !data || !instance.isStyleLoaded()) return

    // 底图样式一换（本地 fallback ↔ 在线 positron），MapLibre 可能整份重建样式，
    // 也可能只做增量 diff，两条路径下 source 与 layer 的存活情况并不一致。
    // 原来这里是「buildings source 还在就整段跳过」的一刀切写法。路网还画在 SVG
    // 里时这个漏洞看不出来；把路网改成 MapLibre 图层之后，只要 source 侥幸留下
    // 而 layer 被清掉，整张路网就再也加不回来了。所以逐个判断、逐个补。
    if (!instance.getSource('buildings')) {
      instance.addSource('buildings', { type: 'geojson', data: data.buildings })
    }
    const roadSource = instance.getSource('roads-local') as GeoJSONSource | undefined
    if (roadSource) roadSource.setData(displayRoads)
    else instance.addSource('roads-local', { type: 'geojson', data: displayRoads })

    if (!instance.getLayer('buildings-3d')) instance.addLayer({
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'buildings',
      paint: {
        'fill-extrusion-height': ['*', ['get', 'levels'], 3],
        'fill-extrusion-base': 0,
        'fill-extrusion-color': [
          'case',
          ['==', ['get', 'id'], site.buildingId],
          FIRE,
          ['get', 'levels_estimated'],
          '#D6DAE3',
          '#AEB7C5',
        ],
        'fill-extrusion-opacity': 0.78,
      },
    })

    if (scenarioVariant === 'routine') {
      const contextFilter: FilterSpecification = [
        'in',
        ['get', 'id'],
        ['literal', routineContextBuildingIds],
      ]
      instance.setFilter('buildings-3d', [
        'all',
        ROUTINE_BUILDING_EXCLUSION_FILTER,
        ['!', contextFilter],
      ])
      const routineFloorsSource = instance.getSource(ROUTINE_FLOORS_SOURCE_ID) as GeoJSONSource | undefined
      if (routineFloorsSource) routineFloorsSource.setData(routineFloors)
      else instance.addSource(ROUTINE_FLOORS_SOURCE_ID, { type: 'geojson', data: routineFloors })
      if (!instance.getLayer(ROUTINE_FLOOR_SLABS_LAYER_ID)) {
        instance.addLayer(
          {
            id: ROUTINE_FLOOR_SLABS_LAYER_ID,
            type: 'fill-extrusion',
            source: ROUTINE_FLOORS_SOURCE_ID,
            paint: {
              'fill-extrusion-base': [
                '+',
                ['*', ['-', ['get', 'floor'], 1], 3],
                ['match', ['get', 'state'], 'reported', 0.95, 0.35],
              ],
              'fill-extrusion-height': [
                '-',
                ['*', ['get', 'floor'], 3],
                ['match', ['get', 'state'], 'reported', 0.95, 0.35],
              ],
              'fill-extrusion-color': [
                'match',
                ['get', 'state'],
                'plain', 'rgba(174,183,197,0.88)',
                'refuge', 'rgba(48,164,108,0.88)',
                'fire', 'rgba(229,72,77,0.97)',
                'smoke', 'rgba(232,150,74,0.82)',
                'reported', 'rgba(199,120,22,0.45)',
                'rgba(174,183,197,0.88)',
              ],
              'fill-extrusion-opacity': 1,
              'fill-extrusion-vertical-gradient': false,
            },
          },
          instance.getLayer('roads-base') ? 'roads-base' : undefined,
        )
      }
      if (!instance.getLayer(ROUTINE_SMOKE_LAYER_ID)) {
        instance.addLayer(
          {
            id: ROUTINE_SMOKE_LAYER_ID,
            type: 'fill-extrusion',
            source: 'buildings',
            filter: ROUTINE_BUILDING_FILTER,
            paint: {
              'fill-extrusion-base': 57,
              'fill-extrusion-height': 58,
              'fill-extrusion-color': '#E8964A',
              'fill-extrusion-opacity': 0.42,
              'fill-extrusion-vertical-gradient': false,
            },
          },
          instance.getLayer('roads-base') ? 'roads-base' : undefined,
        )
      }
      if (instance.getLayer(ROUTINE_CONTEXT_LAYER_ID)) {
        instance.setFilter(ROUTINE_CONTEXT_LAYER_ID, contextFilter)
      } else {
        instance.addLayer(
          {
            id: ROUTINE_CONTEXT_LAYER_ID,
            type: 'fill-extrusion',
            source: 'buildings',
            filter: contextFilter,
            paint: {
              'fill-extrusion-height': ['*', ['get', 'levels'], 3],
              'fill-extrusion-base': 0,
              'fill-extrusion-color': '#C9D0DA',
              'fill-extrusion-opacity': 0.22,
            },
          },
          instance.getLayer('roads-base') ? 'roads-base' : undefined,
        )
      }
    } else {
      instance.setFilter('buildings-3d', null)
      if (instance.getLayer(ROUTINE_SMOKE_LAYER_ID)) instance.removeLayer(ROUTINE_SMOKE_LAYER_ID)
      if (instance.getLayer(ROUTINE_FLOOR_SLABS_LAYER_ID)) instance.removeLayer(ROUTINE_FLOOR_SLABS_LAYER_ID)
      if (instance.getSource(ROUTINE_FLOORS_SOURCE_ID)) instance.removeSource(ROUTINE_FLOORS_SOURCE_ID)
      if (instance.getLayer(ROUTINE_CONTEXT_LAYER_ID)) instance.removeLayer(ROUTINE_CONTEXT_LAYER_ID)
    }

    // 城市尺度 2.5D 白模。
    //
    // 数据用在线底图自带的 openmaptiles 矢量瓦片 building 图层，全城覆盖、真实
    // OSM 轮廓，不新增任何素材，离线回退时自动消失。本地那份 liwan_buildings
    // 只覆盖荔湾，铺不满整张图。
    //
    // 层序：矢量样式里 building(第 8 层) 正好夹在底图填充和道路(第 9 层起)之间，
    // 插在 tunnel_motorway_casing 之前，白模天然压在所有道路下面，不挡路。
    //
    // 高度取 render_height，没有的给 12 米兜底——评审说了不求真实高度和房型，
    // 但有真值时用真值不多花一分钱。地标不做单独识别：矢量瓦片的 building 图层
    // 没有名称字段，认不出哪栋是地标；改用高度分档上色 + 垂直渐变，越高颜色越沉，
    // 珠江新城那种高层簇自己就会从白模里立出来。真正要做精细的那一栋是事发楼，
    // 它在日常演练里有逐层剖面，比任何地标都细。
    //
    // 日常演练态整层关掉：那时镜头贴着事发楼，矢量瓦片里同一栋楼会和我们自己
    // 挤出的逐层剖面完全重叠并把它盖住——楼栋尺度看剖面，城市尺度才看白模。
    const cityMassingActive = Boolean(instance.getSource('openmaptiles')) && scenarioVariant !== 'routine'
    setCityMassingOn(cityMassingActive)
    if (cityMassingActive) {
      if (!instance.getLayer(CITY_MASSING_LAYER_ID)) {
        const beforeId = instance.getLayer('tunnel_motorway_casing')
          ? 'tunnel_motorway_casing'
          : instance.getLayer('roads-base')
            ? 'roads-base'
            : undefined
        instance.addLayer(
          {
            id: CITY_MASSING_LAYER_ID,
            type: 'fill-extrusion',
            source: 'openmaptiles',
            'source-layer': 'building',
            minzoom: 12,
            paint: {
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], 12],
                0, '#EDEFF4',
                30, '#E1E6EE',
                80, '#D2D9E5',
                160, '#BFC8D8',
              ],
              'fill-extrusion-opacity': 0.88,
              'fill-extrusion-vertical-gradient': true,
            },
          },
          beforeId,
        )
      }
      // 本地 geojson 和在线矢量是同一批 OSM 轮廓，两层同时画会 z-fighting，
      // 楼面会闪。在线可用时本地层只留事发楼那一栋的红色高亮。
      instance.setFilter('buildings-3d', ['==', ['get', 'id'], site.buildingId])
    } else if (instance.getLayer(CITY_MASSING_LAYER_ID)) {
      instance.removeLayer(CITY_MASSING_LAYER_ID)
    }

    // 路网底线。原来这一层画在 React 托管的 SVG 里，1,325 条路 × 2 个 path
    // 共 2,650 个节点，地图每动一次就要由 React 重投影一遍，实测单次提交
    // 114–125 ms。交给 MapLibre 之后走 GPU，React 完全不参与。
    if (!instance.getLayer('roads-base')) instance.addLayer({
      id: 'roads-base',
      type: 'line',
      source: 'roads-local',
      paint: {
        'line-color': [
          'match',
          ['get', 'highway'],
          ['motorway', 'trunk', 'primary', 'secondary'],
          '#BCC4D0',
          '#D4D9E1',
        ],
        'line-width': [
          'match',
          ['get', 'highway'],
          ['motorway', 'trunk', 'primary', 'secondary'],
          1.6,
          0.9,
        ],
      },
    })

    // 封路红线不画在这里。MapLibre 的 canvas 在 deck.gl 路线之下，画在这一层
    // 会被路线盖住，看不出新路线到底有没有离开封闭路段。改由最上层的 SVG 画。
    if (!instance.getLayer('roads-hit')) instance.addLayer({
      id: 'roads-hit',
      type: 'line',
      source: 'roads-local',
      paint: {
        'line-color': '#000000',
        'line-width': 16,
        'line-opacity': 0.01,
      },
    })

    // 120 到场路线使用 MapLibre 原生 dash，不依赖 deck.gl 扩展；同一条路上
    // 即使消防动效覆盖，也不会把医疗路线误读成第三个消防方案。
    const medicalRouteSource = instance.getSource(MEDICAL_ROUTE_SOURCE_ID) as GeoJSONSource | undefined
    if (medicalRouteSource) medicalRouteSource.setData(medicalRouteData)
    else instance.addSource(MEDICAL_ROUTE_SOURCE_ID, { type: 'geojson', data: medicalRouteData })
    // 开脉冲时这条虚线让位：120 路线已经在脉冲图层里有自己的青色车道和相位，
    // 两套画法并排出现只会让人以为是两条不同的路线。
    // 这里不能直接用 pulseEnabled（它依赖后面才声明的 scenarioPaths），
    // 按同样的条件就地判一次；两边任何一侧改了条件，都要同步另一侧。
    const medicalPulseActive = taskRoutesVisible && routePulseAllowed && !reducedMotion && !routeStale && !cityOverviewMode && layers.routes && Boolean(medicalRoute)
    const medicalLineOpacity = !taskRoutesVisible ? 0 : medicalPulseActive ? 0 : routeStale ? 0.5 : 0.94
    if (!instance.getLayer(MEDICAL_ROUTE_LAYER_ID)) {
      instance.addLayer({
        id: MEDICAL_ROUTE_LAYER_ID,
        type: 'line',
        source: MEDICAL_ROUTE_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': routeStale ? '#9CA3AF' : MEDICAL,
          'line-width': 3.5,
          'line-opacity': medicalLineOpacity,
          'line-dasharray': [1.5, 1.1],
        },
      })
    } else {
      instance.setPaintProperty(MEDICAL_ROUTE_LAYER_ID, 'line-color', routeStale ? '#9CA3AF' : MEDICAL)
      instance.setPaintProperty(MEDICAL_ROUTE_LAYER_ID, 'line-opacity', medicalLineOpacity)
    }

    // 其它场景只复用公开底图与演示叠加层；荔湾封路工具和本地路由能力不外推。
    if (scenarioConfig || cityOverviewMode) return

    const planAIds = new Set(routeWayIds.planA)
    const planBIds = new Set(routeWayIds.planB)
    const medicalIds = new Set(routeWayIds.medical ?? medicalRoute?.wayIds ?? [])
    const onRoadClick = (event: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const candidates = (event.features ?? []).filter((feature) => feature.properties?.id !== undefined)
      const preferred = candidates.find((feature) => {
        const id = String(feature.properties?.id)
        return planAIds.has(id) || planBIds.has(id) || medicalIds.has(id)
      })
      const properties = (preferred ?? candidates[0])?.properties
      if (!properties || properties.id === undefined) return
      const id = String(properties.id)
      const rawName = properties.name
      const planIds: Array<'A' | 'B' | '120'> = []
      if (planAIds.has(id)) planIds.push('A')
      if (planBIds.has(id)) planIds.push('B')
      if (medicalIds.has(id)) planIds.push('120')
      setSelectedRoad({
        id,
        name: typeof rawName === 'string' && rawName ? rawName : `未命名道路 · way ${id}`,
        planIds,
      })
    }
    const pointer = () => {
      instance.getCanvas().style.cursor = 'pointer'
    }
    const defaultCursor = () => {
      instance.getCanvas().style.cursor = ''
    }

    instance.on('click', 'roads-hit', onRoadClick)
    instance.on('mouseenter', 'roads-hit', pointer)
    instance.on('mouseleave', 'roads-hit', defaultCursor)

    return () => {
      instance.off('click', 'roads-hit', onRoadClick)
      instance.off('mouseenter', 'roads-hit', pointer)
      instance.off('mouseleave', 'roads-hit', defaultCursor)
    }
  }, [ready, styleRevision, data, displayRoads, medicalRoute, medicalRouteData, routeStale, site, routeWayIds, scenarioConfig, scenarioVariant, routineContextBuildingIds, routineFloors, cityOverviewMode, reducedMotion, layers.routes, routePulseAllowed, taskRoutesVisible])

  useEffect(() => {
    if (scenarioConfig || cityOverviewMode) setSelectedRoad(null)
  }, [scenarioConfig, cityOverviewMode])

  useEffect(() => {
    setSelectedResourcePoiId(null)
  }, [cityFocusRevision])

  const { exclusiveSegments, sharedSegments } = useMemo(() => {
    if (scenarioConfig || cityOverviewMode) return { exclusiveSegments: [], sharedSegments: [] }
    const routeSegments = buildRouteSegments(plans, activePlanId)
    return {
      exclusiveSegments: routeSegments.filter((segment) => !segment.shared),
      sharedSegments: routeSegments.filter((segment) => segment.shared),
    }
  }, [plans, activePlanId, scenarioConfig, cityOverviewMode])
  const activePlanSegments = useMemo<RouteSegmentDatum[]>(() => {
    if (!pulseActivePlanOnly || !activePlan) return []
    const color: [number, number, number] = activePlan.id === plans[0]?.id
      ? [91, 91, 214]
      : [105, 115, 134]
    return activePlan.path.slice(1).map((coordinate, index) => ({
      path: [activePlan.path[index], coordinate],
      active: true,
      color,
      shared: false,
    }))
  }, [activePlan, plans, pulseActivePlanOnly])
  const trafficSegments = useMemo<TrafficSegmentDatum[]>(() => {
    if (scenarioConfig || cityOverviewMode || pulseActivePlanOnly || !layers.traffic || !activePlan) return []
    return activePlan.path.slice(1).flatMap((coordinate, index) => {
      if (index % 3 !== 0) return []
      return [{
        path: [activePlan.path[index], coordinate],
        color: [48, 164, 108, 170],
        state: 'clear',
      }]
    })
  }, [activePlan, layers.traffic, scenarioConfig, cityOverviewMode, pulseActivePlanOnly])
  const cameraPoints = useMemo<MapPointDatum[]>(() => {
    if (scenarioConfig || !layers.cameras || !activePlan?.path.length) return []
    const indexes = [0.22, 0.46, 0.7, 0.88].map((ratio) =>
      Math.min(activePlan.path.length - 1, Math.floor((activePlan.path.length - 1) * ratio)),
    )
    return indexes.map((index) => ({ position: activePlan.path[index] }))
  }, [activePlan, layers.cameras, scenarioConfig])
  // 气象不再画蓝色圆圈。8/20 评审明确「一个圆圈上去产品语言不对」：
  // 圆圈既不是气象产品的表达方式（雷达图是色带，不是空心圆），也遮挡路线。
  // 改为全幅降雨动效 + 右上角气象卡片，见 weather/WeatherFx.tsx。
  const strategyIntersections = useMemo<StrategyIntersectionDatum[]>(() => {
    if (scenarioConfig || !showStrategyMarkers || !activePlan) return []
    const intersections = activePlan.actions.find((action) => action.type === '请求开路')?.intersections ?? []
    const sampled = intersections.length <= 3
      ? intersections
      : [intersections[0], intersections[Math.floor((intersections.length - 1) / 2)], intersections[intersections.length - 1]]
    return sampled.map((intersection) => ({ position: intersection.location, name: intersection.name }))
  }, [activePlan, showStrategyMarkers, scenarioConfig])
  const resourcePoints = useMemo<ResourcePointDatum[]>(() => {
    if (scenarioConfig || !resourceReferenceVisible || !resourceData) return []
    const points = resourceData.features.flatMap((feature) => {
      if (feature.geometry.type !== 'Point') return []
      const kind = feature.properties?.kind
      if (kind !== 'hospital' && kind !== 'fire_station') return []
      const position = feature.geometry.coordinates as [number, number]
      const name = typeof feature.properties?.name === 'string' && feature.properties.name
        ? feature.properties.name
        : kind === 'hospital' ? '医疗机构' : '消防救援站'
      return [{ id: `reference-${kind}-${name}-${position.join('-')}`, position, kind, name }]
    })
    const distanceToSite = (point: ResourcePointDatum) =>
      (point.position[0] - site.center[0]) ** 2 + (point.position[1] - site.center[1]) ** 2
    const nearest = (kind: ResourcePointDatum['kind'], count: number) =>
      points
        .filter((point) => point.kind === kind)
        .sort((left, right) => distanceToSite(left) - distanceToSite(right))
        .slice(0, count)

    // 起点已用较大的蓝点单独表达；这里只补少量周边公开参考点，不能等同于
    // 实时可用资源或实际参与本次处置的单位。
    const nearbyStations = nearest('fire_station', 4).filter((point) =>
      Math.abs(point.position[0] - GUANGDA.location[0]) > 0.000001 || Math.abs(point.position[1] - GUANGDA.location[1]) > 0.000001,
    ).slice(0, 3)
    return [...nearbyStations, ...nearest('hospital', 3)]
  }, [resourceData, resourceReferenceVisible, site.center, scenarioConfig])
  const closedRoads = useMemo<ClosedRoadDatum[]>(() => {
    if (scenarioConfig || !layers.traffic || !closedWays.length) return []
    const ids = new Set(closedWays.map((way) => way.id))
    return roads.features.flatMap((feature) => {
      if (feature.geometry.type !== 'LineString') return []
      const id = String((feature.properties as RoadProperties | null)?.id ?? '')
      if (!ids.has(id)) return []
      return [{ path: feature.geometry.coordinates as [number, number][], id }]
    })
  }, [roads, closedWays, layers.traffic, scenarioConfig])

  const scenarioAreas = useMemo<ScenarioMapArea[]>(() => {
    if (!scenarioConfig) return []
    // 同上：weather 分层的圆圈一并去掉，气象表达统一交给全幅动效。
    return scenarioConfig.areas.filter((area) => area.layer === 'base')
  }, [scenarioConfig])
  const roadNetworkContext = useMemo<RoadContextDatum[]>(() => {
    if (!showRoadNetworkContext) return []
    return roads.features.flatMap((feature) => {
      if (feature.geometry.type === 'LineString') {
        return [{ path: feature.geometry.coordinates as [number, number][] }]
      }
      if (feature.geometry.type === 'MultiLineString') {
        return feature.geometry.coordinates.map((path) => ({ path: path as [number, number][] }))
      }
      return []
    })
  }, [roads, showRoadNetworkContext])
  const scenarioRouting = useMemo<ScenarioRoutingState>(() => {
    if (!scenarioConfig) {
      return { paths: [], pending: false, errors: [], roadNames: [], endpointPoints: [] }
    }
    const needsTianheRoads = scenarioVariant === 'major'
    const routeRoads = needsTianheRoads ? tianheRoads : roads
    if (!routeRoads) {
      return {
        paths: [],
        pending: !tianheRoadsError,
        errors: tianheRoadsError ? ['天河场景路网未加载'] : [],
        roadNames: [],
        endpointPoints: [],
      }
    }

    const graph = buildGraph(routeRoads, false)
    const paths: ScenarioPathDatum[] = []
    const errors: string[] = []
    const roadNames = new Set<string>()
    const endpointPoints: ScenarioMapPoint[] = []
    const hospitalTransfer = scenarioVariant === 'routine' ? routineHospitalTransfer : null
    const hospitalTransfers = scenarioVariant === 'routine'
      ? [hospitalTransfer, ...routineHospitalCandidates]
          .filter((transfer): transfer is RoutineHospitalTransfer => Boolean(transfer))
          .filter((transfer, index, transfers) => transfers.findIndex((candidate) => candidate.id === transfer.id) === index)
      : []
    for (const request of scenarioConfig.routes) {
      // 换院后，接收医院路线替换原来的医疗到场参考线；否则同一种医疗行动会
      // 同时保留「医疗参考 → 现场」和「现场 → 接收医院」，形成第三条脉冲。
      if (
        hospitalTransfers.length > 0
        && request.layer === 'routes'
        && request.fromLabel === '医疗参考'
        && request.toLabel === '18 层演练点'
      ) continue

      if (request.layer === 'routes') {
        if (request.presetPath) {
          if (request.presetPath.length < 2) {
            errors.push(`${request.fromLabel} → ${request.toLabel} 的本地预置路线无效`)
            continue
          }
          paths.push({
            path: request.presetPath,
            color: request.color,
            layer: 'routes',
            width: request.width,
            kind: 'point-route',
            endpointLabels: [request.fromLabel, request.toLabel],
            displayLabel: request.displayLabel,
            dispatchFacilityId: request.dispatchFacilityId,
          })
          continue
        }
        let closedWayIds: ReadonlySet<string> | undefined
        if (request.avoidRoadAtLabel) {
          const avoidPoint = resolveScenarioPoint(scenarioConfig.points, request.avoidRoadAtLabel)
          if (!avoidPoint.ok) {
            errors.push(avoidPoint.message)
            continue
          }
          const avoidedRoad = findScenarioRoad(graph, avoidPoint.point.position)
          if (!avoidedRoad) {
            errors.push(`${request.avoidRoadAtLabel} 未匹配到可避让 OSM 道路`)
            continue
          }
          closedWayIds = new Set([avoidedRoad.wayId])
        }
        const routeLabels = [request.fromLabel, ...(request.viaLabels ?? []), request.toLabel]
        const routePoints: ScenarioMapPoint[] = []
        let invalidRoute = false
        for (const label of routeLabels) {
          const resolved = resolveScenarioPoint(scenarioConfig.points, label)
          if (!resolved.ok) {
            errors.push(resolved.message)
            invalidRoute = true
            break
          }
          routePoints.push(resolved.point)
        }
        if (invalidRoute) continue

        const segmentPaths: ScenarioPathDatum[] = []
        for (let index = 0; index < routePoints.length - 1; index += 1) {
          const segment = solveScenarioPointRoute(graph, request, routePoints[index], routePoints[index + 1], closedWayIds)
          if (!segment) {
            errors.push(`${routeLabels[index]} → ${routeLabels[index + 1]} 无可行路网路线`)
            invalidRoute = true
            break
          }
          segmentPaths.push(segment)
        }
        if (invalidRoute || segmentPaths.length === 0) continue
        paths.push({
          ...segmentPaths[0],
          path: segmentPaths.flatMap((segment, index) => index === 0 ? segment.path : segment.path.slice(1)),
          endpointLabels: [request.fromLabel, request.toLabel],
          displayLabel: request.displayLabel,
          dispatchFacilityId: request.dispatchFacilityId,
        })
        continue
      }

      const event = resolveScenarioPoint(scenarioConfig.points, request.eventLabel)
      if (!event.ok) {
        errors.push(event.message)
        continue
      }
      if (event.point.kind !== 'event') {
        errors.push(`配置错误：道路层锚点「${request.eventLabel}」不是事件点位`)
        continue
      }

      const road = findScenarioRoad(graph, event.point.position)
      if (!road) {
        errors.push(`${request.eventLabel} 未匹配到可用 OSM 道路`)
        continue
      }

      const roadPath = clipPathToLength(road.path, event.point.position, 400)
      if (roadPath.length < 2) {
        errors.push(`${request.eventLabel} 所在 OSM 道路几何无效`)
        continue
      }

      roadNames.add(road.roadName)
      paths.push({
        path: roadPath,
        color: request.color,
        layer: 'traffic',
        width: request.width,
        kind: 'road-segment',
        roadState: request.state,
        endpointLabels: [
          `${road.roadName} · OSM way 起点`,
          `${road.roadName} · OSM way 终点`,
        ],
        roadName: road.roadName,
      })

      if (!request.detour) continue
      const baseArea = scenarioConfig.areas.find((area) => area.layer === 'base')
      const detour = solveScenarioDetour(
        graph,
        road,
        request,
        event.point.position,
        baseArea?.radius,
      )
      if (!detour) {
        errors.push(`${road.roadName} · 该路段无合理绕行`)
        continue
      }
      paths.push(detour.path)
      endpointPoints.push(...detour.endpointPoints)
    }
    for (const transfer of hospitalTransfers) {
      if (transfer.path.length < 2) continue
      paths.push({
        path: transfer.path,
        color: transfer.color,
        layer: 'routes',
        width: 4.5,
        kind: 'point-route',
        endpointLabels: ['18 层演练点', transfer.name],
        displayLabel: transfer.displayLabel,
        dispatchFacilityId: transfer.id,
      })
    }
    return { paths, pending: false, errors, roadNames: [...roadNames], endpointPoints }
  }, [scenarioConfig, scenarioVariant, roads, routineHospitalCandidates, routineHospitalTransfer, tianheRoads, tianheRoadsError])
  const scenarioPaths = useMemo(
    () => scenarioRouting.paths.filter((path) => layers[path.layer]),
    [scenarioRouting.paths, layers],
  )
  const activeScenarioRouteLabel = useMemo(() => {
    if (!executionFrame) return null
    const routeRole = executionFrame.units[0]?.routeRole
    if (scenarioVariant === 'traffic' && executionFrame.definitionId === 'traffic-zhongshan-reroute') {
      // 交通工作台用 secondary / medical 分别绑定冻结后的 B / C 路网几何。
      if (routeRole === 'secondary') return '路线 B · 原最短 8 分钟 · 已受阻'
      if (routeRole === 'medical') return '路线 C · 推荐改线 10 分钟'
    }
    if (scenarioVariant === 'medical' && executionFrame.definitionId === 'medical-panfu-transfer') {
      return DISPATCH_FACILITIES.find((facility) => facility.route.role === routeRole)?.route.displayLabel ?? null
    }
    if (scenarioVariant === 'routine' && executionFrame.definitionId === 'legacy-hospital-route-preview' && routineHospitalTransfer) {
      return routineHospitalTransfer.displayLabel
    }
    return null
  }, [executionFrame, routineHospitalTransfer, scenarioVariant])
  const activeScenarioPulsePath = useMemo(
    () => activeScenarioRouteLabel
      ? scenarioPaths.find((path) => path.layer === 'routes' && path.displayLabel === activeScenarioRouteLabel) ?? null
      : null,
    [activeScenarioRouteLabel, scenarioPaths],
  )
  const commandTrafficRoutes = useMemo<CommandTrafficRouteAnnotation[]>(() => {
    if (scenarioVariant !== 'traffic') return []
    const trafficRoutes = scenarioPaths.filter((path) => path.layer === 'routes' && path.path.length >= 2)
    return trafficRoutes.flatMap((route) => {
      const label = route.displayLabel ?? ''
      const routeId = label.match(/路线 ([ABC])/)?.[1]
      if (routeId !== 'A' && routeId !== 'B' && routeId !== 'C') return []
      const time = label.match(/(\d+) 分钟/)?.[1]
      if (!time) return []
      const status = routeId === 'A' ? '常规' : routeId === 'B' ? '最短 · 受阻' : '推荐改线'
      return [{
        routeId,
        title: label,
        time: `${time} 分钟`,
        status,
        color: `rgb(${route.color[0]} ${route.color[1]} ${route.color[2]})`,
        path: route.path,
        labelPosition: separatedRouteLabelPosition(
          route.path,
          trafficRoutes.filter((candidate) => candidate !== route).map((candidate) => candidate.path),
        ),
        active: label === activeScenarioRouteLabel,
      }]
    })
  }, [activeScenarioRouteLabel, scenarioPaths, scenarioVariant])

  /**
   * 全图路线的激光脉冲数据源，见 PulseRouteDatum 的说明。
   *
   * 三个来源合到一处，脉冲语言在主线场景和四个场景变体上是同一套：
   * 场景变体的路线、荔湾主线的 A/B 两条方案、120 到场路线。
   *
   * 相位按黄金比错开而不是均分：均分时如果恰好有两条线长度相近，
   * 它们的光会长期保持固定间距，看上去像在同步；黄金比给的是不整除的间隔。
   */
  const pulseRoutes = useMemo<PulseRouteDatum[]>(() => {
    if (!layers.routes) return []
    const routes: Array<{ id: string; label: string; path: Plan['path']; color: [number, number, number]; width: number }> = []

    if (scenarioConfig) {
      scenarioPaths.forEach((path, index) => {
        if (path.layer !== 'routes' || path.path.length < 2) return
        if (activeScenarioRouteLabel && path.displayLabel !== activeScenarioRouteLabel) return
        routes.push({
          id: `scenario-${index}`,
          label: path.displayLabel ?? path.endpointLabels[0],
          path: path.path,
          color: [path.color[0], path.color[1], path.color[2]],
          width: path.width,
        })
      })
    } else if (!cityOverviewMode) {
      const [planA, planB] = plans
      if (planA?.path.length >= 2 && (!pulseActivePlanOnly || planA.id === activePlan?.id)) {
        routes.push({ id: 'plan-a', label: 'CityOS 路线 · 优先通行假设', path: planA.path, color: [91, 91, 214], width: 5 })
      }
      if (planB?.path.length >= 2 && (!pulseActivePlanOnly || planB.id === activePlan?.id)) {
        routes.push({ id: 'plan-b', label: '常规对照 · 普通通行假设', path: planB.path, color: [105, 115, 134], width: 5 })
      }
      // 120 到场路线只在主线场景补。场景变体自己配了医疗路线（同样是青色），
      // 两边都加会在图上出现两条同色的医疗线——正是这轮要消掉的那种重叠。
      if (medicalRoute && medicalRoute.path.length >= 2) {
        routes.push({ id: 'medical', label: '120 到场路线', path: medicalRoute.path, color: [14, 154, 167], width: 3.5 })
      }
    }

    // 共线时排成平行细线：0 / +4 / -4 / +8 / -8 米，从中线向两侧长。
    // 只有一条线时不偏——没有要分开的东西就别动它的走向。
    const offsets = [0, 4, -4, 8, -8]
    return routes.map((route, index) => {
      const laid = routes.length > 1 ? offsetPath(route.path, offsets[index % offsets.length]) : route.path
      const timestamps = pathTimestamps(laid)
      return {
        ...route,
        path: laid,
        timestamps,
        nodes: turnNodes(laid, timestamps),
        trips: pulseTrips(laid, timestamps),
        phase: (index * 0.618033) % 1,
      }
    })
  }, [layers.routes, scenarioConfig, scenarioPaths, cityOverviewMode, plans, medicalRoute, pulseActivePlanOnly, activePlan, activeScenarioRouteLabel])

  const pulseEnabled = taskRoutesVisible && routePulseAllowed && pulseRoutes.length > 0 && !reducedMotion && !routeStale
  // 任务包下发前不泄露行动路线；下发后由脉冲图层负责，关闭动效时回退为静态线。
  const staticScenarioPaths = useMemo(() => {
    if (!taskRoutesVisible) return scenarioPaths.filter((path) => path.layer !== 'routes')
    if (!pulseEnabled) return scenarioPaths
    if (!activeScenarioPulsePath) return scenarioPaths.filter((path) => path.layer !== 'routes')
    return scenarioPaths.filter((path) => path !== activeScenarioPulsePath)
  }, [activeScenarioPulsePath, pulseEnabled, scenarioPaths, taskRoutesVisible])
  const staticScenarioRouteArrows = useMemo<ScenarioRouteArrowDatum[]>(() => {
    if (scenarioVariant !== 'traffic' && scenarioVariant !== 'medical' && scenarioVariant !== 'routine') return []
    return staticScenarioPaths
      .filter((path) => path.layer === 'routes' && path.path.length >= 2)
      .flatMap((path, pathIndex) => [0.38, 0.66].map((progress, arrowIndex) => {
        const before = pointAlongPath(path.path, Math.max(0, progress - 0.018))
        const after = pointAlongPath(path.path, Math.min(1, progress + 0.018))
        return {
          id: `static-route-arrow-${pathIndex}-${arrowIndex}`,
          position: pointAlongPath(path.path, progress),
          angle: routeArrowAngle(before, after),
          color: [
            path.color[0],
            path.color[1],
            path.color[2],
            activeScenarioPulsePath && path !== activeScenarioPulsePath ? 80 : 205,
          ],
        }
      }))
  }, [activeScenarioPulsePath, scenarioVariant, staticScenarioPaths])
  const executionRoutePaths = useMemo<Record<ExecutionRouteRole, Array<[number, number]>>>(() => {
    // 执行几何不能跟图层开关联动：隐藏车辆路线后，道路 cue 仍要能从原始求路结果取到位置。
    const scenarioRoutes = scenarioRouting.paths.filter((path) => path.layer === 'routes')
    if (scenarioVariant === 'medical') {
      const pathForRole = (role: ExecutionRouteRole) => {
        const facility = DISPATCH_FACILITIES.find((candidate) => candidate.route.role === role)
        return scenarioRoutes.find((path) => path.dispatchFacilityId === facility?.id)?.path ?? []
      }
      return {
        primary: pathForRole('primary'),
        secondary: pathForRole('secondary'),
        medical: pathForRole('medical'),
      }
    }
    const transferPath = routineHospitalTransfer && routineHospitalTransfer.path.length >= 2
      ? routineHospitalTransfer.path
      : undefined
    const responseRoutes = transferPath
      ? scenarioRoutes.filter((path) => path.path !== transferPath)
      : scenarioRoutes
    const alternatePlan = plans.find((plan) => plan.id !== activePlan?.id)
    const primary = responseRoutes[0]?.path ?? activePlan?.path ?? []
    const secondary = responseRoutes[1]?.path ?? (transferPath ? primary : alternatePlan?.path ?? primary)
    const medical = transferPath ?? medicalRoute?.path ?? responseRoutes[2]?.path ?? secondary
    return { primary, secondary, medical }
  }, [activePlan, medicalRoute, plans, routineHospitalTransfer, scenarioRouting.paths, scenarioVariant])
  const executionUnits = useMemo<ExecutionUnitDatum[]>(() => {
    if (!executionFrame) return []
    const roleCounts: Partial<Record<ExecutionRouteRole, number>> = {}
    return executionFrame.units.flatMap((unit) => {
      const path = executionRoutePaths[unit.routeRole]
      if (path.length < 2) return []
      const roleIndex = roleCounts[unit.routeRole] ?? 0
      roleCounts[unit.routeRole] = roleIndex + 1
      const separation = unit.status === 'enroute' ? roleIndex * 0.018 : roleIndex * 0.008
      return [{
        id: unit.id,
        label: unit.label,
        kind: unit.kind,
        status: unit.status,
        position: pointAlongPath(path, Math.max(0, unit.progress - separation)),
      }]
    })
  }, [executionFrame, executionRoutePaths])
  const commandTrafficUnit = useMemo<CommandTrafficUnitMarkerDatum | null>(() => {
    if (scenarioVariant !== 'traffic' || !commandMapInteraction.traffic) return null
    const unit = executionUnits.find((candidate) => candidate.kind === 'traffic')
    return unit ? {
      id: unit.id,
      label: unit.label,
      position: unit.position,
      status: unit.status,
    } : null
  }, [commandMapInteraction.traffic, executionUnits, scenarioVariant])
  const commandMedicalTargetRoutes = useMemo<CommandMedicalRouteTarget[]>(() => {
    if ((scenarioVariant !== 'medical' && scenarioVariant !== 'routine') || !commandMapInteraction.medical) return []
    return commandMapInteraction.medical.targetFacilityIds.flatMap((facilityId) => {
      const path = scenarioPaths.find((candidate) => (
        candidate.layer === 'routes'
        && candidate.dispatchFacilityId === facilityId
        && candidate.path.length >= 2
      ))?.path
      return path ? [{ facilityId, path }] : []
    })
  }, [commandMapInteraction.medical, scenarioPaths, scenarioVariant])
  const commandMedicalUnit = useMemo<CommandMedicalUnitMarkerDatum | null>(() => {
    if ((scenarioVariant !== 'medical' && scenarioVariant !== 'routine') || !commandMapInteraction.medical) return null
    const unit = executionUnits.find((candidate) => candidate.kind === 'medical')
    return unit ? {
      id: unit.id,
      label: unit.label,
      position: unit.position,
      status: unit.status,
    } : null
  }, [commandMapInteraction.medical, executionUnits, scenarioVariant])
  const deckExecutionUnits = useMemo(
    () => executionUnits.filter((unit) => (
      !(commandTrafficUnit && unit.kind === 'traffic')
      && !(commandMedicalUnit && unit.kind === 'medical')
    )),
    [commandMedicalUnit, commandTrafficUnit, executionUnits],
  )
  const executionIntersections = useMemo<ExecutionIntersectionDatum[]>(() => {
    if (!executionFrame) return []
    return executionFrame.intersections.flatMap((intersection) => {
      const path = executionRoutePaths[intersection.routeRole]
      if (path.length < 2) return []
      return [{
        id: intersection.id,
        label: intersection.label,
        status: intersection.status,
        position: pointAlongPath(path, intersection.progress),
      }]
    })
  }, [executionFrame, executionRoutePaths])
  const executionRoadCues = useMemo<ExecutionRoadCueDatum[]>(() => {
    if (!executionFrame) return []
    return executionFrame.roadCues.flatMap((cue) => {
      const path = executionRoutePaths[cue.routeRole]
      const cuePath = pathBetweenProgress(path, cue.fromProgress ?? 0, cue.toProgress ?? 1)
      return cuePath.length >= 2 ? [{ ...cue, path: cuePath }] : []
    })
  }, [executionFrame, executionRoutePaths])
  const blockedRoadMarkers = useMemo<BlockedRoadMarkerDatum[]>(() => {
    const blockedPaths = [
      ...scenarioPaths
        .filter((path) => path.layer === 'traffic' && path.roadState === 'blocked')
        .map((path, index) => ({ id: `scenario-${index}`, path: path.path })),
      ...trafficSegments
        .filter((segment) => segment.state === 'blocked')
        .map((segment, index) => ({ id: `traffic-${index}`, path: segment.path })),
      ...(layers.traffic
        ? executionRoadCues
            .filter((cue) => cue.state === 'closed')
            .map((cue) => ({ id: `execution-${cue.id}`, path: cue.path }))
        : []),
      ...closedRoads.map((road) => ({ id: `closed-${road.id}`, path: road.path })),
    ]
    return blockedPaths
      .filter((road) => road.path.length >= 2)
      .flatMap((road) => {
        const lengthMeters = road.path.slice(1).reduce(
          (total, coordinate, index) => total + meters(road.path[index], coordinate),
          0,
        )
        const progresses = lengthMeters >= 160 ? [0.32, 0.68] : [0.5]
        return progresses.map((progress, index) => ({
          id: `${road.id}-${index}`,
          position: pointAlongPath(road.path, progress),
        }))
      })
  }, [closedRoads, executionRoadCues, layers.traffic, scenarioPaths, trafficSegments])
  const roadStatusDiagnostics = useMemo(() => [
    ...scenarioPaths
      .filter((path) => path.layer === 'traffic')
      .map((path) => ({
        source: 'scenario',
        state: path.roadState ?? 'attention',
        color: path.color.slice(0, 3),
        width: path.roadState === 'blocked' ? BLOCKED_ROAD_WIDTH_PX : ROAD_STATUS_WIDTH_PX,
      })),
    ...trafficSegments.slice(0, 1).map((segment) => ({
      source: 'traffic',
      state: segment.state,
      color: segment.color.slice(0, 3),
      width: ROAD_STATUS_WIDTH_PX,
    })),
    ...(layers.traffic
      ? executionRoadCues.map((cue) => ({
          source: 'execution',
          state: cue.state === 'closed' ? 'blocked' : cue.state === 'slow' ? 'attention' : 'detour',
          color: executionRoadCueColor(cue.state).slice(0, 3),
          width: cue.state === 'closed' ? BLOCKED_ROAD_WIDTH_PX : ROAD_STATUS_WIDTH_PX,
        }))
      : []),
    ...closedRoads.map(() => ({
      source: 'closure',
      state: 'blocked',
      color: [229, 72, 77],
      width: BLOCKED_ROAD_WIDTH_PX,
    })),
  ], [closedRoads, executionRoadCues, layers.traffic, scenarioPaths, trafficSegments])
  const executionOnsiteNodes = useMemo<ExecutionOnsiteDatum[]>(() => {
    if (!executionFrame) return []
    return executionFrame.onsiteNodes.flatMap((node, index) => {
      const path = executionRoutePaths[node.routeRole]
      if (path.length < 2) return []
      return [{
        id: node.id,
        label: node.label,
        kind: node.kind,
        position: pointAlongPath(path, Math.max(0, node.progress - index * 0.012)),
      }]
    })
  }, [executionFrame, executionRoutePaths])
  const executionTrafficTrips = useMemo<RouteTripDatum[]>(() => {
    if (!executionFrame || !layers.traffic) return []
    const uniquePaths = [
      executionRoutePaths.primary,
      executionRoutePaths.secondary,
      executionRoutePaths.medical,
    ].filter((path, index, paths) => path.length >= 2 && paths.indexOf(path) === index)
    return uniquePaths.flatMap((path) => [-30, -15, 0, 15, 30].map((offset) => ({
      path,
      timestamps: path.map((_, index) => offset + (index / Math.max(1, path.length - 1)) * 42),
    })))
  }, [executionFrame, executionRoutePaths, layers.traffic])
  const scenarioPoints = useMemo<ScenarioMapPoint[]>(() => {
    if (!scenarioConfig) return []
    const routineTransfers = scenarioVariant === 'routine'
      ? [routineHospitalTransfer, ...routineHospitalCandidates]
          .filter((transfer): transfer is RoutineHospitalTransfer => Boolean(transfer))
          .filter((transfer, index, transfers) => transfers.findIndex((candidate) => candidate.id === transfer.id) === index)
      : []
    const receivingHospitalPoints: ScenarioMapPoint[] = routineTransfers.map((transfer) => ({
          position: transfer.position,
          label: transfer.name,
          kind: 'resource',
          color: [transfer.color[0], transfer.color[1], transfer.color[2]],
          poi: 'hospital',
          dispatchFacilityId: transfer.id,
          labelOffset: [12, -14],
        }))
    const scenarioBasePoints = routineTransfers.length > 0
      ? scenarioConfig.points.filter((point) => point.label !== '医疗参考')
      : scenarioConfig.points
    return [...scenarioBasePoints, ...scenarioRouting.endpointPoints, ...receivingHospitalPoints]
      .filter((point) => !point.hidden && (point.kind !== 'camera' || layers.cameras))
  }, [scenarioConfig, scenarioRouting.endpointPoints, layers.cameras, routineHospitalCandidates, routineHospitalTransfer, scenarioVariant])
  // 场景点位 → POI 徽标。resource 必须在场景配置里显式标了 poi 才画得出来；
  // 没标的宁可不画，也不要退回成一个看不出是什么的通用圆点。
  const scenarioPoiMarkers = useMemo<PoiMarkerDatum[]>(
    () => scenarioPoints.flatMap((point, index) => {
      if (commandMapInteraction.traffic && point.label === '清障车 02 当前位置（模拟）') return []
      const kind = point.poi ?? POI_KIND_BY_SCENARIO_KIND[point.kind]
      if (!kind) return []
      const facility = getDispatchFacility(point.dispatchFacilityId)
      const candidateFacilityId = facility && isDispatchSelectableFacilityId(facility.id)
        ? facility.id
        : null
      const medicalSelect = candidateFacilityId && commandMapInteraction.medical?.enabled
        ? () => commandMapInteraction.medical?.onDrop({
            facilityId: candidateFacilityId,
            routeProgress: facility?.route.defaultProgress ?? 0.3,
          })
        : undefined
      return [{
        id: `scenario-${index}-${point.label}`,
        position: point.position,
        kind,
        label: point.label,
        meta: facility ? `${facility.receivingState} · ${dispatchFacilityEtaLabel(facility)}` : undefined,
        confidence: facility?.id === 'facility-medical-reference'
          ? 'unverified'
          : POI_CONFIDENCE_BY_SCENARIO_KIND[point.kind] ?? 'confirmed',
        alarm: point.kind === 'event',
        role: facility ? 'facility' : undefined,
        planningState: facility ? dispatchFacilityPlanningState(facility) : undefined,
        selected: facility ? commandMapInteraction.medical?.selectedFacilityId === facility.id : false,
        onSelect: facility
          ? medicalSelect
          : onScenarioPointSelect ? () => onScenarioPointSelect(point) : undefined,
      }]
    }),
    [commandMapInteraction.medical, commandMapInteraction.traffic, onScenarioPointSelect, scenarioPoints],
  )

  // 荔湾主链路（非场景态）的 POI。这里的消防站与医院来自公开 OSM POI，标为已确认；
  // 视频点位是演示位置，必须落在「待核实」那一档，用虚线描边区分，不能只靠颜色。
  const basePoiMarkers = useMemo<PoiMarkerDatum[]>(() => {
    if (scenarioConfig || cityOverviewMode) return []
    const markers: PoiMarkerDatum[] = [
      { id: 'route-origin', position: GUANGDA.location, kind: 'fire_station', label: GUANGDA.name, role: 'facility' },
      { id: 'route-destination', position: site.center, kind: 'fire', label: '火情现场', alarm: true },
    ]

    resourcePoints.forEach((point) => {
      markers.push({
        id: point.id,
        position: point.position,
        kind: point.kind === 'hospital' ? 'hospital' : 'fire_station',
        label: point.name,
        role: 'facility',
        selected: selectedResourcePoiId === point.id,
        detail: {
          title: point.name,
          type: point.kind === 'hospital' ? '医疗机构（公开静态 POI）' : '消防救援站（公开静态 POI）',
          address: '公开快照未提供结构化地址',
          sourceLabel: '© OpenStreetMap contributors · ODbL',
          sourceUrl: 'https://www.openstreetmap.org/copyright',
          capturedAt: '2026-08-14',
          simulationNote: '设施名称与坐标为公开静态 POI；实时可用状态、车辆、能力与 ETA 未接入',
        },
        onSelect: () => {
          onStaticResourceSelect?.()
          setSelectedResourcePoiId((current) => current === point.id ? null : point.id)
        },
        onClose: () => setSelectedResourcePoiId(null),
      })
    })

    cameraPoints.forEach((point, index) => {
      markers.push({
        id: `camera-${index}`,
        position: point.position,
        kind: 'camera',
        label: '上游点位',
        confidence: 'unverified',
      })
    })

    if (layers.routes) {
      strategyIntersections.forEach((point, index) => {
        markers.push({
          id: `signal-${index}`,
          position: point.position,
          kind: 'traffic_signal',
          label: point.name,
          role: 'facility',
        })
      })
    }

    closedRoads.forEach((road) => {
      const middle = road.path[Math.floor(road.path.length / 2)]
      if (!middle) return
      markers.push({
        id: `closure-${road.id}`,
        position: middle,
        kind: 'road_closure',
        label: '道路封闭',
      })
    })

    return markers
  }, [scenarioConfig, cityOverviewMode, site.center, resourcePoints, cameraPoints, strategyIntersections, closedRoads, layers.routes, selectedResourcePoiId, onStaticResourceSelect])

  // 城市尺度的底噪：公开 OSM 里的消防站、医院、派出所。紧凑态无标签，
  // 让五个告警点仍然是视觉重点，这些只负责把城市填满。
  const cityFacilityMarkers = useMemo<PoiMarkerDatum[]>(() => {
    // 资源调度由事件主动收敛点位；公开 POI 底噪只服务态势总览，不能盖住当前/候选/受影响三类规划态。
    if (!cityOverviewMode || dispatchUnitMarkers || !resourceData) return []
    return resourceData.features.flatMap((feature, index) => {
      if (feature.geometry.type !== 'Point') return []
      const kind = feature.properties?.kind
      const poi: PoiKind | null = kind === 'hospital'
        ? 'hospital'
        : kind === 'fire_station'
          ? 'fire_station'
          : kind === 'police'
            ? 'police'
            : null
      if (!poi) return []
      const position = feature.geometry.coordinates as [number, number]
      const rawName = feature.properties?.name
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : POI_SPECS[poi].category
      const id = `facility-${index}`
      const named = name !== '医院' && name !== '消防站' && name !== '派出所'
      return [{
        id,
        position,
        kind: poi,
        label: name,
        compact: selectedResourcePoiId !== id,
        role: 'facility',
        selected: selectedResourcePoiId === id,
        detail: named ? {
          title: name,
          type: `${POI_SPECS[poi].category}（公开静态 POI）`,
          address: '公开快照未提供结构化地址',
          sourceLabel: '© OpenStreetMap contributors · ODbL',
          sourceUrl: 'https://www.openstreetmap.org/copyright',
          capturedAt: '2026-08-14',
          simulationNote: '名称与坐标为公开静态 POI；实时可用状态、车辆、能力与 ETA 未接入',
        } : undefined,
        onSelect: named ? () => {
          onStaticResourceSelect?.()
          setSelectedResourcePoiId((current) => current === id ? null : id)
        } : undefined,
        onClose: named ? () => setSelectedResourcePoiId(null) : undefined,
      }]
    })
  }, [cityOverviewMode, dispatchUnitMarkers, resourceData, selectedResourcePoiId, onStaticResourceSelect])

  const poiMarkers = useMemo(
    () => [...scenarioPoiMarkers, ...basePoiMarkers, ...cityFacilityMarkers, ...(cityAlertMarkers ?? []), ...(dispatchUnitMarkers ?? [])],
    [scenarioPoiMarkers, basePoiMarkers, cityFacilityMarkers, cityAlertMarkers, dispatchUnitMarkers],
  )

  const scenarioOutOfBoundsPathCount = useMemo(() => {
    const baseArea = scenarioConfig?.areas.find((area) => area.layer === 'base')
    if (!baseArea) return 0
    return scenarioRouting.paths.filter((path) =>
      path.path.some((coordinate) => meters(baseArea.position, coordinate) > baseArea.radius),
    ).length
  }, [scenarioConfig, scenarioRouting.paths])
  const scenarioPathDiagnostics = useMemo(() => {
    const baseArea = scenarioConfig?.areas.find((area) => area.layer === 'base')
    if (!baseArea) return []
    return scenarioRouting.paths.map((path) => ({
      endpoints: path.endpointLabels,
      maxMetersFromCenter: Math.round(Math.max(
        ...path.path.map((coordinate) => meters(baseArea.position, coordinate)),
      )),
      radiusMeters: baseArea.radius,
    }))
  }, [scenarioConfig, scenarioRouting.paths])
  const scenarioOrphanResourceLabels = useMemo(() => {
    if (!scenarioConfig) return []
    const connectedLabels = new Set(
      scenarioConfig.routes.flatMap((request) =>
        request.layer === 'routes' ? [request.fromLabel, request.toLabel] : [],
      ),
    )
    return scenarioConfig.points
      .filter((point) => point.kind === 'resource' && !connectedLabels.has(point.label))
      .map((point) => point.label)
  }, [scenarioConfig])

  // 动画进度只存在 ref 里。原来它是 App 的 state，每帧 setState 一次，
  // 整棵树跟着重渲染，实测单帧提交 114–125 ms。
  const progressRef = useRef(0)
  const pulseRef = useRef(0)
  const drawRef = useRef<() => void>(() => undefined)

  const draw = useCallback(() => {
    const current = overlay.current
    if (!current) return
    const scenarioAnimatedPath = scenarioConfig
      ? scenarioPaths.find((path) => path.layer === 'routes')
      : null
    // 总览态同样不跑路线流光——见上面 cityOverviewMode 的说明。
    const animatedPath = cityOverviewMode ? undefined : scenarioAnimatedPath?.path ?? activePlan?.path
    const animatedColor: [number, number, number] = historyTrack === 'baseline'
      ? [105, 115, 134]
      : historyTrack === 'cityos'
        ? [91, 91, 214]
      : scenarioAnimatedPath
        ? [scenarioAnimatedPath.color[0], scenarioAnimatedPath.color[1], scenarioAnimatedPath.color[2]]
      : activePlan?.privileged
        ? [48, 164, 108]
        : [91, 91, 214]

    // 每帧从 pulseRef 派生：光点位置、粒子拖尾、经过转折点触发的雷达波纹。
    // 都是纯计算，路线条数是个位数、节点已预先筛过，不进 state，不触发重渲染。
    const pulseHeads: PulseHeadDatum[] = []
    const pulseRipples: PulseRippleDatum[] = []
    if (pulseEnabled) {
      for (const route of pulseRoutes) {
        for (let pulseIndex = 0; pulseIndex < PULSE_COUNT; pulseIndex += 1) {
          const head = ((pulseRef.current + route.phase + pulseIndex / PULSE_COUNT) % 1) * (100 + PULSE_TRAIL)
          // 光点本体 + 粒子拖尾：越靠后越小越淡
          for (let step = 0; step < PULSE_PARTICLES; step += 1) {
            const t = head - step * (PULSE_TRAIL / PULSE_PARTICLES) * 0.9
            if (t < 0 || t > 100) continue
            const intensity = 1 - step / PULSE_PARTICLES
            pulseHeads.push({
              id: `${route.id}-${pulseIndex}-${step}`,
              position: pointAtTimestamp(route.path, route.timestamps, t),
              color: step === 0 ? lightenColor(route.color, 0.55) : route.color,
              intensity,
              radius: step === 0 ? 4.2 : 2.6 * intensity,
            })
          }
          // 节点雷达波纹：每一道光刚经过的那个转折点扩一圈
          for (const node of route.nodes) {
            const elapsed = head - node.t
            if (elapsed < 0 || elapsed > RIPPLE_SPAN) continue
            pulseRipples.push({
              id: `${route.id}-${pulseIndex}-${node.t}`,
              position: node.position,
              color: route.color,
              age: elapsed / RIPPLE_SPAN,
            })
          }
        }
      }
    }

    current.setProps({
      layers: [
        roadNetworkContext.length > 0 &&
          new PathLayer<RoadContextDatum>({
            id: 'local-road-network-context',
            data: roadNetworkContext,
            getPath: (road) => road.path,
            getColor: [184, 191, 202, 125],
            getWidth: 1.25,
            widthUnits: 'pixels',
            jointRounded: true,
            capRounded: true,
            pickable: false,
          }),
        scenarioAreas.length > 0 &&
          new ScatterplotLayer<ScenarioMapArea>({
            id: 'scenario-areas-simulated',
            data: scenarioAreas,
            getPosition: (area) => area.position,
            getRadius: (area) => area.radius,
            radiusUnits: 'meters',
            getFillColor: (area) => [...area.color, 8],
            getLineColor: (area) => [...area.color, 150],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            pickable: false,
          }),
        // 路线还原为单线。8/20 评审：加了 casing + 密集白色 ➤ 箭头之后线变得很脏——
        // 箭头是 TextLayer 画的字符，缩放时既不跟线宽走也压不住笔画，堆在一起像噪点。
        // 真正的高德语言不在线本身，在 POI 图标，那条另做。
        // 开了脉冲时，车辆路线整条交给脉冲那一组图层画（含平行偏移），这里只留
        // 道路状态线——路面情况不是「谁在跑」，不参与脉冲，也不该被偏移。
        // 关掉脉冲（reduced-motion / 路线失效）时这里恢复画全部路线。
        staticScenarioPaths.length > 0 &&
          new PathLayer<ScenarioPathDatum, PathStyleExtensionProps<ScenarioPathDatum>>({
            id: 'scenario-paths-simulated',
            data: staticScenarioPaths,
            getPath: (path) => path.path,
            getColor: (path) => activeScenarioPulsePath && path.layer === 'routes'
              ? path === activeScenarioPulsePath
                ? [path.color[0], path.color[1], path.color[2], 245]
                : [path.color[0], path.color[1], path.color[2], 105]
              : path.color,
            getWidth: (path) => path.layer === 'traffic'
              ? path.roadState === 'blocked' ? BLOCKED_ROAD_WIDTH_PX : ROAD_STATUS_WIDTH_PX
              : activeScenarioPulsePath
                ? path === activeScenarioPulsePath ? Math.max(5.2, path.width * 1.15) : Math.max(1.5, path.width * 0.4)
                : path.width,
            widthUnits: 'pixels',
            getDashArray: (path) => path.roadState === 'blocked' ? [1.4, 1] : [1, 0],
            dashJustified: false,
            jointRounded: true,
            capRounded: true,
            pickable: false,
            extensions: [DASHED_PATH_STYLE],
          }),
        staticScenarioRouteArrows.length > 0 &&
          new TextLayer<ScenarioRouteArrowDatum>({
            id: 'scenario-static-route-arrows',
            data: staticScenarioRouteArrows,
            getPosition: (arrow) => arrow.position,
            getText: () => '➤',
            getAngle: (arrow) => arrow.angle,
            getColor: (arrow) => arrow.color,
            getSize: 11,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
            fontWeight: 800,
            characterSet: ['➤'],
            pickable: false,
          }),
        // 场景点位不再用散点+文字标签画。8/20 评审要的「高德元素」就是这一层：
        // 医院、消防站、封路、红绿灯、摄像头要有形象化小标识，光靠彩色圆点分不出
        // 谁是谁。改由 MapPoiMarkers 用 DOM 徽标渲染，见下方 JSX。
        trafficSegments.length > 0 &&
          new PathLayer<TrafficSegmentDatum, PathStyleExtensionProps<TrafficSegmentDatum>>({
            id: 'traffic-status-simulated',
            data: trafficSegments,
            getPath: (segment) => segment.path,
            getColor: (segment) => segment.color,
            getWidth: (segment) => segment.state === 'blocked' ? BLOCKED_ROAD_WIDTH_PX : ROAD_STATUS_WIDTH_PX,
            widthUnits: 'pixels',
            getDashArray: (segment) => segment.state === 'blocked' ? [1.4, 1] : [1, 0],
            dashJustified: false,
            jointRounded: true,
            capRounded: true,
            pickable: false,
            extensions: [DASHED_PATH_STYLE],
          }),
        // 常规方案比较在静态回退时保留 A/B 编码；历史批准方案模式只能回退成
        // 一条已批准路线，避免 reduced-motion 或路线陈旧时重新冒出三色叠线。
        layers.routes && taskRoutesVisible && !pulseEnabled && new PathLayer<RouteSegmentDatum>({
          id: 'route-exclusive',
          data: pulseActivePlanOnly ? activePlanSegments : exclusiveSegments,
          getPath: (route) => route.path,
          getColor: (route) =>
            routeStale
              ? ([156, 163, 175, 150] as [number, number, number, number])
              : route.active
                ? ([...route.color, 235] as [number, number, number, number])
                : ([...route.color, 105] as [number, number, number, number]),
          getWidth: (route) => (route.active ? 5 : 3),
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: false,
        }),
        layers.routes && taskRoutesVisible && !pulseEnabled && !pulseActivePlanOnly && new PathLayer<RouteSegmentDatum>({
          id: 'route-shared-casing',
          data: sharedSegments,
          getPath: (route) => route.path,
          getColor: routeStale ? [156, 163, 175, 150] : [48, 164, 108, 235],
          getWidth: 7,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: false,
        }),
        layers.routes && taskRoutesVisible && !pulseEnabled && !pulseActivePlanOnly && new PathLayer<RouteSegmentDatum>({
          id: 'route-shared-core',
          data: sharedSegments,
          getPath: (route) => route.path,
          getColor: routeStale ? [255, 255, 255, 120] : [91, 91, 214, 235],
          getWidth: 3,
          widthUnits: 'pixels',
          jointRounded: true,
          capRounded: true,
          pickable: false,
        }),
        // ── 激光脉冲 ────────────────────────────────────────────────────
        // 五层叠出来：半透明发光底线 → 拖尾辉光 → 拖尾芯线 → 粒子 → 光点。
        // 单独一层纯色做不出激光感——激光看着亮，是因为芯是过曝的近白，颜色在外圈。
        // 每条线自己的相位（见 pulseRoutes），共线路段两道光是先后经过不是叠在一起。
        ...(pulseEnabled
          ? pulseRoutes.flatMap((route) => {
            const currentTime = ((pulseRef.current + route.phase) % 1) * (100 + PULSE_TRAIL)
            return [
              // 半透明发光线：整条路线始终可见，交代走向
              new PathLayer<PulseRouteDatum>({
                id: `route-pulse-base-${route.id}`,
                data: [route],
                getPath: (item) => item.path,
                getColor: [...route.color, 70] as [number, number, number, number],
                getWidth: Math.max(2.4, route.width * 0.62),
                widthUnits: 'pixels',
                jointRounded: true,
                capRounded: true,
                pickable: false,
              }),
              // 拖尾辉光
              new TripsLayer<RouteTripDatum>({
                id: `route-pulse-glow-${route.id}`,
                data: route.trips,
                getPath: (item) => item.path,
                getTimestamps: (item) => item.timestamps,
                getColor: route.color,
                widthMinPixels: 6,
                widthMaxPixels: 9,
                opacity: 0.42,
                trailLength: PULSE_TRAIL,
                currentTime,
                fadeTrail: true,
                jointRounded: true,
                capRounded: true,
              }),
              // 拖尾芯线
              new TripsLayer<RouteTripDatum>({
                id: `route-pulse-core-${route.id}`,
                data: route.trips,
                getPath: (item) => item.path,
                getTimestamps: (item) => item.timestamps,
                getColor: lightenColor(route.color, 0.6),
                widthMinPixels: 1.8,
                widthMaxPixels: 2.6,
                opacity: 0.95,
                trailLength: PULSE_TRAIL * 0.5,
                currentTime,
                fadeTrail: true,
                jointRounded: true,
                capRounded: true,
              }),
            ]
          })
          : []),
        // 转折节点的雷达波纹：只描边不填充，扩散中变淡
        pulseRipples.length > 0 && new ScatterplotLayer<PulseRippleDatum>({
          id: 'route-pulse-ripples',
          data: pulseRipples,
          getPosition: (ripple) => ripple.position,
          getRadius: (ripple) => 3 + ripple.age * 15,
          radiusUnits: 'pixels',
          filled: false,
          stroked: true,
          getLineColor: (ripple) => [...ripple.color, Math.round((1 - ripple.age) * 165)] as [number, number, number, number],
          lineWidthMinPixels: 1.2,
          pickable: false,
          updateTriggers: { getRadius: pulseRef.current, getLineColor: pulseRef.current },
        }),
        // 粒子拖尾 + 光点。光点是近白的过曝芯，颜色靠外圈的辉光交代。
        pulseHeads.length > 0 && new ScatterplotLayer<PulseHeadDatum>({
          id: 'route-pulse-heads',
          data: pulseHeads,
          getPosition: (head) => head.position,
          getRadius: (head) => head.radius,
          radiusUnits: 'pixels',
          getFillColor: (head) => [...head.color, Math.round(head.intensity * 235)] as [number, number, number, number],
          stroked: false,
          pickable: false,
          updateTriggers: { getPosition: pulseRef.current, getFillColor: pulseRef.current, getRadius: pulseRef.current },
        }),
        layers.traffic && executionRoadCues.length > 0 &&
          new PathLayer<ExecutionRoadCueDatum, PathStyleExtensionProps<ExecutionRoadCueDatum>>({
            id: 'execution-road-cues-simulated',
            data: executionRoadCues,
            getPath: (cue) => cue.path,
            getColor: (cue) => executionRoadCueColor(cue.state),
            getWidth: (cue) => cue.state === 'closed' ? BLOCKED_ROAD_WIDTH_PX : ROAD_STATUS_WIDTH_PX,
            widthUnits: 'pixels',
            getDashArray: (cue) => cue.state === 'closed' ? [1.4, 1] : [1, 0],
            dashJustified: false,
            jointRounded: true,
            capRounded: true,
            pickable: false,
            extensions: [DASHED_PATH_STYLE],
          }),
        layers.traffic && executionTrafficTrips.length > 0 && executionFrame &&
          new TripsLayer<RouteTripDatum>({
            id: 'execution-background-traffic-simulated',
            data: executionTrafficTrips,
            getPath: (trip) => trip.path,
            getTimestamps: (trip) => trip.timestamps,
            getColor: historyTrack === 'baseline'
              ? [105, 115, 134]
              : [48, 164, 108],
            widthMinPixels: 2,
            opacity: 0.58,
            trailLength: 5,
            currentTime: executionFrame.progress * 72,
            fadeTrail: true,
          }),
        // 新脉冲开启后不再叠旧的单路线 TripsLayer；否则进入方案环时，同一条
        // 路线会同时跑两套不同相位的拖尾，正好重新制造本轮要消除的重叠。
        layers.routes && taskRoutesVisible && routePulseAllowed && !pulseEnabled && !reducedMotion && !routeStale && animatedPath && animatedPath.length >= 2 &&
          new TripsLayer<RouteTripDatum>({
            id: 'route-motion',
            data: [
              {
                path: animatedPath,
                timestamps: animatedPath.map((_, index) => (index / Math.max(1, animatedPath.length - 1)) * 100),
              },
            ],
            getPath: (route) => route.path,
            getTimestamps: (route) => route.timestamps,
            getColor: routeStale
              ? ([156, 163, 175] as [number, number, number])
              : animatedColor,
            widthMinPixels: 3.5,
            opacity: routeStale ? 0.35 : 0.9,
            trailLength: 16,
            currentTime: progressRef.current * 116,
            fadeTrail: true,
          }),
        // 路口信号灯、上游视频点位、周边消防站与医院、消防起点与火情终点
        // 一律改用 POI 徽标，见下方 JSX。120 的实际出发医院以医疗十字单独表达，
        // 周边医院仍只在调度员主动打开“资源参考”后显示。
        medicalOrigins.length > 0 &&
          new ScatterplotLayer<MedicalOriginDatum>({
            id: 'medical-origin-marker',
            data: medicalOrigins,
            getPosition: (point) => point.position,
            getRadius: 10,
            radiusUnits: 'pixels',
            getFillColor: routeStale ? [156, 163, 175, 220] : [14, 154, 167, 245],
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            pickable: false,
          }),
        medicalOrigins.length > 0 &&
          new TextLayer<MedicalOriginDatum>({
            id: 'medical-origin-cross',
            data: medicalOrigins,
            getPosition: (point) => point.position,
            getText: () => '✚',
            getColor: [255, 255, 255, 255],
            getSize: 15,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
            fontWeight: 800,
            characterSet: 'auto',
            pickable: false,
          }),
        executionIntersections.length > 0 &&
          new ScatterplotLayer<ExecutionIntersectionDatum>({
            id: 'execution-intersections-simulated',
            data: executionIntersections,
            getPosition: (point) => point.position,
            getRadius: 8,
            radiusUnits: 'pixels',
            getFillColor: (point) => executionIntersectionColor(point.status),
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            pickable: false,
          }),
        executionIntersections.length > 0 &&
          new TextLayer<ExecutionIntersectionDatum>({
            id: 'execution-intersection-labels-simulated',
            data: executionIntersections,
            getPosition: (point) => point.position,
            getText: (point) => point.status === 'open' ? '通' : '路',
            getColor: [255, 255, 255, 255],
            getSize: 9,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
            fontWeight: 800,
            characterSet: 'auto',
            pickable: false,
          }),
        executionOnsiteNodes.length > 0 &&
          new ScatterplotLayer<ExecutionOnsiteDatum>({
            id: 'execution-onsite-nodes-simulated',
            data: executionOnsiteNodes,
            getPosition: (point) => point.position,
            getRadius: 9,
            radiusUnits: 'pixels',
            getFillColor: [255, 255, 255, 245],
            getLineColor: [91, 91, 214, 255],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            pickable: false,
          }),
        executionOnsiteNodes.length > 0 &&
          new TextLayer<ExecutionOnsiteDatum>({
            id: 'execution-onsite-labels-simulated',
            data: executionOnsiteNodes,
            getPosition: (point) => point.position,
            getText: (point) => point.kind === 'camera' ? '视' : point.kind === 'report' ? '报' : '组',
            getColor: [77, 77, 194, 255],
            getSize: 10,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
            fontWeight: 800,
            characterSet: 'auto',
            pickable: false,
          }),
        deckExecutionUnits.length > 0 &&
          new ScatterplotLayer<ExecutionUnitDatum>({
            id: 'execution-units-simulated',
            data: deckExecutionUnits,
            getPosition: (unit) => unit.position,
            getRadius: unit => unit.status === 'arrived' ? 13 : 11,
            radiusUnits: 'pixels',
            getFillColor: (unit) => executionUnitColor(unit.kind, unit.status),
            getLineColor: [255, 255, 255, 255],
            lineWidthMinPixels: 2,
            stroked: true,
            filled: true,
            pickable: false,
          }),
        deckExecutionUnits.length > 0 &&
          new TextLayer<ExecutionUnitDatum>({
            id: 'execution-unit-labels-simulated',
            data: deckExecutionUnits,
            getPosition: (unit) => unit.position,
            getText: (unit) => unit.kind === 'fire' ? '消' : unit.kind === 'police' ? '警' : unit.kind === 'traffic' ? '障' : '医',
            getColor: [255, 255, 255, 255],
            getSize: 11,
            sizeUnits: 'pixels',
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
            fontWeight: 800,
            characterSet: 'auto',
            pickable: false,
          }),
        new PathLayer<ClosedRoadDatum, PathStyleExtensionProps<ClosedRoadDatum>>({
          id: 'closed-roads',
          data: closedRoads,
          getPath: (road) => road.path,
          getColor: [229, 72, 77, 255],
          getWidth: BLOCKED_ROAD_WIDTH_PX,
          widthUnits: 'pixels',
          getDashArray: [1.4, 1],
          dashJustified: false,
          jointRounded: true,
          capRounded: true,
          pickable: false,
          extensions: [DASHED_PATH_STYLE],
        }),
        blockedRoadMarkers.length > 0 && new ScatterplotLayer<BlockedRoadMarkerDatum>({
          id: 'blocked-road-markers',
          data: blockedRoadMarkers,
          getPosition: (marker) => marker.position,
          getRadius: 7,
          radiusUnits: 'pixels',
          getFillColor: [229, 72, 77, 245],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 1.5,
          stroked: true,
          filled: true,
          pickable: false,
        }),
        blockedRoadMarkers.length > 0 && new TextLayer<BlockedRoadMarkerDatum>({
          id: 'blocked-road-marker-labels',
          data: blockedRoadMarkers,
          getPosition: (marker) => marker.position,
          getText: () => '×',
          getColor: [255, 255, 255, 255],
          getSize: 11,
          sizeUnits: 'pixels',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          fontFamily: 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
          fontWeight: 800,
          characterSet: ['×'],
          pickable: false,
        }),
      ].filter(Boolean),
    })
  }, [activePlan, activePlanSegments, routeStale, exclusiveSegments, sharedSegments, closedRoads, blockedRoadMarkers, trafficSegments, historyTrack, layers.routes, layers.traffic, medicalOrigins, roadNetworkContext, scenarioConfig, scenarioAreas, scenarioPaths, activeScenarioPulsePath, staticScenarioPaths, staticScenarioRouteArrows, pulseRoutes, pulseEnabled, pulseActivePlanOnly, reducedMotion, cityOverviewMode, executionFrame, executionIntersections, executionOnsiteNodes, executionRoadCues, executionTrafficTrips, deckExecutionUnits, routePulseAllowed, taskRoutesVisible])

  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  useEffect(() => {
    if (ready) draw()
  }, [ready, draw])

  // 总览态把镜头拉到能同时看见所有告警点的城市尺度。默认的事发点尺度只看得到
  // 荔湾一处，天河、越秀的告警全在视野外——左栏列了五条、地图上一个点都没有，
  // 正是评审说的「边上已经有情况，地图上却没标」。
  const cityScaleMarkers = useMemo(
    () => [...(cityAlertMarkers ?? []), ...(dispatchUnitMarkers ?? [])],
    [cityAlertMarkers, dispatchUnitMarkers],
  )
  const alertFingerprint = cityScaleMarkers.map((marker) => marker.id).join('|')
  useEffect(() => {
    const instance = map.current
    const markers = cityScaleMarkers
    if (!ready || !instance || markers.length < 2) return
    const bounds = markers.reduce(
      (accumulator, marker) => accumulator.extend(marker.position),
      new LngLatBounds(markers[0].position, markers[0].position),
    )
    // padding 收到 48：留白越小，五个告警点在画面里占比越大，城市在运行这件事才有分量。
    instance.fitBounds(bounds, { padding: 48, duration: 700, maxZoom: 14 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 指纹代替数组身份，避免每帧重设镜头
  }, [ready, alertFingerprint])

  const selectedResourcePosition = selectedResourcePoiId
    ? poiMarkers.find((marker) => marker.id === selectedResourcePoiId)?.position ?? null
    : null
  const effectiveCityFocusPosition = selectedResourcePosition ?? cityFocusPosition
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !cityOverviewMode) return
    instance.resize()
    instance.stop()
    if (effectiveCityFocusPosition) {
      instance.easeTo({
        center: effectiveCityFocusPosition,
        zoom: 15.1,
        pitch: 0,
        bearing: 0,
        duration: 420,
      })
      return
    }
    if (cityScaleMarkers.length < 2) return
    const bounds = cityScaleMarkers.reduce(
      (accumulator, marker) => accumulator.extend(marker.position),
      new LngLatBounds(cityScaleMarkers[0].position, cityScaleMarkers[0].position),
    )
    instance.fitBounds(bounds, { padding: 48, duration: 420, maxZoom: 14 })
  }, [ready, cityOverviewMode, effectiveCityFocusPosition, cityFocusRevision, selectedResourcePoiId, alertFingerprint, cityScaleMarkers])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !cityOverviewMode) return
    const closeResourceDetail = () => setSelectedResourcePoiId(null)
    instance.on('click', closeResourceDetail)
    return () => {
      instance.off('click', closeResourceDetail)
    }
  }, [ready, cityOverviewMode])

  // 路线动画。页面切到后台、用户开了减少动态效果、或者当前不在 Strategy 环，
  // 都不跑 rAF——空转的动画既费电又抢主线程。
  useEffect(() => {
    const playbackDriven = historyPlayhead !== null
    if (playbackDriven) progressRef.current = Math.max(0, Math.min(1, historyPlayhead / 100))

    // 方案流光只在 Strategy 环跑；激光脉冲只要路线在图上就一直跑——
    // 它表达的是「这条链路是活的」，不是某一步的动作。两者共用一个 rAF，
    // 不开两个循环各自 draw 一次。
    const routeFlow = ready && animate && layers.routes && taskRoutesVisible && routePulseAllowed && !playbackDriven && !reducedMotion && !pulseEnabled && !routeStale
    const laserPulse = ready && pulseEnabled
    if (!routeFlow && !playbackDriven) progressRef.current = 0
    if (!laserPulse) pulseRef.current = 0
    if (!ready) return
    if (!routeFlow && !laserPulse) {
      drawRef.current()
      return
    }

    let frame = 0
    let start = performance.now()
    const tick = (now: number) => {
      if (routeFlow) progressRef.current = ((now - start) / 6000) % 1
      if (laserPulse) pulseRef.current = ((now - start) / PULSE_CYCLE_MS) % 1
      drawRef.current()
      frame = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame)
        frame = 0
      } else if (!frame) {
        start = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) frame = requestAnimationFrame(tick)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      cancelAnimationFrame(frame)
    }
  }, [ready, animate, historyPlayhead, layers.routes, pulseEnabled, reducedMotion, routeStale, routePulseAllowed, taskRoutesVisible])

  // 执行舞台只在阶段变化时切一次镜头；逐帧车辆仍由同一 playhead 派生，
  // 不让镜头每 100 ms 追着车辆抖动。reduced-motion 下直接跳到阶段视角。
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !executionFrame) {
      executionCameraKey.current = null
      return
    }
    if (commandMapInteraction.medical) {
      executionCameraKey.current = null
      return
    }
    const key = `${executionFrame.definitionId}:${executionFrame.phase}`
    if (executionCameraKey.current === key) return
    executionCameraKey.current = key
    const primaryPath = executionRoutePaths.primary
    if (primaryPath.length < 2) return
    const leadUnit = executionUnits.find((unit) => unit.status === 'enroute')
    const target = executionFrame.phase === 'dispatch'
      ? primaryPath[0]
      : executionFrame.phase === 'routing'
        ? leadUnit?.position ?? pointAlongPath(primaryPath, executionFrame.progress)
        : primaryPath[primaryPath.length - 1]
    const baseZoom = scenarioConfig?.zoom ?? 14.9
    const zoom = executionFrame.phase === 'onsite'
      ? baseZoom + 0.45
      : executionFrame.phase === 'feedback'
        ? baseZoom + 0.25
        : baseZoom
    instance.easeTo({
      center: target,
      zoom,
      pitch: 0,
      bearing: 0,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 520,
    })
  }, [commandMapInteraction.medical, executionFrame, executionRoutePaths, executionUnits, ready, scenarioConfig])

  // routine 的楼体动画直接驱动 MapLibre。镜头方位与烟气 paint 值都只存在
  // 于地图实例/rAF 闭包中，不进入 React state，避免整张看板逐帧重渲染。
  useEffect(() => {
    const instance = map.current
    if (
      !ready ||
      scenarioVariant !== 'routine' ||
      !data ||
      !instance ||
      !instance.getLayer(ROUTINE_SMOKE_LAYER_ID)
    ) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let hiddenAt = 0
    let smokeCycleStartedAt = performance.now()
    let orbitStartsAt = smokeCycleStartedAt + ROUTINE_CAMERA.duration
    let orbitDirection = 1

    const stopOrbitOnUserInput = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) stopRoutineOrbit()
    }

    const tick = (now: number) => {
      if (!routineOrbitStopped.current && now >= orbitStartsAt) {
        const nextBearing = instance.getBearing() + ROUTINE_ORBIT_STEP * orbitDirection
        if (nextBearing >= ROUTINE_ORBIT_MAX_BEARING) {
          instance.setBearing(ROUTINE_ORBIT_MAX_BEARING)
          orbitDirection = -1
        } else if (nextBearing <= ROUTINE_ORBIT_MIN_BEARING) {
          instance.setBearing(ROUTINE_ORBIT_MIN_BEARING)
          orbitDirection = 1
        } else {
          instance.setBearing(nextBearing)
        }
      }

      if (instance.getLayer(ROUTINE_SMOKE_LAYER_ID)) {
        const progress = ((now - smokeCycleStartedAt) % 4000) / 4000
        instance.setPaintProperty(
          ROUTINE_SMOKE_LAYER_ID,
          'fill-extrusion-height',
          58 + 20 * progress,
        )
        instance.setPaintProperty(
          ROUTINE_SMOKE_LAYER_ID,
          'fill-extrusion-opacity',
          0.42 + (0.06 - 0.42) * progress,
        )
      }

      frame = window.requestAnimationFrame(tick)
    }

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now()
        window.cancelAnimationFrame(frame)
        frame = 0
      } else if (!frame) {
        const pausedFor = hiddenAt ? performance.now() - hiddenAt : 0
        smokeCycleStartedAt += pausedFor
        orbitStartsAt += pausedFor
        hiddenAt = 0
        frame = window.requestAnimationFrame(tick)
      }
    }

    instance.on('dragstart', stopOrbitOnUserInput)
    instance.on('zoomstart', stopOrbitOnUserInput)
    instance.on('rotatestart', stopOrbitOnUserInput)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) frame = window.requestAnimationFrame(tick)

    return () => {
      instance.off('dragstart', stopOrbitOnUserInput)
      instance.off('zoomstart', stopOrbitOnUserInput)
      instance.off('rotatestart', stopOrbitOnUserInput)
      document.removeEventListener('visibilitychange', onVisibility)
      window.cancelAnimationFrame(frame)
    }
  }, [ready, styleRevision, scenarioVariant, data, stopRoutineOrbit])

  const selectedIsClosed = selectedRoad ? closedWays.some((way) => way.id === selectedRoad.id) : false
  const mapCenter = scenarioConfig?.center ?? site.center
  const scenarioRoadLegend = roadStatusDiagnostics.find((line) => line.source === 'scenario')
  const localBasemapCoversScenario = !scenarioConfig || [LOCAL_BASEMAP_BOUNDS, STATION_LOCAL_BASEMAP_BOUNDS].some((bounds) => (
    scenarioConfig.center[0] >= bounds.west
    && scenarioConfig.center[0] <= bounds.east
    && scenarioConfig.center[1] >= bounds.south
    && scenarioConfig.center[1] <= bounds.north
  ))
  const setMapPitch = () => {
    if (scenarioVariant === 'routine') stopRoutineOrbit()
    const next = pitch === 0 ? 38 : 0
    setPitch(next)
    map.current?.easeTo({ pitch: next, bearing: next === 0 ? 0 : -12, duration: 350 })
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#EEF1F5]"
      data-layer-weather={layers.weather ? 'visible' : 'hidden'}
      data-layer-traffic={layers.traffic ? 'visible' : 'hidden'}
      data-layer-routes={layers.routes ? 'visible' : 'hidden'}
      data-task-routes-visible={taskRoutesVisible ? 'true' : 'false'}
      data-route-pulse-allowed={routePulseAllowed ? 'true' : 'false'}
      data-active-plan-id={activePlan?.id ?? ''}
      data-layer-cameras={layers.cameras ? 'visible' : 'hidden'}
      data-medical-route={medicalRouteData.features.length > 0 ? 'visible' : 'hidden'}
      data-medical-route-way-ids={medicalRoute?.wayIds.join('|') ?? ''}
      data-poi-count={poiMarkers.length}
      data-map-ready={ready ? 'true' : 'false'}
      data-city-massing={cityMassingOn ? 'on' : 'off'}
      data-map-style-loaded={ready && map.current?.isStyleLoaded() ? 'true' : 'false'}
      data-scenario-route-count={scenarioRouting.paths.length}
      data-scenario-route-metrics={JSON.stringify(scenarioRouting.paths
        .filter((path) => path.layer === 'routes')
        .map((path) => ({
          label: path.displayLabel ?? path.endpointLabels[0],
          lengthMeters: Math.round(path.path.slice(1).reduce(
            (total, point, index) => total + meters(path.path[index], point),
            0,
          )),
          points: path.path.length,
        })))}
      data-static-scenario-route-count={staticScenarioPaths.filter((path) => path.layer === 'routes').length}
      data-static-route-arrow-count={staticScenarioRouteArrows.length}
      data-command-route-label-count={commandTrafficRoutes.length}
      data-traffic-drag-enabled={commandMapInteraction.traffic?.enabled ? 'true' : 'false'}
      data-medical-drag-enabled={commandMapInteraction.medical?.enabled ? 'true' : 'false'}
      data-medical-drag-target-count={commandMedicalTargetRoutes.length}
      data-active-scenario-route={activeScenarioRouteLabel ?? ''}
      data-scenario-route-errors={scenarioRouting.errors.length}
      data-scenario-route-pending={scenarioRouting.pending ? 'true' : 'false'}
      data-scenario-route-endpoints={JSON.stringify(scenarioRouting.paths.map((path) => path.endpointLabels))}
      data-receiving-hospital={routineHospitalTransfer?.name ?? ''}
      data-receiving-route-source={routineHospitalTransfer?.source ?? ''}
      data-scenario-out-of-bounds-paths={scenarioOutOfBoundsPathCount}
      data-scenario-path-diagnostics={JSON.stringify(scenarioPathDiagnostics)}
      data-route-pulse={JSON.stringify({
        enabled: pulseEnabled,
        allowed: routePulseAllowed,
        scope: activeScenarioRouteLabel ? 'active-scenario-route' : pulseActivePlanOnly ? 'active-plan' : 'all',
        cycleMs: PULSE_CYCLE_MS,
        pulseCount: PULSE_COUNT,
        trail: PULSE_TRAIL,
        routes: pulseRoutes.map((route) => ({
          id: route.id,
          label: route.label,
          color: route.color,
          lengthMeters: Math.round(route.path.slice(1).reduce(
            (total, point, index) => total + meters(route.path[index], point),
            0,
          )),
          nodes: route.nodes.length,
          points: route.path.length,
          phase: Number(route.phase.toFixed(3)),
        })),
      })}
      data-road-status-lines={JSON.stringify(roadStatusDiagnostics)}
      data-blocked-road-marker-count={blockedRoadMarkers.length}
      data-scenario-orphan-resources={scenarioOrphanResourceLabels.join('|')}
      data-history-playhead={historyPlayhead ?? ''}
      data-history-track={historyTrack ?? ''}
      data-execution-definition={executionFrame?.definitionId ?? ''}
      data-execution-playhead={executionFrame?.playheadSec.toFixed(1) ?? ''}
      data-execution-stage={executionFrame?.incidentStage ?? ''}
      data-execution-unit-count={executionUnits.length}
      data-execution-unit-positions={JSON.stringify(executionUnits.map((unit) => ({
        id: unit.id,
        position: unit.position,
        status: unit.status,
      })))}
      data-execution-arrived-count={executionUnits.filter((unit) => unit.status === 'arrived').length}
      data-execution-open-intersections={executionIntersections.filter((point) => point.status === 'open').length}
      data-execution-road-states={layers.traffic ? executionRoadCues.map((cue) => cue.state).join('|') : ''}
      data-execution-alert-count={executionFrame?.visibleAlerts.length ?? 0}
      data-execution-blocked={executionFrame?.blockingAlert ? 'true' : 'false'}
    >
      {/* isolate 必须保留：deck.gl 在地图内插入 z-index:2 的画布层，容器不自成层叠上下文时它会画到下方浮层之上 */}
      <div
        ref={container}
        className="isolate h-full w-full"
        aria-label={scenarioConfig
          ? `${scenarioConfig.area}公开底图与演示态势叠加地图`
          : medicalRoute
            ? `荔湾—海珠处置区域交互地图，已显示120到场路线，起点为${medicalRoute.origin.name}`
            : '荔湾—海珠处置区域交互地图'}
      />

      {/* POI 徽标挂在 MapLibre 自己的 marker 层，随地图平移缩放，不需要我们逐帧投影。 */}
      <MapPoiMarkers map={ready ? map.current : null} points={poiMarkers} />
      <MapSignalCallouts map={ready ? map.current : null} callout={scenarioSignalCallout} />
      {commandMapInteraction.traffic && (
        <CommandTrafficMapMarkers
          map={ready ? map.current : null}
          routes={commandTrafficRoutes}
          unit={commandTrafficUnit}
          interaction={commandMapInteraction.traffic}
        />
      )}
      {commandMapInteraction.medical && (
        <CommandMedicalMapMarker
          map={ready ? map.current : null}
          targetRoutes={commandMedicalTargetRoutes}
          unit={commandMedicalUnit}
          interaction={commandMapInteraction.medical}
        />
      )}

      {/* 气象动效铺在底图与 deck 画布之上、HUD 浮层之下。所有场景通用，不只日常态。 */}
      <WeatherOverlay active={layers.weather} />
      {layers.weather && <WeatherHud />}

      {basemapStatus === 'loading' && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-[#E8EAF0] bg-white/95 px-2.5 py-1.5 text-[10px] text-[#6B7280] shadow-sm">
          正在加载在线底图 · 最长等待 8 秒
        </div>
      )}

      {basemapStatus === 'fallback' && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[#E8EAF0] bg-white/95 px-2.5 py-1.5 text-[10px] text-[#6B7280] shadow-sm">
          <span>
            {localBasemapCoversScenario
              ? '在线底图未载入 · 当前显示本地高清 OSM 底图'
              : '在线底图未载入 · 当前场景超出本地底图覆盖，仅保留演示图层'}
          </span>
          <button
            onClick={() => onlineReload.current()}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-[#EEEEFB] px-2 font-semibold text-[#5B5BD6] hover:bg-[#E3E3F8]"
          >
            <RefreshCw size={10} />重新加载在线底图
          </button>
        </div>
      )}

      {scenarioVariant === 'routine' && (
        <>
          {showStrategyMarkers && (
            <div className="absolute bottom-3 left-3 z-[4] flex max-w-[calc(100%-220px)] gap-2">
              {plans.slice(0, 2).map((plan, index) => {
                const selected = plan.id === activePlanId
                const etaMinutes = Math.max(1, Math.round(plan.metrics.etaSeconds / 60))
                return <div key={plan.id} className={`min-w-[150px] rounded-xl border bg-white/96 px-3 py-2 shadow-[0_8px_20px_rgb(31_48_78_/_0.14)] ${selected ? 'border-[#2F80ED] ring-2 ring-[#2F80ED]/15' : 'border-[#DDE5EF]'}`}><div className="flex items-center justify-between gap-2"><b className={`font-mono text-[16px] ${selected ? 'text-[#246FCF]' : 'text-[#3D4B60]'}`}>{etaMinutes} 分钟</b><span className="text-[9px] text-[#8591A4]">方案 {index ? 'B' : 'A'}</span></div><div className="mt-0.5 text-[10px] text-[#6C798E]">4.5 公里 · {index ? '均衡保障' : '优先到场'}</div></div>
              })}
              <div className="min-w-[152px] rounded-xl border border-[#F0C7C9] bg-[#FFF8F8] px-3 py-2 shadow-[0_8px_20px_rgb(31_48_78_/_0.12)]"><b className="text-[11px] text-[#A43A42]">禁行路线</b><div className="mt-1 border-t-2 border-dotted border-[#E5484D] pt-1 text-[9px] text-[#7A8799]">封闭 way / 不可达路段</div></div>
            </div>
          )}
        </>
      )}

      {!scenarioConfig && selectedRoad && (
        <div className="absolute left-3 top-3 w-[210px] rounded-xl border border-[#E8EAF0] bg-white p-3 shadow-[0_8px_24px_rgb(16_24_40_/_0.12)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-semibold text-[#1A1D26]">{selectedRoad.name}</div>
              <div className="mt-1 font-mono text-[10px] tabular-nums text-[#9CA3AF]">OSM way {selectedRoad.id}</div>
            </div>
            <button onClick={() => setSelectedRoad(null)} className="grid size-5 shrink-0 place-items-center rounded hover:bg-[#F4F5FA]" aria-label="关闭道路卡片">
              <X size={11} className="text-[#9CA3AF]" />
            </button>
          </div>
          <div className="mt-2"><OriginMark origin="real" note="道路几何与名称来自本地 OSM 快照" showLabel={false} /></div>
          <div className={`mt-2 rounded-md px-2 py-1.5 text-[11px] ${selectedRoad.planIds?.length ? 'bg-[#EAF8F1] text-[#237A52]' : 'bg-[var(--surface-sunken)] text-[var(--ink-2)]'}`}>
            {selectedRoad.planIds?.length
              ? `封路前命中路线 ${selectedRoad.planIds.join('/')}`
              : '封路前 A/B/120 均不经过此 way'}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#6B7280]">操作对象是整条 OSM way，不是点击位置附近的一小段。</p>
          <button
            onClick={() => {
              if (selectedIsClosed) onRemoveClosedWay(selectedRoad.id)
              else onCloseWay(selectedRoad)
              setSelectedRoad(null)
            }}
            className={`mt-2 h-8 w-full rounded-lg text-[11px] font-semibold text-white ${selectedIsClosed ? 'bg-[#6B7280]' : 'bg-[#E5484D]'}`}
          >
            {selectedIsClosed ? '恢复整条道路' : '封闭整条道路并重算'}
          </button>
        </div>
      )}

      <div ref={legend} className="absolute bottom-3 right-3 w-[174px] rounded-xl border border-[#E8EAF0] bg-white/95 px-3 py-2.5 text-[10px] shadow-sm backdrop-blur">
        <div className="mb-1.5 text-[11px] font-semibold text-[#1A1D26]">图例</div>
        {executionFrame ? (
          <>
            {executionUnits.some((unit) => unit.kind === 'fire') && <LegendPoi kind="fire_station" label="演示消防车辆" />}
            {executionUnits.some((unit) => unit.kind === 'police') && <LegendPoi kind="police" label="演示警务车辆" />}
            {executionUnits.some((unit) => unit.kind === 'medical') && <LegendPoi kind="medical" label="演示医疗车辆" />}
            {executionUnits.some((unit) => unit.kind === 'traffic') && <LegendPoi kind="vehicle" label="模拟清障车辆" />}
            <LegendPoi kind="traffic_signal" label="演示路口状态" />
            {layers.traffic && executionRoadCues.some((cue) => cue.state === 'slow') && <LegendLine color="#D99724" label="演示缓行路况" thin />}
            {layers.traffic && executionRoadCues.some((cue) => cue.state === 'detour') && <LegendLine color="#5B5BD6" label="演示绕行路况" thin />}
            {layers.traffic && executionRoadCues.some((cue) => cue.state === 'closed') && <LegendLine color="#E5484D" label="演示阻塞路况" dashed blocked thin />}
            {executionOnsiteNodes.length > 0 && <LegendPoi kind="camera" label="演示现场节点" unverified />}
            <div className="mt-1 border-t border-[#E8EAF0] pt-1 text-[#9CA3AF]">
              {executionFrame.incidentStage} · T+{executionFrame.playheadSec.toFixed(1)}s
            </div>
          </>
        ) : cityOverviewMode ? (
          <>
            <LegendPoi kind="fire" label="119 消防警情" />
            <LegendPoi kind="vehicle" label="交通事件" />
            <LegendPoi kind="police" label="110 警情" />
            <LegendPoi kind="hospital" label="120 医疗" />
            <LegendPoi kind="urban_order" label="市容秩序" />
            <LegendPoi kind="assembly" label="重大布防" />
          </>
        ) : scenarioConfig ? (
          <>
            {layers.weather && (
              <div className="flex items-center gap-1 py-0.5 text-[#6B7280]">
                <img src={CURRENT_WEATHER.condition.icon} alt="" className="size-4 shrink-0 object-contain" />
                <span>{CURRENT_WEATHER.condition.label} · 全幅气象动效</span>
              </div>
            )}
            {layers.traffic && scenarioRoadLegend && (
              <LegendLine
                color={`rgb(${scenarioRoadLegend.color.join(', ')})`}
                label={scenarioRoadLegend.state === 'blocked' ? '阻塞路况' : scenarioRoadLegend.state === 'clear' ? '通行路况' : '路况 / 保障走廊'}
                dashed={scenarioRoadLegend.state === 'blocked'}
                blocked={scenarioRoadLegend.state === 'blocked'}
                thin
              />
            )}
            {layers.routes && taskRoutesVisible && pulseRoutes.map((route) => (
              <LegendLine
                key={route.id}
                color={`rgb(${route.color.join(', ')})`}
                label={route.label}
              />
            ))}
            {layers.traffic && scenarioRouting.roadNames.map((roadName) => (
              <div key={roadName} className="py-0.5 text-[#6B7280]">{roadName} · OSM 路段</div>
            ))}
            {layers.routes && taskRoutesVisible && scenarioRouting.pending && (
              <div className="py-0.5 text-[#9CA3AF]">正在计算 OSM 路网路线</div>
            )}
            {scenarioRouting.errors.map((error) => (
              <div key={error} className="py-0.5 text-[#E5484D]">{error}</div>
            ))}
            <LegendPoi kind="event" label="场景事件锚点" />
            {scenarioVariant === 'urban_order'
              ? <LegendPoi kind="urban_order" label="市容巡查资源 · 模拟" />
              : <LegendPoi kind="medical" label="协同资源 · 按类别取图标" />}
            <LegendPoi kind="report" label="Signal 来源 · 待核实" unverified />
            {layers.cameras && <LegendPoi kind="camera" label="上游点位 · 待核实" unverified />}
          </>
        ) : (
          <>
            {layers.weather && (
              <div className="flex items-center gap-1 py-0.5 text-[#6B7280]">
                <img src={CURRENT_WEATHER.condition.icon} alt="" className="size-4 shrink-0 object-contain" />
                <span>{CURRENT_WEATHER.condition.label} · 全幅气象动效</span>
              </div>
            )}
            {layers.traffic && !pulseActivePlanOnly && (
              <LegendLine color="#30A46C" label="通行路况" thin />
            )}
            {layers.routes && taskRoutesVisible && (
              <>
                {pulseActivePlanOnly ? (
                  <>
                    <LegendLine
                      color={activePlan?.id === plans[0]?.id ? PRIMARY : BASELINE}
                      label={`已批准方案 ${activePlan?.id === plans[0]?.id ? 'A' : 'B'} · ${pulseEnabled ? '执行路线' : '路线'}`}
                    />
                  </>
                ) : (
                  <>
                    <LegendLine color={PRIMARY} label="CityOS 路线 · 优先通行假设" />
                    <LegendLine color={BASELINE} label="常规对照 · 普通通行假设" />
                  </>
                )}
                {pulseEnabled && !pulseActivePlanOnly ? (
                  <div className="flex items-center gap-2 py-0.5 text-[#6B7280]">
                    <span className="relative h-2 w-5" aria-hidden="true">
                      <span className="absolute left-0 right-0 top-px border-t-2 border-[#5B5BD6]" />
                      <span className="absolute left-0 right-0 bottom-px border-t-2 border-[#697386]" />
                    </span>
                    CityOS / 对照共线 · 平行错相
                  </div>
                ) : !pulseEnabled && !pulseActivePlanOnly ? <LegendDualLine label="CityOS / 对照共线路段" /> : null}
                {medicalRoute && <LegendLine color={MEDICAL} label="120 到场路线" dashed={!pulseEnabled} />}
              </>
            )}
            {layers.traffic && <LegendLine color={FIRE} label="道路封闭 · 整条 way" dashed blocked thin />}
            <LegendPoi kind="fire_station" label="消防站起点" />
            <LegendPoi kind="fire" label="火情终点" />
            {layers.routes && showStrategyMarkers && (
              strategyIntersections.length > 0
                ? <LegendPoi kind="traffic_signal" label="开路节点 · 当前方案" />
                : <div className="py-0.5 text-[#9CA3AF]">当前方案 · 不请求开路</div>
            )}
            {layers.traffic && closedWays.length > 0 && <LegendPoi kind="road_closure" label="封闭点位" />}
            {layers.cameras && <LegendPoi kind="camera" label="上游视频点位 · 待核实" unverified />}
            {resourceReferenceVisible && (
              <>
                <LegendPoi kind="fire_station" label="消防站 · 公开参考" />
                <LegendPoi kind="hospital" label="医疗点 · 公开参考" />
              </>
            )}
          </>
        )}
        {!scenarioConfig && showSimulationProvenance && (
          <div className="mt-1.5 border-t border-[#E8EAF0] pt-1.5">
            <OriginMark
              origin="simulated"
              note="事件流、资源状态、车辆通行规则、ETA、路况与上游点位为演示数据；底图、路网与医院位置来自公开 OSM 数据。"
            />
          </div>
        )}
      </div>

      <div className="absolute bottom-[250px] right-3 flex flex-col gap-1">
        <MapButton label={scenarioConfig ? '回到场景中心' : '回到事发点'} onClick={() => {
          if (scenarioVariant === 'routine') stopRoutineOrbit()
          map.current?.flyTo({ center: mapCenter, zoom: scenarioConfig?.zoom ?? 14.9, duration: 500 })
        }}>
          <Crosshair size={13} />
        </MapButton>
        {!scenarioConfig && showResourceReferenceControl && (
          <MapButton
            label={resourceReferenceVisible ? '隐藏资源参考（公开点位）' : '显示资源参考（公开点位）'}
            onClick={() => onResourceReferenceVisibleChange(!resourceReferenceVisible)}
            active={resourceReferenceVisible}
            toggle
          >
            <Layers3 size={13} />
          </MapButton>
        )}
        <MapButton label="切换 2D 与倾斜视角" onClick={setMapPitch}>{pitch === 0 ? '3D' : <><RotateCcw size={11} />2D</>}</MapButton>
        <MapButton label="放大" onClick={() => {
          if (scenarioVariant === 'routine') stopRoutineOrbit()
          map.current?.zoomIn()
        }}><Plus size={13} /></MapButton>
        <MapButton label="缩小" onClick={() => {
          if (scenarioVariant === 'routine') stopRoutineOrbit()
          map.current?.zoomOut()
        }}><Minus size={13} /></MapButton>
      </div>
    </div>
  )
})

type ScenarioPointResolution =
  | { ok: true; point: ScenarioMapPoint }
  | { ok: false; message: string }

function resolveScenarioPoint(points: ScenarioMapPoint[], label: string): ScenarioPointResolution {
  const matches = points.filter((point) => point.label === label)
  if (matches.length === 1) return { ok: true, point: matches[0] }
  if (matches.length === 0) return { ok: false, message: `配置错误：找不到点位「${label}」` }
  return { ok: false, message: `配置错误：点位「${label}」不唯一` }
}

function solveScenarioPointRoute(
  graph: Graph,
  request: ScenarioPointRouteRequest,
  fromPoint: ScenarioMapPoint,
  toPoint: ScenarioMapPoint,
  closedWayIds?: ReadonlySet<string>,
): ScenarioPathDatum | null {
  const from = nearestNode(graph, fromPoint.position)
  const to = nearestNode(graph, toPoint.position)
  if (!from.ok || !to.ok) return null

  const route = solve(graph, from.node, to.node, { closedWayIds })
  if (!route.ok) return null

  const path = route.path.slice()
  if (meters(fromPoint.position, path[0]) > 0.5) path.unshift(fromPoint.position)
  if (meters(path[path.length - 1], toPoint.position) > 0.5) path.push(toPoint.position)
  return {
    path,
    color: request.color,
    layer: 'routes',
    width: request.width,
    kind: 'point-route',
    endpointLabels: [request.fromLabel, request.toLabel],
  }
}

function findScenarioRoad(graph: Graph, eventPosition: [number, number]): OrderedScenarioWay | null {
  const eventNode = nearestNode(graph, eventPosition)
  if (!eventNode.ok) return null

  const candidates = new Map<string, Segment>()
  for (const segmentId of graph.incident.get(eventNode.node) ?? []) {
    const segment = graph.segments.get(segmentId)
    if (!segment) continue
    const current = candidates.get(segment.wayId)
    if (!current || segment.length > current.length) candidates.set(segment.wayId, segment)
  }
  const selected = [...candidates.values()].sort((left, right) => {
    const classDifference = (ROAD_CLASS_PRIORITY[right.highway] ?? -1) - (ROAD_CLASS_PRIORITY[left.highway] ?? -1)
    if (classDifference !== 0) return classDifference
    const rightLength = (graph.wayIndex.get(right.wayId) ?? [])
      .reduce((total, id) => total + (graph.segments.get(id)?.length ?? 0), 0)
    const leftLength = (graph.wayIndex.get(left.wayId) ?? [])
      .reduce((total, id) => total + (graph.segments.get(id)?.length ?? 0), 0)
    return rightLength - leftLength
  })[0]
  if (!selected) return null

  const segmentIds = graph.wayIndex.get(selected.wayId) ?? []
  const segments = segmentIds.flatMap((id) => {
    const segment = graph.segments.get(id)
    return segment ? [segment] : []
  })
  if (!segments.length) return null

  const path: Array<[number, number]> = [segments[0].geometry[0], segments[0].geometry[1]]
  const nodes = [segments[0].from, segments[0].to]
  let tail = segments[0].to
  for (const segment of segments.slice(1)) {
    if (segment.from === tail) {
      path.push(segment.geometry[1])
      nodes.push(segment.to)
      tail = segment.to
      continue
    }
    if (segment.to === tail) {
      path.push(segment.geometry[0])
      nodes.push(segment.from)
      tail = segment.from
      continue
    }
    return null
  }

  const eventNodeIndex = nodes.indexOf(eventNode.node)
  if (eventNodeIndex < 0) return null
  return {
    wayId: selected.wayId,
    roadName: segments.find((segment) => segment.name)?.name ?? '未命名道路',
    path,
    nodes,
    segments,
    eventNodeIndex,
  }
}

function solveScenarioDetour(
  graph: Graph,
  road: OrderedScenarioWay,
  request: ScenarioTrafficRouteRequest,
  eventPosition: [number, number],
  maxRadiusMeters?: number,
): { path: ScenarioPathDatum; endpointPoints: ScenarioMapPoint[] } | null {
  if (!request.detour) return null

  const isJunction = (node: string) => (graph.incident.get(node) ?? []).some((segmentId) => {
    const segment = graph.segments.get(segmentId)
    return segment && segment.wayId !== road.wayId
  })
  let leftIndex = road.eventNodeIndex - 1
  while (leftIndex >= 0 && !isJunction(road.nodes[leftIndex])) leftIndex -= 1
  let rightIndex = road.eventNodeIndex + 1
  while (rightIndex < road.nodes.length && !isJunction(road.nodes[rightIndex])) rightIndex += 1
  if (leftIndex < 0 || rightIndex >= road.nodes.length) return null

  const originalMeters = road.segments
    .slice(leftIndex, rightIndex)
    .reduce((total, segment) => total + segment.length, 0)
  if (originalMeters <= 0) return null

  const directions: Array<[string, string]> = [
    [road.nodes[leftIndex], road.nodes[rightIndex]],
    [road.nodes[rightIndex], road.nodes[leftIndex]],
  ]
  const candidates = directions.flatMap(([fromNode, toNode]) => {
    const baseline = solve(graph, fromNode, toNode)
    if (!baseline.ok || !baseline.wayIds.includes(road.wayId)) return []
    const rerouted = solve(graph, fromNode, toNode, { closedWayIds: new Set([road.wayId]) })
    if (!rerouted.ok || rerouted.wayIds.includes(road.wayId)) return []
    if (rerouted.meters > originalMeters * 6) return []
    if (maxRadiusMeters && rerouted.path.some((coordinate) => meters(eventPosition, coordinate) > maxRadiusMeters)) {
      return []
    }
    return [{ rerouted, fromNode, toNode }]
  })
  const selected = candidates.sort((left, right) => left.rerouted.meters - right.rerouted.meters)[0]
  if (!selected) return null

  const detourColor: [number, number, number] = [
    request.detour.color[0],
    request.detour.color[1],
    request.detour.color[2],
  ]
  return {
    path: {
      path: selected.rerouted.path,
      color: request.detour.color,
      layer: 'routes',
      width: request.detour.width,
      kind: 'detour',
      endpointLabels: [
        `绕行端点 A · ${road.roadName}`,
        `绕行端点 B · ${road.roadName}`,
      ],
      roadName: road.roadName,
    },
    endpointPoints: [
      {
        position: graph.nodes.get(selected.fromNode)!,
        label: `绕行端点 A · ${road.roadName}`,
        kind: 'entry',
        color: detourColor,
        labelOffset: [-12, 14],
      },
      {
        position: graph.nodes.get(selected.toNode)!,
        label: `绕行端点 B · ${road.roadName}`,
        kind: 'entry',
        color: detourColor,
        labelOffset: [12, -14],
      },
    ],
  }
}

function clipPathToLength(
  path: Array<[number, number]>,
  center: [number, number],
  maxMetersEachSide: number,
): Array<[number, number]> {
  if (path.length < 2 || maxMetersEachSide <= 0) return path.slice(0, 1)

  let centerIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < path.length; index += 1) {
    const distance = meters(center, path[index])
    if (distance < closestDistance) {
      closestDistance = distance
      centerIndex = index
    }
  }

  const before: Array<[number, number]> = []
  let current = path[centerIndex]
  let remaining = maxMetersEachSide
  for (let index = centerIndex - 1; index >= 0 && remaining > 0; index -= 1) {
    const next = path[index]
    const segmentLength = meters(current, next)
    if (segmentLength <= remaining) {
      before.unshift(next)
      remaining -= segmentLength
      current = next
      continue
    }
    const ratio = remaining / segmentLength
    before.unshift([
      current[0] + (next[0] - current[0]) * ratio,
      current[1] + (next[1] - current[1]) * ratio,
    ])
    break
  }

  const after: Array<[number, number]> = [path[centerIndex]]
  current = path[centerIndex]
  remaining = maxMetersEachSide
  for (let index = centerIndex + 1; index < path.length && remaining > 0; index += 1) {
    const next = path[index]
    const segmentLength = meters(current, next)
    if (segmentLength <= remaining) {
      after.push(next)
      remaining -= segmentLength
      current = next
      continue
    }
    const ratio = remaining / segmentLength
    after.push([
      current[0] + (next[0] - current[0]) * ratio,
      current[1] + (next[1] - current[1]) * ratio,
    ])
    break
  }

  return [...before, ...after]
}

function MapButton({
  label,
  onClick,
  children,
  active = false,
  toggle = false,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  toggle?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={toggle ? active : undefined}
      title={label}
      className={`grid size-8 place-items-center rounded-lg border text-[11px] font-semibold shadow-sm transition-colors ${
        active
          ? 'border-[#B9B9EC] bg-[#EEEEFB] text-[#4D4DC2]'
          : 'border-[#E8EAF0] bg-white text-[#1A1D26] hover:bg-[#F4F5FA]'
      }`}
    >
      {children}
    </button>
  )
}

function getPathBounds(coordinates: Array<[number, number]>): MapBounds | null {
  if (!coordinates.length) return null
  const lngs = coordinates.map(([lng]) => lng)
  const lats = coordinates.map(([, lat]) => lat)
  return {
    minLng: Math.min(...lngs),
    minLat: Math.min(...lats),
    maxLng: Math.max(...lngs),
    maxLat: Math.max(...lats),
  }
}

function pointAlongPath(path: Array<[number, number]>, progress: number): [number, number] {
  if (path.length === 0) return [0, 0]
  if (path.length === 1 || progress <= 0) return path[0]
  if (progress >= 1) return path[path.length - 1]

  const segmentLengths = path.slice(1).map((coordinate, index) => meters(path[index], coordinate))
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)
  if (totalLength <= 0) return path[0]
  const target = totalLength * progress
  let traversed = 0

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]
    if (traversed + length >= target) {
      const ratio = length <= 0 ? 0 : (target - traversed) / length
      const from = path[index]
      const to = path[index + 1]
      return [
        from[0] + (to[0] - from[0]) * ratio,
        from[1] + (to[1] - from[1]) * ratio,
      ]
    }
    traversed += length
  }

  return path[path.length - 1]
}

function separatedRouteLabelPosition(
  path: Array<[number, number]>,
  otherPaths: Array<Array<[number, number]>>,
): [number, number] {
  const candidates = [0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.82]
  let bestPosition = pointAlongPath(path, 0.5)
  let bestScore = Number.NEGATIVE_INFINITY

  for (const progress of candidates) {
    const position = pointAlongPath(path, progress)
    const separation = otherPaths.length === 0
      ? 0
      : Math.min(...otherPaths.map((otherPath) => Math.min(
          ...Array.from({ length: 21 }, (_, index) => meters(position, pointAlongPath(otherPath, index / 20))),
        )))
    // 同等分离度时优先中段，避免标签贴着起终点和 POI 堆在一起。
    const middleBias = 1 - Math.abs(progress - 0.54)
    const score = separation + middleBias * 8
    if (score > bestScore) {
      bestScore = score
      bestPosition = position
    }
  }

  return bestPosition
}

function routeArrowAngle(from: [number, number], to: [number, number]) {
  const latitudeScale = Math.cos(((from[1] + to[1]) * Math.PI) / 360) || 1
  const dx = (to[0] - from[0]) * latitudeScale
  const dy = to[1] - from[1]
  return (Math.atan2(-dy, dx) * 180) / Math.PI
}

function pathBetweenProgress(
  path: Array<[number, number]>,
  fromProgress: number,
  toProgress: number,
): Array<[number, number]> {
  if (path.length < 2) return path
  const segmentLengths = path.slice(1).map((coordinate, index) => meters(path[index], coordinate))
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)
  if (totalLength <= 0) return path
  const startDistance = totalLength * Math.max(0, Math.min(1, fromProgress))
  const endDistance = totalLength * Math.max(0, Math.min(1, toProgress))
  const selected: Array<[number, number]> = [pointAlongPath(path, fromProgress)]
  let traversed = 0
  for (let index = 0; index < segmentLengths.length; index += 1) {
    traversed += segmentLengths[index]
    if (traversed > startDistance && traversed < endDistance) selected.push(path[index + 1])
  }
  selected.push(pointAlongPath(path, toProgress))
  return selected
}

function executionRoadCueColor(state: ExecutionRoadCue['state']): [number, number, number, number] {
  if (state === 'closed') return [229, 72, 77, 235]
  if (state === 'slow') return [217, 151, 36, 225]
  if (state === 'detour') return [91, 91, 214, 225]
  return [48, 164, 108, 210]
}

function executionIntersectionColor(status: ExecutionIntersectionFrame['status']): [number, number, number, number] {
  if (status === 'open') return [48, 164, 108, 245]
  if (status === 'restored') return [59, 130, 246, 220]
  return [105, 115, 134, 190]
}

function executionUnitColor(
  kind: ExecutionUnitFrame['kind'],
  status: ExecutionUnitFrame['status'],
): [number, number, number, number] {
  const alpha = status === 'waiting' ? 175 : 245
  if (kind === 'fire') return [229, 72, 77, alpha]
  if (kind === 'police') return [59, 130, 246, alpha]
  if (kind === 'traffic') return [91, 91, 214, alpha]
  return [14, 154, 167, alpha]
}

function routeEdgeKey(from: Plan['path'][number], to: Plan['path'][number]) {
  const left = `${from[0].toFixed(6)},${from[1].toFixed(6)}`
  const right = `${to[0].toFixed(6)},${to[1].toFixed(6)}`
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

function buildRouteSegments(plans: Plan[], activePlanId: string): RouteSegmentDatum[] {
  const [planA, planB] = plans
  if (!planA || !planB) return []
  const bEdges = new Set(
    planB.path.slice(1).map((coordinate, index) => routeEdgeKey(planB.path[index], coordinate)),
  )
  const sharedEdges = new Set<string>()
  const segments: RouteSegmentDatum[] = []

  for (let index = 1; index < planA.path.length; index += 1) {
    const path: RouteSegmentDatum['path'] = [planA.path[index - 1], planA.path[index]]
    const key = routeEdgeKey(path[0], path[1])
    const shared = bEdges.has(key)
    if (shared) sharedEdges.add(key)
    segments.push({
      path,
      active: planA.id === activePlanId,
      color: [48, 164, 108],
      shared,
    })
  }

  for (let index = 1; index < planB.path.length; index += 1) {
    const path: RouteSegmentDatum['path'] = [planB.path[index - 1], planB.path[index]]
    const key = routeEdgeKey(path[0], path[1])
    if (sharedEdges.has(key)) continue
    segments.push({
      path,
      active: planB.id === activePlanId,
      color: [91, 91, 214],
      shared: false,
    })
  }
  return segments
}

function LegendLine({
  color,
  label,
  dashed = false,
  blocked = false,
  thin = false,
}: {
  color: string
  label: string
  dashed?: boolean
  blocked?: boolean
  thin?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[#6B7280]">
      <span className="relative h-3 w-5 shrink-0" aria-hidden="true">
        <span
          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 ${thin ? 'border-t' : 'border-t-2'} ${dashed ? 'border-dashed' : ''}`}
          style={{ borderColor: color }}
        />
        {blocked && (
          <span className="absolute left-1/2 top-1/2 grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#E5484D] text-[9px] font-black leading-none text-white">
            ×
          </span>
        )}
      </span>
      {label}
    </div>
  )
}

function LegendDualLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[#6B7280]">
      <span className="relative h-2 w-5" aria-hidden="true">
        <span className="absolute left-0 right-0 top-[2px] border-t-[5px] border-[#697386]" />
        <span className="absolute left-0 right-0 top-[3px] border-t-2 border-[#5B5BD6]" />
      </span>
      {label}
    </div>
  )
}

/** 图例里的 POI 标识。用和地图上完全一样的字形和配色，图例才对得上。 */
function LegendPoi({ kind, label, unverified = false }: { kind: PoiKind; label: string; unverified?: boolean }) {
  const spec = POI_SPECS[kind]
  return (
    <div className="flex items-center gap-2 py-0.5 text-[#6B7280]">
      <span
        className="grid size-4 shrink-0 place-items-center rounded-[5px] border"
        style={{
          background: unverified ? '#FFFFFF' : spec.color,
          borderColor: spec.color,
          borderStyle: unverified ? 'dashed' : 'solid',
        }}
      >
        <span
          className="size-2.5"
          style={{
            background: unverified ? spec.color : '#FFFFFF',
            maskImage: `url(${spec.glyph})`,
            WebkitMaskImage: `url(${spec.glyph})`,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center',
          }}
        />
      </span>
      {label}
    </div>
  )
}
