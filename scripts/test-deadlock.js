/**
 * test-deadlock.js — 全局死局判定（isGlobalDeadlock，P0 修复）回归测试
 *
 * 方式：从 js/game.js 中抽取 isGlobalDeadlock 的真实源码，在 vm 沙箱中
 * 以桩依赖（canArchiveEntry / isArchiveCompleted / isGuardianFatigued /
 * isExplorationCompleted）+ 真实/合成数据运行，验证 9 个关键场景。
 *
 * 运行：node scripts/test-deadlock.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function loadJSON(rel) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

const archivesData = loadJSON('data/archives.json');
const explorationsData = loadJSON('data/explorations.json');
const guardiansData = loadJSON('data/guardians.json');

const ARCHIVES = archivesData.archives || [];
const EXPLORATIONS = explorationsData.explorations || [];
const GUARDIANS = guardiansData.guardians || [];

// ---- 抽取真实函数源码 ----
const gameJs = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
const fnMatch = gameJs.match(/function isGlobalDeadlock\(\) \{[\s\S]*?\n\}/);
if (!fnMatch) {
    console.error('✘ 未能在 js/game.js 中找到 isGlobalDeadlock 函数');
    process.exit(1);
}

// ---- 构造状态 ----
function makeState(overrides) {
    const state = {
        week: 15,
        gameOver: false,
        consecutiveSkips: 0,
        emergencyArchiveActive: false,
        starvationWeeks: 0,
        resources: { energy: 5, media: 3, environment: 3, food: 0, engineeringBots: 0 },
        completedArchives: [],
        exploration: { fatigue: {}, completedExplorations: {}, deployedUntil: 0 },
        deterioration: { energy: false, media: false, environment: true },
        ...overrides
    };
    return state;
}

// ---- 桩依赖源码（在 vm 沙箱内执行，可访问沙箱中的 MemorySanctuary / EXPLORATIONS） ----
const STUB_SRC = `
function canArchiveEntry(entry) {
    const state = MemorySanctuary.state;
    if (!state || !entry) return false;
    if (state.completedArchives.includes(entry.id)) return false;
    if (entry.expired) return false;
    if (!state.emergencyArchiveActive && state.deterioration && state.deterioration.media) return false;
    if (state.emergencyArchiveActive) {
        return state.resources.energy >= (entry.energyCost || 0) * 2;
    }
    const energyMult = (state.deterioration && state.deterioration.energy) ? 2 : 1;
    return state.resources.energy >= (entry.energyCost || 0) * energyMult &&
        state.resources.media >= (entry.dataCost || 0);
}
function isArchiveCompleted(id) {
    return MemorySanctuary.state.completedArchives.includes(String(id));
}
function isGuardianFatigued(gid) {
    const exp = MemorySanctuary.state.exploration;
    if (!exp.fatigue) return false;
    const until = exp.fatigue[gid];
    return until && until > MemorySanctuary.state.week;
}
function isExplorationCompleted(expId) {
    const exp = MemorySanctuary.state.exploration;
    if (!exp.completedExplorations) return false;
    const data = EXPLORATIONS.find(e => e.id === expId);
    const maxAttempts = data ? (data.maxAttempts || 1) : 1;
    return (exp.completedExplorations[expId] || 0) >= maxAttempts;
}
`;

// ---- vm 沙箱 ----
function evaluateDeadlock(state, dataOverrides = {}) {
    const sandbox = {
        MemorySanctuary: {
            state,
            data: {
                archives: dataOverrides.archives || ARCHIVES,
                explorations: dataOverrides.explorations || EXPLORATIONS,
                guardians: dataOverrides.guardians || GUARDIANS
            }
        },
        EXPLORATIONS,
        console
    };
    vm.createContext(sandbox);
    const code = STUB_SRC + '\n' + fnMatch[0] + '\n;isGlobalDeadlock();';
    return vm.runInContext(code, sandbox);
}

// ---- 场景 ----
let passed = 0, failed = 0;
function assert(name, actual, expected) {
    const ok = actual === expected;
    console.log(`${ok ? '✓' : '✘'} ${name} → ${actual}（期望 ${expected}）`);
    ok ? passed++ : failed++;
}
const ALL_FATIGUED = { tika: 99, finn: 99, misha: 99, lorn: 99, ethel: 99 };

// 场景 1：饥饿死亡螺旋（真实引擎）—— stuck + 食物 0 + 连续饥饿 2 周 + 无食物/无机器人/全员疲劳 → 死局
assert('饥饿死亡螺旋 → 死局', evaluateDeadlock(makeState({
    week: 20,
    starvationWeeks: 2,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
})), true);

// 场景 2：饥饿第 1 周（下一跳不必然死亡，还有机会赌事件/勘探）→ 非死局
assert('饥饿仅第 1 周 → 非死局', evaluateDeadlock(makeState({
    week: 20,
    starvationWeeks: 1,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
})), false);

// 场景 3：跳过可恢复（存在 ≤18◈/≤12◇ 条目）→ 非死局
assert('跳过可恢复 → 非死局', evaluateDeadlock(makeState({
    week: 15,
    resources: { energy: 0, media: 0, environment: 5, food: 10, engineeringBots: 0 },
    exploration: { fatigue: {}, completedExplorations: {}, deployedUntil: 0 }
})), false);

// 场景 4：可勘探破局（食物足够 + 守护者未疲劳）→ 非死局
assert('可勘探破局（有食物+守护者）→ 非死局', evaluateDeadlock(makeState({
    week: 15,
    resources: { energy: 0, media: 0, environment: 0, food: 30, engineeringBots: 0 },
    exploration: { fatigue: {}, completedExplorations: {}, deployedUntil: 0 }
})), false);

// 场景 5：机器人专属点可破局（1 台机器人 + 第 16 周）→ 非死局
assert('机器人专属点可破局 → 非死局', evaluateDeadlock(makeState({
    week: 16,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 1 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
})), false);

// 场景 6：勘探队伍在外（返回可能带回资源）→ 非死局
assert('勘探队伍在外 → 非死局', evaluateDeadlock(makeState({
    week: 15,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 20 }
})), false);

// 场景 7：能源/介质死锁（合成数据：所有可见条目 ≥40◈/40◇，连续跳过 5 次恢复已衰减至 25%=5/3）
// + 无任何勘探路 → 死局（A 分支）
const expensiveArchives = [
    { id: 'syn_1', availableAfter: 1, energyCost: 40, dataCost: 40, expired: false },
    { id: 'syn_2', availableAfter: 1, energyCost: 45, dataCost: 45, expired: false }
];
assert('能源/介质死锁（恢复衰减至下限仍买不起）→ 死局', evaluateDeadlock(makeState({
    week: 30,
    consecutiveSkips: 5,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
}), { archives: expensiveArchives }), true);

// 场景 8：紧急归档激活时的死局口径（只比能源×2；合成数据 energyCost=12 → 需 24，跳过只恢复 18）
assert('紧急归档激活且跳过仍不足 → 死局', evaluateDeadlock(makeState({
    week: 35,
    emergencyArchiveActive: true,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
}), { archives: expensiveArchives }), true);

// 场景 9：紧急归档激活但跳过后能源足够（energyCost=8 → 需 16 ≤ 18）→ 非死局
const midArchives = [
    { id: 'syn_3', availableAfter: 1, energyCost: 8, dataCost: 40, expired: false }
];
assert('紧急归档激活且跳过可负担 → 非死局', evaluateDeadlock(makeState({
    week: 35,
    emergencyArchiveActive: true,
    resources: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
    exploration: { fatigue: ALL_FATIGUED, completedExplorations: {}, deployedUntil: 0 }
}), { archives: midArchives }), false);

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
