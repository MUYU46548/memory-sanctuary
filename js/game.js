/**
 * game.js - 游戏核心逻辑
 * 资源管理、归档流程、存储室管理、事件系统
 */

// 调试模式开关：发布时设为 false，开发时设为 true
var DEBUG = false;

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





// ==========================================
// 归档士气奖励
// ============================================================

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
    
    const previousChapter = MemorySanctuary.state.chapter;
    MemorySanctuary.state.week += weeks;
    MemorySanctuary.state.chapter = Math.ceil(MemorySanctuary.state.week / 4);
    
    // 章节过渡动画
    if (previousChapter !== MemorySanctuary.state.chapter && typeof showChapterTitle === 'function') {
        showChapterTitle(MemorySanctuary.state.chapter);
    }
    
    onTimeAdvanced(weeks);
}

function onTimeAdvanced(weeks) {
    const state = MemorySanctuary.state;
    
    // 重置每回合资源变化追踪
    state.resourceChanges = { energy: 0, media: 0, environment: 0, food: 0 };
    
    try {
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
        state.resources.food = Math.max(0,
            state.resources.food - decay.food * weeks
        );
        
        // 追踪衰减为负值
        state.resourceChanges.energy -= decay.energy * weeks;
        state.resourceChanges.media -= decay.media * weeks;
        state.resourceChanges.environment -= decay.environment * weeks;
        state.resourceChanges.food -= decay.food * weeks;

        // 应用持续效果（如：每回合额外能源）
        applySustainedBonuses();
        
        // 士气持续压力（资源/环境影响心情）
        applyMoralePressure();
        if (state.emergencyCorruption > 0) {
            state.emergencyCorruption = Math.max(0, state.emergencyCorruption - 2);
        }
        
        // 季节影响食物产出（每12周一个季节循环）
        if (typeof applySeasonalEffects === 'function') applySeasonalEffects();
        
        // 食物充裕/枯竭奖惩
        if (typeof checkFoodAbundancePenalty === 'function') checkFoodAbundancePenalty();
        
        // 腐败度惩罚：每20点，所有资源额外 -0.5/周（食物受影响但减半）
        if (state.emergencyCorruption > 0) {
            const penalty = Math.floor(state.emergencyCorruption / 20) * 0.5;
            const foodPenalty = penalty * 0.5;
            if (penalty > 0) {
                state.resources.energy = Math.max(0, state.resources.energy - penalty);
                state.resources.media = Math.max(0, state.resources.media - penalty);
                state.resources.environment = Math.max(0, state.resources.environment - penalty);
                if (foodPenalty > 0) {
                    state.resources.food = Math.max(0, state.resources.food - foodPenalty);
                }
                state.resourceChanges.energy -= penalty;
                state.resourceChanges.media -= penalty;
                state.resourceChanges.environment -= penalty;
                if (foodPenalty > 0) {
                    state.resourceChanges.food -= foodPenalty;
                }
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
        
    } catch (err) {
        if (DEBUG) console.error('[onTimeAdvanced] 子系统异常:', err);
        // 继续执行 renderAll — UI 不会白屏
    }
}

// ==========================================
// 持续效果系统（来自调度事件奖励）
// ==========================================

function applySustainedBonuses() {
    const state = MemorySanctuary.state;
    if (!state.unlockedBonuses) return;
    
    // 士气效率修正
    const moraleModifier = getMoraleEfficiencyBonus();
    
    // 应用持续效果
    state.unlockedBonuses.forEach(bonus => {
        if (bonus === 'energy_per_turn_3') {
            const gain = Math.round(3 * moraleModifier * 10) / 10; // 保留一位小数
            const before = state.resources.energy;
            state.resources.energy = Math.min(150, state.resources.energy + gain);
            const actualGain = state.resources.energy - before;
            state.resourceChanges.energy = (state.resourceChanges.energy || 0) + actualGain;
        } else if (bonus === 'energy_per_turn_2') {
            const gain = Math.round(2 * moraleModifier * 10) / 10;
            const before = state.resources.energy;
            state.resources.energy = Math.min(150, state.resources.energy + gain);
            const actualGain = state.resources.energy - before;
            state.resourceChanges.energy = (state.resourceChanges.energy || 0) + actualGain;
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
            const cap = effect.resource === 'media' ? 150 : (effect.resource === 'food' ? 80 : (effect.resource === 'energy' ? 150 : 100));
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

function recalculateResourceChanges() {
    const state = MemorySanctuary.state;
    if (!state) return;
    
    state.resourceChanges = { energy: 0, media: 0, environment: 0, food: 0 };
    
    const decay = getWeeklyDecay();
    state.resourceChanges.energy -= decay.energy;
    state.resourceChanges.media -= decay.media;
    state.resourceChanges.environment -= decay.environment;
    state.resourceChanges.food -= decay.food;
    
    if (typeof getCurrentSeason === 'function') {
        const season = getCurrentSeason();
        if (season.foodMod !== 0) state.resourceChanges.food += season.foodMod;
    }
    
    if (state.emergencyCorruption > 0) {
        const penalty = Math.floor(state.emergencyCorruption / 20) * 0.5;
        const foodPenalty = penalty * 0.5;
        if (penalty > 0) {
            state.resourceChanges.energy -= penalty;
            state.resourceChanges.media -= penalty;
            state.resourceChanges.environment -= penalty;
            if (foodPenalty > 0) state.resourceChanges.food -= foodPenalty;
        }
    }
    
    if (state.unlockedBonuses) {
        state.unlockedBonuses.forEach(bonus => {
            if (bonus === 'energy_per_turn_3') state.resourceChanges.energy += 3;
            else if (bonus === 'energy_per_turn_2') state.resourceChanges.energy += 2;
        });
    }
    
    if (state.activeProjects) {
        state.activeProjects.forEach(p => {
            const proj = getProjectById(p.id);
            if (!proj || !proj.effect) return;
            const e = proj.effect;
            if (e.type === 'resourceBoost' && e.resource && e.amount) {
                state.resourceChanges[e.resource] += e.amount;
            } else if (e.type === 'foodBoost' && e.amount) {
                state.resourceChanges.food += e.amount;
            }
        });
    }
    
    if (state.ongoingEffects) {
        state.ongoingEffects.forEach(eff => {
            if (eff.resource && eff.amount) state.resourceChanges[eff.resource] += eff.amount;
        });
    }
}

// ============================================================
// 士气持续压力系统（资源/环境/时间 → 心情）
// ============================================================
function applyMoralePressure() {
    const state = MemorySanctuary.state;
    if (!state.guardianMoods) return;
    
    // 初始化每位守护者的心情（仅首次）
    Object.keys(state.guardianMoods).forEach(gid => {
        if (typeof state.guardianMoods[gid] !== 'number') {
            state.guardianMoods[gid] = 0;
        }
    });
    
    const food = state.resources.food;
    const energy = state.resources.energy;
    const environment = state.resources.environment;
    const weights = getFoodMoodWeight();
    
    // 计算资源紧张度 (0..1)
    const foodTension = Math.max(0, (30 - food) / 30);      // 食物<30开始紧张
    const energyTension = Math.max(0, (30 - energy) / 30);
    const envTension = Math.max(0, (50 - environment) / 50);
    
    // 时间压力：越到后期越紧张 (week 1..48 → 0..0.3)
    const timeTension = Math.min(0.3, (state.week / 48) * 0.3);
    
    // 综合压力 = max(资源紧张) + 时间压力（封顶 1.0）
    const totalPressure = Math.min(1.0, Math.max(foodTension, energyTension, envTension) + timeTension);
    
    // 压力转化为心情下降（每回合 -0.2 ~ -1.0）
    const pressureDelta = -Math.round(totalPressure * 10) / 10; // 0.1步长
    
    Object.keys(state.guardianMoods).forEach(gid => {
        const weight = weights[gid] || 1;
        const before = state.guardianMoods[gid];
        const delta = pressureDelta * weight;
        state.guardianMoods[gid] = Math.max(-10, Math.min(10, before + delta));
    });
}

// ==========================================
// 调度事件系统
// ==========================================



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
    
    // 士气效率修正：高士气减少衰减，低士气增加衰减
    // bonus: 1.15(excellent) … 0.85(critical)
    // 衰减修正公式: decay * (2 - bonus)，使 1.15→0.85（减衰减），0.85→1.15（加衰减）
    const moraleBonus = getMoraleEfficiencyBonus();
    const decayModifier = 2 - moraleBonus;
    
    // 基础衰减值
    let energyDecay = 1.0 * multiplier * decayModifier;
    let mediaDecay = 0.5 * multiplier * decayModifier;
    let environmentDecay = 0.5 * multiplier * decayModifier;
    const foodDecay = 0.3 * multiplier * decayModifier;
    
    // 应用项目衰减减免（decayReduction 类型）
    if (state.completedProjects) {
        state.completedProjects.forEach(pid => {
            const proj = getProjectById(pid);
            if (proj && proj.effect && proj.effect.type === 'decayReduction') {
                if (proj.effect.resource === 'energy') {
                    energyDecay *= (1 - (proj.effect.percent || 0));
                } else if (proj.effect.resource === 'media') {
                    mediaDecay *= (1 - (proj.effect.percent || 0));
                } else if (proj.effect.resource === 'environment') {
                    environmentDecay *= (1 - (proj.effect.percent || 0));
                }
            }
        });
    }
    
    return { energy: energyDecay, media: mediaDecay, environment: environmentDecay, food: foodDecay };
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
    
    // 资源危急警告（任一资源低于10）
    const critical = res.energy < 10 || res.media < 10 || res.environment < 10 || res.food < 10;
    const wasCritical = state.resourceCritical || false;
    if (critical && !wasCritical) {
        state.resourceCritical = true;
        if (typeof AudioSystem !== 'undefined') AudioSystem.playHeartbeatAlert();
    } else if (!critical && wasCritical) {
        state.resourceCritical = false;
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
        
        const canSeal = canSealSanctuary();
        banner.innerHTML = `
            <span>⚠️ ${reason}。</span>
            <span>可选择<a href="#" id="stuck-skip">跳过回合</a>恢复资源${canSeal ? '，或<a href="#" id="stuck-seal">封印圣所</a>结束游戏' : ''}。</span>
        `;
        banner.className = 'stuck-banner warning';
        
        // Bind events immediately (DOM is already updated via innerHTML)
        const skipLink = document.getElementById('stuck-skip');
        if (skipLink) {
            skipLink.onclick = (e) => { e.preventDefault(); skipTurn(true); };
        }
        const sealLink = document.getElementById('stuck-seal');
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
        // 连续饥饿周计数
        state.starvationWeeks = (state.starvationWeeks || 0) + 1;
        
        // 食物耗尽时：守护者每回合心情下降（性格加权）
        if (!state.starvationLogged) {
            addLog('⚠️ 食物耗尽...守护者士气低沉。', 'warning');
            state.starvationLogged = true;
        }
        
        // 饥饿警告：第1周轻度，第2周中度，第3周严重
        if (state.starvationWeeks === 1) {
            addLog('🍂 食物储备为零。守护者们开始节食。', 'warning');
        } else if (state.starvationWeeks === 2) {
            addLog('🍂 连续两周饥饿。守护者身体虚弱，效率下降。', 'warning');
        } else if (state.starvationWeeks >= 3) {
            // 连续3周饥饿 → 圣所崩溃
            addLog('💀 长期饥饿导致圣所系统崩溃！', 'warning');
            triggerGameOver('starvation');
            return;
        }
        
        const foodWeight = getFoodMoodWeight();
        Object.keys(state.guardianMoods || {}).forEach(gid => {
            const weight = foodWeight[gid] || 1;
            const penalty = state.starvationWeeks >= 2 ? 3 * weight : 2 * weight;
            state.guardianMoods[gid] = (state.guardianMoods[gid] || 0) - penalty;
        });
        // 食物归零额外惩罚：勘探成功率下降（通过 fatigue 模拟）
        if (state.exploration && state.exploration.fatigue) {
            Object.keys(state.exploration.fatigue).forEach(gid => {
                state.exploration.fatigue[gid] = Math.min(3, (state.exploration.fatigue[gid] || 0) + 1);
            });
        }
    } else {
        if (state.starvationLogged) {
            addLog('🍖 食物恢复，守护者松了一口气。', 'success');
        }
        state.starvationLogged = false;
        state.starvationWeeks = 0;
        state.weeksWithoutStarvation = (state.weeksWithoutStarvation || 0) + 1;
    }
}

// 食物-心情权重（性格差异化反应）
function getFoodMoodWeight() {
    return {
        'misha': 1.5,   // 生态学家：对食物短缺最敏感
        'tika': 1.3,    // 歌者：情绪化，容易焦虑
        'finn': 1.0,    // 历史学者：中等
        'ethel': 0.8,   // 祭司：能忍耐
        'lorn': 0.7     // 工程师：理性，不太受影响
    };
}

// ============================================================
// 季节系统
// ============================================================

const SEASONS = [
    { name: '初春', foodMod: 0, desc: '新绿初现，圣所外微光闪烁。' },
    { name: '盛夏', foodMod: 1, desc: '炎热干燥，储备消耗加快。' },
    { name: '深秋', foodMod: -1, desc: '万物凋零，食物愈发珍贵。' },
    { name: '严冬', foodMod: -2, desc: '冰封大地，圣所陷入死寂。' }
];

function getCurrentSeason() {
    const state = MemorySanctuary.state;
    if (!state.season) state.season = { index: 0, weekEntered: 1 };
    
    const weeksPassed = state.week - state.season.weekEntered;
    if (weeksPassed >= 12) {
        state.season.index = (state.season.index + 1) % 4;
        state.season.weekEntered = state.week;
    }
    return SEASONS[state.season.index];
}

function applySeasonalEffects() {
    const state = MemorySanctuary.state;
    const season = getCurrentSeason();
    
    if (season.foodMod !== 0) {
        const change = season.foodMod;
        state.resources.food = Math.max(0, Math.min(80, state.resources.food + change));
        state.resourceChanges.food = (state.resourceChanges.food || 0) + change;
        
        // 季节变化时记录日志
        if (state.week === state.season.weekEntered) {
            const icon = change > 0 ? '🌱' : '🍂';
            addLog(`${icon} ${season.name}降临。${season.desc}`, 'system');
        }
    }
}

function checkFoodAbundancePenalty() {
    const state = MemorySanctuary.state;
    const food = state.resources.food;
    const cap = 80;
    const ratio = food / cap;
    const weights = getFoodMoodWeight();
    
    // 食物充裕（>80%）：守护者心情+1（性格加权）
    if (ratio >= 0.8 && !state.foodBonusLogged) {
        addLog('🍖 食物充裕，守护者感到欣慰。', 'success');
        state.foodBonusLogged = true;
        Object.keys(state.guardianMoods || {}).forEach(gid => {
            const weight = weights[gid] || 1;
            state.guardianMoods[gid] = Math.min(10, (state.guardianMoods[gid] || 0) + 1 * weight);
        });
    }
    // 食物中等：清除状态
    else if (ratio >= 0.4 && ratio < 0.8) {
        state.foodBonusLogged = false;
    }
    
    // 食物危机（<20%）：守护者心情-1（性格加权）
    if (ratio < 0.2 && !state.foodCrisisLogged) {
        addLog('⚠️ 食物储备告急！守护者开始焦虑。', 'warning');
        state.foodCrisisLogged = true;
        Object.keys(state.guardianMoods || {}).forEach(gid => {
            const weight = weights[gid] || 1;
            state.guardianMoods[gid] = (state.guardianMoods[gid] || 0) - 1 * weight;
        });
    } else if (ratio >= 0.2) {
        state.foodCrisisLogged = false;
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
    if (reason === 'collapse' || reason === 'starvation') {
        // 饥饿崩溃使用专属结局
        let ending = null;
        let endingSceneId = 'silent_sanctuary';
        
        if (reason === 'starvation') {
            titleText = '🍂 饥荒降临';
            contentText = '连续三周的饥饿摧毁了圣所。\n\n守护者们一个接一个倒下，圣所的核心停止了运转。没有食物，没有希望。\n\n后世永远不会知道萨拉达斯曾存在过——因为没有人活下来讲述这个故事。\n\n「饥饿是最古老的死刑。」';
            // 直接使用饥荒结局场景
            endingSceneId = 'starvation';
            const starvationEnding = MemorySanctuary.data.endings.find(e => e.id === 'starvation');
            if (starvationEnding) {
                ending = {
                    id: 'starvation',
                    title: starvationEnding.title,
                    description: starvationEnding.description,
                    priority: starvationEnding.priority || 1
                };
            }
        } else {
            // 普通崩溃：检查是否有可触发的结局
            ending = (typeof checkHiddenEndings === 'function') ? checkHiddenEndings() : null;
            endingSceneId = ending ? ending.id : 'silent_sanctuary';
        }
        
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

    // ─── 其他崩溃：直接显示 modal ───
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


// ==========================================
// 归档确认弹窗
// ==========================================


// 立即归档：消耗1次机会，不消耗介质，不推进时间

// 消耗食物换取立即归档机会


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
    state.turnsSkipped = (state.turnsSkipped || 0) + 1;
    
    addLog('维护完成：能源+18，介质+12，环境+8。', 'success');
    
    // 推进时间（触发衰减检查）
    advanceTime(1);
    
    // 检查事件（包括章节过渡VN）
    if (typeof checkRandomEvent === 'function') checkRandomEvent();
    
    // 守护者可能对此有反应
    const guardians = getAvailableGuardians();
    if (guardians.length === 0) return;
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
    // 跳过回合按钮事件已移至 initFuncBar 统一处理
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

// 获取可用的守护者列表（排除已离队的）
function getAvailableGuardians() {
    const all = MemorySanctuary.data.guardians;
    const departed = MemorySanctuary.state.departedGuardians || [];
    return all.filter(g => !departed.includes(g.id));
}

// 获取有对话的可用守护者列表（排除已离队的）
function getAvailableGuardiansWithDialogue(type) {
    const available = getAvailableGuardians();
    return available.filter(g => g.dialogues && g.dialogues[type]);
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
            updateBoostButtonState();
        });
    }
    
    // 按钮状态更新函数
    function updateBoostButtonState() {
        const boostBtn = document.getElementById('guardian-boost');
        if (!boostBtn || !MemorySanctuary.state) return;
        const state = MemorySanctuary.state;
        const onCooldown = state.lastSupplyWeek && state.lastSupplyWeek === state.week;
        boostBtn.disabled = onCooldown;
        boostBtn.textContent = onCooldown ? '🎁 分发补给品（本周已分发）' : '🎁 分发补给品';
        boostBtn.title = onCooldown ? '补给品本周已分发，下周再来吧' : '消耗 8 食物为所有守护者提供额外补给，每周限一次';
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
    
    // 分发补给品按钮
    const boostBtn = document.getElementById('guardian-boost');
    if (boostBtn) {
        boostBtn.addEventListener('click', () => {
            guardianBoostSupply();
            updateBoostButtonState();
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

function guardianBoostSupply() {
    const state = MemorySanctuary.state;
    const foodCost = 8;
    
    // 检查冷却：每周限一次
    if (state.lastSupplyWeek && state.lastSupplyWeek === state.week) {
        addLog(`补给品本周已分发过，下周再来吧。`, 'system');
        return false;
    }
    
    if (state.resources.food < foodCost) {
        addLog(`食物不足 ${foodCost}，无法分发补给品。`, 'system');
        return false;
    }
    
    state.resources.food -= foodCost;
    state.resourceChanges.food = (state.resourceChanges.food || 0) - foodCost;
    state.lastSupplyWeek = state.week;
    
    // 所有守护者心情 +2（封顶10），性格权重影响
    const weights = getFoodMoodWeight();
    Object.keys(state.guardianMoods || {}).forEach(gid => {
        const weight = weights[gid] || 1;
        const gain = Math.round(2 * weight * 10) / 10;
        state.guardianMoods[gid] = Math.min(10, (state.guardianMoods[gid] || 0) + gain);
    });
    
    addLog(`🎁 分发补给品：所有守护者心情提升（-${foodCost}食物）`, 'success');
    
    // 守护者反应
    const guardianId = getCurrentGuardianId();
    const reactions = [
        '谢谢你。我感觉好多了。',
        '这是……给我的吗？',
        '食物虽然不多，但你的心意让这一切都值得。',
        '我们还有希望。',
        '在这黑暗里，还有人关心我们。谢谢。'
    ];
    addLog(`${getGuardianName(guardianId)}：「${reactions[Math.floor(Math.random() * reactions.length)]}」`, 'guardian');
    
    if (typeof renderAll === 'function') renderAll();
    return true;
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
        // 兜底台词：根据守护者性格设计
        const fallbackDialogues = {
            'tika': '当前存储室已无待归档条目。我们做得很好。',
            'finn': '这个存储室已经清空了。历史已得到妥善保存。',
            'misha': '没有更多需要保存的了……这段记忆已经完整。',
            'lorn': '经过我的多次检查，当前存储室已经没有待办项目。',
            'ethel': '存储室已满，我们的信仰与尊严都已妥善安放。'
        };
        addLog(`${guardian.name}：「${fallbackDialogues[guardianId] || '当前存储室已无待归档条目。'}」`, 'guardian');
        showGuardianDialogue(guardianId, 'idle');
        return;
    }
    
    // 筛选已解锁的条目
    const available = unarchived.filter(e => isArchiveAvailable(e));
    
    if (available.length === 0) {
        // 所有条目都未解锁的兜底台词
        const lockedFallbackDialogues = {
            'tika': '当前存储室的条目尚未解锁。我们需要更多线索。',
            'finn': '这些记录还需要进一步发掘。让我们继续探索。',
            'misha': '还有隐藏的条目等待被发现……我们需要更深入地挖掘。',
            'lorn': '当前存储室无可用条目。建议先完成前置任务解锁更多内容。',
            'ethel': '存储室的秘密尚未完全显现。我们需要更多时间。'
        };
        addLog(`${guardian.name}：「${lockedFallbackDialogues[guardianId] || '当前存储室的条目尚未解锁。'}」`, 'guardian');
        showGuardianDialogue(guardianId, 'idle');
        return;
    }
    
    // 按资源是否足够分组
    const affordable = available.filter(e => hasResources({ energy: e.energyCost || 0, media: e.dataCost || 0 }));
    
    let recommended;
    let isAffordable = true;
    
    if (affordable.length > 0) {
        // 优先推荐可负担的条目
        const mood = getMoodLevel(guardianId);
        if (mood >= 3) {
            // 高好感度：推荐最"珍贵"的条目（成本最高）
            recommended = affordable.sort((a, b) => (b.energyCost + b.dataCost) - (a.energyCost + a.dataCost))[0];
        } else {
            // 默认：推荐成本最低的
            recommended = affordable.sort((a, b) => (a.energyCost + a.dataCost) - (b.energyCost + b.dataCost))[0];
        }
    } else {
        // 所有已解锁条目都资源不足，推荐成本最低的（标记为不可负担）
        isAffordable = false;
        recommended = available.sort((a, b) => (a.energyCost + a.dataCost) - (b.energyCost + b.dataCost))[0];
    }
    
    // 高亮推荐条目
    highlightRecommendedEntry(recommended.id);
    
    // 守护者对话（根据是否可负担调整台词）
    let dialogueText;
    if (isAffordable) {
        const recommendDialogues = {
            'tika': `我建议优先录入「${recommended.title}」——语言是文明的根基。`,
            'finn': `从历史价值来看，「${recommended.title}」值得优先保存。`,
            'misha': `「${recommended.title}」——这段记忆不应该被遗忘。`,
            'lorn': `系统建议：优先录入「${recommended.title}」，资源效率最优。`,
            'ethel': `「${recommended.title}」——它承载着我们的信仰与尊严。`
        };
        dialogueText = recommendDialogues[guardianId] || `这个条目「${recommended.title}」值得保存。`;
    } else {
        // 资源不足的提示台词
        const unaffordableDialogues = {
            'tika': `「${recommended.title}」很有价值，但当前资源不足。建议先补充能源或介质。`,
            'finn': `「${recommended.title}」的历史价值很高，但我们需要更多资源才能录入。`,
            'misha': `「${recommended.title}」……可惜现在资源不够。我们之后再回来。`,
            'lorn': `「${recommended.title}」是当前最优选择，但资源不足。建议优先补充资源。`,
            'ethel': `「${recommended.title}」值得保存，但我们需要更多资源。请谨慎分配。`
        };
        dialogueText = unaffordableDialogues[guardianId] || `「${recommended.title}」需要更多资源才能录入。`;
    }
    
    addLog(`${guardian.name}：「${dialogueText}」`, 'guardian');
    
    // 更新守护者面板对话
    const dialogueEl = document.getElementById('guardian-dialogue');
    if (dialogueEl) dialogueEl.textContent = dialogueText;
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


// ==========================================
// 事件系统
// ==========================================



// ==========================================
// 守护者个人事件系统
// ==========================================


// Check for NG+ personal events that should trigger automatically




// ==========================================
// 日志系统
// ==========================================

let logUnreadCount = 0;
let logPanelOpen = false;
let logFilter = 'all'; // 当前日志筛选类型


// 初始化日志筛选按钮

// 应用日志筛选




// ==========================================
// 弹窗系统
// ==========================================



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






// ==========================================
// 帮助与关于
// ==========================================

function initFuncBar() {
    const helpBtn = document.getElementById('help-btn');
    const aboutBtn = document.getElementById('about-btn');
    const exploreBtn = document.getElementById('explore-btn');

    // 通用按钮点击音效函数
    const btnClick = () => { if (typeof AudioSystem !== 'undefined') AudioSystem.playButtonClick(); };

    // 帮助按钮：显示帮助弹窗
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            btnClick();
            showHelpModal();
        });
    }

    // 关于按钮：显示版权信息
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => {
            btnClick();
            showAboutModal();
        });
    }

    // 跳过回合按钮
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            btnClick();
            skipTurn();
        });
    }

    // 文明图谱按钮
    const atlasBtn = document.getElementById('atlas-btn');
    if (atlasBtn) {
        atlasBtn.addEventListener('click', () => {
            btnClick();
            toggleAtlas();
        });
    }

    // 存档按钮
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            btnClick();
            openSaveScreen('save');
        });
    }

    // 返回标题按钮
    const titleBtn = document.getElementById('title-btn');
    if (titleBtn) {
        titleBtn.addEventListener('click', () => {
            btnClick();
            const slot = getCurrentSlot();
            if (slot >= 1) saveGame(slot);
            showTitleScreen();
        });
    }

    // 勘探按钮
    if (exploreBtn) {
        exploreBtn.addEventListener('click', () => {
            btnClick();
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










let selectedExplorationId = null;
let selectedGuardians = new Set();








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
                if (state.exploration.fatigue) {
                    state.exploration.fatigue[g.id] = (state.exploration.fatigue[g.id] || 0) + 2;
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
            state.emergencyArchiveUsed = (state.emergencyArchiveUsed || 0) + 1;
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



function showAboutModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    title.textContent = '关于 · 记忆圣所';

    let aboutContent = '记忆圣所 (Nar-Sil-Veth)\n';
    aboutContent += '终来之刻，何物当存？\n\n';
    aboutContent += `版本：v${GAME_VERSION}\n`;
    aboutContent += '技术：HTML5 + CSS3 + Canvas 2D + Vanilla JavaScript\n\n';
    aboutContent += '— 绒花计划 系列IP —\n\n';
    aboutContent += '守护者：\n';
    aboutContent += '  缇卡 · 首席歌者\n';
    aboutContent += '  芬恩 · 历史编年学者\n';
    aboutContent += '  米莎 · 生态学家\n';
    aboutContent += '  洛恩 · 前航天工程师\n';
    aboutContent += '  埃塞尔 · 前祭司\n\n';
    aboutContent += '━━━━━━━━━━━━━━━━━━\n';
    aboutContent += `当前存档：第 ${MemorySanctuary.state ? MemorySanctuary.state.week : '--'} 周\n`;
    aboutContent += `已归档：${MemorySanctuary.state ? MemorySanctuary.state.completedArchives.length : '--'} 条\n`;
    aboutContent += '━━━━━━━━━━━━━━━━━━\n\n';
    aboutContent += '「我们曾存在，我们曾仰望，我们曾渴望触碰你们。」';

    content.textContent = aboutContent;
    overlay.classList.remove('hidden');

    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
}

// ==========================================
// 帮助弹窗
// ============================================================
function showHelpModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = '游戏帮助';
    
    let helpContent = '欢迎来到「记忆圣所」。\n\n';
    helpContent += '【游戏目标】\n';
    helpContent += '在有限的 48 周内，尽可能多地归档文明碎片，为后世保存萨拉达斯文明的记忆。\n\n';
    helpContent += '【核心操作】\n';
    helpContent += '• 选择存储室 → 查看可归档条目 → 点击「录入归档」\n';
    helpContent += '• 归档消耗能源与存储介质，同时推进时间\n\n';
    helpContent += '【资源管理】\n';
    helpContent += '• 能源：归档的基础消耗，归零后归档能耗加倍\n';
    helpContent += '• 存储介质：归档必需品，归零后无法录入新条目\n';
    helpContent += '• 环境稳定：影响条目保存条件，归零后条目过期速度翻倍\n';
    helpContent += '• 食物：维持守护者士气，影响资源衰减效率\n\n';
    helpContent += '【进阶系统】\n';
    helpContent += '• 封印圣所（16 周起可预览，20 周后可触发）\n';
    helpContent += '• 多周目奖励：继承奖励随周目递增\n';
    helpContent += '• 圣所项目：投入资源换取持续增益\n';
    helpContent += '• 地表勘探：派出守护者获取资源\n';
    helpContent += '• 应急协议：危急时使用非常规手段\n\n';
    helpContent += '【士气系统】\n';
    helpContent += '• 守护者士气会影响资源衰减效率\n';
    helpContent += '• 资源越紧张、时间越靠后，士气压力越大\n';
    helpContent += '• 归档成功可提升士气\n';
    helpContent += '• 通过守护者菜单分发补给品可鼓舞士气\n\n';
    helpContent += '「——终来之刻，何物当存？」';
    
    content.textContent = helpContent;
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
const BACKUP_KEY_PREFIX = 'memory-sanctuary-backup-slot-';
const BACKUP_INTERVAL = 5;
let saveCounter = 0;


// 尝试从备份恢复

// 加载存档时检查损坏并尝试恢复

// 获取存档槽信息（含备份状态）





// ─── 多周目继承 ───
// ==========================================






// Check if an archive entry is available based on NG+ conditions

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
            case 'custom': {
                // 丰衣足食：连续30周食物>0
                if (c.value === 'never_starve_30' && state.weeksWithoutStarvation >= 30) earned = true;
                // 循环大师：所有循环项目各完成至少一次
                if (c.value === 'all_repeatable_projects') {
                    const repeatableIds = MemorySanctuary.data.projects.filter(p => p.repeatable).map(p => p.id);
                    const completedSet = new Set(state.completedProjects);
                    if (repeatableIds.length > 0 && repeatableIds.every(id => completedSet.has(id))) earned = true;
                }
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
    
    // 速战速决：22周或更早封印（鼓励尽早行动）
    if (week <= 22) unlockAchievement('seal_early');
    // 坚守到底：坚持到48周封印（最终周上限）
    if (week >= 48) unlockAchievement('seal_late');
    
    // 争分夺秒：不跳过任何回合
    const state = MemorySanctuary.state;
    if (state && state.turnsSkipped === 0) unlockAchievement('no_skip');
    
    // 从容不迫：不使用应急协议
    if (state && state.emergencyArchiveUsed === 0) unlockAchievement('no_emergency');
    
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


// ==========================================
// 存档界面
// ==========================================





// ─── 存档导出/导入 ───





// Start game after loading from title screen

// ==========================================
// 叙事线索链系统
// ==========================================



// ==========================================
// 章节过渡追踪
// ==========================================


// ============================================================
// 士气系统（守护者心情联动）
// ============================================================

// 获取整体士气平均值

// 获取士气等级描述

// 士气对资源效率的影响




// ==========================================
// 封印总结系统 — 文明画像
// ==========================================


// ==========================================
// 隐藏结局系统（数据驱动）
// ==========================================













// Override renderSaveSlots to also render the seal button
const _origRenderSaveSlots = renderSaveSlots;
renderSaveSlots = function(mode) {
    _origRenderSaveSlots(mode);
    renderSealButton();
};

// ==========================================
// 圣所维护项目系统
// ==========================================







// ==========================================
// 终局事件强制触发
// ==========================================


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
