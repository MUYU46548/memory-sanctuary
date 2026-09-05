/**
 * game-exploration.js - 从 game.js 拆分的模块
 * 包含: isGuardianFatigued, isExplorationCompleted, getExplorationAttempts...
 */

// P0-1 修复：守护者专属事件挂起标记（guardianSpecials 生效）
// 派遣时记录匹配的守护者与对话键，返回时在 applyExplorationResult 中结算专属奖励分支。
// 模块级变量即可：不随存档持久化，一次性勘探流程内有效。
let pendingGuardianSpecial = null;

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
        // 注：v0.2.4 修复——此处曾引用未定义变量 completed，默认选址逻辑每次都抛 ReferenceError 中断
        const placeholder = document.getElementById('explore-placeholder');
        const dispatchEl = document.getElementById('explore-dispatch');
        const firstAvailable = (MemorySanctuary.data.explorations || []).find(e => {
            const now = MemorySanctuary.state.week;
            const exp = MemorySanctuary.state.exploration;
            const botReq = e.requiredBots || 0;
            const botsMet = (MemorySanctuary.state.resources.engineeringBots || 0) >= botReq;
            return !(exp.deployedUntil > now) && !isExplorationCompleted(e.id) &&
                (!e.availableAfter || now >= e.availableAfter) && botsMet;
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

        // Check if exploration is available this week AND meets robot requirement
        const botReq = expData.requiredBots || 0;
        const botsHave = MemorySanctuary.state.resources.engineeringBots || 0;
        const botsMet = botsHave >= botReq;
        const available = (!expData.availableAfter || now >= expData.availableAfter) && botsMet;
        if (!available) item.classList.add('locked');

        const difficultyStars = '◆'.repeat(expData.difficulty) + '◇'.repeat(3 - expData.difficulty);

        const completedBadge = completed ? '<span class="explore-item-completed-badge"> ✓ 已完成</span>' : '';
        const lockedBadge = !available
            ? (botReq > 0 && !botsMet
                ? `<span class="explore-item-locked-badge"> 🔧 需工程机器人 ${botReq} 台（当前 ${botsHave}）</span>`
                : `<span class="explore-item-locked-badge"> 🔒 第${expData.availableAfter}周解锁</span>`)
            : '';
        const lastResult = exp.explorationLog && exp.explorationLog.find(l => l.id === expData.id);
        const lastResultText = lastResult ? `<div class="explore-item-last-result">上次：${lastResult.resultText}</div>` : '';

        const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
        const foodCostHtml = foodCost > 0 ? `<span class="food-cost">🍖 ${foodCost}</span>` : '';

        // 地表/机器人碎片提示（勘探重设计 2026-09-03：勘探产出从纯资源改为独家内容）
        const fragCount = expData.fragments ? expData.fragments.length : 0;
        const fragBadge = fragCount > 0
            ? `<span class="explore-item-frag" title="返回时必定发现地表碎片；碎片仅在特定周数内可归档，过期即永久消失">🗒 碎片×${fragCount}</span>`
            : '';
        const botBadge = expData.botOnly ? `<span class="explore-item-locked-badge">🤖 机器人专属</span>` : '';

        item.innerHTML = `
            <div class="explore-item-header">
                <div class="explore-item-name">${expData.name}${completedBadge}${lockedBadge}${foodCostHtml}${fragBadge}${botBadge}</div>
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
    
    // Check food sufficiency and disable button if needed（紧急勘探免食物额度时不禁用；机器人专属点免食物）
    const foodCost = expData.foodCost ?? (expData.difficulty === 3 ? 12 : expData.difficulty === 2 ? 8 : 5);
    const isBotOnly = !!expData.botOnly;
    const dispatchBtn = document.getElementById('dispatch-btn');
    const currentFood = MemorySanctuary.state.resources.food;
    const foodFree = !!MemorySanctuary.state.emergencyExploreFoodFree;
    dispatchBtn.disabled = !foodFree && !isBotOnly && currentFood < foodCost;
    if (isBotOnly) {
        dispatchBtn.textContent = '派遣机器人编队';
    } else if (foodFree) {
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

    // 机器人专属勘探点：无需守护者，编队自动执行（勘探重设计 2026-09-03）
    if (expData.botOnly) {
        const botDiv = document.createElement('div');
        botDiv.className = 'dispatch-bot-only';
        botDiv.innerHTML = `🔧 工程机器人编队将自动执行本次勘探：无需守护者、不消耗食物、不产生疲劳。` +
            `<div class="dispatch-bot-cost">消耗：编队待机能源（维护费已按周扣除）· 耗时 ${expData.duration || 1} 周</div>`;
        container.appendChild(botDiv);
        return;
    }
    
    const guardians = MemorySanctuary.data.guardians;
    const now = MemorySanctuary.state.week;
    const exp = MemorySanctuary.state.exploration; // 疲劳分支需要读取 fatigue 表
    
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
        
        // P0-1 修复：熟悉此地的守护者标记（guardianSpecials）——让「派谁去」有真实区别
        const isSpecial = expData.guardianSpecials && expData.guardianSpecials[g.id];
        if (isSpecial) div.classList.add('guardian-special');
        
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
            ${isSpecial ? '<div class="guardian-special-badge" title="这位守护者与此地有特殊羁绊，派遣时将触发专属发现">✦ 熟悉此地</div>' : ''}
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

    // 地表/机器人碎片提示（勘探重设计 2026-09-03）：返回时必定发现，窗口过期即消失
    const fragCount = expData.fragments ? expData.fragments.length : 0;
    if (fragCount > 0) {
        const fragNote = document.createElement('div');
        fragNote.className = 'outcome-bot-bonus frag-bonus';
        fragNote.innerHTML = `🗒 碎片 ×${fragCount}：返回时必定发现；仅在特定周数窗口内可归档，过时不候`;
        container.appendChild(fragNote);
    }

    // P0-1 修复：守护者专属发现提示——选中熟悉此地的守护者时，在结果栏明确告知专属奖励
    const specialGuardian = Array.from(selectedGuardians).find(gid =>
        expData.guardianSpecials && expData.guardianSpecials[gid]);
    if (specialGuardian) {
        const g = MemorySanctuary.data.guardians.find(x => x.id === specialGuardian);
        if (g) {
            const specNote = document.createElement('div');
            specNote.className = 'outcome-bot-bonus special-bonus';
            specNote.innerHTML = `✦ ${g.name} 熟悉此地：本次勘探将触发专属发现（额外资源 + 好感）`;
            container.appendChild(specNote);
        }
    }

    // 机器人协同加成提示（在线时显示，让玩家直观看到机器人的作用）
    const botBonus = (typeof getBotExploreBonus === 'function') ? getBotExploreBonus() : { yieldBonus: 0, riskCut: 0 };
    if (botBonus.yieldBonus > 0 || botBonus.riskCut > 0) {
        const botNote = document.createElement('div');
        botNote.className = 'outcome-bot-bonus';
        const parts = [];
        if (botBonus.yieldBonus > 0) parts.push(`资源收益 +${Math.round(botBonus.yieldBonus * 100)}%`);
        if (botBonus.riskCut > 0) parts.push(`风险 -${Math.round(botBonus.riskCut * 100)}%`);
        botNote.innerHTML = `🔧 工程机器人协同：${parts.join(' · ')}`;
        container.appendChild(botNote);
    }

    // 科技树勘探加成提示（v0.2.4）
    const techBonus = (typeof getTechExploreBonus === 'function') ? getTechExploreBonus() : { yieldBonus: 0, riskCut: 0 };
    if (techBonus.yieldBonus > 0 || techBonus.riskCut > 0) {
        const techNote = document.createElement('div');
        techNote.className = 'outcome-bot-bonus tech-bonus';
        const parts = [];
        if (techBonus.yieldBonus > 0) parts.push(`资源收益 +${Math.round(techBonus.yieldBonus * 100)}%`);
        if (techBonus.riskCut > 0) parts.push(`风险 -${Math.round(techBonus.riskCut * 100)}%`);
        techNote.innerHTML = `🔬 科技协同：${parts.join(' · ')}`;
        container.appendChild(techNote);
    }

    expData.outcomes.forEach(o => {
        const prob = calculateOutcomeProbability(o, expData);
        const bar = document.createElement('div');
        bar.className = 'outcome-bar';

        const label = document.createElement('span');
        label.className = 'outcome-label';
        label.textContent = o.type === 'resource' ? (o.resource === 'energy' ? '能源' : o.resource === 'media' ? '介质' : o.resource === 'food' ? '食物' : '环境') : o.type === 'narrative' ? '情报' : '风险';

        const fill = document.createElement('span');
        fill.className = 'outcome-fill' + (o.type === 'risk' ? ' risk' : '');
        fill.style.width = (prob * 100) + '%';

        bar.appendChild(label);
        bar.appendChild(fill);
        container.appendChild(bar);
    });
}


function calculateOutcomeProbability(outcome, expData) {
    // 缺 probability 按 0 处理，避免 undefined 参与算术产生 NaN、污染整条累进概率链
    let prob = outcome.probability || 0;
    const matchedSkills = countMatchedSkills(expData);
    // 工程机器人协同加成（在线时生效）：提升资源概率、压低风险概率
    const botBonus = (typeof getBotExploreBonus === 'function') ? getBotExploreBonus() : { yieldBonus: 0, riskCut: 0 };
    // 科技树勘探加成（v0.2.4）：在机器人加成之后叠加同类乘数，上限各自独立
    const techBonus = (typeof getTechExploreBonus === 'function') ? getTechExploreBonus() : { yieldBonus: 0, riskCut: 0 };
    if (outcome.type === 'risk') {
        prob = Math.max(0.02, prob - matchedSkills * 0.04 - botBonus.riskCut - techBonus.riskCut);
    } else if (outcome.type === 'resource') {
        prob = Math.min(0.6, prob + matchedSkills * 0.05 + botBonus.yieldBonus + techBonus.yieldBonus);
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

    const isBotOnly = !!expData.botOnly;

    // 食物消耗：按难度分档，默认 0（紧急勘探激活时本次免食物；机器人专属点恒为 0）
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

    // 疲劳守护者派遣警告
    const fatiguedGuardians = [];
    selectedGuardians.forEach(gid => {
        const weeks = getFatigueWeeksLeft(gid);
        if (weeks > 0) {
            const g = data.guardians.find(g => g.id === gid);
            if (g) fatiguedGuardians.push({ name: g.name, weeks });
        }
    });
    
    if (fatiguedGuardians.length > 0) {
        const names = fatiguedGuardians.map(f => `${f.name}（疲劳剩余 ${f.weeks} 周）`).join('、');
        const confirmed = confirm(`以下守护者疲劳中，派遣后疲劳将延长：\n${names}\n\n确定要派遣吗？`);
        if (!confirmed) return;
    }

    const now = MemorySanctuary.state.week;
    MemorySanctuary.state.exploration.deployedUntil = now + expData.duration;
    
    // P0-1 修复：记录本次勘探的守护者专属事件匹配（返回时在 applyExplorationResult 结算）
    pendingGuardianSpecial = null;
    if (expData.guardianSpecials) {
        for (const gid of selectedGuardians) {
            if (expData.guardianSpecials[gid]) {
                pendingGuardianSpecial = {
                    expId: expData.id,
                    guardianId: gid,
                    dialogueKey: expData.guardianSpecials[gid]
                };
                break;
            }
        }
    }
    
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
            // 途中事件判定
            if (Math.random() < 0.2) {
                triggerMidwayEvent(expData);
            }
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

    addLog(`${isBotOnly ? '派出工程机器人编队' : `派出勘探队前往 ${expData.name}`}。${isBotOnly ? '机器人' : `成员：${guardianNames || '无'}`}。预计 ${expData.duration} 周后返回。`, 'system');

    document.getElementById('explore-overlay').classList.add('hidden');
    advanceTime(expData.duration);
}


/**
 * 地表/机器人碎片解锁（勘探重设计 2026-09-03）
 * 勘探点返回时必定发现其关联碎片条目（fragments 数组），产出从纯资源改为独家内容。
 * 碎片本身有独立 availableAfter/expiresAfter 窗口：
 *  - 窗口未开：先记录发现，第 N 周起才可归档；
 *  - 窗口已过（含环境归零加速风化）：碎片永久失去，仅留日志。
 * 解锁状态持久化于 state.unlockedFragments（存档字段）。
 */
function unlockFragmentsForPoint(expData, effects) {
    const state = MemorySanctuary.state;
    if (!expData || !expData.fragments || expData.fragments.length === 0) return;
    if (!state.unlockedFragments) state.unlockedFragments = [];

    expData.fragments.forEach(fid => {
        const entry = (MemorySanctuary.data.archives || []).find(a => a.id === fid);
        if (!entry) return;
        if (state.completedArchives.includes(fid) || state.unlockedFragments.includes(fid)) return;

        // 窗口已过：碎片已风化（与 onTimeAdvanced 过期口径一致）
        const effectiveExpiry = (typeof getEffectiveExpiryWeeks === 'function')
            ? getEffectiveExpiryWeeks(entry)
            : (entry.expiresAfter || 0);
        if (entry.expired || (entry.expiresAfter && MemorySanctuary.state.week > effectiveExpiry)) {
            addLog(`💨 ${expData.name} 本可找到「${entry.title}」，但它的时代已经过去，只留下一捧细沙。`, 'system');
            return;
        }

        state.unlockedFragments.push(fid);
        const notYet = entry.availableAfter && MemorySanctuary.state.week < entry.availableAfter;
        const hint = notYet ? `（第 ${entry.availableAfter} 周起可在存储室归档）` : '';
        const prefix = expData.botOnly ? '🤖 机器人回收' : '🗒 地表碎片';
        addLog(`${prefix}：「${entry.title}」已发现${hint}——过期前前往对应存储室归档。`, 'success');
        if (effects) effects.push({ name: `${prefix}「${entry.title}」`, positive: true });
    });
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

    // 碎片解锁（勘探重设计 2026-09-03）：返回时必定发现关联碎片，写入 effects 展示
    unlockFragmentsForPoint(expData, effects);

    // P0-1 修复：守护者专属事件结算（guardianSpecials 真正生效）
    // 派遣了熟悉此地的守护者 → 触发专属奖励分支：额外资源 + 专属叙事文本 + 好感提升
    let specialNarrative = '';
    if (pendingGuardianSpecial && pendingGuardianSpecial.expId === expData.id) {
        const spec = pendingGuardianSpecial;
        const g = MemorySanctuary.data.guardians.find(x => x.id === spec.guardianId);
        if (g) {
            const reward = expData.guardianSpecialReward || { media: 10, energy: 5, mood: 2 };
            const gains = [];
            if (reward.media) { adjustResource('media', reward.media); gains.push(`介质+${reward.media}`); }
            if (reward.energy) { adjustResource('energy', reward.energy); gains.push(`能源+${reward.energy}`); }
            if (reward.food) { adjustResource('food', reward.food); gains.push(`食物+${reward.food}`); }
            if (reward.environment) { adjustResource('environment', reward.environment); gains.push(`环境+${reward.environment}`); }
            adjustGuardianMood(spec.guardianId, reward.mood || 2);
            gains.push(`好感+${reward.mood || 2}`);
            effects.push({ name: `✦ ${g.name}的专属发现（${gains.join('、')}）`, positive: true });
            specialNarrative = expData.guardianSpecialText ||
                `${g.name} 凭着对这片土地的熟悉，找到了寻常勘探队会错过的东西——那是只属于他/她的记忆。`;
            addLog(`✦ 专属事件：${g.name} 在 ${expData.name} 触发了特殊羁绊。`, 'event');
            if (typeof AudioSystem !== 'undefined' && AudioSystem.playExploreReturnNarrative) {
                AudioSystem.playExploreReturnNarrative();
            }
        }
    }
    pendingGuardianSpecial = null;

    document.getElementById('result-text').textContent = specialNarrative
        ? `${outcome.message}\n\n${specialNarrative}`
        : outcome.message;

    // 守护者专属语录（匹配 guardianSpecials）
    const quoteEl = document.getElementById('result-guardian-quote');
    if (quoteEl) {
        let quoteText = '';
        
        // 检查是否有守护者匹配该地点的 guardianSpecials
        if (expData.guardianSpecials) {
            for (const gid of selectedGuardians) {
                const specialKey = expData.guardianSpecials[gid];
                if (specialKey) {
                    const g = MemorySanctuary.data.guardians.find(g => g.id === gid);
                    if (g && g.explorationDialogues && g.explorationDialogues[specialKey]) {
                        quoteText = `${g.avatar} ${g.name}：「${g.explorationDialogues[specialKey]}」`;
                        break;
                    }
                }
            }
        }
        
        // 重复勘探叙事补全：非首次勘探时追加额外背景
        if (!quoteText) {
            const attemptCount = MemorySanctuary.state.exploration.completedExplorations[expData.id] || 0;
            if (attemptCount > 1 && outcome.type === 'narrative') {
                const followUps = [
                    `（这是第 ${attemptCount} 次回到这里。每一次，都有新的发现。）`,
                    `（你们已经不是第一次来了。这片废墟对你们来说，渐渐变得熟悉。）`,
                    `（第 ${attemptCount} 次勘探。每一次回来，都带着不同的心情。）`
                ];
                quoteText = followUps[(attemptCount - 2) % followUps.length];
            }
        }
        
        if (quoteText) {
            quoteEl.textContent = quoteText;
            quoteEl.classList.remove('hidden');
        } else {
            quoteEl.classList.add('hidden');
        }
    }

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

    // Layer 4: Fatigue — 疲劳随勘探产生（A1 调整 2026-09-02）
    // 原口径：仅 risk 结果产生疲劳（平均风险 10%，diff1 多为 5-10% → 约 90% 勘探无疲劳，
    //         玩家可无限派遣同一守护者，疲劳机制形同虚设）。
    // A1 新口径：diff≥2 高难度点基础派遣即产生 1 周疲劳（无论结果）；risk 结果 2 周；diff1 非 risk 仍无疲劳。
    const isHighDifficulty = (expData.difficulty || 1) >= 2;
    const baseFatigueWeeks = outcome.type === 'risk' ? 2 : (isHighDifficulty ? 1 : 0);
    if (baseFatigueWeeks > 0) {
        // 工程机器人疲劳守护：每台减免 50% 疲劳周数（接替高风险外勤），最低保留 1 周
        const botCount = (typeof getEngineeringBotCount === 'function') ? getEngineeringBotCount() : 0;
        const fatigueGuard = (typeof ENGINEERING_BOTS_CONFIG !== 'undefined') ? ENGINEERING_BOTS_CONFIG.fatigueGuardPerBot : 0;
        const online = (typeof areBotsOnline === 'function') ? areBotsOnline() : false;
        let fatigueWeeks = online
            ? Math.max(1, Math.round(baseFatigueWeeks * (1 - fatigueGuard * botCount)))
            : baseFatigueWeeks;

        // 科技树疲劳减免（v0.2.4）：独立来源，与机器人减免叠加，最低保留 1 周
        const techEnv = (typeof getTechEnvBonus === 'function') ? getTechEnvBonus() : { fatigueGuard: 0 };
        if (techEnv.fatigueGuard > 0) {
            fatigueWeeks = Math.max(1, fatigueWeeks - Math.round(techEnv.fatigueGuard));
        }

        selectedGuardians.forEach(gid => {
            // Fatigue: cannot deploy for fatigueWeeks weeks AFTER the return week
            // 语义：返回周起后续 fatigueWeeks 周不可再派遣（N=1 时下周仍疲劳，验证：N=1 部署后下周不可再派）
            if (!MemorySanctuary.state.exploration.fatigue) {
                MemorySanctuary.state.exploration.fatigue = {};
            }
            MemorySanctuary.state.exploration.fatigue[gid] = MemorySanctuary.state.week + fatigueWeeks + 1;
        });

        if (online && fatigueWeeks < baseFatigueWeeks) {
            addLog(`🔧 工程机器人接替了部分高风险外勤，守护者疲劳减轻（${fatigueWeeks} 周）。`, 'system');
        }
        // 心情惩罚仅保留在 risk 结果（风险的额外代价），基础派遣疲劳不额外扣心情
        if (outcome.type === 'risk') {
            selectedGuardians.forEach(gid => {
                if (Math.random() < 0.5) adjustGuardianMood(gid, -1);
            });
        }
    }

    // Layer 3: Narrative reveals clue
    if (outcome.type === 'narrative' && outcome.revealsClue) {
        addLog(`这次发现让你想起了某份档案……也许应该回去检查一下。`, 'system');
        // 科技树「守真勘探学说」（exploreIntel）：情报结果指认藏有隐藏叙事的未归档条目
        const techExplore = (typeof getTechExploreBonus === 'function') ? getTechExploreBonus() : null;
        if (techExplore && techExplore.intelReveal) {
            const hiddenPending = (MemorySanctuary.data.archives || []).filter(a =>
                a.hiddenContent && !isArchiveCompleted(a.id) && !a.expired &&
                (!a.availableAfter || MemorySanctuary.state.week >= a.availableAfter) && !a.ngPlusExclusive);
            if (hiddenPending.length > 0) {
                const pick = hiddenPending[Math.floor(Math.random() * hiddenPending.length)];
                addLog(`✦ 守真学派的耳朵捕捉到了更多细节：未归档的「${pick.title}」似乎藏有未被记录的叙事。`, 'guardian');
            }
        }
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
    const typeLabels = { resource: '◈ 资源', narrative: '✦ 情报', risk: '⚠ 风险' };
    
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
// 勘探途中事件系统
// ==========================================

// 途中事件池（数据驱动）
const MIDWAY_EVENTS = [
    {
        id: "midway_storm",
        condition: () => true, // 无条件触发
        message: "勘探队途中遭遇尘暴，延误了归期。",
        effect: (state) => { state.resources.energy = Math.max(0, state.resources.energy - 5); },
        logType: "system"
    },
    {
        id: "midway_discovery",
        condition: () => true,
        message: "勘探队在途中发现了额外的物资。",
        effect: (state) => { state.resources.media = Math.min(200, state.resources.media + 8); },
        logType: "system"
    },
    {
        id: "midway_encounter",
        condition: () => true,
        message: "勘探队遭遇了一支迷路的野生动物，不得不绕道而行。",
        effect: (state) => { state.resources.food = Math.max(0, state.resources.food - 3); },
        logType: "system"
    },
    {
        id: "midway_signal",
        condition: (state) => state.week >= 20,
        message: "勘探队收到了来自远方的微弱信号。他们记录下了坐标，但来不及追查。",
        effect: () => {},
        logType: "system"
    },
    {
        id: "midway_collapse",
        condition: () => true,
        message: "通往目标的道路坍塌了，勘探队只能绕远路返回。",
        effect: (state) => { state.exploration.deployedUntil = (state.exploration.deployedUntil || state.week) + 1; },
        logType: "system"
    },
    {
        id: "midway_ancient",
        condition: (state) => state.week >= 30,
        message: "勘探队在一处崩塌的墙壁上发现了古老的壁画。他们拓印了下来。",
        effect: (state) => { state.resources.media = Math.min(200, state.resources.media + 12); },
        logType: "system"
    },
    {
        id: "midway_lost_item",
        condition: () => true,
        message: "勘探队不慎丢失了一部分补给。",
        effect: (state) => { state.resources.food = Math.max(0, state.resources.food - 5); },
        logType: "system"
    },
    {
        id: "midway_abandoned_camp",
        condition: () => true,
        message: "勘探队发现了一处被遗弃的营地，找到了一些有用的物资。",
        effect: (state) => { state.resources.energy = Math.min(300, state.resources.energy + 10); },
        logType: "system"
    }
];

/**
 * 触发途中事件（20% 概率）
 * 从事件池中筛选满足条件的事件，随机选择一个执行
 */
function triggerMidwayEvent(expData) {
    const state = MemorySanctuary.state;
    const availableEvents = MIDWAY_EVENTS.filter(e => {
        try { return e.condition(state); } catch { return false; }
    });
    
    if (availableEvents.length === 0) return;
    
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    
    try {
        event.effect(state);
        addLog(`🔭 途中事件：${event.message}`, event.logType || "system");
    } catch (e) {
        if (DEBUG) console.warn('[triggerMidwayEvent] 效果执行失败:', e);
    }
}
