/**
 * game-save.js - 从 game.js 拆分的模块
 * 包含: saveGame, tryRecoverFromBackup, loadGame...
 */

function saveGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;
    
    const ngData = getNGPlusData();

    const saveData = {
        version: 2,
        slot: slot,
        savedAt: Date.now(),
        playthrough: ngData.playthroughCount,
        state: {
            resources: { ...MemorySanctuary.state.resources },
            week: MemorySanctuary.state.week,
            chapter: MemorySanctuary.state.chapter,
            completedArchives: [...MemorySanctuary.state.completedArchives],
            vaultUsage: { ...MemorySanctuary.state.vaultUsage },
            narrativeFlags: [...MemorySanctuary.state.narrativeFlags],
            deterioration: { ...MemorySanctuary.state.deterioration },
            emergencyCorruption: MemorySanctuary.state.emergencyCorruption,
            emergencyCooldowns: { ...MemorySanctuary.state.emergencyCooldowns },
            activeEvents: [],
            activeEventIds: [...MemorySanctuary.state.activeEventIds],
            guardianMoods: { ...MemorySanctuary.state.guardianMoods },
            scheduledEvents: [...MemorySanctuary.state.scheduledEvents],
            unlockedBonuses: [...MemorySanctuary.state.unlockedBonuses],
            exploration: { ...MemorySanctuary.state.exploration },
            activeProjects: [...MemorySanctuary.state.activeProjects],
            completedProjects: [...MemorySanctuary.state.completedProjects],
            panelBotBuild: MemorySanctuary.state.panelBotBuild ? { ...MemorySanctuary.state.panelBotBuild } : null,
            ongoingEffects: [...(MemorySanctuary.state.ongoingEffects || [])],
            resourceChanges: { ...(MemorySanctuary.state.resourceChanges || { energy: 0, media: 0, environment: 0, food: 0 }) },
            aiAssistantActive: !!MemorySanctuary.state.aiAssistantActive,
            aiAssistUsedThisWeek: !!MemorySanctuary.state.aiAssistUsedThisWeek,
            finalPrepHintShown: !!MemorySanctuary.state.finalPrepHintShown,
            panelHints: { ...(MemorySanctuary.state.panelHints || { project: false, explore: false, emergency: false }) },
            emergencyExploreFoodFree: !!MemorySanctuary.state.emergencyExploreFoodFree,
            aiAssistCount: MemorySanctuary.state.aiAssistCount || 0,
            guardianAidCount: MemorySanctuary.state.guardianAidCount || 0,
            emergencyExploreUsed: !!MemorySanctuary.state.emergencyExploreUsed,
            famineSurvived: !!MemorySanctuary.state.famineSurvived,
            moraleStreak: { ...(MemorySanctuary.state.moraleStreak || { critical: 0, excellent: 0 }) },
            // 通用科技树（v0.2.4）
            techUnlocked: [...(MemorySanctuary.state.techUnlocked || [])],
            techDoctrines: { ...(MemorySanctuary.state.techDoctrines || {}) },
            // 科技升级（P1-6 修复，v0.2.7）
            techUpgrades: [...(MemorySanctuary.state.techUpgrades || [])],
            // DLC 模块状态隔离
            modules: { ...(MemorySanctuary.state.modules || {}) },
            // === 补全缺失的运行时字段（P1-2 修复） ===
            gameOver: !!MemorySanctuary.state.gameOver,
            _sealed: !!MemorySanctuary.state._sealed,
            departedGuardians: [...(MemorySanctuary.state.departedGuardians || [])],
            sacrificedGuardian: MemorySanctuary.state.sacrificedGuardian || null,
            guardianSacrifice: !!MemorySanctuary.state.guardianSacrifice,
            starvationWeeks: MemorySanctuary.state.starvationWeeks || 0,
            weeksWithoutStarvation: MemorySanctuary.state.weeksWithoutStarvation || 0,
            turnsSkipped: MemorySanctuary.state.turnsSkipped || 0,
            emergencyArchiveUsed: MemorySanctuary.state.emergencyArchiveUsed || 0,
            chaptersCompleted: [...(MemorySanctuary.state.chaptersCompleted || [])],
            pendingEnding: MemorySanctuary.state.pendingEnding || null,
            instantArchiveChances: MemorySanctuary.state.instantArchiveChances || 0,
            lastSupplyWeek: MemorySanctuary.state.lastSupplyWeek || 0,
            batchArchiveMode: !!MemorySanctuary.state.batchArchiveMode,
            batchArchiveCount: MemorySanctuary.state.batchArchiveCount || 0,
            batchArchiveUsedThisRun: !!MemorySanctuary.state.batchArchiveUsedThisRun,
            nextWeekDecayPenalty: MemorySanctuary.state.nextWeekDecayPenalty || 0,
            botFactoryActive: !!MemorySanctuary.state.botFactoryActive,
            botMaintenanceCost: MemorySanctuary.state.botMaintenanceCost || 0,
            inheritedProjects: [...(MemorySanctuary.state.inheritedProjects || [])],
            inheritedVaultUsage: { ...(MemorySanctuary.state.inheritedVaultUsage || {}) },
            memoryEchoSelection: [...(MemorySanctuary.state.memoryEchoSelection || [])],
            deepArchiveCount: MemorySanctuary.state.deepArchiveCount || 0,
            conflictLog: [...(MemorySanctuary.state.conflictLog || [])],
            consecutiveSkips: MemorySanctuary.state.consecutiveSkips || 0,
            // 事件保底计数器（P0-2 修复，v0.2.7）
            weeksSinceLastEvent: MemorySanctuary.state.weeksSinceLastEvent || 0,
            sacrificeHistory: [...(MemorySanctuary.state.sacrificeHistory || [])],
            loopCluesFound: [...(MemorySanctuary.state.loopCluesFound || [])],
            // 季节 & 运行时标记
            season: MemorySanctuary.state.season ? { ...MemorySanctuary.state.season } : null,
            foodBonusLogged: !!MemorySanctuary.state.foodBonusLogged,
            foodCrisisLogged: !!MemorySanctuary.state.foodCrisisLogged,
            starvationLogged: !!MemorySanctuary.state.starvationLogged,
            botBlackoutLogged: !!MemorySanctuary.state.botBlackoutLogged,
            resourceCritical: !!MemorySanctuary.state.resourceCritical,
            // 过期条目持久化（P1-3 修复）
            expiredEntries: [...(MemorySanctuary.state.expiredEntries || [])],
            // 周期事件追踪（P1-7 修复）
            triggeredPeriodicEvents: [...(MemorySanctuary.state.triggeredPeriodicEvents || [])],
            // 勘探重设计（2026-09-03）：已发现碎片条目 + 机器人被动产出计时
            unlockedFragments: [...(MemorySanctuary.state.unlockedFragments || [])],
            botPassiveTick: MemorySanctuary.state.botPassiveTick || 0,
            botStabilizeLogged: !!MemorySanctuary.state.botStabilizeLogged
        },
        currentVaultId: MemorySanctuary.currentVaultId
    };

    try {
        const serialized = JSON.stringify(saveData);
        localStorage.setItem(SAVE_KEY_PREFIX + slot, serialized);
        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));
        
        // 定期自动备份
        saveCounter++;
        if (saveCounter % BACKUP_INTERVAL === 0) {
            localStorage.setItem(BACKUP_KEY_PREFIX + slot, serialized);
        }
        
        addLog(`游戏已保存至存档槽 ${slot}。`, 'system');
        return true;
    } catch (e) {
        if (DEBUG) console.error('[存档] 保存失败:', e);
        addLog('存档失败：存储空间不足。', 'system');
        return false;
    }
}


function tryRecoverFromBackup(slot) {
    const backup = localStorage.getItem(BACKUP_KEY_PREFIX + slot);
    if (!backup) return null;
    try {
        const data = JSON.parse(backup);
        if (data && data.state && data.version) {
            return data;
        }
    } catch (e) {
        if (DEBUG) console.warn('[备份] 备份文件也损坏:', e);
    }
    return null;
}


function loadGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;

    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return false;

    let saveData = null;
    try {
        saveData = JSON.parse(raw);
    } catch (e) {
        if (DEBUG) console.error(`[存档] 槽位 ${slot} 数据损坏:`, e);
        // 尝试从备份恢复
        const backup = tryRecoverFromBackup(slot);
        if (backup) {
            if (confirm(`检测到槽位 ${slot} 的存档损坏，但发现自动备份。是否从备份恢复？\n\n注意：备份最多保留到上次保存后 ${BACKUP_INTERVAL} 次操作前的状态。`)) {
                saveData = backup;
                // 立即用备份覆盖损坏的存档
                localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(backup));
            } else {
                return false;
            }
        } else {
            alert(`槽位 ${slot} 的存档已损坏且无可用备份。请删除并新建。`);
            return false;
        }
    }
    
    // 校验数据完整性
    if (!saveData || !saveData.state || !saveData.state.resources) {
        const backup = tryRecoverFromBackup(slot);
        if (backup) {
            if (confirm(`检测到槽位 ${slot} 的存档结构异常。是否从备份恢复？`)) {
                saveData = backup;
                localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(backup));
            } else {
                return false;
            }
        } else {
            alert(`槽位 ${slot} 的存档无效且无可用备份。请删除并新建。`);
            return false;
        }
    }

    try {
        // Initialize fresh state before loading
        initGameState();

        MemorySanctuary.state.resources = { ...saveData.state.resources };
        MemorySanctuary.state.week = saveData.state.week || 1;
        MemorySanctuary.state.chapter = saveData.state.chapter || 1;
        MemorySanctuary.state.completedArchives = [...(saveData.state.completedArchives || [])];
        MemorySanctuary.state.vaultUsage = { ...(saveData.state.vaultUsage || {}) };
        MemorySanctuary.state.narrativeFlags = [...(saveData.state.narrativeFlags || [])];
        MemorySanctuary.state.deterioration = { ...(saveData.state.deterioration || { energy: false, media: false, environment: false }) };
        MemorySanctuary.state.emergencyCorruption = saveData.state.emergencyCorruption || 0;
        MemorySanctuary.state.emergencyCooldowns = { ...(saveData.state.emergencyCooldowns || {}) };
        MemorySanctuary.state.activeEventIds = [...(saveData.state.activeEventIds || [])];
        MemorySanctuary.state.guardianMoods = { ...(saveData.state.guardianMoods || {}) };
        MemorySanctuary.state.scheduledEvents = [...(saveData.state.scheduledEvents || [])];
        MemorySanctuary.state.unlockedBonuses = [...(saveData.state.unlockedBonuses || [])];
        MemorySanctuary.state.exploration = { ...(saveData.state.exploration || {}) };
        MemorySanctuary.state.activeProjects = [...(saveData.state.activeProjects || [])];
        MemorySanctuary.state.completedProjects = [...(saveData.state.completedProjects || [])];
        MemorySanctuary.state.panelBotBuild = (saveData.state.panelBotBuild && typeof saveData.state.panelBotBuild === 'object')
            ? { remainingWeeks: Math.max(0, saveData.state.panelBotBuild.remainingWeeks || 0) }
            : null;
        MemorySanctuary.state.ongoingEffects = [...(saveData.state.ongoingEffects || [])];
        MemorySanctuary.state.resourceChanges = { ...(saveData.state.resourceChanges || { energy: 0, media: 0, environment: 0, food: 0 }) };
        MemorySanctuary.state.aiAssistantActive = !!saveData.state.aiAssistantActive;
        MemorySanctuary.state.aiAssistUsedThisWeek = !!saveData.state.aiAssistUsedThisWeek;
        MemorySanctuary.state.finalPrepHintShown = !!saveData.state.finalPrepHintShown;
        MemorySanctuary.state.panelHints = { ...(saveData.state.panelHints || { project: false, explore: false, emergency: false }) };
        MemorySanctuary.state.emergencyExploreFoodFree = !!saveData.state.emergencyExploreFoodFree;
        MemorySanctuary.state.aiAssistCount = saveData.state.aiAssistCount || 0;
        MemorySanctuary.state.guardianAidCount = saveData.state.guardianAidCount || 0;
        MemorySanctuary.state.emergencyExploreUsed = !!saveData.state.emergencyExploreUsed;
        MemorySanctuary.state.famineSurvived = !!saveData.state.famineSurvived;
        MemorySanctuary.state.moraleStreak = { ...(saveData.state.moraleStreak || { critical: 0, excellent: 0 }) };
        // 通用科技树（v0.2.4）：旧存档无此字段时回退为空（game-tech.js initTechState 兜底）
        MemorySanctuary.state.techUnlocked = [...(saveData.state.techUnlocked || [])];
        MemorySanctuary.state.techDoctrines = { ...(saveData.state.techDoctrines || {}) };
        MemorySanctuary.state.modules = { ...(saveData.state.modules || {}) };
        
        // === 补全缺失的运行时字段（P1-2 修复，旧档无此字段时回退默认值） ===
        MemorySanctuary.state.gameOver = !!saveData.state.gameOver;
        MemorySanctuary.state._sealed = !!saveData.state._sealed;
        MemorySanctuary.state.departedGuardians = [...(saveData.state.departedGuardians || [])];
        MemorySanctuary.state.sacrificedGuardian = saveData.state.sacrificedGuardian || null;
        MemorySanctuary.state.guardianSacrifice = !!saveData.state.guardianSacrifice;
        MemorySanctuary.state.starvationWeeks = saveData.state.starvationWeeks || 0;
        MemorySanctuary.state.weeksWithoutStarvation = saveData.state.weeksWithoutStarvation || 0;
        MemorySanctuary.state.turnsSkipped = saveData.state.turnsSkipped || 0;
        MemorySanctuary.state.emergencyArchiveUsed = saveData.state.emergencyArchiveUsed || 0;
        MemorySanctuary.state.chaptersCompleted = [...(saveData.state.chaptersCompleted || [])];
        MemorySanctuary.state.pendingEnding = saveData.state.pendingEnding || null;
        MemorySanctuary.state.instantArchiveChances = saveData.state.instantArchiveChances || 0;
        MemorySanctuary.state.lastSupplyWeek = saveData.state.lastSupplyWeek || 0;
        MemorySanctuary.state.batchArchiveMode = !!saveData.state.batchArchiveMode;
        MemorySanctuary.state.batchArchiveCount = saveData.state.batchArchiveCount || 0;
        MemorySanctuary.state.batchArchiveUsedThisRun = !!saveData.state.batchArchiveUsedThisRun;
        MemorySanctuary.state.nextWeekDecayPenalty = saveData.state.nextWeekDecayPenalty || 0;
        MemorySanctuary.state.botFactoryActive = !!saveData.state.botFactoryActive;
        MemorySanctuary.state.botMaintenanceCost = saveData.state.botMaintenanceCost || 0;
        MemorySanctuary.state.inheritedProjects = [...(saveData.state.inheritedProjects || [])];
        MemorySanctuary.state.inheritedVaultUsage = { ...(saveData.state.inheritedVaultUsage || {}) };
        MemorySanctuary.state.memoryEchoSelection = [...(saveData.state.memoryEchoSelection || [])];
        MemorySanctuary.state.deepArchiveCount = saveData.state.deepArchiveCount || 0;
        MemorySanctuary.state.conflictLog = [...(saveData.state.conflictLog || [])];
        MemorySanctuary.state.consecutiveSkips = saveData.state.consecutiveSkips || 0;
        // 事件保底计数器（P0-2 修复，v0.2.7；旧档缺省按 0 处理）
        MemorySanctuary.state.weeksSinceLastEvent = saveData.state.weeksSinceLastEvent || 0;
        // 科技升级（P1-6 修复，v0.2.7；旧档缺省为空数组）
        MemorySanctuary.state.techUpgrades = [...(saveData.state.techUpgrades || [])];
        MemorySanctuary.state.sacrificeHistory = [...(saveData.state.sacrificeHistory || [])];
        MemorySanctuary.state.loopCluesFound = [...(saveData.state.loopCluesFound || [])];
        MemorySanctuary.state.season = saveData.state.season ? { ...saveData.state.season } : null;
        MemorySanctuary.state.foodBonusLogged = !!saveData.state.foodBonusLogged;
        MemorySanctuary.state.foodCrisisLogged = !!saveData.state.foodCrisisLogged;
        MemorySanctuary.state.starvationLogged = !!saveData.state.starvationLogged;
        MemorySanctuary.state.botBlackoutLogged = !!saveData.state.botBlackoutLogged;
        MemorySanctuary.state.resourceCritical = !!saveData.state.resourceCritical;
        // 过期条目持久化（P1-3 修复）
        MemorySanctuary.state.expiredEntries = [...(saveData.state.expiredEntries || [])];
        // 周期事件追踪（P1-7 修复）
        MemorySanctuary.state.triggeredPeriodicEvents = [...(saveData.state.triggeredPeriodicEvents || [])];
        // 勘探重设计（2026-09-03）：旧档无此字段时回退默认值
        MemorySanctuary.state.unlockedFragments = [...(saveData.state.unlockedFragments || [])];
        MemorySanctuary.state.botPassiveTick = saveData.state.botPassiveTick || 0;
        MemorySanctuary.state.botStabilizeLogged = !!saveData.state.botStabilizeLogged;
        
        // 读档后重新应用过期标记到 data.archives
        if (MemorySanctuary.state.expiredEntries.length > 0 && MemorySanctuary.data.archives) {
            MemorySanctuary.data.archives.forEach(entry => {
                if (MemorySanctuary.state.expiredEntries.includes(entry.id)) {
                    entry.expired = true;
                }
            });
        }
        
        if (saveData.currentVaultId) {
            MemorySanctuary.currentVaultId = saveData.currentVaultId;
        }

        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));
        
        // 读取后也创建一次备份（确保备份是最新的有效版本）
        localStorage.setItem(BACKUP_KEY_PREFIX + slot, JSON.stringify(saveData));
        
        addLog(`已从存档槽 ${slot} 读取。`, 'system');
        return true;
    } catch (error) {
        if (DEBUG) console.error('[存档] 读取失败:', error);
        addLog('读取存档失败。', 'system');
        return false;
    }
}


function getSaveSlotInfo(slot) {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        // 检查是否有备份
        const hasBackup = !!localStorage.getItem(BACKUP_KEY_PREFIX + slot);
        return {
            slot: data.slot || slot,
            savedAt: data.savedAt || 0,
            playthrough: data.playthrough || 1,
            week: data.state?.week || 1,
            chapter: data.state?.chapter || 1,
            archivedCount: data.state?.completedArchives?.length || 0,
            hasBackup: hasBackup
        };
    } catch (e) {
        return { corrupted: true };
    }
}


function getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
        slots.push(getSaveSlotInfo(i));
    }
    return slots;
}


function deleteSaveSlot(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return;
    localStorage.removeItem(SAVE_KEY_PREFIX + slot);
    localStorage.removeItem(BACKUP_KEY_PREFIX + slot);
}


function hasAnySave() {
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
        if (localStorage.getItem(SAVE_KEY_PREFIX + i)) return true;
    }
    return false;
}


function getCurrentSlot() {
    return parseInt(localStorage.getItem(CURRENT_SLOT_KEY) || '0');
}


function getNGPlusData() {
    const raw = localStorage.getItem(NG_PLUS_KEY);
    if (!raw) {
        return {
            playthroughCount: 0,
            totalArchivesSaved: 0,
            bonuses: [],
            unlockedEntries: [],
            guardianFinalesSeen: [],
            guardianHistory: [],
            archiveHistory: [],
            seenScenes: []
        };
    }
    try {
        const data = JSON.parse(raw);
        // Ensure new fields exist
        if (!data.unlockedEntries) data.unlockedEntries = [];
        if (!data.guardianFinalesSeen) data.guardianFinalesSeen = [];
        if (!data.guardianHistory) data.guardianHistory = [];
        if (!data.archiveHistory) data.archiveHistory = [];
        if (!data.seenScenes) data.seenScenes = [];
        return data;
    } catch (e) {
        return {
            playthroughCount: 0,
            totalArchivesSaved: 0,
            bonuses: [],
            unlockedEntries: [],
            guardianFinalesSeen: [],
            guardianHistory: [],
            archiveHistory: [],
            seenScenes: []
        };
    }
}


function saveNGPlusData(data) {
    localStorage.setItem(NG_PLUS_KEY, JSON.stringify(data));
}


function startNewGamePlus() {
    const ngData = getNGPlusData();
    ngData.playthroughCount++;
    ngData.bonuses = calculateNGPlusBonuses(ngData.playthroughCount);
    saveNGPlusData(ngData);
    return ngData;
}


function calculateNGPlusBonuses(playthrough) {
    const bonuses = [];
    if (playthrough >= 2) bonuses.push({ type: 'resource', resource: 'energy', value: 20, label: '起始能源+20' });
    if (playthrough >= 2) bonuses.push({ type: 'resource', resource: 'media', value: 15, label: '起始介质+15' });
    if (playthrough >= 3) bonuses.push({ type: 'resource', resource: 'energy', value: 30, label: '起始能源+30' });
    if (playthrough >= 3) bonuses.push({ type: 'resource', resource: 'media', value: 25, label: '起始介质+25' });
    if (playthrough >= 4) bonuses.push({ type: 'resource', resource: 'environment', value: 10, label: '起始环境+10' });
    if (playthrough >= 5) bonuses.push({ type: 'resource', resource: 'energy', value: 50, label: '起始能源+50' });
    
    // Add mood bonuses from previous run
    const ngData = getNGPlusData();
    if (ngData.bonuses) {
        ngData.bonuses.forEach(b => {
            if (b.type === 'mood_bonus') {
                bonuses.push({ type: 'resource', resource: 'energy', value: 10, label: '守护者信任+10能源' });
            }
        });
    }
    
    return bonuses;
}


function applyNGPlusBonuses() {
    const ngData = getNGPlusData();
    if (!ngData.bonuses || ngData.bonuses.length === 0) return;

    // 各资源真实上限（与 game.js 资源 cap 保持一致）
    const RESOURCE_CAPS = { energy: 150, media: 150, environment: 100, food: 80 };

    ngData.bonuses.forEach(bonus => {
        if (bonus.type === 'resource') {
            const cap = RESOURCE_CAPS[bonus.resource] || 100;
            MemorySanctuary.state.resources[bonus.resource] = Math.min(
                cap,
                MemorySanctuary.state.resources[bonus.resource] + bonus.value
            );
        }
    });
}


function startNewGame(slot, isNGPlus, moduleId) {
    if (isNGPlus) {
        startNewGamePlus();
    }

    initGameState();

    if (isNGPlus) {
        applyNGPlusBonuses();
        // 应用跨周目守护者记忆加成
        if (typeof applyCrossPlaythroughGuardianBonus === 'function') {
            applyCrossPlaythroughGuardianBonus();
        }
        // 应用圣所状态继承
        if (typeof applySanctuaryInheritance === 'function') {
            applySanctuaryInheritance();
        }
        // 触发叙事连锁事件
        if (typeof triggerNarrativeChainEvents === 'function') {
            triggerNarrativeChainEvents();
        }
    }

    // 设置当前模块
    if (moduleId && DLC_MODULES[moduleId]) {
        MemorySanctuary.activeModule = moduleId;
    } else {
        moduleId = MemorySanctuary.activeModule || 'sanctuary';
    }

    const logContent = document.getElementById('log-content');
    if (logContent) logContent.innerHTML = '';

    localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

    // 根据模块类型初始化
    if (moduleId === 'sanctuary') {
        renderAll();
        if (typeof initCanvas === 'function') initCanvas();
        if (typeof checkStuckState === 'function') checkStuckState();
        showGuardianDialogue('tika', 'idle');
    } else {
        // DLC 模块初始化入口
        if (typeof initModuleGame === 'function') {
            initModuleGame(moduleId);
        } else {
            // 降级：显示 DLC 占位画面
            renderModulePlaceholder(moduleId);
        }
    }

    saveGame(slot);

    const ngData = getNGPlusData();
    if (isNGPlus && ngData.playthroughCount > 1) {
        addLog(`第 ${ngData.playthroughCount} 周目开始。继承奖励已应用。`, 'system');
    } else {
        const moduleName = DLC_MODULES[moduleId] ? DLC_MODULES[moduleId].name : '圣所';
        addLog(`新游戏开始。当前模式：${moduleName}。愿你的选择得到善待。`, 'system');
    }

    // 新游戏开始：播放游戏 BGM
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.playBGM('game');
    }

    // 新手引导（光标高亮版）：仅在从未完成引导时触发
    if (moduleId === 'sanctuary') {
        setTimeout(() => {
            if (typeof initTutorial === 'function') initTutorial();
        }, 500);
    }
}

/**
 * DLC 模块占位画面（开发草稿阶段使用）
 */
function renderModulePlaceholder(moduleId) {
    const module = DLC_MODULES[moduleId];
    if (!module) return;
    
    const container = document.getElementById('game-container');
    if (!container) return;
    
    // 在主内容区显示占位信息
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:2rem;text-align:center;color:var(--text-primary);">
                <div style="font-size:4rem;margin-bottom:1rem;">${module.icon}</div>
                <div style="font-size:1.5rem;color:var(--amber-primary);margin-bottom:1rem;">${module.name}</div>
                <div style="font-size:0.9rem;color:var(--text-dim);max-width:400px;line-height:1.6;">
                    ${module.description}
                </div>
                <div style="margin-top:2rem;padding:1rem 2rem;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-dim);">
                    🚧 开发中 — 敬请期待
                </div>
                <button id="btn-return-title" style="margin-top:2rem;padding:12px 32px;background:transparent;border:2px solid var(--amber-primary);border-radius:8px;color:var(--amber-primary);cursor:pointer;">
                    返回标题
                </button>
            </div>
        `;
        
        const returnBtn = document.getElementById('btn-return-title');
        if (returnBtn) {
            returnBtn.addEventListener('click', () => showTitleScreen());
        }
    }
}


function openSaveScreen(mode) {
    const overlay = document.getElementById('save-overlay');
    const title = document.getElementById('save-panel-title');
    if (!overlay) return;

    if (title) {
        if (mode === 'load') {
            title.textContent = '记忆圣所 · 读档';
        } else if (mode === 'new') {
            title.textContent = '记忆圣所 · 新建游戏';
        } else {
            title.textContent = '记忆圣所 · 存档';
        }
    }

    // 存储环境自检：file:// 直开 / 隐私模式 / 存储满都会导致「重启后存档消失」
    renderStorageInfo();

    renderSaveSlots(mode);
    overlay.classList.remove('hidden');
}


/**
 * 检测浏览器存储环境，并在存档面板给出可操作的提示
 * （打包版 / file:// 直开 / 隐私模式 / 存储配额满 是「重启后存档消失」的常见原因）
 */
function checkStorageEnvironment() {
    try {
        const testKey = 'memory-sanctuary-storage-test';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.name === 'QuotaExceededError' ? '存储空间已满' : (e.message || '不可用') };
    }
}

function renderStorageInfo() {
    const infoEl = document.getElementById('save-info');
    if (!infoEl) return;
    const env = checkStorageEnvironment();
    const isFileProtocol = window.location.protocol === 'file:';

    let html = '';
    if (!env.ok) {
        html = `<div class="save-storage-warning">⚠️ 浏览器存储不可用（${env.error}），存档将无法保存。建议：① 使用本地服务器打开（python -m http.server 8099）；② 退出浏览器隐私模式。也可用下方「📤 导出存档」手动备份。</div>`;
    } else if (isFileProtocol) {
        html = `<div class="save-storage-hint">ℹ️ 当前以 file:// 方式打开：不同浏览器 / 不同入口打开时，存储可能互相隔离，导致存档看似「消失」。推荐使用本地服务器访问（项目根目录运行 python -m http.server 8099）。建议定期用「📤 导出存档」备份。</div>`;
    } else {
        html = `<div class="save-storage-ok">✓ 本地存储可用，存档保存在本机浏览器中，正常重启不会丢失。</div>`;
    }
    infoEl.innerHTML = html;
}


function closeSaveScreen() {
    const overlay = document.getElementById('save-overlay');
    if (overlay) overlay.classList.add('hidden');
}


function renderSaveSlots(mode) {
    const container = document.getElementById('save-slots');
    if (!container) return;

    container.innerHTML = '';
    const slots = getAllSaveSlots();
    const currentSlot = getCurrentSlot();

    slots.forEach((info, index) => {
        const slotNum = index + 1;
        const card = document.createElement('div');
        card.className = 'save-slot-card';

        if (info) {
            const date = new Date(info.savedAt);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

            card.innerHTML = `
                <div class="save-slot-header">
                    <span class="save-slot-number">存档 ${slotNum}</span>
                    ${slotNum === currentSlot ? '<span class="save-slot-current">当前</span>' : ''}
                    <span class="save-slot-playthrough">第${info.playthrough}周目</span>
                </div>
                <div class="save-slot-info">
                    <div class="save-slot-week">第 ${info.week}周 · 第 ${info.chapter}章</div>
                    <div class="save-slot-archived">已归档: ${info.archivedCount} 条</div>
                    <div class="save-slot-date">${dateStr}</div>
                </div>
                <div class="save-slot-actions">
                    <button class="save-slot-btn load" data-slot="${slotNum}">读取</button>
                    ${mode === 'save' ? `<button class="save-slot-btn overwrite" data-slot="${slotNum}">覆盖</button>` : ''}
                    <button class="save-slot-btn delete" data-slot="${slotNum}">删除</button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="save-slot-header">
                    <span class="save-slot-number">存档 ${slotNum}</span>
                </div>
                <div class="save-slot-info">
                    <div class="save-slot-empty">空槽位</div>
                </div>
                <div class="save-slot-actions">
                    <button class="save-slot-btn new" data-slot="${slotNum}">新游戏</button>
                </div>
            `;
        }

        container.appendChild(card);
    });

    container.querySelectorAll('.save-slot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const slot = parseInt(e.target.dataset.slot);
            const action = e.target.classList.contains('load') ? 'load' :
                          e.target.classList.contains('overwrite') ? 'overwrite' :
                          e.target.classList.contains('delete') ? 'delete' :
                          e.target.classList.contains('new') ? 'new' : null;

            handleSaveAction(slot, action, mode);
        });
    });

    // 存档面板底部：游戏进行中时显示封印按钮（替代原 game.js 末尾失效的 override）
    if (typeof renderSealButton === 'function') {
        try {
            renderSealButton();
        } catch (e) {
            if (DEBUG) console.warn('[存档] renderSealButton 渲染失败:', e);
        }
    }
}


function handleSaveAction(slot, action, mode) {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    
    switch (action) {
        case 'load':
            closeSaveScreen();
            // Always ensure title is hidden and game container visible
            if (titleScreen) titleScreen.classList.add('hidden');
            if (gameContainer) gameContainer.classList.remove('hidden');
            loadGame(slot);
            // 读档后必须刷新 UI，否则界面停留在 index.html 静态初始值
            renderAll();
            if (typeof checkStuckState === 'function') checkStuckState();
            break;
        case 'overwrite':
            if (confirm(`确定要覆盖存档槽 ${slot} 吗？`)) {
                if (saveGame(slot)) {
                    closeSaveScreen();
                }
            }
            break;
        case 'delete':
            if (confirm(`确定要删除存档槽 ${slot} 吗？`)) {
                deleteSaveSlot(slot);
                renderSaveSlots(mode);
            }
            break;
        case 'new': {
            const ngData = getNGPlusData();
            const isNGPlus = ngData.playthroughCount > 0;
            const moduleId = MemorySanctuary.activeModule || 'sanctuary';
            
            closeSaveScreen();
            if (titleScreen) titleScreen.classList.add('hidden');
            if (gameContainer) gameContainer.classList.remove('hidden');
            startNewGame(slot, isNGPlus, moduleId);
            break;
        }
    }
}


function exportSaveToClipboard(slot) {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) {
        alert('该存档槽为空！');
        return;
    }
    
    try {
        const saveData = JSON.parse(raw);
        const jsonStr = JSON.stringify(saveData);
        const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(encoded).then(() => {
                alert(`存档 ${slot} 已导出到剪贴板！\n将此文本发送给他人即可分享。`);
            }).catch(() => {
                prompt(`存档 ${slot} 导出文本（全选复制）：`, encoded);
            });
        } else {
            prompt(`存档 ${slot} 导出文本（全选复制）：`, encoded);
        }
        
        if (typeof AudioSystem !== 'undefined') AudioSystem.playButtonClick();
    } catch (e) {
        alert('导出失败：' + e.message);
    }
}


// 存档导入白名单重建：只保留已知字段、数值 clamp、数组兜底，
// 避免导入他人分享的脏档导致后续逻辑崩溃。
function sanitizeImportedSave(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw.state || {};
    const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
    const intClamp = (v, lo, hi, d) => {
        const n = num(v, d);
        return Math.max(lo, Math.min(hi, n));
    };
    const arr = (v) => Array.isArray(v) ? v : [];
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

    const cleanState = {
        resources: {
            energy: intClamp(s.resources?.energy, 0, 999, 0),
            media: intClamp(s.resources?.media, 0, 999, 0),
            environment: intClamp(s.resources?.environment, 0, 999, 0),
            food: intClamp(s.resources?.food, 0, 999, 0),
            engineeringBots: intClamp(s.resources?.engineeringBots, 0, 5, 0)
        },
        week: intClamp(s.week, 1, 48, 1),
        chapter: intClamp(s.chapter, 1, 12, 1),
        completedArchives: arr(s.completedArchives).filter(x => typeof x === 'string' || typeof x === 'number'),
        vaultUsage: obj(s.vaultUsage),
        narrativeFlags: arr(s.narrativeFlags).filter(x => typeof x === 'string'),
        // T1-7 修复：通用科技树（v0.2.4）解锁字段此前未进白名单，导入存档后已解锁科技被丢弃
        techUnlocked: arr(s.techUnlocked).filter(x => typeof x === 'string'),
        techDoctrines: obj(s.techDoctrines),
        // 科技升级（P1-6 修复，v0.2.7）
        techUpgrades: arr(s.techUpgrades).filter(x => typeof x === 'string'),
        deterioration: obj(s.deterioration),
        emergencyCorruption: num(s.emergencyCorruption, 0),
        emergencyCooldowns: obj(s.emergencyCooldowns),
        activeEventIds: arr(s.activeEventIds).filter(x => typeof x === 'string' || typeof x === 'number'),
        guardianMoods: obj(s.guardianMoods),
        scheduledEvents: arr(s.scheduledEvents).filter(x => x && typeof x === 'object'),
        unlockedBonuses: arr(s.unlockedBonuses).filter(x => x && typeof x === 'object'),
        exploration: obj(s.exploration),
        activeProjects: arr(s.activeProjects).filter(x => x && typeof x === 'object'),
        // completedProjects 存的是项目 id 字符串（此前误按对象过滤，导入后项目完成记录被清空）
        completedProjects: arr(s.completedProjects).filter(x => typeof x === 'string'),
        panelBotBuild: (s.panelBotBuild && typeof s.panelBotBuild === 'object')
            ? { remainingWeeks: intClamp(s.panelBotBuild.remainingWeeks, 0, 10, 0) }
            : null,
        ongoingEffects: arr(s.ongoingEffects),
        resourceChanges: obj(s.resourceChanges),
        aiAssistantActive: !!s.aiAssistantActive,
        aiAssistUsedThisWeek: !!s.aiAssistUsedThisWeek,
        finalPrepHintShown: !!s.finalPrepHintShown,
        panelHints: obj(s.panelHints),
        emergencyExploreFoodFree: !!s.emergencyExploreFoodFree,
        aiAssistCount: num(s.aiAssistCount, 0),
        guardianAidCount: num(s.guardianAidCount, 0),
        emergencyExploreUsed: !!s.emergencyExploreUsed,
        famineSurvived: !!s.famineSurvived,
        moraleStreak: obj(s.moraleStreak),
        modules: obj(s.modules),
        // === 补全缺失的运行时字段（P1-2 修复） ===
        gameOver: !!s.gameOver,
        _sealed: !!s._sealed,
        departedGuardians: arr(s.departedGuardians).filter(x => typeof x === 'string'),
        sacrificedGuardian: s.sacrificedGuardian || null,
        guardianSacrifice: !!s.guardianSacrifice,
        starvationWeeks: num(s.starvationWeeks, 0),
        weeksWithoutStarvation: num(s.weeksWithoutStarvation, 0),
        turnsSkipped: num(s.turnsSkipped, 0),
        emergencyArchiveUsed: num(s.emergencyArchiveUsed, 0),
        chaptersCompleted: arr(s.chaptersCompleted),
        pendingEnding: s.pendingEnding || null,
        instantArchiveChances: num(s.instantArchiveChances, 0),
        lastSupplyWeek: num(s.lastSupplyWeek, 0),
        batchArchiveMode: !!s.batchArchiveMode,
        batchArchiveCount: num(s.batchArchiveCount, 0),
        batchArchiveUsedThisRun: !!s.batchArchiveUsedThisRun,
        nextWeekDecayPenalty: num(s.nextWeekDecayPenalty, 0),
        botFactoryActive: !!s.botFactoryActive,
        botMaintenanceCost: num(s.botMaintenanceCost, 0),
        inheritedProjects: arr(s.inheritedProjects),
        inheritedVaultUsage: obj(s.inheritedVaultUsage),
        memoryEchoSelection: arr(s.memoryEchoSelection),
        deepArchiveCount: num(s.deepArchiveCount, 0),
        conflictLog: arr(s.conflictLog),
        consecutiveSkips: num(s.consecutiveSkips, 0),
        // 事件保底计数器（P0-2 修复，v0.2.7）
        weeksSinceLastEvent: num(s.weeksSinceLastEvent, 0),
        sacrificeHistory: arr(s.sacrificeHistory),
        loopCluesFound: arr(s.loopCluesFound),
        season: obj(s.season),
        foodBonusLogged: !!s.foodBonusLogged,
        foodCrisisLogged: !!s.foodCrisisLogged,
        starvationLogged: !!s.starvationLogged,
        botBlackoutLogged: !!s.botBlackoutLogged,
        resourceCritical: !!s.resourceCritical,
        expiredEntries: arr(s.expiredEntries).filter(x => typeof x === 'string'),
        triggeredPeriodicEvents: arr(s.triggeredPeriodicEvents).filter(x => typeof x === 'string'),
        // 勘探重设计（2026-09-03）
        unlockedFragments: arr(s.unlockedFragments).filter(x => typeof x === 'string'),
        botPassiveTick: num(s.botPassiveTick, 0),
        botStabilizeLogged: !!s.botStabilizeLogged
    };

    return {
        version: 2,
        slot: intClamp(raw.slot, 1, SAVE_SLOT_COUNT, 1),
        savedAt: num(raw.savedAt, Date.now()),
        playthrough: intClamp(raw.playthrough, 0, 999, 0),
        state: cleanState,
        currentVaultId: intClamp(raw.currentVaultId, 1, 12, 1)
    };
}

function importSaveFromClipboard() {
    const input = prompt('粘贴导入文本：');
    if (!input || !input.trim()) return;
    
    try {
        const jsonStr = decodeURIComponent(escape(atob(input.trim())));
        const parsed = JSON.parse(jsonStr);
        
        if (!parsed || !parsed.state || !parsed.version) {
            alert('无效的存档文本！');
            return;
        }
        
        const saveData = sanitizeImportedSave(parsed);
        if (!saveData) {
            alert('无效的存档文本！');
            return;
        }
        
        const slots = getAllSaveSlots();
        let targetSlot = slots.findIndex(s => s === null) + 1;
        
        if (targetSlot === 0) {
            const slotStr = prompt(`所有存档槽已满。输入槽位号 (1-${SAVE_SLOT_COUNT}) 覆盖：`);
            targetSlot = parseInt(slotStr);
            if (isNaN(targetSlot) || targetSlot < 1 || targetSlot > SAVE_SLOT_COUNT) {
                alert('无效的槽位号。');
                return;
            }
            if (!confirm(`确定要覆盖存档槽 ${targetSlot} 吗？`)) return;
        }
        
        localStorage.setItem(SAVE_KEY_PREFIX + targetSlot, JSON.stringify(saveData));
        alert(`存档已导入到槽位 ${targetSlot}！`);
        
        if (typeof AudioSystem !== 'undefined') AudioSystem.playGuardianEventTrigger();
        
        const saveOverlay = document.getElementById('save-overlay');
        if (saveOverlay && !saveOverlay.classList.contains('hidden')) {
            renderSaveSlots('save');
        }
    } catch (e) {
        alert('导入失败：存档文本已损坏。\n' + e.message);
    }
}


function initExportImport() {
    const exportBtn = document.getElementById('save-export-btn');
    const importBtn = document.getElementById('save-import-btn');
    
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const currentSlot = getCurrentSlot();
            if (currentSlot >= 1) {
                exportSaveToClipboard(currentSlot);
            } else {
                alert('没有活跃的存档。请先保存或读取一个存档。');
            }
        });
    }
    
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            importSaveFromClipboard();
        });
    }
}


function initSaveSystem() {
    const loadBtn = document.getElementById('load-btn');
    const saveCloseBtn = document.getElementById('save-close');

    // Load button: open slot selection panel
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            if (typeof AudioSystem !== 'undefined') AudioSystem.playButtonClick();
            openSaveScreen('load');
        });
    }

    if (saveCloseBtn) {
        saveCloseBtn.addEventListener('click', closeSaveScreen);
    }

    const overlay = document.getElementById('save-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSaveScreen();
        });
    }
}
