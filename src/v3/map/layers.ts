/**
 * 第 1 / 3 层的 MapLibre 表达式。路网分级按 OSM highway，建筑高度 = levels × 3。
 *
 * 估算层数必须能和真实层数从形状上分开：实心描边 vs 虚线描边，不能只靠颜色。
 */
import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
} from 'maplibre-gl'

import { CONGESTION_COLORS } from './traffic'

export const ROADS_SOURCE_ID = 'v3-roads'
export const BUILDINGS_SOURCE_ID = 'v3-buildings'

export const ROADS_CASING_LAYER_ID = 'v3-roads-casing'
export const ROADS_TRAFFIC_LAYER_ID = 'v3-roads-traffic'
export const BUILDINGS_REAL_LAYER_ID = 'v3-buildings-real'
export const BUILDINGS_ESTIMATED_LAYER_ID = 'v3-buildings-estimated'
export const BUILDINGS_REAL_OUTLINE_LAYER_ID = 'v3-buildings-real-outline'
export const BUILDINGS_ESTIMATED_OUTLINE_LAYER_ID = 'v3-buildings-estimated-outline'

export const REAL_BUILDING_FILTER: FilterSpecification = ['!=', ['get', 'levels_estimated'], true]
export const ESTIMATED_BUILDING_FILTER: FilterSpecification = ['==', ['get', 'levels_estimated'], true]

/** 高度 = 层数 × 3 米。0 层按数据原样挤出，不补假层数。 */
export const BUILDING_HEIGHT: DataDrivenPropertyValueSpecification<number> = [
  '*',
  ['coalesce', ['get', 'levels'], 0],
  3,
]

const HIGHWAY_WIDTH = (
  motorway: number,
  trunk: number,
  primary: number,
  secondary: number,
  tertiary: number,
  local: number,
  service: number,
): ExpressionSpecification => [
  'match',
  ['get', 'highway'],
  ['motorway', 'motorway_link'],
  motorway,
  ['trunk', 'trunk_link'],
  trunk,
  ['primary', 'primary_link'],
  primary,
  ['secondary', 'secondary_link'],
  secondary,
  ['tertiary', 'tertiary_link'],
  tertiary,
  ['residential', 'unclassified', 'living_street'],
  local,
  service,
]

export const ROAD_CASING_WIDTH: DataDrivenPropertyValueSpecification<number> = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12,
  HIGHWAY_WIDTH(2.6, 2.3, 2, 1.6, 1.3, 0.9, 0.6),
  15,
  HIGHWAY_WIDTH(9.5, 8.2, 6.8, 5.2, 4, 2.6, 1.6),
  17,
  HIGHWAY_WIDTH(16, 14, 11.5, 8.5, 6.4, 4.2, 2.6),
]

export const ROAD_TRAFFIC_WIDTH: DataDrivenPropertyValueSpecification<number> = [
  'interpolate',
  ['linear'],
  ['zoom'],
  12,
  HIGHWAY_WIDTH(1.8, 1.6, 1.4, 1.1, 0.9, 0.55, 0.35),
  15,
  HIGHWAY_WIDTH(7.2, 6.2, 5.1, 3.8, 2.8, 1.7, 1),
  17,
  HIGHWAY_WIDTH(13, 11.2, 9, 6.6, 4.8, 2.8, 1.7),
]

export const ROAD_TRAFFIC_COLOR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'congestion'],
  0,
  CONGESTION_COLORS[0],
  1,
  CONGESTION_COLORS[1],
  2,
  CONGESTION_COLORS[2],
  3,
  CONGESTION_COLORS[3],
  CONGESTION_COLORS[0],
]
