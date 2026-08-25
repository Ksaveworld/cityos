import { memo, useState } from 'react'
import {
  Ambulance,
  Building2,
  ChevronDown,
  CloudRain,
  Cross,
  Hospital,
  Route,
  ShieldCheck,
  TrafficCone,
  Video,
} from 'lucide-react'

import { OriginMark } from './Provenance'
import type { MapLayerId, MapLayerVisibility } from './mapLayers'

const RESOURCE_GROUPS = {
  消防: [
    { label: '消防站点', value: 14, icon: ShieldCheck },
    { label: '消防车辆', value: 46, icon: TrafficCone },
    { label: '可用水罐车', value: 19, icon: Cross },
  ],
  公安: [
    { label: '派出所', value: 21, icon: ShieldCheck },
    { label: '路面警力', value: 186, icon: TrafficCone },
    { label: '可用铁骑', value: 74, icon: Route },
  ],
  医疗: [
    { label: '120 网络医院', value: 148, icon: Hospital },
    { label: '救护车', value: 312, icon: Ambulance },
    { label: '非 120 网络医院', value: 188, icon: Building2 },
    { label: '社区医院', value: 167, icon: Cross },
  ],
} as const

const LAYERS: Array<{ id: MapLayerId; label: string; note: string; icon: typeof Route }> = [
  { id: 'weather', label: '气象影响', note: '气象影响范围', icon: CloudRain },
  { id: 'traffic', label: '道路路况', note: '路段通行状态', icon: TrafficCone },
  { id: 'routes', label: '响应路径', note: '当前场景', icon: Route },
  { id: 'cameras', label: '上游视频点位', note: '上游点位', icon: Video },
]

type ResourceTab = keyof typeof RESOURCE_GROUPS

export const LeftRail = memo(function LeftRail({
  layers,
  onLayerToggle,
  focus = false,
}: {
  layers: MapLayerVisibility
  onLayerToggle: (layer: MapLayerId) => void
  focus?: boolean
}) {
  const [tab, setTab] = useState<ResourceTab>('医疗')
  const [resourcesOpen, setResourcesOpen] = useState(true)
  const [layersOpen, setLayersOpen] = useState(true)

  return (
    <aside className="min-h-0 overflow-hidden rounded-xl border border-line bg-surface-card shadow-panel">
      <RailSection title={focus ? '资源调度' : '资源快照'} open={resourcesOpen} onToggle={() => setResourcesOpen((value) => !value)}>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1">
          {(Object.keys(RESOURCE_GROUPS) as ResourceTab[]).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`h-7 rounded-md text-label transition ${
                tab === item
                  ? 'bg-accent-weak font-medium text-accent-strong'
                  : 'text-ink-2 hover:text-ink-1'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-2 space-y-0.5">
          {RESOURCE_GROUPS[tab].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="flex h-9 items-center gap-2 rounded-lg px-1.5"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-ink-3">
                <Icon size={13} strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1 truncate text-label text-ink-1">{label}</span>
              <span className="font-mono text-label font-semibold tabular-nums text-ink-1">
                {value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <OriginMark origin="simulated" note="资源数量与实时可用状态均为演示快照" showLabel={false} />
        </div>
      </RailSection>

      <div className="mx-3 border-t border-line" />

      <RailSection title="图层控制" open={layersOpen} onToggle={() => setLayersOpen((value) => !value)}>
        <div className="space-y-0.5">
          {LAYERS.map(({ id, label, note, icon: Icon }) => (
            <label
              key={id}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-1.5 hover:bg-sunken"
            >
              <Icon size={13} className="text-ink-3" />
              <span className="flex-1 text-label text-ink-1">{label}</span>
              <span className="text-footnote text-ink-3">{note}</span>
              <input
                className="accent-accent-strong"
                type="checkbox"
                checked={layers[id]}
                onChange={() => onLayerToggle(id)}
                aria-label={`切换${label}`}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-footnote leading-relaxed text-ink-3">
          每个开关都会改变地图。气象、路况和视频点位均为演示展示，未接入实时源。
        </p>
        <div className="mt-2 rounded-lg border border-line bg-sunken px-2.5 py-2">
          <div className="text-label font-semibold text-ink-1">地图数据口径</div>
          <p className="mt-1 text-footnote leading-relaxed text-ink-3">
            建筑、站点与路网来自 OSM 快照；ETA、配时和资源状态为演示模型。
          </p>
          <p className="mt-1 text-footnote text-ink-3">
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-accent-strong">© OpenStreetMap contributors · ODbL</a>
          </p>
        </div>
      </RailSection>
    </aside>
  )
})

function RailSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="p-3">
      <button className="flex w-full items-center justify-between pb-2 text-left" onClick={onToggle}>
        <span className="text-label font-semibold text-ink-1">{title}</span>
        <ChevronDown size={13} className={`text-ink-3 transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && children}
    </section>
  )
}
