import type { Confidence, DataOrigin } from '@/engine'

const ORIGIN_LABEL: Record<DataOrigin, string> = {
  real: '公开数据',
  simulated: '演示数据',
  estimated: '估算数据',
}

export function OriginMark({
  origin,
  note,
  showLabel = true,
}: {
  origin: DataOrigin
  note: string
  showLabel?: boolean
}) {
  // 三态用形状+填充编码，不能只靠颜色：
  //   real      实心圆
  //   estimated 半填充圆（线性渐变 50%）
  //   simulated 空心圆
  // 见 docs/decisions/2026-08-17-视觉改浅色.md。
  const background =
    origin === 'real'
      ? 'var(--accent)'
      : origin === 'estimated'
        ? 'linear-gradient(90deg, var(--accent) 50%, transparent 50%)'
        : 'transparent'

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-label text-ink-2"
      title={`${ORIGIN_LABEL[origin]}：${note}`}
      aria-label={`${ORIGIN_LABEL[origin]}：${note}`}
    >
      <span
        className="inline-block size-2 rounded-full border border-accent-strong"
        style={{ background }}
        aria-hidden="true"
      />
      {showLabel && ORIGIN_LABEL[origin]}
    </span>
  )
}

const CONFIDENCE_COPY: Record<Confidence, { label: string; className: string }> = {
  confirmed: {
    label: '已确认',
    className: 'border-go bg-[#EAF8F1] text-[#237A52]',
  },
  reported: {
    label: '仅报告',
    className: 'border-dashed border-[#D59B28] bg-transparent text-[#9A6B12]',
  },
  inferred: {
    label: '系统推断',
    className: 'border-water bg-[#EDF5FF] text-[#2F68B0]',
  },
}

export function ConfidenceMark({ confidence }: { confidence: Confidence }) {
  const copy = CONFIDENCE_COPY[confidence]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-label ${copy.className}`}
    >
      <span
        // reported 用菱形（rotate-45），其余用圆点；形状区分是真实性边界，不能去掉。
        className={`size-1.5 ${confidence === 'reported' ? 'rotate-45 border border-current bg-surface-card' : 'bg-current'}`}
        aria-hidden="true"
      />
      {copy.label}
    </span>
  )
}
