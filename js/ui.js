/**
 * ui.js - UI渲染
 * 资源面板、存储室标签、归档条目、守护者面板
 */

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
    
    console.log('[UI] 初始化完成');
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
        if (percent >= 90) {
            progressEl.style.background = 'var(--danger)';
        } else if (percent >= 70) {
            progressEl.style.background = 'var(--warning)';
        } else {
            progressEl.style.background = 'var(--amber-primary)';
        }
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
    
    if (energyEl) energyEl.textContent = Math.floor(resources.energy);
    if (mediaEl) mediaEl.textContent = Math.floor(resources.media);
    if (envEl) envEl.textContent = Math.floor(resources.environment);
    
    updateResourceColor('res-energy', resources.energy, 100);
    updateResourceColor('res-media', resources.media, 60);
    updateResourceColor('res-environment', resources.environment, 100);
    
    // 圣所衰竭视觉指示
    const det = MemorySanctuary.state.deterioration;
    const resEnergy = document.getElementById('res-energy');
    const resMedia = document.getElementById('res-media');
    const resEnv = document.getElementById('res-environment');
    
    if (resEnergy) resEnergy.classList.toggle('deterioration', det && det.energy);
    if (resMedia) resMedia.classList.toggle('deterioration', det && det.media);
    if (resEnv) resEnv.classList.toggle('deterioration', det && det.environment);
}

function updateResourceColor(elementId, value, max) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const ratio = value / max;
    const valueEl = el.querySelector('.res-value');
    if (!valueEl) return;
    
    if (ratio < 0.2) {
        valueEl.style.color = 'var(--danger)';
    } else if (ratio < 0.5) {
        valueEl.style.color = 'var(--warning)';
    } else {
        valueEl.style.color = 'var(--amber-glow)';
    }
}

// ==========================================
// 存储室标签
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
    
    if (week >= 10 && hasAvailableProjects) {
        btn.disabled = false;
        btn.title = '圣所维护项目（可开始）';
        btn.classList.add('ready');
    } else if (week >= 10 && MemorySanctuary.state.activeProjects && MemorySanctuary.state.activeProjects.length > 0) {
        btn.disabled = false;
        btn.title = '圣所维护项目（进行中）';
        btn.classList.remove('ready');
    } else {
        btn.disabled = true;
        btn.title = '圣所维护项目（未解锁）';
        btn.classList.remove('ready');
    }
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

        const item = document.createElement('div');
        item.className = `project-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${canStart ? 'can-start' : ''} ${isLocked ? 'locked' : ''}`;

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
        case 'decayReduction':
            return `${getResourceName(e.resource)} 衰减降低 ${Math.round(e.percent * 100)}%`;
        case 'unlockArchives':
            return `解锁 ${e.archiveIds.length} 条加密记录`;
        default:
            return '';
    }
}

function getResourceName(resource) {
    const names = { energy: '能源', media: '介质', environment: '环境' };
    return names[resource] || resource;
}
