import { useCallback, useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl'
import { TripsLayer } from '@deck.gl/geo-layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'

import '@/lib/maplibreWorker'
import {
  attachBasemapFallback,
  BASEMAP_TIMEOUT_MS,
  createLocalBasemapStyle,
  type BasemapFallbackHandle,
  type BasemapStatus,
} from '@/lib/basemap'

import { createDarkStyle, DARK_BACKGROUND } from './darkStyle'
import {
  BUILDING_HEIGHT,
  BUILDINGS_ESTIMATED_LAYER_ID,
  BUILDINGS_ESTIMATED_OUTLINE_LAYER_ID,
  BUILDINGS_REAL_LAYER_ID,
  BUILDINGS_REAL_OUTLINE_LAYER_ID,
  BUILDINGS_SOURCE_ID,
  ESTIMATED_BUILDING_FILTER,
  REAL_BUILDING_FILTER,
  ROAD_CASING_WIDTH,
  ROAD_TRAFFIC_COLOR,
  ROAD_TRAFFIC_WIDTH,
  ROADS_CASING_LAYER_ID,
  ROADS_SOURCE_ID,
  ROADS_TRAFFIC_LAYER_ID,
} from './layers'
import { withSimulatedCongestion } from './traffic'
import { buildAmbientTrips, TRIP_LOOP_SECONDS, type AmbientTrip } from './trips'

const LIWAN_CENTER: [number, number] = [113.2478, 23.114]
const INITIAL_CAMERA = {
  center: LIWAN_CENTER,
  zoom: 14.55,
  pitch: 58,
  bearing: -32,
} as const
const ORBIT_MIN = -48
const ORBIT_MAX = -16
const ORBIT_STEP = 0.018

const DARK_FALLBACK_STYLE = createLocalBasemapStyle({
  background: DARK_BACKGROUND,
  rasterOpacity: 0.42,
  rasterBrightnessMin: 0,
  rasterBrightnessMax: 0.22,
  rasterSaturation: -0.9,
  rasterContrast: -0.15,
})

export function CityMapV3() {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const overlay = useRef<MapboxOverlay | null>(null)
  const fallback = useRef<BasemapFallbackHandle | null>(null)
  const tripsRef = useRef<AmbientTrip[]>([])
  const timeRef = useRef(0)
  const orbitStopped = useRef(false)
  const drawRef = useRef<() => void>(() => undefined)

  const [ready, setReady] = useState(false)
  const [styleRevision, setStyleRevision] = useState(0)
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roads, setRoads] = useState<GeoJSON.FeatureCollection | null>(null)
  const [buildings, setBuildings] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stats, setStats] = useState({ total: 0, estimated: 0 })

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/data/liwan_roads.geojson').then((response) => {
        if (!response.ok) throw new Error(`liwan_roads.geojson HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      }),
      fetch('/data/liwan_buildings.geojson').then((response) => {
        if (!response.ok) throw new Error(`liwan_buildings.geojson HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      }),
    ])
      .then(([nextRoads, nextBuildings]) => {
        if (!alive) return
        const estimated = nextBuildings.features.filter(
          (feature) => feature.properties?.levels_estimated === true,
        ).length
        setRoads(withSimulatedCongestion(nextRoads))
        setBuildings(nextBuildings)
        setStats({ total: nextBuildings.features.length, estimated })
        tripsRef.current = buildAmbientTrips(nextRoads)
      })
      .catch((error: Error) => {
        if (alive) setLoadError(error.message)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!container.current || map.current) return

    const instance = new MapLibreMap({
      container: container.current,
      style: DARK_FALLBACK_STYLE,
      center: INITIAL_CAMERA.center,
      zoom: INITIAL_CAMERA.zoom,
      pitch: INITIAL_CAMERA.pitch,
      bearing: INITIAL_CAMERA.bearing,
      minZoom: 12.2,
      maxZoom: 18,
      maxPitch: 70,
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
      if (!overlay.current) {
        const nextOverlay = new MapboxOverlay({ interleaved: false, layers: [] })
        instance.addControl(nextOverlay)
        overlay.current = nextOverlay
      }
      setReady(true)
      setStyleRevision((revision) => revision + 1)
    }

    fallback.current = attachBasemapFallback(instance, {
      fallbackStyle: DARK_FALLBACK_STYLE,
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
      instance.remove()
      map.current = null
      overlay.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !roads || !buildings) return

    const beforeId = instance.getLayer('label-place') ? 'label-place' : undefined

    const roadsSource = instance.getSource(ROADS_SOURCE_ID) as GeoJSONSource | undefined
    if (roadsSource) roadsSource.setData(roads)
    else instance.addSource(ROADS_SOURCE_ID, { type: 'geojson', data: roads })

    const buildingsSource = instance.getSource(BUILDINGS_SOURCE_ID) as GeoJSONSource | undefined
    if (buildingsSource) buildingsSource.setData(buildings)
    else instance.addSource(BUILDINGS_SOURCE_ID, { type: 'geojson', data: buildings })

    if (!instance.getLayer(ROADS_CASING_LAYER_ID)) {
      instance.addLayer({
        id: ROADS_CASING_LAYER_ID,
        type: 'line',
        source: ROADS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#05080f',
          'line-width': ROAD_CASING_WIDTH,
          'line-opacity': 0.95,
        },
      }, beforeId)
    }

    if (!instance.getLayer(ROADS_TRAFFIC_LAYER_ID)) {
      instance.addLayer({
        id: ROADS_TRAFFIC_LAYER_ID,
        type: 'line',
        source: ROADS_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD_TRAFFIC_COLOR,
          'line-width': ROAD_TRAFFIC_WIDTH,
          'line-opacity': 0.96,
        },
      }, beforeId)
    }

    if (!instance.getLayer(BUILDINGS_ESTIMATED_LAYER_ID)) {
      instance.addLayer({
        id: BUILDINGS_ESTIMATED_LAYER_ID,
        type: 'fill-extrusion',
        source: BUILDINGS_SOURCE_ID,
        filter: ESTIMATED_BUILDING_FILTER,
        paint: {
          'fill-extrusion-height': BUILDING_HEIGHT,
          'fill-extrusion-base': 0,
          'fill-extrusion-color': '#2a3648',
          'fill-extrusion-opacity': 0.42,
          'fill-extrusion-vertical-gradient': true,
        },
      }, beforeId)
    }

    if (!instance.getLayer(BUILDINGS_REAL_LAYER_ID)) {
      instance.addLayer({
        id: BUILDINGS_REAL_LAYER_ID,
        type: 'fill-extrusion',
        source: BUILDINGS_SOURCE_ID,
        filter: REAL_BUILDING_FILTER,
        paint: {
          'fill-extrusion-height': BUILDING_HEIGHT,
          'fill-extrusion-base': 0,
          'fill-extrusion-color': '#7b93ad',
          'fill-extrusion-opacity': 0.92,
          'fill-extrusion-vertical-gradient': true,
        },
      }, beforeId)
    }

    if (!instance.getLayer(BUILDINGS_ESTIMATED_OUTLINE_LAYER_ID)) {
      instance.addLayer({
        id: BUILDINGS_ESTIMATED_OUTLINE_LAYER_ID,
        type: 'line',
        source: BUILDINGS_SOURCE_ID,
        filter: ESTIMATED_BUILDING_FILTER,
        paint: {
          'line-color': '#8aa0b8',
          'line-width': 1.15,
          'line-dasharray': [2.2, 1.6],
          'line-opacity': 0.9,
        },
      }, beforeId)
    }

    if (!instance.getLayer(BUILDINGS_REAL_OUTLINE_LAYER_ID)) {
      instance.addLayer({
        id: BUILDINGS_REAL_OUTLINE_LAYER_ID,
        type: 'line',
        source: BUILDINGS_SOURCE_ID,
        filter: REAL_BUILDING_FILTER,
        paint: {
          'line-color': '#d5e2f0',
          'line-width': 1.05,
          'line-opacity': 0.72,
        },
      }, beforeId)
    }
  }, [ready, styleRevision, roads, buildings])

  const draw = useCallback(() => {
    const current = overlay.current
    if (!current) return
    current.setProps({
      layers: [
        tripsRef.current.length > 0 &&
          new TripsLayer<AmbientTrip>({
            id: 'ambient-traffic-simulated',
            data: tripsRef.current,
            getPath: (trip) => trip.path,
            getTimestamps: (trip) => trip.timestamps,
            getColor: (trip) => trip.color,
            widthMinPixels: 2.2,
            widthMaxPixels: 4,
            opacity: 0.9,
            trailLength: 9,
            currentTime: timeRef.current,
            fadeTrail: true,
            capRounded: true,
          }),
      ].filter(Boolean),
    })
  }, [])

  useEffect(() => {
    drawRef.current = draw
  }, [draw])

  useEffect(() => {
    if (ready) draw()
  }, [ready, draw, styleRevision, roads])

  useEffect(() => {
    const instance = map.current
    if (!ready || !instance || !roads) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      timeRef.current = 12
      drawRef.current()
      return
    }

    let frame = 0
    let start = performance.now()
    let hiddenAt = 0
    let orbitStartsAt = start + 1600
    let orbitDirection = 1

    const stopOrbitOnUserInput = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) orbitStopped.current = true
    }

    const tick = (now: number) => {
      timeRef.current = ((now - start) / 1000) % TRIP_LOOP_SECONDS

      if (!orbitStopped.current && now >= orbitStartsAt) {
        const nextBearing = instance.getBearing() + ORBIT_STEP * orbitDirection
        if (nextBearing >= ORBIT_MAX) {
          instance.setBearing(ORBIT_MAX)
          orbitDirection = -1
        } else if (nextBearing <= ORBIT_MIN) {
          instance.setBearing(ORBIT_MIN)
          orbitDirection = 1
        } else {
          instance.setBearing(nextBearing)
        }
      }

      drawRef.current()
      frame = window.requestAnimationFrame(tick)
    }

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now()
        window.cancelAnimationFrame(frame)
        frame = 0
      } else if (!frame) {
        const pausedFor = hiddenAt ? performance.now() - hiddenAt : 0
        start += pausedFor
        orbitStartsAt += pausedFor
        hiddenAt = 0
        frame = window.requestAnimationFrame(tick)
      }
    }

    instance.on('dragstart', stopOrbitOnUserInput)
    instance.on('zoomstart', stopOrbitOnUserInput)
    instance.on('rotatestart', stopOrbitOnUserInput)
    instance.on('pitchstart', stopOrbitOnUserInput)
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) frame = window.requestAnimationFrame(tick)

    return () => {
      instance.off('dragstart', stopOrbitOnUserInput)
      instance.off('zoomstart', stopOrbitOnUserInput)
      instance.off('rotatestart', stopOrbitOnUserInput)
      instance.off('pitchstart', stopOrbitOnUserInput)
      document.removeEventListener('visibilitychange', onVisibility)
      window.cancelAnimationFrame(frame)
    }
  }, [ready, roads])

  const estimatedRatio = stats.total === 0 ? 0 : Math.round((stats.estimated / stats.total) * 100)

  return (
    <div className="relative h-svh w-svw overflow-hidden bg-[#070b14]">
      <div
        ref={container}
        className="isolate h-full w-full"
        aria-label="荔湾深色三维城市地图"
      />

      {basemapStatus === 'loading' && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg border border-[rgba(148,163,184,0.22)] bg-[#101827]/90 px-3 py-1.5 text-[11px] text-[#93a0b5]">
          正在加载在线矢量底图 · 最长等待 {BASEMAP_TIMEOUT_MS / 1000} 秒
        </div>
      )}

      {basemapStatus === 'fallback' && (
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[rgba(148,163,184,0.22)] bg-[#101827]/90 px-3 py-1.5 text-[11px] text-[#93a0b5]">
          <span>在线底图未载入 · 当前为本地 OSM 快照（已压暗）</span>
          <button
            type="button"
            onClick={() => fallback.current?.reload()}
            className="h-6 rounded-md bg-[#1d4ed8]/30 px-2 font-semibold text-[#93c5fd] hover:bg-[#1d4ed8]/45"
          >
            重新加载
          </button>
        </div>
      )}

      {loadError && (
        <div className="absolute left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[rgba(240,74,62,0.35)] bg-[#101827] p-4 text-center">
          <div className="text-sm font-semibold text-[#f04a3e]">地图数据加载失败</div>
          <p className="mt-2 text-xs leading-relaxed text-[#93a0b5]">{loadError}</p>
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 max-w-[280px] rounded-xl border border-[rgba(148,163,184,0.22)] bg-[#101827]/88 px-3 py-2.5 backdrop-blur">
        <div className="text-[11px] font-semibold tracking-wide text-[#e8eef8]">广州 · 荔湾</div>
        <div className="mt-0.5 text-[10px] text-[#93a0b5]">CityOS v3 · D1 地图底座</div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#64748b]">
          底图、路网、建筑轮廓来自 OSM 公开数据。路况与车流为模拟，层数估算单独标注。
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-[rgba(148,163,184,0.22)] bg-[#101827]/88 px-3 py-2.5 text-[10px] backdrop-blur">
        <div className="mb-1.5 text-[11px] font-semibold text-[#e8eef8]">数据口径</div>
        <LegendRow
          shape="solid-fill"
          label={`建筑层数公开 ${stats.total - stats.estimated} 栋`}
          note="OSM 标注"
        />
        <LegendRow
          shape="dashed"
          label={`层数估算 ${stats.estimated} 栋（${estimatedRatio}%）`}
          note="按轮廓推算，高度仍 = 层数 × 3m"
        />
        <LegendRow shape="hollow" label="路况四档着色" note="模拟 · 非实时路况" />
        <LegendRow shape="hollow" label="环境车流光带" note="模拟 · 沿 OSM 路网生成" />
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 w-[168px] rounded-xl border border-[rgba(148,163,184,0.22)] bg-[#101827]/88 px-3 py-2.5 text-[10px] backdrop-blur">
        <div className="mb-1.5 text-[11px] font-semibold text-[#e8eef8]">图例</div>
        <TrafficSwatch color="#1EC97A" label="畅通" />
        <TrafficSwatch color="#F5C518" label="缓行" />
        <TrafficSwatch color="#F04A3E" label="拥堵" />
        <TrafficSwatch color="#9B1B2E" label="严重拥堵" />
        <div className="mt-1.5 border-t border-[rgba(148,163,184,0.18)] pt-1.5 text-[#64748b]">
          主干道粗、支路细 · 车灯为装饰
        </div>
      </div>
    </div>
  )
}

function LegendRow({
  shape,
  label,
  note,
}: {
  shape: 'solid-fill' | 'dashed' | 'hollow'
  label: string
  note: string
}) {
  const mark =
    shape === 'solid-fill'
      ? 'border border-[#7b93ad] bg-[#7b93ad]'
      : shape === 'dashed'
        ? 'border border-dashed border-[#8aa0b8] bg-transparent'
        : 'border border-[#93a0b5] bg-transparent'

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className={`mt-0.5 size-2 shrink-0 rounded-[2px] ${mark}`} aria-hidden="true" />
      <div>
        <div className="text-[#e8eef8]">{label}</div>
        <div className="text-[#64748b]">{note}</div>
      </div>
    </div>
  )
}

function TrafficSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5 text-[#93a0b5]">
      <span className="h-[3px] w-5 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </div>
  )
}
