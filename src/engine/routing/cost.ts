/**
 * 通行代价。纯函数。
 *
 * 段代价 = 段长 / 速度。段长是实测几何算出来的，速度是模拟值。
 * 这条分界要在界面上说清楚：路径是在真实路网上真实求解的，
 * 时间是模拟速度模型算的。
 */

import { BASE_SPEED_KMH, DEFAULT_SPEED_KMH, type Segment } from './graph'

/**
 * 紧急车辆系数的合理区间。**模拟值，无公开来源。**
 *
 * 消防车实际行驶速度没有任何公开数据源，这个区间是拍的。它的作用不是
 * 给出准确速度，而是承载不确定性：ETA 的误差带就是系数取两端各算一次
 * 得到的，见 eta.ts。
 */
export const EMERGENCY_FACTOR_RANGE: [number, number] = [0.85, 1.2]
export const EMERGENCY_FACTOR_DEFAULT = 1.0

/** 逆行段的减速。逆着单行道走要慢，这个折扣同样是模拟值 */
export const REVERSED_PENALTY = 0.7

/** 段的基准速度，km/h */
export function baseSpeed(segment: Segment): number {
  return BASE_SPEED_KMH[segment.highway] ?? DEFAULT_SPEED_KMH
}

/**
 * 走完一段要多少秒。
 *
 * @param reversed 是否逆着单行道方向走，会吃减速折扣
 * @param factor 紧急车辆系数
 */
export function travelSeconds(
  segment: Segment,
  reversed: boolean,
  factor: number,
): number {
  const kmh = baseSpeed(segment) * factor * (reversed ? REVERSED_PENALTY : 1)
  const mps = (kmh * 1000) / 3600
  return segment.length / mps
}
