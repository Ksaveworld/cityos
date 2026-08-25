import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, Minus, Pause } from 'lucide-react'

import { CHAIN_STEPS, type StepState } from './scenarios'

const STATE_COPY: Record<StepState, string> = {
  complete: '已完成',
  summary: '有摘要',
  'not-run': '待人工确认',
  'phase-1': '演示边界',
}

const DAILY_MAIN_STEP_INDEXES = [3, 4, 6, 7, 8] as const
const HISTORY_MAIN_STEP_INDEXES = [3, 4, 6, 7, 8] as const

export function ChainRail({
  activeStep,
  states,
  onStepChange,
  compact = false,
  variant = 'daily',
}: {
  activeStep: number
  states: StepState[]
  onStepChange: (step: number) => void
  compact?: boolean
  variant?: 'daily' | 'history'
}) {
  const historyMode = variant === 'history'
  const [foundationOpen, setFoundationOpen] = useState(true)
  const foundationActive = !historyMode && activeStep <= 2
  const foundationLabel = historyMode ? '自动历史信息研判' : '对输入进行研判'
  const mainStepIndexes = historyMode ? HISTORY_MAIN_STEP_INDEXES : DAILY_MAIN_STEP_INDEXES
  const mainLabels: Partial<Record<number, string>> = historyMode
    ? { 3: 'AI Brief', 4: '方案生成', 6: '任务下发', 7: '反馈', 8: '复盘' }
    : {}
  const stateCopy = (index: number, state: StepState) => historyMode
    ? index < activeStep ? '已完成' : index === activeStep ? '当前' : '待进入'
    : STATE_COPY[state]

  return (
    <div className="chain-rail border-b border-hairline px-2 py-2" aria-label="处置环节">
      <div className="relative space-y-1">
        <span className="absolute bottom-4 left-[17px] top-4 w-px bg-line" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setFoundationOpen((open) => !open)}
          aria-expanded={foundationOpen}
          className={`relative z-10 grid h-9 w-full grid-cols-[24px_minmax(0,1fr)_14px] items-center gap-1.5 rounded-md px-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong ${
            foundationActive
              ? 'border-l-2 border-accent-strong bg-accent-weak pl-1 text-ink-1'
              : 'text-ink-2 hover:bg-surface-card'
          }`}
        >
          <span className={`grid size-5 place-items-center rounded-full border ${foundationActive ? 'border-accent-strong bg-accent-strong text-white' : historyMode ? 'border-go bg-go text-white' : 'border-accent-strong bg-surface-card text-accent-strong'}`}>
            {foundationActive ? <span className="size-1.5 rounded-full bg-white" /> : <Check size={9} strokeWidth={2.4} />}
          </span>
          <span className={`truncate text-label ${foundationActive ? 'font-semibold' : 'font-medium'}`}>
            {foundationLabel}
          </span>
          {foundationOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {foundationOpen && (
          <div className="relative z-10 flex h-8 items-center gap-1 bg-sunken/95 px-2" aria-label="研判子流程">
            {[0, 1, 2].map((index) => (
              <div key={CHAIN_STEPS[index].key} className="contents">
                {index > 0 && <span className="min-w-1 flex-1 border-t border-dashed border-line" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => { if (!historyMode) onStepChange(index) }}
                  disabled={historyMode}
                  aria-current={activeStep === index ? 'step' : undefined}
                  className={`shrink-0 rounded px-0.5 py-1 text-footnote font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent-strong ${
                    activeStep === index ? 'text-accent-strong' : historyMode ? 'cursor-default text-go' : 'text-ink-2 hover:text-ink-1'
                  }`}
                  title={`${CHAIN_STEPS[index].short} · ${stateCopy(index, states[index])}`}
                >
                  {CHAIN_STEPS[index].short}
                </button>
              </div>
            ))}
          </div>
        )}

        {mainStepIndexes.map((index) => {
          const step = CHAIN_STEPS[index]
          const state = states[index]
          const visualState: StepState = historyMode
            ? index < activeStep ? 'complete' : index === activeStep ? 'summary' : 'not-run'
            : state
          const active = index === activeStep || (!historyMode && index === 4 && activeStep === 5)
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => onStepChange(index)}
              className={`chain-step group relative z-10 grid h-9 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-strong ${
                active
                  ? 'border-l-2 border-accent-strong bg-accent-weak pl-1 text-ink-1'
                  : 'text-ink-2 hover:bg-surface-card'
              }`}
              title={`${step.short} · ${stateCopy(index, state)}`}
              aria-label={`${step.short}，${stateCopy(index, state)}`}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={`grid size-5 place-items-center rounded-full border text-label transition ${
                  active
                    ? 'border-accent-strong bg-accent-strong text-white'
                    : visualState === 'complete'
                      ? 'border-go bg-go text-white'
                      : visualState === 'summary'
                        ? 'border-accent-strong bg-surface-card text-accent-strong'
                        : visualState === 'phase-1'
                          ? 'border-dashed border-ink-3 bg-surface-card text-ink-3'
                          : 'border-line bg-surface-card text-ink-3'
                }`}
              >
                {active ? (
                  <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />
                ) : visualState === 'complete' ? (
                  <Check size={9} strokeWidth={2.4} />
                ) : visualState === 'phase-1' ? (
                  <Pause size={8} />
                ) : visualState === 'not-run' ? (
                  <Minus size={8} />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                )}
              </span>
              <span className={`min-w-0 truncate text-label ${active ? 'font-semibold' : 'font-medium'}`}>
                {mainLabels[index] ?? step.short}
              </span>
              <span className={`shrink-0 text-footnote ${compact ? 'sr-only' : ''} ${active ? 'text-accent-strong' : 'text-ink-3'}`}>
                {stateCopy(index, state)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
