import { useCallback, useEffect, useMemo, useState } from 'react'

import type { BoardResponse } from '../../../../server/cityos/types.ts'
import {
  CityosApiError,
  createCityosApiClient,
  resolveCityosBackendMode,
  type CityosApiClient,
  type CityosApiFailure,
  type CityosBackendMode,
} from './cityosApi'

export type CityosBoardPhase = 'idle' | 'offline-demo' | 'loading' | 'ready' | 'stale' | 'unavailable'

export interface CityosBoardState {
  mode: CityosBackendMode
  phase: CityosBoardPhase
  board: BoardResponse | null
  failure: CityosApiFailure | null
  lastSuccessfulAt: number | null
}

interface UseCityosBoardOptions {
  incidentId: string
  enabled: boolean
  pollIntervalMs?: number
  client?: CityosApiClient
  mode?: CityosBackendMode
}

const INITIAL_STATE: CityosBoardState = {
  mode: 'offline-demo',
  phase: 'idle',
  board: null,
  failure: null,
  lastSuccessfulAt: null,
}

function unavailableFailure(error: unknown): CityosApiFailure {
  if (error instanceof CityosApiError) return error.failure
  return {
    code: 'CITYOS_API_UNREACHABLE',
    message: 'CityOS 后端暂时不可用。',
    retryable: true,
  }
}

export function useCityosBoard({
  incidentId,
  enabled,
  pollIntervalMs = 3_000,
  client: providedClient,
  mode: providedMode,
}: UseCityosBoardOptions) {
  const mode = providedMode ?? resolveCityosBackendMode()
  const defaultClient = useMemo(() => createCityosApiClient(), [])
  const client = providedClient ?? defaultClient
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [state, setState] = useState<CityosBoardState>(() => ({ ...INITIAL_STATE, mode }))

  const refresh = useCallback(() => {
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({ ...current, mode, phase: 'idle', failure: null }))
      return
    }
    if (mode === 'offline-demo') {
      setState({ ...INITIAL_STATE, mode, phase: 'offline-demo' })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const schedule = () => {
      if (cancelled) return
      timer = setTimeout(run, pollIntervalMs)
    }

    const run = async () => {
      if (cancelled) return
      if (document.visibilityState === 'hidden') {
        schedule()
        return
      }

      controller?.abort()
      controller = new AbortController()
      setState((current) => ({
        ...current,
        mode,
        phase: current.board ? current.phase : 'loading',
      }))

      try {
        const board = await client.getBoard(incidentId, controller.signal)
        if (cancelled) return
        setState({
          mode,
          phase: 'ready',
          board,
          failure: null,
          lastSuccessfulAt: Math.floor(Date.now() / 1_000),
        })
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
        const failure = unavailableFailure(error)
        setState((current) => ({
          ...current,
          mode,
          phase: current.board ? 'stale' : 'unavailable',
          failure,
        }))
      } finally {
        if (!cancelled) schedule()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      void run()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void run()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controller?.abort()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [client, enabled, incidentId, mode, pollIntervalMs, refreshVersion])

  return { ...state, refresh }
}

