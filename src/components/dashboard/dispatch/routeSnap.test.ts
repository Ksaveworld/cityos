import assert from 'node:assert/strict'
import test from 'node:test'

import { nearestRouteSnap } from './routeSnap.ts'

test('snaps a drop anywhere along the static route instead of requiring a dedicated target', () => {
  const snap = nearestRouteSnap(
    ([x, y]) => ({ x, y }),
    [70, 10],
    [[0, 0], [100, 0]],
  )

  assert.deepEqual(snap.position, [70, 0])
  assert.equal(snap.progress, 0.7)
  assert.equal(snap.distancePixels, 10)
})
