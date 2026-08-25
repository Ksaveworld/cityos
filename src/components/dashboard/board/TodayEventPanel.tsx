import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, History, MapPin, Radio, Send, UserRound } from 'lucide-react'

import { OriginMark } from '../Provenance'
import {
  HISTORICAL_CASES,
  TODAY_EVENT_STATUS_META,
  type HistoricalCase,
  type IncidentFilter,
  type TodayEvent,
} from './boardData'
import { resolveDispatchScenarioId } from '../dispatch/dispatchData'

const FILTERS: Array<{ id: IncidentFilter; label: string }> = [
  { id: 'all', label: '今日全部' },
  { id: 'pending-decision', label: '待人工决策' },
  { id: 'abnormal', label: '执行异常' },
]

/**
 * 事件处置右栏。8/21 评审要求上下拆成两块：今日事件和历史事件。
 *
 * 拆开的理由不是排版，是时间口径：今日台账回答「现在要处置什么」，历史案例回答
 * 「这套东西在已经发生过的事情上跑出来是什么样」。原来广州站 2015 那条混在今日
 * 台账里、时间列写着「历史」，读的人分不清它是今天的活儿还是复盘材料。
 *
 * 今日事件那块可折叠——两块都摊开的话，历史事件永远在滚动条下面看不见。
 */
export function TodayEventPanel({
  filter,
  selectedEventId,
  onFilterChange,
  onSelectEvent,
  onEnterWorkflow,
  onEnterHistoricalCase,
  onOpenKnowledge,
  events,
}: {
  filter: IncidentFilter
  selectedEventId: string | null
  onFilterChange: (filter: IncidentFilter) => void
  onSelectEvent: (eventId: string | null) => void
  onEnterWorkflow: (event: TodayEvent) => void
  onEnterHistoricalCase: (entry: HistoricalCase) => void
  onOpenKnowledge: () => void
  events: TodayEvent[]
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [todayExpanded, setTodayExpanded] = useState(true)
  const visibleEvents = useMemo(
    () => events.filter((event) => filter === 'all' || event.status === filter),
    [events, filter],
  )

  useEffect(() => {
    if (!selectedEventId) return
    setTodayExpanded(true)
    listRef.current
      ?.querySelector<HTMLElement>(`[data-today-event-id="${selectedEventId}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedEventId])

  return (
    <>
      <div className={`flex min-h-0 flex-col ${todayExpanded ? 'flex-1' : 'shrink-0'}`}>
        <button
          type="button"
          onClick={() => setTodayExpanded((expanded) => !expanded)}
          aria-expanded={todayExpanded}
          className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 pb-2 pt-2.5 text-left transition hover:bg-sunken/60"
        >
          <Radio size={13} className="shrink-0 text-accent-strong" />
          <h2 className="text-label font-semibold text-ink-1">今日事件</h2>
          <span className="rounded bg-accent-weak px-1.5 py-0.5 font-mono text-label tabular-nums text-accent-strong">
            {visibleEvents.length} / {events.length}
          </span>
          <span className="ml-auto rounded bg-[#FFF7E6] px-1.5 py-0.5 text-[9px] font-medium text-[#8A5A14]">演示台账</span>
          {todayExpanded
            ? <ChevronDown size={13} className="shrink-0 text-ink-3" />
            : <ChevronRight size={13} className="shrink-0 text-ink-3" />}
        </button>

        {todayExpanded && (
          <>
            <div className="shrink-0 border-b border-hairline px-3 py-2">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1" role="tablist" aria-label="今日事件筛选">
                {FILTERS.map((item) => {
                  const count = item.id === 'all'
                    ? events.length
                    : events.filter((event) => event.status === item.id).length
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={filter === item.id}
                      onClick={() => onFilterChange(item.id)}
                      className={`h-7 rounded-md text-[9px] transition ${
                        filter === item.id
                          ? 'bg-white font-semibold text-accent-strong shadow-panel'
                          : 'text-ink-2 hover:text-ink-1'
                      }`}
                    >
                      {item.label} · {count}
                    </button>
                  )
                })}
              </div>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" aria-label="今日事件列表">
              {visibleEvents.map((event) => (
                <TodayEventCard
                  key={event.id}
                  event={event}
                  selected={selectedEventId === event.id}
                  onSelect={() => onSelectEvent(selectedEventId === event.id ? null : event.id)}
                  onEnterWorkflow={onEnterWorkflow}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <section className={`flex min-h-0 shrink-0 flex-col border-t border-line ${todayExpanded ? 'max-h-[42%]' : 'flex-1'}`}>
        <div className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 pb-2 pt-2.5">
          <History size={13} className="shrink-0 text-ink-2" />
          <h2 className="text-label font-semibold text-ink-1">历史事件</h2>
          <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-label tabular-nums text-ink-2">
            {HISTORICAL_CASES.length}
          </span>
          <span className="ml-auto text-[9px] text-ink-3">公开事实边界内推演</span>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" aria-label="历史事件列表">
          {HISTORICAL_CASES.map((entry) => (
            <HistoricalCaseCard
              key={entry.id}
              entry={entry}
              onEnter={() => onEnterHistoricalCase(entry)}
              onOpenKnowledge={onOpenKnowledge}
            />
          ))}
        </div>
      </section>

      <div className="shrink-0 border-t border-hairline px-3 py-2">
        <OriginMark
          origin="simulated"
          note={`${events.length} 条今日事件的状态、责任人与处置进度均为演示演示；历史案例的公开锚点逐条标注，其余字段为演示轨；底图为公开数据。`}
        />
        <button
          type="button"
          onClick={onOpenKnowledge}
          className="mt-2 flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-line bg-white text-label font-semibold text-ink-1 transition hover:border-accent-strong/40 hover:text-accent-strong"
        >
          <BookOpen size={10} />打开沉淀知识库
        </button>
      </div>
    </>
  )
}

function TodayEventCard({
  event,
  selected,
  onSelect,
  onEnterWorkflow,
}: {
  event: TodayEvent
  selected: boolean
  onSelect: () => void
  onEnterWorkflow: (event: TodayEvent) => void
}) {
  const status = TODAY_EVENT_STATUS_META[event.status]
  const workflowScenarioId = resolveDispatchScenarioId(event)
  return (
    <article
      data-today-event-id={event.id}
      className={`overflow-hidden rounded-xl border transition ${
        selected ? 'border-accent-strong bg-white ring-2 ring-accent-strong/10' : 'border-line bg-white hover:border-accent-strong/35'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full p-2 pb-1.5 text-left" aria-expanded={selected}>
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1 py-px font-mono text-[9px] font-bold text-white" style={{ background: event.domainColor }}>{event.domain}</span>
          <span className="rounded px-1.5 py-px text-[9px] font-bold" style={{ background: status.bg, color: status.fg }}>{status.label}</span>
          <span className="ml-auto font-mono text-[9px] tabular-nums text-ink-3">{event.time}</span>
          <ChevronDown size={10} className={`text-ink-3 transition ${selected ? 'rotate-180' : ''}`} />
        </div>
        <div className="mt-1 text-[11px] font-semibold leading-snug text-ink-1">{event.title}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-ink-3"><MapPin size={9} />{event.location}</div>
      </button>

      {/* 折叠态就要能看见怎么往下走。8/21 评审：「每个案例要有引导处理的按钮，
          不然现在不知道怎么去处置」——原来必须先点开卡片才看得到入口。 */}
      <div className="px-2 pb-2">
        {workflowScenarioId ? (
          <button
            type="button"
            onClick={() => onEnterWorkflow(event)}
            className="flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-accent-strong text-[10px] font-semibold text-white transition hover:bg-[#4D4DC2]"
          >
            <Send size={10} />进入处置
          </button>
        ) : (
          <div className="rounded-lg border border-dashed border-line px-2 py-1 text-center text-[9px] text-ink-3">
            台账演示 · 未配置处置链
          </div>
        )}
      </div>

      {selected && (
        <div className="border-t border-hairline bg-sunken/45 px-2 py-2">
          <p className="text-[10px] leading-relaxed text-ink-2">{event.summary}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[9px] leading-relaxed">
            <dt className="text-ink-3">来源</dt><dd className="text-ink-2">{event.source}</dd>
            <dt className="text-ink-3">责任人</dt><dd className="flex items-center gap-1 text-ink-2"><UserRound size={9} />{event.owner}</dd>
            <dt className="text-ink-3">时间口径</dt><dd className="font-mono tabular-nums text-ink-2">今日 {event.time}</dd>
            <dt className="text-ink-3">下一步</dt><dd className="text-ink-2">{event.nextAction}</dd>
          </dl>
          <div className="mt-2"><OriginMark origin="simulated" note="事件内容、状态和坐标为演示演示。" showLabel={false} /></div>
        </div>
      )}
    </article>
  )
}

function HistoricalCaseCard({
  entry,
  onEnter,
  onOpenKnowledge,
}: {
  entry: HistoricalCase
  onEnter: () => void
  onOpenKnowledge: () => void
}) {
  const runnable = Boolean(entry.workflowScenarioId)
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white transition hover:border-accent-strong/35">
      <div className="p-2 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1 py-px font-mono text-[9px] font-bold text-white" style={{ background: entry.domainColor }}>{entry.domain}</span>
          <span className="rounded bg-sunken px-1.5 py-px text-[9px] font-semibold text-ink-2">历史案例</span>
          <span className="ml-auto font-mono text-[9px] tabular-nums text-ink-3">{entry.occurredAt}</span>
        </div>
        <div className="mt-1 text-[11px] font-semibold leading-snug text-ink-1">{entry.title}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-[9px] text-ink-3"><MapPin size={9} />{entry.location}</div>
        <div className="mt-1.5 space-y-1 border-t border-hairline pt-1.5 text-[9px] leading-relaxed">
          <div className="flex gap-1.5"><span className="w-12 shrink-0 text-ink-3">事件类型</span><span className="text-ink-2">{entry.eventType}</span></div>
          <div className="flex gap-1.5"><span className="w-12 shrink-0 text-ink-3">关键受阻</span><span className="text-ink-2">{entry.blocker}</span></div>
          <div className="flex gap-1.5"><span className="w-12 shrink-0 text-ink-3">核心策略</span><span className="text-ink-2">{entry.coreStrategy}</span></div>
          <div className="flex gap-1.5"><span className="w-12 shrink-0 text-ink-3">资料覆盖</span><span className="font-medium text-[#8A5A14]">{entry.publicCoverage}</span></div>
        </div>
      </div>
      <div className="px-2 pb-2">
        {runnable ? (
          <button
            type="button"
            onClick={onEnter}
            className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-accent-strong bg-accent-weak text-[10px] font-semibold text-accent-strong transition hover:bg-[#E3E3F8]"
          >
            <History size={10} />进入案例
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenKnowledge}
            className="flex h-7 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-white text-[10px] font-semibold text-ink-2 transition hover:border-accent-strong/40 hover:text-accent-strong"
          >
            <BookOpen size={10} />未建模 · 在知识库查看
          </button>
        )}
      </div>
    </article>
  )
}
