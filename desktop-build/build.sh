#!/usr/bin/env bash
# 记忆圣所 · Neutralino 桌面打包一键脚本
# 用法：从仓库根目录执行  bash desktop-build/build.sh
# 前置：neu CLI 已在 PATH（C:\Users\47219\AppData\Local\hermes\node）
# 说明：复制游戏文件到 desktop-build/resources/，再 neu build 生成 dist/
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/desktop-build"
BIN_DIR="$ROOT/node_modules/.bin"

echo "==> 游戏根: $ROOT"
echo "==> 构建目录: $BUILD"

# neu 在 PATH 否则尝试 hermes node 路径
if ! command -v neu >/dev/null 2>&1; then
  export PATH="$PATH:/c/Users/47219/AppData/Local/hermes/node"
fi

# 1. 清空旧 resources（避免嵌套目录 bug：先删再 cp）
rm -rf "$BUILD/resources"
mkdir -p "$BUILD/resources"

# 2. 复制游戏文件（保留目录结构）
cp -r "$ROOT/index.html"                     "$BUILD/resources/index.html"
cp -r "$ROOT/css"                           "$BUILD/resources/css"
cp -r "$ROOT/js"                            "$BUILD/resources/js"
cp -r "$ROOT/data"                          "$BUILD/resources/data"
cp -r "$ROOT/fonts"                         "$BUILD/resources/fonts"
cp -r "$ROOT/assets"                        "$BUILD/resources/assets"

# 3. 放置 Neutralino 客户端库（v6.9.0，与 config.cli.clientVersion 对齐）
if [ ! -f "$BUILD/resources/neutralino.js" ]; then
  echo "==> 下载 neutralino.js v6.9.0 (github.com 主站)"
  python3 -c "import urllib.request; urllib.request.urlretrieve('https://github.com/neutralinojs/neutralino.js/releases/download/v6.9.0/neutralino.js', 'desktop-build/resources/neutralino.js')"
fi

# 4. 构建自检：确认无嵌套目录
if [ ! -f "$BUILD/resources/js/game-save.js" ]; then
  echo "!! 构建自检失败：resources/js/game-save.js 不存在（疑似嵌套目录）"
  exit 1
fi

# 5. neu build（runtime 已在 bin/，不会重新下载）
cd "$BUILD"
rm -rf dist .tmp
neu build

echo "==> 产物: $BUILD/dist/MemorySanctuary/MemorySanctuary-win_x64.exe + resources.neu"
echo "==> 组装发布目录: E:/下载E/记忆圣所_vX.Y.Z_Windows/ (复制 exe + resources.neu 即可)"
