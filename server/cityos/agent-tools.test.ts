import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CITYOS_READ_TOOL_DEFINITIONS,
  createCityosReadToolRuntime,
  type CityosReadToolName,
} from './agent-tools.ts'
import type { BoardResponse, ContextResponse, DecisionLineageEntry, MedicalService } from './types.ts'

function readService(): Pick<MedicalService, 'getContext' | 'getBoard' | 'getDecisionLineage'> {
  const incident = {
    id: 'incident-1',
    mode: 'demo' as const,
    title: '医疗联动事件',
    status: 'active',
    currentVersion: 3,
    currentPlanVersion: 2,
    payload: {},
    createdAt: 1,
    updatedAt: 2,
  }
  return {
    getContext: async (): Promise<ContextResponse> => ({ incident, facilities: [] }),
    getBoard: async (): Promise<BoardResponse> => ({
      incident,
      planVersion: null,
      units: [],
      facilities: [],
      routes: [],
      actionRuns: [],
      taskPackages: [],
      generatedAt: 3,
    }),
    getDecisionLineage: async (): Promise<{ items: DecisionLineageEntry[] }> => ({ items: [] }),
  }
}

test('CityOS Agent registry exposes exactly three read-only tools', () => {
  const names = CITYOS_READ_TOOL_DEFINITIONS.map((tool) => tool.function.name)
  assert.deepEqual(names, [
    'get_incident_context',
    'get_dispatch_board',
    'get_decision_lineage',
  ])
  assert.equal(names.some((name) => /preview|confirm|execute/i.test(name)), false)
  assert.equal(CITYOS_READ_TOOL_DEFINITIONS.every((tool) => tool.function.parameters.additionalProperties === false), true)
})

test('read tool runtime scopes every query to the server-owned incident and records the call', async () => {
  const service = readService()
  const reads: string[] = []
  const records: Array<{ toolName: CityosReadToolName; ok: boolean }> = []
  const runtime = createCityosReadToolRuntime({
    incidentId: 'incident-1',
    service: {
      ...service,
      getBoard: async (incidentId) => {
        reads.push(incidentId)
        return service.getBoard(incidentId)
      },
    },
    recordCall: async (record) => {
      records.push({ toolName: record.toolName, ok: record.ok })
    },
  })

  const result = await runtime.invoke('get_dispatch_board', {
    requestId: 'request-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
  })

  assert.deepEqual(reads, ['incident-1'])
  assert.equal(result.incidentId, 'incident-1')
  assert.equal(result.facts.some((fact) => fact.id === 'tool:board:incident-1:plan'), true)
  assert.deepEqual(records, [{ toolName: 'get_dispatch_board', ok: true }])
  await assert.rejects(
    runtime.invoke('execute_action' as CityosReadToolName, {
      requestId: 'request-2', conversationId: 'conversation-1', messageId: 'message-2',
    }),
    /未注册只读工具/,
  )
})
