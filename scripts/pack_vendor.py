#!/usr/bin/env python3
"""从宿主仓库 packages/feature-* 打 vendor tgz（源码打包，无需宿主构建）。

产物带 `package/` 前缀，打包范围 = 各包 package.json 的 files 字段（src/schema/bin 等）。
"""
import os
import tarfile
import json
from pathlib import Path

# 宿主源码仓（提供 packages/feature-*）与产物目录。
# 宿主是另一个仓库，与本仓分开 checkout；用环境变量指向它。
BIBIT = Path(os.environ.get("BIBIT_REPO", "~/bibit")).expanduser() / "packages"
OUT = Path(__file__).resolve().parent.parent / "vendor"

PACKAGES = {
    "feature-contracts": "bibit-feature-contracts-0.3.0.tgz",
    "feature-sdk": "bibit-feature-sdk-0.3.0.tgz",
    "feature-plugin-sdk": "bibit-feature-plugin-sdk-0.3.0.tgz",
    "feature-dev-host": "bibit-feature-dev-host-0.3.0.tgz",
}

def pack_pkg(name: str, out_name: str) -> None:
    pkg_dir = BIBIT / name
    assert pkg_dir.is_dir(), f"缺少 {pkg_dir}"
    pkg_json = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
    files_glob = pkg_json.get("files", ["src"])
    out_path = OUT / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(out_path, "w:gz") as tar:
        # 永远带 package.json
        tar.add(pkg_dir / "package.json", arcname="package/package.json")
        # 按 files 字段逐个目录/文件打包
        for entry in files_glob:
            t = pkg_dir / entry
            if not t.exists():
                print(f"  ⚠️  {name}: files 字段里的 {entry} 不存在，跳过")
                continue
            if t.is_file():
                tar.add(t, arcname=f"package/{t.name}")
            elif t.is_dir():
                for f in sorted(t.rglob("*")):
                    if f.is_file() and "node_modules" not in f.parts:
                        rel = f.relative_to(pkg_dir)
                        tar.add(f, arcname=f"package/{rel}")
    size = out_path.stat().st_size
    print(f"✅ {out_name} ({size} bytes)")

if __name__ == "__main__":
    for name, out in PACKAGES.items():
        pack_pkg(name, out)
    print("完成")
