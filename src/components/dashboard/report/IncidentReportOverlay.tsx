import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, LockKeyhole, PencilLine, Printer, RotateCcw, Save, ShieldAlert, X } from 'lucide-react'

import { resolveAssignments } from '../workflow/ApprovedOutputs'
import { recalculateMetrics } from '../workflow/state'
import type { DataLabel, DomainFixture, PlanReportEdits, WorkflowSession } from '../workflow/types'

type ReportView = 'brief' | 'plan' | 'command-task' | 'task' | 'result'

const DATA_LABEL_TONE: Record<DataLabel, 'blue' | 'green' | 'amber' | 'red'> = {
  公开事实: 'green',
  演示事件: 'amber',
  模型估算: 'blue',
  待核实: 'red',
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section className="report-section">
      <h2><span>{number}</span>{title}</h2>
      {children}
    </section>
  )
}

function MetaBadge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'amber' | 'red' }) {
  return <span className={`report-badge report-badge-${tone}`}>{children}</span>
}

/**
 * 报告编号必须能区分同一事件下的四份报告。原来只拼 scenarioId + 方案 id + 版本，
 * 简报和方案报告 A 都得到 liwan-fire-A-v1，评审时无法引用具体某一份。
 */
const REPORT_KIND_CODE: Record<ReportView, string> = {
  brief: 'BRIEF',
  plan: 'PLAN',
  'command-task': 'CMD-TASK',
  task: 'OWNER-TASK',
  result: 'RESULT',
}

/** 从生成时间取「月日时分秒」做流水号，同一份报告在打开期间保持不变 */
function reportSerial(generatedAt: string) {
  const digits = generatedAt.replace(/\D/g, '')
  return digits.length > 4 ? digits.slice(4) : digits
}

function trimTail(text: string) {
  return text.replace(/[。；;，,、\s]+$/u, '')
}

function deliveryLabel(status: WorkflowSession['deliveryStatus']) {
  if (status === 'pending-send') return '待下发'
  if (status === 'delivered') return '已送达'
  if (status === 'acknowledged') return '已签收'
  if (status === 'executing') return '执行中'
  if (status === 'abnormal') return '执行异常'
  if (status === 'completed') return '已闭环'
  return '草案'
}

function visibleDataLabel(label: DataLabel) {
  if (label === '演示事件') return '事件输入'
  if (label === '模型估算') return '条件估算'
  return label
}

function createReportDraft(session: WorkflowSession, selectedPlanId: string): PlanReportEdits {
  return {
    selectedPlanId,
    resourceCount: session.resourceCount,
    fireOptionId: session.fireOptionId,
    medicalOptionId: session.medicalOptionId,
    trafficOptionId: session.trafficOptionId,
    decisionNote: session.decisionNote,
  }
}

export default function IncidentReportOverlay({
  fixture,
  session: savedSession,
  selectedPlan,
  view,
  generatedAt,
  initiallyEditing = false,
  persistenceState = 'offline-demo',
  persistenceMessage = '离线演示：修改只保留在当前浏览器会话。',
  onApplyPlanEdits,
  onApprovePlan,
  onClose,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  selectedPlan: DomainFixture['plans'][number]
  view: ReportView
  generatedAt: string
  initiallyEditing?: boolean
  persistenceState?: 'offline-demo' | 'loading' | 'ready' | 'saving' | 'error'
  persistenceMessage?: string
  onApplyPlanEdits?: (edits: PlanReportEdits) => boolean | Promise<boolean>
  onApprovePlan?: (planId: string) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstEditorControlRef = useRef<HTMLInputElement>(null)
  const isCommandTask = view === 'command-task'
  const isOwnerTask = view === 'task'
  const isResult = view === 'result'
  const isTaskPackage = isCommandTask || isOwnerTask
  const isPlan = view === 'plan'
  const editLocked = ['delivered', 'acknowledged', 'executing', 'completed'].includes(savedSession.deliveryStatus)
  const [isEditing, setIsEditing] = useState(isPlan && initiallyEditing && !editLocked)
  const [isApplying, setIsApplying] = useState(false)
  const baselineDraft = useMemo(
    () => createReportDraft(savedSession, selectedPlan.id),
    [savedSession, selectedPlan.id],
  )
  const [draft, setDraft] = useState<PlanReportEdits>(() => createReportDraft(savedSession, selectedPlan.id))
  const previewMetrics = useMemo(
    () => recalculateMetrics(
      fixture,
      draft.resourceCount,
      draft.fireOptionId,
      draft.medicalOptionId,
      draft.trafficOptionId,
    ),
    [fixture, draft.resourceCount, draft.fireOptionId, draft.medicalOptionId, draft.trafficOptionId],
  )
  const draftDirty = isPlan && (
    draft.selectedPlanId !== savedSession.selectedPlanId
    || draft.resourceCount !== savedSession.resourceCount
    || draft.fireOptionId !== savedSession.fireOptionId
    || draft.medicalOptionId !== savedSession.medicalOptionId
    || draft.trafficOptionId !== savedSession.trafficOptionId
    || draft.decisionNote.trim() !== savedSession.decisionNote
  )
  const dirtyFieldCount = [
    draft.selectedPlanId !== savedSession.selectedPlanId,
    draft.resourceCount !== savedSession.resourceCount,
    draft.fireOptionId !== savedSession.fireOptionId,
    draft.medicalOptionId !== savedSession.medicalOptionId,
    draft.trafficOptionId !== savedSession.trafficOptionId,
    draft.decisionNote.trim() !== savedSession.decisionNote,
  ].filter(Boolean).length
  // 报告正文始终展示已保存版本，编辑中的变化只进入右侧预览；这样即使浏览器
  // 直接触发打印，也不会把尚未应用的草案误导出成正式报告。
  const session = savedSession
  const resetDraft = useCallback(() => setDraft(createReportDraft(savedSession, selectedPlan.id)), [savedSession, selectedPlan.id])
  const cancelEditing = useCallback(() => {
    if (isApplying) return
    if (draftDirty && !window.confirm('放弃尚未应用的方案修改吗？')) return
    resetDraft()
    setIsEditing(false)
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [draftDirty, isApplying, resetDraft])
  const requestClose = useCallback(() => {
    if (isApplying) return
    if (isEditing && draftDirty && !window.confirm('当前方案修改尚未应用，关闭报告后将丢失。是否继续？')) return
    onClose()
  }, [draftDirty, isApplying, isEditing, onClose])
  const beginEditing = () => {
    resetDraft()
    setIsEditing(true)
  }
  const applyDraft = async () => {
    if (!draftDirty || editLocked || isApplying || !onApplyPlanEdits) return
    setIsApplying(true)
    try {
      const applied = await onApplyPlanEdits({ ...draft, decisionNote: draft.decisionNote.trim() })
      if (applied) setIsEditing(false)
    } finally {
      setIsApplying(false)
    }
  }

  useEffect(() => {
    if (!isEditing) setDraft(baselineDraft)
  }, [baselineDraft, isEditing])

  useEffect(() => {
    if (!isEditing) return
    requestAnimationFrame(() => firstEditorControlRef.current?.focus())
  }, [isEditing])

  const reportTitle = view === 'brief'
    ? '城市事件 AI 态势简报'
    : view === 'plan'
      ? `城市事件应急响应方案报告（方案 ${selectedPlan.label}）`
      : isCommandTask
        ? '指挥任务包'
        : isOwnerTask
          ? '负责人任务包'
          : '城市事件应急处置结果报告'
  const currentPlan = selectedPlan.id === session.selectedPlanId
  const approved = currentPlan && session.approvedPlanId === selectedPlan.id && session.approvedVersion === session.planVersion
  const reportEta = currentPlan ? session.etaMinutes : selectedPlan.etaMinutes
  const reportRisk = currentPlan ? session.coverageRisk : selectedPlan.coverageRisk
  const metricSource = currentPlan ? `方案 v${session.planVersion} 当前重算` : '候选初始估算'
  const owner = fixture.defaultOwner
  const departments = resolveAssignments(fixture, { ...session, selectedPlanId: selectedPlan.id })
  const inputRows = (fixture.inputFields ?? []).map((field) => ({
    label: field.label,
    value: session.inputValues[field.id] || field.value || '未填写',
  }))
  const inputLabels = new Set(inputRows.map((item) => item.label))
  const confirmedEvidenceRows = fixture.brief.confirmed.filter((item) => !inputLabels.has(item.label))
  // 态势结论来自本次输入里标了 summaryRank 的核心事实；没有输入表的场景退回已登记项
  const coreFacts = (fixture.inputFields ?? [])
    .filter((field) => typeof field.summaryRank === 'number')
    .sort((a, b) => (a.summaryRank ?? 0) - (b.summaryRank ?? 0))
    .map((field) => trimTail(`${field.summaryPrefix ?? ''}${session.inputValues[field.id] || field.value || ''}`))
    .filter((text) => text.length > 0)
  const evidenceSources = [...new Set(fixture.brief.confirmed.map((item) => item.source))].join('、')
  const pendingLabels = fixture.brief.unknown.map((item) => item.label).join('、')
  const evidenceParts = [
    inputRows.length ? `本次会话输入 ${inputRows.length} 项` : '',
    evidenceSources ? `证据来源：${evidenceSources}` : '',
    pendingLabels ? `${pendingLabels}待现场核实` : '',
  ].filter(Boolean)
  const fallbackSummary = fixture.brief.confirmed.slice(0, 2).map((item) => `${item.label}：${item.value}`).join('；')
  const situationSummary = session.briefCorrections?.conclusion
    || (coreFacts.length ? `${coreFacts.join('；')}。` : '')
    || fallbackSummary
    || fixture.title
  const triggerBasis = session.briefCorrections?.evidence
    || (evidenceParts.length ? `${evidenceParts.join('；')}。` : '')
    || fallbackSummary
    || '以当前会话输入为准'
  const keyAssumptions = session.briefCorrections?.gaps || fixture.brief.gaps.slice(0, 2).map((item) => `${item.label}：${item.value}`).join('；') || '无额外已登记假设'
  const reportRisks = [...fixture.brief.gaps, ...fixture.brief.unknown]
  const contactSummary = [...new Set(departments.map((item) => item.contact))].join('；') || '系统任务包'
  const reportDelivered = approved && session.deliveryStatus !== 'draft' && session.deliveryStatus !== 'pending-send'
  const reportDecisionNote = currentPlan ? session.decisionNote : ''
  const fastestPlan = fixture.plans.reduce((fastest, plan) => plan.etaMinutes < fastest.etaMinutes ? plan : fastest, selectedPlan)
  const reportNumber = `${fixture.scenarioId}-${view === 'plan' ? `PLAN-${selectedPlan.id}` : REPORT_KIND_CODE[view]}-v${session.planVersion}-${reportSerial(generatedAt)}`
  const versionUpdatedAt = session.versionUpdatedAt || generatedAt
  const currentExecutionLabel = `方案 ${selectedPlan.label}（${approved ? '已批准' : '待批准'}）`
  const primaryActions = departments[0]?.task.split(/[、，]/u).map((item) => item.trim()).filter(Boolean) ?? selectedPlan.actions
  const resourceRows = [...new Set(departments.map((row) => `${row.department} ${row.personnel} / ${row.vehicles}`))]
  const resourceOverview = resourceRows.join('；')
  const dispatchSelectionSummary = currentPlan
    ? [
        `${fixture.fireDispatch.title}：${fixture.fireDispatch.options.find((option) => option.id === session.fireOptionId)?.label.replace(/ · 演示$/, '') ?? '未配置'}`,
        `${fixture.medicalDispatch.title}：${fixture.medicalDispatch.options.find((option) => option.id === session.medicalOptionId)?.label.replace(/ · 演示$/, '') ?? '未配置'}`,
        `${fixture.trafficDispatch.title}：${fixture.trafficDispatch.options.find((option) => option.id === session.trafficOptionId)?.label.replace(/ · 演示$/, '') ?? '未配置'}`,
      ].join('；')
    : '候选模板未绑定本次调度配置；选择或编辑后写入当前版本。'
  const dataNote = fixture.dataNote.replaceAll('演示', '演示')
  const resultStatus = session.deliveryStatus === 'completed' ? '全部完成' : deliveryLabel(session.deliveryStatus)
  const firstArrivalAt = session.firstArrivalAt || '未回传'
  const executionStartedAt = session.executionStartedAt || '未记录'
  const executionCompletedAt = session.executionCompletedAt || '未记录'
  const abnormalFeedback = session.hasReplanned
    ? `曾发生异常并完成 ${session.retryCount} 次受控重试`
    : '无异常回传'
  const personnelResult = fixture.id === 'fire'
    ? '疏散与救援任务已回传；量化人数未登记'
    : fixture.id === 'medical'
      ? '救援与转运任务已回传；患者分级以现场记录为准'
      : '人员相关任务已回传；量化结果未登记'
  const reportSourceLabel = isResult ? '执行回执汇总' : metricSource
  // ETA 要带作用域和批准状态；只写「6.9 分钟」会被读成整起事件的到场时间
  const estimateLine = `${currentPlan ? '当前' : '候选'}方案 ${selectedPlan.label} · ${fixture.metricScopeLabel} ETA ${reportEta.toFixed(1)} 分钟（条件估算，${approved ? '已人工批准' : '待人工批准'}）`
  const printableStatus = approved
    ? `方案 ${selectedPlan.label} · v${session.planVersion} · 已人工批准`
    : currentPlan
      ? `方案 ${selectedPlan.label} · v${session.planVersion} · 草案待批准`
      : `方案 ${selectedPlan.label} · 候选预览待选择`
  const savedReportEta = selectedPlan.id === savedSession.selectedPlanId ? savedSession.etaMinutes : selectedPlan.etaMinutes
  const savedReportRisk = selectedPlan.id === savedSession.selectedPlanId ? savedSession.coverageRisk : selectedPlan.coverageRisk
  const editableLevers: Array<{
    key: 'fireOptionId' | 'medicalOptionId' | 'trafficOptionId'
    lever: DomainFixture['fireDispatch']
    note: string
  }> = [
    { key: 'fireOptionId', lever: fixture.fireDispatch, note: '影响主责力量编组与到场估算' },
    { key: 'medicalOptionId', lever: fixture.medicalDispatch, note: '影响医疗接应与转运协同' },
    { key: 'trafficOptionId', lever: fixture.trafficDispatch, note: '影响通行保障与路线条件' },
  ]
  const updateResourceCount = (value: number) => {
    if (!Number.isFinite(value)) return
    setDraft((current) => ({
      ...current,
      resourceCount: Math.min(fixture.maxResources, Math.max(fixture.minResources, Math.round(value))),
    }))
  }

  useEffect(() => {
    if (isEditing) firstEditorControlRef.current?.focus()
    else headingRef.current?.focus()
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (isEditing) cancelEditing()
        else requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (active === headingRef.current) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDialogKeys)
    return () => document.removeEventListener('keydown', handleDialogKeys)
  }, [cancelEditing, isEditing, requestClose])

  return (
    <div ref={dialogRef} className="report-overlay fixed inset-0 z-[90] overflow-y-auto bg-[#EEF2F7]" role="dialog" aria-modal="true" aria-labelledby="cityos-report-title">
      <div className="no-print sticky top-0 z-10 flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-[#DDE4EE] bg-white/95 px-4 py-2 shadow-sm backdrop-blur">
        <button type="button" onClick={requestClose} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-label font-semibold text-ink-2 hover:bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"><ArrowLeft size={14} />返回事件详情</button>
        {isPlan && (
          <div className="report-state-rail" aria-label="方案报告状态：系统生成、人工编辑、人工批准">
            <span className="is-complete">1 系统生成</span><i />
            <span className={isEditing ? 'is-active' : savedSession.planVersion > 1 ? 'is-complete' : ''}>2 人工编辑</span><i />
            <span className={approved && !isEditing ? 'is-complete' : ''}>3 人工批准</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <MetaBadge tone="blue">即时生成 · {reportSourceLabel}</MetaBadge>
          <MetaBadge tone={isEditing ? 'amber' : approved ? 'green' : 'amber'}>{isEditing ? `编辑中 · ${dirtyFieldCount} 项未应用` : approved ? '当前版本已人工批准' : currentPlan ? '草案 · 待人工批准' : '候选预览 · 待选择'}</MetaBadge>
          {isPlan && !isEditing && (
            <button
              type="button"
              disabled={editLocked || !onApplyPlanEdits}
              onClick={beginEditing}
              title={editLocked ? '任务已进入执行或办结，当前版本不可直接编辑' : undefined}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#C9DBF8] bg-[#F7FAFF] px-3 text-label font-semibold text-[#2768CA] hover:bg-[#EEF4FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:border-line disabled:bg-page disabled:text-ink-3"
            >
              {editLocked ? <LockKeyhole size={13} /> : <PencilLine size={13} />}{approved ? '基于当前版本调整' : '编辑方案'}
            </button>
          )}
          {isPlan && !isEditing && (
            <button
              type="button"
              disabled={approved || editLocked || !onApprovePlan}
              onClick={() => onApprovePlan?.(selectedPlan.id)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-strong px-3 text-label font-semibold text-white hover:bg-[#4D4DC2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3"
            >
              <CheckCircle2 size={13} />{approved ? '已人工批准' : currentPlan ? '人工批准当前版本' : '选择并人工批准'}
            </button>
          )}
          <button type="button" disabled={isEditing} title={isEditing ? '请先应用或取消当前修改，再导出已保存版本' : undefined} onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-label font-semibold text-ink-1 hover:bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed disabled:bg-page disabled:text-ink-3"><Printer size={13} />打印 / 导出 PDF</button>
          <button type="button" onClick={requestClose} aria-label="关闭报告" className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-2 hover:bg-page focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"><X size={14} /></button>
        </div>
      </div>

      <main id="cityos-report" data-report-kind={view} data-report-number={reportNumber} data-report-version={session.planVersion} data-report-state={isEditing ? 'editing' : approved ? 'approved' : 'draft'} data-version-updated-at={versionUpdatedAt} data-execution-plan={currentExecutionLabel} data-delivery-status={deliveryLabel(session.deliveryStatus)} className="report-document mx-auto my-5 w-[calc(100%-2rem)] max-w-[1120px] rounded-[14px] bg-white px-10 py-8 shadow-[0_16px_50px_rgb(35_48_73_/_0.14)]">
        <header className="report-header">
          <div className="report-kicker">CITY OS · 城市应急协同</div>
          <h1 id="cityos-report-title" ref={headingRef} tabIndex={-1}>{reportTitle}</h1>
          <p>{fixture.title}</p>
          <div className="report-meta">
            <span>报告编号 {reportNumber}</span><i />
            <span>生成时间 {generatedAt}</span><i />
            <span>版本更新时间 {versionUpdatedAt}</span><i />
            <span>报告状态：{printableStatus}</span><i />
            <span>{reportSourceLabel}</span><i />
            <span>数据口径：{dataNote}</span>
          </div>
        </header>

        <div className="report-alert">
          <div className="report-alert-icon"><ShieldAlert size={18} /></div>
          <div>
            <strong>{view === 'brief' ? '当前态势与证据缺口' : view === 'plan' ? '当前候选方案结果' : isCommandTask ? '当前指挥任务包' : isOwnerTask ? '当前负责人任务包' : '事件执行与办结结果'}</strong>
            <p>{view === 'brief' ? situationSummary : view === 'plan' ? `${selectedPlan.summary}${isEditing ? '下方修改只在本地草案中预览，应用后才生成新版本并使原批准失效。' : currentPlan ? `当前数值来自本次会话 v${session.planVersion} 重算，不沿用候选模板旧值。` : '当前数值为该候选的初始估算，未按本次会话重算。'}` : isCommandTask ? `以已批准方案为执行依据，汇总事件事实、人员资源、路线时限、部门任务和回传要求。` : isOwnerTask ? `${departments.length} 项负责人任务由人工批准版本生成；批准状态与下发状态分别记录。` : `本报告记录方案 ${selectedPlan.label} 点击执行后的任务状态、实际投入、回传结果与办结状态，不再复用候选方案内容。`}</p>
          </div>
          {view === 'brief' ? (
            <div className="report-metrics"><b>{inputRows.length}</b><span>本次输入字段</span><b>{fixture.brief.confirmed.length}</b><span>已确认项</span><b>{fixture.brief.unknown.length}</b><span>待核实项</span><b>v{session.planVersion}</b><span>当前会话版本</span></div>
          ) : view === 'plan' ? (
            <div className="report-metrics"><b>方案 {selectedPlan.label}</b><span>{currentPlan ? '当前选择' : '候选预览'}</span><b>{session.resourceCount} {fixture.resourceUnit}</b><span>当前{fixture.resourceLabel}投入</span><b>{reportEta.toFixed(1)} 分钟</b><span>{fixture.metricScopeLabel}预计首批到场 · {metricSource}</span><b>{reportRisk}</b><span>资源覆盖风险（不代表整体事件风险）· {metricSource}</span></div>
          ) : isCommandTask ? (
            <div className="report-metrics"><b>{currentExecutionLabel}</b><span>当前执行方案</span><b>{departments.length}</b><span>协同任务</span><b>{reportEta.toFixed(1)} 分钟</b><span>预计首批到场</span><b>v{session.planVersion}</b><span>任务包版本 · {versionUpdatedAt}</span></div>
          ) : isOwnerTask ? (
            <div className="report-metrics"><b>{departments.length}</b><span>负责人任务</span><b>v{session.planVersion}</b><span>任务包版本 · {versionUpdatedAt}</span><b>{deliveryLabel(session.deliveryStatus)}</b><span>下发状态</span><b>{approved ? '已批准' : '待批准'}</b><span>人工门禁</span></div>
          ) : (
            <div className="report-metrics"><b>{resultStatus}</b><span>任务完成状态</span><b>{firstArrivalAt}</b><span>实际首批到场</span><b>{resourceRows.length}</b><span>实际投入单元</span><b>{session.deliveryStatus === 'completed' ? '已办结' : '未办结'}</b><span>事件办结状态</span></div>
          )}
        </div>

        {isPlan && isEditing && (
          <section className="report-editor no-print" aria-labelledby="plan-report-editor-title">
            <div className="report-editor-heading">
              <div>
                <span>人工调整草案</span>
                <h2 id="plan-report-editor-title">编辑方案执行参数</h2>
                <p>仅开放已接入重算和任务包的结构化字段；事件证据、报告编号、负责人及审计信息保持只读。</p>
              </div>
              <MetaBadge tone={draftDirty ? 'amber' : 'blue'}>{draftDirty ? `${dirtyFieldCount} 项待应用` : '尚未修改'}</MetaBadge>
            </div>

            <div className="report-editor-layout">
              <div className="report-editor-controls">
                <label className="report-control" htmlFor="plan-report-resource-range">
                  <span className="report-control-label"><b>{fixture.resourceLabel}</b><small>允许范围 {fixture.minResources}–{fixture.maxResources} {fixture.resourceUnit}</small></span>
                  <div className="report-resource-control">
                    <input
                      ref={firstEditorControlRef}
                      id="plan-report-resource-range"
                      type="range"
                      min={fixture.minResources}
                      max={fixture.maxResources}
                      value={draft.resourceCount}
                      onChange={(event) => updateResourceCount(Number(event.target.value))}
                      aria-describedby="plan-report-resource-value"
                    />
                    <div className="report-number-input">
                      <input
                        type="number"
                        min={fixture.minResources}
                        max={fixture.maxResources}
                        value={draft.resourceCount}
                        onChange={(event) => updateResourceCount(Number(event.target.value))}
                        aria-label={`${fixture.resourceLabel}数量`}
                      />
                      <span id="plan-report-resource-value">{fixture.resourceUnit}</span>
                    </div>
                  </div>
                </label>

                {editableLevers.map(({ key, lever, note }) => (
                  <label className="report-control" key={key} htmlFor={`plan-report-${key}`}>
                    <span className="report-control-label"><b>{lever.title}</b><small>{note}</small></span>
                    <select
                      id={`plan-report-${key}`}
                      value={draft[key]}
                      onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                    >
                      {lever.options.map((option) => (
                        <option key={option.id} value={option.id}>{option.label.replace(/ · 演示$/, '')}</option>
                      ))}
                    </select>
                  </label>
                ))}

                <label className="report-control" htmlFor="plan-report-decision-note">
                  <span className="report-control-label"><b>人工决策说明</b><small>记录调整依据；不替代事件证据和审批记录</small></span>
                  <textarea
                    id="plan-report-decision-note"
                    rows={3}
                    value={draft.decisionNote}
                    maxLength={500}
                    placeholder="例如：根据现场通行反馈，调整医疗接应与资源投入。"
                    onChange={(event) => setDraft((current) => ({ ...current, decisionNote: event.target.value }))}
                  />
                </label>
              </div>

              <aside className="report-editor-preview" aria-live="polite" aria-label="方案修改预览">
                <div className="report-editor-preview-head">
                  <div><span>实时重算预览</span><strong>方案 {selectedPlan.label}</strong></div>
                  <MetaBadge tone="amber">仅演示 · 未应用</MetaBadge>
                </div>
                <div className="report-editor-preview-metrics">
                  <div><span>{fixture.metricScopeLabel} ETA</span><strong>{previewMetrics.etaMinutes.toFixed(1)} 分钟</strong><small>{savedReportEta.toFixed(1)} → {previewMetrics.etaMinutes.toFixed(1)}</small></div>
                  <div><span>资源覆盖风险</span><strong>{previewMetrics.coverageRisk}</strong><small>{savedReportRisk} → {previewMetrics.coverageRisk}</small></div>
                </div>
                <dl className="report-editor-diff">
                  <div><dt>版本</dt><dd>v{savedSession.planVersion} → 应用后 v{savedSession.planVersion + 1}</dd></div>
                  <div><dt>当前修改</dt><dd>{dirtyFieldCount ? `${dirtyFieldCount} 项结构化字段` : '暂无变化'}</dd></div>
                  <div><dt>批准影响</dt><dd>{savedSession.approvedVersion === savedSession.planVersion ? '应用后原批准与任务包失效' : '应用后仍需人工批准'}</dd></div>
                  <div><dt>联动范围</dt><dd>ETA、覆盖风险、资源总览、任务包与报告版本</dd></div>
                </dl>
                <p className="report-editor-boundary">A/B 方案本身不直接编造新的数值公式；ETA 与风险仅由资源数量及三类调度选项重算。</p>
                <p
                  role="status"
                  aria-live="polite"
                  className={`rounded-lg px-2 py-1.5 text-footnote leading-relaxed ${
                    persistenceState === 'error'
                      ? 'bg-[#FDF0F0] text-[#A3373C]'
                      : persistenceState === 'offline-demo'
                        ? 'bg-[#FFF7E6] text-[#8A5A14]'
                        : 'bg-[#EEF4FF] text-[#2768CA]'
                  }`}
                >
                  {persistenceMessage}
                </p>
                <div className="report-editor-actions">
                  <button type="button" disabled={isApplying} onClick={cancelEditing}><RotateCcw size={13} />取消修改</button>
                  <button type="button" disabled={!draftDirty || editLocked || isApplying} onClick={applyDraft}><Save size={13} />{isApplying ? '正在保存…' : '应用修改并重算'}</button>
                </div>
              </aside>
            </div>
          </section>
        )}

        <Section number="1" title={view === 'brief' ? '态势摘要' : view === 'plan' ? '方案摘要' : isCommandTask ? '指挥任务包摘要' : isOwnerTask ? '负责人任务包摘要' : '处置结果摘要'}>
          {isOwnerTask ? (
            <div className="report-summary-grid report-summary-grid-4">
              <div><span>总负责人</span><strong>{owner}</strong></div>
              <div><span>任务包版本 / 更新时间</span><strong>v{session.planVersion} · {versionUpdatedAt}</strong></div>
              <div><span>下发状态</span><strong>{deliveryLabel(session.deliveryStatus)}</strong></div>
              <div><span>人工门禁</span><strong>{approved ? currentExecutionLabel : '当前版本待批准'}</strong></div>
            </div>
          ) : view === 'brief' ? (
            <div className="report-summary-grid report-summary-grid-4">
              <div><span>态势结论</span><strong>{situationSummary}</strong></div>
              <div><span>证据依据</span><strong>{triggerBasis}</strong></div>
              <div><span>当前估算 · {metricSource}</span><strong>{estimateLine}</strong></div>
              <div><span>风险显示</span><strong>资源覆盖风险：{reportRisk}；现场信息缺口：{reportRisks.length} 项</strong></div>
            </div>
          ) : isResult ? (
            <div className="report-summary-grid report-summary-grid-4">
              <div><span>执行方案</span><strong>{currentExecutionLabel}</strong></div>
              <div><span>执行开始 / 结束</span><strong>{executionStartedAt}<br />{executionCompletedAt}</strong></div>
              <div><span>任务完成状态</span><strong>{resultStatus}</strong></div>
              <div><span>事件办结状态</span><strong>{session.deliveryStatus === 'completed' ? '已办结' : '未办结'}</strong></div>
            </div>
          ) : view === 'plan' ? (
            <div className="report-summary-grid report-summary-grid-4">
              <div><span>态势结论</span><strong>{situationSummary}</strong></div>
              <div><span>当前方案</span><strong>方案 {selectedPlan.label} · {selectedPlan.title}</strong></div>
              <div><span>调度配置</span><strong>{dispatchSelectionSummary}</strong></div>
              <div><span>当前估算 / 人工决策 · {metricSource}</span><strong>{estimateLine}；资源覆盖风险 {reportRisk}（不代表整体事件风险）；{reportDecisionNote || '未补充人工决策说明'}</strong></div>
            </div>
          ) : (
            <div className="report-summary-grid">
              <div><span>态势结论</span><strong>{situationSummary}</strong></div>
              <div><span>{isCommandTask ? '当前执行方案' : '当前方案'}</span><strong>{isCommandTask ? currentExecutionLabel : `方案 ${selectedPlan.label} · ${selectedPlan.title}`}</strong></div>
              <div><span>当前估算 / 人工决策 · {metricSource}</span><strong>{estimateLine}；资源覆盖风险 {reportRisk}（不代表整体事件风险）；{reportDecisionNote || '未补充人工决策说明'}</strong></div>
            </div>
          )}
        </Section>

        {(view === 'brief' || view === 'plan') && (
          <Section number="2" title="本次输入与证据边界">
            {/* 方案报告过去只列静态 brief 字段，读者看不到这一单实际填了什么，因此和简报共用同一张证据表 */}
            <table><thead><tr><th>信息类别</th><th>内容</th><th>来源</th><th>可信标记</th></tr></thead><tbody>
              {inputRows.map((item) => <tr key={`input-${item.label}`}><td>{item.label}</td><td>{item.value}</td><td>本次会话输入</td><td><MetaBadge tone="amber">事件输入 · 本次填写</MetaBadge></td></tr>)}
              {confirmedEvidenceRows.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td><td>{item.source}</td><td><MetaBadge tone={DATA_LABEL_TONE[item.dataLabel]}>{visibleDataLabel(item.dataLabel)} · {item.status.replaceAll('演示', '演示')}</MetaBadge></td></tr>)}
              {fixture.brief.unknown.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td><td>{item.source}</td><td><MetaBadge tone={DATA_LABEL_TONE[item.dataLabel]}>{visibleDataLabel(item.dataLabel)} · {item.status.replaceAll('演示', '演示')}</MetaBadge></td></tr>)}
            </tbody></table>
          </Section>
        )}

        {view === 'plan' && <>
          <Section number="3" title="候选方案对比">
            <p className="report-owner">候选初始估算只用于横向比较；当前选择采用本次会话 v{session.planVersion} 的重算值，最终仍由人工决定。</p>
            <div className="report-plan-grid">
              {fixture.plans.map((plan) => {
                const planIsCurrent = plan.id === session.selectedPlanId
                const planEta = planIsCurrent ? session.etaMinutes : plan.etaMinutes
                const planRisk = planIsCurrent ? session.coverageRisk : plan.coverageRisk
                return (
                  <article key={plan.id} className={plan.id === selectedPlan.id ? 'is-selected' : ''}>
                    <div className="report-plan-head"><span>方案 {plan.label}</span><span>{plan.id === fastestPlan.id && <MetaBadge tone="blue">初始时效优先</MetaBadge>}{plan.id === selectedPlan.id && <span style={{ marginLeft: 5 }}><MetaBadge tone={currentPlan ? 'green' : 'blue'}>{currentPlan ? '当前选择' : '本报告候选'}</MetaBadge></span>}</span></div>
                    <h3>{plan.title}</h3><p>{plan.summary}</p>
                    <dl>
                      <div><dt>方案目标</dt><dd>{plan.summary}</dd></div>
                      <div><dt>生成依据</dt><dd>{triggerBasis}</dd></div>
                      <div><dt>计算条件</dt><dd>{keyAssumptions}</dd></div>
                      <div><dt>行动顺序</dt><dd>{plan.actions.join(' → ')}</dd></div>
                      <div><dt>何时重算</dt><dd>待核实项变化后重算，并重新人工批准。</dd></div>
                      <div><dt>{planIsCurrent ? `v${session.planVersion} 当前重算` : '候选初始估算'}</dt><dd>{planEta.toFixed(1)} 分钟；覆盖风险 {planRisk}</dd></div>
                    </dl>
                  </article>
                )
              })}
            </div>
          </Section>

          <Section number="4" title="行动位置与时间边界">
            <div className="report-route-card">
              <div className="report-route-title"><span className="route-dot start">{fixture.resourceLabel.slice(0, 1)}</span><b>{fixture.resourceLabel}</b><span className="route-arrow">→</span><span className="route-dot end">事</span><b>{fixture.address.split('·')[0]}</b></div>
              <div className="report-route-line" data-primary-actions={primaryActions.join(' → ')}>{primaryActions.map((action, index) => <Fragment key={`${action}-${index}`}>{index > 0 && <i>›</i>}<span>{action}</span></Fragment>)}</div>
              <div className="report-route-stats">
                <span><b>{reportEta.toFixed(1)} 分钟</b> {metricSource}</span>
                {/* 候选初始值和当前重算值一样时不重复显示（预览候选方案报告的情况） */}
                {currentPlan && <span><b>{selectedPlan.etaMinutes.toFixed(1)} 分钟</b> 方案 {selectedPlan.label} 候选初始估算</span>}
                <span>不固化导航级路线；地图仅作场景示意</span>
              </div>
            </div>
            <p className="report-owner" data-resource-overview={resourceOverview}>资源总览：{resourceOverview}</p>
            <table><thead><tr><th>协同单元</th><th>行动位置</th><th>时间边界</th><th>任务</th><th>ETA / 来源</th><th>路线状态</th></tr></thead><tbody>
              {departments.map((row, index) => <tr key={`${row.department}-${row.location}-${row.task}-${index}`}><td>{row.department}</td><td>{row.location}</td><td>{row.window}</td><td>{row.task}</td><td>{row.eta}<br />{row.etaSource}</td><td>执行前复核</td></tr>)}
            </tbody></table>
          </Section>
        </>}

        {isCommandTask && <>
          <Section number="2" title="事件事实与态势依据">
            <table><thead><tr><th>信息类别</th><th>内容</th><th>来源</th><th>状态</th></tr></thead><tbody>
              {inputRows.map((item) => <tr key={`input-${item.label}`}><td>{item.label}</td><td>{item.value}</td><td>本次会话输入</td><td><MetaBadge tone="amber">事件输入 · 本次填写</MetaBadge></td></tr>)}
              {confirmedEvidenceRows.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td><td>{item.source}</td><td><MetaBadge tone={DATA_LABEL_TONE[item.dataLabel]}>{visibleDataLabel(item.dataLabel)} · {item.status.replaceAll('演示', '演示')}</MetaBadge></td></tr>)}
            </tbody></table>
            <p className="report-owner">态势摘要：{situationSummary}</p>
          </Section>

          <Section number="3" title="人员、资源、路线与时间窗">
            <p className="report-owner" data-resource-overview={resourceOverview}>资源总览：{resourceOverview}</p>
            <table><thead><tr><th>部门 / 负责人</th><th>人员</th><th>车辆</th><th>行动位置</th><th>时间窗</th><th>ETA / 来源</th></tr></thead><tbody>
              {departments.map((row, index) => <tr key={`${row.department}-${row.owner}-${index}`}><td><strong>{row.department}</strong><br />{row.owner}</td><td>{row.personnel}</td><td>{row.vehicles}</td><td>{row.location}</td><td>{row.window}</td><td>{row.eta}<br />{row.etaSource}</td></tr>)}
            </tbody></table>
          </Section>

          <Section number="4" title="部门任务、回传与送达">
            <table><thead><tr><th>部门</th><th>任务</th><th>回传要求</th><th>联系 / 送达</th><th>状态</th></tr></thead><tbody>
              {departments.map((row, index) => <tr key={`${row.department}-${row.task}-${index}`}><td>{row.department}</td><td>{row.task}</td><td>{row.feedback}</td><td>{row.contact}</td><td><MetaBadge tone={reportDelivered ? 'green' : 'amber'}>{reportDelivered ? deliveryLabel(session.deliveryStatus) : '待下发'}</MetaBadge></td></tr>)}
            </tbody></table>
            <p className="report-owner">总负责人：{owner} · 人工决策说明：{reportDecisionNote || '未补充人工决策说明'}</p>
          </Section>
        </>}

        {isOwnerTask && <>
          <Section number="2" title="完整负责人任务清单">
            <p className="report-owner">每一行均对应负责人任务包卡片的一项任务；任务、地点、时限、资源、回传、送达方式与 ETA 均来自当前任务包版本。</p>
            <table><thead><tr><th>部门 / 负责人</th><th>任务</th><th>地点 / 时限</th><th>人员 / 车辆</th><th>回传 / 送达</th><th>ETA / 状态</th></tr></thead><tbody>
              {departments.map((row, index) => <tr key={`${row.owner}-${row.task}-${index}`}><td><strong>{row.department}</strong><br />{row.owner}</td><td>{row.task}</td><td>{row.location}<br />{row.window}</td><td>{row.personnel}<br />{row.vehicles}</td><td>{row.feedback}<br />{row.contact}</td><td>{row.eta}<br />来源：{row.etaSource}<br /><MetaBadge tone={reportDelivered ? 'green' : 'amber'}>{reportDelivered ? deliveryLabel(session.deliveryStatus) : '待下发'}</MetaBadge></td></tr>)}
            </tbody></table>
          </Section>

          <Section number="3" title="任务包版本与送达说明">
            <div className="report-provenance">
              <p><MetaBadge tone="blue">任务包版本</MetaBadge> v{session.planVersion} · 共 {departments.length} 项负责人任务。</p>
              <p><MetaBadge tone="blue">版本更新时间</MetaBadge> {versionUpdatedAt}</p>
              <p><MetaBadge tone={approved ? 'green' : 'amber'}>人工门禁</MetaBadge> {approved ? `方案 ${selectedPlan.label} 的当前版本已批准。` : '当前版本尚未批准。'}</p>
              <p><MetaBadge tone={reportDelivered ? 'green' : 'amber'}>下发状态</MetaBadge> {deliveryLabel(session.deliveryStatus)}。</p>
              <p><MetaBadge tone="blue">联系方式</MetaBadge> {contactSummary}</p>
            </div>
          </Section>
        </>}

        {isResult && <>
          <Section number="2" title="执行时间与任务结果">
            <table><thead><tr><th>结果字段</th><th>执行记录</th></tr></thead><tbody>
              <tr><td>执行开始时间</td><td>{executionStartedAt}</td></tr>
              <tr><td>执行结束时间</td><td>{executionCompletedAt}</td></tr>
              <tr><td>任务完成状态</td><td>{resultStatus} · {departments.length} 项协同任务</td></tr>
              <tr><td>实际到场时间</td><td>{firstArrivalAt}</td></tr>
              <tr><td>实际投入资源</td><td>{resourceOverview}</td></tr>
              <tr><td>现场处置结果</td><td>{session.deliveryStatus === 'completed' ? departments.map((row) => `${row.department}：${row.task}`).join('；') : '执行结果尚未闭环'}</td></tr>
              <tr><td>异常回传</td><td>{abnormalFeedback}</td></tr>
              <tr><td>人员疏散 / 救援结果</td><td>{personnelResult}</td></tr>
              <tr><td>事件办结状态</td><td>{session.deliveryStatus === 'completed' ? '已办结' : '未办结'}</td></tr>
            </tbody></table>
          </Section>

          <Section number="3" title="任务完成与实际投入">
            <table><thead><tr><th>部门 / 负责人</th><th>完成任务</th><th>实际投入</th><th>结果回传</th><th>状态</th></tr></thead><tbody>
              {departments.map((row, index) => <tr key={`${row.department}-${row.owner}-result-${index}`}><td><strong>{row.department}</strong><br />{row.owner}</td><td>{row.task}</td><td>{row.personnel}<br />{row.vehicles}</td><td>{row.feedback}</td><td><MetaBadge tone={session.deliveryStatus === 'completed' ? 'green' : 'amber'}>{resultStatus}</MetaBadge></td></tr>)}
            </tbody></table>
          </Section>

          <Section number="4" title="异常与办结说明">
            <div className="report-provenance">
              <p><MetaBadge tone={session.hasReplanned ? 'amber' : 'green'}>异常回传</MetaBadge> {abnormalFeedback}。</p>
              <p><MetaBadge tone="blue">人员结果</MetaBadge> {personnelResult}。</p>
              <p><MetaBadge tone={session.deliveryStatus === 'completed' ? 'green' : 'amber'}>办结状态</MetaBadge> {session.deliveryStatus === 'completed' ? `执行于 ${executionCompletedAt} 完成，事件已办结。` : '事件尚未办结。'}</p>
            </div>
          </Section>
        </>}

        <Section number={view === 'brief' ? '3' : view === 'plan' ? '5' : isCommandTask ? '5' : isResult ? '5' : '4'} title="风险与信息缺口">
          <div className="report-risk-grid">
            {session.briefCorrections?.risk && <div><b className="p1">人工补充</b><strong>风险说明</strong><span>{session.briefCorrections.risk}</span><em>来自本次会话修改</em></div>}
            {reportRisks.map((item) => <div key={`${item.label}-${item.source}`}><b className="p1">待核实</b><strong>{item.label}</strong><span>{item.value}</span><em>{item.note || `核验来源：${item.source} · ${item.status}`}</em></div>)}
          </div>
        </Section>

        <Section number={view === 'brief' ? '4' : view === 'plan' ? '6' : isCommandTask ? '6' : isResult ? '6' : '5'} title="数据来源、真假说明与人工门禁">
          <div className="report-provenance">
            <p><MetaBadge tone="blue">数据说明</MetaBadge> {dataNote}</p>
            <p><MetaBadge tone="red">待核实</MetaBadge> {reportRisks.length ? reportRisks.map((item) => item.label).join('、') : '暂无已登记缺口'}；{isResult ? '办结时仍保留为后续复盘项。' : '执行前需由负责人复核。'}</p>
            <p><MetaBadge tone="green">人工门禁</MetaBadge> {isResult ? '本结果来自已人工批准的执行版本；调度维度变化后需重新生成结果报告。' : '未经人工批准不得生效；调度维度变化后旧批准和任务包失效。'}</p>
          </div>
        </Section>

        <footer className="report-signoff">
          <div><span>{isResult ? '执行方案 / 办结状态' : isTaskPackage ? '任务包版本 / 人工批准' : '人工批准'}</span><strong>{isResult ? `${currentExecutionLabel} · ${session.deliveryStatus === 'completed' ? '已办结' : '未办结'}` : approved ? `${isTaskPackage ? `v${session.planVersion} · ` : ''}方案 ${selectedPlan.label}${isTaskPackage ? '' : ` · v${session.planVersion}`}` : '待人工批准'}</strong></div>
          <div><span>{isResult ? '执行开始 / 结束' : '生成 / 版本更新'}</span><strong>{isResult ? `${executionStartedAt} · ${executionCompletedAt}` : `${generatedAt} · ${versionUpdatedAt} · ${metricSource}`}</strong></div>
          <div className="no-print"><button type="button" disabled={isEditing} title={isEditing ? '请先应用或取消当前修改' : undefined} onClick={() => window.print()}><Download size={14} />导出当前报告</button></div>
          {approved && <CheckCircle2 className="report-approved" size={34} aria-label="已人工批准" />}
        </footer>
      </main>
    </div>
  )
}
