import type { ReactNode } from 'react'

/**
 * 事件卡 / 详情卡的统一容器。
 *
 * 列表态（RightPanel.EventList）和详情态（StepPanels 各 Panel）原本各写各的
 * 圆角、内边距、边框、底色——这里收敛成一套。只管外观，不管内容结构。
 *
 * 见 docs/design/组件交接-Demo细节修改-20260819.md 第一至四节。
 */
type CardVariant = 'default' | 'fire' | 'sunken' | 'accent' | 'go' | 'dashed'

const VARIANT: Record<CardVariant, string> = {
  // 白底 + 边框，最常见
  default: 'border-line bg-surface-card',
  // 火情展开态：整卡淡红底
  fire: 'border-[#F2CBCD] bg-[#FDF0F0]',
  // 凹陷底：上下文行、空态
  sunken: 'border-line bg-sunken',
  // 主色弱底：选中态、强调
  accent: 'border-accent-strong bg-accent-weak',
  // 正常态：绿底（真实锚点、已确认事实）
  go: 'border-line bg-[#F4FBF7]',
  // 虚线描边：待核实、信息缺口
  dashed: 'border-dashed border-[#D9DCE6] bg-surface-card',
}

export function EventCard({
  variant = 'default',
  as: As = 'article',
  className = '',
  children,
}: {
  variant?: CardVariant
  as?: 'article' | 'div' | 'li' | 'button'
  className?: string
  children: ReactNode
}) {
  return (
    <As className={`rounded-lg border p-2.5 ${VARIANT[variant]} ${className}`}>{children}</As>
  )
}

/**
 * 左标签右值的字段行。列表态的报警信息、详情态的键值对都用它。
 * danger=true 时值用火情色（如报警电话）。
 */
export function Field({
  label,
  value,
  danger = false,
  children,
}: {
  label: ReactNode
  value?: ReactNode
  danger?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-label text-ink-3">{label}</span>
      {children ? (
        <span className="text-right">{children}</span>
      ) : (
        <span className={`text-right text-body ${danger ? 'text-fire' : 'text-ink-1'}`}>
          {value}
        </span>
      )}
    </div>
  )
}
