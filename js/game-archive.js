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


function archiveEntry(archiveId) {
    const entry = getArchiveById(archiveId);
    const state = MemorySanctuary.state;
    
    if (!entry) {
        addLog(`错误：找不到条目 ${archiveId}`, 'system');
        return false;
    }
    
    if (isArchiveCompleted(archiveId)) {
        addLog(`条目 "${entry.title}" 已被归档。`, 'system');
        renderAll();
        return false;
    }
    
    // 圣所衰竭：介质耗尽时无法录入
    if (MemorySanctuary.state.deterioration && MemorySanctuary.state.deterioration.media) {
        addLog('存储介质耗尽，无法录入新条目。请补充介质后再试。', 'system');
        return false;
    }
    
    const isEmergencyArchive = MemorySanctuary.state.emergencyArchiveActive;
    
    // 紧急归档协议：跳过介质检查
    if (isEmergencyArchive) {
        if (state.resources.energy < entry.energyCost * 2) {
            addLog(`能源不足，无法紧急归档 "${entry.title}"。`, 'system');
            // 归档失败时关闭紧急归档，避免影响后续正常归档
            MemorySanctuary.state.emergencyArchiveActive = false;
            return false;
        }
    } else {
        if (!hasResources(entry.energyCost, entry.dataCost)) {
            addLog(`资源不足，无法归档 "${entry.title}"。`, 'system');
            return false;
        }
    }
    
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) {
        addLog(`错误：找不到存储室 ${entry.vault}`, 'system');
        return false;
    }
    
    const currentUsage = MemorySanctuary.state.vaultUsage[vault.id] || 0;
    
    // 紧急归档协议：跳过容量检查（不消耗介质）
    if (!isEmergencyArchive && currentUsage + entry.dataCost > vault.capacity) {
        addLog(`存储室 "${vault.name}" 容量不足。`, 'system');
        return false;
    }
    
    // 紧急归档协议：本回合归档不消耗介质（能源消耗加倍）
    if (isEmergencyArchive) {
        // 紧急归档：介质消耗为 0，能源消耗加倍
        if (!consumeResources(entry.energyCost * 2, 0)) return false;
    } else {
        // 食物归零惩罚：归档能源消耗 +20%
        let foodPenalty = 0;
        if (MemorySanctuary.state.resources.food <= 0) {
            foodPenalty = Math.ceil(entry.energyCost * 0.2);
        }
        if (!consumeResources(entry.energyCost + foodPenalty, entry.dataCost)) return false;
        if (foodPenalty > 0) {
            addLog(`🍂 饥荒惩罚：归档能耗 +${foodPenalty}（食物耗尽）`, 'warning');
        }
    }
    
    // 紧急归档协议激活后立即关闭
    if (MemorySanctuary.state.emergencyArchiveActive) {
        MemorySanctuary.state.emergencyArchiveActive = false;
        addLog('📦 紧急归档协议已关闭（一次性效果已使用）。', 'system');
    }
    
    MemorySanctuary.state.completedArchives.push(archiveId);
    // 紧急归档不消耗介质，所以不增加 vaultUsage
    if (!isEmergencyArchive) {
        MemorySanctuary.state.vaultUsage[vault.id] = currentUsage + entry.dataCost;
    }
    advanceTime(1);
    
    addLog(`已完成归档："${entry.title}"`, 'success');
    
    // 音效：归档成功风铃
    if (typeof AudioSystem !== 'undefined') AudioSystem.playArchiveChime();
    
    // 守护者反应
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && entry.guardianReactions[guardianId]) {
        addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
        showGuardianDialogue(guardianId, 'archive');
    }
    
    // 归档后展示内容（根据设置决定是否显示）
    const settings = (typeof getSettings === 'function') ? getSettings() : { showResult: true };
    if (settings.showResult) {
        showArchiveCompleteModal(entry);
    }
    
    // 检查叙事线索链
    if (typeof checkNarrativeChains === 'function') checkNarrativeChains(archiveId);
    
    // 归档后可能触发事件
    if (typeof checkRandomEvent === 'function') checkRandomEvent();
    
    // 归档成功士气奖励
    applyArchiveMoraleBonus(entry);
    
    renderAll();
    return true;
}


function applyArchiveMoraleBonus(entry) {
    const state = MemorySanctuary.state;
    if (!state.guardianMoods) return;
    
    // 基础归档奖励：所有守护者 +0.5
    const baseGain = 0.5;
    Object.keys(state.guardianMoods).forEach(gid => {
        state.guardianMoods[gid] = Math.min(10, (state.guardianMoods[gid] || 0) + baseGain);
    });
    
    // 如果条目关联特定守护者，该守护者额外 +1
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && state.guardianMoods[guardianId] !== undefined) {
        state.guardianMoods[guardianId] = Math.min(10, state.guardianMoods[guardianId] + 1);
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
    
    content.innerHTML = contentText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>');
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
    
    // 检查叙事线索链
    if (typeof checkNarrativeChains === 'function') checkNarrativeChains(archiveId);
    
    renderAll();
    return true;
}


function buyInstantArchiveWithFood() {
    const state = MemorySanctuary.state;
    const cost = 30; // 30食物 = 1次机会
    if ((state.resources.food || 0) < cost) {
        addLog(`食物不足，需要 ${cost} 食物兑换1次立即归档机会。`, 'system');
        return false;
    }
    state.resources.food -= cost;
    state.instantArchiveChances++;
    addLog(`🍖 消耗 ${cost} 食物，获得1次立即归档机会（当前：${state.instantArchiveChances}次）。`, 'success');
    if (typeof AudioSystem !== 'undefined') AudioSystem.playExploreDeploy();
    renderAll();
    return true;
}


function closeConfirmModal(archiveId, confirmed) {
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
        archiveEntry(archiveId);
    }
}


function showArchiveCompleteModal(entry) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = `归档完成：${entry.title}`;
    
    let modalContent = `${entry.description}\n\n`;
    modalContent += `「${entry.content.substring(0, 120)}...」\n\n`;
    
    if (entry.guardianReactions) {
        const reactions = Object.entries(entry.guardianReactions);
        if (reactions.length > 0) {
            modalContent += `守护者反应：\n`;
            reactions.forEach(([guardian, reaction]) => {
                modalContent += `• ${getGuardianName(guardian)}：「${reaction}」\n`;
            });
        }
    }
    
    content.innerHTML = modalContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>');
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
    
    return true;
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
