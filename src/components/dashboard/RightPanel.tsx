import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

import type { Plan, Scenario } from '@/engine'
import type { MedicalSupportRoute } from '@/pages/routingViewModel'

import { ChainRail } from './ChainRail'
import { EventCard as EventCardFrame } from './EventCard'
import { OriginMark } from './Provenance'
import { LiwanStepPanel } from './StepPanels'
import { HistoricalReviewWorkflow } from './historical/HistoricalReviewWorkflow'
import { isHistoricalReviewCaseId } from './historical/reviewCases'
import { createHistoricalWorkflowFixture } from './historical/historicalWorkflow'
import type { ExecutionPlaybackState } from './execution/executionPlayback'
import { findReviewReportByScenario } from './review/reviewReports'
import { findFixtureByScenarioId } from './workflow/fixtures'
import { WorkflowSimulationPanel } from './workflow/WorkflowSimulationPanel'
import type { WorkflowSession } from './workflow/types'
import { TodayEventPanel } from './board/TodayEventPanel'
import type { HistoricalCase, IncidentFilter, TodayEvent } from './board/boardData'
import {
  resolveFireScenario,
  type FireMode,
} from './fireModes'
import {
  CHAIN_STEPS,
  DASHBOARD_SCENARIOS,
  type DashboardScenario,
} from './scenarios'

const ReviewReportOverlay = lazy(() => import('./review/ReviewReportOverlay'))

type RightView = 'list' | 'detail'
const normalizeStep = (step: number) => Math.min(8, Math.max(0, step))

const stepGroupLabel = (step: number, historical = false) => {
  const current = normalizeStep(step)
  if (current <= 2) return historical ? '对历史输入进行研判' : '对输入进行研判'
  if (current === 3) return 'AI Brief'
  if (current === 4) return '方案生成'
  if (current === 5) return '方案生成'
  if (current === 6) return '任务下发'
  if (current === 7) return historical ? '执行反馈' : '反馈'
  return historical ? '复盘' : '报告'
}

const HISTORY_STEP_LABELS: Record<number, string> = {
  0: 'Signal · 信号接入',
  1: 'Event · 事件归并',
  2: 'Context · 上下文补齐',
  3: 'AI Brief',
  4: 'Strategy · 方案生成',
  5: 'Strategy · 方案生成',
  6: 'Task · 任务下发',
  7: 'Feedback · 执行反馈',
  8: 'Review · 复盘',
}

export function RightPanel({
  view,
  activeScenarioId,
  historicalCaseId,
  fireMode,
  activeStep,
  engineScenario,
  plans,
  medicalRoute,
  activePlanId,
  approvedPlanId,
  closedWays,
  routeMessage,
  routeStale,
  onRemoveClosedWay,
  onUndoClosedWay,
  onClearClosedWays,
  onViewChange,
  onStepChange,
  onPickPlan,
  onApprovePlan,
  workflowSession,
  onWorkflowSessionChange,
  onExecutionPlaybackChange,
  onOpenKnowledge,
  onOpenResources,
  incidentFilter,
  selectedTodayEventId,
  onIncidentFilterChange,
  onTodayEventSelect,
  onEnterTodayEventWorkflow,
  onEnterHistoricalCase,
  todayEvents,
}: {
  view: RightView
  activeScenarioId: string
  historicalCaseId: string | null
  fireMode: FireMode
  activeStep: number
  engineScenario: Scenario
  plans: Plan[]
  medicalRoute?: MedicalSupportRoute | null
  activePlanId: string
  approvedPlanId: string | null
  closedWays: Array<{ id: string; name: string }>
  routeMessage: string
  routeStale?: boolean
  onRemoveClosedWay: (wayId: string) => void
  onUndoClosedWay: () => void
  onClearClosedWays: () => void
  onViewChange: (view: RightView) => void
  onStepChange: (step: number) => void
  onPickPlan: (planId: string) => void
  onApprovePlan: (planId: string) => void
  workflowSession: WorkflowSession
  onWorkflowSessionChange: (session: WorkflowSession) => void
  onExecutionPlaybackChange: (state: ExecutionPlaybackState | null) => void
  onOpenKnowledge: () => void
  onOpenResources: () => void
  incidentFilter: IncidentFilter
  selectedTodayEventId: string | null
  onIncidentFilterChange: (filter: IncidentFilter) => void
  onTodayEventSelect: (eventId: string | null) => void
  onEnterTodayEventWorkflow: (event: TodayEvent) => void
  onEnterHistoricalCase: (entry: HistoricalCase) => void
  todayEvents: TodayEvent[]
}) {
  const publicScenario = DASHBOARD_SCENARIOS.find((item) => item.id === activeScenarioId) ?? DASHBOARD_SCENARIOS[0]
  const scenario = activeScenarioId === 'liwan-fire' ? resolveFireScenario(publicScenario, fireMode) : publicScenario
  const [reviewReportOpen, setReviewReportOpen] = useState(false)
  const currentStep = normalizeStep(activeStep)
  const historicalReviewCaseId = isHistoricalReviewCaseId(historicalCaseId) ? historicalCaseId : null
  const historicalReview = historicalReviewCaseId !== null
  const commonSimulationWorkflow = !historicalReview && !(scenario.id === 'liwan-fire' && fireMode === 'public-review')
  const workflowFixture = historicalReviewCaseId
    ? createHistoricalWorkflowFixture(historicalReviewCaseId)
    : findFixtureByScenarioId(scenario.id)
  const workflowScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (historicalReviewCaseId) workflowScrollRef.current?.scrollTo({ top: 0 })
  }, [currentStep, historicalReviewCaseId])

  const goToStep = (step: number) => {
    const normalized = normalizeStep(step)
    const nextStep = historicalReview
      ? normalized < 3 ? 3 : normalized === 5 ? 4 : normalized
      : normalized
    onStepChange(nextStep)
  }

  const returnToList = () => {
    onViewChange('list')
  }

  const pickPlan = (planId: string) => {
    onPickPlan(planId)
  }

  const approvePlan = (planId: string) => {
    onPickPlan(planId)
    onApprovePlan(planId)
  }

  const footerAction = () => {
    if (currentStep <= 2) {
      goToStep(3)
      return
    }
    if (currentStep === 3) {
      goToStep(4)
      return
    }
    if ((currentStep === 4 || currentStep === 5) && approvedPlanId === activePlanId) {
      goToStep(6)
      return
    }
    if (currentStep === 6) {
      goToStep(7)
      return
    }
    if (currentStep === 7) goToStep(8)
    // 第 8 环原来是个禁用按钮，写着「建议报告已形成」但点不开任何东西——
    // 报告浮层当时只接在日常演练那条链路上，复盘这边漏了接线。
    if (currentStep === 8) setReviewReportOpen(true)
  }

  const reviewReport = useMemo(
    () => findReviewReportByScenario(activeScenarioId, fireMode),
    [activeScenarioId, fireMode],
  )

  const footerLabel = currentStep <= 2
    ? '返回 AI Brief'
    : currentStep === 3
      ? '查看方案'
      : currentStep === 4 || currentStep === 5
        ? approvedPlanId === activePlanId ? '查看任务下发' : '请选择方案'
        : currentStep === 6
          ? '查看反馈'
          : currentStep === 7
            ? '查看报告'
            : reviewReport ? '打开复盘报告' : '报告已形成'

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel">
      {view === 'list' ? (
        <TodayEventPanel
          events={todayEvents}
          filter={incidentFilter}
          selectedEventId={selectedTodayEventId}
          onFilterChange={onIncidentFilterChange}
          onSelectEvent={onTodayEventSelect}
          onEnterWorkflow={onEnterTodayEventWorkflow}
          onEnterHistoricalCase={onEnterHistoricalCase}
          onOpenKnowledge={onOpenKnowledge}
        />
      ) : (
        <>
          <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-hairline px-2.5 py-1.5">
            <button
              onClick={returnToList}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken"
              aria-label="返回事件列表"
            >
              <ArrowLeft size={14} />
            </button>
            <ScenarioCard event={scenario} variant="header" />
          </div>

          <div className={`grid min-h-0 flex-1 ${historicalReview ? 'grid-cols-[174px_minmax(0,1fr)]' : 'grid-cols-[160px_minmax(0,1fr)]'}`}>
            <div className="flex min-h-0 flex-col border-r border-hairline bg-sunken/45">
              <div className="border-b border-hairline px-3 py-2">
                <div className="text-label font-semibold text-ink-1">处置环节</div>
              </div>
              <ChainRail
                key={historicalReviewCaseId ?? 'daily'}
                compact
                activeStep={currentStep}
                states={scenario.states}
                onStepChange={goToStep}
                variant={historicalReview ? 'history' : 'daily'}
              />
              <div className="mt-auto border-t border-hairline px-3 py-2 text-footnote leading-relaxed text-ink-3">
                {currentStep !== 8 && (
                  <OriginMark
                    origin="simulated"
                    note="事件流、资源状态、调派与执行反馈为演示数据；公开地点与路网以来源形状标识。"
                  />
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="shrink-0 border-b border-hairline px-3 py-2">
                {historicalReview && currentStep === 3 ? (
                  <div className="truncate text-body font-semibold text-ink-1">AI Brief</div>
                ) : historicalReview ? (
                  <>
                    <div className="text-footnote text-ink-3">{stepGroupLabel(currentStep, true)}</div>
                    <div className="mt-0.5 truncate text-body font-semibold text-ink-1">{HISTORY_STEP_LABELS[currentStep]}</div>
                  </>
                ) : currentStep <= 2 ? (
                  <div className="truncate text-body font-semibold text-ink-1">对输入进行研判</div>
                ) : (
                  <>
                    <div className="text-footnote text-ink-3">{stepGroupLabel(currentStep)}</div>
                    <div className="mt-0.5 truncate text-body font-semibold text-ink-1">{CHAIN_STEPS[currentStep === 5 ? 4 : currentStep]?.label}</div>
                  </>
                )}
              </div>

              <div ref={workflowScrollRef} className="min-h-0 flex-1 overflow-y-auto">
                {historicalReviewCaseId ? (
                  <HistoricalReviewWorkflow
                    caseId={historicalReviewCaseId}
                    fixture={workflowFixture}
                    session={workflowSession}
                    activeStep={currentStep}
                    onChange={onWorkflowSessionChange}
                    onStepChange={goToStep}
                    onOpenReport={() => setReviewReportOpen(true)}
                    onExecutionPlaybackChange={onExecutionPlaybackChange}
                    onOpenResources={onOpenResources}
                  />
                ) : scenario.id === 'liwan-fire' && fireMode === 'public-review' ? (
                  <LiwanStepPanel
                    step={currentStep === 5 ? 4 : currentStep}
                    scenario={engineScenario}
                    plans={plans}
                    medicalRoute={medicalRoute}
                    activePlanId={activePlanId}
                    onPickPlan={pickPlan}
                    approvedPlanId={approvedPlanId}
                    onApprove={approvePlan}
                    onGoToStep={goToStep}
                    onOpenReport={() => setReviewReportOpen(true)}
                    closedWays={closedWays}
                    routeMessage={routeMessage}
                    onRemoveClosedWay={onRemoveClosedWay}
                    onUndoClosedWay={onUndoClosedWay}
                    onClearClosedWays={onClearClosedWays}
                    routeStale={routeStale}
                  />
                ) : (
                  <WorkflowSimulationPanel
                    fixture={workflowFixture}
                    session={workflowSession}
                    activeStep={currentStep}
                    onChange={onWorkflowSessionChange}
                    onStepChange={goToStep}
                    onExecutionPlaybackChange={onExecutionPlaybackChange}
                    onOpenResources={onOpenResources}
                  />
                )}
              </div>

              {!historicalReview && !commonSimulationWorkflow && <div className="shrink-0 border-t border-hairline p-2">
                <button
                  onClick={footerAction}
                  disabled={(currentStep === 8 && !reviewReport) || ((currentStep === 4 || currentStep === 5) && approvedPlanId !== activePlanId)}
                  className="h-8 w-full rounded-lg bg-accent-strong text-label font-semibold text-white transition hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3"
                >
                  {footerLabel}
                </button>
              </div>}
            </div>
          </div>
        </>
      )}

      {reviewReportOpen && reviewReport && (
        <Suspense fallback={null}>
          <ReviewReportOverlay report={reviewReport} onClose={() => setReviewReportOpen(false)} />
        </Suspense>
      )}
    </aside>
  )
}

function ScenarioCard({
  event,
  expanded = false,
  onToggle,
  variant = 'list',
  children,
}: {
  event: DashboardScenario
  expanded?: boolean
  onToggle?: () => void
  variant?: 'list' | 'header'
  children?: React.ReactNode
}) {
  if (variant === 'header') {
    return (
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-body font-semibold leading-snug text-ink-1">{event.title.replace(/^【演示】\s*/, '')}</h3>
      </div>
    )
  }

  const urgent = event.kind === 'fire' && event.statusLabel === '推演中'
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-2">
        {urgent && (
          <span
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-[#FDF0F0] text-fire"
            title="重点处置事件：仍有待核实信息"
          >
            <AlertTriangle size={12} strokeWidth={2.2} aria-hidden="true" />
            <span className="sr-only">重点处置事件</span>
          </span>
        )}
        <h3 className="min-w-0 flex-1 text-section font-semibold leading-snug text-ink-1">
          {event.title}
        </h3>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <span className={`rounded px-1 py-0.5 text-label ${event.kind === 'fire' ? 'bg-surface-card text-fire' : 'bg-[#F3F4F6] text-ink-2'}`}>
          {event.typeLabel}
        </span>
        <span className="rounded bg-[#F3F4F6] px-1 py-0.5 text-label text-ink-2">{event.statusLabel}</span>
        <time className="ml-auto shrink-0 font-mono text-footnote tabular-nums text-ink-3">{event.updatedAt}</time>
      </div>
      {urgent && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md bg-[#FDF0F0] px-1.5 py-1 text-label font-medium text-[#8C3034]">
          <span className="size-1.5 rounded-full bg-fire" aria-hidden="true" />
          重点处置 · 楼层信息待核实
        </div>
      )}
      <p className="mt-1.5 text-body leading-relaxed text-ink-2">{event.subtitle}</p>
      <div className="mt-1 truncate text-label text-ink-3">{event.address}</div>
    </>
  )

  return (
    <EventCardFrame
      variant={event.kind === 'fire' && expanded ? 'fire' : 'default'}
      className={`transition ${urgent ? 'border-l-4 border-l-fire shadow-[0_4px_14px_rgb(229_72_77_/_0.10)]' : ''} ${event.kind === 'fire' && expanded ? '' : 'hover:border-[#D9DCE6]'}`}
    >
      <button className="w-full text-left" onClick={onToggle} aria-expanded={expanded}>
        {content}
      </button>
      {children}
    </EventCardFrame>
  )
}
