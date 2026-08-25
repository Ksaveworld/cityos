import type { ExecutionDefinition } from '../execution/executionPlayback'

import {
  HISTORY_516_FACTS,
  HISTORY_516_RUNS,
  type PublicFact,
  type SimulationRun,
} from './history516'
import { HISTORY_516_EXECUTIONS } from './history516Execution'
import {
  STATION_EXECUTIONS,
  STATION_PUBLIC_FACTS,
  STATION_SIMULATION_RUNS,
} from './stationHistory'

export type HistoricalReviewCaseId = 'hc-liwan-516' | 'hc-station-2015'

export interface HistoricalCandidatePlan {
  id: 'plan-a' | 'plan-b'
  label: 'A' | 'B'
  title: string
  summary: string
  etaMinutes: number
  coverageRisk: string
  resourceCost: string
  actions: string[]
}

export interface HistoricalReviewCase {
  id: HistoricalReviewCaseId
  scenarioId: string
  title: string
  address: string
  domain: string
  domainColor: string
  facts: PublicFact[]
  initialFactLabels: string[]
  stageDeltas: [string, string, string, string, string, string, string, string, string]
  runs: Record<'baseline' | 'cityos', SimulationRun>
  executions: Record<'baseline' | 'cityos', ExecutionDefinition>
  originalTimeline: Array<{ time: string; label: string; detail: string; known: boolean }>
  blockers: Array<{ label: string; detail: string; status: '公开事实' | '推定数据' | '信息缺口' }>
  brief: {
    conclusion: string[]
    evidence: string[]
    risks: string[]
    gaps: string[]
  }
  plans: HistoricalCandidatePlan[]
  tasks: Array<{ department: string; task: string; timing: string }>
  earlyTasks: string[]
  avoidedBlockers: string[]
  unresolvedRisks: string[]
  resourceDelta: string
  boundary: string
}

export const HISTORICAL_REVIEW_CASES: Record<HistoricalReviewCaseId, HistoricalReviewCase> = {
  'hc-liwan-516': {
    id: 'hc-liwan-516',
    scenarioId: 'liwan-fire',
    title: '荔湾 5·16 服装交易市场火灾',
    address: '荔湾区人民南路 93 号',
    domain: '119 消防',
    domainColor: '#E5484D',
    facts: HISTORY_516_FACTS,
    initialFactLabels: ['接警时刻', '公开地点'],
    stageDeltas: [
      '把接警时刻与地点统一接入，避免后续结果反向进入初始研判。',
      '将分散来源归并为同一个事件对象，统一时间、地点与事件类型。',
      '在力量出发前暴露场址、通行和资源三类关键信息缺口。',
      '把风险、优先级和待核实项提前形成结构化态势快照。',
      '在相同输入下比较时效、覆盖风险与资源代价。',
      '由指挥者确认方案和假设，系统不替代人工拍板。',
      '把消防、交管和医疗协调由串行等待改为并行任务。',
      '持续接收签收和通行反馈，异常时保留重算入口。',
      '量化可能提前的任务、时间变化和仍未解决的风险。',
    ],
    runs: HISTORY_516_RUNS,
    executions: HISTORY_516_EXECUTIONS,
    originalTimeline: [
      { time: '09:32', label: '接警', detail: '广州消防公开通报时间锚点', known: true },
      { time: '过程未公开', label: '调派与现场处置', detail: '车辆、路线、签收和阶段节点未披露', known: false },
      { time: '11:40', label: '明火扑灭', detail: '公开结果，不反推中间过程', known: true },
    ],
    blockers: [
      { label: '调派过程', detail: '实际车辆编成和出动顺序未公开', status: '信息缺口' },
      { label: '通行路线', detail: '无法核验当时道路状态和行驶路线', status: '信息缺口' },
      { label: '场址范围', detail: '认定公告涉及多个门牌，接警地址与场址范围需分开', status: '公开事实' },
    ],
    brief: {
      conclusion: ['公开资料能够确认接警、地点和扑灭时刻，但不足以还原真实调派过程。', 'CityOS 仅在统一假设集内比较协同顺序与通行策略。'],
      evidence: ['09:32 接警、人民南路 93 号、11:40 明火扑灭来自公开通报。', '当前 OSM 路网只用于演示求解，不代表 2024 年现场路况。'],
      risks: ['实际车辆与路线未知，演示 ETA 不能评价当年处置速度。', '场址范围涉及多个门牌，建筑内部状态仍需现场核验。'],
      gaps: ['实际调派编成', '首车到场时刻', '真实行驶路线', '任务签收与现场反馈'],
    },
    plans: [
      { id: 'plan-a', label: 'A', title: '近端力量并行协同', summary: '近端消防优先出发，交管与医疗同步准备，压缩首批到场时间。', etaMinutes: 8.9, coverageRisk: '较低', resourceCost: '增加 1 个前置协同单元', actions: ['近端消防力量优先集结', '关键路口提前准备通行', '医疗接应与现场核验并行'] },
      { id: 'plan-b', label: 'B', title: '均衡保障与外围核验', summary: '保持辖区覆盖，先稳定外围通道，再组织核心力量到场。', etaMinutes: 9.6, coverageRisk: '较低', resourceCost: '维持基线编成', actions: ['外围保障先行确认', '核心与增援力量分批到场', '现场缺口触发二次研判'] },
    ],
    tasks: [
      { department: '消防', task: '组织近端力量集结并核验场址入口', timing: '8 分钟内到场' },
      { department: '交管', task: '准备关键路口通行与受阻回报', timing: '9 分钟内到位' },
      { department: '医疗', task: '建立接应点并回报可用状态', timing: '10 分钟内待命' },
      { department: '现场组', task: '回传楼内通道与人员信息', timing: '10 分钟内回传' },
    ],
    earlyTasks: ['交管通行准备', '医疗接应点确认', '现场信息缺口清单下发'],
    avoidedBlockers: ['任务串行等待', '通行受阻后才开始协调', '现场缺口未进入任务包'],
    unresolvedRisks: ['真实道路状态未知', '建筑内部情况未公开', '人员损失不可作反事实归因'],
    resourceDelta: '方案 A 增加 1 个前置协同单元；方案 B 维持基线编成',
    boundary: '比较只在同一公开信息、同一假设集、同一路网快照和同一模型版本内成立，不评价 2024 年真实处置。',
  },
  'hc-station-2015': {
    id: 'hc-station-2015',
    scenarioId: 'haizhu-police',
    title: '广州火车站持刀伤人',
    address: '越秀区广州火车站站外广场',
    domain: '110 警情',
    domainColor: '#2F6FDA',
    facts: STATION_PUBLIC_FACTS,
    initialFactLabels: ['日期', '民警发现时刻', '地点'],
    stageDeltas: [
      '只接入事件发生时可获得的时间地点，不把后续结果作为先验。',
      '将站区警情归并为统一事件，减少多部门各自理解。',
      '提前暴露警力编成、通行、人流和医疗分流的信息缺口。',
      '把核心响应、外围疏导和医疗接应的优先级提前说明。',
      '在相同输入下比较并行协同与分区控制的后果。',
      '由指挥者确认方案、资源代价和演示边界。',
      '让核心响应、外围疏导与医疗接应并行生成任务。',
      '通过签收、路线和现场反馈持续校正推演过程。',
      '集中对比到场变化、提前任务、资源成本和残余风险。',
    ],
    runs: STATION_SIMULATION_RUNS,
    executions: STATION_EXECUTIONS,
    originalTimeline: [
      { time: '08:20 许', label: '民警发现事件', detail: '公开报道中的粗粒度时间锚点', known: true },
      { time: '精确过程未公开', label: '疏散、示警与现场控制', detail: '仅保留报道披露的处置顺序，不补造分段时刻', known: false },
      { time: '13:33 前', label: '现场封锁解除', detail: '报道发布时已经解除', known: true },
    ],
    blockers: [
      { label: '阶段时刻', detail: '报道只有粗粒度序列，没有分段时间', status: '信息缺口' },
      { label: '警力与路线', detail: '编成、到场路线和签收均未公开', status: '信息缺口' },
      { label: '公开粗序列', detail: '发现、疏散、示警和现场控制顺序可核验', status: '公开事实' },
    ],
    brief: {
      conclusion: ['公开资料可确认时间、地点、伤者数量和粗粒度处置序列。', 'CityOS 只比较同条件下的站区协同方式，不评价真实警务处置。'],
      evidence: ['2015-03-06 上午 8 时 20 分许，广州火车站站外广场，9 人受伤。', '警力、路线、医院分流和签收未公开，全部进入演示边界。'],
      risks: ['站区人流与实时通行状态未知。', '医疗分流与实际警力可用性不可核验。'],
      gaps: ['警力编成', '到场路线', '医院分流', '阶段精确时刻'],
    },
    plans: [
      { id: 'plan-a', label: 'A', title: '核心响应与外围协同并行', summary: '核心响应、外围疏导和医疗接应同时启动。', etaMinutes: 8.6, coverageRisk: '较低', resourceCost: '增加 1 个站区协同岗位', actions: ['核心响应组优先到场', '外围疏导同步启动', '医疗接应提前确认'] },
      { id: 'plan-b', label: 'B', title: '分区控制与医疗优先', summary: '先稳定站区边界与医疗通道，再推进核心区域协同。', etaMinutes: 9.3, coverageRisk: '较低', resourceCost: '增加 1 个医疗接应岗位', actions: ['站区入口分区控制', '医疗通道优先保持', '核心区域按回报推进'] },
    ],
    tasks: [
      { department: '公安', task: '建立核心响应与外围分区任务', timing: '8 分钟内到场' },
      { department: '站区协同', task: '组织外围疏导并回报入口状态', timing: '9 分钟内到位' },
      { department: '医疗', task: '准备接应通道与分流', timing: '10 分钟内待命' },
    ],
    earlyTasks: ['外围疏导任务', '医疗接应确认', '站区入口状态回报'],
    avoidedBlockers: ['外围任务等待核心响应完成', '医疗接应启动过晚', '入口状态未同步进入任务包'],
    unresolvedRisks: ['真实人流状态未知', '实际警力与医院能力未公开', '不能据此评价 2015 年真实处置'],
    resourceDelta: '增加 1 个站区或医疗前置岗位，具体取决于批准方案',
    boundary: '两条演示轨共用公开时间地点、同一假设集和当前 OSM 快照；不还原或评价 2015 年真实处置。',
  },
}

export function isHistoricalReviewCaseId(value: string | null): value is HistoricalReviewCaseId {
  return value === 'hc-liwan-516' || value === 'hc-station-2015'
}
