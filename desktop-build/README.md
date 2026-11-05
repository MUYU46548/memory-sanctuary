# 记忆圣所 · 桌面打包工程（Neutralino + Inno Setup）

本目录是**安装包**（及内部 exe/resources.neu）的构建骨架，与游戏本体解耦，方便跨版本复用。

## 目录结构
```
desktop-build/
├── neutralino.config.json   # Neutralino 配置（已固定 v6.9.0，url=/resources/index.html）
├── bin/
│   └── neutralino-win_x64.exe  # Neutralino runtime（v6.9.0，已提交，免下载）
├── build.sh                 # 一键：复制游戏文件 → neu build（出 exe + resources.neu）
├── installer.iss            # Inno Setup 6 安装脚本（按用户安装/快捷方式/可卸载/卸载问是否删存档）
├── build-installer.sh       # 一键：读 GAME_VERSION → 跑 ISCC 出安装包
├── ChineseSimplified.isl    # Inno 中文语言包（MIT，来源 kira-96/Inno-Setup-Chinese-Simplified-Translation）
├── README-player.txt        # 随安装包发出的玩家说明（装为程序目录里的 README.txt）
├── resources/               # ⚠️ 不进 git，由 build.sh 生成
├── dist/                    # ⚠️ 不进 git，neu build 产物
└── installer-dist/          # ⚠️ 不进 git，ISCC 产物（ms-<版本>-setup.exe）
```

## 发版流程（玩家只下载安装包）
1. 确认游戏根 `index.html/css/js/data/fonts/assets` 已更新；`js/main.js` 的 `GAME_VERSION` 与
   `neutralino.config.json` / `version.json` / `index.html` 缓存参数 / README 徽章保持一致
2. 从仓库根执行（一条命令出安装包，`--rebuild` 会先跑 build.sh）：
   ```bash
   bash desktop-build/build-installer.sh --rebuild
   ```
3. 产物：`desktop-build/installer-dist/ms-<版本>-setup.exe`（约 51MB，lzma2 压缩）
4. 冒烟（至少一次）：
   ```bash
   ./ms-<版本>-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART "/DIR=C:\Temp\ms-test"
   ```
   启动后扫 `127.0.0.1` 监听端口，`curl /resources/js/main.js | grep GAME_VERSION` 应与发版号一致
5. 上传：`gh release upload vX.Y.Z "E:\下载E\ms-X.Y.Z-setup.exe"`
   （本机 `uploads.github.com` 偶发 EOF，失败就重试 2–3 次）

**不要再发 zip 包**（用户 2026-11-05 明确：压缩包不省事、卸载残留、低技术玩家不会用）。

## 安装包设计要点
- **按用户安装**：`PrivilegesRequired=lowest`，装到 `%LOCALAPPDATA%\Programs\MemorySanctuary`，不需要管理员
- **主程序文件名必须保持 `MemorySanctuary-win_x64.exe`**：Neutralino 用 exe 名决定用户数据目录
  （`%APPDATA%\MemorySanctuary-win_x64.exe`，内含存档与 WebView2 缓存）。改名 = 老玩家存档失联
- **卸载清理**：Inno 只删自己装的文件，而 Neutralino 每次运行会写 `neutralinojs.log`
  → `[UninstallDelete]` 需显式删 `*.log` + `dirifempty` 收尾；不加会留下空目录
- **卸载询问存档**：`[Code] CurUninstallStepChanged` 在 `usPostUninstall` 弹窗问是否删
  `%APPDATA%\MemorySanctuary-win_x64.exe`（实测 700–900MB，几乎全是 WebView2 缓存）；
  `/VERYSILENT` 静默卸载默认**保留**存档，避免脚本化卸载误删进度
- `AppId` 固定 GUID（`B70F5349-…`），保证覆盖安装/升级识别为同一程序
- **exe 图标与版本信息**：由 `neutralino.config.json` 的 `applicationIcon`（`.png`）+
  `applicationName / author / copyright / description` 决定，`neu build`（CLI ≥ 11.3）自动写入。
  不配就会一直是 Neutralino 默认的橙色原子图标（窗口左上角、任务栏、快捷方式全跟着错）
- **BGM 自动播放**：由快捷方式/安装后启动的 `Parameters: --edge-webview-switches=--autoplay-policy=no-user-gesture-required` 实现
  （`installer.iss` 的 `MyAppLaunchArgs`）。**不要**改成写 `HKCU\Environment` 的全局环境变量——
  那会让本机所有 WebView2 应用都允许自动播放（用户明确否决）
- **退出游戏按钮**：需要 `neutralino.config.json` 里 `enableNativeAPI: true` + `nativeAllowList: ["app.exit"]`，
  且 `build.sh` 会把 `<script src="neutralino.js">` 注入到**桌面产物**的 index.html（仓库 index.html 保持纯网页版）。
  少了任何一环，点退出会被拒：`Missing permission to access Native API`

## 关键坑（本机实测）
- **`neu create` 在本机超时**：访问 `api.github.com` latest 时 ETIMEDOUT。本工程已绕过——runtime 直接提交在 `bin/`，client lib 由 build.sh 从 `github.com` 主站下载（该站通畅）。
- **config 必须含 `cli.resourcesPath: "resources"`**，否则 `neu build` 报 `ENOENT .../undefined`。
- **`url` 必须 `/resources/index.html`**（不是 `/`）：`resourcesPath` 导致入口在 neu 包 `resources/` 子目录，设 `/` 会 404。
- **不要加** `documentRoot`/`resourceRoot`/`serverHost` 等非标准字段（覆盖 web 根 → 404）。
- **复制游戏文件前先 `rm -rf resources`**：否则 `cp -r` 会嵌套成 `resources/js/js/`。
- **Inno 的 `AppId` 花括号**：要写 `AppId={{GUID}`（双花括号开头 + 单右括号），别用 `{#define}` 拼，会报 “A } is missing”。
- **Inno 6 官方不带中文**：`ChineseSimplified.isl` 放本目录，`installer.iss` 用相对路径引用，别指望 `compiler:Languages\Chinese*.isl`。

详见技能 `memory-sanctuary-release` 第 8 节。
