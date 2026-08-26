import { memo } from 'react'
import { Camera, CloudRain, Droplets, Plane, Route, TrafficCone, Video } from 'lucide-react'

import { OriginMark } from '../Provenance'
import type { MapLayerId, MapLayerVisibility } from '../mapLayers'
import { DOMAIN_PULSES, HOURLY_TREND, OVERVIEW_SUPPORT_RESOURCES, SUPPORT_RESOURCES } from './boardData'
import { CityAlertTimeline, TrendBars } from './CityOverviewSummary'

const LAYER_CHIPS: Array<{ id: MapLayerId; label: string; icon: typeof Route }> = [
  { id: 'weather', label: '气象', icon: CloudRain },
  { id: 'traffic', label: '路况', icon: TrafficCone },
  { id: 'routes', label: '路径', icon: Route },
  { id: 'cameras', label: '视频', icon: Video },
]

const RESOURCE_ICONS = {
  weather: CloudRain,
  water: Droplets,
  drone: Plane,
  camera: Camera,
} as const

export const CityPulseRail = memo(function CityPulseRail({
  layers,
  onLayerToggle,
  onAlertSelect,
  variant = 'full',
}: {
  layers: MapLayerVisibility
  onLayerToggle: (layer: MapLayerId) => void
  onAlertSelect: (scenarioId: string) => void
  variant?: 'overview' | 'full'
}) {
  const overview = variant === 'overview'

  return (
    <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
      {/* 总览只保留六工作面与保障资源读数；趋势和告警迁往底部摘要。
          资源调度页继续使用完整侧栏，避免改变其他工作区布局。 */}
      <section
        className={`${overview ? 'flex min-h-[208px] flex-1 flex-col' : 'shrink-0'} rounded-xl border border-line bg-surface-card p-2.5 shadow-panel`}
      >
        <div className={`flex shrink-0 items-center justify-between ${overview ? 'pb-2' : 'pb-1.5'}`}>
          {overview ? (
            <div className="flex items-baseline gap-2">
              <h2 className="text-label font-semibold text-ink-1">六工作面态势</h2>
              <span className="text-[9px] text-ink-3">同级读数</span>
            </div>
          ) : (
            <h2 className="text-label font-semibold text-ink-1">六工作面态势 · 同级</h2>
          )}
          <OriginMark origin="simulated" note="在办起数与资源读数均为演示快照，不接实时调度系统" showLabel={false} />
        </div>
        {overview ? <OverviewDomainLedger /> : <FullDomainRows />}
        {!overview && <FullSupportRows />}

        {!overview && (
          <div className="mt-2 shrink-0 border-t border-hairline pt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-footnote font-medium text-ink-2">24 小时事件量</span>
              <span className="text-[9px] text-ink-3">{HOURLY_TREND.peakNote} · 演示</span>
            </div>
            <TrendBars variant="rail" />
          </div>
        )}
      </section>

      {!overview && <CityAlertTimeline variant="rail" onAlertSelect={onAlertSelect} />}

      {overview ? (
        <OverviewGuaranteeResources />
      ) : (
        <section className="shrink-0 rounded-xl border border-line bg-surface-card p-2 shadow-panel">
          <div className="grid grid-cols-4 gap-1">
            {LAYER_CHIPS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={layers[id]}
                onClick={() => onLayerToggle(id)}
                className={`flex h-9 flex-col items-center justify-center gap-0.5 rounded-lg border text-[9px] transition ${
                  layers[id]
                    ? 'border-accent-strong/30 bg-accent-weak font-semibold text-accent-strong'
                    : 'border-transparent bg-sunken text-ink-3 hover:text-ink-1'
                }`}
              >
                <Icon size={12} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] leading-relaxed text-ink-3">
            图层均为演示展示 · 底图与路网来自{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted hover:text-accent-strong"
            >
              OSM 快照
            </a>
          </p>
        </section>
      )}
    </aside>
  )
})

function OverviewDomainLedger() {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-6 border-y border-hairline">
      {DOMAIN_PULSES.map((domain) => (
        <div
          key={domain.id}
          className="grid min-h-[38px] grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-2 border-b border-hairline px-1 last:border-b-0"
        >
          <span className="h-5 w-[3px] rounded-full" style={{ background: domain.color }} aria-hidden="true" />
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <strong className="text-[11px] font-medium text-ink-1">{domain.label}</strong>
              {domain.short !== domain.label && (
                <span className="font-mono text-[9px] font-semibold" style={{ color: domain.color }}>{domain.short}</span>
              )}
            </span>
            <span
              className="mt-0.5 block truncate text-[9px] text-ink-3"
              title={`${domain.note} · ${domain.resourcesFull}`}
            >
              {domain.resources}
            </span>
          </span>
          <span className="min-w-[44px] text-right">
            <span className="font-mono text-[18px] font-semibold leading-none tabular-nums text-ink-1">{domain.active}</span>
            <span className="mt-0.5 block text-[9px] text-ink-3">{domain.activeLabel}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function OverviewGuaranteeResources() {
  return (
    <section className="shrink-0 rounded-xl border border-line bg-surface-card p-1.5 shadow-panel" aria-label="保障资源">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <h2 className="text-label font-semibold text-ink-1">保障资源</h2>
        <span className="text-[9px] text-ink-3">城市可用状态</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {OVERVIEW_SUPPORT_RESOURCES.map((resource) => {
          const Icon = RESOURCE_ICONS[resource.id]
          return (
            <div key={resource.id} className="h-[46px] min-w-0 rounded-lg border border-hairline bg-sunken/65 p-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white text-accent-strong shadow-panel">
                  <Icon size={10} strokeWidth={1.8} />
                </span>
                <span className="truncate text-[9px] font-medium text-ink-2">{resource.label}</span>
                <strong className="ml-auto shrink-0 font-mono text-[13px] font-semibold leading-none tabular-nums text-ink-1">{resource.value}</strong>
                <span className="text-[9px] text-ink-3">{resource.unit}</span>
              </div>
              <div className="mt-0.5 truncate pl-[26px] text-[8px] text-ink-3" title={resource.note}>{resource.note}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FullDomainRows() {
  return (
    <div className="space-y-px">
      {DOMAIN_PULSES.map((domain) => (
        <div key={domain.id} className="flex min-h-[26px] items-center gap-1.5 rounded-md px-1">
          <span
            className="w-8 shrink-0 rounded px-1 text-center font-mono text-[9px] font-bold leading-4 text-white"
            style={{ background: domain.color }}
          >
            {domain.short}
          </span>
          <span className="w-12 shrink-0 truncate text-label text-ink-1" title={domain.label}>{domain.label}</span>
          <span className="flex w-[46px] shrink-0 items-baseline justify-end gap-0.5">
            <span className="font-mono text-[15px] font-semibold leading-none tabular-nums text-ink-1">{domain.active}</span>
            <span className="text-[9px] text-ink-3">{domain.activeLabel}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-footnote text-ink-3" title={`${domain.note} · ${domain.resourcesFull}`}>
            {domain.resources}
          </span>
        </div>
      ))}
    </div>
  )
}

function FullSupportRows() {
  return (
    <div className="mt-1.5 shrink-0 space-y-px border-t border-hairline pt-1.5">
      {SUPPORT_RESOURCES.map((resource) => (
        <div key={resource.id} className="flex min-h-[22px] items-center gap-1.5 px-1">
          <span className="w-[52px] shrink-0 truncate text-[10px] text-ink-2">{resource.label}</span>
          <span className="flex w-[46px] shrink-0 items-baseline justify-end gap-0.5">
            <span className="font-mono text-[13px] font-semibold leading-none tabular-nums text-ink-1">{resource.value}</span>
            <span className="text-[9px] text-ink-3">{resource.unit}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-footnote text-ink-3">{resource.note}</span>
        </div>
      ))}
    </div>
  )
}
