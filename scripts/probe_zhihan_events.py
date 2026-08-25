#!/usr/bin/env python3
"""芷涵三个事件的数据可得性实测。

1. 2015 广州火车站持刀伤人（站前广场）—— 交通枢纽警情
2. 2014 同地点持刀事件 —— 只作历史标记，不单独测
3. 2018 台风山竹 —— 重大事件布防，关键是避护场所
"""
import sys, json, time
sys.path.insert(0, 'scripts')
from osm_probe_shenzhen import run_probe, DRIVABLE

# 广州火车站 23.1503,113.2521，取 2km 半径
STN = "23.132,113.233,23.168,113.272"
# 广州市区（山竹转移与避护场所）
CITY = "22.95,113.15,23.40,113.60"

STATION_PROBES = [
    ("路网", "可通行道路",     f'way["highway"~"{DRIVABLE}"]({STN});'),
    ("路网", "步行道",         f'way["highway"~"^(footway|pedestrian|steps)$"]({STN});'),
    ("建筑", "建筑总数",       f'way["building"]({STN});'),
    ("建筑", "有层数标注",     f'way["building"]["building:levels"]({STN});'),
    ("枢纽", "火车站",         f'nwr["railway"="station"]({STN});'),
    ("枢纽", "地铁出入口",     f'node["railway"="subway_entrance"]({STN});'),
    ("枢纽", "公交站",         f'node["highway"="bus_stop"]({STN});'),
    ("枢纽", "长途汽车站",     f'nwr["amenity"="bus_station"]({STN});'),
    ("枢纽", "出租车点",       f'nwr["amenity"="taxi"]({STN});'),
    ("处置", "医院",           f'nwr["amenity"="hospital"]({STN});'),
    ("处置", "诊所",           f'nwr["amenity"="clinic"]({STN});'),
    ("处置", "派出所",         f'nwr["amenity"="police"]({STN});'),
    ("处置", "消防站",         f'nwr["amenity"="fire_station"]({STN});'),
    ("疏散", "广场",           f'nwr["place"="square"]({STN});'),
    ("疏散", "行人区域",       f'way["highway"="pedestrian"]({STN});'),
    ("信号", "信号控制路口",   f'node["highway"="traffic_signals"]({STN});'),
]

CITY_PROBES = [
    ("台风", "避难集合点 assembly_point", f'nwr["emergency"="assembly_point"]({CITY});'),
    ("台风", "避难所 shelter",            f'nwr["amenity"="shelter"]({CITY});'),
    ("台风", "带 shelter_type 的点",      f'nwr["shelter_type"]({CITY});'),
    ("台风", "学校（潜在避护场所）",      f'nwr["amenity"="school"]({CITY});'),
    ("台风", "体育馆（潜在避护场所）",    f'nwr["leisure"="sports_centre"]({CITY});'),
    ("台风", "医院",                      f'nwr["amenity"="hospital"]({CITY});'),
    ("台风", "消防站",                    f'nwr["amenity"="fire_station"]({CITY});'),
    ("台风", "派出所",                    f'nwr["amenity"="police"]({CITY});'),
]

def run(probes, tag):
    out = []
    print(f"\n===== {tag} =====", flush=True)
    for group, name, q in probes:
        c = -1
        for _ in range(4):
            c = run_probe(q, rounds=2)
            if c >= 0:
                break
            time.sleep(8)
        print(f"  [{group}] {name:<24} {c if c>=0 else '未取到'}", flush=True)
        out.append({"group": group, "name": name, "count": c})
        json.dump(out, open(f'data/raw/probe_{tag}.json','w',encoding='utf-8'),
                  ensure_ascii=False, indent=2)
        time.sleep(4)
    return out

run(STATION_PROBES, "gz_station")
run(CITY_PROBES, "gz_typhoon")
print("\n跑完")
