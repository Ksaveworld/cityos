import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Pause, Play, RotateCcw } from 'lucide-react'

import { CapabilityAdvantage } from '../CapabilityAdvantage'
import { EventCard } from '../EventCard'
import {
  deriveExecutionFrame,
  type ExecutionBranch,
  type ExecutionPlaybackState,
  type ExecutionTaskState,
} from '../execution/executionPlayback'
import { OriginMark } from '../Provenance'
import type { WorkflowSession } from '../workflow/types'

import {
  STATION_EXECUTIONS,
  STATION_PUBLIC_FACTS,
  STATION_SIMULATION_RUNS,
} from './stationHistory'
import type { HistoricalTrack } from './history516'

export function StationCasePanel({
  session,
  onChange,
  onStepChange,
  onPlaybackChange,
  onOpenResources,
}: {
  session: WorkflowSession
  onChange: (session: WorkflowSession) => void
  onStepChange: (step: number) => void
  onPlaybackChange?: (state: ExecutionPlaybackState | null) => void
  onOpenResources: () => void
}) {
  const [track, setTrack] = useState<HistoricalTrack>('cityos')
  const [playheadSec, setPlayheadSec] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [branch, setBranch] = useState<ExecutionBranch>('normal')
  const approved = session.approvedPlanId === session.selectedPlanId && session.approvedVersion === session.planVersion
  const definition = track === 'facts' ? null : STATION_EXECUTIONS[track]
  const run = track === 'facts' ? null : STATION_SIMULATION_RUNS[track]
  const frame = useMemo(() => (
    definition ? deriveExecutionFrame(definition, { playheadSec, branch }) : null
  ), [branch, definition, playheadSec])
  const latestAlert = frame?.visibleAlerts.at(-1) ?? null
  const playbackAllowed = track !== 'cityos' || approved
  const canOpenReview = track === 'cityos'
    && branch === 'normal'
    && definition !== null
    && playheadSec >= definition.durationSec
  const comparable = STATION_SIMULATION_RUNS.baseline.assumptionSetId === STATION_SIMULATION_RUNS.cityos.assumptionSetId
    && STATION_SIMULATION_RUNS.baseline.mapSnapshot === STATION_SIMULATION_RUNS.cityos.mapSnapshot
    && STATION_SIMULATION_RUNS.baseline.modelVersion === STATION_SIMULATION_RUNS.cityos.modelVersion

  useEffect(() => () => onPlaybackChange?.(null), [onPlaybackChange])

  useEffect(() => {
    if (!definition || !frame) {
      onPlaybackChange?.(null)
      return
    }
    const transport: ExecutionPlaybackState['transport'] = frame.blockingAlert
      ? 'blocked'
      : playheadSec >= definition.durationSec
        ? 'ended'
        : playing
          ? 'playing'
          : playheadSec > 0
            ? 'paused'
            : 'ready'
    onPlaybackChange?.({
      definitionId: definition.id,
      playheadSec: frame.playheadSec,
      transport,
      branch,
      attemptNo: 1,
    })
  }, [branch, definition, frame, onPlaybackChange, playheadSec, playing])

  useEffect(() => {
    if (!playing || !definition || !playbackAllowed) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setInterval(() => {
      setPlayheadSec((current) => {
        const increment = reducedMotion ? definition.durationSec / 4 : 0.2
        const next = Math.min(definition.durationSec, current + increment)
        const nextFrame = deriveExecutionFrame(definition, { playheadSec: next, branch })
        if (nextFrame.blockingAlert || next >= definition.durationSec) setPlaying(false)
        return nextFrame.playheadSec
      })
    }, reducedMotion ? 800 : 100)
    return () => window.clearInterval(timer)
  }, [branch, definition, playbackAllowed, playing])

  const activeTimelineItem = useMemo(() => {
    if (!run || !definition) return null
    const percent = (playheadSec / definition.durationSec) * 100
    return [...run.timeline].reverse().find((item) => item.at <= percent) ?? run.timeline[0]
  }, [definition, playheadSec, run])

  const changeTrack = (next: HistoricalTrack) => {
    setTrack(next)
    setPlaying(false)
    setPlayheadSec(0)
    setBranch('normal')
  }

  return (
    <div className="space-y-3 p-3">
      <EventCard variant="sunken" className="border-l-2 border-l-[#2F6FDA]">
        <div className="text-body font-semibold text-ink-1">广州火车站 · 2015-03-06 历史案例</div>
        <p className="mt-1 text-label leading-relaxed text-ink-2">公开事实只保留可核验锚点；警力编成、路线、医院分流、指挥流程、签收和阶段时间均进入演示轨。</p>
      </EventCard>

      <div className="grid grid-cols-3 gap-1" role="tablist" aria-label="广州火车站历史案例轨道">
        <TrackButton active={track === 'facts'} label="公开事实" onClick={() => changeTrack('facts')} />
        <TrackButton active={track === 'baseline'} label="常规对照" onClick={() => changeTrack('baseline')} />
        <TrackButton active={track === 'cityos'} label="CityOS 优势" tone="cityos" onClick={() => changeTrack('cityos')} />
      </div>

      <CapabilityAdvantage
        baselineEta={STATION_SIMULATION_RUNS.baseline.etaMinutes}
        cityosEta={STATION_SIMULATION_RUNS.cityos.etaMinutes}
        baselineRisk={STATION_SIMULATION_RUNS.baseline.coverageRisk ?? '待评估'}
        cityosRisk={STATION_SIMULATION_RUNS.cityos.coverageRisk ?? '待评估'}
        comparable={comparable}
        note="结论只来自同一公开时间地点、同一组演示假设和同一路网快照下的两次演示；不能据此评价 2015 年真实处置。"
      />

      {track === 'facts' ? (
        <StationFacts />
      ) : definition && run && frame ? (
        <section className="space-y-2">
          <EventCard variant="sunken">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-body font-semibold text-ink-1">演示执行舞台 · 非 2015 年真实处置回放</div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${track === 'cityos' ? 'bg-accent-strong text-white' : 'bg-[#ECEEF2] text-[#697386]'}`}>{track === 'cityos' ? 'CityOS 能力方案' : '常规对照'}</span>
                </div>
                <p className="mt-1 text-footnote leading-relaxed text-ink-3">{run.subtitle}</p>
              </div>
              <OriginMark origin="simulated" note="车辆、路线、路口、任务和时间线均为演示。" showLabel={false} />
            </div>

            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2">
              <span className={`size-2 shrink-0 rounded-full ${track === 'baseline' ? 'bg-[#697386]' : 'bg-accent-strong'}`} />
              <span className="min-w-0 flex-1 truncate text-footnote text-ink-2"><b className="text-ink-1">{activeTimelineItem?.label ?? 'T+0'}</b> · {activeTimelineItem?.detail ?? ''}</span>
              <span className="shrink-0 rounded bg-[#FFF7E6] px-1.5 py-0.5 text-[9px] text-[#8A5A14]">左侧真地图</span>
            </div>

            {track === 'cityos' && (
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1" aria-label="广州站演示执行分支">
                <BranchButton active={branch === 'normal'} label="正常执行" onClick={() => changeBranch('normal')} />
                <BranchButton active={branch === 'blocked'} label="演示异常" onClick={() => changeBranch('blocked')} />
              </div>
            )}

            {!playbackAllowed && (
              <div className="mt-2 rounded-lg border border-[#D59B28] bg-[#FFF9EA] px-2.5 py-2 text-footnote leading-relaxed text-[#76510E]">当前 CityOS 方案版本尚未人工批准，不能播放执行轨。</div>
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
              <button type="button" disabled={!playbackAllowed} onClick={() => {
                if (playheadSec >= definition.durationSec || frame.blockingAlert) setPlayheadSec(0)
                setPlaying((current) => !current)
              }} className="grid size-8 place-items-center rounded-lg bg-accent-strong text-white hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:bg-[#B8BBC7]" aria-label={playing ? '暂停广州站演示执行舞台' : '播放广州站演示执行舞台'}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>
              <button type="button" disabled={!playbackAllowed} onClick={() => { setPlayheadSec(0); setPlaying(true) }} className="grid size-8 place-items-center rounded-lg border border-line bg-white text-ink-2 hover:bg-sunken disabled:cursor-not-allowed disabled:text-[#B8BBC7]" aria-label="重放广州站演示执行舞台"><RotateCcw size={13} /></button>
              <input aria-label="拖动广州站演示执行时间线" type="range" min="0" max={definition.durationSec} step="0.2" value={playheadSec} disabled={!playbackAllowed} onChange={(event) => { setPlaying(false); setPlayheadSec(Number(event.target.value)) }} className="flex-1 accent-[#5B5BD6] disabled:cursor-not-allowed" />
              <span className="w-12 text-right font-mono text-footnote tabular-nums text-ink-3">{playheadSec.toFixed(1)}s</span>
            </div>
          </EventCard>

          <div className="grid grid-cols-3 gap-1.5" aria-label="广州站演示执行实时状态">
            <StageMetric label="演示车辆到场" value={`${frame.units.filter((unit) => unit.status === 'arrived').length}/${frame.units.length}`} />
            <StageMetric label="开放路口" value={`${frame.intersections.filter((item) => item.status === 'open').length}/${frame.intersections.length}`} />
            <StageMetric label="完成任务" value={`${frame.tasks.filter((task) => task.status === 'completed').length}/${frame.tasks.length}`} />
          </div>

          <EventCard variant="sunken">
            <div className="flex items-center justify-between gap-2"><div className="text-label font-semibold text-ink-1">{frame.incidentStage}</div><span className="rounded bg-[#EEEEFB] px-1.5 py-0.5 text-footnote font-medium text-accent-strong">演示状态</span></div>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {frame.tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 py-1.5"><span className="truncate text-footnote font-semibold text-ink-1">{task.label}</span><span className={`shrink-0 text-footnote ${taskStatusClass(task.status)}`}>{task.department} · {taskStatusLabel(task.status)}</span></div>)}
            </div>
          </EventCard>

          <div className="grid grid-cols-2 gap-1.5">
            <StageMetric label="ETA（估算）" value={`${run.etaMinutes?.toFixed(1)} 分钟`} />
            <StageMetric label="覆盖风险" value={run.coverageRisk ?? '待评估'} />
          </div>

          <EventCard variant="sunken">
            <div className="text-label font-semibold text-ink-1">比较条件一致，可以看演示差异</div>
            <p className="mt-1 text-footnote leading-relaxed text-ink-3">两次演示使用相同公开信息、演示假设、路网快照和模型版本；真实警力、路线、医院分流和签收没有公开，不能拿来评价历史处置。</p>
          </EventCard>
        </section>
      ) : null}

      {session.deliveryStatus === 'completed' ? (
        <EventCard variant="go" className="border-l-2 border-l-go">
          <div className="flex items-center gap-1.5 text-body font-semibold text-ink-1"><Check size={13} />演示执行已完成</div>
          <p className="mt-1 text-label leading-relaxed text-ink-2">协同任务与资源需求已经形成，可进入资源调度继续查看。</p>
          <button type="button" onClick={onOpenResources} className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-strong text-label font-semibold text-white hover:bg-[#4D4DC2]">前往资源调度<ArrowRight size={12} /></button>
          <button type="button" onClick={() => onStepChange(8)} className="mt-1.5 h-8 w-full rounded-lg border border-line bg-white text-label font-semibold text-ink-2 hover:bg-sunken">查看闭环报告</button>
        </EventCard>
      ) : (
        <button
          type="button"
          aria-label="完成广州站演示舞台"
          disabled={!canOpenReview}
          onClick={() => {
            if (!canOpenReview) return
            onChange({ ...session, stage: 'execution', deliveryStatus: 'completed' })
          }}
          className="h-9 w-full rounded-lg bg-accent-strong text-label font-semibold text-white transition hover:bg-[#4D4DC2] disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-3"
        >
          {track === 'facts'
            ? '切换 CityOS 优势轨并完成播放'
            : track === 'baseline'
              ? '完成 CityOS 优势轨播放'
              : branch === 'blocked'
                ? '返回正常执行并完成播放'
                : canOpenReview
                  ? '完成演示舞台'
                  : '播放完成后结束演示'}
        </button>
      )}
    </div>
  )

  function changeBranch(next: ExecutionBranch) {
    setBranch(next)
    setPlaying(false)
    setPlayheadSec(0)
  }
}

function StationFacts() {
  return (
    <section className="space-y-1.5">
      {STATION_PUBLIC_FACTS.map((fact) => (
        <EventCard key={fact.label} variant={fact.status === '未公开' ? 'dashed' : 'sunken'} className={fact.status === '未公开' ? 'border-[#D59B28]' : ''}>
          <div className="flex items-start justify-between gap-2"><span className="text-label font-semibold text-ink-1">{fact.label}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-footnote font-medium ${fact.status === '未公开' ? 'bg-[#FFF7E6] text-[#8A5A14]' : 'bg-[#EEEEFB] text-accent-strong'}`}>{fact.status}</span></div>
          <p className="mt-1 text-body leading-relaxed text-ink-1">{fact.value}</p>
          <a className="mt-1.5 block text-footnote leading-relaxed text-accent-strong hover:underline" href={fact.source.href} target="_blank" rel="noreferrer">来源：{fact.source.title}</a>
          {fact.note && <p className="mt-1 text-footnote leading-relaxed text-ink-3">{fact.note}</p>}
        </EventCard>
      ))}
      <OriginMark origin="real" note="仅以上公开锚点作为真实事件事实；不展示与调度无关的个人信息。" />
    </section>
  )
}

function TrackButton({ active, label, tone = 'neutral', onClick }: { active: boolean; label: string; tone?: 'neutral' | 'cityos'; onClick: () => void }) {
  const className = tone === 'cityos'
    ? active
      ? 'border border-accent-strong bg-accent-strong text-white shadow-sm'
      : 'border border-[#C9C9EF] bg-accent-weak text-accent-strong hover:border-accent-strong'
    : active
      ? 'border border-[#697386] bg-[#697386] text-white'
      : 'border border-line bg-white text-ink-2 hover:bg-sunken'
  return <button type="button" onClick={onClick} className={`h-8 whitespace-nowrap rounded-lg px-1 text-[9px] font-semibold transition ${className}`}>{label}</button>
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
