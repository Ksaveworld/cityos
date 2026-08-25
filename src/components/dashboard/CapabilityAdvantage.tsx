import { ArrowDownRight, ShieldCheck } from 'lucide-react'

import { EventCard } from './EventCard'

export function CapabilityAdvantage({
  baselineEta,
  cityosEta,
  baselineRisk,
  cityosRisk,
  note,
  className = '',
  comparable = true,
}: {
  baselineEta?: number
  cityosEta?: number
  baselineRisk: string
  cityosRisk: string
  note: string
  className?: string
  comparable?: boolean
}) {
  const hasEta = typeof baselineEta === 'number' && typeof cityosEta === 'number'
  const riskRank: Record<string, number> = { '较低': 0, '注意': 1, '较高': 2 }
  const hasKnownRisk = baselineRisk in riskRank && cityosRisk in riskRank
  const riskChange = (riskRank[cityosRisk] ?? 99) - (riskRank[baselineRisk] ?? 99)
  const etaDelta = hasEta ? baselineEta - cityosEta : 0
  const improved = comparable && hasEta && hasKnownRisk && etaDelta > 0 && riskChange <= 0

  if (!improved || baselineEta === undefined || cityosEta === undefined) {
    return (
      <div data-cityos-comparison-pending className={className}>
        <EventCard variant="dashed">
          <div className="text-label font-semibold text-ink-1">当前条件不足，暂不判断哪条演示更优</div>
          <p className="mt-1 text-footnote leading-relaxed text-ink-3">请先确认两次演示使用相同输入、演示假设、路网快照和模型版本，并补齐预计到场时间。</p>
        </EventCard>
      </div>
    )
  }

  const etaGain = etaDelta > 0
    ? `缩短 ${etaDelta.toFixed(1)} 分钟`
    : etaDelta === 0
      ? '与对照持平'
      : `增加 ${Math.abs(etaDelta).toFixed(1)} 分钟`

  return (
    <div
      data-cityos-advantage
      data-baseline-eta={baselineEta}
      data-cityos-eta={cityosEta}
      data-eta-improvement={etaDelta.toFixed(1)}
      className={className}
    >
      <EventCard variant="accent" className="relative overflow-hidden border-l-4 border-l-accent-strong bg-[linear-gradient(100deg,#EEEEFB_0%,#FAFAFF_72%,#FFFFFF_100%)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-accent-strong px-1.5 py-0.5 text-[9px] font-bold tracking-[0.08em] text-white">CITYOS 能力增益</span>
              <span className="text-footnote text-ink-3">同条件演示</span>
            </div>
            <div className="mt-1.5 text-body font-semibold text-ink-1">相同输入下，CityOS 协同处置结果更优</div>
          </div>
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-strong" aria-hidden="true" />
        </div>

        <div className="mt-2 grid grid-cols-2 divide-x divide-[#D7D7F2] rounded-lg border border-[#D7D7F2] bg-white/75 py-2">
          <div className="px-2.5">
            <div className="flex items-center gap-1 text-footnote text-ink-3"><ArrowDownRight size={11} aria-hidden="true" />预计首批到场</div>
            <div className="mt-0.5 font-mono text-section font-semibold tabular-nums text-accent-strong">{etaGain}</div>
            <div className="mt-0.5 text-[9px] text-ink-3">{baselineEta.toFixed(1)} → {cityosEta.toFixed(1)} 分钟</div>
          </div>
          <div className="px-2.5">
            <div className="text-footnote text-ink-3">关键资源覆盖风险</div>
            <div className="mt-0.5 text-section font-semibold text-accent-strong">{riskChange < 0 ? `降至 ${cityosRisk}` : `保持 ${cityosRisk}`}</div>
            <div className="mt-0.5 text-[9px] text-ink-3">{baselineRisk} → {cityosRisk}</div>
          </div>
        </div>

        <p className="mt-2 text-footnote leading-relaxed text-ink-3">{note}</p>
      </EventCard>
    </div>
  )
}
