-- 越秀区盘福路周边的模拟处置力量。全部为模拟数据，界面必须标注。
-- 坐标取自公开底图上的道路与站点位置，用于演示空间关系，不代表真实部署。

UPDATE cityos.incident
SET longitude = 113.2536000, latitude = 23.1327000
WHERE id = 'ev-medical-panfu' AND longitude IS NULL;

INSERT INTO cityos.resource_unit (
  id, unit_type, display_name, callsign, home_facility_id, properties
) VALUES
  ('unit-fire-01', 'fire_engine', '消防车 01', 'FIRE-01', NULL, '{"crew":6,"waterTons":6}'::jsonb),
  ('unit-fire-02', 'fire_engine', '消防车 02', 'FIRE-02', NULL, '{"crew":5,"waterTons":4}'::jsonb),
  ('unit-fire-03', 'fire_engine', '消防车 03', 'FIRE-03', NULL, '{"crew":6,"ladderMeters":32}'::jsonb),
  ('unit-amb-01', 'ambulance', '救护车 01', 'AMB-01', 'facility-shiyi', '{"crew":3,"level":"ALS"}'::jsonb),
  ('unit-amb-02', 'ambulance', '救护车 02', 'AMB-02', 'facility-red-cross', '{"crew":3,"level":"BLS"}'::jsonb),
  ('unit-amb-03', 'ambulance', '救护车 03', 'AMB-03', 'facility-gz-first-affiliated', '{"crew":2,"level":"BLS"}'::jsonb),
  ('unit-police-01', 'police', '警力 01', 'POL-01', NULL, '{"crew":2}'::jsonb),
  ('unit-police-02', 'police', '警力 02', 'POL-02', NULL, '{"crew":2}'::jsonb),
  ('unit-police-03', 'police', '警力 03', 'POL-03', NULL, '{"crew":4,"role":"traffic"}'::jsonb),
  ('unit-uav-01', 'uav', '无人机 01', 'UAV-01', NULL, '{"enduranceMinutes":35}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  callsign = EXCLUDED.callsign,
  home_facility_id = EXCLUDED.home_facility_id,
  properties = EXCLUDED.properties,
  updated_at = now();

INSERT INTO cityos.resource_position_current (
  unit_id, longitude, latitude, heading_deg, speed_mps,
  source_system, confidence, evidence_source_id, recorded_at
) VALUES
  ('unit-fire-01', 113.2489000, 23.1352000, 95, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-fire-02', 113.2571000, 23.1298000, 310, 8.4, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-fire-03', 113.2452000, 23.1301000, 20, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-amb-01', 113.2511865, 23.1339730, 180, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-amb-02', 113.2549000, 23.1214000, 15, 11.2, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-amb-03', 113.2561057, 23.1141761, 340, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-police-01', 113.2521000, 23.1341000, 270, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-police-02', 113.2596000, 23.1333000, 245, 6.8, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-police-03', 113.2544000, 23.1289000, 60, 0, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z'),
  ('unit-uav-01', 113.2538000, 23.1330000, 0, 4.5, 'cityos-demo-seed', 'inferred', 'source-medical-seed-v1', '2026-08-25T00:00:00Z')
ON CONFLICT (unit_id) DO UPDATE SET
  longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude,
  heading_deg = EXCLUDED.heading_deg,
  speed_mps = EXCLUDED.speed_mps,
  recorded_at = EXCLUDED.recorded_at,
  updated_at = now();

INSERT INTO cityos.resource_duty_state (unit_id, duty_status, incident_id) VALUES
  ('unit-fire-01', 'available', NULL),
  ('unit-fire-02', 'en_route', 'ev-medical-panfu'),
  ('unit-fire-03', 'available', NULL),
  ('unit-amb-01', 'available', NULL),
  ('unit-amb-02', 'en_route', 'ev-medical-panfu'),
  ('unit-amb-03', 'engaged', 'ev-medical-panfu'),
  ('unit-police-01', 'available', NULL),
  ('unit-police-02', 'en_route', 'ev-medical-panfu'),
  ('unit-police-03', 'available', NULL),
  ('unit-uav-01', 'engaged', 'ev-medical-panfu')
ON CONFLICT (unit_id) DO UPDATE SET
  duty_status = EXCLUDED.duty_status,
  incident_id = EXCLUDED.incident_id,
  updated_at = now();
