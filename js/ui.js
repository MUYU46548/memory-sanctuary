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
}

// ==========================================
// 周数显示
// ==========================================

function renderWeekDisplay() {
    const weekEl = document.getElementById('week-value');
    if (weekEl && MemorySanctuary.state) {
        weekEl.textContent = MemorySanctuary.state.week;
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
        const isCompleted = isArchiveCompleted(entry.id);
        const isExpired = entry.expired;
        const canArchive = !isCompleted && !isExpired && hasResources(entry.energyCost, entry.dataCost);
        
        const item = document.createElement('div');
        item.className = `entry-item ${isCompleted ? 'archived' : ''} ${isExpired ? 'expired' : ''}`;
        
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
