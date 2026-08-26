// 沉淀知识库的演示条目。
// 口径（D-07 / 11.7）：每次推演沉淀的数据在知识库保留，用于模型参数校准。
// 未接后端，所有条目必须标「演示草稿 / 未写入知识库」，不得显示"已入库"。

export type KnowledgeDomain = '119 消防' | '110 警情' | '120 医疗' | '交通协同' | '市容秩序' | '重大布防'

export interface KnowledgeEntry {
  id: string
  scenarioId: string
  domain: KnowledgeDomain
  domainColor: string
  title: string
  generatedAt: string
  /** 主线演示在用的条目会标出来，其余为归档沉淀 */
  usage: 'demo-active' | 'archived'
  facts: string
  unknowns: string
  planSummary: string
  sources: string[]
  origin: '公开事实 + 场景推演' | '场景推演'
}

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  {
    id: 'kb-516',
    scenarioId: 'liwan-fire',
    domain: '119 消防',
    domainColor: '#E5484D',
    title: '5·16 服装交易市场火灾 · 公开复盘推演',
    generatedAt: '2026-08-18 21:40',
    usage: 'demo-active',
    facts: '2024-05-16 09:32 接警，人民南路 93 号，11:40 明火扑灭，1 人死亡（公开口径）。',
    unknowns: '原处置路线、车辆编成、路口协同与首车到场时刻均未公开。',
    planSummary: '相同演示条件下，CityOS 路线比常规对照预计快 1.7 分钟；支持封路重算与医疗路线协同。',
    sources: ['新华网通报', '荔湾区政府认定公告', 'OSM 路网快照'],
    origin: '公开事实 + 场景推演',
  },
  {
    id: 'kb-routine',
    scenarioId: 'liwan-fire',
    domain: '119 消防',
    domainColor: '#E5484D',
    title: '金融城高层办公楼火情联动 · 日常响应推演',
    generatedAt: '2026-08-20 15:12',
    usage: 'demo-active',
    facts: '接警时间 15:00，黄埔大道中 376 号，18 层烟气扩散，约 42 人待核验。',
    unknowns: '被困人数、消防通道状态、供电与排烟状态待现场回传。',
    planSummary: '方案 A 近端先到、楼层侦检优先获批准；五部门任务包已送达并签收。',
    sources: ['日常响应模板', '本地路网求解', '演示资源快照'],
    origin: '场景推演',
  },
  {
    id: 'kb-police',
    scenarioId: 'haizhu-police',
    domain: '110 警情',
    domainColor: '#2F6FDA',
    title: '广州火车站 2015 历史案例 · 公开约束推演',
    generatedAt: '2026-08-20 22:10',
    usage: 'archived',
    facts: '公开锚点：2015-03-06、约 8:20、广州火车站站外广场、9 人受伤（当日通报口径）及粗粒度处置序列。',
    unknowns: '原警力编成、到场路线、医院分流、指挥流程与签收回执均未公开。',
    planSummary: '相同公开信息和演示条件下，CityOS 协同方案预计快 2.2 分钟、资源覆盖风险更低；不评价真实历史处置。',
    sources: ['中国日报 2015-03-06 13:33 报道', 'OpenStreetMap 公开地理快照', 'CityOS 演示假设集'],
    origin: '公开事实 + 场景推演',
  },
  {
    id: 'kb-medical',
    scenarioId: 'yuexiu-medical',
    domain: '120 医疗',
    domainColor: '#0E9AA7',
    title: '越秀商圈急救保障协同 · 分级转运推演',
    generatedAt: '2026-08-19 20:28',
    usage: 'archived',
    facts: '商圈急救保障事件；患者数量与接收能力为演示参数。',
    unknowns: '患者分级结果、医院实时接收能力、转运通道占用。',
    planSummary: 'CityOS 生成并比较「近端先到」与「双点保障」两套候选，给出时间、覆盖风险和转运任务草案。',
    sources: ['公开医疗 POI', '本地路网求解', '演示保障模板'],
    origin: '场景推演',
  },
  {
    id: 'kb-traffic',
    scenarioId: 'yuexiu-traffic',
    domain: '交通协同',
    domainColor: '#B8860B',
    title: '中山路交通事故协同 · 清障绕行推演',
    generatedAt: '2026-08-19 20:36',
    usage: 'archived',
    facts: '市民上报归并为一起事故协同事件；事故形态与车道占用为演示参数。',
    unknowns: '实时路况、信号配时、清障资源到位时间。',
    planSummary: 'CityOS 生成并比较「先防护再清障」与「先绕行再清障」两套候选，并把绕行、医疗待命写入任务草案。',
    sources: ['上报模板', '事故路段与路口参考'],
    origin: '场景推演',
  },
  {
    id: 'kb-urban-order',
    scenarioId: 'yuexiu-urban-order',
    domain: '市容秩序',
    domainColor: '#C26A2E',
    title: '北京路商圈夜市占道 + 消防通道受阻 · 协同推演',
    generatedAt: '2026-08-26 22:52（演示）',
    usage: 'demo-active',
    facts: '演示参数：北京路商圈出现夜市占道与消防通道受阻线索；商户图片、巡查语音和商圈视频均只作为模拟待核实证据。',
    unknowns: '占道边界、摊位数量、消防通道入口与受阻状态、现场人车流、商户沟通结果和真实资源状态均未确认。',
    planSummary: 'CityOS 比较“先恢复消防通道再分区疏导”和“分区疏导、错峰清理”两套演示候选；资源与 ETA 均为模拟，人工批准前不生成可下发任务。',
    sources: ['商户图片（模拟待核实）', '巡查语音（模拟待核实）', '商圈视频（模拟待核实）', 'OSM 本地地理快照'],
    origin: '场景推演',
  },
  {
    id: 'kb-major',
    scenarioId: 'tianhe-major',
    domain: '重大布防',
    domainColor: '#7C3AED',
    title: '体育中心活动保障布防 · 分区覆盖推演',
    generatedAt: '2026-08-19 19:58',
    usage: 'archived',
    facts: '活动备案与场馆容量输入；开放区域与客流为演示参数。',
    unknowns: '实际到场人数、入口开放调整、周边道路管控需求。',
    planSummary: 'CityOS 生成并比较「三口均衡布防」与「重点入口加强」两套候选，输出岗位和保障点任务草案。',
    sources: ['备案模板', '场馆分区参考'],
    origin: '场景推演',
  },
  /**
   * 8/21 评审的历史事件三条里，荔湾 5·16 和广州站 2015 都已经有处置链，
   * 台风山竹只有条目、没有建模。这里如实写成「未建模」而不是补一套编出来的处置：
   * 城市级气象灾害的资源调度和单点事件不是一个模型，硬套等于造假。
   */
  {
    id: 'kb-typhoon-mangkhut',
    scenarioId: 'tianhe-major',
    domain: '重大布防',
    domainColor: '#7C3AED',
    title: '台风山竹 · 城市级布防案例（未建模）',
    generatedAt: '—',
    usage: 'archived',
    facts: '仅保留公开可查的口径：2018-09-16 台风山竹影响广东，广州全市停工停课停运。',
    unknowns: '当时的资源预置、避难场所启用、路网管控与恢复序列均未建模，本 Demo 不做推演。',
    planSummary: '未生成方案。城市级气象灾害的调度模型与单点事件不同，未纳入本期演示范围。',
    sources: ['公开报道口径'],
    origin: '公开事实 + 场景推演',
  },
]
