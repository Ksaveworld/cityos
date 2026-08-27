import assert from 'node:assert/strict'
import test from 'node:test'

import { createCityosApiClient, supportsWorkflowReportPersistence } from './cityosApi.ts'

test('online report persistence is limited to the six frozen daily scenarios', () => {
  assert.equal(supportsWorkflowReportPersistence('yuexiu-medical'), true)
  assert.equal(supportsWorkflowReportPersistence('historical-haizhu-police'), false)
})

test('workflow report client uses the versioned route and explicit write context', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = []
  const client = createCityosApiClient({
    baseUrl: 'https://cityos.example',
    fetcher: async (input, init) => {
      calls.push({ input: String(input), init })
      return new Response(JSON.stringify({
        scenarioId: 'yuexiu-medical',
        version: 2,
        reportDraft: null,
        storageState: 'persisted',
        duplicate: false,
      }), { status: 201, headers: { 'Content-Type': 'application/json' } })
    },
  })

  await client.saveWorkflowReport('yuexiu-medical', {
    expectedVersion: 1,
    reportDraft: {
      selectedPlanId: 'plan-b',
      resourceCount: 4,
      fireOptionId: 'fire-standard',
      medicalOptionId: 'medical-red-cross',
      trafficOptionId: 'traffic-green-wave',
      decisionNote: '待人工批准。',
    },
  }, {
    actorId: 'demo-workflow-operator',
    idempotencyKey: 'workflow-report:test',
    mode: 'demo',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].input, 'https://cityos.example/v1/workflow-scenarios/yuexiu-medical/report')
  assert.equal(calls[0].init?.method, 'POST')
  const headers = new Headers(calls[0].init?.headers)
  assert.equal(headers.get('Idempotency-Key'), 'workflow-report:test')
  assert.equal(headers.get('X-Actor-Id'), 'demo-workflow-operator')
  assert.equal(headers.get('X-Data-Mode'), 'demo')
})
