/**
 * 接口契约的 TypeScript 落地。结构定义见 docs/接口契约.md。
 *
 * 契约本身是 Claude 与 Codex 的共同依赖，改动前先确认（见 AGENTS.md）。
 * 本文件按 8/17 会议结论做了三处扩展，已在 docs 里留了待确认标记：
 * 1. PlanMetrics 增加 controlImpact 与 failureRisk（Phase 1 五维对比）
 * 2. ActionType 增加「路口开路」及其时间窗字段
 * 3. 新增 Feedback 四节点结构
 */

/** 时间统一 Unix 秒，坐标统一 [lng, lat] */
export type Timestamp = number
export type LngLat = [number, number]

export type SignalSource = '119接警' | '110接警' | '物业上报' | '烟感' | '市民上报'

/** 事实的可信度分级 —— 整套设计的良心所在，不要省略 */
export type Confidence =
  | 'confirmed' // 已被权威来源确认，如消防到场确认
  | 'reported' // 有人这么说，报警人口述
  | 'inferred' // 系统推断，如多条报警互证推出楼层

export interface Signal {
  id: string
  source: SignalSource
  rawAddress: string
  timestamp: Timestamp
  text: string
  reportedFloor?: number
  confidence: Confidence
}

export type EventStatus = 'suspected' | 'confirmed' | 'closed'

export interface Fact {
  key: string
  value: string | number
  confidence: Confidence
  /** 溯源到具体信号，报告页每条结论都要能回指链路的哪一步 */
  sourceSignalIds: string[]
}

export interface FireEvent {
  id: string
  status: EventStatus
  buildingId: string
  location: LngLat
  signals: Signal[]
  confirmedFacts: Fact[]
  /** 待核实信息，UI 上必须与已确认分开展示 */
  pendingFacts: Fact[]
  /** 已知缺口，说不出来的也要说出来 */
  informationGaps: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** 路口开路任务。一个路口只在车辆通过前后的时间窗内清空，不是封路 */
export interface IntersectionTask {
  intersectionId: string
  name: string
  location: LngLat
  /** 预计通过时刻 */
  passAt: Timestamp
  /** 提前量秒数。默认值是占位，依据待补，见数据边界文档 */
  leadSeconds: number
  /** 解除时刻 */
  releaseAt: Timestamp
  suggestedAction: string
}

export type ActionType =
  | '派遣'
  | '预置待命'
  | '请求开路'
  | '通知物业'
  | '通知医疗'

export interface Action {
  type: ActionType
  target: string
  detail?: string
  /** 凡是改变其他区域资源状态、或跨越部门权限边界的，一律 human */
  approvalLevel: 'auto' | 'human'
  /** 仅「请求开路」使用 */
  intersections?: IntersectionTask[]
}

export interface PlanMetrics {
  etaSeconds: number
  /**
   * 误差带，**单个方案自身的不确定区间**，来源是模拟速度模型。
   *
   * 取法是路径固定不动，把紧急车辆系数在合理区间两端各算一次 ETA。
   * 它衡量的是「我们对这条路径要开多久的估计有多不准」。
   *
   * 判定两个方案是否存在显著差异，看两条带是否重叠，重叠就必须明说
   * 「算不出显著区别」。
   *
   * **原注释写的是「特权规则全开与全关各跑一次，两端就是这个带」，
   * 那是错的，而且是循环的**：若带本身就是 A 与 B 的两端，拿它去判定
   * A 与 B 是否显著差异，永远得到边界相接的结果，判据失效。
   *
   * 特权带来的收益是另一个量，等于基线方案 ETA 减特权方案 ETA，
   * 单独显示，不进这个带。
   */
  etaRange: [number, number]
  /** 命中的硬约束。Phase 1 数值为模拟，见数据边界文档 */
  constraintsViolated: string[]
  /** 需要清空的路口数 */
  intersectionCount: number
  /** 管控影响面，受影响的社会车流量级 */
  controlImpact: '低' | '中' | '高'
  /** 失败风险，路段狭窄、施工、历史通行不畅 */
  failureRisk: '低' | '中' | '高'
  /** 是否走了降级算法 */
  degraded: boolean
  /** 覆盖缺口。力量编成不进 Phase 1，此项保留不填 */
  coverageGapAfter?: GeoJSON.FeatureCollection
}

export interface Plan {
  id: string
  eventId: string
  label: string
  /** 路径几何，喂给 deck.gl */
  path: LngLat[]
  actions: Action[]
  metrics: PlanMetrics
  /** 业务语言解释，不出现算法术语 */
  rationale: string
  requiresHumanApproval: boolean
  /** 是否放开了消防车特权规则，用于与民用导航基线对照 */
  privileged: boolean
}

/** 执行反馈按节点回收，Phase 1 不做实时滚动调度 */
export type FeedbackNode = '任务签收' | '路口回执' | '到场' | '结束'

export interface FeedbackRecord {
  node: FeedbackNode
  at: Timestamp
  from: string
  content: string
  /** 路口回执可能是无法执行，系统只提示不自动改线 */
  executable?: boolean
}

/** 链路九环，报告页每条结论要能追溯到其中一环 */
export type ChainStep =
  | 'Signal'
  | 'Event'
  | 'Context'
  | 'AIBrief'
  | 'Strategy'
  | 'HumanDecision'
  | 'Task'
  | 'Feedback'
  | 'Review'

/** 数据来源真假。与 Confidence 正交，视觉上不能共用同一套编码 */
export type DataOrigin = 'real' | 'simulated' | 'estimated'

export interface Sourced<T> {
  value: T
  origin: DataOrigin
  /** 来源说明，界面上鼠标悬停可见 */
  note?: string
}
