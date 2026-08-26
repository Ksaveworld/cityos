import { memo, useMemo, useState } from 'react'
import { ArrowRight, Crosshair, SlidersHorizontal } from 'lucide-react'

import {
  DISPATCH_UNITS,
  UNIT_STATUS_META,
  type DispatchUnit,
  type UnitStatus,
} from './boardData'

const KIND_FILTERS = ['全部', '消防', '公安', '医疗', '交管', '市容'] as const
type KindFilter = (typeof KIND_FILTERS)[number]

const SORTS = [
  { id: 'status', label: '按状态' },
  { id: 'eta', label: '按 ETA' },
  { id: 'kind', label: '按类别' },
] as const
type SortId = (typeof SORTS)[number]['id']

/** 待命排最前——调度时先看「还有谁能派」，在途和现场是已经安排掉的 */
const STATUS_ORDER: Record<UnitStatus, number> = { standby: 0, enroute: 1, onscene: 2 }

function etaMinutes(unit: DispatchUnit) {
  if (!unit.eta) return Number.POSITIVE_INFINITY
  const matched = unit.eta.match(/\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : Number.POSITIVE_INFINITY
}

/**
 * 资源调度板：主角是人和车，不是事件。
 * 回答的是「手上有什么、谁被占用、我要改派怎么办」。
 *
 * 8/21 评审「交互体验很差」，三个具体毛病都在这一版修掉：
 *
 * 1. 状态那三个数字看得见点不动。想知道「待命的 3 个是哪 3 个」只能自己
 *    从列表里数——现在改成筛选器，点一下就只剩待命的。
 * 2. 唯一的交互「调整」是跳走。点了就离开本模块，等于这个页面自己什么都做不了。
 *    现在选中单位先在原地展开详情，跳转降级成详情里的一个动作。
 * 3. 左边有地图，列表和它完全不联动。资源调度的核心恰恰是空间关系——
 *    「哪个待命单位离事发点最近」看列表答不了。现在选中即在图上高亮并飞过去。
 */
export const ResourceDispatchBoard = memo(function ResourceDispatchBoard({
  onAdjust,
  selectedUnitId,
  onSelectUnit,
  statusFilter,
  onStatusFilterChange,
}: {
  onAdjust: (unit: DispatchUnit) => void
  selectedUnitId: string | null
  onSelectUnit: (unitId: string | null) => void
  statusFilter: UnitStatus | null
  onStatusFilterChange: (status: UnitStatus | null) => void
}) {
  const [kind, setKind] = useState<KindFilter>('全部')
  const [sort, setSort] = useState<SortId>('status')

  const counts = useMemo(() => {
    const result: Record<UnitStatus, number> = { standby: 0, enroute: 0, onscene: 0 }
    for (const unit of DISPATCH_UNITS) result[unit.status] += 1
    return result
  }, [])

  const units = useMemo(() => {
    const filtered = DISPATCH_UNITS.filter(
      (unit) => (kind === '全部' || unit.kind === kind) && (statusFilter === null || unit.status === statusFilter),
    )
    return [...filtered].sort((left, right) => {
      if (sort === 'eta') return etaMinutes(left) - etaMinutes(right)
      if (sort === 'kind') return left.kind.localeCompare(right.kind, 'zh-Hans-CN')
      return STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    })
  }, [kind, statusFilter, sort])

  const filtered = kind !== '全部' || statusFilter !== null

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel">
      <div className="shrink-0 border-b border-hairline p-3">
        <h2 className="text-section text-ink-1">单位调度台</h2>
        <p className="mt-1 text-[9px] leading-relaxed text-ink-3">带“静态 POI”的名称与坐标来自广州公开 OSM；其余位置及人员、车辆、占用、状态均为演示。</p>

        {/* 状态卡即筛选器 */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(Object.keys(counts) as UnitStatus[]).map((item) => {
            const meta = UNIT_STATUS_META[item]
            const active = statusFilter === item
            return (
              <button
                key={item}
                type="button"
                onClick={() => onStatusFilterChange(active ? null : item)}
                aria-pressed={active}
                className={`rounded-lg px-2 py-1.5 text-left transition ${active ? 'ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'}`}
                style={{ background: meta.bg, ...(active ? { ['--tw-ring-color' as string]: meta.fg } : {}) }}
              >
                <div className="text-[9px] font-medium" style={{ color: meta.fg }}>{meta.label}</div>
                <div className="font-mono text-[18px] font-bold leading-tight tabular-nums" style={{ color: meta.fg }}>
                  {counts[item]}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-2 grid grid-cols-6 gap-1 rounded-lg bg-sunken p-1">
          {KIND_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setKind(item)}
              className={`h-6 rounded-md text-[10px] transition ${
                kind === item ? 'bg-white font-semibold text-ink-1 shadow-panel' : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[9px] text-ink-3">排序</span>
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSort(item.id)}
              className={`h-5 rounded px-1.5 text-[9px] transition ${
                sort === item.id ? 'bg-accent-weak font-semibold text-accent-strong' : 'text-ink-3 hover:text-ink-1'
              }`}
            >
              {item.label}
            </button>
          ))}
          {filtered && (
            <button
              type="button"
              onClick={() => { setKind('全部'); onStatusFilterChange(null) }}
              className="ml-auto h-5 rounded px-1.5 text-[9px] text-ink-3 underline-offset-2 hover:text-ink-1 hover:underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {units.map((unit) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            selected={unit.id === selectedUnitId}
            onSelect={() => onSelectUnit(unit.id === selectedUnitId ? null : unit.id)}
            onAdjust={() => onAdjust(unit)}
          />
        ))}
        {units.length === 0 && (
          <p className="px-2 py-6 text-center text-[10px] text-ink-3">当前筛选下没有单位</p>
        )}
      </div>

      <div className="shrink-0 border-t border-hairline bg-sunken px-3 py-2">
        <p className="text-[9px] leading-relaxed text-ink-3">
          改派会触发 ETA 与覆盖风险重算，且使原人工批准失效，需重新批准后方可生效；本演示不向真实单位下发。
        </p>
      </div>
    </aside>
  )
})

function UnitCard({
  unit,
  selected,
  onSelect,
  onAdjust,
}: {
  unit: DispatchUnit
  selected: boolean
  onSelect: () => void
  onAdjust: () => void
}) {
  const status = UNIT_STATUS_META[unit.status]
  const occupied = Boolean(unit.occupiedBy)

  return (
    <article
      className={`overflow-hidden rounded-lg border transition ${
        selected
          ? 'border-accent-strong bg-white ring-2 ring-accent-strong/15'
          : occupied
            ? 'border-line bg-white hover:border-accent-strong/40'
            : 'border-dashed border-line bg-sunken/60 hover:border-accent-strong/40'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full p-2 text-left" aria-expanded={selected}>
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1 py-px font-mono text-[9px] font-bold text-white" style={{ background: unit.kindColor }}>
            {unit.kind}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink-1">{unit.name}</span>
          <span className="rounded px-1.5 py-px text-[9px] font-bold" style={{ background: status.bg, color: status.fg }}>
            {status.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-2">
          <span>{unit.location}</span>
          <span className="text-ink-3">·</span>
          <span>{unit.strength}</span>
          {unit.eta && (
            <>
              <span className="text-ink-3">·</span>
              <span className="font-mono font-semibold text-[#2768CA]">ETA {unit.eta}</span>
            </>
          )}
        </div>
        {!selected && (
          <div className="mt-1.5 truncate border-t border-hairline pt-1.5 text-[9px] text-ink-3">
            {occupied ? <>占用：<span className="text-ink-2">{unit.occupiedBy}</span></> : '未被占用 · 可作为增援与改派候选'}
          </div>
        )}
      </button>

      {selected && (
        <div className="border-t border-hairline bg-sunken/50 px-2 py-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[9px]">
            <dt className="text-ink-3">当前占用</dt>
            <dd className="text-ink-2">{unit.occupiedBy ?? '未被占用，可改派'}</dd>
            <dt className="text-ink-3">编成</dt>
            <dd className="text-ink-2">{unit.strength}</dd>
            <dt className="text-ink-3">位置</dt>
            <dd className="text-ink-2">{unit.location}</dd>
            <dt className="text-ink-3">静态 POI</dt>
            <dd className="text-ink-2">
              {unit.staticPoi ? (
                <a href={unit.staticPoi.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-accent-strong">
                  {unit.staticPoi.name} · {unit.staticPoi.capturedAt}
                </a>
              ) : '未映射公开设施 · 当前为演示点位'}
            </dd>
          </dl>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[9px] text-accent-strong">
              <Crosshair size={9} />已在地图上标出
            </span>
            <button
              type="button"
              onClick={onAdjust}
              className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded-md border border-line bg-white px-2 text-[9px] font-medium text-ink-2 transition hover:border-accent-strong/40 hover:text-accent-strong"
            >
              <SlidersHorizontal size={9} />
              去处置链路改派
              <ArrowRight size={8} />
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
