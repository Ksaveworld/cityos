import { memo, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'

import {
  HOURLY_TREND,
  INITIAL_ALERTS,
  STREAM_ALERTS,
  type CityAlert,
} from './boardData'

const STREAM_INTERVAL_MS = 7000
const MAX_FEED_LENGTH = 24

const ALERT_LANES: Array<{ domain: string; label: string; color: string }> = [
  { domain: '119', label: '119', color: '#E5484D' },
  { domain: '110', label: '110', color: '#2F6FDA' },
  { domain: '120', label: '120', color: '#0E9AA7' },
  { domain: '交通', label: '交通', color: '#B8860B' },
  { domain: '市容秩序', label: '市容', color: '#C26A2E' },
  { domain: '布防', label: '布防', color: '#7C3AED' },
]

const SEVERITY_DOT: Record<CityAlert['severity'], { size: number; label: string }> = {
  critical: { size: 9, label: '警示' },
  watch: { size: 7, label: '关注' },
  info: { size: 5, label: '提示' },
}

const TASK_STAGES = [
  { label: '已下发', value: 31, color: '#5B5BD6' },
  { label: '已签收', value: 26, color: '#2F6FDA' },
  { label: '执行中', value: 11, color: '#D59B28' },
  { label: '已回执', value: 15, color: '#30A46C' },
] as const

function nextClock(previous: string) {
  const [h, m, s] = previous.split(':').map(Number)
  const total = h * 3600 + m * 60 + s + 41 + Math.floor(Math.random() * 50)
  const hh = Math.floor(total / 3600) % 24
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  return [hh, mm, ss].map((value) => String(value).padStart(2, '0')).join(':')
}

/**
 * 态势总览底部摘要。
 *
 * 宏观位置参考传统运行看板的「底部图表带」，内容仍全部来自 CityOS 已有组件和
 * 演示台账：24 小时节奏、按域告警泳道、响应单元状态。这里不新增风险预测或
 * 无来源百分比，告警点仍然能进入对应的今日事件。
 */
export const CityOverviewSummary = memo(function CityOverviewSummary({
  onAlertSelect,
  liveEventCount,
}: {
  onAlertSelect: (scenarioId: string) => void
  liveEventCount: number
}) {
  return (
    <section
      data-city-overview-summary
      className="grid min-h-0 grid-cols-[1.05fr_1.35fr_0.9fr] gap-2.5"
      aria-label="城市运行摘要"
    >
      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card px-3 py-2 shadow-panel">
        <div className="flex shrink-0 items-baseline justify-between gap-2">
          <h2 className="text-label font-semibold text-ink-1">24 小时事件节奏</h2>
        </div>
        <TrendBars variant="summary" liveEventCount={liveEventCount} />
      </section>

      <CityAlertTimeline variant="summary" onAlertSelect={onAlertSelect} />
      <CollaborationLifecyclePanel liveEventCount={liveEventCount} />
    </section>
  )
})

export const CityAlertTimeline = memo(function CityAlertTimeline({
  variant,
  onAlertSelect,
}: {
  variant: 'rail' | 'summary'
  onAlertSelect: (scenarioId: string) => void
}) {
  const [alerts, setAlerts] = useState<CityAlert[]>(() => [...INITIAL_ALERTS].reverse())
  const streamIndexRef = useRef(0)
  const pausedRef = useRef(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pausedRef.current) return
      setAlerts((current) => {
        const template = STREAM_ALERTS[streamIndexRef.current % STREAM_ALERTS.length]
        streamIndexRef.current += 1
        const entry: CityAlert = {
          ...template,
          id: `${template.id}-${streamIndexRef.current}`,
          time: nextClock(current.at(-1)?.time ?? '15:00:18'),
        }
        return [...current, entry].slice(-MAX_FEED_LENGTH)
      })
    }, STREAM_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  const latestAlert = alerts.at(-1)
  const severityCounts = alerts.reduce<Record<CityAlert['severity'], number>>(
    (counts, alert) => ({ ...counts, [alert.severity]: counts[alert.severity] + 1 }),
    { critical: 0, watch: 0, info: 0 },
  )
  const rail = variant === 'rail'

  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel ${rail ? 'flex-1' : ''}`}
      aria-label="城市告警流"
    >
      <div className={`flex shrink-0 items-center justify-between ${rail ? 'h-8 border-b border-hairline px-2.5' : 'h-7 px-3'}`}>
        <div className="flex items-center gap-1.5">
          <span className={`relative flex ${rail ? 'size-2' : 'size-1.5'}`} aria-hidden="true">
            {rail && <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#E5484D] opacity-50" />}
            <span className={`relative inline-flex rounded-full bg-[#E5484D] ${rail ? 'size-2' : 'size-1.5'}`} />
          </span>
          <h2 className="text-label font-semibold text-ink-1">城市告警流</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {rail ? (
            <span className="text-[9px] text-ink-3">演示 · 持续滚入</span>
          ) : (
            <>
              <span className="flex items-center gap-2 text-[9px] text-ink-3" aria-label={`警示 ${severityCounts.critical}，关注 ${severityCounts.watch}，提示 ${severityCounts.info}`}>
                <span>警示 <b className="font-mono font-semibold tabular-nums text-ink-1">{severityCounts.critical}</b></span>
                <span>关注 <b className="font-mono font-semibold tabular-nums text-ink-1">{severityCounts.watch}</b></span>
                <span>提示 <b className="font-mono font-semibold tabular-nums text-ink-1">{severityCounts.info}</b></span>
              </span>
            </>
          )}
        </div>
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col ${rail ? 'p-2' : 'px-3 pb-1.5'}`}
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
        onFocusCapture={() => { pausedRef.current = true }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) pausedRef.current = false
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-px" role="group" aria-label={`按业务域分布的演示告警时序，共 ${alerts.length} 条`}>
          {ALERT_LANES.map((lane) => {
            const laneAlerts = alerts
              .map((alert, index) => ({ alert, index }))
              .filter(({ alert }) => alert.domain === lane.domain)
            return (
              <div key={lane.domain} className="flex min-h-[11px] flex-1 items-center gap-1.5">
                <span className={`${rail ? 'w-6 text-[8px]' : 'w-7 text-[9px]'} shrink-0 text-right font-mono leading-none text-ink-3`}>{lane.label}</span>
                <div className={`relative h-3 min-w-0 flex-1 ${rail ? 'rounded bg-sunken' : ''}`}>
                  <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline" />
                  {laneAlerts.map(({ alert, index }) => {
                    const dot = SEVERITY_DOT[alert.severity]
                    const x = alerts.length > 1 ? 4 + (index / (alerts.length - 1)) * 92 : 96
                    return (
                      <button
                        key={alert.id}
                        type="button"
                        data-alert-lane-point
                        data-alert-scenario={alert.scenarioId}
                        onClick={() => onAlertSelect(alert.scenarioId)}
                        title={`${alert.time} · ${dot.label} · ${alert.title}`}
                        aria-label={`${alert.time} ${dot.label} ${alert.title}`}
                        className="alert-enter group absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong"
                        style={{ left: `${x}%` }}
                      >
                        {alert.severity === 'critical' && (
                          <span
                            aria-hidden="true"
                            className={`absolute inline-flex rounded-full ${rail ? 'size-full animate-ping opacity-50' : 'size-3 opacity-15'}`}
                            style={{ background: lane.color }}
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className="relative rounded-full transition group-hover:scale-125"
                          style={{
                            width: dot.size,
                            height: dot.size,
                            background: alert.severity === 'info' ? 'transparent' : lane.color,
                            border: `1.5px solid ${lane.color}`,
                          }}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {rail && (
          <div className="mt-1 flex shrink-0 items-center gap-2.5 border-t border-hairline pt-1">
            {(['critical', 'watch', 'info'] as const).map((severity) => (
              <span key={severity} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className="rounded-full border-[1.5px] border-ink-3"
                  style={{
                    width: SEVERITY_DOT[severity].size,
                    height: SEVERITY_DOT[severity].size,
                    background: severity === 'info' ? 'transparent' : 'var(--ink-3)',
                  }}
                />
                <span className="text-[9px] text-ink-3">{SEVERITY_DOT[severity].label}</span>
                <span className="font-mono text-[10px] font-semibold tabular-nums text-ink-1">{severityCounts[severity]}</span>
              </span>
            ))}
          </div>
        )}

        {latestAlert && (
          <button
            type="button"
            onClick={() => onAlertSelect(latestAlert.scenarioId)}
            className={`mt-1 flex h-5 shrink-0 items-center gap-1.5 text-left transition-colors ${rail ? 'rounded-md bg-sunken px-1.5 hover:bg-[#ECEEF4]' : 'border-t border-hairline px-0.5 pt-1 hover:text-accent-strong'}`}
          >
            <span className="font-mono text-[9px] tabular-nums text-ink-3">{latestAlert.time}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-ink-1">{latestAlert.title}</span>
            <ArrowRight size={10} className="shrink-0 text-ink-3" />
          </button>
        )}
      </div>
    </section>
  )
})

export function TrendBars({ variant, liveEventCount = 0 }: { variant: 'rail' | 'summary'; liveEventCount?: number }) {
  const { hours, values } = HOURLY_TREND
  const chartValues = values.map((value, index) => index === values.length - 1 ? value + liveEventCount : value)
  const max = Math.max(...chartValues)
  if (variant === 'summary') {
    const width = 320
    const height = 68
    const chartBottom = 62
    const points = chartValues.map((value, index) => ({
      x: (index / (chartValues.length - 1)) * width,
      y: chartBottom - 5 - (value / max) * 50,
    }))
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
    const areaPath = `M 0 ${chartBottom} ${points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')} L ${width} ${chartBottom} Z`
    const current = points.at(-1)!
    return (
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1 overflow-visible" role="img" aria-label="24 小时事件折线走势">
          <path d={areaPath} fill="rgb(91 91 214 / 0.12)" />
          <path d={linePath} fill="none" stroke="#5B5BD6" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={current.x} cy={current.y} r="5.5" fill="rgb(91 91 214 / 0.14)" />
          <circle cx={current.x} cy={current.y} r="2.8" fill="#5B5BD6" />
        </svg>
        <div className="mt-0.5 flex shrink-0 justify-between font-mono text-[8px] text-ink-3">
          <span>{hours[0]}</span>
          <span>{hours[Math.floor(hours.length / 2)]}</span>
          <span>{hours[hours.length - 1]} 时</span>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-1.5">
      <div className="flex h-[34px] items-end gap-[3px]">
        {chartValues.map((value, index) => {
          const isPeak = value === max
          return (
            <div key={hours[index]} className="group relative flex h-full flex-1 items-end">
              <div
                className={`w-full rounded-t-[2px] transition ${isPeak ? 'bg-[#5B5BD6]' : 'bg-[#5B5BD6]/30 group-hover:bg-[#5B5BD6]/55'}`}
                style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
                title={`${hours[index]} 时 · ${value} 起事件`}
              />
              {isPeak && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 font-mono text-[8px] font-bold text-[#5B5BD6]">
                  {value}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-0.5 flex shrink-0 justify-between font-mono text-[8px] text-ink-3">
        <span>{hours[0]}</span>
        <span>{hours[Math.floor(hours.length / 2)]}</span>
        <span>{hours[hours.length - 1]} 时</span>
      </div>
    </div>
  )
}

function CollaborationLifecyclePanel({ liveEventCount }: { liveEventCount: number }) {
  const values = TASK_STAGES.map((stage, index) => stage.value + (index === 0 ? liveEventCount : index === 1 ? Math.max(0, liveEventCount - 1) : index === 2 ? Math.floor(liveEventCount / 2) : 0))
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card px-3 py-2 shadow-panel" aria-label="协同任务闭环">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-label font-semibold text-ink-1">协同任务闭环</h2>
        <span className="flex items-center gap-1.5 text-[9px] text-ink-3"><i className="size-1.5 rounded-full bg-[#30A46C]" />持续回写</span>
      </div>
      <div className="relative mt-4 shrink-0 px-4" aria-hidden="true">
        <span className="absolute left-6 right-6 top-1/2 h-px -translate-y-1/2 bg-hairline" />
        <div className="relative grid grid-cols-4">
          {TASK_STAGES.map((stage) => (
            <span key={stage.label} className="mx-auto grid size-4 place-items-center rounded-full bg-white ring-1 ring-line">
              <i className="size-2 rounded-full" style={{ background: stage.color }} />
            </span>
          ))}
        </div>
      </div>
      <dl className="mt-2 grid min-h-0 flex-1 grid-cols-4 items-center divide-x divide-hairline">
        {TASK_STAGES.map((stage, index) => (
          <div key={stage.label} className="min-w-0 px-2 text-center first:pl-0 last:pr-0">
            <dt className="truncate text-[9px] text-ink-3">{stage.label}</dt>
            <dd className="mt-1.5 font-mono text-[19px] font-semibold leading-none tabular-nums text-ink-1">
              {values[index]}<span className="ml-0.5 text-[8px] font-normal text-ink-3">项</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
