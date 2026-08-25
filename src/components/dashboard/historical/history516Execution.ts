import type { ExecutionDefinition } from '../execution/executionPlayback'

/**
 * 压缩到 24 秒的演示时间轴。所有车辆、路口、道路状态和任务均为演示数据，
 * 只复用 5·16 公开事件的位置与时间锚点，不代表 2024 年真实调派记录。
 */
export const HISTORY_516_EXECUTIONS: Record<'baseline' | 'cityos', ExecutionDefinition> = {
  baseline: {
    id: 'history-516-baseline-v1',
    scenarioId: 'liwan-fire',
    title: '5·16 基线处置演示',
    durationSec: 24,
    units: [
      { id: 'baseline-fire-1', label: '演示消防 01', kind: 'fire', routeRole: 'primary', departAt: 2, arriveAt: 20 },
      { id: 'baseline-fire-2', label: '演示消防 02', kind: 'fire', routeRole: 'secondary', departAt: 4, arriveAt: 22 },
      { id: 'baseline-police-1', label: '演示警务 01', kind: 'police', routeRole: 'secondary', departAt: 5, arriveAt: 23 },
      { id: 'baseline-medical-1', label: '演示医疗 01', kind: 'medical', routeRole: 'medical', departAt: 4, arriveAt: 21 },
    ],
    intersections: [
      { id: 'baseline-junction-1', label: '演示路口 A', routeRole: 'primary', progress: 0.34, openAt: 7, closeAt: 12 },
      { id: 'baseline-junction-2', label: '演示路口 B', routeRole: 'primary', progress: 0.62, openAt: 12, closeAt: 17 },
      { id: 'baseline-junction-3', label: '演示路口 C', routeRole: 'secondary', progress: 0.76, openAt: 16, closeAt: 21 },
    ],
    roadCues: [
      { id: 'baseline-slow-primary', label: '演示主路线缓行', routeRole: 'primary', state: 'slow', startAt: 6, endAt: 18 },
    ],
    tasks: [
      { id: 'baseline-task-dispatch', label: '演示资源联络', department: '消防', startAt: 1, completeAt: 7 },
      { id: 'baseline-task-traffic', label: '演示外围引导', department: '交警', startAt: 6, completeAt: 17 },
      { id: 'baseline-task-medical', label: '演示医疗接应', department: '医疗', startAt: 8, completeAt: 21 },
      { id: 'baseline-task-onsite', label: '演示现场核验', department: '现场组', startAt: 20, completeAt: 24 },
    ],
    alerts: [
      { id: 'baseline-alert-slow', label: '演示道路缓行', detail: '主路线出现演示缓行状态，ETA 已重新估算。', at: 7, severity: 'warning' },
    ],
    onsiteNodes: [
      { id: 'baseline-node-camera', label: '演示视频点位', routeRole: 'primary', progress: 0.92, revealAt: 18, kind: 'camera' },
      { id: 'baseline-node-report', label: '演示现场回报', routeRole: 'primary', progress: 1, revealAt: 21, kind: 'report' },
      { id: 'baseline-node-crew', label: '演示到场力量', routeRole: 'primary', progress: 1, revealAt: 23, kind: 'crew' },
    ],
  },
  cityos: {
    id: 'history-516-cityos-v1',
    scenarioId: 'liwan-fire',
    title: '5·16 CityOS 方案演示',
    durationSec: 20,
    units: [
      { id: 'cityos-fire-1', label: '演示消防 01', kind: 'fire', routeRole: 'primary', departAt: 1, arriveAt: 16 },
      { id: 'cityos-fire-2', label: '演示消防 02', kind: 'fire', routeRole: 'secondary', departAt: 2, arriveAt: 18 },
      { id: 'cityos-police-1', label: '演示警务 01', kind: 'police', routeRole: 'secondary', departAt: 2, arriveAt: 17 },
      { id: 'cityos-medical-1', label: '演示医疗 01', kind: 'medical', routeRole: 'medical', departAt: 3, arriveAt: 19 },
    ],
    intersections: [
      { id: 'cityos-junction-1', label: '演示路口 A', routeRole: 'primary', progress: 0.28, openAt: 4, closeAt: 8 },
      { id: 'cityos-junction-2', label: '演示路口 B', routeRole: 'primary', progress: 0.56, openAt: 8, closeAt: 13 },
      { id: 'cityos-junction-3', label: '演示路口 C', routeRole: 'secondary', progress: 0.78, openAt: 11, closeAt: 17 },
    ],
    roadCues: [
      { id: 'cityos-slow-secondary', label: '演示次路线缓行', routeRole: 'secondary', state: 'slow', startAt: 5, endAt: 11 },
      { id: 'cityos-closed-onsite', label: '演示现场周边封闭', routeRole: 'primary', state: 'closed', startAt: 9, endAt: 15, fromProgress: 0.82, toProgress: 0.96 },
      { id: 'cityos-detour-secondary', label: '演示次路线绕行', routeRole: 'secondary', state: 'detour', startAt: 11, endAt: 18 },
    ],
    tasks: [
      { id: 'cityos-task-dispatch', label: '演示任务包签收', department: '消防', startAt: 1, completeAt: 4 },
      { id: 'cityos-task-traffic', label: '演示路口放行', department: '交警', startAt: 4, completeAt: 14, blockedByAlertId: 'cityos-alert-blocked' },
      { id: 'cityos-task-medical', label: '演示医疗接应', department: '医疗', startAt: 5, completeAt: 17 },
      { id: 'cityos-task-onsite', label: '演示现场信息回传', department: '现场组', startAt: 15, completeAt: 20 },
    ],
    alerts: [
      { id: 'cityos-alert-route', label: '演示路线状态更新', detail: '次路线出现缓行，已准备受控绕行。', at: 6, severity: 'info' },
      { id: 'cityos-alert-blocked', label: '演示路口指令未签收', detail: '异常分支在此暂停，需人工确认后重新执行。', at: 9, severity: 'critical', blocking: true },
    ],
    onsiteNodes: [
      { id: 'cityos-node-camera', label: '演示视频点位', routeRole: 'primary', progress: 0.9, revealAt: 13, kind: 'camera' },
      { id: 'cityos-node-report', label: '演示现场回报', routeRole: 'primary', progress: 1, revealAt: 16, kind: 'report' },
      { id: 'cityos-node-crew', label: '演示到场力量', routeRole: 'primary', progress: 1, revealAt: 18, kind: 'crew' },
    ],
  },
}
