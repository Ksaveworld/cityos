/**
 * 调派起点。**场景输入数据，不是路由逻辑的一部分。**
 *
 * routing/ 下的 graph、cost、route 都不认识任何具体站点，起点由这里
 * 作为参数传进去。换场景换起点只改这个文件。
 *
 * 数据边界，界面上必须逐条分开表达：
 * - 站点名称与坐标来自 OpenStreetMap，是真实公开点位
 * - 车辆配置、实时可用状态、以及「被选为本次调派起点」这件事，全部是模拟
 * - 公开渠道无法确认该站是否参与了 5·16 的真实出警
 *
 * 不得表述为历史真实派遣、最近消防站或属地消防站。
 */

import type { LngLat } from './types'

export interface DispatchOrigin {
  id: string
  /** 站点名。来自 OSM */
  name: string
  /** 站点坐标。来自 OSM，真实公开点位 */
  location: LngLat
  /** 本次演示假定携带的车辆组合。模拟 */
  vehicles: string[]
  /** 演示口径说明，Strategy 环固定展示这一段，不折叠不省略 */
  assumption: string
}

/**
 * 第一版 Demo 的调派起点。
 *
 * 选取依据是预先声明的演示资源设定，不是先看结果再挑站点：在本 Demo 的
 * 模拟资源状态快照中，光大消防中队是当前具备所需车辆组合的最近可用增援站。
 */
export const GUANGDA: DispatchOrigin = {
  id: 'station-guangda',
  name: '光大消防中队',
  location: [113.2559561, 23.0868815],
  vehicles: ['水罐车 2', '云梯车 1', '抢险救援车 1'],
  assumption:
    '演示调派假设：光大消防中队在当前模拟资源快照中具备所需车辆组合且可立即出动。' +
    '站点位置来自 OSM；车辆能力、实时状态和调派关系均为模拟，不代表 5·16 历史真实出警。',
}

/** 界面上的来源角标要把这两件事分开说，不能合成一句「部分模拟」 */
export const ORIGIN_PROVENANCE = {
  location: {
    origin: 'real' as const,
    label: '站点位置',
    source: 'OpenStreetMap 公开点位',
  },
  readiness: {
    origin: 'simulated' as const,
    label: '车辆配置与实时状态',
    source: '模拟资源快照，无公开来源',
  },
  dispatch: {
    origin: 'simulated' as const,
    label: '调派关系',
    source: '演示设定，公开渠道无法确认该站是否参与 5·16 真实出警',
  },
}
