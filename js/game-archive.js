/**
 * game-archive.js - 从 game.js 拆分的模块
 * 包含: getArchiveById, getArchivesByVault, isArchiveCompleted...
 */

function getArchiveById(id) {
    return MemorySanctuary.data.archives.find(a => a.id === id) || null;
}


function getArchivesByVault(vaultId) {
    return MemorySanctuary.data.archives.filter(a => a.vault === vaultId);
}


function isArchiveCompleted(id) {
    return MemorySanctuary.state.completedArchives.includes(String(id));
}

/**
 * 获取所有可归档的条目（未归档、未过期、未超期、已解锁）
 */
function getAvailableArchives(state) {
    return MemorySanctuary.data.archives.filter(arch => {
        if (state.completedArchives.includes(arch.id)) return false;
        if (arch.expired) return false;
        if (arch.expiresAfter && state.week > arch.expiresAfter) return false;
        return true;
    });
}

/**
 * 统一归档可行性判断（供列表渲染 / 困局检测 / 推荐逻辑共用）
 * 紧急归档激活时：跳过介质与容量检查，只需能源 ≥ energyCost × 2
 */
function canArchiveEntry(entry) {
    const state = MemorySanctuary.state;
    if (!state || !entry) return false;
    if (isArchiveCompleted(entry.id)) return false;
    if (entry.expired) return false;
    // 紧急归档激活时跳过衰竭介质检查
    if (!state.emergencyArchiveActive && state.deterioration && state.deterioration.media) return false;
    if (state.emergencyArchiveActive) {
        return state.resources.energy >= (entry.energyCost || 0) * 2;
    }
    return hasResources(entry.energyCost || 0, entry.dataCost || 0);
}


/**
 * 计算条目在目标存储室的实际消耗（含主题加成/惩罚 + 科技树 archiveCostReduce）
 * 科技减免乘算在主题修正之后、单步取整（与 balance-sim-v2.js 口径一致）
 */
function getEffectiveCost(entry, vault) {
    if (!vault || !entry) return { energy: entry.energyCost, media: entry.dataCost };

    const entryType = entry.type || '';
    const themeTags = vault.themeTags || [];
    
    // P1-10 修复：统一主题匹配口径
    // 领域词（art/philosophy/ecology 等）需与 vault themeTags 匹配；
    // 载体词（text/document/audio/image/record/data/letter/blueprint）为通用格式，任何存储室都可接纳
    const CARRIER_TYPES = ['text', 'document', 'audio', 'image', 'record', 'data', 'letter', 'blueprint'];
    const isMatch = themeTags.includes(entryType) || CARRIER_TYPES.includes(entryType);

    let modifier = 1.0;
    if (isMatch) {
        modifier = 1.0 - (vault.themeBonus || 0);
    } else {
        modifier = 1.0 + (vault.themePenalty || 0);
    }

    // 科技树「速录学派」（archiveCostReduce）：项目系统不碰归档成本，此处为唯一接入点
    const techArchive = (typeof getTechArchiveBonus === 'function') ? getTechArchiveBonus() : null;
    if (techArchive && techArchive.costReduce > 0) {
        modifier *= (1 - techArchive.costReduce);
    }

    return {
        energy: Math.round(entry.energyCost * modifier),
        media: Math.round(entry.dataCost * modifier),
        modifier: modifier,
        isMatch: isMatch
    };
}

/**
 * 检查条目冲突：归档某条是否导致另一条消失
 */
function checkArchiveConflict(archiveId) {
    const entry = getArchiveById(archiveId);
    if (!entry || !entry.conflictsWith) return null;
    
    const conflictId = entry.conflictsWith;
    const conflictEntry = getArchiveById(conflictId);
    if (!conflictEntry) return null;
    
    // 如果冲突条目已归档，无冲突
    if (isArchiveCompleted(conflictId)) return null;
    
    // 如果冲突条目已过期，无冲突
    if (conflictEntry.expired) return null;
    
    return conflictEntry;
}

/**
 * 使冲突条目消失（归档互斥条目时调用）
 */
function destroyConflictEntry(conflictId) {
    const conflictEntry = getArchiveById(conflictId);
    if (!conflictEntry) return;
    
    conflictEntry.expired = true;
    addLog(`⚠️ 由于叙事冲突，「${conflictEntry.title}」已永久消失。`, 'warning');
    
    // 记录冲突事件
    if (!MemorySanctuary.state.conflictLog) {
        MemorySanctuary.state.conflictLog = [];
    }
    MemorySanctuary.state.conflictLog.push({
        week: MemorySanctuary.state.week,
        kept: MemorySanctuary.state.completedArchives[MemorySanctuary.state.completedArchives.length - 1],
        destroyed: conflictId
    });
}

/**
 * 归档仪式类型
 * standard: 标准归档（正常消耗）
 * deep: 深度归档（额外消耗10能源，解锁隐藏叙事）
 * quick: 速记（省 30% 资源、不推进时间，无守护者反应）
 */
function archiveEntry(archiveId, ritualType = 'standard') {
    const entry = getArchiveById(archiveId);
    const state = MemorySanctuary.state;
    
    if (!entry) {
        addLog(`错误：找不到条目 ${archiveId}`, 'system');
        return false;
    }
    
    if (isArchiveCompleted(archiveId)) {
        addLog(`条目 \"${entry.title}\" 已被归档。`, 'system');
        renderAll();
        return false;
    }
    
    // 速记（快速归档）每回合限 1 次：牺牲叙事深度，不可滥用
    if (ritualType === 'quick') {
        if (state.quickArchiveWeek === state.week) {
            addLog('⚡ 速记本回合已使用（每回合限 1 次）。', 'system');
            return false;
        }
    }
    // 圣所衰竭：介质耗尽时无法录入（紧急归档除外）
    if (!state.emergencyArchiveActive && state.deterioration && state.deterioration.media) {
        addLog('存储介质耗尽，无法录入新条目。请补充介质后再试。', 'system');
        return false;
    }
    
    const isEmergencyArchive = state.emergencyArchiveActive;
    const isBatchMode = state.batchArchiveMode;
    
    // 计算实际消耗（含主题加成/惩罚）
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    const effectiveCost = getEffectiveCost(entry, vault);
    
    // 根据仪式类型调整消耗
    let energyCost = effectiveCost.energy;
    let mediaCost = effectiveCost.media;
    let extraEnergyCost = 0;
    
    if (ritualType === 'deep') {
        extraEnergyCost = 10;
    } else if (ritualType === 'quick') {
        // 速记：仅省 30% 资源，但牺牲叙事深度（见下方限制）
        energyCost = Math.ceil(energyCost * 0.7);
        mediaCost = Math.ceil(mediaCost * 0.7);
    }
    
    // 紧急归档协议：跳过介质检查
    if (isEmergencyArchive) {
        if (state.resources.energy < energyCost * 2 + extraEnergyCost) {
            addLog(`能源不足，无法介质豁免 \"${entry.title}\"。`, 'system');
            state.emergencyArchiveActive = false;
            return false;
        }
    } else {
        const totalEnergy = energyCost + extraEnergyCost;
        const totalMedia = mediaCost;
        if (ritualType === 'quick') {
            // 快速归档只需50%资源
            if (!hasResources(totalEnergy, totalMedia)) {
                addLog(`资源不足，无法归档 \"${entry.title}\"。`, 'system');
                return false;
            }
        } else {
            if (!hasResources(totalEnergy, totalMedia)) {
                addLog(`资源不足，无法归档 \"${entry.title}\"。`, 'system');
                return false;
            }
        }
    }
    
    if (!vault) {
        addLog(`错误：找不到存储室 ${entry.vault}`, 'system');
        return false;
    }
    
    const currentUsage = state.vaultUsage[vault.id] || 0;
    
    // 紧急归档协议：跳过容量检查（不消耗介质）
    if (!isEmergencyArchive && currentUsage + mediaCost > vault.capacity) {
        addLog(`存储室 \"${vault.name}\" 容量不足。`, 'system');
        return false;
    }
    
    // 紧急归档协议：本回合归档不消耗介质（能源消耗加倍）
    if (isEmergencyArchive) {
        if (!consumeResources(energyCost * 2 + extraEnergyCost, 0)) return false;
    } else {
        // 食物归零惩罚：归档能源消耗 +20%
        let foodPenalty = 0;
        if (state.resources.food <= 0) {
            foodPenalty = Math.ceil(energyCost * 0.2);
        }
        if (!consumeResources(energyCost + foodPenalty + extraEnergyCost, mediaCost)) return false;
        if (foodPenalty > 0) {
            addLog(`🍂 饥荒惩罚：归档能耗 +${foodPenalty}（食物耗尽）`, 'warning');
        }
    }
    
    // 介质豁免协议激活后立即关闭
    if (state.emergencyArchiveActive) {
        state.emergencyArchiveActive = false;
        addLog('📼 介质豁免已结束（本回合效果已使用）。', 'system');
    }
    
    state.completedArchives.push(archiveId);
    // 归档成功即中断连续跳过（跳过惩罚归零）
    if (typeof resetConsecutiveSkips === 'function') resetConsecutiveSkips();
    // 紧急归档不消耗介质，所以不增加 vaultUsage
    if (!isEmergencyArchive) {
        state.vaultUsage[vault.id] = currentUsage + mediaCost;
    }
    
    // 检查冲突：归档此条目是否导致另一条消失
    const conflict = checkArchiveConflict(archiveId);
    if (conflict) {
        destroyConflictEntry(conflict.id);
    }
    
    // 批量归档模式：不推进时间
    if (isBatchMode) {
        state.batchArchiveCount = (state.batchArchiveCount || 0) + 1;
        addLog(`📦 批量归档 (${state.batchArchiveCount}/3)：\"${entry.title}\"`, 'success');
        
        // 音效
        if (typeof AudioSystem !== 'undefined') AudioSystem.playArchiveChime();
        
        // 守护者反应（仅前2次，第3次批量结束后统一显示）
        if (state.batchArchiveCount < 3 && ritualType !== 'quick') {
            const guardianId = Object.keys(entry.guardianReactions || {})[0];
            if (guardianId && entry.guardianReactions[guardianId]) {
                addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
            }
        }
        
        // 检查是否达到批量上限
        if (state.batchArchiveCount >= 3) {
            finishBatchArchive();
        }
        
        renderAll();
        return true;
    }
    
    // 速记不推进时间（轻量动作）；标准/深度归档推进 1 周
    if (ritualType !== 'quick') {
        advanceTime(1);
    }
    
    // 深度归档日志
    if (ritualType === 'deep') {
        addLog(`✨ 深度归档：\"${entry.title}\"（额外消耗 10 能源解锁隐藏叙事）`, 'success');
        state.deepArchiveCount = (state.deepArchiveCount || 0) + 1;
    } else if (ritualType === 'quick') {
        addLog(`⚡ 快速归档：\"${entry.title}\"（省 30% 资源）`, 'success');
    } else {
        addLog(`已完成归档：\"${entry.title}\"`, 'success');
    }
    
    // 音效：归档成功风铃
    if (typeof AudioSystem !== 'undefined') AudioSystem.playArchiveChime();
    
    // 守护者反应（速记无反应）
    if (ritualType !== 'quick') {
        const guardianId = Object.keys(entry.guardianReactions || {})[0];
        if (guardianId && entry.guardianReactions[guardianId]) {
            addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
            showGuardianDialogue(guardianId, 'archive');
        }
    } else {
        // 速记：标记浅层录入（牺牲隐藏叙事与线索链），并记录本回合已用
        state.quickArchiveWeek = state.week;
        if (!state.shallowArchives) state.shallowArchives = [];
        if (!state.shallowArchives.includes(archiveId)) state.shallowArchives.push(archiveId);
        addLog(`⚡ 速记：仅保留核心数据，省略细节与守护者注记。`, 'system');
    }
    
    // 归档后展示内容（根据设置决定是否显示）
    const settings = (typeof getSettings === 'function') ? getSettings() : { showResult: true };
    if (settings.showResult) {
        showArchiveCompleteModal(entry, ritualType);
    }
    
    // 检查叙事线索链（速记不触发隐藏叙事与线索链）
    if (ritualType !== 'quick' && typeof checkNarrativeChains === 'function') checkNarrativeChains(archiveId);
    
    // 归档后可能触发事件（速记不推进时间，不触发世界事件）
    if (ritualType !== 'quick' && typeof checkRandomEvent === 'function') checkRandomEvent();
    
    // 归档成功士气奖励（速记仅基础奖励的一半）
    if (ritualType === 'quick') {
        if (MemorySanctuary.state.guardianMoods) {
            Object.keys(MemorySanctuary.state.guardianMoods).forEach(gid => {
                MemorySanctuary.state.guardianMoods[gid] = Math.min(10, (MemorySanctuary.state.guardianMoods[gid] || 0) + 0.25);
            });
        }
    } else {
        applyArchiveMoraleBonus(entry);
    }
    
    renderAll();
    return true;
}

/**
 * 进入紧急归档协议（批量归档）
 * 第30周后解锁，可一回合归档最多3条，不消耗时间
 * 代价：环境-10、全体守护者心情-2、下周衰减+20%
 */
function enterBatchArchiveMode() {
    const state = MemorySanctuary.state;
    if (!state) return;
    
    // 解锁条件：第30周后
    if (state.week < 30) {
        addLog('⚠️ 紧急归档协议尚未解锁（第30周后解锁）。', 'system');
        return;
    }
    
    // 检查是否有可归档的条目
    const available = getAvailableArchives(state);
    const affordable = available.filter(a => canArchiveEntry(a));
    if (affordable.length === 0) {
        addLog('当前没有可归档的条目。', 'system');
        return;
    }
    
    // 检查是否已经使用过（每局限1次）
    if (state.batchArchiveUsedThisRun) {
        addLog('⚠️ 紧急归档协议已在本周目中使用过。', 'system');
        return;
    }
    
    // 激活紧急归档模式
    state.batchArchiveMode = true;
    state.batchArchiveCount = 0;
    
    // 立即付出代价
    state.resources.environment = Math.max(0, state.resources.environment - 10);
    state.batchArchiveUsedThisRun = true;
    
    // 守护者心情下降
    Object.keys(state.guardianMoods || {}).forEach(gid => {
        state.guardianMoods[gid] = (state.guardianMoods[gid] || 0) - 2;
    });
    
    // 标记下周衰减增加
    state.nextWeekDecayPenalty = 0.2;
    
    addLog('🚨 紧急归档协议已激活！守护者加班加点，圣所环境急剧恶化。', 'warning');
    addLog('⚠️ 代价：环境稳定度 -10，全体守护者心情 -2，下周衰减 +20%。', 'warning');
    
    // 音效
    if (typeof AudioSystem !== 'undefined') AudioSystem.playEmergencyCorrupt();
    
    renderAll();
}

/**
 * 退出紧急归档模式（手动或自动）
 */
function exitBatchArchiveMode() {
    const state = MemorySanctuary.state;
    if (!state || !state.batchArchiveMode) return;
    
    state.batchArchiveMode = false;
    
    if (state.batchArchiveCount > 0) {
        addLog(`🚨 紧急归档结束：共归档 ${state.batchArchiveCount} 条。圣所已伤痕累累。`, 'warning');
        advanceTime(1);
    } else {
        addLog('🚨 紧急归档已取消。守护者松了一口气。', 'system');
        // 退回已付出的代价
        state.resources.environment = Math.min(100, state.resources.environment + 10);
        state.batchArchiveUsedThisRun = false;
        Object.keys(state.guardianMoods || {}).forEach(gid => {
            state.guardianMoods[gid] = (state.guardianMoods[gid] || 0) + 2;
        });
        state.nextWeekDecayPenalty = 0;
    }
    
    state.batchArchiveCount = 0;
    
    // 音效
    if (typeof AudioSystem !== 'undefined') AudioSystem.playPanelClose();
    
    renderAll();
}

/**
 * 完成紧急归档（达到3条时自动调用）
 */
function finishBatchArchive() {
    const state = MemorySanctuary.state;
    if (!state) return;
    
    addLog(`🚨 紧急归档完成：3 条已归档。圣所环境急剧恶化，守护者身心俱疲。`, 'warning');
    
    // 音效
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.playArchiveChime();
        AudioSystem.playEmergencyCorrupt();
    }
    
    state.batchArchiveMode = false;
    state.batchArchiveCount = 0;
    
    advanceTime(1);
}


function applyArchiveMoraleBonus(entry) {
    const state = MemorySanctuary.state;
    if (!state.guardianMoods) return;

    // 科技树 archiveMoodBonus：归档获得的好感 ×(1 + moodBonus)
    const techArchive = (typeof getTechArchiveBonus === 'function') ? getTechArchiveBonus() : { moodBonus: 0 };
    const moodMultiplier = 1 + (techArchive.moodBonus || 0);

    // 基础归档奖励：所有守护者 +0.5
    const baseGain = 0.5 * moodMultiplier;
    Object.keys(state.guardianMoods).forEach(gid => {
        state.guardianMoods[gid] = Math.min(10, (state.guardianMoods[gid] || 0) + baseGain);
    });

    // 如果条目关联特定守护者，该守护者额外 +1
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && state.guardianMoods[guardianId] !== undefined) {
        state.guardianMoods[guardianId] = Math.min(10, state.guardianMoods[guardianId] + 1 * moodMultiplier);
    }
}


function confirmArchive(archiveId) {
    // 检查是否启用了"跳过归档确认"
    const settings = (typeof getSettings === 'function') ? getSettings() : { skipConfirm: false, showResult: true };
    if (settings.skipConfirm) {
        archiveEntry(archiveId);
        return;
    }
    
    const entry = getArchiveById(archiveId);
    if (!entry) return;
    
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = '确认归档';
    
    let contentText = `确定要归档「${entry.title}」吗？\n\n`;
    contentText += `消耗：◈ ${entry.energyCost} 能源，◇ ${entry.dataCost} 介质\n`;
    contentText += `存储室：${MemorySanctuary.data.vaults.find(v => v.id === entry.vault)?.name || ''}\n`;
    
    if (entry.relatedArchives && entry.relatedArchives.length > 0) {
        const relatedNames = entry.relatedArchives
            .map(id => getArchiveById(id)?.title)
            .filter(Boolean)
            .map(t => `「${t}」`)
            .join('、');
        if (relatedNames) {
            contentText += `\n🔗 归档此条目将揭示与 ${relatedNames} 的关联。`;
        }
    }
    
    contentText += `\n\n归档后将推进1周时间。`;
    
    // 立即归档机会提示
    const instantChances = MemorySanctuary.state.instantArchiveChances || 0;
    if (instantChances > 0) {
        contentText += `\n\n⚡ 你有 ${instantChances} 次立即归档机会（不消耗介质，不推进时间）。`;
    }
    
    content.innerHTML = esc(contentText, true);
    overlay.classList.remove('hidden');
    
    // 创建确认按钮容器
    const existingConfirm = document.getElementById('modal-confirm-container');
    if (existingConfirm) existingConfirm.remove();
    
    const confirmContainer = document.createElement('div');
    confirmContainer.id = 'modal-confirm-container';
    confirmContainer.style.display = 'flex';
    confirmContainer.style.gap = '12px';
    confirmContainer.style.alignItems = 'center';
    confirmContainer.style.marginTop = '16px';
    confirmContainer.style.flexWrap = 'wrap';
    
    // "不再提示"复选框
    const skipLabel = document.createElement('label');
    skipLabel.style.display = 'flex';
    skipLabel.style.alignItems = 'center';
    skipLabel.style.gap = '6px';
    skipLabel.style.fontSize = '0.75rem';
    skipLabel.style.color = 'var(--text-dim)';
    skipLabel.style.cursor = 'pointer';
    
    const skipCheckbox = document.createElement('input');
    skipCheckbox.type = 'checkbox';
    skipCheckbox.id = 'skip-confirm-checkbox';
    skipCheckbox.style.cursor = 'pointer';
    
    skipLabel.appendChild(skipCheckbox);
    skipLabel.appendChild(document.createTextNode('不再提示'));
    
    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'modal-confirm-btn';
    confirmBtn.textContent = '确认归档';
    confirmBtn.style.padding = '10px 24px';
    confirmBtn.style.background = 'var(--amber-primary)';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.color = 'var(--bg-deep)';
    confirmBtn.style.fontFamily = 'var(--font-cn)';
    confirmBtn.style.fontSize = '0.9rem';
    confirmBtn.style.cursor = 'pointer';
    
    confirmBtn.onclick = () => {
        if (skipCheckbox.checked) {
            if (typeof getSettings === 'function') {
                const s = getSettings();
                s.skipConfirm = true;
                localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
            }
        }
        closeConfirmModal(archiveId, true);
    };
    
    confirmContainer.appendChild(skipLabel);
    confirmContainer.appendChild(confirmBtn);
    
    // 深度归档按钮（P1-9 修复：增加深度归档 UI 入口）
    const deepBtn = document.createElement('button');
    deepBtn.id = 'modal-deep-btn';
    deepBtn.textContent = '✨ 深度归档（+10能源解锁隐藏叙事）';
    deepBtn.style.padding = '10px 20px';
    deepBtn.style.background = 'transparent';
    deepBtn.style.border = '1px solid var(--amber-primary)';
    deepBtn.style.borderRadius = '4px';
    deepBtn.style.color = 'var(--amber-primary)';
    deepBtn.style.fontFamily = 'var(--font-cn)';
    deepBtn.style.fontSize = '0.85rem';
    deepBtn.style.cursor = 'pointer';
    deepBtn.style.marginLeft = '8px';
    deepBtn.title = '额外消耗 10 能源，解锁隐藏叙事与线索';
    
    deepBtn.onclick = () => {
        if (skipCheckbox.checked) {
            if (typeof getSettings === 'function') {
                const s = getSettings();
                s.skipConfirm = true;
                localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
            }
        }
        closeConfirmModal(archiveId, true, 'deep');
    };
    
    confirmContainer.appendChild(deepBtn);
    
    // 立即归档按钮（有机会时显示）
    if (instantChances > 0) {
        const instantBtn = document.createElement('button');
        instantBtn.id = 'modal-instant-btn';
        instantBtn.textContent = '⚡ 立即归档';
        instantBtn.style.padding = '10px 20px';
        instantBtn.style.background = 'var(--success)';
        instantBtn.style.border = 'none';
        instantBtn.style.borderRadius = '4px';
        instantBtn.style.color = '#fff';
        instantBtn.style.fontFamily = 'var(--font-cn)';
        instantBtn.style.fontSize = '0.85rem';
        instantBtn.style.cursor = 'pointer';
        instantBtn.title = '不消耗介质，不推进时间';
        
        instantBtn.onclick = () => {
            if (skipCheckbox.checked) {
                if (typeof getSettings === 'function') {
                    const s = getSettings();
                    s.skipConfirm = true;
                    localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
                }
            }
            closeConfirmModal(archiveId, false);
            useInstantArchive(archiveId);
        };
        
        confirmContainer.appendChild(instantBtn);
    }
    
    // 修改关闭按钮为"取消"
    if (closeBtn) {
        closeBtn.textContent = '取消';
        closeBtn.onclick = () => {
            closeConfirmModal(archiveId, false);
        };
    }
    
    content.appendChild(confirmContainer);
}


function confirmQuickArchive(archiveId) {
    // 设置允许跳过速记确认
    const settings = (typeof getSettings === 'function') ? getSettings() : { quickNoteConfirm: true };
    if (settings.quickNoteConfirm === false) {
        archiveEntry(archiveId, 'quick');
        return;
    }

    const entry = getArchiveById(archiveId);
    if (!entry) return;
    const state = MemorySanctuary.state;

    // 已用过速记：直接给阻断提示，不再弹确认
    if (state.quickArchiveWeek === state.week) {
        addLog('⚡ 速记本回合已使用（每回合限 1 次）。', 'system');
        if (typeof showTransientNotice === 'function') showTransientNotice('⚡ 速记每回合限用 1 次，本回合已使用过。');
        return;
    }

    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    if (!overlay || !title || !content) {
        archiveEntry(archiveId, 'quick');
        return;
    }

    // 计算速记后实际消耗（与 archiveEntry 同口径）
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    const effectiveCost = getEffectiveCost(entry, vault);
    const energyCost = Math.ceil((effectiveCost.energy || 0) * 0.7);
    const mediaCost = Math.ceil((effectiveCost.media || 0) * 0.7);

    title.textContent = '确认速记';

    let contentText = `要以「⚡速记」归档「${entry.title}」吗？\n\n`;
    contentText += `【速记收益】\n`;
    contentText += `· 资源消耗 -30%：◈ ${energyCost} 能源，◇ ${mediaCost} 介质\n`;
    contentText += `· 不推进时间（本回合仍可继续其他行动）\n\n`;
    contentText += `【速记代价】\n`;
    contentText += `· 牺牲隐藏叙事与守护者注记（条目被标记为浅层录入）\n`;
    contentText += `· 不触发叙事线索链\n`;
    contentText += `· 士气收益减半\n`;
    contentText += `· 每回合限用 1 次`;

    content.innerHTML = esc(contentText, true);
    overlay.classList.remove('hidden');

    const existingConfirm = document.getElementById('modal-confirm-container');
    if (existingConfirm) existingConfirm.remove();

    const confirmContainer = document.createElement('div');
    confirmContainer.id = 'modal-confirm-container';
    confirmContainer.style.display = 'flex';
    confirmContainer.style.gap = '12px';
    confirmContainer.style.alignItems = 'center';
    confirmContainer.style.marginTop = '16px';
    confirmContainer.style.flexWrap = 'wrap';

    const skipLabel = document.createElement('label');
    skipLabel.style.display = 'flex';
    skipLabel.style.alignItems = 'center';
    skipLabel.style.gap = '6px';
    skipLabel.style.fontSize = '0.75rem';
    skipLabel.style.color = 'var(--text-dim)';
    skipLabel.style.cursor = 'pointer';

    const skipCheckbox = document.createElement('input');
    skipCheckbox.type = 'checkbox';
    skipCheckbox.id = 'quick-note-confirm-checkbox';
    skipCheckbox.style.cursor = 'pointer';

    skipLabel.appendChild(skipCheckbox);
    skipLabel.appendChild(document.createTextNode('不再提示（可在设置中重新开启）'));

    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'modal-quick-confirm-btn';
    confirmBtn.textContent = '⚡ 确认速记';
    confirmBtn.style.padding = '10px 24px';
    confirmBtn.style.background = 'var(--success)';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.color = '#fff';
    confirmBtn.style.fontFamily = 'var(--font-cn)';
    confirmBtn.style.fontSize = '0.9rem';
    confirmBtn.style.cursor = 'pointer';

    confirmBtn.onclick = () => {
        if (skipCheckbox.checked && typeof getSettings === 'function') {
            const s = getSettings();
            s.quickNoteConfirm = false;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
        }
        closeConfirmModal(archiveId, true, 'quick');
    };

    confirmContainer.appendChild(skipLabel);
    confirmContainer.appendChild(confirmBtn);

    // 修改关闭按钮为"取消"
    if (closeBtn) {
        closeBtn.textContent = '取消';
        closeBtn.onclick = () => {
            closeConfirmModal(archiveId, false);
        };
    }

    content.appendChild(confirmContainer);
}


function useInstantArchive(archiveId) {
    const entry = getArchiveById(archiveId);
    if (!entry) return false;
    if (MemorySanctuary.state.instantArchiveChances <= 0) {
        addLog('没有立即归档机会。', 'system');
        return false;
    }
    if (isArchiveCompleted(archiveId)) {
        addLog('该条目已被归档。', 'system');
        return false;
    }
    
    const state = MemorySanctuary.state;
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) return false;
    
    // 检查能源（正常消耗）
    if (state.resources.energy < entry.energyCost) {
        addLog(`能源不足，无法立即归档「${entry.title}」。`, 'system');
        return false;
    }
    
    // 检查容量
    const currentUsage = state.vaultUsage[vault.id] || 0;
    if (currentUsage + entry.dataCost > vault.capacity) {
        addLog(`存储室「${vault.name}」容量不足。`, 'system');
        return false;
    }
    
    // 消耗机会 + 能源，不消耗介质，不推进时间
    state.instantArchiveChances--;
    state.resources.energy -= entry.energyCost;
    state.completedArchives.push(archiveId);
    state.vaultUsage[vault.id] = currentUsage + entry.dataCost;
    
    addLog(`⚡ 立即归档：「${entry.title}」（剩余机会：${state.instantArchiveChances}）`, 'success');
    
    // 音效
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.playArchiveChime();
        if (AudioSystem.playInstantArchive) AudioSystem.playInstantArchive();
    }
    
    // 守护者反应
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && entry.guardianReactions[guardianId]) {
        addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
    }

    // 归档后展示剧情文本（与正常归档一致，遵循「归档后展示内容」设置）
    const settings = (typeof getSettings === 'function') ? getSettings() : { showResult: true };
    if (settings.showResult) {
        showArchiveCompleteModal(entry);
    }
    
    // 检查叙事线索链
    if (typeof checkNarrativeChains === 'function') checkNarrativeChains(archiveId);
    
    renderAll();
    return true;
}


function buyInstantArchiveWithFood() {
    const state = MemorySanctuary.state;
    const cost = (typeof GUARDIAN_AID_FOOD_COST !== 'undefined') ? GUARDIAN_AID_FOOD_COST : 30; // 30食物 = 1次机会
    if ((state.resources.food || 0) < cost) {
        addLog(`食物不足：守护者临时协助需要 ${cost} 食物作为加急报酬。`, 'system');
        return false;
    }
    state.resources.food -= cost;
    state.instantArchiveChances++;
    state.guardianAidCount = (state.guardianAidCount || 0) + 1;
    addLog(`🍖 以 ${cost} 食物作为报酬，守护者答应临时协助归档（当前可协助次数：${state.instantArchiveChances}）。`, 'success');
    if (typeof AudioSystem !== 'undefined') AudioSystem.playExploreDeploy();
    renderAll();
    return true;
}


// ==========================================
// AI 助理辅助归档（新机制：proj_ai_assistant 解锁）
// ==========================================
const AI_ASSIST_ENV_COST = 5;   // 每次 AI 辅助归档牺牲的环境稳定度（v1.11 由 2 上调：半价+不推进时间的收益值得更高无序度代价）

/** 判断某条目当前是否可请求 AI 助理辅助归档 */
function canAiAssistArchive(entry) {
    const state = MemorySanctuary.state;
    if (!state || !entry) return false;
    if (!state.aiAssistantActive || state.aiAssistUsedThisWeek) return false;
    if (isArchiveCompleted(entry.id) || entry.expired) return false;
    if (state.deterioration && state.deterioration.media) return false;
    if ((state.resources.environment || 0) < AI_ASSIST_ENV_COST) return false;

    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) return false;
    if ((state.vaultUsage[vault.id] || 0) + entry.dataCost > vault.capacity) return false;

    const energyCost = Math.ceil((entry.energyCost || 0) / 2);
    const dataCost = Math.ceil((entry.dataCost || 0) / 2);
    return (state.resources.energy || 0) >= energyCost && (state.resources.media || 0) >= dataCost;
}

/**
 * 每回合最多一次：请求 AI 助理辅助归档
 * 费用减半（能源/介质各取半向上取整），不推进时间，环境稳定度 -5
 */
function aiAssistArchive(archiveId) {
    const state = MemorySanctuary.state;
    const entry = getArchiveById(archiveId);
    if (!state || !entry) return false;
    if (!state.aiAssistantActive) {
        addLog('档案AI助理尚未上线。请先在「维护项目」中搭建。', 'system');
        return false;
    }
    if (state.aiAssistUsedThisWeek) {
        addLog('AI 助理本周已完成一次辅助归档，下周再来吧。', 'system');
        return false;
    }
    if (isArchiveCompleted(archiveId)) {
        addLog('该条目已被归档。', 'system');
        return false;
    }
    if (state.deterioration && state.deterioration.media) {
        addLog('存储介质耗尽，AI 助理也无法录入新条目。', 'system');
        return false;
    }
    if ((state.resources.environment || 0) < AI_ASSIST_ENV_COST) {
        addLog('环境稳定度不足，无法承受 AI 辅助归档带来的无序度。', 'system');
        return false;
    }

    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) return false;

    const currentUsage = state.vaultUsage[vault.id] || 0;
    if (currentUsage + entry.dataCost > vault.capacity) {
        addLog(`存储室「${vault.name}」容量不足。`, 'system');
        return false;
    }

    // 半价费用（向上取整）
    const energyCost = Math.ceil((entry.energyCost || 0) / 2);
    const dataCost = Math.ceil((entry.dataCost || 0) / 2);
    if ((state.resources.energy || 0) < energyCost || (state.resources.media || 0) < dataCost) {
        addLog(`资源不足，无法请求 AI 助理辅助归档「${entry.title}」。`, 'system');
        return false;
    }

    // 执行：消耗半价资源 + 环境稳定度下降，不推进时间
    state.resources.energy -= energyCost;
    state.resources.media -= dataCost;
    state.resources.environment = Math.max(0, state.resources.environment - AI_ASSIST_ENV_COST);
    state.aiAssistUsedThisWeek = true;
    state.aiAssistCount = (state.aiAssistCount || 0) + 1;
    state.completedArchives.push(archiveId);
    state.vaultUsage[vault.id] = currentUsage + entry.dataCost;

    addLog(`🤖 AI 助理辅助归档：「${entry.title}」（费用减半 ◈${energyCost} ◇${dataCost}，环境稳定度 -${AI_ASSIST_ENV_COST}）`, 'success');

    // 音效
    if (typeof AudioSystem !== 'undefined') {
        if (AudioSystem.playArchiveChime) AudioSystem.playArchiveChime();
        if (AudioSystem.playInstantArchive) AudioSystem.playInstantArchive();
    }

    // 叙事线索链
    if (typeof checkNarrativeChains === 'function') checkNarrativeChains(archiveId);

    // 守护者反应（与正常归档一致）
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && entry.guardianReactions[guardianId]) {
        addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
    }

    // 归档后展示剧情文本（与正常归档一致，遵循「归档后展示内容」设置）
    const settings = (typeof getSettings === 'function') ? getSettings() : { showResult: true };
    if (settings.showResult) {
        showArchiveCompleteModal(entry);
    }

    renderAll();
    return true;
}


function closeConfirmModal(archiveId, confirmed, ritualType = 'standard') {
    const overlay = document.getElementById('modal-overlay');
    const confirmContainer = document.getElementById('modal-confirm-container');
    const closeBtn = document.getElementById('modal-close');
    
    if (overlay) overlay.classList.add('hidden');
    if (confirmContainer) confirmContainer.remove();
    
    // 重置关闭按钮为"确认"
    if (closeBtn) {
        closeBtn.textContent = '确认';
        closeBtn.onclick = null;
    }
    
    if (confirmed && archiveId) {
        archiveEntry(archiveId, ritualType);
    }
}


function showArchiveCompleteModal(entry, ritualType = 'standard') {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = `归档完成：${entry.title}`;
    
    let modalContent = `${entry.description}\n\n`;
    modalContent += `「${entry.content.substring(0, 120)}...」\n\n`;

    // 深度归档解锁隐藏叙事；科技树 revealHidden（深研学派）让标准归档同样展示
    // （v0.2.4 去重后仅归档域提供 revealHidden，勘探域守真勘探只做情报指认）
    const techArchive = (typeof getTechArchiveBonus === 'function') ? getTechArchiveBonus() : null;
    const revealHidden = ritualType === 'deep' || (techArchive && techArchive.revealHidden);
    if (revealHidden && entry.hiddenContent) {
        modalContent += `━━ 隐藏叙事 ━━\n`;
        modalContent += `${entry.hiddenContent}\n\n`;
    }
    
    if (entry.guardianReactions) {
        const reactions = Object.entries(entry.guardianReactions);
        if (reactions.length > 0) {
            modalContent += `守护者反应：\n`;
            reactions.forEach(([guardian, reaction]) => {
                modalContent += `• ${getGuardianName(guardian)}：「${reaction}」\n`;
            });
        }
    }
    
    content.innerHTML = esc(modalContent, true);
    overlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('modal-close');
    closeBtn.onclick = () => overlay.classList.add('hidden');
}


function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}


function isArchiveAvailable(entry) {
    // 检查周数解锁条件
    if (entry.availableAfter && MemorySanctuary.state && MemorySanctuary.state.week < entry.availableAfter) {
        return false;
    }
    
    // 检查过期条件
    if (entry.expiresAfter && MemorySanctuary.state && MemorySanctuary.state.week > entry.expiresAfter) {
        return false;
    }
    
    // 工程机器人门槛（数据驱动 unlockCondition.bots：专属条目只在拥有足量机器人期间可见）
    if (entry.unlockCondition && entry.unlockCondition.bots) {
        const botCount = (MemorySanctuary.state && MemorySanctuary.state.resources.engineeringBots) || 0;
        if (botCount < entry.unlockCondition.bots) {
            return false;
        }
    }
    
    if (!entry.ngPlusExclusive) return true;
    const ngData = getNGPlusData();
    
    // Check unlockCondition
    if (entry.unlockCondition) {
        // Playthrough-based unlock
        if (entry.unlockCondition.playthrough) {
            if (ngData.playthroughCount < entry.unlockCondition.playthrough) return false;
        }
        // Guardian-based unlock (from ending)
        if (entry.unlockCondition.guardian && entry.unlockCondition.moodTier) {
            // Only available if we've seen this guardian's finale in a previous run
            if (!ngData.guardianFinalesSeen.includes(entry.unlockCondition.guardian)) return false;
        }
    }
    
    // Check if already unlocked in NG+ data
    if (ngData.unlockedEntries && ngData.unlockedEntries.includes(entry.id)) return true;
    
    // ngPlusExclusive 条目：未在 unlockedEntries 中则不可用
    return false;
}


function checkNarrativeChains(archiveId) {
    const entry = getArchiveById(archiveId);
    if (!entry || !entry.relatedArchives || entry.relatedArchives.length === 0) return;
    
    const unlocked = [];
    for (const relatedId of entry.relatedArchives) {
        const related = getArchiveById(relatedId);
        if (related && !isArchiveCompleted(relatedId) && !related.expired) {
            unlocked.push(related);
        }
    }
    
    if (unlocked.length > 0) {
        const names = unlocked.map(e => `「${e.title}」`).join('、');
        addLog(`🔗 线索揭示：归档此条目揭示了与 ${names} 的关联。`, 'guardian');
        if (typeof AudioSystem !== 'undefined') AudioSystem.playExploreReturnNarrative();
    }
    
    // 链式完成奖励：所有关联条目都已归档
    const allRelatedCompleted = entry.relatedArchives.every(id => isArchiveCompleted(id));
    if (allRelatedCompleted && entry.relatedArchives.length >= 2) {
        MemorySanctuary.state.instantArchiveChances++;
        addLog(`🎉 链式归档完成！关联条目全部归档，获得1次立即归档机会（当前：${MemorySanctuary.state.instantArchiveChances}次）。`, 'success');
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playArchiveChime();
            if (AudioSystem.playChainComplete) AudioSystem.playChainComplete();
        }
    }
}


function getChainIndicator(entry) {
    if (!entry.relatedArchives || entry.relatedArchives.length === 0) return '';
    const completed = entry.relatedArchives.filter(id => isArchiveCompleted(id)).length;
    if (completed === 0) return ' 🔗';
    if (completed === entry.relatedArchives.length) return ' ✅';
    return ` 🔗${completed}/${entry.relatedArchives.length}`;
}
