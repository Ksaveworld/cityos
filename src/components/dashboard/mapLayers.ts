export type MapLayerId = 'weather' | 'traffic' | 'routes' | 'cameras'

export type MapLayerVisibility = Record<MapLayerId, boolean>

export const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  // 气象默认关。全幅雨幕盖在底图上会干扰读图，默认开是反直觉的；
  // 要讲「天气影响 ETA」时再用左栏「气象影响」开关打开。
  weather: false,
  traffic: true,
  routes: true,
  cameras: false,
}
