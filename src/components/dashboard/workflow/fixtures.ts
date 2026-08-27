import type { DomainFixture, DomainId } from './types'

const simulated = '演示事件'
const estimated = '模型估算'
const pending = '待核实'

export const DOMAIN_FIXTURES: Record<DomainId, DomainFixture> = {
  fire: {
    id: 'fire',
    scenarioId: 'liwan-fire',
    label: '119 消防',
    title: '金融城高层办公楼火情联动',
    address: '天河区黄埔大道中 376 号 · 演示模板',
    dataNote: '本页为演示事件与条件计算，未接 119、视频或资源系统。',
    inputTemplates: [
      { id: 'fire-office', title: '高层办公楼火情', detail: '18 层电气故障烟气扩散 · 事件模板' },
      { id: 'fire-warehouse', title: '商住混合楼火情', detail: '库房烟气与疏散核验 · 事件模板' },
    ],
    inputFields: [
      { id: 'eventType', label: '事件类型', value: '高层办公楼火情联动' },
      { id: 'location', label: '发生地点', value: '天河区黄埔大道中 376 号' },
      { id: 'time', label: '发现时间', value: '15:00' },
      { id: 'level', label: '初判等级', value: 'III 级', summaryRank: 4, summaryPrefix: '初判 ' },
      { id: 'floors', label: '影响楼层', value: '18 层，烟气向 19 层扩散', summaryRank: 1 },
      { id: 'occupants', label: '人员情况', value: '约 42 人待核验，疑似 5 人受困', summaryRank: 2 },
      { id: 'weather', label: '天气与道路', value: '小雨；黄埔大道东向西缓行' },
      { id: 'description', label: '现场补充', value: '物业已启动广播，消防通道暂未确认。', kind: 'textarea', summaryRank: 3 },
    ],
    defaultOwner: '现场指挥员 · 演示',
    primaryDispatchTitle: '消防调度', countOwner: 'fire',
    resourceLabel: '消防车辆', resourceUnit: '辆', metricScopeLabel: '消防主责单元', minResources: 2, maxResources: 8, defaultResources: 4,
    baseEtaMinutes: 9.6, baseCoverageScore: 74,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'fire-fire-recon', label: '近端到场、楼层侦检优先 · 演示', etaDeltaMinutes: -0.8, coverageDelta: 2 },
        { id: 'fire-fire-balanced', label: '分组集结、内外同步 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'fire-fire-outer', label: '外围控制、等增援到齐 · 演示', etaDeltaMinutes: 0.7, coverageDelta: -3 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'fire-med-onsite', label: '医疗组随队前置 · 演示', etaDeltaMinutes: -1.0, coverageDelta: 4 },
        { id: 'fire-med-standby', label: '就近医院待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'fire-med-remote', label: '外围接收点待命 · 演示', etaDeltaMinutes: 0.9, coverageDelta: -4 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'fire-road-clear', label: '关键路口全程开路 · 演示', etaDeltaMinutes: -0.9, coverageDelta: 3 },
        { id: 'fire-road-signal', label: '沿线信号优先 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'fire-road-none', label: '不请求交通协同 · 演示', etaDeltaMinutes: 0.8, coverageDelta: -3 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '近端先到、楼层侦检优先', summary: '先压缩到场时间，再补齐疏散与供水核验。', etaMinutes: 8.7, coverageRisk: '注意', actions: ['近端车辆到场侦检', '楼层疏散核验', '医疗保障待命'] },
      { id: 'B', label: 'B', title: '均衡集结、外围保障优先', summary: '先稳定外围与保障通道，再组织楼内协同。', etaMinutes: 10.2, coverageRisk: '较低', actions: ['外围引导与隔离', '供水与通道核验', '医疗保障联络'] },
    ],
    brief: {
      confirmed: [
        { label: '模板接警时刻', value: '15:00（演示时序）', source: '日常响应预设', status: '模板已验证', dataLabel: simulated },
        { label: '事件类型', value: '高层办公楼火情联动', source: '工作人员受限模板', status: '模板已验证', dataLabel: simulated },
        { label: '建筑位置', value: '黄埔大道中 376 号', source: '公开地理参考 + 模板', status: '地址待现场复核', dataLabel: simulated },
      ],
      unknown: [
        { label: '起火房间与楼层', value: '18 层为演练情景，不代表现场事实', source: '现场负责人 / 对讲核实', status: '未确认', dataLabel: pending },
        { label: '被困人数', value: '需由楼宇物业与现场人员交叉核对', source: '物业值班室', status: '未确认', dataLabel: pending },
        { label: '供电与排烟状态', value: '影响侦检与疏散路径', source: '楼宇机电负责人', status: '未确认', dataLabel: pending },
      ],
      context: [
        { label: '建筑', value: '高层办公用途 · 层数为演练参数', source: '模板 + 公开地理参考', status: '演示参数', dataLabel: simulated },
        { label: '周边资源', value: '消防与医疗点位仅作公开位置参考', source: 'OSM 快照', status: '位置公开 / 状态待核', dataLabel: estimated },
        { label: '道路与天气', value: '到场路径与ETA按本地路网、演示速度计算', source: '本地 OSM 快照', status: '模型估算', dataLabel: estimated },
      ],
      gaps: [
        { label: '内部平面', value: '默认按可通行楼梯间假设', source: '待楼宇提供', status: '影响楼层侦检方案', dataLabel: pending },
        { label: '现场人数', value: '默认按分区疏散优先', source: '待物业核验', status: '人数变化触发重新研判', dataLabel: pending },
        { label: '通道占用', value: '默认消防通道可用', source: '待现场确认', status: '通道变化触发 ETA 重算', dataLabel: pending },
      ],
    },
    executionSteps: ['任务包生成', '下发与签收', '现场侦检状态回填', '受控重试或完成'],
    taskAssignments: [
      {
        department: '消防',
        owner: '现场灭火负责人',
        task: '侦检、控火、楼层搜索',
        location: '现场东门集结',
        window: '15:02 出动 · 8 分钟内到场',
        personnel: '30 人',
        vehicles: '5 辆（水罐 3 / 云梯 1 / 指挥 1）',
        feedback: '位置、到场、异常、完成四类状态',
        contact: '系统任务包 + 短信回执',
        eta: '5 分钟 39 秒',
      },
      {
        department: '公安',
        owner: '现场秩序负责人',
        task: '警戒、人员核验、外围秩序',
        location: '现场东门外围',
        window: '15:02 出动 · 9 分钟内到位',
        personnel: '8 人',
        vehicles: '2 辆',
        feedback: '警戒圈建立、人员核验进度',
        contact: '系统任务包 + 对讲组网',
        eta: '6 分钟 18 秒',
      },
      {
        department: '医疗',
        owner: '急救联络负责人',
        task: '检伤分类、转运准备',
        location: '外围保障区南门',
        window: '15:03 出动 · 10 分钟内待命',
        personnel: '6 人',
        vehicles: '2 辆救护车',
        feedback: '检伤分级、接收医院确认',
        contact: '系统任务包 + 电话确认',
        eta: '6 分钟 02 秒',
      },
      {
        department: '交管',
        owner: '道路保障负责人',
        task: '关键路口开路、保持消防通道',
        location: '科韵路口等 3 处',
        window: '15:01 出动 · 6 分钟内开路',
        personnel: '4 人',
        vehicles: '2 组摩托',
        feedback: '路口开路完成、通道占用异常',
        contact: '系统任务包 + 对讲组网',
        eta: '5 分钟 50 秒',
      },
      {
        department: '属地',
        owner: '街道联络负责人',
        task: '物业联络、疏散安置、信息汇总',
        location: '外围保障区安置点',
        window: '15:04 到位 · 12 分钟内反馈',
        personnel: '6 人',
        vehicles: '1 辆',
        feedback: '疏散人数、安置点容量、诉求汇总',
        contact: '系统任务包 + 短信回执',
        eta: '7 分钟 20 秒',
      },
    ],
  },
  police: {
    id: 'police', scenarioId: 'haizhu-police', label: '110 警情', title: '广州火车站持刀伤人历史案例', address: '越秀区广州火车站站外广场',
    isHistoricalCase: true,
    dataNote: '日期、约 8:20、地点、9 人受伤和粗粒度处置序列来自公开报道；警力、路线、分流、任务与时间线均为演示。',
    inputTemplates: [
      { id: 'station-public', title: '2015-03-06 公开事实锚点', detail: '中国日报当日 13:33 报道 · 公开事实' },
      { id: 'station-assumption', title: '公众信息约束下的基线处置演示', detail: '未公开处置字段 · 演示补齐' },
    ],
    defaultOwner: '站区协同负责人 · 演示',
    primaryDispatchTitle: '警力调度', countOwner: null,
    resourceLabel: '演示响应单元', resourceUnit: '组', metricScopeLabel: '站区响应单元', minResources: 2, maxResources: 6, defaultResources: 3, baseEtaMinutes: 8.2, baseCoverageScore: 69,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'station-fire-onsite', label: '消防单元站区待命 · 演示', etaDeltaMinutes: -0.5, coverageDelta: 2 },
        { id: 'station-fire-station', label: '就近站点待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'station-fire-none', label: '不请求消防协同 · 演示', etaDeltaMinutes: 0.4, coverageDelta: -2 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'station-med-onsite', label: '站区医疗点前置 · 演示', etaDeltaMinutes: -1.1, coverageDelta: 3 },
        { id: 'station-med-standby', label: '就近医院待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'station-med-remote', label: '外围接收点待命 · 演示', etaDeltaMinutes: 1.2, coverageDelta: -4 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'station-road-control', label: '站前广场周边管控 · 演示', etaDeltaMinutes: -0.8, coverageDelta: 2 },
        { id: 'station-road-signal', label: '进出通道信号优先 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'station-road-none', label: '不做交通管控 · 演示', etaDeltaMinutes: 0.7, coverageDelta: -2 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '近端双向响应', summary: '演示近端响应单元从两侧进入，医疗接应点同步准备。', etaMinutes: 7.2, coverageRisk: '注意', actions: ['演示双向响应', '站区人流疏导', '医疗接应待命'] },
      { id: 'B', label: 'B', title: '站区分层协同', summary: '演示设置核心响应、外围疏导与医疗接应三层任务。', etaMinutes: 8.8, coverageRisk: '较低', actions: ['演示核心响应', '外围人流疏导', '医疗接应与分流'] },
    ],
    brief: {
      confirmed: [
        { label: '日期与发现时刻', value: '2015-03-06 · 上午 8 时 20 分许', source: '中国日报 2015-03-06 13:33 报道', status: '已核验公开锚点', dataLabel: '公开事实' },
        { label: '地点', value: '广州火车站站外广场', source: '中国日报 2015-03-06 13:33 报道', status: '已核验公开锚点', dataLabel: '公开事实' },
        { label: '当日通报口径', value: '9 人受伤', source: '中国日报 2015-03-06 13:33 报道', status: '已核验公开锚点', dataLabel: '公开事实' },
        { label: '公开粗序列', value: '发现 → 疏散周边群众并鸣枪示警 → 示警无效后击毙 / 击伤并抓获', source: '中国日报 2015-03-06 13:33 报道', status: '仅粗粒度，无分段时刻', dataLabel: '公开事实' },
      ],
      unknown: [
        { label: '原警力编成', value: '未公开 / 未核实', source: '公开报道未提供', status: '不得补造成历史事实', dataLabel: pending },
        { label: '原到场路线与签收', value: '未公开 / 未核实', source: '公开报道未提供', status: '仅可进入演示轨', dataLabel: pending },
        { label: '原医院分流', value: '未公开 / 未核实', source: '公开报道未提供', status: '仅可进入演示轨', dataLabel: pending },
      ],
      context: [
        { label: '站区道路', value: '当前公开 OSM 快照', source: 'OpenStreetMap contributors', status: '非 2015 历史路况', dataLabel: estimated },
        { label: '警务与医疗 POI', value: '公开静态位置；历史可用状态未知', source: 'OpenStreetMap contributors', status: '只作地理参考', dataLabel: estimated },
        { label: '封锁解除', value: '至当日 13:33 报道发布时已解除', source: '中国日报 2015-03-06 13:33 报道', status: '已核验公开锚点', dataLabel: '公开事实' },
      ],
      gaps: [
        { label: '分段处置时刻', value: '除约 8:20 外均未公开', source: '时间轴统一使用 T+ 相对时间', status: '禁止补造精确时刻', dataLabel: pending },
        { label: '历史现场视频', value: '未接入', source: '演示系统边界', status: '演示点位不得冒充历史画面', dataLabel: pending },
        { label: '真实警务与医疗系统', value: '未接入', source: '演示系统边界', status: '不下发真实指令', dataLabel: pending },
      ],
    },
    taskAssignments: [
      { department: '站区响应（演示）', owner: '站区协同负责人 · 演示', task: '演示近端响应与核心区核验', location: '广州火车站站外广场 · 公开地点', window: 'T+0 出发 · T+8 分钟内到场（估算）', personnel: '演示响应单元 2 组', vehicles: '演示车辆 2 辆', feedback: '回传演示到场与核心区状态', contact: '演示任务包', eta: '约 7–9 分钟（估算）' },
      { department: '外围疏导（演示）', owner: '值守负责人 · 演示', task: '演示外围人流疏导与通道保持', location: '站外广场外围 · 演示范围', window: 'T+2 启动 · T+12 分钟复核', personnel: '演示协同单元 1 组', vehicles: '演示车辆 1 辆', feedback: '回传演示路口与通道状态', contact: '演示任务包', eta: 'T+12 分钟复核' },
      { department: '医疗接应（演示）', owner: '医疗联络负责人 · 演示', task: '演示伤员接应与接收点联络', location: '公开医疗 POI · 状态演示', window: 'T+3 启动 · T+15 分钟复核', personnel: '演示医疗单元 1 组', vehicles: '演示救护车 1 辆', feedback: '回传演示接应与分流状态', contact: '演示任务包', eta: '约 9–12 分钟（估算）' },
    ],
    executionSteps: ['演示任务包生成', '演示响应与医疗任务签收', '车辆 / 路口 / 现场状态同步推进', '受控异常或演示到场'],
  },
  medical: {
    id: 'medical', scenarioId: 'yuexiu-medical', label: '120 医疗', title: '越秀商圈急救保障协同', address: '越秀区盘福路周边 · 演示事件',
    dataNote: '本页为演示医疗保障与演示计算，未接真实 120、医院床位或救护车状态。',
    inputTemplates: [
      { id: 'medical-urgent', title: '商圈突发急救保障', detail: '工作人员核验模板 · 演示事件' },
      { id: 'medical-transfer', title: '活动保障转运', detail: '已验证字段范围内录入 · 演示事件' },
    ],
    defaultOwner: '急救联络负责人 · 演示',
    primaryDispatchTitle: '医疗调度', countOwner: 'medical',
    resourceLabel: '救护车', resourceUnit: '辆', metricScopeLabel: '急救主责单元', minResources: 1, maxResources: 4, defaultResources: 2, baseEtaMinutes: 8.4, baseCoverageScore: 68,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'medical-fire-onsite', label: '消防单元协助破拆 · 演示', etaDeltaMinutes: -0.5, coverageDelta: 2 },
        { id: 'medical-fire-station', label: '就近站点待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'medical-fire-none', label: '不请求消防协同 · 演示', etaDeltaMinutes: 0.4, coverageDelta: -2 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'medical-recv-near', label: '近端接收点开通 · 演示', etaDeltaMinutes: -1.1, coverageDelta: 3 },
        { id: 'medical-recv-balanced', label: '均衡接收点 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'medical-recv-outer', label: '外围接收点 · 演示', etaDeltaMinutes: 1.2, coverageDelta: -5 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'medical-road-clear', label: '转运走廊开路 · 演示', etaDeltaMinutes: -0.9, coverageDelta: 2 },
        { id: 'medical-road-signal', label: '沿线信号优先 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'medical-road-none', label: '不请求交通协同 · 演示', etaDeltaMinutes: 0.8, coverageDelta: -2 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '近端先到、分级转运', summary: '先到场分级，再按演示接收点转运。', etaMinutes: 7.4, coverageRisk: '注意', actions: ['近端救护车到场', '急救分级评估', '接收点联络'] },
      { id: 'B', label: 'B', title: '双点保障、通道优先', summary: '保持两处保障点，优先确保演示转运通道。', etaMinutes: 9.2, coverageRisk: '较低', actions: ['双点医疗保障', '演示通道核验', '转运联络待命'] },
    ],
    brief: {
      confirmed: [
        { label: '输入渠道', value: '工作人员已验证模板', source: '手工输入', status: '字段范围已校验', dataLabel: simulated },
        { label: '事件类型', value: '商圈急救保障协同', source: '医疗演示模板', status: '模板已验证', dataLabel: simulated },
        { label: '位置范围', value: '盘福路周边', source: '公开地理参考 + 模板', status: '位置待现场复核', dataLabel: simulated },
      ],
      unknown: [
        { label: '患者数量与等级', value: '需由现场急救人员确认', source: '现场急救联络', status: '未确认', dataLabel: pending },
        { label: '接收能力', value: '演示不读取医院实时床位', source: '接收点联络', status: '未确认', dataLabel: pending },
      ],
      context: [
        { label: '接收点', value: '公开医疗 POI 仅作位置参考', source: 'OSM 快照', status: '状态演示', dataLabel: estimated },
        { label: '保障车辆', value: '数量与可用状态为演示参数', source: 'UI 演示规则', status: '演示', dataLabel: simulated },
        { label: '转运路径', value: '路径和ETA按本地快照估算', source: '本地 OSM 快照', status: '模型估算', dataLabel: estimated },
      ],
      gaps: [
        { label: '患者分级', value: '默认按单名中等优先级处理', source: '待现场确认', status: '等级变化触发重新研判', dataLabel: pending },
        { label: '接收点容量', value: '默认接收点可协同', source: '待人工联络', status: '容量变化影响方案B', dataLabel: pending },
        { label: '转运条件', value: '默认转运通道可达；车辆与接收点选择待现场核验', source: '现场负责人', status: '条件变化触发 ETA 重算', dataLabel: pending },
      ],
    },
    executionSteps: ['演示任务包生成', '演示急救联络签收', '保障状态演示回填', '受控重试或完成'],
  },
  traffic: {
    id: 'traffic', scenarioId: 'yuexiu-traffic', label: '交通协同', title: '中山路交通事故协同', address: '越秀区中山路沿线 · 演示事件',
    dataNote: '本页为演示道路事件与演示计算，未接实时路况、信号灯或道路控制系统。',
    inputTemplates: [
      { id: 'traffic-crash', title: '道路事故协同', detail: '市民上报 + 巡查模板 · 演示事件' },
      { id: 'traffic-breakdown', title: '车辆故障占道', detail: '已验证模板范围内录入 · 演示事件' },
    ],
    defaultOwner: '现场协同负责人 · 演示',
    primaryDispatchTitle: '路况协同', countOwner: 'traffic',
    resourceLabel: '清障单元', resourceUnit: '组', metricScopeLabel: '清障主责单元', minResources: 1, maxResources: 5, defaultResources: 2, baseEtaMinutes: 10.2, baseCoverageScore: 67,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'traffic-fire-onsite', label: '消防单元现场待命 · 演示', etaDeltaMinutes: -0.5, coverageDelta: 3 },
        { id: 'traffic-fire-station', label: '就近站点待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'traffic-fire-none', label: '不请求消防协同 · 演示', etaDeltaMinutes: 0.4, coverageDelta: -2 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'traffic-med-onsite', label: '救护车现场待命 · 演示', etaDeltaMinutes: -1.2, coverageDelta: 4 },
        { id: 'traffic-med-standby', label: '就近医院待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'traffic-med-remote', label: '外围接收点待命 · 演示', etaDeltaMinutes: 1.3, coverageDelta: -5 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'traffic-road-corridor', label: '绕行走廊全程开路 · 演示', etaDeltaMinutes: -0.9, coverageDelta: 2 },
        { id: 'traffic-road-signal', label: '关键路口信号优先 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'traffic-road-none', label: '仅现场防护 · 演示', etaDeltaMinutes: 0.8, coverageDelta: -2 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '现场防护后清障', summary: '先建立演示安全防护，再组织清障与医疗待命。', etaMinutes: 9.1, coverageRisk: '注意', actions: ['事故点演示防护', '清障单元联络', '医疗保障待命'] },
      { id: 'B', label: 'B', title: '外围绕行后协同清障', summary: '先发布演示绕行提示，再组织清障。', etaMinutes: 11.3, coverageRisk: '较低', actions: ['外围绕行提示', '清障协同联络', '路段状态核验'] },
    ],
    brief: {
      confirmed: [
        { label: '输入渠道', value: '市民上报与道路巡查模板', source: '演示事件流', status: '模板已验证', dataLabel: simulated },
        { label: '事件类型', value: '道路事故协同', source: '交通演示模板', status: '模板已验证', dataLabel: simulated },
        { label: '影响路段', value: '中山路沿线', source: '公开地理参考 + 模板', status: '路段待现场复核', dataLabel: simulated },
      ],
      unknown: [
        { label: '车道占用范围', value: '影响清障和绕行策略', source: '现场巡查负责人', status: '未确认', dataLabel: pending },
        { label: '人员伤情', value: '影响医疗保障级别', source: '急救联络', status: '未确认', dataLabel: pending },
        { label: '二次风险', value: '影响现场防护范围', source: '现场协同负责人', status: '未确认', dataLabel: pending },
      ],
      context: [
        { label: '道路网络', value: '路段与绕行参考来自本地地图快照', source: 'OSM 快照', status: '非实时', dataLabel: estimated },
        { label: '保障点', value: '交警与医疗点为演示位置', source: 'UI 演示规则', status: '演示', dataLabel: simulated },
        { label: '路况参数', value: 'ETA 未读取实时拥堵或信号配时', source: '演示模型', status: '模型估算', dataLabel: estimated },
      ],
      gaps: [
        { label: '拥堵长度', value: '默认按相邻两个路口影响', source: '待现场确认', status: '变化影响绕行方案', dataLabel: pending },
        { label: '清障条件', value: '默认普通清障可用', source: '待清障联络', status: '条件变化触发重算', dataLabel: pending },
        { label: '路口控制', value: '本演示不控制真实信号', source: '系统边界', status: '仅提供提示', dataLabel: pending },
      ],
    },
    executionSteps: ['演示任务包生成', '演示道路保障签收', '清障状态演示回填', '受控重试或完成'],
  },
  urban_order: {
    id: 'urban_order', scenarioId: 'yuexiu-urban-order', label: '市容秩序', title: '北京路商圈夜市占道 + 消防通道受阻', address: '越秀区北京路商圈 · 精确点位为演示',
    dataNote: '本页事件时序、精确点位、占道范围、消防通道状态、多模态线索、资源与 ETA 均为演示或待核实；未接真实城管、消防或商圈系统。',
    inputTemplates: [
      { id: 'urban-order-night-market', title: '夜市占道与消防通道核验', detail: '商户图片 + 巡查语音 + 商圈视频 · 模拟待核实' },
      { id: 'urban-order-corridor', title: '重点通道占用核验', detail: '工作人员受限模板 · 演示事件' },
    ],
    inputFields: [
      { id: 'eventType', label: '事件类型', value: '北京路商圈夜市占道 + 消防通道受阻（演示待核实）' },
      { id: 'location', label: '发生地点', value: '越秀区北京路商圈 · 精确点位为演示' },
      { id: 'time', label: '发现时间', value: '15:06（演示时序）' },
      { id: 'occupation', label: '占道线索', value: '夜市摊位疑似占用通行空间，范围待人工核实', summaryRank: 1 },
      { id: 'fireAccess', label: '消防通道', value: '疑似受阻，尚未由现场人员确认', summaryRank: 2 },
      { id: 'multimodal', label: '多模态信号', value: '商户图片、巡查语音、商圈视频均为模拟待核实', summaryRank: 3 },
      { id: 'description', label: '现场补充', value: '不得依据图片、语音或视频自动生成执法与调度指令。', kind: 'textarea', summaryRank: 4 },
    ],
    defaultOwner: '北京路市容秩序协同负责人（模拟）',
    primaryDispatchTitle: '市容调度', countOwner: null,
    resourceLabel: '市容巡查单元', resourceUnit: '组', metricScopeLabel: '市容主责单元', minResources: 1, maxResources: 4, defaultResources: 2, baseEtaMinutes: 7.8, baseCoverageScore: 66,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'urban-order-fire-verify', label: '消防协同单元现场核验 · 模拟', etaDeltaMinutes: -0.7, coverageDelta: 4 },
        { id: 'urban-order-fire-standby', label: '消防单元就近待命 · 模拟', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'urban-order-fire-none', label: '暂不请求消防协同 · 模拟', etaDeltaMinutes: 0.8, coverageDelta: -5 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'urban-order-med-near', label: '商圈医疗保障点待命 · 模拟', etaDeltaMinutes: -0.3, coverageDelta: 2 },
        { id: 'urban-order-med-standby', label: '就近接收点联络 · 模拟', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'urban-order-med-none', label: '不请求医疗协同 · 模拟', etaDeltaMinutes: 0.2, coverageDelta: -1 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'urban-order-road-corridor', label: '消防通道入口优先保障 · 模拟', etaDeltaMinutes: -0.8, coverageDelta: 3 },
        { id: 'urban-order-road-staged', label: '分区疏导、保留装卸窗口 · 模拟', etaDeltaMinutes: 0, coverageDelta: 1 },
        { id: 'urban-order-road-none', label: '仅现场口头疏导 · 模拟', etaDeltaMinutes: 0.9, coverageDelta: -4 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '先恢复消防通道，再分区疏导', summary: '人工确认通道受阻后，优先形成安全通行空间，再组织摊位分区疏导。', etaMinutes: 6.8, coverageRisk: '注意', actions: ['人工核验消防通道', '市容巡查单元分区疏导', '消防协同单元复核通行条件'] },
      { id: 'B', label: 'B', title: '分区疏导、错峰清理', summary: '先稳定商户沟通和行人通行，再按区域错峰清理占道点。', etaMinutes: 8.9, coverageRisk: '较低', actions: ['商户分区沟通', '错峰清理占道点', '消防通道持续复核'] },
    ],
    brief: {
      confirmed: [
        { label: '演示输入模板', value: '夜市占道与消防通道核验', source: '工作人员受限模板', status: '演示参数已录入', dataLabel: simulated },
        { label: '场景范围', value: '北京路商圈；精确点位为演示', source: '用户指定场景 + 公开底图参考', status: '现场范围待复核', dataLabel: simulated },
        { label: '当前处置状态', value: '尚未批准任何清理或调度动作', source: '前端演示会话', status: '等待人工决策', dataLabel: simulated },
      ],
      unknown: [
        { label: '夜市占道范围', value: '图片只提供线索，摊位数量和占用边界尚未确认', source: '商户图片（模拟待核实）', status: '未确认', dataLabel: pending },
        { label: '消防通道状态', value: '疑似受阻，必须由现场人员复核', source: '巡查语音（模拟待核实）', status: '未确认', dataLabel: pending },
        { label: '现场人车流', value: '商圈视频仅作待核实证据，不做自动客流判断', source: '商圈视频（模拟待核实）', status: '未确认', dataLabel: pending },
      ],
      context: [
        { label: '道路与商圈范围', value: '仅使用公开底图提供地理参考', source: 'OSM 本地快照', status: '非实时', dataLabel: estimated },
        { label: '市容与消防资源', value: '单元、人员、车辆、位置与占用状态均为模拟', source: '前端演示资源台账', status: '模拟', dataLabel: simulated },
        { label: 'ETA', value: '按演示点位与本地路网进行条件估算', source: '前端演示模型', status: '模拟估算', dataLabel: estimated },
      ],
      gaps: [
        { label: '现场核验人', value: '尚未登记可确认占道边界与通道状态的现场负责人', source: '待人工指定', status: '阻断方案批准', dataLabel: pending },
        { label: '消防通道几何', value: '公开道路不能替代真实消防通道边界', source: '待现场核实', status: '不得据此自动下令', dataLabel: pending },
        { label: '商户沟通结果', value: '默认尚未形成统一清理窗口', source: '待属地协同回传', status: '影响方案顺序', dataLabel: pending },
      ],
    },
    executionSteps: ['模拟任务包生成', '市容、消防与属地模拟签收', '通道核验与疏导状态模拟回填', '受控重试或完成'],
    taskAssignments: [
      { department: '市容秩序（模拟）', owner: '北京路市容秩序协同负责人（模拟）', task: '核验占道边界、组织商户分区疏导', location: '北京路夜市占道点（模拟）', window: '人工批准后启动 · 7 分钟内到场（模拟估算）', personnel: '市容巡查单元 2 组（模拟）', vehicles: '巡查车 2 辆（模拟）', feedback: '回传到场、占道边界、疏导进度与异常（模拟）', contact: '前端模拟任务包', eta: '约 6.8 分钟（模拟估算）', etaSource: '演示点位 + 本地路网条件估算' },
      { department: '消防协同（模拟）', owner: '消防通道核验负责人（模拟）', task: '复核消防通道入口与可通行条件', location: '消防通道入口（模拟待核实）', window: '人工批准后启动 · 8 分钟内复核（模拟估算）', personnel: '消防协同单元 1 组（模拟）', vehicles: '消防车辆 1 辆（模拟）', feedback: '回传入口位置、受阻状态与通行条件（模拟）', contact: '前端模拟任务包', eta: '约 7.5 分钟（模拟估算）', etaSource: '演示点位 + 本地路网条件估算' },
      { department: '属地协同（模拟）', owner: '商圈联络负责人（模拟）', task: '联系商户并确认分区清理窗口', location: '北京路商圈（模拟范围）', window: '人工批准后启动 · 10 分钟内首轮反馈（模拟）', personnel: '属地联络单元 1 组（模拟）', vehicles: '步巡（模拟）', feedback: '回传商户确认、争议项与清理窗口（模拟）', contact: '前端模拟任务包', eta: '约 9.0 分钟（模拟估算）', etaSource: '演示流程时限' },
    ],
  },
  major: {
    id: 'major', scenarioId: 'tianhe-major', label: '重大布防', title: '体育中心活动保障布防', address: '天河体育中心周边 · 演示事件',
    dataNote: '本页为演示活动保障与演示计算，未接真实客流、安保资源或活动审批系统。',
    inputTemplates: [
      { id: 'major-event', title: '大型活动保障', detail: '活动备案 + 场馆容量模板 · 演示事件' },
      { id: 'major-weather', title: '天气影响保障', detail: '已验证字段范围内录入 · 演示事件' },
    ],
    defaultOwner: '现场总协调 · 演示',
    primaryDispatchTitle: '布防调度', countOwner: null,
    resourceLabel: '保障岗位', resourceUnit: '个', metricScopeLabel: '布防主责岗位', minResources: 4, maxResources: 16, defaultResources: 8, baseEtaMinutes: 11.0, baseCoverageScore: 72,
    fireDispatch: {
      title: '消防调度',
      options: [
        { id: 'major-fire-onsite', label: '消防单元场馆值守 · 演示', etaDeltaMinutes: -0.5, coverageDelta: 3 },
        { id: 'major-fire-station', label: '就近站点待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'major-fire-none', label: '不请求消防协同 · 演示', etaDeltaMinutes: 0.4, coverageDelta: -2 },
      ],
    },
    medicalDispatch: {
      title: '医疗调度',
      options: [
        { id: 'major-med-onsite', label: '场馆医疗点开通 · 演示', etaDeltaMinutes: -1.0, coverageDelta: 3 },
        { id: 'major-med-standby', label: '就近医院待命 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'major-med-remote', label: '外围接收点待命 · 演示', etaDeltaMinutes: 1.1, coverageDelta: -5 },
      ],
    },
    trafficDispatch: {
      title: '路况协同',
      options: [
        { id: 'major-road-control', label: '场馆周边分时管控 · 演示', etaDeltaMinutes: -0.8, coverageDelta: 2 },
        { id: 'major-road-signal', label: '集散路口信号优先 · 演示', etaDeltaMinutes: 0, coverageDelta: 0 },
        { id: 'major-road-none', label: '不做交通管控 · 演示', etaDeltaMinutes: 0.7, coverageDelta: -2 },
      ],
    },
    plans: [
      { id: 'A', label: 'A', title: '入口均衡布防', summary: '按北东南入口均衡配置演示岗位。', etaMinutes: 10.1, coverageRisk: '注意', actions: ['入口岗位布置', '通道巡查联络', '医疗保障待命'] },
      { id: 'B', label: 'B', title: '重点入口加强', summary: '重点入口加强保障，保留主通道优先级。', etaMinutes: 12.0, coverageRisk: '较低', actions: ['重点入口加强', '保障通道优先', '分区联络确认'] },
    ],
    brief: {
      confirmed: [
        { label: '输入渠道', value: '活动备案与场馆容量模板', source: '演示事件流', status: '模板已验证', dataLabel: simulated },
        { label: '事件类型', value: '大型活动保障布防', source: '工作人员受限模板', status: '模板已验证', dataLabel: simulated },
        { label: '范围', value: '天河体育中心周边', source: '公开地理参考 + 模板', status: '入口待现场复核', dataLabel: simulated },
      ],
      unknown: [
        { label: '实际客流规模', value: '本演示不接实时客流', source: '活动现场负责人', status: '未确认', dataLabel: pending },
        { label: '开放入口', value: '影响岗位和覆盖安排', source: '场馆运营方', status: '未确认', dataLabel: pending },
        { label: '天气与临时管制', value: '影响保障通道与集结安排', source: '现场协调负责人', status: '未确认', dataLabel: pending },
      ],
      context: [
        { label: '场馆分区', value: '分区和入口为演示示意', source: '公开底图 + 模板', status: '演示', dataLabel: simulated },
        { label: '保障岗位', value: '岗位数量和状态为演示参数', source: 'UI 演示规则', status: '演示', dataLabel: simulated },
        { label: '到场路径', value: '路径与覆盖按本地路网估算', source: 'OSM 快照', status: '模型估算', dataLabel: estimated },
      ],
      gaps: [
        { label: '入口实时状态', value: '默认三入口开放', source: '待场馆确认', status: '变化触发布防重算', dataLabel: pending },
        { label: '客流分布', value: '默认均衡分布', source: '待现场核验', status: '变化影响覆盖风险', dataLabel: pending },
        { label: '医疗保障需求', value: '默认单点待命', source: '待联络确认', status: '需求变化触发重新研判', dataLabel: pending },
      ],
    },
    executionSteps: ['演示任务包生成', '入口保障演示签收', '分区状态演示回填', '受控重试或完成'],
  },
}

/**
 * 今日 110 签收异常使用独立演示夹具，避免把运行态写进 2015 广州站公开案例。
 * 公开 POI 只提供位置参考；警力、联系人、ETA 与签收状态均为演示。
 */
export const CURRENT_POLICE_FIXTURE: DomainFixture = {
  ...DOMAIN_FIXTURES.police,
  scenarioId: 'yuexiu-police-current',
  isHistoricalCase: false,
  title: '广州站广场协查任务签收异常',
  address: '越秀区广州火车站广场 · 演示事件',
  dataNote: '本页为当前演示 110 协查任务；地点参考公开 POI，警力、负责人、ETA、占用与签收状态均为演示。',
  inputTemplates: [
    { id: 'station-current-timeout', title: '协查任务签收超时', detail: '任务回执模板 · 演示事件' },
    { id: 'station-current-busy', title: '属地警力已占用', detail: '资源占用模板 · 演示事件' },
  ],
  inputFields: [
    { id: 'eventType', label: '事件类型', value: '广州站广场协查任务签收超时（演示）' },
    { id: 'location', label: '发生地点', value: '越秀区广州火车站广场 · 公开地点参考' },
    { id: 'time', label: '异常时间', value: '14:26（演示时序）' },
    { id: 'exception', label: '当前异常', value: '原外围疏导任务超过签收时限', summaryRank: 1 },
    { id: 'pressure', label: '入口压力', value: '东侧入口压力上升（模拟待核实）', summaryRank: 2 },
    { id: 'description', label: '现场补充', value: '候选单元在岗、通道和签收状态均需人工核实。', kind: 'textarea', summaryRank: 3 },
  ],
  defaultOwner: '站区协同负责人 · 演示',
  plans: [
    { id: 'A', label: 'A', title: '切换响应单位', summary: '改由备用响应单元接单，并同步外围交通协同。', etaMinutes: 6.4, coverageRisk: '注意', actions: ['切换备用响应单元', '更新现场负责人', '外围交通协同'] },
    { id: 'B', label: 'B', title: '跨区增援响应', summary: '从相邻辖区抽调演示单元，保留站区外围岗位。', etaMinutes: 8.1, coverageRisk: '较低', actions: ['跨区增援联络', '站区外围岗位保留', '重新签收任务'] },
  ],
  brief: {
    confirmed: [
      { label: '输入渠道', value: '任务回执模板', source: '前端演示事件流', status: '模板已验证', dataLabel: simulated },
      { label: '当前异常', value: '原外围疏导任务超过签收时限', source: '任务回执模板', status: '演示异常已记录', dataLabel: simulated },
      { label: '地点参考', value: '越秀区广州火车站广场', source: '公开静态 POI / OSM 快照', status: '仅作位置参考', dataLabel: estimated },
    ],
    unknown: [
      { label: '原疏导单元状态', value: '未接入实时在岗与签收状态', source: '待站区协调负责人核实', status: '未确认', dataLabel: pending },
      { label: '候选单元可用性', value: '候选单元、编组与联络状态均为模拟', source: '待备用单元回传', status: '未确认', dataLabel: pending },
      { label: '入口压力与通道', value: '未接入实时人流与临时管制信息', source: '待现场人员核实', status: '未确认', dataLabel: pending },
    ],
    context: [
      { label: '候选位置', value: '公开静态警务 POI 只提供位置参考', source: 'OSM 快照', status: '非实时', dataLabel: estimated },
      { label: '资源状态', value: '单元、人员、车辆和签收状态均为模拟', source: '前端演示资源台账', status: '模拟待核实', dataLabel: simulated },
      { label: 'ETA 与路线', value: '按演示点位与本地 OSM 静态路网估算', source: '本地路网快照', status: '演示估算', dataLabel: estimated },
    ],
    gaps: [
      { label: '实时编组', value: '候选单元当前在岗人员未接入', source: '待人工联络', status: '确认前必须核实', dataLabel: pending },
      { label: '签收回传', value: '尚未取得备用疏导单元签收', source: '待站区外围协调负责人回传', status: '不得视为已接单', dataLabel: pending },
      { label: '现场通道', value: '默认通道可达，实际人流与管制条件待确认', source: '待现场核验', status: '变化将影响 ETA', dataLabel: pending },
    ],
  },
  taskAssignments: [
    { department: '外围疏导（演示）', owner: '站区外围协调负责人 · 演示', task: '核验东侧入口压力并保持疏导通道', location: '广州站东侧入口 · 演示点位', window: '人工确认后启动 · 8 分钟内首轮回传（演示估算）', personnel: '疏导单元 1 组（模拟）', vehicles: '演示车辆 1 辆（模拟）', feedback: '回传到场、签收、入口压力与通道状态（模拟）', contact: '前端模拟任务包', eta: '约 6.4 分钟（演示估算）', etaSource: '演示点位 + 本地 OSM 静态路网' },
    { department: '站区协同（演示）', owner: '站区协同负责人 · 演示', task: '联系备用响应单元并确认任务签收', location: '广州火车站广场 · 演示范围', window: '人工确认后启动 · 6 分钟内反馈（演示时限）', personnel: '联络单元 1 组（模拟）', vehicles: '步巡（模拟）', feedback: '回传联系人、签收结果与异常（模拟）', contact: '前端模拟任务包', eta: '约 6 分钟（演示时限）', etaSource: '演示流程时限' },
    { department: '交通协同（演示）', owner: '站区交通协同负责人 · 演示', task: '核实外围通行与临时管制条件', location: '广州站外围道路 · 演示范围', window: '人工确认后启动 · 10 分钟内复核（演示时限）', personnel: '交通协同单元 1 组（模拟）', vehicles: '巡查车 1 辆（模拟）', feedback: '回传路口、通道和临时管制状态（模拟）', contact: '前端模拟任务包', eta: '约 8.1 分钟（演示估算）', etaSource: '演示点位 + 本地 OSM 静态路网' },
  ],
  executionSteps: ['演示任务包生成', '备用联系人演示签收', '外围岗位状态演示回填', '受控重试或完成'],
}

export const WORKFLOW_FIXTURES: DomainFixture[] = [
  ...Object.values(DOMAIN_FIXTURES),
  CURRENT_POLICE_FIXTURE,
]

export function findFixtureByScenarioId(scenarioId: string) {
  const fixture = WORKFLOW_FIXTURES.find((item) => item.scenarioId === scenarioId)
  if (!fixture) throw new Error(`未知工作流场景：${scenarioId}`)
  return fixture
}
