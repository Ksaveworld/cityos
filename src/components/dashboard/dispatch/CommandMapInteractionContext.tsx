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

export interface CommandMapInteractionValue {
  traffic: CommandTrafficDragInteraction | null
}

const EMPTY_INTERACTION: CommandMapInteractionValue = { traffic: null }
export const CommandMapInteractionContext = createContext<CommandMapInteractionValue>(EMPTY_INTERACTION)

export function useCommandMapInteraction() {
  return useContext(CommandMapInteractionContext)
}
