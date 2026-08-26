type Environment = Record<string, string | undefined>

interface CityosServerlessHandlerDependencies {
  env: Environment
  handleRequest(request: Request, env: Environment): Promise<Response>
  drainOutbox(): Promise<unknown>
  waitUntil(task: Promise<unknown>): void
  onDrainError(error: unknown): void
}

function isExecuteRequest(request: Request) {
  if (request.method !== 'POST') return false

  const url = new URL(request.url)
  const rewrittenPath = url.pathname === '/api/cityos'
    ? url.searchParams.get('path')
    : null
  const pathname = rewrittenPath === null
    ? url.pathname
    : `/${rewrittenPath.replace(/^\/+/, '')}`

  return /^(?:\/v1)?\/action-runs\/[^/]+\/execute\/?$/.test(pathname)
}

/**
 * Vercel 入口没有常驻进程。只有 execute 已经以 202 入队后，才把一次
 * 有界 outbox drain 交给平台延长请求生命周期；响应本身不等待投递完成。
 */
export function createCityosServerlessHandler({
  env,
  handleRequest,
  drainOutbox,
  waitUntil,
  onDrainError,
}: CityosServerlessHandlerDependencies) {
  return async function cityosServerlessFetch(request: Request) {
    const response = await handleRequest(request, env)

    if (response.status === 202 && isExecuteRequest(request)) {
      const task = Promise.resolve()
        .then(drainOutbox)
        .catch(onDrainError)
      waitUntil(task)
    }

    return response
  }
}

