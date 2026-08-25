# 天气动效素材记录

## rain-tile.svg

- 性质：**派生素材**，不是原样引用的第三方资源。
- 来源：几何形状取自 Meteocons（<https://github.com/basmilius/meteocons>）`fill/rain.svg` 的雨滴描边与蓝色渐变，
  按 256×256 可无缝平铺重排，用于地图全幅降雨动效。
- 上游许可：MIT，许可原文见 `../third-party/meteocons/LICENSE`。
- 为什么派生而不是直接用图标：Meteocons 是**图标尺度**的资源，单个图标里只有 3 滴雨，
  拉到地图全幅会糊。全幅降雨需要的是一张能平铺的雨幕贴图，上游没有提供这种规格的文件。
- 为什么不引 Lottie / rain.js 这类现成动效库：会新增运行时依赖，`CLAUDE.md` 约定新增依赖要先问，
  且比赛要求离线可运行。一张 1.2 KB 的 SVG 贴图 + CSS `transform` 平移即可达到同样效果，零依赖。

动效实现在 `src/components/dashboard/weather/WeatherFx.tsx`，
关键帧 `cityos-rainfall` 在 `src/index.css`，平移距离必须等于贴图高度 256px 才能无缝循环。
