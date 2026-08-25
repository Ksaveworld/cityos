import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  MapPin,
  Radio,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from 'lucide-react'

import { resolveAssignments } from '../workflow/ApprovedOutputs'
import type { TaskAssignment, TaskDispatchOverride, WorkflowSession } from '../workflow/types'
import {
  resolveDispatchException,
  resolveDispatchOptionAnalysis,
  type ActiveDispatchEvent,
  type DispatchException,
} from './activeEventDispatchModel'

export type { ActiveDispatchEvent } from './activeEventDispatchModel'

const DELIVERY_META: Record<WorkflowSession['deliveryStatus'], { label: string; detail: string; tone: string }> = {
  draft: { label: '等待生成', detail: '任务包尚未形成', tone: 'bg-[#F3F4F6] text-[#667085]' },
  'pending-send': { label: '等待下发', detail: '当前批准版本等待下发', tone: 'bg-[#FFF5DE] text-[#946114]' },
  delivered: { label: '已送达', detail: '任务包已送达，等待签收', tone: 'bg-[#EAF2FF] text-[#2768CA]' },
  acknowledged: { label: '已签收', detail: '协同部门已签收任务包', tone: 'bg-[#EAF2FF] text-[#2768CA]' },
  executing: { label: '调度进行中', detail: '任务正在协同执行', tone: 'bg-[#EEEEFB] text-[#5B5BD6]' },
  completed: { label: '调度正常', detail: '当前任务包已完成本轮执行', tone: 'bg-[#E8F7EF] text-[#237A52]' },
  abnormal: { label: '调度异常', detail: '执行反馈异常，等待人工复核', tone: 'bg-[#FDF0F0] text-[#A3373C]' },
}

const DEPARTMENT_COLORS: Record<string, string> = {
  消防: '#E5484D',
  公安: '#2F6FDA',
  医疗: '#0E9AA7',
  交管: '#B8860B',
  交通: '#B8860B',
  属地: '#7C3AED',
  现场组: '#7C3AED',
}

function departmentColor(department: string) {
  const match = Object.entries(DEPARTMENT_COLORS).find(([name]) => department.includes(name))
  return match?.[1] ?? '#5B5BD6'
}

export function ActiveEventRail({ event }: { event: ActiveDispatchEvent }) {
  const delivery = DELIVERY_META[event.session.deliveryStatus]
  const hasException = resolveDispatchException(event, resolveAssignments(event.fixture, event.session)) !== null
  return (
    <aside aria-label="正在处理的事件" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <header className="shrink-0 border-b border-line px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-1">正在处理的事件</h2>
            <p className="mt-0.5 text-[10px] text-ink-3">当前处置链带入的事件</p>
          </div>
          <span className="rounded-lg bg-accent-weak px-2 py-1 font-mono text-[11px] font-semibold text-accent-strong">1</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 p-2.5">
        <article className="overflow-hidden rounded-xl border border-accent-strong bg-white shadow-[0_8px_22px_rgb(91_91_214_/_0.12)]">
          <div className="p-3">
            <div className="flex items-center gap-1.5">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
              <span className="rounded bg-accent-weak px-1.5 py-0.5 text-[9px] font-semibold text-accent-strong">{event.kind === 'historical' ? '历史事件' : '日常事件'}</span>
              <span className="ml-auto font-mono text-[9px] text-ink-3">{event.timeLabel}</span>
            </div>
            <h3 className="mt-2.5 text-[13px] font-semibold leading-5 text-[#243653]">{event.title}</h3>
            <div className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-ink-3"><MapPin size={11} className="mt-0.5 shrink-0" />{event.location}</div>
            <div className="mt-2 rounded-lg bg-sunken px-2 py-2 text-[9px] leading-relaxed text-ink-2">{event.sourceLabel}</div>
          </div>
          <div className={`flex h-9 items-center justify-between border-t px-3 ${hasException ? 'border-[#F2CBCD] bg-[#FDF0F0]' : 'border-[#D9D9F8] bg-accent-weak'}`}>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-accent-strong"><Radio size={11} />当前选择</span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${hasException ? 'bg-white text-[#A3373C]' : delivery.tone}`}>{hasException ? '1 项异常' : delivery.label}</span>
          </div>
        </article>
      </div>

    </aside>
  )
}

export function ActiveEventDispatchContext({
  event,
  onAsk,
  onApplyResolution,
  selectedOptionId,
  onSelectOption,
}: {
  event: ActiveDispatchEvent
  onAsk: (question: string) => void
  onApplyResolution: (resolution: TaskDispatchOverride) => void
  selectedOptionId: string
  onSelectOption: (optionId: string) => void
}) {
  const assignments = resolveAssignments(event.fixture, event.session)
  const delivery = DELIVERY_META[event.session.deliveryStatus]
  const dispatchException = resolveDispatchException(event, assignments)
  const selectedPlan = event.fixture.plans.find((plan) => plan.id === event.session.selectedPlanId) ?? event.fixture.plans[0]
  const selectedResolution = dispatchException?.options.find((option) => option.optionId === selectedOptionId) ?? null
  const exceptionAssignment = dispatchException
    ? assignments.find((assignment) => assignment.department === dispatchException.department && assignment.task === dispatchException.task) ?? null
    : null
  const displayedAssignments = dispatchException
    ? [...assignments].sort((left, right) => Number(right.department === dispatchException.department && right.task === dispatchException.task) - Number(left.department === dispatchException.department && left.task === dispatchException.task))
    : assignments

  return (
    <aside aria-label={`${event.title}具体调度情况`} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <header className="shrink-0 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-1">具体调度情况</h2>
            <p className="mt-0.5 text-[9px] text-ink-3">当前任务包、异常信息与人工选择</p>
          </div>
          <span className={`rounded px-2 py-1 text-[9px] font-semibold ${dispatchException ? 'bg-[#FDF0F0] text-[#A3373C]' : delivery.tone}`}>{dispatchException ? '1 项异常' : delivery.label}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-page p-3">
        <section className="rounded-xl border border-line bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
            <span className="font-mono text-[9px] text-ink-3">{event.timeLabel}</span>
          </div>
          <h3 className="mt-2 text-[12px] font-semibold leading-5 text-[#243653]">{event.title}</h3>
          <p className="mt-1 flex items-start gap-1.5 text-[9px] leading-relaxed text-ink-3"><MapPin size={10} className="mt-0.5 shrink-0" />{event.location}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ContextMetric label="当前方案" value={`方案 ${selectedPlan.label}`} detail={selectedPlan.title} />
            <ContextMetric label="预计到场" value={`${event.session.etaMinutes.toFixed(1)} 分钟`} detail="页面模型估算" />
            <ContextMetric label="协同任务" value={`${assignments.length} 个`} detail="按部门任务包汇总" />
            <ContextMetric label="批准版本" value={`v${event.session.planVersion}`} detail="人工确认版本" />
          </div>
        </section>

        {dispatchException ? (
          <section className="rounded-xl border border-[#E9A8AD] bg-[#FFF8F8] p-3 shadow-[0_6px_18px_rgb(180_35_53_/_0.07)]">
            <div className="flex items-start gap-2">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[#B42335]"><AlertTriangle size={13} /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[11px] font-semibold text-[#8C2D35]">{dispatchException.title}</h3>
                <p className="mt-1 text-[9px] leading-relaxed text-[#8C4549]">{dispatchException.detail}</p>
              </div>
            </div>
            <ul className="mt-2 space-y-1 border-t border-[#F2CBCD] pt-2">
              {dispatchException.signals.map((signal) => <li key={signal} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[#8C4549]"><i className="mt-1 size-1.5 shrink-0 rounded-full bg-[#B42335]" />{signal}</li>)}
            </ul>
            <button type="button" onClick={() => onAsk(`请分析“${dispatchException.title}”的原因、需要先核实的信息，并比较当前两个替代资源的影响。`)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#E9A8AD] bg-white text-[10px] font-semibold text-[#A3373C] hover:bg-[#FDF0F0]"><Bot size={11} />让助手分析这项异常</button>
            {selectedResolution && exceptionAssignment && (
              <DispatchResolutionPreview
                assignment={exceptionAssignment}
                resolution={selectedResolution}
                nextVersion={event.session.planVersion + 1}
              />
            )}
            <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={`${dispatchException.department}替代资源`}>
              {dispatchException.options.map((option) => {
                const selected = option.optionId === selectedOptionId
                const optionIndex = dispatchException.options.findIndex((item) => item.optionId === option.optionId)
                const analysis = resolveDispatchOptionAnalysis(event, option, optionIndex)
                return (
                  <button key={option.optionId} type="button" role="radio" aria-checked={selected} onClick={() => onSelectOption(option.optionId)} className={`w-full rounded-lg border p-2 text-left transition ${selected ? 'border-[#B42335] bg-white shadow-sm' : 'border-[#F2CBCD] bg-white/70 hover:bg-white'}`}>
                    <span className="flex items-center gap-1.5 text-[9px] font-semibold text-[#8C2D35]"><i className={`size-2 rounded-full border ${selected ? 'border-[#B42335] bg-[#B42335]' : 'border-[#D58B92] bg-white'}`} />{option.optionLabel}{analysis.recommended && <em className="ml-auto rounded bg-[#FFF5DE] px-1.5 py-0.5 not-italic text-[#946114]">建议优先</em>}</span>
                    <span className="mt-1 block text-[8px] leading-relaxed text-[#A65A60]">{option.location} · {option.vehicles}</span>
                    <span className="mt-1 block text-[8px] leading-relaxed text-ink-3">依据：{analysis.benefit}</span>
                    <span className="mt-1 block text-[8px] leading-relaxed text-[#8C4549]">待核实：{analysis.tradeoff}</span>
                  </button>
                )
              })}
            </div>
            {selectedResolution && <button type="button" onClick={() => onAsk(`请分析把当前异常调整为“${selectedResolution.optionLabel}”的收益、风险和需要人工确认的事项。`)} className="mt-2 w-full text-center text-[9px] font-semibold text-accent-strong hover:underline">在对话中分析已选资源</button>}
          </section>
        ) : (
          <section className="rounded-xl border border-line bg-white p-3 text-[9px] leading-relaxed text-ink-2">
            当前未发现需要改派的异常。可在对话中询问任务差异、资源状态与后续回传要求。
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[11px] font-semibold text-ink-1">部门任务</h3><span className="text-[9px] text-ink-3">{assignments.length} 项</span></div>
          <div className="space-y-2">
            {displayedAssignments.map((assignment, index) => {
              const abnormal = dispatchException?.department === assignment.department && dispatchException.task === assignment.task
              const pendingResolution = abnormal ? selectedResolution : null
              const displayedAssignment = pendingResolution ? applyPendingResolution(assignment, pendingResolution) : assignment
              return (
                <details key={`${assignment.department}-${index}`} open={abnormal} className={`rounded-xl border bg-white ${abnormal ? 'border-[#E9A8AD]' : 'border-line'}`}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-lg text-white" style={{ background: departmentColor(assignment.department) }}><Radio size={10} /></span>
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-ink-1">{assignment.department}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${pendingResolution ? 'bg-[#FFF5DE] text-[#946114]' : abnormal ? DELIVERY_META.abnormal.tone : delivery.tone}`}>{pendingResolution ? '待确认调整' : abnormal ? '调度异常' : delivery.label}</span>
                  </summary>
                  <div className="border-t border-hairline px-3 py-2 text-[9px] leading-relaxed text-ink-2">
                    <div className="font-semibold text-[#243653]">{displayedAssignment.task}</div>
                    <div className="mt-1 text-ink-3">{displayedAssignment.location} · {displayedAssignment.vehicles}</div>
                    <div className="mt-1">回传：{displayedAssignment.feedback}</div>
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t border-line bg-white p-3">
        {dispatchException ? (
          <>
            <button type="button" disabled={!selectedResolution} onClick={() => selectedResolution && onApplyResolution(selectedResolution)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong px-3 text-[10px] font-semibold text-white hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3"><RotateCcw size={11} />{selectedResolution ? `确认切换为 ${selectedResolution.optionLabel}` : '先选择替代资源'}</button>
            <p className="mt-1.5 text-center text-[8px] leading-relaxed text-ink-3">确认后生成新任务包版本，并返回任务页重新下发。</p>
          </>
        ) : (
          <>
            <div role="status" className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#E8F7EF] px-3 text-[10px] font-semibold text-[#237A52]"><CheckCircle2 size={11} />当前没有待确认的资源调整</div>
            <p className="mt-1.5 text-center text-[8px] leading-relaxed text-ink-3">当前回传正常，无需生成新的任务包版本。</p>
          </>
        )}
      </footer>
    </aside>
  )
}

function ContextMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 rounded-lg bg-sunken px-2 py-2"><div className="text-[8px] text-ink-3">{label}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-ink-1">{value}</div><div className="mt-0.5 truncate text-[8px] text-ink-3">{detail}</div></div>
}

function applyPendingResolution(assignment: TaskAssignment, resolution: TaskDispatchOverride): TaskAssignment {
  return {
    ...assignment,
    owner: resolution.owner,
    task: `${assignment.task} · 拟调整为${resolution.optionLabel}`,
    location: resolution.location,
    vehicles: resolution.vehicles,
    feedback: `确认后：${resolution.note}`,
  }
}

function DispatchResolutionPreview({
  assignment,
  resolution,
  nextVersion,
}: {
  assignment: TaskAssignment
  resolution: TaskDispatchOverride
  nextVersion: number
}) {
  return (
    <section aria-label="资源调整预览" aria-live="polite" className="mt-2 rounded-lg border border-[#C9DBF8] bg-[#F7FAFF] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-[#285EAA]">调整预览</span>
        <span className="rounded bg-[#FFF5DE] px-1.5 py-0.5 text-[8px] font-semibold text-[#946114]">待确认调整</span>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="min-w-0 rounded-md bg-white px-2 py-1.5">
          <div className="text-[8px] font-semibold text-ink-3">调整前</div>
          <div className="mt-1 text-[9px] font-semibold leading-relaxed text-ink-1">{assignment.location}</div>
          <div className="mt-0.5 text-[8px] leading-relaxed text-ink-3">{assignment.vehicles}</div>
        </div>
        <ArrowLeft size={12} className="rotate-180 text-[#4D73B8]" />
        <div className="min-w-0 rounded-md border border-[#D8E5FA] bg-white px-2 py-1.5">
          <div className="text-[8px] font-semibold text-[#285EAA]">调整后</div>
          <div className="mt-1 text-[9px] font-semibold leading-relaxed text-[#243653]">{resolution.optionLabel}</div>
          <div className="mt-0.5 text-[8px] leading-relaxed text-ink-3">{resolution.location} · {resolution.vehicles}</div>
        </div>
      </div>
      <p className="mt-2 text-[8px] leading-relaxed text-[#4D6485]">确认后生成任务包 v{nextVersion}；新资源尚未下发，仍需返回任务页重新下发。</p>
    </section>
  )
}

export function ActiveEventDispatchStatus({
  event,
  onApplyResolution,
}: {
  event: ActiveDispatchEvent
  onApplyResolution: (resolution: TaskDispatchOverride) => void
}) {
  const assignments = resolveAssignments(event.fixture, event.session)
  const delivery = DELIVERY_META[event.session.deliveryStatus]
  const dispatchException = resolveDispatchException(event, assignments)
  const [selectedOptionId, setSelectedOptionId] = useState('')
  useEffect(() => setSelectedOptionId(''), [event.id, dispatchException?.title])
  const selectedResolution = dispatchException?.options.find((option) => option.optionId === selectedOptionId) ?? null
  const displayedAssignments = dispatchException
    ? [...assignments].sort((left, right) => Number(right.department === dispatchException.department && right.task === dispatchException.task) - Number(left.department === dispatchException.department && left.task === dispatchException.task))
    : assignments
  const selectedPlan = event.fixture.plans.find((plan) => plan.id === event.session.selectedPlanId) ?? event.fixture.plans[0]

  return (
    <section aria-label={`${event.title}当前调度情况`} className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-panel">
      <header className="shrink-0 border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-semibold tracking-tight text-ink-1">当前调度情况</h1>
              <span className={`rounded px-2 py-1 text-[10px] font-semibold ${dispatchException ? 'bg-[#FDF0F0] text-[#A3373C]' : delivery.tone}`}>{dispatchException ? '1 项异常待处理' : delivery.label}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-ink-2">{event.title} · {event.location}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-sunken px-2.5 py-1.5 text-[9px] text-ink-3"><ShieldCheck size={11} />人工批准版本 v{event.session.planVersion}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-4 gap-3">
          <Summary label="当前方案" value={`方案 ${selectedPlan.label}`} detail={selectedPlan.title} icon={<FileText size={14} />} />
          <Summary label="协同任务" value={`${assignments.length} 个`} detail="按部门任务包汇总" icon={<CheckCircle2 size={14} />} />
          <Summary label="预计到场" value={`${event.session.etaMinutes.toFixed(1)} 分钟`} detail="页面模型估算" icon={<Clock3 size={14} />} />
          <Summary label="调度异常" value={dispatchException ? '1 项待处理' : '未发现'} detail={dispatchException?.department ?? '当前回传正常'} icon={<AlertTriangle size={14} />} tone={dispatchException ? 'danger' : 'default'} />
        </div>

        {dispatchException && (
          <section className="mt-4 flex items-start gap-3 rounded-xl border border-[#F2CBCD] bg-[#FDF0F0] px-3 py-2.5" aria-label="当前调度异常">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-[#B42335]"><AlertTriangle size={15} /></span>
            <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="text-[11px] font-semibold text-[#8C2D35]">{dispatchException.title}</h2><span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#A3373C]">执行异常</span></div>
              <p className="mt-1 text-[10px] leading-relaxed text-[#8C4549]">{dispatchException.detail}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[9px] font-semibold text-[#A3373C]">需要重新确认任务包</span>
          </section>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-1">各部门当前任务</h2>
            <p className="mt-0.5 text-[10px] text-ink-3">同一批准任务包下的当前调度与执行反馈</p>
          </div>
          <span className={`rounded-lg px-2.5 py-1.5 text-[10px] ${dispatchException ? 'bg-[#FDF0F0] text-[#A3373C]' : 'bg-sunken text-ink-2'}`}>{dispatchException ? '最新资源回传触发 1 项异常' : delivery.detail}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {displayedAssignments.map((assignment, index) => (
            <DepartmentTaskCard
              key={`${assignment.department}-${index}`}
              assignment={assignment}
              status={dispatchException?.department === assignment.department && dispatchException.task === assignment.task ? DELIVERY_META.abnormal : delivery}
              exception={dispatchException?.department === assignment.department && dispatchException.task === assignment.task ? dispatchException : null}
              selectedOptionId={selectedOptionId}
              onSelectOption={setSelectedOptionId}
              nextVersion={event.session.planVersion + 1}
            />
          ))}
        </div>

        {event.session.deliveryStatus === 'abnormal' && (
          <section className="mt-4 rounded-xl border border-[#F2CBCD] bg-[#FDF0F0] p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#A3373C]"><AlertTriangle size={13} />异常关联信息待核实</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {event.fixture.brief.gaps.slice(0, 3).map((gap) => <span key={gap.label} className="rounded-lg border border-[#F2CBCD] bg-white px-2 py-1 text-[9px] text-[#8C4549]">{gap.label}</span>)}
            </div>
          </section>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-sunken px-5 py-3">
        {dispatchException ? (
          <>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold text-ink-1">{selectedResolution ? `准备切换为：${selectedResolution.optionLabel}` : '请先选择替代资源'}</div>
              <p className="mt-0.5 truncate text-[9px] text-ink-3">资源调整会生成已人工确认的新任务包版本，再返回同一事件 Task 页面下发。</p>
            </div>
            <button type="button" disabled={!selectedResolution} onClick={() => selectedResolution && onApplyResolution(selectedResolution)} className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-strong px-4 text-[11px] font-semibold text-white hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3"><RotateCcw size={12} />确认调整并返回任务下发</button>
          </>
        ) : (
          <div role="status" className="flex w-full items-center justify-between gap-3 rounded-lg bg-[#E8F7EF] px-3 py-2 text-[#237A52]"><span className="flex items-center gap-1.5 text-[10px] font-semibold"><CheckCircle2 size={12} />当前没有待确认的资源调整</span><span className="text-[9px]">当前回传正常，无需生成新的任务包版本。</span></div>
        )}
      </footer>
    </section>
  )
}

function Summary({ label, value, detail, icon, tone = 'default' }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'danger' ? 'border-[#F2CBCD] bg-[#FDF0F0]' : 'border-line bg-sunken'}`}>
      <div className={`flex items-center gap-1.5 text-[9px] ${tone === 'danger' ? 'text-[#A3373C]' : 'text-ink-3'}`}>{icon}{label}</div>
      <div className={`mt-1.5 text-[14px] font-semibold ${tone === 'danger' ? 'text-[#8C2D35]' : 'text-ink-1'}`}>{value}</div>
      <div className={`mt-0.5 truncate text-[9px] ${tone === 'danger' ? 'text-[#A65A60]' : 'text-ink-3'}`}>{detail}</div>
    </div>
  )
}

function DepartmentTaskCard({
  assignment,
  status,
  exception,
  selectedOptionId,
  onSelectOption,
  nextVersion,
}: {
  assignment: TaskAssignment
  status: (typeof DELIVERY_META)[WorkflowSession['deliveryStatus']]
  exception: DispatchException | null
  selectedOptionId: string
  onSelectOption: (optionId: string) => void
  nextVersion: number
}) {
  const color = departmentColor(assignment.department)
  const selectedResolution = exception?.options.find((option) => option.optionId === selectedOptionId) ?? null
  const displayedAssignment = selectedResolution ? applyPendingResolution(assignment, selectedResolution) : assignment
  const displayedStatus = selectedResolution
    ? { label: '待确认调整', tone: 'bg-[#FFF5DE] text-[#946114]' }
    : status
  return (
    <article className={`overflow-hidden rounded-xl border bg-white ${exception ? 'border-[#E9A8AD] shadow-[0_6px_18px_rgb(180_35_53_/_0.08)]' : 'border-line'}`}>
      <header className={`flex items-center gap-2 border-b px-3 py-2.5 ${exception ? 'border-[#F2CBCD] bg-[#FFF8F8]' : 'border-hairline'}`}>
        <span className="grid size-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: color }}><Radio size={12} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[11px] font-semibold text-ink-1">{assignment.department}</h3>
          <p className="mt-0.5 truncate text-[9px] text-ink-3">{displayedAssignment.owner}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${displayedStatus.tone}`}>{displayedStatus.label}</span>
      </header>
      <div className="p-3">
        <div className="text-[11px] font-semibold leading-5 text-[#243653]">{displayedAssignment.task}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] leading-relaxed">
          <TaskFact icon={<MapPin size={10} />} label="位置" value={displayedAssignment.location} />
          <TaskFact icon={<Clock3 size={10} />} label="时限" value={displayedAssignment.window} />
          <TaskFact icon={<UserRound size={10} />} label="人员" value={displayedAssignment.personnel} />
          <TaskFact icon={<History size={10} />} label="资源" value={displayedAssignment.vehicles} />
        </div>
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-sunken px-2 py-1.5 text-[9px] leading-relaxed text-ink-2"><ArrowLeft size={10} className="mt-0.5 shrink-0 rotate-180" />回传：{displayedAssignment.feedback}</div>
        {exception && (
          <div className="mt-2 rounded-lg border border-[#F2CBCD] bg-[#FDF0F0] p-2.5">
            <div className="text-[10px] font-semibold text-[#A3373C]">异常影响</div>
            <ul className="mt-1.5 space-y-1">
              {exception.signals.map((signal) => <li key={signal} className="flex items-start gap-1.5 text-[9px] leading-relaxed text-[#8C4549]"><AlertTriangle size={9} className="mt-0.5 shrink-0" />{signal}</li>)}
            </ul>
            <p className="mt-2 border-t border-[#F2CBCD] pt-2 text-[9px] font-semibold leading-relaxed text-[#8C2D35]">建议：{exception.action}</p>
            {selectedResolution && <DispatchResolutionPreview assignment={assignment} resolution={selectedResolution} nextVersion={nextVersion} />}
            <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={`${exception.department}替代资源`}>
              {exception.options.map((option) => {
                const selected = option.optionId === selectedOptionId
                return (
                  <button key={option.optionId} type="button" role="radio" aria-checked={selected} onClick={() => onSelectOption(option.optionId)} className={`rounded-lg border p-2 text-left transition ${selected ? 'border-[#B42335] bg-white shadow-sm' : 'border-[#F2CBCD] bg-white/70 hover:bg-white'}`}>
                    <span className="flex items-center gap-1.5 text-[9px] font-semibold text-[#8C2D35]"><i className={`size-2 rounded-full border ${selected ? 'border-[#B42335] bg-[#B42335]' : 'border-[#D58B92] bg-white'}`} />{option.optionLabel}</span>
                    <span className="mt-1 block text-[8px] leading-relaxed text-[#A65A60]">{option.location} · {option.vehicles}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function TaskFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="min-w-0 rounded-lg bg-sunken px-2 py-1.5"><div className="flex items-center gap-1 text-ink-3">{icon}{label}</div><div className="mt-0.5 line-clamp-2 text-ink-2">{value}</div></div>
}
