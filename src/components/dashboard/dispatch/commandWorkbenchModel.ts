import {
  isDispatchSelectableFacilityId,
  type DispatchFacilityId,
  type DispatchSelectableFacilityId,
} from './dispatchData.ts'
import {
  isTrafficSelectableRouteId,
  type TrafficSelectableRouteId,
  type TrafficStrategyRouteId,
} from './trafficStrategyRoutes.ts'

export type CommandScenarioId = 'traffic' | 'medical' | 'city-order' | 'fire' | 'police' | 'major' | 'generic'

export type CommandPhase =
  | 'blocked'
  | 'recalculating'
  | 'preview'
  | 'awaiting-approval'
  | 'approved'
  | 'sent-awaiting-ack'
  | 'acknowledged'
  | 'en-route'
  | 'arrived'
export type CommandTaskStatus =
  | 'invalidated'
  | 'pending-send'
  | 'sent-awaiting-ack'
  | 'accepted'
  | 'en-route'
  | 'arrived'
export type EvidenceReviewStatus = 'pending' | 'verified' | 'excluded'

export interface PreviousCommandTask {
  version: number
  status: 'invalidated' | 'replaced'
}

export interface CommandScenarioMeta {
  id: CommandScenarioId
  short: string
  label: string
  eventId: string
  color: string
  priority: 'P0' | 'P1'
}

export interface TrafficCommandState {
  phase: CommandPhase
  carProgress: number
  planVersion: number
  approvedVersion: number | null
  activeRouteId: TrafficStrategyRouteId
  taskVersion: number | null
  taskStatus: CommandTaskStatus
  previousTask: PreviousCommandTask | null
}

export interface MedicalCommandState {
  phase: CommandPhase
  ambulanceProgress: number
  planVersion: number
  approvedVersion: number | null
  selectedFacilityId: DispatchFacilityId
  taskVersion: number | null
  taskStatus: CommandTaskStatus
  previousTask: PreviousCommandTask | null
}

export interface EvidenceItem {
  id: string
  kind: 'image' | 'audio' | 'video'
  label: string
  source: string
  observedAt: string
  status: EvidenceReviewStatus
}

export interface CommandWorkbenchState {
  traffic: TrafficCommandState
  medical: MedicalCommandState
  evidence: EvidenceItem[]
}

export type CommandWorkbenchAction =
  | { type: 'traffic/tick'; delta: number }
  | { type: 'traffic/select-route'; routeId: TrafficSelectableRouteId; routeProgress: number }
  | { type: 'traffic/recalculation-complete'; routeId: TrafficSelectableRouteId }
  | { type: 'traffic/approve-and-issue' }
  | { type: 'traffic/acknowledge' }
  | { type: 'traffic/start-execution' }
  | { type: 'traffic/reset' }
  | { type: 'medical/select-facility'; facilityId: DispatchSelectableFacilityId; routeProgress: number }
  | { type: 'medical/recalculation-complete' }
  | { type: 'medical/approve' }
  | { type: 'medical/issue' }
  | { type: 'medical/acknowledge' }
  | { type: 'medical/start-execution' }
  | { type: 'medical/tick'; delta: number }
  | { type: 'medical/reset' }
  | { type: 'evidence/review'; evidenceId: string; status: Exclude<EvidenceReviewStatus, 'pending'> }

export const COMMAND_SCENARIOS: CommandScenarioMeta[] = [
  { id: 'traffic', short: '交通', label: '中山路事故清障', eventId: 'ev-traffic-zhongshan', color: '#B8860B', priority: 'P0' },
  { id: 'medical', short: '120', label: '盘福路急救保障', eventId: 'ev-medical-panfu', color: '#0E9AA7', priority: 'P0' },
  { id: 'city-order', short: '市容', label: '北京路夜市秩序', eventId: 'ev-city-order-beijing', color: '#C26A2E', priority: 'P1' },
  { id: 'fire', short: '119', label: '高层建筑火情', eventId: 'ev-fire-finance', color: '#E5484D', priority: 'P1' },
  { id: 'police', short: '110', label: '广州站治安警情', eventId: 'ev-police-station-delay', color: '#2F6FDA', priority: 'P1' },
  { id: 'major', short: '布防', label: '体育中心专项布防', eventId: 'ev-major-tianhe', color: '#7C3AED', priority: 'P1' },
]

const INITIAL_TRAFFIC_STATE: TrafficCommandState = {
  phase: 'blocked',
  carProgress: 0.12,
  planVersion: 1,
  approvedVersion: 1,
  activeRouteId: 'B',
  taskVersion: 1,
  taskStatus: 'en-route',
  previousTask: null,
}

const INITIAL_MEDICAL_STATE: MedicalCommandState = {
  phase: 'blocked',
  ambulanceProgress: 0.08,
  planVersion: 1,
  approvedVersion: 1,
  selectedFacilityId: 'facility-medical-reference',
  taskVersion: 1,
  taskStatus: 'en-route',
  previousTask: null,
}

// 路线 B 从起点到阻塞前换道路口约 234.2 m；在负责人尚未拖放改线时，
// 车辆最多移动到这处安全决策点。选择候选后的位置直接来自地图对路线 A / C 的吸附进度。
const TRAFFIC_SAFE_DECISION_PROGRESS_B = 0.2377266150
const MEDICAL_SAFE_DECISION_PROGRESS_OLD = 0.1950485337

export function createInitialCommandWorkbenchState(): CommandWorkbenchState {
  return {
    traffic: { ...INITIAL_TRAFFIC_STATE },
    medical: { ...INITIAL_MEDICAL_STATE },
    evidence: [
      {
        id: 'merchant-image',
        kind: 'image',
        label: '商户上报：通道堆物图片',
        source: '北京路商户上报模板 · 模拟',
        observedAt: '22:41:08',
        status: 'pending',
      },
      {
        id: 'patrol-audio',
        kind: 'audio',
        label: '巡查人员：占道范围语音',
        source: '市容巡查语音模板 · 模拟',
        observedAt: '22:41:32',
        status: 'pending',
      },
      {
        id: 'camera-video',
        kind: 'video',
        label: '路口视频：人流与通道关系',
        source: '视频片段占位样例 · 模拟',
        observedAt: '22:42:05',
        status: 'pending',
      },
    ],
  }
}

export function commandScenarioForEvent(eventId: string | null | undefined): CommandScenarioId {
  return COMMAND_SCENARIOS.find((item) => item.eventId === eventId)?.id ?? 'generic'
}

export function commandWorkbenchReducer(
  state: CommandWorkbenchState,
  action: CommandWorkbenchAction,
): CommandWorkbenchState {
  switch (action.type) {
    case 'traffic/tick': {
      const traffic = state.traffic
      const canAdvance = ['blocked', 'en-route'].includes(traffic.phase)
      if (!canAdvance) return state
      const limit = traffic.phase === 'en-route' ? 1 : TRAFFIC_SAFE_DECISION_PROGRESS_B
      const carProgress = Math.min(limit, traffic.carProgress + action.delta)
      const arrived = traffic.phase === 'en-route' && carProgress >= 1
      return {
        ...state,
        traffic: {
          ...traffic,
          carProgress,
          phase: arrived ? 'arrived' : traffic.phase,
          taskStatus: arrived ? 'arrived' : traffic.phase === 'en-route' ? 'en-route' : traffic.taskStatus,
        },
      }
    }
    case 'traffic/select-route': {
      const editable = ['blocked', 'recalculating', 'awaiting-approval'].includes(state.traffic.phase)
      if (!editable || !isTrafficSelectableRouteId(action.routeId)) return state
      if (state.traffic.activeRouteId === action.routeId) return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'recalculating',
          activeRouteId: action.routeId,
          carProgress: Math.max(0.05, Math.min(0.95, action.routeProgress)),
        },
      }
    }
    case 'traffic/recalculation-complete':
      if (state.traffic.phase !== 'recalculating' || state.traffic.activeRouteId !== action.routeId) return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'awaiting-approval',
          planVersion: state.traffic.approvedVersion === state.traffic.planVersion
            ? state.traffic.planVersion + 1
            : state.traffic.planVersion,
          approvedVersion: null,
          taskStatus: 'invalidated',
          previousTask: state.traffic.previousTask ?? {
            version: state.traffic.taskVersion ?? state.traffic.planVersion,
            status: 'invalidated',
          },
        },
      }
    case 'traffic/approve-and-issue':
      if (state.traffic.phase !== 'awaiting-approval') return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'sent-awaiting-ack',
          approvedVersion: state.traffic.planVersion,
          taskVersion: state.traffic.planVersion,
          taskStatus: 'sent-awaiting-ack',
        },
      }
    case 'traffic/acknowledge':
      if (state.traffic.phase !== 'sent-awaiting-ack') return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'acknowledged',
          taskStatus: 'accepted',
          previousTask: state.traffic.previousTask
            ? { ...state.traffic.previousTask, status: 'replaced' }
            : null,
        },
      }
    case 'traffic/start-execution':
      if (state.traffic.phase !== 'acknowledged') return state
      return {
        ...state,
        traffic: { ...state.traffic, phase: 'en-route', taskStatus: 'en-route' },
      }
    case 'traffic/reset':
      return { ...state, traffic: { ...INITIAL_TRAFFIC_STATE } }
    case 'medical/select-facility': {
      const editable = ['blocked', 'recalculating', 'awaiting-approval'].includes(state.medical.phase)
      if (!editable || !isDispatchSelectableFacilityId(action.facilityId)) return state
      if (state.medical.selectedFacilityId === action.facilityId) return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'recalculating',
          selectedFacilityId: action.facilityId,
          ambulanceProgress: Math.max(0.05, Math.min(0.95, action.routeProgress)),
        },
      }
    }
    case 'medical/recalculation-complete':
      if (state.medical.phase !== 'recalculating') return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'awaiting-approval',
          planVersion: state.medical.approvedVersion === state.medical.planVersion
            ? state.medical.planVersion + 1
            : state.medical.planVersion,
          approvedVersion: null,
          taskStatus: 'invalidated',
          previousTask: state.medical.previousTask ?? {
            version: state.medical.taskVersion ?? state.medical.planVersion,
            status: 'invalidated',
          },
        },
      }
    case 'medical/approve':
      if (state.medical.phase !== 'awaiting-approval') return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'approved',
          approvedVersion: state.medical.planVersion,
          taskVersion: state.medical.planVersion,
          taskStatus: 'pending-send',
        },
      }
    case 'medical/issue':
      if (state.medical.phase !== 'approved') return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'sent-awaiting-ack',
          taskStatus: 'sent-awaiting-ack',
        },
      }
    case 'medical/acknowledge':
      if (state.medical.phase !== 'sent-awaiting-ack') return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'acknowledged',
          taskStatus: 'accepted',
          previousTask: state.medical.previousTask
            ? { ...state.medical.previousTask, status: 'replaced' }
            : null,
        },
      }
    case 'medical/start-execution':
      if (state.medical.phase !== 'acknowledged') return state
      return {
        ...state,
        medical: { ...state.medical, phase: 'en-route', taskStatus: 'en-route' },
      }
    case 'medical/tick': {
      const canAdvance = ['blocked', 'en-route'].includes(state.medical.phase)
      if (!canAdvance) return state
      const limit = state.medical.phase === 'en-route' ? 1 : MEDICAL_SAFE_DECISION_PROGRESS_OLD
      const ambulanceProgress = Math.min(limit, state.medical.ambulanceProgress + action.delta)
      const arrived = state.medical.phase === 'en-route' && ambulanceProgress >= 1
      return {
        ...state,
        medical: {
          ...state.medical,
          ambulanceProgress,
          phase: arrived ? 'arrived' : state.medical.phase,
          taskStatus: arrived ? 'arrived' : state.medical.phase === 'en-route' ? 'en-route' : state.medical.taskStatus,
        },
      }
    }
    case 'medical/reset':
      return { ...state, medical: { ...INITIAL_MEDICAL_STATE } }
    case 'evidence/review':
      return {
        ...state,
        evidence: state.evidence.map((item) => (
          item.id === action.evidenceId ? { ...item, status: action.status } : item
        )),
      }
  }
}
