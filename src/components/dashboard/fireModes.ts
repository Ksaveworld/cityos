import type { Confidence } from '@/engine'

import type { DashboardScenario } from './scenarios'

export type FireMode = 'public-review' | 'routine-simulation'

export const FIRE_MODE_OPTIONS: Array<{ id: FireMode; label: string }> = [
  { id: 'public-review', label: '5·16 公开复盘' },
  { id: 'routine-simulation', label: '日常响应演示' },
]

export const ROUTINE_HIGH_RISE = {
  buildingName: '广州民间金融大厦',
  totalFloors: 28,
  fireFloor: 18,
  smokeFloor: 19,
  reportedFloor: 20,
  refugeFloor: 16,
  title: '【演示】广州民间金融大厦高层办公楼火情联动',
  address: '荔湾区人民南路 · 广州民间金融大厦',
  buildingLevels: '地上 28 层',
  buildingUse: '商业办公',
  alarmAt: Math.floor(Date.parse('2025-08-11T15:00:00+08:00') / 1000),
  alarmLabel: '2025-08-11 15:00（演示接警）',
  drillFloor: '18 层',
  sourceNote:
    '建筑轮廓与层数来自 OSM 公开数据；火情、Signal 与处置状态均为演示，未发生真实火情',
} as const

export interface RoutineSignalSample {
  id: string
  channel: string
  sourceLabel: string
  timestamp: number
  summary: string
  mapping: string
  confidence: Confidence
  originNote: string
}

export const ROUTINE_HIGH_RISE_SIGNALS: RoutineSignalSample[] = [
  {
    id: 'routine-multimodal',
    channel: '现场多模态',
    sourceLabel: '物业演练回传',
    timestamp: ROUTINE_HIGH_RISE.alarmAt,
    summary: '演示画面样例附带文字备注：“18 层电气线路故障演练，现场持续冒烟。”',
    mapping: '事件楼栋 · 18 层',
    confidence: 'reported',
    originNote: '演示多模态输入样例；未接入真实画面或设备源。',
  },
  {
    id: 'routine-alarm-voice',
    channel: '报警人语音',
    sourceLabel: '演练报警人',
    timestamp: ROUTINE_HIGH_RISE.alarmAt + 60,
    summary: '演示语音样例附带文字稿：“人民南路这栋写字楼 18 层有浓烟，楼层人员正在疏散。”',
    mapping: '事件楼栋 · 楼层待人工确认',
    confidence: 'reported',
    originNote: '演示报警语音输入样例；未接入真实 119 语音源。',
  },
  {
    id: 'routine-public-opinion',
    channel: '舆情线索',
    sourceLabel: '演示社交平台文本',
    timestamp: ROUTINE_HIGH_RISE.alarmAt + 180,
    summary: '演示文本样例：“人民南路那边一栋高楼有烟，具体楼层不清楚。”',
    mapping: '街区级待确认线索 · 不建真实事件单',
    confidence: 'reported',
    originNote: '演示舆情输入样例；未接入真实平台或采集源。',
  },
]

export const ROUTINE_HIGH_RISE_SCENARIO: DashboardScenario = {
  id: 'liwan-fire',
  tab: '荔湾火情',
  title: ROUTINE_HIGH_RISE.title,
  subtitle: `${ROUTINE_HIGH_RISE.buildingLevels} · ${ROUTINE_HIGH_RISE.drillFloor}演练情景`,
  address: ROUTINE_HIGH_RISE.address,
  kind: 'fire',
  typeLabel: '火情',
  statusLabel: '演示演练',
  updatedAt: '15:03',
  origin: 'simulated',
  originNote: ROUTINE_HIGH_RISE.sourceNote,
  states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
  notes: [
    '三类 Signal 以演示输入样例展示；每条均明确标注未接入真实源。',
    '演示事件归并到人民南路高层办公楼演练场景，不生成真实事件单。',
    '楼层与用途参考公开规划；人员、设施和资源实时状态均未接入。',
    '只展示演示态势摘要，并保留需人工确认的信息缺口。',
    '比较“就近楼层核查”和“疏散优先、外围保障”两种演示响应顺序；不复用 5·16 路线或 ETA。',
    '由人工确认演练响应顺序与信息缺口；界面只记录选择，不向真实部门发送。',
    '生成楼层核查、疏散引导、消防联络与医疗待命的演示任务草案。',
    '展示“楼层待核实、疏散进行中、保障点待命”的演示反馈样例，不代表真实回执。',
    '回看三类 Signal、信息缺口和人工门禁；演示报告不建立真实处置基线。',
  ],
}

export function resolveFireScenario(publicScenario: DashboardScenario, mode: FireMode) {
  return mode === 'routine-simulation' ? ROUTINE_HIGH_RISE_SCENARIO : publicScenario
}
