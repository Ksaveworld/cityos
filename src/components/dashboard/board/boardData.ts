import type { PoiKind } from '../map/poiCatalog'

// 主看板（态势总览 / 资源调度）的演示数据。
// 全部为演示快照：数值只服务于「城市在持续运行、默认就有异常」的叙事，
// 不接任何实时系统。文案与数值集中在这里，需求变更时只改本文件。

export type IncidentFilter = 'all' | 'pending-decision' | 'abnormal'
export type TodayEventStatus = 'new' | 'pending-decision' | 'executing' | 'abnormal' | 'completed'
export type TodayEventDomain = '119' | '110' | '120' | '交通' | '重大布防'

export interface TodayEvent {
  id: string
  time: string
  domain: TodayEventDomain
  domainColor: string
  title: string
  location: string
  summary: string
  source: string
  owner: string
  status: TodayEventStatus
  severity: 'info' | 'watch' | 'critical'
  position: [number, number]
  poi: PoiKind
  shortLabel: string
  nextAction: string
  /** 只有五类经过验证的样板事件允许进入对应处置链 */
  workflowScenarioId?: string
}

export const TODAY_EVENT_STATUS_META: Record<TodayEventStatus, { label: string; bg: string; fg: string }> = {
  new: { label: '待核实', bg: '#F3F4F6', fg: '#6B7280' },
  'pending-decision': { label: '待人工决策', bg: '#FFF5DE', fg: '#946114' },
  executing: { label: '执行中', bg: '#EAF2FF', fg: '#2768CA' },
  abnormal: { label: '执行异常', bg: '#FDEBEC', fg: '#AD3B44' },
  completed: { label: '已完成', bg: '#E8F7EF', fg: '#237A52' },
}

/**
 * 今日事件台账。除明确标注的公开锚点外，状态与处置均为演示数据；
 * 坐标只用于演示列表与广州公开底图的空间联动。
 * 只有带 workflowScenarioId 的条目可进入经过验证的样板处置链。
 *
 * 历史案例见 HISTORICAL_CASES——8/21 评审要求右栏上下拆成「今日事件 / 历史事件」，
 * 广州站 2015 那条原来混在今日台账里标着 time: '历史'，本身就是这次要拆开的东西。
 */
export const TODAY_EVENTS: TodayEvent[] = [
  { id: 'ev-fire-finance', time: '15:00', domain: '119', domainColor: '#E5484D', title: '金融城高层办公楼火情联动', location: '天河区黄埔大道中 376 号', summary: '物业报告高层持续冒烟，人员数量和消防通道状态待核实。', source: '接警模板 + 物业上报', owner: '消防值守组', status: 'pending-decision', severity: 'critical', position: [113.3472, 23.1224], poi: 'fire', shortLabel: '金融城高层火情', nextAction: '核实被困人数与通道状态后，由人工选择 A/B 方案。', workflowScenarioId: 'liwan-fire' },
  { id: 'ev-medical-panfu', time: '14:48', domain: '120', domainColor: '#0E9AA7', title: '盘福路急救保障协同', location: '越秀区盘福路周边', summary: '患者分级与接收点能力尚未确认，转运方案等待人工选择。', source: '工作人员输入模板', owner: '急救联络负责人', status: 'pending-decision', severity: 'watch', position: [113.2568, 23.1265], poi: 'medical', shortLabel: '盘福路急救保障', nextAction: '确认患者等级和接收能力后批准转运方案。', workflowScenarioId: 'yuexiu-medical' },
  { id: 'ev-traffic-zhongshan', time: '14:44', domain: '交通', domainColor: '#B8860B', title: '中山路事故清障协同', location: '越秀区中山路沿线', summary: '原定开路节点反馈延迟，清障单元需要调整绕行入口。', source: '道路巡查模板', owner: '道路保障负责人', status: 'abnormal', severity: 'critical', position: [113.2684, 23.1253], poi: 'vehicle', shortLabel: '中山路清障异常', nextAction: '调整保障点并重新计算 ETA，旧批准立即失效。', workflowScenarioId: 'yuexiu-traffic' },
  { id: 'ev-major-tianhe', time: '14:35', domain: '重大布防', domainColor: '#7C3AED', title: '体育中心活动保障布防', location: '天河体育中心周边', summary: '开放入口与客流分布仍待场馆确认，岗位方案等待人工批准。', source: '活动备案模板', owner: '现场总协调', status: 'pending-decision', severity: 'watch', position: [113.3195, 23.1404], poi: 'assembly', shortLabel: '体育中心布防', nextAction: '确认开放入口后选择均衡或重点入口布防方案。', workflowScenarioId: 'tianhe-major' },
  { id: 'ev-fire-warehouse', time: '14:31', domain: '119', domainColor: '#E5484D', title: '芳村仓储点烟雾警情核验', location: '荔湾区芳村大道东', summary: '现场人员已开展外围核验，未确认是否存在明火。', source: '市民上报模板', owner: '芳村值守组', status: 'executing', severity: 'watch', position: [113.2351, 23.0997], poi: 'fire', shortLabel: '芳村烟雾核验', nextAction: '等待现场照片与物业负责人回报。' },
  { id: 'ev-police-station-delay', time: '14:26', domain: '110', domainColor: '#2F6FDA', title: '广州站广场协查任务签收超时', location: '越秀区广州火车站广场', summary: '一组协查任务超过签收时限，备用联系人尚未响应。', source: '任务回执模板', owner: '站区协同负责人', status: 'abnormal', severity: 'critical', position: [113.2574, 23.1488], poi: 'police', shortLabel: '广州站签收异常', nextAction: '切换备用联系人并要求重新签收。' },
  { id: 'ev-medical-yide', time: '14:18', domain: '120', domainColor: '#0E9AA7', title: '一德路老人跌倒急救协同', location: '越秀区一德路', summary: '急救单元已出发，现场商户正在协助保持通道。', source: '商户上报模板', owner: '急救调度组', status: 'executing', severity: 'watch', position: [113.2577, 23.1138], poi: 'medical', shortLabel: '一德路急救', nextAction: '等待到场分级和接收点确认。' },
  { id: 'ev-traffic-keyun', time: '14:12', domain: '交通', domainColor: '#B8860B', title: '科韵路车辆故障占道', location: '天河区科韵路口', summary: '清障单元在途，东向西一条车道保持缓行。', source: '道路巡查模板', owner: '天河交管协同组', status: 'executing', severity: 'watch', position: [113.3690, 23.1200], poi: 'vehicle', shortLabel: '科韵路车辆故障', nextAction: '清障到场后回传车道恢复时间。' },
  { id: 'ev-fire-electrical', time: '13:58', domain: '119', domainColor: '#E5484D', title: '北京路配电间烟雾核验', location: '越秀区北京路商圈', summary: '物业确认系设备短路产生烟雾，现场已完成断电和复核。', source: '物业上报模板', owner: '越秀值守组', status: 'completed', severity: 'info', position: [113.2687, 23.1194], poi: 'fire', shortLabel: '北京路烟雾核验', nextAction: '归档设备检修记录。' },
  { id: 'ev-police-noise', time: '13:51', domain: '110', domainColor: '#2F6FDA', title: '沿江路商户噪声纠纷', location: '越秀区沿江中路', summary: '两方诉求尚未完成初步核验，等待属地联系。', source: '市民上报模板', owner: '属地联络组', status: 'new', severity: 'info', position: [113.2709, 23.1098], poi: 'police', shortLabel: '沿江路噪声纠纷', nextAction: '联系商户和投诉人核实基本事实。' },
  { id: 'ev-medical-heat', time: '13:43', domain: '120', domainColor: '#0E9AA7', title: '人民公园游客不适保障', location: '越秀区人民公园', summary: '现场完成基础处置，游客状态稳定，无需转运。', source: '现场保障模板', owner: '活动医疗保障组', status: 'completed', severity: 'info', position: [113.2648, 23.1280], poi: 'medical', shortLabel: '人民公园医疗保障', nextAction: '完成事件记录并释放保障资源。' },
  { id: 'ev-traffic-tree', time: '13:37', domain: '交通', domainColor: '#B8860B', title: '东风路树枝占道待核实', location: '越秀区东风中路', summary: '收到占道线索，尚未取得现场图像和车道影响范围。', source: '巡查线索模板', owner: '道路巡查组', status: 'new', severity: 'watch', position: [113.2756, 23.1336], poi: 'vehicle', shortLabel: '东风路占道线索', nextAction: '派最近巡查人员确认占道范围。' },
  { id: 'ev-fire-kitchen', time: '13:29', domain: '119', domainColor: '#E5484D', title: '龙津路餐饮后厨冒烟', location: '荔湾区龙津东路', summary: '物业已疏散相邻商户，现场处于复核和通风阶段。', source: '物业上报模板', owner: '荔湾值守组', status: 'executing', severity: 'watch', position: [113.2446, 23.1236], poi: 'fire', shortLabel: '龙津路后厨冒烟', nextAction: '确认无复燃风险后结束现场任务。' },
  { id: 'ev-police-crowd', time: '13:16', domain: '110', domainColor: '#2F6FDA', title: '客运站候车区人员争执', location: '天河区客运站候车区', summary: '工作人员已分隔涉事人员，属地响应单元正在核验。', source: '场站上报模板', owner: '场站协同组', status: 'executing', severity: 'watch', position: [113.3431, 23.1714], poi: 'police', shortLabel: '客运站人员争执', nextAction: '回传人员身份和现场秩序状态。' },
  { id: 'ev-medical-sports', time: '13:04', domain: '120', domainColor: '#0E9AA7', title: '体育馆运动损伤待核实', location: '海珠区体育场周边', summary: '场馆报告一名人员运动损伤，伤情等级尚未确认。', source: '场馆上报模板', owner: '海珠急救联络组', status: 'new', severity: 'info', position: [113.2870, 23.0980], poi: 'medical', shortLabel: '体育馆运动损伤', nextAction: '电话核实意识、出血和行动能力。' },
  { id: 'ev-traffic-minor', time: '12:52', domain: '交通', domainColor: '#B8860B', title: '康王路轻微碰撞处置完成', location: '荔湾区康王中路', summary: '车辆已移至不妨碍通行区域，道路恢复正常。', source: '道路巡查模板', owner: '荔湾交管协同组', status: 'completed', severity: 'info', position: [113.2430, 23.1187], poi: 'vehicle', shortLabel: '康王路碰撞完成', nextAction: '归档清障与恢复时间。' },
  { id: 'ev-fire-false-alarm', time: '12:41', domain: '119', domainColor: '#E5484D', title: '环市路烟感线索复核完成', location: '越秀区环市东路', summary: '现场确认无火情，线索转入设施检修记录。', source: '设施上报模板', owner: '越秀值守组', status: 'completed', severity: 'info', position: [113.2865, 23.1410], poi: 'fire', shortLabel: '环市路烟感复核', nextAction: '通知物业检查烟感设备。' },
  { id: 'ev-police-elder', time: '12:28', domain: '110', domainColor: '#2F6FDA', title: '沙面走失老人协查', location: '荔湾区沙面街区', summary: '工作人员已获取衣着特征，正在联络周边服务点。', source: '服务点上报模板', owner: '沙面属地联络组', status: 'executing', severity: 'watch', position: [113.2392, 23.1097], poi: 'police', shortLabel: '沙面老人协查', nextAction: '核验身份信息并联系家属。' },
  { id: 'ev-medical-chest', time: '12:14', domain: '120', domainColor: '#0E9AA7', title: '陈家祠站乘客胸闷协同', location: '荔湾区陈家祠站周边', summary: '站务人员持续观察，急救单元正在前往。', source: '场站上报模板', owner: '荔湾急救联络组', status: 'executing', severity: 'watch', position: [113.2466, 23.1251], poi: 'medical', shortLabel: '陈家祠站急救', nextAction: '到场后完成生命体征分级。' },
  { id: 'ev-traffic-water', time: '12:02', domain: '交通', domainColor: '#B8860B', title: '工业大道积水线索', location: '海珠区工业大道北', summary: '收到路面积水线索，深度和车道影响尚待现场核验。', source: '市民上报模板', owner: '海珠道路巡查组', status: 'new', severity: 'watch', position: [113.2588, 23.0880], poi: 'vehicle', shortLabel: '工业大道积水', nextAction: '确认积水深度和可通行车道。' },
  { id: 'ev-police-merchant', time: '11:48', domain: '110', domainColor: '#2F6FDA', title: '上下九商户纠纷处理完成', location: '荔湾区上下九步行街', summary: '双方已停止争执并完成现场登记，秩序恢复。', source: '商圈上报模板', owner: '上下九属地组', status: 'completed', severity: 'info', position: [113.2483, 23.1141], poi: 'police', shortLabel: '上下九纠纷完成', nextAction: '归档现场登记和反馈。' },
  { id: 'ev-fire-elevator', time: '11:31', domain: '119', domainColor: '#E5484D', title: '珠江新城电梯间异味线索', location: '天河区珠江新城', summary: '物业报告电梯间异味，尚未确认来源和影响楼层。', source: '物业上报模板', owner: '天河值守组', status: 'new', severity: 'info', position: [113.3215, 23.1192], poi: 'fire', shortLabel: '珠江新城异味线索', nextAction: '物业机电人员先行核实并回传。' },
]

/**
 * 固定脚本式实时演示。每一步都同时追加一条台账记录；涉及出动的步骤再增加在途
 * 单位口径，避免顶部数字和事件列表各演各的。
 */
export const LIVE_DEMO_STEPS: Array<{ event: TodayEvent; enrouteDelta: number }> = [
  {
    event: {
      id: 'live-police-child',
      time: '',
      domain: '110',
      domainColor: '#2F6FDA',
      title: '北京路商圈走失儿童协查',
      location: '越秀区北京路步行街',
      summary: '商圈服务点已提交衣着特征，周边响应单元等待人工确认协查范围。',
      source: '服务点上报模板',
      owner: '越秀属地联络组',
      status: 'pending-decision',
      severity: 'watch',
      position: [113.2693, 23.1197],
      poi: 'police',
      shortLabel: '北京路协查',
      nextAction: '人工确认协查范围后下发周边服务点任务。',
      workflowScenarioId: 'haizhu-police',
    },
    enrouteDelta: 0,
  },
  {
    event: {
      id: 'live-medical-haizhu',
      time: '',
      domain: '120',
      domainColor: '#0E9AA7',
      title: '海珠广场急救保障单元出发',
      location: '越秀区海珠广场周边',
      summary: '最近保障单元完成签收并转为在途，接收点能力仍在持续核验。',
      source: '急救协同模板',
      owner: '越秀急救联络组',
      status: 'executing',
      severity: 'info',
      position: [113.2590, 23.1128],
      poi: 'medical',
      shortLabel: '海珠广场急救',
      nextAction: '到场后回传患者分级并确认接收点。',
      workflowScenarioId: 'yuexiu-medical',
    },
    enrouteDelta: 1,
  },
  {
    event: {
      id: 'live-traffic-huanshi',
      time: '',
      domain: '交通',
      domainColor: '#B8860B',
      title: '环市路清障任务签收超时',
      location: '越秀区环市中路',
      summary: '原定清障单元未在时限内签收，备用单元与绕行入口等待重新确认。',
      source: '道路巡查模板',
      owner: '越秀道路保障组',
      status: 'abnormal',
      severity: 'critical',
      position: [113.2744, 23.1421],
      poi: 'vehicle',
      shortLabel: '环市路签收异常',
      nextAction: '切换备用单元并重新计算到场时间。',
      workflowScenarioId: 'yuexiu-traffic',
    },
    enrouteDelta: 0,
  },
  {
    event: {
      id: 'live-fire-liwan',
      time: '',
      domain: '119',
      domainColor: '#E5484D',
      title: '荔湾仓储点消防通道待确认',
      location: '荔湾区芳村大道东',
      summary: '现场上报通道被临时占用，车辆编成和入口选择等待人工确认。',
      source: '物业上报模板',
      owner: '荔湾消防值守组',
      status: 'pending-decision',
      severity: 'watch',
      position: [113.2344, 23.1004],
      poi: 'fire',
      shortLabel: '芳村通道待确认',
      nextAction: '核实可用入口后批准车辆到场方案。',
      workflowScenarioId: 'liwan-fire',
    },
    enrouteDelta: 1,
  },
]

/**
 * 历史事件。和今日事件分开两栏（8/21 评审）：今日台账是「现在要处置什么」，
 * 历史案例是「这套东西在已经发生过的事情上跑出来是什么样」，两种时间口径不能混排。
 *
 * 公开事实边界逐条标注。没有配处置链的条目只给知识库入口，不给「进入处置」——
 * 按钮点下去没东西，比没有按钮更糟。
 */
export interface HistoricalCase {
  id: string
  /** 事件发生时间，不是演示时间 */
  occurredAt: string
  domain: TodayEventDomain
  domainColor: string
  title: string
  location: string
  eventType: string
  blocker: string
  coreStrategy: string
  publicCoverage: string
  summary: string
  /** 公开事实到哪为止，其余进演示轨 */
  factBoundary: string
  poi: PoiKind
  /** 有经过验证的处置链时才给，否则只能去知识库 */
  workflowScenarioId?: string
  /** liwan-fire 需要同时切到公开复盘模式，否则进的是日常演练 */
  reviewMode?: boolean
}

export const HISTORICAL_CASES: HistoricalCase[] = [
  {
    id: 'hc-liwan-516',
    occurredAt: '2024-05-16',
    domain: '119',
    domainColor: '#E5484D',
    title: '荔湾 5·16 服装交易市场火灾',
    location: '荔湾区人民南路 93 号',
    eventType: '专业批发市场火灾',
    blocker: '实际调派、车辆路线与签收过程未公开',
    coreStrategy: '近端力量并行协同 · 通行受阻后重算',
    publicCoverage: '中 · 4 项可核验 / 4 项缺口',
    summary: '公开复盘推演：相同演示条件下，CityOS 路线预计比常规对照快 1.7 分钟，且支持封路后重新计算。',
    factBoundary: '公开事实到 09:32 接警、11:40 明火扑灭、1 人死亡为止；原处置路线与车辆编成未公开。',
    poi: 'fire',
    workflowScenarioId: 'liwan-fire',
    reviewMode: true,
  },
  {
    id: 'hc-station-2015',
    occurredAt: '2015-03-06',
    domain: '110',
    domainColor: '#2F6FDA',
    title: '广州火车站持刀伤人',
    location: '越秀区广州火车站站外广场',
    eventType: '公共场所突发警情',
    blocker: '警力编成、路线与医疗分流未公开',
    coreStrategy: '核心响应、外围疏导与医疗接应并行',
    publicCoverage: '中 · 6 项可核验 / 4 项缺口',
    summary: '公开约束推演：相同公开信息和演示条件下，CityOS 协同处置预计快 2.2 分钟，资源覆盖风险更低。',
    factBoundary: '公开事实仅含日期、约 8:20、地点、9 人受伤与粗粒度处置序列；差值不构成对真实处置的评价。',
    poi: 'police',
    workflowScenarioId: 'haizhu-police',
  },
  {
    id: 'hc-typhoon-mangkhut',
    occurredAt: '2018-09-16',
    domain: '重大布防',
    domainColor: '#7C3AED',
    title: '台风山竹',
    location: '广州全市',
    eventType: '城市级自然灾害保障',
    blocker: '处置过程与资源编成尚未建模',
    coreStrategy: '全市停工停课停运的公开口径沉淀',
    publicCoverage: '低 · 2 项可核验 / 多项缺口',
    summary: '城市级布防案例，尚未接入处置链，当前只在知识库留有条目。',
    factBoundary: '仅保留公开可查的登陆日期与全市停工停课停运口径；处置细节未建模，不做演示推演。',
    poi: 'assembly',
  },
]

export interface BoardKpi {
  id: string
  label: string
  value: string
  unit?: string
  delta?: string
  deltaTone?: 'up' | 'down' | 'flat'
  /** 近 12 个采样点的迷你走势，绘制 sparkline 用 */
  series: number[]
  tone?: 'default' | 'danger' | 'warn'
}

export interface DomainPulse {
  id: string
  scenarioId: string
  short: string
  label: string
  active: number
  /** 在办口径：五个域说法不一样，「进行中」和「待处置」不能混着写 */
  activeLabel: string
  note: string
  /**
   * 该域的资源读数。原来这组数字在页面底部的六张统计卡里另摆一遍，
   * 和这里的在办起数是同一批口径（119 进行中 3 == 消防在办 3）。
   * 8/20 评审判定「五域态势和底下一排重复」，把资源读数并进来，底部整条撤掉。
   */
  resources: string
  /** 侧栏一行放不下全称，缩写上屏、全称进 title，避免读者猜「车 46」是什么 */
  resourcesFull: string
  color: string
}

/** 五个业务域同级展示；在办起数与资源读数均为演示 */
export const DOMAIN_PULSES: DomainPulse[] = [
  { id: 'fire', scenarioId: 'liwan-fire', short: '119', label: '消防', active: 3, activeLabel: '进行中', note: '1 起重点处置', resources: '站点 14 · 车 46', resourcesFull: '可用站点 14 · 车辆 46', color: '#E5484D' },
  { id: 'police', scenarioId: 'haizhu-police', short: '110', label: '警情', active: 8, activeLabel: '待处置', note: '2 起现场核实', resources: '警力 186 · 铁骑 74', resourcesFull: '路面警力 186 · 铁骑 74', color: '#2F6FDA' },
  { id: 'medical', scenarioId: 'yuexiu-medical', short: '120', label: '医疗', active: 5, activeLabel: '待处置', note: '1 起分级转运', resources: '医院 148 · 车 312', resourcesFull: '医院 148 · 救护车 312', color: '#0E9AA7' },
  { id: 'traffic', scenarioId: 'yuexiu-traffic', short: '交通', label: '交通', active: 4, activeLabel: '处置中', note: '2 段缓行处置', resources: '开路 7 · 待批 3', resourcesFull: '开路执行中 7 · 待批准 3', color: '#B8860B' },
  { id: 'major', scenarioId: 'tianhe-major', short: '布防', label: '布防', active: 1, activeLabel: '保障中', note: '晚间活动保障', resources: '岗位 12 · 备勤 4', resourcesFull: '保障岗位 12 · 备勤 4', color: '#7C3AED' },
]

/**
 * 不归属单一业务域的保障资源。原来是底部统计条最后两张卡，
 * 底部整条撤掉后并到侧边栏，读数保持不变。
 */
export const SUPPORT_RESOURCES: Array<{ id: string; label: string; value: string; unit: string; note: string }> = [
  { id: 'drone', label: '无人机', value: '18', unit: '可用', note: '任务中 4 · 充电 6' },
  { id: 'water', label: '水源', value: '298', unit: '可用', note: '覆盖 326 · 待核实 28' },
]

/** 总览左栏的保障资源统一口径，均由顶部全局演示环境标识覆盖。 */
export const OVERVIEW_SUPPORT_RESOURCES = [
  { id: 'weather', label: '气象', value: '24°C', unit: '小雨', note: '通行时间 +8%' },
  { id: 'water', label: '水源', value: '298', unit: '可用', note: '待核实 28' },
  { id: 'drone', label: '无人机', value: '18', unit: '可用', note: '任务中 4' },
  { id: 'camera', label: '摄像头', value: '126', unit: '在线', note: '离线 7' },
] as const

/** 24 小时事件量走势（演示数据），当前小时在末位 */
export const HOURLY_TREND = {
  hours: ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'],
  values: [4, 3, 2, 3, 8, 12, 14, 13, 16, 21, 18, 9],
  peakNote: '18 时前后为高峰 · 晚高峰叠加降雨',
}

export type AlertSeverity = 'info' | 'watch' | 'critical'

export interface CityAlert {
  id: string
  time: string
  severity: AlertSeverity
  domain: string
  domainColor: string
  scenarioId: string
  title: string
  source: string
  /** 是否为演示主线异常：带「进入处置」强调按钮 */
  primary?: boolean
  /**
   * 地图落点。坐标一律取该告警所属场景的中心，和点击后地图飞过去的位置保持一致——
   * 标在 A 点、点开飞到 B 点是最容易被抓住的破绽。
   * 没有具体落点的告警（例如全城性的气象）不给坐标，就不上图。
   */
  position?: [number, number]
  /** 地图上画成哪种 POI，见 map/poiCatalog.ts */
  poi?: PoiKind
  /**
   * 地图徽标上的文字。
   *
   * 不能用 domain（「119」「110」）：8/21 评审说这框里写的像警情类型，
   * 可地图上标的是**那个地方**。频道号回答不了「这个点是什么」——
   * 满图五个点写着 119/110/120，读起来像图例而不是地点。写地点短名。
   */
  shortLabel?: string
}

export const SEVERITY_META: Record<AlertSeverity, { label: string; bg: string; fg: string }> = {
  info: { label: '提示', bg: '#EEF4FF', fg: '#3B62B5' },
  watch: { label: '关注', bg: '#FFF5DE', fg: '#946114' },
  critical: { label: '警示', bg: '#FDEBEC', fg: '#AD3B44' },
}

/** 初始就有的告警流（城市不存在“一切正常”的空态） */
export const INITIAL_ALERTS: CityAlert[] = [
  {
    id: 'al-fire-376',
    time: '15:00:18',
    severity: 'critical',
    domain: '119',
    domainColor: '#E5484D',
    scenarioId: 'liwan-fire',
    title: '天河区高层办公楼持续冒烟，疑似人员受困',
    source: '接警模板 + 物业上报',
    primary: true,
    position: [113.253289, 23.113914],
    poi: 'fire',
    shortLabel: '高层办公楼火情',
  },
  {
    id: 'al-traffic-keyun',
    time: '14:57:41',
    severity: 'watch',
    domain: '交通',
    domainColor: '#B8860B',
    scenarioId: 'yuexiu-traffic',
    title: '科韵路口东向西缓行加剧，平均车速 12 km/h',
    source: '交管监测',
    position: [113.2684, 23.1253],
    poi: 'vehicle',
    shortLabel: '科韵路口缓行',
  },
  {
    id: 'al-medical-panfu',
    time: '14:48:55',
    severity: 'info',
    domain: '120',
    domainColor: '#0E9AA7',
    scenarioId: 'yuexiu-medical',
    title: '盘福路周边急救保障点转运待命就绪',
    source: '保障值守',
    position: [113.2568, 23.1265],
    poi: 'hospital',
    shortLabel: '盘福路急救待命',
  },
  {
    id: 'al-major-tianhe',
    time: '14:45:30',
    severity: 'info',
    domain: '布防',
    domainColor: '#7C3AED',
    scenarioId: 'tianhe-major',
    title: '体育中心晚间活动保障进入二级检查',
    source: '活动备案',
    position: [113.3195, 23.1404],
    poi: 'assembly',
    shortLabel: '体育中心布防',
  },
  {
    id: 'al-weather-rain',
    time: '14:41:02',
    severity: 'watch',
    domain: '气象',
    domainColor: '#3B82F6',
    scenarioId: 'liwan-fire',
    title: '小雨持续，主干道湿滑，通行时间普遍 +8%',
    source: '气象接入',
  },
]

/** 定时滚入的后续告警池，循环使用 */
export const STREAM_ALERTS: CityAlert[] = [
  {
    id: 'st-drone',
    time: '',
    severity: 'info',
    domain: '119',
    domainColor: '#E5484D',
    scenarioId: 'liwan-fire',
    title: '无人机 UAV-07 抵达黄埔大道上空回传画面',
    source: '空中协同',
  },
  {
    id: 'st-hydrant',
    time: '',
    severity: 'watch',
    domain: '119',
    domainColor: '#E5484D',
    scenarioId: 'liwan-fire',
    title: '事发楼南侧消火栓水压待核实，已派巡检',
    source: '供水巡检',
  },
  {
    id: 'st-traffic-clear',
    time: '',
    severity: 'info',
    domain: '交通',
    domainColor: '#B8860B',
    scenarioId: 'yuexiu-traffic',
    title: '中山路事故车辆完成拖离，车道恢复中',
    source: '清障回报',
  },
  {
    id: 'st-police-crowd',
    time: '',
    severity: 'watch',
    domain: '110',
    domainColor: '#2F6FDA',
    scenarioId: 'haizhu-police',
    title: '客运站候车区秩序恢复，涉事人员已分隔',
    source: '场站回报',
  },
  {
    id: 'st-medical-bed',
    time: '',
    severity: 'watch',
    domain: '120',
    domainColor: '#0E9AA7',
    scenarioId: 'yuexiu-medical',
    title: '市一医院急诊接收能力下降，建议分流备选',
    source: '接收点回报',
  },
]

export type UnitStatus = 'standby' | 'enroute' | 'onscene'

export interface DispatchUnit {
  id: string
  name: string
  kind: '消防' | '公安' | '医疗' | '交管'
  kindColor: string
  status: UnitStatus
  location: string
  occupiedBy?: string
  eta?: string
  strength: string
  /**
   * 地图落点。存在 staticPoi 时取公开静态 POI 坐标；否则是明确标注的演示位置。
   * 调度状态、编成、车辆、ETA 与占用事件始终是演示。
   */
  position: [number, number]
  /** 仅名称、类型、地址与坐标来自公开静态 POI；调度状态始终是演示。 */
  staticPoi?: {
    name: string
    type: string
    address?: string
    sourceLabel: string
    sourceUrl: string
    capturedAt: string
  }
}

export const UNIT_STATUS_META: Record<UnitStatus, { label: string; bg: string; fg: string }> = {
  standby: { label: '待命', bg: '#E8F7EF', fg: '#237A52' },
  enroute: { label: '在途', bg: '#EAF2FF', fg: '#2768CA' },
  onscene: { label: '现场', bg: '#FDEBEC', fg: '#AD3B44' },
}

/** 资源调度板的单位清单（演示数据）。占用事件与主线场景对齐。 */
export const DISPATCH_UNITS: DispatchUnit[] = [
  { id: 'u-fire-lied', name: '多宝消防救援站 · 响应单元', kind: '消防', kindColor: '#E5484D', status: 'enroute', location: '列车广场 · 多宝街道', occupiedBy: '金融城高层火情联动', eta: '4 分钟', strength: '30 人 · 5 车', position: [113.2265785, 23.1155885], staticPoi: { name: '广州市荔湾区多宝消防救援站', type: '消防救援站', address: '列车广场 · 多宝街道 · 荔湾区', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/way/1079152727', capturedAt: '2026-08-20' } },
  { id: 'u-fire-yuancun', name: '水上消防中队 · 响应单元', kind: '消防', kindColor: '#E5484D', status: 'standby', location: '荔湾—海珠公开 POI', strength: '24 人 · 4 车', position: [113.2400905, 23.0969983], staticPoi: { name: '广州消防支队水上消防中队', type: '消防救援站', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/copyright', capturedAt: '2026-08-14' } },
  { id: 'u-fire-shipai', name: '光大消防中队 · 响应单元', kind: '消防', kindColor: '#E5484D', status: 'standby', location: '海珠区公开 POI', strength: '6 人 · 2 车', position: [113.2559561, 23.0868815], staticPoi: { name: '光大消防中队', type: '消防救援站', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/copyright', capturedAt: '2026-08-14' } },
  { id: 'u-police-tianhe', name: '天河南派出所巡组', kind: '公安', kindColor: '#2F6FDA', status: 'enroute', location: '科韵路口', occupiedBy: '金融城高层火情联动 · 外围控制', eta: '6 分钟', strength: '8 人 · 2 车', position: [113.3690, 23.1200] },
  { id: 'u-police-station-demo', name: '广州站响应单元', kind: '公安', kindColor: '#2F6FDA', status: 'standby', location: '广州火车站周边 · 公开 POI 参考', occupiedBy: '广州站历史案例', strength: '4 人 · 1 车', position: [113.2554755, 23.1484543], staticPoi: { name: '警务 POI（公开快照名称缺失）', type: '警务设施', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/copyright', capturedAt: '2026-08-14' } },
  { id: 'u-medical-shiyi', name: '市一医院 · 急救保障组', kind: '医疗', kindColor: '#0E9AA7', status: 'enroute', location: '越秀区盘福路周边', occupiedBy: '金融城高层火情联动 · 医疗保障', eta: '10 分钟', strength: '6 人 · 2 辆救护车', position: [113.2511865, 23.133973], staticPoi: { name: '广州市第一人民医院', type: '医疗机构', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/copyright', capturedAt: '2026-08-14' } },
  { id: 'u-medical-zhongshan', name: '红十字会医院 · 转运组', kind: '医疗', kindColor: '#0E9AA7', status: 'standby', location: '同福中路 · 海珠区', strength: '4 人 · 1 辆救护车', position: [113.2571165, 23.1072521], staticPoi: { name: '广州市红十字会医院', type: '医疗机构', address: '同福中路 · 海幢街道 · 海珠区', sourceLabel: '© OpenStreetMap contributors · ODbL', sourceUrl: 'https://www.openstreetmap.org/way/598391042', capturedAt: '2026-08-20' } },
  { id: 'u-traffic-keyun', name: '交警铁骑 · 科韵路组', kind: '交管', kindColor: '#B8860B', status: 'onscene', location: '科韵路口', occupiedBy: '金融城高层火情联动 · 关键路口开路', strength: '4 人 · 2 组摩托', position: [113.3672, 23.1214] },
  { id: 'u-traffic-zhongshan', name: '清障拖车 · 中山路组', kind: '交管', kindColor: '#B8860B', status: 'onscene', location: '中山路事故段', occupiedBy: '中山路交通事故协同', strength: '3 人 · 1 车', position: [113.2684, 23.1253] },
  { id: 'u-fire-liwan-01', name: '荔湾消防增援单元 01', kind: '消防', kindColor: '#E5484D', status: 'enroute', location: '康王中路', occupiedBy: '龙津路后厨冒烟', eta: '5 分钟', strength: '18 人 · 3 车', position: [113.2452, 23.1210] },
  { id: 'u-fire-yuexiu-02', name: '越秀消防增援单元 02', kind: '消防', kindColor: '#E5484D', status: 'enroute', location: '东风中路', occupiedBy: '北京路配电间烟雾核验', eta: '7 分钟', strength: '16 人 · 3 车', position: [113.2750, 23.1328] },
  { id: 'u-fire-haizhu-03', name: '海珠消防增援单元 03', kind: '消防', kindColor: '#E5484D', status: 'enroute', location: '工业大道北', occupiedBy: '芳村仓储点烟雾核验', eta: '9 分钟', strength: '20 人 · 4 车', position: [113.2580, 23.0910] },
  { id: 'u-police-yuexiu-01', name: '越秀属地响应单元 01', kind: '公安', kindColor: '#2F6FDA', status: 'enroute', location: '广州站广场', occupiedBy: '广州站广场协查任务', eta: '3 分钟', strength: '6 人 · 2 车', position: [113.2590, 23.1468] },
  { id: 'u-police-liwan-02', name: '荔湾属地响应单元 02', kind: '公安', kindColor: '#2F6FDA', status: 'enroute', location: '沙面街区', occupiedBy: '沙面走失老人协查', eta: '6 分钟', strength: '4 人 · 1 车', position: [113.2410, 23.1108] },
  { id: 'u-police-tianhe-03', name: '天河场站响应单元 03', kind: '公安', kindColor: '#2F6FDA', status: 'enroute', location: '天河客运站', occupiedBy: '候车区人员争执', eta: '8 分钟', strength: '8 人 · 2 车', position: [113.3410, 23.1690] },
  { id: 'u-police-haizhu-04', name: '海珠属地响应单元 04', kind: '公安', kindColor: '#2F6FDA', status: 'enroute', location: '昌岗外围', occupiedBy: '昌岗人员协查', eta: '4 分钟', strength: '4 人 · 1 车', position: [113.2720, 23.0980] },
  { id: 'u-medical-liwan-01', name: '荔湾急救保障单元 01', kind: '医疗', kindColor: '#0E9AA7', status: 'enroute', location: '陈家祠站周边', occupiedBy: '陈家祠站乘客胸闷协同', eta: '5 分钟', strength: '3 人 · 1 辆救护车', position: [113.2480, 23.1260] },
  { id: 'u-medical-yuexiu-02', name: '越秀急救保障单元 02', kind: '医疗', kindColor: '#0E9AA7', status: 'enroute', location: '一德路', occupiedBy: '一德路老人跌倒急救', eta: '6 分钟', strength: '3 人 · 1 辆救护车', position: [113.2600, 23.1140] },
  { id: 'u-medical-haizhu-03', name: '海珠急救保障单元 03', kind: '医疗', kindColor: '#0E9AA7', status: 'enroute', location: '海珠体育场周边', occupiedBy: '体育馆运动损伤核验', eta: '9 分钟', strength: '3 人 · 1 辆救护车', position: [113.2890, 23.1000] },
  { id: 'u-traffic-liwan-01', name: '荔湾道路保障单元 01', kind: '交管', kindColor: '#B8860B', status: 'enroute', location: '康王中路', occupiedBy: '康王路轻微碰撞处置', eta: '4 分钟', strength: '3 人 · 2 组摩托', position: [113.2460, 23.1170] },
  { id: 'u-traffic-yuexiu-02', name: '越秀道路保障单元 02', kind: '交管', kindColor: '#B8860B', status: 'enroute', location: '东风中路', occupiedBy: '东风路占道线索', eta: '5 分钟', strength: '3 人 · 1 车', position: [113.2780, 23.1345] },
  { id: 'u-traffic-haizhu-03', name: '海珠道路保障单元 03', kind: '交管', kindColor: '#B8860B', status: 'enroute', location: '工业大道北', occupiedBy: '工业大道积水线索', eta: '7 分钟', strength: '4 人 · 2 车', position: [113.2610, 23.0895] },
  { id: 'u-traffic-tianhe-04', name: '天河道路保障单元 04', kind: '交管', kindColor: '#B8860B', status: 'enroute', location: '体育中心周边', occupiedBy: '体育中心活动保障布防', eta: '6 分钟', strength: '4 人 · 2 组摩托', position: [113.3220, 23.1380] },
]

const enrouteUnitCount = DISPATCH_UNITS.filter((unit) => unit.status === 'enroute').length

/** 四张指标卡只从对应台账计算数字，避免卡片与详情数量分叉 */
export function buildOverviewKpis(events: TodayEvent[], enrouteCount = enrouteUnitCount): BoardKpi[] {
  const pendingDecisionCount = events.filter((event) => event.status === 'pending-decision').length
  const abnormalEventCount = events.filter((event) => event.status === 'abnormal').length
  return [
  {
    id: 'events-today',
    label: '今日事件',
    value: String(events.length),
    unit: '起',
    delta: '较昨日 +3',
    deltaTone: 'up',
    series: [9, 11, 10, 13, 12, 15, 14, 17, 18, 20, 21, events.length],
  },
  {
    id: 'pending-decision',
    label: '待人工决策',
    value: String(pendingDecisionCount),
    unit: '件',
    delta: '1 件超 10 分钟',
    deltaTone: 'up',
    series: [1, 2, 1, 1, 3, 2, 2, 4, 3, 2, 3, pendingDecisionCount],
    tone: 'warn',
  },
  {
    id: 'exec-anomaly',
    label: '执行异常',
    value: String(abnormalEventCount),
    unit: '项',
    delta: '签收超时 · 开路延迟',
    deltaTone: 'flat',
    series: [0, 1, 0, 0, 1, 2, 1, 1, 2, 1, 2, abnormalEventCount],
    tone: 'danger',
  },
  {
    id: 'units-enroute',
    label: '在途单位',
    value: String(enrouteCount),
    unit: '组',
    delta: '含 5 组跨域协同',
    deltaTone: 'flat',
    series: [8, 10, 9, 12, 14, 13, 15, 16, 14, 15, 16, enrouteCount],
  },
  ]
}
