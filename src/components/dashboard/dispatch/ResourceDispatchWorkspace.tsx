import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CircleDot,
  History,
  MessageSquareText,
  Send,
  Square,
  UsersRound,
} from 'lucide-react'

import { ChatAnswerCard, ChatErrorCard } from '../chat/ChatAnswerCard'
import { sendCityChat, CityChatApiError } from '../chat/chatClient'
import {
  answerToPlainText,
  type CityChatContext,
  type CityChatDispatchSkill,
  type CityChatHistoryMessage,
  type CityChatResponse,
} from '../chat/chatContract'
import { ChatServiceBadge } from '../chat/ChatServiceBadge'
import { useCityChatStatus } from '../chat/useCityChatStatus'
import { resolveAssignments } from '../workflow/ApprovedOutputs'
import type { TaskDispatchOverride, WorkflowSession } from '../workflow/types'
import { createDispatchDemoReply } from './dispatchDemoConversation'
import { resolveDispatchException, type ActiveDispatchEvent } from './activeEventDispatchModel'
import {
  DISPATCH_CASES,
  dispatchDisplayText,
  getDispatchEvent,
  getDispatchUnit,
  type DispatchAssignment,
  type DispatchCase,
  type DispatchOperation,
} from './dispatchData'

const STAGES = ['待下发', '已签收', '执行中', '等待反馈', '已完成'] as const
const DISPATCH_SKILL_META: Record<CityChatDispatchSkill, { label: string; question: string }> = {
  dispatch_triage: { label: '为什么优先？', question: '为什么优先处理这项任务？' },
  resource_compare: { label: '资源差异？', question: '候选资源有什么差异？' },
  impact_analysis: { label: '调整影响？', question: '调整会影响谁？请分析目标事件和来源事件的双向影响。' },
  dispatch_draft: { label: '生成草案', question: '根据当前已选资源生成一份待人工确认的调整草案。' },
}
const QUICK_SKILLS = Object.entries(DISPATCH_SKILL_META) as Array<[CityChatDispatchSkill, { label: string; question: string }]>

interface DispatchExchange {
  id: string
  question: string
  intentTag?: CityChatDispatchSkill
  response?: CityChatResponse
  proposedOptionId?: string
  error?: {
    message: string
    retryable: boolean
  }
}

function resolveStage(operation: DispatchOperation | undefined, session: WorkflowSession | undefined) {
  if (session?.deliveryStatus === 'completed') return 4
  if (session?.deliveryStatus === 'executing' || session?.deliveryStatus === 'abnormal') return 3
  if (session?.deliveryStatus === 'acknowledged') return 2
  if (operation?.status === 'sent' || session?.deliveryStatus === 'delivered') return 1
  return 0
}

function dispatchContextVersion(
  dispatchCase: DispatchCase,
  assignment: DispatchAssignment,
  operation: DispatchOperation,
  session: WorkflowSession,
) {
  return [
    dispatchCase.eventId,
    `plan-${session.planVersion}`,
    operation.status,
    assignment.primaryUnitId,
    assignment.assignedUnitIds.join('.'),
  ].join('-')
}

function dispatchContext(
  dispatchCase: DispatchCase,
  assignment: DispatchAssignment,
  operation: DispatchOperation,
  session: WorkflowSession,
): CityChatContext {
  const sources: CityChatContext['sources'] = [
    { id: 'dispatch-ticket', label: `${dispatchCase.taskLabel}（页面 Ticket）`, type: 'page' },
    { id: 'dispatch-trigger', label: dispatchCase.triggerSource, type: 'simulated' },
    { id: 'dispatch-snapshot', label: '当前页面资源快照', type: 'simulated' },
    { id: 'dispatch-history', label: dispatchCase.historyReference, type: 'page' },
  ]
  const facts: CityChatContext['facts'] = [
    { id: 'dispatch-task', label: '任务', value: dispatchCase.taskLabel, kind: 'simulated', sourceIds: ['dispatch-ticket'] },
    { id: 'dispatch-reason', label: '触发原因', value: dispatchCase.reason, kind: 'simulated', sourceIds: ['dispatch-trigger'] },
    { id: 'dispatch-summary', label: '当前资源摘要', value: dispatchCase.currentSummary, kind: 'simulated', sourceIds: ['dispatch-snapshot'] },
    { id: 'dispatch-primary', label: '当前主责', value: `${getDispatchUnit(assignment.primaryUnitId).name}；负责人 ${assignment.owner}`, kind: 'simulated', sourceIds: ['dispatch-snapshot'] },
    { id: 'dispatch-metrics', label: '当前指标', value: `ETA ${session.etaMinutes.toFixed(1)} 分钟；覆盖风险 ${session.coverageRisk}`, kind: 'simulated', sourceIds: ['dispatch-snapshot'] },
    { id: 'dispatch-draft-state', label: '草案状态', value: dispatchDisplayText(operation.message), kind: 'simulated', sourceIds: ['dispatch-snapshot'] },
    { id: 'dispatch-history-reference', label: '历史参考', value: dispatchCase.historyReference, kind: 'reported', sourceIds: ['dispatch-history'] },
  ]
  for (const difficulty of dispatchCase.difficulties) {
    facts.push(
      { id: `${difficulty.id}-observed`, label: `${difficulty.priority} ${difficulty.title}`, value: difficulty.observed, kind: 'simulated', sourceIds: ['dispatch-ticket'] },
      { id: `${difficulty.id}-constraint`, label: `${difficulty.title}的约束`, value: difficulty.constraint, kind: 'unknown', sourceIds: ['dispatch-ticket'] },
      { id: `${difficulty.id}-impact`, label: `${difficulty.title}的预期影响`, value: difficulty.expectedImpact, kind: 'simulated', sourceIds: ['dispatch-snapshot'] },
    )
  }
  const candidateOptions = dispatchCase.candidateUnitIds.map((unitId) => {
    const unit = getDispatchUnit(unitId)
    const sourceId = `candidate-${unit.id}`
    const statusLabel = unit.status === 'standby' ? '待命' : unit.status === 'enroute' ? '在途' : '现场'
    sources.push({ id: sourceId, label: `${unit.name} · 当前页面资源卡`, type: 'simulated' })
    facts.push({
      id: `${sourceId}-fact`,
      label: `候选资源：${unit.name}`,
      value: `状态 ${statusLabel}；位置 ${unit.location}；占用 ${unit.occupiedBy ?? '页面未显示占用'}；ETA ${unit.eta ?? '待重算'}；编成 ${unit.strength}`,
      kind: 'simulated',
      sourceIds: [sourceId],
    })
    return {
      id: unit.id,
      label: unit.name,
      summary: `${statusLabel} · ${unit.location} · ETA ${unit.eta ?? '待重算'} · ${unit.strength}`,
      impact: unit.occupiedBy
        ? `当前占用于“${unit.occupiedBy}”；选择前必须在右侧重算来源任务覆盖变化。`
        : '当前页面未显示占用；仍需在右侧重算 ETA 与覆盖影响。',
    }
  })
  return {
    contextVersion: dispatchContextVersion(dispatchCase, assignment, operation, session),
    entryPoint: 'event',
    title: dispatchCase.taskLabel,
    scopeLabel: '事件级 Ticket',
    facts,
    constraints: [
      '未签收不等于资源不可用，模型不能自行转移任务责任。',
      '跨事件抽调必须同时说明目标事件收益和来源事件覆盖变化。',
      '任何调整只能进入右侧草案；重算使旧批准失效，人工批准后才可下发。',
      '历史参考只用于比较约束和信息缺口，不覆盖今天的资源快照。',
    ],
    options: [
      ...candidateOptions,
      ...dispatchCase.difficulties.map((difficulty) => ({
        id: difficulty.id,
        label: difficulty.suggestedAction,
        summary: difficulty.observed,
        impact: difficulty.expectedImpact,
      })),
    ].slice(0, 10),
    sources,
    availableActions: [
      { id: 'compare-candidates', label: '比较候选资源', requiresApproval: false },
      { id: 'add-dispatch-draft', label: '加入调度草案', requiresApproval: true },
      { id: 'approve-dispatch-draft', label: '批准调度草案', requiresApproval: true },
    ],
  }
}

function workflowDispatchContext(event: ActiveDispatchEvent): CityChatContext {
  const assignments = resolveAssignments(event.fixture, event.session)
  const dispatchException = resolveDispatchException(event, assignments)
  const selectedPlan = event.fixture.plans.find((plan) => plan.id === event.session.selectedPlanId) ?? event.fixture.plans[0]
  const sources: CityChatContext['sources'] = [
    { id: 'workflow-event', label: `${event.title}（当前页面事件）`, type: 'page' },
    { id: 'workflow-task-package', label: `人工批准任务包 v${event.session.planVersion}`, type: 'simulated' },
    { id: 'workflow-feedback', label: '当前页面执行回传', type: 'simulated' },
  ]
  const facts: CityChatContext['facts'] = [
    { id: 'workflow-summary', label: '当前事件', value: `${event.domain}；${event.title}；${event.location}；${event.timeLabel}`, kind: event.kind === 'historical' ? 'reported' : 'simulated', sourceIds: ['workflow-event'] },
    { id: 'workflow-plan', label: '当前批准方案', value: `方案 ${selectedPlan.label}；${selectedPlan.title}；版本 v${event.session.planVersion}`, kind: 'simulated', sourceIds: ['workflow-task-package'] },
    { id: 'workflow-metrics', label: '当前调度摘要', value: `${assignments.length} 个协同任务；预计到场 ${event.session.etaMinutes.toFixed(1)} 分钟；状态 ${event.session.deliveryStatus}`, kind: 'simulated', sourceIds: ['workflow-task-package', 'workflow-feedback'] },
  ]
  for (const [index, assignment] of assignments.entries()) {
    facts.push({
      id: `workflow-assignment-${index + 1}`,
      label: `${assignment.department}任务`,
      value: `${assignment.task}；位置 ${assignment.location}；负责人 ${assignment.owner}；资源 ${assignment.vehicles}；回传 ${assignment.feedback}`,
      kind: 'simulated',
      sourceIds: ['workflow-task-package', 'workflow-feedback'],
    })
  }
  if (dispatchException) {
    facts.push({ id: 'workflow-exception', label: dispatchException.title, value: `${dispatchException.detail}；信号：${dispatchException.signals.join('、')}；建议：${dispatchException.action}`, kind: 'simulated', sourceIds: ['workflow-feedback'] })
  }
  return {
    contextVersion: `workflow-${event.id}-v${event.session.planVersion}-${event.session.deliveryStatus}-${dispatchException?.title ?? 'normal'}`,
    entryPoint: event.kind === 'historical' ? 'history' : 'event',
    title: event.title,
    scopeLabel: `${event.kind === 'historical' ? '历史案例' : '当前事件'} · 人工批准任务包 v${event.session.planVersion}`,
    facts,
    constraints: [
      '只能依据当前页面事件、任务包和执行回传进行解释，不得补充未提供的生产事实。',
      '页面中的资源状态、ETA、异常和替代方案来自当前任务包与规则计算，不得视为实时生产状态。',
      '助手可以解释与比较，但不能直接调派；任何资源切换都必须由人工选择并确认。',
      '确认调整后生成新任务包版本，仍需返回事件处置链人工下发。',
    ],
    options: dispatchException?.options.map((option) => ({ id: option.optionId, label: option.optionLabel, summary: `${option.location} · ${option.vehicles}`, impact: option.note })) ?? [],
    sources,
    availableActions: [
      { id: 'explain-dispatch-exception', label: '解释当前异常', requiresApproval: false },
      { id: 'compare-dispatch-options', label: '比较替代资源', requiresApproval: false },
      { id: 'apply-dispatch-resolution', label: '生成资源调整任务包', requiresApproval: true },
    ],
  }
}

function dispatchHistory(exchanges: DispatchExchange[], contextVersion: string): CityChatHistoryMessage[] {
  return exchanges.flatMap((exchange): CityChatHistoryMessage[] => {
    if (!exchange.response || exchange.response.contextVersion !== contextVersion) return []
    const messages: CityChatHistoryMessage[] = [{ role: 'user', content: exchange.question }]
    messages.push({ role: 'assistant', content: answerToPlainText(exchange.response.answer).slice(0, 3_800) })
    return messages
  }).slice(-10)
}

export function ResourceDispatchWorkspace({
  selectedCase,
  selectedAssignment,
  selectedOperation,
  selectedSession,
  assignments,
  operations,
  sessions,
  entryNotice,
  workflowEvent,
  selectedResolutionOptionId,
  promptRequest,
  onOpen,
  onSelectResolution,
  onApplyResolution,
}: {
  selectedCase: DispatchCase | null
  selectedAssignment: DispatchAssignment | null
  selectedOperation: DispatchOperation | null
  selectedSession: WorkflowSession | null
  assignments: Record<string, DispatchAssignment>
  operations: Record<string, DispatchOperation>
  sessions: Record<string, WorkflowSession>
  entryNotice?: string | null
  workflowEvent?: ActiveDispatchEvent | null
  selectedResolutionOptionId?: string
  promptRequest?: { id: string; text: string } | null
  onOpen: (eventId: string) => void
  onSelectResolution?: (optionId: string) => void
  onApplyResolution?: (resolution: TaskDispatchOverride) => void
}) {
  const [draft, setDraft] = useState('')
  const [threads, setThreads] = useState<Record<string, DispatchExchange[]>>({})
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const askRef = useRef<(question: string) => void>(() => undefined)
  const handledPromptIdRef = useRef<string | null>(null)
  const chatStatus = useCityChatStatus()
  const chatReady = chatStatus.state === 'ready' && chatStatus.value.configured
  const chatBlockedMessage = chatStatus.state === 'loading'
    ? '正在检查智能服务配置'
    : chatStatus.state === 'unreachable'
      ? '智能服务暂不可达，恢复后可提问'
      : chatStatus.value.configured
        ? null
        : '智能服务未配置，配置后可提问'
  const workflowException = workflowEvent
    ? resolveDispatchException(workflowEvent, resolveAssignments(workflowEvent.fixture, workflowEvent.session))
    : null
  const selectedWorkflowResolution = workflowException?.options.find((option) => option.optionId === selectedResolutionOptionId) ?? null
  const localDemoReady = Boolean(workflowEvent && workflowException)
  const conversationReady = chatReady || localDemoReady
  const composerBlockedMessage = conversationReady ? null : chatBlockedMessage
  const activeEventId = workflowEvent?.id ?? selectedCase?.eventId ?? null
  const exchanges = activeEventId ? threads[activeEventId] ?? [] : []

  useEffect(() => () => abortRef.current?.abort(), [])

  const priorityCases = useMemo(() => [...DISPATCH_CASES].sort((left, right) => {
    const leftAbnormal = getDispatchEvent(left).status === 'abnormal' ? 1 : 0
    const rightAbnormal = getDispatchEvent(right).status === 'abnormal' ? 1 : 0
    return rightAbnormal - leftAbnormal
  }).slice(0, 3), [])

  const ask = async (question: string, retryExchangeId?: string, intentTag?: CityChatDispatchSkill) => {
    const text = question.trim()
    const genericReady = selectedCase && selectedAssignment && selectedOperation && selectedSession
    if (!text || abortRef.current || (!workflowEvent && !genericReady)) return
    const eventId = workflowEvent?.id ?? selectedCase!.eventId
    const context = workflowEvent
      ? workflowDispatchContext(workflowEvent)
      : dispatchContext(selectedCase!, selectedAssignment!, selectedOperation!, selectedSession!)
    const previousExchanges = (threads[eventId] ?? []).filter((exchange) => exchange.id !== retryExchangeId)
    const exchange: DispatchExchange = {
      id: retryExchangeId ?? crypto.randomUUID(),
      question: text,
      intentTag,
    }
    const localReply = workflowEvent && workflowException
      ? createDispatchDemoReply({
          event: workflowEvent,
          exception: workflowException,
          question: text,
          requestId: exchange.id,
          contextVersion: context.contextVersion,
          intentTag,
        })
      : null
    if (localReply) {
      const completedExchange: DispatchExchange = {
        ...exchange,
        response: localReply.response,
        proposedOptionId: localReply.proposedOptionId,
      }
      setThreads((current) => ({
        ...current,
        [eventId]: retryExchangeId
          ? (current[eventId] ?? []).map((item) => item.id === retryExchangeId ? completedExchange : item)
          : [...(current[eventId] ?? []), completedExchange],
      }))
      setDraft('')
      if (localReply.proposedOptionId) onSelectResolution?.(localReply.proposedOptionId)
      return
    }
    if (!chatReady) {
      const unavailableExchange: DispatchExchange = {
        ...exchange,
        error: {
          message: '当前异常分析可识别页面中的候选资源名称；其他自由问答需要连接智能服务。',
          retryable: false,
        },
      }
      setThreads((current) => ({
        ...current,
        [eventId]: [...(current[eventId] ?? []), unavailableExchange],
      }))
      setDraft('')
      return
    }
    setThreads((current) => ({
      ...current,
      [eventId]: retryExchangeId
        ? (current[eventId] ?? []).map((item) => item.id === retryExchangeId ? exchange : item)
        : [...(current[eventId] ?? []), exchange],
    }))
    setDraft('')
    setGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await sendCityChat({
        assistant: 'dispatch',
        ...(intentTag ? { intentTag } : {}),
        conversationId: `dispatch-${eventId}`,
        message: { id: exchange.id, text },
        history: dispatchHistory(
          previousExchanges,
          context.contextVersion,
        ),
        context,
        locale: 'zh-CN',
      }, { signal: controller.signal })
      setThreads((current) => ({
        ...current,
        [eventId]: (current[eventId] ?? []).map((item) => item.id === exchange.id ? { ...item, response } : item),
      }))
    } catch (error) {
      const details = error instanceof DOMException && error.name === 'AbortError'
        ? { message: '已停止本次生成，当前问题仍可重试。', retryable: true }
        : error instanceof CityChatApiError
          ? { message: error.message, retryable: error.retryable }
          : { message: '智能服务暂时不可用，请稍后重试。', retryable: true }
      setThreads((current) => ({
        ...current,
        [eventId]: (current[eventId] ?? []).map((item) => item.id === exchange.id ? { ...item, error: details } : item),
      }))
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setGenerating(false)
      }
    }
  }

  askRef.current = (question) => void ask(question)

  useEffect(() => {
    if (!promptRequest || !workflowEvent || !conversationReady || abortRef.current || handledPromptIdRef.current === promptRequest.id) return
    handledPromptIdRef.current = promptRequest.id
    askRef.current(promptRequest.text)
  }, [conversationReady, promptRequest, workflowEvent])

  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel" aria-label="资源调度城安助手">
      <header className="shrink-0 border-b border-line bg-surface-card px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-accent-weak text-accent-strong"><Bot size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-title text-ink-1">城安助手</h1>
              <ChatServiceBadge status={chatStatus} compact />
            </div>
            <p className="mt-0.5 truncate text-label text-ink-3">围绕任务解释优先原因、资源差异和调整影响</p>
          </div>
        </div>

        {(workflowEvent || (selectedCase && selectedSession)) && (
          <div className="mt-3 grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto] items-center gap-2" aria-label="调度触发链路">
            <FlowNode active label="任务 Ticket" />
            <FlowLine active />
            <FlowNode active label="困难解释" />
             <FlowLine active={workflowEvent ? Boolean(selectedWorkflowResolution) : selectedOperation?.status !== 'idle'} />
             <FlowNode active={workflowEvent ? Boolean(selectedWorkflowResolution) : selectedOperation?.status !== 'idle'} label="调整草案" />
             <FlowLine active={workflowEvent ? workflowEvent.session.planVersion > 1 : selectedOperation?.status === 'approved' || selectedOperation?.status === 'sent'} />
             <FlowNode active={workflowEvent ? workflowEvent.session.planVersion > 1 : selectedOperation?.status === 'approved' || selectedOperation?.status === 'sent'} label="人工确认" />
          </div>
        )}
      </header>

      {entryNotice && (
        <div className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-dashed border-accent-strong/35 bg-accent-weak/45 px-3 py-2 text-label leading-relaxed text-ink-2">
          <History size={13} className="mt-0.5 shrink-0 text-accent-strong" />{entryNotice}
        </div>
      )}

      {workflowEvent ? (
        <>
          <WorkflowDispatchConversation
            event={workflowEvent}
            selectedOptionId={selectedResolutionOptionId ?? ''}
            exchanges={exchanges}
            generating={generating}
            chatReady={conversationReady}
            onAsk={(question, tag) => void ask(question, undefined, tag)}
            onRetry={(exchange) => void ask(exchange.question, exchange.id, exchange.intentTag)}
            onApplyResolution={(optionId) => {
              const resolution = workflowException?.options.find((option) => option.optionId === optionId)
              if (resolution) onApplyResolution?.(resolution)
            }}
          />
          <DispatchComposer
            draft={draft}
            generating={generating}
            chatReady={conversationReady}
            blockedMessage={composerBlockedMessage}
            onDraftChange={setDraft}
            onSubmit={(question, tag) => void ask(question, undefined, tag)}
            onStop={() => abortRef.current?.abort()}
          />
        </>
      ) : selectedCase && selectedAssignment && selectedOperation && selectedSession ? (
        <>
          <DispatchConversation
            dispatchCase={selectedCase}
            assignment={selectedAssignment}
            operation={selectedOperation}
            session={selectedSession}
            exchanges={exchanges}
            generating={generating}
            chatReady={chatReady}
            onAsk={(question, tag) => void ask(question, undefined, tag)}
            onRetry={(exchange) => void ask(exchange.question, exchange.id, exchange.intentTag)}
          />
          <DispatchComposer
            draft={draft}
            generating={generating}
            chatReady={chatReady}
            blockedMessage={chatBlockedMessage}
            onDraftChange={setDraft}
            onSubmit={(question, tag) => void ask(question, undefined, tag)}
            onStop={() => abortRef.current?.abort()}
          />
        </>
      ) : (
        <DispatchWelcome
          priorityCases={priorityCases}
          assignments={assignments}
          operations={operations}
          sessions={sessions}
          draft={draft}
          chatReady={chatReady}
          blockedMessage={chatBlockedMessage}
          onDraftChange={setDraft}
          onOpen={onOpen}
        />
      )}
    </section>
  )
}

function WorkflowDispatchConversation({
  event,
  selectedOptionId,
  exchanges,
  generating,
  chatReady,
  onAsk,
  onRetry,
  onApplyResolution,
}: {
  event: ActiveDispatchEvent
  selectedOptionId: string
  exchanges: DispatchExchange[]
  generating: boolean
  chatReady: boolean
  onAsk: (question: string, intentTag?: CityChatDispatchSkill) => void
  onRetry: (exchange: DispatchExchange) => void
  onApplyResolution: (optionId: string) => void
}) {
  const assignments = resolveAssignments(event.fixture, event.session)
  const dispatchException = resolveDispatchException(event, assignments)
  const selectedResolution = dispatchException?.options.find((option) => option.optionId === selectedOptionId) ?? null
  const exceptionAssignment = dispatchException
    ? assignments.find((assignment) => assignment.department === dispatchException.department && assignment.task === dispatchException.task) ?? null
    : null
  const contextVersion = workflowDispatchContext(event).contextVersion
  const conversationEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (exchanges.length === 0) return
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [exchanges, generating])
  const latestProposedExchangeId = [...exchanges].reverse().find((exchange) => (
    exchange.proposedOptionId && exchange.response?.contextVersion === contextVersion
  ))?.id
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-page px-5 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-center gap-2 text-footnote text-ink-3"><span className="h-px w-10 bg-line" />已从事件处置带入 · {event.timeLabel}<span className="h-px w-10 bg-line" /></div>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent-strong"><Bot size={16} /></span>
          <article className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-accent-strong/30 bg-white shadow-panel">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2"><span className="rounded px-1.5 py-0.5 text-footnote font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span><h2 className="min-w-0 flex-1 truncate text-title text-ink-1">{event.title}</h2><span className="rounded-full bg-accent-weak px-2 py-0.5 text-footnote font-semibold text-accent-strong">已绑定当前事故</span></div>
              <p className="mt-2 text-label text-ink-3">{event.location} · 任务包 v{event.session.planVersion} · {assignments.length} 项协同任务</p>
            </div>
            <section className={`border-y px-4 py-3 ${dispatchException ? 'border-[#F2CBCD] bg-[#FFF8F8]' : 'border-hairline bg-sunken'}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white ${dispatchException ? 'text-[#B42335]' : 'text-accent-strong'}`}>{dispatchException ? <AlertTriangle size={14} /> : <CircleDot size={14} />}</span>
                <div className="min-w-0 flex-1"><h3 className={`text-section ${dispatchException ? 'text-[#8C2D35]' : 'text-ink-1'}`}>{dispatchException ? `当前异常 · ${dispatchException.title}` : '当前任务包执行正常'}</h3><p className={`mt-1.5 text-label leading-5 ${dispatchException ? 'text-[#8C4549]' : 'text-ink-2'}`}>{dispatchException?.detail ?? '可以继续询问任务差异、资源状态和回传要求。'}</p></div>
                <button type="button" onClick={() => onAsk(dispatchException ? '请解释当前异常和最先需要核实的信息。' : '请概括当前任务包、各部门任务和下一步需要关注的回传。', 'dispatch_triage')} disabled={generating || !chatReady} className="shrink-0 rounded-lg bg-accent-strong px-3 py-2 text-footnote font-semibold text-white hover:bg-[#4D4DC2] disabled:opacity-50">{dispatchException ? '分析异常' : '概括任务'}</button>
              </div>
            </section>
            {selectedResolution && exceptionAssignment && (
              <section aria-live="polite" className="border-b border-[#C9DBF8] bg-[#F7FAFF] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-section text-[#285EAA]">调整草案已形成</h3>
                  <span className="rounded bg-[#FFF1C7] px-2 py-0.5 text-footnote font-semibold text-[#8A5A14]">待人工确认</span>
                </div>
                <p className="mt-1 text-label font-semibold text-ink-1">{selectedResolution.department} · {selectedResolution.optionLabel}</p>
                <div className="mt-2 flex items-center gap-2 text-footnote leading-5 text-ink-2">
                  <span className="min-w-0 flex-1 rounded-lg bg-white px-2.5 py-1.5"><i className="mr-1 text-ink-3 not-italic">调整前</i>{exceptionAssignment.location} · {exceptionAssignment.vehicles}</span>
                  <ArrowRight size={12} className="shrink-0 text-[#4D73B8]" />
                  <span className="min-w-0 flex-1 rounded-lg border border-[#D8E5FA] bg-white px-2.5 py-1.5"><i className="mr-1 text-[#285EAA] not-italic">调整后</i>{selectedResolution.location} · {selectedResolution.vehicles}</span>
                </div>
              </section>
            )}
            <div className="px-4 py-2.5 text-label text-ink-2">右侧保留事故事实、部门任务和替代资源选择；对话负责解释与比较，资源调整仍由人工确认。</div>
          </article>
        </div>
        {exchanges.map((exchange) => {
          const stale = exchange.response?.contextVersion !== undefined && exchange.response.contextVersion !== contextVersion
          const proposalIsCurrent = exchange.id === latestProposedExchangeId
          return <div key={exchange.id} className="space-y-3">
            <DispatchQuestionBubble exchange={exchange} />
            <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent-strong"><Bot size={16} /></span><div className="min-w-0 max-w-[88%] flex-1">
              {exchange.response ? <>{stale && <div className="mb-2 flex items-start gap-2 rounded-xl border border-[#F0D8A8] bg-[#FFFBF2] px-3 py-2 text-footnote leading-5 text-[#70470D]"><AlertTriangle size={12} className="mt-1 shrink-0" />具体调度情况已经变化，请基于右侧最新状态重新提问。</div>}<ChatAnswerCard response={exchange.response} onFollowUp={stale ? undefined : onAsk} />{exchange.proposedOptionId && !stale && proposalIsCurrent && <button type="button" onClick={() => onApplyResolution(exchange.proposedOptionId!)} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 text-[12px] font-semibold text-white hover:bg-[#4D4DC2]"><ArrowRight size={14} />人工确认并生成新任务包</button>}{exchange.proposedOptionId && !stale && !proposalIsCurrent && <div className="mt-2 rounded-xl border border-line bg-sunken px-3 py-2 text-center text-footnote text-ink-3">已被后续资源选择替代</div>}</> : exchange.error ? <ChatErrorCard message={exchange.error.message} retryable={exchange.error.retryable} onRetry={() => onRetry(exchange)} /> : <div className="flex h-11 items-center gap-1 rounded-xl border border-line bg-white px-3 shadow-panel" aria-live="polite"><i className="size-1.5 animate-pulse rounded-full bg-accent-strong" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:120ms]" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:240ms]" /><span className="ml-1.5 text-footnote text-ink-3">正在核对当前事件与任务包</span></div>}
            </div></div>
          </div>
        })}
        <div ref={conversationEndRef} aria-hidden />
      </div>
    </div>
  )
}

function FlowNode({ label, active }: { label: string; active?: boolean }) {
  return <span className={`flex items-center gap-1.5 whitespace-nowrap text-footnote font-semibold ${active ? 'text-accent-strong' : 'text-ink-3'}`}><i className={`size-2 rounded-full ${active ? 'bg-accent-strong' : 'bg-line'}`} />{label}</span>
}

function FlowLine({ active }: { active?: boolean }) {
  return <i className={`h-px min-w-8 ${active ? 'bg-accent-strong/45' : 'bg-line'}`} />
}

function DispatchWelcome({
  priorityCases,
  assignments,
  operations,
  sessions,
  draft,
  chatReady,
  blockedMessage,
  onDraftChange,
  onOpen,
}: {
  priorityCases: DispatchCase[]
  assignments: Record<string, DispatchAssignment>
  operations: Record<string, DispatchOperation>
  sessions: Record<string, WorkflowSession>
  draft: string
  chatReady: boolean
  blockedMessage: string | null
  onDraftChange: (value: string) => void
  onOpen: (eventId: string) => void
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-page p-4">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col">
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-section text-ink-1">建议优先处理</h2>
            <span className="text-footnote text-ink-3">按执行异常优先</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {priorityCases.map((dispatchCase, index) => {
              const event = getDispatchEvent(dispatchCase)
              const assignment = assignments[dispatchCase.eventId]
              const stage = resolveStage(operations[dispatchCase.eventId], sessions[dispatchCase.scenarioId])
              return (
                <button key={dispatchCase.eventId} type="button" onClick={() => onOpen(dispatchCase.eventId)} className={`group min-w-0 rounded-xl border bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-accent-strong/50 hover:shadow-panel ${index === 0 ? 'border-accent-strong/45 ring-2 ring-accent-strong/8' : 'border-line'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded px-1.5 py-0.5 text-footnote font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
                    <span className="text-footnote text-ink-3">{STAGES[stage]}</span>
                    {index === 0 && <span className="ml-auto rounded-full bg-accent-weak px-2 py-0.5 text-footnote font-semibold text-accent-strong">优先</span>}
                  </div>
                  <h3 className="mt-2.5 line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-ink-1">{event.title}</h3>
                  <p className="mt-1 line-clamp-1 text-footnote text-ink-3">{dispatchCase.taskLabel}</p>
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#FFFBF3] px-2.5 py-2 text-[11px] font-semibold text-ink-2"><AlertTriangle size={12} className="shrink-0 text-[#B26A16]" />{dispatchCase.difficulties[0]?.title}</div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hairline pt-2.5 text-footnote text-ink-3"><span className="truncate">{assignment ? getDispatchUnit(assignment.primaryUnitId).name : '待配置资源'}</span><ArrowRight size={12} className="shrink-0 text-accent-strong transition-transform group-hover:translate-x-0.5" /></div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-4 flex min-h-[220px] flex-1 flex-col rounded-2xl border border-line bg-white shadow-panel" aria-label="城安助手引导">
          <div className="min-h-0 flex-1 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-strong text-white shadow-panel"><Bot size={16} /></span>
              <div className="min-w-0 max-w-[720px]">
                <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold text-ink-2"><MessageSquareText size={13} className="text-accent-strong" />城安助手</div>
                <div className="space-y-2">
                  <p className="w-fit rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-2.5 text-[13px] font-semibold leading-5 text-ink-1 shadow-panel">先选择一张任务 Ticket，我会围绕同一组事件、资源和回执回答。</p>
                  <p className="rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-2.5 text-[13px] font-semibold leading-5 text-ink-1 shadow-panel">可以问：为什么优先？候选资源有什么差异？调整会影响谁？最终仍由人工确认，不会直接调派。</p>
                </div>
              </div>
            </div>

          </div>

          <form className="px-5 pb-4" data-dispatch-welcome-composer onSubmit={(event) => event.preventDefault()}>
            <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-4 shadow-panel transition focus-within:border-accent-strong/45 focus-within:ring-2 focus-within:ring-accent-strong/10">
              <CircleDot size={14} className="shrink-0 text-accent-strong" />
              <input
                aria-label="输入调度问题"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink-1 outline-none placeholder:text-ink-3"
                onChange={(event) => onDraftChange(event.target.value)}
                placeholder="先选择一个任务，再提问"
                value={draft}
              />
              <button type="submit" disabled aria-label="请先选择任务" title={blockedMessage ?? (chatReady ? '请先选择一张任务' : '智能服务未配置')} className="grid size-11 shrink-0 cursor-not-allowed place-items-center rounded-xl bg-muted text-ink-3">
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}

function DispatchConversation({
  dispatchCase,
  assignment,
  operation,
  session,
  exchanges,
  generating,
  chatReady,
  onAsk,
  onRetry,
}: {
  dispatchCase: DispatchCase
  assignment: DispatchAssignment
  operation: DispatchOperation
  session: WorkflowSession
  exchanges: DispatchExchange[]
  generating: boolean
  chatReady: boolean
  onAsk: (question: string, intentTag?: CityChatDispatchSkill) => void
  onRetry: (exchange: DispatchExchange) => void
}) {
  const event = getDispatchEvent(dispatchCase)
  const stage = resolveStage(operation, session)
  const units = assignment.assignedUnitIds.map(getDispatchUnit)
  const primaryDifficulty = dispatchCase.difficulties[0]
  const conversationEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (exchanges.length === 0) return
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [exchanges, generating])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-page px-5 py-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-center gap-2 text-footnote text-ink-3">
          <span className="h-px w-10 bg-line" />
          {event.time} · {dispatchCase.triggerSource}
          <span className="h-px w-10 bg-line" />
        </div>

        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent-strong"><Bot size={16} /></span>
          <article data-dispatch-focus-card className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-footnote font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
                <h2 className="min-w-0 flex-1 truncate text-title text-ink-1">{dispatchCase.taskLabel}</h2>
                <span className="rounded-full bg-accent-weak px-2 py-0.5 text-footnote font-semibold text-accent-strong">{STAGES[stage]}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-ink-3">
                <span>主责 {getDispatchUnit(assignment.primaryUnitId).name}</span>
                <span>ETA {session.etaMinutes.toFixed(1)} 分钟</span>
              </div>
            </div>

            {primaryDifficulty && (
              <section className="border-y border-hairline bg-[#FFFBF3] px-4 py-3" aria-label="当前阻塞">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[#FFF0D2] text-[#A86512]"><AlertTriangle size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-footnote font-bold ${primaryDifficulty.priority === 'P0' ? 'bg-fire text-white' : 'bg-accent-weak text-accent-strong'}`}>{primaryDifficulty.priority}</span><h3 className="text-section text-ink-1">当前阻塞 · {primaryDifficulty.title}</h3></div>
                    <p className="mt-1.5 line-clamp-2 text-label leading-5 text-ink-2"><b className="text-accent-strong">下一步：</b>{primaryDifficulty.suggestedAction}</p>
                  </div>
                  <button type="button" onClick={() => onAsk('请结合当前 Ticket，说明最需要先核实的困难。', 'dispatch_triage')} disabled={generating || !chatReady} className="shrink-0 rounded-lg bg-accent-strong px-3 py-2 text-footnote font-semibold text-white transition hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:opacity-50">分析处理建议</button>
                </div>
              </section>
            )}

            <div className="px-4 py-2.5">
              {dispatchCase.difficulties.length > 1 && (
                <details className="group rounded-lg border border-line bg-page px-3 py-2">
                  <summary className="cursor-pointer text-footnote font-semibold text-ink-2">其他 {dispatchCase.difficulties.length - 1} 项困难</summary>
                  <div className="mt-2 space-y-2 border-t border-hairline pt-2">
                    {dispatchCase.difficulties.slice(1).map((difficulty) => <div key={difficulty.id} className="text-label leading-5"><b className="text-ink-1">{difficulty.priority} · {difficulty.title}</b><span className="ml-2 text-ink-3">{difficulty.observed}</span></div>)}
                  </div>
                </details>
              )}
            </div>
          </article>
        </div>

        {exchanges.map((exchange) => {
          const stale = exchange.response?.contextVersion !== undefined
            && exchange.response.contextVersion !== dispatchContextVersion(dispatchCase, assignment, operation, session)
          return (
          <div key={exchange.id} className="space-y-3">
            <DispatchQuestionBubble exchange={exchange} />
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-weak text-accent-strong"><Bot size={16} /></span>
              <div className="min-w-0 max-w-[88%] flex-1">
                {exchange.response ? (
                  <>
                    {stale && (
                      <div className="mb-2 flex items-start gap-2 rounded-xl border border-[#F0D8A8] bg-[#FFFBF2] px-3 py-2 text-footnote leading-5 text-[#70470D]" role="status">
                        <AlertTriangle size={12} className="mt-1 shrink-0" />这条回答基于旧版调度快照，仅作记录。当前方案已变化，请重新提问后再决策。
                      </div>
                    )}
                    <ChatAnswerCard response={exchange.response} onFollowUp={stale ? undefined : onAsk} />
                  </>
                ) : exchange.error ? (
                  <ChatErrorCard message={exchange.error.message} retryable={exchange.error.retryable} onRetry={() => onRetry(exchange)} />
                ) : (
                  <div className="flex h-11 items-center gap-1 rounded-xl border border-line bg-white px-3 shadow-panel" aria-live="polite"><i className="size-1.5 animate-pulse rounded-full bg-accent-strong" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:120ms]" /><i className="size-1.5 animate-pulse rounded-full bg-accent-strong [animation-delay:240ms]" /><span className="ml-1.5 text-footnote text-ink-3">正在核对当前 Ticket</span></div>
                )}
              </div>
            </div>
          </div>
          )
        })}

        <div className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-label text-ink-2">
          <UsersRound size={13} className="shrink-0 text-accent-strong" />
          当前关联资源：{units.map((unit) => unit.name).join('、')}。
        </div>
        <div ref={conversationEndRef} aria-hidden />
      </div>
    </div>
  )
}

function DispatchComposer({
  draft,
  generating,
  chatReady,
  blockedMessage,
  onDraftChange,
  onSubmit,
  onStop,
}: {
  draft: string
  generating: boolean
  chatReady: boolean
  blockedMessage: string | null
  onDraftChange: (value: string) => void
  onSubmit: (value: string, intentTag?: CityChatDispatchSkill) => void
  onStop: () => void
}) {
  return (
    <div className="shrink-0 border-t border-line bg-white px-5 py-3">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {QUICK_SKILLS.map(([intentTag, skill]) => <button key={intentTag} type="button" onClick={() => onSubmit(skill.question, intentTag)} disabled={generating || !chatReady} title={skill.question} className="rounded-lg border border-line bg-page px-2.5 py-1.5 text-footnote font-semibold text-ink-2 transition hover:border-accent-strong/40 hover:bg-accent-weak hover:text-accent-strong disabled:cursor-not-allowed disabled:opacity-45">{skill.label}</button>)}
        </div>
        <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-white px-4 shadow-panel focus-within:border-accent-strong">
          <CircleDot size={13} className="ml-1 shrink-0 text-accent-strong" />
          <input aria-label="输入调度问题" value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !generating && !event.nativeEvent.isComposing) onSubmit(draft) }} disabled={!chatReady} placeholder={blockedMessage ?? '询问先核实什么、候选处理或双向影响'} className="min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-ink-1 outline-none disabled:cursor-not-allowed disabled:text-ink-3" />
          {generating ? (
            <button type="button" onClick={onStop} aria-label="停止生成" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-ink-2 hover:bg-sunken"><Square size={14} fill="currentColor" /></button>
          ) : (
            <button type="button" onClick={() => onSubmit(draft)} disabled={!chatReady || !draft.trim()} aria-label="发送调度问题" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-strong text-white transition hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3"><Send size={18} /></button>
          )}
        </div>
      </div>
    </div>
  )
}

function DispatchQuestionBubble({ exchange }: { exchange: DispatchExchange }) {
  const intentLabel = exchange.response?.intent?.label
    ?? (exchange.intentTag ? DISPATCH_SKILL_META[exchange.intentTag].label : '自动识别')
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] rounded-2xl rounded-tr-md bg-[#EAF2FF] px-3.5 py-2.5 text-body leading-6 text-ink-1">
        <span className="mr-2 inline-flex rounded bg-white/75 px-1.5 py-0.5 align-middle text-footnote font-semibold text-accent-strong">{intentLabel}</span>
        {exchange.question}
      </div>
    </div>
  )
}
