/**
 * 阶段 0 的图层定义。与 `src/v3/map/layers.ts` 同一套分工：表达式和常量单独放，
 * 组件只负责挂载和动画。
 *
 * 抽出来还有一个理由：底图样式在「在线矢量瓦片 → 本地快照」之间切换时会被
 * 整个重建，图层要重挂一次。定义写成纯函数，两次挂的东西必然一致。
 *
 * 色值都是临时的，等色板拍板，理由见 `phase0.css` 顶部。
 */
import type { FilterSpecification, LayerSpecification } from 'maplibre-gl'

import { ROAD_CASING_WIDTH, ROAD_TRAFFIC_WIDTH } from '@/v3/map/layers'

export const ROADS_SOURCE = 'p0-roads'
export const BUILDINGS_SOURCE = 'p0-buildings'
export const COVER_SOURCE = 'p0-cover'
export const VOID_SOURCE = 'p0-void'
export const GHOST_SOURCE = 'p0-ghost'

export const LOST_FILL_LAYER = 'p0-buildings-lost-fill'
export const LOST_LINE_LAYER = 'p0-buildings-lost-line'
export const GHOST_LAYER = 'p0-ghost-edge'

/** 圈内建筑：亮。圈外建筑：死灰。收缩时在这两个值之间插值。 */
export const BUILDING_LIT = '#7b93ad'
export const BUILDING_ASH = '#39424f'
export const OUTLINE_LIT = '#d5e2f0'
export const OUTLINE_ASH = '#4a5567'

const COVER_COLOR = '#4d8fd6'
const COVER_BRIGHT = '#8cc4f5'
const LOSS_COLOR = '#e8964a'

/**
 * 按绘制顺序返回全部图层，从下往上。
 *
 * 覆盖圈铺在建筑**下面**——覆盖是光，应该从街道缝隙里透上来，
 * 而不是盖在城市上面的一块半透明色板。
 */
export function probeLayers(lostIds: string[]): LayerSpecification[] {
  const lost = ['in', ['get', 'id'], ['literal', lostIds]] as unknown as FilterSpecification
  const kept = ['!', lost] as unknown as FilterSpecification

  return [
    // 路网只做底纹。路线图 §1.3：除事件与当前选中方案外，其余全部灰阶
    {
      id: 'p0-roads-casing',
      type: 'line',
      source: ROADS_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#05080f', 'line-width': ROAD_CASING_WIDTH, 'line-opacity': 0.9 },
    },
    {
      id: 'p0-roads',
      type: 'line',
      source: ROADS_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#2b3546', 'line-width': ROAD_TRAFFIC_WIDTH, 'line-opacity': 0.95 },
    },

    { id: 'p0-cover-fill', type: 'fill', source: COVER_SOURCE, paint: { 'fill-color': COVER_COLOR, 'fill-opacity': 0.16 } },
    // 空洞压在覆盖之上、建筑之下：光退走，街道先暗下去
    { id: 'p0-void-fill', type: 'fill', source: VOID_SOURCE, paint: { 'fill-color': '#0a0c10', 'fill-opacity': 0.72 } },
    { id: 'p0-void-tint', type: 'fill', source: VOID_SOURCE, paint: { 'fill-color': LOSS_COLOR, 'fill-opacity': 0.09 } },

    {
      id: 'p0-buildings-kept-fill',
      type: 'fill',
      source: BUILDINGS_SOURCE,
      filter: kept,
      paint: { 'fill-color': BUILDING_LIT, 'fill-opacity': 0.9 },
    },
    {
      id: LOST_FILL_LAYER,
      type: 'fill',
      source: BUILDINGS_SOURCE,
      filter: lost,
      paint: { 'fill-color': BUILDING_LIT, 'fill-opacity': 0.9 },
    },
    {
      id: 'p0-buildings-kept-line',
      type: 'line',
      source: BUILDINGS_SOURCE,
      filter: kept,
      paint: { 'line-color': OUTLINE_LIT, 'line-width': 1.05, 'line-opacity': 0.7 },
    },
    {
      id: LOST_LINE_LAYER,
      type: 'line',
      source: BUILDINGS_SOURCE,
      filter: lost,
      paint: { 'line-color': OUTLINE_LIT, 'line-width': 1.05, 'line-opacity': 0.7 },
    },

    // 原覆盖边界留成虚线幽灵环，随收缩淡入。虚线 = 非当前生效状态，
    // 和「待抽调站点的圈用虚线」是同一套形状编码，不靠颜色区分
    {
      id: GHOST_LAYER,
      type: 'line',
      source: GHOST_SOURCE,
      paint: { 'line-color': LOSS_COLOR, 'line-width': 1.6, 'line-dasharray': [3, 2.4], 'line-opacity': 0 },
    },

    // 收缩中的边界压在最上面，全程可见。同一条线叠宽窄两层就有辉光，零依赖
    {
      id: 'p0-cover-glow',
      type: 'line',
      source: COVER_SOURCE,
      paint: { 'line-color': COVER_COLOR, 'line-width': 9, 'line-opacity': 0.25, 'line-blur': 6 },
    },
    {
      id: 'p0-cover-edge',
      type: 'line',
      source: COVER_SOURCE,
      paint: { 'line-color': COVER_BRIGHT, 'line-width': 2, 'line-opacity': 0.95 },
    },
  ]
}
