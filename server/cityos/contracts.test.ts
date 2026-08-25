import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseAdjustResourcesPreview,
  parseExecuteActionRun,
  parseFacilityStatusChanged,
  parseMode,
  parseTaskFeedback,
} from './contracts.ts'
import { CityosApiError } from './errors.ts'

const validEvent = {
  eventId: 'event-1',
  eventType: 'facility.status.changed',
  mode: 'demo',
  incidentId: 'incident-1',
  facilityId: 'facility-1',
  status: 'temporarily_unavailable',
  reasonCode: 'source_reported_unavailable',
  aggregateVersion: 2,
  idempotencyKey: 'adapter-event-1',
  source: {
    sourceSystem: 'medical-adapter',
    externalEventId: 'external-1',
    schemaVersion: 'medical-p0-v1',
    sourceSequence: 2,
    occurredAt: 1787616000,
    receivedAt: 1787616002,
    confidence: 'reported',
  },
}

test('adapter event parser accepts the frozen medical P0 event', () => {
  assert.deepEqual(parseFacilityStatusChanged(validEvent), validEvent)
})

test('adapter event parser rejects an unsupported event type', () => {
  assert.throws(
    () => parseFacilityStatusChanged({ ...validEvent, eventType: 'facility.created' }),
    (error: unknown) => error instanceof CityosApiError && error.code === 'UNSUPPORTED_EVENT_TYPE',
  )
})

test('data mode parser requires an explicit supported mode', () => {
  assert.equal(parseMode('live-degraded'), 'live-degraded')
  assert.throws(
    () => parseMode(null),
    (error: unknown) => error instanceof CityosApiError && error.code === 'INVALID_DATA_MODE',
  )
})

test('action preview parser requires a unique non-empty candidate set', () => {
  assert.deepEqual(parseAdjustResourcesPreview({
    incidentId: 'incident-1',
    planVersion: 2,
    expectedIncidentVersion: 2,
    previousFacilityId: 'facility-old',
    candidateFacilityIds: ['facility-a', 'facility-b'],
    selectedFacilityId: 'facility-b',
  }).candidateFacilityIds, ['facility-a', 'facility-b'])
  assert.throws(
    () => parseAdjustResourcesPreview({
      incidentId: 'incident-1',
      planVersion: 2,
      expectedIncidentVersion: 2,
      previousFacilityId: 'facility-old',
      candidateFacilityIds: ['facility-a', 'facility-a'],
      selectedFacilityId: 'facility-a',
    }),
    (error: unknown) => error instanceof CityosApiError && error.code === 'INVALID_REQUEST',
  )
})

test('execute and feedback parsers enforce expected state', () => {
  assert.deepEqual(parseExecuteActionRun({ expectedStatus: 'confirmed' }), { expectedStatus: 'confirmed' })
  assert.equal(parseTaskFeedback({
    externalFeedbackId: 'feedback-1',
    status: 'accepted',
    expectedCurrentStatus: 'issued',
    occurredAt: 1787616000,
    receivedAt: 1787616001,
  }).expectedCurrentStatus, 'issued')
  assert.throws(
    () => parseExecuteActionRun({ expectedStatus: 'previewed' }),
    (error: unknown) => error instanceof CityosApiError && error.code === 'INVALID_REQUEST',
  )
})
