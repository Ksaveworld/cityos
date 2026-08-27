import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getTrafficStrategyRoute,
  getSelectableTrafficStrategyRoutes,
  TRAFFIC_PREVIOUS_CONVENTIONAL_ETA_MINUTES,
  TRAFFIC_SECOND_ALTERNATIVE_PATH,
  TRAFFIC_STRATEGY_ROUTES,
} from './trafficStrategyRoutes.ts'

test('traffic comparison has one current blocked route, one recommendation, and one second alternative', () => {
  assert.equal(TRAFFIC_STRATEGY_ROUTES.length, 3)
  assert.deepEqual(
    TRAFFIC_STRATEGY_ROUTES.map((route) => [route.id, route.role]),
    [
      ['A', 'second-alternative'],
      ['B', 'current-blocked'],
      ['C', 'recommended'],
    ],
  )
  assert.deepEqual(
    TRAFFIC_STRATEGY_ROUTES.map((route) => [route.id, route.selectable, route.executionRouteRole]),
    [
      ['A', true, 'primary'],
      ['B', false, 'secondary'],
      ['C', true, 'medical'],
    ],
  )
  assert.deepEqual(getSelectableTrafficStrategyRoutes().map((route) => route.id), ['A', 'C'])
  assert.ok(getSelectableTrafficStrategyRoutes().every((route) => (
    route.defaultProgress >= 0.05 && route.defaultProgress <= 0.95
  )))

  for (const route of TRAFFIC_STRATEGY_ROUTES) {
    assert.match(route.etaLabel, /演示估算/)
    assert.match(route.roadStatus, /模拟|待核实/)
    assert.ok(route.recommendationReason.length > 0)
    assert.equal(route.dataOrigin.eta, '演示估算')
    assert.equal(route.dataOrigin.roadState, '模拟待核实')
  }
})

test('second alternative is shorter than the previous conventional estimate while recommendation remains faster', () => {
  const alternative = getTrafficStrategyRoute('A')
  const recommended = getTrafficStrategyRoute('C')

  assert.equal(alternative.etaMinutes, 11)
  assert.ok(alternative.etaMinutes < TRAFFIC_PREVIOUS_CONVENTIONAL_ETA_MINUTES)
  assert.ok(recommended.etaMinutes < alternative.etaMinutes)
})

test('second alternative keeps the local road preset and its distinct southwest corridor', () => {
  const alternative = getTrafficStrategyRoute('A')
  assert.equal(alternative.presetPath, TRAFFIC_SECOND_ALTERNATIVE_PATH)
  assert.equal(alternative.dataOrigin.geometry, '本地 OSM 静态路网预置')
  assert.deepEqual(TRAFFIC_SECOND_ALTERNATIVE_PATH[0], [113.2628, 23.1215])
  assert.deepEqual(TRAFFIC_SECOND_ALTERNATIVE_PATH.at(-1), [113.2684, 23.1253])
  assert.ok(TRAFFIC_SECOND_ALTERNATIVE_PATH.some(([longitude]) => longitude < 113.259))

  const lengthMeters = TRAFFIC_SECOND_ALTERNATIVE_PATH.slice(1).reduce((total, point, index) => {
    const previous = TRAFFIC_SECOND_ALTERNATIVE_PATH[index]
    const dx = (point[0] - previous[0]) * 102_400
    const dy = (point[1] - previous[1]) * 111_320
    return total + Math.hypot(dx, dy)
  }, 0)
  assert.ok(lengthMeters > 1_800 && lengthMeters < 2_000)
})
