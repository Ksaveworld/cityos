import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

import { CapabilityAdvantage } from '../CapabilityAdvantage'
import { EventCard } from '../EventCard'
import { OriginMark } from '../Provenance'
import {
  deriveExecutionFrame,
  type ExecutionBranch,
  type ExecutionDefinition,
  type ExecutionFrame,
  type ExecutionTaskState,
} from '../execution/executionPlayback'

import {
  HISTORY_516_FACTS,
  HISTORY_516_RUNS,
  type HistoricalPlaybackState,
  type HistoricalTrack,
  type SimulationRun,
} from './history516'
import { HISTORY_516_EXECUTIONS } from './history516Execution'

export function HistoricalCasePanel({
  onOpenSimulation,
  onPlaybackChange,
  simulationApproved = false,
}: {
  onOpenSimulation?: () => void
  onPlaybackChange?: (state: HistoricalPlaybackState) => void
  simulationApproved?: boolean
}) {
  const [track, setTrack] = useState<HistoricalTrack>('facts')
  const [playing, setPlaying] = useState(false)
  const [playheadSec, setPlayheadSec] = useState(0)
  const [branch, setBranch] = useState<ExecutionBranch>('normal')
  const definition = track === 'facts' ? null : HISTORY_516_EXECUTIONS[track]
  const frame = useMemo(() => (
    definition ? deriveExecutionFrame(definition, { playheadSec, branch }) : null
  ), [branch, definition, playheadSec])
  const playbackAllowed = track !== 'cityos' || simulationApproved

  useEffect(() => {
    if (!playing || !definition || !playbackAllowed) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setInterval(() => {
      setPlayheadSec((current) => {
        const increment = reducedMotion ? definition.durationSec / 4 : 0.2
        const next = Math.min(definition.durationSec, current + increment)
        const nextFrame = deriveExecutionFrame(definition, { playheadSec: next, branch })
        if (nextFrame.blockingAlert || next >= definition.durationSec) {
          setPlaying(false)
        }
        return nextFrame.playheadSec
      })
    }, reducedMotion ? 800 : 100)
    return () => window.clearInterval(timer)
  }, [branch, definition, playbackAllowed, playing])

  useEffect(() => {
    onPlaybackChange?.({ track, playheadSec, playing, branch })
  }, [branch, onPlaybackChange, playheadSec, playing, track])

  const run = track === 'facts' ? null : HISTORY_516_RUNS[track]
  const activeTimelineItem = useMemo(() => {
    if (!run || !definition) return null
    const percent = (playheadSec / definition.durationSec) * 100
    return [...run.timeline].reverse().find((item) => item.at <= percent) ?? run.timeline[0]
  }, [definition, playheadSec, run])
  const comparable = HISTORY_516_RUNS.baseline.assumptionSetId === HISTORY_516_RUNS.cityos.assumptionSetId
    && HISTORY_516_RUNS.baseline.mapSnapshot === HISTORY_516_RUNS.cityos.mapSnapshot
    && HISTORY_516_RUNS.baseline.modelVersion === HISTORY_516_RUNS.cityos.modelVersion

  const changeTrack = (next: HistoricalTrack) => {
    setTrack(next)
    setPlayheadSec(0)
    setPlaying(false)
    setBranch('normal')
  }

  return (
    <div className="space-y-3 p-3">
      <EventCard variant="sunken" className="border-l-2 border-l-accent-strong">
        <div className="text-body font-semibold text-ink-1">5·16 历史案例 · 三轨呈现</div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">公开确认的时间地点、常规处置演示和 CityOS 协同处置演示严格分开；没有公开的真实调派信息不补造。</p>
      </EventCard>

      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="5·16 复盘轨道">
        <TrackButton active={track === 'facts'} label="公开事实" onClick={() => changeTrack('facts')} />
        <TrackButton active={track === 'baseline'} label="常规对照" onClick={() => changeTrack('baseline')} />
        <TrackButton active={track === 'cityos'} label="CityOS 优势" tone="cityos" onClick={() => changeTrack('cityos')} />
      </div>

      <CapabilityAdvantage
        baselineEta={HISTORY_516_RUNS.baseline.etaMinutes}
        cityosEta={HISTORY_516_RUNS.cityos.etaMinutes}
        baselineRisk={HISTORY_516_RUNS.baseline.coverageRisk ?? '待评估'}
        cityosRisk={HISTORY_516_RUNS.cityos.coverageRisk ?? '待评估'}
        comparable={comparable}
        note="结论只来自同一公开信息、同一组演示假设和同一路网快照下的两次演示，不代表 CityOS 比当年真实处置更快。"
      />

      {track === 'facts' ? (
        <PublicFacts />
      ) : run && definition && frame ? (
        <SimulationStage
          run={run}
          definition={definition}
          frame={frame}
          playing={playing}
          playheadSec={playheadSec}
          branch={branch}
          playbackAllowed={playbackAllowed}
          activeLabel={activeTimelineItem?.label ?? 'T+0'}
          activeDetail={activeTimelineItem?.detail ?? ''}
          onPlayToggle={() => {
            if (!playbackAllowed) return
            if (playheadSec >= definition.durationSec || frame?.blockingAlert) setPlayheadSec(0)
            setPlaying((current) => !current)
          }}
          onReplay={() => {
            if (!playbackAllowed) return
            setPlayheadSec(0)
            setPlaying(true)
          }}
          onSeek={(value) => {
            setPlaying(false)
            setPlayheadSec(value)
          }}
          onBranchChange={(next) => {
            setPlaying(false)
            setPlayheadSec(0)
            setBranch(next)
          }}
        />
      ) : null}

      {track !== 'facts' && (
        <EventCard variant={comparable ? 'sunken' : 'dashed'}>
          <div className="text-label font-semibold text-ink-1">{comparable ? '比较条件一致，可以看演示差异' : '输入条件不同，不能比较效果'}</div>
          <p className="mt-1 text-footnote leading-relaxed text-ink-3">两次演示使用相同公开信息、演示假设、路网快照和模型版本；结论只在演示内成立，不评价真实历史处置。</p>
        </EventCard>
      )}

      <EventCard variant="sunken">
        <div className="text-label font-semibold text-ink-1">沉淀知识 · 名称待定</div>
        <p className="mt-1 text-footnote leading-relaxed text-ink-3">沉淀公开来源、未公开缺口、演示假设、人工批准与受控重试记录；它是演示中的知识沉淀方向，不冒充已接入生产知识库。</p>
      </EventCard>

      {track === 'cityos' && onOpenSimulation && <button type="button" onClick={onOpenSimulation} className="h-8 w-full rounded-lg border border-line bg-surface-card text-label font-semibold text-ink-1 hover:bg-sunken">进入日常演示闭环，验证人工调整与重新批准</button>}
    </div>
  )
}

function PublicFacts() {
  return (
    <section>
      <h3 className="mb-1.5 text-label font-semibold uppercase tracking-[0.08em] text-ink-3">事件事实与原处置锚点</h3>
      <div className="space-y-1.5">
        {HISTORY_516_FACTS.map((fact) => (
          <EventCard key={fact.label} variant={fact.status === '未公开' ? 'dashed' : 'sunken'} className={fact.status === '未公开' ? 'border-[#D59B28]' : ''}>
            <div className="flex items-start justify-between gap-2"><span className="text-label font-semibold text-ink-1">{fact.label}</span><FactBadge status={fact.status} /></div>
            <p className="mt-1 text-body leading-relaxed text-ink-1">{fact.value}</p>
            <a className="mt-1.5 block text-footnote leading-relaxed text-accent-strong hover:underline" href={fact.source.href} target="_blank" rel="noreferrer">来源：{fact.source.title}</a>
            {fact.note && <p className="mt-1 text-footnote leading-relaxed text-ink-3">{fact.note}</p>}
          </EventCard>
        ))}
      </div>
      <div className="mt-2"><OriginMark origin="real" note="仅以上述带来源的公开锚点作为事件与原处置事实；未公开项保持未知。" /></div>
    </section>
  )
}

function SimulationStage({
  run,
  definition,
  frame,
  playing,
  playheadSec,
  branch,
  playbackAllowed,
  activeLabel,
  activeDetail,
  onPlayToggle,
  onReplay,
  onSeek,
  onBranchChange,
}: {
  run: SimulationRun
  definition: ExecutionDefinition
  frame: ExecutionFrame
  playing: boolean
  playheadSec: number
  branch: ExecutionBranch
  playbackAllowed: boolean
  activeLabel: string
  activeDetail: string
  onPlayToggle: () => void
  onReplay: () => void
  onSeek: (value: number) => void
  onBranchChange: (branch: ExecutionBranch) => void
}) {
  const color = run.id === 'baseline' ? '#697386' : '#5B5BD6'
  const hasBlockedBranch = definition.alerts.some((alert) => alert.blocking)
  const arrivedUnits = frame.units.filter((unit) => unit.status === 'arrived').length
  const openIntersections = frame.intersections.filter((intersection) => intersection.status === 'open').length
  const completedTasks = frame.tasks.filter((task) => task.status === 'completed').length
  const latestAlert = frame.visibleAlerts.at(-1) ?? null
  return (
    <section className="space-y-2">
      <div className="rounded-xl border border-line bg-[#FBFCFE] p-3">
        <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-1.5"><div className="text-body font-semibold text-ink-1">演示执行舞台 · 非 2024 年真实处置回放</div><span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${run.id === 'cityos' ? 'bg-accent-strong text-white' : 'bg-[#ECEEF2] text-[#697386]'}`}>{run.id === 'cityos' ? 'CityOS 能力方案' : '常规对照'}</span></div><p className="mt-1 text-footnote leading-relaxed text-ink-3">{run.subtitle}</p></div><OriginMark origin="simulated" note="车辆、路线、任务和时间线均为演示演示。" showLabel={false} /></div>
        {/* 这里原来是一块用 CSS 画的假地图：网格假装街道、直线假装路线、圆圈写着
            「事件」和「演示」，playhead 推着一个小圆点在上面走。8/20 评审点名——
            旁边就是真地图，没有理由在侧栏里再画一个假的。回放本来就已经接到真地图
            （historyPlayhead / historyTrack 驱动 CityMap 的 TripsLayer），
            所以删掉假舞台，这里只保留走带控制和当前轨道状态。 */}
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#E1E5EF] bg-white px-2.5 py-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 flex-1 truncate text-footnote text-ink-2">
            <b className="text-ink-1">{activeLabel}</b> · {activeDetail}
          </span>
          <span className="shrink-0 rounded bg-[#FFF7E6] px-1.5 py-0.5 text-[9px] text-[#8A5A14]">在左侧地图上播放</span>
        </div>

        {hasBlockedBranch && (
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1" aria-label="演示执行分支">
            <BranchButton active={branch === 'normal'} label="正常执行" onClick={() => onBranchChange('normal')} />
            <BranchButton active={branch === 'blocked'} label="演示异常" onClick={() => onBranchChange('blocked')} />
          </div>
        )}

        {!playbackAllowed && (
          <div className="mt-2 rounded-lg border border-[#D59B28] bg-[#FFF9EA] px-2.5 py-2 text-footnote leading-relaxed text-[#76510E]">
            CityOS 执行回放尚未解锁：请先在方案对比步骤完成人工批准，再回到本页播放。基线演示仍可独立查看。
          </div>
        )}

        {frame.blockingAlert && (
          <div className="mt-2 rounded-lg border border-[#E04F5F] bg-[#FFF1F2] px-2.5 py-2">
            <div className="text-label font-semibold text-[#B42335]">异常分支已暂停 · {frame.blockingAlert.label}</div>
            <p className="mt-0.5 text-footnote leading-relaxed text-[#8C2F3D]">{frame.blockingAlert.detail}</p>
          </div>
        )}

        {latestAlert && !frame.blockingAlert && (
          <div className="mt-2 rounded-lg border border-[#D7D7F2] bg-[#F5F5FF] px-2.5 py-2">
            <div className="text-label font-semibold text-accent-strong">{latestAlert.label}</div>
            <p className="mt-0.5 text-footnote leading-relaxed text-ink-2">{latestAlert.detail}</p>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onPlayToggle} disabled={!playbackAllowed} className="grid size-8 place-items-center rounded-lg bg-accent-strong text-white hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:bg-[#B8BBC7]" aria-label={playing ? '暂停演示执行舞台' : '播放演示执行舞台'}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
          <button type="button" onClick={onReplay} disabled={!playbackAllowed} className="grid size-8 place-items-center rounded-lg border border-line bg-surface-card text-ink-2 hover:bg-sunken disabled:cursor-not-allowed disabled:text-[#B8BBC7]" aria-label="重放演示执行舞台"><RotateCcw size={13} /></button>
          <input aria-label="拖动演示执行时间线" type="range" min="0" max={definition.durationSec} step="0.2" value={playheadSec} disabled={!playbackAllowed} onChange={(event) => onSeek(Number(event.target.value))} className="flex-1 accent-[#5B5BD6] disabled:cursor-not-allowed" />
          <span className="w-12 text-right font-mono text-footnote tabular-nums text-ink-3">{playheadSec.toFixed(1)}s</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5" aria-label="演示执行实时状态">
        <StageMetric label="演示车辆到场" value={`${arrivedUnits}/${frame.units.length}`} />
        <StageMetric label="开放路口" value={`${openIntersections}/${frame.intersections.length}`} />
        <StageMetric label="完成任务" value={`${completedTasks}/${frame.tasks.length}`} />
      </div>

      <EventCard variant="sunken">
        <div className="flex items-center justify-between gap-2">
          <div className="text-label font-semibold text-ink-1">{frame.incidentStage}</div>
          <span className="rounded bg-[#EEEEFB] px-1.5 py-0.5 text-footnote font-medium text-accent-strong">演示状态</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {frame.tasks.map((task) => (
            <div key={task.id} className="rounded-lg border border-line bg-white px-2 py-1.5">
              <div className="truncate text-footnote font-semibold text-ink-1">{task.label}</div>
              <div className={`mt-0.5 text-footnote ${taskStatusClass(task.status)}`}>{task.department} · {taskStatusLabel(task.status)}</div>
            </div>
          ))}
        </div>
      </EventCard>

      <div className="grid grid-cols-2 gap-1.5">
        <EventCard variant="sunken"><div className="text-footnote text-ink-3">ETA（估算）</div><div className="mt-0.5 font-mono text-section font-semibold text-ink-1">{run.etaMinutes?.toFixed(1)} 分钟</div></EventCard>
        <EventCard variant="sunken"><div className="text-footnote text-ink-3">覆盖风险</div><div className="mt-0.5 text-section font-semibold text-ink-1">{run.coverageRisk}</div></EventCard>
      </div>
      <div className="space-y-1.5">
        {run.assumptions.map((assumption) => <div key={assumption.label} className="rounded-lg border border-line bg-surface-card px-2 py-1.5"><div className="text-label font-semibold text-ink-1">{assumption.label} · {assumption.value}</div><div className="mt-0.5 text-footnote text-ink-3">影响：{assumption.affects}</div></div>)}
      </div>
    </section>
  )
}

function BranchButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`h-7 rounded-md text-footnote font-semibold transition ${active ? 'bg-white text-ink-1 shadow-sm' : 'text-ink-3 hover:text-ink-1'}`}>{label}</button>
}

function StageMetric({ label, value }: { label: string; value: string }) {
  return <EventCard variant="sunken" className="px-2 py-1.5"><div className="truncate text-footnote text-ink-3">{label}</div><div className="mt-0.5 font-mono text-body font-semibold tabular-nums text-ink-1">{value}</div></EventCard>
}

function taskStatusLabel(status: ExecutionTaskState) {
  if (status === 'executing') return '执行中'
  if (status === 'completed') return '已完成'
  if (status === 'blocked') return '异常暂停'
  return '待执行'
}

function taskStatusClass(status: ExecutionTaskState) {
  if (status === 'executing') return 'text-accent-strong'
  if (status === 'completed') return 'text-[#237A52]'
  if (status === 'blocked') return 'text-[#B42335]'
  return 'text-ink-3'
}

function TrackButton({ active, label, tone = 'neutral', onClick }: { active: boolean; label: string; tone?: 'neutral' | 'cityos'; onClick: () => void }) {
  const className = tone === 'cityos'
    ? active
      ? 'border border-accent-strong bg-accent-strong text-white shadow-sm'
      : 'border border-[#C9C9EF] bg-accent-weak text-accent-strong hover:border-accent-strong'
    : active
      ? 'border border-[#697386] bg-[#697386] text-white'
      : 'border border-line bg-surface-card text-ink-2 hover:bg-sunken'
  return <button type="button" onClick={onClick} className={`h-8 whitespace-nowrap rounded-lg px-1 text-[9px] font-semibold transition ${className}`}>{label}</button>
}

function FactBadge({ status }: { status: string }) {
  const className = status === '官方公开' ? 'bg-[#EAF8F1] text-[#237A52]' : status === '公开报道' ? 'bg-[#EEEEFB] text-accent-strong' : 'bg-[#FFF7E6] text-[#8A5A14]'
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-footnote font-medium ${className}`}>{status}</span>
}
