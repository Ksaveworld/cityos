ALTER TABLE cityos.action_run
  ADD COLUMN IF NOT EXISTS confirm_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS confirm_request_hash TEXT,
  ADD COLUMN IF NOT EXISTS execute_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS execute_request_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS action_run_confirm_idempotency_idx
  ON cityos.action_run (id, confirm_idempotency_key)
  WHERE confirm_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS action_run_execute_idempotency_idx
  ON cityos.action_run (id, execute_idempotency_key)
  WHERE execute_idempotency_key IS NOT NULL;

ALTER TABLE cityos.execution_feedback
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS execution_feedback_task_idempotency_idx
  ON cityos.execution_feedback (task_package_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
