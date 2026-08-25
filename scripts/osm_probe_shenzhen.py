#!/usr/bin/env python3
"""深圳福田罗湖 OSM 可得性实测。

范围与 2026-08-14 那次一致：22.50-22.56N / 113.90-114.00E，约 68 km²。
只用标准库，不引依赖。每项走 Overpass 的 out count，不拉几何。

用法：
    PYTHONIOENCODING=utf-8 python scripts/osm_probe_shenzhen.py
    PYTHONIOENCODING=utf-8 python scripts/osm_probe_shenzhen.py --bbox 31.90,118.60,32.20,118.95 --label 南京主城区
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# 公共实例限流严重，轮换着用。顺序即优先级
ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    # overpass.osm.jp 证书主机名不匹配，已移除
)
ENDPOINT = ENDPOINTS[0]

# 福田罗湖，与 8/14 那次同范围
BBOX_SZ = "22.50,113.90,22.56,114.00"

# 可通行道路。排除 footway / cycleway / path / steps，消防车走不了
DRIVABLE = (
    "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link"
    "|secondary|secondary_link|tertiary|tertiary_link"
    "|unclassified|residential|living_street|service)$"
)

# 主干道，对应关键路口判定第二条判据
ARTERIAL = "^(motorway|trunk|primary|secondary)$"


def build_probes(bbox: str) -> list[tuple[str, str, str]]:
    """返回 (分组, 名称, Overpass QL body)。"""
    road = f'way["highway"~"{DRIVABLE}"]({bbox});'
    return [
        # --- 路网与消防车硬约束 ---
        ("路网", "可通行道路总数", road),
        ("路网", "主干道", f'way["highway"~"{ARTERIAL}"]({bbox});'),
        ("硬约束", "限高 maxheight", f'way["highway"~"{DRIVABLE}"]["maxheight"]({bbox});'),
        ("硬约束", "限重 maxweight", f'way["highway"~"{DRIVABLE}"]["maxweight"]({bbox});'),
        ("硬约束", "限宽 maxwidth", f'way["highway"~"{DRIVABLE}"]["maxwidth"]({bbox});'),
        ("硬约束", "路宽 width", f'way["highway"~"{DRIVABLE}"]["width"]({bbox});'),
        ("硬约束", "车道数 lanes", f'way["highway"~"{DRIVABLE}"]["lanes"]({bbox});'),
        # --- 特权规则的影响面 ---
        ("特权规则", "单行道 oneway=yes", f'way["highway"~"{DRIVABLE}"]["oneway"="yes"]({bbox});'),
        ("特权规则", "转向限制关系", f'relation["type"="restriction"]({bbox});'),
        (
            "特权规则",
            "公交专用道标注",
            f'(way["highway"~"{DRIVABLE}"]["busway"]({bbox});'
            f'way["highway"~"{DRIVABLE}"]["lanes:bus"]({bbox});'
            f'way["highway"~"{DRIVABLE}"]["bus:lanes"]({bbox});'
            f'way["highway"="busway"]({bbox}););',
        ),
        # --- 关键路口判定 ---
        ("路口", "信号控制路口", f'node["highway"="traffic_signals"]({bbox});'),
        ("路口", "全部路口节点", f'node["highway"="crossing"]({bbox});'),
        # --- 建筑，复核 8/14 的数字 ---
        ("建筑", "建筑总数", f'way["building"]({bbox});'),
        ("建筑", "有层数标注", f'way["building"]["building:levels"]({bbox});'),
        ("建筑", "有高度标注", f'way["building"]["height"]({bbox});'),
        ("建筑", "有建成年代标注", f'way["building"]["start_date"]({bbox});'),
        # --- POI，同 bbox 口径 ---
        ("POI", "消防站", f'nwr["amenity"="fire_station"]({bbox});'),
        ("POI", "医院", f'nwr["amenity"="hospital"]({bbox});'),
        ("POI", "派出所", f'nwr["amenity"="police"]({bbox});'),
        ("POI", "消火栓", f'nwr["emergency"="fire_hydrant"]({bbox});'),
        ("POI", "避难场所", f'nwr["emergency"="assembly_point"]({bbox});'),
    ]


def run_probe(body: str, rounds: int = 3) -> int:
    """逐个镜像试，全挂了再退避重来。返回 -1 表示这一项没拿到。"""
    query = f"[out:json][timeout:180];\n{body}\nout count;"
    data = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for round_no in range(rounds):
        for endpoint in ENDPOINTS:
            try:
                req = urllib.request.Request(
                    endpoint, data=data, headers={"User-Agent": "cityos-osm-probe/1.0"}
                )
                with urllib.request.urlopen(req, timeout=200) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                # 超时的查询会带 remark，但仍然返回 total: 0。
                # 不看 remark 就会把「查失败了」当成「结果是零」。
                if payload.get("remark"):
                    raise ValueError(f"服务端 remark：{payload['remark'][:80]}")
                # out count 必定返回一个带 tags.total 的 element。
                # 空 elements 或缺 total 说明镜像吐了半截，不是真的零，换下一个。
                elements = payload.get("elements", [])
                if not elements or "total" not in elements[0].get("tags", {}):
                    raise ValueError("响应里没有 count，判定为镜像故障")
                return int(elements[0]["tags"]["total"])
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
                    json.JSONDecodeError, ValueError, KeyError, OSError) as exc:
                last = exc
                host = urllib.parse.urlparse(endpoint).hostname
                print(f"      {host} 不通（{exc}）", file=sys.stderr)
                time.sleep(3)
        wait = 30 * (round_no + 1)
        print(f"    四个镜像都没通，{wait} 秒后重来", file=sys.stderr)
        time.sleep(wait)
    print(f"    放弃这一项：{last}", file=sys.stderr)
    return -1


def main() -> int:
    parser = argparse.ArgumentParser(description="OSM 可得性实测")
    parser.add_argument("--bbox", default=BBOX_SZ, help="south,west,north,east")
    parser.add_argument("--label", default="深圳福田罗湖")
    parser.add_argument("--out", default="data/raw/osm_probe.json")
    args = parser.parse_args()

    probes = build_probes(args.bbox)

    # 断点续跑：已经拿到的项不重复问
    done: dict[str, int] = {}
    try:
        with open(args.out, encoding="utf-8") as fh:
            prev = json.load(fh)
        if prev.get("bbox") == args.bbox:
            done = {r["name"]: r["count"] for r in prev["results"] if r["count"] >= 0}
            if done:
                print(f"续跑，已有 {len(done)} 项\n")
    except (OSError, ValueError, KeyError):
        pass

    results: list[dict] = []
    print(f"范围 {args.label}（{args.bbox}），共 {len(probes)} 项\n")
    for group, name, body in probes:
        if name in done:
            print(f"  [{group}] {name} ... {done[name]}（已有）")
            results.append({"group": group, "name": name, "count": done[name]})
            continue
        print(f"  [{group}] {name} ...", end=" ", flush=True)
        count = run_probe(body)
        print(count if count >= 0 else "未取到")
        results.append({"group": group, "name": name, "count": count})
        # 中途落盘，被打断也不白跑
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"label": args.label, "bbox": args.bbox,
                       "results": results}, fh, ensure_ascii=False, indent=2)
        time.sleep(4)

    lookup = {r["name"]: r["count"] for r in results if r["count"] >= 0}

    def rate(part: str, whole: str) -> str:
        total = lookup.get(whole, 0)
        if not total or part not in lookup:
            return "无数据"
        return f"{lookup[part] / total * 100:.2f}%"

    print(f"\n{'=' * 46}")
    print(f"{args.label}  标注率")
    print(f"{'=' * 46}")
    for tag in ("限高 maxheight", "限重 maxweight", "限宽 maxwidth", "路宽 width", "车道数 lanes"):
        print(f"  {tag:<18} {lookup.get(tag, 0):>7,}  {rate(tag, '可通行道路总数'):>8}")
    print(f"  {'单行道 oneway=yes':<18} {lookup.get('单行道 oneway=yes', 0):>7,}  "
          f"{rate('单行道 oneway=yes', '可通行道路总数'):>8}")
    print(f"  {'建筑层数':<18} {lookup.get('有层数标注', 0):>7,}  {rate('有层数标注', '建筑总数'):>8}")
    print(f"  {'建成年代':<18} {lookup.get('有建成年代标注', 0):>7,}  "
          f"{rate('有建成年代标注', '建筑总数'):>8}")

    payload = {
        "label": args.label,
        "bbox": args.bbox,
        "endpoint": ENDPOINT,
        "results": results,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f"\n原始结果写入 {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
