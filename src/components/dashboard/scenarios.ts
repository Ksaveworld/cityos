import type { ChainStep, DataOrigin } from '@/engine'

export const CHAIN_STEPS: Array<{
  key: ChainStep
  short: string
  label: string
}> = [
  // 8/21 评审把处置环节定死成六段：
  // 研判输入（Signal → Event → Context）—— AI Brief —— 方案生成 —— 任务下发 —— 反馈 —— 报告。
  // 前三环在侧栏折成「研判输入」一组，人工拍板并进方案生成（那一页本来就有人工批准），
  // 所以九个 key 保留不动，只让上屏文案对齐这六段。
  { key: 'Signal', short: '信号', label: 'Signal 信号接入' },
  { key: 'Event', short: '事件', label: 'Event 事件归并' },
  { key: 'Context', short: '补齐', label: 'Context 上下文补齐' },
  { key: 'AIBrief', short: 'AI Brief', label: 'AI Brief' },
  { key: 'Strategy', short: '方案生成', label: 'Strategy 方案生成' },
  { key: 'HumanDecision', short: '拍板', label: 'Human Decision 人工拍板' },
  { key: 'Task', short: '任务下发', label: 'Task 任务下发' },
  { key: 'Feedback', short: '反馈', label: 'Feedback 反馈' },
  { key: 'Review', short: '报告', label: 'Review 报告' },
]

export type StepState = 'complete' | 'summary' | 'not-run' | 'phase-1'
export type ScenarioKind = 'fire' | 'police' | 'medical' | 'traffic' | 'major' | 'other'

export interface DashboardScenario {
  id: string
  tab: string
  title: string
  subtitle: string
  address: string
  kind: ScenarioKind
  typeLabel: string
  statusLabel: string
  updatedAt: string
  origin: DataOrigin
  originNote: string
  lifecycleOrigin?: DataOrigin
  lifecycleNote?: string
  states: StepState[]
  notes: string[]
}

export const DASHBOARD_SCENARIOS: DashboardScenario[] = [
  {
    id: 'liwan-fire',
    tab: '119 消防',
    title: '5·16 服装交易市场火灾',
    subtitle: '经营与仓储混合 · 楼层信息待核实',
    address: '荔湾区人民南路 89、91、93、89-1 号',
    kind: 'fire',
    typeLabel: '火情',
    statusLabel: '推演中',
    updatedAt: '09:35',
    origin: 'real',
    originNote: '地址、接警与扑灭时刻来自官方公开口径',
    lifecycleOrigin: 'simulated',
    lifecycleNote: '信号构成、资源状态、调派与处置过程为演示演示',
    states: [
      'complete',
      'complete',
      'complete',
      'complete',
      'summary',
      'not-run',
      'not-run',
      'summary',
      'summary',
    ],
    notes: [
      '三路信号已接入；只有 119 接报为真实公开事件锚点，另两路为演示。',
      '三层与四层说法冲突，已确认事实与待核实线索分开展示。',
      '建筑、医院、消防站点位和路网来自 OSM；资源实时状态为演示。',
      '态势快照已生成，同时保留设施状态、内部平面与库存性质三个缺口。',
      'A/B 使用同一起终点真实求解；ETA 来自演示速度模型，当前差异不显著。',
      '待人工确认：派遣与请求开路均需人工批准。',
      '待确认后生成：人工确认后才形成可下发任务。',
      '展示既有演示回执，用于说明反馈数据结构，不代表历史过程。',
      '已形成可追溯建议报告；公开事实、演示数据与模型估算分别标注。',
    ],
  },
  {
    id: 'haizhu-police',
    tab: '110 警情',
    title: '广州火车站持刀伤人历史案例',
    subtitle: '2015-03-06 公开事件 · 处置细节采用演示轨',
    address: '越秀区广州火车站站外广场',
    kind: 'police',
    typeLabel: '历史警情',
    statusLabel: '公开案例推演',
    updatedAt: '2015-03-06',
    origin: 'real',
    originNote: '日期、约 8:20、站外广场、9 人受伤和粗粒度处置序列来自公开报道',
    lifecycleOrigin: 'simulated',
    lifecycleNote: '警力编成、路线、医院分流、任务签收与阶段时间均为演示演示',
    states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
    notes: [
      '以中国日报 2015-03-06 报道提供日期、约 8:20、地点、9 人受伤和粗粒度处置序列。',
      '原警力编成、到场路线、医院分流、指挥流程和签收回执均未公开，不作历史补造。',
      '公开 OSM 道路与设施 POI 只提供地理参考；实时状态和历史可用性未知。',
      '态势快照严格区分公开锚点、公众信息约束下的基线演示和 CityOS 方案演示。',
      '比较“近端双向响应”和“站区分层协同”两种演示处置顺序，不证明历史优劣。',
      '当前演示方案必须经人工批准；界面不触发真实警务或医疗指令。',
      '生成站区疏导、演示响应和医疗接应任务草案，不向外部系统下发。',
      '动态舞台仅使用 T+ 相对时间，异常分支可暂停并等待人工处理。',
      '报告回看公开事实与演示边界，不展示与调度无关的个人信息。',
    ],
  },
  {
    id: 'yuexiu-police-current',
    tab: '110 警情',
    title: '广州站广场协查任务签收异常',
    subtitle: '当前演示任务 · 签收超时与备用响应协同',
    address: '越秀区广州火车站广场',
    kind: 'police',
    typeLabel: '110 协查',
    statusLabel: '执行异常',
    updatedAt: '14:26',
    origin: 'simulated',
    originNote: '事件、警力、联系人、ETA、占用与签收状态均为演示；地点仅参考公开 POI',
    states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
    notes: [
      '任务回执超时来自演示事件流，不代表真实警情或警务记录。',
      '地点只参考公开地图；响应单位、负责人和外围岗位均为演示。',
      '调整会生成新方案版本，并使原批准和任务包失效。',
      '人工重新批准后才允许演示下发；异常最多受控重试一次。',
    ],
  },
  {
    id: 'yuexiu-medical',
    tab: '120 医疗',
    title: '越秀商圈急救保障协同',
    subtitle: '演示医疗保障 · 急救分级与转运协同',
    address: '越秀区盘福路周边',
    kind: 'medical',
    typeLabel: '医疗协同',
    statusLabel: '演示处置',
    updatedAt: '20:28',
    origin: 'simulated',
    originNote: '事件、位置、保障资源与转运状态均为演示',
    states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
    notes: [
      '以工作人员已验证模板展示医疗保障的演示输入，未接真实 120 或医院系统。',
      '输入归并为商圈急救保障事件；患者数量、等级与接收能力必须人工核验。',
      '补齐公开医疗 POI、道路和接收点参考；救护车状态与床位不在本演示范围内。',
      '形成急救分级、接收点与转运路径的演示态势快照。',
      '比较近端先到、分级转运与双点保障、通道优先两套演示方案。',
      '由人工批准当前医疗保障方案；界面只记录演示选择。',
      '生成急救分级、接收点联络与转运待命的演示任务包。',
      '展示演示送达、签收与保障状态，不触发真实派车或转运。',
      '沉淀输入边界、人工门禁和演示反馈，不代表真实医疗记录。',
    ],
  },
  {
    id: 'yuexiu-traffic',
    tab: '交通协同',
    title: '中山路交通事故协同',
    subtitle: '演示道路事件 · 事故路段与绕行协同',
    address: '越秀区中山路沿线',
    kind: 'traffic',
    typeLabel: '交通协同',
    statusLabel: '协同展示',
    updatedAt: '20:36',
    origin: 'simulated',
    originNote: '事件、位置、拥堵与路口状态均为演示',
    states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
    notes: [
      '以一条演示市民上报展示 Signal 输入结构，来源与时间窗边界单独标注。',
      'Signal 归并为一条中山路事故协同事件，事故形态与车道占用仍待人工确认。',
      '补齐事故路段、相邻路口和保障点位；实时路况与信号配时不在本演示范围内。',
      '形成事故点、缓行段、医疗保障与绕行关系的演示态势快照。',
      '比较“现场防护后清障”和“外围绕行后协同清障”两种演示处置顺序。',
      '由人工确认交通组织动作；界面不控制真实信号灯或道路设施。',
      '生成现场防护、医疗待命、清障联络与绕行提示的演示任务草案。',
      '反馈样例展示事故点防护、清障确认与绕行提示三个状态字段。',
      '回看路段影响、协同顺序与人工门禁；报告不代表真实交通事件记录。',
    ],
  },
  {
    id: 'tianhe-major',
    tab: '重大布防',
    title: '体育中心活动保障布防',
    subtitle: '演示重大活动 · 分区、入口与保障协同',
    address: '天河体育中心周边',
    kind: 'major',
    typeLabel: '重大布防',
    statusLabel: '演示布防',
    updatedAt: '19:58',
    origin: 'simulated',
    originNote: '活动、客流、资源与布防状态均为演示',
    states: ['summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary', 'summary'],
    notes: [
      '以演示活动备案与场馆容量两路输入展示 Signal 结构。',
      'Signal 归并为一条体育中心活动保障事件，活动规模与开放区域由人工确认。',
      '补齐场馆分区、北东南入口、安保集结与医疗保障点；实时客流不在本演示范围内。',
      '形成入口、分区和保障通道的演示态势快照，不进行人群预测。',
      '比较“入口均衡布防”和“重点入口加强、保障通道优先”两种演示布局。',
      '由人工确认开放入口与保障等级；界面只记录选择，不触发真实审批。',
      '生成入口值守、医疗保障、通道巡查与联络确认的演示任务草案。',
      '反馈样例展示保障点、入口状态与通道状态三个结构化字段。',
      '回看分区覆盖、人工门禁与反馈闭环；报告仅用于展示，不代表实际活动记录。',
    ],
  },
]
