/**
 * 阶段 0 · 验证核心视觉。访问 `#/phase0`。
 *
 * 路线图（`docs/调度台改造路线图.md` 阶段 0）要求的最小实现：
 * 地图上一个消防站、一个覆盖圈、一个按钮。点一下，圈用约 0.5 秒收回去，
 * 露出空洞，空洞里的建筑轮廓变灰。
 *
 * **做完只回答一个问题：那半秒有没有力量。** 没有就停下重想，不要往下做阶段 1。
 * 所以这一页刻意不接真实调度状态、不算路径、不进主导航——它是一次性的验证器，
 * 结论出来之后要么升级、要么整个目录删掉。
 *
 * 三个刻意的取舍：
 *
 * 1. **平面视角，建筑不挤出。** 要验证的是收缩动作本身，倾斜和体块会引入无关
 *    变量；而且不挤出就不主张层数，绕开了估算层数必须做形状编码那条硬约定。
 *    路线图给的视觉参考本来就是空管雷达和 HUD，那些都是平面。
 * 2. **圆就是圆。** 阶段 3 换成真等时圈时，「不规则形状一眼真」才是那一步的
 *    收益，阶段 0 先画个不规则的血包会把它提前花掉，还不诚实。
 * 3. **收缩时长可调（0.3 / 0.5 / 0.9 秒）。** 路线图写的是「约 0.5 秒」，
 *    到底多少要看着定。这是验证仪器的一部分，不是功能。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import '@/lib/maplibreWorker'
import {
  attachBasemapFallback,
  createLocalBasemapStyle,
  type BasemapFallbackHandle,
  type BasemapStatus,
} from '@/lib/basemap'
import type { LngLat } from '@/engine/types'
import { createDarkStyle, DARK_BACKGROUND } from '@/v3/map/darkStyle'

import {
  annulusAreaKm2,
  annulusPolygon,
  buildingIdsInAnnulus,
  circleRing,
  clamp01,
  easeInOutQuad,
  easeOutCubic,
  lerp,
  mixHex,
  ringToPolygon,
} from './coverage'
import {
  BUILDING_ASH,
  BUILDING_LIT,
  BUILDINGS_SOURCE,
  COVER_SOURCE,
  GHOST_LAYER,
  GHOST_SOURCE,
  LOST_FILL_LAYER,
  LOST_LINE_LAYER,
  OUTLINE_ASH,
  OUTLINE_LIT,
  probeLayers,
  ROADS_SOURCE,
  VOID_SOURCE,
} from './layers'
import './phase0.css'

/**
 * 站点位置取自 OSM 公开数据（`public/data/liwan_resources.geojson`），
 * 该点在 OSM 里没有名称字段，界面上不编一个。
 */
const STATION: LngLat = [113.24491, 23.10979]
const STATION_LABEL = '荔湾 · 消防站'

/** 两个圈都是硬编码示意值，不是求解结果。阶段 3 换成真等时圈。 */
const RADIUS_FULL_M = 1150
const RADIUS_REDUCED_M = 760

const DURATIONS_MS = [300, 500, 900] as const
const DEFAULT_DURATION_MS = 500
/** 建筑掉色比收缩晚一拍起步。先看见圈退走，再看见后果，才读得出因果。 */
const DRAIN_DELAY = 0.15

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

const FALLBACK_STYLE = createLocalBasemapStyle({
  background: DARK_BACKGROUND,
  rasterOpacity: 0.4,
  rasterBrightnessMin: 0,
  rasterBrightnessMax: 0.2,
  rasterSaturation: -0.9,
  rasterContrast: -0.15,
})

type Phase = 'covered' | 'withdrawing' | 'withdrawn' | 'restoring'

export function CoverageProbe() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const fallback = useRef<BasemapFallbackHandle | null>(null)
  const marker = useRef<Marker | null>(null)
  const markerEl = useRef<HTMLButtonElement | null>(null)

  const [ready, setReady] = useState(false)
  const [styleRevision, setStyleRevision] = useState(0)
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roads, setRoads] = useState<GeoJSON.FeatureCollection | null>(null)
  const [buildings, setBuildings] = useState<GeoJSON.FeatureCollection | null>(null)
  const [lostIds, setLostIds] = useState<string[]>([])

  const [phase, setPhase] = useState<Phase>('covered')
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_DURATION_MS)
  const [lostShown, setLostShown] = useState(0)

  /** 当前收缩进度，0 = 满覆盖，1 = 已抽调。动画和样式重建都读它。 */
  const progress = useRef(0)
  const frame = useRef(0)

  const fullRing = useMemo(() => circleRing(STATION, RADIUS_FULL_M), [])
  const lostAreaKm2 = useMemo(() => annulusAreaKm2(RADIUS_REDUCED_M, RADIUS_FULL_M), [])

  // ── 数据 ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    const load = (path: string) =>
      fetch(path).then((response) => {
        if (!response.ok) throw new Error(`${path} HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      })

    Promise.all([load('/data/liwan_roads.geojson'), load('/data/liwan_buildings.geojson')])
      .then(([nextRoads, nextBuildings]) => {
        if (!alive) return
        setRoads(nextRoads)
        setBuildings(nextBuildings)
        setLostIds(
          buildingIdsInAnnulus(nextBuildings, STATION, RADIUS_REDUCED_M, RADIUS_FULL_M),
        )
      })
      .catch((error: Error) => {
        if (alive) setLoadError(error.message)
      })

    return () => {
      alive = false
    }
  }, [])

  // ── 地图实例 ──────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current || map.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: FALLBACK_STYLE,
      center: STATION,
      zoom: 13.6,
      pitch: 0,
      bearing: 0,
      minZoom: 11,
      maxZoom: 17,
      canvasContextAttributes: { antialias: true },
      attributionControl: false,
    })
    map.current = instance

    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => instance.resize())
    })
    resizeObserver.observe(container.current)

    const onStyleLoad = () => {
      setReady(true)
      setStyleRevision((revision) => revision + 1)
    }

    fallback.current = attachBasemapFallback(instance, {
      fallbackStyle: FALLBACK_STYLE,
      loadOnlineStyle: () => Promise.resolve(createDarkStyle()),
      onStatus: setBasemapStatus,
    })
    instance.on('style.load', onStyleLoad)

    return () => {
      fallback.current?.dispose()
      fallback.current = null
      instance.off('style.load', onStyleLoad)
      resizeObserver.disconnect()
      window.cancelAnimationFrame(resizeFrame)
      marker.current?.remove()
      marker.current = null
      instance.remove()
      map.current = null
      setReady(false)
    }
  }, [])

  /**
   * 把当前进度写到地图上。动画每帧调它，底图样式换掉后重建图层也调它，
   * 这样在线瓦片载入触发的 setStyle 不会把画面弹回满覆盖。
   */
  const paint = useCallback(() => {
    const instance = map.current
    if (!instance || !instance.isStyleLoaded()) return

    const t = progress.current
    const radius = lerp(RADIUS_FULL_M, RADIUS_REDUCED_M, easeOutCubic(t))
    const ring = circleRing(STATION, radius)

    const cover = instance.getSource(COVER_SOURCE) as GeoJSONSource | undefined
    cover?.setData(ringToPolygon(ring))

    const hole = instance.getSource(VOID_SOURCE) as GeoJSONSource | undefined
    hole?.setData(t <= 0 ? EMPTY : annulusPolygon(fullRing, ring))

    if (instance.getLayer(GHOST_LAYER)) {
      instance.setPaintProperty(GHOST_LAYER, 'line-opacity', 0.75 * t)
    }

    const drain = easeInOutQuad(clamp01((t - DRAIN_DELAY) / (1 - DRAIN_DELAY)))
    if (instance.getLayer(LOST_FILL_LAYER)) {
      instance.setPaintProperty(LOST_FILL_LAYER, 'fill-color', mixHex(BUILDING_LIT, BUILDING_ASH, drain))
    }
    if (instance.getLayer(LOST_LINE_LAYER)) {
      instance.setPaintProperty(LOST_LINE_LAYER, 'line-color', mixHex(OUTLINE_LIT, OUTLINE_ASH, drain))
    }
    setLostShown(Math.round(lostIds.length * drain))
  }, [fullRing, lostIds.length])

  // ── 图层。样式每次重建都要重挂 ────────────────────────────────
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !roads || !buildings) return
    // `ready` 只说明**曾经**有样式载入完。底图在「在线矢量瓦片 ↔ 本地快照」之间
    // 切换时会整个重建，这中间 addSource 会抛 "Style is not done loading."
    // 直接跳过是安全的：切完必然再触发一次 style.load，styleRevision 变了会重跑本 effect。
    if (!instance.isStyleLoaded()) return

    // 地名压在最上面。回退到本地快照时没有这一层，beforeId 给 undefined
    const beforeId = instance.getLayer('label-place') ? 'label-place' : undefined
    const addSource = (id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature) => {
      const existing = instance.getSource(id) as GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else instance.addSource(id, { type: 'geojson', data })
    }

    addSource(ROADS_SOURCE, roads)
    addSource(BUILDINGS_SOURCE, buildings)
    addSource(COVER_SOURCE, ringToPolygon(fullRing))
    addSource(VOID_SOURCE, EMPTY)
    addSource(GHOST_SOURCE, {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: fullRing },
    })

    // lostIds 是异步算出来的，图层可能先于它挂上：已存在就补写过滤器
    for (const layer of probeLayers(lostIds)) {
      if (instance.getLayer(layer.id)) {
        if ('filter' in layer && layer.filter) instance.setFilter(layer.id, layer.filter)
        continue
      }
      instance.addLayer(layer, beforeId)
    }

    paint()
  }, [ready, styleRevision, roads, buildings, lostIds, fullRing, paint])

  // ── 站点标记 ──────────────────────────────────────────────────
  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || marker.current) return

    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'p0-station'
    element.innerHTML =
      '<span class="p0-station-dot" aria-hidden="true"></span><span class="p0-station-name"></span>'
    markerEl.current = element

    marker.current = new Marker({ element, anchor: 'left' }).setLngLat(STATION).addTo(instance)

    return () => {
      marker.current?.remove()
      marker.current = null
      markerEl.current = null
    }
  }, [ready])

  const withdrawn = phase === 'withdrawn' || phase === 'withdrawing'

  // 依赖里必须带 ready：标记是地图就绪后才建出来的，只盯 withdrawn 的话
  // 首次挂载时元素还不存在，之后又因为 withdrawn 没变而不会补写，标签会一直空着
  useEffect(() => {
    const element = markerEl.current
    if (!element) return
    element.classList.toggle('is-withdrawn', withdrawn)
    const name = element.querySelector('.p0-station-name')
    if (name) name.textContent = withdrawn ? `${STATION_LABEL} · 已抽调 1 车` : `${STATION_LABEL} · 在岗`
    element.setAttribute('aria-label', withdrawn ? '恢复该站力量' : '抽调该站 1 车')
  }, [withdrawn, ready])

  // ── 动画 ─────────────────────────────────────────────────────
  const run = useCallback(
    (to: 0 | 1) => {
      window.cancelAnimationFrame(frame.current)
      const from = progress.current
      if (from === to) return

      setPhase(to === 1 ? 'withdrawing' : 'restoring')

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        progress.current = to
        paint()
        setPhase(to === 1 ? 'withdrawn' : 'covered')
        return
      }

      const start = performance.now()
      // 从中途反向时按剩余距离缩短，避免走完整段时长显得拖沓
      const span = durationMs * Math.abs(to - from)
      const tick = (now: number) => {
        const p = span <= 0 ? 1 : clamp01((now - start) / span)
        progress.current = lerp(from, to, p)
        paint()
        if (p < 1) {
          frame.current = window.requestAnimationFrame(tick)
          return
        }
        progress.current = to
        paint()
        setPhase(to === 1 ? 'withdrawn' : 'covered')
      }
      frame.current = window.requestAnimationFrame(tick)
    },
    [durationMs, paint],
  )

  // 按意图切，不按当前进度切。收缩到一半再点一下，应当立刻往回走；
  // 用 progress 判断的话，前半程点下去会被判成「继续收缩」，看起来像没反应
  const toggle = useCallback(() => {
    run(withdrawn ? 0 : 1)
  }, [run, withdrawn])

  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  // 站点标记也能点。「随便点不翻车」——没有唯一正确的操作入口
  useEffect(() => {
    const element = markerEl.current
    if (!element) return
    element.addEventListener('click', toggle)
    return () => element.removeEventListener('click', toggle)
  }, [toggle, ready])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['BUTTON', 'INPUT', 'TEXTAREA'].includes(target.tagName)) return
      if (event.key === 'r' || event.key === 'R') {
        progress.current = 0
        paint()
        setPhase('covered')
        window.requestAnimationFrame(() => run(1))
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paint, run, toggle])

  const areaShown = (lostAreaKm2 * (lostIds.length === 0 ? 0 : lostShown / lostIds.length)).toFixed(2)

  return (
    <div className="p0-root">
      <div ref={container} className="p0-map" aria-label="荔湾覆盖收缩验证地图" />

      <div className="p0-panel p0-provenance">
        <span>
          <b>实测</b> 底图 · 路网 · 建筑轮廓 · 站点位置（OSM 公开数据）
        </span>
        <span className="p0-sep" aria-hidden="true" />
        <span>
          <b>硬编码</b> 两个覆盖圈是示意值，不是算出来的
        </span>
        <span className="p0-sep" aria-hidden="true" />
        <span>
          <b>真数的</b> 空洞里的建筑栋数按 OSM 轮廓逐栋判定
        </span>
      </div>

      <div className="p0-panel p0-question">
        <h1>阶段 0 · 验证核心视觉</h1>
        <p>
          要回答的只有一个问题：覆盖圈收回去那半秒，有没有力量。
          <br />
          按 <kbd>R</kbd> 重放，<kbd>空格</kbd> 切换。
        </p>
      </div>

      <div className="p0-panel p0-controls">
        <button
          type="button"
          className={`p0-action ${withdrawn ? 'is-restore' : ''}`}
          onClick={toggle}
        >
          {withdrawn ? '恢复该站力量' : '抽调 1 车 · 支援龙城市场'}
        </button>
        <p className="p0-action-hint">
          {withdrawn ? '圈已收缩，虚线是原覆盖边界' : '点击后覆盖圈收缩，露出空洞'}
        </p>
        <div className="p0-duration">
          <div className="p0-duration-label">收缩时长</div>
          <div className="p0-duration-row">
            {DURATIONS_MS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={durationMs === value}
                onClick={() => setDurationMs(value)}
              >
                {(value / 1000).toFixed(1)} s
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p0-panel p0-readout">
        <div className="p0-readout-label">失去覆盖的建筑</div>
        <div className={`p0-readout-value ${lostShown === 0 ? 'is-idle' : ''}`}>
          <strong>{lostShown}</strong>
          <span>栋</span>
        </div>
        <div className="p0-readout-sub">
          覆盖面积 −{areaShown} km²
          <br />
          有效半径 {RADIUS_FULL_M} m → {RADIUS_REDUCED_M} m
        </div>
      </div>

      <div className="p0-panel p0-legend">
        <h2>图例</h2>
        <div className="p0-legend-row">
          <span className="p0-swatch is-cover" aria-hidden="true" />
          覆盖中
        </div>
        <div className="p0-legend-row">
          <span className="p0-swatch is-void" aria-hidden="true" />
          已失去覆盖
        </div>
        <div className="p0-legend-row">
          <span className="p0-swatch is-lit" aria-hidden="true" />
          圈内建筑
        </div>
        <div className="p0-legend-row">
          <span className="p0-swatch is-ash" aria-hidden="true" />
          已脱出圈外
        </div>
      </div>

      {loadError && (
        <div className="p0-panel p0-status is-error">地图数据加载失败：{loadError}</div>
      )}
      {!loadError && basemapStatus === 'loading' && (
        <div className="p0-panel p0-status">正在加载在线矢量底图</div>
      )}
      {!loadError && basemapStatus === 'fallback' && (
        <div className="p0-panel p0-status">在线底图未载入 · 当前为本地 OSM 快照</div>
      )}
    </div>
  )
}

export default CoverageProbe
