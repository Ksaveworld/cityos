import { Bot, MapPinned, Route, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { ExecutionFrame } from '../execution/executionPlayback'
import {
  type CommandMapInteractionValue,
  type CommandMedicalFacilityId,
} from './CommandMapInteractionContext'
import { CommandMapInteractionProvider } from './CommandMapInteractionProvider'
import type { ActiveDispatchEvent } from './activeEventDispatchModel'

import './CommandWorkbench.css'

interface LegacyDispatchWorkbenchProps {
  event: ActiveDispatchEvent
  selectedFacilityId: CommandMedicalFacilityId
  advisorRequestId?: string | null
  onSelectFacility: (facilityId: CommandMedicalFacilityId) => void
  renderMap: (executionFrame: ExecutionFrame) => ReactNode
  contextPanel: ReactNode
  advisorPanel: ReactNode
}

export function LegacyDispatchWorkbench({
  event,
  selectedFacilityId,
  advisorRequestId = null,
  onSelectFacility,
  renderMap,
  contextPanel,
  advisorPanel,
}: LegacyDispatchWorkbenchProps) {
  const [routeProgress, setRouteProgress] = useState(0.3)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const targetFacilityId: CommandMedicalFacilityId = selectedFacilityId === 'facility-shiyi'
    ? 'facility-red-cross'
    : 'facility-shiyi'

  useEffect(() => {
    if (advisorRequestId) setAdvisorOpen(true)
  }, [advisorRequestId])

  const interaction = useMemo<CommandMapInteractionValue>(() => ({
    traffic: null,
    medical: {
      enabled: true,
      selectedFacilityId,
      targetFacilityId,
      onDrop: ({ facilityId, routeProgress: nextProgress }) => {
        setRouteProgress(nextProgress)
        onSelectFacility(facilityId)
      },
    },
  }), [onSelectFacility, selectedFacilityId, targetFacilityId])

  const executionFrame = useMemo<ExecutionFrame>(() => ({
    definitionId: 'legacy-hospital-route-preview',
    playheadSec: 0,
    progress: routeProgress,
    phase: 'routing',
    units: [{
      id: 'legacy-medical-preview-unit',
      label: '医疗转运单元 · 预览',
      kind: 'medical',
      routeRole: 'medical',
      departAt: 0,
      arriveAt: 1,
      progress: routeProgress,
      status: 'enroute',
    }],
    intersections: [],
    roadCues: [],
    tasks: [],
    visibleAlerts: [],
    onsiteNodes: [],
    incidentStage: '协同在途',
    blockingAlert: null,
  }), [routeProgress])

  const selectedFacilityLabel = selectedFacilityId === 'facility-red-cross'
    ? '红十字会医院'
    : '市一医院'
  const targetFacilityLabel = targetFacilityId === 'facility-red-cross'
    ? '红十字会医院'
    : '市一医院'

  return (
    <main className="command-workbench" data-testid="legacy-dispatch-workbench">
      <section className="command-map-panel" aria-label={`${event.title}地图预览`}>
        <header className="command-map-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="command-map-accent" aria-hidden="true" />
              <h2>{event.title}</h2>
              <span className="command-simulation-badge">旧链路 · 本地模拟</span>
            </div>
            <p>右栏选接收方案或直接拖动救护车；地图即时预览，人工确认与任务下发仍分开。</p>
          </div>
          <div className="command-map-lock"><MapPinned size={13} />地图主导视图</div>
        </header>

        <div className="command-map-stage" data-preview-facility={selectedFacilityId} data-route-progress={routeProgress.toFixed(3)}>
          <CommandMapInteractionProvider value={interaction}>
            <div className="command-map-base">{renderMap(executionFrame)}</div>
          </CommandMapInteractionProvider>

          <div className="command-drag-guide is-medical is-preview" aria-live="polite">
            <span><Route size={15} /></span>
            <div>
              <strong>当前预览：{selectedFacilityLabel}</strong>
              <small>可把救护车拖到{targetFacilityLabel}路线；预览不会自动确认或下发。</small>
            </div>
          </div>

          <button
            type="button"
            className="legacy-advisor-toggle"
            aria-expanded={advisorOpen}
            onClick={() => setAdvisorOpen((open) => !open)}
          >
            <Bot size={14} />Chatbot 参谋
          </button>

          {advisorOpen && (
            <div className="legacy-advisor-drawer" role="dialog" aria-label="Chatbot 参谋">
              <button type="button" className="legacy-advisor-close" aria-label="收起 Chatbot 参谋" onClick={() => setAdvisorOpen(false)}><X size={14} /></button>
              {advisorPanel}
            </div>
          )}
        </div>
      </section>

      {contextPanel}
    </main>
  )
}
