/**
 * ui.js - UI渲染
 * 资源面板、存储室标签、归档条目、守护者面板
 */

// 调试模式开关：发布时设为 false，开发时设为 true
var DEBUG = false;


function initUI() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
    }
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Initialize title screen panels (must be here because ui.js loads after main.js)
    initAchievementsPanel();
    initCodexPanel();
    initProjectPanel();
    initResourceTooltips();

    if (DEBUG) console.log('[UI] 初始化完成');
}

function initProjectPanel() {
    const projectBtn = document.getElementById('project-btn');
    if (projectBtn) {
        projectBtn.addEventListener('click', () => openProjectPanel());
    }
    
    const closeBtn = document.getElementById('project-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeProjectPanel());
    }
    
    const overlay = document.getElementById('project-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeProjectPanel();
        });
    }
}

function renderAll() {
    renderResources();
    renderWeekDisplay();
    renderVaultTabs();
    renderVaultStatus();
    renderArchiveEntries();
    renderGuardianMood();
    renderExplorationButton();
    updateProjectButton();
    updateEmergencyButton();
    renderSealTopbarButton();
    
    // Always keep resource changes up-to-date
    if (typeof recalculateResourceChanges === 'function') recalculateResourceChanges();
}

// ============================================================
// 顶部栏封印按钮
// ============================================================

function renderSealTopbarButton() {
    const btn = document.getElementById('seal-topbar-btn');
    if (!btn || !MemorySanctuary.state) return;
    const state = MemorySanctuary.state;
    const week = state.week;
    const archivedCount = state.completedArchives.length;

    // week < 16: 隐藏按钮
    if (week < 16) {
        btn.classList.add('hidden');
        return;
    }

    btn.classList.remove('hidden');
    btn.classList.remove('sealable-preview', 'sealable-ready', 'sealable-warning');

    // 判断状态
    if (week >= 45) {
        // 接近终局 — 红色警告脉冲
        btn.classList.add('sealable-warning');
        btn.textContent = `⚠ 封印（${archivedCount} 条）`;
        btn.title = '终局将至！点击封印圣所以保存记忆';
        btn.disabled = false;
    } else if (week >= 20) {
        // 可封印 — 琥珀色脉冲
        btn.classList.add('sealable-ready');
        btn.textContent = `封印（${archivedCount} 条）`;
        btn.title = '点击封印圣所，结束当前周目并解锁多周目奖励';
        btn.disabled = false;
    } else {
        // 预览 — 灰色不可点击
        btn.classList.add('sealable-preview');
        btn.textContent = `封印圣所`;
        btn.title = `再运行 ${20 - week} 周即可开启封印`;
        btn.disabled = true;
    }
}

// ============================================================
// 应急协议按钮状态
// ============================================================

function updateEmergencyButton() {
    const btn = document.getElementById('emergency-btn');
    if (!btn || !MemorySanctuary.state) return;
    const state = MemorySanctuary.state;
    
    // 应急协议在任意资源归零或低资源时可用，或腐败度 > 0
    const res = state.resources;
    const anyZero = res.energy <= 0 || res.media <= 0 || res.environment <= 0;
    const anyCritical = res.energy < 20 || res.media < 15 || res.environment < 15;
    const hasCorruption = (state.emergencyCorruption || 0) > 0;
    
    if (state.gameOver || state.week >= 48) {
        btn.disabled = true;
        btn.title = '终局已至';
        btn.classList.remove('emergency-ready');
    } else if (anyZero || anyCritical || hasCorruption) {
        btn.disabled = false;
        btn.title = '⚡ 应急协议 — 点击使用非常规手段';
        btn.classList.add('emergency-ready');
    } else {
        btn.disabled = true;
        btn.title = '应急协议（资源危急时解锁）';
        btn.classList.remove('emergency-ready');
    }
}

// ============================================================
// 勘探按钮状态
// ============================================================

function renderExplorationButton() {
    const btn = document.getElementById('explore-btn');
    if (!btn || !MemorySanctuary.state) return;
    const now = MemorySanctuary.state.week;
    const exp = MemorySanctuary.state.exploration;
    if (exp.deployedUntil > now) {
        btn.disabled = true;
        btn.title = `勘探队已出发，第 ${exp.deployedUntil} 周返回`;
    } else {
        btn.disabled = false;
        btn.title = '地表勘探';
    }
}

// ==========================================
// 守护者好感度显示
// ==========================================

function renderGuardianMood() {
    const moodEl = document.getElementById('guardian-mood');
    const panelEl = document.getElementById('guardian-panel');
    const nameEl = document.getElementById('guardian-name');
    
    if (!moodEl || !nameEl) return;
    
    // 从当前守护者姓名获取ID
    const name = nameEl.textContent;
    const guardian = MemorySanctuary.data.guardians.find(g => g.name === name);
    if (!guardian) return;
    
    const guardianId = guardian.id;
    moodEl.textContent = getMoodIndicator(guardianId);
    moodEl.className = 'guardian-mood mood-' + getMoodTier(guardianId);
    
    if (panelEl) {
        panelEl.classList.remove('mood-hostile', 'mood-cold', 'mood-neutral', 'mood-friendly', 'mood-intimate');
        panelEl.classList.add('mood-' + getMoodTier(guardianId));
    }
    
    // 渲染守护者全局视图
    renderGuardianOverview();
}

// ==========================================
// 守护者全局视图
// ==========================================

function renderGuardianOverview() {
    const container = document.getElementById('guardian-overview');
    if (!container) return;
    
    const guardians = MemorySanctuary.data.guardians;
    const currentName = document.getElementById('guardian-name')?.textContent;
    
    container.innerHTML = '';
    
    guardians.forEach(g => {
        const item = document.createElement('div');
        item.className = 'guardian-overview-item';
        if (g.name === currentName) {
            item.classList.add('active');
        }
        
        const moodIndicator = getMoodIndicator(g.id);
        
        item.innerHTML = `
            <span class="guardian-overview-avatar">${g.avatar}</span>
            <span class="guardian-overview-name">${g.name}</span>
            <span class="guardian-overview-mood">${moodIndicator}</span>
        `;
        
        item.addEventListener('click', () => {
            // 切换主守护者
            document.getElementById('guardian-avatar').textContent = g.avatar;
            document.getElementById('guardian-name').textContent = g.name;
            document.getElementById('guardian-role').textContent = g.role;
            
            // 更新对话
            const dialogues = g.dialogues?.idle || ['……'];
            document.getElementById('guardian-dialogue').textContent = dialogues[0];
            
            // 更新心情显示
            renderGuardianMood();
            
            // 关闭详情面板
            const detailPanel = document.getElementById('guardian-detail-panel');
            if (detailPanel) detailPanel.classList.add('hidden');
        });
        
        container.appendChild(item);
    });
}

// ==========================================
// 守护者详情面板
// ==========================================

const SKILL_NAMES = {
    singing: '歌唱',
    languages: '语言',
    history: '历史',
    law: '法律',
    documentation: '档案',
    ecology: '生态',
    exploration: '勘探',
    survival: '生存',
    engineering: '工程',
    maintenance: '维护',
    energy: '能源',
    religion: '宗教',
    philosophy: '哲学',
    ritual: '仪式',
    medicine: '医学'
};

function toggleGuardianDetail() {
    const detailPanel = document.getElementById('guardian-detail-panel');
    if (!detailPanel) return;
    
    if (detailPanel.classList.contains('hidden')) {
        renderGuardianDetail();
        detailPanel.classList.remove('hidden');
    } else {
        detailPanel.classList.add('hidden');
    }
}

function renderGuardianDetail() {
    const detailPanel = document.getElementById('guardian-detail-panel');
    if (!detailPanel) return;
    
    const nameEl = document.getElementById('guardian-name');
    if (!nameEl) return;
    
    const guardian = MemorySanctuary.data.guardians.find(g => g.name === nameEl.textContent);
    if (!guardian) return;
    
    const tier = getMoodTier(guardian.id);
    const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
    const moodLevel = getMoodLevel(guardian.id);
    
    const skillsHtml = guardian.skills?.map(s => 
        `<span class="guardian-detail-skill">${SKILL_NAMES[s] || s}</span>`
    ).join('') || '';
    
    detailPanel.innerHTML = `
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">技能</div>
            <div class="guardian-detail-skills">${skillsHtml}</div>
        </div>
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">关系等级</div>
            <div class="guardian-detail-value">${tierNames[tier]} (${moodLevel > 0 ? '+' : ''}${moodLevel})</div>
        </div>
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">职责</div>
            <div class="guardian-detail-value">${guardian.role}</div>
        </div>
    `;
}

// ==========================================
// 周数显示
// ==========================================

function renderWeekDisplay() {
    const weekEl = document.getElementById('week-value');
    if (weekEl && MemorySanctuary.state) {
        const newWeek = String(MemorySanctuary.state.week);
        if (weekEl.textContent !== newWeek) {
            weekEl.textContent = newWeek;
            weekEl.classList.remove('updated');
            void weekEl.offsetWidth;
            weekEl.classList.add('updated');
        }
    }
    
    // Update week progress bar
    const progressEl = document.getElementById('week-progress');
    if (progressEl && MemorySanctuary.state) {
        const percent = Math.min(100, (MemorySanctuary.state.week / MAX_WEEK) * 100);
        progressEl.style.width = percent + '%';
        
        // Change color based on urgency
        if (percent >= 80) {
            progressEl.style.background = 'var(--danger)';
        } else if (percent >= 60) {
            progressEl.style.background = 'var(--warning)';
        } else {
            progressEl.style.background = 'var(--amber-primary)';
        }
    }
    
    // 士气轻量指示器（独立于周数显示）
    const moraleDisplay = document.getElementById('morale-display');
    if (moraleDisplay && MemorySanctuary.state) {
        const morale = getMoraleLevel();
        const moraleTag = document.getElementById('morale-tag');
        if (moraleTag) moraleTag.textContent = morale.label;
        moraleDisplay.className = 'morale-display morale-' + morale.level;
        moraleDisplay.title = `平均士气: ${getAverageMood().toFixed(1)}\n效率修正: ${((morale.bonus - 1) * 100).toFixed(0)}%`;
    }
}

// ==========================================
// 资源面板
// ==========================================

function renderResources() {
    const resources = getResourceStatus();
    
    const energyEl = document.getElementById('energy-value');
    const mediaEl = document.getElementById('media-value');
    const envEl = document.getElementById('environment-value');
    const foodEl = document.getElementById('food-value');
    
    if (energyEl) energyEl.textContent = Math.floor(resources.energy);
    if (mediaEl) mediaEl.textContent = Math.floor(resources.media);
    if (envEl) envEl.textContent = Math.floor(resources.environment);
    if (foodEl) foodEl.textContent = Math.floor(resources.food);
    
    updateResourceColor('res-energy', resources.energy, 100);
    updateResourceColor('res-media', resources.media, 60);
    updateResourceColor('res-environment', resources.environment, 100);
    updateResourceColor('res-food', resources.food, 80);
    
    // 刷新悬停提示（如果可见）
    const tooltip = document.getElementById('resource-tooltip');
    if (tooltip && tooltip.classList.contains('visible') && tooltip.dataset.resourceKey) {
        tooltip.innerHTML = buildResourceTooltip(tooltip.dataset.resourceKey);
    }
    
    // 圣所衰竭视觉指示
    const det = MemorySanctuary.state.deterioration;
    const resEnergy = document.getElementById('res-energy');
    const resMedia = document.getElementById('res-media');
    const resEnv = document.getElementById('res-environment');
    const resFood = document.getElementById('res-food');
    
    if (resEnergy) {
        if (det.energy) resEnergy.classList.add('deterioration');
        else resEnergy.classList.remove('deterioration');
    }
    if (resMedia) {
        if (det.media) resMedia.classList.add('deterioration');
        else resMedia.classList.remove('deterioration');
    }
    if (resEnv) {
        if (det.environment) resEnv.classList.add('deterioration');
        else resEnv.classList.remove('deterioration');
    }
    if (resFood) {
        if (det.food) resFood.classList.add('deterioration');
        else resFood.classList.remove('deterioration');
        
        // 食物预警机制
        const food = resources.food;
        resFood.classList.remove('food-warning', 'food-critical');
        if (food <= 10) {
            resFood.classList.add('food-critical');
        } else if (food <= 20) {
            resFood.classList.add('food-warning');
        }
    }
    
    // 资源危急警告（任一资源低于10时红色脉冲）
    const resEls = ['res-energy', 'res-media', 'res-environment', 'res-food'];
    resEls.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = resources[id.replace('res-', '')];
        if (val < 10) {
            el.classList.add('critical');
        } else {
            el.classList.remove('critical');
        }
    });
}

function getResourceStatus() {
    const state = MemorySanctuary.state;
    if (!state) return { energy: 0, media: 0, environment: 0, food: 0 };
    
    return {
        energy: Math.max(0, state.resources.energy),
        media: Math.max(0, state.resources.media),
        environment: Math.max(0, state.resources.environment),
        food: Math.max(0, state.resources.food || 0)
    };
}

function updateResourceColor(elementId, value, max) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const percent = (value / max) * 100;
    
    el.classList.remove('high', 'medium', 'low');
    if (percent >= 60) el.classList.add('high');
    else if (percent >= 30) el.classList.add('medium');
    else el.classList.add('low');
}

function getResourceName(resource) {
    const names = { energy: '能源', media: '介质', environment: '环境', food: '食物' };
    return names[resource] || resource;
}

// ==========================================
// 存储室标签栏
// ==========================================

function renderVaultTabs() {
    const container = document.getElementById('vault-tabs');
    if (!container) return;
    
    container.innerHTML = '';
    
    MemorySanctuary.data.vaults.forEach(vault => {
        const tab = document.createElement('button');
        tab.className = `vault-tab ${vault.id === MemorySanctuary.currentVaultId ? 'active' : ''}`;
        tab.textContent = vault.name;
        tab.addEventListener('click', () => selectVault(vault.id));
        container.appendChild(tab);
    });
}

// ==========================================
// 存储室状态
// ==========================================

function renderVaultStatus() {
    const container = document.getElementById('vault-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const vault = MemorySanctuary.data.vaults.find(v => v.id === MemorySanctuary.currentVaultId);
    if (!vault) return;
    
    const status = getVaultStatus(vault.id);
    
    const item = document.createElement('div');
    item.className = 'vault-item active';
    item.style.borderLeftColor = vault.accentColor;
    
    item.innerHTML = `
        <div class="vault-name" style="color: ${vault.accentColor}">${vault.name}</div>
        <div class="vault-capacity">
            <div class="vault-bar">
                <div class="vault-bar-fill" style="width: ${status.percent}%; background: ${vault.accentColor}"></div>
            </div>
            <span class="vault-bar-text">${status.used}/${vault.capacity}</span>
        </div>
    `;
    
    container.appendChild(item);
}

// ==========================================
// 归档条目
// ==========================================

function renderArchiveEntries() {
    const container = document.getElementById('entry-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const vaultId = MemorySanctuary.currentVaultId;
    const entries = getArchivesByVault(vaultId);
    
    if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">暂无待归档条目</p>';
        return;
    }
    
    // Show expiring soon aggregation at top
    const expiringSoon = entries.filter(e => {
        if (e.expired || isArchiveCompleted(e.id) || !e.expiresAfter) return false;
        const remaining = e.expiresAfter - MemorySanctuary.state.week;
        return remaining <= 3 && remaining > 0;
    });
    
    if (expiringSoon.length > 0) {
        const expiringDiv = document.createElement('div');
        expiringDiv.className = 'expiring-soon-panel';
        expiringDiv.innerHTML = `
            <div class="expiring-soon-header">⚠ 即将过期</div>
            ${expiringSoon.map(e => `<div class="expiring-soon-item">「${e.title}」— ${e.expiresAfter - MemorySanctuary.state.week}周后消失</div>`).join('')}
        `;
        container.appendChild(expiringDiv);
    }
    
    entries.forEach(entry => {
        // Filter out entries not yet available
        if (entry.availableAfter && MemorySanctuary.state.week < entry.availableAfter) return;

        const isCompleted = isArchiveCompleted(entry.id);
        const isExpired = entry.expired;
        const canArchive = !isCompleted && !isExpired && hasResources(entry.energyCost, entry.dataCost);
        
        const item = document.createElement('div');
        item.className = `entry-item ${isCompleted ? 'archived' : ''} ${isExpired ? 'expired' : ''} ${entry.emergency ? 'emergency' : ''}`;
        
        const chainIndicator = (typeof getChainIndicator === 'function') ? getChainIndicator(entry) : '';
        
        // Calculate remaining weeks
        const remaining = entry.expiresAfter ? entry.expiresAfter - MemorySanctuary.state.week : null;
        const isExpiringSoon = remaining !== null && remaining <= 3 && remaining > 0;
        
        const costHtml = `
            <div class="entry-cost">
                <span class="cost-energy">◈ ${entry.energyCost}</span>
                <span class="cost-data">◇ ${entry.dataCost}</span>
                ${remaining !== null ? `<span style="color: ${isExpiringSoon ? 'var(--danger)' : 'var(--text-dim)'}">⏱ ${remaining}周</span>` : ''}
            </div>
        `;
        
        let buttonHtml = '';
        if (isCompleted) {
            buttonHtml = `<button class="archive-btn" disabled>已归档</button>`;
        } else if (isExpired) {
            buttonHtml = `<button class="archive-btn" disabled>已消失</button>`;
        } else if (!canArchive) {
            buttonHtml = `<button class="archive-btn" disabled>资源不足</button>`;
        } else {
            buttonHtml = `<button class="archive-btn" data-archive-id="${entry.id}">录入归档</button>`;
        }
        
        item.innerHTML = `
            <div class="entry-title">${entry.title}${chainIndicator}${isExpiringSoon ? ' <span style="color:var(--danger);font-size:0.7rem">⚠ 即将消失</span>' : ''}</div>
            <div class="entry-desc">${entry.description}</div>
            ${costHtml}
            ${buttonHtml}
        `;
        
        container.appendChild(item);
    });
    
    container.querySelectorAll('.archive-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const archiveId = e.target.dataset.archiveId;
            if (typeof confirmArchive === 'function') {
                confirmArchive(archiveId);
            } else {
                archiveEntry(archiveId);
            }
        });
    });
}

// ==========================================
// 圣所项目 UI
// ==========================================

function updateProjectButton() {
    const btn = document.getElementById('project-btn');
    if (!btn || !MemorySanctuary.state) return;
    const week = MemorySanctuary.state.week;
    const hasAvailableProjects = MemorySanctuary.data.projects && 
        MemorySanctuary.data.projects.some(p => canStartProject(p));
    const hasLockedButRelevant = MemorySanctuary.data.projects &&
        MemorySanctuary.data.projects.some(p => p.availableAfter && week >= p.availableAfter - 4);
    
    if (hasAvailableProjects || hasLockedButRelevant) {
        btn.disabled = false;
        btn.title = hasAvailableProjects ? '圣所维护项目（可开始）' : '圣所维护项目';
        btn.classList.toggle('ready', hasAvailableProjects);
    } else {
        btn.disabled = true;
        btn.title = '圣所维护项目（第 8 周解锁）';
        btn.classList.remove('ready');
    }
}

function openProjectPanel() {
    renderProjectList();
    const overlay = document.getElementById('project-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeProjectPanel() {
    const overlay = document.getElementById('project-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function renderProjectList() {
    const container = document.getElementById('project-list');
    if (!container) return;
    container.innerHTML = '';

    const projects = MemorySanctuary.data.projects || [];
    const state = MemorySanctuary.state;
    const week = state.week;

    if (projects.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">无可用的维护项目</p>';
        return;
    }

    projects.forEach(project => {
        const isActive = state.activeProjects.some(p => p.id === project.id);
        const isCompleted = state.completedProjects.includes(project.id);
        const canStart = canStartProject(project);
        const isLocked = week < project.availableAfter;
        const isRepeatableDone = isCompleted && project.repeatable;

        const item = document.createElement('div');
        item.className = `project-item ${isActive ? 'active' : ''} ${isRepeatableDone ? 'repeatable-done' : ''} ${isCompleted && !project.repeatable ? 'completed' : ''} ${canStart ? 'can-start' : ''} ${isLocked ? 'locked' : ''}`;

        const costHtml = project.cost ? `<div class="project-cost">${project.cost.energy ? `<span>◈ ${project.cost.energy}</span>` : ''}${project.cost.media ? `<span>◇ ${project.cost.media}</span>` : ''}</div>` : '';
        const effectHtml = `<div class="project-effect">${getProjectEffectText(project)}</div>`;

        let buttonHtml = '';
        if (isLocked) {
            buttonHtml = `<button class="project-btn" disabled>第${project.availableAfter}周解锁</button>`;
        } else if (isActive) {
            const active = state.activeProjects.find(p => p.id === project.id);
            buttonHtml = `<button class="project-btn" disabled>进行中 (${active.remainingWeeks}周)</button>`;
        } else if (isCompleted && !project.repeatable) {
            buttonHtml = `<button class="project-btn" disabled>已完成</button>`;
        } else if (isRepeatableDone && canStart) {
            buttonHtml = `<button class="project-btn" data-project-id="${project.id}">再次开始</button>`;
        } else if (isRepeatableDone && !canStart) {
            buttonHtml = `<button class="project-btn" disabled>已完成（资源不足）</button>`;
        } else if (canStart) {
            buttonHtml = `<button class="project-btn" data-project-id="${project.id}">开始项目</button>`;
        } else {
            buttonHtml = `<button class="project-btn" disabled>资源不足</button>`;
        }

        item.innerHTML = `
            <div class="project-name">${project.name}</div>
            <div class="project-desc">${project.description}</div>
            ${costHtml}
            ${effectHtml}
            <div class="project-duration">耗时：${project.duration}周</div>
            ${buttonHtml}
        `;

        container.appendChild(item);
    });

    // Bind start buttons
    container.querySelectorAll('.project-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.target.dataset.projectId;
            if (startProject(projectId)) {
                renderProjectList();
            }
        });
    });
}

function getProjectEffectText(project) {
    if (!project.effect) return '';
    const e = project.effect;
    switch (e.type) {
        case 'resourceBoost':
            return `每回合 +${e.amount} ${getResourceName(e.resource)}`;
        case 'foodBoost':
            return `每回合 +${e.amount} 食物`;
        case 'decayReduction':
            return `${getResourceName(e.resource)} 衰减降低 ${Math.round(e.percent * 100)}%`;
        case 'unlockArchives':
            return `解锁 ${e.archiveIds.length} 条加密记录`;
        default:
            return '';
    }
}

// ==========================================
// 成就系统 UI
// ==========================================

function initAchievementsPanel() {
    const btn = document.getElementById('title-achievements');
    if (btn) {
        btn.addEventListener('click', () => openAchievementsPanel());
    }
    
    const closeBtn = document.getElementById('achievements-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeAchievementsPanel());
    }
    
    // Filter buttons
    document.querySelectorAll('.ach-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ach-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderAchievementsList(btn.dataset.filter);
        });
    });
}

function openAchievementsPanel() {
    const panel = document.getElementById('achievements-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderAchievementsList('all');
    updateAchievementsProgress();
}

function closeAchievementsPanel() {
    const panel = document.getElementById('achievements-panel');
    if (panel) panel.classList.add('hidden');
}

function updateAchievementsProgress() {
    const unlocked = getUnlockedAchievements();
    const all = MemorySanctuary.data.achievements || [];
    const progressEl = document.getElementById('achievements-progress');
    if (progressEl) {
        progressEl.textContent = `${unlocked.length} / ${all.length} 已解锁`;
    }
}

function renderAchievementsList(filter) {
    const container = document.getElementById('achievements-list');
    if (!container) return;
    
    const allAchievements = MemorySanctuary.data.achievements || [];
    const unlocked = getUnlockedAchievements();
    
    let filtered = allAchievements;
    if (filter !== 'all') {
        filtered = allAchievements.filter(a => a.category === filter);
    }
    
    // Sort: unlocked first, then by category
    filtered.sort((a, b) => {
        const aUnlocked = unlocked.includes(a.id);
        const bUnlocked = unlocked.includes(b.id);
        if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
        return (a.category || '').localeCompare(b.category || '');
    });
    
    if (filtered.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); text-align: center; padding: 2rem;">暂无此类别成就</p>';
        return;
    }
    
    container.innerHTML = '';
    
    for (const ach of filtered) {
        const isUnlocked = unlocked.includes(ach.id);
        const isHidden = ach.hidden && !isUnlocked;
        
        const item = document.createElement('div');
        item.className = `achievement-item ${isUnlocked ? 'unlocked' : 'locked'}`;
        
        const icon = isHidden ? '❓' : ach.icon;
        const name = isHidden ? '???' : ach.name;
        const desc = isHidden ? '隐藏成就，解锁后显示描述' : ach.description;
        
        item.innerHTML = `
            <div class="ach-icon">${icon}</div>
            <div class="ach-info">
                <div class="ach-name">${name}</div>
                <div class="ach-desc">${desc}</div>
                <div class="ach-category">${getCategoryName(ach.category)}</div>
            </div>
            ${isUnlocked ? '<div class="ach-check">✓</div>' : ''}
        `;
        
        container.appendChild(item);
    }
}

function getCategoryName(cat) {
    const names = {
        milestone: '里程碑',
        ending: '结局',
        guardian: '守护者',
        collection: '收集',
        vault: '存储室',
        playthrough: '周目',
        challenge: '挑战',
        meta: '元成就'
    };
    return names[cat] || cat;
}

function showAchievementToast(achievement) {
    const toast = document.getElementById('achievement-toast');
    if (!toast) return;
    
    const icon = toast.querySelector('.toast-icon');
    const name = toast.querySelector('.toast-name');
    const desc = toast.querySelector('.toast-desc');
    
    if (icon) icon.textContent = achievement.icon || '🏆';
    if (name) name.textContent = achievement.name;
    if (desc) desc.textContent = achievement.description;
    
    toast.classList.remove('hidden');
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hidden');
    }, 3000);
}

// ==========================================
// 回顾面板 UI
// ==========================================

function initCodexPanel() {
    const btn = document.getElementById('title-codex');
    if (btn) {
        btn.addEventListener('click', () => openCodexPanel());
    }
    
    const closeBtn = document.getElementById('codex-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeCodexPanel());
    }
    
    // Tab buttons
    document.querySelectorAll('.codex-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.codex-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.codex-tab-content').forEach(c => c.classList.remove('active'));
            const tabId = 'codex-' + btn.dataset.tab;
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        });
    });
}

function openCodexPanel() {
    const panel = document.getElementById('codex-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    renderCodex();
}

function closeCodexPanel() {
    const panel = document.getElementById('codex-panel');
    if (panel) panel.classList.add('hidden');
}

function renderCodex() {
    const ngData = getNGPlusData();
    
    // Update stats
    const ptCount = document.getElementById('codex-playthrough-count');
    if (ptCount) ptCount.textContent = ngData.playthroughCount;
    
    const totalArch = document.getElementById('codex-total-archives');
    if (totalArch) totalArch.textContent = ngData.totalArchivesSaved;
    
    const bestRun = document.getElementById('codex-best-run');
    if (bestRun) {
        if (ngData.bestRun) {
            bestRun.textContent = `${ngData.bestRun.count} 条（第${ngData.bestRun.week}周）`;
        } else {
            bestRun.textContent = '-';
        }
    }
    
    // Render endings tab
    renderCodexEndings();
    
    // Render guardians tab
    renderCodexGuardians();
    
    // Render entries tab
    renderCodexEntries();
}

function renderCodexEndings() {
    const container = document.getElementById('codex-endings-list');
    if (!container) return;
    
    const endings = MemorySanctuary.data.endings || [];
    const unlockedAchievements = getUnlockedAchievements();
    
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
    
    container.innerHTML = '';
    
    for (const ending of endings) {
        const achievementId = endingToAchievement[ending.id] || ending.id;
        const isUnlocked = unlockedAchievements.includes(achievementId);
        
        const item = document.createElement('div');
        item.className = `codex-ending-item ${isUnlocked ? 'unlocked' : 'locked'}`;
        
        // 使用 Array.from 正确处理 emoji（部分 emoji 是代理对）
        const chars = Array.from(ending.title);
        const icon = isUnlocked ? (chars[0] || '📜') : '🔒';
        const title = isUnlocked ? ending.title : '???';
        const desc = isUnlocked ? ending.description : '未解锁 — 条件：' + (ending.condition?.description || '未知');
        
        item.innerHTML = `
            <div class="codex-ending-icon">${icon}</div>
            <div class="codex-ending-title">${title}</div>
            <div class="codex-ending-desc">${desc.substring(0, 120)}${desc.length > 120 ? '...' : ''}</div>
        `;
        
        container.appendChild(item);
    }
}

function renderCodexGuardians() {
    const container = document.getElementById('codex-guardians-list');
    if (!container) return;
    
    const guardians = MemorySanctuary.data.guardians || [];
    const ngData = getNGPlusData();
    const history = ngData.guardianHistory || [];
    const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
    const tierColors = { hostile: '#e74c3c', cold: '#5dade2', neutral: '#aaa', friendly: '#f39c12', intimate: '#e91e63' };
    
    container.innerHTML = '';
    
    for (const g of guardians) {
        const isSeen = ngData.guardianFinalesSeen.includes(g.id);
        
        // Collect mood history for this guardian
        const moodHistory = [];
        for (const run of history) {
            if (run.moods && run.moods[g.id]) {
                moodHistory.push({
                    playthrough: run.playthrough,
                    week: run.week,
                    tier: run.moods[g.id].tier,
                    level: run.moods[g.id].mood,
                    indicator: run.moods[g.id].indicator
                });
            }
        }
        
        const item = document.createElement('div');
        item.className = `codex-guardian-item ${isSeen ? 'unlocked' : 'locked'}`;
        
        let historyHtml = '';
        if (moodHistory.length > 0) {
            historyHtml = `<div class="codex-guardian-history">`;
            for (const h of moodHistory) {
                const color = tierColors[h.tier] || '#aaa';
                historyHtml += `<span class="codex-guardian-run" style="border-color:${color}" title="第${h.playthrough}周目 · 第${h.week}周">${h.indicator} ${tierNames[h.tier]}</span>`;
            }
            historyHtml += `</div>`;
        } else {
            historyHtml = `<div class="codex-guardian-history"><span class="codex-guardian-no-history">暂无记录 — 完成一次游戏后查看</span></div>`;
        }
        
        // 计算历史最高好感度等级
        const tierRank = { hostile: 0, cold: 1, neutral: 2, friendly: 3, intimate: 4 };
        let bestTier = null;
        for (const h of moodHistory) {
            if (!bestTier || tierRank[h.tier] > tierRank[bestTier]) {
                bestTier = h.tier;
            }
        }
        
        let statusText;
        if (isSeen) {
            statusText = '💕 专属结局已解锁';
        } else if (bestTier === 'intimate') {
            statusText = '🔒 未解锁 — 特定事件未触发';
        } else if (bestTier === 'friendly') {
            statusText = '🔒 未解锁 — 达到亲密关系';
        } else {
            statusText = '🔒 未解锁 — 达到亲密关系';
        }
        
        item.innerHTML = `
            <div class="codex-guardian-avatar">${g.avatar}</div>
            <div class="codex-guardian-info">
                <div class="codex-guardian-name">${g.name} <span class="codex-guardian-title">${g.title || ''}</span></div>
                <div class="codex-guardian-role">${g.role}</div>
                <div class="codex-guardian-status">${statusText}</div>
                ${historyHtml}
            </div>
        `;
        
        container.appendChild(item);
    }
}

function renderCodexEntries() {
    const summaryEl = document.getElementById('codex-entries-summary');
    const container = document.getElementById('codex-entries-list');
    if (!container) return;
    
    const archives = MemorySanctuary.data.archives || [];
    const ngData = getNGPlusData();
    
    // Calculate total unique archives seen
    const totalArchives = archives.filter(a => !a.ngPlusExclusive).length;
    const totalSeen = ngData.totalArchivesSaved;
    
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="codex-entries-stat">
                <span class="codex-entries-label">累计收集</span>
                <span class="codex-entries-value">${totalSeen} / ${totalArchives}</span>
            </div>
        `;
    }
    
    container.innerHTML = '';
    
    // Track which archive IDs the player has seen at least once
    const seenIds = new Set();
    for (const run of (ngData.archiveHistory || [])) {
        for (const id of (run.archives || [])) {
            seenIds.add(id);
        }
    }
    // Also include current run
    if (MemorySanctuary.state && MemorySanctuary.state.completedArchives) {
        for (const id of MemorySanctuary.state.completedArchives) {
            seenIds.add(String(id));
        }
    }
    
    // Group by vault
    const vaults = MemorySanctuary.data.vaults || [];
    for (const vault of vaults) {
        const vaultArchives = archives.filter(a => a.vault === vault.id && !a.ngPlusExclusive);
        if (vaultArchives.length === 0) continue;
        
        const vaultDiv = document.createElement('div');
        vaultDiv.className = 'codex-entries-vault';
        vaultDiv.innerHTML = `<div class="codex-entries-vault-title">${vault.name}</div>`;
        
        const grid = document.createElement('div');
        grid.className = 'codex-entries-grid';
        
        for (const entry of vaultArchives) {
            const isSeen = seenIds.has(String(entry.id));
            const entryDiv = document.createElement('div');
            entryDiv.className = `codex-entry-item ${isSeen ? 'seen' : 'unseen'}`;
            entryDiv.textContent = isSeen ? entry.title : '???';
            entryDiv.title = isSeen ? '点击查看内容' : '未发现';
            
            if (isSeen && entry.content) {
                entryDiv.style.cursor = 'pointer';
                entryDiv.addEventListener('click', () => showArchiveDetail(entry));
            }
            
            grid.appendChild(entryDiv);
        }
        
        vaultDiv.appendChild(grid);
        container.appendChild(vaultDiv);
    }
}

function showArchiveDetail(entry) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = entry.title;
    
    let html = '';
    if (entry.content) {
        html += `<div class="archive-detail-content">${entry.content}</div>`;
    }
    if (entry.guardianReactions) {
        html += '<div class="archive-detail-reactions">';
        for (const [gid, reaction] of Object.entries(entry.guardianReactions)) {
            const guardian = getGuardianById(gid);
            if (guardian) {
                html += `<div class="archive-reaction"><span class="archive-reaction-avatar">${guardian.avatar}</span> <span class="archive-reaction-name">${guardian.name}：</span>「${reaction}」</div>`;
            }
        }
        html += '</div>';
    }
    
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    
    if (closeBtn) {
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => overlay.classList.add('hidden');
    }
}

// ==========================================
// 资源栏悬停提示（EU4/Stellaris 风格）
// ==========================================

function initResourceTooltips() {
    const resourceKeys = ['energy', 'media', 'environment', 'food'];
    resourceKeys.forEach(key => {
        const el = document.getElementById('res-' + key);
        if (!el) return;
        
        el.addEventListener('mouseenter', (e) => showTooltip(e, key));
        el.addEventListener('mousemove', (e) => moveTooltip(e));
        el.addEventListener('mouseleave', () => hideTooltip());
    });
}

function buildResourceTooltip(resourceKey) {
    const state = MemorySanctuary.state;
    if (!state || !state.resourceChanges) return '';
    
    const changes = state.resourceChanges[resourceKey] || 0;
    const changeClass = changes > 0 ? 'gain' : (changes < 0 ? 'loss' : 'neutral');
    const changeSign = changes > 0 ? '+' : '';
    
    // 收集来源分解
    const breakdowns = getResourceBreakdown(resourceKey);
    
    let html = `<div class="rt-title">${getResourceName(resourceKey)}</div>`;
    html += `<div class="rt-total ${changeClass}">${changeSign}${changes.toFixed(1)} / 回合</div>`;
    
    if (breakdowns.length > 0) {
        html += '<div class="rt-breakdown">';
        breakdowns.forEach(b => {
            const bClass = b.amount > 0 ? 'gain' : 'loss';
            const bSign = b.amount > 0 ? '+' : '';
            html += `<div class="rt-item ${bClass}">${bSign}${b.amount.toFixed(1)} ${b.source}</div>`;
        });
        html += '</div>';
    }
    
    // 储量信息
    const maxCap = resourceKey === 'food' ? 80
        : resourceKey === 'energy' ? 150
        : resourceKey === 'media' ? 150
        : 100;
    const current = state.resources[resourceKey] || 0;
    html += `<div class="rt-capacity">储量: ${current.toFixed(1)} / ${maxCap}</div>`;
    
    return html;
}

function getResourceBreakdown(resourceKey) {
    const state = MemorySanctuary.state;
    if (!state) return [];
    
    const breakdowns = [];
    
    // 自然衰减
    const decay = (typeof getWeeklyDecay === 'function') ? getWeeklyDecay() : null;
    if (decay && decay[resourceKey]) {
        breakdowns.push({ amount: -decay[resourceKey], source: '自然衰减' });
    }
    
    // 季节性效果（食物）
    if (resourceKey === 'food' && typeof getCurrentSeason === 'function') {
        const season = getCurrentSeason();
        if (season.foodMod !== 0) {
            breakdowns.push({ amount: season.foodMod, source: '季节变化' });
        }
    }
    
    // 腐败度额外衰减（作用于能源/介质/环境，不作用于食物）
    if (state.emergencyCorruption > 0 && resourceKey !== 'food') {
        const corruptionPenalty = Math.floor(state.emergencyCorruption / 20) * 0.5;
        if (corruptionPenalty > 0) {
            breakdowns.push({ amount: -corruptionPenalty, source: '圣所腐败' });
        }
    }
    
    // 项目增益
    if (state.activeProjects) {
        state.activeProjects.forEach(p => {
            const proj = (typeof getProjectById === 'function') ? getProjectById(p.id) : null;
            if (proj && proj.effect && proj.effect.type === 'resourceBoost' && proj.effect.resource === resourceKey && proj.effect.amount) {
                breakdowns.push({ amount: proj.effect.amount, source: proj.name || '项目' });
            }
            if (proj && proj.effect && proj.effect.type === 'foodBoost' && resourceKey === 'food' && proj.effect.amount) {
                breakdowns.push({ amount: proj.effect.amount, source: proj.name || '农场' });
            }
        });
    }
    
    // 持续效果（ongoing effects）
    if (state.ongoingEffects) {
        state.ongoingEffects.forEach(eff => {
            if (eff.resource === resourceKey && eff.amount) {
                breakdowns.push({ amount: eff.amount, source: '持续效果' + (eff.remainingTurns ? ` (${eff.remainingTurns}回合)` : '') });
            }
        });
    }
    
    // 解锁的永久奖励
    if (state.unlockedBonuses) {
        state.unlockedBonuses.forEach(bonus => {
            if (bonus === 'energy_per_turn_3' && resourceKey === 'energy') {
                breakdowns.push({ amount: 3, source: '永久增益' });
            } else if (bonus === 'energy_per_turn_2' && resourceKey === 'energy') {
                breakdowns.push({ amount: 2, source: '永久增益' });
            }
        });
    }
    
    return breakdowns;
}

function showTooltip(event, resourceKey) {
    let tooltip = document.getElementById('resource-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'resource-tooltip';
        document.body.appendChild(tooltip);
    }
    
    tooltip.dataset.resourceKey = resourceKey;
    tooltip.innerHTML = buildResourceTooltip(resourceKey);
    tooltip.classList.add('visible');
    
    moveTooltip(event);
}

function moveTooltip(event) {
    const tooltip = document.getElementById('resource-tooltip');
    if (!tooltip || !tooltip.classList.contains('visible')) return;
    
    const padding = 12;
    let x = event.clientX + padding;
    let y = event.clientY + padding;
    
    // 防止溢出屏幕右边缘
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - padding) {
        x = event.clientX - rect.width - padding;
    }
    // 防止溢出屏幕底部
    if (y + rect.height > window.innerHeight - padding) {
        y = event.clientY - rect.height - padding;
    }
    
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
}

function hideTooltip() {
    const tooltip = document.getElementById('resource-tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
    }
}

// 章节标题数据
const CHAPTER_DATA = {
    1: { number: '一', title: '奠基', subtitle: '灾难第9个月 · 圣所初建' },
    2: { number: '二', title: '调试', subtitle: '灾难第10个月 · 系统调试' },
    3: { number: '三', title: '运行', subtitle: '灾难第11个月 · 全面运行' },
    4: { number: '四', title: '裂痕', subtitle: '灾难第12个月 · 首次危机' },
    5: { number: '五', title: '衰退', subtitle: '灾难第13个月 · 地表恶化' },
    6: { number: '六', title: '灰绿', subtitle: '灾难第14个月 · 生态崩溃' },
    7: { number: '七', title: '沉默', subtitle: '灾难第15个月 · 海洋死寂' },
    8: { number: '八', title: '尘暴', subtitle: '灾难第16个月 · 土壤粉末化' },
    9: { number: '九', title: '病变', subtitle: '灾难第17个月 · 羽毛病变' },
    10: { number: '十', title: '暴动', subtitle: '灾难第18个月 · 配给暴动' },
    11: { number: '十一', title: '瓦解', subtitle: '灾难第19个月 · 共享公约瓦解' },
    12: { number: '十二', title: '终章', subtitle: '灾难第20个月 · 最终封存' }
};

function showChapterTitle(chapterNum) {
    const data = CHAPTER_DATA[chapterNum];
    if (!data) return;
    
    // 章节提示条放在画面顶部
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    // 查找或创建章节提示条
    let banner = document.getElementById('chapter-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'chapter-banner';
        banner.className = 'chapter-banner';
        // 插入为 game-container 的第一个子元素
        gameContainer.insertBefore(banner, gameContainer.firstChild);
    }
    
    // 设置内容
    banner.innerHTML = `
        <span class="chapter-banner-text">第 ${data.number} 章 · ${data.title}</span>
        <span class="chapter-banner-sub">${data.subtitle || ''}</span>
    `;
    
    // 重置动画
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    
    // 同时触发 Canvas 衰败效果
    if (typeof triggerChapterTransitionEffect === 'function') {
        triggerChapterTransitionEffect();
    }
    
    // 3秒后淡出
    setTimeout(() => {
        banner.classList.remove('show');
    }, 3000);
}

