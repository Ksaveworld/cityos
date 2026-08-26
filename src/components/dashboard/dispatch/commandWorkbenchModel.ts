export type CommandScenarioId = 'traffic' | 'medical' | 'city-order' | 'fire' | 'police' | 'major' | 'generic'

export type CommandPhase =
  | 'blocked'
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
  activeRouteId: 'B' | 'C'
  taskVersion: number | null
  taskStatus: CommandTaskStatus
  previousTask: PreviousCommandTask | null
}

export interface MedicalCommandState {
  phase: CommandPhase
  ambulanceProgress: number
  planVersion: number
  approvedVersion: number | null
  selectedFacilityId: 'facility-shiyi' | 'facility-red-cross'
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
  | { type: 'traffic/preview-reroute' }
  | { type: 'traffic/submit-reroute' }
  | { type: 'traffic/approve' }
  | { type: 'traffic/issue' }
  | { type: 'traffic/acknowledge' }
  | { type: 'traffic/start-execution' }
  | { type: 'traffic/reset' }
  | { type: 'medical/select-red-cross' }
  | { type: 'medical/submit-adjustment' }
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
  selectedFacilityId: 'facility-shiyi',
  taskVersion: 1,
  taskStatus: 'en-route',
  previousTask: null,
}

// 路线 B/C 从起点到阻塞前换道路口共线约 234.2 m。旧任务签收替换时按
// 冻结的本地 OSM 路网长度（B 约 985.3 m / C 约 1229.8 m）换算归一化进度，
// 避免车辆从 B 切到 C 时前后瞬移；未签收前最多行驶到安全分叉点。
const TRAFFIC_SAFE_DECISION_PROGRESS_B = 0.2377266150
const TRAFFIC_SAFE_DECISION_PROGRESS_C = 0.1904478302
const TRAFFIC_ROUTE_B_TO_C_PROGRESS_RATIO = 0.8011211963
const MEDICAL_SAFE_DECISION_PROGRESS_OLD = 0.1950485337
const MEDICAL_SAFE_DECISION_PROGRESS_NEW = 0.2010776026
const MEDICAL_OLD_TO_NEW_PROGRESS_RATIO = 1.0309106086

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
      const canAdvance = !['acknowledged', 'arrived'].includes(traffic.phase)
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
    case 'traffic/preview-reroute':
      if (!['blocked', 'preview'].includes(state.traffic.phase)) return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'preview',
          activeRouteId: 'C',
        },
      }
    case 'traffic/submit-reroute':
      if (state.traffic.phase !== 'preview') return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'awaiting-approval',
          planVersion: 2,
          approvedVersion: null,
          taskStatus: 'invalidated',
          previousTask: {
            version: state.traffic.taskVersion ?? state.traffic.planVersion,
            status: 'invalidated',
          },
        },
      }
    case 'traffic/approve':
      if (state.traffic.phase !== 'awaiting-approval') return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'approved',
          approvedVersion: state.traffic.planVersion,
          taskVersion: state.traffic.planVersion,
          taskStatus: 'pending-send',
        },
      }
    case 'traffic/issue':
      if (state.traffic.phase !== 'approved') return state
      return {
        ...state,
        traffic: {
          ...state.traffic,
          phase: 'sent-awaiting-ack',
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
          carProgress: Math.min(
            TRAFFIC_SAFE_DECISION_PROGRESS_C,
            state.traffic.carProgress * TRAFFIC_ROUTE_B_TO_C_PROGRESS_RATIO,
          ),
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
    case 'medical/select-red-cross':
      if (!['blocked', 'preview'].includes(state.medical.phase)) return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'preview',
          selectedFacilityId: 'facility-red-cross',
        },
      }
    case 'medical/submit-adjustment':
      if (state.medical.phase !== 'preview') return state
      return {
        ...state,
        medical: {
          ...state.medical,
          phase: 'awaiting-approval',
          planVersion: 2,
          approvedVersion: null,
          taskStatus: 'invalidated',
          previousTask: {
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
          ambulanceProgress: Math.min(
            MEDICAL_SAFE_DECISION_PROGRESS_NEW,
            state.medical.ambulanceProgress * MEDICAL_OLD_TO_NEW_PROGRESS_RATIO,
          ),
        },
      }
    case 'medical/start-execution':
      if (state.medical.phase !== 'acknowledged') return state
      return {
        ...state,
        medical: { ...state.medical, phase: 'en-route', taskStatus: 'en-route' },
      }
    case 'medical/tick': {
      if (['acknowledged', 'arrived'].includes(state.medical.phase)) return state
      const limit = state.medical.phase === 'en-route' ? 1 : MEDICAL_SAFE_DECISION_PROGRESS_OLD
      const ambulanceProgress = Math.min(limit, state.medical.ambulanceProgress + action.delta)
      const arrived = ambulanceProgress >= 1
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
