import type { ExecutionDefinition } from '../execution/executionPlayback'

import type { HistorySource, PublicFact, SimulationRun } from './history516'

export const STATION_HISTORY_SOURCE: HistorySource = {
  title: '中国日报 2015-03-06 13:33 报道',
  href: 'https://www.chinadaily.com.cn/dfpd/gd/2015-03/06/content_19738864_3.htm',
}

export const STATION_PUBLIC_FACTS: PublicFact[] = [
  { label: '日期', value: '2015-03-06', source: STATION_HISTORY_SOURCE, status: '公开报道' },
  { label: '民警发现时刻', value: '上午 8 时 20 分许', source: STATION_HISTORY_SOURCE, status: '公开报道', note: '只把报道中的粗粒度时刻作为公开锚点。' },
  { label: '地点', value: '广州火车站站外广场', source: STATION_HISTORY_SOURCE, status: '公开报道' },
  { label: '伤者数量', value: '9 人受伤（当日通报口径）', source: STATION_HISTORY_SOURCE, status: '公开报道', note: '不采用未核实的其他数字。' },
  { label: '公开处置粗序列', value: '发现 → 疏散周边群众并鸣枪示警 → 示警无效后击毙 1 人、击伤并抓获 1 人', source: STATION_HISTORY_SOURCE, status: '公开报道', note: '报道没有分段精确时刻，不在产品中补造。' },
  { label: '现场封锁解除', value: '至当日 13:33 报道发布时已解除', source: STATION_HISTORY_SOURCE, status: '公开报道' },
  { label: '警力编成、路线、医院分流、签收', value: '未公开 / 未核实', source: STATION_HISTORY_SOURCE, status: '未公开', note: '仅可进入公众信息约束下的演示轨。' },
]

export const STATION_SIMULATION_RUNS: Record<'baseline' | 'cityos', SimulationRun> = {
  baseline: {
    id: 'baseline',
    title: '常规处置演示（对照组）',
    subtitle: '只用当前公开路网和声明的资源假设构造，不代表 2015 年真实警力、路线或医疗分流。',
    assumptionSetId: 'station-20150306-public-constraints-v1',
    mapSnapshot: '当前公开 OSM 地理快照（非 2015 年现场底图）',
    modelVersion: 'CityOS demo-model v2',
    etaMinutes: 10.8,
    coverageRisk: '注意',
    assumptions: [
      { label: '演示响应编成', value: '2 组警务 + 1 组医疗', affects: 'ETA 与辖区覆盖' },
      { label: '演示出发点', value: '公开静态 POI + 演示可用状态', affects: '路线与 ETA' },
      { label: '演示协同方式', value: '顺序响应与外围疏导', affects: '任务开始时间' },
    ],
    timeline: [
      { at: 0, label: 'T+0', detail: '加载公开锚点与未公开项' },
      { at: 28, label: 'T+3', detail: '演示响应与医疗联络' },
      { at: 62, label: 'T+7', detail: '演示外围疏导与路线推进' },
      { at: 100, label: 'T+11', detail: '演示到场并等待现场核验' },
    ],
  },
  cityos: {
    id: 'cityos',
    title: 'CityOS 协同处置演示',
    subtitle: '与常规对照共用公开时间地点、同一组演示假设、同一路网快照和同一模型，只比较两种演示方案。',
    assumptionSetId: 'station-20150306-public-constraints-v1',
    mapSnapshot: '当前公开 OSM 地理快照（非 2015 年现场底图）',
    modelVersion: 'CityOS demo-model v2',
    etaMinutes: 8.6,
    coverageRisk: '较低',
    assumptions: [
      { label: '演示响应编成', value: '2 组警务 + 1 组医疗', affects: 'ETA 与辖区覆盖' },
      { label: '演示出发点', value: '公开静态 POI + 演示可用状态', affects: '路线与 ETA' },
      { label: '演示协同方式', value: '核心响应、外围疏导、医疗接应并行', affects: '任务开始时间' },
    ],
    timeline: [
      { at: 0, label: 'T+0', detail: '加载同一公开锚点与缺口' },
      { at: 22, label: 'T+2', detail: '演示任务并行签收' },
      { at: 54, label: 'T+5', detail: '演示车辆与路口协同推进' },
      { at: 100, label: 'T+9', detail: '演示到场并等待现场核验' },
    ],
  },
}

export const STATION_EXECUTIONS: Record<'baseline' | 'cityos', ExecutionDefinition> = {
  baseline: {
    id: 'station-20150306-baseline-v1',
    scenarioId: 'haizhu-police',
    title: '广州火车站基线处置演示',
    durationSec: 24,
    units: [
      { id: 'station-baseline-police-1', label: '演示警务 01', kind: 'police', routeRole: 'primary', departAt: 2, arriveAt: 19 },
      { id: 'station-baseline-police-2', label: '演示警务 02', kind: 'police', routeRole: 'secondary', departAt: 4, arriveAt: 22 },
      { id: 'station-baseline-medical-1', label: '演示医疗 01', kind: 'medical', routeRole: 'medical', departAt: 5, arriveAt: 23 },
    ],
    intersections: [
      { id: 'station-baseline-junction-1', label: '演示站西路口', routeRole: 'primary', progress: 0.34, openAt: 7, closeAt: 12 },
      { id: 'station-baseline-junction-2', label: '演示站南路口', routeRole: 'secondary', progress: 0.58, openAt: 11, closeAt: 17 },
      { id: 'station-baseline-junction-3', label: '演示医疗通道口', routeRole: 'medical', progress: 0.76, openAt: 15, closeAt: 21 },
    ],
    roadCues: [
      { id: 'station-baseline-slow', label: '演示站南路缓行', routeRole: 'secondary', state: 'slow', startAt: 6, endAt: 18 },
    ],
    tasks: [
      { id: 'station-baseline-task-response', label: '演示站区响应', department: '警务', startAt: 1, completeAt: 19 },
      { id: 'station-baseline-task-crowd', label: '演示外围疏导', department: '站区协同', startAt: 5, completeAt: 21 },
      { id: 'station-baseline-task-medical', label: '演示医疗接应', department: '医疗', startAt: 6, completeAt: 23 },
    ],
    alerts: [
      { id: 'station-baseline-alert-slow', label: '演示道路缓行', detail: '站南路演示缓行状态已计入 ETA。', at: 7, severity: 'warning' },
    ],
    onsiteNodes: [
      { id: 'station-baseline-node-camera', label: '演示视频点位', routeRole: 'primary', progress: 0.9, revealAt: 17, kind: 'camera' },
      { id: 'station-baseline-node-report', label: '演示现场回报', routeRole: 'primary', progress: 1, revealAt: 20, kind: 'report' },
      { id: 'station-baseline-node-crew', label: '演示到场力量', routeRole: 'primary', progress: 1, revealAt: 23, kind: 'crew' },
    ],
  },
  cityos: {
    id: 'station-20150306-cityos-v1',
    scenarioId: 'haizhu-police',
    title: '广州火车站 CityOS 方案演示',
    durationSec: 20,
    units: [
      { id: 'station-cityos-police-1', label: '演示警务 01', kind: 'police', routeRole: 'primary', departAt: 1, arriveAt: 15 },
      { id: 'station-cityos-police-2', label: '演示警务 02', kind: 'police', routeRole: 'secondary', departAt: 2, arriveAt: 17 },
      { id: 'station-cityos-medical-1', label: '演示医疗 01', kind: 'medical', routeRole: 'medical', departAt: 3, arriveAt: 19 },
    ],
    intersections: [
      { id: 'station-cityos-junction-1', label: '演示站西路口', routeRole: 'primary', progress: 0.3, openAt: 4, closeAt: 8 },
      { id: 'station-cityos-junction-2', label: '演示站南路口', routeRole: 'secondary', progress: 0.56, openAt: 7, closeAt: 13 },
      { id: 'station-cityos-junction-3', label: '演示医疗通道口', routeRole: 'medical', progress: 0.75, openAt: 11, closeAt: 17 },
    ],
    roadCues: [
      { id: 'station-cityos-slow', label: '演示站南路缓行', routeRole: 'secondary', state: 'slow', startAt: 5, endAt: 10 },
      { id: 'station-cityos-closed', label: '演示核心区局部封闭', routeRole: 'primary', state: 'closed', startAt: 8, endAt: 14, fromProgress: 0.76, toProgress: 0.94 },
      { id: 'station-cityos-detour', label: '演示站南路绕行', routeRole: 'secondary', state: 'detour', startAt: 10, endAt: 17 },
    ],
    tasks: [
      { id: 'station-cityos-task-response', label: '演示核心响应', department: '警务', startAt: 1, completeAt: 15 },
      { id: 'station-cityos-task-crowd', label: '演示外围疏导', department: '站区协同', startAt: 3, completeAt: 17, blockedByAlertId: 'station-cityos-alert-blocked' },
      { id: 'station-cityos-task-medical', label: '演示医疗接应', department: '医疗', startAt: 4, completeAt: 19 },
    ],
    alerts: [
      { id: 'station-cityos-alert-route', label: '演示路线状态更新', detail: '站南路缓行，次路线已准备受控绕行。', at: 6, severity: 'info' },
      { id: 'station-cityos-alert-blocked', label: '演示外围任务未签收', detail: '异常分支在此暂停，需人工确认后重新执行。', at: 9, severity: 'critical', blocking: true },
    ],
    onsiteNodes: [
      { id: 'station-cityos-node-camera', label: '演示视频点位', routeRole: 'primary', progress: 0.9, revealAt: 13, kind: 'camera' },
      { id: 'station-cityos-node-report', label: '演示现场回报', routeRole: 'primary', progress: 1, revealAt: 16, kind: 'report' },
      { id: 'station-cityos-node-crew', label: '演示到场力量', routeRole: 'primary', progress: 1, revealAt: 18, kind: 'crew' },
    ],
  },
}
