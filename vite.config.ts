import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { cityChatDevPlugin } from './server/chat-vite-plugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const serverEnv = {
    MINIMAX_API_KEY: process.env.MINIMAX_API_KEY ?? fileEnv.MINIMAX_API_KEY,
    MINIMAX_MODEL: process.env.MINIMAX_MODEL ?? fileEnv.MINIMAX_MODEL,
    MINIMAX_BASE_URL: process.env.MINIMAX_BASE_URL ?? fileEnv.MINIMAX_BASE_URL,
  }
  return {
    plugins: [react(), tailwindcss(), cityChatDevPlugin(serverEnv)],
    optimizeDeps: {
      // MapLibre 6 的 ESM 入口会从自身目录加载 module worker。
      // 预构建到 .vite/deps 后 worker 不会被一并复制，在线矢量瓦片因此无法解析。
      exclude: ['maplibre-gl'],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
