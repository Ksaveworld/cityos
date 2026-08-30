/**
 * 阶段 0 的覆盖几何。纯函数，不依赖 React、不读全局状态。
 *
 * 这里的圆是**硬编码示意**，不是算出来的——阶段 0 只验证「覆盖收缩那半秒有没有
 * 力量」，等时圈求解是阶段 3 的活（见 `docs/调度台改造路线图.md`）。
 *
 * 但「圈里有哪些建筑」是**真数的**：拿 OSM 建筑轮廓的质心做归属判定。
 * 硬编码一份建筑 id 列表反而更麻烦，而且数字一被追问就露馅。
 *
 * 阶段 0 若通过，这里的函数升级进 `src/engine/coverage/`；若不通过，
 * 整个 `src/phase0/` 目录连同本文件一起删掉。
 */
import { M_PER_DEG_LAT, M_PER_DEG_LNG } from '@/engine/routing/geo'
import type { LngLat } from '@/engine/types'

/** 闭合环。首尾同点，GeoJSON Polygon 要求。 */
export type Ring = LngLat[]

/**
 * 以 center 为心、radiusM 为半径的等距圆。
 *
 * 荔湾在北纬 23 度附近，经纬度每度对应的米数不同，两个方向分别换算，
 * 否则圆在屏幕上会压成椭圆。近似口径与 `engine/routing/geo` 一致。
 */
export function circleRing(center: LngLat, radiusM: number, steps = 128): Ring {
  const ring: Ring = []
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    ring.push([
      center[0] + (Math.cos(angle) * radiusM) / M_PER_DEG_LNG,
      center[1] + (Math.sin(angle) * radiusM) / M_PER_DEG_LAT,
    ])
  }
  ring.push(ring[0])
  return ring
}

/** 单环多边形 */
export function ringToPolygon(ring: Ring): GeoJSON.Feature<GeoJSON.Polygon> {
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/**
 * 环带：外环挖掉内环。这就是收缩后露出来的空洞。
 *
 * GeoJSON 要求内环绕向与外环相反，否则部分渲染器会把洞画成实心。
 * MapLibre 的 earcut 实际不挑绕向，但按规范反转一次成本为零。
 */
export function annulusPolygon(outer: Ring, inner: Ring): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [outer, [...inner].reverse()] },
  }
}

/** 外环顶点平均。建筑轮廓都是小多边形，用它代替真质心足够。 */
export function outlineCenter(polygon: GeoJSON.Polygon): LngLat {
  const ring = polygon.coordinates[0]
  let lng = 0
  let lat = 0
  for (const point of ring) {
    lng += point[0]
    lat += point[1]
  }
  return [lng / ring.length, lat / ring.length]
}

/**
 * 落在 (innerM, outerM] 环带里的建筑 id。
 *
 * 判定用质心而不是「轮廓与环带相交」：跨边界的建筑要么算进要么算出，
 * 阶段 0 不值得为这点精度引入几何裁剪。数字对外口径是「约」。
 */
export function buildingIdsInAnnulus(
  buildings: GeoJSON.FeatureCollection,
  center: LngLat,
  innerM: number,
  outerM: number,
): string[] {
  const ids: string[] = []
  for (const feature of buildings.features) {
    if (feature.geometry.type !== 'Polygon') continue
    const id = feature.properties?.id
    if (typeof id !== 'string') continue
    const point = outlineCenter(feature.geometry)
    const dx = (point[0] - center[0]) * M_PER_DEG_LNG
    const dy = (point[1] - center[1]) * M_PER_DEG_LAT
    const distance = Math.hypot(dx, dy)
    if (distance > innerM && distance <= outerM) ids.push(id)
  }
  return ids
}

/** 环带面积，平方公里。等距近似，与 circleRing 同口径。 */
export function annulusAreaKm2(innerM: number, outerM: number): number {
  return (Math.PI * (outerM * outerM - innerM * innerM)) / 1_000_000
}

/** 收缩用。快起慢收，读起来像力量撤走后自己停住，不像机械插值。 */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

/** 建筑掉色用。两头都软，避免颜色跳变抢走收缩本身的注意力。 */
export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** #rrggbb 之间线性插值。sRGB 直插，肉眼在这段灰蓝里看不出与线性空间的差别。 */
export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  const channel = (index: number) => Math.round(lerp(a[index], b[index], t))
  return `#${[channel(0), channel(1), channel(2)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}
