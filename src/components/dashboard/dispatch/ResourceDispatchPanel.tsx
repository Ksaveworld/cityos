import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw, Send, ShieldCheck, X } from 'lucide-react'

import type { DomainFixture, WorkflowSession } from '../workflow/types'
import { recalculateMetrics } from '../workflow/state'
import {
  DISPATCH_FACILITIES,
  dispatchDisplayText,
  dispatchDraftChanged,
  getDispatchEvent,
  getDispatchUnit,
  type DispatchAssignment,
  type DispatchCase,
  type DispatchDraft,
  type DispatchOperation,
} from './dispatchData'

export function ResourceDispatchPanel({
  dispatchCase,
  fixture,
  session,
  assignment,
  draft,
  operation,
  sourceAssignment,
  onDraftChange,
  onResetDraft,
  onApply,
  onApprove,
  onSend,
  onClose,
}: {
  dispatchCase: DispatchCase
  fixture: DomainFixture
  session: WorkflowSession
  assignment: DispatchAssignment
  draft: DispatchDraft
  operation: DispatchOperation
  sourceAssignment: DispatchAssignment | null
  onDraftChange: (draft: DispatchDraft) => void
  onResetDraft: () => void
  onApply: () => void
  onApprove: () => void
  onSend: () => void
  onClose: () => void
}) {
  const event = getDispatchEvent(dispatchCase)
  const preview = recalculateMetrics(
    fixture,
    draft.resourceCount,
    draft.fireOptionId,
    draft.medicalOptionId,
    draft.trafficOptionId,
  )
  const dirty = dispatchDraftChanged(draft, assignment, session)
  const selectedUnit = getDispatchUnit(draft.primaryUnitId)
  const selectedFacility = draft.facilityId ? DISPATCH_FACILITIES.find((item) => item.id === draft.facilityId) ?? null : null
  const approvalCurrent = session.approvedVersion === session.planVersion
  const sourceEvent = sourceAssignment
    ? getDispatchEvent({ ...dispatchCase, eventId: sourceAssignment.eventId, scenarioId: sourceAssignment.scenarioId })
    : null
  const panelId = `dispatch-panel-${dispatchCase.eventId}`
  const abnormalRetry = ['abnormal'].includes(event.status)
  const dispositionModes = [
    { id: 'rapid', label: '快速响应', hint: '各协同单位前置', index: 0 },
    { id: 'balanced', label: '均衡协同', hint: '按常规节奏配合', index: 1 },
    { id: 'limited', label: '有限协同', hint: '减少跨部门动作', index: 2 },
  ].map((mode) => ({
    ...mode,
    description: [
      fixture.fireDispatch.options[mode.index]?.label,
      fixture.medicalDispatch.options[mode.index]?.label,
      fixture.trafficDispatch.options[mode.index]?.label,
    ].filter(Boolean).map(dispatchDisplayText).join(' · '),
  }))
  const selectedDisposition = dispositionModes.find((mode) => (
    fixture.fireDispatch.options[mode.index]?.id === draft.fireOptionId
    && fixture.medicalDispatch.options[mode.index]?.id === draft.medicalOptionId
    && fixture.trafficDispatch.options[mode.index]?.id === draft.trafficOptionId
  ))?.id ?? null

  const set = <K extends keyof DispatchDraft>(key: K, value: DispatchDraft[K]) => onDraftChange({ ...draft, [key]: value })

  return (
    <aside
      id={panelId}
      aria-label={`${event.title}资源调度`}
      data-dispatch-version={session.planVersion}
      data-dispatch-approval-state={approvalCurrent ? 'approved' : 'unapproved'}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-panel"
    >
      <header className="shrink-0 border-b border-[#E8EAF0] px-3 py-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
              <span className="text-[9px] text-[#8A94A7]">即时重算</span>
            </div>
            <h2 className="mt-1.5 truncate text-[13px] font-semibold text-[#243653]">{event.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭资源调度面板" className="grid size-8 shrink-0 place-items-center rounded-lg text-[#7C8799] hover:bg-[#F4F5FA]"><X size={14} /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-xl bg-[#F7F8FB] p-1.5" aria-label="当前调度摘要">
          <Info label="当前主责" value={getDispatchUnit(assignment.primaryUnitId).name} />
          <Info label="批准" value={approvalCurrent ? '已批准' : '待确认'} tone={approvalCurrent ? 'good' : 'warn'} />
        </div>

        <Section title={dispatchCase.primaryLabel}>
          {dispatchCase.candidateUnitIds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#D6D9E2] bg-[#F7F8FB] p-3 text-[10px] leading-relaxed text-[#6B7280]">
              暂无可用候选资源。请保留当前配置并联系相邻辖区人工增援。
            </div>
          ) : (
            <div className="space-y-1.5" role="radiogroup" aria-label={dispatchCase.primaryLabel}>
              {dispatchCase.candidateUnitIds.map((unitId) => {
                const unit = getDispatchUnit(unitId)
                const selected = draft.primaryUnitId === unitId
                return (
                  <button
                    key={unitId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-dispatch-resource-id={unitId}
                    onClick={() => set('primaryUnitId', unitId)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${selected ? 'border-[#5B5BD6] bg-[#F4F3FF]' : 'border-[#E8EAF0] hover:bg-[#F7F8FB]'}`}
                  >
                    <span className={`size-2.5 shrink-0 rounded-full border-2 ${selected ? 'border-[#5B5BD6] bg-[#5B5BD6]' : 'border-[#B9C0CC] bg-white'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-semibold text-[#34445C]">{unit.name}</span>
                      <span className="mt-0.5 block truncate text-[9px] text-[#8A94A7]">{unit.strength} · ETA {unit.eta ?? '待估算'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Section>

        {dispatchCase.facilityIds && (
          <Section title="接收点">
            <div className="space-y-1.5">
              {dispatchCase.facilityIds.map((facilityId) => {
                const facility = DISPATCH_FACILITIES.find((item) => item.id === facilityId)!
                const selected = draft.facilityId === facilityId
                return (
                  <button
                    key={facility.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onDraftChange({ ...draft, facilityId: facility.id, primaryUnitId: facility.unitId ?? draft.primaryUnitId })}
                    className={`w-full rounded-lg border p-2 text-left ${selected ? 'border-[#0E9AA7] bg-[#EFFAFA]' : 'border-[#E8EAF0] hover:bg-[#F7F8FB]'}`}
                  >
                    <span className="block text-[10px] font-semibold text-[#34445C]">{facility.name}</span>
                    <span className={`mt-0.5 block text-[9px] ${facility.planningState.impacted ? 'text-[#AD3B44]' : 'text-[#168177]'}`}>{facility.receivingState}</span>
                    <span className="mt-1 block text-[8px] leading-relaxed text-[#8A94A7]">{facility.note}</span>
                  </button>
                )
              })}
            </div>
          </Section>
        )}

        <Section title="处置方式">
          <p className="mb-2 text-[9px] leading-relaxed text-[#8A94A7]">选择系统提供的协同组合，内部参数会同步更新。</p>
          <div className="space-y-1.5" role="radiogroup" aria-label="处置方式">
            {dispositionModes.map((mode) => {
              const selected = selectedDisposition === mode.id
              return (
                <button
                  key={mode.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-dispatch-disposition={mode.id}
                  onClick={() => onDraftChange({
                    ...draft,
                    fireOptionId: fixture.fireDispatch.options[mode.index].id,
                    medicalOptionId: fixture.medicalDispatch.options[mode.index].id,
                    trafficOptionId: fixture.trafficDispatch.options[mode.index].id,
                  })}
                  className={`w-full rounded-lg border p-2 text-left transition ${selected ? 'border-[#5B5BD6] bg-[#F4F3FF]' : 'border-[#E8EAF0] bg-white hover:bg-[#F7F8FB]'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 shrink-0 rounded-full border-2 ${selected ? 'border-[#5B5BD6] bg-[#5B5BD6]' : 'border-[#B9C0CC] bg-white'}`} />
                    <span className="text-[10px] font-semibold text-[#34445C]">{mode.label}</span>
                    <span className="ml-auto text-[8px] text-[#8A94A7]">{mode.hint}</span>
                  </span>
                  <span className="mt-1 block line-clamp-2 pl-[18px] text-[8px] leading-relaxed text-[#7C8799]">{mode.description}</span>
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="影响预览">
          <div className="overflow-hidden rounded-xl border border-[#D9D9F8] bg-[#F8F7FF]" aria-label="当前到调整后的因果对照">
            <div className="grid grid-cols-[1fr_28px_1fr] items-stretch">
              <ImpactSide label="当前" eta={session.etaMinutes} risk={session.coverageRisk} unit={getDispatchUnit(assignment.primaryUnitId).name} />
              <div className="grid place-items-center bg-[#EEEEFB] text-[#5B5BD6]"><ArrowRight size={14} /></div>
              <ImpactSide label="调整后" eta={preview.etaMinutes} risk={preview.coverageRisk} unit={selectedUnit.name} active />
            </div>
          </div>
          {selectedFacility && <p className="mt-1.5 text-[9px] leading-relaxed text-[#6B7280]">接收点：{selectedFacility.name} · {selectedFacility.receivingState}</p>}
          {sourceAssignment && sourceEvent && (
            <div className="mt-2 rounded-lg border border-[#F0D59A] bg-[#FFF9EC] p-2 text-[9px] leading-relaxed text-[#7A5718]">
              <div className="flex items-center gap-1 font-semibold"><AlertTriangle size={11} />跨事件抽调影响</div>
              <div className="mt-1">{selectedUnit.name} 当前归属“{sourceEvent.title}”。批准后将同步移除来源分配，来源任务需重新确认，覆盖风险预计上升。</div>
            </div>
          )}
          <p className="mt-2 text-[8px] leading-relaxed text-[#9CA3AF]">点位间仅表达调度关系，不代表道路路线；ETA 与覆盖为模型估算。</p>
        </Section>
      </div>

      <footer className="shrink-0 border-t border-[#E8EAF0] bg-white p-3">
        <div className="mb-2 min-h-4 text-[9px] leading-relaxed text-[#6B7280]" aria-live="polite">{dispatchDisplayText(operation.message).replace('；未连接任何真实外部系统。', '。')}</div>
        {operation.status === 'idle' && operation.sourceEventId && !operation.pendingDraft ? (
          <button type="button" disabled className="h-8 w-full rounded-lg bg-[#F1F2F6] text-[10px] font-semibold text-[#7C8799]">等待目标事件同步批准</button>
        ) : operation.status === 'idle' && (
          <div className="flex gap-2">
            <button type="button" onClick={onResetDraft} disabled={!dirty} className="grid h-8 w-9 shrink-0 place-items-center rounded-lg border border-[#E0E3EA] text-[#667085] hover:bg-[#F7F8FB] disabled:opacity-40" aria-label="取消草稿"><RotateCcw size={13} /></button>
            <button type="button" onClick={onApply} disabled={!dirty || dispatchCase.candidateUnitIds.length === 0} className="h-8 flex-1 rounded-lg bg-[#5B5BD6] text-[11px] font-semibold text-white hover:bg-[#4D4DC2] disabled:bg-[#E1E2EA] disabled:text-[#9CA3AF]">应用调整并重算</button>
          </div>
        )}
        {operation.status === 'pending-approval' && (
          <button type="button" onClick={onApprove} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#5B5BD6] text-[11px] font-semibold text-white hover:bg-[#4D4DC2]"><ShieldCheck size={13} />人工批准</button>
        )}
        {operation.status === 'approved' && (
          <button type="button" onClick={onSend} disabled={!approvalCurrent} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#263D5E] text-[11px] font-semibold text-white hover:bg-[#1B2E49] disabled:opacity-40"><Send size={13} />{abnormalRetry ? '重新下发（受控重试）' : '下发任务包'}</button>
        )}
        {operation.status === 'sent' && (
          <button type="button" disabled className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#E8F7EF] text-[11px] font-semibold text-[#237A52]"><CheckCircle2 size={13} />{abnormalRetry ? '受控重试已使用（1/1）' : '任务已下发'}</button>
        )}
      </footer>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-4"><h3 className="mb-2 text-[10px] font-semibold tracking-wide text-[#4E5D72]">{title}</h3>{children}</section>
}

function Info({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'good' | 'warn' }) {
  const color = tone === 'good' ? 'text-[#237A52]' : tone === 'warn' ? 'text-[#AD3B44]' : 'text-[#34445C]'
  return <div className="rounded-lg bg-[#F7F8FB] p-2"><div className="text-[8px] text-[#9CA3AF]">{label}</div><div className={`mt-1 line-clamp-2 text-[9px] font-semibold leading-relaxed ${color}`}>{value}</div></div>
}

function ImpactSide({ label, eta, risk, unit, active = false }: { label: string; eta: number; risk: string; unit: string; active?: boolean }) {
  return <div className="min-w-0 p-2.5"><div className={`text-[9px] font-semibold ${active ? 'text-[#5B5BD6]' : 'text-[#7C8799]'}`}>{label}</div><div className="mt-1 font-mono text-[15px] font-bold tabular-nums text-[#243653]">{eta.toFixed(1)}<span className="ml-0.5 text-[8px] font-normal">min</span></div><div className="mt-1 text-[9px] text-[#6B7280]">覆盖风险：{risk}</div><div className="mt-1 truncate text-[8px] text-[#9CA3AF]">{unit}</div></div>
}
