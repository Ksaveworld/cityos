import { DISPATCH_UNITS, TODAY_EVENTS, type DispatchUnit, type TodayEvent } from '../board/boardData.ts'
import type { WorkflowSession } from '../workflow/types'

export type DispatchPlanningState = 'current' | 'candidate' | 'impacted'
export type DispatchOperationStatus = 'idle' | 'pending-approval' | 'approved' | 'sent'

export type DispatchFacilityId = 'facility-medical-reference' | 'facility-red-cross' | 'facility-shiyi'
export type DispatchSelectableFacilityId = 'facility-red-cross' | 'facility-shiyi'
export type DispatchFacilityRouteRole = 'primary' | 'secondary' | 'medical'

export interface DispatchFacilityDataOrigin {
  position: string
  receivingState: '模拟，待核实'
  eta: '演示估算' | '待核实'
}

export interface DispatchFacilityRouteConfig {
  id: string
  role: DispatchFacilityRouteRole
  displayLabel: string
  color: [number, number, number, number]
  defaultProgress: number
}

export interface DispatchFacility {
  id: DispatchFacilityId
  unitId: string | null
  name: string
  position: [number, number]
  receivingState: string
  receivingStatePriority: number
  planningState: Readonly<Record<DispatchPlanningState, boolean>>
  selectable: boolean
  etaMinutes: number | null
  dataOrigin: DispatchFacilityDataOrigin
  resolutionOptionIds: {
    fire: string | null
    medical: string | null
  }
  route: DispatchFacilityRouteConfig
  recommendationBasis: string
  note: string
}

export const DISPATCH_HOSPITAL_RECOMMENDATION_RULE = '接收状态优先，同级再比较演示 ETA；只形成建议联络顺序，不代表自动选院或已确认接收。'

export interface DispatchAssignment {
  eventId: string
  scenarioId: string
  primaryUnitId: string
  assignedUnitIds: string[]
  facilityId: string | null
  owner: string
}

export interface DispatchDraft {
  primaryUnitId: string
  facilityId: string | null
  owner: string
  resourceCount: number
  fireOptionId: string
  medicalOptionId: string
  trafficOptionId: string
}

export interface DispatchOperation {
  id: string
  eventId: string
  status: DispatchOperationStatus
  pendingDraft: DispatchDraft | null
  sourceEventId: string | null
  message: string
}

export interface DispatchDifficulty {
  id: string
  priority: 'P0' | 'P1'
  title: string
  observed: string
  constraint: string
  suggestedAction: string
  expectedImpact: string
}

export interface DispatchCase {
  eventId: string
  scenarioId: string
  taskLabel: string
  triggerSource: string
  reason: string
  currentSummary: string
  historyReference: string
  recommendedAction: string
  difficulties: DispatchDifficulty[]
  primaryLabel: string
  candidateUnitIds: string[]
  ownerOptions: string[]
  facilityIds?: string[]
}

export const DISPATCH_FACILITIES: DispatchFacility[] = [
  {
    id: 'facility-medical-reference',
    unitId: null,
    name: '原接收医院（模拟）',
    position: [113.25575, 23.11425],
    receivingState: '承接能力不足（模拟，待核实）',
    receivingStatePriority: 1,
    planningState: { current: true, impacted: true, candidate: false },
    selectable: false,
    etaMinutes: null,
    dataOrigin: {
      position: '既有“医疗参考”模拟点位',
      receivingState: '模拟，待核实',
      eta: '待核实',
    },
    resolutionOptionIds: { fire: null, medical: null },
    route: {
      id: 'route-medical-reference',
      role: 'primary',
      displayLabel: '原接收路线 · 原接收医院（模拟）',
      color: [229, 72, 77, 205],
      defaultProgress: 0.195,
    },
    recommendationBasis: '受影响基准医院不参与候选排序，也不得进入可选择方案。',
    note: '点位为既有演示锚点；医院身份、接收能力与 ETA 均为模拟或待核实。',
  },
  {
    id: 'facility-red-cross',
    unitId: 'u-medical-zhongshan',
    name: '广州市红十字会医院',
    position: [113.2571165, 23.1072521],
    receivingState: '可联络（模拟，待核实）',
    receivingStatePriority: 0,
    planningState: { current: false, impacted: false, candidate: true },
    selectable: true,
    etaMinutes: 6,
    dataOrigin: {
      position: '公开静态 POI',
      receivingState: '模拟，待核实',
      eta: '演示估算',
    },
    resolutionOptionIds: { fire: 'hospital-red-cross', medical: 'medical-red-cross' },
    route: {
      id: 'route-red-cross',
      role: 'secondary',
      displayLabel: '候选转运路线 · 红十字会医院',
      color: [14, 154, 167, 225],
      defaultProgress: 0.41,
    },
    recommendationBasis: DISPATCH_HOSPITAL_RECOMMENDATION_RULE,
    note: '名称与坐标参考公开静态 POI；接收状态为模拟待核实，ETA 为演示估算。',
  },
  {
    id: 'facility-shiyi',
    unitId: 'u-medical-shiyi',
    name: '广州市第一人民医院',
    position: [113.2511865, 23.133973],
    receivingState: '可联络（模拟，待核实）',
    receivingStatePriority: 0,
    planningState: { current: false, impacted: false, candidate: true },
    selectable: true,
    etaMinutes: 10,
    dataOrigin: {
      position: '公开静态 POI',
      receivingState: '模拟，待核实',
      eta: '演示估算',
    },
    resolutionOptionIds: { fire: 'hospital-shiyi', medical: 'medical-shiyi' },
    route: {
      id: 'route-shiyi',
      role: 'medical',
      displayLabel: '候选转运路线 · 市一医院',
      color: [91, 91, 214, 215],
      defaultProgress: 0.3,
    },
    recommendationBasis: DISPATCH_HOSPITAL_RECOMMENDATION_RULE,
    note: '名称与坐标参考公开静态 POI；接收状态为模拟待核实，ETA 为演示估算。',
  },
]

const FACILITY_BY_ID = new Map(DISPATCH_FACILITIES.map((facility) => [facility.id, facility]))

export function getDispatchFacility(facilityId: string | null | undefined) {
  return facilityId ? FACILITY_BY_ID.get(facilityId as DispatchFacilityId) ?? null : null
}

export function getSelectableDispatchFacilities() {
  return DISPATCH_FACILITIES.filter((facility): facility is DispatchFacility & { id: DispatchSelectableFacilityId; unitId: string } => (
    facility.selectable && facility.planningState.candidate && facility.unitId !== null
  ))
}

export function rankDispatchFacilitiesForContact(
  facilities: readonly DispatchFacility[] = getSelectableDispatchFacilities(),
) {
  return [...facilities].sort((left, right) => (
    left.receivingStatePriority - right.receivingStatePriority
      || (left.etaMinutes ?? Number.POSITIVE_INFINITY) - (right.etaMinutes ?? Number.POSITIVE_INFINITY)
  ))
}

export function dispatchCandidateReceivingStateSummary() {
  return rankDispatchFacilitiesForContact()
    .map((facility) => `${facility.name}：${facility.receivingState}`)
    .join('；')
}

export function isDispatchSelectableFacilityId(facilityId: string): facilityId is DispatchSelectableFacilityId {
  return getSelectableDispatchFacilities().some((facility) => facility.id === facilityId)
}

export function resolveDispatchFacilityByOptionId(optionId: string) {
  return DISPATCH_FACILITIES.find((facility) => (
    facility.resolutionOptionIds.fire === optionId || facility.resolutionOptionIds.medical === optionId
  )) ?? null
}

export function dispatchFacilityEtaLabel(facility: DispatchFacility) {
  return facility.etaMinutes === null ? 'ETA 待核实' : `ETA 约 ${facility.etaMinutes} 分钟（演示估算）`
}

export function dispatchFacilityPlanningState(facility: DispatchFacility): DispatchPlanningState {
  if (facility.planningState.impacted) return 'impacted'
  if (facility.planningState.candidate) return 'candidate'
  return 'current'
}

export const DISPATCH_CASES: DispatchCase[] = [
  {
    eventId: 'ev-fire-finance',
    scenarioId: 'liwan-fire',
    taskLabel: '增援消防与沿线协同任务',
    triggerSource: '日常任务包 · 并发占用回传',
    reason: '并发火情占用主责力量，需补充增援与开路协同。',
    currentSummary: '1 个主责消防单元 · 医疗与路况协同已配置',
    historyReference: '高层火情假设集 routine-highrise-v1 · 知识库草稿',
    recommendedAction: '先比较猎德、员村与石牌三个候选单元；如跨事件抽调，必须同时展示来源事件覆盖变化并重新人工批准。',
    difficulties: [
      {
        id: 'fire-capacity-conflict',
        priority: 'P0',
        title: '增援力量发生占用冲突',
        observed: '主责力量被并发事件占用，当前任务缺少一支可立即增援的消防单元。',
        constraint: '不得让来源事件低于最小覆盖；跨事件抽调不能静默生效。',
        suggestedAction: '比较三个候选单元，优先使用待命力量；占用单元只生成双事件影响草案。',
        expectedImpact: '目标 ETA 可能下降，但来源事件覆盖风险可能上升。',
      },
      {
        id: 'fire-corridor-confirmation',
        priority: 'P1',
        title: '沿线协同窗口待确认',
        observed: '关键路口开路节点与提前量仍待确认，尚无交管回执。',
        constraint: '未经人工确认不得把开路候选写成真实指令。',
        suggestedAction: '保留普通通行基线，同时把开路节点作为可撤销的候选动作。',
        expectedImpact: '可解释路线差异，但不承诺真实通行时间。',
      },
    ],
    primaryLabel: '增援消防单元',
    candidateUnitIds: ['u-fire-lied', 'u-fire-yuancun', 'u-fire-shipai'],
    ownerOptions: ['消防值守组', '天河现场指挥'],
  },
  {
    eventId: 'ev-police-station-delay',
    scenarioId: 'yuexiu-police-current',
    taskLabel: '属地协查签收任务',
    triggerSource: '任务签收超时 · 执行反馈',
    reason: '任务签收超时，原响应单位与备用联系人均需重新确认。',
    currentSummary: '1 个属地响应单元 · 外围交通协同待确认',
    historyReference: '广州站历史案例只提供公开事实边界；真实警力、路线与签收未公开',
    recommendedAction: '先切换备用联系人；仍未签收时再比较备用响应单元，并保留原任务责任范围。',
    difficulties: [
      {
        id: 'police-ack-timeout',
        priority: 'P0',
        title: '任务签收超时',
        observed: '原响应单位与备用联系人均未在规定时限内返回签收。',
        constraint: '不能把“未签收”推断为单位不可用，也不能自动转移责任。',
        suggestedAction: '先重发给备用联系人；超时后由站区负责人选择备用响应单元。',
        expectedImpact: '缩短等待时间，但责任范围需要重新确认。',
      },
      {
        id: 'police-perimeter-gap',
        priority: 'P1',
        title: '外围交通协同未确认',
        observed: '外围疏导任务尚无独立负责人回执。',
        constraint: '核心响应与外围疏导必须分开确认，避免一人承担两个门禁。',
        suggestedAction: '保留核心响应单位，单独指定外围交通负责人。',
        expectedImpact: '减少责任串线，不改变核心任务处置权限。',
      },
    ],
    primaryLabel: '响应单位',
    candidateUnitIds: ['u-police-yuexiu-01', 'u-police-station-demo', 'u-police-liwan-02'],
    ownerOptions: ['站区协同负责人', '越秀属地负责人'],
  },
  {
    eventId: 'ev-medical-panfu',
    scenarioId: 'yuexiu-medical',
    taskLabel: '急救转运与接收确认任务',
    triggerSource: '接收点能力变化 · 联络回传',
    reason: '原接收医院（模拟）承接能力不足，需要调整接收点与转运协同。',
    currentSummary: '原接收医院（模拟）受影响 · 1 个急救保障单元',
    historyReference: '分级转运假设集 medical-triage-v1 · 知识库草稿',
    recommendedAction: '先按接收状态、再按演示 ETA 比较两家候选的联络顺序；选择只更新草案，仍需人工确认接收状态与任务版本。',
    difficulties: [
      {
        id: 'medical-capacity-drop',
        priority: 'P0',
        title: '原接收点承接能力不足',
        observed: '原接收医院（模拟）被标记为承接能力不足，当前状态仍待人工核实。',
        constraint: '不得展示或推断真实床位、专科能力与临床分级。',
        suggestedAction: '比较可联络接收点，并同步修改转运目的地与联络负责人。',
        expectedImpact: '接收确认可能提前，但 ETA 与接收能力仍需人工核验。',
      },
      {
        id: 'medical-unit-coupling',
        priority: 'P1',
        title: '车辆与接收点需要成对调整',
        observed: '只切换医院会留下原急救单元归属，形成任务包版本不一致。',
        constraint: '接收点、车辆与负责人必须在同一草案版本中批准。',
        suggestedAction: '选择接收点时联动对应急救保障单元，再统一重算。',
        expectedImpact: '避免任务包中的目的地与执行单元不一致。',
      },
    ],
    primaryLabel: '急救保障单元',
    candidateUnitIds: ['u-medical-shiyi', 'u-medical-zhongshan', 'u-medical-liwan-01'],
    ownerOptions: ['急救联络负责人', '转运协调负责人'],
    facilityIds: ['facility-red-cross', 'facility-shiyi'],
  },
  {
    eventId: 'ev-traffic-zhongshan',
    scenarioId: 'yuexiu-traffic',
    taskLabel: '道路清障与入口保障任务',
    triggerSource: '清障反馈延迟 · 执行回传',
    reason: '清障单元反馈延迟，保障点与绕行协同需要重算。',
    currentSummary: '1 个清障单元 · 关键路口开路',
    historyReference: '交通事件假设集 traffic-incident-v1 · 知识库草稿',
    recommendedAction: '保留原清障任务作为参照，比较备用清障单元与入口方案；人工确认后再生成受控重试。',
    difficulties: [
      {
        id: 'traffic-feedback-delay',
        priority: 'P0',
        title: '清障执行反馈延迟',
        observed: '清障单元没有在规定窗口内回传到场或异常原因。',
        constraint: '一次反馈延迟不能直接判定任务失败；受控重试最多一次。',
        suggestedAction: '先请求状态复核，同时生成备用清障单元草案。',
        expectedImpact: '降低继续等待的风险，但可能增加资源占用。',
      },
      {
        id: 'traffic-entry-blocked',
        priority: 'P1',
        title: '作业入口与绕行协同耦合',
        observed: '入口受阻会同时影响清障到场与社会车辆绕行。',
        constraint: '入口调整必须同步检查路线与周边覆盖，不做自动道路控制。',
        suggestedAction: '切换入口候选并保留原绕行基线，等待道路保障负责人确认。',
        expectedImpact: '可能改善到场时间，但通行影响面需要权衡。',
      },
    ],
    primaryLabel: '清障单位',
    candidateUnitIds: ['u-traffic-zhongshan', 'u-traffic-yuexiu-02', 'u-traffic-liwan-01'],
    ownerOptions: ['道路保障负责人', '越秀现场协调'],
  },
  {
    eventId: 'ev-city-order-beijing',
    scenarioId: 'yuexiu-urban-order',
    taskLabel: '夜市占道清理与消防通道恢复任务（模拟）',
    triggerSource: '商户图片 / 巡查语音 / 商圈视频（模拟待核实）',
    reason: '三路多模态线索均待人工核实；如确认消防通道受阻，需要市容、消防与属地协同。',
    currentSummary: '1 个市容主责单元（模拟） · 消防通道状态待核实',
    historyReference: '市容秩序假设集 urban-order-beijing-v1 · 知识库演示草稿',
    recommendedAction: '先由人工确认占道边界与消防通道状态，再比较市容巡查单元；任何资源选择都只生成待批准草案。',
    difficulties: [
      {
        id: 'urban-order-fire-access-unverified',
        priority: 'P0',
        title: '消防通道受阻状态未确认',
        observed: '商户图片、巡查语音与商圈视频均为模拟线索，尚无现场负责人确认通道是否受阻。',
        constraint: '不得把多模态线索自动升级为现场事实，也不得据此直接生成执法或调度指令。',
        suggestedAction: '先指派现场核验人确认入口位置、受阻范围与可通行条件，再提交处置方案。',
        expectedImpact: '核验会增加等待时间，但可避免错误清理或错误下发。',
      },
      {
        id: 'urban-order-merchant-coordination',
        priority: 'P1',
        title: '占道清理与商户疏导需要同步',
        observed: '摊位清理顺序、行人通行与商户沟通窗口均为模拟待确认状态。',
        constraint: '主责单元变化必须同步更新商户联络人与消防通道复核任务。',
        suggestedAction: '比较当前与备用市容单元，并将疏导、复核和反馈要求写入同一版本任务包。',
        expectedImpact: '减少任务责任串线，但方案需要重新人工批准。',
      },
    ],
    primaryLabel: '市容巡查单元（模拟）',
    candidateUnitIds: ['u-urban-order-beijing-01', 'u-urban-order-yuexiu-02'],
    ownerOptions: ['北京路市容秩序协同负责人（模拟）', '越秀市容机动负责人（模拟）'],
  },
  {
    eventId: 'ev-major-tianhe',
    scenarioId: 'tianhe-major',
    taskLabel: '重点分区岗位补位任务',
    triggerSource: '入口客流偏移 · 现场态势更新',
    reason: '入口客流发生偏移，重点分区出现岗位缺口。',
    currentSummary: '8 个保障岗位 · 医疗与交管保障已配置',
    historyReference: '分区覆盖假设集 major-deployment-v1 · 知识库草稿',
    recommendedAction: '先做同编成再分配；如需跨分区抽调，目标分区与来源分区负责人分别确认。',
    difficulties: [
      {
        id: 'major-zone-gap',
        priority: 'P0',
        title: '重点分区出现岗位缺口',
        observed: '入口客流发生偏移，当前重点分区岗位覆盖不足。',
        constraint: '当前客流仍待核实，不得直接解释为踩踏风险。',
        suggestedAction: '优先在总编成不变的前提下跨分区再分配岗位。',
        expectedImpact: '目标分区覆盖改善，来源分区冗余下降。',
      },
      {
        id: 'major-dual-approval',
        priority: 'P1',
        title: '跨分区抽调需要双向确认',
        observed: '一个岗位变化会同时改变两个分区的责任与覆盖。',
        constraint: '目标分区批准不能代替来源分区负责人确认。',
        suggestedAction: '生成双分区影响对照，并分别记录人工确认。',
        expectedImpact: '提高变更可追溯性，但增加一道人工门禁。',
      },
    ],
    primaryLabel: '主责保障单元',
    candidateUnitIds: ['u-traffic-tianhe-04', 'u-police-tianhe-03', 'u-traffic-haizhu-03'],
    ownerOptions: ['现场总协调', '重点分区负责人'],
  },
]

const CASE_BY_EVENT = new Map(DISPATCH_CASES.map((item) => [item.eventId, item]))

export function dispatchDisplayText(value: string) {
  return value
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function getDispatchEvent(dispatchCase: DispatchCase): TodayEvent {
  const event = TODAY_EVENTS.find((item) => item.id === dispatchCase.eventId)
  if (!event) throw new Error(`资源调度事件 ${dispatchCase.eventId} 不存在`)
  return {
    ...event,
    title: dispatchDisplayText(event.title),
    location: dispatchDisplayText(event.location),
    summary: dispatchDisplayText(event.summary),
    source: dispatchDisplayText(event.source),
    owner: dispatchDisplayText(event.owner),
    shortLabel: dispatchDisplayText(event.shortLabel),
    nextAction: dispatchDisplayText(event.nextAction),
  }
}

export function getDispatchUnit(unitId: string): DispatchUnit {
  const unit = DISPATCH_UNITS.find((item) => item.id === unitId)
  if (!unit) throw new Error(`资源调度单元 ${unitId} 不存在`)
  return {
    ...unit,
    name: dispatchDisplayText(unit.name),
    location: dispatchDisplayText(unit.location),
    occupiedBy: unit.occupiedBy ? dispatchDisplayText(unit.occupiedBy) : undefined,
    strength: dispatchDisplayText(unit.strength),
  }
}

export function getDispatchCase(eventId: string | null): DispatchCase | null {
  return eventId ? CASE_BY_EVENT.get(eventId) ?? null : null
}

export function resolveDispatchScenarioId(event: TodayEvent): string | null {
  return CASE_BY_EVENT.get(event.id)?.scenarioId ?? event.workflowScenarioId ?? null
}

export function createInitialDispatchAssignments(): Record<string, DispatchAssignment> {
  const assignments: DispatchAssignment[] = [
    { eventId: 'ev-fire-finance', scenarioId: 'liwan-fire', primaryUnitId: 'u-fire-lied', assignedUnitIds: ['u-fire-lied', 'u-medical-liwan-01'], facilityId: null, owner: '消防值守组' },
    { eventId: 'ev-police-station-delay', scenarioId: 'yuexiu-police-current', primaryUnitId: 'u-police-yuexiu-01', assignedUnitIds: ['u-police-yuexiu-01', 'u-traffic-yuexiu-02'], facilityId: null, owner: '站区协同负责人' },
    { eventId: 'ev-medical-panfu', scenarioId: 'yuexiu-medical', primaryUnitId: 'u-medical-shiyi', assignedUnitIds: ['u-medical-shiyi'], facilityId: 'facility-medical-reference', owner: '急救联络负责人' },
    { eventId: 'ev-traffic-zhongshan', scenarioId: 'yuexiu-traffic', primaryUnitId: 'u-traffic-zhongshan', assignedUnitIds: ['u-traffic-zhongshan', 'u-medical-yuexiu-02'], facilityId: null, owner: '道路保障负责人' },
    { eventId: 'ev-city-order-beijing', scenarioId: 'yuexiu-urban-order', primaryUnitId: 'u-urban-order-beijing-01', assignedUnitIds: ['u-urban-order-beijing-01'], facilityId: null, owner: '北京路市容秩序协同负责人（模拟）' },
    { eventId: 'ev-major-tianhe', scenarioId: 'tianhe-major', primaryUnitId: 'u-traffic-tianhe-04', assignedUnitIds: ['u-traffic-tianhe-04', 'u-fire-shipai', 'u-medical-haizhu-03'], facilityId: null, owner: '现场总协调' },
  ]
  return Object.fromEntries(assignments.map((item) => [item.eventId, item]))
}

export function createInitialDispatchOperations(): Record<string, DispatchOperation> {
  return Object.fromEntries(DISPATCH_CASES.map((item) => [item.eventId, {
    id: `dispatch-op-${item.eventId}`,
    eventId: item.eventId,
    status: 'idle' as const,
    pendingDraft: null,
    sourceEventId: null,
    message: '等待人工调整',
  }]))
}

export function createDispatchDraft(assignment: DispatchAssignment, session: WorkflowSession): DispatchDraft {
  return {
    primaryUnitId: assignment.primaryUnitId,
    facilityId: assignment.facilityId,
    owner: assignment.owner,
    resourceCount: session.resourceCount,
    fireOptionId: session.fireOptionId,
    medicalOptionId: session.medicalOptionId,
    trafficOptionId: session.trafficOptionId,
  }
}

export function findAssignedEvent(assignments: Record<string, DispatchAssignment>, unitId: string, excludingEventId?: string) {
  return Object.values(assignments).find((item) => item.eventId !== excludingEventId && item.assignedUnitIds.includes(unitId)) ?? null
}

export function dispatchDraftChanged(draft: DispatchDraft, assignment: DispatchAssignment, session: WorkflowSession) {
  return draft.primaryUnitId !== assignment.primaryUnitId
    || draft.facilityId !== assignment.facilityId
    || draft.owner !== assignment.owner
    || draft.resourceCount !== session.resourceCount
    || draft.fireOptionId !== session.fireOptionId
    || draft.medicalOptionId !== session.medicalOptionId
    || draft.trafficOptionId !== session.trafficOptionId
}
