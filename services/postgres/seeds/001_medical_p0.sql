INSERT INTO cityos.evidence_source (
  id, source_system, external_event_id, schema_version, occurred_at, received_at, confidence, payload
) VALUES (
  'source-medical-seed-v1', 'cityos-demo-seed', 'medical-seed-v1', 'medical-p0-v1',
  '2026-08-25T00:00:00Z', '2026-08-25T00:00:00Z', 'confirmed',
  '{"simulated":true,"datasetVersion":"medical-p0-v1"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cityos.incident (
  id, mode, title, status, current_version, current_plan_version, payload
) VALUES (
  'ev-medical-panfu', 'demo', '越秀商圈急救保障协同', 'coordinating', 1, 1,
  '{"simulated":true,"address":"越秀区盘福路周边","datasetVersion":"medical-p0-v1"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  payload = EXCLUDED.payload,
  updated_at = now();

INSERT INTO cityos.facility (
  id, name, longitude, latitude, status, status_version, evidence_source_id,
  demo_eta_seconds, demo_eta_low_seconds, demo_eta_high_seconds, demo_risk_score
) VALUES
  ('facility-shiyi', '广州市第一人民医院', 113.2511865, 23.1339730, 'available', 1,
   'source-medical-seed-v1', 480, 420, 600, 0.12),
  ('facility-red-cross', '广州市红十字会医院', 113.2571165, 23.1072521, 'available', 1,
   'source-medical-seed-v1', 560, 500, 680, 0.18),
  ('facility-gz-first-affiliated', '广州医科大学附属第一医院', 113.2561057, 23.1141761, 'available', 1,
   'source-medical-seed-v1', 620, 540, 760, 0.21)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  longitude = EXCLUDED.longitude,
  latitude = EXCLUDED.latitude,
  demo_eta_seconds = EXCLUDED.demo_eta_seconds,
  demo_eta_low_seconds = EXCLUDED.demo_eta_low_seconds,
  demo_eta_high_seconds = EXCLUDED.demo_eta_high_seconds,
  demo_risk_score = EXCLUDED.demo_risk_score;

INSERT INTO cityos.plan_version (
  id, incident_id, version, input_version, input_snapshot_hash, status, candidates,
  approved_by, approved_at
) VALUES (
  'plan-ev-medical-panfu-v1', 'ev-medical-panfu', 1, 1, 'medical-p0-seed-v1', 'approved',
  '[{"facilityId":"facility-shiyi","routeId":"route-medical-shiyi","etaSeconds":480,"etaRange":[420,600],"receivingStatus":"available","riskDelta":0.12,"degraded":true,"sourceIds":["source-medical-seed-v1"]}]'::jsonb,
  'demo-operator', '2026-08-25T00:00:00Z'
)
ON CONFLICT (incident_id, version) DO NOTHING;

INSERT INTO cityos.decision_lineage (
  id, incident_id, event_type, actor_id, source_ids, input_version, output_version, detail, created_at
) VALUES (
  'lineage-medical-seed-v1', 'ev-medical-panfu', 'plan.approved', 'demo-operator',
  '["source-medical-seed-v1"]'::jsonb, 1, 1,
  '{"simulated":true,"planVersion":1,"facilityId":"facility-shiyi"}'::jsonb,
  '2026-08-25T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
