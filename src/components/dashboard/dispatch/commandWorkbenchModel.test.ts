import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commandWorkbenchReducer,
  createInitialCommandWorkbenchState,
} from './commandWorkbenchModel.ts'

test('dragging the traffic unit switches the map preview before recalculation invalidates v1', () => {
  const initial = createInitialCommandWorkbenchState()
  const preview = commandWorkbenchReducer(initial, { type: 'traffic/drop-reroute', routeProgress: 0.43 })

  assert.equal(preview.traffic.phase, 'recalculating')
  assert.equal(preview.traffic.activeRouteId, 'C')
  assert.equal(preview.traffic.carProgress, 0.43)
  assert.equal(preview.traffic.planVersion, 1)
  assert.equal(preview.traffic.approvedVersion, 1)
  assert.equal(preview.traffic.taskVersion, 1)
  assert.equal(preview.traffic.taskStatus, 'en-route')
  assert.equal(preview.traffic.previousTask, null)

  const submitted = commandWorkbenchReducer(preview, { type: 'traffic/recalculation-complete' })
  assert.equal(submitted.traffic.phase, 'awaiting-approval')
  assert.equal(submitted.traffic.planVersion, 2)
  assert.equal(submitted.traffic.approvedVersion, null)
  assert.equal(submitted.traffic.taskStatus, 'invalidated')
  assert.deepEqual(submitted.traffic.previousTask, { version: 1, status: 'invalidated' })
})

test('traffic route C preview is immediate but the replacement task still requires approval and delivery', () => {
  let state = createInitialCommandWorkbenchState()
  state = commandWorkbenchReducer(state, { type: 'traffic/tick', delta: 1 })
  assert.ok(
    Math.abs(state.traffic.carProgress - 0.2377266150) < 1e-10,
    'vehicle waits at the last shared B/C point before the blocked way',
  )
  state = commandWorkbenchReducer(state, { type: 'traffic/drop-reroute', routeProgress: 0.43 })
  assert.equal(state.traffic.activeRouteId, 'C')
  assert.equal(state.traffic.carProgress, 0.43)
  assert.equal(
    commandWorkbenchReducer(state, { type: 'traffic/tick', delta: 0.1 }).traffic.carProgress,
    0.43,
    'map preview stays at the dropped position until the replacement task executes',
  )
  state = commandWorkbenchReducer(state, { type: 'traffic/recalculation-complete' })

  state = commandWorkbenchReducer(state, { type: 'traffic/approve-and-issue' })
  assert.equal(state.traffic.phase, 'sent-awaiting-ack')
  assert.equal(state.traffic.approvedVersion, 2)
  assert.equal(state.traffic.taskVersion, 2)
  assert.equal(state.traffic.taskStatus, 'sent-awaiting-ack')

  const previewProgressOnRouteC = state.traffic.carProgress
  state = commandWorkbenchReducer(state, { type: 'traffic/acknowledge' })
  assert.equal(state.traffic.phase, 'acknowledged')
  assert.equal(state.traffic.taskStatus, 'accepted')
  assert.deepEqual(state.traffic.previousTask, { version: 1, status: 'replaced' })
  assert.equal(state.traffic.carProgress, previewProgressOnRouteC, 'acknowledgement does not move an already previewed unit')

  state = commandWorkbenchReducer(state, { type: 'traffic/start-execution' })
  assert.equal(state.traffic.phase, 'en-route')
  state = commandWorkbenchReducer(state, { type: 'traffic/tick', delta: 1 })
  assert.equal(state.traffic.phase, 'arrived')
  assert.equal(state.traffic.taskStatus, 'arrived')
  assert.equal(state.traffic.carProgress, 1)
})

test('medical scenario keeps AMB-02 and changes only facility, route and versioned task', () => {
  let state = createInitialCommandWorkbenchState()
  state = commandWorkbenchReducer(state, { type: 'medical/select-red-cross' })

  assert.equal(state.medical.phase, 'preview')
  assert.equal(state.medical.selectedFacilityId, 'facility-red-cross')
  assert.equal(state.medical.planVersion, 1)
  assert.equal(state.medical.approvedVersion, 1)
  assert.equal(state.medical.taskStatus, 'en-route')
  assert.equal(state.medical.previousTask, null)

  state = commandWorkbenchReducer(state, { type: 'medical/submit-adjustment' })
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'invalidated' })
  state = commandWorkbenchReducer(state, { type: 'medical/approve' })
  state = commandWorkbenchReducer(state, { type: 'medical/issue' })
  assert.equal(state.medical.phase, 'sent-awaiting-ack')

  state = commandWorkbenchReducer(state, { type: 'medical/acknowledge' })
  assert.equal(state.medical.phase, 'acknowledged')
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'replaced' })
  state = commandWorkbenchReducer(state, { type: 'medical/start-execution' })
  state = commandWorkbenchReducer(state, { type: 'medical/tick', delta: 1 })
  assert.equal(state.medical.planVersion, 2)
  assert.equal(state.medical.taskVersion, 2)
  assert.equal(state.medical.phase, 'arrived')
  assert.equal(state.medical.taskStatus, 'arrived')
})

test('multimodal evidence enters the brief only through an explicit review result', () => {
  const initial = createInitialCommandWorkbenchState()
  assert.ok(initial.evidence.every((item) => item.status === 'pending'))

  const reviewed = commandWorkbenchReducer(initial, {
    type: 'evidence/review',
    evidenceId: initial.evidence[0].id,
    status: 'verified',
  })
  assert.equal(reviewed.evidence[0].status, 'verified')
  assert.ok(reviewed.evidence.slice(1).every((item) => item.status === 'pending'))
})
