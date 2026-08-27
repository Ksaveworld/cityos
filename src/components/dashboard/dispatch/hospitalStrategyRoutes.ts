import {
  resolveDispatchFacilityByOptionId,
  type DispatchFacility,
  type DispatchFacilityDataOrigin,
  type DispatchFacilityId,
  type DispatchFacilityRouteRole,
  type DispatchPlanningState,
} from './dispatchData.ts'

export interface RoutineHospitalTransfer {
  id: DispatchFacilityId
  routeId: string
  name: string
  position: [number, number]
  path: Array<[number, number]>
  source: 'strategy-preset'
  receivingState: string
  etaMinutes: number | null
  selectable: boolean
  planningState: DispatchPlanningState
  dataOrigin: DispatchFacilityDataOrigin
  routeRole: DispatchFacilityRouteRole
  displayLabel: string
  color: [number, number, number, number]
  defaultProgress: number
}

// 固定策略路径只服务现场交互：切换医院时同步替换，不在点击时请求外部求路服务。
// 原医院端点复用既有“医疗参考”模拟点位，两家候选端点使用公开静态医院 POI；
// 中间折点由本地荔湾 OSM 路网预生成。
const ROUTINE_HOSPITAL_PATHS: Record<DispatchFacilityId, Array<[number, number]>> = {
  'facility-medical-reference': [
    [113.25329, 23.11391],
    [113.2537332, 23.1136627],
    [113.2539258, 23.1137422],
    [113.2540461, 23.1137918],
    [113.2548545, 23.1140507],
    [113.2549623, 23.1140834],
    [113.2557298, 23.1143012],
    [113.25575, 23.11425],
  ],
  'facility-red-cross': [
    [113.25329, 23.11391],
    [113.2537332, 23.1136627],
    [113.2522487, 23.1130557],
    [113.2519142, 23.1128],
    [113.2510371, 23.1118819],
    [113.2502382, 23.1113997],
    [113.2491796, 23.1109348],
    [113.2489452, 23.1109304],
    [113.2487405, 23.1112172],
    [113.2484922, 23.1113508],
    [113.2457219, 23.1112766],
    [113.2438443, 23.1111496],
    [113.2438502, 23.1109279],
    [113.2440003, 23.1107433],
    [113.2444863, 23.1092385],
    [113.2460108, 23.1064377],
    [113.2462071, 23.1058975],
    [113.2466466, 23.1050969],
    [113.2493446, 23.1055839],
    [113.250245, 23.1059027],
    [113.2516891, 23.105944],
    [113.252029, 23.1060246],
    [113.253723, 23.1068111],
    [113.2551249, 23.1078399],
    [113.2559509, 23.1081764],
    [113.2562461, 23.1075284],
    [113.2566557, 23.1075217],
    [113.2570562, 23.1076445],
    [113.2571165, 23.1072521],
  ],
  'facility-shiyi': [
    [113.25329, 23.11391],
    [113.2537332, 23.1136627],
    [113.2525191, 23.1132028],
    [113.25282, 23.112511],
    [113.2581954, 23.1148418],
    [113.2578692, 23.1177241],
    [113.2574878, 23.1193728],
    [113.2574198, 23.1199682],
    [113.2574882, 23.1215455],
    [113.2571339, 23.1258401],
    [113.2570524, 23.1280644],
    [113.255119, 23.1279928],
    [113.2553514, 23.1334555],
    [113.2546923, 23.133413],
    [113.2514232, 23.1335724],
    [113.2514049, 23.1340132],
    [113.2511865, 23.133973],
  ],
}

// 盘福路医疗工作台使用同一份本地 OSM 快照预生成路线。三条几何都从事故点出发，
// 末点严格落在对应医院；页面切换时只换预置几何，不请求外部求路服务。
export const PANFU_MEDICAL_INCIDENT = {
  id: 'medical-panfu-incident',
  label: '盘福路急救点（模拟）',
  position: [113.2568, 23.1265] as [number, number],
}

const PANFU_HOSPITAL_PATHS: Record<DispatchFacilityId, Array<[number, number]>> = {
  'facility-medical-reference': [
    [113.2568, 23.1265],
    [113.2568228, 23.1266868],
    [113.2568979, 23.1266898],
    [113.2573485, 23.1215041],
    [113.2572738, 23.1202465],
    [113.257373, 23.1190513],
    [113.2576385, 23.1176748],
    [113.2579238, 23.1155414],
    [113.2580774, 23.1149549],
    [113.2565741, 23.1145615],
    [113.2557298, 23.1143012],
    [113.25575, 23.11425],
  ],
  'facility-red-cross': [
    [113.2568, 23.1265],
    [113.2568228, 23.1266868],
    [113.2568979, 23.1266898],
    [113.2573485, 23.1215041],
    [113.2572784, 23.1201251],
    [113.257373, 23.1190513],
    [113.2577399, 23.1169239],
    [113.2580182, 23.1170631],
    [113.2588244, 23.1172801],
    [113.2597858, 23.1177531],
    [113.2599527, 23.1177353],
    [113.2605935, 23.1173485],
    [113.2613302, 23.1160604],
    [113.2624255, 23.1136495],
    [113.2623461, 23.1134897],
    [113.2621804, 23.1133602],
    [113.2614892, 23.1131545],
    [113.2597076, 23.112308],
    [113.2586307, 23.1117227],
    [113.2572863, 23.1112179],
    [113.2546459, 23.1093837],
    [113.2551249, 23.1078399],
    [113.2559509, 23.1081764],
    [113.2562461, 23.1075284],
    [113.2563507, 23.1075649],
    [113.2566557, 23.1075217],
    [113.2570562, 23.1076445],
    [113.2571165, 23.1072521],
  ],
  'facility-shiyi': [
    [113.2568, 23.1265],
    [113.2568228, 23.1266868],
    [113.2559328, 23.1266906],
    [113.2550703, 23.1268405],
    [113.2553514, 23.1334555],
    [113.2546923, 23.133413],
    [113.2514232, 23.1335724],
    [113.2514049, 23.1340132],
    [113.2511843, 23.1340112],
    [113.2511865, 23.133973],
  ],
}

const routineTransferCache = new Map<string, RoutineHospitalTransfer>()

export function resolveRoutineHospitalFacilityId(optionId: string): DispatchFacilityId | null {
  return resolveDispatchFacilityByOptionId(optionId)?.id ?? null
}

export function getPanfuHospitalPath(facilityId: DispatchFacilityId) {
  return PANFU_HOSPITAL_PATHS[facilityId]
}

export function createRoutineHospitalTransfer(facility: DispatchFacility | null | undefined): RoutineHospitalTransfer | null {
  if (!facility) return null
  const cached = routineTransferCache.get(facility.id)
  if (cached) return cached
  const path = ROUTINE_HOSPITAL_PATHS[facility.id]
  if (!path) return null
  const transfer: RoutineHospitalTransfer = {
    id: facility.id,
    routeId: facility.route.id,
    name: facility.name,
    position: facility.position,
    path,
    source: 'strategy-preset',
    receivingState: facility.receivingState,
    etaMinutes: facility.etaMinutes,
    selectable: facility.selectable,
    planningState: facility.planningState.impacted
      ? 'impacted'
      : facility.planningState.candidate ? 'candidate' : 'current',
    dataOrigin: facility.dataOrigin,
    routeRole: facility.route.role,
    displayLabel: facility.route.displayLabel,
    color: facility.route.color,
    defaultProgress: facility.route.defaultProgress,
  }
  routineTransferCache.set(facility.id, transfer)
  return transfer
}
