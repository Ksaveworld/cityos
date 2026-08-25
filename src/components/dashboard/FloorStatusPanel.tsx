export interface FloorStatusPanelProps {
  buildingName: string
  totalFloors: number
  fireFloor: number
  smokeFloor: number
  reportedFloor: number
  refugeFloor: number
}

type Status = 'reported' | 'smoke' | 'fire' | 'refuge'

const STATUS_STYLES: Record<Status, { marker: string; label: string }> = {
  reported: {
    marker: 'border border-dashed border-[#C77816] bg-transparent',
    label: 'text-[#C77816]',
  },
  smoke: {
    marker: 'bg-[#E8964A]',
    label: 'text-[#E8964A]',
  },
  fire: {
    marker: 'bg-[#E5484D]',
    label: 'text-[#E5484D]',
  },
  refuge: {
    marker: 'border border-[#30A46C] bg-[#D6F0E4]',
    label: 'text-[#30A46C]',
  },
}

export function FloorStatusPanel({
  totalFloors,
  fireFloor,
  smokeFloor,
  reportedFloor,
  refugeFloor,
}: FloorStatusPanelProps) {
  const rows: Array<{ status: Status; label: string; description: string }> = [
    {
      status: 'reported',
      label: `${reportedFloor}F 待核实`,
      description: '报警人语音提及，未确认',
    },
    {
      status: 'smoke',
      label: `${smokeFloor}F 烟气推断`,
      description: '由起火层竖向蔓延推断',
    },
    {
      status: 'fire',
      label: `${fireFloor}F 起火层`,
      description: '现场多模态已确认',
    },
    {
      status: 'refuge',
      label: `${refugeFloor}F 避难层`,
      description: '疏散集结，非火灾层',
    },
  ]

  return (
    <section className="w-[300px] max-w-full overflow-hidden rounded-xl border border-line bg-white/95 shadow-panel backdrop-blur-sm">
      <header className="border-b border-line px-3 py-2.5">
        <h3 className="text-[14px] font-semibold text-ink-1">楼层态势</h3>
        <p className="mt-1 text-[12px] text-ink-2">
          地上 {totalFloors} 层 · 演练点 {fireFloor}F
        </p>
      </header>

      <div className="space-y-2 px-3 py-2.5" aria-label="楼层状态说明">
        {rows.map((row) => {
          const style = STATUS_STYLES[row.status]

          return (
            <div
              key={row.status}
              className="grid grid-cols-[10px_88px_minmax(0,1fr)] items-center gap-x-2"
            >
              <span className={`size-2.5 ${style.marker}`} aria-hidden="true" />
              <span className={`whitespace-nowrap text-[13px] font-semibold ${style.label}`}>
                {row.label}
              </span>
              <span className="min-w-0 text-[11px] text-ink-2">{row.description}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default FloorStatusPanel
