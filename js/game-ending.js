/**
 * game-ending.js - 从 game.js 拆分的模块
 * 包含: checkEndingCondition, checkGuardianFinale, checkHiddenEndings...
 */

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
    // 完美封印：所有守护者亲密 + 45%收集
    if (condition.allGuardiansIntimate && condition.minVaultCompletion) {
        const allIntimate = ['tika', 'finn', 'misha', 'lorn', 'ethel'].every(gid => getMoodTier(gid) === 'intimate');
        if (!allIntimate) return false;
        const vaults = MemorySanctuary.data.vaults;
        return vaults.every(v => getVaultCompletion(v.id).ratio >= condition.minVaultCompletion);
    }
    // 牺牲结局：任意守护者选择牺牲
    if (condition.anyGuardianSacrifice) {
        return MemorySanctuary.state.guardianSacrifice === true;
    }
    // 遗忘结局：无成就 + 第48周
    if (condition.noAchievementsUnlocked) {
        const achievements = getUnlockedAchievements();
        return achievements.length === 0 && MemorySanctuary.state.week >= (condition.weekMin || 48);
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

    // Check sacrifice ending (priority 95)
    if (MemorySanctuary.state.guardianSacrifice && MemorySanctuary.state.week >= 40) {
        const ending = (data.endings || []).find(e => e.id === 'sacrifice');
        if (ending) {
            return {
                id: 'sacrifice',
                title: ending.title,
                description: ending.description,
                priority: ending.priority,
                sacrificedGuardian: MemorySanctuary.state.sacrificedGuardian
            };
        }
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
    if (pct >= 0.6) return { id: 'guardian_of_remnants', title: '文明守护者', description: '你保存了大部分文明碎片。后世将看到一个虽不完整但足够真实的萨拉达斯。', priority: 50 };
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


/**
 * 周目结算（封印 / 崩溃 / 饥荒结局统一调用）：
 * 累计归档条目、记录守护者历史与亲密度结局、递增周目数。
 */
function finalizePlaythrough() {
    const state = MemorySanctuary.state;
    if (!state) return;
    const archivedCount = state.completedArchives.length;
    const ngData = getNGPlusData();

    ngData.totalArchivesSaved = (ngData.totalArchivesSaved || 0) + archivedCount;
    if (!ngData.bestRun || archivedCount > ngData.bestRun.count) {
        ngData.bestRun = { count: archivedCount, week: state.week };
    }

    // Check if all guardians have high moods (bonus)
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

    // 记录本周目归档条目（供图鉴「已见条目」判断——否则历史归档条目在回顾里全是 ???）
    if (!ngData.archiveHistory) ngData.archiveHistory = [];
    ngData.archiveHistory.push({
        playthrough: ngData.playthroughCount + 1,
        week: state.week,
        archives: [...state.completedArchives]
    });

    saveNGPlusData(ngData);

    // 计入已完成周目数
    startNewGamePlus();
}


function sealSanctuary() {
    MemorySanctuary.state.gameOver = true;
    const state = MemorySanctuary.state;

    // NG+ 结算：累计归档、守护者记录、周目递增（与崩溃/饥荒结局共用）
    finalizePlaythrough();

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
    
    // Show ending VN if scene exists, otherwise show modal directly
    let endingSceneId = ending ? ending.id : 'silent_sanctuary';
    // For sacrifice endings, use guardian-specific scene
    if (ending && ending.id === 'sacrifice' && ending.sacrificedGuardian) {
        const sacSceneId = `sacrifice_${ending.sacrificedGuardian}`;
        if (typeof VN !== 'undefined' && VN.getEndingScene(sacSceneId)) {
            endingSceneId = sacSceneId;
        }
    }
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
    
    // Play seal sound
    if (typeof AudioSystem !== 'undefined' && AudioSystem.playSealSound) {
        AudioSystem.playSealSound();
    }
    
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
    
    // NG+ button: allow starting NG+ directly
    const ngBtn = document.getElementById('ending-ng-btn');
    if (ngBtn) {
        ngBtn.classList.remove('hidden');
        ngBtn.onclick = () => {
            pageOverlay.classList.add('hidden');
            // Determine next slot
            const currentSlot = getCurrentSlot();
            const nextSlot = currentSlot >= 1 ? currentSlot : 1;
            startNewGame(nextSlot, true);
            if (typeof AudioSystem !== 'undefined') AudioSystem.playGuardianEventTrigger();
        };
    }
    
    // Return button
    returnBtn.onclick = () => {
        pageOverlay.classList.add('hidden');
        if (ngBtn) ngBtn.classList.add('hidden');
        showTitleScreen();
    };
    
    pageOverlay.classList.remove('hidden');
}


function renderSealButton() {
    const container = document.getElementById('save-seal-container');
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


function initCivilizationAtlas() {
    const atlasBtn = document.getElementById('atlas-btn');
    const atlasClose = document.getElementById('atlas-close');
    const atlasOverlay = document.getElementById('atlas-overlay');
    
    // 图谱按钮事件已移至 initFuncBar 统一处理
    
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


function getVaultCompletion(vaultId) {
    const archives = MemorySanctuary.data.archives.filter(a => a.vault === vaultId && !a.ngPlusExclusive);
    const completed = MemorySanctuary.state.completedArchives;
    const done = archives.filter(a => completed.includes(a.id)).length;
    return { done, total: archives.length, ratio: archives.length > 0 ? done / archives.length : 0 };
}


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


function getAverageMood() {
    const state = MemorySanctuary.state;
    const moods = state.guardianMoods || {};
    const values = Object.values(moods);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}


function getMoraleLevel() {
    const avg = getAverageMood();
    if (avg >= 6) return { level: 'excellent', label: '高昂', bonus: 1.15 };
    if (avg >= 3) return { level: 'good', label: '良好', bonus: 1.05 };
    if (avg >= 0) return { level: 'normal', label: '平稳', bonus: 1.0 };
    if (avg >= -3) return { level: 'low', label: '低落', bonus: 0.95 }
    return { level: 'critical', label: '崩溃', bonus: 0.85 };
}


function getMoraleEfficiencyBonus() {
    return getMoraleLevel().bonus;
}
