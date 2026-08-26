import { readFile } from 'node:fs/promises'
import path from 'node:path'

import postgres from 'postgres'

import { parsePublicPoiSnapshot } from '../server/cityos/public-data.ts'

const databaseUrl = process.env.CITYOS_DATABASE_URL
  ?? 'postgres://cityos:cityos_dev@127.0.0.1:55432/cityos'
const sourcePath = path.resolve(process.env.CITYOS_PUBLIC_POI_FILE ?? 'public/data/liwan_resources.geojson')
const capturedAt = process.env.CITYOS_PUBLIC_POI_CAPTURED_AT ?? '2026-08-14T00:00:00.000Z'
const sql = postgres(databaseUrl, { max: 1 })

try {
  const source = await readFile(sourcePath, 'utf8')
  const snapshot = parsePublicPoiSnapshot(source, capturedAt)

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO cityos.dataset_snapshot (
        id, dataset_name, source_system, source_url, license, captured_at,
        content_sha256, feature_count, stats
      ) VALUES (
        ${snapshot.id}, ${snapshot.datasetName}, ${snapshot.sourceSystem},
        ${snapshot.sourceUrl}, ${snapshot.license}, ${snapshot.capturedAt},
        ${snapshot.contentSha256}, ${snapshot.featureCount}, ${transaction.json(snapshot.stats)}
      )
      ON CONFLICT (id) DO UPDATE SET
        source_url = EXCLUDED.source_url,
        license = EXCLUDED.license,
        feature_count = EXCLUDED.feature_count,
        stats = EXCLUDED.stats,
        imported_at = now()
    `

    for (const row of snapshot.rows) {
      await transaction`
        INSERT INTO cityos.reference_poi (
          id, dataset_snapshot_id, source_feature_key, kind, name,
          longitude, latitude, properties
        ) VALUES (
          ${row.id}, ${snapshot.id}, ${row.sourceFeatureKey}, ${row.kind}, ${row.name},
          ${row.longitude}, ${row.latitude}, ${transaction.json(row.properties)}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          properties = EXCLUDED.properties
      `
    }

    // 运行设施只关联同名、最近的公开医院点位。状态、ETA 和调派关系仍留在运行表中。
    await transaction`
      UPDATE cityos.facility AS facility
      SET reference_poi_id = (
        SELECT poi.id
        FROM cityos.reference_poi AS poi
        WHERE poi.dataset_snapshot_id = ${snapshot.id}
          AND poi.kind = 'hospital'
          AND poi.name = facility.name
        ORDER BY
          power(poi.longitude - facility.longitude, 2)
          + power(poi.latitude - facility.latitude, 2),
          poi.id
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1
        FROM cityos.reference_poi AS poi
        WHERE poi.dataset_snapshot_id = ${snapshot.id}
          AND poi.kind = 'hospital'
          AND poi.name = facility.name
      )
    `
  })

  console.log(`imported ${snapshot.featureCount} public POIs from ${path.basename(sourcePath)}`)
  console.log(JSON.stringify({ snapshotId: snapshot.id, stats: snapshot.stats }))
} finally {
  await sql.end()
}
