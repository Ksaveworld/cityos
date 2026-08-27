import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  Play,
  PencilLine,
  Send,
  SlidersHorizontal,
} from 'lucide-react'

import { CapabilityAdvantage } from '../CapabilityAdvantage'
import { EventCard } from '../EventCard'
import type { ExecutionPlaybackState } from '../execution/executionPlayback'
import { StationCasePanel } from '../historical/StationCasePanel'
import { STATION_HISTORY_SOURCE, STATION_SIMULATION_RUNS } from '../historical/stationHistory'
import { OriginMark } from '../Provenance'
import {
  CityosApiError,
  createCityosApiClient,
  createCityosIdempotencyKey,
  resolveCityosBackendMode,
  supportsWorkflowReportPersistence,
} from '../dispatch/cityosApi'

import { CommandTaskPackageCard, resolveAssignments, TaskPackageCard } from './ApprovedOutputs'
import {
  adjustWorkflow,
  advanceDelivery,
  applyPlanReportEdits,
  approveWorkflow,
  hydrateWorkflowReportVersion,
  markDeliveryAbnormal,
  runControlledRetry,
  selectPlan,
  sendSimulatedTasks,
  validateInput,
  workflowTimestamp,
} from './state'
import type { BriefCorrections, BriefItem, DataLabel, DomainFixture, InputMode, PlanReportEdits, WorkflowSession } from './types'

const IncidentReportOverlay = lazy(() => import('../report/IncidentReportOverlay'))
type ReportView = 'brief' | 'plan' | 'command-task' | 'task' | 'result'
type ReportPersistenceState = 'offline-demo' | 'loading' | 'ready' | 'saving' | 'error'

const cityosApi = createCityosApiClient()
const cityosBackendMode = resolveCityosBackendMode()
const DEMO_REPORT_ACTOR = 'demo-workflow-operator'

function persistenceErrorMessage(error: unknown) {
  return error instanceof CityosApiError ? error.failure.message : '在线报告保存暂时不可用。'
}

function reportTimestamp() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()).replaceAll('/', '-')
}

export function WorkflowSimulationPanel({
  fixture,
  session,
  activeStep,
  onChange,
  onStepChange,
  onExecutionPlaybackChange,
  onOpenResources,
  forceStandardExecution = false,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  activeStep: number
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onExecutionPlaybackChange?: (state: ExecutionPlaybackState | null) => void
  onOpenResources: () => void
  forceStandardExecution?: boolean
}) {
  const reportPersistenceEnabled = cityosBackendMode === 'api'
    && supportsWorkflowReportPersistence(fixture.scenarioId)
  const [reportView, setReportView] = useState<ReportView | null>(null)
  const [reportPlanId, setReportPlanId] = useState<string | null>(null)
  const [reportGeneratedAt, setReportGeneratedAt] = useState('')
  const [reportInitiallyEditing, setReportInitiallyEditing] = useState(false)
  const [reportPersistence, setReportPersistence] = useState<{
    state: ReportPersistenceState
    message: string
  }>(() => reportPersistenceEnabled
    ? { state: 'loading', message: '正在读取在线报告版本…' }
    : { state: 'offline-demo', message: '离线演示：修改只保留在当前浏览器会话。' })
  const reportTriggerRef = useRef<HTMLElement | null>(null)
  const sessionRef = useRef(session)
  const loadedScenarioRef = useRef<string | null>(null)
  const saveAttemptRef = useRef<{ signature: string; key: string } | null>(null)
  sessionRef.current = session
  const normalizedStep = Math.min(8, Math.max(0, activeStep === 5 ? 4 : activeStep))
  const selectedPlan = fixture.plans.find((plan) => plan.id === session.selectedPlanId) ?? fixture.plans[0]
  const reportPlan = fixture.plans.find((plan) => plan.id === reportPlanId) ?? selectedPlan
  const closeReport = useCallback(() => {
    const trigger = reportTriggerRef.current
    setReportView(null)
    setReportPlanId(null)
    setReportGeneratedAt('')
    setReportInitiallyEditing(false)
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
    })
  }, [])
  const rememberReportTrigger = () => {
    reportTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  const openReport = (view: Exclude<ReportView, 'plan'>) => {
    rememberReportTrigger()
    setReportPlanId(null)
    setReportGeneratedAt(reportTimestamp())
    setReportView(view)
  }
  const openPlanReport = (planId: string, initiallyEditing = false) => {
    rememberReportTrigger()
    setReportPlanId(planId)
    setReportGeneratedAt(reportTimestamp())
    setReportInitiallyEditing(initiallyEditing)
    setReportView('plan')
  }

  useEffect(() => {
    if (!reportPersistenceEnabled) {
      loadedScenarioRef.current = null
      setReportPersistence({
        state: 'offline-demo',
        message: supportsWorkflowReportPersistence(fixture.scenarioId)
          ? '离线演示：修改只保留在当前浏览器会话。'
          : '历史复盘场景未接入在线报告库；修改只保留在当前会话。',
      })
      return
    }
    if (loadedScenarioRef.current === fixture.scenarioId) return
    const controller = new AbortController()
    setReportPersistence({ state: 'loading', message: '正在读取在线报告版本…' })
    cityosApi.getWorkflowReport(fixture.scenarioId, controller.signal)
      .then((persisted) => {
        if (controller.signal.aborted) return
        loadedScenarioRef.current = fixture.scenarioId
        const current = sessionRef.current
        const hydrated = hydrateWorkflowReportVersion(fixture, current, persisted)
        if (hydrated !== current) {
          onChange(hydrated)
          onStepChange(4)
        }
        setReportPersistence({
          state: 'ready',
          message: persisted.storageState === 'persisted'
            ? `已连接在线报告 v${persisted.version}。`
            : '已连接在线后端；当前仍是 fixture v1 基线。',
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setReportPersistence({ state: 'error', message: persistenceErrorMessage(error) })
      })
    return () => controller.abort()
  }, [fixture, onChange, onStepChange, reportPersistenceEnabled])

  const applyReportEdits = useCallback(async (edits: PlanReportEdits) => {
    const current = sessionRef.current
    if (['delivered', 'acknowledged', 'executing', 'completed'].includes(current.deliveryStatus)) return false
    const next = applyPlanReportEdits(fixture, current, edits)
    if (next === current) return true

    const finishLocalChange = (saved: WorkflowSession) => {
      onChange(saved)
      setReportPlanId(saved.selectedPlanId)
      setReportGeneratedAt(reportTimestamp())
      setReportInitiallyEditing(false)
      onStepChange(4)
    }
    if (!reportPersistenceEnabled) {
      finishLocalChange(next)
      setReportPersistence({ state: 'offline-demo', message: '离线演示：修改只保留在当前浏览器会话。' })
      return true
    }

    const reportDraft: PlanReportEdits = {
      selectedPlanId: next.selectedPlanId,
      resourceCount: next.resourceCount,
      fireOptionId: next.fireOptionId,
      medicalOptionId: next.medicalOptionId,
      trafficOptionId: next.trafficOptionId,
      decisionNote: next.decisionNote,
    }
    const input = { expectedVersion: current.planVersion, reportDraft }
    const signature = JSON.stringify(input)
    if (saveAttemptRef.current?.signature !== signature) {
      saveAttemptRef.current = {
        signature,
        key: createCityosIdempotencyKey(`workflow-report:${fixture.scenarioId}`),
      }
    }
    setReportPersistence({ state: 'saving', message: '正在保存在线报告版本…' })
    try {
      const persisted = await cityosApi.saveWorkflowReport(fixture.scenarioId, input, {
        actorId: DEMO_REPORT_ACTOR,
        idempotencyKey: saveAttemptRef.current.key,
        mode: 'demo',
      })
      saveAttemptRef.current = null
      loadedScenarioRef.current = fixture.scenarioId
      const hydrated = hydrateWorkflowReportVersion(fixture, current, persisted)
      finishLocalChange(hydrated)
      setReportPersistence({ state: 'ready', message: `在线报告 v${persisted.version} 已保存；仍需人工批准。` })
      return true
    } catch (error) {
      if (error instanceof CityosApiError && error.failure.code === 'WORKFLOW_VERSION_CONFLICT') {
        saveAttemptRef.current = null
        try {
          const latest = await cityosApi.getWorkflowReport(fixture.scenarioId)
          const hydrated = hydrateWorkflowReportVersion(fixture, sessionRef.current, latest)
          if (hydrated !== sessionRef.current) onChange(hydrated)
        } catch {
          // 原编辑草案仍由报告编辑器保留；下一次应用会重新读取当前会话版本。
        }
        setReportPersistence({
          state: 'error',
          message: '在线版本已更新；当前编辑草案仍保留，请核对后再次应用。',
        })
        return false
      }
      setReportPersistence({ state: 'error', message: persistenceErrorMessage(error) })
      return false
    }
  }, [fixture, onChange, onStepChange, reportPersistenceEnabled])
  const approveReportPlan = useCallback((planId: string) => {
    if (['delivered', 'acknowledged', 'executing', 'completed'].includes(session.deliveryStatus)) return
    const switchedApproval = session.approvedVersion === session.planVersion
      && session.approvedPlanId !== null
      && session.approvedPlanId !== planId
    const selected = selectPlan(session, planId)
    const next = approveWorkflow(switchedApproval ? { ...selected, decisionNote: '' } : selected)
    onChange(next)
    setReportPlanId(planId)
    setReportGeneratedAt(reportTimestamp())
    setReportInitiallyEditing(false)
    onStepChange(6)
  }, [onChange, onStepChange, session])

  const report = reportView ? createPortal((
    <Suspense fallback={<div className="fixed inset-0 z-[80] grid place-items-center bg-white/90 text-body text-ink-2">正在生成报告版式…</div>}>
      <IncidentReportOverlay
        fixture={fixture}
        session={session}
        selectedPlan={reportPlan}
        view={reportView}
        generatedAt={reportGeneratedAt}
        initiallyEditing={reportInitiallyEditing}
        persistenceState={reportPersistence.state}
        persistenceMessage={reportPersistence.message}
        onApplyPlanEdits={applyReportEdits}
        onApprovePlan={approveReportPlan}
        onClose={closeReport}
      />
    </Suspense>
  ), document.body) : null

  if (normalizedStep <= 2) {
    return (
      <><InputPanel fixture={fixture} session={session} onChange={onChange} onStepChange={onStepChange} />{report}</>
    )
  }
  if (normalizedStep === 3) {
    return <><BriefPanel fixture={fixture} session={session} onChange={onChange} onStepChange={onStepChange} onOpenReport={() => openReport('brief')} />{report}</>
  }
  if (normalizedStep === 4) {
    return (
      <><StrategyPanel
        fixture={fixture}
        session={session}
        onChange={onChange}
        onStepChange={onStepChange}
        onOpenPlanReport={openPlanReport}
      />{report}</>
    )
  }
  if (normalizedStep === 6) {
    return <><TaskPanel fixture={fixture} session={session} selectedPlan={selectedPlan} onChange={onChange} onStepChange={onStepChange} onOpenOwnerReport={() => openReport('task')} onOpenCommandReport={() => openReport('command-task')} />{report}</>
  }
  if (normalizedStep === 7) {
    if (fixture.isHistoricalCase === true && !forceStandardExecution) {
      return <><StationCasePanel session={session} onChange={onChange} onStepChange={onStepChange} onPlaybackChange={onExecutionPlaybackChange} onOpenResources={onOpenResources} />{report}</>
    }
    return <><ExecutionPanel fixture={fixture} session={session} selectedPlan={selectedPlan} onChange={onChange} onStepChange={onStepChange} onOpenResources={onOpenResources} />{report}</>
  }
  return <><ReviewPanel fixture={fixture} session={session} selectedPlan={selectedPlan} onStepChange={onStepChange} onOpenReport={() => fixture.isHistoricalCase === true && !forceStandardExecution ? openPlanReport(selectedPlan.id) : openReport('result')} />{report}</>
}

function InputPanel({
  fixture,
  session,
  onChange,
  onStepChange,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
}) {
  const template = fixture.inputTemplates.find((item) => item.id === session.inputTemplateId) ?? fixture.inputTemplates[0]
  const chooseMode = (mode: InputMode) => {
    onChange({ ...session, inputMode: mode, inputValidated: false, stage: 'input' })
  }
  const begin = () => {
    onChange(validateInput(session, session.inputMode, template.id))
    onStepChange(3)
  }
  const publicCase = fixture.isHistoricalCase === true

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-1 gap-2 min-[1360px]:grid-cols-2" role="tablist" aria-label={publicCase ? '历史案例输入入口' : '事件输入入口'}>
        <button
          type="button"
          role="tab"
          aria-selected={session.inputMode === 'stream'}
          onClick={() => chooseMode('stream')}
          className={`relative flex min-h-16 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong ${session.inputMode === 'stream' ? 'border-accent-strong bg-accent-weak text-accent-strong shadow-[inset_0_0_0_1px_#5B5BD6]' : 'border-line bg-surface-card text-ink-2 hover:border-[#C9CBD6] hover:bg-sunken'}`}
        >
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${session.inputMode === 'stream' ? 'bg-white text-accent-strong' : 'bg-sunken text-ink-2'}`}>
            <Play size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-footnote font-medium opacity-75">入口 A</span>
            <span className="block truncate text-label font-semibold">{publicCase ? '公开锚点' : '演示事件流'}</span>
          </span>
          {session.inputMode === 'stream' && <Check size={14} className="absolute right-2 top-2" aria-hidden="true" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={session.inputMode === 'manual'}
          onClick={() => chooseMode('manual')}
          className={`relative flex min-h-16 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong ${session.inputMode === 'manual' ? 'border-accent-strong bg-accent-weak text-accent-strong shadow-[inset_0_0_0_1px_#5B5BD6]' : 'border-line bg-surface-card text-ink-2 hover:border-[#C9CBD6] hover:bg-sunken'}`}
        >
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${session.inputMode === 'manual' ? 'bg-white text-accent-strong' : 'bg-sunken text-ink-2'}`}>
            <FileCheck2 size={15} />
          </span>
          <span className="min-w-0">
            <span className="block text-footnote font-medium opacity-75">入口 B</span>
            <span className="block truncate text-label font-semibold">人工输入数据</span>
          </span>
          {session.inputMode === 'manual' && <Check size={14} className="absolute right-2 top-2" aria-hidden="true" />}
        </button>
      </div>

      {session.inputMode === 'manual' && fixture.inputFields && (
        <section className="rounded-xl border border-line bg-surface-card p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-label font-semibold text-ink-1">工作人员可控输入</h3>
            <span className="rounded bg-[#FFF7E6] px-1.5 py-0.5 text-footnote text-[#8A5A14]">预置值 · 可现场修改</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {fixture.inputFields.map((field) => (
              <label key={field.id} className={field.kind === 'textarea' ? 'col-span-2' : ''}>
                <span className="mb-1 block text-footnote font-medium text-ink-3">{field.label}</span>
                {field.kind === 'textarea' ? (
                  <textarea
                    rows={2}
                    value={session.inputValues[field.id] ?? ''}
                    onChange={(event) => onChange({ ...session, inputValidated: false, inputValues: { ...session.inputValues, [field.id]: event.target.value } })}
                    className="w-full resize-none rounded-lg border border-line bg-white px-2 py-1.5 text-label leading-relaxed text-ink-1 outline-none focus:border-accent-strong"
                  />
                ) : (
                  <input
                    value={session.inputValues[field.id] ?? ''}
                    onChange={(event) => onChange({ ...session, inputValidated: false, inputValues: { ...session.inputValues, [field.id]: event.target.value } })}
                    className="h-8 w-full rounded-lg border border-line bg-white px-2 text-label text-ink-1 outline-none focus:border-accent-strong"
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={begin}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white transition hover:bg-[#4D4DC2]"
      >
        <Play size={12} />根据选择入口开始研判
      </button>
    </div>
  )
}

const EMPTY_BRIEF_CORRECTIONS: BriefCorrections = { conclusion: '', evidence: '', risk: '', gaps: '' }

function BriefPanel({ fixture, session, onChange, onStepChange, onOpenReport }: { fixture: DomainFixture; session: WorkflowSession; onChange: (session: WorkflowSession) => void; onStepChange: (step: number) => void; onOpenReport: () => void }) {
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionDraft, setCorrectionDraft] = useState<BriefCorrections>(() => session.briefCorrections ?? EMPTY_BRIEF_CORRECTIONS)
  if (!session.inputValidated) {
    return <GateCard title="尚未形成 AI Brief" detail="请先从事件流或受限手工模板开始研判。" action="返回输入" onAction={() => onStepChange(0)} />
  }
  const location = session.inputValues.location?.trim() || fixture.address
  const publicCase = fixture.isHistoricalCase === true
  const publicSource = fixture.isHistoricalCase ? '历史案例公开资料与已核验锚点' : '中国日报 2015-03-06 13:33 报道'
  const conclusionItems: BriefItem[] = [
    { label: '当前事件', value: fixture.title, source: publicCase ? publicSource : '已校验输入 + 场景模板', status: publicCase ? '公开历史案例已核验' : '本轮研判对象已确定', dataLabel: publicCase ? '公开事实' : '演示事件' },
    { label: '处置位置', value: location, source: publicCase ? publicSource : session.inputMode === 'manual' ? '工作人员输入' : '事件流', status: publicCase ? '公开地点锚点' : '输入已校验 / 仍待现场复核', dataLabel: publicCase ? '公开事实' : '演示事件' },
    { label: '人工决策焦点', value: `${fixture.brief.unknown.length} 项风险信息待核实；先比较 A/B 方案的时间与覆盖后果，再由人工批准。`, source: 'AI Brief 汇总规则', status: '待人工判断', dataLabel: '待核实' },
  ]
  const riskItems: BriefItem[] = fixture.brief.unknown.map((item, index) => ({
    ...item,
    label: `${index === 0 ? 'P0' : 'P1'} · ${item.label}`,
    status: `${item.status} · ${index === 0 ? '优先核实' : '并行核实'}`,
  }))
  const saveCorrections = () => {
    const changed = JSON.stringify(correctionDraft) !== JSON.stringify(session.briefCorrections ?? EMPTY_BRIEF_CORRECTIONS)
    onChange({
      ...session,
      briefCorrections: correctionDraft,
      ...(changed && session.approvedPlanId ? {
        planVersion: session.planVersion + 1,
        versionUpdatedAt: workflowTimestamp(),
        executionStartedAt: null,
        firstArrivalAt: null,
        executionCompletedAt: null,
        approvedPlanId: null,
        approvedVersion: null,
        deliveryStatus: 'draft' as const,
        invalidationReason: 'AI Brief 已人工修正，原批准与任务包已失效。',
      } : {}),
    })
    setCorrectionOpen(false)
  }
  const correctionFields: Array<{ key: keyof BriefCorrections; label: string }> = [
    { key: 'conclusion', label: '核心态势结论' },
    { key: 'evidence', label: '事件事实与证据' },
    { key: 'risk', label: '风险研判与优先级' },
    { key: 'gaps', label: '关键信息缺口' },
  ]
  return (
    <div className="space-y-3 p-3">
      <EventCard variant="go" className="border-l-2 border-l-go">
        <div className="flex items-center justify-between gap-2">
          <div className="text-body font-semibold text-ink-1">AI Brief · 关键信息</div>
          <span className="rounded bg-[#EAF8F1] px-1.5 py-0.5 text-footnote font-semibold text-[#237A52]">已形成</span>
        </div>
      </EventCard>
      <BriefBlock title="核心态势结论" items={conclusionItems} correction={session.briefCorrections?.conclusion} />
      <BriefBlock title="事件事实与证据" items={fixture.brief.confirmed} correction={session.briefCorrections?.evidence} />
      <BriefBlock title="风险研判与优先级" items={riskItems} emphasis="warning" correction={session.briefCorrections?.risk} />
      <BriefBlock title="关键信息缺口" items={fixture.brief.gaps} emphasis="warning" correction={session.briefCorrections?.gaps} />
      <button type="button" onClick={onOpenReport} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-label font-semibold text-ink-1 hover:bg-sunken"><FileText size={12} />打开《城市事件 AI 态势简报》</button>
      <button type="button" onClick={() => setCorrectionOpen((open) => !open)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#C9DBF8] bg-[#F7FAFF] text-label font-semibold text-[#2768CA] hover:bg-[#EEF4FF]"><PencilLine size={12} />人工修正信息</button>
      {correctionOpen && (
        <EventCard variant="sunken" className="space-y-2">
          {correctionFields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1 block text-footnote font-semibold text-ink-2">{field.label}</span>
              <textarea
                rows={2}
                value={correctionDraft[field.key]}
                placeholder="填写需要人工补充或修正的内容"
                onChange={(event) => setCorrectionDraft((draft) => ({ ...draft, [field.key]: event.target.value }))}
                className="w-full resize-none rounded-lg border border-line bg-white px-2 py-1.5 text-label leading-relaxed text-ink-1 outline-none focus:border-accent-strong"
              />
            </label>
          ))}
          <button type="button" onClick={saveCorrections} className="h-8 w-full rounded-lg bg-[#2768CA] text-label font-semibold text-white hover:bg-[#205CB1]">保存人工修正</button>
        </EventCard>
      )}
      <button type="button" onClick={() => onStepChange(4)} className="h-9 w-full rounded-lg bg-accent-strong text-label font-semibold text-white hover:bg-[#4D4DC2]">生成处置方案</button>
    </div>
  )
}

function BriefBlock({ title, items, emphasis, correction }: { title: string; items: BriefItem[]; emphasis?: 'warning'; correction?: string }) {
  return (
    <section>
      <h3 className="mb-1.5 text-label font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <EventCard key={item.label} variant={emphasis === 'warning' ? 'dashed' : 'sunken'} className={emphasis === 'warning' ? 'border-[#D59B28]' : ''}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-label font-semibold text-ink-1">{item.label}</span>
              <DataBadge label={item.dataLabel} />
            </div>
            <p className="mt-1 text-body leading-relaxed text-ink-1">{item.value}</p>
            <div className="mt-1.5 grid gap-0.5 text-footnote leading-relaxed text-ink-3">
              <span>来源：{item.source}</span>
              <span>确认状态：{item.status}</span>
              {item.note && <span>{item.note}</span>}
            </div>
          </EventCard>
        ))}
        {correction && <div className="rounded-lg border border-[#C9DBF8] bg-[#F2F7FF] px-2 py-1.5 text-label leading-relaxed text-[#315B98]"><b>人工修正：</b>{correction}</div>}
      </div>
    </section>
  )
}

function StrategyPanel({
  fixture,
  session,
  onChange,
  onStepChange,
  onOpenPlanReport,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onOpenPlanReport: (planId: string, initiallyEditing?: boolean) => void
}) {
  if (!session.inputValidated) {
    return <GateCard title="尚未生成可比较方案" detail="请先校验事件输入，再进入 A/B 方案和人工批准。" action="返回输入" onAction={() => onStepChange(0)} />
  }
  const adjust = (patch: Partial<Pick<WorkflowSession, 'resourceCount' | 'fireOptionId' | 'medicalOptionId' | 'trafficOptionId'>>) => {
    const next = {
      resourceCount: patch.resourceCount ?? session.resourceCount,
      fireOptionId: patch.fireOptionId ?? session.fireOptionId,
      medicalOptionId: patch.medicalOptionId ?? session.medicalOptionId,
      trafficOptionId: patch.trafficOptionId ?? session.trafficOptionId,
    }
    if (
      next.resourceCount === session.resourceCount
      && next.fireOptionId === session.fireOptionId
      && next.medicalOptionId === session.medicalOptionId
      && next.trafficOptionId === session.trafficOptionId
    ) return
    onChange(adjustWorkflow(fixture, session, next))
  }
  const isCurrentApproval = session.approvedPlanId === session.selectedPlanId && session.approvedVersion === session.planVersion
  const approvalLocked = session.deliveryStatus !== 'draft' && session.deliveryStatus !== 'pending-send'
  const reportEditLocked = ['delivered', 'acknowledged', 'executing', 'completed'].includes(session.deliveryStatus)
  const fastestEta = Math.min(...fixture.plans.map((plan) => plan.etaMinutes))

  // 顺序固定：消防调度 → 医疗调度 → 路况协同。不按场景重排，也不按场景改名。
  const dimensions = [
    { key: 'fire' as const, lever: fixture.fireDispatch, value: session.fireOptionId, accent: 'bg-[#E5484D]', tone: 'bg-[#FDF0F0] text-[#A3373C]' },
    { key: 'medical' as const, lever: fixture.medicalDispatch, value: session.medicalOptionId, accent: 'bg-[#0E9AA7]', tone: 'bg-[#EAF8F8] text-[#08747D]' },
    { key: 'traffic' as const, lever: fixture.trafficDispatch, value: session.trafficOptionId, accent: 'bg-[#C77816]', tone: 'bg-[#FFF7E6] text-[#8A5A14]' },
  ]

  const countSlider = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink-2">{fixture.resourceLabel}</span>
        <span className="font-mono text-body font-semibold tabular-nums text-ink-1">{session.resourceCount} {fixture.resourceUnit}</span>
      </div>
      <input
        aria-label={`调整${fixture.resourceLabel}数量`}
        type="range"
        min={fixture.minResources}
        max={fixture.maxResources}
        value={session.resourceCount}
        onChange={(event) => adjust({ resourceCount: Number(event.target.value) })}
        className="mt-1.5 w-full accent-[#5B5BD6]"
      />
      <div className="mt-0.5 flex justify-between text-footnote text-ink-3"><span>{fixture.minResources}</span><span>{fixture.maxResources}</span></div>
    </>
  )

  return (
    <div className="space-y-3 p-3">
      {/* 三类协同固定横向展示当前方案摘要，不在方案生成后再制造一轮隐形选择。
          投入规模仍是独立、可审计的人工调整项，用于保留异常后的受控重规划入口。 */}
      <section>
        <h3 className="mb-1.5 flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.08em] text-ink-3"><SlidersHorizontal size={12} />受控调度 · 当前编组摘要 · 仅演示</h3>
        <EventCard variant="sunken" className="mb-1.5">
          {fixture.countOwner === null && <div className="mb-1 text-footnote font-semibold text-ink-2">{fixture.primaryDispatchTitle}</div>}
          {countSlider}
        </EventCard>
        <div className="space-y-1" data-dispatch-summary-grid>
          {dimensions.map(({ key, lever, value, accent, tone }) => {
            const option = lever.options.find((item) => item.id === value) ?? lever.options[0]
            const etaImpact = option.etaDeltaMinutes < 0
              ? `快 ${Math.abs(option.etaDeltaMinutes).toFixed(1)} 分钟`
              : option.etaDeltaMinutes > 0
                ? `慢 ${option.etaDeltaMinutes.toFixed(1)} 分钟`
                : '预计时间不变'
            const coverageImpact = option.coverageDelta > 0
              ? `覆盖 +${option.coverageDelta}`
              : option.coverageDelta < 0
                ? `覆盖 ${option.coverageDelta}`
                : '资源覆盖不变'
            return (
              <article key={key} data-dispatch-dimension={key} className="relative grid min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-card px-2 py-1.5">
                <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 ${accent}`} />
                <div className={`inline-flex justify-center whitespace-nowrap rounded px-1 py-0.5 text-[9px] font-semibold ${tone}`}>{lever.title}</div>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold text-ink-1">{option.label.replace(/ · 演示$/, '')}</p>
                  {fixture.countOwner === key && <p className="mt-0.5 text-footnote text-ink-2">{fixture.resourceLabel} {session.resourceCount} {fixture.resourceUnit}</p>}
                </div>
                <p className="shrink-0 text-right text-footnote leading-snug text-ink-3">{etaImpact}<br />{coverageImpact}</p>
              </article>
            )
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-1.5">
        <EventCard variant="go">
          <div className="text-footnote text-ink-3">预计首批到场</div>
          <div className="mt-0.5 font-mono text-section font-semibold tabular-nums text-ink-1">{session.etaMinutes.toFixed(1)} 分钟</div>
        </EventCard>
        <EventCard variant={session.coverageRisk === '较高' ? 'dashed' : 'sunken'}>
          <div className="text-footnote text-ink-3">资源覆盖风险</div>
          <div className="mt-0.5 text-section font-semibold text-ink-1">{session.coverageRisk}</div>
        </EventCard>
      </div>

      {session.invalidationReason && (
        <EventCard variant="dashed" className="border-[#D59B28]" aria-live="assertive">
          <div className="flex gap-1.5 text-body font-semibold text-[#8A5A14]"><CircleAlert size={13} />原批准已失效</div>
          <p className="mt-1 text-label leading-relaxed text-[#8A5A14]">{session.invalidationReason}</p>
        </EventCard>
      )}

      <div>
        <div className="space-y-1.5">
          {fixture.plans.map((plan) => {
            const approved = plan.id === session.approvedPlanId && session.approvedVersion === session.planVersion
            const etaPriority = plan.etaMinutes === fastestEta
            const planIsCurrent = plan.id === session.selectedPlanId
            const displayedEta = planIsCurrent ? session.etaMinutes : plan.etaMinutes
            const displayedRisk = planIsCurrent ? session.coverageRisk : plan.coverageRisk
            const switchesApprovedPlan = session.approvedVersion === session.planVersion
              && session.approvedPlanId !== null
              && session.approvedPlanId !== plan.id
            return (
              <div key={plan.id} data-plan-id={plan.id}>
                <EventCard variant={approved ? 'go' : etaPriority ? 'accent' : 'default'}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-body font-semibold text-ink-1">方案 {plan.label} · {plan.title}</div>
                      <p className="mt-1 text-label leading-relaxed text-ink-2">{plan.summary}</p>
                    </div>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {etaPriority && <span className="inline-flex items-center rounded bg-accent-strong px-1.5 py-0.5 text-footnote font-semibold text-white">时效优先</span>}
                      {approved && <span className="inline-flex items-center gap-1 rounded bg-[#EAF8F1] px-1.5 py-0.5 text-footnote font-semibold text-[#237A52]"><Check size={10} />人工已批准</span>}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-footnote text-ink-3"><span>预计到场 {displayedEta.toFixed(1)} 分钟{planIsCurrent ? ' · 当前重算' : ''}</span><span>资源覆盖风险 {displayedRisk}</span></div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button type="button" aria-label={`查看方案 ${plan.label} 详情`} onClick={() => onOpenPlanReport(plan.id)} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-line bg-surface-card px-1 text-[10px] font-semibold text-ink-1 hover:bg-sunken"><FileText size={11} />查看方案详情</button>
                    <button type="button" aria-label={`修改方案 ${plan.label} 报告`} disabled={reportEditLocked} onClick={() => onOpenPlanReport(plan.id, true)} title={reportEditLocked ? '任务已进入执行或办结，当前版本不可直接编辑' : undefined} className="flex h-8 items-center justify-center gap-1 rounded-lg border border-[#C9DBF8] bg-[#F7FAFF] px-1 text-[10px] font-semibold text-[#2768CA] hover:bg-[#EEF4FF] disabled:cursor-not-allowed disabled:border-line disabled:bg-page disabled:text-ink-3"><PencilLine size={11} />修改报告</button>
                    <button type="button" aria-label={`人工批准方案 ${plan.label}`} disabled={approved || approvalLocked} onClick={() => { const next = selectPlan(session, plan.id); onChange(approveWorkflow(switchesApprovedPlan ? { ...next, decisionNote: '' } : next)); onStepChange(6) }} className="h-8 rounded-lg bg-accent-strong px-1 text-[10px] font-semibold text-white hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3">{approved ? '已人工批准' : '人工批准此方案'}</button>
                  </div>
                </EventCard>
              </div>
            )
          })}
        </div>
        {approvalLocked && <p className="mt-1.5 text-footnote leading-relaxed text-[#8A5A14]">当前任务已进入下发或执行；需先否决当前版本或调整投入规模，才能批准新版本。</p>}
      </div>
      <EventCard variant="sunken">
        <div className="flex items-center justify-between gap-2">
          <span className="text-label font-semibold text-ink-1">人工决策说明</span>
          <span className="text-footnote font-semibold text-[#2768CA]">在方案报告内编辑</span>
        </div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">
          {session.decisionNote || '未填写；点击方案卡中的“修改报告”，在报告页内补充。'}
        </p>
      </EventCard>
      {/* 方案卡提供查看报告、在报告内修改，以及独立人工批准三条路径。 */}
      <button type="button" onClick={() => onChange({ ...session, approvedPlanId: null, approvedVersion: null, deliveryStatus: 'draft', planVersion: session.planVersion + 1, versionUpdatedAt: workflowTimestamp(), executionStartedAt: null, firstArrivalAt: null, executionCompletedAt: null, hasReplanned: session.hasReplanned || session.deliveryStatus === 'abnormal', invalidationReason: '人工否决当前候选方案，已要求重新生成。' })} className="h-8 w-full rounded-lg border border-[#F2CBCD] bg-[#FDF0F0] text-label font-semibold text-[#A3373C] hover:bg-[#FBE5E5]">否决并要求重新生成</button>
      {isCurrentApproval && <p className="text-footnote leading-relaxed text-[#237A52]">当前版本已由人工批准；任务下发状态可在本页继续查看。</p>}
    </div>
  )
}

function TaskPanel({
  fixture,
  session,
  selectedPlan,
  onChange,
  onStepChange,
  onOpenOwnerReport,
  onOpenCommandReport,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  selectedPlan: DomainFixture['plans'][number]
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onOpenOwnerReport: () => void
  onOpenCommandReport: () => void
}) {
  const approved = session.approvedPlanId === selectedPlan.id && session.approvedVersion === session.planVersion
  if (!approved) return <GateCard title="任务包仍是草案" detail="当前版本尚未人工批准，不能下发。" action="返回方案" onAction={() => onStepChange(4)} />
  const assignments = resolveAssignments(fixture, session)
  const retryPending = session.hasReplanned && session.retryCount === 0
  const retryExhausted = session.hasReplanned && session.retryCount >= 1
  const alreadySent = session.deliveryStatus !== 'pending-send'
  const redispatchPending = session.invalidationReason?.startsWith('资源调度已人工确认') ?? false
  return (
    <div className="space-y-3 p-3">
      {redispatchPending && (
        <div aria-live="assertive">
          <EventCard variant="dashed" className="border-[#D59B28] bg-[#FFF9ED]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-body font-semibold text-[#8A5A14]"><SlidersHorizontal size={13} />资源调整已生成 v{session.planVersion}</div>
              <span className="shrink-0 rounded bg-[#FFF1C7] px-1.5 py-0.5 text-footnote font-semibold text-[#8A5A14]">等待重新下发</span>
            </div>
            <p className="mt-1 text-label leading-relaxed text-ink-1">已写入任务包：{session.inputValues.dispatchOverrideOptionLabel}</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="rounded-md bg-white px-2 py-1.5"><div className="text-footnote text-ink-3">调整部门</div><div className="mt-0.5 text-label font-semibold text-ink-1">{session.inputValues.dispatchOverrideDepartment}</div></div>
              <div className="rounded-md bg-white px-2 py-1.5"><div className="text-footnote text-ink-3">新位置</div><div className="mt-0.5 text-label font-semibold text-ink-1">{session.inputValues.dispatchOverrideLocation}</div></div>
              <div className="col-span-2 rounded-md bg-white px-2 py-1.5"><div className="text-footnote text-ink-3">新资源配置</div><div className="mt-0.5 text-label font-semibold text-ink-1">{session.inputValues.dispatchOverrideVehicles}</div></div>
            </div>
            <p className="mt-2 text-footnote leading-relaxed text-[#7A5A20]">本次调整已替换原任务中的对应资源；重新下发前，上一版本不会继续执行。</p>
          </EventCard>
        </div>
      )}
      <CommandTaskPackageCard
        fixture={fixture}
        session={session}
        selectedPlan={selectedPlan}
        assignments={assignments}
        onOpenReport={onOpenCommandReport}
      />
      <TaskPackageCard
        fixture={fixture}
        session={session}
        assignments={assignments}
        onOpenReport={onOpenOwnerReport}
      />
      <button type="button" disabled={retryExhausted || alreadySent} onClick={() => { onChange(retryPending ? runControlledRetry(session) : sendSimulatedTasks(session)); onStepChange(7) }} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white transition hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3"><Send size={12} />{retryPending ? '送达并执行唯一一次受控重试' : retryExhausted ? '本轮受控重试已使用' : alreadySent ? '任务包已进入执行流程' : redispatchPending ? '重新下发任务包' : '下发任务包'}</button>
      <p className="text-footnote leading-relaxed text-ink-3">送达状态仅用于展示，可观察但不连接真实后台。</p>
    </div>
  )
}

function ExecutionPanel({
  fixture,
  session,
  selectedPlan,
  onChange,
  onStepChange,
  onOpenResources,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  selectedPlan: DomainFixture['plans'][number]
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onOpenResources: () => void
}) {
  const deliveryCopy: Record<WorkflowSession['deliveryStatus'], string> = {
    draft: '待生成', 'pending-send': '待下发', delivered: '已送达', acknowledged: '已签收', executing: '执行中', completed: '已完成', abnormal: '执行异常',
  }
  const nextLabel = session.deliveryStatus === 'delivered' ? '签收任务包' : session.deliveryStatus === 'acknowledged' ? '确认到场并进入执行' : session.deliveryStatus === 'executing' ? '完成执行' : null
  return (
    <div className="space-y-3 p-3">
      <EventCard variant="sunken">
        <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-body font-semibold text-ink-1"><Clock3 size={13} />执行状态 · {deliveryCopy[session.deliveryStatus]}</div><OriginMark origin="simulated" note="状态、单位移动和回执均为演示，不接真实执行系统。" showLabel={false} /></div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">方案 {selectedPlan.label} · {fixture.label} · v{session.planVersion}</p>
      </EventCard>
      <section>
        <h3 className="mb-1.5 text-label font-semibold uppercase tracking-[0.08em] text-ink-3">场景化执行时间线</h3>
        <ol className="relative space-y-0 border-l border-line pl-4">
          {fixture.executionSteps.map((label, index) => {
            const complete = index < deliveryLevel(session.deliveryStatus)
            const active = index === Math.min(fixture.executionSteps.length - 1, deliveryLevel(session.deliveryStatus))
            return <li key={label} className="relative pb-3 last:pb-0"><span className={`absolute -left-[21px] top-0.5 grid size-3 place-items-center rounded-full border ${complete ? 'border-go bg-go' : active ? 'border-accent-strong bg-accent-weak' : 'border-line bg-surface-card'}`}>{complete && <Check size={8} className="text-white" />}</span><div className={`text-body ${active ? 'font-semibold text-ink-1' : 'text-ink-2'}`}>{label}</div><div className="mt-0.5 text-footnote text-ink-3">{active ? session.deliveryStatus === 'abnormal' ? '异常已记录 · 等待人工调整' : '当前执行阶段 · 地图中可观察路线和单位移动' : complete ? '已完成节点' : '等待前序节点'}</div></li>
          })}
        </ol>
      </section>
      {nextLabel && <button type="button" onClick={() => onChange(advanceDelivery(session))} className="h-9 w-full rounded-lg border border-line bg-surface-card text-label font-semibold text-ink-1 hover:bg-sunken">{nextLabel}</button>}
      {session.deliveryStatus === 'completed' && (
        <EventCard variant="go" className="border-l-2 border-l-go">
          <div className="flex items-center gap-1.5 text-body font-semibold text-ink-1"><Check size={13} />执行已完成</div>
          <p className="mt-1 text-label leading-relaxed text-ink-2">协同任务与资源需求已经形成，可进入资源调度继续查看。</p>
          <button type="button" onClick={onOpenResources} className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white hover:bg-[#4D4DC2]">前往资源调度<ArrowRight size={12} /></button>
          <button type="button" onClick={() => onStepChange(8)} className="mt-1.5 h-8 w-full rounded-lg border border-line bg-white text-label font-semibold text-ink-2 hover:bg-sunken">查看闭环报告</button>
        </EventCard>
      )}
      {session.deliveryStatus === 'executing' && <button type="button" onClick={() => onChange(markDeliveryAbnormal(session))} className="h-9 w-full rounded-lg border border-[#F2CBCD] bg-[#FDF0F0] text-label font-semibold text-[#A3373C] hover:bg-[#FBE5E5]">标记执行异常</button>}
      {session.deliveryStatus === 'abnormal' && (
        <EventCard variant="dashed" className="border-[#E5484D]">
          <div className="flex gap-1.5 text-body font-semibold text-[#A3373C]"><CircleAlert size={13} />执行异常</div>
          <p className="mt-1 text-label leading-relaxed text-[#8C4549]">已停止状态自动推进。请返回方案调整投入规模；系统会重算 ETA 与覆盖风险，并使原批准和任务包失效。重新人工批准、再次下发后，才允许一次受控重试。</p>
          <button type="button" onClick={() => onStepChange(4)} className="mt-2 h-8 w-full rounded-lg border border-[#F2CBCD] bg-white text-label font-semibold text-[#A3373C] hover:bg-[#FDF0F0]">返回方案并调整</button>
        </EventCard>
      )}
      {session.hasReplanned && session.retryCount === 1 && <p className="rounded-lg bg-[#EAF8F1] px-2 py-1.5 text-label leading-relaxed text-[#237A52]">{session.deliveryStatus === 'completed' ? '已完成本轮唯一允许的受控重试。' : '本轮唯一允许的受控重试已启动，重试名额已使用。'}不提供通用重试或回滚。</p>}
      {session.hasReplanned && session.retryCount === 0 && <p className="text-footnote leading-relaxed text-ink-3">完成投入调整后，必须先重新人工批准，并从任务包执行唯一一次受控重试。</p>}
    </div>
  )
}

function ReviewPanel({ fixture, session, selectedPlan, onStepChange, onOpenReport }: { fixture: DomainFixture; session: WorkflowSession; selectedPlan: DomainFixture['plans'][number]; onStepChange: (step: number) => void; onOpenReport: () => void }) {
  const stationPublicCase = fixture.isHistoricalCase === true
  const stationComparable = STATION_SIMULATION_RUNS.baseline.assumptionSetId === STATION_SIMULATION_RUNS.cityos.assumptionSetId
    && STATION_SIMULATION_RUNS.baseline.mapSnapshot === STATION_SIMULATION_RUNS.cityos.mapSnapshot
    && STATION_SIMULATION_RUNS.baseline.modelVersion === STATION_SIMULATION_RUNS.cityos.modelVersion
  return (
    <div className="space-y-3 p-3">
      <EventCard variant="go" className="border-l-2 border-l-go">
        <div className="flex items-center gap-1.5 text-body font-semibold text-ink-1"><Check size={13} />处置闭环已形成</div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">{fixture.label} · 方案 {selectedPlan.label} · v{session.planVersion} · ETA（估算）{session.etaMinutes.toFixed(1)} 分钟。</p>
      </EventCard>
      <div className="grid grid-cols-2 gap-1.5">
        <EventCard variant="sunken"><div className="text-footnote text-ink-3">人工批准</div><div className="mt-0.5 text-body font-semibold text-ink-1">{session.approvedVersion === session.planVersion ? '当前版本已批准' : '无有效批准'}</div></EventCard>
        <EventCard variant="sunken"><div className="text-footnote text-ink-3">受控重试</div><div className="mt-0.5 text-body font-semibold text-ink-1">{session.retryCount ? '已执行 1 次' : '未执行'}</div></EventCard>
      </div>
      {stationPublicCase ? (
        <>
          <EventCard variant="sunken">
            <div className="text-label font-semibold text-ink-1">公开确认的时间和地点</div>
            <p className="mt-1 text-body leading-relaxed text-ink-1">2015-03-06 · 上午 8 时 20 分许 · 广州火车站站外广场 · 9 人受伤（当日通报口径）</p>
            <a className="mt-1.5 block text-footnote text-accent-strong hover:underline" href={STATION_HISTORY_SOURCE.href} target="_blank" rel="noreferrer">来源：{STATION_HISTORY_SOURCE.title}</a>
          </EventCard>
          <CapabilityAdvantage
            baselineEta={STATION_SIMULATION_RUNS.baseline.etaMinutes}
            cityosEta={STATION_SIMULATION_RUNS.cityos.etaMinutes}
            baselineRisk={STATION_SIMULATION_RUNS.baseline.coverageRisk ?? '待评估'}
            cityosRisk={STATION_SIMULATION_RUNS.cityos.coverageRisk ?? '待评估'}
            comparable={stationComparable}
            note="两次推演使用相同公开信息、演示假设、路网快照和模型版本；历史警力、路线、医院分流和签收没有公开，不能评价历史处置。"
          />
        </>
      ) : (
        <EventCard variant="dashed" className="border-[#D59B28]"><p className="text-label leading-relaxed text-[#8A5A14]">本报告沉淀处置过程、输入边界和人工门禁。</p></EventCard>
      )}
      <button type="button" onClick={onOpenReport} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white hover:bg-[#4D4DC2]"><FileText size={12} />{stationPublicCase ? '打开处置方案报告' : '打开事件处置结果报告'}</button>
      <button type="button" onClick={() => onStepChange(4)} className="h-8 w-full rounded-lg border border-line bg-surface-card text-label font-semibold text-ink-1 hover:bg-sunken">回看方案与受控调度</button>
    </div>
  )
}

function GateCard({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return <div className="space-y-3 p-3"><EventCard variant="dashed" className="border-[#D59B28]"><div className="flex items-center gap-1.5 text-body font-semibold text-[#8A5A14]"><CircleAlert size={13} />{title}</div><p className="mt-1 text-label leading-relaxed text-[#8A5A14]">{detail}</p></EventCard><button type="button" onClick={onAction} className="h-8 w-full rounded-lg border border-line bg-surface-card text-label font-semibold text-ink-1 hover:bg-sunken">{action}</button></div>
}

function DataBadge({ label }: { label: DataLabel }) {
  const styles: Record<DataLabel, string> = { '演示事件': 'bg-accent-weak text-accent-strong', '公开事实': 'bg-[#EAF8F1] text-[#237A52]', '模型估算': 'bg-[#F3F4F6] text-ink-2', '待核实': 'bg-[#FFF7E6] text-[#8A5A14]' }
  const visibleLabel = label === '演示事件' ? '事件输入' : label === '模型估算' ? '条件估算' : label
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-footnote font-medium ${styles[label]}`}>{visibleLabel}</span>
}

function deliveryLevel(status: WorkflowSession['deliveryStatus']) {
  if (status === 'delivered') return 1
  if (status === 'acknowledged') return 2
  if (status === 'executing') return 3
  if (status === 'abnormal') return 3
  if (status === 'completed') return 4
  return 0
}
