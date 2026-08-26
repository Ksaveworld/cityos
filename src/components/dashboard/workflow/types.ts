export type DomainId = 'fire' | 'police' | 'medical' | 'traffic' | 'urban_order' | 'major'

export type InputMode = 'stream' | 'manual'

export type WorkflowStage = 'input' | 'brief' | 'strategy' | 'task' | 'execution' | 'review'

export type DeliveryStatus = 'draft' | 'pending-send' | 'delivered' | 'acknowledged' | 'executing' | 'completed' | 'abnormal'

export type DataLabel = '演示事件' | '公开事实' | '模型估算' | '待核实'

export interface BriefItem {
  label: string
  value: string
  source: string
  status: string
  dataLabel: DataLabel
  note?: string
}

export interface BriefBlocks {
  confirmed: BriefItem[]
  unknown: BriefItem[]
  context: BriefItem[]
  gaps: BriefItem[]
}

export interface BriefCorrections {
  conclusion: string
  evidence: string
  risk: string
  gaps: string
}

export interface InputTemplate {
  id: string
  title: string
  detail: string
}

export interface InputField {
  id: string
  label: string
  value: string
  placeholder?: string
  kind?: 'text' | 'textarea'
  /**
   * 进入报告「态势结论」的核心事实字段，数字越小越靠前。
   * 8/22 评审：结论只写接警时刻 + 事件类型，读者看不出这一单到底发生了什么——
   * 结论必须由本次输入里的核心事实拼出来，而不是复述模板头两行。
   */
  summaryRank?: number
  /** 拼进态势结论时加的前缀，例如「初判 」 */
  summaryPrefix?: string
}

export interface LeverOption {
  id: string
  label: string
  etaDeltaMinutes: number
  coverageDelta: number
}

/**
 * 受控调度的一个维度。8/21 评审定死方案生成这一页要展示的是调度维度
 * （消防调度、医疗调度、路况协同），不是「资源点」「负责人」这种抽象槽位——
 * 后者看不出跨部门协同，而跨部门协同正是这一步要给人看的东西。
 *
 * 这三档**每个场景都固定出现、固定这三个名字**。第一版按场景换过名
 * （交通场景变成「路况协同 / 医疗调度 / 交警开路」），评审当场驳回：
 * 受控调度问的是「这一起事件要调动哪几支力量」，答案在任何场景下都是这三支，
 * 只是各自怎么配不一样。名字跟着场景飘，读者就没法横向比。
 */
export interface DispatchLever {
  title: string
  options: LeverOption[]
}

/** 数量滑杆挂在哪一档下；null 表示本域主责不在这三类里，单列一档 */
export type DispatchCountOwner = 'fire' | 'medical' | 'traffic' | null

export interface WorkflowPlan {
  id: string
  label: string
  title: string
  summary: string
  etaMinutes: number
  coverageRisk: string
  actions: string[]
}

/** 批准后任务包里的一行部门任务；报告与输出卡片共用同一来源 */
export interface TaskAssignment {
  department: string
  owner: string
  task: string
  location: string
  /** 开始时间与完成时限，例如「15:02 出动 · 8 分钟内到场」 */
  window: string
  personnel: string
  vehicles: string
  /** 需要回传的信息 */
  feedback: string
  /** 联系 / 送达方式 */
  contact: string
  eta: string
  /** ETA 的生成口径；精确到秒的任务包数字必须同时展示来源。 */
  etaSource?: string
}

export interface TaskDispatchOverride {
  department: string
  task: string
  optionId: string
  optionLabel: string
  owner: string
  location: string
  vehicles: string
  note: string
}

export interface DomainFixture {
  id: DomainId
  scenarioId: string
  /** 历史反事实链路使用公开事实锚点进入同一套日常工作流。 */
  isHistoricalCase?: boolean
  label: string
  title: string
  address: string
  dataNote: string
  inputTemplates: InputTemplate[]
  inputFields?: InputField[]
  /** 数量滑杆单列时的档名，例如 110 场景是「警力调度」。countOwner 非 null 时不用 */
  primaryDispatchTitle: string
  countOwner: DispatchCountOwner
  resourceLabel: string
  resourceUnit: string
  /**
   * ETA 说的是哪一支力量。报告里只写「ETA 6.9 分钟」会被读成整起事件的到场时间，
   * 实际口径是主责单元的首批到场，所以指标要带作用域一起显示。
   */
  metricScopeLabel: string
  minResources: number
  maxResources: number
  defaultResources: number
  baseEtaMinutes: number
  baseCoverageScore: number
  /** 固定三档，顺序固定：消防调度 → 医疗调度 → 路况协同 */
  fireDispatch: DispatchLever
  medicalDispatch: DispatchLever
  trafficDispatch: DispatchLever
  /**
   * 任务包与报告里的现场负责人。原来是从「负责人」那个可调槽位读的，
   * 受控调度改成三个调度维度后那个槽位没了；负责人本来也不该是个能拖动的参数。
   */
  defaultOwner: string
  plans: WorkflowPlan[]
  brief: BriefBlocks
  executionSteps: string[]
  /** 批准后生成的部门任务分派；未提供时由 plans.actions 兜底生成 */
  taskAssignments?: TaskAssignment[]
}

export interface WorkflowSession {
  inputMode: InputMode
  inputTemplateId: string
  inputValues: Record<string, string>
  inputValidated: boolean
  briefCorrections: BriefCorrections | null
  stage: WorkflowStage
  selectedPlanId: string
  planVersion: number
  /** 当前版本最后一次发生实质变化的时间，不等同于报告打开/打印时间。 */
  versionUpdatedAt: string
  approvedPlanId: string | null
  approvedVersion: number | null
  resourceCount: number
  fireOptionId: string
  medicalOptionId: string
  trafficOptionId: string
  etaMinutes: number
  coverageRisk: string
  deliveryStatus: DeliveryStatus
  /** 点击进入执行、首批到场与完成时记录的会话时间，用于处置结果报告。 */
  executionStartedAt: string | null
  firstArrivalAt: string | null
  executionCompletedAt: string | null
  hasReplanned: boolean
  retryCount: number
  invalidationReason: string | null
  decisionNote: string
}

export interface RecalculatedMetrics {
  etaMinutes: number
  coverageRisk: string
}
