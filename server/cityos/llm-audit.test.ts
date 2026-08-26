import assert from 'node:assert/strict'
import test from 'node:test'

import { fingerprintLlmPrompt, normalizeTokenUsage } from './llm-audit.ts'

test('prompt fingerprint is stable but changes with message content', () => {
  const first = fingerprintLlmPrompt([{ role: 'user', content: '甲' }], [])
  const same = fingerprintLlmPrompt([{ role: 'user', content: '甲' }], [])
  const changed = fingerprintLlmPrompt([{ role: 'user', content: '乙' }], [])
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.equal(first, same)
  assert.notEqual(first, changed)
  assert.doesNotMatch(first, /甲/)
})

test('token usage accepts non-negative integers and derives total', () => {
  assert.deepEqual(normalizeTokenUsage({ prompt_tokens: 10, completion_tokens: 4 }), {
    promptTokens: 10,
    completionTokens: 4,
    totalTokens: 14,
  })
  assert.deepEqual(normalizeTokenUsage({ prompt_tokens: -1, total_tokens: '14' }), {
    promptTokens: undefined,
    completionTokens: undefined,
    totalTokens: undefined,
  })
})
