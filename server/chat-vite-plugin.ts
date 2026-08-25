import type { IncomingMessage } from 'node:http'

import type { Plugin } from 'vite'

import { handleCityChatRequest } from './chat-core.ts'

type Environment = Record<string, string | undefined>

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > 64 * 1024) throw new Error('REQUEST_TOO_LARGE')
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

export function cityChatDevPlugin(env: Environment): Plugin {
  return {
    name: 'cityos-chat-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://vite.local').pathname
        if (pathname !== '/api/chat') return next()
        try {
          const clientAbort = new AbortController()
          request.once('aborted', () => clientAbort.abort())
          response.once('close', () => {
            if (!response.writableEnded) clientAbort.abort()
          })
          const protocol = (request.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
          const host = request.headers.host || '127.0.0.1:5173'
          const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
          const webRequest = new Request(`${protocol}://${host}${request.url ?? '/api/chat'}`, {
            method: request.method,
            headers: webHeaders(request),
            body,
            signal: clientAbort.signal,
          })
          const webResponse = await handleCityChatRequest(webRequest, env)
          response.statusCode = webResponse.status
          webResponse.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(Buffer.from(await webResponse.arrayBuffer()))
        } catch {
          response.statusCode = 413
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: { code: 'CHAT_REQUEST_TOO_LARGE', message: '请求内容过长。', retryable: false } }))
        }
      })
    },
  }
}
