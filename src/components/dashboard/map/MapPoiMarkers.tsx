import { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import { X } from 'lucide-react'

import { POI_SPECS, type PoiConfidence, type PoiKind } from './poiCatalog'

export interface PoiMarkerDatum {
  id: string
  position: [number, number]
  kind: PoiKind
  label: string
  confidence?: PoiConfidence
  /** 告警起伏光效，用于需要引起注意的事件锚点 */
  alarm?: boolean
  /**
   * 紧凑态：小一号、不带文字标签。城市尺度下的周边设施用这个——
   * 一百多个点每个都挂标签，地图会被文字糊死，反而什么都读不出来。
   */
  compact?: boolean
  /**
   * 事件锚点还是常设设施。
   *
   * 8/21 评审「火情标和消防站标分不清」——根因不只是字形撞了，是**两类点用了
   * 同一种视觉形态**，只差一号大小：告警和设施都是实心色块 + 白字形。
   * 城市总览上一百多个设施点和五个告警点混在一起，大小差异根本压不住。
   *
   * 现在按语义分两种形态，缩放到任何级别都能一眼分开：
   *   incident（事件）—— 实心色块 + 白字形 + 脉冲光晕，"这里出事了"
   *   facility（设施）—— 白底 + 彩色描边 + 彩色字形，"这里有个站"
   */
  role?: 'incident' | 'facility'
  /** 调度规划态独立于数据置信度：当前为圆角方形、候选为虚线圆形、受影响为菱形。 */
  planningState?: 'current' | 'candidate' | 'impacted'
  selected?: boolean
  detail?: {
    title: string
    type: string
    address?: string
    sourceLabel: string
    sourceUrl?: string
    capturedAt?: string
    simulationNote?: string
  }
  /** 传了才可点；不传的点位不吃鼠标事件，避免挡住地图拖拽 */
  onSelect?: () => void
  onClose?: () => void
}

export interface SignalCalloutDatum {
  id: string
  position: [number, number]
  anchorLabel: string
  labels: string[]
}

/**
 * 地图 POI 标识层。
 *
 * 用 MapLibre 原生 Marker 承载 DOM，不用 deck.gl IconLayer：
 * - Marker 自己处理投影与地图变换，不需要我们逐帧 project()
 * - DOM 能做圆角徽标、投影、虚线描边、脉冲光效和点击态，IconLayer 得先烘一张
 *   雪碧图，改个颜色就要重烘，且点击命中要另接 picking
 * - 点位数量是十几个量级，DOM 完全撑得住
 *
 * 代价是标签不做避让，密集时会叠——所以标签一律带白色药丸底，叠了也还能读。
 */
export const MapPoiMarkers = memo(function MapPoiMarkers({
  map,
  points,
}: {
  map: MapLibreMap | null
  points: PoiMarkerDatum[]
}) {
  // Marker.addTo() 内部会走到 getTerrain()，样式没加载完时它直接抛
  // 「Style is not done loading」，整个 CityMap 跟着崩。地图实例 ready 不等于
  // 样式 ready——本项目还有在线底图失败回退本地底图这一步，样式会被换掉一次。
  const styleReady = useStyleReady(map)

  if (!map || !styleReady) return null
  return (
    <>
      {points.map((point) => (
        <PoiMarker key={point.id} map={map} point={point} />
      ))}
    </>
  )
})

/**
 * 绑定到地图坐标的 Signal 标签。
 *
 * 标签和引导线放在同一个 MapLibre Marker 内：地图平移、缩放、旋转时，
 * Marker 会持续投影建筑锚点，避免退化成看似靠近建筑的屏幕固定 HUD。
 */
export const MapSignalCallouts = memo(function MapSignalCallouts({
  map,
  callout,
}: {
  map: MapLibreMap | null
  callout: SignalCalloutDatum | null
}) {
  const styleReady = useStyleReady(map)

  if (!map || !styleReady || !callout) return null
  return <SignalCalloutMarker map={map} callout={callout} />
})

function useStyleReady(map: MapLibreMap | null) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!map) {
      setReady(false)
      return
    }
    // 只做单向闩锁：一旦样式就绪过一次就不再翻回 false。
    // 在线底图失败回退本地底图时会再调一次 setStyle，期间 styledata 会带着
    // isStyleLoaded() === false 再发一遍；如果跟着它把状态打回 false，
    // 而之后又没有新事件把它翻回来，徽标就再也不出现了——这个坑踩过一次。
    // 徽标是 DOM Marker，不属于样式图层，换样式不会把它们带走，锁定是安全的。
    // isStyleLoaded() 在样式实例还没建好时返回 void 而不是 false，显式转布尔。
    const sync = () => {
      if (map.isStyleLoaded()) setReady(true)
    }
    sync()
    map.on('styledata', sync)
    map.on('load', sync)
    map.on('idle', sync)
    return () => {
      map.off('styledata', sync)
      map.off('load', sync)
      map.off('idle', sync)
    }
  }, [map])

  return ready
}

function PoiMarker({ map, point }: { map: MapLibreMap; point: PoiMarkerDatum }) {
  const element = useMemo(() => document.createElement('div'), [])
  const [lng, lat] = point.position

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, element, lng, lat])

  return createPortal(<PoiBadge point={point} />, element)
}

function SignalCalloutMarker({ map, callout }: { map: MapLibreMap; callout: SignalCalloutDatum }) {
  const element = useMemo(() => {
    const host = document.createElement('div')
    host.style.zIndex = '4'
    return host
  }, [])
  const [lng, lat] = callout.position

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'bottom-left', offset: [0, -18] })
      .setLngLat([lng, lat])
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, element, lng, lat])

  return createPortal(<SignalCallout callout={callout} />, element)
}

function SignalCallout({ callout }: { callout: SignalCalloutDatum }) {
  const labelCenters = callout.labels.map((_, index) => 16 + index * 40)

  return (
    <div
      className="pointer-events-none relative h-[128px] w-[306px]"
      aria-label="事件线索"
      data-signal-anchor-bound="true"
      data-signal-anchor-label={callout.anchorLabel}
    >
      <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 306 128" aria-hidden="true">
        {labelCenters.map((centerY, index) => (
          <path
            key={callout.labels[index]}
            data-signal-leader={callout.labels[index]}
            d={`M 5 124 L 48 94 L 104 ${centerY} L 154 ${centerY}`}
            fill="none"
            stroke="#C77816"
            strokeDasharray="3 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.25"
          />
        ))}
        <circle cx="5" cy="124" r="4" fill="#FFF7E6" stroke="#C77816" strokeWidth="1.5" />
      </svg>
      <div className="absolute left-[154px] top-0 flex w-[152px] flex-col gap-2">
        {callout.labels.map((label) => (
          <div
            key={label}
            className="flex h-8 items-center gap-2 rounded-lg border border-dashed border-[#D8B66B] bg-white/95 px-2.5 text-[10px] font-semibold text-[#6D5420] shadow-sm backdrop-blur-sm"
          >
            <span className="size-2 shrink-0 rounded-full border border-dashed border-[#C77816] bg-[#FFF7E6]" aria-hidden="true" />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}

function PoiBadge({ point }: { point: PoiMarkerDatum }) {
  const spec = POI_SPECS[point.kind]
  const unverified = point.confidence === 'unverified'
  const facility = point.role === 'facility'
  const interactive = Boolean(point.onSelect)
  // 白底 + 彩色描边这一种画法，同时服务两件事：常设设施，以及待核实的点位。
  // 两者语义不同但都属于「不是正在发生的事」，共用一种形态不会误读，
  // 而且省下一种视觉变量——地图上能同时并存的形态越少越读得快。
  const outlined = point.planningState
    ? point.planningState !== 'current'
    : unverified || facility

  return (
    <div
      className="cityos-poi"
      data-interactive={interactive ? 'true' : 'false'}
      data-compact={point.compact ? 'true' : 'false'}
      data-role={facility ? 'facility' : 'incident'}
      data-planning-state={point.planningState ?? 'none'}
    >
      {point.selected && point.detail && (
        <div className="cityos-poi-detail" role="dialog" aria-label={`${point.detail.title}资源详情`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold leading-snug text-[#1A1D26]">{point.detail.title}</div>
              <div className="mt-1 text-[9px] text-[#6B7280]">{point.detail.type}</div>
            </div>
            <button
              type="button"
              aria-label="关闭资源详情"
              className="grid size-5 shrink-0 place-items-center rounded hover:bg-[#F4F5FA]"
              onClick={(event) => {
                event.stopPropagation()
                point.onClose?.()
              }}
            >
              <X size={11} className="text-[#8A94A7]" />
            </button>
          </div>
          {point.detail.address && <div className="mt-2 text-[9px] leading-relaxed text-[#4B5563]">位置：{point.detail.address}</div>}
          <div className="mt-2 border-t border-[#E8EAF0] pt-2 text-[9px] leading-relaxed text-[#6B7280]">
            来源：{point.detail.sourceUrl ? (
              <a href={point.detail.sourceUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-[#5B5BD6]">
                {point.detail.sourceLabel}
              </a>
            ) : point.detail.sourceLabel}
            {point.detail.capturedAt ? ` · 获取 ${point.detail.capturedAt}` : ''}
          </div>
          {point.detail.simulationNote && (
            <div className="mt-2 rounded-md bg-[#FFF7E6] px-2 py-1.5 text-[9px] leading-relaxed text-[#8A5A14]">
              演示：{point.detail.simulationNote}
            </div>
          )}
        </div>
      )}
      {point.alarm && <span className="cityos-poi-pulse" style={{ background: spec.color }} aria-hidden="true" />}

      <button
        type="button"
        className="cityos-poi-badge"
        data-confidence={unverified ? 'unverified' : 'confirmed'}
        style={{
          background: outlined ? '#FFFFFF' : spec.color,
          // 实心态保留白色描边：那圈白是在浅色底图上把徽标托出来的关键，去掉会糊进底图
          borderColor: outlined ? spec.color : '#FFFFFF',
        }}
        onClick={(event) => {
          event.stopPropagation()
          point.onSelect?.()
        }}
        disabled={!interactive}
        title={`${point.label} · ${spec.category}${point.planningState ? ` · ${point.planningState === 'current' ? '当前分配' : point.planningState === 'candidate' ? '待批准候选' : '受影响资源'}` : ''}${unverified ? ' · 待核实' : ''}`}
        aria-label={`${point.label}，${spec.category}${point.planningState ? `，${point.planningState === 'current' ? '当前分配' : point.planningState === 'candidate' ? '待批准候选' : '受影响资源'}` : ''}${unverified ? '，待核实' : ''}`}
      >
        <span
          className="cityos-poi-glyph"
          style={{
            background: outlined ? spec.color : '#FFFFFF',
            maskImage: `url(${spec.glyph})`,
            WebkitMaskImage: `url(${spec.glyph})`,
          }}
          aria-hidden="true"
        />
      </button>

      {/* 尾针始终用主色：待核实的徽标是白底，白色尾针在浅色底图上会消失，
          指不准位置反而比配色不统一更糟。 */}
      <span className="cityos-poi-tail" style={{ background: spec.color }} aria-hidden="true" />
      {!point.compact && (
        <span className="cityos-poi-label" data-confidence={unverified ? 'unverified' : 'confirmed'}>
          {point.label}
        </span>
      )}
    </div>
  )
}
