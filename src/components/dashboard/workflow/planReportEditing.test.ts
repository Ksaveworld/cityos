import assert from 'node:assert/strict'
import test from 'node:test'

import { WORKFLOW_FIXTURES } from './fixtures.ts'
import {
  applyPlanReportEdits,
  approveWorkflow,
  createWorkflowSession,
  hydrateWorkflowReportVersion,
  recalculateMetrics,
  sendSimulatedTasks,
} from './state.ts'

test('all workflow fixtures apply one report draft atomically and invalidate the old approval', () => {
  for (const fixture of WORKFLOW_FIXTURES) {
    const initial = createWorkflowSession(fixture)
    const approved = approveWorkflow(initial)
    const targetPlan = fixture.plans.find((plan) => plan.id !== initial.selectedPlanId) ?? fixture.plans[0]
    const resourceCount = initial.resourceCount < fixture.maxResources
      ? initial.resourceCount + 1
      : initial.resourceCount - 1
    const fireOptionId = fixture.fireDispatch.options.find((option) => option.id !== initial.fireOptionId)?.id ?? initial.fireOptionId
    const medicalOptionId = fixture.medicalDispatch.options.find((option) => option.id !== initial.medicalOptionId)?.id ?? initial.medicalOptionId
    const trafficOptionId = fixture.trafficDispatch.options.find((option) => option.id !== initial.trafficOptionId)?.id ?? initial.trafficOptionId
    const expectedMetrics = recalculateMetrics(fixture, resourceCount, fireOptionId, medicalOptionId, trafficOptionId)

    const edited = applyPlanReportEdits(fixture, approved, {
      selectedPlanId: targetPlan.id,
      resourceCount,
      fireOptionId,
      medicalOptionId,
      trafficOptionId,
      decisionNote: ' 报告内结构化调整 ',
    })

    assert.equal(edited.planVersion, approved.planVersion + 1, fixture.scenarioId)
    assert.equal(edited.selectedPlanId, targetPlan.id, fixture.scenarioId)
    assert.equal(edited.resourceCount, resourceCount, fixture.scenarioId)
    assert.equal(edited.fireOptionId, fireOptionId, fixture.scenarioId)
    assert.equal(edited.medicalOptionId, medicalOptionId, fixture.scenarioId)
    assert.equal(edited.trafficOptionId, trafficOptionId, fixture.scenarioId)
    assert.equal(edited.decisionNote, '报告内结构化调整', fixture.scenarioId)
    assert.deepEqual(
      { etaMinutes: edited.etaMinutes, coverageRisk: edited.coverageRisk },
      expectedMetrics,
      fixture.scenarioId,
    )
    assert.equal(edited.approvedPlanId, null, fixture.scenarioId)
    assert.equal(edited.approvedVersion, null, fixture.scenarioId)
    assert.equal(edited.deliveryStatus, 'draft', fixture.scenarioId)
    assert.equal(edited.stage, 'strategy', fixture.scenarioId)
    assert.match(edited.invalidationReason ?? '', /原批准和任务包已失效/, fixture.scenarioId)

    const unchanged = applyPlanReportEdits(fixture, edited, {
      selectedPlanId: edited.selectedPlanId,
      resourceCount: edited.resourceCount,
      fireOptionId: edited.fireOptionId,
      medicalOptionId: edited.medicalOptionId,
      trafficOptionId: edited.trafficOptionId,
      decisionNote: edited.decisionNote,
    })
    assert.equal(unchanged, edited, `${fixture.scenarioId} unchanged draft`)
  }
})

test('a delivered version cannot be overwritten by the report editor', () => {
  const fixture = WORKFLOW_FIXTURES[0]
  const delivered = sendSimulatedTasks(approveWorkflow(createWorkflowSession(fixture)))
  const edited = applyPlanReportEdits(fixture, delivered, {
    selectedPlanId: fixture.plans.at(-1)?.id ?? delivered.selectedPlanId,
    resourceCount: fixture.maxResources,
    fireOptionId: fixture.fireDispatch.options.at(-1)?.id ?? delivered.fireOptionId,
    medicalOptionId: fixture.medicalDispatch.options.at(-1)?.id ?? delivered.medicalOptionId,
    trafficOptionId: fixture.trafficDispatch.options.at(-1)?.id ?? delivered.trafficOptionId,
    decisionNote: '不应写入执行中的版本',
  })

  assert.equal(edited, delivered)
  assert.equal(edited.deliveryStatus, 'delivered')
})

test('a decision-note-only edit still creates one auditable plan version', () => {
  const fixture = WORKFLOW_FIXTURES[0]
  const approved = approveWorkflow(createWorkflowSession(fixture))
  const edited = applyPlanReportEdits(fixture, approved, {
    selectedPlanId: approved.selectedPlanId,
    resourceCount: approved.resourceCount,
    fireOptionId: approved.fireOptionId,
    medicalOptionId: approved.medicalOptionId,
    trafficOptionId: approved.trafficOptionId,
    decisionNote: '仅补充人工决策依据',
  })

  assert.equal(edited.planVersion, approved.planVersion + 1)
  assert.equal(edited.decisionNote, '仅补充人工决策依据')
  assert.equal(edited.approvedPlanId, null)
  assert.equal(edited.approvedVersion, null)
  assert.equal(edited.deliveryStatus, 'draft')
})

test('a persisted report version hydrates without incrementing it again', () => {
  const fixture = WORKFLOW_FIXTURES.find((item) => item.scenarioId === 'yuexiu-medical') ?? WORKFLOW_FIXTURES[0]
  const approved = approveWorkflow(createWorkflowSession(fixture))
  const targetPlan = fixture.plans.at(-1) ?? fixture.plans[0]
  const hydrated = hydrateWorkflowReportVersion(fixture, approved, {
    version: 7,
    updatedAt: 1787875200,
    reportDraft: {
      selectedPlanId: targetPlan.id,
      resourceCount: fixture.maxResources,
      fireOptionId: fixture.fireDispatch.options.at(-1)?.id ?? approved.fireOptionId,
      medicalOptionId: fixture.medicalDispatch.options.at(-1)?.id ?? approved.medicalOptionId,
      trafficOptionId: fixture.trafficDispatch.options.at(-1)?.id ?? approved.trafficOptionId,
      decisionNote: '线上保存的人工说明',
    },
  })

  assert.equal(hydrated.planVersion, 7)
  assert.equal(hydrated.selectedPlanId, targetPlan.id)
  assert.equal(hydrated.decisionNote, '线上保存的人工说明')
  assert.equal(hydrated.approvedPlanId, null)
  assert.equal(hydrated.approvedVersion, null)
  assert.equal(hydrated.deliveryStatus, 'draft')
  assert.equal(hydrated.stage, 'strategy')

  assert.equal(hydrateWorkflowReportVersion(fixture, hydrated, {
    version: 7,
    updatedAt: 1787875200,
    reportDraft: hydrated,
  }), hydrated)
})
