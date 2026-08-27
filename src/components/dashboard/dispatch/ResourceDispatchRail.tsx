import { ArrowRight, CheckCircle2, Clock3, MapPin, Radio, Waves } from 'lucide-react'

import { TODAY_EVENT_STATUS_META } from '../board/boardData'
import {
  DISPATCH_CASES,
  getDispatchEvent,
  type DispatchOperation,
} from './dispatchData'
import type { ActiveDispatchEvent } from './activeEventDispatchModel'
import { orderDispatchEventIds } from './resourceDispatchOrder'

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
  const activeById = new Map(active.map((item) => [item.eventId, item]))
  const orderedActive = orderDispatchEventIds(active.map((item) => item.eventId), selectedEventId)
    .map((eventId) => activeById.get(eventId)!)
  const pinnedEvent = currentEvent && !DISPATCH_CASES.some((item) => item.eventId === currentEvent.id)
    ? currentEvent
    : null

  return (
    <aside aria-label="调度事件" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-panel">
      <div className="shrink-0 border-b border-[#E8EAF0] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-[#1A1D26]">异常与数据流</h2>
            <p className="mt-0.5 text-[10px] text-[#8A94A7]">事件、信号、任务与回执</p>
          </div>
          <span className="rounded-lg bg-[#EEEEFB] px-2 py-1 font-mono text-[11px] font-semibold text-[#5B5BD6]">{DISPATCH_CASES.length + (pinnedEvent ? 1 : 0)}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="dispatch-event-list">
        {pinnedEvent && <PinnedEventCard event={pinnedEvent} />}
        {selectedEventId && <SignalFeed eventId={selectedEventId} />}
        <div className="space-y-2">
          {orderedActive.map((item) => (
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

const SIGNALS_BY_EVENT: Record<string, Array<{ time: string; label: string; detail: string; confidence: 'confirmed' | 'pending' }>> = {
  'ev-traffic-zhongshan': [
    { time: '14:44:03', label: '任务回执', detail: '清障车 02 沿原最短路线在途', confidence: 'confirmed' },
    { time: '14:44:18', label: '道路异常', detail: '前方作业入口受阻 · 模拟', confidence: 'confirmed' },
    { time: '14:44:25', label: '路线重算', detail: 'A / B / C 三路线等待人工改线', confidence: 'pending' },
  ],
  'ev-medical-panfu': [
    { time: '14:48:02', label: '接收回传', detail: '原接收医院承接能力不足 · 模拟待核实', confidence: 'pending' },
    { time: '14:48:16', label: '候选检索', detail: '两家候选 ETA 已载入 · 演示估算', confidence: 'pending' },
  ],
  'ev-city-order-beijing': [
    { time: '22:41:08', label: '商户图片', detail: '夜市摊位疑似占用通道 · 模拟', confidence: 'pending' },
    { time: '22:41:32', label: '巡查语音', detail: '消防通道宽度尚未核实', confidence: 'pending' },
  ],
}

function SignalFeed({ eventId }: { eventId: string }) {
  const signals = SIGNALS_BY_EVENT[eventId]
  if (!signals?.length) return null
  return (
    <section className="mb-2 rounded-xl border border-[#E8EAF0] bg-[#F8F9FC] p-2.5" aria-label="当前事件数据流">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#526176]"><Waves size={12} className="text-[#5B5BD6]" />当前数据流<span className="ml-auto font-mono text-[9px] text-[#9CA3AF]">{signals.length}</span></div>
      <ol className="space-y-2">
        {signals.map((signal) => (
          <li key={`${signal.time}-${signal.label}`} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
            <span
              className={`mt-1 size-2 ${signal.confidence === 'confirmed' ? 'rounded-full bg-[#5B5BD6]' : 'rounded-[2px] border border-dashed border-[#C07816]'}`}
              aria-label={signal.confidence === 'confirmed' ? '已确认' : '待核实'}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5"><strong className="text-[9px] text-[#46546A]">{signal.label}</strong><time className="font-mono text-[8px] text-[#9CA3AF]">{signal.time}</time></div>
              <p className="mt-0.5 text-[9px] leading-relaxed text-[#7A8598]">{signal.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
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
