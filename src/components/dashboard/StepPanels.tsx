import {
  AlertTriangle,
  Check,
  CircleHelp,
  FileText,
  LockKeyhole,
  Printer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'

import {
  ORIGIN_PROVENANCE,
  isDifferenceSignificant,
  type FeedbackRecord,
  type FireEvent,
  type Plan,
  type Scenario,
} from '@/engine'
import type { MedicalSupportRoute } from '@/pages/routingViewModel'

import { EventCard } from './EventCard'
import { ConfidenceMark, OriginMark } from './Provenance'
import { ROUTINE_HIGH_RISE, ROUTINE_HIGH_RISE_SIGNALS } from './fireModes'
import { HISTORY_516_FACTS } from './historical/history516'
import type { DashboardScenario } from './scenarios'
import {
  CommandTaskPackageOutputCard,
  TaskPackageOutputCard,
  type CommandTaskPackageOutput,
  type TaskPackageOutput,
} from './workflow/ApprovedOutputs'
import type { TaskAssignment } from './workflow/types'

const clock = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  })

export const duration = (seconds: number) => {
  const rounded = Math.round(seconds)
  return `${Math.floor(rounded / 60)}分${String(rounded % 60).padStart(2, '0')}秒`
}

export function LiwanStepPanel({
  step,
  scenario,
  plans,
  medicalRoute,
  activePlanId,
  onPickPlan,
  approvedPlanId,
  onApprove,
  onGoToStep,
  onOpenReport,
  closedWays,
  routeMessage,
  onRemoveClosedWay,
  onUndoClosedWay,
  onClearClosedWays,
  routeStale = false,
}: {
  step: number
  scenario: Scenario
  plans: Plan[]
  medicalRoute?: MedicalSupportRoute | null
  activePlanId: string
  onPickPlan: (id: string) => void
  approvedPlanId: string | null
  onApprove: (id: string) => void
  onGoToStep: (step: number) => void
  onOpenReport: () => void
  closedWays: Array<{ id: string; name: string }>
  routeMessage: string
  onRemoveClosedWay: (wayId: string) => void
  onUndoClosedWay: () => void
  onClearClosedWays: () => void
  routeStale?: boolean
}) {
  const plan = plans.find((item) => item.id === activePlanId) ?? plans[0]

  if (step === 0) return <SignalPanel event={scenario.event} alarmAnchor={scenario.officialAnchors[0]} />
  if (step === 1) return <EventPanel event={scenario.event} />
  if (step === 2) return <ContextPanel />
  if (step === 3) return <BriefPanel event={scenario.event} onViewStrategy={() => onGoToStep(4)} />
  if (step === 4 || step === 5) {
    return (
      <StrategyPanel
        plan={plan}
        plans={plans}
        medicalRoute={medicalRoute}
        onPick={onPickPlan}
        approvedPlanId={approvedPlanId}
        onApprove={onApprove}
        onOpenReport={onOpenReport}
        closedWays={closedWays}
        routeMessage={routeMessage}
        onRemoveClosedWay={onRemoveClosedWay}
        onUndoClosedWay={onUndoClosedWay}
        onClearClosedWays={onClearClosedWays}
        routeStale={routeStale}
      />
    )
  }
  if (step === 6) {
    return (
      <TaskPanel
        scenario={scenario}
        plan={plan}
        approved={approvedPlanId === plan.id}
        routeStale={routeStale}
        onReturnToStrategy={() => onGoToStep(4)}
        onOpenReport={onOpenReport}
      />
    )
  }
  if (step === 7) return <FeedbackPanel feedback={scenario.feedback} />
  return (
    <ReviewPanel
      scenario={scenario}
      plans={plans}
      medicalRoute={medicalRoute}
      activePlanId={activePlanId}
      approvedPlanId={approvedPlanId}
      onGoToStep={onGoToStep}
    />
  )
}

export function ScenarioStatePanel({ scenario, step }: { scenario: DashboardScenario; step: number }) {
  const state = scenario.states[step]
  const stage = SCENARIO_STAGE_PRESENTATION[Math.min(8, Math.max(0, step === 5 ? 4 : step))]
  const mapSummary = scenario.id === 'haizhu-police'
    ? '广州站公开事件锚点 · 3 个公开资源 POI · 演示路线'
    : scenario.id === 'yuexiu-urban-order'
      ? '北京路夜市占道点 · 消防通道入口 · 2 个演示协同单元'
    : scenario.id === 'yuexiu-traffic'
      ? '事故路段 · 绕行关系 · 2 个保障点'
      : scenario.id === 'tianhe-major'
        ? '场馆分区 · 3 个入口 · 2 个保障点'
        : '演练楼栋 · 3 类 Signal · 2 个资源参考点'
  const title = state === 'complete' ? '已完成记录' : '处置摘要'

  return (
    <div className="space-y-3 p-3">
      <EventCard variant="sunken">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-label font-semibold text-ink-1">
            <FileText size={13} className="text-accent-strong" />
            {title}
          </div>
        </div>
        <p className="mt-2 text-body leading-relaxed text-ink-2">{scenario.notes[step]}</p>
      </EventCard>

      <div className="grid grid-cols-2 gap-2">
        <EventCard>
          <div className="text-footnote font-medium text-ink-3">当前环节</div>
          <div className="mt-1 text-body font-semibold text-ink-1">{stage.label}</div>
          <div className="mt-1 text-label leading-relaxed text-ink-2">{stage.focus}</div>
        </EventCard>
        <EventCard>
          <div className="text-footnote font-medium text-ink-3">地图态势</div>
          <div className="mt-1 text-label font-semibold leading-relaxed text-ink-1">{mapSummary}</div>
          <div className="mt-1 text-footnote text-ink-3">图层开关可见生效</div>
        </EventCard>
      </div>

      <OriginMark origin="simulated" note={scenario.originNote} showLabel={false} />
    </div>
  )
}

const SCENARIO_STAGE_PRESENTATION = [
  { label: 'Signal 来源汇聚', focus: '保留渠道与时间窗' },
  { label: 'Event 事件归并', focus: '合并关联线索并保留待核实项' },
  { label: 'Context 上下文补齐', focus: '关联位置、入口与资源参考' },
  { label: 'AI Brief', focus: '浓缩当前态势与信息缺口' },
  { label: 'Strategy 方案生成', focus: '比较处置顺序与协同关系' },
  { label: 'Strategy 人工拍板', focus: '记录当前选择与协同前提' },
  { label: 'Task 任务草案', focus: '拆分角色、目标与协作动作' },
  { label: 'Feedback 反馈样例', focus: '展示状态更新与待确认项' },
  { label: 'Review 演示回看', focus: '回看来源、门禁与反馈链路' },
] as const

export function RoutineResponseStepPanel({ scenario, step }: { scenario: DashboardScenario; step: number }) {
  if (step !== 0) return <ScenarioStatePanel scenario={scenario} step={step} />

  return (
    <div className="space-y-3 p-3">
      <Section title="演练事件参数">
        <EventCard variant="sunken">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-body font-semibold text-ink-1">{ROUTINE_HIGH_RISE.address}</div>
              <div className="mt-1 text-label leading-relaxed text-ink-2">
                {ROUTINE_HIGH_RISE.buildingLevels} · {ROUTINE_HIGH_RISE.buildingUse}
              </div>
            </div>
            <OriginMark origin="simulated" note={ROUTINE_HIGH_RISE.sourceNote} showLabel={false} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-label text-ink-2">
            <div className="rounded-md bg-surface-card px-2 py-1.5">
              <span className="block text-ink-3">接警</span>
              <span className="mt-0.5 block font-mono tabular-nums text-ink-1">{ROUTINE_HIGH_RISE.alarmLabel}</span>
            </div>
            <div className="rounded-md bg-surface-card px-2 py-1.5">
              <span className="block text-ink-3">演练情景</span>
              <span className="mt-0.5 block text-ink-1">{ROUTINE_HIGH_RISE.drillFloor} · 电气线路故障</span>
            </div>
          </div>
        </EventCard>
      </Section>

      <Section title="三类 Signal">
        <div className="space-y-1.5">
          {ROUTINE_HIGH_RISE_SIGNALS.map((signal) => (
            <EventCard key={signal.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-body font-semibold text-ink-1">{signal.channel}</span>
                  <span className="ml-1.5 text-label text-ink-3">来源：{signal.sourceLabel}</span>
                </div>
                <time className="shrink-0 font-mono text-footnote tabular-nums text-ink-3">
                  {clock(signal.timestamp)}
                </time>
              </div>
              <p className="mt-1.5 text-body leading-relaxed text-ink-2">{signal.summary}</p>
              <div className="mt-1.5 text-label leading-relaxed text-ink-3">归并落点：{signal.mapping}</div>
              {/* 每条 Signal 原来各挂一个演示角标，一屏十几个，重复到没人读。
                  口径由顶栏「含演示数据」和面板底部那一处承担；
                  这里只保留 已确认 / 待核实 的置信度标记——那是内容，不是免责声明。 */}
              <div className="mt-2">
                <ConfidenceMark confidence={signal.confidence} />
              </div>
            </EventCard>
          ))}
        </div>
      </Section>
      <OriginMark origin="simulated" note={ROUTINE_HIGH_RISE.sourceNote} showLabel={false} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-label font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function SignalPanel({
  event,
  alarmAnchor,
}: {
  event: FireEvent
  alarmAnchor: { at: number; label: string; source: string }
}) {
  const reservedModalities = [
    ['视频', '现场回传 / 单位自有监控'],
    ['报警人语音', '转写后再进入地址与关键词归一化'],
    ['舆情', '仅作为街区级待确认线索'],
  ] as const

  return (
    <div className="space-y-3 p-3">
      <Section title="接入的信号">
        <div className="space-y-1.5">
          {event.signals.map((signal) => (
            <EventCard key={signal.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-semibold text-ink-1">{signal.source}</span>
                <time className="font-mono text-footnote tabular-nums text-ink-3">{clock(signal.timestamp)}</time>
              </div>
              <p className="mt-1.5 text-body leading-relaxed text-ink-2">{signal.text}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <ConfidenceMark confidence={signal.confidence} />
                <OriginMark
                  origin="simulated"
                  note="Signal 文本、来源组合与相对时序均为演示构造，不是历史逐字警单"
                  showLabel={false}
                />
              </div>
            </EventCard>
          ))}
        </div>
      </Section>
      <Section title="上游输入边界">
        <div className="space-y-1.5">
          {reservedModalities.map(([title, description]) => (
            <EventCard key={title} variant="sunken" className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-dashed border-line bg-surface-card text-ink-3">
                <LockKeyhole size={12} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink-1">{title}</span>
                <span className="mt-0.5 block text-label leading-relaxed text-ink-2">{description}</span>
              </span>
            </EventCard>
          ))}
        </div>
      </Section>
      <Section title="真实时间锚点">
        <EventCard variant="go" className="border-l-2 border-l-go">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-label font-semibold tabular-nums text-ink-1">
              {clock(alarmAnchor.at)} {alarmAnchor.label}
            </span>
            <OriginMark origin="real" note={alarmAnchor.source} showLabel={false} />
          </div>
          <p className="mt-1 text-body leading-relaxed text-ink-2">接警时刻来自广州市消防救援支队公开通报。</p>
        </EventCard>
      </Section>
      <OriginMark
        origin="simulated"
        note="Signal 文本、来源组合与相对时序为演示数据；公开接警时刻以实心来源标识。"
        showLabel={false}
      />
    </div>
  )
}

function EventPanel({ event }: { event: FireEvent }) {
  return (
    <div className="space-y-3 p-3">
      <Section title="已确认事实">
        <div className="space-y-1.5">
          {event.confirmedFacts.map((fact) => (
            <EventCard key={fact.key} variant="go" className="border-l-2 border-l-go">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-ink-2">{fact.key}</span>
                <ConfidenceMark confidence={fact.confidence} />
              </div>
              <div className="mt-1 text-body leading-relaxed text-ink-1">{fact.value}</div>
            </EventCard>
          ))}
        </div>
      </Section>
      <Section title="待核实线索">
        <div className="space-y-1.5">
          {event.pendingFacts.map((fact) => (
            <EventCard key={fact.key} variant="dashed" className="border-[#D59B28]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-[#9A6B12]">{fact.key}</span>
                <ConfidenceMark confidence={fact.confidence} />
              </div>
              <div className="mt-1 text-body leading-relaxed text-ink-1">{fact.value}</div>
            </EventCard>
          ))}
        </div>
      </Section>
    </div>
  )
}

function ContextPanel() {
  const rows = [
    ['建筑', '经营与仓储混合，四个门牌连为一体', 'real', 'OSM 建筑轮廓与公开地址'],
    ['层数', '实测覆盖 47.7%，其余按用途估算', 'estimated', 'OSM 缺失部分按用途估算'],
    ['站点位置', '光大消防中队（OSM 公开点位）', 'real', ORIGIN_PROVENANCE.location.source],
    ['本次调派选择', '选为本次演示增援起点', 'simulated', ORIGIN_PROVENANCE.dispatch.source],
    ['周边医院', '市第一人民医院等 3 家', 'real', 'OpenStreetMap 公开点位'],
    ['路网', '周边 6,980 条，单行道占 54.3%', 'real', 'OpenStreetMap 路网快照'],
    ['最近水源', '按规范间距生成', 'simulated', '公开消火栓数据覆盖不足'],
  ] as const

  return (
    <div className="space-y-3 p-3">
      <Section title="补齐的上下文">
        <div className="space-y-1">
          {rows.map(([key, value, origin, note]) => (
            <EventCard key={key} variant="sunken">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-ink-3">{key}</span>
                <OriginMark origin={origin} note={note} showLabel={false} />
              </div>
              <div className="mt-0.5 text-body leading-relaxed text-ink-1">{value}</div>
            </EventCard>
          ))}
        </div>
      </Section>
      <OriginMark
        origin="simulated"
        note="调派选择、资源状态与水源参考为演示数据；公开地理位置与估算层数以来源形状标识。"
        showLabel={false}
      />
    </div>
  )
}

function BriefPanel({
  event,
  onViewStrategy,
}: {
  event: FireEvent
  onViewStrategy: () => void
}) {
  return (
    <div className="space-y-3 p-3">
      <EventCard variant="go" className="border-l-2 border-l-go">
        <div className="flex items-center justify-between gap-2">
          <div className="text-body font-semibold text-ink-1">AI Brief 已形成</div>
          <span className="rounded bg-[#EAF8F1] px-1.5 py-0.5 text-footnote font-semibold text-[#237A52]">已确认</span>
        </div>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {event.confirmedFacts.map((fact) => (
            <div key={fact.key} className="rounded-md bg-surface-card px-2 py-1.5">
              <div className="text-footnote text-ink-3">{fact.key}</div>
              <div className="mt-0.5 text-label font-medium leading-relaxed text-ink-1">{fact.value}</div>
            </div>
          ))}
        </div>
      </EventCard>

      <EventCard variant="dashed" className="border-[#D59B28]">
        <div className="flex items-center gap-2 text-body font-semibold text-[#8A5A14]">
          <CircleHelp size={12} aria-hidden="true" />待核实
        </div>
        <div className="mt-2 space-y-1.5">
          {event.pendingFacts.map((fact) => (
            <div key={fact.key} className="flex items-start justify-between gap-2">
              <span className="text-label text-[#9A6B12]">{fact.key}</span>
              <span className="text-right text-label leading-relaxed text-ink-1">{fact.value}</span>
            </div>
          ))}
        </div>
      </EventCard>

      <EventCard variant="sunken" className="space-y-1.5">
        <div className="text-body font-semibold text-ink-1">已补齐的上下文</div>
        <div className="text-label leading-relaxed text-ink-2">建筑轮廓、周边医院、消防站点位与道路参考已关联。</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-footnote text-ink-3">
          {event.informationGaps.map((gap) => <span key={gap}>待补：{gap}</span>)}
        </div>
      </EventCard>

      <div className="flex items-center justify-between gap-2">
        <OriginMark
          origin="simulated"
          note="Signal 组合、归并过程、资源状态与 ETA 均为演示数据；已确认事实与待核实项按形状区分。"
          showLabel={false}
        />
        <button
          type="button"
          onClick={onViewStrategy}
          className="h-8 shrink-0 rounded-lg bg-accent-strong px-3 text-label font-semibold text-white transition hover:bg-[#4D4DC2]"
        >
          查看方案
        </button>
      </div>
    </div>
  )
}

function StrategyPanel({
  plan,
  plans,
  medicalRoute,
  onPick,
  approvedPlanId,
  onApprove,
  onOpenReport,
  closedWays,
  routeMessage,
  onRemoveClosedWay,
  onUndoClosedWay,
  onClearClosedWays,
  routeStale,
}: {
  plan: Plan
  plans: Plan[]
  medicalRoute?: MedicalSupportRoute | null
  onPick: (id: string) => void
  approvedPlanId: string | null
  onApprove: (id: string) => void
  onOpenReport: () => void
  closedWays: Array<{ id: string; name: string }>
  routeMessage: string
  onRemoveClosedWay: (wayId: string) => void
  onUndoClosedWay: () => void
  onClearClosedWays: () => void
  routeStale: boolean
}) {
  const candidates = plans.slice(0, 2)
  const [firstPlan, secondPlan] = candidates
  const differenceSignificant = Boolean(firstPlan && secondPlan && isDifferenceSignificant(firstPlan, secondPlan))
  const recommendedPlanId = [...candidates].sort((left, right) => left.metrics.etaSeconds - right.metrics.etaSeconds)[0]?.id

  return (
    <div className="space-y-3 p-3">
      {routeStale && (
        <div className="flex gap-2 rounded-lg bg-[#F3F4F6] p-2 text-body leading-relaxed text-ink-2">
          <AlertTriangle size={12} className="shrink-0" />
          当前封路组合不可达。以下保留上一次可行结果，暂不可选用。
        </div>
      )}
      <div className={`rounded-lg px-2.5 py-2 text-body leading-relaxed ${routeStale ? 'bg-[#FDF0F0] text-[#8C3034]' : 'bg-[#F4FBF7] text-[#237A52]'}`}>
        {routeMessage}
      </div>
      <MedicalSupportSummary medicalRoute={medicalRoute} plan={plan} />
      <Section title="候选方案">
        <p className="mb-2 text-label leading-relaxed text-ink-2">
          {differenceSignificant ? 'A/B 误差带不重叠，可据此选择。' : 'A/B 误差带重叠，请结合现场条件选择。'}
        </p>
        <div className="space-y-1.5">
          {candidates.map((candidate) => {
            const selected = candidate.id === plan.id
            const recommended = candidate.id === recommendedPlanId
            const approved = candidate.id === approvedPlanId
            return (
              <EventCard
                key={candidate.id}
                variant={selected ? 'accent' : 'default'}
                className={`transition ${routeStale ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-section text-ink-1">方案 {candidate.label}</span>
                      <span className={`rounded px-1.5 py-0.5 text-footnote font-semibold ${
                        recommended ? 'bg-[#EAF8F1] text-[#237A52]' : 'bg-sunken text-ink-3'
                      }`}>
                        {recommended ? '优先查看' : '可选'}
                      </span>
                      {approved && (
                        <span className="inline-flex items-center gap-1 rounded bg-accent-strong px-1.5 py-0.5 text-footnote font-semibold text-white">
                          <Check size={10} strokeWidth={2.6} />已选用
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-label tabular-nums text-ink-2">
                      误差带 {duration(candidate.metrics.etaRange[0])}–{duration(candidate.metrics.etaRange[1])}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-section font-semibold tabular-nums text-ink-1">{duration(candidate.metrics.etaSeconds)}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label text-ink-3">
                  <span>路口 {candidate.metrics.intersectionCount}</span>
                  <span>影响 {candidate.metrics.controlImpact}</span>
                  <span>风险 {candidate.metrics.failureRisk}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-line pt-2">
                  <button
                    type="button"
                    aria-label={`查看方案 ${candidate.label} 报告`}
                    onClick={() => {
                      onPick(candidate.id)
                      onOpenReport()
                    }}
                    className="flex h-8 items-center justify-center gap-1 rounded-lg border border-line bg-surface-card text-label font-semibold text-ink-1 hover:bg-sunken"
                  >
                    <FileText size={12} />查看报告
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(candidate.id)
                      onApprove(candidate.id)
                    }}
                    disabled={routeStale || approved}
                    className="h-8 rounded-lg bg-accent-strong text-label font-semibold text-white transition hover:bg-[#4D4DC2] disabled:bg-line disabled:text-ink-3"
                  >
                    {approved ? '已选用' : '选用此方案'}
                  </button>
                </div>
              </EventCard>
            )
          })}
        </div>
      </Section>
      <OriginMark origin="simulated" note="ETA、资源状态、车辆能力、路口影响与风险均为演示演示" showLabel={false} />

      <Section title="已封道路 · 整条 OSM way">
        {closedWays.length ? (
          <div className="space-y-1">
            {closedWays.map((way) => (
              <div key={way.id} className="flex items-center gap-2 rounded-lg bg-[#FDF0F0] px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-label text-[#8C3034]" title={`${way.name} · way ${way.id}`}>
                  {way.name}
                </span>
                <button
                  onClick={() => onRemoveClosedWay(way.id)}
                  className="grid size-5 shrink-0 place-items-center rounded text-[#A3373C] hover:bg-surface-card"
                  aria-label={`撤销封闭 ${way.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button onClick={onUndoClosedWay} className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#D9DCE6] text-label text-ink-2">
                <RotateCcw size={10} />撤销最近一条
              </button>
              <button onClick={onClearClosedWays} className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#F2CBCD] text-label text-[#A3373C]">
                <Trash2 size={10} />清空封路
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#D9DCE6] p-2 text-body leading-relaxed text-ink-3">
            在地图上点击道路，核对名称后封闭整条 OSM way；当前路线会使用同一封路条件重算。
          </p>
        )}
      </Section>
    </div>
  )
}

function MedicalSupportSummary({
  medicalRoute,
  plan,
}: {
  medicalRoute?: MedicalSupportRoute | null
  plan: Plan
}) {
  if (!medicalRoute) return null

  const sharedSegments = plan.id === 'plan-b'
    ? medicalRoute.sharedSegmentIdsByPlan.planB
    : medicalRoute.sharedSegmentIdsByPlan.planA
  const arrivalDifference = medicalRoute.etaSeconds - plan.metrics.etaSeconds
  const arrivalCopy = arrivalDifference === 0
    ? '与消防车预计同时到场'
    : arrivalDifference > 0
      ? `预计晚 ${duration(arrivalDifference)} 到场`
      : `预计早 ${duration(-arrivalDifference)} 到场`

  return (
    <Section title="协同到场">
      <EventCard variant="sunken">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-body font-semibold text-ink-1">120 到场路线</div>
            <div className="mt-1 truncate text-label text-ink-2">本次演示出发医院：{medicalRoute.origin.name}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-body font-semibold tabular-nums text-[#0E9AA7]">{duration(medicalRoute.etaSeconds)}</div>
            <div className="mt-0.5 font-mono text-footnote tabular-nums text-ink-3">
              {duration(medicalRoute.etaRange[0])}–{duration(medicalRoute.etaRange[1])}
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-label text-ink-3">
          <span>{formatMeters(medicalRoute.meters)}</span>
          <span>{arrivalCopy}</span>
          <span>与当前方案共线 {sharedSegments.length} 段</span>
        </div>
        <OriginMark
          origin="simulated"
          note="医院位置来自公开 OSM 点位；本次出发、车辆可用状态、到场时间与共线路段为演示计算。"
          showLabel={false}
        />
      </EventCard>
    </Section>
  )
}

function formatMeters(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

function TaskPanel({
  scenario,
  plan,
  approved,
  routeStale,
  onReturnToStrategy,
  onOpenReport,
}: {
  scenario: Scenario
  plan: Plan
  approved: boolean
  routeStale: boolean
  onReturnToStrategy: () => void
  onOpenReport: () => void
}) {
  if (!approved || routeStale) {
    return (
      <div className="p-3">
        <EventCard variant="dashed" className="border-[#D59B28]">
          <div className="text-body font-semibold text-[#8A5A14]">{routeStale ? '任务包已失效' : '任务包仍是草案'}</div>
          <p className="mt-1 text-label leading-relaxed text-[#8A5A14]">
            {routeStale ? '当前封路条件使原方案不可用，需返回方案页重算并重新人工选用。' : '当前方案尚未人工选用，不能生成协同任务包。'}
          </p>
          <button type="button" onClick={onReturnToStrategy} className="mt-2 h-8 w-full rounded-lg border border-[#E4C580] bg-white text-label font-semibold text-[#8A5A14] hover:bg-[#FFF9EA]">返回方案</button>
        </EventCard>
      </div>
    )
  }

  const assignments = buildLiwanAssignments(scenario, plan)
  const commandTaskOutput = buildLiwanCommandTaskOutput(scenario, plan, assignments)
  const taskOutput: TaskPackageOutput = {
    subtitle: '总负责人：指挥席人工确认（演示） · 联系/送达：系统任务包',
    assignments,
    deliveryStatus: 'pending-send',
    etaSuffix: '',
  }

  return (
    <div className="space-y-3 p-3">
      <CommandTaskPackageOutputCard output={commandTaskOutput} />
      <TaskPackageOutputCard output={taskOutput} />
      <button type="button" onClick={onOpenReport} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-label font-semibold text-ink-1 hover:bg-sunken">
        <FileText size={12} />查看 5·16 归档复盘快照（可打印）
      </button>
      <p className="text-footnote leading-relaxed text-ink-3">任务、负责人、资源、路线、ETA 与送达状态均为演示输出；实际调派、车辆、路线与签收未公开。</p>
    </div>
  )
}

function buildLiwanCommandTaskOutput(scenario: Scenario, plan: Plan, assignments: TaskAssignment[]): CommandTaskPackageOutput {
  const publicFacts = HISTORY_516_FACTS.filter((fact) => fact.status !== '未公开').slice(0, 3)
  return {
    subtitle: `5·16 公开复盘 · 方案 ${plan.label} · CityOS 演示输出`,
    approvedLabel: '已人工选用',
    facts: publicFacts.map((fact) => ({ label: fact.label, value: fact.value })),
    situationSummary: `${plan.rationale} 实际调派、车辆、路线与签收未公开；本卡只表达当前 CityOS 演示方案。`,
    planLabel: plan.label,
    planTitle: plan.metrics.intersectionCount > 0 ? '沿线协同、缩短演示首到' : '普通规则绕行',
    eta: duration(plan.metrics.etaSeconds),
    etaNote: '演示首到 ETA（估算）',
    decisionBasis: '未记录文字说明；保留当前演示 ETA、误差带、路口影响与失败风险供人工复核',
    assignments,
    risks: [
      { label: '实际调派与签收', value: '车辆编成、行驶路线与任务签收均未公开', status: '不得反推为原处置事实' },
      { label: '现场信息缺口', value: scenario.event.informationGaps.slice(0, 2).join('；'), status: '执行前需核验' },
    ],
    provenance: [
      { label: '公开事实', detail: '接警 / 地点 / 扑灭时刻', tone: 'green' },
      { label: '演示', detail: '方案 / ETA / 路口 / 任务', tone: 'accent' },
      { label: '未公开', detail: '实际调派 / 车辆 / 签收', tone: 'amber' },
    ],
  }
}

function buildLiwanAssignments(scenario: Scenario, plan: Plan): TaskAssignment[] {
  return plan.actions.map((action) => {
    const intersections = action.intersections ?? []
    const firstWindow = intersections.length
      ? Math.min(...intersections.map((intersection) => intersection.passAt - intersection.leadSeconds))
      : null
    const lastWindow = intersections.length
      ? Math.max(...intersections.map((intersection) => intersection.releaseAt))
      : null
    const location = action.type === '派遣'
      ? scenario.site.address
      : action.type === '请求开路' && intersections.length
        ? `${intersections[0].name}等 ${intersections.length} 处路口`
        : action.target
    const window = action.type === '派遣'
      ? `${clock(scenario.alarmAt)} 接警 · 预计 ${duration(plan.metrics.etaSeconds)} 到场`
      : firstWindow !== null && lastWindow !== null
        ? `${clock(firstWindow)}–${clock(lastWindow)} 演示时窗`
        : '方案批准后通知 · 回执时限待核实'
    const vehicles = action.type === '派遣' && action.detail
      ? `${action.detail}（演示编成）`
      : action.type === '通知物业'
        ? '车辆不适用'
        : '车辆未建模'
    const eta = action.type === '派遣'
      ? `${duration(plan.metrics.etaSeconds)}（估算）`
      : action.type === '请求开路'
        ? '按路口演示时窗'
        : '待人工确认'

    return {
      department: liwanDepartment(action),
      owner: action.target,
      task: liwanTaskCopy(action),
      location,
      window,
      personnel: '人数未建模',
      vehicles,
      feedback: liwanFeedbackCopy(action),
      contact: '系统任务包（演示，未真实送达）',
      eta,
    }
  })
}

type LiwanAction = Plan['actions'][number]

function liwanDepartment(action: LiwanAction) {
  if (action.type === '派遣') return '消防'
  if (action.type === '请求开路') return '交管'
  if (action.type === '通知医疗') return '医疗'
  if (action.type === '通知物业') return '属地'
  return action.target.includes('医院') ? '医疗' : '协同'
}

function liwanTaskCopy(action: LiwanAction) {
  if (action.type === '派遣') return '按选定演示路线出动并到场'
  if (action.type === '请求开路') return action.detail ?? '按路口时间窗滚动清空'
  if (action.type === '通知医疗') return '确认医疗保障与接收条件'
  if (action.type === '通知物业') return '反馈楼内人员、通道与疏散状态'
  return action.detail ?? `${action.type}并回传状态`
}

function liwanFeedbackCopy(action: LiwanAction) {
  if (action.type === '派遣') return '签收、出动、到场与异常状态'
  if (action.type === '请求开路') return '路口可执行性与清空完成状态'
  if (action.type === '通知医疗') return '接收能力与保障准备状态'
  if (action.type === '通知物业') return '楼内人员、通道与疏散核验'
  return '签收、执行与异常状态'
}

function FeedbackPanel({ feedback }: { feedback: FeedbackRecord[] }) {
  return (
    <div className="space-y-3 p-3">
      <Section title="执行反馈">
        <div className="space-y-2">
          {feedback.map((record, index) => (
            <div key={`${record.node}-${index}`} className="grid grid-cols-[34px_1fr] gap-2 border-b border-line pb-2 last:border-0">
              <time className="font-mono text-footnote tabular-nums text-ink-3">{clock(record.at)}</time>
              <div>
                <div className="text-label font-semibold text-ink-1">{record.node} · {record.from}</div>
                <div className="mt-0.5 text-body leading-relaxed text-ink-2">{record.content}</div>
                {record.executable === false && <span className="mt-1 inline-block rounded bg-[#FFF7E6] px-1 py-0.5 text-label text-[#8A5A14]">需重新选择方案</span>}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <OriginMark origin="simulated" note="反馈记录为演示数据，不代表 5·16 历史处置过程" showLabel={false} />
    </div>
  )
}

function ReviewPanel({
  scenario,
  plans,
  medicalRoute,
  activePlanId,
  approvedPlanId,
  onGoToStep,
}: {
  scenario: Scenario
  plans: Plan[]
  medicalRoute?: MedicalSupportRoute | null
  activePlanId: string
  approvedPlanId: string | null
  onGoToStep: (step: number) => void
}) {
  const [planA, planB] = plans
  const plan = plans.find((item) => item.id === (approvedPlanId ?? activePlanId)) ?? planA
  const approved = Boolean(plan && approvedPlanId === plan.id)
  const significant = planA && planB ? isDifferenceSignificant(planA, planB) : false

  return (
    <article id="cityos-report" className="space-y-3 bg-surface-card p-3">
      <EventCard variant="sunken" className="rounded-xl p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-body font-semibold text-ink-1">
              <FileText size={13} />
              CITY OS · 事件处置建议报告
            </div>
            <div className="mt-1 font-mono text-footnote tabular-nums text-ink-3">{scenario.event.id}</div>
          </div>
          <span className={`shrink-0 rounded px-1.5 py-1 text-footnote font-semibold ${approved ? 'bg-[#EAF8F1] text-[#237A52]' : 'bg-[#FFF7E6] text-[#8A5A14]'}`}>
            {approved ? '已选用' : '草案'}
          </span>
        </div>
        <div className="mt-2"><OriginMark origin="simulated" note="Signal、资源状态、任务、反馈与 ETA 为演示数据；公开事实和估算项以来源形状标识。" /></div>
        <button
          onClick={() => window.print()}
          className="no-print mt-2 flex h-7 items-center justify-center gap-1 rounded-lg border border-line bg-surface-card px-2 text-label font-semibold text-ink-1"
        >
          <Printer size={11} />打印 / 另存为 PDF
        </button>
      </EventCard>

      <ReportSection title="事件事实" ring="Event" onReview={() => onGoToStep(1)}>
        <EventCard>
          <div className="text-label font-semibold text-ink-1">{scenario.site.name}</div>
          <div className="mt-1 text-label leading-relaxed text-ink-2">{scenario.site.address}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <OriginMark origin="real" note="地址、接警与扑灭时刻来自官方公开口径" showLabel={false} />
            <OriginMark origin="simulated" note="Signal 文本、归并过程与状态为演示构造" showLabel={false} />
          </div>
        </EventCard>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {scenario.officialAnchors.map((anchor) => (
            <EventCard key={anchor.label} variant="sunken" className="px-2 py-1.5">
              <div className="text-footnote text-ink-3">{anchor.label}</div>
              <time className="font-mono text-body font-semibold tabular-nums text-ink-1">{clock(anchor.at)}</time>
            </EventCard>
          ))}
        </div>
        <div className="mt-1.5 text-label text-ink-2">
          {scenario.event.confirmedFacts.length} 项已确认 · {scenario.event.pendingFacts.length} 项待核实
        </div>
      </ReportSection>

      <ReportSection title="上下文补齐" ring="Context" onReview={() => onGoToStep(2)}>
        <ul className="space-y-1 text-label leading-relaxed text-ink-2">
          <li>· 建筑轮廓、周边医院、消防站点位与路网来自 OSM 快照。</li>
          <li>· 资源状态、信号配时与 ETA 为演示值。</li>
          <li>· 设施状态、内部平面、疏散通道与库存性质待补。</li>
        </ul>
      </ReportSection>

      <ReportSection title="候选方案与依据" ring="Strategy" onReview={() => onGoToStep(4)}>
        <div className="space-y-1.5">
          {[planA, planB].filter(Boolean).map((candidate) => (
            <EventCard key={candidate.id} variant={candidate.id === plan?.id ? 'accent' : 'default'}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-label font-semibold text-ink-1">方案 {candidate.label}</span>
                <span className="font-mono text-body font-semibold tabular-nums text-ink-1">{duration(candidate.metrics.etaSeconds)}</span>
              </div>
              <div className="mt-1 font-mono text-footnote tabular-nums text-ink-3">
                误差带 {duration(candidate.metrics.etaRange[0])}–{duration(candidate.metrics.etaRange[1])}
              </div>
            </EventCard>
          ))}
        </div>
        <p className="mt-1.5 text-label leading-relaxed text-ink-2">
          当前 A/B {significant ? '误差带不重叠，差异显著' : '误差带重叠，系统不强推推荐'}。路径几何来自真实路网求解，ETA 与配时按本次演示参数估算。
        </p>
      </ReportSection>

      {medicalRoute && (
        <ReportSection title="医疗支援" ring="120" onReview={() => onGoToStep(4)}>
          <EventCard variant="sunken">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-label font-semibold text-ink-1">120 到场路线 · {medicalRoute.origin.name}</div>
                <div className="mt-1 text-footnote text-ink-3">本次演示出发医院</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-body font-semibold tabular-nums text-[#0E9AA7]">{duration(medicalRoute.etaSeconds)}</div>
                <div className="mt-0.5 font-mono text-footnote tabular-nums text-ink-3">{formatMeters(medicalRoute.meters)}</div>
              </div>
            </div>
          </EventCard>
        </ReportSection>
      )}

      <ReportSection title="方案选择" ring="Strategy" onReview={() => onGoToStep(4)}>
        <EventCard variant={approved ? 'go' : 'sunken'} className={approved ? 'text-[#237A52]' : 'text-[#8A5A14]'}>
          <p className="text-label leading-relaxed">
            {approved && plan
              ? `当前已选用方案 ${plan.label}；该选择仅作用于本次演示。`
              : `当前查看方案 ${plan?.label ?? '—'}，尚未选用，因此任务仍为草案。`}
          </p>
        </EventCard>
      </ReportSection>

      <ReportSection title="协同任务" ring="Task" onReview={() => onGoToStep(6)}>
        <div className="space-y-1.5">
          {(plan?.actions ?? []).map((action) => (
            <EventCard key={`${action.type}-${action.target}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-label font-semibold text-ink-1">{action.type} · {action.target}</span>
                <span className={`shrink-0 rounded px-1 py-0.5 text-footnote ${action.approvalLevel === 'human' ? 'bg-[#FDF0F0] text-[#A3373C]' : 'bg-[#F3F4F6] text-ink-2'}`}>
                  {action.approvalLevel === 'human' ? '人工' : '自动'}
                </span>
              </div>
              {action.detail && <div className="mt-1 text-footnote leading-relaxed text-ink-2">{action.detail}</div>}
            </EventCard>
          ))}
        </div>
      </ReportSection>

    </article>
  )
}

function ReportSection({
  title,
  ring,
  onReview,
  children,
}: {
  title: string
  ring: string
  onReview: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-line p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-label font-semibold text-ink-1">{title}</h3>
        <button onClick={onReview} className="no-print text-footnote font-medium text-accent-strong hover:underline">
          回看 {ring}
        </button>
      </div>
      {children}
    </section>
  )
}
