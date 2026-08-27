import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type Map as MapLibreMap } from 'maplibre-gl'

import type { CommandTrafficDragInteraction } from './CommandMapInteractionContext'

export interface CommandTrafficRouteAnnotation {
  routeId: 'A' | 'B' | 'C'
  title: string
  time: string
  status: string
  color: string
  path: Array<[number, number]>
  labelPosition: [number, number]
  active: boolean
}

export interface CommandTrafficUnitMarkerDatum {
  id: string
  label: string
  position: [number, number]
  status: 'waiting' | 'enroute' | 'arrived'
}

const DROP_TOLERANCE_PX = 48

export const CommandTrafficMapMarkers = memo(function CommandTrafficMapMarkers({
  map,
  routes,
  unit,
  interaction,
}: {
  map: MapLibreMap | null
  routes: CommandTrafficRouteAnnotation[]
  unit: CommandTrafficUnitMarkerDatum | null
  interaction: CommandTrafficDragInteraction
}) {
  const styleReady = useMapStyleReady(map)

  if (!map || !styleReady) return null

  return (
    <>
      {routes.map((route) => <RouteAnnotationMarker key={route.routeId} map={map} route={route} />)}
      {unit && (
        <TrafficUnitMarker
          map={map}
          unit={unit}
          targetRoute={routes.find((route) => route.routeId === interaction.targetRouteId) ?? null}
          interaction={interaction}
        />
      )}
    </>
  )
})

function useMapStyleReady(map: MapLibreMap | null) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!map) {
      setReady(false)
      return
    }
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

function RouteAnnotationMarker({ map, route }: { map: MapLibreMap; route: CommandTrafficRouteAnnotation }) {
  const element = useMemo(() => {
    const host = document.createElement('div')
    host.className = 'command-route-label-marker'
    host.style.zIndex = '5'
    return host
  }, [])
  const [lng, lat] = route.labelPosition

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'bottom', offset: [0, -8] })
      .setLngLat([lng, lat])
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [element, lat, lng, map])

  return createPortal(
    <div
      className="command-route-map-label"
      data-route-id={route.routeId}
      data-active={route.active ? 'true' : 'false'}
      style={{ '--route-color': route.color } as CSSProperties}
    >
      <span>{route.routeId}</span>
      <strong>{route.time}</strong>
      <small>{route.status}</small>
    </div>,
    element,
  )
}

function TrafficUnitMarker({
  map,
  unit,
  targetRoute,
  interaction,
}: {
  map: MapLibreMap
  unit: CommandTrafficUnitMarkerDatum
  targetRoute: CommandTrafficRouteAnnotation | null
  interaction: CommandTrafficDragInteraction
}) {
  const element = useMemo(() => {
    const host = document.createElement('div')
    host.className = 'command-traffic-unit-marker'
    host.style.zIndex = '7'
    return host
  }, [])
  const markerRef = useRef<Marker | null>(null)
  const draggingRef = useRef(false)
  const positionRef = useRef(unit.position)
  const targetRouteRef = useRef(targetRoute)
  const interactionRef = useRef(interaction)
  positionRef.current = unit.position
  targetRouteRef.current = targetRoute
  interactionRef.current = interaction

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'center', draggable: interactionRef.current.enabled })
      .setLngLat(positionRef.current)
      .addTo(map)
    markerRef.current = marker
    let restoreDragPan = false

    const updateDropState = () => {
      const route = targetRouteRef.current
      if (!route) {
        element.dataset.validDrop = 'false'
        return null
      }
      const lngLat = marker.getLngLat()
      const snap = nearestRouteSnap(map, [lngLat.lng, lngLat.lat], route.path)
      element.dataset.validDrop = snap.distancePixels <= DROP_TOLERANCE_PX ? 'true' : 'false'
      return snap
    }
    const handleDragStart = () => {
      draggingRef.current = true
      element.dataset.dragging = 'true'
      restoreDragPan = map.dragPan.isEnabled()
      if (restoreDragPan) map.dragPan.disable()
    }
    const handleDrag = () => {
      updateDropState()
    }
    const handleDragEnd = () => {
      const snap = updateDropState()
      draggingRef.current = false
      element.dataset.dragging = 'false'
      if (restoreDragPan) map.dragPan.enable()
      restoreDragPan = false

      if (snap && snap.distancePixels <= DROP_TOLERANCE_PX && interactionRef.current.enabled) {
        marker.setLngLat(snap.position)
        interactionRef.current.onDrop({ routeId: 'C', routeProgress: snap.progress })
      } else {
        marker.setLngLat(positionRef.current)
      }
    }

    marker.on('dragstart', handleDragStart)
    marker.on('drag', handleDrag)
    marker.on('dragend', handleDragEnd)
    return () => {
      marker.off('dragstart', handleDragStart)
      marker.off('drag', handleDrag)
      marker.off('dragend', handleDragEnd)
      if (restoreDragPan) map.dragPan.enable()
      marker.remove()
      markerRef.current = null
    }
  }, [element, map])

  useEffect(() => {
    markerRef.current?.setDraggable(interaction.enabled)
    element.dataset.draggable = interaction.enabled ? 'true' : 'false'
  }, [element, interaction.enabled])

  useEffect(() => {
    if (!draggingRef.current) markerRef.current?.setLngLat(unit.position)
  }, [unit.position])

  const handleKeyboardRouteChange = () => {
    if (!interaction.enabled || !targetRoute) return
    const routeProgress = Math.max(0.3, nearestRouteSnap(map, unit.position, targetRoute.path).progress)
    interaction.onDrop({ routeId: 'C', routeProgress })
  }

  return createPortal(
    <div
      className="command-traffic-unit"
      data-testid="draggable-traffic-unit"
      data-status={unit.status}
      role="button"
      tabIndex={interaction.enabled ? 0 : -1}
      aria-label={`${unit.label}，${interaction.enabled ? '按住拖动到绿色路线 C；键盘按回车可生成同一改线预览' : '当前路线调整预览'}`}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        handleKeyboardRouteChange()
      }}
    >
      <span className="command-traffic-unit-halo" aria-hidden="true" />
      <span className="command-traffic-unit-icon" aria-hidden="true" />
      <span className="command-traffic-unit-label" data-compact={interaction.enabled ? 'false' : 'true'}>
        {interaction.enabled && <strong>{unit.label}</strong>}
        <small>{interaction.enabled ? '拖到绿色 C 路线' : '预览 · 未下发'}</small>
      </span>
    </div>,
    element,
  )
}

function nearestRouteSnap(
  map: MapLibreMap,
  position: [number, number],
  path: Array<[number, number]>,
) {
  if (path.length < 2) return { position, progress: 0, distancePixels: Number.POSITIVE_INFINITY }
  const drop = map.project(position)
  const segmentLengths = path.slice(1).map((point, index) => coordinateDistance(path[index], point))
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
  let best = {
    position: path[0] as [number, number],
    progress: 0,
    distancePixels: Number.POSITIVE_INFINITY,
  }
  let traversed = 0

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index]
    const to = path[index + 1]
    const fromPixel = map.project(from)
    const toPixel = map.project(to)
    const dx = toPixel.x - fromPixel.x
    const dy = toPixel.y - fromPixel.y
    const denominator = dx * dx + dy * dy
    const ratio = denominator <= 0
      ? 0
      : Math.max(0, Math.min(1, ((drop.x - fromPixel.x) * dx + (drop.y - fromPixel.y) * dy) / denominator))
    const x = fromPixel.x + dx * ratio
    const y = fromPixel.y + dy * ratio
    const distancePixels = Math.hypot(drop.x - x, drop.y - y)
    if (distancePixels < best.distancePixels) {
      const segmentLength = segmentLengths[index]
      best = {
        position: [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio],
        progress: totalLength <= 0 ? 0 : (traversed + segmentLength * ratio) / totalLength,
        distancePixels,
      }
    }
    traversed += segmentLengths[index]
  }

  return best
}

function coordinateDistance(from: [number, number], to: [number, number]) {
  const latitude = ((from[1] + to[1]) * Math.PI) / 360
  const x = (to[0] - from[0]) * 111320 * Math.cos(latitude)
  const y = (to[1] - from[1]) * 111320
  return Math.hypot(x, y)
}
