/**
 * 第 0 层：深色底图。自己写 MapLibre style JSON。
 *
 * 不用高德底图——高德是 GCJ-02，OSM 数据是 WGS-84，混用会错位几百米。
 * 矢量瓦片来自 OpenFreeMap（OpenMapTiles / OSM），坐标系与我们的建筑、路网一致。
 *
 * 这里只画地面：背景、水面、绿地、地名。路网和建筑由第 1–3 层用本地 GeoJSON 画，
 * 不复用 OpenFreeMap 的 transportation / building，避免和荔湾快照叠两套。
 */
import type { StyleSpecification } from 'maplibre-gl'

import { OPENFREEMAP_PLANET } from '@/lib/basemap'

export const DARK_BACKGROUND = '#070b14'

export function createDarkStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'cityos-v3-dark',
    sources: {
      openmaptiles: {
        type: 'vector',
        url: OPENFREEMAP_PLANET,
      },
    },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': DARK_BACKGROUND },
      },
      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['==', ['get', 'class'], 'residential'],
        paint: {
          'fill-color': '#0c121c',
          'fill-opacity': 0.55,
        },
      },
      {
        id: 'landcover-wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'wood'],
        paint: {
          'fill-color': '#0d1a14',
          'fill-opacity': 0.7,
        },
      },
      {
        id: 'landuse-park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['==', ['get', 'class'], 'park'],
        paint: {
          'fill-color': '#102018',
          'fill-opacity': 0.75,
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#0a1c33',
        },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#0a1c33',
          'line-width': 1.2,
        },
      },
      {
        id: 'label-place',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        maxzoom: 16,
        filter: ['match', ['get', 'class'], ['city', 'town', 'suburb', 'neighbourhood'], true, false],
        layout: {
          'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name'], ['get', 'name:en']],
          'text-font': ['Noto Sans Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            11,
            15,
            14,
          ],
          'text-padding': 12,
        },
        paint: {
          'text-color': '#7b8ba3',
          'text-halo-color': 'rgba(7, 11, 20, 0.85)',
          'text-halo-width': 1.2,
        },
      },
    ],
  }
}
