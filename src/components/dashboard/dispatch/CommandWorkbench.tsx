import {
  memo,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
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
  MapPin,
  MessageSquareText,
  Mic2,
  Play,
  RefreshCcw,
  Route,
  Send,
  ShieldAlert,
  Sparkles,
  Video,
  X,
} from 'lucide-react'

import { CommandTacticalMap } from './CommandTacticalMap'
import type { ExecutionFrame } from '@/components/dashboard/execution/executionPlayback'
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
import './CommandWorkbench.css'

interface CommandWorkbenchProps {
  event: {
    id: string
    title: string
    location: string
    domain: string
    domainColor: string
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
  role: 'assistant' | 'user'
  text: string
}

const PHASE_META: Record<CommandPhase, { label: string; tone: string }> = {
  blocked: { label: '执行异常', tone: 'danger' },
  preview: { label: '调整预览', tone: 'violet' },
  'awaiting-approval': { label: '待人工批准', tone: 'amber' },
  approved: { label: '已批准 · 待发送', tone: 'green' },
  'sent-awaiting-ack': { label: '已发送 · 待签收', tone: 'blue' },
  acknowledged: { label: '已签收 · 待执行', tone: 'green' },
  'en-route': { label: '新指令执行中 · 在途', tone: 'blue' },
  arrived: { label: '已抵达', tone: 'green' },
}

const TASK_LABEL: Record<CommandTaskStatus, string> = {
  invalidated: '旧任务已失效',
  'pending-send': '新任务包待发送',
  'sent-awaiting-ack': '已发送，等待模拟签收',
  accepted: '接收单位已模拟签收',
  'en-route': '执行单位在途',
  arrived: '执行单位已抵达',
}

export const CommandWorkbench = memo(function CommandWorkbench({ event, renderMap }: CommandWorkbenchProps) {
  const [state, dispatch] = useReducer(commandWorkbenchReducer, undefined, createInitialCommandWorkbenchState)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [advisorInput, setAdvisorInput] = useState('')
  const [reducedMotion, setReducedMotion] = useState(false)
  const [advisorMessages, setAdvisorMessages] = useState<AdvisorMessage[]>([
    {
      id: 'assistant-boundary',
      role: 'assistant',
      text: '我可以解释路线、比较影响并整理调整草案；不会批准、发送或直接移动资源。',
    },
  ])
  const advisorToggleRef = useRef<HTMLButtonElement>(null)
  const scenario = commandScenarioForEvent(event.id)
  const scenarioMeta = COMMAND_SCENARIOS.find((item) => item.id === scenario) ?? {
    id: 'generic' as const,
    short: '未知',
    label: '未识别工作面',
    eventId: event.id,
    color: '#6B7280',
    priority: 'P1' as const,
  }
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
      const accepted = ['acknowledged', 'en-route', 'arrived'].includes(state.traffic.phase)
      return createCommandExecutionFrame({
        id: 'traffic-zhongshan-reroute',
        label: '清障车 02',
        kind: 'traffic',
        routeRole: accepted ? 'medical' : 'secondary',
        progress: state.traffic.carProgress,
        phase: state.traffic.phase,
      })
    }
    if (scenario === 'medical') {
      const accepted = ['acknowledged', 'en-route', 'arrived'].includes(state.medical.phase)
      return createCommandExecutionFrame({
        id: 'medical-panfu-transfer',
        label: '救护车 AMB-02',
        kind: 'medical',
        routeRole: accepted ? 'secondary' : 'primary',
        progress: state.medical.ambulanceProgress,
        phase: state.medical.phase,
      })
    }
    return null
  }, [scenario, state.medical, state.traffic])

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

  const liveMessage = useMemo(() => {
    if (scenario === 'traffic') {
      const traffic = state.traffic
      if (traffic.phase === 'preview') return '已生成路线 C 预览，当前 v1 指令仍有效。'
      if (traffic.phase === 'awaiting-approval') return '方案更新为 v2，v1 批准和任务包已失效。'
      if (traffic.phase === 'acknowledged') return '新任务已模拟签收，等待指挥员开始执行。'
      if (traffic.phase === 'en-route') return '新任务开始执行，清障车沿路线 C 继续移动。'
      if (traffic.phase === 'arrived') return '清障车已模拟抵达作业点。'
    }
    if (scenario === 'medical') {
      const medical = state.medical
      if (medical.phase === 'preview') return '已生成红十字会医院转运预览，当前 v1 指令仍有效。'
      if (medical.phase === 'awaiting-approval') return '医疗方案更新为 v2，需要重新人工批准。'
      if (medical.phase === 'acknowledged') return '新转运任务已模拟签收，等待指挥员开始执行。'
      if (medical.phase === 'en-route') return '新转运任务开始执行，救护车沿新路线移动。'
      if (medical.phase === 'arrived') return '救护车已模拟抵达新接收点。'
    }
    return '调度工作台已切换场景。'
  }, [scenario, state.medical, state.traffic])

  const submitAdvisor = (event_: FormEvent<HTMLFormElement>) => {
    event_.preventDefault()
    const text = advisorInput.trim()
    if (!text) return
    const response = advisorResponse(scenario, text)
    setAdvisorMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', text },
      { id: crypto.randomUUID(), role: 'assistant', text: response },
    ])
    setAdvisorInput('')
  }

  const closeAdvisor = () => {
    setAdvisorOpen(false)
    window.setTimeout(() => advisorToggleRef.current?.focus(), 0)
  }

  return (
    <main className="command-workbench" data-testid="command-workbench">
      <div className="sr-only" aria-live="polite">{liveMessage}</div>
      <CommandTacticalMap
        scenario={scenario}
        map={renderMap(scenario, {
          executionFrame: commandExecutionFrame,
          onScenarioPointSelect: (label) => {
            if (scenario === 'traffic' && label === '南侧备用路口') {
              dispatch({ type: 'traffic/preview-reroute' })
            }
            if (scenario === 'medical' && label === '广州市红十字会医院') {
              dispatch({ type: 'medical/select-red-cross' })
            }
          },
        })}
        traffic={state.traffic}
        medical={state.medical}
        onTrafficPreview={() => dispatch({ type: 'traffic/preview-reroute' })}
        onMedicalSelect={() => dispatch({ type: 'medical/select-red-cross' })}
      />

      <aside className="command-plan-panel" aria-label="动态方案与任务">
        <header className="command-plan-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="command-plan-status-dot" style={{ backgroundColor: scenarioMeta.color }} />
              <h2>动态方案</h2>
              <span className={`command-phase-badge tone-${headerPhase.tone}`}>{headerPhase.label}</span>
            </div>
            <p className="truncate">{event.title} · {event.location}</p>
          </div>
          <div className="command-version">
            <span>{activePlanVersion === null ? scenario === 'city-order' ? 'BRIEF' : 'SCOPE' : 'PLAN'}</span>
            <strong>{activePlanVersion === null ? scenario === 'city-order' ? `${state.evidence.filter((item) => item.status === 'verified').length}/3` : '草案' : `v${activePlanVersion}`}</strong>
          </div>
        </header>

        <div className="command-plan-scroll">
          {scenario === 'traffic' && <TrafficPlan state={state.traffic} />}
          {scenario === 'medical' && <MedicalPlan state={state.medical} />}
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

        <section
          className={`command-advisor ${advisorOpen ? 'is-open' : ''}`}
          aria-label="Chatbot 参谋"
          onKeyDown={(event_) => {
            if (event_.key !== 'Escape' || !advisorOpen) return
            event_.stopPropagation()
            closeAdvisor()
          }}
        >
          <button
            ref={advisorToggleRef}
            type="button"
            className="command-advisor-toggle"
            aria-expanded={advisorOpen}
            aria-controls="command-advisor-body"
            onClick={() => setAdvisorOpen((current) => !current)}
          >
            <span className="command-advisor-icon"><Bot size={15} /></span>
            <span className="min-w-0 flex-1 text-left"><strong>城安参谋</strong><small>只解释与生成草案，不执行</small></span>
            {advisorOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
          {advisorOpen && (
            <div id="command-advisor-body" className="command-advisor-body">
              <div className="command-advisor-toolbar">
                <span><Sparkles size={12} />本地演示回复</span>
                <button type="button" onClick={closeAdvisor} aria-label="收起城安参谋"><X size={13} /></button>
              </div>
              <div className="command-advisor-messages">
                {advisorMessages.slice(-4).map((message) => (
                  <p key={message.id} className={`command-advisor-message is-${message.role}`}>{message.text}</p>
                ))}
              </div>
              <div className="command-advisor-prompts">
                {['比较三条路线', '解释为什么要重新批准'].map((prompt) => (
                  <button key={prompt} type="button" onClick={() => setAdvisorInput(prompt)}>{prompt}</button>
                ))}
              </div>
              <form onSubmit={submitAdvisor} className="command-advisor-form">
                <label className="sr-only" htmlFor="command-advisor-input">询问城安参谋</label>
                <input
                  id="command-advisor-input"
                  value={advisorInput}
                  onChange={(event_) => setAdvisorInput(event_.target.value)}
                  placeholder="询问路线、风险或任务影响"
                />
                <button type="submit" aria-label="发送问题"><Send size={14} /></button>
              </form>
            </div>
          )}
        </section>

        <CommandApprovalFooter
          scenario={scenario}
          phase={activePhase}
          reducedMotion={reducedMotion}
          onAction={() => {
            if (scenario === 'traffic') {
              if (state.traffic.phase === 'blocked') dispatch({ type: 'traffic/preview-reroute' })
              else if (state.traffic.phase === 'preview') dispatch({ type: 'traffic/submit-reroute' })
              else if (state.traffic.phase === 'awaiting-approval') dispatch({ type: 'traffic/approve' })
              else if (state.traffic.phase === 'approved') dispatch({ type: 'traffic/issue' })
              else if (state.traffic.phase === 'sent-awaiting-ack') dispatch({ type: 'traffic/acknowledge' })
              else if (state.traffic.phase === 'acknowledged') dispatch({ type: 'traffic/start-execution' })
              else if (state.traffic.phase === 'en-route' && reducedMotion) dispatch({ type: 'traffic/tick', delta: 1 })
              else if (state.traffic.phase === 'arrived') dispatch({ type: 'traffic/reset' })
            }
            if (scenario === 'medical') {
              if (state.medical.phase === 'blocked') dispatch({ type: 'medical/select-red-cross' })
              else if (state.medical.phase === 'preview') dispatch({ type: 'medical/submit-adjustment' })
              else if (state.medical.phase === 'awaiting-approval') dispatch({ type: 'medical/approve' })
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
  const waiting = phase === 'acknowledged'
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
    incidentStage: arrived ? '现场核验' : '协同在途',
    blockingAlert: null,
  }
}

function TrafficPlan({ state }: { state: ReturnType<typeof createInitialCommandWorkbenchState>['traffic'] }) {
  const routeCPreview = state.activeRouteId === 'C'
  const replacementAccepted = ['acknowledged', 'en-route', 'arrived'].includes(state.phase)
  return (
    <>
      <PlanNotice
        tone="danger"
        icon={AlertTriangle}
        title="原最短路线前方受阻"
        body="清障车 02 仍在途；若新指令尚未签收，车辆将在安全决策点暂停。"
      />

      <section className="command-plan-section">
        <SectionHeading icon={Route} title="三路线比较" suffix="策略预设" />
        <div className="command-route-list">
          <RouteRow code="A" color="#3B82F6" title="常规路线" time="12 分钟" note="可通行 · 总时间最长" />
          <RouteRow code="B" color="#E5484D" title="原最短路线" time="8 分钟" note="原预计 · 前方已受阻" state="blocked" />
          <RouteRow code="C" color="#30A46C" title="推荐改线" time="10 分钟" note="比 B 稍长，但短于 A" state={routeCPreview ? 'selected' : undefined} />
        </div>
        <div className="command-time-equation"><span>8 分钟 <small>已受阻</small></span><b>&lt;</b><span>10 分钟 <small>推荐</small></span><b>&lt;</b><span>12 分钟 <small>常规</small></span></div>
      </section>

      <PlanMetrics
        items={[
          ['当前执行', replacementAccepted ? '路线 C' : '路线 B · 至安全分叉点'],
          ['调整预览', routeCPreview ? '路线 C · 10 分钟' : '尚未生成'],
          ['剩余 ETA', state.phase === 'arrived' ? '已抵达' : replacementAccepted ? `${Math.max(0, Math.ceil((1 - state.carProgress) * 10))} 分钟 · 动态` : '至分叉点 · 动态'],
          ['风险变化', replacementAccepted ? '受阻风险已解除' : routeCPreview ? '预览：绕开受阻路段' : '原路线不可继续'],
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

function MedicalPlan({ state }: { state: ReturnType<typeof createInitialCommandWorkbenchState>['medical'] }) {
  const redCrossSelected = state.selectedFacilityId === 'facility-red-cross'
  const replacementAccepted = ['acknowledged', 'en-route', 'arrived'].includes(state.phase)
  return (
    <>
      <PlanNotice
        tone="danger"
        icon={ShieldAlert}
        title="市一医院接收能力下降"
        body="该状态为模拟的结构化回传，不展示或推断真实床位、专科能力与临床分级。"
      />

      <section className="command-plan-section">
        <SectionHeading icon={MapPin} title="接收点调整" suffix="公开静态 POI" />
        <div className="command-facility-list">
          <article className="is-unavailable"><div><strong>广州市第一人民医院</strong><span>原目标 · 接收能力下降</span></div><b>6 分钟</b></article>
          <article className={redCrossSelected ? 'is-selected' : ''}><div><strong>广州市红十字会医院</strong><span>候选目标 · 接收状态待联络</span></div><b>10 分钟</b></article>
        </div>
      </section>

      <PlanMetrics
        items={[
          ['当前执行', replacementAccepted ? '红十字会医院' : '市一医院 · 至安全分叉点'],
          ['调整预览', redCrossSelected ? '红十字会医院 · 10±2 分钟' : '尚未生成'],
          ['执行单位', '救护车 AMB-02 · 保留'],
          ['联络负责人', replacementAccepted ? '转运协调负责人' : redCrossSelected ? '候选：转运协调负责人' : '急救联络负责人'],
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
          <li>地图点选或拖拽不直接执行</li>
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

function RouteRow({ code, color, title, time, note, state }: { code: string; color: string; title: string; time: string; note: string; state?: 'blocked' | 'selected' }) {
  return (
    <article className={`command-route-row ${state ? `is-${state}` : ''}`}>
      <span className="command-route-code" style={{ backgroundColor: color }}>{code}</span>
      <div><strong>{title}</strong><small>{note}</small></div>
      <b style={{ color }}>{time}</b>
    </article>
  )
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
  const action = phase === 'blocked'
    ? { label: scenario === 'traffic' ? '生成路线 C 预览' : '选择红十字会医院', icon: Route }
    : phase === 'preview'
      ? { label: '提交调整并生成新版本', icon: Play }
      : phase === 'awaiting-approval'
        ? { label: `人工批准 ${scenario === 'traffic' ? '改线' : '转运'} v2`, icon: LockKeyhole }
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
      <p><LockKeyhole size={12} />点选、拖拽和 Chatbot 都不会自动执行</p>
      {action ? <button type="button" onClick={onAction}><action.icon size={14} />{action.label}</button> : <div className="command-execution-state"><span className="command-live-dot" />单位正沿新路线缓慢移动</div>}
    </footer>
  )
}

function advisorResponse(scenario: CommandScenarioId, text: string) {
  if (scenario === 'traffic') {
    if (text.includes('比较') || text.includes('路线')) return '路线 B 原预计 8 分钟但已受阻；路线 C 预计 10 分钟，比常规路线 A 的 12 分钟更短。我建议生成 C 的调整草案，交由指挥员批准。'
    return '核心参数从路线 B 改为 C 后，旧批准与任务包不能自动继承，否则接收单位可能同时看到两条冲突指令。'
  }
  if (scenario === 'medical') return '建议保留同一辆在途救护车，只更换接收点、路线和联络负责人。红十字会医院状态仍需人工联络确认。'
  if (scenario === 'city-order') return '先核实图片、语音和视频是否指向同一处通道；待核实证据不应直接改变处置方案。'
  return `我可以为“${text}”整理草案和影响清单，但需要指挥员在地图和动态方案区人工确认。`
}
