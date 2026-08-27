import { createContext, useContext } from 'react'
import type { DispatchFacilityId, DispatchSelectableFacilityId } from './dispatchData'
import type { TrafficSelectableRouteId, TrafficStrategyRouteId } from './trafficStrategyRoutes'

export interface CommandTrafficRouteDrop {
  routeId: TrafficSelectableRouteId
  routeProgress: number
}

export interface CommandTrafficDragInteraction {
  enabled: boolean
  activeRouteId: TrafficStrategyRouteId
  targetRouteIds: TrafficSelectableRouteId[]
  markerStatusLabel: string
  onDrop: (drop: CommandTrafficRouteDrop) => void
}

export type CommandMedicalFacilityId = DispatchFacilityId
export type CommandMedicalCandidateFacilityId = DispatchSelectableFacilityId

export interface CommandMedicalRouteDrop {
  facilityId: CommandMedicalCandidateFacilityId
  routeProgress: number
}

export interface CommandMedicalDragInteraction {
  enabled: boolean
  selectedFacilityId: CommandMedicalFacilityId
  targetFacilityIds: CommandMedicalCandidateFacilityId[]
  markerStatusLabel: string
  onDrop: (drop: CommandMedicalRouteDrop) => void
}

export interface CommandMapInteractionValue {
  traffic: CommandTrafficDragInteraction | null
  medical: CommandMedicalDragInteraction | null
}

const EMPTY_INTERACTION: CommandMapInteractionValue = { traffic: null, medical: null }
export const CommandMapInteractionContext = createContext<CommandMapInteractionValue>(EMPTY_INTERACTION)

export function useCommandMapInteraction() {
  return useContext(CommandMapInteractionContext)
}
