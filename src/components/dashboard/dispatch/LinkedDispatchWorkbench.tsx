import { Bot, MapPinned, Route, X } from 'lucide-react'
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react'

import type { ActiveDispatchEvent } from './activeEventDispatchModel'
import { getLinkedDispatchMapConfig } from './linkedDispatchMapConfig'

import './CommandWorkbench.css'

interface LinkedDispatchWorkbenchProps {
  event: ActiveDispatchEvent
  selectedOptionId: string
  advisorRequestId?: string | null
  onSelectOption: (optionId: string) => void
  renderMap: (options: {
    selectedOptionId: string
    onScenarioPointSelect: (optionId: string) => void
  }) => ReactNode
  contextPanel: ReactNode
  advisorPanel: ReactNode
}

export const LinkedDispatchWorkbench = memo(function LinkedDispatchWorkbench({
  event,
  selectedOptionId,
  advisorRequestId = null,
  onSelectOption,
  renderMap,
  contextPanel,
  advisorPanel,
}: LinkedDispatchWorkbenchProps) {
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const config = getLinkedDispatchMapConfig(event.id)
  const selectedOption = config?.options.find((option) => option.optionId === selectedOptionId) ?? null

  useEffect(() => {
    if (advisorRequestId) setAdvisorOpen(true)
  }, [advisorRequestId])

  const selectMapPoint = useCallback((optionId: string) => {
    const option = config?.options.find((candidate) => candidate.optionId === optionId)
    if (option) onSelectOption(option.optionId)
  }, [config, onSelectOption])

  if (!config) return null

  return (
    <main
      className="command-workbench"
      data-testid="linked-dispatch-workbench"
      data-dispatch-event-id={event.id}
      data-selected-option={selectedOptionId}
    >
      <section className="command-map-panel" aria-label={`${event.title}地图预览`}>
        <header className="command-map-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="command-map-accent" aria-hidden="true" />
              <h2>{config.mapTitle}</h2>
              <span className="command-simulation-badge">当前链路 · 本地模拟</span>
            </div>
            <p>右栏与地图候选点共用同一调度草案；人工确认生成新版本，任务下发仍是独立动作。</p>
          </div>
          <div className="command-map-lock"><MapPinned size={13} />地图主导视图</div>
        </header>

        <div className="command-map-stage" data-preview-option={selectedOptionId}>
          <div className="command-map-base">
            {renderMap({ selectedOptionId, onScenarioPointSelect: selectMapPoint })}
          </div>

          <div className={`command-drag-guide ${selectedOption ? 'is-preview' : ''}`} aria-live="polite">
            <span><Route size={15} /></span>
            <div>
              <strong>{selectedOption ? `当前预览：${selectedOption.optionLabel}` : '选择备用资源草案'}</strong>
              <small>{selectedOption
                ? `${selectedOption.resourceState} · 预计到达约 ${selectedOption.etaMinutes.toFixed(1)} 分钟（演示估算）；确认前可继续点击地图或右栏切换。`
                : `${config.initialGuide}点击只改变草案，不会自动批准或下发。`}</small>
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
})
