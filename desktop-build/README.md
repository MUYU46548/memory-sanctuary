# 记忆圣所 · 桌面打包工程（Neutralino）

本目录是 `.exe` 桌面包的构建骨架，与游戏本体解耦，方便跨版本复用。

## 目录结构
```
desktop-build/
├── neutralino.config.json   # Neutralino 配置（已固定 v6.9.0，url=/resources/index.html）
├── bin/
│   └── neutralino-win_x64.exe  # Neutralino runtime（v6.9.0，已提交，免下载）
├── build.sh                 # 一键：复制游戏文件 → neu build
├── resources/               # ⚠️ 不进 git（gitignore），由 build.sh 从游戏根生成
└── dist/                    # ⚠️ 不进 git（gitignore），neu build 产物
```

## 复用流程（发新版本时）
1. 确认游戏根 `index.html/css/js/data/fonts/assets` 已更新到目标版本
2. 更新 `neutralino.config.json` 的 `version` 与 `GAME_VERSION` 一致
3. 从仓库根执行：
   ```bash
   bash desktop-build/build.sh
   ```
4. 产物在 `desktop-build/dist/MemorySanctuary/`：
   - `MemorySanctuary-win_x64.exe`
   - `resources.neu`（65MB，含全部游戏资源）
5. 组装发布目录 `E:/下载E/记忆圣所_vX.Y.Z_Windows/`，放入 exe + resources.neu
6. 用 `gh release upload vX.Y.Z <zip>` 上传（zip 用纯英文临时名避免中文路径乱码）

## 关键坑（本机实测）
- **`neu create` 在本机超时**：访问 `api.github.com` latest 时 ETIMEDOUT。本工程已绕过——runtime 直接提交在 `bin/`，client lib 由 build.sh 从 `github.com` 主站下载（该站通畅）。
- **config 必须含 `cli.resourcesPath: "resources"`**，否则 `neu build` 报 `ENOENT .../undefined`。
- **`url` 必须 `/resources/index.html`**（不是 `/`）：`resourcesPath` 导致入口在 neu 包 `resources/` 子目录，设 `/` 会 404。
- **不要加** `documentRoot`/`resourceRoot`/`serverHost` 等非标准字段（覆盖 web 根 → 404）。
- **复制游戏文件前先 `rm -rf resources`**：否则 `cp -r` 会嵌套成 `resources/js/js/`。

详见技能 `memory-sanctuary-release` 第 8 节。
