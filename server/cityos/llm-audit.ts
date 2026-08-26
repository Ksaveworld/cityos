import { createHash, randomUUID } from 'node:crypto'

import type { CityosDatabase } from './db.ts'

export type LlmAuditStatus =
  | 'succeeded'
  | 'tool_calls'
  | 'http_error'
  | 'business_error'
  | 'invalid_response'
  | 'timeout'
  | 'network_error'

export interface LlmAuditRecord {
  requestId: string
  conversationId: string
  assistant: 'knowledge' | 'dispatch'
  intentTag?: string
  roundNo: number
  model: string
  status: LlmAuditStatus
  httpStatus: number
  latencyMs: number
  promptSha256: string
  messageCount: number
  toolsOffered: string[]
  toolCalls: string[]
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  errorCode?: string
}

export type LlmAuditSink = (record: LlmAuditRecord) => Promise<void>
export type LlmAuditReader = (limit: number) => Promise<{ items: LlmAuditListItem[] }>

export interface LlmAuditListItem extends LlmAuditRecord {
  id: string
  createdAt: number
}

export function fingerprintLlmPrompt(messages: readonly unknown[], tools: readonly unknown[]) {
  return createHash('sha256').update(JSON.stringify({ messages, tools })).digest('hex')
}

function boundedInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined
}

export function normalizeTokenUsage(usage: unknown) {
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return {}
  const record = usage as Record<string, unknown>
  const promptTokens = boundedInteger(record.prompt_tokens)
  const completionTokens = boundedInteger(record.completion_tokens)
  const declaredTotal = boundedInteger(record.total_tokens)
  const totalTokens = declaredTotal ?? (
    promptTokens !== undefined && completionTokens !== undefined
      ? promptTokens + completionTokens
      : undefined
  )
  return { promptTokens, completionTokens, totalTokens }
}

export function createPostgresLlmAuditSink(sql: CityosDatabase): LlmAuditSink {
  return async (record) => {
    await sql`
      INSERT INTO cityos.llm_call_audit (
        id, request_id, conversation_id, assistant, intent_tag, round_no,
        model, status, http_status, latency_ms, prompt_sha256, message_count,
        tools_offered, tool_calls, prompt_tokens, completion_tokens, total_tokens,
        error_code
      ) VALUES (
        ${randomUUID()}, ${record.requestId}, ${record.conversationId}, ${record.assistant},
        ${record.intentTag ?? null}, ${record.roundNo}, ${record.model}, ${record.status},
        ${record.httpStatus}, ${record.latencyMs}, ${record.promptSha256}, ${record.messageCount},
        ${sql.json(record.toolsOffered)}, ${sql.json(record.toolCalls)},
        ${record.promptTokens ?? null}, ${record.completionTokens ?? null},
        ${record.totalTokens ?? null}, ${record.errorCode ?? null}
      )
      ON CONFLICT (request_id, round_no) DO UPDATE SET
        status = EXCLUDED.status,
        http_status = EXCLUDED.http_status,
        latency_ms = EXCLUDED.latency_ms,
        tools_offered = EXCLUDED.tools_offered,
        tool_calls = EXCLUDED.tool_calls,
        prompt_tokens = EXCLUDED.prompt_tokens,
        completion_tokens = EXCLUDED.completion_tokens,
        total_tokens = EXCLUDED.total_tokens,
        error_code = EXCLUDED.error_code
    `
  }
}

export function createPostgresLlmAuditReader(sql: CityosDatabase): LlmAuditReader {
  return async (limit) => {
    const rows = await sql`
      SELECT id, request_id, conversation_id, assistant, intent_tag, round_no,
             model, status, http_status, latency_ms, prompt_sha256, message_count,
             tools_offered, tool_calls, prompt_tokens, completion_tokens, total_tokens,
             error_code, EXTRACT(EPOCH FROM created_at)::bigint AS created_at
      FROM cityos.llm_call_audit
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        requestId: String(row.request_id),
        conversationId: String(row.conversation_id),
        assistant: row.assistant as LlmAuditListItem['assistant'],
        ...(row.intent_tag === null ? {} : { intentTag: String(row.intent_tag) }),
        roundNo: Number(row.round_no),
        model: String(row.model),
        status: row.status as LlmAuditStatus,
        httpStatus: Number(row.http_status),
        latencyMs: Number(row.latency_ms),
        promptSha256: String(row.prompt_sha256),
        messageCount: Number(row.message_count),
        toolsOffered: row.tools_offered as string[],
        toolCalls: row.tool_calls as string[],
        ...(row.prompt_tokens === null ? {} : { promptTokens: Number(row.prompt_tokens) }),
        ...(row.completion_tokens === null ? {} : { completionTokens: Number(row.completion_tokens) }),
        ...(row.total_tokens === null ? {} : { totalTokens: Number(row.total_tokens) }),
        ...(row.error_code === null ? {} : { errorCode: String(row.error_code) }),
        createdAt: Number(row.created_at),
      })),
    }
  }
}
