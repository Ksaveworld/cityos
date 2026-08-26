import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { parsePublicPoiSnapshot } from './public-data.ts'

test('广州公开点位快照保持可追溯且不包含运行状态', async () => {
  const source = await readFile('public/data/liwan_resources.geojson', 'utf8')
  const snapshot = parsePublicPoiSnapshot(source)

  assert.equal(snapshot.featureCount, 134)
  assert.deepEqual(snapshot.stats, { hospital: 73, fire_station: 14, police: 47 })
  assert.match(snapshot.contentSha256, /^[0-9a-f]{64}$/)
  assert.equal(snapshot.capturedAt, '2026-08-14T00:00:00.000Z')
  assert.equal(snapshot.rows.every((row) => !('status' in row.properties)), true)
})

test('公开点位导入拒绝非 Point 和未知类型', () => {
  assert.throws(
    () => parsePublicPoiSnapshot(JSON.stringify({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { kind: 'ambulance', name: '测试点' },
        geometry: { type: 'LineString', coordinates: [] },
      }],
    })),
    /类型不支持|必须是 Point/,
  )
})
