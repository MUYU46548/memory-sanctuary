/**
 * game.js - 游戏核心逻辑
 * 资源管理、归档流程、存储室管理、事件系统
 */

// ==========================================
// 资源管理
// ==========================================

function consumeResources(energy, media) {
    const state = MemorySanctuary.state;
    
    if (state.resources.energy < energy) {
        addLog('能源不足，无法执行录入操作。', 'system');
        return false;
    }
    if (state.resources.media < media) {
        addLog('存储介质不足，无法执行录入操作。', 'system');
        return false;
    }
    
    state.resources.energy -= energy;
    state.resources.media -= media;
    return true;
}

function hasResources(energy, media) {
    const state = MemorySanctuary.state;
    return state.resources.energy >= energy && state.resources.media >= media;
}

function getResourceStatus() {
    const state = MemorySanctuary.state;
    return {
        energy: state.resources.energy,
        media: state.resources.media,
        environment: state.resources.environment
    };
}

// ==========================================
// 归档流程
// ==========================================

function getArchiveById(id) {
    return MemorySanctuary.data.archives.find(a => a.id === id) || null;
}

function getArchivesByVault(vaultId) {
    return MemorySanctuary.data.archives.filter(a => a.vault === vaultId);
}

function isArchiveCompleted(id) {
    return MemorySanctuary.state.completedArchives.includes(id);
}

function archiveEntry(archiveId) {
    const entry = getArchiveById(archiveId);
    
    if (!entry) {
        addLog(`错误：找不到条目 ${archiveId}`, 'system');
        return false;
    }
    
    if (isArchiveCompleted(archiveId)) {
        addLog(`条目 "${entry.title}" 已被归档。`, 'system');
        return false;
    }
    
    if (!hasResources(entry.energyCost, entry.dataCost)) {
        addLog(`资源不足，无法归档 "${entry.title}"。`, 'system');
        return false;
    }
    
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) {
        addLog(`错误：找不到存储室 ${entry.vault}`, 'system');
        return false;
    }
    
    const currentUsage = MemorySanctuary.state.vaultUsage[vault.id] || 0;
    if (currentUsage + entry.dataCost > vault.capacity) {
        addLog(`存储室 "${vault.name}" 容量不足。`, 'system');
        return false;
    }
    
    if (!consumeResources(entry.energyCost, entry.dataCost)) return false;
    
    MemorySanctuary.state.completedArchives.push(archiveId);
    MemorySanctuary.state.vaultUsage[vault.id] = currentUsage + entry.dataCost;
    advanceTime(1);
    
    addLog(`已完成归档："${entry.title}"`, 'success');
    
    // 守护者反应
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && entry.guardianReactions[guardianId]) {
        addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
        showGuardianDialogue(guardianId, 'archive');
    }
    
    showArchiveCompleteModal(entry);
    
    // 归档后可能触发事件
    if (typeof checkRandomEvent === 'function') checkRandomEvent();
    
    renderAll();
    return true;
}

// ==========================================
// 时间系统
// ==========================================

function advanceTime(weeks) {
    MemorySanctuary.state.week += weeks;
    MemorySanctuary.state.chapter = Math.ceil(MemorySanctuary.state.week / 4);
    onTimeAdvanced(weeks);
}

function onTimeAdvanced(weeks) {
    // 检查过期条目
    MemorySanctuary.data.archives.forEach(entry => {
        if (entry.expiresAfter && !isArchiveCompleted(entry.id) && !entry.expired) {
            const remaining = entry.expiresAfter - MemorySanctuary.state.week;
            if (remaining <= 0) {
                addLog(`条目 "${entry.title}" 已永久消失。`, 'system');
                entry.expired = true;
            } else if (remaining <= 4) {
                addLog(`警告："${entry.title}" 即将在 ${remaining} 周后消失。`, 'system');
            }
        }
    });
    
    // 环境稳定度自然下降
    const envDecay = weeks * 0.5;
    MemorySanctuary.state.resources.environment = Math.max(0, 
        MemorySanctuary.state.resources.environment - envDecay
    );
}

// ==========================================
// 存储室管理
// ==========================================

function getVaultStatus(vaultId) {
    const vault = MemorySanctuary.data.vaults.find(v => v.id === vaultId);
    if (!vault) return null;
    
    const used = MemorySanctuary.state.vaultUsage[vaultId] || 0;
    const percent = (used / vault.capacity) * 100;
    
    return { ...vault, used, percent: Math.min(100, percent) };
}

function selectVault(vaultId) {
    MemorySanctuary.currentVaultId = vaultId;
    renderAll();
}

// ==========================================
// 守护者系统
// ==========================================

function getGuardianById(id) {
    return MemorySanctuary.data.guardians.find(g => g.id === id) || null;
}

function getGuardianName(id) {
    const g = getGuardianById(id);
    return g ? g.name : id;
}

function showGuardianDialogue(guardianId, type) {
    const guardian = getGuardianById(guardianId);
    if (!guardian || !guardian.dialogues[type]) return;
    
    const dialogues = guardian.dialogues[type];
    const randomDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
    
    const nameEl = document.getElementById('guardian-name');
    const roleEl = document.getElementById('guardian-role');
    const dialogueEl = document.getElementById('guardian-dialogue');
    const avatarEl = document.getElementById('guardian-avatar');
    
    if (nameEl) nameEl.textContent = guardian.name;
    if (roleEl) roleEl.textContent = guardian.role;
    if (dialogueEl) dialogueEl.textContent = randomDialogue;
    if (avatarEl) avatarEl.textContent = guardian.avatar;
}

// ==========================================
// 事件系统
// ==========================================

function initEventSystem() {
    // 定期检查随机事件
    console.log('[事件系统] 初始化完成');
}

function checkRandomEvent() {
    if (MemorySanctuary.activeEvent) return; // 已有活跃事件
    
    const week = MemorySanctuary.state.week;
    const availableEvents = MemorySanctuary.data.events.filter(e => {
        if (MemorySanctuary.state.activeEventIds.includes(e.id)) return false;
        return week >= e.trigger.weekMin && week <= e.trigger.weekMax;
    });
    
    for (const event of availableEvents) {
        if (Math.random() < event.trigger.probability) {
            triggerEvent(event);
            break;
        }
    }
}

function triggerEvent(event) {
    MemorySanctuary.activeEvent = event;
    MemorySanctuary.state.activeEventIds.push(event.id);
    addLog(`突发事件：${event.title}`, 'event');
    renderEvent(event);
}

function renderEvent(event) {
    const panel = document.getElementById('event-panel');
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    
    if (!panel || !titleEl || !descEl || !choicesEl) return;
    
    titleEl.textContent = event.title;
    descEl.textContent = event.description;
    choicesEl.innerHTML = '';
    
    event.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'event-choice';
        btn.textContent = choice.text;
        btn.addEventListener('click', () => resolveEvent(index));
        choicesEl.appendChild(btn);
    });
    
    panel.classList.remove('hidden');
}

function resolveEvent(choiceIndex) {
    const event = MemorySanctuary.activeEvent;
    if (!event) return;
    
    const choice = event.choices[choiceIndex];
    
    // 应用效果
    if (choice.effect.energy) {
        MemorySanctuary.state.resources.energy = Math.max(0, 
            MemorySanctuary.state.resources.energy + choice.effect.energy);
    }
    if (choice.effect.media) {
        MemorySanctuary.state.resources.media = Math.max(0, 
            MemorySanctuary.state.resources.media + choice.effect.media);
    }
    if (choice.effect.environment) {
        MemorySanctuary.state.resources.environment = Math.max(0, 
            MemorySanctuary.state.resources.environment + choice.effect.environment);
    }
    if (choice.effect.time) {
        advanceTime(choice.effect.time);
    }
    
    addLog(`选择：${choice.text} —— ${choice.result}`, 'event');
    
    // 隐藏事件面板
    const panel = document.getElementById('event-panel');
    if (panel) panel.classList.add('hidden');
    
    MemorySanctuary.activeEvent = null;
    
    // 随机守护者回应
    const guardiansWithDialogue = MemorySanctuary.data.guardians.filter(g => g.dialogues.event);
    if (guardiansWithDialogue.length > 0) {
        const randomGuardian = guardiansWithDialogue[Math.floor(Math.random() * guardiansWithDialogue.length)];
        showGuardianDialogue(randomGuardian.id, 'event');
    }
    
    renderAll();
}

// ==========================================
// 日志系统
// ==========================================

function addLog(message, type = 'system') {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[第${MemorySanctuary.state.week}周] ${message}`;
    
    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;
    
    const entries = logContent.querySelectorAll('.log-entry');
    if (entries.length > 50) entries[0].remove();
}

// ==========================================
// 弹窗系统
// ==========================================

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
    
    content.textContent = modalContent;
    overlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('modal-close');
    closeBtn.onclick = () => overlay.classList.add('hidden');
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}
