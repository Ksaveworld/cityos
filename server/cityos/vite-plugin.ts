import type { IncomingMessage } from 'node:http'

import type { Plugin } from 'vite'

import { getCityosDatabase } from './db.ts'
import { handleCityosRequest } from './http.ts'
import { createSimulatedMedicalAdapter, startMedicalOutboxWorker, type OutboxWorkerHandle } from './worker.ts'

type Environment = Record<string, string | undefined>

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 128 * 1024) throw new Error('REQUEST_TOO_LARGE')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function webHeaders(request: IncomingMessage) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
    else if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

export function cityosApiDevPlugin(env: Environment): Plugin {
  return {
    name: 'cityos-medical-api',
    apply: 'serve',
    configureServer(server) {
      // worker 与 API 同进程启动，避免漏起导致 ActionRun 永远停在 queued。
      let worker: OutboxWorkerHandle | null = null
      try {
        worker = startMedicalOutboxWorker(getCityosDatabase(env), createSimulatedMedicalAdapter(env))
      } catch (error) {
        console.warn('[cityos] outbox worker 未启动：', error instanceof Error ? error.message : error)
      }
      server.httpServer?.on('close', () => {
        void worker?.stop()
      })

      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://vite.local').pathname
        if (!pathname.startsWith('/v1/')) return next()
        try {
          const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
          const protocol = (request.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
          const host = request.headers.host || '127.0.0.1:5173'
          const webResponse = await handleCityosRequest(new Request(`${protocol}://${host}${request.url ?? '/'}`, {
            method: request.method,
            headers: webHeaders(request),
            body,
          }), env)
          response.statusCode = webResponse.status
          webResponse.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(Buffer.from(await webResponse.arrayBuffer()))
        } catch {
          response.statusCode = 413
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({
            error: {
              code: 'REQUEST_TOO_LARGE',
              message: '请求体超过 128 KiB。',
              retryable: false,
            },
          }))
        }
      })
    },
  }
}
