import assert from 'node:assert/strict'
import test from 'node:test'

import { orderDispatchEventIds } from './resourceDispatchOrder.ts'

test('keeps Zhongshan and Panfu first while allowing the selected legacy event to follow', () => {
  const ordered = orderDispatchEventIds([
    'ev-fire-finance',
    'ev-police-station-delay',
    'ev-medical-panfu',
    'ev-traffic-zhongshan',
    'ev-city-order-beijing',
  ], 'ev-police-station-delay')

  assert.deepEqual(ordered, [
    'ev-traffic-zhongshan',
    'ev-medical-panfu',
    'ev-police-station-delay',
    'ev-fire-finance',
    'ev-city-order-beijing',
  ])
})

test('does not let a selected legacy event displace either P0 event', () => {
  const ordered = orderDispatchEventIds([
    'ev-fire-finance',
    'ev-medical-panfu',
    'ev-traffic-zhongshan',
  ], 'ev-fire-finance')

  assert.deepEqual(ordered.slice(0, 2), ['ev-traffic-zhongshan', 'ev-medical-panfu'])
})
