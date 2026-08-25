import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarDays, Navigation, TriangleAlert, UserCheck } from 'lucide-react'

import { buildOverviewKpis, type BoardKpi, type TodayEvent } from './boardData'

const KPI_META: Record<string, { icon: typeof CalendarDays; action: string; iconClass: string; actionClass: string }> = {
  'events-today': { icon: CalendarDays, action: '进入事件处置', iconClass: 'bg-[#EEF4FF] text-[#2F6FDA]', actionClass: 'bg-[#2F6FDA] group-hover:bg-[#275FC0]' },
  'pending-decision': { icon: UserCheck, action: '查看待决策案例', iconClass: 'bg-[#FFF5DE] text-[#A36A00]', actionClass: 'bg-[#B07A12] group-hover:bg-[#94650D]' },
  'exec-anomaly': { icon: TriangleAlert, action: '查看异常案例', iconClass: 'bg-[#FDEBEC] text-[#C53640]', actionClass: 'bg-[#D73C46] group-hover:bg-[#BD303A]' },
  'units-enroute': { icon: Navigation, action: '进入资源调度', iconClass: 'bg-[#EEEEFB] text-[#5B5BD6]', actionClass: 'bg-[#5B5BD6] group-hover:bg-[#4D4DC2]' },
}

/**
 * 「城市运行 · 实时」。8/20 评审前它挤在左栏顶部，四个数字和下面的告警流、
 * 五域态势抢同一列宽度，读起来像侧栏的一个小节而不是全城口径。
 * 现在提到页面顶端整条通栏、字号放大——进来第一眼先看到城市在跑什么。
 *
 * 每张卡是一条进入「事件处置」的入口，除在途单位落到资源调度。
 */
export const CityRealtimeBand = memo(function CityRealtimeBand({
  onKpiSelect,
  events,
  enrouteCount,
}: {
  onKpiSelect: (kpiId: string) => void
  events: TodayEvent[]
  enrouteCount: number
}) {
  const kpis = useMemo(() => buildOverviewKpis(events, enrouteCount), [events, enrouteCount])
  const previousValues = useRef<Record<string, string>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const changed = kpis
      .filter((kpi) => previousValues.current[kpi.id] !== undefined && previousValues.current[kpi.id] !== kpi.value)
      .map((kpi) => kpi.id)
    previousValues.current = Object.fromEntries(kpis.map((kpi) => [kpi.id, kpi.value]))
    if (changed.length === 0) return
    setChangedIds(new Set(changed))
    const timer = window.setTimeout(() => setChangedIds(new Set()), 1200)
    return () => window.clearTimeout(timer)
  }, [kpis])

  return (
    <section
      className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-line bg-surface-card shadow-panel"
      aria-label="城市运行演示指标"
    >
      <div className="flex w-[166px] shrink-0 flex-col justify-center border-r border-hairline px-4">
        <div className="flex items-center gap-2">
          <span className="h-1 w-4 rounded-full bg-accent-strong" aria-hidden="true" />
          <h2 className="text-title tracking-[-0.02em] text-ink-1">城市运行</h2>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-label text-ink-3">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#30A46C] opacity-35" />
            <span className="relative inline-flex size-2 rounded-full bg-[#30A46C]" />
          </span>
          演示数据 · 全城口径
        </div>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-4 divide-x divide-hairline">
        {kpis.map((kpi) => (
          <KpiTile key={kpi.id} kpi={kpi} changed={changedIds.has(kpi.id)} onOpen={() => onKpiSelect(kpi.id)} />
        ))}
      </div>
    </section>
  )
})

function KpiTile({ kpi, changed, onOpen }: { kpi: BoardKpi; changed: boolean; onOpen: () => void }) {
  const valueColor = kpi.tone === 'danger' ? 'text-[#D73C46]' : kpi.tone === 'warn' ? 'text-[#B07A12]' : 'text-ink-1'
  const sparkColor = kpi.tone === 'danger' ? '#E5484D' : kpi.tone === 'warn' ? '#D9A514' : '#5B5BD6'
  const meta = KPI_META[kpi.id]
  const Icon = meta.icon
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看${kpi.label}`}
      className="group relative min-h-[92px] min-w-0 px-4 py-2.5 text-left transition-colors hover:bg-[#FAFBFD] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-strong"
    >
      {changed && <span className="pointer-events-none absolute inset-1 animate-pulse border border-accent-strong/25" aria-hidden="true" />}
      <div className="flex items-center gap-2">
        <span className={`grid size-7 shrink-0 place-items-center rounded-md ${meta.iconClass}`}>
          <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-label font-semibold text-ink-2">{kpi.label}</span>
        <ArrowRight size={14} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent-strong" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3 pl-9">
        <div className="flex min-w-0 items-baseline gap-1">
          <span className={`font-mono text-[28px] font-bold leading-none tabular-nums transition-transform ${changed ? 'scale-110' : ''} ${valueColor}`}>{kpi.value}</span>
          {kpi.unit && <span className="text-label text-ink-3">{kpi.unit}</span>}
        </div>
        <Sparkline series={kpi.series} color={sparkColor} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 pl-9">
        <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[10px] font-semibold text-white shadow-[0_2px_5px_rgb(22_32_51_/_0.12)] transition ${meta.actionClass}`}>
          {meta.action}
          <ArrowRight size={10} aria-hidden="true" />
        </span>
        {kpi.delta && <span className={`truncate text-[9px] ${kpi.deltaTone === 'up' ? 'text-[#9A6700]' : 'text-ink-3'}`}>{kpi.delta}</span>}
      </div>
    </button>
  )
}

function Sparkline({ series, color }: { series: number[]; color: string }) {
  const width = 72
  const height = 24
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const points = series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width
      const y = height - 2 - ((value - min) / range) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      <circle
        cx={width}
        cy={height - 2 - ((series[series.length - 1] - min) / range) * (height - 4)}
        r={2}
        fill={color}
      />
    </svg>
  )
}
