import { BadgeCheck, FileText, MapPin, Route, ShieldCheck, Users } from 'lucide-react'

import type { DeliveryStatus, DomainFixture, TaskAssignment, WorkflowSession } from './types'

/**
 * 批准后的两个任务包（卡片形式）：
 * 结果一「指挥任务包」——给指挥席看的全局执行卡；
 * 结果二「负责人任务包」——按人分派的任务卡，含签收状态。
 * 两份打印件必须分别映射各自卡片字段，不能退回候选方案报告。
 */

export function resolveAssignments(fixture: DomainFixture, session: WorkflowSession): TaskAssignment[] {
  const applyDispatchOverride = (assignments: TaskAssignment[]) => {
    const department = session.inputValues.dispatchOverrideDepartment
    const task = session.inputValues.dispatchOverrideTask
    if (!department) return assignments
    return assignments.map((assignment) => assignment.department === department && (!task || assignment.task === task) ? {
      ...assignment,
      task: session.inputValues.dispatchOverrideOptionLabel
        ? `${assignment.task} · 调整为${session.inputValues.dispatchOverrideOptionLabel}`
        : assignment.task,
      owner: session.inputValues.dispatchOverrideOwner || assignment.owner,
      location: session.inputValues.dispatchOverrideLocation || assignment.location,
      vehicles: session.inputValues.dispatchOverrideVehicles || assignment.vehicles,
      feedback: session.inputValues.dispatchOverrideNote
        ? `${assignment.feedback}；调整回执：${session.inputValues.dispatchOverrideNote}`
        : assignment.feedback,
    } : assignment)
  }
  if (fixture.taskAssignments) {
    return applyDispatchOverride(fixture.taskAssignments.map((assignment, index) => {
      const sourcedAssignment = {
        ...assignment,
        etaSource: assignment.etaSource ?? '任务包编排参数',
      }
      if (index > 0) return sourcedAssignment
      const currentResource = `${fixture.resourceLabel} ${session.resourceCount} ${fixture.resourceUnit}（当前投入）`
      return {
        ...sourcedAssignment,
        ...(fixture.countOwner === null ? { personnel: currentResource } : { vehicles: currentResource }),
        eta: `${session.etaMinutes.toFixed(1)} 分钟（当前估算）`,
        etaSource: `方案 v${session.planVersion} 当前重算`,
      }
    }))
  }
  const owner = fixture.defaultOwner
  const plan = fixture.plans.find((item) => item.id === session.selectedPlanId) ?? fixture.plans[0]
  return applyDispatchOverride(plan.actions.map((action, index) => ({
    department: fixture.label,
    owner,
    task: action,
    location: fixture.address.split('·')[0].trim(),
    window: `批准后第 ${index + 1} 步 · 演示时限`,
    personnel: `${session.resourceCount} ${fixture.resourceUnit}编组`,
    vehicles: '按编组配置',
    feedback: '位置、到场、异常、完成四类状态',
    contact: '系统任务包',
    eta: `${session.etaMinutes.toFixed(1)} 分钟`,
    etaSource: `方案 v${session.planVersion} 当前估算`,
  })))
}

type AckState = { label: string; bg: string; fg: string }

function ackStateFor(status: DeliveryStatus, index: number): AckState {
  if (status === 'draft' || status === 'pending-send') return { label: '待下发', bg: '#FFF5DE', fg: '#946114' }
  if (status === 'delivered') {
    return index < 2
      ? { label: '已签收', bg: '#E8F7EF', fg: '#237A52' }
      : { label: '已送达', bg: '#EAF2FF', fg: '#2768CA' }
  }
  return { label: '已签收', bg: '#E8F7EF', fg: '#237A52' }
}

const DEPARTMENT_COLORS: Record<string, string> = {
  消防: '#E5484D',
  公安: '#2F6FDA',
  医疗: '#0E9AA7',
  交管: '#B8860B',
  属地: '#7C3AED',
}

function DeptBadge({ name }: { name: string }) {
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-[9px] font-bold text-white"
      style={{ background: DEPARTMENT_COLORS[name] ?? '#5B5BD6' }}
    >
      {name}
    </span>
  )
}

export interface CommandTaskPackageOutput {
  subtitle: string
  approvedLabel: string
  facts: Array<{ label: string; value: string }>
  situationSummary: string
  planLabel: string
  planTitle: string
  eta: string
  etaNote: string
  decisionBasis: string
  assignments: TaskAssignment[]
  risks: Array<{ label: string; value: string; status: string }>
  provenance: Array<{
    label: string
    detail: string
    tone: 'blue' | 'green' | 'accent' | 'amber'
  }>
}

export interface TaskPackageOutput {
  subtitle: string
  versionLabel?: string
  versionUpdatedAt?: string
  assignments: TaskAssignment[]
  deliveryStatus: DeliveryStatus
  etaSuffix: string
}

const PROVENANCE_TONE = {
  blue: 'bg-[#EAF2FF] text-[#2768CA]',
  green: 'bg-[#EAF8F1] text-[#237A52]',
  accent: 'bg-accent-weak text-accent-strong',
  amber: 'bg-[#FFF5DE] text-[#946114]',
} as const

export function CommandTaskPackageCard({
  fixture,
  session,
  selectedPlan,
  assignments,
  onOpenReport,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  selectedPlan: DomainFixture['plans'][number]
  assignments: TaskAssignment[]
  onOpenReport: () => void
}) {
  const confirmedFacts = fixture.brief.confirmed.slice(0, 3)
  const risks = fixture.brief.gaps.slice(0, 2)
  const output: CommandTaskPackageOutput = {
    subtitle: `${fixture.title} · 当前执行方案 ${selectedPlan.label}（已批准）· v${session.planVersion} · 更新 ${session.versionUpdatedAt}`,
    approvedLabel: '已人工批准',
    facts: confirmedFacts.map((item) => ({ label: item.label, value: item.value })),
    situationSummary: fixture.brief.unknown[0]?.value
      ? `${selectedPlan.summary}当前主要不确定项：${fixture.brief.unknown[0].label}。`
      : selectedPlan.summary,
    planLabel: selectedPlan.label,
    planTitle: selectedPlan.title,
    eta: `${session.etaMinutes.toFixed(1)} 分钟`,
    etaNote: '预计到场（估算）',
    decisionBasis: session.decisionNote || '未填写决策说明',
    assignments,
    risks: risks.map((item) => ({ label: item.label, value: item.value, status: item.status })),
    provenance: [
      { label: '公开参考', detail: '底图 / 路网 / POI', tone: 'blue' },
      { label: '事件输入', detail: '当前会话字段', tone: 'accent' },
      { label: '待核实', detail: '被困人数 / 通道状态', tone: 'amber' },
    ],
  }

  return <CommandTaskPackageOutputCard output={output} onOpenReport={onOpenReport} />
}

export function CommandTaskPackageOutputCard({
  output,
  onOpenReport,
  reportLabel = '打开可打印《指挥任务包》',
}: {
  output: CommandTaskPackageOutput
  onOpenReport?: () => void
  reportLabel?: string
}) {
  const totalDepartments = output.assignments.length
  return (
    <article data-approved-output="command-task-package" className="overflow-hidden rounded-xl border border-[#C9DBF8] bg-white shadow-panel">
      <header className="flex items-center gap-2 border-b border-[#DCE8FB] bg-gradient-to-r from-[#F2F7FF] to-[#EAF2FF] px-3 py-2">
        <span className="grid size-6 place-items-center rounded-lg bg-[#2F73DE] text-white"><FileText size={12} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-[#1F3C6E]">结果一 · 指挥任务包</div>
          <div className="truncate text-[9px] text-[#5F729B]">{output.subtitle}</div>
        </div>
        <span className="shrink-0 rounded bg-[#E8F7EF] px-1.5 py-0.5 text-[9px] font-bold text-[#237A52]">{output.approvedLabel}</span>
      </header>

      <div className="space-y-2 p-2.5">
        <section>
          <CardLabel>事件事实</CardLabel>
          <div className="mt-1 space-y-0.5">
            {output.facts.map((item) => (
              <div key={item.label} className="flex items-baseline gap-1.5 text-[10px]">
                <span className="shrink-0 text-ink-3">{item.label}</span>
                <span className="min-w-0 flex-1 truncate text-ink-1">{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-sunken px-2 py-1.5">
          <CardLabel>态势摘要</CardLabel>
          <p className="mt-0.5 text-[10px] leading-relaxed text-ink-1">{output.situationSummary}</p>
        </section>

        <section className="rounded-lg border border-[#DCE8FB] bg-[#F7FAFF] px-2 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardLabel>执行依据</CardLabel>
              <div className="mt-0.5 truncate text-[11px] font-bold text-[#1F3C6E]">方案 {output.planLabel} · {output.planTitle}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[15px] font-bold leading-none text-[#2467CE]">{output.eta}</div>
              <div className="mt-0.5 text-[8px] text-ink-3">{output.etaNote}</div>
            </div>
          </div>
          <p className="mt-1 border-t border-[#E2ECFB] pt-1 text-[9px] leading-relaxed text-[#54657E]">
            <b className="text-[#3D5578]">选择依据：</b>{output.decisionBasis}
          </p>
        </section>

        <section>
          <CardLabel>人员与资源清单</CardLabel>
          <div className="mt-1 grid grid-cols-1 gap-1 xl:grid-cols-2">
            {output.assignments.map((item, index) => (
              <div key={`${item.department}-${item.owner}-${index}`} className="flex items-center gap-1.5 rounded-md bg-sunken px-1.5 py-1">
                <DeptBadge name={item.department} />
                <span className="min-w-0 flex-1 truncate text-[9px] text-ink-2">{item.personnel} · {item.vehicles}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 rounded-md bg-[#EEF4FF] px-1.5 py-1">
              <Users size={10} className="shrink-0 text-[#2768CA]" />
              <span className="text-[9px] font-semibold text-[#2768CA]">{totalDepartments} 个部门协同</span>
            </div>
          </div>
        </section>

        <section>
          <CardLabel>路线与时间窗</CardLabel>
          <div className="mt-1 space-y-0.5">
            {output.assignments.slice(0, 3).map((item, index) => (
              <div key={`${item.department}-route-${index}`} className="flex items-center gap-1.5 text-[9px]">
                <Route size={9} className="shrink-0 text-[#2F80ED]" />
                <DeptBadge name={item.department} />
                <span className="min-w-0 flex-1 truncate text-ink-2">{item.location}</span>
                <span className="shrink-0 font-mono text-ink-3">{item.window.split('·')[1]?.trim() ?? item.window}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <CardLabel>部门任务</CardLabel>
          <div className="mt-1 space-y-0.5">
            {output.assignments.map((item, index) => (
              <div key={`${item.department}-task-${index}`} className="flex items-center gap-1.5 text-[9px]">
                <span className="grid size-3.5 shrink-0 place-items-center rounded bg-accent-weak font-mono text-[8px] font-bold text-accent-strong">{index + 1}</span>
                <DeptBadge name={item.department} />
                <span className="min-w-0 flex-1 truncate text-ink-1">{item.task}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-dashed border-[#E4C580] bg-[#FFFBF2] px-2 py-1.5">
          <CardLabel tone="warn">风险、缺口与备选</CardLabel>
          <div className="mt-0.5 space-y-0.5">
            {output.risks.map((item) => (
              <div key={item.label} className="text-[9px] leading-relaxed text-[#7A5A1C]">
                <b>{item.label}：</b>{item.value}（{item.status}）
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-1 text-[8px]">
          {output.provenance.map((item) => (
            <span key={item.label} className="contents">
              <span className={`rounded px-1 py-px font-bold ${PROVENANCE_TONE[item.tone]}`}>{item.label}</span>
              <span className="text-ink-3">{item.detail}</span>
            </span>
          ))}
        </section>

        {onOpenReport && (
          <button
            type="button"
            onClick={onOpenReport}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#C9DBF8] bg-white text-[10px] font-semibold text-[#2467CE] transition hover:bg-[#F2F7FF]"
          >
            <FileText size={11} />{reportLabel}
          </button>
        )}
      </div>
    </article>
  )
}

export function TaskPackageCard({
  fixture,
  session,
  assignments,
  onOpenReport,
}: {
  fixture: DomainFixture
  session: WorkflowSession
  assignments: TaskAssignment[]
  onOpenReport: () => void
}) {
  const output: TaskPackageOutput = {
    subtitle: fixture.isHistoricalCase
      ? `总负责人：${fixture.defaultOwner} · 联系/送达：系统任务包`
      : `总负责人：${fixture.defaultOwner} · 联系/送达：系统任务包 + 回执`,
    versionLabel: `v${session.planVersion}`,
    versionUpdatedAt: session.versionUpdatedAt,
    assignments,
    deliveryStatus: session.deliveryStatus,
    etaSuffix: fixture.isHistoricalCase ? '' : '（估算）',
  }

  return <TaskPackageOutputCard output={output} onOpenReport={onOpenReport} />
}

export function TaskPackageOutputCard({
  output,
  onOpenReport,
  reportLabel = '打开可打印《负责人任务包》',
}: {
  output: TaskPackageOutput
  onOpenReport?: () => void
  reportLabel?: string
}) {
  return (
    <article data-approved-output="task-package" className="overflow-hidden rounded-xl border border-[#CBE5D6] bg-white shadow-panel">
      <header className="flex items-center gap-2 border-b border-[#D9EDE2] bg-gradient-to-r from-[#F2FBF6] to-[#E8F7EF] px-3 py-2">
        <span className="grid size-6 place-items-center rounded-lg bg-[#237A52] text-white"><ShieldCheck size={12} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold text-[#1C5238]">结果二 · 负责人任务包</div>
          <div className="truncate text-[9px] text-[#4E7A63]">{output.subtitle}</div>
        </div>
        {output.versionLabel && <span className="shrink-0 rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-[#237A52]">{output.versionLabel}</span>}
      </header>

      <div className="space-y-1.5 p-2.5">
        {output.versionUpdatedAt && <div className="text-[8px] text-ink-3">任务包更新：{output.versionUpdatedAt}</div>}
        {output.assignments.map((item, index) => {
          const ack = ackStateFor(output.deliveryStatus, index)
          return (
            <article key={`${item.department}-${item.owner}-${index}`} className="rounded-lg border border-line bg-white p-2">
              <div className="flex items-center gap-1.5">
                <DeptBadge name={item.department} />
                <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-ink-1">{item.owner}</span>
                <span className="shrink-0 rounded px-1.5 py-px text-[9px] font-bold" style={{ background: ack.bg, color: ack.fg }}>
                  {ack.label}
                </span>
              </div>
              <div className="mt-1 flex items-start gap-1.5 text-[10px] leading-snug text-ink-1">
                <BadgeCheck size={10} className="mt-px shrink-0 text-[#237A52]" />
                <span>{item.task}</span>
              </div>
              <div className="mt-1 grid grid-cols-1 gap-x-2 gap-y-0.5 text-[9px] text-ink-2 xl:grid-cols-2">
                <span className="flex items-center gap-1"><MapPin size={8} className="shrink-0 text-ink-3" />{item.location}</span>
                <span className="font-mono">{item.window}</span>
                <span>{item.personnel} · {item.vehicles}</span>
                <span className="text-ink-3">ETA {item.eta}{output.etaSuffix}</span>
              </div>
              <div className="mt-1 border-t border-hairline pt-1 text-[8px] leading-relaxed text-ink-3">
                回传：{item.feedback} · 送达：{item.contact}
              </div>
            </article>
          )
        })}

        {onOpenReport && (
          <button
            type="button"
            onClick={onOpenReport}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[#CBE5D6] bg-white text-[10px] font-semibold text-[#237A52] transition hover:bg-[#F2FBF6]"
          >
            <FileText size={11} />{reportLabel}
          </button>
        )}
      </div>
    </article>
  )
}

function CardLabel({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`text-[8px] font-bold uppercase tracking-[0.12em] ${tone === 'warn' ? 'text-[#A87A1E]' : 'text-ink-3'}`}>
      {children}
    </div>
  )
}
