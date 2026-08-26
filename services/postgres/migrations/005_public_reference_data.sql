-- 公开静态点位与运行状态分开存储。
-- reference_poi 只承载名称、类型、坐标和快照来源；可用性、值守、ETA 等仍在
-- facility / resource_* 中，并继续按模拟运营数据处理。

CREATE TABLE IF NOT EXISTS cityos.dataset_snapshot (
  id TEXT PRIMARY KEY,
  dataset_name TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_url TEXT NOT NULL,
  license TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  feature_count INTEGER NOT NULL CHECK (feature_count >= 0),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_name, content_sha256)
);

CREATE TABLE IF NOT EXISTS cityos.reference_poi (
  id TEXT PRIMARY KEY,
  dataset_snapshot_id TEXT NOT NULL REFERENCES cityos.dataset_snapshot(id),
  source_feature_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hospital', 'fire_station', 'police')),
  name TEXT NOT NULL,
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_snapshot_id, source_feature_key)
);

ALTER TABLE cityos.facility
  ADD COLUMN IF NOT EXISTS reference_poi_id TEXT REFERENCES cityos.reference_poi(id);

CREATE INDEX IF NOT EXISTS reference_poi_kind_idx
  ON cityos.reference_poi (kind, name);

CREATE INDEX IF NOT EXISTS facility_reference_poi_idx
  ON cityos.facility (reference_poi_id)
  WHERE reference_poi_id IS NOT NULL;
