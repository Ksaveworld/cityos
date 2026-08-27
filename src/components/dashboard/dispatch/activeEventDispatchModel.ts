import type { DomainFixture, TaskAssignment, TaskDispatchOverride, WorkflowSession } from '../workflow/types'
import {
  dispatchFacilityEtaLabel,
  dispatchCandidateReceivingStateSummary,
  rankDispatchFacilitiesForContact,
  resolveDispatchFacilityByOptionId,
} from './dispatchData.ts'
import { getLinkedDispatchMapConfig } from './linkedDispatchMapConfig.ts'

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
  etaReason?: string
}

export function resolveDispatchOptionAnalysis(
  event: ActiveDispatchEvent,
  option: TaskDispatchOverride,
  index: number,
): DispatchOptionAnalysis {
  if (event.kind === 'daily') {
    const linkedOption = getLinkedDispatchMapConfig(event.id)?.options.find(
      (candidate) => candidate.optionId === option.optionId,
    )
    if (linkedOption) {
      return {
        benefit: option.note,
        tradeoff: linkedOption.verificationNote,
        recommended: index === 0,
      }
    }

    const facility = resolveDispatchFacilityByOptionId(option.optionId)
    if (facility?.selectable) {
      const ranked = rankDispatchFacilitiesForContact()
      const contactIndex = ranked.findIndex((candidate) => candidate.id === facility.id)
      const firstContact = contactIndex === 0
      const stateReason = `临时演示规则先比较接收状态；候选配置为${dispatchCandidateReceivingStateSummary()}，同级再比较演示 ETA。`
      const etaReason = `${facility.name}${dispatchFacilityEtaLabel(facility)}，因此列为第 ${contactIndex + 1} 联络顺序。`
      return {
        benefit: `${stateReason}${etaReason}`,
        tradeoff: '“可联络”不等于“已确认接收”；联络顺序也不是自动选院结论。真实接收能力、交接窗口、路况与 ETA 均需人工核实。',
        recommended: firstContact,
        stateReason,
        etaReason,
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

function hospitalResolutionOptions(
  session: WorkflowSession,
  assignment: TaskAssignment,
  context: 'fire' | 'medical',
) {
  return rankDispatchFacilitiesForContact().flatMap((facility) => {
    const optionId = facility.resolutionOptionIds[context]
    if (!optionId) return []
    return [resolutionOption(
      session,
      assignment,
      optionId,
      facility.name,
      facility.name,
      assignment.owner,
      assignment.vehicles,
      `选择后仅更新调度草案；${facility.receivingState}，${dispatchFacilityEtaLabel(facility)}，等待人工确认接收与任务版本。`,
    )]
  })
}

function linkedMapResolutionOptions(
  event: ActiveDispatchEvent,
  assignment: TaskAssignment,
) {
  const config = getLinkedDispatchMapConfig(event.id)
  if (!config) return null
  return config.options.map((option) => resolutionOption(
    event.session,
    assignment,
    option.optionId,
    option.optionLabel,
    option.location,
    option.owner,
    option.vehicles,
    option.taskNote,
  ))
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
      options: hospitalResolutionOptions(event.session, assignment, 'fire'),
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
    const linkedOptions = linkedMapResolutionOptions(event, assignment)
    return {
      department: assignment.department,
      task: assignment.task,
      title: '外围疏导任务签收超时',
      detail: '外围入口压力发生变化，原疏导单元没有按时签收。',
      signals: ['东侧入口人流压力上升', '原外围任务签收超时', '需要切换备用疏导单元'],
      action: '在本页选择备用疏导单元，确认后返回任务下发。',
      options: linkedOptions ?? [
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
      detail: '原接收医院（模拟）承接能力不足，需要重新选择接收医院与转运目的地。',
      signals: ['原接收医院承接能力不足（模拟、待核实）', '转运目的地需要同步更新', '两家候选接收确认仍待回传'],
      action: '按接收状态、再按演示 ETA 比较联络顺序；在本页切换草案，人工确认后再返回任务下发。',
      options: hospitalResolutionOptions(event.session, assignment, 'medical'),
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

  if (event.fixture.id === 'urban_order') {
    const assignment = findAssignment(assignments, ['市容', '秩序', '巡查'])
    if (!assignment) return null
    return {
      department: assignment.department,
      task: assignment.task,
      title: '消防通道状态变化待复核',
      detail: '模拟执行完成后收到新的待核实线索，占道边界与消防通道状态需要重新人工确认。',
      signals: ['商户图片为模拟待核实线索', '巡查语音尚无现场负责人确认', '商圈视频不自动触发清理或调度'],
      action: '在本页选择模拟市容巡查单元；人工确认后再生成新版本任务包。',
      options: [
        resolutionOption(event.session, assignment, 'urban-order-beijing-01', '北京路市容巡查单元 01（模拟）', '北京路夜市占道点（模拟）', '北京路市容秩序协同负责人（模拟）', '巡查车 1 辆（模拟）', '只生成待批准草案；回传占道边界、消防通道状态与商户疏导进度（模拟）。'),
        resolutionOption(event.session, assignment, 'urban-order-yuexiu-02', '越秀市容机动单元 02（模拟）', '北京路商圈外围集结点（模拟）', '越秀市容机动负责人（模拟）', '巡查车 1 辆（模拟）', '只生成待批准草案；回传到场、通道复核与异常状态（模拟）。'),
      ],
    }
  }

  if (event.fixture.id !== 'major') return null
  const assignment = findAssignment(assignments, ['重大布防', '属地', '保障'])
  if (!assignment) return null
  const linkedOptions = linkedMapResolutionOptions(event, assignment)
  return {
    department: assignment.department,
    task: assignment.task,
    title: '重点分区岗位缺口',
    detail: '入口客流发生偏移，重点分区出现一个岗位缺口。',
    signals: ['重点入口覆盖下降', '原分区机动力量不足', '需要补充备用保障岗位'],
    action: '在本页选择补位力量，确认后返回任务下发。',
    options: linkedOptions ?? [
      resolutionOption(event.session, assignment, 'major-tianhe-support', '天河外围保障组', '体育中心重点入口', '重点分区负责人', '保障岗位 2 组', '备用岗位已补位；回传入口覆盖与客流变化。'),
      resolutionOption(event.session, assignment, 'major-haizhu-mobile', '海珠机动保障组', '体育中心南侧入口', '现场总协调', '机动岗位 2 组', '机动岗位已补位；回传入口覆盖与客流变化。'),
    ],
  }
}
