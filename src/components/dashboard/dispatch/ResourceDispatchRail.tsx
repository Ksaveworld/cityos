import { ArrowRight, CheckCircle2, Clock3, MapPin, Radio } from 'lucide-react'

import { TODAY_EVENT_STATUS_META } from '../board/boardData'
import {
  DISPATCH_CASES,
  getDispatchEvent,
  type DispatchOperation,
} from './dispatchData'
import type { ActiveDispatchEvent } from './activeEventDispatchModel'

export function ResourceDispatchRail({
  selectedEventId,
  currentEvent,
  operations,
  onOpen,
}: {
  selectedEventId: string | null
  currentEvent?: ActiveDispatchEvent | null
  operations: Record<string, DispatchOperation>
  onOpen: (eventId: string) => void
}) {
  const adjusted = DISPATCH_CASES.filter((item) => ['approved', 'sent'].includes(operations[item.eventId]?.status))
  const active = DISPATCH_CASES.filter((item) => !adjusted.includes(item))
  const pinnedEvent = currentEvent && !DISPATCH_CASES.some((item) => item.eventId === currentEvent.id)
    ? currentEvent
    : null

  return (
    <aside aria-label="调度事件" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-panel">
      <div className="shrink-0 border-b border-[#E8EAF0] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-[#1A1D26]">调度事件</h2>
            <p className="mt-0.5 text-[10px] text-[#8A94A7]">当前事件与其它调度事件</p>
          </div>
          <span className="rounded-lg bg-[#EEEEFB] px-2 py-1 font-mono text-[11px] font-semibold text-[#5B5BD6]">{DISPATCH_CASES.length + (pinnedEvent ? 1 : 0)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="dispatch-event-list">
        {pinnedEvent && <PinnedEventCard event={pinnedEvent} />}
        <div className="space-y-2">
          {active.map((item) => (
            <DispatchEventCard key={item.eventId} eventId={item.eventId} selected={selectedEventId === item.eventId} operation={operations[item.eventId]} onOpen={onOpen} />
          ))}
        </div>

        {adjusted.length > 0 && (
          <section className="mt-3 border-t border-[#E8EAF0] pt-3" aria-label="本次已调整">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-[#526176]">
              <CheckCircle2 size={13} className="text-[#2D8A62]" />本次已调整
            </div>
            <div className="space-y-2">
              {adjusted.map((item) => (
                <DispatchEventCard key={item.eventId} eventId={item.eventId} selected={selectedEventId === item.eventId} operation={operations[item.eventId]} onOpen={onOpen} />
              ))}
            </div>
          </section>
        )}
      </div>

    </aside>
  )
}

function DispatchEventCard({
  eventId,
  selected,
  operation,
  onOpen,
}: {
  eventId: string
  selected: boolean
  operation?: DispatchOperation
  onOpen: (eventId: string) => void
}) {
  const dispatchCase = DISPATCH_CASES.find((item) => item.eventId === eventId)!
  const event = getDispatchEvent(dispatchCase)
  const status = TODAY_EVENT_STATUS_META[event.status]
  const adjusted = operation && ['approved', 'sent'].includes(operation.status)
  const controlsId = `dispatch-panel-${eventId}`

  return (
    <article
      data-dispatch-event-id={eventId}
      className={`overflow-hidden rounded-xl border bg-white transition ${selected ? 'border-[#5B5BD6] shadow-[0_6px_18px_rgb(91_91_214_/_0.12)]' : 'border-[#E8EAF0] hover:border-[#D6D9E2]'}`}
    >
      <div className="p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: status.bg, color: status.fg }}>{adjusted ? '已调整' : status.label}</span>
          <time className="ml-auto font-mono text-[9px] tabular-nums text-[#9CA3AF]">{event.time}</time>
        </div>
        <h3 className="mt-2 text-[12px] font-semibold leading-snug text-[#243653]">{event.title}</h3>
        <div className="mt-1 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#7A8598]">
          <Clock3 size={11} className="mt-0.5 shrink-0" />
          <span>{dispatchCase.reason}</span>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={selected}
        aria-controls={controlsId}
        onClick={() => onOpen(eventId)}
        className={`group flex h-8 w-full items-center justify-between border-t px-2.5 text-[11px] font-semibold transition ${selected ? 'border-[#D9D9F8] bg-[#EEEEFB] text-[#5B5BD6]' : 'border-[#E8EAF0] text-[#46546A] hover:bg-[#F7F8FB]'}`}
      >
        <span>{selected ? '当前调度事件' : '点击进入调度'}</span>
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </article>
  )
}

function PinnedEventCard({ event }: { event: ActiveDispatchEvent }) {
  return (
    <article className="mb-2 overflow-hidden rounded-xl border border-[#5B5BD6] bg-white shadow-[0_6px_18px_rgb(91_91_214_/_0.12)]">
      <div className="p-2.5">
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
          <span className="rounded bg-[#EEEEFB] px-1.5 py-0.5 text-[9px] font-medium text-[#5B5BD6]">历史事件</span>
          <time className="ml-auto font-mono text-[9px] tabular-nums text-[#9CA3AF]">{event.timeLabel}</time>
        </div>
        <h3 className="mt-2 text-[12px] font-semibold leading-snug text-[#243653]">{event.title}</h3>
        <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-relaxed text-[#7A8598]"><MapPin size={11} className="mt-0.5 shrink-0" />{event.location}</p>
      </div>
      <div className="flex h-8 items-center gap-1.5 border-t border-[#D9D9F8] bg-[#EEEEFB] px-2.5 text-[11px] font-semibold text-[#5B5BD6]"><Radio size={12} />当前调度事件</div>
    </article>
  )
}
