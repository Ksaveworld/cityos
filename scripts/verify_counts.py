#!/usr/bin/env python3
"""关键计数的双次一致性验证。

公共 Overpass 镜像偶尔返回空 elements，旧代码把它当成 0，会造出假零。
这里每个查询至少跑两次，两次一致才采信，不一致就再跑，最多五轮。
"""
import sys, time, json
sys.path.insert(0, 'scripts')
from osm_probe_shenzhen import run_probe, DRIVABLE

AREAS = {
    "深圳福田罗湖": "22.50,113.90,22.56,114.00",
    "广州越秀天河": "23.10,113.25,23.16,113.35",
    "广州荔湾事发点": "23.078,113.209,23.150,113.287",
    "上海黄浦静安": "31.20,121.42,31.26,121.52",
    "吉隆坡市中心": "3.11,101.66,3.17,101.76",
}

def queries(bbox):
    return {
        "建筑总数":   f'way["building"]({bbox});',
        "有层数标注": f'way["building"]["building:levels"]({bbox});',
        "有高度标注": f'way["building"]["height"]({bbox});',
        "车道数":     f'way["highway"~"{DRIVABLE}"]["lanes"]({bbox});',
        "限宽":       f'way["highway"~"{DRIVABLE}"]["maxwidth"]({bbox});',
    }

def confirmed(q, rounds=5):
    seen = []
    for _ in range(rounds):
        c = run_probe(q, rounds=2)
        if c < 0:
            time.sleep(8); continue
        seen.append(c)
        if len(seen) >= 2 and seen[-1] == seen[-2]:
            return seen[-1], seen
        time.sleep(6)
    return None, seen

out = {}
for area, bbox in AREAS.items():
    out[area] = {}
    print(f"\n=== {area} ===", flush=True)
    for name, q in queries(bbox).items():
        val, seen = confirmed(q)
        mark = "" if val is not None else "  ← 未收敛"
        print(f"  {name:<12} {val if val is not None else seen}{mark}", flush=True)
        out[area][name] = val
    json.dump(out, open('data/raw/verified_counts.json','w',encoding='utf-8'),
              ensure_ascii=False, indent=2)
print("\n写入 data/raw/verified_counts.json")
