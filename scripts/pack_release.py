#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
记忆圣所 0.1.0 打包脚本 — 生成发布 zip
预设方案：零构建原生静态文件包，玩家解压后通过 HTTP 服务器运行
"""
import os
import zipfile
from pathlib import Path

BASE = Path(r"E:/AI/Hermes_Workspace/memory-sanctuary")
OUT_DIR = Path(r"E:/下载E")
OUT_NAME = "记忆圣所_Memory_Sanctuary_v0.1.0-beta.zip"
OUT_PATH = OUT_DIR / OUT_NAME

# 发布包含的顶层条目（黑名单排除开发文件）
INCLUDE_TOP = [
    "index.html",
    "css",
    "js",
    "data",
    "fonts",
    "assets",
    "README.md",
    "LICENSE.md",
]

EXCLUDE_SUFFIXES = (".DS_Store", "Thumbs.db", ".swp")
EXCLUDE_NAMES = {".git", ".hermes", "scripts", "开发日志.md", "开发日志2.md",
                 "IDEA.md", "临时摘要.md", "游戏章节拓展.md", "AGENTS.md",
                 "记忆圣所_玩家体验测试问卷_问卷星导入.xlsx"}

def should_include(rel_path: str) -> bool:
    parts = rel_path.split("/")
    if any(p in EXCLUDE_NAMES for p in parts):
        return False
    if any(rel_path.endswith(s) for s in EXCLUDE_SUFFIXES):
        return False
    return True

# 收集文件
files = []
for top in INCLUDE_TOP:
    src = BASE / top
    if src.is_file():
        files.append((src, top))
    elif src.is_dir():
        for root, dirs, fnames in os.walk(src):
            # 剪枝排除目录
            dirs[:] = [d for d in dirs if d not in EXCLUDE_NAMES]
            for fname in fnames:
                full = Path(root) / fname
                rel = full.relative_to(BASE).as_posix()
                if should_include(rel):
                    files.append((full, rel))

# 写 zip
if OUT_PATH.exists():
    OUT_PATH.unlink()

total_bytes = 0
with zipfile.ZipFile(OUT_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for full, rel in sorted(files, key=lambda x: x[1]):
        zf.write(full, rel)
        total_bytes += full.stat().st_size

size_mb = total_bytes / 1024 / 1024
zip_mb = OUT_PATH.stat().st_size / 1024 / 1024

print(f"文件数: {len(files)}")
print(f"原始大小: {size_mb:.1f} MB")
print(f"压缩后: {zip_mb:.1f} MB")
print(f"输出: {OUT_PATH}")

# 校验
with zipfile.ZipFile(OUT_PATH) as zf:
    names = zf.namelist()
    bad = zf.testzip()
    print(f"zip 完整性: {'OK' if bad is None else '损坏: ' + str(bad)}")
    # 关键文件检查
    for must in ["index.html", "css/main.css", "js/main.js", "js/game-save.js",
                 "data/archives.json", "fonts/WenKai-Regular.ttf",
                 "assets/bgm/title.mp3", "README.md", "LICENSE.md"]:
        status = "✓" if must in names else "✗ 缺失!"
        print(f"  {status} {must}")
    # 确认排除
    for banned in [".git", "开发日志2.md", "AGENTS.md", "记忆圣所_玩家体验测试问卷_问卷星导入.xlsx"]:
        hit = [n for n in names if banned in n]
        status = "✓ 已排除" if not hit else f"✗ 未排除: {hit[:3]}"
        print(f"  {status} {banned}")
