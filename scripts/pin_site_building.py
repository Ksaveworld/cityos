#!/usr/bin/env python3
"""把事发楼栋钉死到一个稳定的建筑 id。

为什么需要这个：前端原来按 name == '龙城服装交易中心' 给楼栋上色，
但 liwan_buildings.geojson 的 1141 栋里没有一栋叫这个名字（有名字的
只有 174 栋），那条判断永远不命中，事发楼栋从来没被标红过。

选择规则，确定性，不依赖任何在线查询：
  1. 站点中心点落在哪个建筑多边形内，就是它
  2. 都不在，取质心距离最近的那栋

只读 data/processed/ 下已提交的快照，把结果写回 liwan_site.json 的
site_building_id。重跑结果必须一致。

用法：
    PYTHONIOENCODING=utf-8 python scripts/pin_site_building.py
    PYTHONIOENCODING=utf-8 python scripts/pin_site_building.py --check
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

PROCESSED = Path("data/processed")
BUILDINGS = PROCESSED / "liwan_buildings.geojson"
SITE = PROCESSED / "liwan_site.json"

# 荔湾所在纬度上 1 度经度约 102.4 km，1 度纬度约 111.32 km
M_PER_DEG_LNG = 102_400.0
M_PER_DEG_LAT = 111_320.0


def rings(geometry: dict) -> list[list[list[float]]]:
    """取出所有外环。Polygon 一个，MultiPolygon 多个。"""
    kind = geometry["type"]
    if kind == "Polygon":
        return [geometry["coordinates"][0]]
    if kind == "MultiPolygon":
        return [poly[0] for poly in geometry["coordinates"]]
    return []


def contains(ring: list[list[float]], point: tuple[float, float]) -> bool:
    """射线法判点在多边形内。边界情况不苛求，落在边上算内。"""
    x, y = point
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i][0], ring[i][1]
        x2, y2 = ring[(i + 1) % n][0], ring[(i + 1) % n][1]
        if (y1 > y) != (y2 > y):
            t = (y - y1) / (y2 - y1)
            if x < x1 + t * (x2 - x1):
                inside = not inside
    return inside


def centroid(geometry: dict) -> tuple[float, float]:
    pts = [p for ring in rings(geometry) for p in ring]
    if not pts:
        return (0.0, 0.0)
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def meters(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot((a[0] - b[0]) * M_PER_DEG_LNG, (a[1] - b[1]) * M_PER_DEG_LAT)


def pick(site_center: tuple[float, float], features: list[dict]) -> tuple[dict, str, float]:
    """返回 (选中的 feature, 命中方式, 距离米)。"""
    for f in features:
        for ring in rings(f["geometry"]):
            if contains(ring, site_center):
                return f, "point-in-polygon", 0.0

    best, best_d = None, float("inf")
    for f in features:
        d = meters(centroid(f["geometry"]), site_center)
        if d < best_d:
            best, best_d = f, d
    return best, "nearest-centroid", best_d


def main() -> int:
    parser = argparse.ArgumentParser(description="钉住事发楼栋 id")
    parser.add_argument("--check", action="store_true", help="只校验，不写回")
    args = parser.parse_args()

    if not BUILDINGS.exists() or not SITE.exists():
        print(f"缺少快照，需要 {BUILDINGS} 与 {SITE}", file=sys.stderr)
        return 2

    site = json.loads(SITE.read_text(encoding="utf-8"))
    center = tuple(site["center"])
    feats = json.loads(BUILDINGS.read_text(encoding="utf-8"))["features"]

    chosen, how, dist = pick(center, feats)
    props = chosen["properties"]
    bid = str(props["id"])

    print(f"站点中心 {center}")
    print(f"命中方式 {how}" + (f"，质心距离 {dist:.1f} m" if dist else ""))
    print(f"建筑 id   {bid}")
    print(f"层数      {props['levels']}"
          f"（{'估算值' if props['levels_estimated'] else '实测值'}）")
    print(f"名称      {props.get('name') or '无'}")

    if args.check:
        recorded = site.get("site_building_id")
        if recorded != bid:
            print(f"\n不一致：文件里是 {recorded}，算出来是 {bid}", file=sys.stderr)
            return 1
        print("\n与 liwan_site.json 记录一致")
        return 0

    site["site_building_id"] = bid
    site["site_building_levels_estimated"] = bool(props["levels_estimated"])
    site["site_building_pick_rule"] = (
        "先判站点中心是否落在建筑多边形内，都不在则取质心最近的一栋"
    )
    SITE.write_text(
        json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n已写回 {SITE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
