export type ExecutionBranch = 'normal' | 'blocked'

export type ExecutionTransport = 'ready' | 'playing' | 'paused' | 'blocked' | 'ended'

export type ExecutionUnitKind = 'fire' | 'police' | 'medical'

export type ExecutionRouteRole = 'primary' | 'secondary' | 'medical'

export type ExecutionRoadState = 'normal' | 'slow' | 'closed' | 'detour'

export type ExecutionTaskState = 'pending' | 'executing' | 'completed' | 'blocked'

export interface ExecutionUnitDefinition {
  id: string
  label: string
  kind: ExecutionUnitKind
  routeRole: ExecutionRouteRole
  departAt: number
  arriveAt: number
}

export interface ExecutionIntersectionDefinition {
  id: string
  label: string
  routeRole: ExecutionRouteRole
  progress: number
  openAt: number
  closeAt: number
}

export interface ExecutionRoadCue {
  id: string
  label: string
  routeRole: ExecutionRouteRole
  state: ExecutionRoadState
  startAt: number
  endAt?: number
  /** 只覆盖路线中的局部路段；缺省为整条路线。 */
  fromProgress?: number
  toProgress?: number
}

export interface ExecutionTaskDefinition {
  id: string
  label: string
  department: string
  startAt: number
  completeAt: number
  blockedByAlertId?: string
}

export interface ExecutionAlertDefinition {
  id: string
  label: string
  detail: string
  at: number
  severity: 'info' | 'warning' | 'critical'
  blocking?: boolean
}

export interface ExecutionOnsiteNodeDefinition {
  id: string
  label: string
  routeRole: ExecutionRouteRole
  progress: number
  revealAt: number
  kind: 'camera' | 'report' | 'crew'
}

export interface ExecutionDefinition {
  id: string
  scenarioId: string
  title: string
  durationSec: number
  units: ExecutionUnitDefinition[]
  intersections: ExecutionIntersectionDefinition[]
  roadCues: ExecutionRoadCue[]
  tasks: ExecutionTaskDefinition[]
  alerts: ExecutionAlertDefinition[]
  onsiteNodes: ExecutionOnsiteNodeDefinition[]
}

export interface ExecutionPlaybackState {
  definitionId: string
  playheadSec: number
  transport: ExecutionTransport
  branch: ExecutionBranch
  attemptNo: 1 | 2
}

export interface ExecutionUnitFrame extends ExecutionUnitDefinition {
  progress: number
  status: 'waiting' | 'enroute' | 'arrived'
}

export interface ExecutionIntersectionFrame extends ExecutionIntersectionDefinition {
  status: 'pending' | 'open' | 'restored'
}

export interface ExecutionTaskFrame extends ExecutionTaskDefinition {
  status: ExecutionTaskState
}

export interface ExecutionFrame {
  definitionId: string
  playheadSec: number
  progress: number
  phase: 'dispatch' | 'routing' | 'onsite' | 'feedback'
  units: ExecutionUnitFrame[]
  intersections: ExecutionIntersectionFrame[]
  roadCues: ExecutionRoadCue[]
  tasks: ExecutionTaskFrame[]
  visibleAlerts: ExecutionAlertDefinition[]
  onsiteNodes: ExecutionOnsiteNodeDefinition[]
  incidentStage: '待出发' | '协同在途' | '现场核验' | '执行反馈'
  blockingAlert: ExecutionAlertDefinition | null
}

export interface ExecutionDefinitionValidation {
  ok: boolean
  errors: string[]
}

export function createExecutionPlaybackState(definition: ExecutionDefinition): ExecutionPlaybackState {
  return {
    definitionId: definition.id,
    playheadSec: 0,
    transport: 'ready',
    branch: 'normal',
    attemptNo: 1,
  }
}

export function validateExecutionDefinition(definition: ExecutionDefinition): ExecutionDefinitionValidation {
  const errors: string[] = []
  if (!definition.id.trim()) errors.push('执行定义缺少 id')
  if (!definition.scenarioId.trim()) errors.push('执行定义缺少 scenarioId')
  if (!(definition.durationSec > 0)) errors.push('执行时长必须大于 0')

  const ids = new Set<string>()
  const register = (kind: string, id: string) => {
    if (!id.trim()) {
      errors.push(`${kind} 缺少 id`)
      return
    }
    if (ids.has(id)) errors.push(`执行定义存在重复 id：${id}`)
    ids.add(id)
  }

  for (const unit of definition.units) {
    register('车辆', unit.id)
    if (unit.departAt < 0 || unit.arriveAt <= unit.departAt || unit.arriveAt > definition.durationSec) {
      errors.push(`车辆 ${unit.id} 的出发/到场时间无效`)
    }
  }
  for (const intersection of definition.intersections) {
    register('路口', intersection.id)
    if (intersection.progress < 0 || intersection.progress > 1) errors.push(`路口 ${intersection.id} 的路线进度无效`)
    if (intersection.openAt < 0 || intersection.closeAt <= intersection.openAt || intersection.closeAt > definition.durationSec) {
      errors.push(`路口 ${intersection.id} 的开路时间窗无效`)
    }
  }
  for (const cue of definition.roadCues) {
    register('道路状态', cue.id)
    if (cue.startAt < 0 || cue.startAt > definition.durationSec || (cue.endAt !== undefined && cue.endAt <= cue.startAt)) {
      errors.push(`道路状态 ${cue.id} 的时间窗无效`)
    }
    const fromProgress = cue.fromProgress ?? 0
    const toProgress = cue.toProgress ?? 1
    if (fromProgress < 0 || toProgress > 1 || toProgress <= fromProgress) {
      errors.push(`道路状态 ${cue.id} 的路线区间无效`)
    }
  }
  for (const task of definition.tasks) {
    register('任务', task.id)
    if (task.startAt < 0 || task.completeAt <= task.startAt || task.completeAt > definition.durationSec) {
      errors.push(`任务 ${task.id} 的执行时间无效`)
    }
  }
  for (const alert of definition.alerts) {
    register('告警', alert.id)
    if (alert.at < 0 || alert.at > definition.durationSec) errors.push(`告警 ${alert.id} 的出现时间无效`)
  }
  for (const node of definition.onsiteNodes) {
    register('现场节点', node.id)
    if (node.progress < 0 || node.progress > 1) errors.push(`现场节点 ${node.id} 的路线进度无效`)
    if (node.revealAt < 0 || node.revealAt > definition.durationSec) errors.push(`现场节点 ${node.id} 的出现时间无效`)
  }

  const alertIds = new Set(definition.alerts.map((alert) => alert.id))
  for (const task of definition.tasks) {
    if (task.blockedByAlertId && !alertIds.has(task.blockedByAlertId)) {
      errors.push(`任务 ${task.id} 引用了不存在的告警 ${task.blockedByAlertId}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

export function deriveExecutionFrame(
  definition: ExecutionDefinition,
  playback: Pick<ExecutionPlaybackState, 'playheadSec' | 'branch'>,
): ExecutionFrame {
  const requestedPlayhead = clamp(playback.playheadSec, 0, definition.durationSec)
  const blockingAlert = playback.branch === 'blocked'
    ? definition.alerts.find((alert) => alert.blocking && alert.at <= requestedPlayhead) ?? null
    : null
  const playheadSec = blockingAlert ? blockingAlert.at : requestedPlayhead

  const units = definition.units.map<ExecutionUnitFrame>((unit) => {
    if (playheadSec < unit.departAt) return { ...unit, progress: 0, status: 'waiting' }
    if (playheadSec >= unit.arriveAt) return { ...unit, progress: 1, status: 'arrived' }
    return {
      ...unit,
      progress: (playheadSec - unit.departAt) / (unit.arriveAt - unit.departAt),
      status: 'enroute',
    }
  })

  const intersections = definition.intersections.map<ExecutionIntersectionFrame>((intersection) => ({
    ...intersection,
    status: playheadSec < intersection.openAt
      ? 'pending'
      : playheadSec <= intersection.closeAt
        ? 'open'
        : 'restored',
  }))

  const roadCues = definition.roadCues.filter((cue) => (
    cue.startAt <= playheadSec && (cue.endAt === undefined || playheadSec < cue.endAt)
  ))
  const visibleAlerts = definition.alerts.filter((alert) => (
    alert.at <= playheadSec && (!alert.blocking || playback.branch === 'blocked')
  ))
  const tasks = definition.tasks.map<ExecutionTaskFrame>((task) => {
    const isBlocked = Boolean(
      blockingAlert
      && task.blockedByAlertId === blockingAlert.id
      && playheadSec >= blockingAlert.at,
    )
    return {
      ...task,
      status: isBlocked
        ? 'blocked'
        : playheadSec < task.startAt
          ? 'pending'
          : playheadSec < task.completeAt
            ? 'executing'
            : 'completed',
    }
  })
  const onsiteNodes = definition.onsiteNodes.filter((node) => node.revealAt <= playheadSec)
  const arrivedCount = units.filter((unit) => unit.status === 'arrived').length
  const allArrived = units.length > 0 && arrivedCount === units.length
  const firstDepartAt = Math.min(...definition.units.map((unit) => unit.departAt), definition.durationSec)
  const firstArriveAt = Math.min(...definition.units.map((unit) => unit.arriveAt), definition.durationSec)
  const phase = playheadSec < firstDepartAt
    ? 'dispatch'
    : playheadSec < firstArriveAt
      ? 'routing'
      : allArrived
        ? 'feedback'
        : 'onsite'
  const incidentStage = phase === 'dispatch'
    ? '待出发'
    : phase === 'routing'
      ? '协同在途'
      : phase === 'onsite'
        ? '现场核验'
        : '执行反馈'

  return {
    definitionId: definition.id,
    playheadSec,
    progress: definition.durationSec === 0 ? 0 : playheadSec / definition.durationSec,
    phase,
    units,
    intersections,
    roadCues,
    tasks,
    visibleAlerts,
    onsiteNodes,
    incidentStage,
    blockingAlert,
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
