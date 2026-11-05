#!/usr/bin/env bash
# 记忆圣所 · 安装包构建脚本（Inno Setup 6）
# 用法（仓库根目录）：
#   bash desktop-build/build-installer.sh            # 用已有 dist/ 打包
#   bash desktop-build/build-installer.sh --rebuild  # 先跑 build.sh 再打包
# 前置：Inno Setup 6（winget install JRSoftware.InnoSetup -e）；非标准路径时用 ISCC 环境变量指定
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/desktop-build"
DIST="$BUILD/dist/MemorySanctuary"

echo "==> 游戏根: $ROOT"

# 1. 版本号单一来源：js/main.js 的 GAME_VERSION
VERSION="$(grep -o "GAME_VERSION = '[^']*'" "$ROOT/js/main.js" | head -1 | sed "s/.*'\(.*\)'/\1/")"
[ -n "$VERSION" ] || { echo "!! 读不到 GAME_VERSION"; exit 1; }
echo "==> 版本: $VERSION"

# 2. 定位 ISCC
ISCC="${ISCC:-}"
if [ -z "$ISCC" ]; then
  for c in \
    "$LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe" \
    "/c/Program Files (x86)/Inno Setup 6/ISCC.exe" \
    "/c/Program Files/Inno Setup 6/ISCC.exe" ; do
    [ -x "$c" ] && { ISCC="$c"; break; }
  done
fi
command -v iscc >/dev/null 2>&1 && ISCC="$(command -v iscc)"
[ -n "$ISCC" ] && [ -x "$ISCC" ] || { echo "!! 找不到 ISCC.exe：装 Inno Setup 6 或用 ISCC=/path/to/ISCC.exe 指定"; exit 1; }
echo "==> ISCC: $ISCC"

# 3. 需要时先构建桌面产物
if [ "${1:-}" = "--rebuild" ] || [ ! -f "$DIST/resources.neu" ]; then
  echo "==> 先执行 desktop-build/build.sh"
  bash "$BUILD/build.sh"
fi
[ -f "$DIST/MemorySanctuary-win_x64.exe" ] || { echo "!! dist 缺少 exe"; exit 1; }
[ -f "$DIST/resources.neu" ] || { echo "!! dist 缺少 resources.neu"; exit 1; }

# 4. 组装安装包
cd "$BUILD"
rm -rf installer-dist
"$ISCC" "/DMyAppVersion=$VERSION" installer.iss

echo
echo "==> 产物: $BUILD/installer-dist/ms-$VERSION-setup.exe"
ls -la "$BUILD/installer-dist/" | tail -3
