// 地图 POI 形象化标识目录。
//
// 8/20 评审：「高德元素」指的不是路线怎么画，是医院、消防站、封路、红绿灯、摄像头
// 这类在地图上一眼能认出来的形象小标识。这里定义那套标识。
//
// 字形来自 Material Symbols（Apache 2.0），记录见
// public/assets/third-party/material-symbols/SOURCE.md。

export type PoiKind =
  | 'fire'
  | 'fire_station'
  | 'hospital'
  | 'medical'
  | 'vehicle'
  | 'police'
  | 'camera'
  | 'traffic_signal'
  | 'road_closure'
  | 'urban_order'
  | 'hydrant'
  | 'shelter'
  | 'event'
  | 'crash'
  | 'report'
  | 'entry'
  | 'assembly'

/**
 * 数据可信度。**必须用形状区分，不能只靠颜色**（CLAUDE.md 硬约束）：
 * - confirmed  实心徽标，白字形
 * - unverified 白底 + 虚线描边 + 彩色字形
 */
export type PoiConfidence = 'confirmed' | 'unverified'

export interface PoiSpec {
  /** 字形 SVG，作为 CSS mask 使用，不是 <img> */
  glyph: string
  /** 徽标主色 */
  color: string
  /** 无障碍与 tooltip 用的类别名 */
  category: string
}

const GLYPH = (name: string) => `/assets/third-party/material-symbols/${name}.svg`

export const POI_SPECS: Record<PoiKind, PoiSpec> = {
  // 火情用火标、医疗用十字、交通用车标、公安用警徽——按 8/20 评审当面点的图标定的。
  //
  // 火情与消防站必须用**不同的字形**：8/21 评审「火情标和消防站标一样分不清」。
  // 原来两者都用 local_fire_department，只靠大小区分，缩放一变就分不出。
  // 事件是「烧起来的地方」用火苗，设施是「车从哪出来」用消防车。
  fire: { glyph: GLYPH('local_fire_department'), color: '#E5484D', category: '火情' },
  fire_station: { glyph: GLYPH('fire_truck'), color: '#C2410C', category: '消防站' },
  hospital: { glyph: GLYPH('local_hospital'), color: '#12A594', category: '医院' },
  medical: { glyph: GLYPH('local_hospital'), color: '#0E8FC4', category: '医疗保障' },
  vehicle: { glyph: GLYPH('directions_car'), color: '#C77816', category: '交通' },
  police: { glyph: GLYPH('local_police'), color: '#2F6BD8', category: '公安' },
  camera: { glyph: GLYPH('videocam'), color: '#6E56CF', category: '上游视频点位' },
  traffic_signal: { glyph: GLYPH('traffic'), color: '#D98200', category: '交通信号' },
  road_closure: { glyph: GLYPH('block'), color: '#B42318', category: '道路封闭' },
  urban_order: { glyph: GLYPH('campaign'), color: '#C26A2E', category: '市容巡查' },
  hydrant: { glyph: GLYPH('fire_hydrant'), color: '#C2410C', category: '消火栓' },
  shelter: { glyph: GLYPH('night_shelter'), color: '#2A9D5C', category: '避难场所' },
  event: { glyph: GLYPH('emergency'), color: '#E5484D', category: '事件锚点' },
  crash: { glyph: GLYPH('car_crash'), color: '#B42318', category: '交通事故' },
  report: { glyph: GLYPH('campaign'), color: '#C77816', category: '上报来源' },
  entry: { glyph: GLYPH('door_open'), color: '#5B5BD6', category: '出入口' },
  // 紫色对齐「重大布防」的域色。原来是和公安同一个蓝，满图看过去分不出布防和 110
  assembly: { glyph: GLYPH('groups'), color: '#7C3AED', category: '集结点' },
}

/**
 * 场景点位没有显式声明 poi 时的兜底。
 * resource 故意不给兜底——资源到底是消防、医疗还是公安，只能逐个标，
 * 猜错了比画个通用圆点更糟。
 */
export const POI_KIND_BY_SCENARIO_KIND: Record<string, PoiKind | undefined> = {
  event: 'event',
  source: 'report',
  camera: 'camera',
  entry: 'entry',
  resource: undefined,
}

/** source 与 camera 都是「待核实」：来源未经核验，视频点位是演示位置。 */
export const POI_CONFIDENCE_BY_SCENARIO_KIND: Record<string, PoiConfidence> = {
  event: 'confirmed',
  source: 'unverified',
  camera: 'unverified',
  entry: 'confirmed',
  resource: 'confirmed',
}
