import type { DomainFixture, PlanReportEdits, RecalculatedMetrics, TaskDispatchOverride, WorkflowSession } from './types'

function formatWorkflowTimestamp(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replaceAll('/', '-')
}

export function workflowTimestamp() {
  return formatWorkflowTimestamp(new Date())
}

export function recalculateMetrics(
  fixture: DomainFixture,
  resourceCount: number,
  fireOptionId: string,
  medicalOptionId: string,
  trafficOptionId: string,
): RecalculatedMetrics {
  const pick = (lever: DomainFixture['fireDispatch'], id: string) =>
    lever.options.find((item) => item.id === id) ?? lever.options[0]
  const fire = pick(fixture.fireDispatch, fireOptionId)
  const medical = pick(fixture.medicalDispatch, medicalOptionId)
  const traffic = pick(fixture.trafficDispatch, trafficOptionId)
  const extraResourceEffect = (fixture.defaultResources - resourceCount) * 0.55
  const etaMinutes = Math.max(
    3.5,
    fixture.baseEtaMinutes + extraResourceEffect + fire.etaDeltaMinutes + medical.etaDeltaMinutes + traffic.etaDeltaMinutes,
  )
  const coverageScore = fixture.baseCoverageScore
    + (resourceCount - fixture.defaultResources) * 6
    + fire.coverageDelta
    + medical.coverageDelta
    + traffic.coverageDelta
  const coverageRisk = coverageScore >= 75 ? '较低' : coverageScore >= 62 ? '注意' : '较高'
  return { etaMinutes: Math.round(etaMinutes * 10) / 10, coverageRisk }
}

function normalizePlanReportEdits(
  fixture: DomainFixture,
  session: WorkflowSession,
  edits: PlanReportEdits,
): PlanReportEdits {
  const selectedPlanId = fixture.plans.some((plan) => plan.id === edits.selectedPlanId)
    ? edits.selectedPlanId
    : session.selectedPlanId
  const requestedResourceCount = Number.isFinite(edits.resourceCount) ? Math.round(edits.resourceCount) : session.resourceCount
  const resourceCount = Math.min(
    fixture.maxResources,
    Math.max(fixture.minResources, requestedResourceCount),
  )
  const validOption = (lever: DomainFixture['fireDispatch'], candidate: string, fallback: string) =>
    lever.options.some((option) => option.id === candidate) ? candidate : fallback
  return {
    selectedPlanId,
    resourceCount,
    fireOptionId: validOption(fixture.fireDispatch, edits.fireOptionId, session.fireOptionId),
    medicalOptionId: validOption(fixture.medicalDispatch, edits.medicalOptionId, session.medicalOptionId),
    trafficOptionId: validOption(fixture.trafficDispatch, edits.trafficOptionId, session.trafficOptionId),
    decisionNote: edits.decisionNote.trim(),
  }
}

export function createWorkflowSession(fixture: DomainFixture): WorkflowSession {
  const metrics = recalculateMetrics(
    fixture,
    fixture.defaultResources,
    fixture.fireDispatch.options[0].id,
    fixture.medicalDispatch.options[0].id,
    fixture.trafficDispatch.options[0].id,
  )
  return {
    inputMode: 'stream',
    inputTemplateId: fixture.inputTemplates[0].id,
    inputValues: Object.fromEntries((fixture.inputFields ?? []).map((field) => [field.id, field.value])),
    inputValidated: false,
    briefCorrections: null,
    stage: 'input',
    selectedPlanId: fixture.plans[0].id,
    planVersion: 1,
    versionUpdatedAt: workflowTimestamp(),
    approvedPlanId: null,
    approvedVersion: null,
    resourceCount: fixture.defaultResources,
    fireOptionId: fixture.fireDispatch.options[0].id,
    medicalOptionId: fixture.medicalDispatch.options[0].id,
    trafficOptionId: fixture.trafficDispatch.options[0].id,
    etaMinutes: metrics.etaMinutes,
    coverageRisk: metrics.coverageRisk,
    deliveryStatus: 'draft',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    hasReplanned: false,
    retryCount: 0,
    invalidationReason: null,
    decisionNote: '',
  }
}

export function validateInput(session: WorkflowSession, mode: WorkflowSession['inputMode'], inputTemplateId: string): WorkflowSession {
  return {
    ...session,
    inputMode: mode,
    inputTemplateId,
    inputValidated: true,
    stage: 'brief',
  }
}

export function selectPlan(session: WorkflowSession, selectedPlanId: string): WorkflowSession {
  return { ...session, selectedPlanId, stage: 'strategy' }
}

export function approveWorkflow(session: WorkflowSession): WorkflowSession {
  return {
    ...session,
    stage: 'task',
    approvedPlanId: session.selectedPlanId,
    approvedVersion: session.planVersion,
    deliveryStatus: 'pending-send',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    invalidationReason: null,
  }
}

export function sendSimulatedTasks(session: WorkflowSession): WorkflowSession {
  if (session.approvedVersion !== session.planVersion || session.deliveryStatus !== 'pending-send') return session
  return { ...session, stage: 'execution', deliveryStatus: 'delivered', invalidationReason: null }
}

export function applyTaskDispatchOverride(session: WorkflowSession, override: TaskDispatchOverride): WorkflowSession {
  if (session.approvedVersion !== session.planVersion) return session
  const nextVersion = session.planVersion + 1
  return {
    ...session,
    inputValues: {
      ...session.inputValues,
      dispatchOverrideDepartment: override.department,
      dispatchOverrideTask: override.task,
      dispatchOverrideOptionId: override.optionId,
      dispatchOverrideOptionLabel: override.optionLabel,
      dispatchOverrideOwner: override.owner,
      dispatchOverrideLocation: override.location,
      dispatchOverrideVehicles: override.vehicles,
      dispatchOverrideNote: override.note,
    },
    planVersion: nextVersion,
    versionUpdatedAt: workflowTimestamp(),
    approvedVersion: nextVersion,
    stage: 'task',
    deliveryStatus: 'pending-send',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    invalidationReason: `资源调度已人工确认“${override.optionLabel}”，等待下发更新后的任务包。`,
  }
}

export function advanceDelivery(session: WorkflowSession): WorkflowSession {
  if (session.deliveryStatus === 'delivered') return { ...session, deliveryStatus: 'acknowledged' }
  if (session.deliveryStatus === 'acknowledged') {
    const startedAt = workflowTimestamp()
    return { ...session, deliveryStatus: 'executing', executionStartedAt: startedAt, firstArrivalAt: startedAt }
  }
  if (session.deliveryStatus === 'executing') {
    return { ...session, deliveryStatus: 'completed', stage: 'review', executionCompletedAt: workflowTimestamp() }
  }
  return session
}

export function markDeliveryAbnormal(session: WorkflowSession): WorkflowSession {
  if (session.deliveryStatus !== 'executing') return session
  return { ...session, deliveryStatus: 'abnormal' }
}

export function adjustWorkflow(
  fixture: DomainFixture,
  session: WorkflowSession,
  patch: Pick<WorkflowSession, 'resourceCount' | 'fireOptionId' | 'medicalOptionId' | 'trafficOptionId'>,
): WorkflowSession {
  const metrics = recalculateMetrics(fixture, patch.resourceCount, patch.fireOptionId, patch.medicalOptionId, patch.trafficOptionId)
  return {
    ...session,
    ...patch,
    etaMinutes: metrics.etaMinutes,
    coverageRisk: metrics.coverageRisk,
    planVersion: session.planVersion + 1,
    versionUpdatedAt: workflowTimestamp(),
    approvedPlanId: null,
    approvedVersion: null,
    deliveryStatus: 'draft',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    stage: 'strategy',
    hasReplanned: session.hasReplanned || session.deliveryStatus === 'abnormal',
    invalidationReason: session.approvedPlanId
      ? '调度维度已修改；原批准和任务包已失效。'
      : null,
  }
}

/**
 * 将报告编辑器的一份本地草案作为一次原子变更提交。
 * 输入控件变化时不要直接调用本函数；否则 range / select 的每次 change 都会生成新版本。
 */
export function applyPlanReportEdits(
  fixture: DomainFixture,
  session: WorkflowSession,
  edits: PlanReportEdits,
): WorkflowSession {
  if (['delivered', 'acknowledged', 'executing', 'completed'].includes(session.deliveryStatus)) return session

  const normalized = normalizePlanReportEdits(fixture, session, edits)
  const changed = normalized.selectedPlanId !== session.selectedPlanId
    || normalized.resourceCount !== session.resourceCount
    || normalized.fireOptionId !== session.fireOptionId
    || normalized.medicalOptionId !== session.medicalOptionId
    || normalized.trafficOptionId !== session.trafficOptionId
    || normalized.decisionNote !== session.decisionNote
  if (!changed) return session

  const adjusted = adjustWorkflow(fixture, session, {
    resourceCount: normalized.resourceCount,
    fireOptionId: normalized.fireOptionId,
    medicalOptionId: normalized.medicalOptionId,
    trafficOptionId: normalized.trafficOptionId,
  })
  return {
    ...adjusted,
    selectedPlanId: normalized.selectedPlanId,
    decisionNote: normalized.decisionNote,
    invalidationReason: session.approvedPlanId
      ? '方案报告核心字段已修改；原批准和任务包已失效。'
      : adjusted.invalidationReason,
  }
}

export function hydrateWorkflowReportVersion(
  fixture: DomainFixture,
  session: WorkflowSession,
  persisted: { version: number; reportDraft: PlanReportEdits | null; updatedAt?: number },
): WorkflowSession {
  if (!persisted.reportDraft || persisted.version <= session.planVersion) return session
  if (['delivered', 'acknowledged', 'executing', 'completed'].includes(session.deliveryStatus)) return session

  const normalized = normalizePlanReportEdits(fixture, session, persisted.reportDraft)
  const metrics = recalculateMetrics(
    fixture,
    normalized.resourceCount,
    normalized.fireOptionId,
    normalized.medicalOptionId,
    normalized.trafficOptionId,
  )
  return {
    ...session,
    ...normalized,
    inputValidated: true,
    stage: 'strategy',
    planVersion: persisted.version,
    versionUpdatedAt: persisted.updatedAt
      ? formatWorkflowTimestamp(new Date(persisted.updatedAt * 1000))
      : workflowTimestamp(),
    approvedPlanId: null,
    approvedVersion: null,
    etaMinutes: metrics.etaMinutes,
    coverageRisk: metrics.coverageRisk,
    deliveryStatus: 'draft',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    invalidationReason: null,
  }
}

export function runControlledRetry(session: WorkflowSession): WorkflowSession {
  if (!session.hasReplanned || session.retryCount >= 1 || session.approvedVersion !== session.planVersion || session.deliveryStatus !== 'pending-send') return session
  return {
    ...session,
    retryCount: 1,
    stage: 'execution',
    deliveryStatus: 'delivered',
    executionStartedAt: null,
    firstArrivalAt: null,
    executionCompletedAt: null,
    invalidationReason: null,
  }
}
