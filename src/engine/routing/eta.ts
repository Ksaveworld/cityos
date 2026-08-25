/**
 * 到场时间与误差带。纯函数。
 *
 * 误差带是**单个方案自身的不确定区间**，不是 A 与 B 的两端。
 * 详见 types.ts 中 PlanMetrics.etaRange 的注释，那里记着原来那句
 * 循环定义错在哪。
 */

import { EMERGENCY_FACTOR_DEFAULT, EMERGENCY_FACTOR_RANGE, travelSeconds } from './cost'
import type { RouteStep } from './route'

export interface EtaEstimate {
  /** 默认系数下的到场秒数 */
  seconds: number
  /** 误差带，系数取区间两端各算一次得到 */
  range: [number, number]
  /** 带宽占中值的比例，界面上用来说明估计有多不准 */
  relativeWidth: number
}

/**
 * 算一条路径的到场时间与误差带。
 *
 * 路径固定不动，只让紧急车辆系数在合理区间里动。系数越大车越快，
 * 所以区间上端的系数对应的是耗时下界。
 */
export function estimate(
  steps: RouteStep[],
  factorRange: [number, number] = EMERGENCY_FACTOR_RANGE,
  defaultFactor: number = EMERGENCY_FACTOR_DEFAULT,
): EtaEstimate {
  const at = (factor: number) =>
    steps.reduce((sum, s) => sum + travelSeconds(s.segment, s.reversed, factor), 0)

  const seconds = at(defaultFactor)
  const [loFactor, hiFactor] = factorRange
  // 系数大 → 速度快 → 耗时小
  const lo = at(hiFactor)
  const hi = at(loFactor)
  const mid = (lo + hi) / 2

  return {
    seconds,
    range: [lo, hi],
    relativeWidth: mid > 0 ? (hi - lo) / mid : 0,
  }
}

/** 两条误差带是否重叠。重叠即算不出显著区别 */
export function bandsOverlap(a: [number, number], b: [number, number]): boolean {
  return !(a[1] < b[0] || b[1] < a[0])
}

/**
 * 特权收益。基线耗时减特权耗时，单独的量，不进误差带。
 *
 * 返回值可能是零甚至负数。起点离事发点很近、路又直的时候，放开逆行
 * 完全用不上，A 与 B 会算出同一条路径，这时收益就是零，界面照实显示，
 * 不要粉饰。
 */
export function privilegeGain(baselineSeconds: number, privilegedSeconds: number): number {
  return baselineSeconds - privilegedSeconds
}
