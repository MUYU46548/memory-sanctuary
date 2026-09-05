// scripts/debug-food.js — 追踪 balanced 饿死局的食物流向
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'balance-sim-v2.js'), 'utf8');
const idx = code.indexOf('// 主程序');
const head = code.slice(0, idx);

const sandbox = { console, require, module: { exports: {} }, __dirname: path.join(__dirname, '..', 'js'), __filename: path.join(__dirname, '..', 'js', 'balance-sim-v2.js'), process, Buffer, setTimeout, clearTimeout, Math, Date, JSON };
vm.createContext(sandbox);
vm.runInContext(head, sandbox);

// 先找一个饿死结局的种子
let starveSeed = -1;
for (let s = 1; s <= 60; s++) {
    const r = sandbox.simulateGame('balanced', { seed: s });
    if (r.ending === 'starvation') { starveSeed = s; break; }
}
console.log('starved seed:', starveSeed);
if (starveSeed < 0) { process.exit(0); }

const origAdjust = sandbox.adjustResource;
sandbox.adjustResource = function (state, resource, amount) {
    const before = state.resources[resource];
    origAdjust(state, resource, amount);
    if (resource === 'food' && Math.abs(amount) > 0.05) {
        console.log(`w${state.week} food ${amount >= 0 ? '+' : ''}${amount.toFixed(1)} -> ${state.resources.food.toFixed(1)}`);
    }
};
const origSimExp = sandbox.simulateExploration;
sandbox.simulateExploration = function (state, exp, guardians, options) {
    console.log(`w${state.week} >>> 勘探 ${exp.id} 食物成本 ${exp.foodCost ?? 0}`);
    const r = origSimExp(state, exp, guardians, options);
    return r;
};
const origArchive = sandbox.archiveItem;
sandbox.archiveItem = function (state, entry, ritualType) {
    const before = { f: state.resources.food };
    const r = origArchive(state, entry, ritualType);
    const df = before.f - state.resources.food;
    if (df > 0.05) console.log(`w${state.week} 归档 ${entry.id} 食-${df.toFixed(1)} 余食=${state.resources.food.toFixed(1)}`);
    return r;
};
const origProj = sandbox.startProject;
sandbox.startProject = function (state, project) {
    const before = { f: state.resources.food };
    const r = origProj(state, project);
    console.log(`w${state.week} 启动项目 ${project.id} 食-${(before.f - state.resources.food).toFixed(1)} 余食=${state.resources.food.toFixed(1)}`);
    return r;
};
const origBuy = sandbox.buyInstantArchiveWithFood;
if (origBuy) {
    sandbox.buyInstantArchiveWithFood = function (state) {
        console.log(`w${state.week} 花30食物买立即归档 前=${state.resources.food.toFixed(1)}`);
        const r = origBuy(state);
        console.log(`  后=${state.resources.food.toFixed(1)}`);
        return r;
    };
}
const origSkip = sandbox.skipTurn;
sandbox.skipTurn = function (state) {
    const before = { f: state.resources.food };
    const r = origSkip(state);
    console.log(`w${state.week - 1} 跳过回合 食${before.f.toFixed(1)}->${state.resources.food.toFixed(1)}`);
    return r;
};

const r = sandbox.simulateGame('balanced', { seed: starveSeed });
console.log('RESULT', r.ending, 'week', r.week, 'archives', r.archivesCompleted, 'starvWeeks', r.starvationWeeksTotal, JSON.stringify(r.resources));
