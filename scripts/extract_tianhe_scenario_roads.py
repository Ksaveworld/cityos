#!/usr/bin/env python3
"""抽取天河两个模拟场景周边的可驾驶 OSM 路网。

覆盖范围只服务高层演练与体育中心布防的地图路线展示；输出仍是公开
OSM 几何快照，不包含实时路况、资源状态或真实调度关系。
"""

from __future__ import annotations

import json
from pathlib import Path

import extract_liwan_geojson as extractor


OUTPUT = Path("data/processed/tianhe_scenario_roads.geojson")
extractor.BBOX_ROAD = "23.118,113.312,23.148,113.362"


def main() -> int:
    roads = extractor.build_roads()
    OUTPUT.write_text(
        json.dumps(roads, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"写入 {OUTPUT}（{len(roads['features'])} 条 way）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
