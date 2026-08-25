# Meteocons asset record

- Source: https://github.com/basmilius/meteocons
- Package: `@meteocons/svg@0.1.0`
- Variant: `fill/`（自带 SMIL 动画，用 `<img>` 引用即可播放，不需要 JS）
- License: MIT; the upstream license text is preserved in `LICENSE`.
- Use in CityOS: local animated weather status for the offline demonstration.

## 已下载的图标

| 文件 | 对应天气 |
|---|---|
| `clear-day.svg` | 晴 |
| `partly-cloudy-day.svg` | 多云 |
| `partly-cloudy-day-rain.svg` | 多云有雨（早期版本使用，现由 `drizzle` 取代） |
| `drizzle.svg` | 小雨 |
| `rain.svg` | 中雨 |
| `overcast-day-rain.svg` | 阴有雨 |
| `thunderstorms-day-rain.svg` | 雷阵雨 |
| `fog-day.svg` | 雾 |
| `wind.svg` | 大风 |

映射表在 `src/components/dashboard/weather/weatherConditions.ts`。

The assets are stored locally so the demo does not depend on CDN availability.

## 相关派生素材

地图全幅雨幕贴图 `../../effects/rain-tile.svg` 由本套图标的雨滴几何派生，
说明见 `../../effects/SOURCE.md`。
