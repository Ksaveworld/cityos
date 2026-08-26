-- Agent/LLM 调用审计只保存脱敏元数据和哈希。
-- 不保存消息正文、工具参数、模型原始响应或任何 API Key。

CREATE TABLE IF NOT EXISTS cityos.llm_call_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  assistant TEXT NOT NULL CHECK (assistant IN ('knowledge', 'dispatch')),
  intent_tag TEXT,
  round_no INTEGER NOT NULL CHECK (round_no >= 1),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'succeeded', 'tool_calls', 'http_error', 'business_error',
    'invalid_response', 'timeout', 'network_error'
  )),
  http_status INTEGER NOT NULL DEFAULT 0 CHECK (http_status BETWEEN 0 AND 599),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  prompt_sha256 TEXT NOT NULL CHECK (prompt_sha256 ~ '^[0-9a-f]{64}$'),
  message_count INTEGER NOT NULL CHECK (message_count >= 0),
  tools_offered JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, round_no)
);

CREATE INDEX IF NOT EXISTS llm_call_audit_conversation_idx
  ON cityos.llm_call_audit (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS llm_call_audit_status_idx
  ON cityos.llm_call_audit (status, created_at DESC);

COMMENT ON TABLE cityos.llm_call_audit IS
  '脱敏模型调用审计：仅元数据、工具名和 Prompt 哈希，不含正文与密钥';
