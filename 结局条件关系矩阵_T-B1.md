# 结局触发条件关系矩阵表（T-B1 交付物）

> 依据：`js/game-ending.js:checkHiddenEndings()`（实际判定链）+ `data/endings.json` + `js/balance-sim-v2.js:determineEnding()`（模拟器）
> 完成度口径：条目数 / 175（排除 ngPlusExclusive）；`getVaultCompletion` 按条目数计算
> 生成日期：2026-09-06

## 一、全部结局触发条件（按实际判定优先级链排序）

| 优先级 | 结局 ID | 类型 | 触发条件 | 可达性 | 备注 |
|---|---|---|---|---|---|
| 200 | `true_ending` 超越时间 | special | 第 5 周目 + `pendingEnding==='true_ending'` | ✓ NG+ 专属 | 与完成度无关 |
| 100 | `complete_memory` 永恒记忆 | vault_completion | 175/175 全收集（非 NG+） | ✗ **时间墙+容量墙** | 48 周上限 ~64 条；vault 10 容量 90 装不下 29 条（上限 65.5%） |
| 110* | `perfect_seal` 完美封印 | special | ≥4 守护者亲密 + 全 12 vault ≥45% | ✓ | vault 10 45% = 14 条（cost 65 ≤ 90）可行 |
| 90 | `guardian_*_finale` 守护者专属（5 个） | guardian_finale | 对应守护者好感=亲密 | ✓ | 与完成度无关；5 位任 1 位亲密即可 |
| 95 | `sacrifice` 牺牲 | special | 第 40 周后 + 任意守护者牺牲 | ✓ | 叙事触发 |
| 80 | `conflict_choice` 文明抉择 | conflict | `conflictLog` 非空（至少 1 次互斥抉择） | ✓ | 与完成度无关 |
| 70 | `finale_song_of_doom` 终焉之歌 | vault_combination | vault 3+4 各 ≥80%（13+10 条） | ✓ 23 条/48 周 | — |
| 70 | `finale_roots_of_civilization` 文明之根 | vault_combination | vault 1+2+8 各 ≥70%（7+10+8=25 条） | ✓ | — |
| 70 | `finale_children_of_stardust` 星尘之子 | vault_combination | vault 6+7+12 各 ≥70%（12+14+12=38 条） | ✓ | vault 7 无扩容上限 94.7% |
| 70 | `finale_fire_of_life` 生命礼赞 | vault_combination | vault 4+7+11 各 ≥70%（9+14+9=32 条） | ✓ | vault 4 上限 91.7%、vault 7 94.7% |
| 70 | `finale_eternal_question` 永恒追问 | vault_combination | vault 4+5+12 各 ≥70%（9+8+12=29 条） | ✓ | — |
| 70 | `finale_chronicle_of_doom` 末日档案 | vault_combination | vault 2+3+8 各 ≥70%（10+13+8=31 条） | ✓ | — |
| 70 | `finale_voice_of_home` 人间烟火 | vault_combination | vault 9+10+11 各 ≥70%（7+21+9=37 条） | ⚠ **需扩容项目** | vault 10 无扩容上限 65.5%；`proj_vault_expand`(+20%→108) 后 21 条 cost 97 ≤ 108 可达 |
| 55 | `guardian_of_remnants` 文明守护者 | completion | 完成度 60%-99%（105-173 条） | ✗ **时间墙** | 48 周 × 1.34 条/周（skilled 实测）≈ 64 条；乐观上界 ~83 条（AI 助理环境预算限 ~19 次） |
| 50 | `finale_guardian_of_fragments` 碎片收集者 | percentage | 完成度 30%-59%（53-103 条） | ✓ | skilled 实测 64.2 条（36.7%）落在此区间 |
| 30 | `finale_whisper_keeper` 微光守护者 | percentage | 完成度 5%-29%（9-50 条） | ✓ | 低完成度保底 |
| 10 | `finale_silent_sanctuary` 寂静圣所 | zero_completion | 0 条 + 第 10 周后 | ✓ | 与 whisper 数学互斥 |
| 5 | `forgotten` 遗忘 | special | 0 成就 + 第 48 周 + 未主动封印 | ✓ | 极端条件 |
| 1 | `starvation` 饥荒降临 | bad | 食物耗尽第 3 周崩溃 | ✓（失败） | 游戏与模拟器均有 |

*注：`perfect_seal` 声明 priority 110，但代码检查顺序在 `complete_memory`（100）之后——全收集时永远显示 complete_memory。非全收集时 perfect_seal 优先于守护者个人线。

## 二、核心问题回答

### Q2：`finale_whisper_keeper` 的条件是否是其他结局的超集？

**否，且方向相反**。whisper_keeper 是**最低档保底结局**（5%-29% 完成度），它是"所有高优先级结局都不满足时"的兜底，不是超集。

skilled bot 100% 收敛 whisper_keeper 的**真正原因分解**（三层）：

1. **测量盲区（主因）**：模拟器 `determineEnding` 只按完成度分段，**未建模**守护者专属结局（90 优先级）、完美封印（110）、牺牲（95）、文明抉择（80）、7 个 vault 组合结局（70）——这些是真实玩家拿到"好结局"的主要路径，bot 全测不到。
2. **判定阈值偏差（次因）**：模拟器阈值 `pct>=0.4 → fragment_keeper`，但游戏 `endings.json` 是 `0.3-0.59`。skilled 实测 36.7% 在**真实游戏里是「碎片收集者」**（≥30%），模拟器却标成「微光守护者」。
3. **真实数值瓶颈（真问题）**：完成度上限被时间墙锁死在 ~37%（skilled 最优策略实测）——60%+ 结局（文明守护者/永恒记忆）在 48 周内数学上不可达。

### Q3：结局之间是否互斥？

- **显示层互斥**：`checkHiddenEndings` 短路 return，一局只显示 1 个结局。
- **条件层不互斥**：可同时满足多个（如 1 位守护者亲密 + vault 3/4 ≥80% + 完成度 36.7%），最终显示优先级最高者。
- **数学互斥**（区间不重叠）：whisper(5-29%) / fragment(30-59%) / remnants(60-99%) / silent(0%) 四档互斥；starvation/forgotten 为独立触发。
- **模拟器互斥差异**：模拟器无 `complete_memory` 外的组合判定，且 `collapse`（53.1% random）是模拟器独有结局 ID——游戏内没有 collapse 结局（需确认是否对应 game over 流程）。

### Q4：其他结局的触发路径是否被数值墙挡死？

| 结局 | 数值墙类型 | 详情 |
|---|---|---|
| `complete_memory` | 时间墙 + 容量墙 | ① 48 周 × ~1.34 条/周 ≈ 64 条 << 175 条；② vault 10 扩容后 108/153=70.6% 仍装不下全部 29 条 |
| `guardian_of_remnants` | 时间墙 | 需 105 条，现实上界 ~83 条（含 AI 助理满预算） |
| `finale_voice_of_home` | 容量墙（可绕） | vault 10 无扩容 65.5% < 70%；建 `proj_vault_expand` 后 70% 可达（21 条 cost 97 ≤ 108） |
| 其余 6 个组合结局 | 无 | 23-38 条即可，时间充裕 |
| `perfect_seal` / 守护者 / 牺牲 / 抉择 | 无 | 与完成度无关或需求低 |
| `finale_silent_sanctuary` | 无 | 0 条 + 第 10 周 |

## 三、结论与 T-B2 候选方向

**skilled 100% whisper_keeper ≠ 数值缺陷**（主要），但**完成度天花板 37%-47% 是真实设计错配**：
- 设计意图中"文明守护者（60%+）"和"永恒记忆（100%）"在当前时间/容量结构下**数学上不可达**；
- 模拟器判定阈值与游戏不一致（0.4 vs 0.3）导致结局档次被报低。

**T-B2 候选方案（需人表态）**：

- **方案 1（纯测量修正，不动数值）**：模拟器 `determineEnding` 对齐游戏区间（0.6 / 0.3-0.59 / 0.05-0.29），并增加组合/守护者结局建模或"盲区标注"。重新跑模拟后 skilled 应报 fragment_keeper（36.7%）。
- **方案 2（调完成度阈值）**：`guardian_of_remnants` 60% → 45%（45% 与 perfect_seal 全 vault 45% 呼应）；`complete_memory` 保持 100% 但标注"理论不可达，需 NG+ 继承辅助"。风险：45% 仍略高于现实上界 47%，边缘可达。
- **方案 3（松时间/成本）**：MAX_WEEK 48 → 56/60，或 AI 助理环境成本 -5 → -3（环境预算 95→~31 次），或速记窗口 6 周 → 8 周。风险：全局平衡漂移，需重跑全部策略验证。
- **方案 4（数据修正 vault 10）**：vault 10 容量 90 → 120（或拆减条目），消除人间烟火/全收集的容量墙。风险：老存档不迁移（计划已声明可接受）。

> 建议：方案 1 无条件执行（测量正确性）；方案 2/3/4 属设计决策，请人工拍板是否调整、调整幅度。
