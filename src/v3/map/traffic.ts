/**
 * 第 2 层：路况着色。拥堵值是模拟的，界面必须标「模拟」。
 *
 * 视觉语言参考高德四档：畅通绿 / 缓行黄 / 拥堵红 / 严重深红。
 * 不接任何实时路况源。同一 way id 哈希结果稳定，刷新页不会乱跳。
 */
export type CongestionLevel = 0 | 1 | 2 | 3

export const CONGESTION_COLORS = {
  0: '#1EC97A',
  1: '#F5C518',
  2: '#F04A3E',
  3: '#9B1B2E',
} as const

const ARTERIAL = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
])

const LOCAL = new Set(['residential', 'living_street', 'service', 'unclassified'])

function hashId(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function congestionLevel(wayId: string, highway: string): CongestionLevel {
  const bucket = hashId(wayId) % 100
  if (ARTERIAL.has(highway)) {
    if (bucket < 32) return 0
    if (bucket < 58) return 1
    if (bucket < 84) return 2
    return 3
  }
  if (LOCAL.has(highway)) {
    if (bucket < 68) return 0
    if (bucket < 88) return 1
    if (bucket < 97) return 2
    return 3
  }
  if (bucket < 48) return 0
  if (bucket < 74) return 1
  if (bucket < 92) return 2
  return 3
}

export function withSimulatedCongestion(
  roads: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: roads.features.map((feature) => {
      const properties = feature.properties ?? {}
      const wayId = String(properties.id ?? '')
      const highway = String(properties.highway ?? '')
      return {
        ...feature,
        properties: {
          ...properties,
          congestion: congestionLevel(wayId, highway),
          congestion_origin: 'simulated',
        },
      }
    }),
  }
}
