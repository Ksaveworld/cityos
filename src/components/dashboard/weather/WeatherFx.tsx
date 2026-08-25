import { memo, useEffect, useState } from 'react'

import { OriginMark } from '../Provenance'
import { CURRENT_WEATHER, type WeatherCondition } from './weatherConditions'

const RAIN_TILE = '/assets/effects/rain-tile.svg'

// 三层雨幕做视差：远层小而慢、近层大而快。
// 平移距离必须**等于该层的贴图边长**，否则一个周期结束时接不上会看见跳帧。
// 关键帧在 index.css，三层各有一条，不能合并。
const RAIN_SHEETS = [
  { key: 'far', size: 168, animation: 'cityos-rain-far 2.6s linear infinite', opacity: 0.3, blur: 0.6 },
  { key: 'mid', size: 232, animation: 'cityos-rain-mid 1.7s linear infinite', opacity: 0.44, blur: 0 },
  { key: 'near', size: 320, animation: 'cityos-rain-near 1.15s linear infinite', opacity: 0.32, blur: 1.1 },
] as const

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

/**
 * 地图全幅气象动效。铺在底图之上、HUD 浮层之下（z-3），不吃鼠标事件。
 *
 * 只做视觉表达，不改任何推演数值——ETA 的天气增量在 condition.impact 里写死，
 * 是给人看的说明，不是这层算出来的。
 */
export const WeatherOverlay = memo(function WeatherOverlay({
  condition = CURRENT_WEATHER.condition,
  active,
}: {
  condition?: WeatherCondition
  active: boolean
}) {
  const reducedMotion = useReducedMotion()

  if (!active) return null
  const { precipitation, mist } = condition
  if (precipitation === 0 && !mist) return null

  // 强度决定用几层雨幕：小雨两层就够，再多会把底图糊掉，路线看不清。
  const sheets = RAIN_SHEETS.slice(0, precipitation === 3 ? 3 : precipitation === 2 ? 3 : 2)
  const intensityScale = precipitation === 1 ? 0.62 : precipitation === 2 ? 0.85 : 1

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[3] overflow-hidden"
      aria-hidden="true"
      data-weather-fx={condition.id}
      data-weather-motion={reducedMotion ? 'static' : 'animated'}
    >
      {mist && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgb(214 228 244 / 0.55) 0%, rgb(214 228 244 / 0.16) 42%, rgb(196 214 236 / 0.42) 100%)',
            animation: reducedMotion ? undefined : 'cityos-mist-drift 9s ease-in-out infinite',
          }}
        />
      )}

      {precipitation > 0 && (
        // 整组雨幕轻微倾斜，暗示风向；放大到 132% 保证旋转后四角不露白。
        <div className="absolute inset-0 origin-center" style={{ transform: 'rotate(9deg) scale(1.32)' }}>
          {sheets.map((sheet) => (
            <div
              key={sheet.key}
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${RAIN_TILE})`,
                backgroundRepeat: 'repeat',
                backgroundSize: `${sheet.size}px ${sheet.size}px`,
                opacity: sheet.opacity * intensityScale,
                filter: sheet.blur ? `blur(${sheet.blur}px)` : undefined,
                animation: reducedMotion ? undefined : sheet.animation,
                willChange: 'transform',
              }}
            />
          ))}
        </div>
      )}

      {condition.id === 'thunderstorm' && !reducedMotion && (
        <div
          className="absolute inset-0 bg-white"
          style={{ animation: 'cityos-lightning 7s ease-out infinite', opacity: 0 }}
        />
      )}
    </div>
  )
})

/** 顶栏天气条 */
export const WeatherChip = memo(function WeatherChip({
  condition = CURRENT_WEATHER.condition,
}: {
  condition?: WeatherCondition
}) {
  return (
    <span className="flex items-center gap-1 rounded-lg bg-[#EDF6FF] px-1.5 py-0.5">
      <img src={condition.icon} alt={`${condition.label}动画`} className="h-7 w-9 object-contain" />
      <span>
        <b className="font-mono text-ink-1">{CURRENT_WEATHER.temperatureC}°C</b>
        <span className="ml-1 text-footnote text-ink-3">{condition.label}</span>
      </span>
      <OriginMark origin="simulated" note={CURRENT_WEATHER.simulatedNote} showLabel={false} />
    </span>
  )
})

/** 地图右上角气象卡片 */
export const WeatherHud = memo(function WeatherHud({
  condition = CURRENT_WEATHER.condition,
}: {
  condition?: WeatherCondition
}) {
  return (
    <div className="absolute right-3 top-3 z-[4] flex items-center gap-2 rounded-2xl border border-[#CCE1F5] bg-white/94 px-3 py-2 shadow-[0_8px_24px_rgb(31_48_78_/_0.14)] backdrop-blur">
      <img src={condition.icon} alt={`${condition.label}动态效果`} className="h-11 w-14 object-contain" />
      <div>
        <b className="block text-[12px] text-[#263A56]">
          {condition.label} · {CURRENT_WEATHER.temperatureC}°C
        </b>
        <span className="text-[10px] text-[#718097]">{condition.impact}</span>
      </div>
      <OriginMark origin="simulated" note={CURRENT_WEATHER.simulatedNote} showLabel={false} />
    </div>
  )
})
