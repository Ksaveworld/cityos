#!/usr/bin/env python3
"""抽取广州荔湾事发点周边的建筑与路网，输出 GeoJSON 供地图渲染。

事发点：人民南路 89、91、93、89-1 号龙城服装交易中心（23.114, 113.248）。

建筑只取事发点 1.2 km 内，够铺满一屏 2.5D 挤出，payload 可控。
路网取 4 km，覆盖可能参与调派的中队到事发点的整条路径。

层数缺失的按用途给默认值并打 levels_estimated 标记，图例里要标出来。
只用标准库。
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, "scripts")
from osm_probe_shenzhen import ENDPOINTS  # noqa: E402

FIRE_SITE = (113.2478, 23.1140)  # [lng, lat]，龙城服装交易中心

BBOX_BUILDING = "23.103,113.236,23.125,113.260"   # 约 1.2 km
BBOX_ROAD = "23.078,113.209,23.150,113.287"       # 约 4 km

DRIVABLE = (
    "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link"
    "|secondary|secondary_link|tertiary|tertiary_link"
    "|unclassified|residential|living_street|service)$"
)

# 层数缺失时的默认值。写死在这里，图例引用同一份
DEFAULT_LEVELS = {
    "retail": 3, "commercial": 3, "shop": 3, "supermarket": 3,
    "warehouse": 2, "industrial": 2,
    "residential": 6, "apartments": 6, "house": 2, "detached": 2,
    "school": 4, "hospital": 8, "office": 12, "hotel": 12,
}
FALLBACK_LEVELS = 5


def fetch(query: str, retries: int = 4) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for _ in range(retries):
        for endpoint in ENDPOINTS:
            try:
                req = urllib.request.Request(
                    endpoint, data=data,
                    headers={"User-Agent": "cityos-extract/1.0"},
                )
                with urllib.request.urlopen(req, timeout=300) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                if payload.get("remark"):
                    raise ValueError(payload["remark"][:80])
                return payload
            except Exception as exc:  # noqa: BLE001 — 任何失败都换镜像
                last = exc
                host = urllib.parse.urlparse(endpoint).hostname
                print(f"    {host} 不通（{exc}）", file=sys.stderr)
                time.sleep(4)
        time.sleep(25)
    raise RuntimeError(f"抽取失败：{last}")


def ring(geometry: list[dict]) -> list[list[float]]:
    coords = [[p["lon"], p["lat"]] for p in geometry]
    if coords and coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


def build_buildings() -> dict:
    print("抽建筑 ...", flush=True)
    payload = fetch(
        f'[out:json][timeout:300];way["building"]({BBOX_BUILDING});out geom;'
    )
    features = []
    estimated = 0
    for el in payload.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 4:
            continue
        tags = el.get("tags", {})
        raw = tags.get("building:levels")
        try:
            levels = int(float(raw))
            is_estimated = False
        except (TypeError, ValueError):
            kind = tags.get("building", "yes")
            levels = DEFAULT_LEVELS.get(kind, FALLBACK_LEVELS)
            is_estimated = True
            estimated += 1
        features.append({
            "type": "Feature",
            "id": el["id"],
            "properties": {
                "id": str(el["id"]),
                "levels": levels,
                "levels_estimated": is_estimated,
                "height": levels * 3,
                "building": tags.get("building", "yes"),
                "name": tags.get("name"),
            },
            "geometry": {"type": "Polygon", "coordinates": [ring(geom)]},
        })
    total = len(features)
    real = total - estimated
    print(f"  建筑 {total} 栋，真实层数 {real} 栋（{real / total * 100:.1f}%），"
          f"估算 {estimated} 栋")
    return {"type": "FeatureCollection", "features": features}


def build_roads() -> dict:
    print("抽路网 ...", flush=True)
    payload = fetch(
        f'[out:json][timeout:300];way["highway"~"{DRIVABLE}"]({BBOX_ROAD});out geom;'
    )
    features = []
    oneway = 0
    for el in payload.get("elements", []):
        geom = el.get("geometry")
        if not geom or len(geom) < 2:
            continue
        tags = el.get("tags", {})
        is_oneway = tags.get("oneway") == "yes"
        oneway += is_oneway
        features.append({
            "type": "Feature",
            "id": el["id"],
            "properties": {
                "id": str(el["id"]),
                "highway": tags.get("highway"),
                "name": tags.get("name"),
                "oneway": is_oneway,
                "lanes": tags.get("lanes"),
                # 硬约束字段预留，值由模拟数据生成，见数据边界文档
                "maxheight": tags.get("maxheight"),
                "maxweight": tags.get("maxweight"),
                "maxwidth": tags.get("maxwidth"),
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [[p["lon"], p["lat"]] for p in geom],
            },
        })
    print(f"  路段 {len(features)} 条，其中单行道 {oneway} 条"
          f"（{oneway / len(features) * 100:.1f}%）")
    return {"type": "FeatureCollection", "features": features}


def build_resources() -> dict:
    print("抽资源点位 ...", flush=True)
    kinds = {"fire_station": "消防站", "hospital": "医院", "police": "派出所"}
    features = []
    for key, label in kinds.items():
        payload = fetch(
            f'[out:json][timeout:180];nwr["amenity"="{key}"]({BBOX_ROAD});out center;'
        )
        for el in payload.get("elements", []):
            center = el.get("center") or (
                {"lon": el.get("lon"), "lat": el.get("lat")}
            )
            if center.get("lon") is None:
                continue
            features.append({
                "type": "Feature",
                "properties": {
                    "kind": key,
                    "kind_label": label,
                    "name": (el.get("tags") or {}).get("name") or label,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [center["lon"], center["lat"]],
                },
            })
        print(f"  {label} {sum(f['properties']['kind'] == key for f in features)} 个")
        time.sleep(5)
    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    outputs = {
        "data/processed/liwan_buildings.geojson": build_buildings,
        "data/processed/liwan_roads.geojson": build_roads,
        "data/processed/liwan_resources.geojson": build_resources,
    }
    for path, builder in outputs.items():
        fc = builder()
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(fc, fh, ensure_ascii=False)
        print(f"  写入 {path}\n")

    with open("data/processed/liwan_site.json", "w", encoding="utf-8") as fh:
        json.dump({
            "name": "龙城服装交易中心",
            "address": "广州市荔湾区人民南路 89、91、93、89-1 号",
            "center": list(FIRE_SITE),
            "event": "5·16 服装交易市场火灾",
            "date": "2024-05-16",
            "alarm_time": "09:32",
            "extinguished_time": "11:40",
            "note": "接警与扑灭为官方公开口径；首车到场时刻未公开，界面须标注为推定",
        }, fh, ensure_ascii=False, indent=2)
    print("写入 data/processed/liwan_site.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
