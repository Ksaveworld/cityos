import assert from 'node:assert/strict'
import test from 'node:test'

import { CURRENT_POLICE_FIXTURE, DOMAIN_FIXTURES } from '../workflow/fixtures.ts'
import { applyTaskDispatchOverride, createWorkflowSession, sendSimulatedTasks } from '../workflow/state.ts'
import type { DomainFixture, TaskAssignment, WorkflowSession } from '../workflow/types.ts'
import {
  resolveDispatchException,
  type ActiveDispatchEvent,
} from './activeEventDispatchModel.ts'

function completedSession(fixture: DomainFixture): WorkflowSession {
  const session = createWorkflowSession(fixture)
  return {
    ...session,
    stage: 'review',
    selectedPlanId: fixture.plans[0].id,
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

test('110 and major exceptions reuse the map-linked candidate IDs and estimates', () => {
  const policeEvent = dailyEvent('ev-police-station-delay', CURRENT_POLICE_FIXTURE)
  const policeException = resolveDispatchException(policeEvent, [assignment('站区外围疏导')])
  assert.deepEqual(policeException?.options.map((option) => option.optionId), [
    'police-west-square',
    'police-huanshi-west',
  ])
  assert.match(policeException?.options[0].note ?? '', /6\.4 分钟（演示估算）/)

  const majorEvent = dailyEvent('ev-major-tianhe', DOMAIN_FIXTURES.major)
  const majorException = resolveDispatchException(majorEvent, [assignment('重大布防保障')])
  assert.deepEqual(majorException?.options.map((option) => option.optionId), [
    'major-tianhe-support',
    'major-haizhu-mobile',
  ])
  assert.match(majorException?.options[1].note ?? '', /12\.0 分钟（演示估算）/)
})

test('human confirmation creates a pending version and simulated issue stays separate', () => {
  const event = dailyEvent('ev-police-station-delay', CURRENT_POLICE_FIXTURE)
  const exception = resolveDispatchException(event, [assignment('站区外围疏导')])
  const selected = exception?.options[0]
  assert.ok(selected)

  const confirmed = applyTaskDispatchOverride(event.session, selected)
  assert.equal(confirmed.planVersion, event.session.planVersion + 1)
  assert.equal(confirmed.approvedVersion, confirmed.planVersion)
  assert.equal(confirmed.deliveryStatus, 'pending-send')
  assert.equal(confirmed.stage, 'task')

  const issued = sendSimulatedTasks(confirmed)
  assert.equal(issued.deliveryStatus, 'delivered')
  assert.equal(issued.stage, 'execution')
})

test('fire daily exception remains the two selectable hospital options', () => {
  const fireEvent = dailyEvent('ev-fire-finance', DOMAIN_FIXTURES.fire)
  const exception = resolveDispatchException(fireEvent, [assignment('医疗保障')])
  assert.deepEqual(exception?.options.map((option) => option.optionId), [
    'hospital-red-cross',
    'hospital-shiyi',
  ])
})
