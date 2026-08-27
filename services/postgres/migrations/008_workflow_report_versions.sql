CREATE TABLE IF NOT EXISTS cityos.workflow_report_version (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL CHECK (scenario_id IN (
    'liwan-fire',
    'yuexiu-police-current',
    'yuexiu-medical',
    'yuexiu-traffic',
    'yuexiu-urban-order',
    'tianhe-major'
  )),
  version INTEGER NOT NULL CHECK (version >= 2),
  report_draft JSONB NOT NULL,
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, version),
  UNIQUE (scenario_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS workflow_report_version_latest_idx
  ON cityos.workflow_report_version (scenario_id, version DESC);
