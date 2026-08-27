import assert from 'node:assert/strict'
import test from 'node:test'

import { CURRENT_POLICE_FIXTURE, DOMAIN_FIXTURES } from './fixtures.ts'

test('current 110 fixture is isolated from the 2015 public-case data', () => {
  const historical = DOMAIN_FIXTURES.police
  const currentData = JSON.stringify({
    brief: CURRENT_POLICE_FIXTURE.brief,
    taskAssignments: CURRENT_POLICE_FIXTURE.taskAssignments,
  })

  assert.equal(historical.isHistoricalCase, true)
  assert.equal(CURRENT_POLICE_FIXTURE.isHistoricalCase, false)
  assert.notEqual(CURRENT_POLICE_FIXTURE.brief, historical.brief)
  assert.notEqual(CURRENT_POLICE_FIXTURE.taskAssignments, historical.taskAssignments)
  assert.match(currentData, /签收超时|备用疏导|外围疏导/)
  assert.doesNotMatch(currentData, /2015-03-06|9 人受伤|原医院分流|医疗接应/)
})
