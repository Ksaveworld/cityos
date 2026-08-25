import type { DispatchFacility } from './dispatchData'

export interface RoutineHospitalTransfer {
  id: string
  name: string
  position: [number, number]
  path: Array<[number, number]>
  source: 'strategy-preset'
}

// 固定策略路径只服务现场交互：切换医院时同步替换，不在点击时请求外部求路服务。
// 端点使用 dispatchData 中的公开静态医院 POI；中间折点由本地荔湾 OSM 路网预生成。
const ROUTINE_HOSPITAL_PATHS: Record<string, Array<[number, number]>> = {
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

const ROUTINE_HOSPITAL_FACILITY_BY_OPTION_ID: Record<string, string> = {
  'hospital-red-cross': 'facility-red-cross',
  'hospital-shiyi': 'facility-shiyi',
  'medical-red-cross': 'facility-red-cross',
  'medical-shiyi': 'facility-shiyi',
}

const routineTransferCache = new Map<string, RoutineHospitalTransfer>()

export function resolveRoutineHospitalFacilityId(optionId: string): string | null {
  return ROUTINE_HOSPITAL_FACILITY_BY_OPTION_ID[optionId] ?? null
}

export function createRoutineHospitalTransfer(facility: DispatchFacility | null | undefined): RoutineHospitalTransfer | null {
  if (!facility) return null
  const cached = routineTransferCache.get(facility.id)
  if (cached) return cached
  const path = ROUTINE_HOSPITAL_PATHS[facility.id]
  if (!path) return null
  const transfer: RoutineHospitalTransfer = {
    id: facility.id,
    name: facility.name,
    position: facility.position,
    path,
    source: 'strategy-preset',
  }
  routineTransferCache.set(facility.id, transfer)
  return transfer
}
