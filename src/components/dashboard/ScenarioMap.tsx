import { memo } from 'react'
import { FloorStatusPanel } from './FloorStatusPanel'
import { ROUTINE_HIGH_RISE } from './fireModes'
import type { MapLayerVisibility } from './mapLayers'
import type { PoiKind } from './map/poiCatalog'
import { OriginMark } from './Provenance'

export type ScenarioMapVariant = 'routine' | 'police' | 'medical' | 'traffic' | 'major'

export type ScenarioPointKind = 'event' | 'resource' | 'source' | 'camera' | 'entry'
export type ScenarioPathLayer = 'traffic' | 'routes'
export type ScenarioRoadState = 'clear' | 'attention' | 'blocked'

export interface ScenarioMapPoint {
  position: [number, number]
  label: string
  kind: ScenarioPointKind
  color: [number, number, number]
  labelOffset?: [number, number]
  /**
   * 地图上画成哪种形象化标识。kind 说的是这个点在推演里的角色（事件/资源/来源），
   * poi 说的是它在现实里是什么（消防站/医院/交警岗）——两者不是一回事，
   * 同为 resource 的「交警岗」和「医疗保障」要画成完全不同的图标。
   * 只有 resource 必须显式标注，其余按 kind 兜底，见 map/poiCatalog.ts。
   */
  poi?: PoiKind
}

export interface ScenarioPointRouteRequest {
  /** 引用同场景 points[].label，必须匹配到唯一一个点位。 */
  fromLabel: string
  /** 引用同场景 points[].label，必须匹配到唯一一个点位。 */
  toLabel: string
  color: [number, number, number, number]
  layer: 'routes'
  width: number
}

export interface ScenarioTrafficRouteRequest {
  /** 事件锚点决定要读取的 OSM way，不把道路状态伪装成 A→B 路线。 */
  eventLabel: string
  color: [number, number, number, number]
  layer: 'traffic'
  state: ScenarioRoadState
  width: number
  /** 封闭事件 way 后，以事故路段两端路口为起终点计算局部绕行。 */
  detour?: {
    color: [number, number, number, number]
    width: number
  }
}

export type ScenarioRouteRequest = ScenarioPointRouteRequest | ScenarioTrafficRouteRequest

export interface ScenarioMapArea {
  position: [number, number]
  radius: number
  color: [number, number, number]
  layer: 'base' | 'weather'
}

export interface ScenarioMapConfig {
  title: string
  area: string
  summary: string
  center: [number, number]
  zoom: number
  points: ScenarioMapPoint[]
  routes: ScenarioRouteRequest[]
  areas: ScenarioMapArea[]
  /** 需要绑定到场景点位的 Signal 标签；anchorLabel 必须引用唯一的 points[].label。 */
  signals?: {
    anchorLabel: string
    labels: string[]
  }
}

const BLUE: [number, number, number] = [59, 130, 246]
const RED: [number, number, number] = [229, 72, 77]
const GREEN: [number, number, number] = [48, 164, 108]
const AMBER: [number, number, number] = [199, 120, 22]
const VIOLET: [number, number, number] = [91, 91, 214]

/**
 * 跨部门场景的车辆路线按力量类型分配：
 * 消防红、医疗青、公安/交警蓝、第二支警力紫。120 专属场景没有跨部门同图，
 * 继续用绿 / 蓝区分“急救点响应”和“接收点转运”，两条路线仍保持不同颜色。
 *
 * 8/21 评审「每种车辆的路线应该是不同的」。原来医疗路线用的是 GREEN
 * （#30A46C），而 GREEN 在这套系统里是「方案 A / 可行」的语义色，荔湾主线的
 * A 方案就是这个绿——同一张图上绿线一会儿是救护车一会儿是推荐方案，读不出来。
 * 跨部门地图里的医疗路线统一改用 MEDICAL 青（#0E9AA7），和顶部 120 指标、
 * 医疗 POI 徽标一致。
 *
 * 道路状态（layer: 'traffic'）不属于车辆路线，仍用琥珀/红表示通行状况，
 * 也不参与激光脉冲——它是路面情况，不是谁在跑。
 */

/**
 * 位置用于把演示场景锚定到公开城市底图。除场馆/道路等底图地理要素外，
 * 事件、资源、范围、路线与点位都只是前端演示，不代表真实事件或实时状态。
 */
// oxlint-disable-next-line react/only-export-components -- 场景 HUD 与其只读地图配置共同定义同一公开组件契约。
export const SCENARIO_MAP_CONFIGS: Record<ScenarioMapVariant, ScenarioMapConfig> = {
  police: {
    title: '广州火车站历史案例推演',
    area: '越秀区广州火车站站外广场',
    summary: '公开事件锚点与演示协同路线严格分层',
    center: [113.2574, 23.1488],
    zoom: 15.2,
    areas: [
      { position: [113.2574, 23.1488], radius: 1500, color: BLUE, layer: 'base' },
      { position: [113.2529, 23.1454], radius: 420, color: GREEN, layer: 'weather' },
    ],
    points: [
      { position: [113.2574, 23.1488], label: '2015-03-06 公开事件锚点', kind: 'event', color: RED, poi: 'event', labelOffset: [14, -18] },
      { position: [113.2554755, 23.1484543], label: '警务 POI · 名称缺失', kind: 'resource', color: BLUE, poi: 'police', labelOffset: [-12, -10] },
      { position: [113.2543193, 23.1449007], label: '警务 POI B · 名称缺失', kind: 'resource', color: VIOLET, poi: 'police', labelOffset: [12, 14] },
      { position: [113.2492868, 23.1454245], label: '南部战区总医院 · 公开 POI', kind: 'resource', color: GREEN, poi: 'hospital', labelOffset: [-12, 14] },
      { position: [113.2564, 23.1494], label: '公开报道锚点', kind: 'source', color: AMBER, labelOffset: [-12, 14] },
      { position: [113.2584, 23.1479], label: '演示现场回报点', kind: 'source', color: AMBER, labelOffset: [12, -12] },
      { position: [113.2538, 23.1498], label: '演示西侧点位', kind: 'camera', color: VIOLET, labelOffset: [-12, -14] },
      { position: [113.2612, 23.1474], label: '演示东侧点位', kind: 'camera', color: VIOLET, labelOffset: [12, -14] },
    ],
    routes: [
      {
        fromLabel: '警务 POI · 名称缺失',
        toLabel: '2015-03-06 公开事件锚点',
        color: [59, 130, 246, 200],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '警务 POI B · 名称缺失',
        toLabel: '2015-03-06 公开事件锚点',
        color: [91, 91, 214, 200],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '南部战区总医院 · 公开 POI',
        toLabel: '2015-03-06 公开事件锚点',
        color: [14, 154, 167, 200],
        layer: 'routes',
        width: 4,
      },
      {
        eventLabel: '2015-03-06 公开事件锚点',
        color: [48, 164, 108, 180],
        layer: 'traffic',
        state: 'clear',
        width: 2,
      },
    ],
  },
  medical: {
    title: '120 医疗保障态势',
    area: '越秀区盘福路周边',
    summary: '急救保障、接收点与转运关系示意',
    center: [113.2568, 23.1265],
    zoom: 15.25,
    areas: [
      { position: [113.2568, 23.1265], radius: 500, color: GREEN, layer: 'base' },
      { position: [113.2612, 23.1304], radius: 380, color: BLUE, layer: 'weather' },
    ],
    points: [
      { position: [113.2568, 23.1265], label: '商圈急救保障', kind: 'event', color: RED, poi: 'event', labelOffset: [14, -18] },
      { position: [113.2529, 23.1294], label: '演示急救点', kind: 'resource', color: GREEN, poi: 'medical', labelOffset: [-12, -12] },
      { position: [113.2602, 23.1238], label: '演示接收点', kind: 'resource', color: BLUE, poi: 'hospital', labelOffset: [12, 14] },
      { position: [113.2554, 23.1261], label: '工作人员输入', kind: 'source', color: AMBER, labelOffset: [-12, 14] },
      { position: [113.2578, 23.1276], label: '演示事件流', kind: 'source', color: AMBER, labelOffset: [12, -12] },
      { position: [113.2538, 23.1278], label: '北侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [-12, -14] },
      { position: [113.2592, 23.1286], label: '东侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [12, -14] },
    ],
    routes: [
      {
        fromLabel: '演示急救点',
        toLabel: '商圈急救保障',
        color: [48, 164, 108, 210],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '演示接收点',
        toLabel: '商圈急救保障',
        color: [59, 130, 246, 200],
        layer: 'routes',
        width: 4,
      },
      {
        eventLabel: '商圈急救保障',
        color: [199, 120, 22, 175],
        layer: 'traffic',
        state: 'attention',
        width: 2,
      },
    ],
  },
  traffic: {
    title: '交通协同态势',
    area: '越秀区文明路沿线',
    summary: '事故路段、保障点与响应路线示意',
    center: [113.2684, 23.1253],
    zoom: 14.95,
    areas: [
      { position: [113.2684, 23.1253], radius: 430, color: AMBER, layer: 'base' },
      { position: [113.2732, 23.129], radius: 420, color: BLUE, layer: 'weather' },
    ],
    // 响应资源为演示锚点，落在范围圈内的可达路网附近，避免单行道把响应线带出场景范围。
    points: [
      { position: [113.2684, 23.1253], label: '事故路段 · 文明路', kind: 'event', color: RED, poi: 'crash', labelOffset: [14, -48] },
      { position: [113.2648, 23.126], label: '交警岗', kind: 'resource', color: BLUE, poi: 'police', labelOffset: [-12, -10] },
      { position: [113.2715, 23.1256], label: '医疗保障', kind: 'resource', color: GREEN, poi: 'medical', labelOffset: [12, 24] },
      { position: [113.2661, 23.1254], label: '道路巡查', kind: 'source', color: AMBER, labelOffset: [-12, 14] },
      { position: [113.2712, 23.1251], label: '市民上报', kind: 'source', color: AMBER, labelOffset: [12, -22] },
      { position: [113.2655, 23.1275], label: '北侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [-12, -14] },
      { position: [113.2708, 23.127], label: '东侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [12, -14] },
    ],
    routes: [
      {
        eventLabel: '事故路段 · 文明路',
        color: [229, 72, 77, 220],
        layer: 'traffic',
        state: 'blocked',
        width: 2.4,
      },
      {
        fromLabel: '交警岗',
        toLabel: '事故路段 · 文明路',
        color: [59, 130, 246, 200],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '医疗保障',
        toLabel: '事故路段 · 文明路',
        color: [14, 154, 167, 200],
        layer: 'routes',
        width: 4,
      },
    ],
  },
  major: {
    title: '重大布防态势',
    area: '天河体育中心周边',
    summary: '场馆分区与保障点位示意',
    center: [113.3195, 23.1404],
    zoom: 15.0,
    areas: [
      { position: [113.3195, 23.1404], radius: 590, color: VIOLET, layer: 'base' },
      { position: [113.3224, 23.1424], radius: 480, color: BLUE, layer: 'weather' },
    ],
    // 场馆与入口近似坐标由本仓库 OSM 街道中心线四至推导；真实场馆边界与入口位置待人工核实。
    points: [
      { position: [113.3195, 23.1404], label: '活动场馆', kind: 'event', color: RED, poi: 'event', labelOffset: [14, -18] },
      { position: [113.3195, 23.1433], label: '北入口', kind: 'entry', color: VIOLET, poi: 'entry', labelOffset: [12, -12] },
      { position: [113.3227, 23.1404], label: '东入口', kind: 'entry', color: VIOLET, poi: 'entry', labelOffset: [12, -12] },
      { position: [113.3195, 23.1373], label: '南入口', kind: 'entry', color: VIOLET, poi: 'entry', labelOffset: [12, 12] },
      { position: [113.3163, 23.1412], label: '安保集结', kind: 'resource', color: BLUE, poi: 'assembly', labelOffset: [-12, -12] },
      { position: [113.3227, 23.1393], label: '医疗保障', kind: 'resource', color: GREEN, poi: 'medical', labelOffset: [12, 12] },
      { position: [113.3174, 23.1377], label: '西侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [-12, 12] },
      { position: [113.3217, 23.143], label: '东侧上游点位', kind: 'camera', color: VIOLET, labelOffset: [12, -14] },
    ],
    routes: [
      {
        fromLabel: '安保集结',
        toLabel: '活动场馆',
        color: [59, 130, 246, 200],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '医疗保障',
        toLabel: '活动场馆',
        color: [14, 154, 167, 200],
        layer: 'routes',
        width: 4,
      },
      {
        eventLabel: '活动场馆',
        color: [199, 120, 22, 175],
        layer: 'traffic',
        state: 'attention',
        width: 2,
      },
    ],
  },
  routine: {
    title: '高层火情响应态势',
    area: '荔湾区人民南路 · 广州民间金融大厦',
    summary: '28 层演练情景与三类 Signal 汇聚',
    center: [113.253289, 23.113914],
    zoom: 17.6,
    areas: [
      { position: [113.25329, 23.11391], radius: 620, color: RED, layer: 'base' },
      { position: [113.25829, 23.11781], radius: 420, color: BLUE, layer: 'weather' },
    ],
    // 响应资源为演示锚点，落在范围圈内的可达路网附近；不代表真实站点或实时可用资源。
    points: [
      { position: [113.25329, 23.11391], label: '18 层演练点', kind: 'event', color: RED, poi: 'event' },
      { position: [113.251, 23.1125], label: '消防参考', kind: 'resource', color: RED, poi: 'fire_station' },
      { position: [113.25575, 23.11425], label: '医疗参考', kind: 'resource', color: GREEN, poi: 'hospital' },
    ],
    signals: {
      anchorLabel: '18 层演练点',
      labels: ['舆情线索', '报警人语音', '现场多模态信息'],
    },
    routes: [
      {
        fromLabel: '消防参考',
        toLabel: '18 层演练点',
        color: [229, 72, 77, 200],
        layer: 'routes',
        width: 4,
      },
      {
        fromLabel: '医疗参考',
        toLabel: '18 层演练点',
        color: [14, 154, 167, 200],
        layer: 'routes',
        width: 4,
      },
      {
        eventLabel: '18 层演练点',
        color: [199, 120, 22, 170],
        layer: 'traffic',
        state: 'attention',
        width: 2,
      },
    ],
  },
}

export interface ScenarioMapProps {
  scenario: ScenarioMapVariant
  activeStep: number
  layers: MapLayerVisibility
}

/**
 * 场景层只保留说明性 HUD；真实道路、建筑、地名与所有可交互控件都由
 * 下方同一个 CityMap/MapLibre 实例渲染，避免再次出现一套独立 SVG 地图语言。
 */
export const ScenarioMap = memo(function ScenarioMap({ scenario, activeStep }: ScenarioMapProps) {
  const meta = SCENARIO_MAP_CONFIGS[scenario]
  const step = Math.min(8, Math.max(0, Math.round(activeStep === 5 ? 4 : activeStep)))
  const titleCard = scenario === 'routine' ? (
    <div className="shrink-0 rounded-xl border border-line bg-white/95 px-3 py-2.5 shadow-panel backdrop-blur-sm">
      <h2 className="text-section font-semibold text-ink-1">{meta.title}</h2>
      <p className="mt-1 text-footnote text-ink-2">{meta.area}</p>
    </div>
  ) : (
    <div className="shrink-0 rounded-xl border border-line bg-white/95 px-3 py-2.5 shadow-panel backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-accent-strong" />
        <h2 className="text-section font-semibold text-ink-1">{meta.title}</h2>
      </div>
      <p className="mt-1 text-footnote text-ink-2">{meta.area} · {meta.summary}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-ink-3">
        <span>当前：{stepLabel(step)}</span>
        <OriginMark
          origin="simulated"
          note="事件、范围、路线、资源状态和点位为演示数据；底图与地名来自公开地图。"
        />
      </div>
    </div>
  )

  return (
    <aside className="pointer-events-none absolute inset-0 z-10" aria-label={`${meta.title}，演示场景说明`}>
      {scenario === 'routine' ? (
        <>
          <div className="absolute left-3 top-3 flex w-[300px] max-w-[calc(100%_-_1.5rem)] flex-col gap-2">
            {titleCard}
            <FloorStatusPanel
              buildingName={ROUTINE_HIGH_RISE.buildingName}
              totalFloors={ROUTINE_HIGH_RISE.totalFloors}
              fireFloor={ROUTINE_HIGH_RISE.fireFloor}
              smokeFloor={ROUTINE_HIGH_RISE.smokeFloor}
              reportedFloor={ROUTINE_HIGH_RISE.reportedFloor}
              refugeFloor={ROUTINE_HIGH_RISE.refugeFloor}
            />
          </div>
        </>
      ) : (
        <div className="absolute left-3 top-3 max-w-[58%]">{titleCard}</div>
      )}
    </aside>
  )
})

function stepLabel(step: number) {
  if (step <= 1) return '信号归并'
  if (step <= 3) return '态势补齐'
  if (step <= 5) return '方案比较'
  if (step <= 7) return '协同反馈'
  return '复盘评估'
}

export default ScenarioMap
