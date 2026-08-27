import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commandWorkbenchReducer,
  createInitialCommandWorkbenchState,
} from './commandWorkbenchModel.ts'
import {
  DISPATCH_FACILITIES,
  getSelectableDispatchFacilities,
  rankDispatchFacilitiesForContact,
  resolveDispatchFacilityByOptionId,
} from './dispatchData.ts'
import { createRoutineHospitalTransfer, getPanfuHospitalPath } from './hospitalStrategyRoutes.ts'

test('medical transfer fixture exposes one impacted baseline and two selectable candidates', () => {
  const impacted = DISPATCH_FACILITIES.filter((facility) => facility.planningState.impacted)
  const candidates = getSelectableDispatchFacilities()

  assert.equal(DISPATCH_FACILITIES.length, 3)
  assert.equal(impacted.length, 1)
  assert.equal(impacted[0].id, 'facility-medical-reference')
  assert.equal(impacted[0].selectable, false)
  assert.deepEqual(impacted[0].resolutionOptionIds, { fire: null, medical: null })
  assert.deepEqual(candidates.map((facility) => [facility.id, facility.etaMinutes]), [
    ['facility-red-cross', 6],
    ['facility-shiyi', 10],
  ])
  assert.deepEqual(rankDispatchFacilitiesForContact().map((facility) => facility.id), [
    'facility-red-cross',
    'facility-shiyi',
  ])
  assert.ok(DISPATCH_FACILITIES.every((facility) => !facility.receivingState.includes('已确认接收')))

  for (const facility of DISPATCH_FACILITIES) {
    const path = getPanfuHospitalPath(facility.id)
    assert.deepEqual(path[0], [113.2568, 23.1265])
    assert.deepEqual(path[path.length - 1], facility.position)
    const routineTransfer = createRoutineHospitalTransfer(facility)
    assert.deepEqual(routineTransfer?.path[0], [113.25329, 23.11391])
    assert.deepEqual(routineTransfer?.path.at(-1), facility.position)
  }
  const candidateOptionIds = candidates.flatMap((facility) => Object.values(facility.resolutionOptionIds))
  assert.equal(new Set(candidateOptionIds).size, 4)
  for (const facility of candidates) {
    for (const optionId of Object.values(facility.resolutionOptionIds)) {
      assert.equal(resolveDispatchFacilityByOptionId(optionId ?? '')?.id, facility.id)
    }
  }
})

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

test('dragging AMB-02 switches the medical map preview before recalculation invalidates v1', () => {
  let state = createInitialCommandWorkbenchState()
  assert.equal(state.medical.selectedFacilityId, 'facility-medical-reference')
  state = commandWorkbenchReducer(state, { type: 'medical/tick', delta: 1 })
  assert.ok(
    Math.abs(state.medical.ambulanceProgress - 0.1950485337) < 1e-10,
    'ambulance waits at the safe decision point on the original hospital route',
  )

  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-red-cross',
    routeProgress: 0.41,
  })

  assert.equal(state.medical.phase, 'recalculating')
  assert.equal(state.medical.selectedFacilityId, 'facility-red-cross')
  assert.equal(state.medical.ambulanceProgress, 0.41)
  assert.equal(state.medical.planVersion, 1)
  assert.equal(state.medical.approvedVersion, 1)
  assert.equal(state.medical.taskStatus, 'en-route')
  assert.equal(state.medical.previousTask, null)
  assert.equal(
    commandWorkbenchReducer(state, { type: 'medical/tick', delta: 0.1 }).medical.ambulanceProgress,
    0.41,
    'medical map preview stays at the dropped position while the replacement plan is generated',
  )

  state = commandWorkbenchReducer(state, { type: 'medical/recalculation-complete' })
  assert.equal(state.medical.phase, 'awaiting-approval')
  assert.equal(state.medical.planVersion, 2)
  assert.equal(state.medical.approvedVersion, null)
  assert.equal(state.medical.taskStatus, 'invalidated')
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'invalidated' })
})

test('medical candidates can be switched repeatedly before approval without creating extra plan versions', () => {
  let state = createInitialCommandWorkbenchState()
  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-red-cross',
    routeProgress: 0.41,
  })
  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-shiyi',
    routeProgress: 0.3,
  })
  assert.equal(state.medical.phase, 'recalculating')
  assert.equal(state.medical.selectedFacilityId, 'facility-shiyi')
  assert.equal(state.medical.planVersion, 1)

  state = commandWorkbenchReducer(state, { type: 'medical/recalculation-complete' })
  assert.equal(state.medical.phase, 'awaiting-approval')
  assert.equal(state.medical.planVersion, 2)
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'invalidated' })

  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-red-cross',
    routeProgress: 0.36,
  })
  state = commandWorkbenchReducer(state, { type: 'medical/recalculation-complete' })
  assert.equal(state.medical.phase, 'awaiting-approval')
  assert.equal(state.medical.selectedFacilityId, 'facility-red-cross')
  assert.equal(state.medical.planVersion, 2)
  assert.equal(state.medical.approvedVersion, null)
  assert.equal(state.medical.taskVersion, 1)
  assert.equal(state.medical.taskStatus, 'invalidated')
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'invalidated' })

  state = commandWorkbenchReducer(state, { type: 'medical/approve' })
  const approved = state
  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-shiyi',
    routeProgress: 0.3,
  })
  assert.strictEqual(state, approved, 'approval freezes hospital selection until the workflow is reset')
})

test('medical route preview is immediate but the replacement task still requires approval and delivery', () => {
  let state = createInitialCommandWorkbenchState()
  state = commandWorkbenchReducer(state, {
    type: 'medical/select-facility',
    facilityId: 'facility-red-cross',
    routeProgress: 0.41,
  })
  state = commandWorkbenchReducer(state, { type: 'medical/recalculation-complete' })
  state = commandWorkbenchReducer(state, { type: 'medical/approve' })
  assert.equal(state.medical.phase, 'approved')
  assert.equal(state.medical.approvedVersion, 2)
  assert.equal(state.medical.taskStatus, 'pending-send')

  state = commandWorkbenchReducer(state, { type: 'medical/issue' })
  assert.equal(state.medical.phase, 'sent-awaiting-ack')

  const previewProgressOnRedCrossRoute = state.medical.ambulanceProgress
  state = commandWorkbenchReducer(state, { type: 'medical/acknowledge' })
  assert.equal(state.medical.phase, 'acknowledged')
  assert.deepEqual(state.medical.previousTask, { version: 1, status: 'replaced' })
  assert.equal(
    state.medical.ambulanceProgress,
    previewProgressOnRedCrossRoute,
    'acknowledgement does not move an ambulance already placed on the replacement route',
  )
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
