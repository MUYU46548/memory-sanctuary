/**
 * game-exploration.js - 从 game.js 拆分的模块
 * 包含: isGuardianFatigued, isExplorationCompleted, getExplorationAttempts...
 */

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

        // 首次打开面板级引导
        if (typeof showPanelHint === 'function') {
            showPanelHint('explore', document.querySelector('.explore-body'),
                '💡 地表勘探：左侧选择地点，右侧挑选擅长对应技能的守护者派遣。勘探队带回资源，但会消耗食物并积累疲劳。');
        }

        // 默认选中第一个可用地点（避免玩家需要滑到列表底部才发现派遣区）
        const placeholder = document.getElementById('explore-placeholder');
        const dispatchEl = document.getElementById('explore-dispatch');
        const firstAvailable = (MemorySanctuary.data.explorations || []).find(e => {
            const now = MemorySanctuary.state.week;
            const completed = isExplorationCompleted(e.id);
            const exp = MemorySanctuary.state.exploration;
            return !(exp.deployedUntil > now) && !completed && (!e.availableAfter || now >= e.availableAfter);
        });
        if (firstAvailable) {
            const item = document.querySelector(`.explore-item[data-exp-id="${firstAvailable.id}"]`);
            if (item) {
                selectExploration(firstAvailable, item);
            } else {
                // 列表尚未渲染完成，直接调用选择逻辑（用数据）
                selectExploration(firstAvailable, null);
            }
        } else if (placeholder && dispatchEl) {
            placeholder.classList.remove('hidden');
            dispatchEl.classList.add('hidden');
        }
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
        item.dataset.expId = expData.id;
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
        exploration: '勘探',
        singing: '歌唱',
        languages: '语言',
        history: '历史',
        law: '法律',
        ritual: '仪式'
    };
    return names[skill] || skill;
}


function selectExploration(expData, element) {
    selectedExplorationId = expData.id;
    selectedGuardians.clear();

    document.querySelectorAll('.explore-item').forEach(el => el.style.borderColor = '');
    if (element) element.style.borderColor = 'var(--explore-green, #5aa86e)';

    const dispatchEl = document.getElementById('explore-dispatch');
    dispatchEl.classList.remove('hidden');
    const placeholder = document.getElementById('explore-placeholder');
    if (placeholder) placeholder.classList.add('hidden');

    document.getElementById('dispatch-title').textContent = `派遣至：${expData.name}`;
    document.getElementById('dispatch-desc').textContent = expData.description;

    renderDispatchGuardians(expData);
    renderOutcomeBars(expData);
    
    // Check food sufficiency and disable button if needed（紧急勘探免食物额度时不禁用）
    const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    const dispatchBtn = document.getElementById('dispatch-btn');
    const currentFood = MemorySanctuary.state.resources.food;
    const foodFree = !!MemorySanctuary.state.emergencyExploreFoodFree;
    dispatchBtn.disabled = !foodFree && currentFood < foodCost;
    if (foodFree) {
        dispatchBtn.textContent = '派遣勘探队（免食物）';
    } else if (currentFood < foodCost) {
        dispatchBtn.textContent = `食物不足 (${currentFood}/${foodCost})`;
    } else {
        dispatchBtn.textContent = '派遣勘探队';
    }
}


function renderDispatchGuardians(expData) {
    const container = document.getElementById('dispatch-guardians');
    container.innerHTML = '';
    
    const guardians = MemorySanctuary.data.guardians;
    const now = MemorySanctuary.state.week;
    
    // Food cost display with current food
    const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    const currentFood = MemorySanctuary.state.resources.food;
    const foodCostDiv = document.createElement('div');
    foodCostDiv.className = 'dispatch-food-cost';
    const foodSufficient = currentFood >= foodCost;
    foodCostDiv.innerHTML = `🍖 食物消耗：${foodCost} <span class="current-food ${foodSufficient ? 'ok' : 'low'}">(当前: ${currentFood})</span>`;
    container.appendChild(foodCostDiv);
    
    const guardianGrid = document.createElement('div');
    guardianGrid.className = 'dispatch-guardians-grid';
    
    guardians.forEach(g => {
        const div = document.createElement('div');
        div.className = 'dispatch-guardian';
        
        // Show skills with match indication
        const skillsHtml = g.skills ? g.skills.map(s => {
            const isMatch = expData.requiredSkills && expData.requiredSkills.includes(s);
            return `<span class="guardian-skill ${isMatch ? 'matched' : ''}">${skillName(s)}</span>`;
        }).join('') : '';
        
        // Calculate bonus from this guardian
        const bonusText = getGuardianBonusText(g, expData);
        
        div.innerHTML = `
            <span class="guardian-avatar">${g.avatar}</span>
            <span class="guardian-name">${g.name}</span>
            <div class="guardian-skills">${skillsHtml}</div>
            ${bonusText ? `<div class="guardian-bonus">${bonusText}</div>` : ''}
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

function getGuardianBonusText(guardian, expData) {
    if (!expData.requiredSkills) return '';
    const matched = guardian.skills.filter(s => expData.requiredSkills.includes(s));
    if (matched.length === 0) return '';
    return `+${matched.length * 5}% 资源收益`;
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
        label.textContent = o.type === 'resource' ? (o.resource === 'energy' ? '能源' : o.resource === 'media' ? '介质' : o.resource === 'food' ? '食物' : '环境') : o.type === 'narrative' ? '叙事' : '风险';

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
    // 食物归零惩罚：资源型结果概率降低
    if (MemorySanctuary.state.resources.food <= 0 && outcome.type === 'resource') {
        prob = Math.max(0.05, prob * 0.7);
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

    // 食物消耗：按难度分档，默认 0（紧急勘探激活时本次免食物）
    let foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    const state = MemorySanctuary.state;
    if (state.emergencyExploreFoodFree) {
        foodCost = 0;
        state.emergencyExploreFoodFree = false;
        addLog('🔭 紧急勘探的免食物额度已使用（腐败的代价换来的机会）。', 'system');
    }
    
    if (foodCost > 0 && !hasResources(0, 0, foodCost)) {
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
        const resName = outcome.resource === 'energy' ? '能源' : outcome.resource === 'media' ? '介质' : outcome.resource === 'food' ? '食物' : '环境';
        effects.push({ name: `${resName} +${outcome.amount}`, positive: outcome.amount > 0 });
        if (outcome.resource === 'energy') adjustResource('energy', outcome.amount);
        if (outcome.resource === 'media') adjustResource('media', outcome.amount);
        if (outcome.resource === 'environment') adjustResource('environment', outcome.amount);
        if (outcome.resource === 'food') adjustResource('food', outcome.amount);
    } else if (outcome.type === 'risk') {
        const resName = outcome.resource === 'energy' ? '能源' : outcome.resource === 'media' ? '介质' : outcome.resource === 'food' ? '食物' : '环境';
        effects.push({ name: `${resName} ${outcome.amount}`, positive: false });
        if (outcome.resource === 'energy') adjustResource('energy', outcome.amount);
        if (outcome.resource === 'media') adjustResource('media', outcome.amount);
        if (outcome.resource === 'environment') adjustResource('environment', outcome.amount);
        if (outcome.resource === 'food') adjustResource('food', outcome.amount);
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
