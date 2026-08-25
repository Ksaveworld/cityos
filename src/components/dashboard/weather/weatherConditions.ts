// 天气条件目录。
//
// 两条边界：
// 1. 这里所有数值都是**演示**的，没有接实时气象源。任何消费方展示时必须带「演示」标注。
// 2. 天气只用来解释 ETA 的增量，不参与推演结论本身——推演引擎在 src/engine/，不读这个文件。
//
// 图标是 Meteocons（MIT）的自带 SMIL 动画 SVG，直接 <img> 引用即可动，无需 JS。
// 资产记录见 public/assets/third-party/meteocons/SOURCE.md。

export type WeatherConditionId =
  | 'clear'
  | 'partly-cloudy'
  | 'drizzle'
  | 'rain'
  | 'overcast-rain'
  | 'thunderstorm'
  | 'fog'
  | 'wind'

export type WeatherCondition = {
  id: WeatherConditionId
  /** 中文短名，顶栏和地图 HUD 都用这个 */
  label: string
  /** meteocons 动画图标路径 */
  icon: string
  /** 降雨强度 0–3，驱动地图雨幕的层数与不透明度；0 表示不下雨 */
  precipitation: 0 | 1 | 2 | 3
  /** 是否叠加低能见度雾层 */
  mist: boolean
  /** 对处置的影响，一句话 */
  impact: string
}

const ICON = (name: string) => `/assets/third-party/meteocons/${name}.svg`

export const WEATHER_CONDITIONS: Record<WeatherConditionId, WeatherCondition> = {
  clear: {
    id: 'clear',
    label: '晴',
    icon: ICON('clear-day'),
    precipitation: 0,
    mist: false,
    impact: '无气象影响',
  },
  'partly-cloudy': {
    id: 'partly-cloudy',
    label: '多云',
    icon: ICON('partly-cloudy-day'),
    precipitation: 0,
    mist: false,
    impact: '无气象影响',
  },
  drizzle: {
    id: 'drizzle',
    label: '小雨',
    icon: ICON('drizzle'),
    precipitation: 1,
    mist: false,
    impact: '路面湿滑 · 到场时间 +18 秒',
  },
  rain: {
    id: 'rain',
    label: '中雨',
    icon: ICON('rain'),
    precipitation: 2,
    mist: false,
    impact: '路面湿滑 · 到场时间 +45 秒',
  },
  'overcast-rain': {
    id: 'overcast-rain',
    label: '阴有雨',
    icon: ICON('overcast-day-rain'),
    precipitation: 2,
    mist: true,
    impact: '能见度下降 · 到场时间 +52 秒',
  },
  thunderstorm: {
    id: 'thunderstorm',
    label: '雷阵雨',
    icon: ICON('thunderstorms-day-rain'),
    precipitation: 3,
    mist: true,
    impact: '强降雨 · 到场时间 +90 秒，登高作业受限',
  },
  fog: {
    id: 'fog',
    label: '雾',
    icon: ICON('fog-day'),
    precipitation: 0,
    mist: true,
    impact: '能见度不足 200 米 · 到场时间 +40 秒',
  },
  wind: {
    id: 'wind',
    label: '大风',
    icon: ICON('wind'),
    precipitation: 0,
    mist: false,
    impact: '阵风 7 级 · 登高作业与无人机受限',
  },
}

/**
 * 当前演示天气。荔湾—海珠主链路按小雨走：
 * 既能让雨幕动效在演示里一直可见，又不至于强到把底图糊掉。
 */
export const CURRENT_WEATHER = {
  condition: WEATHER_CONDITIONS.drizzle,
  temperatureC: 24,
  /** 演示标注文案，消费方直接用，避免各处措辞不一致 */
  simulatedNote: '演示天气值，未接入实时气象',
} as const
