import type { ExecutionBranch } from '../execution/executionPlayback'

export type HistoricalTrack = 'facts' | 'baseline' | 'cityos'

export interface HistoricalPlaybackState {
  track: HistoricalTrack
  playheadSec: number
  playing: boolean
  branch: ExecutionBranch
}

export interface HistorySource {
  title: string
  href: string
}

export interface PublicFact {
  label: string
  value: string
  source: HistorySource
  status: '官方公开' | '公开报道' | '未公开'
  note?: string
}

export interface SimulationRun {
  id: HistoricalTrack
  title: string
  subtitle: string
  assumptionSetId?: string
  mapSnapshot: string
  modelVersion?: string
  etaMinutes?: number
  coverageRisk?: string
  assumptions: Array<{ label: string; value: string; affects: string }>
  timeline: Array<{ at: number; label: string; detail: string }>
}

const xinhua: HistorySource = {
  title: '新华网转引广州消防通报',
  href: 'https://www.news.cn/local/20240516/a20dae5834f04200a84df9524b7a65a8/c.html',
}

const liwanNotice: HistorySource = {
  title: '荔湾区政府事故认定公告',
  href: 'https://www.lw.gov.cn/ywdt/tzgg/content/post_9718703.html',
}

export const HISTORY_516_FACTS: PublicFact[] = [
  { label: '接警时刻', value: '2024-05-16 09:32', source: xinhua, status: '官方公开', note: '仅作为公开时间锚点。' },
  { label: '公开地点', value: '人民南路 93 号；认定公告涉及 89、91、93、89-1 号', source: liwanNotice, status: '官方公开', note: '相关场址范围不替代接警地址。' },
  { label: '明火扑灭', value: '11:40', source: xinhua, status: '官方公开', note: '不推定期间具体调派过程。' },
  { label: '人员损失', value: '1 人死亡', source: xinhua, status: '公开报道', note: '不与阶段性救援人数合并推断。' },
  { label: '实际调派、车辆、路线、签收', value: '未公开 / 未核实', source: liwanNotice, status: '未公开', note: '不得显示为原处置事实。' },
]

export const HISTORY_516_RUNS: Record<'baseline' | 'cityos', SimulationRun> = {
  baseline: {
    id: 'baseline',
    title: '常规处置演示（对照组）',
    subtitle: '只用公开时间、地点和声明的演示假设构造，不代表 2024 年实际调派或处置记录。',
    assumptionSetId: '516-public-constraints-v1',
    mapSnapshot: '当前公开 OSM 地理快照（非 2024 现场实时底图）',
    modelVersion: 'CityOS demo-model v2',
    etaMinutes: 10.6,
    coverageRisk: '注意',
    assumptions: [
      { label: '演示资源编成', value: '4 辆演示消防车辆', affects: 'ETA 与覆盖风险' },
      { label: '演示出发点', value: '公开站点位置 + 演示可用状态', affects: '路线与ETA' },
      { label: '默认通道', value: '默认道路可达', affects: '方案A/B' },
    ],
    timeline: [
      { at: 0, label: 'T+0', detail: '加载公开锚点与未公开项' },
      { at: 28, label: 'T+3m', detail: '演示资源集结与路线估算' },
      { at: 58, label: 'T+6m', detail: '演示到场、任务包待签收' },
      { at: 100, label: 'T+10m', detail: '演示外围保障与信息复核' },
    ],
  },
  cityos: {
    id: 'cityos',
    title: 'CityOS 协同处置演示',
    subtitle: '与常规对照使用相同公开信息、同一组演示假设和同一路网快照，只比较两种演示方案。',
    assumptionSetId: '516-public-constraints-v1',
    mapSnapshot: '当前公开 OSM 地理快照（非 2024 现场实时底图）',
    modelVersion: 'CityOS demo-model v2',
    etaMinutes: 8.9,
    coverageRisk: '较低',
    assumptions: [
      { label: '演示资源编成', value: '4 辆演示消防车辆', affects: 'ETA 与覆盖风险' },
      { label: '演示资源点', value: '近端增援点优先', affects: '路线与ETA' },
      { label: '人工门禁', value: '资源调整后需重新批准', affects: '任务包有效性' },
    ],
    timeline: [
      { at: 0, label: 'T+0', detail: '加载同一公开锚点与缺口' },
      { at: 21, label: 'T+2m', detail: '形成 A/B 演示方案并人工批准' },
      { at: 48, label: 'T+5m', detail: '演示资源沿路线推进' },
      { at: 100, label: 'T+9m', detail: '演示到场并等待现场核验' },
    ],
  },
}
