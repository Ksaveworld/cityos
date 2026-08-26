import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAPABILITIES,
  capabilitiesForRoles,
  extractCredential,
  hashPassword,
  verifyPassword,
} from './auth.ts'

test('password uses a salted scrypt hash and rejects the wrong password', async () => {
  const first = await hashPassword('CityOS-strong-password-2026')
  const second = await hashPassword('CityOS-strong-password-2026')
  assert.match(first, /^scrypt\$/)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('CityOS-strong-password-2026', first), true)
  assert.equal(await verifyPassword('CityOS-wrong-password', first), false)
})

test('role capabilities keep preview, confirmation and adapter writes separated', () => {
  assert.deepEqual(capabilitiesForRoles(['viewer']), [CAPABILITIES.incidentRead])
  assert.equal(capabilitiesForRoles(['operator']).includes(CAPABILITIES.adjustResourcesConfirm), false)
  assert.equal(capabilitiesForRoles(['supervisor']).includes(CAPABILITIES.adjustResourcesConfirm), true)
  assert.deepEqual(capabilitiesForRoles(['system_adapter']), [
    CAPABILITIES.adapterEventWrite,
    CAPABILITIES.taskFeedbackWrite,
  ])
})

test('API key takes precedence over bearer credentials', () => {
  const request = new Request('http://localhost/v1/auth/me', {
    headers: { 'X-Api-Key': 'service-key', Authorization: 'Bearer session-token' },
  })
  assert.equal(extractCredential(request), 'service-key')
})
