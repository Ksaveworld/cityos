import assert from 'node:assert/strict'
import test from 'node:test'

import { CURRENT_POLICE_FIXTURE, DOMAIN_FIXTURES } from '../workflow/fixtures.ts'
import { createWorkflowSession } from '../workflow/state.ts'
import type { DomainFixture, TaskAssignment, WorkflowSession } from '../workflow/types.ts'
import { resolveDispatchException, type ActiveDispatchEvent } from './activeEventDispatchModel.ts'
import { createDispatchDemoReply } from './dispatchDemoConversation.ts'

function completedSession(fixture: DomainFixture): WorkflowSession {
  const session = createWorkflowSession(fixture)
  return {
    ...session,
    stage: 'review',
    approvedPlanId: fixture.plans[0].id,
    approvedVersion: session.planVersion,
    deliveryStatus: 'completed',
  }
}

function dailyEvent(id: string, fixture: DomainFixture): ActiveDispatchEvent {
  return {
    id,
    kind: 'daily',
    domain: fixture.label,
    domainColor: '#5B5BD6',
    title: fixture.title,
    location: fixture.address,
    timeLabel: '14:00',
    sourceLabel: '演示事件',
    fixture,
    session: completedSession(fixture),
  }
}

function assignment(department: string): TaskAssignment {
  return {
    department,
    owner: '演示负责人',
    task: '异常资源调整',
    location: '演示点位',
    window: '人工确认后启动',
    personnel: '模拟',
    vehicles: '模拟',
    feedback: '回传签收与异常',
    contact: '演示任务包',
    eta: '演示估算',
  }
}

function replyFor(event: ActiveDispatchEvent, assignments: TaskAssignment[], question: string) {
  const exception = resolveDispatchException(event, assignments)
  assert.ok(exception)
  const reply = createDispatchDemoReply({
    event,
    exception,
    question,
    requestId: 'test-request',
    contextVersion: 'test-context',
    intentTag: 'resource_compare',
  })
  assert.ok(reply)
  return JSON.stringify(reply.response.answer)
}

test('110 chatbot mirrors the approval flow without copying hospital fields', () => {
  const event = dailyEvent('ev-police-station-delay', CURRENT_POLICE_FIXTURE)
  const answer = replyFor(event, [assignment('站区外围疏导')], '分析环市西路外围协同组的影响')

  assert.match(answer, /环市西路外围协同组/)
  assert.match(answer, /人工确认/)
  assert.match(answer, /不会直接下发|不会自动下发/)
  assert.doesNotMatch(answer, /医院|医疗协同负责人|候选医院 ETA|原接收安排/)
})

test('major deployment chatbot keeps岗位、分区 and task-version language', () => {
  const event = dailyEvent('ev-major-tianhe', DOMAIN_FIXTURES.major)
  const answer = replyFor(event, [assignment('重大布防保障')], '比较两个候选补位单元')

  assert.match(answer, /重点分区|候选保障单元/)
  assert.match(answer, /新任务包/)
  assert.match(answer, /人工确认/)
  assert.doesNotMatch(answer, /医院|床位|医疗协同|接收或签收/)
})

test('fire chatbot keeps its existing hospital-receiving language', () => {
  const event = dailyEvent('ev-fire-finance', DOMAIN_FIXTURES.fire)
  const answer = replyFor(event, [assignment('医疗保障')], '分析广州市红十字会医院')
  assert.match(answer, /医院接收回传/)
  assert.match(answer, /人工确认/)
})

test('linked scenario language does not leak into unrelated dispatch replies', () => {
  const event = dailyEvent('ev-traffic-unlinked', DOMAIN_FIXTURES.traffic)
  const answer = replyFor(event, [assignment('交通协同')], '分析候选调整')

  assert.doesNotMatch(answer, /重点分区补位|候选保障单元|现场总协调/)
})
