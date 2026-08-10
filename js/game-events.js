/**
 * game-events.js - 从 game.js 拆分的模块
 * 包含: initEventSystem, checkRandomEvent, checkGuardianPersonalEvent...
 */

function initEventSystem() {
    // 定期检查随机事件
    if (DEBUG) console.log('[事件系统] 初始化完成');
}


function checkRandomEvent() {
    if (MemorySanctuary.activeEvent) return; // 已有活跃事件
    
    const week = MemorySanctuary.state.week;
    const ngData = getNGPlusData();
    
    // 检查守护者个人事件（最高优先级）
    const guardianEvent = checkGuardianPersonalEvent();
    if (guardianEvent) {
        triggerEvent(guardianEvent);
        return;
    }
    
    // 饥荒预警事件（条件触发，食物低于15时）
    const famineWarning = MemorySanctuary.data.events.find(e => e.id === 'event_famine_warning_01');
    if (famineWarning && MemorySanctuary.state.resources.food <= 15 && !MemorySanctuary.state.activeEventIds.includes(famineWarning.id)) {
        if (week >= famineWarning.trigger.weekMin && week <= famineWarning.trigger.weekMax) {
            triggerEvent(famineWarning);
            return;
        }
    }
    
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
        }
        
        // Mood tier filtering for guardian-specific events
        if (e.trigger.moodTier) {
            const guardianId = e.guardianId || e.trigger.guardianId;
            if (guardianId) {
                const tier = getMoodTier(guardianId);
                if (tier !== e.trigger.moodTier) return false;
            }
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


function checkGuardianPersonalEvent() {
    const state = MemorySanctuary.state;
    const events = MemorySanctuary.data.guardianEvents || [];
    
    for (const event of events) {
        if (state.activeEventIds.includes(event.id)) continue;
        
        const trigger = event.trigger;
        if (!trigger) continue;
        
        // 检查触发条件
        if (trigger.type === 'mood_check') {
            const guardianMood = state.guardianMoods[event.guardianId] || 0;
            const tier = getMoodTier(event.guardianId);
            if (tier !== trigger.moodTier) continue;
            if (state.week < trigger.weekMin) continue;
            if (Math.random() > (trigger.probability || 0.15)) continue;
            return event;
        }
        
        if (trigger.type === 'week') {
            if (state.week !== trigger.week) continue;
            if (Math.random() > (trigger.probability || 0.3)) continue;
            return event;
        }
        
        if (trigger.type === 'exploration_complete') {
            if (state.week < 10) continue;
            if (Math.random() > (trigger.probability || 0.25)) continue;
            return event;
        }
    }
    
    return null;
}


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
    
    // 守护者个人事件触发音效
    if (event.guardianId && typeof AudioSystem !== 'undefined') {
        AudioSystem.playGuardianEventTrigger();
    }
    
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
        btn.setAttribute('role', 'button');
        btn.addEventListener('click', () => resolveEvent(index));
        choicesEl.appendChild(btn);
    });
    
    // 强制重排以触发过渡动画
    void panel.offsetHeight;
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
    
    // 守护者个人事件效果
    const moodKey = event.guardianId + 'Mood';
    if (choice.effect[moodKey]) {
        adjustGuardianMood(event.guardianId, choice.effect[moodKey]);
    }
    if (choice.effect.revealArchive) {
        const archive = getArchiveById(choice.effect.revealArchive);
        if (archive) {
            addLog(`📜 新条目解锁：「${archive.title}」`, 'success');
        }
    }
    
    // 资源变化后立即检查衰竭状态
    if (typeof checkSanctuaryDeterioration === 'function') checkSanctuaryDeterioration();
    
    if (choice.effect.time) {
        advanceTime(choice.effect.time);
    }
    
    // 播放结果音效
    if (choice.sound === 'vn_dialogue' && typeof AudioSystem !== 'undefined') {
        AudioSystem.playVNAdvance();
    }
    
    // 守护者事件特有反馈
    if (event.guardianId && typeof AudioSystem !== 'undefined') {
        if (choice.effect && choice.effect[event.guardianId + 'Mood'] > 0) {
            AudioSystem.playExploreReturnNarrative();
        }
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
    
    // Handle guardian departure
    if (choice.effect.guardianDeparture) {
        const gid = choice.effect.guardianDeparture;
        if (!MemorySanctuary.state.departedGuardians.includes(gid)) {
            MemorySanctuary.state.departedGuardians.push(gid);
        }
        const guardian = getGuardianById(gid);
        const name = guardian ? guardian.name : gid;
        addLog(`💫 ${name} 暂时离开了圣所。`, 'warning');
    }

    // Handle guardian sacrifice
    if (choice.effect.guardianSacrifice) {
        MemorySanctuary.state.guardianSacrifice = true;
        MemorySanctuary.state.sacrificedGuardian = choice.effect.guardianSacrifice;
        if (!MemorySanctuary.state.departedGuardians.includes(choice.effect.guardianSacrifice)) {
            MemorySanctuary.state.departedGuardians.push(choice.effect.guardianSacrifice);
        }
        addLog(`💫 ${choice.effect.guardianSacrifice} 选择了牺牲。`, 'warning');
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
    const guardiansWithDialogue = getAvailableGuardiansWithDialogue('event');
    if (guardiansWithDialogue.length > 0) {
        const randomGuardian = guardiansWithDialogue[Math.floor(Math.random() * guardiansWithDialogue.length)];
        showGuardianDialogue(randomGuardian.id, 'event');
    }
    
    renderAll();
    if (typeof checkStuckState === 'function') checkStuckState();
}


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


function formatReward(reward) {
    const parts = [];
    if (reward.energy) parts.push(`能源+${reward.energy}`);
    if (reward.media) parts.push(`介质+${reward.media}`);
    if (reward.environment) parts.push(`环境+${reward.environment}`);
    return parts.join('、') || '无';
}


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
        if (DEBUG) console.warn(`[调度事件] 找不到事件 ${eventId}`);
        return;
    }
    
    // 如果已有活跃事件，将调度事件推迟到下周
    if (MemorySanctuary.activeEvent) {
        const state = MemorySanctuary.state;
        if (!state.scheduledEvents) state.scheduledEvents = [];
        state.scheduledEvents.push({ eventId, week: state.week + 1 });
        if (DEBUG) console.log(`[调度事件] ${event.title} 因已有活跃事件而推迟到下周`);
        return;
    }
    
    // 使用与随机事件相同的触发机制
    MemorySanctuary.activeEvent = event;
    MemorySanctuary.state.activeEventIds.push(event.id);
    addLog(`📅 ${event.title}`, 'event');
    renderEvent(event);
}


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
