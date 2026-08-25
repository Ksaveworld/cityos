import { memo, useEffect, useState } from 'react'
import {
  ClipboardCheck,
  Gauge,
  Route,
  Siren,
} from 'lucide-react'

import { WeatherChip } from './weather/WeatherFx'

export type Workspace = 'overview' | 'incidents' | 'resources' | 'review'

const NAV_ITEMS: Array<{ id: Workspace; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: '态势总览', icon: Gauge },
  { id: 'incidents', label: '事件处置', icon: Siren },
  { id: 'resources', label: '资源调度', icon: Route },
  { id: 'review', label: '沉淀知识库', icon: ClipboardCheck },
]

const chinaClock = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)

export const TopNav = memo(function TopNav({
  activeWorkspace,
  onNavigate,
  onHome,
}: {
  activeWorkspace: Workspace
  onNavigate: (workspace: Workspace) => void
  onHome: () => void
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <header className="flex h-[54px] min-w-0 items-stretch border-b border-line bg-surface-card px-5 shadow-[0_1px_2px_rgb(16_24_40_/_0.03)]">
      <button
        type="button"
        onClick={onHome}
        className="flex shrink-0 items-center border-r border-hairline pr-5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        aria-label="返回 City OS 首页"
      >
        <span className="text-[15px] font-semibold text-ink-1">CITY OS · 城市安全</span>
      </button>

      <nav className="ml-3 flex min-w-0 items-stretch gap-1" aria-label="主导航">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            title={label}
            aria-label={label}
            className={`relative flex h-full shrink-0 items-center gap-1.5 px-3 text-label transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent-strong ${
              activeWorkspace === id
                ? 'bg-[#F8F8FE] font-semibold text-accent-strong after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:bg-accent-strong'
                : 'text-ink-2 hover:bg-page hover:text-ink-1'
            }`}
            aria-current={activeWorkspace === id ? 'page' : undefined}
          >
            <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3 pl-5 text-label text-ink-2">
        <WeatherChip />
        <time className="font-mono tabular-nums text-ink-1">{chinaClock(now)}</time>
      </div>
    </header>
  )
})
