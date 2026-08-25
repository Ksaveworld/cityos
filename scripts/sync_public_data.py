#!/usr/bin/env python3
"""把 data/processed/ 的快照同步到 public/data/，供前端 fetch。

processed 是入库的产物快照，public 是运行时资源。两边必须一致，
所以同步走脚本不走手工复制，避免漂移。

纯文件操作，不发网络请求。重跑幂等。

用法：
    PYTHONIOENCODING=utf-8 python scripts/sync_public_data.py
    PYTHONIOENCODING=utf-8 python scripts/sync_public_data.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path

PROCESSED = Path("data/processed")
PUBLIC = Path("public/data")

# 需要进 public 的产物。不在这个清单里的不同步
FILES = [
    "liwan_buildings.geojson",
    "liwan_resources.geojson",
    "liwan_roads.geojson",
    "liwan_site.json",
    "tianhe_scenario_roads.geojson",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def main() -> int:
    parser = argparse.ArgumentParser(description="同步快照到 public")
    parser.add_argument("--check", action="store_true", help="只校验一致性，不复制")
    args = parser.parse_args()

    PUBLIC.mkdir(parents=True, exist_ok=True)
    missing, stale, ok = [], [], []

    for name in FILES:
        src, dst = PROCESSED / name, PUBLIC / name
        if not src.exists():
            missing.append(name)
            continue
        if dst.exists() and digest(src) == digest(dst):
            ok.append((name, digest(src), src.stat().st_size))
            continue
        if args.check:
            stale.append(name)
            continue
        shutil.copy2(src, dst)
        ok.append((name, digest(src), src.stat().st_size))

    for name, d, size in ok:
        print(f"  {name:<28} {size / 1024:>8.0f} KB  {d}")
    for name in missing:
        print(f"  {name:<28} 源文件不存在", file=sys.stderr)
    for name in stale:
        print(f"  {name:<28} 与 processed 不一致", file=sys.stderr)

    if missing:
        return 2
    if stale:
        print(f"\n{len(stale)} 个文件需要同步，去掉 --check 重跑", file=sys.stderr)
        return 1
    print(f"\n{len(ok)} 个文件已同步到 {PUBLIC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
