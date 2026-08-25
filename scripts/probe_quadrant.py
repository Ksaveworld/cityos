#!/usr/bin/env python3
"""重查询的象限拆分回退方案。

整片查太重，限流下跑不出稳定值。切四块分别查再相加，
单次负载降到四分之一。跨切线的建筑会被两个象限各数一次，
所以分子分母都用象限和，比值不受这个偏差影响。
"""
import sys, json, time
sys.path.insert(0, 'scripts')
from osm_probe_shenzhen import run_probe

def quadrants(bbox):
    s, w, n, e = map(float, bbox.split(','))
    ms, me = (s + n) / 2, (w + e) / 2
    return [f"{s},{w},{ms},{me}", f"{s},{me},{ms},{e}",
            f"{ms},{w},{n},{me}", f"{ms},{me},{n},{e}"]

def summed(tmpl, bbox, label, expect_nonzero=True):
    """象限求和。

    坑：返回 0 的块可能是假零（限流下的失败伪装成结果为零）。
    只把 c<0 当失败会让假零被静默计入，总和偏低且不报警。
    所以对市区这类必定非空的查询，0 要当作可疑值重试。
    """
    total = 0
    for i, q in enumerate(quadrants(bbox), 1):
        c = -1
        for attempt in range(4):
            c = run_probe(tmpl.format(bbox=q), rounds=2)
            if c > 0 or (c == 0 and not expect_nonzero):
                break
            if c == 0:
                print(f"    {label} 第{i}象限返回 0，可疑，重试", flush=True)
            time.sleep(10)
        if c < 0:
            print(f"    {label} 第{i}象限取不到", flush=True)
            return None
        if c == 0 and expect_nonzero:
            print(f"    {label} 第{i}象限始终为 0，无法判定真假，放弃求和", flush=True)
            return None
        print(f"    {label} 第{i}象限 {c}", flush=True)
        total += c
        time.sleep(5)
    return total

JOBS = [
    ("广州荔湾", "23.078,113.209,23.150,113.287"),
    ("上海黄浦静安", "31.20,121.42,31.26,121.52"),
]
out = {}
for label, bbox in JOBS:
    print(f"\n=== {label} ===", flush=True)
    tot = summed('way["building"]({bbox});', bbox, "建筑总数")
    lv = summed('way["building"]["building:levels"]({bbox});', bbox, "有层数标注")
    ratio = f"{lv/tot*100:.2f}%" if (tot and lv) else None
    out[label] = {"象限和_建筑总数": tot, "象限和_有层数标注": lv, "层数标注率": ratio}
    print(f"  → {label} 层数标注率 {ratio}", flush=True)
    json.dump(out, open('data/raw/quadrant_counts.json','w',encoding='utf-8'),
              ensure_ascii=False, indent=2)
