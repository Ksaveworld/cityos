import {
  HISTORY_516_FACTS,
  HISTORY_516_RUNS,
  type HistorySource,
  type PublicFact,
} from '../historical/history516'
import {
  STATION_HISTORY_SOURCE,
  STATION_PUBLIC_FACTS,
  STATION_SIMULATION_RUNS,
} from '../historical/stationHistory'

// 复盘报告数据。
//
// 这份报告回答的问题和《应急响应方案报告》不是一回事：
//   方案报告 —— 现在怎么打（目标、资源组合、路线时间窗、部门任务）
//   复盘报告 —— 同一份约束下，基线处置和 CityOS 方案差在哪
//
// **最重要的一条边界：报告里绝不能出现「我们比当年快了 X 分钟」。**
// 5·16 的实际到场时间、车辆编成、路线、签收都没有公开，没有可比基线，
// 这么写就是编。能写的只有「同一份公开约束下，基线演示 vs CityOS 演示的差值」——
// 两条都是我们自己跑的演示，互相之间才可比。
//
// 因此报告分两类，能下的结论完全不同：
//   public-case    有公开事实锚点（5·16 与广州火车站）。事实与演示必须分栏，不得混排。
//   simulated-case 整场事件都是演示的。差值只在演示内部成立，
//                  不构成对任何真实处置的评价。

export type ReviewReportKind = 'public-case' | 'simulated-case'

export interface ReviewTrackSummary {
  title: string
  etaMinutes: number
  coverageRisk: string
  note: string
}

export interface ReviewComparisonRow {
  metric: string
  baseline: string
  cityos: string
  delta: string
  /** 显式告诉界面这是提升、共同条件、权衡还是不可比，不能靠颜色或文案猜。 */
  outcome: 'improved' | 'same' | 'tradeoff' | 'not-comparable'
  /** false = 这一行不可比，必须在 note 里写明为什么 */
  comparable: boolean
  note: string
}

export interface ReviewDeposit {
  label: string
  value: string
  note: string
}

export interface ReviewReport {
  /** 与 knowledgeData.ts 的条目 id 对齐 */
  id: string
  scenarioId: string
  kind: ReviewReportKind
  domain: string
  domainColor: string
  title: string
  subtitle: string
  generatedAt: string
  reportNo: string
  assumptionSetId: string
  mapSnapshot: string
  modelVersion: string
  /** 公开事实。simulated-case 一律为空数组，不允许伪造 */
  facts: PublicFact[]
  /** simulated-case 的事件前提声明；public-case 不填 */
  simulatedPremise?: string
  baseline: ReviewTrackSummary
  cityos: ReviewTrackSummary
  comparison: ReviewComparisonRow[]
  /** 明确不能下结论的项，报告里单独成节，不能藏在脚注里 */
  incomparable: string[]
  deposits: ReviewDeposit[]
  sources: HistorySource[]
}

const OSM_SNAPSHOT: HistorySource = {
  title: 'OpenStreetMap 公开路网快照',
  href: 'https://www.openstreetmap.org/copyright',
}

const DEMO_MODEL: HistorySource = {
  title: 'CityOS demo-model v2 · 演示推演模型',
  href: '#',
}

const SHARED_MAP_SNAPSHOT = '当前公开 OSM 地理快照（非事发当时的现场底图）'
const SHARED_MODEL = 'CityOS demo-model v2'

/** 两条演示轨共用的口径声明，避免各处措辞不一致 */
const SAME_CONSTRAINT_NOTE = '与常规对照使用相同输入、同一组演示假设、同一路网快照和同一模型版本，只比较处置方式带来的变化。'

function simulatedReport(config: {
  id: string
  scenarioId: string
  domain: string
  domainColor: string
  title: string
  reportNo: string
  generatedAt: string
  assumptionSetId: string
  premise: string
  baselineEta: number
  baselineRisk: string
  cityosEta: number
  cityosRisk: string
  comparison: ReviewComparisonRow[]
  incomparable: string[]
  deposits: ReviewDeposit[]
}): ReviewReport {
  return {
    id: config.id,
    scenarioId: config.scenarioId,
    kind: 'simulated-case',
    domain: config.domain,
    domainColor: config.domainColor,
    title: config.title,
    subtitle: '整场事件为演示演示。只比较相同输入下的常规处置与 CityOS 协同处置，不评价任何真实事件或真实部门。',
    generatedAt: config.generatedAt,
    reportNo: config.reportNo,
    assumptionSetId: config.assumptionSetId,
    mapSnapshot: SHARED_MAP_SNAPSHOT,
    modelVersion: SHARED_MODEL,
    facts: [],
    simulatedPremise: config.premise,
    baseline: {
      title: '常规处置演示（对照组）',
      etaMinutes: config.baselineEta,
      coverageRisk: config.baselineRisk,
      note: '按不使用 CityOS 协同的常规方式构造：可用力量依次出动，不提前并行协调通行与接收资源。',
    },
    cityos: {
      title: 'CityOS 协同处置演示',
      etaMinutes: config.cityosEta,
      coverageRisk: config.cityosRisk,
      note: SAME_CONSTRAINT_NOTE,
    },
    comparison: config.comparison,
    incomparable: config.incomparable,
    deposits: config.deposits,
    sources: [OSM_SNAPSHOT, DEMO_MODEL],
  }
}

const etaRow = (baseline: number, cityos: number, note: string): ReviewComparisonRow => ({
  metric: '预计首批到场时间',
  baseline: `${baseline.toFixed(1)} 分钟`,
  cityos: `${cityos.toFixed(1)} 分钟`,
  delta: `−${(baseline - cityos).toFixed(1)} 分钟`,
  outcome: cityos < baseline ? 'improved' : cityos === baseline ? 'same' : 'tradeoff',
  comparable: true,
  note,
})

const RISK_RANK: Record<string, number> = { '较低': 0, '注意': 1, '较高': 2 }

const coverageRow = (baseline: string, cityos: string, note: string): ReviewComparisonRow => ({
  metric: '关键资源覆盖风险',
  baseline,
  cityos,
  delta: baseline === cityos ? '持平' : `${baseline} → ${cityos}`,
  outcome: baseline === cityos
    ? 'same'
    : (RISK_RANK[cityos] ?? 99) < (RISK_RANK[baseline] ?? 99)
      ? 'improved'
      : 'tradeoff',
  comparable: true,
  note,
})

export const REVIEW_REPORTS: Record<string, ReviewReport> = {
  'kb-516': {
    id: 'kb-516',
    scenarioId: 'liwan-fire',
    kind: 'public-case',
    domain: '119 消防',
    domainColor: '#E5484D',
    title: '5·16 服装交易市场火灾 · 公开复盘报告',
    subtitle: '公开事实与两种演示严格分开。只比较相同公开信息和演示条件下，CityOS 协同处置相对常规对照带来的变化。',
    generatedAt: '2026-08-20 21:40',
    reportNo: 'RVW-20260820-FIRE-516',
    assumptionSetId: HISTORY_516_RUNS.baseline.assumptionSetId ?? '516-public-constraints-v1',
    mapSnapshot: HISTORY_516_RUNS.baseline.mapSnapshot,
    modelVersion: HISTORY_516_RUNS.baseline.modelVersion ?? SHARED_MODEL,
    facts: HISTORY_516_FACTS,
    baseline: {
      title: HISTORY_516_RUNS.baseline.title,
      etaMinutes: HISTORY_516_RUNS.baseline.etaMinutes ?? 10.6,
      coverageRisk: HISTORY_516_RUNS.baseline.coverageRisk ?? '注意',
      note: HISTORY_516_RUNS.baseline.subtitle,
    },
    cityos: {
      title: HISTORY_516_RUNS.cityos.title,
      etaMinutes: HISTORY_516_RUNS.cityos.etaMinutes ?? 8.9,
      coverageRisk: HISTORY_516_RUNS.cityos.coverageRisk ?? '较低',
      note: HISTORY_516_RUNS.cityos.subtitle,
    },
    comparison: [
      etaRow(10.6, 8.9, '两条轨都用公开站点位置与同一份 OSM 路网求解，差值来自资源点选择与通行假设。'),
      coverageRow('注意', '较低', '差值来自近端增援点优先，不代表实际可调派力量。'),
      {
        metric: '共同使用的接警时间',
        baseline: '2024-05-16 09:32',
        cityos: '2024-05-16 09:32',
        delta: '同一锚点',
        outcome: 'same',
        comparable: true,
        note: '唯一被两条轨共用的公开事实，作为时间原点。',
      },
      {
        metric: '当年真实首车到场时间',
        baseline: '未公开',
        cityos: '不适用',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '通报未披露到场时刻，没有可比基线；任何「快了多少分钟」的说法都不成立。',
      },
      {
        metric: '当年真实车辆和路线',
        baseline: '未公开',
        cityos: '不适用',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '认定公告未披露调派明细，演示编成不得反推为原处置事实。',
      },
      {
        metric: '人员损失',
        baseline: '1 人死亡（公开报道）',
        cityos: '不适用',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '结果由多重因素决定，不能归因到任一演示方案，也不做「本可避免」的推断。',
      },
    ],
    incomparable: [
      '当年实际到场时刻、车辆编成、行驶路线与任务签收均未公开，本报告不提供任何与实际处置的速度对比。',
      '明火扑灭时刻 11:40 是公开结果，不推定其间的调派过程，也不作为模型验证依据。',
      '人员伤亡不作为方案优劣的比较项。',
      '地理底图为当前 OSM 快照，与 2024 年现场路况、临时管制和建筑状态可能不同。',
    ],
    deposits: [
      { label: '公开事实锚点', value: '接警时刻、公开地点、明火扑灭时刻', note: '可作为后续同类推演的时间原点，来源可追溯。' },
      { label: '未公开缺口清单', value: '调派 / 车辆 / 路线 / 签收 四项', note: '进入缺口台账，提醒后续推演不得默认补齐。' },
      { label: '假设集', value: HISTORY_516_RUNS.baseline.assumptionSetId ?? '516-public-constraints-v1', note: '两条轨共用，复现时必须声明同一编号。' },
    ],
    sources: [
      { title: '新华网转引广州消防通报', href: 'https://www.news.cn/local/20240516/a20dae5834f04200a84df9524b7a65a8/c.html' },
      { title: '荔湾区政府事故认定公告', href: 'https://www.lw.gov.cn/ywdt/tzgg/content/post_9718703.html' },
      OSM_SNAPSHOT,
      DEMO_MODEL,
    ],
  },

  'kb-routine': simulatedReport({
    id: 'kb-routine',
    scenarioId: 'liwan-fire',
    domain: '119 消防',
    domainColor: '#E5484D',
    title: '高层办公楼火情联动 · 日常响应复盘报告',
    reportNo: 'RVW-20260820-FIRE-RTN',
    generatedAt: '2026-08-20 15:12',
    assumptionSetId: 'routine-highrise-v1',
    premise: '演示接警 15:00，高层办公楼 18 层烟气扩散，约 42 人待核验。事件、人数、楼层状态全部为演示构造，未发生真实火情。',
    baselineEta: 10.2,
    baselineRisk: '注意',
    cityosEta: 8.7,
    cityosRisk: '较低',
    comparison: [
      etaRow(10.2, 8.7, '差值来自近端站优先与关键路口开路假设，两条轨用同一份本地 OSM 路网求解。'),
      coverageRow('注意', '较低', '差值来自资源点选择；可用状态为演示值，不代表真实可调派力量。'),
      {
        metric: '同步参与的部门',
        baseline: '3 个部门',
        cityos: '5 个部门（消防 / 公安 / 医疗 / 交管 / 属地）',
        delta: '+2',
        outcome: 'improved',
        comparable: true,
        note: '基线只做消防主责与外围警戒，CityOS 轨把医疗与属地纳入同一任务包。',
      },
      {
        metric: '楼内真实情况',
        baseline: '未知',
        cityos: '未知',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '被困人数、消防通道与排烟状态均待现场回传，两条轨都没有这项输入。',
      },
    ],
    incomparable: [
      '整场事件为演示构造，任何数值都不得引用为真实处置绩效。',
      '被困人数、消防通道状态、供电与排烟状态在两条轨中都是未知项，不参与比较。',
      '资源可用状态为演示快照，不代表任何单位的真实值班与在位情况。',
    ],
    deposits: [
      { label: '高层火情假设集', value: 'routine-highrise-v1', note: '楼层扩散、疏散优先级与登高作业约束，可复用于同类高层推演。' },
      { label: '五部门任务包模板', value: '消防 / 公安 / 医疗 / 交管 / 属地', note: '含回传要求与时限字段，可作为跨部门协同的结构模板。' },
      { label: '缺口触发规则', value: '人数变化触发重新研判', note: '进入规则库，供后续推演复用。' },
    ],
  }),

  'kb-police': {
    id: 'kb-police',
    scenarioId: 'haizhu-police',
    kind: 'public-case',
    domain: '110 警情',
    domainColor: '#2F6FDA',
    title: '广州火车站 2015 历史案例 · 公开约束复盘报告',
    subtitle: '公开事实与两种演示严格分开。只比较相同公开信息和演示条件下，CityOS 协同处置相对常规对照带来的变化。',
    reportNo: 'RVW-20260820-POL-GZRS',
    generatedAt: '2026-08-20 22:10',
    assumptionSetId: STATION_SIMULATION_RUNS.baseline.assumptionSetId ?? 'station-20150306-public-constraints-v1',
    mapSnapshot: STATION_SIMULATION_RUNS.baseline.mapSnapshot,
    modelVersion: STATION_SIMULATION_RUNS.baseline.modelVersion ?? SHARED_MODEL,
    facts: STATION_PUBLIC_FACTS,
    baseline: {
      title: STATION_SIMULATION_RUNS.baseline.title,
      etaMinutes: STATION_SIMULATION_RUNS.baseline.etaMinutes ?? 10.8,
      coverageRisk: STATION_SIMULATION_RUNS.baseline.coverageRisk ?? '注意',
      note: STATION_SIMULATION_RUNS.baseline.subtitle,
    },
    cityos: {
      title: STATION_SIMULATION_RUNS.cityos.title,
      etaMinutes: STATION_SIMULATION_RUNS.cityos.etaMinutes ?? 8.6,
      coverageRisk: STATION_SIMULATION_RUNS.cityos.coverageRisk ?? '较低',
      note: STATION_SIMULATION_RUNS.cityos.subtitle,
    },
    comparison: [
      etaRow(10.8, 8.6, '两条演示轨共用公开锚点、当前 OSM 快照、资源假设和模型版本；不得与真实历史到场时间比较。'),
      coverageRow('注意', '较低', '差值来自演示核心响应、外围疏导和医疗接应的并行顺序。'),
      {
        metric: '共同使用的公开时间和地点',
        baseline: '2015-03-06 · 约 8:20 · 站外广场',
        cityos: '同一锚点',
        delta: '一致',
        outcome: 'same',
        comparable: true,
        note: '只作为两条演示轨共同的时间与空间原点。',
      },
      {
        metric: '当年真实警力、路线和签收',
        baseline: '未公开',
        cityos: '不适用',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '公开报道没有相关记录，演示编成和路线不能反推为历史事实。',
      },
    ],
    incomparable: [
      '真实警力编成、到场路线、医院分流、指挥流程和签收回执均未公开。',
      '除约 8:20 外，公开报道没有分段处置时刻，所有舞台节点只能使用 T+ 相对时间。',
      '9 人受伤是当日通报口径，不据此推断演示方案对真实结果的影响。',
      '当前 OSM 快照不等于 2015 年现场道路、设施状态或临时管制。',
    ],
    deposits: [
      { label: '公开事实锚点', value: '日期 / 约 8:20 / 地点 / 9 人受伤 / 粗序列', note: '来源指向同一篇已核验公开报道。' },
      { label: '未公开缺口', value: '警力 / 路线 / 分流 / 指挥 / 签收', note: '进入缺口台账，禁止在演示外补齐。' },
      { label: '假设集', value: STATION_SIMULATION_RUNS.baseline.assumptionSetId ?? 'station-20150306-public-constraints-v1', note: '两条演示轨必须共用同一编号。' },
    ],
    sources: [STATION_HISTORY_SOURCE, OSM_SNAPSHOT, DEMO_MODEL],
  },

  'kb-medical': simulatedReport({
    id: 'kb-medical',
    scenarioId: 'yuexiu-medical',
    domain: '120 医疗',
    domainColor: '#0E9AA7',
    title: '越秀商圈急救保障协同 · 分级转运复盘报告',
    reportNo: 'RVW-20260819-MED-PFL',
    generatedAt: '2026-08-19 22:05',
    assumptionSetId: 'medical-triage-v1',
    premise: '演示商圈急救保障事件，含一名中等优先级患者。患者分级、接收点能力与转运需求全部为演示构造。',
    baselineEta: 9.2,
    baselineRisk: '注意',
    cityosEta: 7.4,
    cityosRisk: '较低',
    comparison: [
      etaRow(9.2, 7.4, '差值来自急救点与接收点的配对方式，两条轨共用同一路网与同一速度假设。'),
      coverageRow('注意', '较低', '差值来自接收点分流，接收能力为演示值。'),
      {
        metric: '接收点确认',
        baseline: '到场后再联系',
        cityos: '出车同时预确认',
        delta: '提前 1 个环节',
        outcome: 'improved',
        comparable: true,
        note: '两条轨的联系耗时都用同一演示常量，差值只反映流程顺序不同。',
      },
      {
        metric: '患者实际分级',
        baseline: '待现场确认',
        cityos: '待现场确认',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '分级只能由现场医护判定，模型不做也不应做这项推断。',
      },
    ],
    incomparable: [
      '整场事件为演示构造，不对应任何真实急救记录。',
      '患者分级、伤情演变与救治结果不在推演范围内，模型不参与临床判断。',
      '医院接收能力为演示值，不代表任何医疗机构的真实床位与急诊状态。',
    ],
    deposits: [
      { label: '分级转运假设集', value: 'medical-triage-v1', note: '急救点—接收点配对与预确认流程顺序。' },
      { label: '接收点预确认规则', value: '出车同时发起接收确认', note: '流程顺序规则，可复用于 119 联动医疗。' },
    ],
  }),

  'kb-traffic': simulatedReport({
    id: 'kb-traffic',
    scenarioId: 'yuexiu-traffic',
    domain: '交通协同',
    domainColor: '#B8860B',
    title: '中山路交通事故协同 · 清障绕行复盘报告',
    reportNo: 'RVW-20260819-TRF-WML',
    generatedAt: '2026-08-19 19:20',
    assumptionSetId: 'traffic-incident-v1',
    premise: '演示事故占用文明路一段车道，触发局部绕行。事故形态、占道时长与车流量全部为演示构造。',
    baselineEta: 11.3,
    baselineRisk: '较高',
    cityosEta: 9.1,
    cityosRisk: '注意',
    comparison: [
      etaRow(11.3, 9.1, '差值来自绕行方案的选择时机，两条轨都在同一份 OSM 路网上封闭同一条 way 后重算。'),
      coverageRow('较高', '注意', '差值来自提前发布绕行而非等待拥堵形成。'),
      {
        metric: '绕行发布时机',
        baseline: '拥堵形成后发布',
        cityos: '封闭确认时同步发布',
        delta: '提前约 1 个决策环节',
        outcome: 'improved',
        comparable: true,
        note: '两条轨的封闭确认耗时相同，差值只反映发布顺序。',
      },
      {
        metric: '实际车流量',
        baseline: '演示值',
        cityos: '演示值',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '未接入真实交管监测，车流量是演示常量，不能用来评价通行改善幅度。',
      },
    ],
    incomparable: [
      '整场事件为演示构造，不对应任何真实事故。',
      '车流量、平均车速与拥堵时长均为演示常量，未接入真实交管数据，不得引用为通行改善证据。',
      '清障作业时长为假设值，不代表真实清障能力。',
    ],
    deposits: [
      { label: '封路重算规则', value: '封闭整条 way 后重算局部绕行', note: '与 119 主链路共用同一封路工具，规则一致。' },
      { label: '绕行发布时机', value: '封闭确认时同步发布', note: '流程顺序规则，进入规则库。' },
    ],
  }),

  'kb-major': simulatedReport({
    id: 'kb-major',
    scenarioId: 'tianhe-major',
    domain: '重大布防',
    domainColor: '#7C3AED',
    title: '体育中心活动保障布防 · 分区覆盖复盘报告',
    reportNo: 'RVW-20260819-MAJ-THS',
    generatedAt: '2026-08-19 18:02',
    assumptionSetId: 'major-deployment-v1',
    premise: '演示大型活动散场时段的分区布防，含三个出入口与集结点。到场人数、散场节奏与安保编成全部为演示构造。',
    baselineEta: 12.0,
    baselineRisk: '注意',
    cityosEta: 10.1,
    cityosRisk: '较低',
    comparison: [
      etaRow(12.0, 10.1, '差值来自集结点位置与分区责任划分，两条轨共用同一份天河场景路网。'),
      coverageRow('注意', '较低', '差值来自三个出入口同时覆盖而非集中一处。'),
      {
        metric: '出入口覆盖',
        baseline: '主入口集中布防',
        cityos: '北 / 东 / 南三口分区覆盖',
        delta: '+2 个覆盖点',
        outcome: 'improved',
        comparable: true,
        note: '安保总人数在两条轨中相同，差值只反映分配方式。',
      },
      {
        metric: '实际散场人流',
        baseline: '演示值',
        cityos: '演示值',
        delta: '不可比',
        outcome: 'not-comparable',
        comparable: false,
        note: '未接入任何客流数据，人流是演示常量，不能用来评价踩踏风险。',
      },
    ],
    incomparable: [
      '整场事件为演示构造，不对应任何真实活动的安保部署。',
      '到场人数与散场节奏为演示常量，未接入客流数据，不得引用为踩踏风险评估。',
      '本推演只计算给定编成下的覆盖结果，不预测事故是否会发生。',
    ],
    deposits: [
      { label: '分区覆盖假设集', value: 'major-deployment-v1', note: '出入口分区与集结点位置约束。' },
      { label: '同编成再分配规则', value: '总人数不变，按出入口分区重新分配', note: '可复用于其他多出入口场馆。' },
    ],
  }),
}

export function findReviewReport(knowledgeEntryId: string): ReviewReport | null {
  return REVIEW_REPORTS[knowledgeEntryId] ?? null
}

/**
 * 按场景取复盘报告。
 * liwan-fire 一个场景挂着两条链路（5·16 公开复盘 / 日常演练），
 * 报告完全不同，必须靠 fireMode 区分——这是唯一需要额外参数的地方。
 */
export function findReviewReportByScenario(
  scenarioId: string,
  fireMode: 'public-review' | 'routine-simulation',
): ReviewReport | null {
  if (scenarioId === 'liwan-fire') {
    return REVIEW_REPORTS[fireMode === 'public-review' ? 'kb-516' : 'kb-routine'] ?? null
  }
  return Object.values(REVIEW_REPORTS).find((report) => report.scenarioId === scenarioId) ?? null
}
