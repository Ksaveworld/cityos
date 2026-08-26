import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAPABILITIES,
  capabilitiesForRoles,
  type AuthRole,
  type AuthService,
  type Principal,
} from './auth.ts'
import { handleCityosRequest } from './http.ts'
import type { MedicalService } from './types.ts'

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

function testPrincipal(role: AuthRole, actorId = `${role}@cityos.local`): Principal {
  return {
    kind: role === 'system_adapter' ? 'api_key' : 'user',
    principalId: `${role}-principal`,
    actorId,
    name: role,
    roles: [role],
    capabilities: capabilitiesForRoles([role]),
  }
}

function fakeAuthService(principals: Record<string, Principal> = {}) {
  const revoked: string[] = []
  const service: AuthService = {
    authenticate: async (credential) => principals[credential] ?? null,
    login: async ({ email }) => ({
      accessToken: 'session-token',
      tokenType: 'Bearer',
      expiresAt: 1787702400,
      principal: testPrincipal('viewer', email),
    }),
    revoke: async (credential) => { revoked.push(credential) },
  }
  return { service, revoked }
}

const validEvent = {
  eventId: 'event-auth-1',
  eventType: 'facility.status.changed',
  mode: 'demo',
  incidentId: 'incident-1',
  facilityId: 'facility-1',
  status: 'temporarily_unavailable',
  reasonCode: 'source_reported_unavailable',
  aggregateVersion: 2,
  idempotencyKey: 'adapter-auth-event',
  source: {
    sourceSystem: 'medical-adapter',
    externalEventId: 'external-auth-1',
    schemaVersion: 'medical-p0-v1',
    sourceSequence: 2,
    occurredAt: 1787616000,
    receivedAt: 1787616002,
    confidence: 'reported',
  },
}

test('required auth rejects an anonymous read before the service runs', async () => {
  let called = false
  const auth = fakeAuthService()
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/incidents/incident-1'),
    { CITYOS_AUTH_MODE: 'required' },
    {
      service: fakeService({
        getIncident: async () => {
          called = true
          return stub({})
        },
      }),
      authService: auth.service,
      randomId: () => 'trace-auth-required',
    },
  )
  const payload = await response.json() as { error: { code: string } }
  assert.equal(response.status, 401)
  assert.equal(payload.error.code, 'AUTH_REQUIRED')
  assert.equal(called, false)
})

test('viewer can read but cannot preview an action', async () => {
  const auth = fakeAuthService({ viewer: testPrincipal('viewer') })
  const read = await handleCityosRequest(
    new Request('http://localhost/v1/incidents/incident-1', {
      headers: { Authorization: 'Bearer viewer' },
    }),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-viewer-read' },
  )
  const preview = await handleCityosRequest(
    new Request('http://localhost/v1/actions/adjust_resources/preview', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer viewer',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'viewer-preview',
        'X-Actor-Id': 'spoofed-actor',
        'X-Data-Mode': 'demo',
      },
      body: JSON.stringify({}),
    }),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-viewer-preview' },
  )
  const payload = await preview.json() as { error: { code: string; message: string } }
  assert.equal(read.status, 200)
  assert.equal(preview.status, 403)
  assert.equal(payload.error.code, 'FORBIDDEN')
  assert.match(payload.error.message, new RegExp(CAPABILITIES.adjustResourcesPreview))
})

test('authenticated operator actor overrides a forged X-Actor-Id', async () => {
  const auth = fakeAuthService({ operator: testPrincipal('operator', 'operator-jensen') })
  const response = await handleCityosRequest(
    new Request('http://localhost/v1/actions/adjust_resources/preview', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer operator',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'operator-preview',
        'X-Actor-Id': 'forged-admin',
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
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-actor-binding' },
  )
  const payload = await response.json() as { context: { actorId: string } }
  assert.equal(response.status, 201)
  assert.equal(payload.context.actorId, 'operator-jensen')
})

test('only supervisor can confirm the high-risk resource action', async () => {
  const auth = fakeAuthService({
    operator: testPrincipal('operator'),
    supervisor: testPrincipal('supervisor', 'supervisor-jensen'),
  })
  const request = (token: string) => new Request('http://localhost/v1/action-runs/action-1/confirm', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `confirm-${token}`,
      'X-Actor-Id': 'forged-supervisor',
      'X-Data-Mode': 'demo',
    },
    body: JSON.stringify({ previewHash: 'hash-1', expectedPlanVersion: 2 }),
  })
  const operator = await handleCityosRequest(
    request('operator'),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-operator-confirm' },
  )
  const supervisor = await handleCityosRequest(
    request('supervisor'),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-supervisor-confirm' },
  )
  assert.equal(operator.status, 403)
  assert.equal(supervisor.status, 200)
  assert.equal((await supervisor.json() as { context: { actorId: string } }).context.actorId, 'supervisor-jensen')
})

test('system adapter can ingest facts but cannot preview a human action', async () => {
  const auth = fakeAuthService({ adapter: testPrincipal('system_adapter', 'medical-adapter-prod') })
  const headers = {
    Authorization: 'Bearer adapter',
    'Content-Type': 'application/json',
    'Idempotency-Key': 'adapter-auth-event',
    'X-Actor-Id': 'forged-operator',
    'X-Data-Mode': 'demo',
  }
  const ingest = await handleCityosRequest(
    new Request('http://localhost/v1/adapter-events', {
      method: 'POST', headers, body: JSON.stringify(validEvent),
    }),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-adapter-ingest' },
  )
  const preview = await handleCityosRequest(
    new Request('http://localhost/v1/actions/adjust_resources/preview', {
      method: 'POST', headers, body: JSON.stringify({}),
    }),
    { CITYOS_AUTH_MODE: 'required' },
    { service: fakeService(), authService: auth.service, randomId: () => 'trace-adapter-preview' },
  )
  assert.equal(ingest.status, 202)
  assert.equal((await ingest.json() as { context: { actorId: string } }).context.actorId, 'medical-adapter-prod')
  assert.equal(preview.status, 403)
})

test('login, me and logout use the auth service without exposing password data', async () => {
  const auth = fakeAuthService({ 'session-token': testPrincipal('viewer', 'viewer@cityos.local') })
  const dependencies = { authService: auth.service, service: fakeService(), randomId: () => 'trace-auth-route' }
  const login = await handleCityosRequest(
    new Request('http://localhost/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VIEWER@cityos.local', password: 'not-returned' }),
    }),
    { CITYOS_AUTH_MODE: 'required' },
    dependencies,
  )
  const me = await handleCityosRequest(
    new Request('http://localhost/v1/auth/me', { headers: { Authorization: 'Bearer session-token' } }),
    { CITYOS_AUTH_MODE: 'required' },
    dependencies,
  )
  const logout = await handleCityosRequest(
    new Request('http://localhost/v1/auth/logout', {
      method: 'POST', headers: { Authorization: 'Bearer session-token' },
    }),
    { CITYOS_AUTH_MODE: 'required' },
    dependencies,
  )
  const loginPayload = await login.json() as Record<string, unknown>
  assert.equal(login.status, 200)
  assert.equal(loginPayload.accessToken, 'session-token')
  assert.equal('password' in loginPayload, false)
  assert.equal(me.status, 200)
  assert.equal(logout.status, 200)
  assert.deepEqual(auth.revoked, ['session-token'])
})

test('only supervisor can read bounded LLM audit metadata', async () => {
  const auth = fakeAuthService({
    viewer: testPrincipal('viewer'),
    supervisor: testPrincipal('supervisor'),
  })
  const readLimits: number[] = []
  const dependencies = {
    authService: auth.service,
    service: fakeService(),
    llmAuditReader: async (limit: number) => {
      readLimits.push(limit)
      return { items: [{ requestId: 'request-1', promptSha256: 'a'.repeat(64) }] as never[] }
    },
    randomId: () => 'trace-llm-audit',
  }
  const viewer = await handleCityosRequest(
    new Request('http://localhost/v1/ops/llm-calls?limit=10', {
      headers: { Authorization: 'Bearer viewer' },
    }),
    { CITYOS_AUTH_MODE: 'required' },
    dependencies,
  )
  const supervisor = await handleCityosRequest(
    new Request('http://localhost/v1/ops/llm-calls?limit=10', {
      headers: { Authorization: 'Bearer supervisor' },
    }),
    { CITYOS_AUTH_MODE: 'required' },
    dependencies,
  )
  const anonymous = await handleCityosRequest(
    new Request('http://localhost/v1/ops/llm-calls'),
    { CITYOS_AUTH_MODE: 'optional' },
    dependencies,
  )
  assert.equal(viewer.status, 403)
  assert.equal(supervisor.status, 200)
  assert.equal(anonymous.status, 401)
  assert.deepEqual(readLimits, [10])
})
