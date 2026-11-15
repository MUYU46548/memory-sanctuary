#!/usr/bin/env bash
# 记忆圣所 · Neutralino 桌面打包一键脚本
# 用法：从仓库根目录执行  bash desktop-build/build.sh
# 前置：neu CLI 在 PATH，或位于 Hermes 自带的 node 目录（$HOME/AppData/Local/hermes/node）
# 说明：复制游戏文件到 desktop-build/resources/，再 neu build 生成 dist/
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/desktop-build"
BIN_DIR="$ROOT/node_modules/.bin"

echo "==> 游戏根: $ROOT"
echo "==> 构建目录: $BUILD"

# neu 在 PATH，否则尝试 Hermes 自带 node 目录（跨机器：用 $HOME，勿写死用户名）
if ! command -v neu >/dev/null 2>&1; then
  for d in "$HOME/AppData/Local/hermes/node" "$HOME/AppData/Local/hermes/node/bin"; do
    if [ -x "$d/neu" ] || [ -x "$d/neu.cmd" ]; then export PATH="$PATH:$d"; break; fi
  done
fi
if ! command -v neu >/dev/null 2>&1; then
  echo "!! 未找到 neu CLI：请安装 @neutralinojs/neu 或将其目录加入 PATH"; exit 1
fi

# 1. 清空旧 resources（避免嵌套目录 bug：先删再 cp）
rm -rf "$BUILD/resources"
mkdir -p "$BUILD/resources"

# ── DLC 开关（2026-11-15）──────────────────────────────────────────────
# 升天之仪 / 绿色缤球号仍是内部开发中的半成品，玩家版**不带任何 DLC 资产**：
# 不复制 data/dlc、ascension/assembly 系列 js·css、vendor/three.js，并从打包的
# index.html 里删掉对应 <link>/<script> 标签。这样即使有人手改 URL 加 ?dlc=ascension，
# 也会因为数据 404 而进不去（标题页的「游戏模式」入口也会自动隐藏，见 main.js）。
# 内部试玩 DLC：SHIP_DLC=1 bash desktop-build/build.sh，或直接跑网页版加 ?dlc=ascension。
SHIP_DLC="${SHIP_DLC:-0}"
echo "==> DLC 打包: $( [ "$SHIP_DLC" = "1" ] && echo '包含（内部试玩）' || echo '不含（玩家版）' )"

# 2. 复制游戏文件（保留目录结构）
cp -r "$ROOT/index.html"                     "$BUILD/resources/index.html"
cp -r "$ROOT/css"                           "$BUILD/resources/css"
cp -r "$ROOT/js"                            "$BUILD/resources/js"
cp -r "$ROOT/data"                          "$BUILD/resources/data"
cp -r "$ROOT/fonts"                         "$BUILD/resources/fonts"
cp -r "$ROOT/assets"                        "$BUILD/resources/assets"

# 2.1 DLC 资产：玩家版剔除（见上方 DLC 开关说明）
if [ "$SHIP_DLC" = "1" ]; then
  cp -r "$ROOT/vendor"                      "$BUILD/resources/vendor"
else
  rm -rf "$BUILD/resources/data/dlc"
  rm -f  "$BUILD/resources/js/game-ascension.js"  "$BUILD/resources/js/audio-ascension.js" \
         "$BUILD/resources/js/ui-ascension.js"    "$BUILD/resources/js/ascension-world.js" \
         "$BUILD/resources/js/ascension-rooms.js" "$BUILD/resources/js/assembly.js" \
         "$BUILD/resources/js/assembly3d.js"      "$BUILD/resources/js/ui-assembly-v2.js"
  rm -f  "$BUILD/resources/css/ascension.css"     "$BUILD/resources/css/ascension-world.css" \
         "$BUILD/resources/css/assembly-v2.css"   "$BUILD/resources/css/assembly3d.css"
  echo "==> 已剔除 DLC 资产（data/dlc、ascension/assembly 系列 js·css、three.js）"
fi

# 3. 放置 Neutralino 客户端库（v6.9.0，与 config.cli.clientVersion 对齐）
if [ ! -f "$BUILD/resources/neutralino.js" ]; then
  echo "==> 下载 neutralino.js v6.9.0 (github.com 主站)"
  python3 -c "import urllib.request; urllib.request.urlretrieve('https://github.com/neutralinojs/neutralino.js/releases/download/v6.9.0/neutralino.js', 'desktop-build/resources/neutralino.js')"
fi

# 3.5 桌面版注入 Neutralino 客户端脚本（仓库里的 index.html 保持纯网页版，不引它）
#     注入后「退出游戏」按钮才能调用 Neutralino.app.exit() 真正关掉窗口。
#     注意：Windows 下的 python 不认 MSYS 路径（/e/...），这里先 cd 到构建目录、只传相对路径。
( cd "$BUILD" && python3 - "resources/index.html" "$SHIP_DLC" <<'PY'
import io, re, sys
p, ship = sys.argv[1], sys.argv[2]
s = io.open(p, encoding='utf-8', newline='').read()

# 玩家版：删掉 DLC 的 <link>/<script> 标签。
# 注意保留 js/dlc.js —— 它是模块注册表（DLC_MODULES / DLC_FLAGS / activeModule），
# 核心代码要读它，不能一起删。
if ship != '1':
    dlc_re = re.compile(r'^[ \t]*<(script|link)[^>]*(ascension|assembly|three\.min\.js)[^>]*>[ \t]*\r?\n?',
                        re.MULTILINE | re.IGNORECASE)
    n = len(dlc_re.findall(s))
    s = dlc_re.sub('', s)
    print('==> 已从 index.html 删除 %d 个 DLC 标签' % n)

    # 再钉一层：让 ?dlc= 开关在玩家版里彻底失效（见 js/dlc.js 的 applyDLCUrlFlags）
    guard = '<script>window.MEMORY_SANCTUARY_NO_DLC = true;</script>'
    if 'MEMORY_SANCTUARY_NO_DLC' not in s:
        s = re.sub(r'(^[ \t]*)(<script src="js/dlc\.js[^"]*"></script>)',
                   lambda m: m.group(1) + guard + '\n' + m.group(1) + m.group(2),
                   s, count=1, flags=re.MULTILINE)
        print('==> 已注入 MEMORY_SANCTUARY_NO_DLC（URL 开关失效）')

tag = '<script src="neutralino.js"></script>'
if tag not in s:
    s = s.replace('</body>', '    ' + tag + '\n</body>')
    print('==> 已注入 neutralino.js 客户端脚本')
else:
    print('==> neutralino.js 客户端脚本已存在，跳过')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
PY
)
if ! grep -q 'src="neutralino.js"' "$BUILD/resources/index.html"; then
  echo "!! 注入失败：resources/index.html 里没有 neutralino.js 引用（退出按钮会失效）"
  exit 1
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
