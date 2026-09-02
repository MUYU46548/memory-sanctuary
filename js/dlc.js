/**
 * dlc.js - DLC 模块注册表 & 状态管理
 * 
 * 职责：
 * 1. 注册所有游戏模式（圣所/升天之仪/绿色缤球）
 * 2. 管理 DLC 解锁状态（基于 NG+ 周目数）
 * 3. 提供 DLC 数据隔离接口
 * 4. 加载 DLC 专属数据
 * 
 * 设计原则：
 * - 主游戏（圣所模式）永远可用
 * - DLC 内容免费，通过游戏内周目解锁
 * - DLC 状态与主游戏存档隔离，互不影响
 */

// ==========================================
// DLC 模块注册表
// ==========================================

const DLC_MODULES = {
    sanctuary: {
        id: 'sanctuary',
        name: '圣所模式',
        icon: '🏛️',
        description: '扮演守护者，在末日中管理记忆圣所，决定保存文明的哪些碎片。',
        unlockRequirement: { type: 'always' },
        unlockLabel: '默认开放',
        systems: ['game', 'game-events', 'game-exploration', 'game-projects', 'game-archive', 'game-ending', 'game-emergency'],
        dataFiles: ['archives', 'vaults', 'guardians', 'events', 'explorations', 'projects', 'endings', 'achievements', 'scenes', 'ending_scenes', 'guardian_events'],
        maxWeek: 48
    },
    ascension: {
        id: 'ascension',
        name: '升天之仪',
        icon: '🪶',
        description: '扮演执仪者，在洛斯耶马文明覆灭前最后七日，选择将哪些文明碎片封装进祈愿瓶发射至深空。',
        unlockRequirement: { type: 'playthrough', count: 1 },
        unlockLabel: '通关 1 周目解锁',
        systems: ['ascension'],
        dataFiles: ['ascension_archives', 'ascension_events', 'ascension_endings'],
        maxDays: 7
    },
    greenOrb: {
        id: 'greenOrb',
        name: '绿色缤球号',
        icon: '🔬',
        description: '扮演考古学家，千年后驾驶"绿色缤球"号科研船抵达废墟星球，挖掘记忆圣所的遗迹。',
        unlockRequirement: { type: 'playthrough', count: 3 },
        unlockLabel: '通关 3 周目解锁',
        systems: ['green-orb'],
        dataFiles: ['greenorb_sites', 'greenorb_artifacts', 'greenorb_reports'],
        maxDays: null // 自由探索，无时间限制
    }
};

// 当前激活的模块
MemorySanctuary.activeModule = 'sanctuary';

// DLC 数据缓存（按需加载）
MemorySanctuary.moduleData = {};

// ==========================================
// 解锁判定
// ==========================================

/**
 * 检查指定模块是否已解锁
 * @param {string} moduleId - 模块 ID
 * @returns {boolean}
 */
function isModuleUnlocked(moduleId) {
    const module = DLC_MODULES[moduleId];
    if (!module) return false;
    
    // 圣所模式永远解锁
    if (module.unlockRequirement.type === 'always') return true;
    
    // 基于周目数解锁
    if (module.unlockRequirement.type === 'playthrough') {
        const ngData = getNGPlusData();
        return ngData.playthroughCount >= module.unlockRequirement.count;
    }
    
    return false;
}

/**
 * 获取模块解锁进度描述
 * @param {string} moduleId - 模块 ID
 * @returns {string}
 */
function getModuleUnlockProgress(moduleId) {
    const module = DLC_MODULES[moduleId];
    if (!module) return '未知';
    
    if (module.unlockRequirement.type === 'always') return '已解锁';
    
    if (module.unlockRequirement.type === 'playthrough') {
        const ngData = getNGPlusData();
        const current = ngData.playthroughCount;
        const required = module.unlockRequirement.count;
        if (current >= required) return '已解锁';
        return `进度 ${current}/${required} 周目`;
    }
    
    return '未解锁';
}

// ==========================================
// 模块切换
// ==========================================

/**
 * 切换当前激活的模块
 * @param {string} moduleId - 模块 ID
 * @returns {boolean} 是否切换成功
 */
function switchModule(moduleId) {
    if (!DLC_MODULES[moduleId]) return false;
    if (!isModuleUnlocked(moduleId)) return false;
    
    MemorySanctuary.activeModule = moduleId;
    
    // 更新标题画面当前模式标签
    const labelEl = document.getElementById('dlc-current-label');
    if (labelEl) {
        labelEl.textContent = DLC_MODULES[moduleId].name;
    }
    
    return true;
}

// ==========================================
// 数据加载接口（预留）
// ==========================================

/**
 * 异步加载指定模块的专属数据
 * @param {string} moduleId - 模块 ID
 * @returns {Promise<boolean>} 是否加载成功
 */
async function loadModuleData(moduleId) {
    const module = DLC_MODULES[moduleId];
    if (!module) return false;
    
    // 圣所模式数据已在启动时加载
    if (moduleId === 'sanctuary') return true;
    
    // 检查缓存
    if (MemorySanctuary.moduleData[moduleId]) return true;
    
    // 按需加载 DLC 数据文件
    MemorySanctuary.moduleData[moduleId] = {};
    
    for (const file of module.dataFiles) {
        try {
            const res = await fetch(`data/dlc/${moduleId}/${file}.json`);
            if (res.ok) {
                MemorySanctuary.moduleData[moduleId][file] = await res.json();
            }
        } catch (e) {
            if (DEBUG) console.warn(`[DLC] ${moduleId}/${file}.json 加载失败:`, e);
        }
    }
    
    return true;
}

// ==========================================
// 存档隔离接口（预留）
// ==========================================

/**
 * 获取指定模块的存档状态
 * @param {string} moduleId - 模块 ID
 * @returns {object} 模块状态对象
 */
function getModuleState(moduleId) {
    if (!MemorySanctuary.state) return null;
    
    if (!MemorySanctuary.state.modules) {
        MemorySanctuary.state.modules = {};
    }
    
    if (!MemorySanctuary.state.modules[moduleId]) {
        MemorySanctuary.state.modules[moduleId] = createDefaultModuleState(moduleId);
    }
    
    return MemorySanctuary.state.modules[moduleId];
}

/**
 * 创建模块的默认状态
 * @param {string} moduleId - 模块 ID
 * @returns {object}
 */
function createDefaultModuleState(moduleId) {
    const module = DLC_MODULES[moduleId];
    if (!module) return {};
    
    // 每个模块有独立的状态结构
    const baseState = {
        unlocked: isModuleUnlocked(moduleId),
        narrativeFlags: [],
        completedItems: [],
        currentDay: 1
    };
    
    // 根据模块类型添加特定字段
    if (moduleId === 'ascension') {
        baseState.offerings = 0;
        baseState.window = 7;
        baseState.morale = 100;
    } else if (moduleId === 'greenOrb') {
        baseState.scanEnergy = 100;
        baseState.compute = 50;
        baseState.license = 1;
        baseState.recoveredFragments = [];
    }
    
    return baseState;
}

/**
 * 保存模块状态到存档
 * @param {string} moduleId - 模块 ID
 * @param {object} moduleState - 模块状态
 */
function saveModuleState(moduleId, moduleState) {
    if (!MemorySanctuary.state) return;
    if (!MemorySanctuary.state.modules) {
        MemorySanctuary.state.modules = {};
    }
    MemorySanctuary.state.modules[moduleId] = moduleState;
}

// ==========================================
// 跨模块联动（预留）
// ==========================================

/**
 * 检查主游戏完成度，返回 DLC 可用的额外内容
 * @param {string} moduleId - 模块 ID
 * @returns {object} 额外内容列表
 */
function getCrossModuleBonuses(moduleId) {
    const bonuses = [];
    
    if (moduleId === 'ascension') {
        // 主游戏全收集 → 升天之仪解锁额外祭品
        if (MemorySanctuary.state && MemorySanctuary.state.completedArchives) {
            const totalArchives = MemorySanctuary.data.archives.length;
            if (MemorySanctuary.state.completedArchives.length >= totalArchives) {
                bonuses.push({ type: 'offering', id: 'complete_database', label: '完整的文明数据库' });
            }
        }
        
        // 主游戏达成守护者结局 → 该守护者遗物成为可选祭品
        const ngData = getNGPlusData();
        if (ngData.guardianFinalesSeen) {
            ngData.guardianFinalesSeen.forEach(gid => {
                bonuses.push({ type: 'offering', id: `guardian_relic_${gid}`, label: `${gid}的遗物` });
            });
        }
    }
    
    if (moduleId === 'greenOrb') {
        // 主游戏完成度越高 → 可恢复碎片越多
        if (MemorySanctuary.state) {
            const completionRate = MemorySanctuary.state.completedArchives.length / MemorySanctuary.data.archives.length;
            bonuses.push({ type: 'fragment_bonus', value: completionRate, label: `完成度加成 ${Math.round(completionRate * 100)}%` });
        }
        
        // 升天之仪发射成功 → 可接收深空信号
        const ascensionState = getModuleState('ascension');
        if (ascensionState && ascensionState.launched) {
            bonuses.push({ type: 'signal', id: 'deep_space_signal', label: '深空信号' });
        }
    }
    
    return bonuses;
}

// ==========================================
// 初始化
// ==========================================

/**
 * 初始化 DLC 系统
 */
function initDLC() {
    // 确保 state.modules 存在
    if (MemorySanctuary.state && !MemorySanctuary.state.modules) {
        MemorySanctuary.state.modules = {};
    }
    
    // 更新标题画面当前模式标签
    const labelEl = document.getElementById('dlc-current-label');
    if (labelEl) {
        labelEl.textContent = DLC_MODULES[MemorySanctuary.activeModule].name;
    }
    
    if (DEBUG) console.log('[DLC] 系统初始化完成，当前模式:', MemorySanctuary.activeModule);
}
