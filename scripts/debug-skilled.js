// scripts/debug-skilled.js — 单局 skilled 调试：打印资源与关键事件轨迹
const path = require('path');
const SIM_PATH = path.join(__dirname, '..', 'js', 'balance-sim-v2.js');

// 通过 vm 加载 sim 并暴露内部函数
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(SIM_PATH, 'utf8');

// 截取到主程序前（balance-sim-v2.js 末尾会直接跑 runSimulation，需剪掉）
const idx = code.indexOf('// 主程序');
const head = idx > 0 ? code.slice(0, idx) : code;

const sandbox = { console, require, module: { exports: {} }, __dirname: path.join(__dirname, '..', 'js'), __filename: SIM_PATH, process, Buffer, setTimeout, clearTimeout, Math, Date, JSON };
vm.createContext(sandbox);
vm.runInContext(head, sandbox);

const simulateGame = sandbox.simulateGame;

// 打补丁：在 simulateGame 的循环里记录资源
const fs2 = fs;
const orig = simulateGame.toString();
// 简单包装：无法直接插桩，改为重新执行单局并打印
for (let seed = 1001; seed <= 1010; seed++) {
    const r = simulateGame('skilled', { seed });
    console.log('seed', seed, 'ending', r.ending, 'week', r.week, 'archives', r.archivesCompleted,
        'explorations', r.explorations, 'fragments', r.fragmentsFound, 'resources', JSON.stringify(r.resources),
        'corruptionPeak', r.corruptionPeak, 'emergencyUses', r.emergencyUses, 'starvWeeks', r.starvationWeeksTotal);
}
