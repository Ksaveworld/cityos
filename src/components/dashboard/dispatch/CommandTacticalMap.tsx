import { memo, useMemo, type ReactNode } from 'react'
import { MapPinned, Route } from 'lucide-react'

import type {
  CommandScenarioId,
  MedicalCommandState,
  TrafficCommandState,
} from './commandWorkbenchModel'
import { CommandMapInteractionProvider } from './CommandMapInteractionProvider'
import type { CommandMedicalRouteDrop } from './CommandMapInteractionContext'

interface CommandTacticalMapProps {
  scenario: CommandScenarioId
  map: ReactNode
  traffic: TrafficCommandState
  medical: MedicalCommandState
  onTrafficDrop: (routeProgress: number) => void
  onMedicalDrop: (routeProgress: number) => void
}

export const CommandTacticalMap = memo(function CommandTacticalMap({
  scenario,
  map,
  traffic,
  medical,
  onTrafficDrop,
  onMedicalDrop,
}: CommandTacticalMapProps) {
  const title = scenario === 'traffic'
    ? '中山路清障车在途改线'
    : scenario === 'medical'
      ? '盘福路急救转运调整'
      : scenario === 'city-order'
        ? '北京路夜市秩序保障'
        : '广州城市安全协同态势'
  const interaction = useMemo(() => ({
    traffic: scenario === 'traffic'
      ? {
          enabled: traffic.phase === 'blocked' && traffic.activeRouteId === 'B',
          activeRouteId: traffic.activeRouteId,
          targetRouteId: 'C' as const,
          onDrop: ({ routeProgress }: { routeId: 'C'; routeProgress: number }) => onTrafficDrop(routeProgress),
        }
      : null,
    medical: scenario === 'medical'
      ? {
          enabled: medical.phase === 'blocked' && medical.selectedFacilityId === 'facility-shiyi',
          selectedFacilityId: medical.selectedFacilityId,
          targetFacilityId: 'facility-red-cross' as const,
          onDrop: ({ routeProgress }: CommandMedicalRouteDrop) => onMedicalDrop(routeProgress),
        }
      : null,
  }), [medical.phase, medical.selectedFacilityId, onMedicalDrop, onTrafficDrop, scenario, traffic.activeRouteId, traffic.phase])

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
          ? traffic.activeRouteId
          : scenario === 'medical'
            ? medical.selectedFacilityId === 'facility-red-cross' ? 'red-cross' : 'shiyi'
            : ''}
        data-vehicle-progress={scenario === 'traffic'
          ? traffic.carProgress.toFixed(3)
          : scenario === 'medical'
            ? medical.ambulanceProgress.toFixed(3)
            : ''}
      >
        <CommandMapInteractionProvider value={interaction}>
          <div className="command-map-base">{map}</div>
        </CommandMapInteractionProvider>

        {scenario === 'traffic' && (
          <TrafficDragGuide traffic={traffic} />
        )}
        {scenario === 'medical' && (
          <MedicalDragGuide medical={medical} />
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

function TrafficDragGuide({ traffic }: { traffic: TrafficCommandState }) {
  const routeChanged = traffic.activeRouteId === 'C'
  return (
    <div className={`command-drag-guide ${routeChanged ? 'is-preview' : ''}`} aria-live="polite">
      <span><Route size={15} /></span>
      <div>
        <strong>{routeChanged ? '路线 C 已绑定地图预览' : '直接拖动车辆改线'}</strong>
        <small>{routeChanged ? '地图已切换；新方案尚未人工确认下发' : '按住清障车 02，拖到绿色推荐路线 C'}</small>
      </div>
    </div>
  )
}

function MedicalDragGuide({ medical }: { medical: MedicalCommandState }) {
  const selected = medical.selectedFacilityId === 'facility-red-cross'
  return (
    <div className={`command-drag-guide is-medical ${selected ? 'is-preview' : ''}`} aria-live="polite">
      <span><Route size={15} /></span>
      <div>
        <strong>{selected ? '红十字会医院路线已绑定预览' : '直接拖动救护车更换接收路线'}</strong>
        <small>{selected ? '地图已切换；新转运方案尚未人工批准下发' : '按住救护车 AMB-02，拖到青色候选路线'}</small>
      </div>
    </div>
  )
}
