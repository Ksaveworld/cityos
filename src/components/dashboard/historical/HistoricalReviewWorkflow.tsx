import { Check, CircleAlert, FileText } from 'lucide-react'

import { EventCard } from '../EventCard'
import type { ExecutionPlaybackState } from '../execution/executionPlayback'
import { WorkflowSimulationPanel } from '../workflow/WorkflowSimulationPanel'
import type { DomainFixture, WorkflowSession } from '../workflow/types'

import {
  HISTORICAL_REVIEW_CASES,
  type HistoricalCandidatePlan,
  type HistoricalReviewCase,
  type HistoricalReviewCaseId,
} from './reviewCases'

export function HistoricalReviewWorkflow({
  caseId,
  fixture,
  session,
  activeStep,
  onChange,
  onStepChange,
  onOpenReport,
  onExecutionPlaybackChange,
  onOpenResources,
}: {
  caseId: HistoricalReviewCaseId
  fixture: DomainFixture
  session: WorkflowSession
  activeStep: number
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onOpenReport: () => void
  onExecutionPlaybackChange?: (state: ExecutionPlaybackState | null) => void
  onOpenResources: () => void
}) {
  const reviewCase = HISTORICAL_REVIEW_CASES[caseId]
  const selectedPlan = reviewCase.plans.find((plan) => plan.id === session.selectedPlanId) ?? reviewCase.plans[0]

  if (activeStep === 8) {
    return (
      <HistoricalComparisonPanel
        reviewCase={reviewCase}
        selectedPlan={selectedPlan}
        ready={session.deliveryStatus === 'completed'}
        onStepChange={onStepChange}
        onOpenReport={onOpenReport}
      />
    )
  }

  return (
    <WorkflowSimulationPanel
      fixture={fixture}
      session={session}
      activeStep={Math.max(3, activeStep)}
      onChange={onChange}
      onStepChange={onStepChange}
      onExecutionPlaybackChange={onExecutionPlaybackChange}
      onOpenResources={onOpenResources}
      forceStandardExecution
    />
  )
}

function HistoricalComparisonPanel({
  reviewCase,
  selectedPlan,
  ready,
  onStepChange,
  onOpenReport,
}: {
  reviewCase: HistoricalReviewCase
  selectedPlan: HistoricalCandidatePlan
  ready: boolean
  onStepChange: (step: number) => void
  onOpenReport: () => void
}) {
  if (!ready) {
    return (
      <div className="space-y-3 p-3">
        <EventCard variant="dashed" className="border-[#D59B28]">
          <div className="flex items-center gap-1.5 text-body font-semibold text-[#8A5A14]"><CircleAlert size={13} />复盘对比尚未形成</div>
          <p className="mt-1 text-label leading-relaxed text-[#76510E]">请先完成批准方案的演示执行，再生成历史对比结论。</p>
        </EventCard>
        <button type="button" onClick={() => onStepChange(7)} className="h-8 w-full rounded-lg border border-line bg-white text-label font-semibold text-ink-1 hover:bg-sunken">返回执行反馈</button>
      </div>
    )
  }

  const etaDelta = reviewCase.runs.baseline.etaMinutes
    ? reviewCase.runs.baseline.etaMinutes - selectedPlan.etaMinutes
    : 0

  return (
    <div className="space-y-3 p-3">
      <EventCard variant="sunken" className="border-l-2 border-l-accent-strong">
        <div className="text-body font-semibold text-ink-1">Review · 如果当时有 City OS</div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">在相同公开信息和显式假设下，对比原处置公开时间线与 CityOS 方案可能带来的协同变化。</p>
      </EventCard>
      <EventCard variant="go" className="border-l-2 border-l-go">
        <div className="flex items-center gap-1.5 text-body font-semibold text-ink-1"><Check size={13} />同条件下形成可量化的协同改进</div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">方案 {selectedPlan.label} 预计将首批到场缩短 {etaDelta.toFixed(1)} 分钟，并提前启动 {reviewCase.earlyTasks.length} 项协同任务；以上均为演示结果。</p>
      </EventCard>
      <div className="grid grid-cols-2 gap-1.5">
        <StageMetric label="到场时间变化" value={`缩短 ${etaDelta.toFixed(1)} 分钟`} />
        <StageMetric label="提前执行任务" value={`${reviewCase.earlyTasks.length} 项`} />
        <div className="col-span-2"><StageMetric label="资源成本变化" value={selectedPlan.resourceCost} /></div>
      </div>
      <section className="rounded-xl border border-line bg-white p-2.5">
        <h3 className="text-label font-semibold text-ink-1">原处置时间线 / CityOS 方案时间线</h3>
        <div className="mt-2 space-y-2">
          <MiniTimeline label="原处置" items={reviewCase.originalTimeline.map((item) => `${item.time} ${item.label}`)} dashed />
          <MiniTimeline label="CityOS" items={reviewCase.runs.cityos.timeline.map((item) => `${item.label} ${item.detail}`)} />
        </div>
      </section>
      <ComparisonList title="提前执行的任务" items={reviewCase.earlyTasks} tone="positive" />
      <ComparisonList title="当前假设下可规避的受阻点" items={reviewCase.avoidedBlockers} tone="positive" />
      <ComparisonList title="增加的资源成本" items={[reviewCase.resourceDelta]} />
      <ComparisonList title="未解决的风险" items={reviewCase.unresolvedRisks} tone="warning" />
      <EventCard variant="dashed" className="border-[#D59B28]">
        <div className="text-label font-semibold text-[#8A5A14]">数据与推演边界</div>
        <p className="mt-1 text-label leading-relaxed text-[#76510E]">{reviewCase.boundary}</p>
      </EventCard>
      <button type="button" onClick={onOpenReport} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white hover:bg-[#4D4DC2]"><FileText size={12} />打开完整复盘报告</button>
    </div>
  )
}

function StageMetric({ label, value }: { label: string; value: string }) {
  return <EventCard variant="sunken" className="min-w-0 px-2 py-1.5"><div className="truncate text-footnote text-ink-3">{label}</div><div className="mt-0.5 break-words text-label font-semibold leading-tight text-ink-1">{value}</div></EventCard>
}

function MiniTimeline({ label, items, dashed = false }: { label: string; items: string[]; dashed?: boolean }) {
  return <div className="grid grid-cols-[48px_minmax(0,1fr)] items-start gap-2"><span className="text-footnote font-semibold text-ink-2">{label}</span><div className="flex min-w-0 items-start gap-1">{items.map((item, index) => <div key={item} className="contents">{index > 0 && <span className={`mt-2 min-w-2 flex-1 border-t ${dashed ? 'border-dashed border-[#D59B28]' : 'border-accent-strong'}`} />}<span className="max-w-[86px] text-center text-[9px] leading-tight text-ink-2">{item}</span></div>)}</div></div>
}

function ComparisonList({ title, items, tone = 'neutral' }: { title: string; items: string[]; tone?: 'neutral' | 'positive' | 'warning' }) {
  const style = tone === 'positive' ? 'border-[#CDE8D9] bg-[#F4FBF7]' : tone === 'warning' ? 'border-[#E9D29A] bg-[#FFF9EA]' : 'border-line bg-white'
  return <section className={`rounded-xl border p-2.5 ${style}`}><h3 className="text-label font-semibold text-ink-1">{title}</h3><div className="mt-1.5 space-y-1">{items.map((item) => <div key={item} className="flex gap-1.5 text-label leading-relaxed text-ink-2"><Check size={11} className="mt-0.5 shrink-0 text-accent-strong" />{item}</div>)}</div></section>
}
