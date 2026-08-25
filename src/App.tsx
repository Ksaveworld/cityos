import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ArrowRight, BellRing, MapPinned, RotateCcw, Wifi } from 'lucide-react'

import { CityMap } from '@/components/CityMap'
import {
  DISPATCH_UNITS,
  HISTORICAL_CASES,
  INITIAL_ALERTS,
  LIVE_DEMO_STEPS,
  TODAY_EVENTS,
  type HistoricalCase,
  type IncidentFilter,
  type TodayEvent,
} from '@/components/dashboard/board/boardData'
import { CityPulseRail } from '@/components/dashboard/board/CityPulseRail'
import { CityRealtimeBand } from '@/components/dashboard/board/CityRealtimeBand'
import { CityOverviewLoading } from '@/components/dashboard/board/CityOverviewLoading'
import { CityOverviewSummary } from '@/components/dashboard/board/CityOverviewSummary'
import type { PoiMarkerDatum } from '@/components/dashboard/map/MapPoiMarkers'
import { ResourceDispatchRail } from '@/components/dashboard/dispatch/ResourceDispatchRail'
import { ResourceDispatchPanel } from '@/components/dashboard/dispatch/ResourceDispatchPanel'
import { ResourceDispatchWorkspace } from '@/components/dashboard/dispatch/ResourceDispatchWorkspace'
import {
  ActiveEventDispatchContext,
  type ActiveDispatchEvent,
} from '@/components/dashboard/dispatch/ActiveEventDispatch'
import {
  DISPATCH_CASES,
  DISPATCH_FACILITIES,
  createDispatchDraft,
  createInitialDispatchAssignments,
  createInitialDispatchOperations,
  dispatchDraftChanged,
  findAssignedEvent,
  getDispatchCase,
  getDispatchEvent,
  getDispatchUnit,
  resolveDispatchScenarioId,
  type DispatchAssignment,
  type DispatchDraft,
  type DispatchOperation,
} from '@/components/dashboard/dispatch/dispatchData'
import {
  createRoutineHospitalTransfer,
  resolveRoutineHospitalFacilityId,
} from '@/components/dashboard/dispatch/hospitalStrategyRoutes'
import { KnowledgeBasePanel } from '@/components/dashboard/knowledge/KnowledgeBasePanel'
import { RightPanel } from '@/components/dashboard/RightPanel'
import {
  deriveExecutionFrame,
  type ExecutionPlaybackState,
} from '@/components/dashboard/execution/executionPlayback'
import { STATION_EXECUTIONS } from '@/components/dashboard/historical/stationHistory'
import {
  createHistoricalWorkflowFixture,
  createHistoricalWorkflowSession,
  createInitialHistoricalWorkflowSessions,
} from '@/components/dashboard/historical/historicalWorkflow'
import { HISTORICAL_REVIEW_CASES, isHistoricalReviewCaseId } from '@/components/dashboard/historical/reviewCases'
import {
  ScenarioMap,
  type ScenarioMapVariant,
} from '@/components/dashboard/ScenarioMap'
import { TopNav, type Workspace } from '@/components/dashboard/TopNav'
import {
  DEFAULT_MAP_LAYERS,
  type MapLayerId,
} from '@/components/dashboard/mapLayers'
import type { FireMode } from '@/components/dashboard/fireModes'
import { DOMAIN_FIXTURES, WORKFLOW_FIXTURES, findFixtureByScenarioId } from '@/components/dashboard/workflow/fixtures'
import {
  advanceDelivery,
  adjustWorkflow,
  applyTaskDispatchOverride,
  approveWorkflow,
  createWorkflowSession,
  runControlledRetry,
  selectPlan,
  sendSimulatedTasks,
  validateInput,
} from '@/components/dashboard/workflow/state'
import type { DomainFixture, TaskDispatchOverride, WorkflowSession } from '@/components/dashboard/workflow/types'
import { createScenario, type Plan, type Scenario } from '@/engine'
import { loadSite } from '@/lib/loadSite'
import { HomePage } from '@/pages/HomePage'
import {
  buildRoutingView,
  createRoutingRuntime,
  type ClosedWay,
  type MedicalSupportOrigin,
  type MedicalSupportRoute,
  type RoutingRuntime,
} from '@/pages/routingViewModel'

const V3App = lazy(() => import('@/v3/App').then((module) => ({ default: module.V3App })))

const MEDICAL_DISPATCH_HOSPITAL = '广州市第一人民医院'
const RIGHT_PANEL_STORAGE_KEY = 'cityos.rightPanelWidth'
// 态势总览撤掉右侧面板后，可拖拽的右栏只剩事件处置与知识库两态，共用一个下限。
const RIGHT_PANEL_MIN_WIDTH = 360
const RIGHT_PANEL_MAX_RATIO = 0.46
const RIGHT_PANEL_KEYBOARD_STEP = 16
const BASE_ENROUTE_UNIT_COUNT = DISPATCH_UNITS.filter((unit) => unit.status === 'enroute').length

type DispatchWorkflowEntry =
  | { kind: 'daily'; eventId: string; scenarioId: string; source: 'resources' | 'workflow'; session?: WorkflowSession }
  | { kind: 'historical'; caseId: string; scenarioId: string }

function createInitialWorkflowSessions() {
  const sessions: Record<string, WorkflowSession> = {}
  for (const fixture of WORKFLOW_FIXTURES) {
    sessions[fixture.scenarioId] = createWorkflowSession(fixture)
  }
  return sessions
}

function createDispatchDemoSession(fixture: DomainFixture) {
  const created = createWorkflowSession(fixture)
  const validated = validateInput(created, created.inputMode, created.inputTemplateId)
  const selected = selectPlan(validated, fixture.plans[0].id)
  const approved = approveWorkflow(selected)
  const delivered = sendSimulatedTasks(approved)
  return advanceDelivery(advanceDelivery(advanceDelivery(delivered)))
}

function createResourceDispatchEntry(
  eventId: string,
  workflowSessions: Record<string, WorkflowSession>,
  source: 'resources' | 'workflow' = 'resources',
): DispatchWorkflowEntry | null {
  const dispatchCase = getDispatchCase(eventId)
  if (!dispatchCase) return null
  const fixture = findFixtureByScenarioId(dispatchCase.scenarioId)
  const currentSession = workflowSessions[dispatchCase.scenarioId]
  const session = currentSession?.deliveryStatus === 'completed'
    ? currentSession
    : createDispatchDemoSession(fixture)
  return { kind: 'daily', eventId, scenarioId: dispatchCase.scenarioId, source, session }
}

function workflowStageToStep(session: WorkflowSession) {
  if (session.stage === 'input') return 0
  if (session.stage === 'brief') return 3
  if (session.stage === 'strategy') return 4
  if (session.stage === 'task') return 6
  if (session.stage === 'execution') return 7
  return 8
}

function readStoredRightPanelWidth() {
  try {
    const storedWidth = window.localStorage.getItem(RIGHT_PANEL_STORAGE_KEY)
    if (storedWidth === null || storedWidth.trim() === '') return null
    const parsedWidth = Number(storedWidth)
    return Number.isFinite(parsedWidth) ? parsedWidth : null
  } catch {
    return null
  }
}

function persistRightPanelWidth(width: number | null) {
  try {
    if (width === null) {
      window.localStorage.removeItem(RIGHT_PANEL_STORAGE_KEY)
    } else {
      window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(width))
    }
  } catch {
    // 存储不可用时仍保留当前会话内的拖拽结果。
  }
}

function clampRightPanelWidth(width: number, containerWidth: number) {
  const maxWidth = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.floor(containerWidth * RIGHT_PANEL_MAX_RATIO))
  return Math.min(Math.max(Math.round(width), RIGHT_PANEL_MIN_WIDTH), maxWidth)
}

function resolveMedicalOrigin(resources: GeoJSON.FeatureCollection): MedicalSupportOrigin {
  const matches = resources.features.filter(
    (feature) => feature.geometry?.type === 'Point' && feature.properties?.name === MEDICAL_DISPATCH_HOSPITAL,
  )
  if (matches.length !== 1) {
    throw new Error(`120 出发医院「${MEDICAL_DISPATCH_HOSPITAL}」需要唯一公开点位，当前匹配 ${matches.length} 个`)
  }

  const geometry = matches[0].geometry
  if (!geometry || geometry.type !== 'Point') {
    throw new Error(`120 出发医院「${MEDICAL_DISPATCH_HOSPITAL}」缺少 Point 坐标`)
  }
  const [lng, lat] = geometry.coordinates
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`120 出发医院「${MEDICAL_DISPATCH_HOSPITAL}」坐标无效`)
  }

  return {
    name: MEDICAL_DISPATCH_HOSPITAL,
    location: [lng, lat],
  }
}

export default function App() {
  const [useV3, setUseV3] = useState(() => window.location.hash.startsWith('#/v3'))

  useEffect(() => {
    const sync = () => setUseV3(window.location.hash.startsWith('#/v3'))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  if (useV3) {
    return (
      <Suspense fallback={<div className="grid h-svh place-items-center bg-[#070b14] text-xs text-[#64748b]">载入地图</div>}>
        <V3App />
      </Suspense>
    )
  }
  return <LegacyApp />
}

function LegacyApp() {
  const [showHome, setShowHome] = useState(() => window.location.hash === '' || window.location.hash === '#/home')
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [routing, setRouting] = useState<RoutingRuntime | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [medicalRoute, setMedicalRoute] = useState<MedicalSupportRoute | null>(null)
  const [routeWayIds, setRouteWayIds] = useState<{ planA: string[]; planB: string[]; medical: string[] }>({
    planA: [],
    planB: [],
    medical: [],
  })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeScenarioId, setActiveScenarioId] = useState('liwan-fire')
  // 首屏默认走日常响应，不是 5·16 复盘。复盘是「当年如果用了我们这套会怎样」的
  // 佐证材料，不是产品的主场景——进来第一眼看到回放，会让人以为这只是个复盘工具。
  // 复盘仍可从事件台账和沉淀知识库进入。
  const [fireMode, setFireMode] = useState<FireMode>('routine-simulation')
  const [workflowSessions, setWorkflowSessions] = useState<Record<string, WorkflowSession>>(createInitialWorkflowSessions)
  const [historicalWorkflowSessions, setHistoricalWorkflowSessions] = useState(createInitialHistoricalWorkflowSessions)
  const [stationExecutionPlayback, setStationExecutionPlayback] = useState<ExecutionPlaybackState | null>(null)
  const stationExecutionDefinition = stationExecutionPlayback
    ? Object.values(STATION_EXECUTIONS).find((definition) => definition.id === stationExecutionPlayback.definitionId) ?? null
    : null
  const stationExecutionFrame = useMemo(() => (
    stationExecutionDefinition && stationExecutionPlayback
      ? deriveExecutionFrame(stationExecutionDefinition, stationExecutionPlayback)
      : null
  ), [stationExecutionDefinition, stationExecutionPlayback])
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const route = window.location.hash.replace(/^#\//, '')
    return ['overview', 'incidents', 'resources', 'review'].includes(route)
      ? route as Workspace
      : 'overview'
  })
  const [rightView, setRightView] = useState<'list' | 'detail'>('list')
  const [mapLayers, setMapLayers] = useState(() => ({ ...DEFAULT_MAP_LAYERS }))
  const [resourceReferenceVisible, setResourceReferenceVisible] = useState(false)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [selectedDispatchEventId, setSelectedDispatchEventId] = useState<string | null>(null)
  const [dispatchWorkflowEntry, setDispatchWorkflowEntry] = useState<DispatchWorkflowEntry | null>(null)
  const [dispatchEntryNotice, setDispatchEntryNotice] = useState<string | null>(null)
  const [dispatchPromptRequest, setDispatchPromptRequest] = useState<{ id: string; text: string } | null>(null)
  const [dispatchResolutionOptionId, setDispatchResolutionOptionId] = useState('')
  const [dispatchAssignments, setDispatchAssignments] = useState<Record<string, DispatchAssignment>>(createInitialDispatchAssignments)
  const [dispatchOperations, setDispatchOperations] = useState<Record<string, DispatchOperation>>(createInitialDispatchOperations)
  const [dispatchDrafts, setDispatchDrafts] = useState<Record<string, DispatchDraft>>({})
  const [incidentFilter, setIncidentFilter] = useState<IncidentFilter>('all')
  const [todayEvents, setTodayEvents] = useState(() => [...TODAY_EVENTS])
  const [liveEnrouteBonus, setLiveEnrouteBonus] = useState(0)
  const liveStepRef = useRef(0)
  const [selectedTodayEventId, setSelectedTodayEventId] = useState<string | null>(null)
  const [cityFocusRevision, setCityFocusRevision] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [activeHistoricalCaseId, setActiveHistoricalCaseId] = useState<string | null>(null)
  const [activePlanId, setActivePlanId] = useState('plan-a')
  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null)
  const [closedWays, setClosedWays] = useState<ClosedWay[]>([])
  const [routeStale, setRouteStale] = useState(false)
  const [routeMessage, setRouteMessage] = useState('正在构建荔湾路网')
  const [mapFocusRevision, setMapFocusRevision] = useState(0)
  const [scenarioFocusRevision, setScenarioFocusRevision] = useState(0)
  const [rightPanelWidth, setRightPanelWidth] = useState<number | null>(readStoredRightPanelWidth)
  const [measuredRightPanelWidth, setMeasuredRightPanelWidth] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const panelDragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
    latestWidth: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (workspace !== 'resources' || dispatchWorkflowEntry) return
    const defaultCase = DISPATCH_CASES[0]
    if (!defaultCase) return
    setDispatchWorkflowEntry(createResourceDispatchEntry(defaultCase.eventId, workflowSessions))
  }, [dispatchWorkflowEntry, workflowSessions, workspace])

  useEffect(() => {
    Promise.all([
      loadSite(),
      fetch('/data/liwan_roads.geojson').then((response) => {
        if (!response.ok) throw new Error(`liwan_roads.geojson 取不到，HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      }),
      fetch('/data/liwan_resources.geojson').then((response) => {
        if (!response.ok) throw new Error(`liwan_resources.geojson 取不到，HTTP ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      }),
    ])
      .then(([site, roads, resources]) => {
        const nextScenario = createScenario(site)
        const medicalOrigin = resolveMedicalOrigin(resources)
        const nextRouting = createRoutingRuntime(roads, site, medicalOrigin)
        const result = buildRoutingView(nextRouting, nextScenario, [])
        if (!result.ok) throw new Error(result.message)
        setScenario(nextScenario)
        setRouting(nextRouting)
        setPlans(result.plans)
        setMedicalRoute(result.medicalRoute)
        setRouteWayIds(result.routeWayIds)
        setRouteMessage(result.message)
      })
      .catch((error: Error) => setLoadError(error.message))
  }, [])

  useEffect(() => {
    if (showHome || liveStepRef.current >= LIVE_DEMO_STEPS.length) return
    const timer = window.setInterval(() => {
      const index = liveStepRef.current
      const step = LIVE_DEMO_STEPS[index]
      if (!step) {
        window.clearInterval(timer)
        return
      }
      liveStepRef.current += 1
      const time = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date())
      setTodayEvents((events) => [...events, { ...step.event, id: `${step.event.id}-${index + 1}`, time }])
      if (step.enrouteDelta) setLiveEnrouteBonus((count) => count + step.enrouteDelta)
      if (liveStepRef.current >= LIVE_DEMO_STEPS.length) window.clearInterval(timer)
    }, 12000)
    return () => window.clearInterval(timer)
  }, [showHome])

  const requestRouteFocus = useCallback(() => {
    setMapFocusRevision((revision) => revision + 1)
  }, [])

  const applyClosedWays = useCallback(
    (
      nextClosedWays: ClosedWay[],
      change?: Parameters<typeof buildRoutingView>[3],
    ) => {
      if (!routing || !scenario) return
      const result = buildRoutingView(routing, scenario, nextClosedWays, change)
      setClosedWays(nextClosedWays)
      setApprovedPlanId(null)
      if (result.ok) {
        setPlans(result.plans)
        setMedicalRoute(result.medicalRoute)
        setRouteWayIds(result.routeWayIds)
        setRouteStale(false)
        setRouteMessage(result.message)
      } else {
        setRouteStale(true)
        setRouteMessage(result.message)
      }
    },
    [routing, scenario],
  )

  // 下面这些回调都要保持引用稳定，否则 memo 过的子组件仍会每次重渲染。
  const closeWay = useCallback(
    (way: ClosedWay) => {
      if (closedWays.some((item) => item.id === way.id)) return
      applyClosedWays([...closedWays, way], { type: 'close', way })
    },
    [closedWays, applyClosedWays],
  )

  const removeClosedWay = useCallback(
    (wayId: string) => {
      const way = closedWays.find((item) => item.id === wayId)
      if (!way) return
      applyClosedWays(closedWays.filter((item) => item.id !== wayId), { type: 'restore', way })
    },
    [closedWays, applyClosedWays],
  )

  const undoClosedWay = useCallback(
    () => {
      const way = closedWays.at(-1)
      if (!way) return
      applyClosedWays(closedWays.slice(0, -1), { type: 'restore', way })
    },
    [closedWays, applyClosedWays],
  )

  const clearClosedWays = useCallback(() => applyClosedWays([], { type: 'clear' }), [applyClosedWays])

  const resetDemo = useCallback(() => {
    setActiveScenarioId('liwan-fire')
    setFireMode('public-review')
    setWorkflowSessions(createInitialWorkflowSessions())
    setHistoricalWorkflowSessions(createInitialHistoricalWorkflowSessions())
    setStationExecutionPlayback(null)
    setWorkspace('overview')
    setActiveStep(0)
    setActiveHistoricalCaseId(null)
    setActivePlanId('plan-a')
    setRightView('list')
    setResourceReferenceVisible(false)
    setSelectedUnitId(null)
    setSelectedDispatchEventId(null)
    setDispatchWorkflowEntry(null)
    setDispatchEntryNotice(null)
    setDispatchPromptRequest(null)
    setDispatchResolutionOptionId('')
    setDispatchAssignments(createInitialDispatchAssignments())
    setDispatchOperations(createInitialDispatchOperations())
    setDispatchDrafts({})
    setIncidentFilter('all')
    setSelectedTodayEventId(null)
    setApprovedPlanId(null)
    applyClosedWays([], { type: 'clear' })
  }, [applyClosedWays])

  const toggleMapLayer = useCallback((layer: MapLayerId) => {
    setMapLayers((current) => ({ ...current, [layer]: !current[layer] }))
  }, [])

  const navigateWorkspace = useCallback(
    (next: Workspace) => {
      setShowHome(false)
      window.location.hash = `#/${next}`
      if (next === 'overview') {
        setActiveHistoricalCaseId(null)
        setWorkspace('overview')
        setRightView('list')
        setSelectedTodayEventId(null)
        return
      }
      if (next === 'incidents') {
        setActiveHistoricalCaseId(null)
        setWorkspace('incidents')
        setRightView('list')
        setIncidentFilter('all')
        setSelectedTodayEventId(null)
        setResourceReferenceVisible(false)
        return
      }
      if (next === 'resources') {
        setActiveHistoricalCaseId(null)
        setWorkspace('resources')
        const defaultCase = DISPATCH_CASES[0]
        setDispatchWorkflowEntry(defaultCase ? createResourceDispatchEntry(defaultCase.eventId, workflowSessions) : null)
        setResourceReferenceVisible(false)
        setSelectedDispatchEventId(null)
        setDispatchEntryNotice(null)
        setDispatchPromptRequest(null)
        setDispatchResolutionOptionId('')
        setSelectedUnitId(null)
        return
      }

      // 知识库是"沉淀推演"的列表态，不再劫持到 5·16 复盘详情；
      // 地图与事件状态保持原样挂载，由知识库覆盖层盖住。
      setWorkspace('review')
      setActiveHistoricalCaseId(null)
    },
    [workflowSessions],
  )

  const openHome = useCallback(() => {
    setShowHome(true)
    setActiveHistoricalCaseId(null)
    window.location.hash = '#/home'
  }, [])

  const openOverviewKpi = useCallback((kpiId: string) => {
    setShowHome(false)
    setRightView('list')
    if (kpiId === 'units-enroute') {
      window.location.hash = '#/resources'
      setWorkspace('resources')
      const defaultCase = DISPATCH_CASES[0]
      setDispatchWorkflowEntry(defaultCase ? createResourceDispatchEntry(defaultCase.eventId, workflowSessions) : null)
      setResourceReferenceVisible(false)
      setSelectedDispatchEventId(null)
      setDispatchEntryNotice(null)
      setDispatchPromptRequest(null)
      setDispatchResolutionOptionId('')
      setSelectedUnitId(null)
      return
    }
    window.location.hash = '#/incidents'
    setWorkspace('incidents')
    setResourceReferenceVisible(false)
    setSelectedTodayEventId(null)
    setIncidentFilter(kpiId === 'pending-decision' ? 'pending-decision' : kpiId === 'exec-anomaly' ? 'abnormal' : 'all')
  }, [workflowSessions])

  const changeIncidentFilter = useCallback((filter: IncidentFilter) => {
    setIncidentFilter(filter)
    setSelectedTodayEventId(null)
    setCityFocusRevision((revision) => revision + 1)
  }, [])

  const selectTodayEvent = useCallback((eventId: string | null) => {
    setSelectedTodayEventId(eventId)
    setCityFocusRevision((revision) => revision + 1)
  }, [])

  const selectDispatchUnit = useCallback((unitId: string | null) => {
    setSelectedUnitId(unitId)
    setCityFocusRevision((revision) => revision + 1)
  }, [])

  const clearDispatchSelection = useCallback(() => setSelectedUnitId(null), [])

  const changeRightView = useCallback((view: 'list' | 'detail') => {
    setRightView(view)
    if (view === 'list') {
      setActiveHistoricalCaseId(null)
      setStationExecutionPlayback(null)
    }
    setWorkspace('incidents')
  }, [])

  const updateActiveWorkflowSession = useCallback((nextSession: WorkflowSession) => {
    if (isHistoricalReviewCaseId(activeHistoricalCaseId)) {
      setHistoricalWorkflowSessions((sessions) => ({ ...sessions, [activeHistoricalCaseId]: nextSession }))
      return
    }
    const fixture = findFixtureByScenarioId(activeScenarioId)
    setWorkflowSessions((sessions) => ({ ...sessions, [fixture.scenarioId]: nextSession }))
  }, [activeHistoricalCaseId, activeScenarioId])

  const openDomainScenario = useCallback((scenarioId: string) => {
    setActiveHistoricalCaseId(null)
    setSelectedTodayEventId(null)
    setStationExecutionPlayback(null)
    setActiveScenarioId(scenarioId)
    setScenarioFocusRevision((revision) => revision + 1)
    setActiveStep(0)
    setWorkspace('incidents')
    setRightView('detail')
  }, [])

  const enterTodayEventWorkflow = useCallback((event: TodayEvent) => {
    const scenarioId = resolveDispatchScenarioId(event)
    if (!scenarioId) return
    setActiveHistoricalCaseId(null)
    setDispatchWorkflowEntry(null)
    setSelectedTodayEventId(event.id)
    setStationExecutionPlayback(null)
    setActiveScenarioId(scenarioId)
    setScenarioFocusRevision((revision) => revision + 1)
    const session = workflowSessions[scenarioId]
    setActiveStep(session ? workflowStageToStep(session) : 0)
    setWorkspace('incidents')
    setRightView('detail')
    if (scenarioId === 'liwan-fire') setFireMode('routine-simulation')
  }, [workflowSessions])

  // 历史案例首次进入时直接打开 AI Brief；再次进入时恢复独立会话，重置只由“重置演示”触发。
  const enterHistoricalCase = useCallback((entry: HistoricalCase) => {
    if (!entry.workflowScenarioId || !isHistoricalReviewCaseId(entry.id)) {
      navigateWorkspace('review')
      return
    }
    const historicalCaseId = entry.id
    const existingSession = historicalWorkflowSessions[historicalCaseId] ?? null
    setDispatchWorkflowEntry(null)
    setActiveScenarioId(entry.workflowScenarioId)
    setScenarioFocusRevision((revision) => revision + 1)
    setWorkspace('incidents')
    setRightView('detail')
    setApprovedPlanId(null)
    setActiveHistoricalCaseId(historicalCaseId)
    setActivePlanId(existingSession?.selectedPlanId ?? 'plan-a')
    setActiveStep(existingSession ? workflowStageToStep(existingSession) : 3)
    setHistoricalWorkflowSessions((sessions) => sessions[historicalCaseId]
      ? sessions
      : { ...sessions, [historicalCaseId]: createHistoricalWorkflowSession(historicalCaseId) })
    if (entry.reviewMode) {
      setFireMode('public-review')
      return
    }
    setStationExecutionPlayback(null)
  }, [historicalWorkflowSessions, navigateWorkspace])

  const openDispatchEvent = useCallback((eventId: string) => {
    const entry = createResourceDispatchEntry(eventId, workflowSessions)
    if (!entry) return
    setDispatchWorkflowEntry(entry)
    setSelectedDispatchEventId(null)
    setSelectedUnitId(null)
    setDispatchEntryNotice(null)
    setDispatchPromptRequest(null)
    setDispatchResolutionOptionId('')
    setCityFocusRevision((revision) => revision + 1)
  }, [workflowSessions])

  const openResourcesForActiveScenario = useCallback(() => {
    const historicalCaseId = isHistoricalReviewCaseId(activeHistoricalCaseId) ? activeHistoricalCaseId : null
    const selectedDailyEvent = selectedTodayEventId
      ? todayEvents.find((event) => event.id === selectedTodayEventId) ?? null
      : null
    const dailyEvent = selectedDailyEvent && resolveDispatchScenarioId(selectedDailyEvent) === activeScenarioId
      ? selectedDailyEvent
      : null
    const fallbackEvent = DISPATCH_CASES.find((item) => item.scenarioId === activeScenarioId) ?? null
    setShowHome(false)
    window.location.hash = '#/resources'
    setWorkspace('resources')
    setResourceReferenceVisible(false)
    setSelectedUnitId(null)
    setSelectedDispatchEventId(null)
    setDispatchEntryNotice(null)
    setDispatchPromptRequest(null)
    setDispatchResolutionOptionId('')
    if (historicalCaseId) {
      setDispatchWorkflowEntry({ kind: 'historical', caseId: historicalCaseId, scenarioId: activeScenarioId })
      return
    }
    const eventId = dailyEvent?.id ?? fallbackEvent?.eventId ?? null
    if (!eventId) {
      setDispatchWorkflowEntry(null)
      setSelectedDispatchEventId(null)
      setDispatchEntryNotice('当前事件尚未形成可展示的任务包，已保留全城调度视图。')
      return
    }
    setDispatchWorkflowEntry({ kind: 'daily', eventId, scenarioId: activeScenarioId, source: 'workflow' })
  }, [activeHistoricalCaseId, activeScenarioId, selectedTodayEventId, todayEvents])

  const applyDispatchResolution = useCallback((resolution: TaskDispatchOverride) => {
    if (!dispatchWorkflowEntry) return
    window.location.hash = '#/incidents'
    setWorkspace('incidents')
    setRightView('detail')
    setActiveStep(6)
    setStationExecutionPlayback(null)
    if (dispatchWorkflowEntry.kind === 'historical' && isHistoricalReviewCaseId(dispatchWorkflowEntry.caseId)) {
      const caseId = dispatchWorkflowEntry.caseId
      setActiveHistoricalCaseId(caseId)
      setActiveScenarioId(dispatchWorkflowEntry.scenarioId)
      setHistoricalWorkflowSessions((sessions) => ({
        ...sessions,
        [caseId]: applyTaskDispatchOverride(sessions[caseId] ?? createHistoricalWorkflowSession(caseId), resolution),
      }))
    } else if (dispatchWorkflowEntry.kind === 'daily') {
      setActiveHistoricalCaseId(null)
      setActiveScenarioId(dispatchWorkflowEntry.scenarioId)
      setSelectedTodayEventId(dispatchWorkflowEntry.eventId)
      setWorkflowSessions((sessions) => {
        const fixture = findFixtureByScenarioId(dispatchWorkflowEntry.scenarioId)
        const session = dispatchWorkflowEntry.session ?? sessions[dispatchWorkflowEntry.scenarioId] ?? createWorkflowSession(fixture)
        return { ...sessions, [dispatchWorkflowEntry.scenarioId]: applyTaskDispatchOverride(session, resolution) }
      })
    }
    setDispatchResolutionOptionId('')
    setDispatchWorkflowEntry(null)
  }, [dispatchWorkflowEntry])

  const closeDispatchEvent = useCallback(() => {
    if (!selectedDispatchEventId) return
    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    const assignment = dispatchAssignments[selectedDispatchEventId]
    const draft = dispatchDrafts[selectedDispatchEventId]
    const session = dispatchCase ? workflowSessions[dispatchCase.scenarioId] : null
    const operation = dispatchOperations[selectedDispatchEventId]
    if (draft && assignment && session && operation?.status === 'idle'
      && dispatchDraftChanged(draft, assignment, session)
      && !window.confirm('当前调整尚未应用，是否放弃草稿并关闭？')) return
    setSelectedDispatchEventId(null)
    setSelectedUnitId(null)
  }, [dispatchAssignments, dispatchDrafts, dispatchOperations, selectedDispatchEventId, workflowSessions])

  const changeDispatchDraft = useCallback((draft: DispatchDraft) => {
    if (!selectedDispatchEventId) return
    setDispatchDrafts((drafts) => ({ ...drafts, [selectedDispatchEventId]: draft }))
    setSelectedUnitId(draft.primaryUnitId)
    setCityFocusRevision((revision) => revision + 1)
  }, [selectedDispatchEventId])

  const resetDispatchDraft = useCallback(() => {
    if (!selectedDispatchEventId) return
    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    const assignment = dispatchAssignments[selectedDispatchEventId]
    if (!dispatchCase || !assignment) return
    const session = workflowSessions[dispatchCase.scenarioId]
    setDispatchDrafts((drafts) => ({ ...drafts, [selectedDispatchEventId]: createDispatchDraft(assignment, session) }))
    setSelectedUnitId(assignment.primaryUnitId)
  }, [dispatchAssignments, selectedDispatchEventId, workflowSessions])

  const applyDispatchAdjustment = useCallback(() => {
    if (!selectedDispatchEventId) return
    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    const draft = dispatchDrafts[selectedDispatchEventId]
    if (!dispatchCase || !draft) return
    const source = findAssignedEvent(dispatchAssignments, draft.primaryUnitId, selectedDispatchEventId)
    setWorkflowSessions((sessions) => {
      const fixture = findFixtureByScenarioId(dispatchCase.scenarioId)
      const current = sessions[dispatchCase.scenarioId] ?? createWorkflowSession(fixture)
      const next: Record<string, WorkflowSession> = {
        ...sessions,
        [dispatchCase.scenarioId]: adjustWorkflow(fixture, current, {
          resourceCount: draft.resourceCount,
          fireOptionId: draft.fireOptionId,
          medicalOptionId: draft.medicalOptionId,
          trafficOptionId: draft.trafficOptionId,
        }),
      }
      if (source) {
        const sourceFixture = findFixtureByScenarioId(source.scenarioId)
        const sourceSession = sessions[source.scenarioId] ?? createWorkflowSession(sourceFixture)
        next[source.scenarioId] = adjustWorkflow(sourceFixture, sourceSession, {
          resourceCount: Math.max(sourceFixture.minResources, sourceSession.resourceCount - 1),
          fireOptionId: sourceSession.fireOptionId,
          medicalOptionId: sourceSession.medicalOptionId,
          trafficOptionId: sourceSession.trafficOptionId,
        })
      }
      return next
    })
    setDispatchOperations((operations) => ({
      ...operations,
      [selectedDispatchEventId]: {
        ...operations[selectedDispatchEventId],
        status: 'pending-approval',
        pendingDraft: draft,
        sourceEventId: source?.eventId ?? null,
        message: source ? '已重算目标与来源事件；两起事件的原批准和任务包均已失效。' : '影响已重算；原批准和任务包已失效，等待人工重新批准。',
      },
      ...(source ? {
        [source.eventId]: {
          ...operations[source.eventId],
          status: 'idle' as const,
          pendingDraft: null,
          sourceEventId: selectedDispatchEventId,
          message: '资源被跨事件抽调；覆盖下降已重算，等待目标事件事务同步批准。',
        },
      } : {}),
    }))
  }, [dispatchAssignments, dispatchDrafts, selectedDispatchEventId])

  const approveDispatchAdjustment = useCallback(() => {
    if (!selectedDispatchEventId) return
    const operation = dispatchOperations[selectedDispatchEventId]
    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    const draft = operation?.pendingDraft
    if (!operation || !dispatchCase || !draft) return
    const source = operation.sourceEventId ? dispatchAssignments[operation.sourceEventId] : null
    setWorkflowSessions((sessions) => ({
      ...sessions,
      [dispatchCase.scenarioId]: approveWorkflow(sessions[dispatchCase.scenarioId]),
      ...(source ? { [source.scenarioId]: approveWorkflow(sessions[source.scenarioId]) } : {}),
    }))
    setDispatchAssignments((assignments) => {
      const current = assignments[selectedDispatchEventId]
      const nextAssigned = Array.from(new Set(current.assignedUnitIds.filter((id) => id !== current.primaryUnitId).concat(draft.primaryUnitId)))
      return {
        ...assignments,
        [selectedDispatchEventId]: {
          ...current,
          primaryUnitId: draft.primaryUnitId,
          assignedUnitIds: nextAssigned,
          facilityId: draft.facilityId,
          owner: draft.owner,
        },
        ...(source ? {
          [source.eventId]: {
            ...source,
            assignedUnitIds: source.assignedUnitIds.filter((id) => id !== draft.primaryUnitId),
          },
        } : {}),
      }
    })
    setDispatchOperations((operations) => ({
      ...operations,
      [selectedDispatchEventId]: { ...operations[selectedDispatchEventId], status: 'approved', message: '人工批准已记录；资源归属已提交，可进行模拟下发。' },
      ...(source ? { [source.eventId]: { ...operations[source.eventId], status: 'approved' as const, message: '与目标事件同步批准；来源覆盖变化已回写。' } } : {}),
    }))
  }, [dispatchAssignments, dispatchOperations, selectedDispatchEventId])

  const sendDispatchTasks = useCallback(() => {
    if (!selectedDispatchEventId) return
    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    if (!dispatchCase) return
    setWorkflowSessions((sessions) => {
      const session = sessions[dispatchCase.scenarioId]
      const next = session.hasReplanned ? runControlledRetry(session) : sendSimulatedTasks(session)
      return { ...sessions, [dispatchCase.scenarioId]: next }
    })
    setDispatchOperations((operations) => ({
      ...operations,
      [selectedDispatchEventId]: { ...operations[selectedDispatchEventId], status: 'sent', message: '模拟任务包已下发；未连接任何真实外部系统。' },
    }))
  }, [selectedDispatchEventId])

  const openTodayEventForScenario = useCallback((scenarioId: string) => {
    const event = todayEvents.find((item) => item.workflowScenarioId === scenarioId)
    setShowHome(false)
    window.location.hash = '#/incidents'
    setWorkspace('incidents')
    setRightView('list')
    setActiveHistoricalCaseId(null)
    setIncidentFilter('all')
    selectTodayEvent(event?.id ?? null)
  }, [selectTodayEvent, todayEvents])

  const enterDailyResponse = useCallback(() => {
    setActiveHistoricalCaseId(null)
    setDispatchWorkflowEntry(null)
    setSelectedTodayEventId('ev-fire-finance')
    setActiveScenarioId('liwan-fire')
    setFireMode('routine-simulation')
    setWorkspace('incidents')
    setRightView('detail')
    setActiveStep(0)
    setActivePlanId('plan-a')
    setApprovedPlanId(null)
    setWorkflowSessions((sessions) => ({
      ...sessions,
      'liwan-fire': createWorkflowSession(DOMAIN_FIXTURES.fire),
    }))
    applyClosedWays([], { type: 'clear' })
  }, [applyClosedWays])

  const approvePlan = useCallback((planId: string) => {
    setApprovedPlanId(planId)
  }, [])

  const changeStep = useCallback((step: number) => {
    setActiveStep(step)
    if (step === 4 && activeStep !== 4) requestRouteFocus()
  }, [activeStep, requestRouteFocus])

  const pickPlan = useCallback((planId: string) => {
    setActivePlanId(planId)
    if (activeStep === 4) requestRouteFocus()
  }, [activeStep, requestRouteFocus])

  const detailMode = rightView === 'detail' && workspace !== 'resources' && workspace !== 'review'
  const showLeftRail = workspace === 'overview'
  const todayEventCenter = workspace === 'incidents' && rightView === 'list'
  const visibleTodayEvents = useMemo(
    () => todayEvents.filter((event) => incidentFilter === 'all' || event.status === incidentFilter),
    [incidentFilter, todayEvents],
  )

  // 总览列表态：左栏告警流里的每一条在地图上都有落点，警示与关注级带起伏光效，
  // 点一下直接进对应事件的处置流程。没有坐标的全城性告警（气象）不上图。
  const cityAlertMarkers = useMemo<PoiMarkerDatum[] | undefined>(() => {
    if (todayEventCenter) {
      return visibleTodayEvents.map((event) => ({
        id: `today-event-${event.id}`,
        position: event.position,
        kind: event.poi,
        label: event.shortLabel,
        role: 'incident',
        alarm: event.id === selectedTodayEventId,
        compact: event.id !== selectedTodayEventId,
        selected: event.id === selectedTodayEventId,
        onSelect: () => selectTodayEvent(event.id === selectedTodayEventId ? null : event.id),
      }))
    }
    if (!(workspace === 'overview' && rightView === 'list')) return undefined
    return INITIAL_ALERTS.flatMap((alert) => {
      if (!alert.position || !alert.poi) return []
      return [{
        id: `alert-${alert.id}`,
        position: alert.position,
        kind: alert.poi,
        label: alert.shortLabel ?? alert.domain,
        role: 'incident',
        alarm: alert.severity !== 'info',
        onSelect: () => openTodayEventForScenario(alert.scenarioId),
      }]
    })
  }, [todayEventCenter, visibleTodayEvents, selectedTodayEventId, selectTodayEvent, workspace, rightView, openTodayEventForScenario])
  // 资源调度默认只显示五起待调度事件；展开后再显示当前、候选与受影响资源。
  // planningState 与置信度分离，三类状态也使用不同形状而非只换颜色。
  const dispatchUnitMarkers = useMemo<PoiMarkerDatum[] | undefined>(() => {
    if (workspace !== 'resources') return undefined
    if (!selectedDispatchEventId) {
      return DISPATCH_CASES.map((dispatchCase) => {
        const event = getDispatchEvent(dispatchCase)
        return {
          id: `dispatch-event-${event.id}`,
          position: event.position,
          kind: event.poi,
          label: event.shortLabel,
          role: 'incident' as const,
          alarm: event.status === 'abnormal',
          onSelect: () => openDispatchEvent(event.id),
        }
      })
    }

    const dispatchCase = getDispatchCase(selectedDispatchEventId)
    const assignment = dispatchAssignments[selectedDispatchEventId]
    const operation = dispatchOperations[selectedDispatchEventId]
    const draft = dispatchDrafts[selectedDispatchEventId]
    if (!dispatchCase || !assignment) return []
    const event = getDispatchEvent(dispatchCase)
    const source = operation?.pendingDraft && operation.sourceEventId
      ? dispatchAssignments[operation.sourceEventId]
      : draft ? findAssignedEvent(dispatchAssignments, draft.primaryUnitId, selectedDispatchEventId) : null
    const candidateIds = new Set(dispatchCase.candidateUnitIds)
    const currentIds = new Set(assignment.assignedUnitIds)
    const unitIds = Array.from(new Set([...currentIds, ...candidateIds]))

    const eventMarkers: PoiMarkerDatum[] = [{
      id: `dispatch-event-${event.id}`,
      position: event.position,
      kind: event.poi,
      label: event.shortLabel,
      role: 'incident',
      alarm: true,
      selected: true,
      onSelect: () => openDispatchEvent(event.id),
    }]
    if (source) {
      const sourceCase = getDispatchCase(source.eventId)
      if (sourceCase) {
        const sourceEvent = getDispatchEvent(sourceCase)
        eventMarkers.push({
          id: `dispatch-source-event-${source.eventId}`,
          position: sourceEvent.position,
          kind: sourceEvent.poi,
          label: `受影响：${sourceEvent.shortLabel}`,
          role: 'incident',
          planningState: 'impacted',
          onSelect: () => openDispatchEvent(source.eventId),
        })
      }
    }

    return eventMarkers.concat(unitIds.map((unitId) => {
      const unit = getDispatchUnit(unitId)
      const occupied = findAssignedEvent(dispatchAssignments, unitId, selectedDispatchEventId)
      const planningState = currentIds.has(unitId) ? 'current' : occupied ? 'impacted' : 'candidate'
      return {
        id: `dispatch-unit-${unit.id}`,
        position: unit.position,
        kind: unit.kind === '消防' ? 'fire_station' : unit.kind === '公安' ? 'police' : unit.kind === '医疗' ? 'medical' : 'vehicle',
        label: unit.name,
        role: 'facility' as const,
        planningState,
        compact: unit.id !== selectedUnitId,
        selected: unit.id === selectedUnitId,
        detail: {
          title: unit.staticPoi?.name ?? unit.name,
          type: unit.staticPoi ? `${unit.staticPoi.type}（公开静态 POI）` : `${unit.kind}调度单元（模拟）`,
          address: unit.staticPoi?.address ?? unit.location,
          sourceLabel: unit.staticPoi?.sourceLabel ?? '演示资源台账',
          sourceUrl: unit.staticPoi?.sourceUrl,
          capturedAt: unit.staticPoi?.capturedAt,
          simulationNote: `调度状态、编成、车辆、ETA 与资源归属均为模拟${unit.eta ? ` · ETA ${unit.eta}` : ''}`,
        },
        onSelect: () => {
          const facility = DISPATCH_FACILITIES.find((item) => item.unitId === unit.id)
          if (draft && candidateIds.has(unit.id)) changeDispatchDraft({ ...draft, primaryUnitId: unit.id, ...(facility ? { facilityId: facility.id } : {}) })
          else selectDispatchUnit(unit.id)
        },
        onClose: () => selectDispatchUnit(null),
      }
    }))
  }, [workspace, selectedDispatchEventId, dispatchAssignments, dispatchOperations, dispatchDrafts, selectedUnitId, openDispatchEvent, changeDispatchDraft, selectDispatchUnit])

  const cityFocusPosition = useMemo<[number, number] | null>(() => {
    if (todayEventCenter && selectedTodayEventId) {
      return todayEvents.find((event) => event.id === selectedTodayEventId)?.position ?? null
    }
    if (workspace === 'resources') {
      if (selectedUnitId) return DISPATCH_UNITS.find((unit) => unit.id === selectedUnitId)?.position ?? null
      const dispatchCase = getDispatchCase(selectedDispatchEventId)
      return dispatchCase ? getDispatchEvent(dispatchCase).position : null
    }
    return null
  }, [todayEventCenter, selectedTodayEventId, todayEvents, workspace, selectedUnitId, selectedDispatchEventId])

  // 态势总览是「看城市」的页面，右侧不再挂今日事件台账——台账属于事件处置。
  // 总览因此变成「顶部通栏指标 + 左栏读数 + 整幅地图」，中间不再被两侧夹成窄条。
  const overviewBoard = workspace === 'overview'
  const showRightPanel = workspace !== 'resources' && !overviewBoard
  const rightPanelResizable = showRightPanel
  const mainColumns = workspace === 'resources'
    ? dispatchWorkflowEntry
      ? 'grid-cols-[260px_minmax(0,1fr)_360px]'
      : selectedDispatchEventId ? 'grid-cols-[280px_minmax(0,1fr)_360px]' : 'grid-cols-[280px_minmax(0,1fr)]'
    : overviewBoard
      ? 'grid-cols-[264px_minmax(0,1fr)]'
      : detailMode
        ? 'grid-cols-[minmax(0,1fr)_minmax(360px,33%)]'
        : 'grid-cols-[minmax(0,1fr)_minmax(360px,28%)]'
  const measuredGridWidth = gridRef.current?.getBoundingClientRect().width
    ?? (typeof window === 'undefined' ? RIGHT_PANEL_MIN_WIDTH : window.innerWidth)
  const currentPanelMaxWidth = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.floor(measuredGridWidth * RIGHT_PANEL_MAX_RATIO))
  const defaultPanelWidth = detailMode ? 440 : 380
  const currentPanelWidth = Math.min(
    currentPanelMaxWidth,
    Math.max(RIGHT_PANEL_MIN_WIDTH, rightPanelWidth ?? measuredRightPanelWidth ?? defaultPanelWidth),
  )

  const applyRightPanelWidth = useCallback((width: number) => {
    const grid = gridRef.current
    if (!grid) return null
    const clampedWidth = clampRightPanelWidth(width, grid.getBoundingClientRect().width)
    grid.style.gridTemplateColumns = `minmax(0,1fr) ${clampedWidth}px`
    return clampedWidth
  }, [])

  const resetRightPanelWidth = useCallback(() => {
    panelDragRef.current = null
    gridRef.current?.style.removeProperty('grid-template-columns')
    setRightPanelWidth(null)
    persistRightPanelWidth(null)
    if (activeStep === 4) window.requestAnimationFrame(requestRouteFocus)
  }, [activeStep, requestRouteFocus])

  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    if (!rightPanelResizable || rightPanelWidth === null) {
      grid.style.removeProperty('grid-template-columns')
      return
    }

    const clampedWidth = applyRightPanelWidth(rightPanelWidth)
    if (clampedWidth !== null && clampedWidth !== rightPanelWidth) {
      setRightPanelWidth(clampedWidth)
      persistRightPanelWidth(clampedWidth)
    }
  }, [applyRightPanelWidth, plans.length, rightPanelResizable, rightPanelWidth, routing, scenario])

  useLayoutEffect(() => {
    const panel = rightPanelRef.current
    if (!rightPanelResizable || !panel) {
      setMeasuredRightPanelWidth((current) => current === null ? current : null)
      return
    }

    const syncMeasuredWidth = () => {
      // 拖动时不把每一帧尺寸写回 React；结束后与浏览器实际轨道尺寸同步，
      // 既保证地图不抖动，也让 separator 的 aria-valuenow 始终可信。
      if (panelDragRef.current) return
      const width = Math.round(panel.getBoundingClientRect().width)
      setMeasuredRightPanelWidth((current) => current === width ? current : width)
    }

    syncMeasuredWidth()
    const observer = new ResizeObserver(syncMeasuredWidth)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [rightPanelResizable, workspace])

  const startRightPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !rightPanelRef.current) return
    const startWidth = rightPanelRef.current.getBoundingClientRect().width
    panelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      latestWidth: Math.round(startWidth),
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }, [])

  const resizeRightPanel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || event.clientX === drag.startX) return
    const nextWidth = applyRightPanelWidth(drag.startWidth - (event.clientX - drag.startX))
    if (nextWidth === null) return
    drag.latestWidth = nextWidth
    drag.moved = true
    event.preventDefault()
  }, [applyRightPanelWidth])

  const finishRightPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    panelDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!drag.moved) return

    const finalWidth = applyRightPanelWidth(drag.latestWidth)
    if (finalWidth === null) return
    setRightPanelWidth(finalWidth)
    setMeasuredRightPanelWidth(finalWidth)
    persistRightPanelWidth(finalWidth)
    if (activeStep === 4) window.requestAnimationFrame(requestRouteFocus)
  }, [activeStep, applyRightPanelWidth, requestRouteFocus])

  const cancelRightPanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    panelDragRef.current = null
    if (rightPanelWidth === null) {
      gridRef.current?.style.removeProperty('grid-template-columns')
    } else {
      applyRightPanelWidth(rightPanelWidth)
    }
  }, [applyRightPanelWidth, rightPanelWidth])

  const handleRightPanelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault()
      resetRightPanelWidth()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

    const currentWidth = rightPanelRef.current?.getBoundingClientRect().width
    if (currentWidth === undefined) return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? RIGHT_PANEL_KEYBOARD_STEP : -RIGHT_PANEL_KEYBOARD_STEP
    const nextWidth = applyRightPanelWidth(currentWidth + delta)
    if (nextWidth === null) return
    setRightPanelWidth(nextWidth)
    setMeasuredRightPanelWidth(nextWidth)
    persistRightPanelWidth(nextWidth)
    if (activeStep === 4) window.requestAnimationFrame(requestRouteFocus)
  }, [activeStep, applyRightPanelWidth, requestRouteFocus, resetRightPanelWidth])

  if (showHome) {
    return <HomePage onEnter={() => navigateWorkspace('overview')} />
  }

  if (loadError) {
    return (
      <div className="grid h-svh place-items-center bg-[#F4F5FA] px-8 text-center">
        <div className="max-w-md rounded-xl border border-[#E8EAF0] bg-white p-6">
          <div className="text-sm font-semibold text-[#E5484D]">站点数据加载失败</div>
          <p className="mt-2 text-xs leading-relaxed text-[#6B7280]">{loadError}</p>
          <p className="mt-3 text-xs leading-relaxed text-[#9CA3AF]">
            先跑 <code className="rounded bg-[#F4F5FA] px-1">python scripts/sync_public_data.py</code>
          </p>
        </div>
      </div>
    )
  }

  if (!scenario || !routing || plans.length < 2) {
    return <CityOverviewLoading />
  }

  const historicalCaseId = isHistoricalReviewCaseId(activeHistoricalCaseId) ? activeHistoricalCaseId : null
  const activeWorkflowFixture = historicalCaseId
    ? createHistoricalWorkflowFixture(historicalCaseId)
    : findFixtureByScenarioId(activeScenarioId)
  const activeWorkflowSession = historicalCaseId
    ? historicalWorkflowSessions[historicalCaseId] ?? createHistoricalWorkflowSession(historicalCaseId)
    : workflowSessions[activeWorkflowFixture.scenarioId] ?? createWorkflowSession(activeWorkflowFixture)
  const activeDispatchEvent: ActiveDispatchEvent | null = (() => {
    if (!dispatchWorkflowEntry) return null
    if (dispatchWorkflowEntry.kind === 'historical' && isHistoricalReviewCaseId(dispatchWorkflowEntry.caseId)) {
      const reviewCase = HISTORICAL_REVIEW_CASES[dispatchWorkflowEntry.caseId]
      const ledgerEntry = HISTORICAL_CASES.find((item) => item.id === dispatchWorkflowEntry.caseId)
      const fixture = createHistoricalWorkflowFixture(dispatchWorkflowEntry.caseId)
      const session = historicalWorkflowSessions[dispatchWorkflowEntry.caseId] ?? createHistoricalWorkflowSession(dispatchWorkflowEntry.caseId)
      return {
        id: reviewCase.id,
        kind: 'historical',
        domain: reviewCase.domain,
        domainColor: reviewCase.domainColor,
        title: reviewCase.title,
        location: reviewCase.address,
        timeLabel: ledgerEntry?.occurredAt ?? '历史事件',
        sourceLabel: reviewCase.boundary,
        fixture,
        session,
      }
    }
    if (dispatchWorkflowEntry.kind === 'daily') {
      const event = todayEvents.find((item) => item.id === dispatchWorkflowEntry.eventId)
      if (!event) return null
      const fixture = findFixtureByScenarioId(dispatchWorkflowEntry.scenarioId)
      const session = dispatchWorkflowEntry.session ?? workflowSessions[dispatchWorkflowEntry.scenarioId] ?? createWorkflowSession(fixture)
      return {
        id: event.id,
        kind: 'daily',
        domain: event.domain,
        domainColor: event.domainColor,
        title: event.title,
        location: event.location,
        position: event.position,
        timeLabel: event.time,
        sourceLabel: event.source.replace(/[（(](?:模拟|演示)[）)]/g, '').trim(),
        fixture,
        session,
      }
    }
    return null
  })()
  const selectedDispatchCase = getDispatchCase(selectedDispatchEventId)
  const selectedDispatchAssignment = selectedDispatchEventId ? dispatchAssignments[selectedDispatchEventId] : null
  const selectedDispatchOperation = selectedDispatchEventId ? dispatchOperations[selectedDispatchEventId] : null
  const selectedDispatchDraft = selectedDispatchEventId ? dispatchDrafts[selectedDispatchEventId] : null
  const selectedDispatchFixture = selectedDispatchCase ? findFixtureByScenarioId(selectedDispatchCase.scenarioId) : null
  const selectedDispatchSession = selectedDispatchCase ? workflowSessions[selectedDispatchCase.scenarioId] : null
  const selectedDispatchSource = selectedDispatchOperation?.pendingDraft && selectedDispatchOperation.sourceEventId
    ? dispatchAssignments[selectedDispatchOperation.sourceEventId] ?? null
    : selectedDispatchDraft ? findAssignedEvent(dispatchAssignments, selectedDispatchDraft.primaryUnitId, selectedDispatchEventId ?? undefined) : null
  // 逐帧进度只存在 CityMap 的 ref 中，不把动画推进写入 App state。
  const stationExecutionActive = activeScenarioId === 'haizhu-police' && activeStep === 7
  const mapExecutionFrame = stationExecutionActive ? stationExecutionFrame : null
  const mapExecutionTrack = stationExecutionActive && stationExecutionPlayback
      ? stationExecutionPlayback.definitionId === STATION_EXECUTIONS.baseline.id ? 'baseline' : 'cityos'
      : null
  const routineSimulation = activeScenarioId === 'liwan-fire' && fireMode === 'routine-simulation'
  const deliveryInProgress = ['delivered', 'acknowledged', 'executing'].includes(activeWorkflowSession.deliveryStatus)
  const deliveryHasStarted = [...(['delivered', 'acknowledged', 'executing'] as const), 'completed', 'abnormal'].includes(activeWorkflowSession.deliveryStatus)
  // 5·16 复盘链路复用日常演练的路线门禁：下发前不在地图预演行动路线，
  // 下发后只展示任务包中已批准的执行路线，完成或异常时立即收起。
  const approvedRouteOnly = historicalCaseId === 'hc-liwan-516'
  const taskRoutesVisible = approvedRouteOnly
    ? deliveryInProgress
    : historicalCaseId
      ? activeStep >= 4
      : !routineSimulation || deliveryHasStarted
  const routePulseAllowed = historicalCaseId
    ? deliveryInProgress
    : taskRoutesVisible
  const animateRoute = historicalCaseId
    ? routePulseAllowed
    : activeStep >= 7 && deliveryInProgress
  const mapActivePlanId = historicalCaseId
    ? activeWorkflowSession.approvedPlanId ?? activeWorkflowSession.selectedPlanId
    : activePlanId
  const confirmedReceivingFacilityId = routineSimulation
    ? resolveRoutineHospitalFacilityId(activeWorkflowSession.inputValues.dispatchOverrideOptionId)
    : null
  const confirmedReceivingFacility = routineSimulation
    ? DISPATCH_FACILITIES.find((facility) => facility.id === confirmedReceivingFacilityId)
    : null
  const routineHospitalTransfer = createRoutineHospitalTransfer(confirmedReceivingFacility)
  // 总览列表态是城市尺度的告警视图，不叠具体场景的点位与楼层剖面：
  // 城市告警点和某一栋楼的演练点位混在一张图上，两个尺度打架，谁也读不清。
  // 点进具体事件后 rightView 变 detail，场景图层自然回来。
  // 城市尺度的两个工作区（总览告警、资源调度）都不叠场景点位。
  // 资源调度页原来会把日常演练那套点位（18 层演练点、报警人语音…）和单位点混在
  // 一张图上，两套语义叠着看不出谁是谁。
  const scenarioMapVariant: ScenarioMapVariant | null = cityAlertMarkers || dispatchUnitMarkers
    ? null
    : routineSimulation
    ? 'routine'
    : activeScenarioId === 'haizhu-police' || activeScenarioId === 'yuexiu-police-current'
      ? 'police'
      : activeScenarioId === 'yuexiu-medical'
        ? 'medical'
      : activeScenarioId === 'yuexiu-traffic'
        ? 'traffic'
        : activeScenarioId === 'tianhe-major'
          ? 'major'
          : null
  return (
    <div
      className={`grid h-svh min-w-[1180px] gap-2.5 overflow-hidden bg-[#F4F5FA] p-2.5 text-[#1A1D26] ${
        overviewBoard
          ? 'grid-rows-[54px_auto_minmax(0,1fr)_140px]'
          : detailMode
            ? 'grid-rows-[54px_minmax(0,1fr)]'
            : 'grid-rows-[54px_minmax(0,1fr)]'
      }`}
    >
      <TopNav
        activeWorkspace={workspace}
        onNavigate={navigateWorkspace}
        onHome={openHome}
      />

      {overviewBoard && (
        <CityRealtimeBand
          events={todayEvents}
          enrouteCount={BASE_ENROUTE_UNIT_COUNT + liveEnrouteBonus}
          onKpiSelect={openOverviewKpi}
        />
      )}

      <div ref={gridRef} className={`relative grid min-h-0 gap-2.5 ${mainColumns}`}>
        {workspace === 'review' && (
          <KnowledgeBasePanel onOpenScenario={openDomainScenario} />
        )}
        {showLeftRail && (
          <CityPulseRail
            key="overview-resources"
            layers={mapLayers}
            onLayerToggle={toggleMapLayer}
            onAlertSelect={openTodayEventForScenario}
            variant={overviewBoard ? 'overview' : 'full'}
          />
        )}
        {workspace === 'resources' && (
          <ResourceDispatchRail
            selectedEventId={activeDispatchEvent?.id ?? selectedDispatchEventId}
            currentEvent={activeDispatchEvent}
            operations={dispatchOperations}
            onOpen={openDispatchEvent}
          />
        )}

        {workspace === 'resources' ? (
          <ResourceDispatchWorkspace
                selectedCase={selectedDispatchCase}
                selectedAssignment={selectedDispatchAssignment}
                selectedOperation={selectedDispatchOperation}
                selectedSession={selectedDispatchSession}
                assignments={dispatchAssignments}
                operations={dispatchOperations}
                sessions={workflowSessions}
                entryNotice={dispatchEntryNotice}
                workflowEvent={activeDispatchEvent}
                selectedResolutionOptionId={dispatchResolutionOptionId}
                promptRequest={dispatchPromptRequest}
                onOpen={openDispatchEvent}
                onSelectResolution={setDispatchResolutionOptionId}
                onApplyResolution={applyDispatchResolution}
              />
        ) : (
        <section
          key="map-workspace"
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[#E8EAF0] bg-white shadow-[0_1px_3px_rgb(16_24_40_/_0.06),0_1px_2px_rgb(16_24_40_/_0.04)]"
        >
          <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[#E8EAF0] px-2.5">
            {todayEventCenter ? (
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-[12px] font-semibold text-[#243653]">
                  今日事件分布 · <span className="font-mono tabular-nums">{visibleTodayEvents.length}</span> 起
                </h2>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-4 w-[3px] bg-accent-strong" aria-hidden="true" />
                <h2 className="truncate text-[12px] font-semibold text-[#243653]">全城安全态势</h2>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2 text-[10px] text-[#9CA3AF]">
              <span className="flex items-center gap-1 max-[1279px]:hidden"><Wifi size={10} />在线 / 本地双底图</span>
              <span className="flex items-center gap-1 max-[1279px]:hidden"><MapPinned size={10} />路网本地快照</span>
              {detailMode && (
                <button
                  onClick={resetDemo}
                  className="flex h-7 items-center gap-1 rounded-lg border border-[#E8EAF0] bg-white px-2 text-[11px] font-medium text-[#6B7280] hover:bg-[#F7F8FB] hover:text-[#1A1D26]"
                >
                  <RotateCcw size={10} />重置演示
                </button>
              )}
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <CityMap
              site={scenario.site}
              roads={routing.roads}
              plans={plans}
              routeWayIds={routeWayIds}
              medicalRoute={medicalRoute ?? undefined}
              activePlanId={mapActivePlanId}
              animate={animateRoute}
              taskRoutesVisible={taskRoutesVisible}
              routePulseAllowed={routePulseAllowed}
              pulseActivePlanOnly={approvedRouteOnly}
              historyPlayhead={mapExecutionFrame ? mapExecutionFrame.progress * 100 : null}
              historyTrack={mapExecutionTrack}
              executionFrame={mapExecutionFrame}
              showStrategyMarkers={detailMode && activeStep >= 4}
              focusActiveRoute={detailMode && activeStep === 4}
              focusRevision={mapFocusRevision}
              scenarioFocusRevision={scenarioFocusRevision}
              cityFocusPosition={cityFocusPosition}
              cityFocusRevision={cityFocusRevision}
              closedWays={closedWays}
              routeStale={routeStale}
              onCloseWay={closeWay}
              onRemoveClosedWay={removeClosedWay}
              layers={mapLayers}
              cityAlertMarkers={cityAlertMarkers}
              dispatchUnitMarkers={dispatchUnitMarkers}
              resourceReferenceVisible={resourceReferenceVisible}
              onResourceReferenceVisibleChange={setResourceReferenceVisible}
              showResourceReferenceControl
              showSimulationProvenance={false}
              onStaticResourceSelect={clearDispatchSelection}
              scenarioVariant={scenarioMapVariant}
              routineHospitalTransfer={routineHospitalTransfer}
            />
            {scenarioMapVariant && (
              <ScenarioMap
                scenario={scenarioMapVariant}
                activeStep={activeStep}
                layers={mapLayers}
              />
            )}
            {/* 异常跳入横幅挂在事件处置的今日事件分布上，不在态势总览——
                总览负责「城市在跑什么」，跳进某一起事件的处置是事件处置的事（8/20 评审）。 */}
            {todayEventCenter && (
              <div className="absolute left-1/2 top-3 z-20 w-[min(590px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-[#E7C77F] bg-white/90 shadow-[0_8px_24px_rgb(32_45_70_/_0.12)] backdrop-blur-md">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FFF7E6] text-[#B56A12]"><BellRing size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-[#9A5B12]">新异常</span>
                      <span className="font-mono text-[10px] text-[#8A94A7]">15:00:18</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] font-semibold text-[#243653]">天河区高层办公楼持续冒烟，疑似人员受困</div>
                    <div className="mt-0.5 truncate text-[9px] text-[#718097]">接警模板 + 物业上报 · 3 项关键信息待核验</div>
                  </div>
                  <button type="button" onClick={enterDailyResponse} className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#C9DBF8] bg-[#EEF4FF] px-3 text-[11px] font-semibold text-[#2768CA] hover:bg-[#E2ECFB]">立即去处置<ArrowRight size={13} /></button>
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        {workspace === 'resources' && !activeDispatchEvent && selectedDispatchCase && selectedDispatchFixture && selectedDispatchSession && selectedDispatchAssignment && selectedDispatchDraft && selectedDispatchOperation && (
          <ResourceDispatchPanel
            dispatchCase={selectedDispatchCase}
            fixture={selectedDispatchFixture}
            session={selectedDispatchSession}
            assignment={selectedDispatchAssignment}
            draft={selectedDispatchDraft}
            operation={selectedDispatchOperation}
            sourceAssignment={selectedDispatchSource}
            onDraftChange={changeDispatchDraft}
            onResetDraft={resetDispatchDraft}
            onApply={applyDispatchAdjustment}
            onApprove={approveDispatchAdjustment}
            onSend={sendDispatchTasks}
            onClose={closeDispatchEvent}
          />
        )}

        {workspace === 'resources' && activeDispatchEvent && (
          <ActiveEventDispatchContext
            event={activeDispatchEvent}
            onAsk={(text) => setDispatchPromptRequest({ id: crypto.randomUUID(), text })}
            onApplyResolution={applyDispatchResolution}
            selectedOptionId={dispatchResolutionOptionId}
            onSelectOption={setDispatchResolutionOptionId}
          />
        )}

        {showRightPanel && (
          <div
            ref={rightPanelRef}
            className={rightPanelResizable ? 'relative grid min-h-0 min-w-0' : 'contents'}
          >
            {rightPanelResizable && (
              <div
                role="separator"
                aria-label="调整事件面板宽度"
                aria-orientation="vertical"
                aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
                aria-valuemax={currentPanelMaxWidth}
                aria-valuenow={Math.round(currentPanelWidth)}
                aria-valuetext={`${Math.round(currentPanelWidth)} 像素`}
                tabIndex={0}
                onPointerDown={startRightPanelResize}
                onPointerMove={resizeRightPanel}
                onPointerUp={finishRightPanelResize}
                onPointerCancel={cancelRightPanelResize}
                onDoubleClick={resetRightPanelWidth}
                onKeyDown={handleRightPanelKeyDown}
                className="group absolute inset-y-0 left-0 z-20 w-1 -translate-x-1/2 cursor-col-resize touch-none select-none"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-ink-3 group-active:bg-accent-strong"
                />
              </div>
            )}
            <RightPanel
              key="event-workspace"
              view={rightView}
              activeScenarioId={activeScenarioId}
              historicalCaseId={activeHistoricalCaseId}
              fireMode={fireMode}
              activeStep={activeStep}
              engineScenario={scenario}
              plans={plans}
              medicalRoute={medicalRoute}
              activePlanId={activePlanId}
              approvedPlanId={approvedPlanId}
              closedWays={closedWays}
              routeStale={routeStale}
              routeMessage={routeMessage}
              onRemoveClosedWay={removeClosedWay}
              onUndoClosedWay={undoClosedWay}
              onClearClosedWays={clearClosedWays}
              onViewChange={changeRightView}
              onStepChange={changeStep}
              onPickPlan={pickPlan}
              onApprovePlan={approvePlan}
              workflowSession={activeWorkflowSession}
              onWorkflowSessionChange={updateActiveWorkflowSession}
              onExecutionPlaybackChange={setStationExecutionPlayback}
              onOpenKnowledge={() => navigateWorkspace('review')}
              onOpenResources={openResourcesForActiveScenario}
              incidentFilter={incidentFilter}
              selectedTodayEventId={selectedTodayEventId}
              onIncidentFilterChange={changeIncidentFilter}
              onTodayEventSelect={selectTodayEvent}
              onEnterTodayEventWorkflow={enterTodayEventWorkflow}
              onEnterHistoricalCase={enterHistoricalCase}
              todayEvents={todayEvents}
            />
          </div>
        )}
      </div>

      {overviewBoard && (
        <CityOverviewSummary
          liveEventCount={todayEvents.length - TODAY_EVENTS.length}
          onAlertSelect={openTodayEventForScenario}
        />
      )}

      {/* 事件详情不再保留底部摘要卡，释放出的高度归还地图与处置面板。 */}
    </div>
  )
}
