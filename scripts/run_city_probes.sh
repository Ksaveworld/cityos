#!/bin/sh
# 三个候选城市串行跑，避免并发触发 Overpass 限流
set -x
python scripts/osm_probe_shenzhen.py --bbox "31.20,121.42,31.26,121.52" \
  --label "上海（黄浦静安核心）" --out "data/raw/osm_probe_shanghai.json"
python scripts/osm_probe_shenzhen.py --bbox "23.10,113.25,23.16,113.35" \
  --label "广州（越秀天河核心）" --out "data/raw/osm_probe_guangzhou.json"
python scripts/osm_probe_shenzhen.py --bbox "3.11,101.66,3.17,101.76" \
  --label "吉隆坡（市中心 KLCC）" --out "data/raw/osm_probe_kl.json"
echo "=== 三城实测跑完 ==="
