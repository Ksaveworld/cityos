/**
 * MapLibre 6 的 worker 必须由 Vite 显式发射。线上灰屏的根因修复，不要改。
 *
 * 生产构建不会自动把动态拼出的 maplibre-gl-worker.mjs 写入 dist。
 * 不走这条路径时，Vercel 会把缺失的 worker 回退成 index.html，触发 MIME 错误。
 *
 * 配套：vite.config.ts 里 `optimizeDeps.exclude: ['maplibre-gl']` 必须保留。
 * MapLibre 6 的 ESM 入口会从自身目录加载 module worker；预构建到 .vite/deps
 * 后 worker 不会被一并复制，在线矢量瓦片因此无法解析。
 */
import { setWorkerUrl } from 'maplibre-gl'
import mapLibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(mapLibreWorkerUrl)
