/**
 * 第 6 层：环境车流。deck.gl TripsLayer 沿荔湾路网生成随机轨迹。
 *
 * 这是装饰层，不是出动单位（第 8 层）。必须标「模拟」。
 */
import { meters, type LngLat } from '@/engine'

export interface AmbientTrip {
  path: LngLat[]
  timestamps: number[]
  color: [number, number, number]
}

const DRIVABLE = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
])

const HEADLIGHT: [number, number, number] = [255, 214, 140]
const HEADLIGHT_COOL: [number, number, number] = [220, 236, 255]
const TAILLIGHT: [number, number, number] = [255, 92, 72]

/** 动画循环时长（秒）。currentTime 在这个区间内取模。 */
export const TRIP_LOOP_SECONDS = 48
const TARGET_TRIPS = 140
const MIN_ROAD_METERS = 90
const TRIP_WINDOW_METERS = 280
const SPEED_MPS = 12

function hashId(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function lineLength(coordinates: LngLat[]): number {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    total += meters(coordinates[index - 1], coordinates[index])
  }
  return total
}

function slicePath(path: LngLat[], maxMeters: number, startRatio: number): LngLat[] {
  const total = lineLength(path)
  if (total <= maxMeters) return path

  const startAt = startRatio * (total - maxMeters)
  const endAt = startAt + maxMeters
  const sliced: LngLat[] = []
  let traveled = 0

  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const segment = meters(from, to)
    const next = traveled + segment

    if (next >= startAt && sliced.length === 0) {
      const t = segment === 0 ? 0 : (startAt - traveled) / segment
      sliced.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ])
    }

    if (next >= startAt && next <= endAt) sliced.push(to)

    if (next > endAt) {
      const t = segment === 0 ? 0 : (endAt - traveled) / segment
      sliced.push([
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
      ])
      break
    }

    traveled = next
  }

  return sliced.length >= 2 ? sliced : path.slice(0, 2)
}

function timestampsFor(path: LngLat[], offsetSeconds: number): number[] {
  const stamps = [offsetSeconds]
  let traveled = 0
  for (let index = 1; index < path.length; index += 1) {
    traveled += meters(path[index - 1], path[index])
    stamps.push(offsetSeconds + traveled / SPEED_MPS)
  }
  return stamps
}

function pickColor(hash: number): [number, number, number] {
  const lane = hash % 10
  if (lane < 6) return HEADLIGHT
  if (lane < 8) return HEADLIGHT_COOL
  return TAILLIGHT
}

export function buildAmbientTrips(roads: GeoJSON.FeatureCollection): AmbientTrip[] {
  const candidates = roads.features.flatMap((feature) => {
    if (feature.geometry.type !== 'LineString') return []
    const highway = String(feature.properties?.highway ?? '')
    if (!DRIVABLE.has(highway)) return []
    const path = feature.geometry.coordinates as LngLat[]
    if (path.length < 3) return []
    const length = lineLength(path)
    if (length < MIN_ROAD_METERS) return []
    return [{
      id: String(feature.properties?.id ?? ''),
      path,
      length,
      hash: hashId(String(feature.properties?.id ?? '')),
    }]
  })

  candidates.sort((left, right) => right.length - left.length)
  const pool = candidates.slice(0, Math.min(candidates.length, 900))
  if (pool.length === 0) return []

  const trips: AmbientTrip[] = []
  const count = Math.min(TARGET_TRIPS, pool.length)
  for (let index = 0; index < count; index += 1) {
    const road = pool[(index * 7 + 13) % pool.length]
    const reverse = road.hash % 2 === 1
    const fullPath = reverse ? [...road.path].reverse() : road.path
    const path = slicePath(fullPath, TRIP_WINDOW_METERS, (road.hash % 1000) / 1000)
    if (path.length < 2) continue
    const travel = lineLength(path) / SPEED_MPS
    const offset = ((road.hash >>> 8) % Math.max(1, Math.floor((TRIP_LOOP_SECONDS - travel - 2) * 100))) / 100
    trips.push({
      path,
      timestamps: timestampsFor(path, offset),
      color: pickColor(road.hash),
    })
  }
  return trips
}
