import assert from 'node:assert/strict'
import test from 'node:test'

import { handleCityosRequest } from './http.ts'
import type { MedicalService, WorkflowReportService } from './types.ts'

/**
 * 这些桩只回显入参，用来验路由、请求头和状态码，不构造完整响应。
 * 真实响应形状由 db:smoke 对着真库断言。
 */
function stub<T>(value: unknown): T {
  return value as T
}

function fakeService(overrides: Partial<MedicalService> = {}): MedicalService {
  return {
    ingestAdapterEvent: async (input, context) => stub({ input, context }),
    previewAdjustResources: async (input, context) => stub({ input, context }),
    confirmActionRun: async (actionRunId, input, context) => stub({ actionRunId, input, context }),
    executeActionRun: async (actionRunId, input, context) => stub({ actionRunId, input, context }),
    recordTaskFeedback: async (taskPackageId, input, context) => stub({ taskPackageId, input, context }),
    getIncident: async (incidentId) => stub({ id: incidentId }),
    getContext: async (incidentId) => stub({ incident: { id: incidentId }, facilities: [] }),
    getActionRun: async (actionRunId) => stub({ actionRunId, status: 'queued' }),
    getBoard: async (incidentId) => stub({ incident: { id: incidentId }, units: [], routes: [] }),
    getPlans: async () => ({ items: [] }),
    getTaskPackages: async () => ({ items: [] }),
    getDecisionLineage: async () => ({ items: [] }),
    ...overrides,
  }
}

function fakeWorkflowReportService(overrides: Partial<WorkflowReportService> = {}): WorkflowReportService {
  return {
    getReport: async (scenarioId) => stub({
      scenarioId,
      version: 1,
      reportDraft: null,
      storageState: 'fixture-baseline',
      duplicate: false,
    }),
    saveReport: async (scenarioId, input, context) => stub({ scenarioId, input, context, version: 2 }),
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
      service: fakeService({
        ingestAdapterEvent: async () => {
          called = true
          throw new Error('降级模式不应该走到服务层')
        },
      }),
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

test('action preview binds the selected facility and write context', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/actions/adjust_resources/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'preview-1',
        'X-Actor-Id': 'operator-1',
        'X-Data-Mode': 'demo',
      },
      body: JSON.stringify({
        incidentId: 'incident-1',
        planVersion: 2,
        expectedIncidentVersion: 2,
        previousFacilityId: 'facility-old',
        candidateFacilityIds: ['facility-a', 'facility-b'],
        selectedFacilityId: 'facility-b',
      }),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-preview' },
  )
  const payload = await response.json() as {
    input: { selectedFacilityId: string }
    context: { actorId: string }
  }
  assert.equal(response.status, 201)
  assert.equal(payload.input.selectedFacilityId, 'facility-b')
  assert.equal(payload.context.actorId, 'operator-1')
})

test('confirm and execute use separate explicit expected-state contracts', async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': 'action-step-1',
    'X-Actor-Id': 'operator-1',
    'X-Data-Mode': 'demo',
  }
  const confirm = await handleCityosRequest(
    new Request('http://localhost/v1/action-runs/action-1/confirm', {
      method: 'POST', headers, body: JSON.stringify({ previewHash: 'hash-1', expectedPlanVersion: 2 }),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-confirm' },
  )
  const execute = await handleCityosRequest(
    new Request('http://localhost/v1/action-runs/action-1/execute', {
      method: 'POST', headers, body: JSON.stringify({ expectedStatus: 'confirmed' }),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-execute' },
  )
  assert.equal(confirm.status, 200)
  // 202 表示已受理并进入待发送，不表示已送达。
  assert.equal(execute.status, 202)
  assert.equal((await confirm.json() as { input: { expectedPlanVersion: number } }).input.expectedPlanVersion, 2)
  assert.equal((await execute.json() as { input: { expectedStatus: string } }).input.expectedStatus, 'confirmed')
})

test('task feedback requires the caller expected current status', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/tasks/task-1/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'feedback-1',
        'X-Actor-Id': 'medical-simulator',
        'X-Data-Mode': 'demo',
      },
      body: JSON.stringify({
        externalFeedbackId: 'external-feedback-1',
        status: 'accepted',
        expectedCurrentStatus: 'issued',
        occurredAt: 1787616000,
        receivedAt: 1787616001,
      }),
    }),
    {},
    { service: fakeService(), randomId: () => 'trace-feedback' },
  )
  const payload = await response.json() as { input: { expectedCurrentStatus: string } }
  assert.equal(response.status, 201)
  assert.equal(payload.input.expectedCurrentStatus, 'issued')
})

test('workflow report GET returns an explicit fixture baseline', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/workflow-scenarios/yuexiu-medical/report'),
    {},
    {
      service: fakeService(),
      workflowReportService: fakeWorkflowReportService(),
      randomId: () => 'trace-workflow-read',
    },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    scenarioId: 'yuexiu-medical',
    version: 1,
    reportDraft: null,
    storageState: 'fixture-baseline',
    duplicate: false,
  })
})

test('workflow report POST persists a demo draft without approving or executing', async () => {
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/workflow-scenarios/yuexiu-medical/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workflow-report-1',
        'X-Actor-Id': 'operator-1',
        'X-Data-Mode': 'demo',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        reportDraft: {
          selectedPlanId: 'plan-b',
          resourceCount: 4,
          fireOptionId: 'fire-standard',
          medicalOptionId: 'medical-red-cross',
          trafficOptionId: 'traffic-green-wave',
          decisionNote: '待人工确认。',
        },
      }),
    }),
    {},
    {
      service: fakeService(),
      workflowReportService: fakeWorkflowReportService(),
      randomId: () => 'trace-workflow-write',
    },
  )
  const payload = await response.json() as {
    input: { expectedVersion: number }
    context: { actorId: string; mode: string }
  }
  assert.equal(response.status, 201)
  assert.equal(payload.input.expectedVersion, 1)
  assert.equal(payload.context.actorId, 'operator-1')
  assert.equal(payload.context.mode, 'demo')
})

test('workflow report POST rejects non-demo writes before the service runs', async () => {
  let called = false
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/workflow-scenarios/yuexiu-medical/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'workflow-report-live',
        'X-Actor-Id': 'operator-1',
        'X-Data-Mode': 'live',
      },
      body: JSON.stringify({
        expectedVersion: 1,
        reportDraft: {
          selectedPlanId: 'plan-a', resourceCount: 4,
          fireOptionId: 'fire-standard', medicalOptionId: 'medical-standard',
          trafficOptionId: 'traffic-standard', decisionNote: '',
        },
      }),
    }),
    {},
    {
      service: fakeService(),
      workflowReportService: fakeWorkflowReportService({
        saveReport: async () => {
          called = true
          return stub({})
        },
      }),
      randomId: () => 'trace-workflow-live',
    },
  )
  const payload = await response.json() as { error: { code: string } }
  assert.equal(response.status, 409)
  assert.equal(payload.error.code, 'WORKFLOW_REPORT_DEMO_ONLY')
  assert.equal(called, false)
})
