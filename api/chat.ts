import { waitUntil } from '@vercel/functions'

import { getCityosDatabase } from '../server/cityos/db.js'
import { createPostgresLlmAuditSink, type LlmAuditRecord } from '../server/cityos/llm-audit.js'
import { handleCityChatRequest } from '../server/chat-core.js'

declare const process: {
  env: Record<string, string | undefined>
}

const env = process.env
const persistentAudit = env.CITYOS_DATABASE_URL
  ? createPostgresLlmAuditSink(getCityosDatabase(env))
  : null

function scheduleAudit(record: LlmAuditRecord) {
  if (!persistentAudit) return Promise.resolve()
  waitUntil(persistentAudit(record).catch((error) => {
    console.error('[cityos] LLM 审计写入失败', error)
  }))
  return Promise.resolve()
}

export default {
  fetch(request: Request) {
    return handleCityChatRequest(request, env, { audit: scheduleAudit })
  },
}
