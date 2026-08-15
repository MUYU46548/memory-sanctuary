/**
 * game-emergency.js - 从 game.js 拆分的模块
 * 包含: openEmergencyProtocol, activateEmergencyProtocol
 */

// 守护者临时协助：30 食物作为加急报酬，换取 1 次立即归档机会
const GUARDIAN_AID_FOOD_COST = 30;

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
    
    // 首次打开面板级引导
    if (typeof showPanelHint === 'function') {
        showPanelHint('emergency', list,
            '⚠️ 应急协议是最后手段：激活会提升圣所腐败度，腐败度越高资源衰减越快。仅在常规手段耗尽时使用。');
    }
    
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
    
    // 守护者临时协助按钮（叙事化：「食物换归档」→ 守护者加急报酬）
    const buyArchiveBtn = document.createElement('button');
    buyArchiveBtn.className = 'emergency-btn instant-archive-buy';
    buyArchiveBtn.innerHTML = `
        <span class="emergency-btn-icon">🍖</span>
        <span class="emergency-btn-label">守护者临时协助</span>
        <span class="emergency-btn-desc">以 ${GUARDIAN_AID_FOOD_COST} 食物作为加急报酬，恳请守护者临时协助归档</span>
        <span class="emergency-btn-cost">${GUARDIAN_AID_FOOD_COST} 食物</span>
    `;
    
    const currentChances = state.instantArchiveChances || 0;
    buyArchiveBtn.addEventListener('click', () => {
        if ((state.resources.food || 0) < GUARDIAN_AID_FOOD_COST) {
            addLog(`食物不足：守护者临时协助需要 ${GUARDIAN_AID_FOOD_COST} 食物作为加急报酬。`, 'system');
            return;
        }
        if (confirm(`以 ${GUARDIAN_AID_FOOD_COST} 食物作为报酬，邀请守护者临时协助归档？（当前可协助次数：${currentChances}）`)) {
            buyInstantArchiveWithFood();
            openEmergencyProtocol(); // refresh
        }
    });
    
    list.appendChild(buyArchiveBtn);
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
        const guardians = getAvailableGuardians();
        if (guardians.length === 0) return;
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

    // 紧急勘探：自动打开勘探面板，让玩家立刻使用免食物额度（提升存在感）
    if (protocol.id === 'emergency_explore' && typeof openExplorePanel === 'function') {
        state.emergencyExploreUsed = true;
        addLog('🔭 紧急勘探已就绪：勘探冷却已清零，下一次派遣免食物。', 'system');
        setTimeout(() => openExplorePanel(), 200);
    }
}
