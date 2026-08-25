/**
 * 地理计算。纯函数，无副作用。
 *
 * 荔湾在北纬 23 度附近，范围只有几公里，用等距圆柱近似足够，
 * 误差远小于路网几何本身的精度。
 */

import type { LngLat } from '../types'

/** 纬度 23.1 度处 1 度经度约 102.4 km，1 度纬度约 111.32 km */
export const M_PER_DEG_LNG = 102_400
export const M_PER_DEG_LAT = 111_320

/** 两点距离，米 */
export function meters(a: LngLat, b: LngLat): number {
  const dx = (a[0] - b[0]) * M_PER_DEG_LNG
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT
  return Math.hypot(dx, dy)
}

/**
 * 坐标量化成节点 key。
 *
 * OSM 的相邻 way 在路口共享坐标，但浮点表示可能有末位差异，
 * 量化到 6 位小数（约 0.1 m）后合并，否则图会散成互不连通的碎片。
 */
export function nodeKey(p: LngLat): string {
  return `${p[0].toFixed(6)},${p[1].toFixed(6)}`
}

/** 从 key 还原坐标 */
export function keyToLngLat(key: string): LngLat {
  const [lng, lat] = key.split(',').map(Number)
  return [lng, lat]
}
