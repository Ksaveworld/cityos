/**
 * 5·16 龙城服装交易中心火灾的演示场景。
 *
 * 真实部分（公开可溯源）：
 * - 地址、坐标、建筑名、接警 09:32、扑灭 11:40，全部来自
 *   data/processed/liwan_site.json，不在本文件里手抄
 * - 营救 9 人、1 人死亡，省安委办督办函口径
 *
 * 模拟部分（界面上必须标注）：
 * - 三路信号的构成与时刻。真实只有 1 路 119 接报，
 *   另两路按消防安全重点单位应配自动报警系统与微型消防站的规定构造
 * - 全部资源实时状态、车辆编成、路口配时
 * - 首车到场时刻。公开渠道只有接警与扑灭两个锚点，此处为推定
 *
 * 纯函数，无副作用。站点数据由调用方 loadSite 后传进来。
 */

import type { SiteInfo } from './site'
import type {
  Action,
  FeedbackRecord,
  FireEvent,
  IntersectionTask,
  Plan,
  Signal,
} from './types'

const min = (n: number) => n * 60

export interface Scenario {
  site: SiteInfo
  alarmAt: number
  signals: Signal[]
  event: FireEvent
  plans: Plan[]
  feedback: FeedbackRecord[]
  /** 官方公开锚点。只有这两个时刻是真的 */
  officialAnchors: Array<{ at: number; label: string; source: string }>
}

export function createScenario(site: SiteInfo): Scenario {
  const alarmAt = site.alarmAt

  /** 三路信号。第二路是真实接报，另两路按规范构造 */
  const signals: Signal[] = [
    {
      id: 'sig-001',
      source: '烟感',
      rawAddress: '人民南路 93 号 龙城服装交易中心',
      timestamp: alarmAt - min(2),
      text: '三层烟感连续告警，主机已触发未转报',
      reportedFloor: 3,
      confidence: 'inferred',
    },
    {
      id: 'sig-002',
      source: '119接警',
      rawAddress: '人民南路那边',
      timestamp: alarmAt,
      text: '人民南路那边着火了，有烟，好大的烟',
      confidence: 'reported',
    },
    {
      id: 'sig-003',
      source: '物业上报',
      rawAddress: '人民南路 89-1 号 市场管理处',
      timestamp: alarmAt + min(3),
      text: '四楼仓库冒烟，楼上没有店铺，可能是做仓库用的',
      reportedFloor: 4,
      confidence: 'reported',
    },
  ]

  /**
   * 三路信号归并成一个事件。
   * 三层与四层说法冲突，系统不裁决，两个都记为待核实。
   */
  const event: FireEvent = {
    id: 'GZ-FIRE-20240516-001',
    status: 'confirmed',
    buildingId: site.buildingId,
    location: site.center,
    signals,
    confirmedFacts: [
      {
        key: '地址',
        value: site.address,
        confidence: 'confirmed',
        sourceSignalIds: ['sig-002', 'sig-003'],
      },
      {
        key: '业态',
        value: '服装批发市场，经营与仓储混合',
        confidence: 'confirmed',
        sourceSignalIds: ['sig-003'],
      },
      {
        key: '时段',
        value: '营业时段，市场刚开市，货车集中装卸',
        confidence: 'confirmed',
        sourceSignalIds: ['sig-002'],
      },
    ],
    pendingFacts: [
      {
        key: '起火楼层',
        value: '三层或四层，两路来源说法不一',
        confidence: 'reported',
        sourceSignalIds: ['sig-001', 'sig-003'],
      },
      {
        key: '楼上人员',
        value: '数量未知',
        confidence: 'reported',
        sourceSignalIds: ['sig-003'],
      },
    ],
    informationGaps: [
      '该建筑消防设施实时状态未接入',
      '内部平面与疏散通道状况未知',
      '库存物品性质未知',
    ],
    createdAt: alarmAt - min(2),
    updatedAt: alarmAt + min(3),
  }

  const openRoad: Action = {
    type: '请求开路',
    target: '交管指挥中心',
    detail: '沿途 3 个信号控制路口，按通过时刻滚动清空',
    approvalLevel: 'human',
    intersections: makeIntersections(alarmAt),
  }

  /**
   * 两个方案。差别只在特权规则开关，两边同基准同一套速度模型，
   * 所以差值可复算，这正是与民用导航拉开距离的量化方式。
   *
   * 这里的 path 是占位几何，接入 routing 引擎后由 Dijkstra 求解替换。
   */
  const plans: Plan[] = [
    {
      id: 'plan-a',
      eventId: event.id,
      label: 'A',
      privileged: true,
      path: [
        [113.2401, 23.1268],
        [113.2438, 23.1241],
        [113.2472, 23.1206],
        [113.2481, 23.1168],
        [113.2478, 23.114],
      ],
      actions: [
        {
          type: '派遣',
          target: '荔湾中队',
          detail: '水罐 2、云梯 1、抢险 1',
          approvalLevel: 'human',
        },
        openRoad,
        { type: '通知医疗', target: '市第一人民医院', approvalLevel: 'auto' },
        { type: '通知物业', target: '龙城市场管理处', approvalLevel: 'auto' },
      ],
      metrics: {
        etaSeconds: 372,
        etaRange: [318, 447],
        constraintsViolated: [],
        intersectionCount: 3,
        controlImpact: '中',
        failureRisk: '低',
        degraded: false,
      },
      rationale:
        '放开单行道逆行后，人民南路可直接南下，不必绕行一德路。沿途 3 个信号控制路口需按通过时刻清空。',
      requiresHumanApproval: true,
    },
    {
      id: 'plan-b',
      eventId: event.id,
      label: 'B',
      privileged: false,
      path: [
        [113.2401, 23.1268],
        [113.2452, 23.1264],
        [113.2508, 23.1229],
        [113.2513, 23.1171],
        [113.2495, 23.1131],
        [113.2478, 23.114],
      ],
      actions: [
        {
          type: '派遣',
          target: '荔湾中队',
          detail: '水罐 2、云梯 1、抢险 1',
          approvalLevel: 'human',
        },
        { type: '通知医疗', target: '市第一人民医院', approvalLevel: 'auto' },
      ],
      metrics: {
        etaSeconds: 561,
        etaRange: [489, 654],
        constraintsViolated: ['人民南路南向禁行，按普通车辆规则绕行'],
        intersectionCount: 0,
        controlImpact: '低',
        failureRisk: '中',
        degraded: false,
      },
      rationale:
        '民用导航基线。按普通车辆规则规划，人民南路南下段不可通行，需绕行至沿江西路折返。不需要路口协同。',
      requiresHumanApproval: true,
    },
  ]

  const feedback: FeedbackRecord[] = [
    { node: '任务签收', at: alarmAt + min(1), from: '荔湾中队', content: '已接收路径与编成' },
    {
      node: '任务签收',
      at: alarmAt + min(1.5),
      from: '交管指挥中心',
      content: '已接收 3 个路口清单',
    },
    {
      node: '路口回执',
      at: alarmAt + min(2),
      from: '人民南路 × 大德路',
      content: '可执行',
      executable: true,
    },
    {
      node: '路口回执',
      at: alarmAt + min(2.5),
      from: '人民南路 × 一德路',
      content: '货车占道，清空需延后',
      executable: false,
    },
    { node: '到场', at: alarmAt + min(6.2), from: '荔湾中队', content: '首车到场（推定值）' },
  ]

  return {
    site,
    alarmAt,
    signals,
    event,
    plans,
    feedback,
    officialAnchors: [
      { at: site.alarmAt, label: '接警', source: '广州市消防救援支队通报' },
      { at: site.extinguishedAt, label: '明火扑灭', source: '广州市消防救援支队通报' },
    ],
  }
}

function makeIntersections(alarmAt: number): IntersectionTask[] {
  const spec: Array<[string, number, [number, number]]> = [
    ['人民南路 × 大德路', min(3), [113.2481, 23.1204]],
    ['人民南路 × 一德路', min(5), [113.2479, 23.1168]],
    ['人民南路 × 沿江西路', min(6), [113.2477, 23.1122]],
  ]
  return spec.map(([name, offset, location], i) => ({
    intersectionId: `int-${i + 1}`,
    name,
    location,
    passAt: alarmAt + offset,
    leadSeconds: 75, // 占位值，依据待补，见 docs/数据边界.md E 组
    releaseAt: alarmAt + offset + 60,
    suggestedAction: '信号绿波配时，交警到位',
  }))
}

/**
 * 两方案是否存在显著差异。
 *
 * 判据是两条误差带不重叠。误差带来自速度模型的不确定性，不是 A 与 B
 * 的两端，详见 types.ts 中 PlanMetrics.etaRange 的注释。
 */
export function isDifferenceSignificant(a: Plan, b: Plan): boolean {
  const [aLow, aHigh] = a.metrics.etaRange
  const [bLow, bHigh] = b.metrics.etaRange
  return aHigh < bLow || bHigh < aLow
}
