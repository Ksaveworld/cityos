import type { ReactNode } from 'react'

import {
  CommandMapInteractionContext,
  type CommandMapInteractionValue,
} from './CommandMapInteractionContext'

export function CommandMapInteractionProvider({
  value,
  children,
}: {
  value: CommandMapInteractionValue
  children: ReactNode
}) {
  return (
    <CommandMapInteractionContext.Provider value={value}>
      {children}
    </CommandMapInteractionContext.Provider>
  )
}
