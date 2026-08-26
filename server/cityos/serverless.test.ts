import assert from 'node:assert/strict'
import test from 'node:test'

import { createCityosServerlessHandler } from './serverless.ts'

test('accepted execute schedules one bounded drain without delaying the response', async () => {
  let releaseDrain: (() => void) | undefined
  const drainFinished = new Promise<void>((resolve) => {
    releaseDrain = resolve
  })
  const scheduled: Promise<unknown>[] = []

  const fetch = createCityosServerlessHandler({
    env: {},
    handleRequest: async () => new Response(JSON.stringify({ status: 'queued' }), { status: 202 }),
    drainOutbox: async () => drainFinished,
    waitUntil: (task) => scheduled.push(task),
    onDrainError: () => assert.fail('drain should not fail'),
  })

  const executeUrls = [
    'https://cityos.example/v1/action-runs/action-1/execute',
    'https://cityos.example/api/cityos?path=action-runs%2Faction-1%2Fexecute',
  ]
  for (const url of executeUrls) {
    const response = await fetch(new Request(url, { method: 'POST' }))
    assert.equal(response.status, 202)
  }
  assert.equal(scheduled.length, 2)

  releaseDrain?.()
  await Promise.all(scheduled)
})

test('non-execute requests and rejected execute responses never schedule a drain', async () => {
  let responseStatus = 200
  const scheduled: Promise<unknown>[] = []
  const fetch = createCityosServerlessHandler({
    env: {},
    handleRequest: async () => new Response(null, { status: responseStatus }),
    drainOutbox: async () => assert.fail('drain should not run'),
    waitUntil: (task) => scheduled.push(task),
    onDrainError: () => assert.fail('drain should not fail'),
  })

  await fetch(new Request('https://cityos.example/v1/incidents/incident-1/board'))
  responseStatus = 409
  await fetch(new Request('https://cityos.example/v1/action-runs/action-1/execute', { method: 'POST' }))

  assert.equal(scheduled.length, 0)
})
