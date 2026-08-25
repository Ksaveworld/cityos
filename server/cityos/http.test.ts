import assert from 'node:assert/strict'
import test from 'node:test'

import { handleCityosRequest } from './http.ts'
import type { MedicalService } from './types.ts'

function fakeService(overrides: Partial<MedicalService> = {}): MedicalService {
  return {
    ingestAdapterEvent: async (input, context) => ({ input, context }),
    getIncident: async (incidentId) => ({ id: incidentId }),
    getContext: async (incidentId) => ({ incident: { id: incidentId }, facilities: [] }),
    getPlans: async () => ({ items: [] }),
    getTaskPackages: async () => ({ items: [] }),
    getDecisionLineage: async () => ({ items: [] }),
    ...overrides,
  }
}

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

test('GET reads an incident through the service and returns a trace id', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/incidents/incident-1'),
    {},
    { service: fakeService(), randomId: () => 'trace-read' },
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-trace-id'), 'trace-read')
  assert.deepEqual(await response.json(), { id: 'incident-1' })
})

test('Vercel rewrite path is resolved without changing the public contract', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/api/cityos?path=incidents%2Fincident-1%2Fplans'),
    {},
    { service: fakeService(), randomId: () => 'trace-rewrite' },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { items: [] })
})

test('POST rejects writes in degraded mode before calling the service', async () => {
  let called = false
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/adapter-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'adapter-event-1',
        'X-Actor-Id': 'operator-1',
        'X-Data-Mode': 'live-degraded',
      },
      body: JSON.stringify({ ...validEvent, mode: 'live-degraded' }),
    }),
    {},
    {
      service: fakeService({ ingestAdapterEvent: async () => { called = true } }),
      randomId: () => 'trace-degraded',
    },
  )
  const payload = await response.json() as { error: { code: string } }
  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'DEGRADED_MODE_READ_ONLY')
  assert.equal(called, false)
})

test('POST requires actor, idempotency and mode headers', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/adapter-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-missing-context' },
  )
  const payload = await response.json() as { error: { code: string } }
  assert.equal(response.status, 400)
  assert.equal(payload.error.code, 'INVALID_DATA_MODE')
})

test('POST accepts a valid adapter event and keeps the write context server-controlled', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/adapter-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'adapter-event-1',
        'X-Actor-Id': 'medical-adapter',
        'X-Data-Mode': 'demo',
      },
      body: JSON.stringify(validEvent),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-write' },
  )
  const payload = await response.json() as { context: { actorId: string; traceId: string } }
  assert.equal(response.status, 202)
  assert.equal(payload.context.actorId, 'medical-adapter')
  assert.equal(payload.context.traceId, 'trace-write')
})

test('unconfigured database fails explicitly instead of pretending success', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/incidents/incident-1'),
    {},
    { randomId: () => 'trace-no-db' },
  )
  const payload = await response.json() as { error: { code: string; retryable: boolean } }
  assert.equal(response.status, 503)
  assert.equal(payload.error.code, 'DATABASE_NOT_CONFIGURED')
  assert.equal(payload.error.retryable, true)
})
