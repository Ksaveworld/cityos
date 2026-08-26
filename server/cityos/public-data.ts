import { createHash } from 'node:crypto'

export const PUBLIC_POI_KINDS = ['hospital', 'fire_station', 'police'] as const
export type PublicPoiKind = typeof PUBLIC_POI_KINDS[number]

interface GeoJsonFeature {
  type?: unknown
  properties?: unknown
  geometry?: unknown
}

interface GeoJsonFeatureCollection {
  type?: unknown
  features?: unknown
}

export interface PublicPoiImportRow {
  id: string
  sourceFeatureKey: string
  kind: PublicPoiKind
  name: string
  longitude: number
  latitude: number
  properties: Record<string, string>
}

export interface PublicPoiSnapshot {
  id: string
  datasetName: string
  sourceSystem: 'openstreetmap-overpass-snapshot'
  sourceUrl: 'https://www.openstreetmap.org/copyright'
  license: 'ODbL-1.0'
  capturedAt: string
  contentSha256: string
  featureCount: number
  stats: Record<PublicPoiKind, number>
  rows: PublicPoiImportRow[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function supportedKind(value: unknown): value is PublicPoiKind {
  return typeof value === 'string' && (PUBLIC_POI_KINDS as readonly string[]).includes(value)
}

function normalizedProperties(value: unknown): Record<string, string> {
  if (!isRecord(value)) throw new Error('公开点位 properties 必须是对象。')
  const properties: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') properties[key] = item
  }
  return properties
}

function pointCoordinates(value: unknown): [number, number] {
  if (!isRecord(value) || value.type !== 'Point' || !Array.isArray(value.coordinates)) {
    throw new Error('公开点位 geometry 必须是 Point。')
  }
  const [longitude, latitude] = value.coordinates
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('公开点位坐标无效。')
  }
  return [longitude, latitude]
}

export function parsePublicPoiSnapshot(
  source: string,
  capturedAt = '2026-08-14T00:00:00.000Z',
  datasetName = 'guangzhou-liwan-public-resources',
): PublicPoiSnapshot {
  const parsed = JSON.parse(source) as GeoJsonFeatureCollection
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('公开点位文件必须是 GeoJSON FeatureCollection。')
  }
  if (!Number.isFinite(Date.parse(capturedAt))) throw new Error('公开点位快照时间无效。')

  const contentSha256 = createHash('sha256').update(source).digest('hex')
  const snapshotId = `dataset-${contentSha256.slice(0, 20)}`
  const stats: Record<PublicPoiKind, number> = { hospital: 0, fire_station: 0, police: 0 }
  const keys = new Set<string>()
  const rows = parsed.features.map((item, index) => {
    const feature = item as GeoJsonFeature
    if (feature.type !== 'Feature') throw new Error(`公开点位第 ${index + 1} 条不是 Feature。`)
    const properties = normalizedProperties(feature.properties)
    if (!supportedKind(properties.kind)) throw new Error(`公开点位第 ${index + 1} 条类型不支持。`)
    const name = properties.name?.trim()
    if (!name) throw new Error(`公开点位第 ${index + 1} 条缺少名称。`)
    const [longitude, latitude] = pointCoordinates(feature.geometry)
    const canonical = JSON.stringify([properties.kind, name, longitude, latitude])
    const sourceFeatureKey = createHash('sha256').update(canonical).digest('hex')
    if (keys.has(sourceFeatureKey)) throw new Error(`公开点位存在重复项：${name}。`)
    keys.add(sourceFeatureKey)
    stats[properties.kind] += 1
    return {
      id: `poi-${sourceFeatureKey.slice(0, 24)}`,
      sourceFeatureKey,
      kind: properties.kind,
      name,
      longitude,
      latitude,
      properties,
    }
  })

  return {
    id: snapshotId,
    datasetName,
    sourceSystem: 'openstreetmap-overpass-snapshot',
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL-1.0',
    capturedAt: new Date(capturedAt).toISOString(),
    contentSha256,
    featureCount: rows.length,
    stats,
    rows,
  }
}
