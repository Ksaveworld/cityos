import { memo, type ReactNode } from 'react'
import { MapPinned, Route } from 'lucide-react'

import type {
  CommandScenarioId,
  MedicalCommandState,
  TrafficCommandState,
} from './commandWorkbenchModel'

interface CommandTacticalMapProps {
  scenario: CommandScenarioId
  map: ReactNode
  traffic: TrafficCommandState
  medical: MedicalCommandState
  onTrafficPreview: () => void
  onMedicalSelect: () => void
}

export const CommandTacticalMap = memo(function CommandTacticalMap({
  scenario,
  map,
  traffic,
  medical,
  onTrafficPreview,
  onMedicalSelect,
}: CommandTacticalMapProps) {
  const title = scenario === 'traffic'
    ? '中山路清障车在途改线'
    : scenario === 'medical'
      ? '盘福路急救转运调整'
      : scenario === 'city-order'
        ? '北京路夜市秩序保障'
        : '广州城市安全协同态势'

  return (
    <section className="command-map-panel" aria-label={`${title}地图`}>
      <header className="command-map-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="command-map-accent" aria-hidden="true" />
            <h2>{title}</h2>
            <span className="command-simulation-badge">本地模拟</span>
          </div>
          <p>公开底图与 OSM 路网 · 脉冲路线、ETA、车位和回执均为策略预设</p>
        </div>
        <div className="command-map-lock"><MapPinned size={13} />演示视角已锁定</div>
      </header>

      <div
        className="command-map-stage"
        data-execution-route={scenario === 'traffic'
          ? ['acknowledged', 'en-route', 'arrived'].includes(traffic.phase) ? 'C' : 'B'
          : scenario === 'medical'
            ? ['acknowledged', 'en-route', 'arrived'].includes(medical.phase) ? 'red-cross' : 'shiyi'
            : ''}
        data-vehicle-progress={scenario === 'traffic'
          ? traffic.carProgress.toFixed(3)
          : scenario === 'medical'
            ? medical.ambulanceProgress.toFixed(3)
            : ''}
      >
        <div className="command-map-base">{map}</div>

        {scenario === 'traffic' && (
          <TrafficMapControls traffic={traffic} onPreview={onTrafficPreview} />
        )}
        {scenario === 'medical' && (
          <MedicalMapHint medical={medical} onSelect={onMedicalSelect} />
        )}
        {scenario === 'city-order' && (
          <div className="command-map-context-note">
            <strong>北京路步行街 · 待人工核实</strong>
            <span>图片、视频和商户上报只进入 AI Brief，不触发调度。</span>
          </div>
        )}

        <div className="command-map-provenance">
          <span className="command-shape command-shape-solid" aria-hidden="true" />已确认事件
          <span className="command-shape command-shape-dashed" aria-hidden="true" />待核实证据
        </div>
      </div>
    </section>
  )
})

function TrafficMapControls({ traffic, onPreview }: { traffic: TrafficCommandState; onPreview: () => void }) {
  const previewVisible = traffic.activeRouteId === 'C'
  return (
    <div className="command-route-controls" aria-label="中山路三条候选路线">
      <div className="command-route-times">
        <RouteTime code="A" label="常规" time="12 分钟" color="#3B82F6" />
        <RouteTime code="B" label="最短 · 受阻" time="8 分钟" color="#E5484D" blocked />
        <RouteTime code="C" label="推荐改线" time="10 分钟" color="#30A46C" active={previewVisible} />
      </div>
      {!previewVisible && (
        <button type="button" className="command-route-preview" onClick={onPreview}>
          <Route size={14} />
          选择南侧备用路口，预览路线 C
        </button>
      )}
      {previewVisible && (
        <div className="command-route-preview is-ready"><Route size={14} />路线 C 已在路网上生成，仅为 Preview</div>
      )}
    </div>
  )
}

function RouteTime({
  code,
  label,
  time,
  color,
  blocked = false,
  active = false,
}: {
  code: string
  label: string
  time: string
  color: string
  blocked?: boolean
  active?: boolean
}) {
  return (
    <div className={`command-route-time ${blocked ? 'is-blocked' : ''} ${active ? 'is-active' : ''}`}>
      <span className="command-route-time-code" style={{ backgroundColor: color }}>{code}</span>
      <span><small>{label}</small><strong>{time}</strong></span>
    </div>
  )
}

function MedicalMapHint({ medical, onSelect }: { medical: MedicalCommandState; onSelect: () => void }) {
  const selected = medical.selectedFacilityId === 'facility-red-cross'
  return (
    <div className="command-route-controls is-medical">
      <div className="command-map-context-note is-inline">
        <strong>{selected ? '红十字会医院路线已预览' : '市一医院接收能力下降（模拟）'}</strong>
        <span>{selected ? '新路线沿路网显示，尚未提交或批准。' : '请点选地图上的红十字会医院，或使用下方按钮。'}</span>
      </div>
      {!selected && (
        <button type="button" className="command-route-preview" onClick={onSelect}>
          选择红十字会医院 · 只生成 Preview
        </button>
      )}
    </div>
  )
}
