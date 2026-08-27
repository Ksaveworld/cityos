import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Marker, type Map as MapLibreMap } from 'maplibre-gl'

import type {
  CommandMedicalDragInteraction,
  CommandTrafficDragInteraction,
} from './CommandMapInteractionContext'

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

export type CommandMedicalUnitMarkerDatum = CommandTrafficUnitMarkerDatum

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

export const CommandMedicalMapMarker = memo(function CommandMedicalMapMarker({
  map,
  targetPath,
  unit,
  interaction,
}: {
  map: MapLibreMap | null
  targetPath: Array<[number, number]> | null
  unit: CommandMedicalUnitMarkerDatum | null
  interaction: CommandMedicalDragInteraction
}) {
  const styleReady = useMapStyleReady(map)

  if (!map || !styleReady || !unit) return null
  const targetLabel = interaction.targetFacilityId === 'facility-red-cross'
    ? '红十字会医院'
    : '市一医院'

  return (
    <>
      {targetPath && (
        <MedicalRouteTargetMarker
          map={map}
          path={targetPath}
          facilityId={interaction.targetFacilityId}
          label={`${targetLabel}候选路线`}
        />
      )}
      <DraggableUnitMarker
        map={map}
        unit={unit}
        targetPath={targetPath}
        enabled={interaction.enabled}
        kind="medical"
        testId="draggable-medical-unit"
        dragHint={`拖到${targetLabel}路线`}
        compactHint="预览 · 未下发"
        keyboardInstruction={`按住拖动到${targetLabel}路线；键盘按回车可生成同一换院预览`}
        onDrop={(routeProgress) => interaction.onDrop({
          facilityId: interaction.targetFacilityId,
          routeProgress,
        })}
      />
    </>
  )
})

function MedicalRouteTargetMarker({
  map,
  path,
  facilityId,
  label,
}: {
  map: MapLibreMap
  path: Array<[number, number]>
  facilityId: CommandMedicalDragInteraction['targetFacilityId']
  label: string
}) {
  const element = useMemo(() => {
    const host = document.createElement('div')
    host.className = 'command-medical-route-target-marker'
    host.style.zIndex = '6'
    return host
  }, [])
  const position = path[Math.max(0, Math.min(path.length - 1, Math.round((path.length - 1) * 0.28)))]

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'center' })
      .setLngLat(position)
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [element, map, position])

  return createPortal(
    <div className="command-medical-route-target" data-testid="medical-route-drop-target" data-facility-id={facilityId}>
      <span aria-hidden="true" />
      <strong>{label}</strong>
      <small>拖放到这里预览</small>
    </div>,
    element,
  )
}

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
  return (
    <DraggableUnitMarker
      map={map}
      unit={unit}
      targetPath={targetRoute?.path ?? null}
      enabled={interaction.enabled}
      kind="traffic"
      testId="draggable-traffic-unit"
      dragHint="拖到绿色 C 路线"
      compactHint="预览 · 未下发"
      keyboardInstruction="按住拖动到绿色路线 C；键盘按回车可生成同一改线预览"
      onDrop={(routeProgress) => interaction.onDrop({ routeId: 'C', routeProgress })}
    />
  )
}

function DraggableUnitMarker({
  map,
  unit,
  targetPath,
  enabled,
  kind,
  testId,
  dragHint,
  compactHint,
  keyboardInstruction,
  onDrop,
}: {
  map: MapLibreMap
  unit: CommandTrafficUnitMarkerDatum
  targetPath: Array<[number, number]> | null
  enabled: boolean
  kind: 'traffic' | 'medical'
  testId: string
  dragHint: string
  compactHint: string
  keyboardInstruction: string
  onDrop: (routeProgress: number) => void
}) {
  const element = useMemo(() => {
    const host = document.createElement('div')
    host.className = 'command-traffic-unit-marker'
    host.style.zIndex = '7'
    host.dataset.kind = kind
    return host
  }, [kind])
  const markerRef = useRef<Marker | null>(null)
  const draggingRef = useRef(false)
  const positionRef = useRef(unit.position)
  const targetPathRef = useRef(targetPath)
  const enabledRef = useRef(enabled)
  const onDropRef = useRef(onDrop)
  positionRef.current = unit.position
  targetPathRef.current = targetPath
  enabledRef.current = enabled
  onDropRef.current = onDrop

  useEffect(() => {
    const marker = new Marker({ element, anchor: 'center', draggable: enabledRef.current })
      .setLngLat(positionRef.current)
      .addTo(map)
    markerRef.current = marker
    let restoreDragPan = false

    const updateDropState = () => {
      const path = targetPathRef.current
      if (!path) {
        element.dataset.validDrop = 'false'
        return null
      }
      const lngLat = marker.getLngLat()
      const snap = nearestRouteSnap(map, [lngLat.lng, lngLat.lat], path)
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

      if (snap && snap.distancePixels <= DROP_TOLERANCE_PX && enabledRef.current) {
        marker.setLngLat(snap.position)
        onDropRef.current(snap.progress)
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
    markerRef.current?.setDraggable(enabled)
    element.dataset.draggable = enabled ? 'true' : 'false'
  }, [element, enabled])

  useEffect(() => {
    if (!draggingRef.current) markerRef.current?.setLngLat(unit.position)
  }, [unit.position])

  const handleKeyboardRouteChange = () => {
    if (!enabled || !targetPath) return
    const routeProgress = Math.max(0.3, nearestRouteSnap(map, unit.position, targetPath).progress)
    onDrop(routeProgress)
  }

  return createPortal(
    <div
      className="command-traffic-unit"
      data-testid={testId}
      data-kind={kind}
      data-status={unit.status}
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-label={`${unit.label}，${enabled ? keyboardInstruction : '当前路线调整预览'}`}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        handleKeyboardRouteChange()
      }}
    >
      <span className="command-traffic-unit-halo" aria-hidden="true" />
      <span className="command-traffic-unit-icon" aria-hidden="true" />
      <span className="command-traffic-unit-label" data-compact={enabled ? 'false' : 'true'}>
        {enabled && <strong>{unit.label}</strong>}
        <small>{enabled ? dragHint : compactHint}</small>
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
