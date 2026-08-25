import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  clampKnowledgeRailWidth,
  KNOWLEDGE_RAIL_DEFAULT_WIDTH,
  KNOWLEDGE_RAIL_KEYBOARD_STEP,
  KNOWLEDGE_RAIL_MAX_WIDTH,
  KNOWLEDGE_RAIL_MIN_WIDTH,
  KNOWLEDGE_RAIL_STORAGE_KEY,
  LEGACY_KNOWLEDGE_RAIL_STORAGE_KEY,
} from './knowledgeRailState'

export function KnowledgeRailLayout({
  railWidth,
  onRailWidthChange,
  railLabel,
  resizeLabel,
  rail,
  children,
}: {
  railWidth: number
  onRailWidthChange: (width: number) => void
  railLabel: string
  resizeLabel: string
  rail: ReactNode
  children: ReactNode
}) {
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number; latestWidth: number } | null>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)

  useLayoutEffect(() => {
    const layout = layoutRef.current
    if (!layout) return
    const syncWidth = () => setLayoutWidth(Math.round(layout.getBoundingClientRect().width))
    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (layoutWidth <= 0) return
    const nextWidth = clampKnowledgeRailWidth(railWidth, layoutWidth)
    if (nextWidth !== railWidth) onRailWidthChange(nextWidth)
  }, [layoutWidth, onRailWidthChange, railWidth])

  const updateWidth = (width: number, persist = false) => {
    const containerWidth = layoutRef.current?.getBoundingClientRect().width ?? layoutWidth
    const nextWidth = clampKnowledgeRailWidth(width, containerWidth)
    onRailWidthChange(nextWidth)
    if (persist) window.localStorage.setItem(KNOWLEDGE_RAIL_STORAGE_KEY, String(nextWidth))
    return nextWidth
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: railWidth, latestWidth: railWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.latestWidth = updateWidth(drag.startWidth + event.clientX - drag.startX)
    event.preventDefault()
  }

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    updateWidth(drag.latestWidth, true)
  }

  const resetWidth = () => {
    updateWidth(KNOWLEDGE_RAIL_DEFAULT_WIDTH)
    window.localStorage.removeItem(KNOWLEDGE_RAIL_STORAGE_KEY)
    window.localStorage.removeItem(LEGACY_KNOWLEDGE_RAIL_STORAGE_KEY)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      resetWidth()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    updateWidth(railWidth + (event.key === 'ArrowRight' ? KNOWLEDGE_RAIL_KEYBOARD_STEP : -KNOWLEDGE_RAIL_KEYBOARD_STEP), true)
  }

  return (
    <div ref={layoutRef} className="relative grid min-h-0 flex-1 gap-3 bg-page" style={{ gridTemplateColumns: `${railWidth}px minmax(0, 1fr)` }}>
      <aside aria-label={railLabel} className="flex min-h-0 flex-col rounded-b-xl border border-t-0 border-line bg-surface-card px-4 py-3">
        {rail}
      </aside>

      <div
        role="separator"
        aria-label={resizeLabel}
        aria-orientation="vertical"
        aria-valuemin={KNOWLEDGE_RAIL_MIN_WIDTH}
        aria-valuemax={clampKnowledgeRailWidth(KNOWLEDGE_RAIL_MAX_WIDTH, layoutWidth || KNOWLEDGE_RAIL_MAX_WIDTH * 3)}
        aria-valuenow={railWidth}
        aria-valuetext={`${railWidth} 像素`}
        tabIndex={0}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onDoubleClick={resetWidth}
        onKeyDown={handleKeyDown}
        className="group absolute inset-y-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none select-none outline-none"
        style={{ left: railWidth }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong" />
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line transition-colors group-hover:bg-accent-strong group-focus-visible:bg-accent-strong group-active:bg-accent-strong" />
      </div>

      {children}
    </div>
  )
}
