import type { DomainFixture, TaskAssignment, TaskDispatchOverride, WorkflowSession } from '../workflow/types'
import { DISPATCH_FACILITIES } from './dispatchData'

export interface ActiveDispatchEvent {
  id: string
  kind: 'daily' | 'historical'
  domain: string
  domainColor: string
  title: string
  location: string
  position?: [number, number]
  timeLabel: string
  sourceLabel: string
  fixture: DomainFixture
  session: WorkflowSession
}

export interface DispatchException {
  department: string
  task: string
  title: string
  detail: string
  signals: string[]
  action: string
  options: TaskDispatchOverride[]
}

export interface DispatchOptionAnalysis {
  benefit: string
  tradeoff: string
  recommended: boolean
  stateReason?: string
  distanceReason?: string
}

function straightLineDistanceKm(left: [number, number], right: [number, number]) {
  const radians = Math.PI / 180
  const leftLatitude = left[1] * radians
  const rightLatitude = right[1] * radians
  const latitudeDelta = (right[1] - left[1]) * radians
  const longitudeDelta = (right[0] - left[0]) * radians
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(haversine))
}

function hospitalComparison(event: ActiveDispatchEvent) {
  const redCross = DISPATCH_FACILITIES.find((facility) => facility.id === 'facility-red-cross')
  const firstPeople = DISPATCH_FACILITIES.find((facility) => facility.id === 'facility-shiyi')
  if (!redCross || !firstPeople) return null
  const redCrossDistance = event.position ? straightLineDistanceKm(event.position, redCross.position) : null
  const firstPeopleDistance = event.position ? straightLineDistanceKm(event.position, firstPeople.position) : null
  return { redCross, firstPeople, redCrossDistance, firstPeopleDistance }
}

function distanceComparisonReason(
  subjectName: string,
  subjectDistance: number | null,
  comparisonName: string,
  comparisonDistance: number | null,
) {
  if (subjectDistance === null || comparisonDistance === null) return ''
  const difference = comparisonDistance - subjectDistance
  const comparison = Math.abs(difference) < 0.05
    ? '两者基本相当'
    : difference > 0
      ? `较${comparisonName}约短 ${Math.abs(difference).toFixed(1)} 公里`
      : `较${comparisonName}约长 ${Math.abs(difference).toFixed(1)} 公里`
  return `按当前事件点与公开静态点位直线测算，${subjectName}约 ${subjectDistance.toFixed(1)} 公里，${comparisonName}约 ${comparisonDistance.toFixed(1)} 公里，${comparison}。`
}

export function resolveDispatchOptionAnalysis(
  event: ActiveDispatchEvent,
  option: TaskDispatchOverride,
  index: number,
): DispatchOptionAnalysis {
  if (event.kind === 'daily') {
    const comparison = hospitalComparison(event)
    const isRedCross = ['hospital-red-cross', 'medical-red-cross'].includes(option.optionId)
    const isFirstPeople = ['hospital-shiyi', 'medical-shiyi'].includes(option.optionId)
    if (comparison && isRedCross) {
      const stateReason = `当前候选台账显示${comparison.redCross.name}“${comparison.redCross.receivingState}”，${comparison.firstPeople.name}“${comparison.firstPeople.receivingState}”，因此先向${comparison.redCross.name}发起接收确认。`
      const distanceReason = distanceComparisonReason(
        comparison.redCross.name,
        comparison.redCrossDistance,
        comparison.firstPeople.name,
        comparison.firstPeopleDistance,
      )
      return {
        benefit: `${stateReason}${distanceReason}`,
        tradeoff: '“可联络”不等于已确认接收，静态直线距离也不等于实际转运耗时；医院实时床位、急救接收能力和院内排队状态仍需回传确认。',
        recommended: true,
        stateReason,
        distanceReason,
      }
    }
    if (comparison && isFirstPeople) {
      const stateReason = `当前候选台账显示${comparison.firstPeople.name}“${comparison.firstPeople.receivingState}”，在取得新的接收回传前不作为第一联络顺序。`
      const distanceReason = distanceComparisonReason(
        comparison.firstPeople.name,
        comparison.firstPeopleDistance,
        comparison.redCross.name,
        comparison.redCrossDistance,
      )
      return {
        benefit: `${stateReason}${distanceReason}`,
        tradeoff: '如果人工已取得新的接收确认，仍可保留这一候选；否则不应仅凭静态距离生成调整任务包。',
        recommended: false,
        stateReason,
        distanceReason,
      }
    }
  }

  return {
    benefit: option.note,
    tradeoff: '页面未接入资源实时状态，确认前仍需核实接收或签收条件。',
    recommended: index === 0,
  }
}

function findAssignment(assignments: TaskAssignment[], terms: string[]) {
  return assignments.find((assignment) => terms.some((term) => assignment.department.includes(term))) ?? assignments[0] ?? null
}

function resolutionOption(
  session: WorkflowSession,
  assignment: TaskAssignment,
  optionId: string,
  optionLabel: string,
  location: string,
  owner: string,
  vehicles: string,
  note: string,
): TaskDispatchOverride {
  return { department: assignment.department, task: session.inputValues.dispatchOverrideTask || assignment.task, optionId, optionLabel, location, owner, vehicles, note }
}

export function resolveDispatchException(event: ActiveDispatchEvent, assignments: TaskAssignment[]): DispatchException | null {
  if (event.session.deliveryStatus !== 'completed' || assignments.length === 0) return null
  // 历史链路每个案例只有一项预置资源异常。人工调整已经写入任务包后，
  // 再次完成执行不能仅因状态回到 completed 就重复抛出同一项异常。
  if (event.kind === 'historical' && event.session.inputValues.dispatchOverrideOptionId) return null

  if (event.fixture.id === 'fire' && event.kind === 'daily') {
    const assignment = findAssignment(assignments, ['医疗'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '医疗协同回传异常',
      detail: '任务包完成后收到新的接收资源状态，原医疗安排需要重新确认。',
      signals: ['周边交通事故增加，接收需求上升', '原医疗单元回传无法继续支援', '备用接收医院需要重新确认'],
      action: '在本页选择新的接收医院，确认后返回任务下发。',
      options: [
        resolutionOption(event.session, assignment, 'hospital-red-cross', '广州市红十字会医院', '广州市红十字会医院', assignment.owner, assignment.vehicles, '接收医院已调整；回传接收确认、到场与异常状态。'),
        resolutionOption(event.session, assignment, 'hospital-shiyi', '广州市第一人民医院', '广州市第一人民医院', assignment.owner, assignment.vehicles, '接收医院已调整；回传接收确认、到场与异常状态。'),
      ],
    }
  }

  if (event.fixture.id === 'fire' && event.kind === 'historical') {
    const assignment = findAssignment(assignments, ['交管', '交通'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '关键路口通行回报超时',
      detail: '原通行协同单元未在时限内返回入口状态。',
      signals: ['人民南路入口状态待确认', '原通行协同回报超时', '需要切换备用通行单元'],
      action: '在本页选择备用通行单元，确认后返回任务下发。',
      options: [
        resolutionOption(event.session, assignment, 'traffic-renmin-north', '人民南路北侧通行协同组', '人民南路北侧入口', '交管协同负责人', '交通协同单元 1 组', '备用通行单元已接替；回传入口状态与受阻情况。'),
        resolutionOption(event.session, assignment, 'traffic-kangwang-south', '康王南路备用通行组', '康王南路备用入口', '交管协同负责人', '交通协同单元 1 组', '备用通行单元已接替；回传入口状态与受阻情况。'),
      ],
    }
  }

  if (event.fixture.id === 'police') {
    const assignment = findAssignment(assignments, ['外围', '站区'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '外围疏导任务签收超时',
      detail: '外围入口压力发生变化，原疏导单元没有按时签收。',
      signals: ['东侧入口人流压力上升', '原外围任务签收超时', '需要切换备用疏导单元'],
      action: '在本页选择备用疏导单元，确认后返回任务下发。',
      options: [
        resolutionOption(event.session, assignment, 'police-west-square', '站区西广场疏导组', '站外广场西侧', '站区外围协调负责人', '疏导单元 1 组', '备用疏导单元已接替；回传入口压力与通道状态。'),
        resolutionOption(event.session, assignment, 'police-huanshi-west', '环市西路外围协同组', '环市西路站区入口', '站区外围协调负责人', '疏导单元 1 组', '备用疏导单元已接替；回传入口压力与通道状态。'),
      ],
    }
  }

  if (event.fixture.id === 'medical') {
    const assignment = findAssignment(assignments, ['医疗'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '接收点能力变化',
      detail: '原接收点状态发生变化，需要重新选择接收医院与转运目的地。',
      signals: ['原接收点能力下降', '转运目的地需要同步更新', '接收确认仍待回传'],
      action: '在本页切换接收医院，确认后返回任务下发。',
      options: [
        resolutionOption(event.session, assignment, 'medical-red-cross', '广州市红十字会医院', '广州市红十字会医院', assignment.owner, assignment.vehicles, '接收点与转运目的地已同步调整；回传接收确认。'),
        resolutionOption(event.session, assignment, 'medical-shiyi', '广州市第一人民医院', '广州市第一人民医院', assignment.owner, assignment.vehicles, '接收点与转运目的地已同步调整；回传接收确认。'),
      ],
    }
  }

  if (event.fixture.id === 'traffic') {
    const assignment = findAssignment(assignments, ['交通', '交管'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '清障单元反馈超时',
      detail: '原清障单元未按时回传到场状态，作业入口需要重新安排。',
      signals: ['原清障单元反馈超时', '当前作业入口受阻', '需要切换备用清障单元'],
      action: '在本页选择备用清障单元，确认后返回任务下发。',
      options: [
        resolutionOption(event.session, assignment, 'traffic-yuexiu-02', '越秀道路保障二组', '中山路西侧作业入口', '道路保障负责人', '清障车 1 辆 + 摩托 2 组', '备用清障单元已接替；回传到场、入口与清障进度。'),
        resolutionOption(event.session, assignment, 'traffic-liwan-01', '荔湾道路保障一组', '中山路南侧备用入口', '道路保障负责人', '清障车 1 辆 + 保障车 1 辆', '备用清障单元已接替；回传到场、入口与清障进度。'),
      ],
    }
  }

  const assignment = findAssignment(assignments, ['重大布防', '属地', '保障'])
  if (!assignment) return null
  return {
    department: assignment.department,
    task: assignment.task,
    title: '重点分区岗位缺口',
    detail: '入口客流发生偏移，重点分区出现一个岗位缺口。',
    signals: ['重点入口覆盖下降', '原分区机动力量不足', '需要补充备用保障岗位'],
    action: '在本页选择补位力量，确认后返回任务下发。',
    options: [
      resolutionOption(event.session, assignment, 'major-tianhe-support', '天河外围保障组', '体育中心重点入口', '重点分区负责人', '保障岗位 2 组', '备用岗位已补位；回传入口覆盖与客流变化。'),
      resolutionOption(event.session, assignment, 'major-haizhu-mobile', '海珠机动保障组', '体育中心南侧入口', '现场总协调', '机动岗位 2 组', '机动岗位已补位；回传入口覆盖与客流变化。'),
    ],
  }
}
