import { useEffect, useState } from 'react'

import { getCityChatStatus } from './chatClient'
import type { CityChatServiceStatus } from './chatContract'

export type CityChatStatusState =
  | { state: 'loading'; value: null }
  | { state: 'ready'; value: CityChatServiceStatus }
  | { state: 'unreachable'; value: null }

export function useCityChatStatus() {
  const [status, setStatus] = useState<CityChatStatusState>({ state: 'loading', value: null })

  useEffect(() => {
    let active = true
    void getCityChatStatus().then((value) => {
      if (active) setStatus({ state: 'ready', value })
    }).catch(() => {
      if (active) setStatus({ state: 'unreachable', value: null })
    })
    return () => { active = false }
  }, [])

  return status
}
