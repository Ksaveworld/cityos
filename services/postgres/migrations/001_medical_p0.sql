CREATE SCHEMA IF NOT EXISTS cityos;

CREATE TABLE IF NOT EXISTS cityos.incident (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'live', 'live-degraded')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'coordinating',
  current_version BIGINT NOT NULL DEFAULT 1,
  current_plan_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.evidence_source (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  source_sequence BIGINT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('confirmed', 'reported', 'inferred')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_system, external_event_id)
);

CREATE TABLE IF NOT EXISTS cityos.facility (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'temporarily_unavailable', 'unknown')),
  status_version BIGINT NOT NULL DEFAULT 1,
  last_source_sequence BIGINT,
  evidence_source_id TEXT REFERENCES cityos.evidence_source(id),
  demo_eta_seconds INTEGER NOT NULL,
  demo_eta_low_seconds INTEGER NOT NULL,
  demo_eta_high_seconds INTEGER NOT NULL,
  demo_risk_score DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.adapter_event (
  id TEXT PRIMARY KEY,
  source_system TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  incident_id TEXT NOT NULL REFERENCES cityos.incident(id),
  facility_id TEXT NOT NULL REFERENCES cityos.facility(id),
  aggregate_version BIGINT NOT NULL,
  source_sequence BIGINT,
  idempotency_key TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'late', 'rejected')),
  payload JSONB NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (source_system, external_event_id),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS cityos.plan_version (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES cityos.incident(id),
  version INTEGER NOT NULL,
  input_version BIGINT NOT NULL,
  input_snapshot_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'stale')),
  candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, version)
);

CREATE TABLE IF NOT EXISTS cityos.action_run (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES cityos.incident(id),
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'previewed', 'confirmed', 'queued', 'running', 'succeeded', 'failed',
    'unknown', 'reconciling', 'cancelled', 'expired'
  )),
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  plan_version INTEGER NOT NULL,
  expected_incident_version BIGINT NOT NULL,
  preview_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  failure JSONB,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, action_type, idempotency_key)
);

CREATE TABLE IF NOT EXISTS cityos.task_package (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES cityos.incident(id),
  plan_version INTEGER NOT NULL,
  version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('demo', 'live', 'live-degraded')),
  simulated BOOLEAN NOT NULL,
  action_run_id TEXT NOT NULL REFERENCES cityos.action_run(id),
  facility_id TEXT NOT NULL REFERENCES cityos.facility(id),
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, version)
);

CREATE TABLE IF NOT EXISTS cityos.task_assignment (
  id TEXT PRIMARY KEY,
  task_package_id TEXT NOT NULL REFERENCES cityos.task_package(id),
  assignee TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.execution_feedback (
  id TEXT PRIMARY KEY,
  task_package_id TEXT NOT NULL REFERENCES cityos.task_package(id),
  external_feedback_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN (
    'accepted', 'en_route', 'arrived', 'completed', 'exception', 'unknown'
  )),
  detail TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.decision_lineage (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES cityos.incident(id),
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  input_version BIGINT,
  output_version BIGINT,
  action_run_id TEXT REFERENCES cityos.action_run(id),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS adapter_event_incident_idx
  ON cityos.adapter_event (incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_version_incident_idx
  ON cityos.plan_version (incident_id, version DESC);
CREATE INDEX IF NOT EXISTS task_package_incident_idx
  ON cityos.task_package (incident_id, version DESC);
CREATE INDEX IF NOT EXISTS decision_lineage_incident_idx
  ON cityos.decision_lineage (incident_id, created_at ASC);
CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON cityos.outbox (status, available_at, id);
