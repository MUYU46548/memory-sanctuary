# 记忆圣所 (Memory Sanctuary)

![Version](https://img.shields.io/badge/version-v0.1.0--beta-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tech](https://img.shields.io/badge/tech-HTML5%20%2B%20CSS3%20%2B%20Vanilla%20JS-orange)

> 终来之刻，何物当存？

一款末日叙事驱动的资源管理游戏。在文明崩塌后的圣所中，玩家扮演最后的守护者，通过归档文明碎片、管理稀缺资源、探索废墟，决定后世将"看到"怎样的萨拉达斯文明。

---

## 目录

- [游戏特色](#游戏特色)
- [快速开始](#快速开始)
- [游戏玩法](#游戏玩法)
- [技术架构](#技术架构)
- [数据驱动设计](#数据驱动设计)
- [音频系统](#音频系统)
- [主题系统](#主题系统)
- [调试与开发](#调试与开发)
- [NG+ 多周目](#ng-多周目)
- [项目结构](#项目结构)
- [版权与许可](#版权与许可)
- [致谢](#致谢)

---

## 游戏特色

- **叙事驱动**：17 个结局场景，碎片化考古拼凑真相
- **资源博弈**：能源、介质、环境、食物四大资源相互制约
- **守护者系统**：5 位守护者，独特技能与性格，好感度影响全局
- **地表勘探**：派遣守护者探索废墟，获取资源与叙事碎片
- **应急协议**：腐败度管理，权衡短期生存与长期代价
- **NG+ 多周目**：继承解锁内容，发现新条目与新结局
- **无障碍支持**：键盘导航、减少动画偏好、主题切换
- **零外部依赖**：纯原生 HTML5 + CSS3 + Vanilla JS，浏览器直接运行

---

## 快速开始

### 环境要求

- 现代浏览器（Chrome 90+、Firefox 90+、Edge 90+、Safari 15+）
- 推荐使用本地 HTTP 服务器（避免浏览器安全限制）

### 启动方式

```bash
# 在项目根目录执行
python -m http.server 8099

# 浏览器访问
http://localhost:8099
```

端口可自定义，若 8099 被占用可改为其他可用端口。

### 游戏流程

1. **新建游戏** → 选择存档位（1-3）
2. **归档条目** → 消耗能源与介质，保存文明碎片
3. **管理资源** → 应对自然衰减、季节变化、腐败度
4. **地表勘探** → 派出守护者，获取额外资源
5. **启动项目** → 建造设施，获得持续收益
6. **触发事件** → 随机事件影响全局
7. **封印圣所** → 第 20 周后可结束游戏，进入结局

---

## 游戏玩法

### 资源类型

| 资源 | 上限 | 用途 | 衰减 |
|------|------|------|------|
| 能源 | 150 | 归档操作、项目启动 | ~1.0/周 |
| 介质 | 150 | 归档存储 | ~0.8/周 |
| 环境 | 100 | 维持圣所稳定 | ~0.5/周 |
| 食物 | 80 | 勘探消耗、士气维持 | ~0.3/周 |

### 守护者

| 守护者 | 特长 | 推荐场景 |
|--------|------|----------|
| 缇卡 (Tika) | 语言学、历史 | 第一存储室（语言/历史） |
| 芬恩 (Finn) | 历史、工程 | 第二存储室（法律/工程） |
| 米莎 (Misha) | 生态、探索 | 第三存储室（自然/宗教） |
| 洛恩 (Lorn) | 工程、法律 | 系统优化、效率优先 |
| 艾尔 (Ethel) | 宗教、哲学 | 第三存储室（信仰/尊严） |

### 结局系统

游戏包含 **17 个结局**，分为：
- **普通结局**（12 个）：基于归档完成度与资源状态
- **守护者个人线**（4 个）：好感度达到亲密后触发
- **隐藏结局**（1 个）：NG+ 条件下解锁

---

## 技术架构

### 设计原则

```
/js/main.js     → 启动、主题切换、数据加载调度
/js/game.js     → 核心状态机（资源、时间、归档逻辑）
/js/ui.js       → DOM 渲染与事件绑定（不含业务逻辑）
/js/canvas.js   → Canvas 绘图与动画循环（不含 UI 交互）
/js/audio.js    → BGM / SFX 管理（Web Audio API + Audio 元素）
/js/vn.js       → 视觉小说引擎（章节过渡、结局演出）
/data/*.json    → 所有条目、守护者对话、事件、项目、成就
/css/main.css   → 主题驱动样式（CSS 变量）
/index.html     → 单页应用壳
```

### 数据驱动

所有游戏内容存放在 `/data/*.json`：
- `archives.json` — 归档条目（标题、内容、存储室、成本、解锁条件）
- `guardians.json` — 守护者档案（技能、好感度对话、终局演出）
- `events.json` — 随机事件（标题、描述、选择、效果）
- `projects.json` — 建设项目（成本、效果、持续时间）
- `achievements.json` — 成就定义（类型、阈值、图标）
- `ending_scenes.json` — 结局场景（对话、背景、分支）
- `explorations.json` — 勘探地点（难度、消耗、结果概率）

**禁止在 JS 中硬编码业务数据。**

### 主题覆盖

所有 UI 必须同时适配 `[data-theme="dark"]` 与 `[data-theme="light"]`，颜色通过 CSS 变量引用：

```css
color: var(--text-primary);
background: var(--bg-panel);
border: 1px solid var(--border-subtle);
```

Canvas 绘图颜色同样从 CSS 变量动态读取：

```js
const style = getComputedStyle(document.body);
const amber = style.getPropertyValue('--amber-primary').trim();
```

---

## 音频系统

采用双轨音频架构：

- **BGM**：使用 `<audio>` 元素播放，支持淡入淡出切换
  - 默认音量 80%，可在设置中调整
  - 场景切换：标题 → 游戏 → 游戏中期 → 游戏后期 → 结局
- **SFX**：使用 Web Audio API 合成，零外部资源依赖
  - 默认音量 100%
  - 包含：归档成功、资源警告、勘探派遣、事件触发等

**静音控制**：
- 顶部栏静音按钮（全局）
- 设置面板：BGM 音量、音效音量、全局静音
- 快捷键：`Ctrl+Shift+M` 切换全局静音

---

## 调试与开发

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+D` | 切换调试面板 |
| `Esc` | 关闭调试面板 |
| `Ctrl+Shift+M` | 切换全局静音 |

### 调试面板

浏览器中按 `Ctrl+Shift+D` 打开，包含五大功能：

1. **资源修改**：实时调整能源/介质/环境/食物
2. **时间跳转**：跳转到指定周数（1-48）
3. **事件触发**：手动触发指定事件或强制随机事件
4. **成就操作**：解锁指定成就、重置所有成就
5. **状态导入/导出**：导出当前 state JSON、导入状态、清除存档

> 发布版（`DEBUG=false`）调试面板已锁定，需输入调试密码 `sanctuary-dev-2026`（见 `js/debug-panel.js` 的 `DEBUG_PASSWORD_HASH`）。开发调试请将 `js/main.js` 顶部 `DEBUG` 设为 `true` 免密打开。

### 语法检查

```bash
node -c js/game.js && node -c js/ui.js && node -c js/main.js && node -c js/canvas.js && node -c js/audio.js && node -c js/vn.js
```

---

## NG+ 多周目

完成任意结局后解锁 NG+ 模式：

- **继承内容**：已解锁的归档条目、成就、守护者终局记忆
- **新增条目**：NG+ 专属条目（需满足特定解锁条件）
- **结局扩展**：NG+ 周目可触发隐藏结局
- **进度追踪**：累计归档数、最佳记录、周目计数

---

## 项目结构

```
memory-sanctuary/
├── index.html              # 应用入口
├── README.md               # 本文件
├── LICENSE.md              # 许可证
├── AGENTS.md               # AI 开发指南
├── 开发日志.md              # 开发历史
├── 开发日志2.md             # 开发历史续
├── 游戏章节拓展.md          # 章节设计文档
├── css/
│   └── main.css            # 主题样式表（~5000 行）
├── js/
│   ├── main.js             # 启动与调度
│   ├── game.js             # 核心状态机
│   ├── game-log.js         # 日志系统（筛选、固定）
│   ├── game-events.js      # 随机事件处理
│   ├── game-exploration.js # 地表勘探系统
│   ├── game-projects.js    # 建设项目系统
│   ├── game-emergency.js   # 应急协议系统
│   ├── game-save.js        # 存档系统（含导入/导出）
│   ├── game-ending.js      # 结局系统
│   ├── game-archive.js     # 归档条目系统
│   ├── game-tutorial.js    # 新手教程
│   ├── ui.js               # DOM 渲染
│   ├── canvas.js           # Canvas 绘图
│   ├── audio.js            # 音频系统
│   ├── vn.js               # 视觉小说引擎
│   ├── debug-panel.js      # 调试面板
│   └── font-loader.js      # 字体缓存加载
├── data/
│   ├── archives.json       # 归档条目数据
│   ├── guardians.json      # 守护者数据
│   ├── events.json         # 随机事件数据
│   ├── projects.json       # 建设项目数据
│   ├── achievements.json   # 成就数据
│   ├── ending_scenes.json  # 结局场景数据
│   ├── explorations.json   # 勘探地点数据
│   └── emergency_protocols.json  # 应急协议数据
└── references/
    ├── time-axis-expansion.md    # 时间轴扩展参考
    └── ui-ux-patterns.md         # UI/UX 设计模式参考
```

---

## 版权与许可

### 代码

本项目代码采用 [MIT 许可证](LICENSE.md) 开源。

您可以自由使用、修改、分发本游戏的代码，但需保留版权声明。

### 字体

游戏使用 [霞鹜文楷](https://github.com/lxgw/LxgwWenKai) 字体，该字体采用 [SIL Open Font License 1.1](https://scripts.sil.org/OFL) 授权。

字体文件通过 Cache API 缓存，不会重复下载。

### 音频

游戏 BGM 由 AI 生成（Python + mido 脚本 + Cakewalk Sonar），轨道设计、MIDI 生成由 Hermes 助手自动完成。

音频文件为原创生成内容，可自由使用。

### 其他

游戏名称"记忆圣所"、角色名称、故事情节均为原创内容。

---

## 致谢

- **绒花计划**：本游戏属于绒花计划系列 IP
- **Hermes AI**：AI 开发助手，协助完成代码架构、数据平衡、文档编写
- **霞鹜文楷**：提供优秀的开源中文字体
- **社区玩家**：感谢所有参与测试、提供反馈的玩家

---

## 版本历史

### v0.1.0-beta (2026-08-11)

- ✅ 游戏核心系统完整可用
- ✅ 17 个结局场景（含 4 个新结局）
- ✅ 日志筛选器 + 固定机制
- ✅ 地表勘探系统（守护者差异化、技能匹配）
- ✅ 资源加成实时计算
- ✅ 结局结算淡入演出
- ✅ 调试面板（Ctrl+Shift+D）
- ✅ 标题界面全宽按钮布局
- ✅ 设置面板顺序优化
- ✅ BGM 默认音量 80%
- ✅ 圣所腐败度横条视觉修复
- ✅ 推荐归档逻辑修复（解锁+资源检测）
- ✅ 应急协议横条遮罩修复
- ✅ README + LICENSE 文档

---

*记忆圣所 — 终来之刻，何物当存？*
