import { createContext, useContext } from 'react'

export interface CommandTrafficRouteDrop {
  routeId: 'C'
  routeProgress: number
}

export interface CommandTrafficDragInteraction {
  enabled: boolean
  activeRouteId: 'B' | 'C'
  targetRouteId: 'C'
  onDrop: (drop: CommandTrafficRouteDrop) => void
}

export interface CommandMedicalRouteDrop {
  facilityId: 'facility-red-cross'
  routeProgress: number
}

export interface CommandMedicalDragInteraction {
  enabled: boolean
  selectedFacilityId: 'facility-shiyi' | 'facility-red-cross'
  targetFacilityId: 'facility-red-cross'
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
