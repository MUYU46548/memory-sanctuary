/**
 * game-tech.js - 通用科技树（v0.2.4 新增，从开发清单.md 阶段 1 落地）
 *
 * 设计边界（硬约束）：
 * - 效果类型来自 开发清单.md 1.0 允许表 + exploreIntel（v0.2.4 去重新增，见 data/tech.json 注释）：
 *   exploreYield / exploreRiskCut / exploreIntel / revealHidden / fatigueGuard / moodDecaySlow /
 *   archiveCostReduce / archiveMoodBonus / conflictInsight / clueChainBoost / supplyBonus，
 *   与维护项目系统的 6 类效果（resourceBoost / foodBoost / decayReduction / unlockArchives /
 *   aiAssistant / buildBot）零重叠。
 * - 去重规则：同一 effect.type 不跨域重复（revealHidden 仅深研学派、fatigueGuard 仅轮休制度），
 *   防止玩家跨域购买到因下限封顶/布尔开关而完全无效的重复效果。
 * - 机器人系统已含「腐败抑制」，本模块不设 corruptionResist 类效果。
 * - fatigueGuard 为独立来源（与 ENGINEERING_BOTS_CONFIG.fatigueGuardPerBot 叠加，见 game-exploration.js）。
 * - 互斥学说：同 doctrine 组内选中一个节点后，其余节点被锁死（techDoctrines[doctrine] = id）。
 *
 * 数据源：data/tech.json（业务数据零硬编码）。全部函数带 null 守卫。
 */

/** 获取科技定义（读 MemorySanctuary.data.tech） */
function getTechById(id) {
    const techs = MemorySanctuary.data && MemorySanctuary.data.tech;
    if (!techs) return null;
    return techs.find(t => t.id === id) || null;
}

/** 初始化科技状态字段（新游戏与旧存档读档兜底两用） */
function initTechState() {
    const state = MemorySanctuary.state;
    if (!state) return;
    if (!Array.isArray(state.techUnlocked)) state.techUnlocked = [];
    if (!Array.isArray(state.techUpgrades)) state.techUpgrades = [];
    if (!state.techDoctrines || typeof state.techDoctrines !== 'object') state.techDoctrines = {};
}

/**
 * 学说互斥判定（v0.2.4 修正语义）：
 * 同 doctrine 组已选节点后，锁死的是**另一分支**；若候选节点沿 prereq 祖先链能追溯到已选节点
 * （即同分支的后继层），视为路线推进而非互斥，允许研究。
 * 这样清单 1.1 中「prereq 指向本组首节点 + 同 doctrine」的二层节点才可达。
 */
function isDoctrineLocked(doctrineKey, techId) {
    const state = MemorySanctuary.state;
    if (!state || !doctrineKey) return false;
    const picked = state.techDoctrines ? state.techDoctrines[doctrineKey] : null;
    if (!picked || picked === techId) return false;

    const techs = (MemorySanctuary.data && MemorySanctuary.data.tech) || [];
    const byId = {};
    techs.forEach(t => { byId[t.id] = t; });
    if (!byId[picked]) return false;

    // 沿候选节点的 prereq 链向上走（仅限同组节点），找到 picked 即同分支
    let cur = techId;
    let depth = 0;
    while (cur && depth++ < 12) {
        const node = byId[cur];
        if (!node) break;
        const prereqs = node.prereq || [];
        if (prereqs.includes(picked)) return false; // 同分支后继 → 允许
        // 继续沿同组的第一个前置向上
        cur = prereqs.find(pid => byId[pid] && byId[pid].doctrine === doctrineKey);
    }
    return true;
}

/**
 * 计算科技解锁状态（供 UI 与 unlockTech 共用，单一口径）
 * 返回 { ok: bool, reason: string }
 */
function getTechUnlockState(id) {
    const state = MemorySanctuary.state;
    if (!state) return { ok: false, reason: '尚未开始游戏' };
    initTechState();
    const tech = getTechById(id);
    if (!tech) return { ok: false, reason: '未知科技' };
    if (state.techUnlocked.includes(id)) return { ok: false, reason: '已解锁' };
    if (tech.unlockWeek && state.week < tech.unlockWeek) {
        return { ok: false, reason: `第 ${tech.unlockWeek} 周解锁` };
    }
    const missing = (tech.prereq || []).filter(pid => !state.techUnlocked.includes(pid));
    if (missing.length > 0) {
        const names = missing.map(pid => (getTechById(pid) || {}).name || pid).join('、');
        return { ok: false, reason: `需要前置：${names}` };
    }
    if (isDoctrineLocked(tech.doctrine, id)) {
        const picked = getTechById(state.techDoctrines[tech.doctrine]);
        return { ok: false, reason: `学说互斥：已选「${picked ? picked.name : state.techDoctrines[tech.doctrine]}」` };
    }
    const cost = tech.cost || {};
    if ((state.resources.energy || 0) < (cost.energy || 0) ||
        (state.resources.media || 0) < (cost.media || 0)) {
        return { ok: false, reason: `资源不足（需 ◈${cost.energy || 0} ◇${cost.media || 0}）` };
    }
    return { ok: true, reason: '可研究' };
}

/**
 * 解锁科技：校验前置/周数/学说互斥/资源 → 扣费 → 写入 techUnlocked 与 techDoctrines
 * 返回是否成功
 */
function unlockTech(id) {
    const state = MemorySanctuary.state;
    if (!state || state.gameOver) return false;

    const check = getTechUnlockState(id);
    if (!check.ok) {
        addLog(`🔬 无法研究「${(getTechById(id) || {}).name || id}」：${check.reason}。`, 'system');
        return false;
    }

    const tech = getTechById(id);
    const cost = tech.cost || {};
    state.resources.energy -= cost.energy || 0;
    state.resources.media -= cost.media || 0;
    state.techUnlocked.push(id);
    // 学说路线记录首节点（分支代表）；同分支后继推进不覆盖
    if (tech.doctrine && !state.techDoctrines[tech.doctrine]) {
        state.techDoctrines[tech.doctrine] = id;
    }

    addLog(`🔬 科技解锁：「${tech.name}」—— ${tech.effectText || ''}`, 'success');
    if (tech.doctrine) {
        const doctrineNames = (MemorySanctuary.data.techMeta && MemorySanctuary.data.techMeta.doctrineNames) || {};
        addLog(`⚖ ${doctrineNames[tech.doctrine] || '学说'}路线已确定（同组其它分支已锁死）。`, 'system');
    }
    if (typeof AudioSystem !== 'undefined' && AudioSystem.playProjectComplete) {
        AudioSystem.playProjectComplete();
    }

    renderAll();
    return true;
}

/**
 * P1-6 修复：科技升级判定（v0.2.7）
 * 解锁后的学说根节点可继续投入资源「升级」，强化既有效果，让科技树不再是一次性消费。
 * 返回 { ok: bool, reason: string }
 */
function getTechUpgradeState(id) {
    const state = MemorySanctuary.state;
    if (!state) return { ok: false, reason: '尚未开始游戏' };
    initTechState();
    const tech = getTechById(id);
    if (!tech || !tech.upgrade) return { ok: false, reason: '无升级路径' };
    if (!state.techUnlocked.includes(id)) return { ok: false, reason: '需先解锁' };
    if (state.techUpgrades.includes(id)) return { ok: false, reason: '已升级' };
    const cost = tech.upgrade.cost || {};
    if ((state.resources.energy || 0) < (cost.energy || 0) ||
        (state.resources.media || 0) < (cost.media || 0)) {
        return { ok: false, reason: `资源不足（需 ◈${cost.energy || 0} ◇${cost.media || 0}）` };
    }
    return { ok: true, reason: '可升级' };
}

/** 执行科技升级：校验 → 扣费 → 写入 techUpgrades。返回是否成功 */
function upgradeTech(id) {
    const state = MemorySanctuary.state;
    if (!state || state.gameOver) return false;

    const check = getTechUpgradeState(id);
    if (!check.ok) {
        addLog(`🔬 无法升级「${(getTechById(id) || {}).name || id}」：${check.reason}。`, 'system');
        return false;
    }

    const tech = getTechById(id);
    const cost = tech.upgrade.cost || {};
    state.resources.energy -= cost.energy || 0;
    state.resources.media -= cost.media || 0;
    if (!state.techUpgrades) state.techUpgrades = [];
    state.techUpgrades.push(id);

    addLog(`🔬 科技升级：「${tech.upgrade.name || tech.name + '·进阶'}」—— ${tech.upgrade.text || ''}`, 'success');
    if (typeof AudioSystem !== 'undefined' && AudioSystem.playProjectComplete) {
        AudioSystem.playProjectComplete();
    }

    renderAll();
    return true;
}

/** 汇总某科技的基础效果 + 升级效果（供 getTech*Bonus 共用） */
function getTechEffectValues(id) {
    const state = MemorySanctuary.state;
    const values = [];
    const tech = getTechById(id);
    if (!tech) return values;
    if (tech.effect && tech.effect.type) values.push(tech.effect);
    if (tech.upgrade && state && state.techUpgrades && state.techUpgrades.includes(id) && tech.upgrade.effect) {
        values.push(tech.upgrade.effect);
    }
    return values;
}

/**
 * 勘探域科技加成：{ yieldBonus, riskCut, intelReveal }
 * 叠加规则（开发清单 1.4）：在 getBotExploreBonus() 之后叠加同类乘数，上限各自独立
 * intelReveal（守真勘探 exploreIntel）：勘探情报指认藏有隐藏叙事的未归档条目（纯叙事指引）
 */
function getTechExploreBonus() {
    const bonus = { yieldBonus: 0, riskCut: 0, intelReveal: false };
    const state = MemorySanctuary.state;
    if (!state || !state.techUnlocked || state.techUnlocked.length === 0) return bonus;
    state.techUnlocked.forEach(id => {
        const tech = getTechById(id);
        if (!tech) return;
        getTechEffectValues(id).forEach(effect => {
            if (effect.type === 'exploreYield') bonus.yieldBonus += effect.value || 0;
            if (effect.type === 'exploreRiskCut') bonus.riskCut += effect.value || 0;
            if (effect.type === 'exploreIntel') bonus.intelReveal = true;
        });
    });
    return bonus;
}

/**
 * 归档域科技加成：{ costReduce, moodBonus, revealHidden, conflictInsight, clueChain }
 * revealHidden 仅来自归档域「深研学派」（v0.2.4 去重后守真勘探不再提供，勘探侧指引走 intelReveal）
 */
function getTechArchiveBonus() {
    const bonus = { costReduce: 0, moodBonus: 0, revealHidden: false, conflictInsight: false, clueChain: false };
    const state = MemorySanctuary.state;
    if (!state || !state.techUnlocked || state.techUnlocked.length === 0) return bonus;
    state.techUnlocked.forEach(id => {
        const tech = getTechById(id);
        if (!tech) return;
        getTechEffectValues(id).forEach(effect => {
            switch (effect.type) {
                case 'archiveCostReduce': bonus.costReduce += effect.value || 0; break;
                case 'archiveMoodBonus': bonus.moodBonus += effect.value || 0; break;
                case 'revealHidden': bonus.revealHidden = true; break;
                case 'conflictInsight': bonus.conflictInsight = true; break;
                case 'clueChainBoost': bonus.clueChain = true; break;
            }
        });
    });
    return bonus;
}

/**
 * 环境域科技加成：{ fatigueGuard, moodDecaySlow, supplyBonus }
 * fatigueGuard 单位：周（与机器人 fatigueGuardPerBot 为独立来源，可叠加）
 */
function getTechEnvBonus() {
    const bonus = { fatigueGuard: 0, moodDecaySlow: 0, supplyBonus: 0 };
    const state = MemorySanctuary.state;
    if (!state || !state.techUnlocked || state.techUnlocked.length === 0) return bonus;
    state.techUnlocked.forEach(id => {
        const tech = getTechById(id);
        if (!tech) return;
        getTechEffectValues(id).forEach(effect => {
            if (effect.type === 'fatigueGuard') bonus.fatigueGuard += effect.value || 0;
            if (effect.type === 'moodDecaySlow') bonus.moodDecaySlow += effect.value || 0;
            if (effect.type === 'supplyBonus') bonus.supplyBonus += effect.value || 0;
        });
    });
    return bonus;
}
