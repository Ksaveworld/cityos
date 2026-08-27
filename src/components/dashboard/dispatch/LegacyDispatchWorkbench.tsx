import { Bot, MapPinned, Route, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import type { ExecutionFrame } from '../execution/executionPlayback'
import {
  type CommandMapInteractionValue,
  type CommandMedicalCandidateFacilityId,
  type CommandMedicalFacilityId,
} from './CommandMapInteractionContext'
import { CommandMapInteractionProvider } from './CommandMapInteractionProvider'
import type { ActiveDispatchEvent } from './activeEventDispatchModel'
import {
  dispatchFacilityEtaLabel,
  getDispatchFacility,
  getSelectableDispatchFacilities,
} from './dispatchData'

import './CommandWorkbench.css'

interface LegacyDispatchWorkbenchProps {
  event: ActiveDispatchEvent
  selectedFacilityId: CommandMedicalFacilityId
  advisorRequestId?: string | null
  onSelectFacility: (facilityId: CommandMedicalCandidateFacilityId) => void
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
  const [dragPreview, setDragPreview] = useState<{ facilityId: CommandMedicalCandidateFacilityId; routeProgress: number } | null>(null)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const selectedFacility = getDispatchFacility(selectedFacilityId)
  const routeProgress = dragPreview?.facilityId === selectedFacilityId
    ? dragPreview.routeProgress
    : selectedFacility?.route.defaultProgress ?? 0.3

  useEffect(() => {
    if (advisorRequestId) setAdvisorOpen(true)
  }, [advisorRequestId])

  const interaction = useMemo<CommandMapInteractionValue>(() => ({
    traffic: null,
    medical: {
      enabled: true,
      selectedFacilityId,
      targetFacilityIds: getSelectableDispatchFacilities()
        .filter((facility) => facility.id !== selectedFacilityId)
        .map((facility) => facility.id),
      markerStatusLabel: '预览 · 未下发',
      onDrop: ({ facilityId, routeProgress: nextProgress }) => {
        setDragPreview({ facilityId, routeProgress: nextProgress })
        onSelectFacility(facilityId)
      },
    },
  }), [onSelectFacility, selectedFacilityId])

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
      status: 'waiting',
    }],
    intersections: [],
    roadCues: [],
    tasks: [],
    visibleAlerts: [],
    onsiteNodes: [],
    incidentStage: '待出发',
    blockingAlert: null,
  }), [routeProgress])

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
              <strong>当前预览：{selectedFacility?.name ?? '接收医院待选择'}</strong>
              <small>{selectedFacility
                ? `${selectedFacility.receivingState} · ${dispatchFacilityEtaLabel(selectedFacility)}；可继续点击或拖拽切换，预览不会自动确认或下发。`
                : '拖动救护车至静态候选路线即可改道；预览不会自动确认或下发。'}</small>
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
