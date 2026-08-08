/**
 * game.js - 游戏核心逻辑
 * 资源管理、归档流程、存储室管理、事件系统
 */

// ==========================================
// 资源管理
// ==========================================

function consumeResources(energy, media, food) {
    const state = MemorySanctuary.state;
    
    // 圣所衰竭：能源枯竭时消耗加倍
    const energyMultiplier = (state.deterioration && state.deterioration.energy) ? 2 : 1;
    const actualEnergy = energy * energyMultiplier;
    
    if (state.resources.energy < actualEnergy) {
        addLog('能源不足，无法执行录入操作。', 'system');
        return false;
    }
    if (state.resources.media < media) {
        addLog('存储介质不足，无法执行录入操作。', 'system');
        return false;
    }
    if (food && state.resources.food < food) {
        addLog('食物不足，无法执行操作。', 'system');
        return false;
    }
    
    state.resources.energy -= actualEnergy;
    state.resources.media -= media;
    if (food) state.resources.food -= food;
    return true;
}

function hasResources(energy, media, food) {
    const state = MemorySanctuary.state;
    const energyMultiplier = (state.deterioration && state.deterioration.energy) ? 2 : 1;
    if (food && state.resources.food < food) return false;
    return state.resources.energy >= energy * energyMultiplier && state.resources.media >= media;
}

function getResourceStatus() {
    const state = MemorySanctuary.state;
    return {
        energy: state.resources.energy,
        media: state.resources.media,
        environment: state.resources.environment,
        food: state.resources.food
    };
}

function adjustResource(resource, amount) {
    const state = MemorySanctuary.state;
    if (!state) return;
    
    const max = resource === 'media' ? 150 : (resource === 'food' ? 80 : 150);
    state.resources[resource] = Math.max(0, Math.min(max, state.resources[resource] + amount));
    
    // 资源变化后立即检查衰竭状态（勘探/事件奖励不推进时间）
    if (typeof checkSanctuaryDeterioration === 'function') checkSanctuaryDeterioration();
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
        if (!consumeResources(entry.energyCost, entry.dataCost)) return false;
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
    
    renderAll();
    return true;
}

// ==========================================
// 时间系统
// ==========================================

function advanceTime(weeks) {
    // 确保时间不会超过MAX_WEEK（在允许的范围内截断）
    const targetWeek = MemorySanctuary.state.week + weeks;
    if (targetWeek > MAX_WEEK) {
        weeks = Math.max(0, MAX_WEEK - MemorySanctuary.state.week);
    }
    if (weeks <= 0) return; // 已经到达上限，不再推进
    
    MemorySanctuary.state.week += weeks;
    MemorySanctuary.state.chapter = Math.ceil(MemorySanctuary.state.week / 4);
    onTimeAdvanced(weeks);
}

function onTimeAdvanced(weeks) {
    const state = MemorySanctuary.state;
    
    // 重置每回合资源变化追踪
    state.resourceChanges = { energy: 0, media: 0, environment: 0, food: 0 };
    
    // 资源自然衰减（生存压力核心）
    const decay = getWeeklyDecay();
    state.resources.energy = Math.max(0,
        state.resources.energy - decay.energy * weeks
    );
    state.resources.media = Math.max(0,
        state.resources.media - decay.media * weeks
    );
    state.resources.environment = Math.max(0,
        state.resources.environment - decay.environment * weeks
    );
    
    // 追踪衰减为负值
    state.resourceChanges.energy -= decay.energy * weeks;
    state.resourceChanges.media -= decay.media * weeks;
    state.resourceChanges.environment -= decay.environment * weeks;

    // 应用持续效果（如：每回合额外能源）
    applySustainedBonuses();
    
    // 腐败度系统：自然衰减 -2/周
    if (state.emergencyCorruption > 0) {
        state.emergencyCorruption = Math.max(0, state.emergencyCorruption - 2);
    }
    
    // 腐败度惩罚：每20点，所有资源额外 -0.5/周
    if (state.emergencyCorruption > 0) {
        const penalty = Math.floor(state.emergencyCorruption / 20) * 0.5;
        if (penalty > 0) {
            state.resources.energy = Math.max(0, state.resources.energy - penalty);
            state.resources.media = Math.max(0, state.resources.media - penalty);
            state.resources.environment = Math.max(0, state.resources.environment - penalty);
            state.resourceChanges.energy -= penalty;
            state.resourceChanges.media -= penalty;
            state.resourceChanges.environment -= penalty;
        }
    }
    
    // 更新应急协议冷却
    if (state.emergencyCooldowns) {
        Object.keys(state.emergencyCooldowns).forEach(key => {
            if (state.emergencyCooldowns[key] > 0) {
                state.emergencyCooldowns[key]--;
            }
        });
    }

    // 更新drone音量和终局心跳
    if (typeof AudioSystem !== 'undefined' && MemorySanctuary.state) {
        AudioSystem.updateDroneByEnergy(MemorySanctuary.state.resources.energy);
        AudioSystem.updateHeartbeat(MemorySanctuary.state.week);
        
        // 章节 BGM 自动切换：week >= 16 中期，week >= 36 后期
        const bgmWeek = MemorySanctuary.state.week;
        const bgmScene = AudioSystem.getGameBGMForWeek(bgmWeek);
        if (bgmScene !== AudioSystem.getCurrentBGM()) {
            AudioSystem.playBGM(bgmScene);
        }
    }

    // 检查过期条目（仅记录消失，警告移至聚合面板）
    MemorySanctuary.data.archives.forEach(entry => {
        if (entry.expiresAfter && !isArchiveCompleted(entry.id) && !entry.expired) {
            const effectiveExpiry = getEffectiveExpiryWeeks(entry);
            const remaining = effectiveExpiry - MemorySanctuary.state.week;
            if (remaining <= 0) {
                addLog(`条目 "${entry.title}" 已永久消失。`, 'system');
                entry.expired = true;
                if (typeof AudioSystem !== 'undefined') AudioSystem.playShatterSound();
            }
        }
    });

    // 检查圣所衰竭状态
    if (typeof checkSanctuaryDeterioration === 'function') checkSanctuaryDeterioration();
    
    // 处理调度事件（新增）
    if (typeof processScheduledEvents === 'function') processScheduledEvents();
    
    // 守护者主动事件
    if (typeof checkGuardianInitiative === 'function') checkGuardianInitiative();
    
    // 更新困局检测
    if (typeof checkStuckState === 'function') checkStuckState();
    
    // 检查章节过渡完成
    if (typeof checkChapterCompletion === 'function') checkChapterCompletion();
    
    // 检查失败条件
    if (typeof checkFailureCondition === 'function') checkFailureCondition();
    
    // 检查周数上限
    if (typeof checkWeekLimit === 'function') checkWeekLimit();
}

// ==========================================
// 持续效果系统（来自调度事件奖励）
// ==========================================

function applySustainedBonuses() {
    const state = MemorySanctuary.state;
    if (!state.unlockedBonuses) return;
    
    // 应用持续效果
    state.unlockedBonuses.forEach(bonus => {
        if (bonus === 'energy_per_turn_3') {
            state.resources.energy = Math.min(150, state.resources.energy + 3);
        } else if (bonus === 'energy_per_turn_2') {
            state.resources.energy = Math.min(150, state.resources.energy + 2);
        }
    });

    // 处理持续效果（如 foodBoostOverTime）
    processOngoingEffects();
}

function processOngoingEffects() {
    const state = MemorySanctuary.state;
    if (!state.ongoingEffects || state.ongoingEffects.length === 0) return;
    
    const stillActive = [];
    for (const effect of state.ongoingEffects) {
        if (effect.remainingTurns <= 0) continue;
        
        // 应用效果
        if (effect.resource && effect.amount) {
            const cap = effect.resource === 'media' ? 60 : (effect.resource === 'food' ? 80 : 100);
            state.resources[effect.resource] = Math.min(cap, state.resources[effect.resource] + effect.amount);
            state.resourceChanges[effect.resource] = (state.resourceChanges[effect.resource] || 0) + effect.amount;
        }
        
        effect.remainingTurns--;
        if (effect.remainingTurns > 0) {
            stillActive.push(effect);
        } else {
            addLog(`🌱 持续效果结束：${effect.type}`, 'event');
        }
    }
    state.ongoingEffects = stillActive;
}

// ==========================================
// 调度事件系统
// ==========================================

function processScheduledEvents() {
    const state = MemorySanctuary.state;
    if (!state.scheduledEvents || state.scheduledEvents.length === 0) return;
    
    const currentWeek = state.week;
    const triggeredEvents = [];
    const remainingEvents = [];
    
    // 找出本周需要触发的事件
    for (const scheduled of state.scheduledEvents) {
        if (currentWeek >= scheduled.week) {
            triggeredEvents.push(scheduled);
        } else {
            remainingEvents.push(scheduled);
        }
    }
    
    // 更新调度列表（移除已触发的）
    state.scheduledEvents = remainingEvents;
    
    // 触发事件
    for (const scheduled of triggeredEvents) {
        triggerScheduledEvent(scheduled.eventId);
    }
}

function triggerScheduledEvent(eventId) {
    const scheduledEvents = MemorySanctuary.data.scheduledEvents || [];
    const event = scheduledEvents.find(e => e.id === eventId);
    
    if (!event) {
        console.warn(`[调度事件] 找不到事件 ${eventId}`);
        return;
    }
    
    // 如果已有活跃事件，将调度事件推迟到下周
    if (MemorySanctuary.activeEvent) {
        const state = MemorySanctuary.state;
        if (!state.scheduledEvents) state.scheduledEvents = [];
        state.scheduledEvents.push({ eventId, week: state.week + 1 });
        console.log(`[调度事件] ${event.title} 因已有活跃事件而推迟到下周`);
        return;
    }
    
    // 使用与随机事件相同的触发机制
    MemorySanctuary.activeEvent = event;
    MemorySanctuary.state.activeEventIds.push(event.id);
    addLog(`📅 ${event.title}`, 'event');
    renderEvent(event);
}

// ==========================================
// 资源自然衰减 & 圣所衰竭系统
// ==========================================

function getWeeklyDecay() {
    const state = MemorySanctuary.state;
    let multiplier = 1;
    
    // 当两种资源已归零时，剩余资源加速衰减
    const res = state.resources;
    let zeroCount = 0;
    if (res.energy <= 0) zeroCount++;
    if (res.media <= 0) zeroCount++;
    if (res.environment <= 0) zeroCount++;
    
    if (zeroCount >= 2) {
        multiplier = 2; // 已衰竭两种资源，剩余资源加速衰减
    }
    
    return { energy: 1.0 * multiplier, media: 0.5 * multiplier, environment: 0.5 * multiplier };
}

function getEffectiveExpiryWeeks(entry) {
    // 环境归零时过期速度翻倍
    if (MemorySanctuary.state.resources.environment <= 0) {
        return Math.ceil(entry.expiresAfter / 2);
    }
    return entry.expiresAfter;
}

function checkSanctuaryDeterioration() {
    const res = MemorySanctuary.state.resources;
    const state = MemorySanctuary.state;
    
    if (!state.deterioration) {
        state.deterioration = { energy: false, media: false, environment: false };
    }
    const det = state.deterioration;
    
    // 能源归零 → 归档消耗加倍
    if (res.energy <= 0 && !det.energy) {
        det.energy = true;
        addLog('⚠️ 圣所衰竭：能源枯竭，录入能耗加倍。', 'system');
        if (typeof AudioSystem !== 'undefined') AudioSystem.playAlertTone();
    } else if (res.energy > 0 && det.energy) {
        det.energy = false;
        addLog('能源已恢复，录入效率恢复正常。', 'system');
    }
    
    // 介质归零 → 无法录入
    if (res.media <= 0 && !det.media) {
        det.media = true;
        addLog('⚠️ 圣所衰竭：存储介质耗尽，无法录入新条目。', 'system');
        if (typeof AudioSystem !== 'undefined') AudioSystem.playAlertTone();
    } else if (res.media > 0 && det.media) {
        det.media = false;
        addLog('存储介质已补充，录入系统恢复。', 'system');
    }
    
    // 环境归零 → 过期加速
    if (res.environment <= 0 && !det.environment) {
        det.environment = true;
        addLog('⚠️ 圣所衰竭：环境失控，条目过期速度翻倍。', 'system');
        if (typeof AudioSystem !== 'undefined') AudioSystem.playAlertTone();
    } else if (res.environment > 0 && det.environment) {
        det.environment = false;
        addLog('环境控制系统恢复，条目保存条件改善。', 'system');
    }
}

// ==========================================
// 困局检测 & 横幅提醒
// ==========================================

function checkStuckState() {
    const state = MemorySanctuary.state;
    const archives = MemorySanctuary.data.archives;
    const week = state.week;
    
    // Ensure banner exists
    let banner = document.getElementById('stuck-banner');
    if (!banner) {
        initStuckBanner();
        banner = document.getElementById('stuck-banner');
    }
    if (!banner) return;
    
    // Count currently visible entries (appeared and not expired)
    const visible = archives.filter(a => 
        a.availableAfter <= week && !isArchiveCompleted(a.id) && !a.expired
    );
    
    // Count actionable entries (visible + has resources)
    const actionable = visible.filter(a => 
        hasResources(a.energyCost, a.dataCost)
    ).length;
    
    // Count entries that could be archived if we had resources (only currently visible)
    const potential = visible.filter(a => !isArchiveCompleted(a.id)).length;
    
    // Check if player is stuck (no actionable entries, but potential exists)
    const isStuck = actionable === 0 && potential > 0;
    
    // Check if all entries are done
    const allDone = potential === 0;
    
    // Show/hide banner
    if (allDone) {
        banner.innerHTML = `<span>🎉 所有条目已处理完毕！可以封印圣所了。</span>`;
        banner.className = 'stuck-banner success';
    } else if (isStuck) {
        const lowEnergy = state.resources.energy <= 0;
        const lowMedia = state.resources.media <= 0;
        let reason = '';
        if (lowEnergy && lowMedia) reason = '能源与介质均已耗尽';
        else if (lowEnergy) reason = '能源已耗尽';
        else if (lowMedia) reason = '介质已耗尽';
        else reason = '资源不足以归档任何条目';
        
        banner.innerHTML = `
            <span>⚠️ ${reason}。</span>
            <span>可选择<a href="#" id="stuck-skip">跳过回合</a>恢复资源，或<a href="#" id="stuck-seal">封印圣所</a>结束游戏。</span>
        `;
        banner.className = 'stuck-banner warning';
        
        // Bind events immediately (DOM is already updated via innerHTML)
        const skipLink = document.getElementById('stuck-skip');
        const sealLink = document.getElementById('stuck-seal');
        if (skipLink) {
            skipLink.onclick = (e) => { e.preventDefault(); skipTurn(true); };
        }
        if (sealLink) {
            sealLink.onclick = (e) => { e.preventDefault(); if (canSealSanctuary()) sealSanctuary(); };
        }
    } else {
        banner.className = 'stuck-banner hidden';
    }
}

function initStuckBanner() {
    // Create stuck banner if it doesn't exist
    let banner = document.getElementById('stuck-banner');
    if (!banner && MemorySanctuary.state) {
        banner = document.createElement('div');
        banner.id = 'stuck-banner';
        banner.className = 'stuck-banner hidden';
        
        // Insert after top bar
        const topBar = document.getElementById('top-bar');
        if (topBar && topBar.parentNode) {
            topBar.parentNode.insertBefore(banner, topBar.nextSibling);
        }
    }
}

// ==========================================
// 失败条件 & 周数上限
// ==========================================

const MAX_WEEK = 48;

function checkFailureCondition() {
    if (MemorySanctuary.state.gameOver) return;
    
    const res = MemorySanctuary.state.resources;
    
    // 失败条件：两种资源归零即崩溃（食物不直接导致崩溃，但会触发饥饿惩罚）
    let zeroCount = 0;
    if (res.energy <= 0) zeroCount++;
    if (res.media <= 0) zeroCount++;
    if (res.environment <= 0) zeroCount++;
    
    if (zeroCount >= 2) {
        triggerGameOver('collapse');
    }
    
    // 食物饥饿惩罚
    if (typeof checkStarvation === 'function') checkStarvation();
}

function checkStarvation() {
    const state = MemorySanctuary.state;
    if (state.resources.food <= 0) {
        // 食物耗尽时：守护者每回合心情 -2
        if (!state.starvationLogged) {
            addLog('食物耗尽...守护者士气低沉。', 'warning');
            state.starvationLogged = true;
        }
        Object.keys(state.guardianMoods || {}).forEach(gid => {
            state.guardianMoods[gid] = (state.guardianMoods[gid] || 0) - 2;
        });
    } else {
        state.starvationLogged = false;
    }
}

function checkWeekLimit() {
    if (MemorySanctuary.state.gameOver) return;
    
    // 周数上限：达到MAX_WEEK周自动终局
    if (MemorySanctuary.state.week >= MAX_WEEK) {
        triggerGameOver('timeup');
    }
}

function triggerGameOver(reason) {
    MemorySanctuary.state.gameOver = true;

    // 时间至 → 直接封印圣所（走完整结局流程）
    if (reason === 'timeup') {
        sealSanctuary();
        return;
    }

    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    let titleText = '圣所已崩溃';
    let contentText = '能源、介质与环境稳定度全部归零。\n\n圣所的系统一个接一个地停止了运转。最后的灯光熄灭，空气变得沉默。\n\n你未能保存萨拉达斯的遗产。后世将永远不知道这里曾存在过一个文明。\n\n「我们曾存在，但没有人记得。」';

    const archivedCount = MemorySanctuary.state.completedArchives.length;
    const totalCount = MemorySanctuary.data.archives.length;
    contentText += `\n\n最终统计：\n`;
    contentText += `• 运行周数：${MemorySanctuary.state.week} 周\n`;
    contentText += `• 归档条目：${archivedCount} / ${totalCount}\n`;
    contentText += `• 文明完整度：${Math.round((archivedCount / totalCount) * 100)}%\n`;

    // ─── 崩溃结局：走 VN 演出 ───
    if (reason === 'collapse') {
        // 检查是否有可触发的结局
        const ending = (typeof checkHiddenEndings === 'function') ? checkHiddenEndings() : null;
        const endingSceneId = ending ? ending.id : 'silent_sanctuary';
        const hasVNScene = (typeof VN !== 'undefined' && VN.getEndingScene(endingSceneId));

        // 先关闭可能存在的 modal
        overlay.classList.add('hidden');

        if (hasVNScene) {
            // VN.showEnding 内部会播放对应 BGM
            VN.showEnding(endingSceneId, () => {
                const modalContent = getEndingModalData(ending);
                showSealModalWithContent(modalContent, ending, true);
            });
        } else {
            // 无 VN 场景 → 播放 ending_normal BGM，直接显示统计 modal
            if (typeof AudioSystem !== 'undefined') {
                const ngData = (typeof getNGPlusData === 'function') ? getNGPlusData() : {};
                const isTrueEnding = ngData.playthroughCount >= 5 && MemorySanctuary.state.pendingEnding === 'true_ending';
                AudioSystem.playBGM(isTrueEnding ? 'ending_true' : 'ending_normal');
            }

            contentText += `\n点击「返回标题」重新开始。`;
            title.textContent = titleText;
            content.innerHTML = contentText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>');
            overlay.classList.remove('hidden');

            if (closeBtn) {
                closeBtn.textContent = '返回标题';
                closeBtn.onclick = () => {
                    overlay.classList.add('hidden');
                    showTitleScreen();
                };
            }
        }

        // 记录成就
        if (typeof checkSealAchievements === 'function') {
            checkSealAchievements(ending ? ending.id : null, MemorySanctuary.state.week);
        }
        return;
    }

    // ─── 时间耗尽结局：直接跳转到结算页面 ───
    if (reason === 'timeup') {
        sealSanctuary();
        return;
    }

    title.textContent = titleText;
    content.innerHTML = contentText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>');
    overlay.classList.remove('hidden');

    if (closeBtn) {
        closeBtn.textContent = '返回标题';
        closeBtn.onclick = () => {
            overlay.classList.add('hidden');
            showTitleScreen();
        };
    }
}

// ==========================================
// 事件结果反馈（长期影响）
// ==========================================

function applyEventFeedback(choiceIndex) {
    const event = MemorySanctuary.activeEvent;
    if (!event) return;
    
    const choice = event.choices[choiceIndex];
    if (!choice.feedback) return;
    
    // 应用长期效果
    if (choice.feedback.narrativeFlag) {
        MemorySanctuary.state.narrativeFlags.push(choice.feedback.narrativeFlag);
    }
    
    if (choice.feedback.guardianMood) {
        if (!MemorySanctuary.state.guardianMoods) {
            MemorySanctuary.state.guardianMoods = {};
        }
        for (const [guardianId, delta] of Object.entries(choice.feedback.guardianMood)) {
            MemorySanctuary.state.guardianMoods[guardianId] = 
                (MemorySanctuary.state.guardianMoods[guardianId] || 0) + delta;
        }
    }
    
    if (choice.feedback.futureEvent) {
        if (!MemorySanctuary.state.scheduledEvents) {
            MemorySanctuary.state.scheduledEvents = [];
        }
        // 计算绝对周数（当前周 + 延迟周数）
        const targetWeek = MemorySanctuary.state.week + choice.feedback.futureEvent.week;
        MemorySanctuary.state.scheduledEvents.push({
            week: targetWeek,
            eventId: choice.feedback.futureEvent.eventId
        });
    }
    
    // 解锁持续效果
    if (choice.feedback.unlockBonus) {
        if (!MemorySanctuary.state.unlockedBonuses) {
            MemorySanctuary.state.unlockedBonuses = [];
        }
        MemorySanctuary.state.unlockedBonuses.push(choice.feedback.unlockBonus);
        addLog(`🔓 解锁持续效果：${choice.feedback.unlockBonus}`, 'success');
    }

    // 处理特殊持续效果（如 foodBoostOverTime）
    if (choice.feedback.specialEffect) {
        const se = choice.feedback.specialEffect;
        if (!MemorySanctuary.state.ongoingEffects) {
            MemorySanctuary.state.ongoingEffects = [];
        }
        if (se.type === 'foodBoostOverTime') {
            MemorySanctuary.state.ongoingEffects.push({
                type: 'foodBoostOverTime',
                resource: 'food',
                amount: se.amount || 5,
                remainingTurns: se.duration || 3,
                source: event.id
            });
            addLog(`🌱 持续效果：每回合 +${se.amount || 5} 食物，持续 ${se.duration || 3} 回合`, 'success');
        }
    }
    
    // 显示反馈
    if (choice.feedback.message) {
        addLog(`📜 ${choice.feedback.message}`, 'event');
    }
}

// ==========================================
// 归档确认弹窗
// ==========================================

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
            // 保存到设置系统
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
    
    // 修改关闭按钮为"取消"
    if (closeBtn) {
        closeBtn.textContent = '取消';
        closeBtn.onclick = () => {
            closeConfirmModal(archiveId, false);
        };
    }
    
    content.appendChild(confirmContainer);
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

// ==========================================
// 跳过回合（横幅提醒版）
// ==========================================

function skipTurn(forceFromStuck = false) {
    if (MemorySanctuary.activeEvent) {
        // 困局跳过：允许玩家在被事件阻塞时仍能跳过恢复资源
        if (forceFromStuck) {
            // 关闭当前事件面板，清空 activeEvent（玩家选择跳过事件）
            const panel = document.getElementById('event-panel');
            if (panel) panel.classList.add('hidden');
            MemorySanctuary.activeEvent = null;
            addLog('你强行跳过当前事件，让圣所进入低功耗维护模式。', 'warning');
        } else {
            // 如果事件面板已隐藏，先打开它让玩家看到
            const panel = document.getElementById('event-panel');
            if (panel && panel.classList.contains('hidden')) {
                panel.classList.remove('hidden');
                renderEvent(MemorySanctuary.activeEvent);
            }
            showSkipBlockedBanner();
            return false;
        }
    }
    
    // 游戏结束后不能跳过
    if (MemorySanctuary.state.gameOver) {
        return false;
    }
    
    // 达到周数上限后不能跳过
    if (MemorySanctuary.state.week >= MAX_WEEK) {
        checkWeekLimit();
        return false;
    }
    
    addLog('你决定跳过这一回合，让圣所进入低功耗维护模式。', 'system');
    
    // 恢复资源
    const state = MemorySanctuary.state;
    state.resources.energy = Math.min(150, state.resources.energy + 18);
    state.resources.media = Math.min(150, state.resources.media + 12);
    state.resources.environment = Math.min(100, state.resources.environment + 8);
    
    addLog('维护完成：能源+18，介质+12，环境+8。', 'success');
    
    // 推进时间（触发衰减检查）
    advanceTime(1);
    
    // 检查事件（包括章节过渡VN）
    if (typeof checkRandomEvent === 'function') checkRandomEvent();
    
    // 守护者可能对此有反应
    const guardians = MemorySanctuary.data.guardians;
    const randomGuardian = guardians[Math.floor(Math.random() * guardians.length)];
    const skipDialogues = [
        '短暂的休憩……也许这是明智的。',
        '时间紧迫，但喘息也是必要的。',
        '让我们继续吧。',
        '休息是为了走得更远。',
        '愿这一刻的停顿不是遗憾。'
    ];
    const dialogue = skipDialogues[Math.floor(Math.random() * skipDialogues.length)];
    addLog(`${randomGuardian.name}：「${dialogue}」`, 'guardian');
    
    // 跳过代价：30%概率守护者好感度-1
    if (Math.random() < 0.3) {
        const unluckyGuardian = guardians[Math.floor(Math.random() * guardians.length)];
        adjustGuardianMood(unluckyGuardian.id, -1);
        const complainDialogues = [
            '我们不应该浪费时间的……',
            '这一刻本可以用来保存更多的记忆。',
            '我理解你的选择，但我无法赞同。',
            '圣所的时间是有限的……',
            '希望这不是一次错误的决定。'
        ];
        const complain = complainDialogues[Math.floor(Math.random() * complainDialogues.length)];
        addLog(`${unluckyGuardian.name}：「${complain}」`, 'guardian');
        if (typeof AudioSystem !== 'undefined') AudioSystem.playAlertTone();
    }
    
    renderAll();
    return true;
}

function showSkipBlockedBanner() {
    const banner = document.getElementById('stuck-banner');
    if (banner) {
        // 如果事件面板已隐藏，自动打开它而不是显示空提示
        const eventPanel = document.getElementById('event-panel');
        const event = MemorySanctuary.activeEvent;
        if (event && eventPanel && eventPanel.classList.contains('hidden')) {
            eventPanel.classList.remove('hidden');
            renderEvent(event);
        }
        banner.innerHTML = `<span>⚠️ 当前有未处理的突发事件，无法跳过。请先处理事件。</span>`;
        banner.className = 'stuck-banner warning';
        setTimeout(() => {
            if (typeof checkStuckState === 'function') checkStuckState();
        }, 3000);
    }
}

function initSkipTurn() {
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            skipTurn();
        });
    }
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
    if (!guardian) return;
    
    let dialogues;
    // Use mood-based dialogue for idle type
    if (type === 'idle' && guardian.moodDialogues) {
        dialogues = getMoodDialogue(guardianId);
    } else if (guardian.dialogues[type]) {
        dialogues = guardian.dialogues[type];
    } else {
        return;
    }
    
    const randomDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
    
    const nameEl = document.getElementById('guardian-name');
    const roleEl = document.getElementById('guardian-role');
    const dialogueEl = document.getElementById('guardian-dialogue');
    const avatarEl = document.getElementById('guardian-avatar');
    const moodEl = document.getElementById('guardian-mood');
    const panelEl = document.getElementById('guardian-panel');
    
    if (nameEl) nameEl.textContent = guardian.name;
    if (roleEl) roleEl.textContent = guardian.role;
    if (dialogueEl) dialogueEl.textContent = randomDialogue;
    if (avatarEl) avatarEl.textContent = guardian.avatar;
    if (moodEl) {
        moodEl.textContent = getMoodIndicator(guardianId);
        // 更新面板边框颜色
        const tier = getMoodTier(guardianId);
        moodEl.className = 'guardian-mood mood-' + tier;
    }
    if (panelEl) {
        // 移除旧的好感度类
        panelEl.classList.remove('mood-hostile', 'mood-cold', 'mood-neutral', 'mood-friendly', 'mood-intimate');
        panelEl.classList.add('mood-' + getMoodTier(guardianId));
    }
}

// ==========================================
// 守护者好感度系统
// ==========================================

function getMoodLevel(guardianId) {
    if (!MemorySanctuary.state.guardianMoods) return 0;
    return MemorySanctuary.state.guardianMoods[guardianId] || 0;
}

function getMoodTier(guardianId) {
    const mood = getMoodLevel(guardianId);
    if (mood <= -3) return 'hostile';
    if (mood < 0) return 'cold';
    if (mood <= 2) return 'neutral';
    if (mood <= 4) return 'friendly';
    return 'intimate';
}

function getMoodIndicator(guardianId) {
    const mood = getMoodLevel(guardianId);
    if (mood <= -3) return '💔';
    if (mood < 0) return '💙';
    if (mood <= 2) return '🤍';
    if (mood <= 4) return '💛';
    return '❤️';
}

function getMoodDialogue(guardianId) {
    const guardian = getGuardianById(guardianId);
    if (!guardian || !guardian.moodDialogues) {
        return guardian?.dialogues?.idle || ['……'];
    }
    const tier = getMoodTier(guardianId);
    
    // NG+ dialogues: playthrough >= 2 and mood tier is friendly or intimate
    const ngData = getNGPlusData();
    if (ngData.playthroughCount >= 2 && tier !== 'hostile' && tier !== 'cold' && tier !== 'neutral') {
        if (guardian.ngPlusDialogues) {
            const pt = ngData.playthroughCount;
            let key = 'playthrough_5';
            if (pt <= 2) key = 'playthrough_2';
            else if (pt === 3) key = 'playthrough_3';
            else if (pt === 4) key = 'playthrough_4';
            if (guardian.ngPlusDialogues[key]) {
                return [guardian.ngPlusDialogues[key]];
            }
        }
    }
    
    // Finale dialogues: week >= 30 and mood tier is friendly or intimate
    if (MemorySanctuary.state.week >= 30 && tier !== 'hostile' && tier !== 'cold' && tier !== 'neutral') {
        if (guardian.finaleDialogues && guardian.finaleDialogues[tier]) {
            return guardian.finaleDialogues[tier];
        }
    }
    
    // Memory dialogues: cross-playthrough recognition
    if (ngData.playthroughCount >= 2 && guardian.memoryDialogues) {
        // Week 1 of new playthrough
        if (MemorySanctuary.state.week === 1) {
            if (ngData.playthroughCount >= 5 && guardian.memoryDialogues.week1_playthrough5) {
                return [guardian.memoryDialogues.week1_playthrough5];
            } else if (ngData.playthroughCount >= 3 && guardian.memoryDialogues.week1_playthrough3) {
                return [guardian.memoryDialogues.week1_playthrough3];
            } else if (guardian.memoryDialogues.week1_playthrough2) {
                return [guardian.memoryDialogues.week1_playthrough2];
            }
        }
    }

    return guardian.moodDialogues[tier] || guardian.dialogues.idle || ['……'];
}

function getMoodColorClass(guardianId) {
    const tier = getMoodTier(guardianId);
    return 'mood-' + tier;
}

function adjustGuardianMood(guardianId, delta) {
    if (!MemorySanctuary.state.guardianMoods) {
        MemorySanctuary.state.guardianMoods = {};
    }
    MemorySanctuary.state.guardianMoods[guardianId] = 
        (MemorySanctuary.state.guardianMoods[guardianId] || 0) + delta;
}

// ==========================================
// 守护者互动增强
// ==========================================

function initGuardianInteraction() {
    const avatar = document.getElementById('guardian-avatar');
    const menu = document.getElementById('guardian-menu');
    const talkBtn = document.getElementById('guardian-talk');
    const recommendBtn = document.getElementById('guardian-recommend');
    
    // 点击头像展开菜单
    if (avatar && menu) {
        avatar.style.cursor = 'pointer';
        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
    }
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        if (menu) menu.classList.add('hidden');
    });
    
    if (menu) {
        menu.addEventListener('click', (e) => e.stopPropagation());
    }
    
    // 交谈按钮
    if (talkBtn) {
        talkBtn.addEventListener('click', () => {
            const currentGuardian = getCurrentGuardianId();
            const guardian = getGuardianById(currentGuardian);
            if (!guardian) return;
            
            // Get dialogue text
            let dialogues;
            if (guardian.moodDialogues) {
                dialogues = getMoodDialogue(currentGuardian);
            } else if (guardian.dialogues && guardian.dialogues.idle) {
                dialogues = guardian.dialogues.idle;
            } else {
                dialogues = ['……'];
            }
            const text = dialogues[Math.floor(Math.random() * dialogues.length)];
            
            // Check if VN mode is enabled for guardian dialogue
            const settings = (typeof getSettings === 'function') ? getSettings() : { vnGuardianDialogue: true };
            if (settings.vnGuardianDialogue && typeof VN !== 'undefined') {
                VN.showQuickDialogue(currentGuardian, text, () => {
                    // After VN, update the guardian panel text
                    const dialogueEl = document.getElementById('guardian-dialogue');
                    if (dialogueEl) dialogueEl.textContent = text;
                });
            } else {
                showGuardianDialogue(currentGuardian, 'idle');
            }
            
            menu.classList.add('hidden');
        });
    }
    
    // 推荐归档按钮
    if (recommendBtn) {
        recommendBtn.addEventListener('click', () => {
            guardianRecommendArchive();
            menu.classList.add('hidden');
        });
    }
    
    // 详情按钮
    const detailBtn = document.getElementById('guardian-detail');
    if (detailBtn) {
        detailBtn.addEventListener('click', () => {
            toggleGuardianDetail();
            menu.classList.add('hidden');
        });
    }
}

function getCurrentGuardianId() {
    const nameEl = document.getElementById('guardian-name');
    if (!nameEl) return 'tika';
    
    const name = nameEl.textContent;
    const guardian = MemorySanctuary.data.guardians.find(g => g.name === name);
    return guardian ? guardian.id : 'tika';
}

function guardianRecommendArchive() {
    const guardianId = getCurrentGuardianId();
    const guardian = getGuardianById(guardianId);
    if (!guardian) return;
    
    // 根据守护者技能推荐对应存储室的条目
    const skillVaultMap = {
        'languages': 1,
        'history': 1,
        'law': 2,
        'ecology': 3,
        'exploration': 3,
        'engineering': 2,
        'religion': 3,
        'philosophy': 3
    };
    
    // 找到守护者技能对应的存储室
    let targetVault = null;
    for (const skill of guardian.skills) {
        if (skillVaultMap[skill]) {
            targetVault = skillVaultMap[skill];
            break;
        }
    }
    
    // 获取该存储室未归档的条目
    const entries = getArchivesByVault(targetVault || MemorySanctuary.currentVaultId);
    const unarchived = entries.filter(e => !isArchiveCompleted(e.id) && !e.expired);
    
    if (unarchived.length === 0) {
        addLog(`${guardian.name}：「当前存储室已无待归档条目。」`, 'guardian');
        showGuardianDialogue(guardianId, 'idle');
        return;
    }
    
    // 好感度 >=3 时，优先推荐叙事价值高的条目（成本高的）
    // 否则推荐成本最低的
    const mood = getMoodLevel(guardianId);
    let recommended;
    if (mood >= 3) {
        // 高好感度：推荐最"珍贵"的条目（成本最高）
        recommended = unarchived.sort((a, b) => (b.energyCost + b.dataCost) - (a.energyCost + a.dataCost))[0];
    } else {
        // 默认：推荐成本最低的
        recommended = unarchived.sort((a, b) => (a.energyCost + a.dataCost) - (b.energyCost + b.dataCost))[0];
    }
    
    // 高亮推荐条目
    highlightRecommendedEntry(recommended.id);
    
    // 守护者对话
    const recommendDialogues = {
        'tika': `我建议优先录入「${recommended.title}」——语言是文明的根基。`,
        'finn': `从历史价值来看，「${recommended.title}」值得优先保存。`,
        'misha': `「${recommended.title}」——这段记忆不应该被遗忘。`,
        'lorn': `系统建议：优先录入「${recommended.title}」，资源效率最优。`,
        'ethel': `「${recommended.title}」——它承载着我们的信仰与尊严。`
    };
    
    addLog(`${guardian.name}：「${recommendDialogues[guardianId] || '这个条目值得保存。'}」`, 'guardian');
    
    // 更新守护者面板对话
    const dialogueEl = document.getElementById('guardian-dialogue');
    if (dialogueEl) dialogueEl.textContent = recommendDialogues[guardianId] || '这个条目值得保存。';
}

function highlightRecommendedEntry(archiveId) {
    // 切换到对应存储室
    const entry = getArchiveById(archiveId);
    if (!entry) return;
    
    if (MemorySanctuary.currentVaultId !== entry.vault) {
        selectVault(entry.vault);
    }
    
    // 等待渲染后高亮
    setTimeout(() => {
        const btn = document.querySelector(`button[data-archive-id="${archiveId}"]`);
        if (btn) {
            btn.classList.add('recommended');
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 3秒后移除高亮
            setTimeout(() => btn.classList.remove('recommended'), 3000);
        }
    }, 100);
}

// 守护者主动事件
function checkGuardianInitiative() {
    if (MemorySanctuary.activeEvent) return;
    if (MemorySanctuary.state.week < 3) return;
    
    // 每5-8周可能触发一次守护者主动事件
    if (MemorySanctuary.state.week % 6 !== 0) return;
    
    // 好感度 >=2 时，触发概率从 35% 提升至 50%
    const state = MemorySanctuary.state;
    let triggerChance = 0.35;
    
    // 检查是否有高好感度的守护者
    if (state.guardianMoods) {
        const hasHighMood = Object.values(state.guardianMoods).some(mood => mood >= 2);
        if (hasHighMood) {
            triggerChance = 0.50;
        }
    }
    
    // 后期章节提升触发概率
    if (state.week >= 30) {
        triggerChance = Math.min(0.6, triggerChance + 0.15);
    }
    
    if (Math.random() > triggerChance) return;
    
    const guardianEvents = [
        {
            guardianId: 'tika',
            title: '缇卡的请求',
            description: '缇卡希望录入一段她刚回忆起的古老歌谣——关于星辰起源的叙事诗。',
            dialogue: '「我刚刚想起了小时候祖母唱的歌……让我把它记录下来吧。」',
            reward: { media: 5 },
            archiveId: 'arch_001'
        },
        {
            guardianId: 'finn',
            title: '芬恩的发现',
            description: '芬恩在旧档案中发现了一份被遗忘的附录，补充了《共享公约》的立法背景。',
            dialogue: '「这份附录能帮助我们理解当时的立法者面临的困境……」',
            reward: { energy: 5 },
            archiveId: 'arch_004'
        },
        {
            guardianId: 'misha',
            title: '米莎的勘探报告',
            description: '米莎从地表带回了一份完整的植物标本数据，记录了最后一片森林的消亡。',
            dialogue: '「这是最后的证据……证明这里曾经有生命。」',
            reward: { media: 8 },
            archiveId: 'arch_008'
        },
        {
            guardianId: 'lorn',
            title: '洛恩的维护成果',
            description: '洛恩优化了发电机效率，本周能源产出增加。',
            dialogue: '「机器老了，但还能撑一撑。」',
            reward: { energy: 8 },
            archiveId: null
        },
        {
            guardianId: 'ethel',
            title: '埃塞尔的祈祷',
            description: '埃塞尔完成了本周的圣所净化仪式，环境稳定度略有恢复。',
            dialogue: '「愿这片土地安息。」',
            reward: { environment: 6 },
            archiveId: null
        }
    ];
    
    // Late-game variant events (week >= 30)
    if (state.week >= 30) {
        const lateGameEvents = [
            {
                guardianId: 'tika',
                title: '缇卡的最后歌谣',
                description: '缇卡想录制她这辈子最重要的歌——一首关于文明终结的挽歌。',
                dialogue: '「这首歌……我写了很久。也许这是最后一首了。」',
                reward: { media: 12 },
                archiveId: 'arch_001'
            },
            {
                guardianId: 'finn',
                title: '芬恩的最终编年',
                description: '芬恩决定整理一份完整的文明编年史，作为最后的记录。',
                dialogue: '「如果只有一份文档能留存，应该是这个。」',
                reward: { energy: 10 },
                archiveId: 'arch_emergency_004'
            },
            {
                guardianId: 'misha',
                title: '米莎的最后标本',
                description: '米莎收集了最后一批地表标本，记录了生态完全崩溃前的状态。',
                dialogue: '「森林没了，海洋灰了。但至少……我记得它们。」',
                reward: { media: 15 },
                archiveId: 'arch_008'
            }
        ];
        guardianEvents.push(...lateGameEvents);
    }
    
    const event = guardianEvents[Math.floor(Math.random() * guardianEvents.length)];
    triggerGuardianInitiative(event);
}

function triggerGuardianInitiative(event) {
    const guardian = getGuardianById(event.guardianId);
    if (!guardian) return;
    
    // 更新守护者面板
    showGuardianDialogue(event.guardianId, 'event');
    
    // 显示事件面板
    const panel = document.getElementById('event-panel');
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    
    if (!panel || !titleEl || !descEl || !choicesEl) return;
    
    titleEl.textContent = event.title;
    descEl.textContent = event.description;
    choicesEl.innerHTML = '';
    
    // 接受按钮
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'event-choice';
    acceptBtn.textContent = '接受';
    acceptBtn.addEventListener('click', () => {
        // 应用奖励
        if (event.reward.energy) {
            MemorySanctuary.state.resources.energy = Math.min(150, MemorySanctuary.state.resources.energy + event.reward.energy);
        }
        if (event.reward.media) {
            MemorySanctuary.state.resources.media = Math.min(150, MemorySanctuary.state.resources.media + event.reward.media);
        }
        if (event.reward.environment) {
            MemorySanctuary.state.resources.environment = Math.min(100, MemorySanctuary.state.resources.environment + event.reward.environment);
        }
        
        addLog(`${guardian.name}：「${event.dialogue}」`, 'guardian');
        addLog(`获得奖励：${formatReward(event.reward)}`, 'success');
        
        // 资源变化后立即检查衰竭状态
        if (typeof checkSanctuaryDeterioration === 'function') checkSanctuaryDeterioration();
        
        // 如果有指定条目，自动高亮
        if (event.archiveId) {
            highlightRecommendedEntry(event.archiveId);
        }
        
        panel.classList.add('hidden');
        renderAll();
        if (typeof checkStuckState === 'function') checkStuckState();
    });
    
    // 婉拒按钮
    const declineBtn = document.createElement('button');
    declineBtn.className = 'event-choice';
    declineBtn.textContent = '婉拒';
    declineBtn.addEventListener('click', () => {
        addLog(`婉拒了${guardian.name}的提议。`, 'system');
        panel.classList.add('hidden');
    });
    
    choicesEl.appendChild(acceptBtn);
    choicesEl.appendChild(declineBtn);
    panel.classList.remove('hidden');
}

function formatReward(reward) {
    const parts = [];
    if (reward.energy) parts.push(`能源+${reward.energy}`);
    if (reward.media) parts.push(`介质+${reward.media}`);
    if (reward.environment) parts.push(`环境+${reward.environment}`);
    return parts.join('、') || '无';
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
    const ngData = getNGPlusData();
    
    // 先处理章节过渡事件
    const chapterTransitionEvents = MemorySanctuary.data.events.filter(e => {
        if (e.trigger.type !== 'chapter_transition') return false;
        if (MemorySanctuary.state.activeEventIds.includes(e.id)) return false;
        const currentChapter = Math.ceil(week / 4);
        return currentChapter >= e.trigger.chapterMin && currentChapter <= e.trigger.chapterMax;
    });
    
    if (chapterTransitionEvents.length > 0) {
        const eventToTrigger = chapterTransitionEvents[0];
        const chapterNum = eventToTrigger.trigger.chapterMin;
        const sceneId = `chapter_${chapterNum.toString().padStart(2, '0')}`;
        
        // Check if VN scene exists for this chapter
        if (typeof VN !== 'undefined' && VN.getScene(sceneId)) {
            VN.show(sceneId, () => {
                // After VN scene completes, show the event panel
                triggerEvent(eventToTrigger);
            });
            return;
        }
        
        // Fallback: trigger event directly if no VN scene
        triggerEvent(eventToTrigger);
        return;
    }
    
    // 先处理周期性事件（如地表残响）
    const periodicEvents = MemorySanctuary.data.events.filter(e => {
        if (e.trigger.type !== 'periodic') return false;
        if (MemorySanctuary.state.activeEventIds.includes(e.id)) return false;
        // 检查是否到达触发周（每N周触发一次）
        if (e.trigger.weekInterval) {
            return week >= e.trigger.weekMin && 
                   week <= e.trigger.weekMax && 
                   (week - e.trigger.weekMin) % e.trigger.weekInterval === 0;
        }
        return false;
    });
    
    // 周期性事件优先触发（100%概率）
    if (periodicEvents.length > 0) {
        triggerEvent(periodicEvents[0]);
        return;
    }
    
    const availableEvents = MemorySanctuary.data.events.filter(e => {
        if (MemorySanctuary.state.activeEventIds.includes(e.id)) return false;
        
        // NG+ events filtering
        if (e.trigger.type === 'ng_plus') {
            if (ngData.playthroughCount < e.trigger.playthroughMin) return false;
        } else if (e.trigger.type === 'guardian_personal') {
            if (ngData.playthroughCount < 2) return false;
        }
        
        return week >= e.trigger.weekMin && week <= e.trigger.weekMax;
    });
    
    for (const event of availableEvents) {
        if (Math.random() < event.trigger.probability) {
            triggerEvent(event);
            break;
        }
    }
}

// Check for NG+ personal events that should trigger automatically
function checkNGPlusPersonalEvents() {
    if (!MemorySanctuary.state) return;
    const ngData = getNGPlusData();
    if (ngData.playthroughCount < 2) return;
    
    const week = MemorySanctuary.state.week;
    const guardians = ['tika', 'finn', 'misha', 'lorn', 'ethel'];
    
    for (const gid of guardians) {
        const eventId = 'ng_plus_' + gid + '_request';
        if (MemorySanctuary.state.activeEventIds.includes(eventId)) continue;
        
        // Check if this guardian's personal event should trigger
        const event = MemorySanctuary.data.events.find(e => e.id === eventId);
        if (!event) continue;
        if (week < event.trigger.weekMin || week > event.trigger.weekMax) continue;
        
        // 20% chance per week to trigger
        if (Math.random() < 0.2) {
            triggerEvent(event);
            return;
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
    if (choice.effect.food) {
        MemorySanctuary.state.resources.food = Math.max(0,
            MemorySanctuary.state.resources.food + choice.effect.food);
    }
    
    // 资源变化后立即检查衰竭状态
    if (typeof checkSanctuaryDeterioration === 'function') checkSanctuaryDeterioration();
    
    if (choice.effect.time) {
        advanceTime(choice.effect.time);
    }
    
    addLog(`选择：${choice.text} —— ${choice.result}`, 'event');
    
    // Handle unlockEntry feedback
    if (choice.feedback && choice.feedback.unlockEntry) {
        unlockNGPlusEntry(choice.feedback.unlockEntry);
        const unlockedEntry = getArchiveById(choice.feedback.unlockEntry);
        if (unlockedEntry) {
            addLog(`解锁新条目：「${unlockedEntry.title}」`, 'success');
        }
    }
    
    // Handle triggerEnding feedback (for true ending)
    if (choice.feedback && choice.feedback.triggerEnding) {
        MemorySanctuary.state.pendingEnding = choice.feedback.triggerEnding;
    }
    
    // Apply event feedback (long-term effects)
    if (typeof applyEventFeedback === 'function') applyEventFeedback(choiceIndex);
    
    // Hide event panel
    const panel = document.getElementById('event-panel');
    if (panel) panel.classList.add('hidden');
    
    MemorySanctuary.activeEvent = null;
    
    // Random guardian response
    const guardiansWithDialogue = MemorySanctuary.data.guardians.filter(g => g.dialogues.event);
    if (guardiansWithDialogue.length > 0) {
        const randomGuardian = guardiansWithDialogue[Math.floor(Math.random() * guardiansWithDialogue.length)];
        showGuardianDialogue(randomGuardian.id, 'event');
    }
    
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
}

// ==========================================
// 日志系统
// ==========================================

let logUnreadCount = 0;
let logPanelOpen = false;

function initLogSystem() {
    const toggle = document.getElementById('log-toggle');
    const closeBtn = document.getElementById('log-close');
    const panel = document.getElementById('log-panel');

    if (toggle) {
        toggle.addEventListener('click', () => {
            // 点击按钮即清零红点
            clearUnread();
            
            panel.classList.toggle('hidden');
            logPanelOpen = !panel.classList.contains('hidden');
            if (logPanelOpen) {
                const logContent = document.getElementById('log-content');
                if (logContent) logContent.scrollTop = logContent.scrollHeight;
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
            logPanelOpen = false;
        });
    }
}

function updateUnreadBadge() {
    const badge = document.getElementById('log-unread');
    if (!badge) return;

    if (logUnreadCount > 0) {
        badge.textContent = logUnreadCount > 99 ? '99+' : logUnreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function clearUnread() {
    logUnreadCount = 0;
    updateUnreadBadge();
}

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

    // 如果面板关闭，增加未读计数
    if (!logPanelOpen) {
        logUnreadCount++;
        updateUnreadBadge();
    }
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
    
    content.innerHTML = modalContent.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g, '<br>');
    overlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('modal-close');
    closeBtn.onclick = () => overlay.classList.add('hidden');
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ==========================================
// 新手引导系统
// ==========================================

const TUTORIAL_STEPS = [
    {
        target: '#sanctuary-canvas',
        text: '欢迎来到「记忆圣所」。\n\n这是圣所主厅。中央的歌者之座将声波传递至各个存储室，保存文明的碎片。',
        position: 'bottom'
    },
    {
        target: '#vault-tabs',
        text: '圣所共有3间存储室：\n\n• 语言与语法 — 记录文明的语言遗产\n• 历史编年 — 保存历史时间线\n• 灾难纪实 — 记录末日经过\n\n点击标签切换存储室。',
        position: 'bottom'
    },
    {
        target: '#guardian-panel',
        text: '这是守护者面板。\n\n5名守护者各司其职——歌者缇卡、学者芬恩、生态学家米莎、工程师洛恩、前祭司埃塞尔。\n\n💡 点击守护者头像可以互动：交谈或获取归档建议。',
        position: 'left'
    },
    {
        target: '#res-energy',
        text: '圣所运作依赖三种资源：\n\n◈ 能源 — 维持圣所运转\n◇ 存储介质 — 存储归档数据\n○ 环境稳定 — 保护设备正常运作\n\n归档条目需要消耗资源和介质。',
        position: 'bottom'
    },
    {
        target: '#entry-list',
        text: '这里是待归档条目列表。\n\n每条条目都有录入成本（能源+介质）和过期时间。资源充足时请点击「录入归档」保存它们。\n\n⚠️ 过期的条目将永远消失！',
        position: 'left'
    },
    {
        target: null,
        text: '准备就绪。\n\n你的选择决定了后世「看到」怎样的萨拉达斯文明。\n\n每一段记忆都值得被认真对待。\n\n——终来之刻，何物当存？',
        position: 'center'
    }
];

let tutorialStep = 0;
let tutorialActive = false;

function initTutorial() {
    const saved = localStorage.getItem('memory-sanctuary-tutorial');
    if (saved) return;

    tutorialActive = true;
    tutorialStep = 0;
    showTutorialStep();
}

function showTutorialStep() {
    const overlay = document.getElementById('tutorial-overlay');
    const highlight = document.getElementById('tutorial-highlight');
    const tip = document.getElementById('tutorial-tip');
    const text = document.getElementById('tutorial-text');
    const nextBtn = document.getElementById('tutorial-next');

    if (!overlay || !highlight || !tip || !text || !nextBtn) return;

    const step = TUTORIAL_STEPS[tutorialStep];

    if (step.target) {
        const target = document.querySelector(step.target);
        if (target) {
            const rect = target.getBoundingClientRect();
            highlight.style.left = rect.left - 4 + 'px';
            highlight.style.top = rect.top - 4 + 'px';
            highlight.style.width = rect.width + 8 + 'px';
            highlight.style.height = rect.height + 8 + 'px';
            highlight.classList.remove('hidden');

            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            highlight.classList.add('hidden');
        }
    } else {
        highlight.classList.add('hidden');
    }

    // 提示始终居中显示，跟随步骤切换内容
    tip.style.top = '50%';
    tip.style.left = '50%';
    tip.style.transform = 'translate(-50%, -50%)';
    tip.className = 'tutorial-tip';

    text.textContent = step.text;

    if (tutorialStep === TUTORIAL_STEPS.length - 1) {
        nextBtn.textContent = '开始守护';
    } else {
        nextBtn.textContent = '下一步';
    }

    overlay.classList.remove('hidden');
}

function nextTutorialStep() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
    } else {
        showTutorialStep();
    }
}

function endTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');
    tutorialActive = false;
    localStorage.setItem('memory-sanctuary-tutorial', 'completed');
    addLog('新手引导已完成。愿你的选择得到善待。', 'system');
}

function initTutorialListener() {
    const nextBtn = document.getElementById('tutorial-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextTutorialStep);
    }

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                endTutorial();
            }
        });
    }
}

// ==========================================
// 帮助与关于
// ==========================================

function initFuncBar() {
    const helpBtn = document.getElementById('help-btn');
    const aboutBtn = document.getElementById('about-btn');
    const exploreBtn = document.getElementById('explore-btn');

    // 帮助按钮：重新播放新手引导
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            localStorage.removeItem('memory-sanctuary-tutorial');
            tutorialActive = true;
            tutorialStep = 0;
            showTutorialStep();
        });
    }

    // 关于按钮：显示版权信息
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => {
            showAboutModal();
        });
    }

    // 勘探按钮
    if (exploreBtn) {
        exploreBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            const now = MemorySanctuary.state.week;
            const exp = MemorySanctuary.state.exploration;
            if (exp.deployedUntil > now) {
                addLog(`一支勘探队已在地表作业，预计第 ${exp.deployedUntil} 周返回。`, 'system');
                return;
            }
            openExplorePanel();
        });
    }

    // 项目按钮
    const projectBtn = document.getElementById('project-btn');
    if (projectBtn) {
        projectBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            if (MemorySanctuary.state.week < 20) {
                addLog('圣所维护项目尚未解锁。', 'system');
                return;
            }
            openProjectPanel();
        });
    }

    // 应急协议按钮
    const emergencyBtn = document.getElementById('emergency-btn');
    if (emergencyBtn) {
        emergencyBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            openEmergencyProtocol();
        });
    }
}

// ============================================================
// 地表勘探系统
// ============================================================

function isGuardianFatigued(guardianId) {
    const exp = MemorySanctuary.state.exploration;
    if (!exp.fatigue) return false;
    const until = exp.fatigue[guardianId];
    return until && until > MemorySanctuary.state.week;
}

function isExplorationCompleted(expId) {
    const exp = MemorySanctuary.state.exploration;
    if (!exp.completedExplorations) return false;
    const data = MemorySanctuary.data.explorations.find(e => e.id === expId);
    const maxAttempts = data ? (data.maxAttempts || 1) : 1;
    return (exp.completedExplorations[expId] || 0) >= maxAttempts;
}

function getExplorationAttempts(expId) {
    const exp = MemorySanctuary.state.exploration;
    if (!exp.completedExplorations) return 0;
    return exp.completedExplorations[expId] || 0;
}

function showExploreReturnBanner() {
    const banner = document.getElementById('explore-return-banner');
    if (!banner) return;
    banner.classList.add('visible');
    banner.addEventListener('click', () => {
        banner.classList.remove('visible');
        openExplorePanel();
    });
    setTimeout(() => banner.classList.remove('visible'), 6000);
}

function openExplorePanel() {
    const overlay = document.getElementById('explore-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        renderExploreList();
    }
}

function openProjectPanel() {
    const overlay = document.getElementById('project-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        // Force transition reflow
        overlay.offsetHeight;
        renderProjectList();
        if (typeof AudioSystem !== 'undefined') AudioSystem.playMechanicalEngage();
    }
}

function closeProjectPanel() {
    const overlay = document.getElementById('project-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function renderExploreList() {
    const listEl = document.getElementById('explore-list');
    if (!listEl) return;
    const data = MemorySanctuary.data;
    if (!data || !data.explorations) return;

    const now = MemorySanctuary.state.week;
    const exp = MemorySanctuary.state.exploration;
    const isDeployed = exp.deployedUntil > now;

    listEl.innerHTML = '';

    // 滚动提示：监听滚动并添加 scrolled 类
    const listContainer = document.getElementById('explore-list-container');
    if (listContainer) {
        listContainer.classList.remove('scrolled');
        // 移除旧监听器（避免重复绑定）
        const newContainer = listContainer.cloneNode(false);
        while (listContainer.firstChild) {
            newContainer.appendChild(listContainer.firstChild);
        }
        listContainer.parentNode.replaceChild(newContainer, listContainer);
        newContainer.addEventListener('scroll', function() {
            if (this.scrollTop > 50) {
                this.classList.add('scrolled');
            }
        }, { passive: true });
    }

    data.explorations.forEach((expData) => {
        const item = document.createElement('div');
        item.className = 'explore-item';
        if (isDeployed) item.classList.add('disabled');

        const completed = isExplorationCompleted(expData.id);
        if (completed) item.classList.add('completed');

        // Check if exploration is available this week
        const available = !expData.availableAfter || now >= expData.availableAfter;
        if (!available) item.classList.add('locked');

        const difficultyStars = '◆'.repeat(expData.difficulty) + '◇'.repeat(3 - expData.difficulty);

        const completedBadge = completed ? '<span class="explore-item-completed-badge"> ✓ 已完成</span>' : '';
        const lockedBadge = !available ? `<span class="explore-item-locked-badge"> 🔒 第${expData.availableAfter}周解锁</span>` : '';
        const lastResult = exp.explorationLog && exp.explorationLog.find(l => l.id === expData.id);
        const lastResultText = lastResult ? `<div class="explore-item-last-result">上次：${lastResult.resultText}</div>` : '';

        const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
        const foodCostHtml = foodCost > 0 ? `<span class="food-cost">🍖 ${foodCost}</span>` : '';

        item.innerHTML = `
            <div class="explore-item-header">
                <div class="explore-item-name">${expData.name}${completedBadge}${lockedBadge}${foodCostHtml}</div>
                <div class="explore-item-difficulty">${difficultyStars}</div>
            </div>
            <div class="explore-item-desc">${expData.description}</div>
            <div class="explore-item-meta">
                <span>耗时 ${expData.duration} 周</span>
                <div class="explore-item-skills">
                    ${expData.requiredSkills.length > 0
                        ? expData.requiredSkills.map(s => `<span class="skill-tag">${skillName(s)}</span>`).join('')
                        : '<span class="skill-tag matched">无要求</span>'}
                </div>
            </div>
            ${lastResultText}
        `;

        if (!isDeployed && !completed && available) {
            item.addEventListener('click', () => selectExploration(expData, item));
        }

        listEl.appendChild(item);
    });
}

function skillName(skill) {
    const names = {
        ecology: '生态',
        survival: '生存',
        engineering: '工程',
        medicine: '医学',
        documentation: '档案',
        religion: '宗教',
        philosophy: '哲学',
        energy: '能源',
        maintenance: '维护',
        exploration: '勘探'
    };
    return names[skill] || skill;
}

let selectedExplorationId = null;
let selectedGuardians = new Set();

function selectExploration(expData, element) {
    selectedExplorationId = expData.id;
    selectedGuardians.clear();

    document.querySelectorAll('.explore-item').forEach(el => el.style.borderColor = '');
    element.style.borderColor = 'var(--explore-green, #5aa86e)';

    const dispatchEl = document.getElementById('explore-dispatch');
    dispatchEl.classList.remove('hidden');

    document.getElementById('dispatch-title').textContent = `派遣至：${expData.name}`;
    document.getElementById('dispatch-desc').textContent = expData.description;

    renderDispatchGuardians(expData);
    renderOutcomeBars(expData);
    document.getElementById('dispatch-btn').disabled = false;
}

function renderDispatchGuardians(expData) {
    const container = document.getElementById('dispatch-guardians');
    container.innerHTML = '';
    
    const guardians = MemorySanctuary.data.guardians;
    const now = MemorySanctuary.state.week;
    
    // Food cost display
    const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    const foodCostDiv = document.createElement('div');
    foodCostDiv.className = 'dispatch-food-cost';
    foodCostDiv.innerHTML = `🍖 食物消耗：${foodCost}`;
    container.appendChild(foodCostDiv);
    
    const guardianGrid = document.createElement('div');
    guardianGrid.className = 'dispatch-guardians-grid';
    
    guardians.forEach(g => {
        const div = document.createElement('div');
        div.className = 'dispatch-guardian';
        
        // Show skills
        const skillsHtml = g.skills ? g.skills.map(s => `<span class="guardian-skill">${skillName(s)}</span>`).join('') : '';
        div.innerHTML = `
            <span class="guardian-avatar">${g.avatar}</span>
            <span class="guardian-name">${g.name}</span>
            <div class="guardian-skills">${skillsHtml}</div>
        `;
        
        if (isGuardianFatigued(g.id)) {
            div.classList.add('fatigued');
            const fatigueUntil = exp.fatigue[g.id];
            const weeksLeft = fatigueUntil - now;
            div.title = `疲劳中，${weeksLeft}周后恢复`;
            div.dataset.fatigueWeeks = weeksLeft;
        } else {
            div.addEventListener('click', () => {
                if (selectedGuardians.has(g.id)) {
                    selectedGuardians.delete(g.id);
                    div.classList.remove('selected');
                } else {
                    selectedGuardians.add(g.id);
                    div.classList.add('selected');
                }
                renderOutcomeBars(expData);
            });
        }
        
        guardianGrid.appendChild(div);
    });
    
    container.appendChild(guardianGrid);
}

function renderOutcomeBars(expData) {
    const container = document.getElementById('dispatch-outcomes');
    container.innerHTML = '';

    expData.outcomes.forEach(o => {
        const prob = calculateOutcomeProbability(o, expData);
        const bar = document.createElement('div');
        bar.className = 'outcome-bar';

        const label = document.createElement('span');
        label.className = 'outcome-label';
        label.textContent = o.type === 'resource' ? (o.resource === 'energy' ? '能源' : o.resource === 'media' ? '介质' : '环境') : o.type === 'narrative' ? '叙事' : '风险';

        const fill = document.createElement('span');
        fill.className = 'outcome-fill' + (o.type === 'risk' ? ' risk' : '');
        fill.style.width = (prob * 100) + '%';

        bar.appendChild(label);
        bar.appendChild(fill);
        container.appendChild(bar);
    });
}

function calculateOutcomeProbability(outcome, expData) {
    let prob = outcome.probability;
    const matchedSkills = countMatchedSkills(expData);
    if (outcome.type === 'risk') {
        prob = Math.max(0.02, prob - matchedSkills * 0.04);
    } else if (outcome.type === 'resource') {
        prob = Math.min(0.6, prob + matchedSkills * 0.05);
    }
    return Math.round(prob * 100) / 100;
}

function countMatchedSkills(expData) {
    if (!expData.requiredSkills || expData.requiredSkills.length === 0) return 0;
    let count = 0;
    selectedGuardians.forEach(gid => {
        const g = MemorySanctuary.data.guardians.find(g => g.id === gid);
        if (g && g.skills) {
            expData.requiredSkills.forEach(s => {
                if (g.skills.includes(s)) count++;
            });
        }
    });
    return count;
}

function executeExploration() {
    const data = MemorySanctuary.data;
    const expData = data.explorations.find(e => e.id === selectedExplorationId);
    if (!expData) return;

    // 食物消耗：按难度分档，默认 0
    const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    
    if (!hasResources(0, 0, foodCost)) {
        addLog('食物不足，无法派出勘探队。', 'system');
        return;
    }

    const now = MemorySanctuary.state.week;
    MemorySanctuary.state.exploration.deployedUntil = now + expData.duration;
    
    consumeResources(0, 0, foodCost);

    const roll = Math.random();
    let cumulative = 0;
    let chosen = expData.outcomes[0];
    for (const o of expData.outcomes) {
        const prob = calculateOutcomeProbability(o, expData);
        cumulative += prob;
        if (roll <= cumulative) {
            chosen = o;
            break;
        }
    }

    // Apply effects after time advance
    const checkReturn = () => {
        if (MemorySanctuary.state.week >= MemorySanctuary.state.exploration.deployedUntil) {
            applyExplorationResult(chosen, expData);
        } else {
            setTimeout(checkReturn, 100);
        }
    };
    setTimeout(checkReturn, 100);

    const dispatchBtn = document.getElementById('dispatch-btn');
    dispatchBtn.disabled = true;
    dispatchBtn.classList.add('deploying');
    setTimeout(() => dispatchBtn.classList.remove('deploying'), 600);

    if (typeof AudioSystem !== 'undefined') AudioSystem.playExploreDeploy();

    const guardianNames = Array.from(selectedGuardians).map(gid => {
        const g = MemorySanctuary.data.guardians.find(g => g.id === gid);
        return g ? g.name : '';
    }).filter(n => n).join('、');

    addLog(`派出勘探队前往 ${expData.name}。成员：${guardianNames || '无'}。预计 ${expData.duration} 周后返回。`, 'system');

    document.getElementById('explore-overlay').classList.add('hidden');
    advanceTime(expData.duration);
}

function applyExplorationResult(outcome, expData) {
    const overlay = document.getElementById('explore-overlay');
    const resultEl = document.getElementById('explore-result');
    if (overlay) overlay.classList.remove('hidden');
    resultEl.classList.remove('hidden');

    // Determine result type for styling
    const resultType = outcome.type === 'resource' ? 'resource' : outcome.type === 'narrative' ? 'narrative' : 'risk';
    resultEl.className = 'result-' + resultType;

    // Set icon based on result type
    const iconEl = document.getElementById('result-icon');
    if (iconEl) {
        iconEl.textContent = outcome.type === 'resource' ? '◈' : outcome.type === 'narrative' ? '✦' : '⚠';
    }

    document.getElementById('result-header').textContent = `${expData.name} — 勘探返回`;

    const effects = [];
    if (outcome.type === 'resource') {
        const resName = outcome.resource === 'energy' ? '能源' : outcome.resource === 'media' ? '介质' : '环境';
        effects.push({ name: `${resName} +${outcome.amount}`, positive: outcome.amount > 0 });
        if (outcome.resource === 'energy') adjustResource('energy', outcome.amount);
        if (outcome.resource === 'media') adjustResource('media', outcome.amount);
        if (outcome.resource === 'environment') adjustResource('environment', outcome.amount);
    } else if (outcome.type === 'risk') {
        const resName = outcome.resource === 'energy' ? '能源' : outcome.resource === 'media' ? '介质' : '环境';
        effects.push({ name: `${resName} ${outcome.amount}`, positive: false });
        if (outcome.resource === 'energy') adjustResource('energy', outcome.amount);
        if (outcome.resource === 'media') adjustResource('media', outcome.amount);
        if (outcome.resource === 'environment') adjustResource('environment', outcome.amount);
    }

    document.getElementById('result-text').textContent = outcome.message;

    const effectsContainer = document.getElementById('result-effects');
    effectsContainer.innerHTML = '';
    effects.forEach(e => {
        const div = document.createElement('div');
        div.className = 'result-effect ' + (e.positive ? 'positive' : 'negative');
        div.textContent = e.name;
        effectsContainer.appendChild(div);
    });

    // Play result sound
    if (typeof AudioSystem !== 'undefined') {
        if (outcome.type === 'resource') AudioSystem.playExploreReturnResource();
        else if (outcome.type === 'narrative') AudioSystem.playExploreReturnNarrative();
        else AudioSystem.playExploreReturnRisk();
    }

    // Track completion
    if (!MemorySanctuary.state.exploration.completedExplorations) {
        MemorySanctuary.state.exploration.completedExplorations = {};
    }
    MemorySanctuary.state.exploration.completedExplorations[expData.id] = 
        (MemorySanctuary.state.exploration.completedExplorations[expData.id] || 0) + 1;

    // Add to exploration log
    if (!MemorySanctuary.state.exploration.explorationLog) {
        MemorySanctuary.state.exploration.explorationLog = [];
    }
    MemorySanctuary.state.exploration.explorationLog.push({
        id: expData.id,
        name: expData.name,
        week: MemorySanctuary.state.week,
        resultType: outcome.type,
        resultText: outcome.message,
        members: Array.from(selectedGuardians)
    });

    // Guardian mood +1 for all dispatched
    selectedGuardians.forEach(gid => {
        adjustGuardianMood(gid, 1);
    });

    // Layer 4: Risk consequences — fatigue + potential mood penalty
    if (outcome.type === 'risk') {
        selectedGuardians.forEach(gid => {
            // Fatigue: cannot deploy for 2 weeks
            if (!MemorySanctuary.state.exploration.fatigue) {
                MemorySanctuary.state.exploration.fatigue = {};
            }
            MemorySanctuary.state.exploration.fatigue[gid] = MemorySanctuary.state.week + 2;

            // 50% chance of mood penalty
            if (Math.random() < 0.5) {
                adjustGuardianMood(gid, -1);
            }
        });
    }

    // Layer 3: Narrative reveals clue
    if (outcome.type === 'narrative' && outcome.revealsClue) {
        addLog(`这次发现让你想起了某份档案……也许应该回去检查一下。`, 'system');
    }

    // Layer 3: Guardian special dialogue
    if (expData.guardianSpecials) {
        selectedGuardians.forEach(gid => {
            const g = MemorySanctuary.data.guardians.find(g => g.id === gid);
            if (g && g.explorationDialogues && expData.guardianSpecials[g.id]) {
                const dialogueKey = expData.guardianSpecials[g.id];
                if (g.explorationDialogues[dialogueKey]) {
                    setTimeout(() => {
                        addLog(`${g.name}：「${g.explorationDialogues[dialogueKey]}」`, 'guardian');
                    }, 500);
                }
            }
        });
    }

    addLog(`勘探队从 ${expData.name} 返回。${outcome.message}`, 'system');
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
}

// 结果面板关闭
document.addEventListener('DOMContentLoaded', () => {
    const resultClose = document.getElementById('result-close-btn');
    if (resultClose) {
        resultClose.addEventListener('click', () => {
            document.getElementById('explore-result').classList.add('hidden');
            document.getElementById('explore-dispatch').classList.add('hidden');
            renderExploreList();
        });
    }
    const exploreClose = document.getElementById('explore-close');
    if (exploreClose) {
        exploreClose.addEventListener('click', () => {
            document.getElementById('explore-overlay').classList.add('hidden');
        });
    }
    const projectClose = document.getElementById('project-close');
    if (projectClose) {
        projectClose.addEventListener('click', closeProjectPanel);
    }
    const dispatchBtn = document.getElementById('dispatch-btn');
    if (dispatchBtn) {
        dispatchBtn.addEventListener('click', executeExploration);
    }
    
    // Tab switching
    document.querySelectorAll('.explore-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            const listContainer = document.getElementById('explore-list-container');
            const logContainer = document.getElementById('explore-log-container');
            if (tabName === 'list') {
                listContainer.classList.remove('hidden');
                logContainer.classList.add('hidden');
            } else {
                listContainer.classList.add('hidden');
                logContainer.classList.remove('hidden');
                renderExploreLog();
            }
        });
    });
});

function renderExploreLog() {
    const container = document.getElementById('explore-log-container');
    if (!container) return;
    const logs = MemorySanctuary.state.exploration.explorationLog || [];
    
    if (logs.length === 0) {
        container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.7rem; text-align: center; padding: 20px;">暂无勘探记录</div>';
        return;
    }
    
    container.innerHTML = '';
    const typeLabels = { resource: '◈ 资源', narrative: '✦ 叙事', risk: '⚠ 风险' };
    
    logs.slice().reverse().forEach(log => {
        const div = document.createElement('div');
        div.className = 'explore-log-entry';
        div.innerHTML = `
            <div class="explore-log-entry-header">
                <span class="explore-log-entry-name">${log.name} <span style="color: var(--text-dim); font-weight: normal;">${typeLabels[log.resultType] || ''}</span></span>
                <span class="explore-log-entry-week">第 ${log.week} 周</span>
            </div>
            <div class="explore-log-entry-text">${log.resultText}</div>
            <div class="explore-log-entry-members">成员：${log.members.map(gid => {
                const g = MemorySanctuary.data.guardians.find(g => g.id === gid);
                return g ? `${g.avatar} ${g.name}` : '';
            }).join('、') || '无'}</div>
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 应急协议
// ==========================================

const EMERGENCY_PROTOCOLS = [
    {
        id: 'energy_extract',
        name: '能源榨取',
        icon: '⚡',
        desc: '从环境稳定系统中强制提取能源',
        cost: '环境稳定度 -15',
        gain: '能源 +30',
        cooldown: 3,
        corruption: 15,
        available: (state) => state.resources.environment > 15,
        execute: (state) => {
            state.resources.environment -= 15;
            state.resources.energy = Math.min(150, state.resources.energy + 30);
        }
    },
    {
        id: 'media_recycle',
        name: '介质回收',
        icon: '♻️',
        desc: '消耗能源换取存储介质',
        cost: '能源 -20',
        gain: '介质 +30',
        cooldown: 3,
        corruption: 15,
        available: (state) => state.resources.energy > 20,
        execute: (state) => {
            state.resources.energy -= 20;
            state.resources.media = Math.min(150, state.resources.media + 30);
        }
    },
    {
        id: 'emergency_explore',
        name: '紧急勘探',
        icon: '🔭',
        desc: '立即派遣勘探队（无视冷却），但守护者疲劳+2周',
        cost: '无',
        gain: '立即派遣',
        cooldown: 4,
        corruption: 20,
        available: (state) => true,
        execute: (state) => {
            if (state.exploration) {
                state.exploration.cooldownUntil = 0;
            }
        },
        extraEffect: (state) => {
            const guardians = MemorySanctuary.data.guardians;
            guardians.forEach(g => {
                if (state.exploration.fatigue && state.exploration.fatigue[g.id]) {
                    state.exploration.fatigue[g.id] += 2;
                }
            });
        }
    },
    {
        id: 'emergency_archive',
        name: '紧急归档',
        icon: '📦',
        desc: '本回合归档不消耗介质（能源消耗加倍）',
        cost: '本回合生效',
        gain: '介质消耗 0',
        cooldown: 2,
        corruption: 10,
        available: (state) => true,
        execute: (state) => {
            state.emergencyArchiveActive = true;
        }
    }
];

const EMERGENCY_GUARDIAN_REACTIONS = [
    '……你在赌。但愿你是对的。',
    '这代价……但愿是值得的。',
    '圣所承受了这一切。为了文明。',
    '环境系统在尖叫。但我能理解你的选择。',
    '愿后世的眼睛能看见你所做的一切。',
    '每一次应急，都在透支未来。',
    '圣所的呻吟声越来越大了。',
    '我……我不确定我们还能撑多久。',
    '如果你认为必须如此，那我支持你。',
    '这不仅仅是数字。这是我们最后的庇护所。'
];

function openEmergencyProtocol() {
    const state = MemorySanctuary.state;
    const overlay = document.getElementById('emergency-overlay');
    const panel = document.getElementById('emergency-panel');
    const list = document.getElementById('emergency-list');
    const corruptionBar = document.getElementById('corruption-bar');
    const corruptionText = document.getElementById('corruption-text');
    const closeBtn = document.getElementById('emergency-close');
    
    if (!overlay || !panel || !list) return;
    
    // 渲染腐败度
    const corruption = state.emergencyCorruption || 0;
    if (corruptionBar) {
        corruptionBar.style.width = corruption + '%';
        // 根据腐败度改变颜色
        if (corruption < 30) {
            corruptionBar.style.background = '#c9a87c';
        } else if (corruption < 60) {
            corruptionBar.style.background = '#d4a017';
        } else if (corruption < 80) {
            corruptionBar.style.background = '#e67e22';
        } else {
            corruptionBar.style.background = '#e74c3c';
        }
    }
    if (corruptionText) {
        corruptionText.textContent = `${corruption} / 100`;
        if (corruption >= 60) {
            corruptionText.style.color = '#e74c3c';
        } else if (corruption >= 30) {
            corruptionText.style.color = '#d4a017';
        } else {
            corruptionText.style.color = 'var(--text-dim)';
        }
    }
    
    // 渲染协议列表
    list.innerHTML = '';
    EMERGENCY_PROTOCOLS.forEach(protocol => {
        const isOnCooldown = state.emergencyCooldowns && state.emergencyCooldowns[protocol.id] > 0;
        const cooldownRemaining = isOnCooldown ? state.emergencyCooldowns[protocol.id] : 0;
        const canUse = protocol.available(state) && !isOnCooldown;
        
        const item = document.createElement('div');
        item.className = `emergency-item ${canUse ? 'usable' : 'disabled'} ${isOnCooldown ? 'cooldown' : ''}`;
        
        let cooldownText = '';
        if (isOnCooldown) {
            cooldownText = `<span class="cooldown-badge">冷却中 ${cooldownRemaining} 周</span>`;
        }
        
        item.innerHTML = `
            <div class="emergency-icon">${protocol.icon}</div>
            <div class="emergency-info">
                <div class="emergency-name">${protocol.name} ${cooldownText}</div>
                <div class="emergency-desc">${protocol.desc}</div>
                <div class="emergency-effects">
                    <span class="effect-cost">${protocol.cost}</span>
                    <span class="effect-gain">${protocol.gain}</span>
                    <span class="effect-corruption">腐败+${protocol.corruption}</span>
                </div>
            </div>
            <button class="emergency-activate" ${canUse ? '' : 'disabled'}>激活</button>
        `;
        
        if (canUse) {
            item.querySelector('.emergency-activate').addEventListener('click', () => {
                activateEmergencyProtocol(protocol);
            });
        }
        
        list.appendChild(item);
    });
    
    // 腐败度警告
    if (corruption >= 80) {
        const warning = document.createElement('div');
        warning.className = 'emergency-warning';
        warning.textContent = '⚠️ 圣所腐败度极高！每回合资源额外衰减 -2.5';
        list.appendChild(warning);
    } else if (corruption >= 50) {
        const warning = document.createElement('div');
        warning.className = 'emergency-warning moderate';
        warning.textContent = `⚠️ 腐败度已达 ${corruption}。圣所正在缓慢崩溃。`;
        list.appendChild(warning);
    }
    
    overlay.classList.remove('hidden');
    
    if (closeBtn) {
        closeBtn.onclick = () => overlay.classList.add('hidden');
    }
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    };
}

function activateEmergencyProtocol(protocol) {
    const state = MemorySanctuary.state;
    
    // 执行效果
    protocol.execute(state);
    if (protocol.extraEffect) protocol.extraEffect(state);
    
    // 应用冷却
    if (!state.emergencyCooldowns) state.emergencyCooldowns = {};
    state.emergencyCooldowns[protocol.id] = protocol.cooldown;
    
    // 增加腐败度
    state.emergencyCorruption = Math.min(100, (state.emergencyCorruption || 0) + protocol.corruption);
    
    // 日志
    addLog(`⚡ 应急协议「${protocol.name}」激活。腐败度 +${protocol.corruption}。`, 'system');
    
    // 音效
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.playMechanicalEngage();
    }
    
    // 守护者反应（50% 概率）
    if (Math.random() < 0.5) {
        const guardians = MemorySanctuary.data.guardians;
        const guardian = guardians[Math.floor(Math.random() * guardians.length)];
        const reaction = EMERGENCY_GUARDIAN_REACTIONS[Math.floor(Math.random() * EMERGENCY_GUARDIAN_REACTIONS.length)];
        addLog(`${guardian.name}：「${reaction}」`, 'guardian');
    }
    
    // 关闭面板
    const overlay = document.getElementById('emergency-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
    if (typeof updateEmergencyButton === 'function') updateEmergencyButton();
}

function showAboutModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    title.textContent = '关于 · 记忆圣所';

    let aboutContent = '记忆圣所 (Nar-Sil-Veth)\n';
    aboutContent += '终来之刻，何物当存？\n\n';
    aboutContent += '版本：MVP v1.0\n';
    aboutContent += '技术：HTML5 + CSS3 + Canvas 2D + Vanilla JavaScript\n\n';
    aboutContent += '— 绒花计划 系列IP —\n\n';
    aboutContent += '守护者：\n';
    aboutContent += '  缇卡 · 首席歌者\n';
    aboutContent += '  芬恩 · 历史编年学者\n';
    aboutContent += '  米莎 · 生态学家\n';
    aboutContent += '  洛恩 · 前航天工程师\n';
    aboutContent += '  埃塞尔 · 前祭司\n\n';
    aboutContent += '「我们曾存在，我们曾仰望，我们曾渴望触碰你们。」';

    content.textContent = aboutContent;
    overlay.classList.remove('hidden');

    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
}

// ==========================================
// 存档系统
// ==========================================

const SAVE_KEY_PREFIX = 'memory-sanctuary-save-slot-';
const SAVE_SLOT_COUNT = 3;
const NG_PLUS_KEY = 'memory-sanctuary-ngplus';
const CURRENT_SLOT_KEY = 'memory-sanctuary-current-slot';

function saveGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;

    const ngData = getNGPlusData();

    const saveData = {
        version: 1,
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
            ongoingEffects: [...(MemorySanctuary.state.ongoingEffects || [])],
            resourceChanges: { ...(MemorySanctuary.state.resourceChanges || { energy: 0, media: 0, environment: 0, food: 0 }) }
        },
        currentVaultId: MemorySanctuary.currentVaultId
    };

    try {
        localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(saveData));
        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));
        addLog(`游戏已保存至存档槽 ${slot}。`, 'system');
        return true;
    } catch (e) {
        console.error('[存档] 保存失败:', e);
        addLog('存档失败：存储空间不足。', 'system');
        return false;
    }
}

function loadGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;

    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return false;

    try {
        const saveData = JSON.parse(raw);

        // Initialize fresh state before loading
        initGameState();

        MemorySanctuary.state.resources = { ...saveData.state.resources };
        MemorySanctuary.state.week = saveData.state.week;
        MemorySanctuary.state.chapter = saveData.state.chapter;
        MemorySanctuary.state.completedArchives = [...saveData.state.completedArchives];
        MemorySanctuary.state.vaultUsage = { ...saveData.state.vaultUsage };
        MemorySanctuary.state.narrativeFlags = [...(saveData.state.narrativeFlags || [])];
        MemorySanctuary.state.deterioration = { ...saveData.state.deterioration } || { energy: false, media: false, environment: false };
        MemorySanctuary.state.activeEvents = [];
        MemorySanctuary.state.activeEventIds = [...(saveData.state.activeEventIds || [])];
        MemorySanctuary.state.guardianMoods = { ...(saveData.state.guardianMoods || {}) };
        MemorySanctuary.state.scheduledEvents = [...(saveData.state.scheduledEvents || [])];
        MemorySanctuary.state.unlockedBonuses = [...(saveData.state.unlockedBonuses || [])];
        MemorySanctuary.state.exploration = { ...(saveData.state.exploration || { deployedUntil: 0, cooldownUntil: 0, completedExplorations: {}, fatigue: {}, explorationLog: [] }) };
        MemorySanctuary.state.activeProjects = [...(saveData.state.activeProjects || [])];
        MemorySanctuary.state.completedProjects = [...(saveData.state.completedProjects || [])];
        MemorySanctuary.state.ongoingEffects = [...(saveData.state.ongoingEffects || [])];
        MemorySanctuary.state.resourceChanges = { ...(saveData.state.resourceChanges || { energy: 0, media: 0, environment: 0, food: 0 }) };

        MemorySanctuary.currentVaultId = saveData.currentVaultId || 1;
        MemorySanctuary.activeEvent = null;

        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

        renderAll();
        if (typeof checkStuckState === 'function') checkStuckState();
        if (typeof initCanvas === 'function') initCanvas();

        const guardian = MemorySanctuary.data.guardians[0];
        if (guardian) showGuardianDialogue(guardian.id, 'idle');

        addLog(`已从存档槽 ${slot} 读取游戏。`, 'system');
        return true;
    } catch (e) {
        console.error('[存档] 读取失败:', e);
        addLog('读档失败：存档数据已损坏。', 'system');
        return false;
    }
}

function getSaveSlotInfo(slot) {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return null;

    try {
        const data = JSON.parse(raw);
        return {
            slot: data.slot,
            savedAt: data.savedAt,
            week: data.state.week,
            chapter: data.state.chapter,
            archivedCount: data.state.completedArchives.length,
            currentVaultId: data.currentVaultId,
            playthrough: data.playthrough || 1
        };
    } catch (e) {
        return null;
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
    localStorage.removeItem(SAVE_KEY_PREFIX + slot);
}

function hasAnySaves() {
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
        if (localStorage.getItem(SAVE_KEY_PREFIX + i)) return true;
    }
    return false;
}

function getCurrentSlot() {
    return parseInt(localStorage.getItem(CURRENT_SLOT_KEY) || '0');
}

// ==========================================
// 多周目继承
// ==========================================

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
            seenScenes: []
        };
    }
    try {
        const data = JSON.parse(raw);
        // Ensure new fields exist
        if (!data.unlockedEntries) data.unlockedEntries = [];
        if (!data.guardianFinalesSeen) data.guardianFinalesSeen = [];
        if (!data.guardianHistory) data.guardianHistory = [];
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

    ngData.bonuses.forEach(bonus => {
        if (bonus.type === 'resource') {
            MemorySanctuary.state.resources[bonus.resource] = Math.min(
                100,
                MemorySanctuary.state.resources[bonus.resource] + bonus.value
            );
        }
    });
}

// Check if an archive entry is available based on NG+ conditions
function isArchiveAvailable(entry) {
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

// Unlock an NG+ entry (called when conditions are met)
function unlockNGPlusEntry(entryId) {
    const ngData = getNGPlusData();
    if (!ngData.unlockedEntries) ngData.unlockedEntries = [];
    if (!ngData.unlockedEntries.includes(entryId)) {
        ngData.unlockedEntries.push(entryId);
        saveNGPlusData(ngData);
    }
}

// Record that a guardian finale was seen
function recordGuardianFinale(guardianId) {
    const ngData = getNGPlusData();
    if (!ngData.guardianFinalesSeen) ngData.guardianFinalesSeen = [];
    if (!ngData.guardianFinalesSeen.includes(guardianId)) {
        ngData.guardianFinalesSeen.push(guardianId);
        saveNGPlusData(ngData);
    }
}

// ==========================================
// 成就系统
// ==========================================

const ACHIEVEMENTS_KEY = 'memory-sanctuary-achievements';

function getUnlockedAchievements() {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
}

function saveUnlockedAchievements(unlocked) {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
}

function unlockAchievement(achievementId) {
    const unlocked = getUnlockedAchievements();
    if (unlocked.includes(achievementId)) return false;
    unlocked.push(achievementId);
    saveUnlockedAchievements(unlocked);
    
    // Show toast notification
    const achievement = (MemorySanctuary.data.achievements || []).find(a => a.id === achievementId);
    if (achievement && typeof showAchievementToast === 'function') {
        showAchievementToast(achievement);
    }
    return true;
}

function checkAchievements(context) {
    const state = MemorySanctuary.state;
    if (!state) return;
    const ngData = getNGPlusData();
    const unlocked = getUnlockedAchievements();
    const allAchievements = MemorySanctuary.data.achievements || [];
    
    for (const ach of allAchievements) {
        if (unlocked.includes(ach.id)) continue;
        
        const c = ach.condition;
        let earned = false;
        
        switch (c.type) {
            case 'archives_count':
                if (state.completedArchives.length >= c.value) earned = true;
                break;
            case 'playthrough':
                if (ngData.playthroughCount >= c.value) earned = true;
                break;
            case 'vault_complete':
                if (getVaultCompletion(c.value).ratio >= 1.0) earned = true;
                break;
            case 'all_vaults_percent':
                const allMeet = MemorySanctuary.data.vaults.every(v => getVaultCompletion(v.id).ratio >= c.value);
                if (allMeet) earned = true;
                break;
            case 'all_guardians_mood': {
                const tiers = { hostile: 0, cold: 1, neutral: 2, friendly: 3, intimate: 4 };
                const targetTier = tiers[c.value] || 3;
                const guardianIds = ['tika', 'finn', 'misha', 'lorn', 'ethel'];
                const allMeet2 = guardianIds.every(gid => tiers[getMoodTier(gid)] >= targetTier);
                if (allMeet2) earned = true;
                break;
            }
            case 'playthroughs':
                if (ngData.playthroughCount >= c.value) earned = true;
                break;
            case 'ending':
                // Checked in checkSealAchievements via endingId param
                break;
            case 'chapter':
                if (state.chapter >= c.value) earned = true;
                break;
            case 'unlock_ng_entries': {
                const unlockedCount = (ngData.unlockedEntries || []).length;
                if (unlockedCount >= c.value) earned = true;
                break;
            }
        }
        
        if (earned) unlockAchievement(ach.id);
    }
}

// Check achievements after sealing
function checkSealAchievements(endingId, week) {
    unlockAchievement('first_seal');
    
    // 结局 ID → 成就 ID 映射
    const endingToAchievement = {
        'finale_song_of_doom': 'song_of_doom',
        'finale_roots_of_civilization': 'roots_of_civilization',
        'finale_children_of_stardust': 'children_of_stardust',
        'finale_fire_of_life': 'fire_of_life',
        'finale_eternal_question': 'eternal_question',
        'finale_chronicle_of_doom': 'chronicle_of_doom',
        'finale_voice_of_home': 'voice_of_home',
        'finale_silent_sanctuary': 'silent_sanctuary',
        'finale_guardian_of_fragments': 'memory_keeper',
        'finale_whisper_keeper': 'eternal_keeper',
        'true_ending': 'beyond_time',
        'guardian_tika_finale': 'guardian_tika_love',
        'guardian_finn_finale': 'guardian_finn_love',
        'guardian_misha_finale': 'guardian_misha_love',
        'guardian_lorn_finale': 'guardian_lorn_love',
        'guardian_ethel_finale': 'guardian_ethel_love'
    };
    
    if (endingId) {
        const achievementId = endingToAchievement[endingId] || endingId;
        unlockAchievement(achievementId);
        if (endingId.startsWith('guardian_') && endingId.endsWith('_finale')) {
            const gid = endingId.replace('guardian_', '').replace('_finale', '');
            unlockAchievement('guardian_' + gid + '_love');
        }
    }
    
    if (week <= 12) unlockAchievement('seal_early');
    if (week >= 40) unlockAchievement('seal_late');
    
    // Check all guardian finales
    const ngData = getNGPlusData();
    if (ngData.guardianFinalesSeen.length >= 5) unlockAchievement('all_guardian_finales');
    
    // Check all base endings
    const baseEndings = ['complete_memory', 'finale_song_of_doom', 'finale_roots_of_civilization', 
        'finale_children_of_stardust', 'finale_fire_of_life', 'finale_eternal_question',
        'finale_chronicle_of_doom', 'finale_voice_of_home', 'finale_silent_sanctuary'];
    const allBase = baseEndings.every(e => getUnlockedAchievements().includes(endingToAchievement[e] || e));
    if (allBase) unlockAchievement('all_endings_base');
    
    checkAchievements({ type: 'seal' });
}

// ==========================================
// 新游戏
// ==========================================

function startNewGame(slot, isNGPlus) {
    if (isNGPlus) {
        startNewGamePlus();
    }

    initGameState();

    if (isNGPlus) {
        applyNGPlusBonuses();
    }

    const logContent = document.getElementById('log-content');
    if (logContent) logContent.innerHTML = '';

    localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

    renderAll();
    if (typeof initCanvas === 'function') initCanvas();

    showGuardianDialogue('tika', 'idle');

    saveGame(slot);

    const ngData = getNGPlusData();
    if (isNGPlus && ngData.playthroughCount > 1) {
        addLog(`第 ${ngData.playthroughCount} 周目开始。继承奖励已应用。`, 'system');
    } else {
        addLog('新游戏开始。愿你的选择得到善待。', 'system');
    }
}

// ==========================================
// 存档界面
// ==========================================

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

    renderSaveSlots(mode);
    overlay.classList.remove('hidden');
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
            
            closeSaveScreen();
            if (titleScreen) titleScreen.classList.add('hidden');
            if (gameContainer) gameContainer.classList.remove('hidden');
            startNewGame(slot, isNGPlus);
            break;
        }
    }
}

function initSaveSystem() {
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const saveCloseBtn = document.getElementById('save-close');

    // Save button: open slot selection panel
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            openSaveScreen('save');
        });
    }

    // Load button: open slot selection panel
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
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

// Start game after loading from title screen
function startGameAfterLoad(slot) {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    
    titleScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    
    loadGame(slot);
    
    // Show tutorial for first-time players
    const savedTutorial = localStorage.getItem('memory-sanctuary-tutorial');
    if (!savedTutorial) {
        setTimeout(() => {
            if (typeof initTutorial === 'function') initTutorial();
        }, 500);
    }
}

// ==========================================
// 叙事线索链系统
// ==========================================

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
    }
}

function getChainIndicator(entry) {
    if (!entry.relatedArchives || entry.relatedArchives.length === 0) return '';
    const completed = entry.relatedArchives.filter(id => isArchiveCompleted(id)).length;
    if (completed === 0) return ' 🔗';
    if (completed === entry.relatedArchives.length) return ' ✅';
    return ` 🔗${completed}/${entry.relatedArchives.length}`;
}

// ==========================================
// 章节过渡追踪
// ==========================================

function checkChapterCompletion() {
    const state = MemorySanctuary.state;
    if (!state.chaptersCompleted) state.chaptersCompleted = [];
    
    const currentChapter = state.chapter;
    
    // Check if all 12 chapters have been reached
    if (currentChapter >= 12 && !state.chaptersCompleted.includes(12)) {
        state.chaptersCompleted.push(12);
        if (typeof unlockAchievement === 'function') unlockAchievement('chapter_complete_12');
    }
}

// ==========================================
// 文明图谱系统
// ==========================================

function initCivilizationAtlas() {
    const atlasBtn = document.getElementById('atlas-btn');
    const atlasClose = document.getElementById('atlas-close');
    const atlasOverlay = document.getElementById('atlas-overlay');
    
    if (atlasBtn) {
        atlasBtn.addEventListener('click', () => {
            toggleAtlas();
        });
    }
    
    if (atlasClose) {
        atlasClose.addEventListener('click', () => {
            if (atlasOverlay) atlasOverlay.classList.add('hidden');
        });
    }
    
    if (atlasOverlay) {
        atlasOverlay.addEventListener('click', (e) => {
            if (e.target === atlasOverlay) {
                atlasOverlay.classList.add('hidden');
            }
        });
    }
}

function toggleAtlas() {
    const overlay = document.getElementById('atlas-overlay');
    if (!overlay) return;
    
    if (overlay.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
        renderAtlas();
    } else {
        overlay.classList.add('hidden');
    }
}

function renderAtlas() {
    const canvas = document.getElementById('atlas-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue('--amber-primary').trim() || '#d4a04a';
    const textColor = style.getPropertyValue('--text-primary').trim() || '#e8e0d0';
    const dimColor = style.getPropertyValue('--text-dim').trim() || '#5a5040';
    const dangerColor = style.getPropertyValue('--danger').trim() || '#8a3a2a';
    const successColor = style.getPropertyValue('--success').trim() || '#3a8a5a';
    
    // Calculate vault completion
    const vaults = MemorySanctuary.data.vaults;
    const completedArchives = MemorySanctuary.state.completedArchives;
    
    const vaultStats = vaults.map(vault => {
        const total = MemorySanctuary.data.archives.filter(a => a.vault === vault.id).length;
        const done = completedArchives.filter(id => {
            const a = getArchiveById(id);
            return a && a.vault === vault.id;
        }).length;
        return { ...vault, total, done, percent: total > 0 ? done / total : 0 };
    });
    
    // Draw title
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 18px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('萨拉达斯文明图谱', width / 2, 30);
    
    // Draw completion
    const totalDone = completedArchives.length;
    const totalCount = MemorySanctuary.data.archives.length;
    const totalPercent = Math.round((totalDone / totalCount) * 100);
    ctx.fillStyle = textColor;
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.fillText(`文明完整度: ${totalPercent}% (${totalDone}/${totalCount})`, width / 2, 50);
    
    // Draw vault nodes in a circle
    const centerX = width / 2;
    const centerY = height / 2 + 10;
    const radius = Math.min(width, height) * 0.32;
    
    const nodePositions = [];
    
    vaults.forEach((vault, i) => {
        const angle = (i / vaults.length) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        nodePositions.push({ x, y, vault });
        
        const stats = vaultStats[i];
        const isComplete = stats.percent > 0;
        const isFull = stats.percent >= 1;
        
        // Node circle
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fillStyle = isComplete ? vault.accentColor : 'transparent';
        ctx.fill();
        ctx.strokeStyle = isFull ? successColor : (isComplete ? vault.accentColor : dimColor);
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Progress arc
        if (stats.percent > 0 && stats.percent < 1) {
            ctx.beginPath();
            ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stats.percent);
            ctx.strokeStyle = successColor;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        // Vault name
        ctx.fillStyle = textColor;
        ctx.font = '10px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        const shortName = vault.name.length > 6 ? vault.name.substring(0, 6) + '…' : vault.name;
        ctx.fillText(shortName, x, y + 36);
        
        // Completion count
        ctx.fillStyle = dimColor;
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText(`${stats.done}/${stats.total}`, x, y + 46);
    });
    
    // Draw chain connections
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    MemorySanctuary.data.archives.forEach(archive => {
        if (archive.relatedArchives && archive.relatedArchives.length > 0 && isArchiveCompleted(archive.id)) {
            const srcPos = nodePositions.find(p => p.vault.id === archive.vault);
            if (!srcPos) return;
            
            archive.relatedArchives.forEach(relatedId => {
                const related = getArchiveById(relatedId);
                if (related && isArchiveCompleted(relatedId)) {
                    const dstPos = nodePositions.find(p => p.vault.id === related.vault);
                    if (dstPos && srcPos !== dstPos) {
                        ctx.beginPath();
                        ctx.moveTo(srcPos.x, srcPos.y);
                        ctx.lineTo(dstPos.x, dstPos.y);
                        ctx.stroke();
                    }
                }
            });
        }
    });
    
    ctx.setLineDash([]);
    
    // Draw center decoration
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(212, 160, 74, 0.1)';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = accentColor;
    ctx.font = '20px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText('萨', centerX, centerY + 7);
}

// ==========================================
// 封印总结系统 — 文明画像
// ==========================================

function generateCivilizationPortrait() {
    const archives = MemorySanctuary.data.archives;
    const completed = MemorySanctuary.state.completedArchives;
    const vaults = MemorySanctuary.data.vaults;
    
    // Count per vault
    const vaultCounts = {};
    vaults.forEach(v => vaultCounts[v.id] = 0);
    completed.forEach(id => {
        const a = getArchiveById(id);
        if (a) vaultCounts[a.vault] = (vaultCounts[a.vault] || 0) + 1;
    });
    
    // Find dominant vaults (>20% of their total)
    const vaultTotals = {};
    vaults.forEach(v => {
        vaultTotals[v.id] = archives.filter(a => a.vault === v.id).length;
    });
    
    const dominant = [];
    for (const [vid, count] of Object.entries(vaultCounts)) {
        const total = vaultTotals[vid] || 1;
        if (count / total >= 0.5 && count >= 2) {
            dominant.push({ id: parseInt(vid), count, total });
        }
    }
    
    // Sort by completion ratio
    dominant.sort((a, b) => (b.count / b.total) - (a.count / a.total));
    
    // Generate title based on dominant vaults
    const vaultNames = dominant.map(d => vaults.find(v => v.id === d.id)?.name || '');
    
    let title = '无名守护者';
    let description = '你选择了沉默。后世将永远不知道萨拉达斯曾存在过。';
    
    const totalPercent = completed.length / archives.length;
    
    if (totalPercent >= 1) {
        title = '永恒记忆';
        description = '你保存了萨拉达斯文明的全部碎片。后世将看到一个完整的文明——它的语言、历史、灾难、艺术、信仰、科学、生态、法律、生活、建筑、医学与星空。这是你对时间的反抗。';
    } else if (totalPercent >= 0.7) {
        title = '文明守护者';
        description = '你保存了大部分文明碎片。后世将看到一个虽不完整但足够真实的萨拉达斯——它的歌声、它的挣扎、它的智慧、它的爱。';
    } else if (totalPercent >= 0.4) {
        // Check for specific combinations
        const hasLanguage = vaultCounts[1] >= 3;
        const hasHistory = vaultCounts[2] >= 3;
        const hasDisaster = vaultCounts[3] >= 3;
        const hasArt = vaultCounts[4] >= 3;
        const hasPhilosophy = vaultCounts[5] >= 3;
        const hasScience = vaultCounts[6] >= 3;
        const hasEcology = vaultCounts[7] >= 3;
        const hasLaw = vaultCounts[8] >= 3;
        const hasDaily = vaultCounts[9] >= 3;
        const hasArchitecture = vaultCounts[10] >= 3;
        const hasMedicine = vaultCounts[11] >= 3;
        const hasAstronomy = vaultCounts[12] >= 3;
        
        if (hasLanguage && hasArt) {
            title = '歌与诗之声';
            description = '你保存了萨拉达斯的语言与艺术。后世将听到它的歌声、看到它的色彩、感受它的舞蹈。这是一个用美回应末日的文明。';
        } else if (hasHistory && hasLaw) {
            title = '律法与秩序';
            description = '你保存了萨拉达斯的历史与法律。后世将看到它的兴衰、它的制度、它的抉择。这是一个在混乱中坚守秩序的文明。';
        } else if (hasScience && hasAstronomy) {
            title = '追光者';
            description = '你保存了萨拉达斯的科学与星象。后世将看到它的智慧、它的好奇、它的仰望。这是一个试图理解宇宙的文明。';
        } else if (hasEcology && hasMedicine) {
            title = '生命回响';
            description = '你保存了萨拉达斯的生态与医学。后世将看到它的生命、它的脆弱、它的顽强。这是一个与星球共生的文明。';
        } else if (hasDisaster && hasHistory) {
            title = '灾难见证者';
            description = '你保存了萨拉达斯的灾难与历史。后世将看到它的终结、它的痛苦、它的反抗。这是一个在末日面前记录一切的文明。';
        } else if (hasDaily && hasPhilosophy) {
            title = '爱与记忆';
            description = '你保存了萨拉达斯的日常生活与哲学。后世将看到它的平凡、它的思考、它的温暖。这是一个用日常抵抗遗忘的文明。';
        } else if (hasPhilosophy && hasArt) {
            title = '星空之梦';
            description = '你保存了萨拉达斯的哲学与艺术。后世将看到它的梦想、它的追问、它的美。这是一个仰望星空的文明。';
        } else {
            title = '碎片收集者';
            description = `你保存了萨拉达斯的 ${completed.length} 条记忆碎片。虽然后世看到的只是冰山一角，但每一片都是真实的。${vaultNames.slice(0, 2).join('、')}——这些是你在黑暗中选择守护的。`;
        }
    } else if (totalPercent >= 0.1) {
        title = '微光守护者';
        description = `你保存了 ${completed.length} 条记忆碎片。虽然后世只能看到萨拉达斯的零星片段，但至少——他们知道这里曾经存在过一个文明。${vaultNames.length > 0 ? '你特别守护了' + vaultNames[0] + '。' : ''}`;
    } else {
        title = '寂静圣所';
        description = '你选择了沉默。圣所中空空如也，后世将永远不知道萨拉达斯曾存在过。也许……遗忘也是一种选择。';
    }
    
    return { title, description, totalPercent: Math.round(totalPercent * 100) };
}

// ==========================================
// 隐藏结局系统（数据驱动）
// ==========================================

function getVaultCompletion(vaultId) {
    const archives = MemorySanctuary.data.archives.filter(a => a.vault === vaultId && !a.ngPlusExclusive);
    const completed = MemorySanctuary.state.completedArchives;
    const done = archives.filter(a => completed.includes(a.id)).length;
    return { done, total: archives.length, ratio: archives.length > 0 ? done / archives.length : 0 };
}

function checkEndingCondition(condition) {
    if (condition.allVaults && condition.minVaultCompletion) {
        const vaults = MemorySanctuary.data.vaults;
        return vaults.every(v => getVaultCompletion(v.id).ratio >= condition.minVaultCompletion);
    }
    if (condition.vaults && condition.minCompletion) {
        return condition.vaults.every(vid => getVaultCompletion(vid).ratio >= condition.minCompletion);
    }
    if (condition.minPercent !== undefined && condition.maxPercent !== undefined) {
        const total = MemorySanctuary.data.archives.filter(a => !a.ngPlusExclusive).length;
        const pct = total > 0 ? MemorySanctuary.state.completedArchives.length / total : 0;
        return pct >= condition.minPercent && pct <= condition.maxPercent;
    }
    if (condition.type === 'zero_completion') {
        return MemorySanctuary.state.completedArchives.filter(id => {
            const a = getArchiveById(id);
            return a && !a.ngPlusExclusive;
        }).length === 0 && MemorySanctuary.state.week >= (condition.weekMin || 10);
    }
    return false;
}

function checkGuardianFinale(guardianId) {
    const tier = getMoodTier(guardianId);
    if (tier !== 'intimate') return null;
    const guardian = getGuardianById(guardianId);
    if (!guardian || !guardian.endingDialogues) return null;
    const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
    const moodIndicator = getMoodIndicator(guardianId);
    return {
        id: 'guardian_' + guardianId + '_finale',
        title: guardian.name + '的专属结局',
        description: guardian.endingDialogues.ending.join('\\n\\n') + '\\n\\n【与' + guardian.name + '的关系：' + tierNames[tier] + ' ' + moodIndicator + '】',
        unlockEntry: guardian.endingDialogues.unlockEntry || null
    };
}

function checkHiddenEndings() {
    const state = MemorySanctuary.state;
    const data = MemorySanctuary.data;
    const completed = state.completedArchives;
    const archives = data.archives.filter(a => !a.ngPlusExclusive);
    const total = archives.length;
    const ngData = getNGPlusData();

    // 0. True ending (highest priority, requires playthrough 5+ and special trigger)
    if (ngData.playthroughCount >= 5 && state.pendingEnding === 'true_ending') {
        const ending = (data.endings || []).find(e => e.id === 'true_ending');
        return {
            id: 'true_ending',
            title: ending ? ending.title : '✨ 超越时间',
            description: ending ? ending.description : '你打破了循环。',
            priority: 200
        };
    }

    // 1. 守护者个人线结局（最高优先级，但全收集优先）
    const guardianEndings = [];
    for (const gid of ['tika', 'finn', 'misha', 'lorn', 'ethel']) {
        const ge = checkGuardianFinale(gid);
        if (ge) guardianEndings.push(ge);
    }

    // 1. 全收集结局（100%）
    const allDone = archives.every(a => completed.includes(a.id));
    if (allDone && total > 0) {
        const ending = (data.endings || []).find(e => e.id === 'complete_memory');
        return {
            id: 'complete_memory',
            title: ending ? ending.title : '🌟 永恒记忆',
            description: ending ? ending.description : '你保存了萨拉达斯文明的每一片碎片。',
            priority: 100,
            allGuardiansHappy: guardianEndings.length >= 3
        };
    }

    // 2. 守护者个人线结局
    if (guardianEndings.length > 0) {
        // 返回最高优先级的守护者结局
        return { ...guardianEndings[0], priority: 90 };
    }

    // 3. Vault组合结局 & 百分比结局（按priority排序）
    const sortedEndings = [...(data.endings || [])].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const ending of sortedEndings) {
        if (ending.id === 'complete_memory') continue;
        if (ending.type === 'guardian_finale') continue;
        if (checkEndingCondition(ending.condition)) {
            return { id: ending.id, title: ending.title, description: ending.description, priority: ending.priority };
        }
    }

    // 4. 兜底：基于完成度的普通结局
    const pct = total > 0 ? completed.length / total : 0;
    if (pct >= 0.7) return { id: 'guardian_of_remnants', title: '文明守护者', description: '你保存了大部分文明碎片。后世将看到一个虽不完整但足够真实的萨拉达斯。', priority: 50 };
    if (pct >= 0.4) return { id: 'fragment_keeper', title: '碎片收集者', description: `你保存了萨拉达斯的 ${completed.length} 条记忆碎片。虽然后世看到的只是冰山一角，但每一片都是真实的。`, priority: 50 };
    if (pct >= 0.1) return { id: 'whisper_keeper', title: '微光守护者', description: `你保存了 ${completed.length} 条记忆碎片。虽然后世只能看到萨拉达斯的零星片段，但至少——他们知道这里曾经存在过一个文明。`, priority: 30 };
    if (state.week >= 20) return { id: 'silent_sanctuary', title: '🖤 寂静圣所', description: '你选择了沉默。圣所中空空如也，后世将永远不知道萨拉达斯曾存在过。也许……遗忘也是一种选择。', priority: 10 };

    return null;
}

function getEndingModalData(ending) {
    const portrait = generateCivilizationPortrait();
    const state = MemorySanctuary.state;
    const ngData = getNGPlusData();

    let modalContent = `你选择在此刻封印记忆圣所。\n\n`;
    modalContent += `【文明画像】\n${portrait.title}\n${portrait.description}\n\n`;
    modalContent += `最终统计：\n`;
    modalContent += `• 运行周数：${state.week} 周\n`;
    modalContent += `• 归档条目：${state.completedArchives.length} / ${MemorySanctuary.data.archives.filter(a => !a.ngPlusExclusive).length}\n`;
    modalContent += `• 文明完整度：${portrait.totalPercent}%\n\n`;

    if (ending) {
        modalContent += `【结局】\n${ending.title}\n${ending.description}\n\n`;
    }

    if (ngData.playthroughCount > 0) {
        modalContent += `多周目进度：\n`;
        modalContent += `• 已完成周目：${ngData.playthroughCount}\n`;
        modalContent += `• 累计归档：${ngData.totalArchivesSaved} 条\n`;
        if (ngData.bestRun) {
            modalContent += `• 最佳记录：${ngData.bestRun.count} 条（第${ngData.bestRun.week}周）\n`;
        }
        modalContent += `\n`;
    }

    // 守护者关系总结
    if (state.guardianMoods && Object.keys(state.guardianMoods).length > 0) {
        modalContent += `守护者关系：\n`;
        const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
        for (const [guardianId, mood] of Object.entries(state.guardianMoods)) {
            const guardian = getGuardianById(guardianId);
            if (guardian) {
                const tier = getMoodTier(guardianId);
                modalContent += `• ${guardian.name}：${tierNames[tier]}（${getMoodIndicator(guardianId)}）\n`;
            }
        }
    }

    modalContent += `\n你的选择决定了后世「看到」怎样的萨拉达斯文明。\n`;
    modalContent += `「——终来之刻，何物当存？」`;

    return modalContent;
}

function canSealSanctuary() {
    if (!MemorySanctuary.state) return false;
    return MemorySanctuary.state.week >= 20;
}

function sealSanctuary() {
    MemorySanctuary.state.gameOver = true;
    const archivedCount = MemorySanctuary.state.completedArchives.length;
    const totalCount = MemorySanctuary.data.archives.length;
    const ngData = getNGPlusData();

    // Update NG+ data
    ngData.totalArchivesSaved = (ngData.totalArchivesSaved || 0) + archivedCount;
    if (!ngData.bestRun || archivedCount > ngData.bestRun.count) {
        ngData.bestRun = { count: archivedCount, week: MemorySanctuary.state.week };
    }
    
    // Check if all guardians have high moods (bonus)
    const state = MemorySanctuary.state;
    const allGuardiansHappy = Object.keys(state.guardianMoods || {}).length >= 3 &&
        Object.values(state.guardianMoods).filter(mood => mood >= 3).length >= 3;
    
    if (allGuardiansHappy) {
        ngData.bonuses.push({ type: 'mood_bonus', label: '守护者信任 +10能源' });
        addLog('💖 守护者们的信任带来了额外奖励！', 'success');
    }
    
    // Record guardian finales seen
    for (const gid of ['tika', 'finn', 'misha', 'lorn', 'ethel']) {
        if (getMoodTier(gid) === 'intimate') {
            recordGuardianFinale(gid);
        }
    }
    
    // Record guardian moods for history
    const currentMoods = {};
    for (const gid of ['tika', 'finn', 'misha', 'lorn', 'ethel']) {
        currentMoods[gid] = {
            tier: getMoodTier(gid),
            mood: getMoodLevel(gid),
            indicator: getMoodIndicator(gid)
        };
    }
    ngData.guardianHistory.push({
        playthrough: ngData.playthroughCount + 1,
        week: state.week,
        moods: currentMoods
    });
    
    saveNGPlusData(ngData);

    // Check for hidden endings first
    const ending = checkHiddenEndings();
    
    // Show unlock message for guardian endings
    if (ending && ending.id && ending.id.startsWith('guardian_') && ending.id.endsWith('_finale')) {
        const gid = ending.id.replace('guardian_', '').replace('_finale', '');
        const guardian = getGuardianById(gid);
        if (guardian) {
            addLog(`💕 解锁${guardian.name}的专属结局！`, 'success');
        }
    }
    
    // Check seal achievements
    if (typeof checkSealAchievements === 'function') {
        checkSealAchievements(ending ? ending.id : null, state.week);
    }
    
    // Apply NG+ count
    startNewGamePlus();
    
    // Show ending VN if scene exists, otherwise show modal directly
    const endingSceneId = ending ? ending.id : 'silent_sanctuary';
    if (typeof VN !== 'undefined' && VN.getEndingScene(endingSceneId)) {
        VN.showEnding(endingSceneId, () => {
            // After VN completes, show stats modal
            const modalContent = getEndingModalData(ending);
            showSealModalWithContent(modalContent, ending);
        });
    } else {
        // Fallback: show modal directly
        const modalContent = getEndingModalData(ending);
        showSealModalWithContent(modalContent, ending);
    }
}

function showSealModalWithContent(modalContent, ending, isGameOver = false) {
    // Hide modal overlay if visible
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
    
    // Show the full ending summary page
    showEndingSummaryPage(ending, isGameOver);
}

function showEndingSummaryPage(ending, isGameOver = false) {
    const pageOverlay = document.getElementById('ending-overlay');
    const titleEl = document.getElementById('ending-title');
    const portraitEl = document.getElementById('ending-portrait');
    const statsEl = document.getElementById('ending-stats');
    const guardiansEl = document.getElementById('ending-guardians');
    const ngEl = document.getElementById('ending-ng');
    const returnBtn = document.getElementById('ending-return-btn');
    
    if (!pageOverlay) return;
    
    // Set title
    titleEl.textContent = isGameOver ? '圣所已崩溃' : '圣所封印';
    
    // Generate civilization portrait
    const portrait = generateCivilizationPortrait();
    
    // Portrait section
    portraitEl.innerHTML = `
        <h3>${portrait.title}</h3>
        <p>${portrait.description}</p>
    `;
    
    // Stats section
    const state = MemorySanctuary.state;
    const totalArchives = MemorySanctuary.data.archives.filter(a => !a.ngPlusExclusive).length;
    statsEl.innerHTML = `
        <div class="ending-stat">
            <div class="ending-stat-value">${state.week}</div>
            <div class="ending-stat-label">运行周数</div>
        </div>
        <div class="ending-stat">
            <div class="ending-stat-value">${state.completedArchives.length}/${totalArchives}</div>
            <div class="ending-stat-label">归档条目</div>
        </div>
        <div class="ending-stat">
            <div class="ending-stat-value">${portrait.totalPercent}%</div>
            <div class="ending-stat-label">文明完整度</div>
        </div>
    `;
    
    // Guardians section
    const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
    const guardianRows = [];
    if (state.guardianMoods) {
        for (const [guardianId, mood] of Object.entries(state.guardianMoods)) {
            const guardian = getGuardianById(guardianId);
            if (guardian) {
                const tier = getMoodTier(guardianId);
                const indicator = getMoodIndicator(guardianId);
                guardianRows.push(`
                    <div class="ending-guardian-row">
                        <span class="ending-guardian-avatar">${guardian.avatar}</span>
                        <span class="ending-guardian-name">${guardian.name}</span>
                        <span class="ending-guardian-tier ${tier}">${indicator} ${tierNames[tier]}</span>
                    </div>
                `);
            }
        }
    }
    guardiansEl.innerHTML = `<h3>守护者关系</h3>${guardianRows.join('')}`;
    
    // NG+ section
    const ngData = getNGPlusData();
    if (ngData.playthroughCount > 0) {
        ngEl.innerHTML = `
            <h3>多周目进度</h3>
            <div class="ending-ng-row">
                <span class="ending-ng-label">已完成周目</span>
                <span class="ending-ng-value">${ngData.playthroughCount}</span>
            </div>
            <div class="ending-ng-row">
                <span class="ending-ng-label">累计归档</span>
                <span class="ending-ng-value">${ngData.totalArchivesSaved} 条</span>
            </div>
            <div class="ending-ng-row">
                <span class="ending-ng-label">最佳记录</span>
                <span class="ending-ng-value">${ngData.bestRun ? `${ngData.bestRun.count} 条` : '—'}</span>
            </div>
        `;
        ngEl.classList.remove('hidden');
    } else {
        ngEl.classList.add('hidden');
    }
    
    // Return button
    returnBtn.onclick = () => {
        pageOverlay.classList.add('hidden');
        showTitleScreen();
    };
    
    pageOverlay.classList.remove('hidden');
}



function renderSealButton() {
    const container = document.getElementById('save-info');
    if (!container) return;

    // Only show seal button if game is active (state exists)
    if (!MemorySanctuary.state) {
        container.innerHTML = '';
        return;
    }

    const canSeal = canSealSanctuary();
    const archivedCount = MemorySanctuary.state.completedArchives.length;

    if (!canSeal) {
        const weeksLeft = 20 - MemorySanctuary.state.week;
        container.innerHTML = `圣所需运行至少 20 周方可封印。还需 ${weeksLeft} 周。`;
        return;
    }

    container.innerHTML = '';
    const sealBtn = document.createElement('button');
    sealBtn.id = 'seal-btn';
    sealBtn.textContent = `封印圣所（已归档 ${archivedCount} 条）`;
    sealBtn.addEventListener('click', () => {
        if (confirm('确定封印圣所吗？这将结束当前周目并解锁多周目奖励。')) {
            sealSanctuary();
        }
    });
    container.appendChild(sealBtn);
}

// Override renderSaveSlots to also render the seal button
const _origRenderSaveSlots = renderSaveSlots;
renderSaveSlots = function(mode) {
    _origRenderSaveSlots(mode);
    renderSealButton();
};

// ==========================================
// 圣所维护项目系统
// ==========================================

function initProjects() {
    if (!MemorySanctuary.state) return;
    if (!MemorySanctuary.state.activeProjects) MemorySanctuary.state.activeProjects = [];
    if (!MemorySanctuary.state.completedProjects) MemorySanctuary.state.completedProjects = [];
}

function getProjectById(projectId) {
    if (!MemorySanctuary.data.projects) return null;
    return MemorySanctuary.data.projects.find(p => p.id === projectId) || null;
}

function canStartProject(project) {
    if (!project) return false;
    const state = MemorySanctuary.state;
    const week = state.week;

    // Check if available
    if (project.availableAfter && week < project.availableAfter) return false;

    // Check if already active
    if (state.activeProjects.some(p => p.id === project.id)) return false;

    // Check if already completed (and not repeatable)
    if (!project.repeatable && state.completedProjects.includes(project.id)) return false;

    // Check if we have enough resources
    if (project.cost) {
        if (project.cost.energy && state.resources.energy < project.cost.energy) return false;
        if (project.cost.media && state.resources.media < project.cost.media) return false;
        if (project.cost.environment && state.resources.environment < project.cost.environment) return false;
        if (project.cost.food && state.resources.food < project.cost.food) return false;
    }

    return true;
}

function startProject(projectId) {
    const project = getProjectById(projectId);
    if (!project || !canStartProject(project)) return false;

    const state = MemorySanctuary.state;

    // Deduct cost
    if (project.cost) {
        if (project.cost.energy) state.resources.energy -= project.cost.energy;
        if (project.cost.media) state.resources.media -= project.cost.media;
        if (project.cost.environment) state.resources.environment -= project.cost.environment;
    }

    // Add to active projects
    state.activeProjects.push({
        id: project.id,
        remainingWeeks: project.duration,
        effect: project.effect
    });

    addLog(`开始项目：${project.name}`, 'system');
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
    return true;
}

function processActiveProjects() {
    const state = MemorySanctuary.state;
    if (!state.activeProjects || state.activeProjects.length === 0) return;

    const stillActive = [];

    for (const active of state.activeProjects) {
        const project = getProjectById(active.id);
        if (!project) continue;

        active.remainingWeeks--;

        if (active.remainingWeeks <= 0) {
            // Project completed
            state.completedProjects.push(active.id);
            applyProjectEffect(project, true);
            addLog(`项目完成：${project.name}`, 'success');
            if (typeof AudioSystem !== 'undefined' && AudioSystem.playProjectComplete) {
                AudioSystem.playProjectComplete();
            }
        } else {
            // Project still active, apply ongoing effect
            applyProjectEffect(project, false);
            stillActive.push(active);
        }
    }

    state.activeProjects = stillActive;
}

function applyProjectEffect(project, isCompletion) {
    const state = MemorySanctuary.state;
    const effect = project.effect;
    if (!effect) return;

    switch (effect.type) {
        case 'resourceBoost':
            if (!isCompletion && effect.amount) {
                const cap = effect.resource === 'media' ? 150 : (effect.resource === 'food' ? 80 : 150);
                state.resources[effect.resource] = Math.min(
                    cap,
                    state.resources[effect.resource] + effect.amount
                );
            }
            break;
        case 'foodBoost':
            if (!isCompletion && effect.amount) {
                state.resources.food = Math.min(80, state.resources.food + effect.amount);
            }
            break;
        case 'decayReduction':
            // Applied in getWeeklyDecay
            break;
        case 'unlockArchives':
            if (isCompletion && effect.archiveIds) {
                effect.archiveIds.forEach(archiveId => {
                    const archive = getArchiveById(archiveId);
                    if (archive) {
                        // Make sure it's available
                        archive.availableAfter = Math.min(archive.availableAfter || 999, state.week);
                    }
                });
            }
            break;
    }

    // Guardian bonus
    if (project.guardianBonus) {
        const guardianId = project.guardianBonus.guardian;
        const requiredMood = project.guardianBonus.mood;
        const currentMood = getMoodLevel(guardianId);

        if (currentMood >= requiredMood) {
            // Apply bonus
            if (project.guardianBonus.durationBonus) {
                // Extend duration by adding to remaining weeks
                const active = state.activeProjects.find(p => p.id === project.id);
                if (active) {
                    active.remainingWeeks += project.guardianBonus.durationBonus;
                }
            }
            if (project.guardianBonus.extraEffect === 'environmentBoost') {
                state.resources.environment = Math.min(100, state.resources.environment + 3);
            }
        }
    }
}

// ==========================================
// 终局事件强制触发
// ==========================================

function processFinaleEvents() {
    const state = MemorySanctuary.state;
    const week = state.week;
    const finaleEvents = MemorySanctuary.data.events.filter(e => e.trigger.type === 'finale');

    for (const event of finaleEvents) {
        if (week >= event.trigger.weekMin && week <= event.trigger.weekMax) {
            // Force trigger - skip probability check
            if (!state.activeEventIds.includes(event.id)) {
                triggerEvent(event);
            }
        }
    }
}

// ==========================================
// Hook into onTimeAdvanced
// ==========================================

// Override the original onTimeAdvanced to also process projects and finale events
const _originalOnTimeAdvanced = onTimeAdvanced;
onTimeAdvanced = function(weeks) {
    _originalOnTimeAdvanced(weeks);
    processActiveProjects();
    processFinaleEvents();
    if (weeks > 0 && typeof checkNGPlusPersonalEvents === 'function') checkNGPlusPersonalEvents();
};
