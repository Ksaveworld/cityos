import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  FileClock,
  Image,
  LockKeyhole,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Mic2,
  Play,
  RefreshCcw,
  Route,
  Send,
  Sparkles,
  Video,
  X,
} from 'lucide-react'

import { CommandTacticalMap } from './CommandTacticalMap'
import type { CommandMedicalRouteDrop } from './CommandMapInteractionContext'
import type { ExecutionFrame } from '@/components/dashboard/execution/executionPlayback'
import {
  DISPATCH_FACILITIES,
  dispatchCandidateReceivingStateSummary,
  dispatchFacilityEtaLabel,
  getDispatchFacility,
  getSelectableDispatchFacilities,
  isDispatchSelectableFacilityId,
  rankDispatchFacilitiesForContact,
  type DispatchFacilityId,
  type DispatchSelectableFacilityId,
} from './dispatchData'
import {
  COMMAND_SCENARIOS,
  commandScenarioForEvent,
  commandWorkbenchReducer,
  createInitialCommandWorkbenchState,
  type CommandPhase,
  type CommandScenarioId,
  type CommandTaskStatus,
  type EvidenceItem,
  type EvidenceReviewStatus,
  type PreviousCommandTask,
} from './commandWorkbenchModel'
import {
  getTrafficStrategyRoute,
  TRAFFIC_STRATEGY_ROUTES,
} from './trafficStrategyRoutes'
import './CommandWorkbench.css'

interface CommandWorkbenchProps {
  event: {
    id: string
    title: string
    location: string
    domain: string
    domainColor: string
    timeLabel?: string
    sourceLabel?: string
  }
  renderMap: (
    scenario: CommandScenarioId,
    options: {
      executionFrame: ExecutionFrame | null
      onScenarioPointSelect: (label: string) => void
    },
  ) => ReactNode
}

interface AdvisorMessage {
  id: string
  scenario: CommandScenarioId
  role: 'assistant' | 'user'
  text: string
}

const PHASE_META: Record<CommandPhase, { label: string; tone: string }> = {
  blocked: { label: '执行异常', tone: 'danger' },
  recalculating: { label: '方案重算中', tone: 'blue' },
  preview: { label: '调整预览', tone: 'violet' },
  'awaiting-approval': { label: '待人工批准', tone: 'amber' },
  approved: { label: '已批准 · 待发送', tone: 'green' },
  'sent-awaiting-ack': { label: '已模拟发送 · 待签收', tone: 'blue' },
  acknowledged: { label: '已模拟签收 · 待执行', tone: 'green' },
  'en-route': { label: '新指令模拟执行中 · 在途', tone: 'blue' },
  arrived: { label: '已模拟抵达', tone: 'green' },
}

const TASK_LABEL: Record<CommandTaskStatus, string> = {
  invalidated: '旧任务已失效',
  'pending-send': '新任务包待发送',
  'sent-awaiting-ack': '已模拟发送，等待模拟签收',
  accepted: '接收单位已模拟签收',
  'en-route': '执行单位模拟在途',
  arrived: '执行单位已模拟抵达',
}

export const CommandWorkbench = memo(function CommandWorkbench({ event, renderMap }: CommandWorkbenchProps) {
  const [state, dispatch] = useReducer(commandWorkbenchReducer, undefined, createInitialCommandWorkbenchState)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [advisorInput, setAdvisorInput] = useState('')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [trafficRecalculationProgress, setTrafficRecalculationProgress] = useState(0)
  const [medicalRecalculationProgress, setMedicalRecalculationProgress] = useState(0)
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([])
  const advisorToggleRef = useRef<HTMLButtonElement>(null)
  const scenario = commandScenarioForEvent(event.id)
  const isDecisionScenario = scenario === 'traffic' || scenario === 'medical'
  const scenarioMeta = COMMAND_SCENARIOS.find((item) => item.id === scenario) ?? {
    id: 'generic' as const,
    short: '未知',
    label: '未识别工作面',
    eventId: event.id,
    color: '#6B7280',
    priority: 'P1' as const,
  }
  const selectedMedicalFacility = getDispatchFacility(state.medical.selectedFacilityId)
    ?? DISPATCH_FACILITIES[0]
  const activePhase: CommandPhase | null = scenario === 'traffic'
    ? state.traffic.phase
    : scenario === 'medical'
      ? state.medical.phase
      : null
  const activePlanVersion = scenario === 'traffic'
    ? state.traffic.planVersion
    : scenario === 'medical'
      ? state.medical.planVersion
      : null
  const headerPhase = activePhase
    ? PHASE_META[activePhase]
    : scenario === 'city-order'
      ? { label: '证据核实', tone: 'amber' }
      : { label: '草案边界', tone: 'violet' }
  const commandExecutionFrame = useMemo<ExecutionFrame | null>(() => {
    if (scenario === 'traffic') {
      return createCommandExecutionFrame({
        id: 'traffic-zhongshan-reroute',
        label: '清障车 02',
        kind: 'traffic',
        routeRole: state.traffic.activeRouteId === 'C' ? 'medical' : 'secondary',
        progress: state.traffic.carProgress,
        phase: state.traffic.phase,
      })
    }
    if (scenario === 'medical') {
      return createCommandExecutionFrame({
        id: 'medical-panfu-transfer',
        label: '救护车 AMB-02',
        kind: 'medical',
        routeRole: selectedMedicalFacility.route.role,
        progress: state.medical.ambulanceProgress,
        phase: state.medical.phase,
      })
    }
    return null
  }, [scenario, selectedMedicalFacility.route.role, state.medical, state.traffic])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!['traffic', 'medical'].includes(scenario)) return undefined
    if (reducedMotion) return undefined
    const timer = window.setInterval(() => {
      if (scenario === 'traffic') dispatch({ type: 'traffic/tick', delta: 0.004 })
      if (scenario === 'medical') dispatch({ type: 'medical/tick', delta: 0.008 })
    }, 220)
    return () => window.clearInterval(timer)
  }, [reducedMotion, scenario])

  useEffect(() => {
    if (state.traffic.phase !== 'recalculating') {
      setTrafficRecalculationProgress(0)
      return undefined
    }

    const durationMs = reducedMotion ? 180 : 1100
    const startedAt = performance.now()
    setTrafficRecalculationProgress(8)
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      const progress = Math.min(100, Math.round(8 + (elapsed / durationMs) * 92))
      setTrafficRecalculationProgress(progress)
      if (progress < 100) return
      window.clearInterval(timer)
      dispatch({ type: 'traffic/recalculation-complete' })
    }, reducedMotion ? 60 : 90)

    return () => window.clearInterval(timer)
  }, [reducedMotion, state.traffic.phase])

  useEffect(() => {
    if (state.medical.phase !== 'recalculating') {
      setMedicalRecalculationProgress(0)
      return undefined
    }

    const durationMs = reducedMotion ? 180 : 1100
    const startedAt = performance.now()
    setMedicalRecalculationProgress(8)
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      const progress = Math.min(100, Math.round(8 + (elapsed / durationMs) * 92))
      setMedicalRecalculationProgress(progress)
      if (progress < 100) return
      window.clearInterval(timer)
      dispatch({ type: 'medical/recalculation-complete' })
    }, reducedMotion ? 60 : 90)

    return () => window.clearInterval(timer)
  }, [reducedMotion, state.medical.phase, state.medical.selectedFacilityId])

  const liveMessage = useMemo(() => {
    if (scenario === 'traffic') {
      const traffic = state.traffic
      if (traffic.phase === 'recalculating') return '车辆已绑定路线 C，正在重算新方案。'
      if (traffic.phase === 'awaiting-approval') return '方案 v2 已生成，地图预览已切换，等待负责人确认下发。'
      if (traffic.phase === 'acknowledged') return '新任务已模拟签收，等待指挥员开始执行。'
      if (traffic.phase === 'en-route') return '新任务开始执行，清障车沿路线 C 继续移动。'
      if (traffic.phase === 'arrived') return '清障车已模拟抵达作业点。'
    }
    if (scenario === 'medical') {
      const medical = state.medical
      if (medical.phase === 'recalculating') return `救护车已绑定${selectedMedicalFacility.name}路线，正在重算新转运方案。`
      if (medical.phase === 'awaiting-approval') return `医疗方案 v${medical.planVersion} 已生成，当前预览为${selectedMedicalFacility.name}，需要人工批准。`
      if (medical.phase === 'acknowledged') return '新转运任务已模拟签收，等待指挥员开始执行。'
      if (medical.phase === 'en-route') return `新转运任务开始执行，救护车沿${selectedMedicalFacility.name}路线移动。`
      if (medical.phase === 'arrived') return `救护车已模拟抵达${selectedMedicalFacility.name}。`
    }
    return '调度工作台已切换场景。'
  }, [scenario, selectedMedicalFacility.name, state.medical, state.traffic])

  const askAdvisor = (question: string) => {
    const text = question.trim()
    if (!text) return
    const response = advisorResponse(scenario, text, {
      trafficRouteId: state.traffic.activeRouteId,
      medicalFacilityId: state.medical.selectedFacilityId,
      phase: activePhase,
    })
    setAdvisorMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), scenario, role: 'user', text },
      { id: crypto.randomUUID(), scenario, role: 'assistant', text: response },
    ])
    setAdvisorInput('')
    setAdvisorOpen(true)
  }

  const submitAdvisor = (event_: FormEvent<HTMLFormElement>) => {
    event_.preventDefault()
    askAdvisor(advisorInput)
  }

  const closeAdvisor = () => {
    setAdvisorOpen(false)
    window.setTimeout(() => advisorToggleRef.current?.focus(), 0)
  }

  const previewMedicalFacility = useCallback((facilityId: DispatchSelectableFacilityId, routeProgress: number) => {
    dispatch({ type: 'medical/select-facility', facilityId, routeProgress })
  }, [])

  const handleMedicalDrop = useCallback((drop: CommandMedicalRouteDrop) => {
    previewMedicalFacility(drop.facilityId, drop.routeProgress)
  }, [previewMedicalFacility])

  const scenarioAdvisorMessages = advisorMessages.filter((message) => message.scenario === scenario)
  const visibleAdvisorMessages = scenarioAdvisorMessages.length > 0
    ? scenarioAdvisorMessages
    : [{
        id: `assistant-boundary-${scenario}`,
        scenario,
        role: 'assistant' as const,
        text: advisorBoundaryForScenario(scenario),
      }]
  const advisorPrompts = advisorPromptsForScenario(scenario)

  return (
    <main className="command-workbench" data-testid="command-workbench">
      <div className="sr-only" aria-live="polite">{liveMessage}</div>
      <CommandTacticalMap
        scenario={scenario}
        map={renderMap(scenario, {
          executionFrame: commandExecutionFrame,
          onScenarioPointSelect: (label) => {
            if (scenario === 'traffic' && label === '阻塞前换道路口（模拟）') {
              dispatch({ type: 'traffic/drop-reroute', routeProgress: 0.43 })
            }
          },
        })}
        advisor={isDecisionScenario ? (
          <CommandAdvisor
            open={advisorOpen}
            input={advisorInput}
            messages={visibleAdvisorMessages}
            prompts={advisorPrompts}
            toggleRef={advisorToggleRef}
            onOpenChange={setAdvisorOpen}
            onInputChange={setAdvisorInput}
            onAsk={askAdvisor}
            onSubmit={submitAdvisor}
            onClose={closeAdvisor}
          />
        ) : null}
        traffic={state.traffic}
        medical={state.medical}
        onTrafficDrop={(routeProgress) => dispatch({ type: 'traffic/drop-reroute', routeProgress })}
        onMedicalDrop={handleMedicalDrop}
      />

      <aside className={`command-plan-panel ${isDecisionScenario ? '' : 'has-inline-advisor'}`} aria-label="动态方案与任务">
        <header className="command-plan-header">
          {isDecisionScenario ? (
            <>
              <div className="min-w-0">
                <h2>具体调度情况</h2>
                <p>当前任务包、异常信息与人工选择</p>
              </div>
              <span className={`command-phase-badge tone-${headerPhase.tone}`}>
                {activePhase === 'blocked' ? '1 项异常' : headerPhase.label}
              </span>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="command-plan-status-dot" style={{ backgroundColor: scenarioMeta.color }} />
                  <h2>动态方案</h2>
                  <span className={`command-phase-badge tone-${headerPhase.tone}`}>{headerPhase.label}</span>
                </div>
                <p className="truncate">{event.title} · {event.location}</p>
              </div>
              <div className="command-version">
                <span>{scenario === 'city-order' ? 'BRIEF' : 'SCOPE'}</span>
                <strong>{scenario === 'city-order' ? `${state.evidence.filter((item) => item.status === 'verified').length}/3` : '草案'}</strong>
              </div>
            </>
          )}
        </header>

        <div className="command-plan-scroll">
          {isDecisionScenario && activePlanVersion !== null && activePhase !== null && (
            <CommandSituationSummary
              event={event}
              scenario={scenario}
              planVersion={activePlanVersion}
              approvedVersion={scenario === 'traffic' ? state.traffic.approvedVersion : state.medical.approvedVersion}
              phase={activePhase}
              trafficRouteId={state.traffic.activeRouteId}
              medicalFacilityId={state.medical.selectedFacilityId}
            />
          )}
          {scenario === 'traffic' && (
            <TrafficPlan
              state={state.traffic}
              recalculationProgress={trafficRecalculationProgress}
              onAsk={askAdvisor}
              onPreviewRouteC={() => dispatch({ type: 'traffic/drop-reroute', routeProgress: 0.43 })}
            />
          )}
          {scenario === 'medical' && (
            <MedicalPlan
              state={state.medical}
              recalculationProgress={medicalRecalculationProgress}
              onAsk={askAdvisor}
              onPreviewFacility={previewMedicalFacility}
            />
          )}
          {scenario === 'city-order' && (
            <EvidencePlan
              evidence={state.evidence}
              onReview={(evidenceId, status) => dispatch({ type: 'evidence/review', evidenceId, status })}
            />
          )}
          {!['traffic', 'medical', 'city-order'].includes(scenario) && (
            <GenericPlan scenario={scenario} />
          )}
        </div>

        {!isDecisionScenario && (
          <InlineCommandAdvisor
            open={advisorOpen}
            input={advisorInput}
            messages={visibleAdvisorMessages}
            prompts={advisorPrompts}
            toggleRef={advisorToggleRef}
            onOpenChange={setAdvisorOpen}
            onInputChange={setAdvisorInput}
            onAsk={askAdvisor}
            onSubmit={submitAdvisor}
            onClose={closeAdvisor}
          />
        )}

        <CommandApprovalFooter
          scenario={scenario}
          phase={activePhase}
          reducedMotion={reducedMotion}
          onAction={() => {
            if (scenario === 'traffic') {
              if (state.traffic.phase === 'awaiting-approval') dispatch({ type: 'traffic/approve-and-issue' })
              else if (state.traffic.phase === 'sent-awaiting-ack') dispatch({ type: 'traffic/acknowledge' })
              else if (state.traffic.phase === 'acknowledged') dispatch({ type: 'traffic/start-execution' })
              else if (state.traffic.phase === 'en-route' && reducedMotion) dispatch({ type: 'traffic/tick', delta: 1 })
              else if (state.traffic.phase === 'arrived') dispatch({ type: 'traffic/reset' })
            }
            if (scenario === 'medical') {
              if (state.medical.phase === 'awaiting-approval') dispatch({ type: 'medical/approve' })
              else if (state.medical.phase === 'approved') dispatch({ type: 'medical/issue' })
              else if (state.medical.phase === 'sent-awaiting-ack') dispatch({ type: 'medical/acknowledge' })
              else if (state.medical.phase === 'acknowledged') dispatch({ type: 'medical/start-execution' })
              else if (state.medical.phase === 'en-route' && reducedMotion) dispatch({ type: 'medical/tick', delta: 1 })
              else if (state.medical.phase === 'arrived') dispatch({ type: 'medical/reset' })
            }
          }}
        />
      </aside>
    </main>
  )
})

function createCommandExecutionFrame({
  id,
  label,
  kind,
  routeRole,
  progress,
  phase,
}: {
  id: string
  label: string
  kind: 'traffic' | 'medical'
  routeRole: 'primary' | 'secondary' | 'medical'
  progress: number
  phase: CommandPhase
}): ExecutionFrame {
  const arrived = phase === 'arrived'
  const waiting = !['blocked', 'en-route', 'arrived'].includes(phase)
  const incidentStage: ExecutionFrame['incidentStage'] = arrived
    ? '现场核验'
    : ['recalculating', 'awaiting-approval', 'approved', 'sent-awaiting-ack', 'acknowledged'].includes(phase)
      ? '待出发'
      : '协同在途'
  return {
    definitionId: id,
    playheadSec: progress * 100,
    progress,
    phase: arrived ? 'onsite' : 'routing',
    units: [{
      id: `${id}-unit`,
      label,
      kind,
      routeRole,
      departAt: 0,
      arriveAt: 100,
      progress,
      status: arrived ? 'arrived' : waiting ? 'waiting' : 'enroute',
    }],
    intersections: [],
    roadCues: [],
    tasks: [],
    visibleAlerts: [],
    onsiteNodes: [],
    incidentStage,
    blockingAlert: null,
  }
}

interface CommandAdvisorViewProps {
  open: boolean
  input: string
  messages: AdvisorMessage[]
  prompts: string[]
  toggleRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onInputChange: (value: string) => void
  onAsk: (question: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

function CommandAdvisor({
  open,
  input,
  messages,
  prompts,
  toggleRef,
  onOpenChange,
  onInputChange,
  onAsk,
  onSubmit,
  onClose,
}: CommandAdvisorViewProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeButtonRef.current?.focus()
  }, [open])

  return (
    <section
      className={`command-map-advisor ${open ? 'is-open' : ''}`}
      aria-label="Chatbot 助手"
      onKeyDown={(event_) => {
        if (event_.key !== 'Escape' || !open) return
        event_.stopPropagation()
        onClose()
      }}
    >
      {!open && (
        <button
          ref={toggleRef}
          type="button"
          className="command-map-advisor-toggle"
          aria-expanded="false"
          aria-controls="command-advisor-body"
          onClick={() => onOpenChange(true)}
        >
          <Bot size={14} />Chatbot 助手
        </button>
      )}
      {open && (
        <div id="command-advisor-body" className="command-map-advisor-drawer" role="dialog" aria-label="CityOS 城安助手">
          <header className="command-map-advisor-header">
            <span className="command-advisor-icon"><Bot size={16} /></span>
            <div><strong>CityOS 城安助手</strong><small>异常研判、资源比选与调整草案</small></div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="收起 Chatbot 助手"><X size={14} /></button>
          </header>
          <div className="command-advisor-toolbar"><span><Sparkles size={12} />本地演示回复</span></div>
          <div className="command-advisor-messages" aria-live="polite">
            {messages.slice(-6).map((message) => (
              <p key={message.id} className={`command-advisor-message is-${message.role}`}>{message.text}</p>
            ))}
          </div>
          <div className="command-advisor-prompts">
            {prompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => onAsk(prompt)}>{prompt}</button>
            ))}
          </div>
          <form onSubmit={onSubmit} className="command-advisor-form">
            <label className="sr-only" htmlFor="command-advisor-input">询问 CityOS 城安助手</label>
            <input
              id="command-advisor-input"
              value={input}
              onChange={(event_) => onInputChange(event_.target.value)}
              placeholder="询问异常、候选方案或任务影响"
            />
            <button type="submit" aria-label="发送问题"><Send size={14} /></button>
          </form>
          <p className="command-advisor-boundary"><LockKeyhole size={11} />助手不会批准、发送或直接调度资源</p>
        </div>
      )}
    </section>
  )
}

function InlineCommandAdvisor({
  open,
  input,
  messages,
  prompts,
  toggleRef,
  onOpenChange,
  onInputChange,
  onAsk,
  onSubmit,
  onClose,
}: CommandAdvisorViewProps) {
  return (
    <section
      className={`command-advisor ${open ? 'is-open' : ''}`}
      aria-label="Chatbot 参谋"
      onKeyDown={(event_) => {
        if (event_.key !== 'Escape' || !open) return
        event_.stopPropagation()
        onClose()
      }}
    >
      <button
        ref={toggleRef}
        type="button"
        className="command-advisor-toggle"
        aria-expanded={open}
        aria-controls="command-inline-advisor-body"
        onClick={() => onOpenChange(!open)}
      >
        <span className="command-advisor-icon"><Bot size={15} /></span>
        <span className="min-w-0 flex-1 text-left"><strong>城安参谋</strong><small>只解释与生成草案，不执行</small></span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open && (
        <div id="command-inline-advisor-body" className="command-advisor-body">
          <div className="command-advisor-toolbar">
            <span><Sparkles size={12} />本地演示回复</span>
            <button type="button" onClick={onClose} aria-label="收起城安参谋"><X size={13} /></button>
          </div>
          <div className="command-advisor-messages" aria-live="polite">
            {messages.slice(-4).map((message) => (
              <p key={message.id} className={`command-advisor-message is-${message.role}`}>{message.text}</p>
            ))}
          </div>
          <div className="command-advisor-prompts">
            {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onAsk(prompt)}>{prompt}</button>)}
          </div>
          <form onSubmit={onSubmit} className="command-advisor-form">
            <label className="sr-only" htmlFor="command-inline-advisor-input">询问城安参谋</label>
            <input
              id="command-inline-advisor-input"
              value={input}
              onChange={(event_) => onInputChange(event_.target.value)}
              placeholder="询问证据、风险或任务影响"
            />
            <button type="submit" aria-label="发送问题"><Send size={14} /></button>
          </form>
        </div>
      )}
    </section>
  )
}

function CommandSituationSummary({
  event,
  scenario,
  planVersion,
  approvedVersion,
  phase,
  trafficRouteId,
  medicalFacilityId,
}: {
  event: CommandWorkbenchProps['event']
  scenario: CommandScenarioId
  planVersion: number
  approvedVersion: number | null
  phase: CommandPhase
  trafficRouteId: 'B' | 'C'
  medicalFacilityId: DispatchFacilityId
}) {
  const traffic = scenario === 'traffic'
  const trafficRoute = getTrafficStrategyRoute(trafficRouteId)
  const medicalFacility = getDispatchFacility(medicalFacilityId) ?? DISPATCH_FACILITIES[0]
  const currentPlan = traffic
    ? `路线 ${trafficRouteId}`
    : medicalFacility.name
  const eta = traffic
    ? `${trafficRoute.role === 'current-blocked' ? '原' : ''}约 ${trafficRoute.etaMinutes} 分钟`
    : medicalFacility.etaMinutes === null ? '待核实' : `约 ${medicalFacility.etaMinutes} 分钟`
  const recalculatingVersion = approvedVersion === planVersion ? planVersion + 1 : planVersion
  const versionValue = phase === 'recalculating' ? `v${recalculatingVersion} 生成中` : `v${planVersion}`
  const currentPlanDetail = traffic ? '三路线策略预设' : medicalRoutePhaseDetail(phase)
  const versionDetail = phase === 'blocked'
    ? '原批准版本'
    : phase === 'recalculating'
      ? '草案尚未完成同步'
      : phase === 'awaiting-approval'
        ? '待人工批准'
        : phase === 'approved'
          ? '已批准，待发送'
          : phase === 'sent-awaiting-ack'
            ? '已模拟发送'
            : phase === 'acknowledged'
              ? '已模拟签收'
              : phase === 'en-route'
                ? '新任务模拟在途'
                : '新任务模拟抵达'
  return (
    <section className="command-situation-card">
      <div className="command-situation-meta">
        <span style={{ backgroundColor: event.domainColor }}>{event.domain}</span>
        <time>{event.timeLabel ?? '本地演示'}</time>
      </div>
      <h3>{event.title}</h3>
      <p><MapPin size={11} />{event.location}</p>
      <dl className="command-situation-metrics">
        <ContextMetric label="当前方案" value={currentPlan} detail={currentPlanDetail} />
        <ContextMetric label="预计到场" value={eta} detail={traffic ? trafficRoute.dataOrigin.eta : medicalFacility.dataOrigin.eta} />
        <ContextMetric label="执行单位" value={traffic ? '清障车 02' : '救护车 AMB-02'} detail="模拟资源" />
        <ContextMetric label="方案版本" value={versionValue} detail={versionDetail} />
      </dl>
    </section>
  )
}

function ContextMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>
}

function medicalRoutePhaseDetail(phase: CommandPhase | null) {
  if (phase === 'blocked') return '受影响基准 · 待选择候选'
  if (phase === 'recalculating') return '调整草案生成中'
  if (phase === 'awaiting-approval') return '调整预览 · 待人工批准'
  if (phase === 'approved') return '已人工批准 · 待发送'
  if (phase === 'sent-awaiting-ack') return '已模拟发送 · 待签收'
  if (phase === 'acknowledged') return '已模拟签收 · 待执行'
  if (phase === 'en-route') return '模拟执行中'
  if (phase === 'arrived') return '已模拟抵达'
  return '只读草案'
}

function DecisionException({
  title,
  detail,
  signals,
  onAsk,
  tone = 'danger',
  askLabel = '让助手分析这项异常',
  children,
}: {
  title: string
  detail: string
  signals: string[]
  onAsk: () => void
  tone?: 'danger' | 'blue' | 'green'
  askLabel?: string
  children: ReactNode
}) {
  return (
    <section className={`command-decision-exception tone-${tone}`}>
      <div className="command-decision-heading">
        <span><AlertTriangle size={14} /></span>
        <div><h3>{title}</h3><p>{detail}</p></div>
      </div>
      <ul>
        {signals.map((signal) => <li key={signal}><i />{signal}</li>)}
      </ul>
      <button type="button" className="command-decision-ask" onClick={onAsk}><Bot size={12} />{askLabel}</button>
      {children}
    </section>
  )
}

function DecisionOption({
  code,
  title,
  meta,
  evidence,
  status,
  selected = false,
  recommended = false,
  danger = false,
  disabled = false,
  onClick,
  testId,
}: {
  code: string
  title: string
  meta: string
  evidence: string
  status: string
  selected?: boolean
  recommended?: boolean
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={`command-decision-option ${selected ? 'is-selected' : ''} ${recommended ? 'is-recommended' : ''} ${danger ? 'is-danger' : ''}`}
    >
      <span className="command-decision-radio" aria-hidden="true" />
      <span className="command-decision-code">{code}</span>
      <span className="command-decision-copy"><strong>{title}</strong><small>{meta}</small><em>依据：{evidence}</em></span>
      <b>{status}</b>
    </button>
  )
}

function trafficDecisionCopy(phase: CommandPhase) {
  if (phase === 'blocked') return {
    title: '道路阻塞导致执行异常',
    detail: '路线 B 的原演示 ETA 最短，但前方清障反馈延迟，车辆将在安全决策点前暂停。',
    signals: TRAFFIC_STRATEGY_ROUTES.map((route) => (
      `路线 ${route.id} ${route.etaMinutes} 分钟（演示估算）：${route.mapStatus}`
    )),
  }
  if (phase === 'recalculating') return {
    title: '路线 C 调整方案生成中',
    detail: '地图已按负责人的拖拽或右栏选择切换预览，系统正在同步重算风险与任务清单。',
    signals: ['路线 B 已转为静态参考线', '路线 C 已成为动态预览线', '新方案尚未形成，旧任务状态暂不改写'],
  }
  if (phase === 'awaiting-approval') return {
    title: '路线 C 调整方案待确认',
    detail: '方案 v2 已生成；地图保持路线 C 预览，等待负责人确认并模拟下发。',
    signals: ['旧批准已与新方案解绑', '旧任务包已失效并保留审计记录', '接收单位尚未收到新任务包'],
  }
  if (phase === 'sent-awaiting-ack') return {
    title: '路线 C 新任务已模拟发送',
    detail: '负责人已确认方案 v2，并完成本地模拟下发；当前等待接收单位模拟签收。',
    signals: ['路线 C 已绑定方案 v2', '旧任务包保持失效状态', '车辆尚未开始按新任务执行'],
  }
  if (phase === 'acknowledged') return {
    title: '路线 C 新任务已模拟签收',
    detail: '接收单位已完成本地模拟签收，等待指挥员启动执行演示。',
    signals: ['新任务包版本为 v2', '旧任务包已被新版本替代', '车辆仍停在当前安全位置'],
  }
  if (phase === 'en-route') return {
    title: '清障车正沿路线 C 模拟在途',
    detail: '新任务已进入执行演示，车辆沿动态路线 C 缓慢移动。',
    signals: ['路线 B 保持静态历史参考', '路线 C 显示当前模拟执行', '到场回执尚未形成'],
  }
  return {
    title: '清障车已模拟抵达作业点',
    detail: '本条改线演示已完成；页面仅保留方案、任务与回执的本地审计状态。',
    signals: ['方案 v2 已完成本地演示', '路线与回执均非真实生产状态', '可重置后重新演示本条链路'],
  }
}

function medicalDecisionCopy(phase: CommandPhase, facility: (typeof DISPATCH_FACILITIES)[number]) {
  if (phase === 'blocked') return {
    title: '医疗协同回传异常',
    detail: '原接收医院（模拟）承接能力不足；页面已展示两家候选，等待负责人选择预览。',
    signals: ['原接收状态为模拟、待核实', `候选接收状态：${dispatchCandidateReceivingStateSummary()}`, '接收状态优先，再比较演示 ETA，不自动选院'],
  }
  if (phase === 'recalculating') return {
    title: `${facility.name}调整方案生成中`,
    detail: '地图已按负责人的拖拽或右栏选择切换预览，系统正在同步重算 ETA、风险与联络任务。',
    signals: ['当前选中路线已高亮，其他路线保留为弱化参考', `${dispatchFacilityEtaLabel(facility)}`, '候选接收状态仍需人工联络确认'],
  }
  if (phase === 'awaiting-approval') return {
    title: `${facility.name}转运方案待批准`,
    detail: '方案 v2 已生成；确认前仍可点击或拖拽切换另一家候选医院。',
    signals: ['旧批准已与新方案解绑', '旧任务包已失效并保留审计记录', `${facility.receivingState}，不等于已确认接收`],
  }
  if (phase === 'approved') return {
    title: '转运方案 v2 已批准',
    detail: '人工批准已绑定当前方案版本，任务包仍未发送。',
    signals: [`已批准草案绑定${facility.name}`, '新任务包等待本地模拟发送', '车辆尚未开始按新任务执行'],
  }
  if (phase === 'sent-awaiting-ack') return {
    title: '新转运任务已模拟发送',
    detail: '任务包 v2 已完成本地模拟发送，当前等待接收单位模拟签收。',
    signals: ['新路线已绑定任务包 v2', '旧任务包保持失效状态', '车辆尚未开始按新任务执行'],
  }
  if (phase === 'acknowledged') return {
    title: '新转运任务已模拟签收',
    detail: '接收单位已完成本地模拟签收，等待指挥员启动执行演示。',
    signals: ['任务包 v2 已被模拟接收', '旧任务包已被新版本替代', '车辆仍停在当前安全位置'],
  }
  if (phase === 'en-route') return {
    title: '救护车正沿候选路线模拟在途',
    detail: `新任务已进入执行演示，车辆沿${facility.name}路线缓慢移动。`,
    signals: ['未选路线保持静态参考', '选中路线显示当前模拟执行', '真实接收状态仍不由页面确认'],
  }
  return {
    title: '救护车已模拟抵达候选接收点',
    detail: '本条转运演示已完成；页面仅保留方案、任务与回执的本地审计状态。',
    signals: ['方案 v2 已完成本地演示', '接收与回执均非真实生产状态', '可重置后重新演示本条链路'],
  }
}

function TrafficPlan({
  state,
  recalculationProgress,
  onAsk,
  onPreviewRouteC,
}: {
  state: ReturnType<typeof createInitialCommandWorkbenchState>['traffic']
  recalculationProgress: number
  onAsk: (question: string) => void
  onPreviewRouteC: () => void
}) {
  const routeA = getTrafficStrategyRoute('A')
  const routeB = getTrafficStrategyRoute('B')
  const routeC = getTrafficStrategyRoute('C')
  const routeCPreview = state.activeRouteId === 'C'
  const replacementIssued = ['sent-awaiting-ack', 'acknowledged', 'en-route', 'arrived'].includes(state.phase)
  const decisionCopy = trafficDecisionCopy(state.phase)
  const trafficMapStatus = state.phase === 'en-route'
    ? '路线 C · 模拟执行中'
    : state.phase === 'arrived'
      ? '路线 C · 模拟抵达'
      : routeCPreview
        ? '路线 C · 调整预览'
        : '路线 B · 执行异常'
  const trafficPlanStatus = replacementIssued
    ? '新方案已模拟下发'
    : state.phase === 'recalculating'
      ? '新方案生成中'
      : routeCPreview
        ? '待负责人确认下发'
        : '等待地图或右栏调整'
  const routeCStatus = state.phase === 'blocked'
    ? '建议优先'
    : state.phase === 'recalculating'
      ? '方案生成中'
      : state.phase === 'awaiting-approval'
        ? '待确认下发'
        : state.phase === 'sent-awaiting-ack'
          ? '已模拟发送'
          : state.phase === 'acknowledged'
            ? '已模拟签收'
            : state.phase === 'en-route'
              ? '模拟执行中'
              : '已模拟抵达'
  const decisionTone = state.phase === 'blocked' ? 'danger' : ['recalculating', 'awaiting-approval'].includes(state.phase) ? 'blue' : 'green'

  return (
    <>
      <DecisionException
        title={decisionCopy.title}
        detail={decisionCopy.detail}
        signals={decisionCopy.signals}
        onAsk={() => onAsk('请分析中山路道路阻塞异常，比较路线 A、B、C 的收益、风险和任务影响。')}
        tone={decisionTone}
        askLabel={state.phase === 'blocked' ? '让助手分析这项异常' : '让助手解释当前状态'}
      >
        {state.phase === 'recalculating' && <PlanRecalculationProgress progress={recalculationProgress} scenario="traffic" />}
        <div className="command-decision-options" role="radiogroup" aria-label="中山路候选路线">
          <DecisionOption
            code={routeA.id}
            title={routeA.title}
            meta={`${routeA.etaLabel} · ${routeA.roadStatus}`}
            evidence={routeA.recommendationReason}
            status="第二备选"
            disabled
            testId="traffic-route-option-a"
          />
          <DecisionOption
            code={routeB.id}
            title={routeB.title}
            meta={`${routeB.etaLabel} · ${routeB.roadStatus}`}
            evidence={routeB.recommendationReason}
            status={routeCPreview ? '旧路线' : '当前异常'}
            selected={!routeCPreview}
            danger
            disabled
            testId="traffic-route-option-b"
          />
          <DecisionOption
            code={routeC.id}
            title={routeC.title}
            meta={`${routeC.etaLabel} · ${routeC.roadStatus}`}
            evidence={routeC.recommendationReason}
            status={routeCStatus}
            selected={routeCPreview}
            recommended
            disabled={state.phase !== 'blocked'}
            onClick={onPreviewRouteC}
            testId="traffic-route-option-c"
          />
        </div>
      </DecisionException>

      <PlanMetrics
        items={[
          ['地图状态', trafficMapStatus],
          ['方案状态', trafficPlanStatus],
          ['道路状态', routeCPreview ? '预置路线绕开受阻点 · 模拟' : '原路线不可继续 · 模拟待核实'],
          ['执行单位', state.phase === 'arrived' ? '清障车 02 · 已抵达' : '清障车 02 · 模拟'],
        ]}
      />

      <VersionLedger
        planVersion={state.planVersion}
        approvedVersion={state.approvedVersion}
        taskVersion={state.taskVersion}
        taskStatus={state.taskStatus}
        previousTask={state.previousTask}
      />
    </>
  )
}

function PlanRecalculationProgress({
  progress,
  scenario,
  facilityName,
}: {
  progress: number
  scenario: 'traffic' | 'medical'
  facilityName?: string
}) {
  const stage = progress < 36
    ? scenario === 'medical' ? '绑定救护车与候选接收路线' : '捕捉车辆与目标道路'
    : progress < 72
      ? scenario === 'medical' ? '重算 ETA、风险与联络责任' : '重算路网与风险清单'
      : '生成新方案与任务草案'
  return (
    <section className="command-plan-loading" data-testid={`${scenario}-plan-loading`}>
      <div className="command-plan-loading-heading">
        <span className="command-plan-loading-spinner"><LoaderCircle size={16} /></span>
        <div><strong>{stage}</strong><small>本地模拟重算</small></div>
        <b>{progress}%</b>
      </div>
      <div
        className="command-plan-loading-track"
        role="progressbar"
        aria-label={scenario === 'medical' ? `${facilityName ?? '候选医院'}转运方案生成进度` : '路线 C 方案生成进度'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="command-plan-loading-steps" aria-hidden="true">
        <span data-done={progress >= 12}>{scenario === 'medical' ? '接收路线绑定' : '道路绑定'}</span>
        <span data-done={progress >= 48}>{scenario === 'medical' ? 'ETA 与风险同步' : '风险同步'}</span>
        <span data-done={progress >= 82}>方案成稿</span>
      </div>
    </section>
  )
}

function MedicalPlan({
  state,
  recalculationProgress,
  onAsk,
  onPreviewFacility,
}: {
  state: ReturnType<typeof createInitialCommandWorkbenchState>['medical']
  recalculationProgress: number
  onAsk: (question: string) => void
  onPreviewFacility: (facilityId: DispatchSelectableFacilityId, routeProgress: number) => void
}) {
  const selectedFacility = getDispatchFacility(state.selectedFacilityId) ?? DISPATCH_FACILITIES[0]
  const selectableFacilities = rankDispatchFacilitiesForContact(getSelectableDispatchFacilities())
  const firstContactFacilityId = selectableFacilities[0]?.id
  const previewEditable = ['blocked', 'recalculating', 'awaiting-approval'].includes(state.phase)
  const replacementAccepted = ['acknowledged', 'en-route', 'arrived'].includes(state.phase)
  const decisionCopy = medicalDecisionCopy(state.phase, selectedFacility)
  const replacementConfirmed = ['approved', 'sent-awaiting-ack', 'acknowledged', 'en-route', 'arrived'].includes(state.phase)
  const medicalMapStatus = `${selectedFacility.name}路线 · ${medicalRoutePhaseDetail(state.phase)}`
  const medicalPlanStatus = state.phase === 'approved'
    ? '已批准，待模拟发送'
    : state.phase === 'sent-awaiting-ack'
      ? '已模拟发送，待签收'
      : replacementAccepted
        ? '新转运方案执行链已确认'
        : selectedFacility.selectable
          ? state.phase === 'recalculating' ? '新方案生成中' : '待负责人批准'
          : '等待点击或拖拽选择候选'
  const selectedStatus = state.phase === 'recalculating'
    ? '方案生成中'
    : state.phase === 'awaiting-approval'
      ? '待人工批准'
      : state.phase === 'approved'
        ? '已批准 · 待发送'
        : state.phase === 'sent-awaiting-ack'
          ? '已模拟发送'
          : state.phase === 'acknowledged'
            ? '已模拟签收'
            : state.phase === 'en-route'
              ? '模拟执行中'
              : state.phase === 'arrived' ? '已模拟抵达' : '当前异常'
  const decisionTone = state.phase === 'blocked' ? 'danger' : ['recalculating', 'awaiting-approval'].includes(state.phase) ? 'blue' : 'green'
  const candidateSwitchStatus = previewEditable
    ? '可点击切换'
    : state.phase === 'approved'
      ? '已批准后冻结'
      : '当前任务版本已冻结'

  return (
    <>
      <DecisionException
        title={decisionCopy.title}
        detail={decisionCopy.detail}
        signals={decisionCopy.signals}
        onAsk={() => onAsk('请分析盘福路医疗协同异常，比较受影响基准医院和两家候选医院，并列出需要人工联络核实的事项。')}
        tone={decisionTone}
        askLabel={state.phase === 'blocked' ? '让助手分析这项异常' : '让助手解释当前状态'}
      >
        {state.phase === 'recalculating' && (
          <PlanRecalculationProgress progress={recalculationProgress} scenario="medical" facilityName={selectedFacility.name} />
        )}
        <div className="command-decision-options" role="radiogroup" aria-label="盘福路候选接收点">
          {DISPATCH_FACILITIES.map((facility) => {
            const selected = facility.id === state.selectedFacilityId
            const candidateId = isDispatchSelectableFacilityId(facility.id) ? facility.id : null
            return (
              <DecisionOption
                key={facility.id}
                code={facility.planningState.impacted ? '原' : '候'}
                title={facility.name}
                meta={`${dispatchFacilityEtaLabel(facility)} · ${facility.planningState.impacted ? '受影响基准' : '候选接收点'}`}
                evidence={facility.recommendationBasis}
                status={selected ? selectedStatus : facility.planningState.impacted ? '承接能力不足' : candidateSwitchStatus}
                selected={selected}
                danger={facility.planningState.impacted}
                recommended={facility.id === firstContactFacilityId}
                disabled={!candidateId || !previewEditable}
                onClick={candidateId ? () => onPreviewFacility(candidateId, facility.route.defaultProgress) : undefined}
                testId={`medical-facility-option-${facility.id}`}
              />
            )
          })}
        </div>
      </DecisionException>

      <PlanMetrics
        items={[
          ['地图状态', medicalMapStatus],
          ['方案状态', medicalPlanStatus],
          ['执行单位', '救护车 AMB-02 · 保留'],
          ['联络负责人', replacementConfirmed ? '转运协调负责人' : selectedFacility.selectable ? '候选：转运协调负责人' : '急救联络负责人'],
        ]}
      />

      <VersionLedger
        planVersion={state.planVersion}
        approvedVersion={state.approvedVersion}
        taskVersion={state.taskVersion}
        taskStatus={state.taskStatus}
        previousTask={state.previousTask}
      />
    </>
  )
}

function EvidencePlan({
  evidence,
  onReview,
}: {
  evidence: EvidenceItem[]
  onReview: (evidenceId: string, status: Exclude<EvidenceReviewStatus, 'pending'>) => void
}) {
  const verifiedCount = evidence.filter((item) => item.status === 'verified').length
  return (
    <>
      <PlanNotice
        tone="amber"
        icon={CircleDashed}
        title="多模态材料尚未进入推演"
        body="图片、语音和视频只是待核实证据。人工确认后才会写入 AI Brief；排除项仍保留审计记录。"
      />
      <section className="command-plan-section">
        <SectionHeading icon={FileClock} title="证据核实" suffix={`${verifiedCount}/${evidence.length} 已确认`} />
        <div className="command-evidence-list">
          {evidence.map((item) => <EvidenceCard key={item.id} item={item} onReview={onReview} />)}
        </div>
      </section>
      <section className="command-plan-section">
        <SectionHeading icon={MessageSquareText} title="AI Brief 输入" suffix="人工门禁" />
        <div className="command-brief-state">
          <strong>{verifiedCount > 0 ? `${verifiedCount} 项证据已可用` : '尚无可用证据'}</strong>
          <span>{verifiedCount > 0 ? '可据此生成市容秩序处置草案，仍需人工批准。' : '待核实项不会自动改变路线、资源或任务。'}</span>
        </div>
      </section>
    </>
  )
}

function EvidenceCard({ item, onReview }: { item: EvidenceItem; onReview: (evidenceId: string, status: Exclude<EvidenceReviewStatus, 'pending'>) => void }) {
  const Icon = item.kind === 'image' ? Image : item.kind === 'audio' ? Mic2 : Video
  return (
    <article className={`command-evidence-card is-${item.status}`}>
      <div className="command-evidence-icon"><Icon size={16} /></div>
      <div className="min-w-0 flex-1"><strong>{item.label}</strong><span>{item.source}</span><time>{item.observedAt}</time></div>
      {item.status === 'pending' ? (
        <div className="command-evidence-actions">
          <button type="button" onClick={() => onReview(item.id, 'verified')}><Check size={12} />确认</button>
          <button type="button" onClick={() => onReview(item.id, 'excluded')}><X size={12} />排除</button>
        </div>
      ) : (
        <span className="command-evidence-result">{item.status === 'verified' ? '已确认' : '已排除'}</span>
      )}
    </article>
  )
}

function GenericPlan({ scenario }: { scenario: CommandScenarioId }) {
  const scenarioName = COMMAND_SCENARIOS.find((item) => item.id === scenario)?.label ?? '当前场景'
  return (
    <>
      <PlanNotice tone="blue" icon={Sparkles} title={`${scenarioName}已进入调度工作台`} body="本轮优先跑通中山路与盘福路两条完整链路；当前工作面保留地图直达入口和人工门禁。" />
      <section className="command-plan-section">
        <SectionHeading icon={LockKeyhole} title="操作边界" suffix="人机协同" />
        <ul className="command-boundary-list">
          <li>Chatbot 只解释与生成草案</li>
          <li>地图拖拽只改变推演预览，不自动下发</li>
          <li>模拟任务包必须经人工批准</li>
        </ul>
      </section>
    </>
  )
}

function PlanNotice({ tone, icon: Icon, title, body }: { tone: string; icon: typeof AlertTriangle; title: string; body: string }) {
  return (
    <section className={`command-plan-notice tone-${tone}`}>
      <span><Icon size={16} /></span>
      <div><strong>{title}</strong><p>{body}</p></div>
    </section>
  )
}

function SectionHeading({ icon: Icon, title, suffix }: { icon: typeof Route; title: string; suffix: string }) {
  return <h3 className="command-section-heading"><Icon size={13} /><span>{title}</span><small>{suffix}</small></h3>
}

function PlanMetrics({ items }: { items: Array<[string, string]> }) {
  return (
    <section className="command-plan-section">
      <SectionHeading icon={Clock3} title="同步重算" suffix="方案快照" />
      <dl className="command-metrics-grid">
        {items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  )
}

function VersionLedger({
  planVersion,
  approvedVersion,
  taskVersion,
  taskStatus,
  previousTask,
}: {
  planVersion: number
  approvedVersion: number | null
  taskVersion: number | null
  taskStatus: CommandTaskStatus
  previousTask: PreviousCommandTask | null
}) {
  return (
    <section className="command-plan-section">
      <SectionHeading icon={FileClock} title="版本与任务" suffix="可回溯" />
      <div className="command-version-ledger">
        {previousTask && (
          <article className="is-invalid">
            <span>v{previousTask.version}</span>
            <div>
              <strong>旧批准与任务包</strong>
              <small>{previousTask.status === 'replaced' ? `已被 v${planVersion} 替代` : '已失效 · 等待替换签收'} · 保留审计记录</small>
            </div>
            <b>{previousTask.status === 'replaced' ? '已替代' : '失效'}</b>
          </article>
        )}
        <article className="is-current"><span>v{planVersion}</span><div><strong>当前方案版本</strong><small>{approvedVersion === planVersion ? '批准已绑定本版本' : '批准尚未绑定'}</small></div><b>{approvedVersion === planVersion ? '已批准' : '待批准'}</b></article>
        <article><span>T{taskVersion ?? '—'}</span><div><strong>任务包</strong><small>{TASK_LABEL[taskStatus]}</small></div><b>{taskStatus === 'arrived' ? '抵达' : taskStatus === 'invalidated' ? '失效' : '模拟'}</b></article>
      </div>
    </section>
  )
}

function CommandApprovalFooter({
  scenario,
  phase,
  reducedMotion,
  onAction,
}: {
  scenario: CommandScenarioId
  phase: CommandPhase | null
  reducedMotion: boolean
  onAction: () => void
}) {
  if (!['traffic', 'medical'].includes(scenario)) {
    return <footer className="command-approval-footer is-muted"><LockKeyhole size={14} /><span>本工作面尚未进入执行演示，不会产生任务。</span></footer>
  }
  if (scenario === 'traffic' && phase === 'blocked') {
    return <footer className="command-approval-footer is-muted"><Route size={14} /><span>可在地图拖动清障车 02，或在右栏选择绿色路线 C。</span></footer>
  }
  if (scenario === 'traffic' && phase === 'recalculating') {
    return <footer className="command-approval-footer is-muted"><LoaderCircle size={14} /><span>地图已切换，正在生成新的方案与任务草案。</span></footer>
  }
  if (scenario === 'medical' && phase === 'blocked') {
    return <footer className="command-approval-footer is-muted"><Route size={14} /><span>可在地图拖动救护车 AMB-02，或在右栏选择候选接收点。</span></footer>
  }
  if (scenario === 'medical' && phase === 'recalculating') {
    return <footer className="command-approval-footer is-muted"><LoaderCircle size={14} /><span>地图已切换，正在生成新的转运方案与任务草案。</span></footer>
  }
  const action = phase === 'awaiting-approval'
        ? { label: scenario === 'traffic' ? '负责人确认并模拟下发改线 v2' : '人工批准 转运 v2', icon: LockKeyhole }
        : phase === 'approved'
          ? { label: '模拟发送任务包', icon: Send }
          : phase === 'sent-awaiting-ack'
            ? { label: '模拟接收单位签收', icon: CheckCircle2 }
            : phase === 'acknowledged'
              ? { label: '模拟开始执行', icon: Play }
              : phase === 'en-route' && reducedMotion
                ? { label: '模拟抵达', icon: CheckCircle2 }
            : phase === 'arrived'
              ? { label: '重置本条演示', icon: RefreshCcw }
              : null
  return (
    <footer className="command-approval-footer">
      <p><LockKeyhole size={12} />地图拖拽只改变推演预览；方案下发需要负责人确认</p>
      {action ? <button type="button" onClick={onAction}><action.icon size={14} />{action.label}</button> : <div className="command-execution-state"><span className="command-live-dot" />单位正沿新路线缓慢移动</div>}
    </footer>
  )
}

function advisorBoundaryForScenario(scenario: CommandScenarioId) {
  if (scenario === 'traffic') return '道路几何来自公开底图；阻塞、车辆、ETA、任务与回执均为本地模拟。我只解释、比较并整理草案，不批准、不发送、不移动车辆。'
  if (scenario === 'medical') return '原接收医院为既有模拟点位；两家候选医院名称与坐标为公开静态 POI。接收能力、车辆、ETA、调派与回执均为模拟或待联络确认。我不作临床判断，也不确认医院可接收。'
  return '我可以解释页面信息、比较影响并整理草案；不会批准、发送或直接调度资源。'
}

function advisorPromptsForScenario(scenario: CommandScenarioId) {
  if (scenario === 'traffic') return ['解释当前异常', '比较 A/B/C 路线', '说明改线任务影响', '整理路线 C 草案']
  if (scenario === 'medical') return ['解释接收异常', '比较三家医院', '列出联络核实项', '整理转运调整草案']
  if (scenario === 'city-order') return ['区分待核实证据', '整理 AI Brief 草案']
  return ['解释当前状态', '整理影响清单']
}

function advisorResponse(
  scenario: CommandScenarioId,
  text: string,
  context: {
    trafficRouteId: 'B' | 'C'
    medicalFacilityId: DispatchFacilityId
    phase: CommandPhase | null
  },
) {
  if (/(提示词|prompt|密钥|api\s*key|系统配置)/i.test(text)) {
    return '我不能提供系统提示词、密钥或内部配置。可以继续围绕当前事件做异常研判、方案比较、影响分析或调整草案。'
  }
  if (scenario === 'traffic') {
    if (text.includes('比较') || text.includes('路线')) {
      const comparison = TRAFFIC_STRATEGY_ROUTES.map((route) => (
        `路线 ${route.id}：${route.etaLabel}，${route.roadStatus}。依据：${route.recommendationReason}`
      )).join('；')
      return `${comparison} 当前地图显示路线 ${context.trafficRouteId}${context.trafficRouteId === 'C' ? ' 的调整预览，尚未下发。' : ' 的受阻状态。'}系统推荐不代表自动批准或自动下发。`
    }
    if (text.includes('影响') || text.includes('草案')) return '从 B 改为 C 会同步重算 ETA、风险和任务清单，并使旧批准与旧任务包失效。助手只能整理待确认草案；负责人仍需在右栏执行人工确认下发。'
    return '当前异常是路线 B 前方受阻。应先核实阻塞范围、预计恢复时间和路线 C 的可通行条件；页面车辆位置、ETA 和回执均为本地模拟。'
  }
  if (scenario === 'medical') {
    const selectedFacility = getDispatchFacility(context.medicalFacilityId) ?? DISPATCH_FACILITIES[0]
    if (text.includes('比较') || text.includes('接收点') || text.includes('医院')) {
      const comparison = DISPATCH_FACILITIES.map((facility) => `${facility.name}：${facility.receivingState}，${dispatchFacilityEtaLabel(facility)}`).join('；')
      return `${comparison}。临时演示规则只用于安排人工联络顺序：先比较接收状态，再比较演示 ETA；不构成自动最优医院决策。“可联络”不等于已确认接收。当前地图显示${selectedFacility.name}路线，状态为“${medicalRoutePhaseDetail(context.phase)}”。`
    }
    if (text.includes('核实') || text.includes('联络')) return '需要人工核实候选医院当前接收能力、急诊联络人、预计交接窗口、车辆到达后的接收点位，以及途中风险变化；系统不会替代临床分级或接收确认。'
    if (text.includes('影响') || text.includes('草案')) return '更换接收点会重算路线、ETA、联络负责人和任务清单，旧批准与旧任务包不能自动继承。我可以整理待批准草案，但不会批准或发送。'
    return '当前是模拟的医疗协同回传异常，不代表真实床位或专科能力。应先核实原接收点状态，再比较候选接收点及转运影响。'
  }
  if (scenario === 'city-order') return '先核实图片、语音和视频是否指向同一处通道；待核实证据不应直接改变处置方案。'
  return `我可以为“${text}”整理草案和影响清单，但需要指挥员在地图与右栏完成确定性操作。当前阶段为 ${context.phase ?? '只读草案'}。`
}
