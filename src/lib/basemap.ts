/**
 * 离线底图回退。8 秒内在线矢量瓦片没真正画出来，就切到本地 PNG。
 *
 * 这是「断网不灰屏」红线的实现。行为与 CityMap 里那套一致，抽出来给 v3 复用。
 * 旧 CityMap 暂时仍走自己的副本（D5 再并），避免改 src/components。
 */
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

export const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron'
export const OPENFREEMAP_PLANET = 'https://tiles.openfreemap.org/planet'
export const BASEMAP_TIMEOUT_MS = 8000
/** 在线样式已加载、但瓦片连续报错这么多次后退回本地底图 */
export const ONLINE_TILE_ERROR_LIMIT = 4
export const LOCAL_BASEMAP = '/data/liwan_haizhu_basemap.png'
export const LOCAL_BASEMAP_BOUNDS = {
  west: 113.21419102368037,
  south: 23.078126269065322,
  east: 113.28716050239234,
  north: 23.122872031353282,
} as const

export const OPENFREEMAP_NULL_FILTER_LAYERS = new Set([
  'road_shield_us',
  'highway-shield-us-interstate',
  'highway-shield-non-us',
])

export type BasemapStatus = 'loading' | 'online' | 'fallback'

export interface LocalBasemapPaint {
  background: string
  rasterOpacity?: number
  rasterBrightnessMin?: number
  rasterBrightnessMax?: number
  rasterSaturation?: number
  rasterContrast?: number
}

export function createLocalBasemapStyle(paint: LocalBasemapPaint): StyleSpecification {
  return {
    version: 8,
    sources: {
      'local-basemap': {
        type: 'image',
        url: LOCAL_BASEMAP,
        coordinates: [
          [LOCAL_BASEMAP_BOUNDS.west, LOCAL_BASEMAP_BOUNDS.north],
          [LOCAL_BASEMAP_BOUNDS.east, LOCAL_BASEMAP_BOUNDS.north],
          [LOCAL_BASEMAP_BOUNDS.east, LOCAL_BASEMAP_BOUNDS.south],
          [LOCAL_BASEMAP_BOUNDS.west, LOCAL_BASEMAP_BOUNDS.south],
        ],
      },
    },
    layers: [
      {
        id: 'fallback-background',
        type: 'background',
        paint: { 'background-color': paint.background },
      },
      {
        id: 'local-basemap-raster',
        type: 'raster',
        source: 'local-basemap',
        paint: {
          'raster-opacity': paint.rasterOpacity ?? 1,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
          ...(paint.rasterBrightnessMin !== undefined
            ? { 'raster-brightness-min': paint.rasterBrightnessMin }
            : {}),
          ...(paint.rasterBrightnessMax !== undefined
            ? { 'raster-brightness-max': paint.rasterBrightnessMax }
            : {}),
          ...(paint.rasterSaturation !== undefined
            ? { 'raster-saturation': paint.rasterSaturation }
            : {}),
          ...(paint.rasterContrast !== undefined
            ? { 'raster-contrast': paint.rasterContrast }
            : {}),
        },
      },
    ],
  }
}

/** 旧浅色看板用的本地底图样式。抽出来避免两套坐标写散。 */
export const LIGHT_FALLBACK_STYLE: StyleSpecification = createLocalBasemapStyle({
  background: '#EEF1F5',
})

/**
 * OpenFreeMap Positron 的盾牌图层在非道路要素上 `ref_length` 可能为 null。
 * 显式 coalesce，避免 MapLibre 6 控制台告警。v3 自定义 style 不走这些图层。
 */
export function normalizeOpenFreeMapStyle(style: StyleSpecification) {
  for (const layer of style.layers) {
    if (!OPENFREEMAP_NULL_FILTER_LAYERS.has(layer.id) || !('filter' in layer)) continue
    const filter = layer.filter as unknown[] | undefined
    if (filter?.[0] === 'all') {
      filter[1] = ['<=', ['coalesce', ['get', 'ref_length'], 99], 6]
    }
  }
  return style
}

export interface BasemapFallbackOptions {
  fallbackStyle: StyleSpecification
  loadOnlineStyle: (signal: AbortSignal) => Promise<StyleSpecification>
  onStatus: (status: BasemapStatus) => void
  /** 用来判定在线矢量瓦片是否真的挂上了。OpenFreeMap / 自定义 style 都是 openmaptiles */
  onlineSourceId?: string
  timeoutMs?: number
  tileErrorLimit?: number
}

export interface BasemapFallbackHandle {
  reload: () => void
  dispose: () => void
}

/**
 * 挂到已创建的 MapLibre 实例上。地图应先以 fallbackStyle 启动，
 * 再尝试在线 style；style JSON 回来不等于瓦片画出来。
 *
 * 只有 idle 且当前瓦片全部加载后，才把在线底图判为成功。
 * 这是生产环境灰板的根因：style.load 过早，TileManager 仍暂停。
 */
export function attachBasemapFallback(
  instance: MapLibreMap,
  options: BasemapFallbackOptions,
): BasemapFallbackHandle {
  const timeoutMs = options.timeoutMs ?? BASEMAP_TIMEOUT_MS
  const tileErrorLimit = options.tileErrorLimit ?? ONLINE_TILE_ERROR_LIMIT
  const onlineSourceId = options.onlineSourceId ?? 'openmaptiles'

  let disposed = false
  let attempt = 0
  let onlineAbort: AbortController | null = null
  let onlineTimer: number | null = null
  let onlineStyleApplied = false
  let onlineStyleLoaded = false
  let onlineTileErrors = 0

  const setStatus = (status: BasemapStatus) => {
    if (!disposed) options.onStatus(status)
  }

  const clearOnlineTimer = () => {
    if (onlineTimer !== null) window.clearTimeout(onlineTimer)
    onlineTimer = null
  }

  const applyFallback = (currentAttempt: number) => {
    if (currentAttempt !== attempt || onlineStyleLoaded) return
    clearOnlineTimer()
    onlineAbort?.abort()
    onlineAbort = null
    setStatus('fallback')
    if (onlineStyleApplied) {
      onlineStyleApplied = false
      // MapLibre 6 的生产构建在 image → vector 差量切换时，可能把新旧
      // TileManager 留在 paused 状态。完整重建样式，避免灰板与零瓦片请求。
      instance.setStyle(options.fallbackStyle, { diff: false })
    }
  }

  const startOnlineLoad = () => {
    const currentAttempt = attempt + 1
    attempt = currentAttempt
    onlineStyleApplied = false
    onlineStyleLoaded = false
    onlineTileErrors = 0
    onlineAbort?.abort()
    clearOnlineTimer()
    setStatus('loading')

    const controller = new AbortController()
    onlineAbort = controller
    onlineTimer = window.setTimeout(() => applyFallback(currentAttempt), timeoutMs)

    void options
      .loadOnlineStyle(controller.signal)
      .then((style) => {
        if (currentAttempt !== attempt || controller.signal.aborted) return
        onlineStyleApplied = true
        instance.setStyle(style, { diff: false })
      })
      .catch(() => applyFallback(currentAttempt))
  }

  // style.load 只代表样式 JSON、sprite 与 source metadata 已挂载，不代表
  // 任何矢量瓦片真正画出来。只有地图进入 idle 且当前瓦片全部加载后，
  // 才把在线底图判为成功。
  const onMapIdle = () => {
    if (!onlineStyleApplied || onlineStyleLoaded) return
    if (!instance.getSource(onlineSourceId) || !instance.isStyleLoaded() || !instance.areTilesLoaded()) return
    onlineStyleLoaded = true
    clearOnlineTimer()
    onlineAbort = null
    setStatus('online')
  }

  const fallbackAfterLoad = () => {
    if (!onlineStyleLoaded) return
    onlineStyleLoaded = false
    onlineStyleApplied = false
    onlineTileErrors = 0
    setStatus('fallback')
    instance.setStyle(options.fallbackStyle, { diff: false })
  }

  const onMapError = () => {
    if (onlineStyleApplied && !onlineStyleLoaded) {
      applyFallback(attempt)
      return
    }
    if (onlineStyleLoaded) {
      onlineTileErrors += 1
      if (onlineTileErrors >= tileErrorLimit) fallbackAfterLoad()
    }
  }

  instance.on('idle', onMapIdle)
  instance.on('error', onMapError)
  startOnlineLoad()

  return {
    reload: startOnlineLoad,
    dispose: () => {
      disposed = true
      attempt += 1
      onlineAbort?.abort()
      onlineAbort = null
      clearOnlineTimer()
      instance.off('idle', onMapIdle)
      instance.off('error', onMapError)
    },
  }
}
