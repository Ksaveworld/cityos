-- 资源域：调度台需要的移动单位、当前位置与值班状态。
--
-- 建模上把三件事分开，因为它们的更新频率和可信度来源完全不同：
--   resource_unit             单位本身，很少变
--   resource_position_current 当前位置，高频覆盖写，只保留最新一条
--   resource_duty_state       值班状态，由调度和回执驱动
-- 位置历史轨迹留到回放阶段再建分区表，P0 不做。
--
-- 坐标沿用 cityos.facility 的 longitude / latitude DOUBLE PRECISION，不引入 PostGIS。

ALTER TABLE cityos.incident
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS cityos.resource_unit (
  id TEXT PRIMARY KEY,
  unit_type TEXT NOT NULL CHECK (unit_type IN ('fire_engine', 'ambulance', 'police', 'uav', 'other')),
  display_name TEXT NOT NULL,
  callsign TEXT,
  home_facility_id TEXT REFERENCES cityos.facility(id),
  lifecycle TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active', 'inactive')),
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 资源实时状态全部为模拟，界面上必须标注。见 docs/数据边界.md
  simulated BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.resource_position_current (
  unit_id TEXT PRIMARY KEY REFERENCES cityos.resource_unit(id),
  longitude DOUBLE PRECISION NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  heading_deg DOUBLE PRECISION,
  speed_mps DOUBLE PRECISION,
  -- 位置和其他事实一样带来源与可信度，不能只有一个坐标。见 docs/接口契约.md §1
  source_system TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('confirmed', 'reported', 'inferred')),
  evidence_source_id TEXT REFERENCES cityos.evidence_source(id),
  recorded_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position_version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cityos.resource_duty_state (
  unit_id TEXT PRIMARY KEY REFERENCES cityos.resource_unit(id),
  duty_status TEXT NOT NULL
    CHECK (duty_status IN ('available', 'en_route', 'engaged', 'offline', 'unknown')),
  incident_id TEXT REFERENCES cityos.incident(id),
  task_package_id TEXT REFERENCES cityos.task_package(id),
  status_version BIGINT NOT NULL DEFAULT 1,
  last_source_sequence BIGINT,
  evidence_source_id TEXT REFERENCES cityos.evidence_source(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_unit_type_idx
  ON cityos.resource_unit (unit_type, lifecycle);
CREATE INDEX IF NOT EXISTS resource_duty_incident_idx
  ON cityos.resource_duty_state (incident_id, duty_status);
CREATE INDEX IF NOT EXISTS resource_position_recorded_idx
  ON cityos.resource_position_current (recorded_at DESC);

-- 调度台一次读取的形状：单位 + 位置 + 值班状态。写入路径仍然是各自的表。
CREATE OR REPLACE VIEW cityos.resource_live AS
SELECT
  u.id,
  u.unit_type,
  u.display_name,
  u.callsign,
  u.home_facility_id,
  u.simulated,
  u.properties,
  p.longitude,
  p.latitude,
  p.heading_deg,
  p.speed_mps,
  p.source_system,
  p.confidence,
  p.recorded_at,
  d.duty_status,
  d.incident_id,
  d.task_package_id,
  GREATEST(u.updated_at, p.updated_at, d.updated_at) AS updated_at
FROM cityos.resource_unit u
JOIN cityos.resource_position_current p ON p.unit_id = u.id
JOIN cityos.resource_duty_state d ON d.unit_id = u.id
WHERE u.lifecycle = 'active';

COMMENT ON VIEW cityos.resource_live IS
  '调度台读模型：只读投影，写入走 resource_unit / resource_position_current / resource_duty_state';
