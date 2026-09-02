/**
 * ui.js - UI渲染
 * 资源面板、存储室标签、归档条目、守护者面板
 */

// 调试模式开关：发布时设为 false，开发时设为 true
// DEBUG 由 js/main.js 统一声明（单一来源），此处不再重复声明


function initUI() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            // 封印流程锁定时不允许背景点击关闭
            if (e.target === overlay && overlay.dataset.locked) return;
            if (e.target === overlay) closeModal();
        });
    }
    
    document.addEventListener('keydown', (e) => {
        // 封印流程锁定时不允许 ESC 关闭
        const overlay = document.getElementById('modal-overlay');
        if (overlay && overlay.dataset.locked) return;
        if (e.key === 'Escape') closeModal();
    });

    // 批量归档模式按钮
    const batchBtn = document.getElementById('batch-archive-btn');
    if (batchBtn) {
        batchBtn.addEventListener('click', () => {
            if (MemorySanctuary.state.batchArchiveMode) {
                showBatchExitConfirm();
            } else {
                enterBatchArchiveMode();
            }
        });
    }

    // 标签页切换
    document.querySelectorAll('.action-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // 切换标签按钮状态
            document.querySelectorAll('.action-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // 切换内容显示
            document.querySelectorAll('.action-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById('tab-' + tabName).classList.add('active');

            // 科技面板打开反馈：机械咬合音（v0.2.4，参考「面板打开必须有动画+音效」教训）
            if (tabName === 'tech' && typeof AudioSystem !== 'undefined' && AudioSystem.playMechanicalEngage) {
                AudioSystem.playMechanicalEngage();
            }
        });
    });

    // Initialize title screen panels (must be here because ui.js loads after main.js)
    initAchievementsPanel();
    initCodexPanel();
    initProjectPanel();
    initResourceTooltips();
    initTopBarInteractions();

    if (DEBUG) console.log('[UI] 初始化完成');
}

/**
 * 编程式切换主操作标签页（archive / guardian / vault）
 * 供推荐归档跳转、新手引导等需要把某个标签页带到玩家眼前的场景使用
 */
function switchActionTab(tabName) {
    const tabBtn = document.querySelector(`.action-tab[data-tab="${tabName}"]`);
    if (tabBtn && !tabBtn.classList.contains('active')) {
        tabBtn.click();
    }
}

/**
 * 批量归档退出确认弹窗
 */
function showBatchExitConfirm() {
    const state = MemorySanctuary.state;
    if (!state || !state.batchArchiveMode) return;
    
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    if (!overlay || !title || !content) return;
    
    title.textContent = '退出紧急归档';
    
    const count = state.batchArchiveCount || 0;
    let text = '';
    if (count === 0) {
        text = '尚未归档任何条目。确定要退出吗？\n\n退出后将退回已付出的代价（环境+10、心情+2、衰减惩罚取消）。';
    } else {
        text = `已归档 ${count} 条。确定要退出吗？\n\n退出后将推进1周时间，且已付出的代价不予退回。`;
    }
    
    content.innerHTML = esc(text, true);
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
    
    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '继续归档';
    cancelBtn.className = 'modal-btn modal-btn-cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.fontSize = '0.85rem';
    cancelBtn.style.fontFamily = 'var(--font-cn)';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.border = '1px solid var(--border-subtle)';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.color = 'var(--text-primary)';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
        closeModal();
    };
    
    // 确认退出按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确认退出';
    confirmBtn.className = 'modal-btn modal-btn-confirm';
    confirmBtn.style.padding = '8px 16px';
    confirmBtn.style.fontSize = '0.85rem';
    confirmBtn.style.fontFamily = 'var(--font-cn)';
    confirmBtn.style.background = 'var(--danger, #d44)';
    confirmBtn.style.border = '1px solid var(--danger, #d44)';
    confirmBtn.style.borderRadius = '4px';
    confirmBtn.style.color = '#fff';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.onclick = () => {
        closeModal();
        exitBatchArchiveMode();
    };
    
    confirmContainer.appendChild(cancelBtn);
    confirmContainer.appendChild(confirmBtn);
    content.appendChild(confirmContainer);
}

/**
 * 更新紧急归档按钮状态
 */
function updateBatchArchiveBtn() {
    const btn = document.getElementById('batch-archive-btn');
    if (!btn) return;
    
    const state = MemorySanctuary.state;
    
    // 正在批量模式
    if (state.batchArchiveMode) {
        btn.textContent = `🚨 紧急归档中 (${state.batchArchiveCount || 0}/3)`;
        btn.classList.add('active');
        btn.classList.remove('locked');
        return;
    }
    
    // 未解锁（<30周）
    if (state.week < 30) {
        btn.textContent = `🚨 紧急归档 (${state.week}/30)`;
        btn.classList.add('locked');
        btn.classList.remove('active');
        return;
    }
    
    // 已使用过
    if (state.batchArchiveUsedThisRun) {
        btn.textContent = '🚨 紧急归档 (已使用)';
        btn.classList.add('locked');
        btn.classList.remove('active');
        return;
    }
    
    // 可用状态
    btn.textContent = '🚨 紧急归档';
    btn.classList.remove('locked', 'active');
}

function initProjectPanel() {
    // 注：#project-btn 的 click 绑定由 game.js initFuncBar 统一处理（带点击音效 + state 守卫）。
    // T3-6 修复：此处曾重复绑定 openProjectPanel，点击会双响并双开面板，已移除。
    
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

// ============================================================
// 渲染调度器 — 防止 renderAll 在单帧内被多次调用
// ============================================================
let renderScheduled = false;
let renderFullScheduled = false;
// 成就 Toast 自动隐藏定时器（T3-3：连续触发时清除旧定时器，避免提前隐藏）
let achievementToastTimer = null;

function requestRender(full = false) {
    if (full) {
        renderFullScheduled = true;
    }
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
        renderScheduled = false;
        if (renderFullScheduled) {
            renderFullScheduled = false;
            renderAll();
        } else {
            renderAll();
        }
    });
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
    updateBatchArchiveBtn();
    renderSealTopbarButton();
    renderEngineeringBotsPanel();
    renderGuardianStoryProgress();
    renderTechPanel();
    
    // Always keep resource changes up-to-date
    if (typeof recalculateResourceChanges === 'function') recalculateResourceChanges();

    // 项目面板打开时同步刷新（进行中项目的剩余周数实时更新）
    const projectOverlay = document.getElementById('project-overlay');
    if (projectOverlay && !projectOverlay.classList.contains('hidden') && typeof renderProjectList === 'function') {
        renderProjectList();
    }

    // 守护者补给按钮状态同步（可分发时脉冲提示 + 首次提示气泡）
    const boostBtn = document.getElementById('guardian-boost');
    if (boostBtn && MemorySanctuary.state) {
        const st = MemorySanctuary.state;
        const onCooldown = st.lastSupplyWeek && st.lastSupplyWeek === st.week;
        const hasFood = (st.resources.food || 0) >= 8;
        boostBtn.classList.toggle('boost-available', !onCooldown && hasFood);
        boostBtn.disabled = onCooldown;
        boostBtn.textContent = onCooldown ? '🎁 分发补给品（本周已分发）' : '🎁 分发补给品';
        boostBtn.title = onCooldown ? '补给品本周已分发，下周再来吧'
            : hasFood ? '消耗 8 食物为所有守护者提供额外补给，每周限一次'
            : '食物不足（需要 8 食物）';

        const hint = document.getElementById('guardian-boost-hint');
        if (hint) {
            const showHint = !onCooldown && hasFood && st.guardianBoostHintWeek !== st.week;
            hint.classList.toggle('hidden', !showHint);
            if (showHint) st.guardianBoostHintWeek = st.week;
        }
    }
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
    const canSeal = canSealSanctuary();

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
    const fatigueEl = document.getElementById('guardian-fatigue');
    
    if (!moodEl || !nameEl) return;
    
    // 从当前守护者姓名获取ID
    const name = nameEl.textContent;
    const guardian = MemorySanctuary.data.guardians.find(g => g.name === name);
    if (!guardian) return;
    
    const guardianId = guardian.id;
    moodEl.textContent = getMoodIndicator(guardianId);
    moodEl.className = 'guardian-mood mood-' + getMoodTier(guardianId);
    
    // 疲劳状态指示
    const fatigueWeeks = getFatigueWeeksLeft(guardianId);
    if (fatigueEl) {
        if (fatigueWeeks > 0) {
            fatigueEl.textContent = `💤 ${fatigueWeeks}周`;
            fatigueEl.classList.remove('hidden');
            moodEl.classList.add('fatigued');
        } else {
            fatigueEl.textContent = '';
            fatigueEl.classList.add('hidden');
            moodEl.classList.remove('fatigued');
        }
    }
    
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
        const fatigueWeeks = getFatigueWeeksLeft(g.id);
        
        if (fatigueWeeks > 0) {
            item.classList.add('fatigued');
        }
        
        item.innerHTML = `
            <span class="guardian-overview-avatar">${g.avatar}</span>
            <span class="guardian-overview-name">${g.name}</span>
            <span class="guardian-overview-mood">${moodIndicator}</span>
            <span class="guardian-overview-fatigue">${fatigueWeeks > 0 ? `💤${fatigueWeeks}` : ''}</span>
        `;
        
        item.addEventListener('click', () => {
            // 切换主守护者
            document.getElementById('guardian-avatar').textContent = g.avatar;
            document.getElementById('guardian-name').textContent = g.name;
            document.getElementById('guardian-role').textContent = g.role;
            
            // 更新对话：疲劳中显示疲劳对话
            const fatigueWeeksClick = getFatigueWeeksLeft(g.id);
            let dialogues;
            if (fatigueWeeksClick > 0 && g.fatigueDialogues && g.fatigueDialogues.length > 0) {
                dialogues = g.fatigueDialogues;
            } else {
                dialogues = g.dialogues?.idle || ['……'];
            }
            document.getElementById('guardian-dialogue').textContent = dialogues[Math.floor(Math.random() * dialogues.length)];
            
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

    // 下一档进度（阈值：hostile ≤ -3，cold < 0，neutral ≤ 2，friendly ≤ 4，intimate > 4）
    let progressHtml = '';
    if (tier === 'intimate') {
        progressHtml = `<div class="guardian-detail-value" style="color: var(--success);">已达最高档 —— 亲密关系带来归档案加成与专属结局。</div>`;
    } else {
        const nextThreshold = tier === 'hostile' ? 0 : (tier === 'cold' ? 3 : (tier === 'neutral' ? 5 : 7));
        const need = nextThreshold - moodLevel;
        progressHtml = `<div class="guardian-detail-value">距「${tierNames[tier === 'hostile' ? 'cold' : tier === 'cold' ? 'neutral' : tier === 'neutral' ? 'friendly' : 'intimate']}」还需 ${need} 点</div>`;
    }

    // 历史最高好感度（跨周目）：让标签有深度，玩家能感知羁绊沉淀
    let historyHtml = '';
    const maxTierInfo = (typeof getGuardianMaxTier === 'function') ? getGuardianMaxTier(guardian.id) : null;
    if (maxTierInfo) {
        historyHtml = `<div class="guardian-detail-value history-tier">历史最深羁绊：${tierNames[maxTierInfo.tier]}${maxTierInfo.playthrough ? `（第${maxTierInfo.playthrough}周目）` : ''}</div>`;
    }

    const skillsHtml = guardian.skills?.map(s => 
        `<span class="guardian-detail-skill">${SKILL_NAMES[s] || s}</span>`
    ).join('') || '';

    // 背景档案（解锁条件：历史最高亲密 + 第 2 周目起）
    let loreHtml = '';
    const ngData = (typeof getNGPlusData === 'function') ? getNGPlusData() : null;
    const ptCount = ngData ? (ngData.playthroughCount || 0) : 0;
    if (guardian.lore) {
        const loreUnlocked = maxTierInfo && maxTierInfo.tier === 'intimate' && ptCount >= 2;
        loreHtml = `
            <div class="guardian-detail-section">
                <div class="guardian-detail-label">📖 背景档案</div>
                ${loreUnlocked
                    ? `<div class="guardian-detail-value lore-text">${guardian.lore}</div>`
                    : `<div class="guardian-detail-value lore-locked">？？？—— 羁绊尚浅，往事未显${ptCount < 2 ? '（需第 2 周目，且曾达到亲密）' : '（需曾达到亲密）'}</div>`}
            </div>`;
    }

    // 回忆片段（按陪伴周目数逐步解锁）
    let memoriesHtml = '';
    if (guardian.memories && guardian.memories.length > 0) {
        const memItems = guardian.memories.map(mem => {
            const unlocked = ptCount >= (mem.unlockPlaythrough || 1);
            return unlocked
                ? `<button class="guardian-memory-btn" data-mem-id="${mem.id}" data-gid="${guardian.id}">🌌 ${mem.title}</button>`
                : `<button class="guardian-memory-btn locked" disabled>🌌 ？？？（第 ${mem.unlockPlaythrough} 周目解锁）</button>`;
        }).join('');
        memoriesHtml = `
            <div class="guardian-detail-section">
                <div class="guardian-detail-label">🌌 回忆片段</div>
                <div class="guardian-detail-memories">${memItems}</div>
            </div>`;
    }
    
    detailPanel.innerHTML = `
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">技能</div>
            <div class="guardian-detail-skills">${skillsHtml}</div>
        </div>
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">关系等级</div>
            <div class="guardian-detail-value">${tierNames[tier]} (${moodLevel > 0 ? '+' : ''}${moodLevel})</div>
            ${progressHtml}
            ${historyHtml}
        </div>
        <div class="guardian-detail-section">
            <div class="guardian-detail-label">职责</div>
            <div class="guardian-detail-value">${guardian.role}</div>
        </div>
        ${loreHtml}
        ${memoriesHtml}
    `;

    // 绑定回忆片段点击
    detailPanel.querySelectorAll('.guardian-memory-btn[data-mem-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            showGuardianMemory(btn.dataset.gid, btn.dataset.memId);
        });
    });
}

/**
 * 查看守护者回忆片段（弹窗演出）
 */
function showGuardianMemory(guardianId, memId) {
    const guardian = (typeof getGuardianById === 'function') ? getGuardianById(guardianId) : null;
    const mem = guardian && guardian.memories ? guardian.memories.find(m => m.id === memId) : null;
    if (!mem) return;

    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');
    if (!overlay || !title || !content) return;

    title.textContent = `${guardian.name} · ${mem.title}`;
    content.innerHTML = esc(mem.text, true);
    overlay.classList.remove('hidden');

    if (closeBtn) {
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => overlay.classList.add('hidden');
    }
    if (typeof AudioSystem !== 'undefined' && AudioSystem.playButtonClick) {
        AudioSystem.playButtonClick();
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
        // 可点击反馈：显示周数含义
        weekEl.style.cursor = 'pointer';
        weekEl.title = `第 ${newWeek} 周 / 共 ${MAX_WEEK} 周\n点击查看本周进度说明`;
        if (!weekEl._bound) {
            weekEl._bound = true;
            weekEl.addEventListener('click', () => {
                const w = MemorySanctuary.state.week;
                const remain = MAX_WEEK - w;
                addLog(`📅 第 ${w} 周：剩余 ${remain} 周。封印需满 20 周，全周目上限 ${MAX_WEEK} 周。`, 'system');
            });
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
    const state = MemorySanctuary.state;
    
    const energyEl = document.getElementById('energy-value');
    const mediaEl = document.getElementById('media-value');
    const envEl = document.getElementById('environment-value');
    const foodEl = document.getElementById('food-value');
    const botsEl = document.getElementById('bots-value');

    // 顶栏资源 chips：点击弹出说明卡（悬停提示的固定版）
    const chipKeys = ['energy', 'media', 'environment', 'food', 'engineeringBots'];
    chipKeys.forEach(key => {
        const chip = document.getElementById('res-' + (key === 'engineeringBots' ? 'bots' : key));
        if (!chip || chip._bound) return;
        chip._bound = true;
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof togglePinnedResourceTooltip === 'function') togglePinnedResourceTooltip(key);
        });
    });

    if (energyEl) energyEl.textContent = Math.floor(resources.energy);
    if (mediaEl) mediaEl.textContent = Math.floor(resources.media);
    if (envEl) envEl.textContent = Math.floor(resources.environment);
    if (foodEl) foodEl.textContent = Math.floor(resources.food);
    if (botsEl) botsEl.textContent = Math.floor(resources.engineeringBots || 0);
    
    updateResourceColor('res-energy', resources.energy, 100);
    updateResourceColor('res-media', resources.media, 60);
    updateResourceColor('res-environment', resources.environment, 100);
    updateResourceColor('res-food', resources.food, 80);
    
    // 工程机器人状态颜色
    if (botsEl) {
        const botCount = resources.engineeringBots || 0;
        botsEl.className = 'res-value ' + (botCount > 0 ? 'active' : 'inactive');
    }
    
    // 刷新悬停提示（如果可见）
    const tooltip = document.getElementById('resource-tooltip');
    if (tooltip && tooltip.classList.contains('visible') && tooltip.dataset.resourceKey) {
        tooltip.innerHTML = buildResourceTooltip(tooltip.dataset.resourceKey);
    }
    
    // 圣所衰竭视觉指示
    const det = state.deterioration;
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
    
    // 衰减惩罚预警（紧急归档后下周衰减+20%）
    const resPanel = document.getElementById('resource-panel');
    if (resPanel) {
        if (state.nextWeekDecayPenalty > 0) {
            resPanel.classList.add('decay-penalty');
        } else {
            resPanel.classList.remove('decay-penalty');
        }
    }
    
    // 工程机器人停机警告：整个 chip 呼吸闪烁（不做突兀的红色数字高亮）
    const botsChip = document.getElementById('res-bots');
    if (state.botBlackoutLogged) {
        if (botsChip) botsChip.classList.add('bot-blackout');
    } else {
        if (botsChip) botsChip.classList.remove('bot-blackout');
    }
}

function getResourceStatus() {
    const state = MemorySanctuary.state;
    if (!state) return { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 };
    
    return {
        energy: Math.max(0, state.resources.energy),
        media: Math.max(0, state.resources.media),
        environment: Math.max(0, state.resources.environment),
        food: Math.max(0, state.resources.food || 0),
        engineeringBots: state.resources.engineeringBots || 0
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
    const names = { energy: '能源', media: '介质', environment: '环境', food: '食物', engineeringBots: '工程机器人' };
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
    
    // 渲染全部存储室，点击可跳转到该存储室的待归档条目
    MemorySanctuary.data.vaults.forEach(vault => {
        const status = getVaultStatus(vault.id);
        const isActive = vault.id === MemorySanctuary.currentVaultId;
        
        const item = document.createElement('div');
        item.className = `vault-item ${isActive ? 'active' : ''}`;
        item.style.borderLeftColor = vault.accentColor;
        item.style.cursor = 'pointer';
        item.title = `点击查看「${vault.name}」的待归档条目`;
        
        item.innerHTML = `
            <div class="vault-name" style="color: ${vault.accentColor}">${vault.name}</div>
            <div class="vault-capacity">
                <div class="vault-bar">
                    <div class="vault-bar-fill" style="width: ${status.percent}%; background: ${vault.accentColor}"></div>
                </div>
                <span class="vault-bar-text">${status.used}/${vault.capacity}</span>
            </div>
        `;
        
        item.addEventListener('click', () => {
            if (typeof selectVault === 'function') selectVault(vault.id);
            // 切到归档标签页，便于直接处理该存储室待归档
            const archiveTab = document.querySelector('.action-tab[data-tab="archive"]');
            if (archiveTab) archiveTab.click();
        });
        
        container.appendChild(item);
    });
}

// ==========================================
// 归档条目
// ==========================================

function renderArchiveEntries() {
    const container = document.getElementById('entry-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const vaultId = MemorySanctuary.currentVaultId;
    let entries = getArchivesByVault(vaultId);
    
    if (entries.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">暂无待归档条目</p>';
        return;
    }
    
    // 筛选和排序控件
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'entry-controls';
    const vaultOptions = MemorySanctuary.data.vaults
        .map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    controlsDiv.innerHTML = `
        <select id="entry-vault-filter" class="entry-select" title="按存储室筛选">
            ${vaultOptions}
        </select>
        <select id="entry-sort" class="entry-select">
            <option value="default">默认排序</option>
            <option value="cost-asc">消耗↑</option>
            <option value="cost-desc">消耗↓</option>
            <option value="expiry">过期时间</option>
            <option value="theme">主题匹配</option>
        </select>
        <select id="entry-filter" class="entry-select">
            <option value="all">全部</option>
            <option value="affordable">可归档</option>
            <option value="expiring">即将过期</option>
            <option value="conflict">有冲突</option>
            <option value="hidden">有隐藏</option>
        </select>
    `;
    container.appendChild(controlsDiv);
    
    // 获取筛选和排序设置
    const sortBy = (MemorySanctuary.state.entrySort || 'default');
    const filterBy = (MemorySanctuary.state.entryFilter || 'all');
    
    // 应用筛选
    let filteredEntries = entries.filter(entry => {
        if (entry.availableAfter && MemorySanctuary.state.week < entry.availableAfter) return false;

        // 条件解锁门槛（unlockCondition，如机器人专属条目 / NG+ 条目）：
        // 不满足条件的条目直接不显示，而不是显示出来却无法归档
        if ((entry.unlockCondition || entry.ngPlusExclusive)
            && typeof isArchiveAvailable === 'function' && !isArchiveAvailable(entry)) {
            return false;
        }

        switch (filterBy) {
            case 'affordable':
                return canArchiveEntry(entry);
            case 'expiring':
                return entry.expiresAfter && (entry.expiresAfter - MemorySanctuary.state.week) <= 3;
            case 'conflict':
                return checkArchiveConflict(entry.id) !== null;
            case 'hidden':
                return !!entry.hiddenContent;
            default:
                return true;
        }
    });
    
    // 应用排序
    switch (sortBy) {
        case 'cost-asc':
            filteredEntries.sort((a, b) => (a.energyCost + a.dataCost) - (b.energyCost + b.dataCost));
            break;
        case 'cost-desc':
            filteredEntries.sort((a, b) => (b.energyCost + b.dataCost) - (a.energyCost + a.dataCost));
            break;
        case 'expiry':
            filteredEntries.sort((a, b) => (a.expiresAfter || 999) - (b.expiresAfter || 999));
            break;
        case 'theme':
            filteredEntries.sort((a, b) => {
                const vault = MemorySanctuary.data.vaults.find(v => v.id === vaultId);
                const aMatch = vault && vault.themeTags && vault.themeTags.includes(a.type || '');
                const bMatch = vault && vault.themeTags && vault.themeTags.includes(b.type || '');
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
            break;
    }
    
    // 渲染条目列表
    const listDiv = document.createElement('div');
    listDiv.className = 'entry-list-items';
    
    if (filteredEntries.length === 0) {
        listDiv.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">没有符合条件的条目</p>';
    } else {
        filteredEntries.forEach(entry => {
            // ... 现有条目渲染逻辑 ...
            const isCompleted = isArchiveCompleted(entry.id);
            const isExpired = entry.expired;
            const canArchive = canArchiveEntry(entry);

            // 科技树归档加成（v0.2.4）：互斥洞察 / 线索织网
            const techArchiveUi = (typeof getTechArchiveBonus === 'function') ? getTechArchiveBonus() : null;

            const item = document.createElement('div');
            item.className = `entry-item ${isCompleted ? 'archived' : ''} ${isExpired ? 'expired' : ''} ${entry.emergency ? 'emergency' : ''}`;
            
            const chainIndicator = (typeof getChainIndicator === 'function') ? getChainIndicator(entry) : '';
            // 科技树「线索织网」(clueChainBoost)：高亮与已归档条目存在线索关联的待归档条目
            const chainBoostActive = techArchiveUi && techArchiveUi.clueChain &&
                entry.relatedArchives && entry.relatedArchives.length > 0 &&
                entry.relatedArchives.some(id => isArchiveCompleted(id)) &&
                !entry.relatedArchives.every(id => isArchiveCompleted(id));
            if (chainBoostActive) item.classList.add('chain-active');
            
            // Calculate remaining weeks
            const remaining = entry.expiresAfter ? entry.expiresAfter - MemorySanctuary.state.week : null;
            const isExpiringSoon = remaining !== null && remaining <= 3 && remaining > 0;
            
            // 计算主题匹配
            const vault = MemorySanctuary.data.vaults.find(v => v.id === vaultId);
            const effectiveCost = (typeof getEffectiveCost === 'function') ? getEffectiveCost(entry, vault) : null;
            const isThemeMatch = effectiveCost ? effectiveCost.isMatch : null;
            const themeModifier = effectiveCost ? effectiveCost.modifier : 1;
            
            // 根据主题匹配添加边框颜色
            if (isThemeMatch === true) {
                item.classList.add('theme-match-border');
            } else if (isThemeMatch === false) {
                item.classList.add('theme-mismatch-border');
            }
            
            const themeIndicator = isThemeMatch !== null ? (isThemeMatch ? '<span class="theme-match" title="主题契合：此条目与当前存储室主题匹配，归档消耗 -20%">✓契合</span>' : '<span class="theme-mismatch" title="主题不合：此条目与当前存储室主题不符，归档消耗 +30%。改存到匹配主题的存储室可降低消耗">主题不合</span>') : '';

            // 冲突警告（v0.2.4：具体互斥条目名由科技「互斥洞察」(conflictInsight) 开启；
            // 未解锁时仅显示 ⚖ 徽章与通用提示，由玩家阅读简介自行推断）
            const conflict = (typeof checkArchiveConflict === 'function') ? checkArchiveConflict(entry.id) : null;
            const hasInsight = !!(techArchiveUi && techArchiveUi.conflictInsight);
            const conflictWarning = conflict
                ? `<span class="conflict-warning${hasInsight ? ' insight' : ''}" title="${hasInsight
                    ? `叙事互斥：「${conflict.title}」与本条目互斥，归档此条目后它将永久消失。请先想好要保留哪一条`
                    : '检测到叙事互斥（研究「互斥洞察」科技可看到具体条目）。归档此条目后，互斥的另一方将永久消失。'}">⚖互斥${hasInsight ? `：「${esc(conflict.title)}」` : ''}</span>`
                : '';
            
            // 隐藏内容标记
            const hiddenMarker = entry.hiddenContent ? '<span title="包含隐藏叙事">✨</span>' : '';
            
            const costHtml = `
                <div class="entry-cost">
                    <span class="cost-energy">◈ ${effectiveCost ? effectiveCost.energy : entry.energyCost}</span>
                    <span class="cost-data">◇ ${effectiveCost ? effectiveCost.media : entry.dataCost}</span>
                    ${remaining !== null ? `<span style="color: ${isExpiringSoon ? 'var(--danger)' : 'var(--text-dim)'}">⏱ ${remaining}周</span>` : ''}
                </div>
            `;
            
            let mainBtnHtml = '';
            if (isCompleted) {
                mainBtnHtml = `<button class="archive-btn" disabled>已归档</button>`;
            } else if (isExpired) {
                mainBtnHtml = `<button class="archive-btn" disabled>已消失</button>`;
            } else if (!canArchive) {
                const disabledLabel = (MemorySanctuary.state.emergencyArchiveActive) ? '能源不足' : '资源不足';
                mainBtnHtml = `<button class="archive-btn" disabled>${disabledLabel}</button>`;
            } else {
                mainBtnHtml = `<button class="archive-btn" data-archive-id="${entry.id}">录入归档</button>`;
            }

            // 快速归档按钮（每回合限 1 次：本回合已用时置灰，避免"看着能点点了才说不能用"）
            let quickBtnHtml = '';
            if (!isCompleted && !isExpired && canArchive) {
                const quickUsedThisWeek = MemorySanctuary.state.quickArchiveWeek === MemorySanctuary.state.week;
                if (quickUsedThisWeek) {
                    quickBtnHtml = `<button class="archive-btn quick-archive-btn" disabled title="本回合已使用过速记（每回合限 1 次），下回合恢复">⚡已速记</button>`;
                } else {
                    quickBtnHtml = `<button class="archive-btn quick-archive-btn" data-archive-id="${entry.id}" title="速记：省 30% 资源、不推进时间，但牺牲隐藏叙事与守护者注记，每回合限 1 次">⚡速记</button>`;
                }
            }
            
            // AI 助理辅助归档按钮
            let aiBtnHtml = '';
            if (typeof canAiAssistArchive === 'function' && canAiAssistArchive(entry)) {
                const halfCost = `(◈${Math.ceil((entry.energyCost || 0) / 2)} ◇${Math.ceil((entry.dataCost || 0) / 2)})`;
                aiBtnHtml = `<button class="archive-btn ai-assist-btn" data-archive-id="${entry.id}" title="请求AI助理辅助归档：费用减半${halfCost}，环境稳定度 -5，不推进时间">🤖 AI辅助</button>`;
            }
            const buttonHtml = `<div class="entry-actions">${mainBtnHtml}${quickBtnHtml}${aiBtnHtml}</div>`;
            
            item.innerHTML = `
                <div class="entry-title">${entry.title}${hiddenMarker}${chainIndicator}${themeIndicator}${conflictWarning}${isExpiringSoon ? ' <span style="color:var(--danger);font-size:0.7rem">⚠ 即将消失</span>' : ''}</div>
                <div class="entry-desc">${entry.description}</div>
                ${costHtml}
                ${buttonHtml}
            `;
            
            listDiv.appendChild(item);
        });
    }
    
    container.appendChild(listDiv);
    
    // 绑定事件
    container.querySelectorAll('.archive-btn:not(.quick-archive-btn):not(.ai-assist-btn):not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const archiveId = e.target.dataset.archiveId;
            if (typeof confirmArchive === 'function') {
                confirmArchive(archiveId);
            } else {
                archiveEntry(archiveId);
            }
        });
    });
    
    container.querySelectorAll('.quick-archive-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const archiveId = e.target.dataset.archiveId;
            if (typeof confirmQuickArchive === 'function') {
                confirmQuickArchive(archiveId);
            } else {
                archiveEntry(archiveId, 'quick');
            }
        });
    });
    
    container.querySelectorAll('.ai-assist-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const archiveId = e.target.dataset.archiveId;
            if (typeof aiAssistArchive === 'function') {
                aiAssistArchive(archiveId);
            }
        });
    });
    
    // 绑定筛选和排序事件
    const sortSelect = document.getElementById('entry-sort');
    const filterSelect = document.getElementById('entry-filter');
    
    if (sortSelect) {
        sortSelect.value = sortBy;
        sortSelect.onchange = () => {
            MemorySanctuary.state.entrySort = sortSelect.value;
            renderArchiveEntries();
        };
    }
    
    if (filterSelect) {
        filterSelect.value = filterBy;
        filterSelect.onchange = () => {
            MemorySanctuary.state.entryFilter = filterSelect.value;
            renderArchiveEntries();
        };
    }
    
    // 存储室筛选：切换 currentVaultId 并重渲染（同时同步顶部存储室标签高亮）
    const vaultFilterSelect = document.getElementById('entry-vault-filter');
    if (vaultFilterSelect) {
        vaultFilterSelect.value = String(vaultId);
        vaultFilterSelect.onchange = () => {
            const targetVault = parseInt(vaultFilterSelect.value, 10);
            if (!isNaN(targetVault)) {
                selectVault(targetVault);
            }
        };
    }

    // 推荐条目高亮（在列表渲染完成后统一加类，避免 setTimeout 竞态）
    if (typeof applyRecommendedHighlight === 'function') {
        applyRecommendedHighlight();
    }
}

// ==========================================
// 工程机器人状态面板
// ==========================================

function renderEngineeringBotsPanel() {
    const container = document.getElementById('bots-panel');
    if (!container) return;
    
    const state = MemorySanctuary.state;
    const botCount = state.resources.engineeringBots || 0;
    const perBot = (typeof ENGINEERING_BOTS_CONFIG !== 'undefined') ? ENGINEERING_BOTS_CONFIG.maintenanceCostPerBot : 1;
    const maintenanceCost = botCount * perBot;
    const reduction = (typeof getBotDecayReduction === 'function') ? getBotDecayReduction() : 0;
    const isBlackout = state.botBlackoutLogged;

    // 面板追建按钮状态（首台由「建造工程机器人」项目提供，此后可在此排期建造）
    let buildBtnHtml = '';
    if (!state.gameOver) {
        const cfg = (typeof ENGINEERING_BOTS_CONFIG !== 'undefined') ? ENGINEERING_BOTS_CONFIG : { maxBots: 5, buildCost: { energy: 30, media: 20 }, buildDuration: 3 };
        const projectDone = (state.completedProjects || []).includes('proj_bot_factory');
        const building = state.panelBotBuild;
        if (building) {
            buildBtnHtml = `<button class="bots-build-btn" disabled title="建造进行中，随周推进结算">🔧 建造中 · 还需 ${building.remainingWeeks} 周</button>`;
        } else if (botCount >= cfg.maxBots) {
            buildBtnHtml = `<button class="bots-build-btn" disabled>已达上限（${cfg.maxBots} 台）</button>`;
        } else if (!projectDone) {
            buildBtnHtml = `<button class="bots-build-btn" disabled title="完成「建造工程机器人」项目后解锁批量建造">🔒 完成「建造工程机器人」项目后解锁</button>`;
        } else {
            const affordable = state.resources.energy >= cfg.buildCost.energy && state.resources.media >= cfg.buildCost.media;
            buildBtnHtml = `<button class="bots-build-btn" id="bots-build-btn" ${affordable ? '' : 'disabled'} title="每台 ◈${cfg.buildCost.energy} ◇${cfg.buildCost.media}，${cfg.buildDuration} 周建成">${affordable ? `🔨 建造机器人（◈${cfg.buildCost.energy} ◇${cfg.buildCost.media} · ${cfg.buildDuration}周）` : '资源不足'}</button>`;
        }
    }

    container.innerHTML = `
        <div class="bots-panel-header" title="工程机器人：降低圣所资源衰减，并抑制腐败侵蚀。维护成本每周从能源扣除；能源不足时停机（所有加成归零）。">
            <span class="bots-panel-icon">🔧</span>
            <span class="bots-panel-title">工程机器人</span>
            <span class="bots-panel-count ${botCount > 0 ? 'active' : 'inactive'}">${botCount}/5</span>
        </div>
        <div class="bots-panel-stats">
            <div class="bots-stat">
                <span class="bots-stat-label">维护成本</span>
                <span class="bots-stat-value ${isBlackout ? 'warning' : ''}">◈ ${maintenanceCost}/周</span>
            </div>
            <div class="bots-stat">
                <span class="bots-stat-label">衰减减免</span>
                <span class="bots-stat-value ${reduction > 0 ? 'success' : 'inactive'}">${Math.round(reduction * 100)}%</span>
            </div>
            <div class="bots-stat">
                <span class="bots-stat-label">腐败抑制</span>
                <span class="bots-stat-value ${reduction > 0 ? 'success' : 'inactive'}">${Math.round(reduction * 100)}%</span>
            </div>
        </div>
        ${isBlackout ? '<div class="bots-warning">⚠️ 能源不足，机器人停机中</div>' : ''}
        ${buildBtnHtml}
        <button class="bots-log-btn hidden" id="bots-log-btn" title="查看工程机器人的运行日志（位于「建筑与工程」存储室）">📋 机器人日志</button>
    `;

    const buildBtn = document.getElementById('bots-build-btn');
    if (buildBtn && !buildBtn._bound) {
        buildBtn._bound = true;
        buildBtn.addEventListener('click', () => {
            if (typeof startPanelBotBuild === 'function') startPanelBotBuild();
        });
    }

    // 机器人专属日志入口：拥有机器人且对应条目已解锁时，一键跳到建筑与工程存储室并高亮
    const logBtn = document.getElementById('bots-log-btn');
    if (logBtn) {
        const hasLog = botCount >= 1; // arch_bot_log_01 需 1 台；arch_bot_log_02 需 3 台
        if (hasLog) {
            logBtn.classList.remove('hidden');
            if (!logBtn._bound) {
                logBtn._bound = true;
                logBtn.addEventListener('click', () => {
                    const logId = botCount >= 3 ? 'arch_bot_log_02' : 'arch_bot_log_01';
                    if (typeof selectVault === 'function') selectVault(10);
                    if (typeof switchActionTab === 'function') switchActionTab('archive');
                    MemorySanctuary.recommendedArchiveId = logId;
                    if (typeof renderAll === 'function') renderAll();
                    if (typeof showTransientNotice === 'function') {
                        showTransientNotice(`📋 已为你打开「建筑与工程」存储室，工程机器人日志在其中。`);
                    }
                });
            }
        } else {
            logBtn.classList.add('hidden');
        }
    }

    container.title = botCount > 0
        ? `当前 ${botCount} 台机器人运行中：衰减减免 ${Math.round(reduction * 100)}%、腐败侵蚀抑制 ${Math.round(reduction * 100)}%（每周维护 ◈${maintenanceCost} 能源，能源不足时停机）。拥有机器人期间，存储室会出现它们的专属日志条目。`
        : '尚未部署工程机器人。完成「建造工程机器人」项目获得首台后，可在此继续建造。';
}

// ==========================================
// 科技研究面板（v0.2.4 通用科技树）
// ==========================================

/** 科技面板：按域分组渲染节点，学说互斥灰显，点击解锁走 unlockTech */
function renderTechPanel() {
    const listEl = document.getElementById('tech-list');
    const summaryEl = document.getElementById('tech-doctrine-summary');
    if (!listEl) return;

    const state = MemorySanctuary.state;
    if (!state) {
        listEl.innerHTML = '';
        return;
    }
    const techs = MemorySanctuary.data.tech || [];
    if (techs.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-dim); font-size: 0.8rem;">科技资料加载中……</p>';
        return;
    }
    if (typeof initTechState === 'function') initTechState();

    const domainNames = (MemorySanctuary.data.techMeta && MemorySanctuary.data.techMeta.domainNames) ||
        { explore: '勘探域', archive: '归档域', env: '环境域' };
    const doctrineNames = (MemorySanctuary.data.techMeta && MemorySanctuary.data.techMeta.doctrineNames) || {};
    const domainOrder = ['explore', 'archive', 'env'];

    // 学说路线摘要（已确定的分支）
    if (summaryEl) {
        const picks = Object.entries(state.techDoctrines || {})
            .map(([key, id]) => {
                const t = (typeof getTechById === 'function') ? getTechById(id) : null;
                return t ? `${doctrineNames[key] || key}·「${t.name}」` : null;
            })
            .filter(Boolean);
        summaryEl.innerHTML = picks.length > 0
            ? `⚖ 已确定的学说路线：${picks.join('　·　')}（同组其余分支已锁死）`
            : `⚖ 每域的学说分支互斥：选定一条路线后，同组其它分支将永久锁死。`;
    }

    listEl.innerHTML = '';

    domainOrder.forEach(domain => {
        const domainTechs = techs.filter(t => (t.domain || '') === domain);
        if (domainTechs.length === 0) return;

        const groupEl = document.createElement('div');
        groupEl.className = 'tech-domain-group';

        const groupHeader = document.createElement('div');
        groupHeader.className = 'tech-domain-header';
        groupHeader.textContent = domainNames[domain] || domain;
        groupEl.appendChild(groupHeader);

        domainTechs.forEach(tech => {
            const check = (typeof getTechUnlockState === 'function') ? getTechUnlockState(tech.id) : { ok: false, reason: '' };
            const unlocked = state.techUnlocked.includes(tech.id);
            const isPickedDoctrine = !!(tech.doctrine && state.techDoctrines && state.techDoctrines[tech.doctrine] === tech.id);
            const doctrineLocked = !unlocked && isDoctrineLocked(tech.doctrine, tech.id);

            // 节点状态类：unlocked / available / locked（学说互斥单独标识）
            let stateClass = 'locked';
            if (unlocked) stateClass = 'unlocked';
            else if (check.ok) stateClass = 'available';
            else if (doctrineLocked) stateClass = 'doctrine-locked';

            const cost = tech.cost || {};
            const prereqNames = (tech.prereq || [])
                .map(pid => (typeof getTechById === 'function' ? getTechById(pid) : null))
                .filter(Boolean)
                .map(t => t.name);

            const node = document.createElement('div');
            node.className = `tech-node ${stateClass}` + (isPickedDoctrine ? ' doctrine-picked' : '');

            let badge = '';
            if (unlocked) badge = '<span class="tech-badge unlocked">✓ 已解锁</span>';
            else if (isPickedDoctrine) badge = '<span class="tech-badge unlocked">✓ 学说已定</span>';
            else if (check.ok) badge = '<span class="tech-badge available">可研究</span>';
            else badge = `<span class="tech-badge locked">${esc(check.reason)}</span>`;

            node.innerHTML = `
                <div class="tech-node-header">
                    <span class="tech-node-icon">${tech.icon || '🔬'}</span>
                    <span class="tech-node-name">${esc(tech.name)}</span>
                    ${badge}
                </div>
                <div class="tech-node-desc">${esc(tech.description || '')}</div>
                <div class="tech-node-meta">
                    <span class="tech-effect" title="${esc(tech.effectText || '')}">◈效果：${esc(tech.effectText || '')}</span>
                    <span class="tech-cost">成本 ◈${cost.energy || 0} ◇${cost.media || 0}</span>
                    ${tech.unlockWeek ? `<span class="tech-week">第 ${tech.unlockWeek} 周解锁</span>` : ''}
                    ${prereqNames.length > 0 ? `<span class="tech-prereq">前置：${esc(prereqNames.join('、'))}</span>` : ''}
                    ${tech.doctrine ? `<span class="tech-doctrine">${esc(doctrineNames[tech.doctrine] || '学说')}分支${doctrineLocked ? '（互斥已锁）' : ''}</span>` : ''}
                </div>
            `;

            if (check.ok) {
                const btn = document.createElement('button');
                btn.className = 'tech-unlock-btn';
                btn.textContent = '🔬 研究';
                btn.addEventListener('click', () => {
                    if (typeof unlockTech === 'function') unlockTech(tech.id);
                });
                node.appendChild(btn);
            }

            groupEl.appendChild(node);
        });

        listEl.appendChild(groupEl);
    });
}

// ==========================================
// 守护者故事进度
// ==========================================

function renderGuardianStoryProgress() {
    const container = document.getElementById('guardian-story-progress');
    if (!container) return;
    
    const state = MemorySanctuary.state;
    const stories = MemorySanctuary.data.guardianStories || [];
    const guardians = MemorySanctuary.data.guardians;
    
    container.innerHTML = '';
    
    guardians.forEach(g => {
        const guardianStories = stories.filter(s => s.guardianId === g.id);
        const completed = guardianStories.filter(s => state.activeEventIds.includes(s.id)).length;
        const total = guardianStories.length;
        
        if (total === 0) return;
        
        const item = document.createElement('div');
        item.className = 'story-progress-item';
        item.innerHTML = `
            <span class="story-progress-avatar">${g.avatar}</span>
            <span class="story-progress-name">${g.name}</span>
            <span class="story-progress-bar">
                <span class="story-progress-fill" style="width: ${(completed / total) * 100}%"></span>
            </span>
            <span class="story-progress-text">${completed}/${total}</span>
        `;
        container.appendChild(item);
    });
}

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
            buttonHtml = `<button class="project-btn" disabled>建设中 · 还需 ${active.remainingWeeks} 周</button>`;
        } else if (isCompleted && !project.repeatable) {
            // 解锁类项目标注「已生效」，其余显示「已完成」
            const isUnlock = project.effect && project.effect.type === 'unlockArchives';
            buttonHtml = `<button class="project-btn" disabled>${isUnlock ? '已生效' : '已完成'}</button>`;
        } else if (isRepeatableDone && canStart) {
            // 循环项目给出明确动作名，避免「一次性项目也能重开」的误解
            let repeatLabel = '再次开始';
            if (project.effect && project.effect.type === 'buildBot') repeatLabel = '再建一台（+1 机器人）';
            else if (project.effect && project.effect.type === 'foodBoost') repeatLabel = '再次生产';
            else if (project.effect && project.effect.type === 'resourceBoost') repeatLabel = '再次执行';
            buttonHtml = `<button class="project-btn" data-project-id="${project.id}" title="循环项目：可重复执行，每次完成获得一次收益">${repeatLabel}</button>`;
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
        case 'aiAssistant':
            return `解锁 AI 助理辅助归档（每回合可减半费用额外归档一条）`;
        case 'buildBot':
            return `建造工程机器人（减少资源衰减）`;
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

    // T3-3 修复：保存 timer ID，连续解锁新成就时先清除旧定时器，避免旧 timer 提前隐藏新 toast
    clearTimeout(achievementToastTimer);
    achievementToastTimer = setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hidden');
    }, 3000);
}

// 轻量提示横幅（速记限次等即时反馈），2.6s 后自动淡出
function showTransientNotice(text) {
    let banner = document.getElementById('transient-notice');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'transient-notice';
        banner.setAttribute('role', 'status');
        document.body.appendChild(banner);
    }
    banner.textContent = text;
    banner.classList.add('show');
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => banner.classList.remove('show'), 2600);
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

    // 老存档迁移：通关过但未记录结局的，按最佳记录补登记
    if (typeof backfillUnlockedEndings === 'function') backfillUnlockedEndings();
    const ngData = getNGPlusData();
    const seenEndings = ngData.unlockedEndings || [];

    // 结局 ID → 成就 ID 映射（仅收录真实存在的结局成就，兜底结局以 seenEndings 为准）
    const endingToAchievement = {
        'finale_song_of_doom': 'song_of_doom',
        'finale_roots_of_civilization': 'roots_of_civilization',
        'finale_children_of_stardust': 'children_of_stardust',
        'finale_fire_of_life': 'fire_of_life',
        'finale_eternal_question': 'eternal_question',
        'finale_chronicle_of_doom': 'chronicle_of_doom',
        'finale_voice_of_home': 'voice_of_home',
        'finale_silent_sanctuary': 'silent_sanctuary',
        'complete_memory': 'complete_memory',
        'true_ending': 'beyond_time',
        'guardian_tika_finale': 'guardian_tika_love',
        'guardian_finn_finale': 'guardian_finn_love',
        'guardian_misha_finale': 'guardian_misha_love',
        'guardian_lorn_finale': 'guardian_lorn_love',
        'guardian_ethel_finale': 'guardian_ethel_love'
    };

    container.innerHTML = '';

    for (const ending of endings) {
        const achievementId = endingToAchievement[ending.id];
        const isUnlocked = seenEndings.includes(ending.id) ||
            (achievementId && unlockedAchievements.includes(achievementId)) ||
            unlockedAchievements.includes(ending.id);
        
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
    const resourceKeys = ['energy', 'media', 'environment', 'food', 'engineeringBots'];
    resourceKeys.forEach(key => {
        const el = document.getElementById('res-' + (key === 'engineeringBots' ? 'bots' : key));
        if (!el) return;

        el.addEventListener('mouseenter', (e) => showTooltip(e, key));
        el.addEventListener('mousemove', (e) => moveTooltip(e));
        el.addEventListener('mouseleave', () => {
            // 点击固定的说明卡不随鼠标离开消失
            const tooltip = document.getElementById('resource-tooltip');
            if (tooltip && tooltip.dataset.pinned) return;
            hideTooltip();
        });
    });

    // 点击 chip 之外的区域时收起固定说明卡
    if (!document._pinnedTooltipDismiss) {
        document._pinnedTooltipDismiss = true;
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.resource')) hidePinnedTooltip();
        });
    }
}

// 点击顶栏资源 chip：固定显示说明卡（再点一次或点其他区域收起）
function togglePinnedResourceTooltip(resourceKey) {
    let tooltip = document.getElementById('resource-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'resource-tooltip';
        document.body.appendChild(tooltip);
    }

    if (tooltip.dataset.pinned === resourceKey && tooltip.classList.contains('visible')) {
        hidePinnedTooltip();
        return;
    }

    tooltip.dataset.resourceKey = resourceKey;
    tooltip.dataset.pinned = resourceKey;
    tooltip.innerHTML = buildResourceTooltip(resourceKey);
    tooltip.classList.add('visible');

    const chip = document.getElementById('res-' + (resourceKey === 'engineeringBots' ? 'bots' : resourceKey));
    if (chip) {
        const r = chip.getBoundingClientRect();
        let x = r.left;
        let y = r.bottom + 8;
        const rect = tooltip.getBoundingClientRect();
        if (x + rect.width > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;
        if (y + rect.height > window.innerHeight - 12) y = Math.max(12, r.top - rect.height - 8);
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }
}

function hidePinnedTooltip() {
    const tooltip = document.getElementById('resource-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    delete tooltip.dataset.pinned;
}

// ==========================================
// 顶栏点击交互（周况 / 士气）
// 「第 X 周」与士气徽标此前只有悬停提示没有点击行为，属于可深挖叙事却一直缺席的入口
// ==========================================

function initTopBarInteractions() {
    const weekEl = document.getElementById('week-display');
    const moraleEl = document.getElementById('morale-display');
    if (weekEl) {
        weekEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTopBarPopover('week', weekEl);
        });
    }
    if (moraleEl) {
        moraleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTopBarPopover('morale', moraleEl);
        });
    }

    // 点击弹窗与锚点之外的区域收起
    if (!document._topbarPopoverDismiss) {
        document._topbarPopoverDismiss = true;
        document.addEventListener('click', (e) => {
            if (e.target.closest('#topbar-popover')) return;
            if (e.target.closest('#week-display, #morale-display')) return;
            hideTopBarPopover();
        });
    }
}

function toggleTopBarPopover(kind, anchorEl) {
    let pop = document.getElementById('topbar-popover');
    if (!pop) {
        pop = document.createElement('div');
        pop.id = 'topbar-popover';
        pop.setAttribute('role', 'dialog');
        document.body.appendChild(pop);
    }
    if (pop.dataset.kind === kind && pop.classList.contains('visible')) {
        hideTopBarPopover();
        return;
    }
    pop.dataset.kind = kind;
    pop.innerHTML = (kind === 'week') ? buildWeekPopover() : buildMoralePopover();
    pop.classList.add('visible');

    const r = anchorEl.getBoundingClientRect();
    let x = r.left;
    let y = r.bottom + 8;
    const rect = pop.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 12) x = window.innerWidth - rect.width - 12;
    if (y + rect.height > window.innerHeight - 12) y = Math.max(12, r.top - rect.height - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
}

function hideTopBarPopover() {
    const pop = document.getElementById('topbar-popover');
    if (pop) pop.classList.remove('visible');
}

// 当前所处时期的叙事标题与描述（随周数推进，玩家选择带来的状态差异体现在"本局概况"里）
function getWeekPhaseNarrative(week) {
    if (week <= 12) return {
        title: '序章 · 初醒',
        text: '圣所刚刚苏醒，守护者们陆续回到自己的岗位。地表还不算太糟——偶尔还能看到成群的候鸟掠过天际。现在是积蓄的时节：多存一条，后世就多一分完整。'
    };
    if (week <= 19) return {
        title: '上篇 · 坚守',
        text: '地表的寂静一天比一天沉。勘探队带回的物资越来越杂，有时是一些说不清用途的残骸。守护者们不再谈论天气，只是更专注地工作。'
    };
    if (week <= 29) return {
        title: '中篇 · 抉择',
        text: '封印的选项已经摆在面前。是带着不完整的记忆提前锁上大门，还是继续打开门、在崩塌中抢救更多？每一次互斥抉择，都在定义后世看到的萨拉达斯。'
    };
    if (week <= 39) return {
        title: '下篇 · 终期',
        text: '圣所的墙壁开始出现细纹。外界的信号越来越弱，最后一批候选条目正在排队。你开始在心里默数：还剩多少周，还剩多少条。'
    };
    return {
        title: '终章 · 终来之刻',
        text: '倒数的最后阶段。无论此刻圣所里存着什么，它们就是萨拉达斯留在宇宙中的全部。终来之刻，何物当存？'
    };
}

function buildWeekPopover() {
    const state = MemorySanctuary.state;
    if (!state) return '<div class="tp-empty">尚未开始游戏</div>';

    const MAX_WEEK = 48;
    const phase = getWeekPhaseNarrative(state.week);
    const pct = Math.min(100, Math.round((state.week / MAX_WEEK) * 100));

    // 本局概况（随玩家选择变化）
    const archived = (state.completedArchives || []).length;
    const conflicts = (state.conflictLog || []).length;
    const projects = (state.completedProjects || []).length;
    const exp = state.exploration || {};
    const expStatus = exp.deployedUntil > state.week
        ? `🔭 勘探队在外，第 ${exp.deployedUntil} 周返回`
        : (exp.deployedUntil ? '🔭 勘探队已返回圣所' : '🔭 勘探队待命');

    // 里程碑
    const milestones = [
        { week: 16, label: '封印圣所可预览' },
        { week: 20, label: '可提前封印结算' },
        { week: 30, label: '紧急归档协议解锁' },
        { week: 48, label: '终局 · 强制封印' }
    ];
    const msHtml = milestones.map(m => {
        const done = state.week >= m.week;
        const current = !done && m.week > state.week && milestones.find(x => x.week > state.week)?.week === m.week;
        return `<div class="tp-milestone ${done ? 'done' : (current ? 'next' : '')}">
            <span class="tp-ms-dot">${done ? '✓' : '○'}</span>
            <span class="tp-ms-label">${m.label}</span>
            <span class="tp-ms-week">第 ${m.week} 周</span>
        </div>`;
    }).join('');

    return `
        <div class="tp-title">第 ${state.week} 周 / 共 ${MAX_WEEK} 周 · ${phase.title}</div>
        <div class="tp-week-bar"><div class="tp-week-bar-fill" style="width:${pct}%"></div></div>
        <div class="tp-desc">${phase.text}</div>
        <div class="tp-section">本局概况</div>
        <div class="tp-stats">
            <span>📜 已归档 ${archived} 条</span>
            <span>⚖️ 互斥抉择 ${conflicts} 次</span>
            <span>🏗️ 已完成项目 ${projects} 个</span>
            <span>${expStatus}</span>
        </div>
        <div class="tp-section">时间节点</div>
        ${msHtml}
    `;
}

function buildMoralePopover() {
    const state = MemorySanctuary.state;
    if (!state) return '<div class="tp-empty">尚未开始游戏</div>';

    const morale = getMoraleLevel();
    const tierNames = { hostile: '疏离', cold: '冷淡', neutral: '平和', friendly: '友好', intimate: '亲密' };
    const rows = [];

    for (const gid of ['tika', 'finn', 'misha', 'lorn', 'ethel']) {
        const guardian = getGuardianById(gid);
        if (!guardian) continue;
        const tier = getMoodTier(gid);
        const indicator = getMoodIndicator(gid);
        const fatigue = getFatigueWeeksLeft(gid);
        // 士气弹窗里的"守护者聊天"：按当前好感档取一句（士气点击入口的核心叙事价值）
        const dialogues = (typeof getMoodDialogue === 'function') ? getMoodDialogue(gid) : (guardian.dialogues?.idle || ['……']);
        const line = dialogues[Math.floor(Math.random() * dialogues.length)] || '……';
        rows.push(`
            <div class="tp-guardian mood-${tier}">
                <span class="tp-g-avatar">${guardian.avatar}</span>
                <div class="tp-g-body">
                    <div class="tp-g-head">
                        <span class="tp-g-name">${guardian.name}</span>
                        <span class="tp-g-tier">${indicator} ${tierNames[tier]}</span>
                        ${fatigue > 0 ? `<span class="tp-g-fatigue">💤 ${fatigue}周</span>` : ''}
                    </div>
                    <div class="tp-g-line">「${esc(line, false)}」</div>
                </div>
            </div>
        `);
    }

    return `
        <div class="tp-title">平均士气：${morale.label}（效率 ${Math.round(morale.bonus * 100)}%）</div>
        <div class="tp-desc">士气影响资源衰减效率与突发事件走向。分发补给品、归档成功都能提振士气。</div>
        ${rows.join('')}
        <div class="tp-hint">💡 点击守护者页的头像可与其交谈；🎁 分发补给品可提升全员士气（每周一次）。</div>
    `;
}

// 各资源的一句话说明（与游戏内帮助「五种资源」口径一致）
const RESOURCE_DESCRIPTIONS = {
    energy: '维持圣所运转与归档的核心资源。归零后归档能耗加倍。',
    media: '归档必需品。归零后无法录入新条目（应急协议的介质豁免除外）。',
    environment: '保护设备与条目保存条件。归零后条目过期速度翻倍。',
    food: '维持守护者士气。耗尽后归档能耗 +20%，并可能触发饥荒。',
    engineeringBots: '自动维护圣所：每台减少 18% 资源衰减（上限 65%），并按同比例抑制腐败侵蚀；每台每周消耗 0.75 能源，能源不足时停机。勘探协同：每台 +8% 资源收益、-5% 风险（上限 +40%/-25%）。拥有机器人期间，存储室出现其专属日志条目。'
};

function buildResourceTooltip(resourceKey) {
    const state = MemorySanctuary.state;
    if (!state || !state.resourceChanges) return '';

    const desc = RESOURCE_DESCRIPTIONS[resourceKey];
    let html = `<div class="rt-title">${getResourceName(resourceKey)}</div>`;
    if (desc) html += `<div class="rt-desc">${desc}</div>`;

    // 工程机器人：无回合变化统计，直接显示台数与说明
    if (resourceKey === 'engineeringBots') {
        const count = state.resources.engineeringBots || 0;
        html += `<div class="rt-capacity">当前：${count} 台${state.botBlackoutLogged ? '（⚠ 能源不足，停机中）' : ''}</div>`;
        return html;
    }

    const changes = state.resourceChanges[resourceKey] || 0;
    const changeClass = changes > 0 ? 'gain' : (changes < 0 ? 'loss' : 'neutral');
    const changeSign = changes > 0 ? '+' : '';

    // 收集来源分解
    const breakdowns = getResourceBreakdown(resourceKey);

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

    // 储量信息（附储量条 + 食物补给箱可视化，让"存量"一眼可读）
    const maxCap = resourceKey === 'food' ? 80
        : resourceKey === 'energy' ? 150
        : resourceKey === 'media' ? 150
        : 100;
    const current = state.resources[resourceKey] || 0;
    const capPct = Math.max(0, Math.min(100, (current / maxCap) * 100));
    const barClass = capPct < 20 ? 'crit' : (capPct < 45 ? 'low' : 'ok');
    html += `<div class="rt-bar"><div class="rt-bar-fill ${barClass}" style="width:${capPct}%"></div></div>`;
    html += `<div class="rt-capacity">储量: ${current.toFixed(1)} / ${maxCap}（${Math.round(capPct)}%）</div>`;

    // 食物：以"补给箱"呈现存量（4 箱封顶，对应储量比例）
    if (resourceKey === 'food') {
        const crates = Math.round(capPct / 25);
        const cratesHtml = Array.from({ length: 4 }, (_, i) =>
            `<span class="rt-crate ${i < crates ? 'filled' : ''}">${i < crates ? '📦' : '▢'}</span>`).join('');
        const lowFoodNote = current < 10 ? '<span class="rt-food-warning">⚠ 食物告急，连续 3 周归零将触发饥荒</span>' : '';
        html += `<div class="rt-crates">${cratesHtml}<span class="rt-crates-label">补给箱</span>${lowFoodNote}</div>`;
    }

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
    
    // 腐败度额外衰减（作用于能源/介质/环境，不作用于食物；在线机器人按比例抑制）
    if (state.emergencyCorruption > 0 && resourceKey !== 'food') {
        let corruptionPenalty = Math.floor(state.emergencyCorruption / 20) * 0.5;
        const botDamp = (typeof getBotDecayReduction === 'function') ? getBotDecayReduction() : 0;
        if (botDamp > 0) corruptionPenalty *= (1 - botDamp);
        if (corruptionPenalty > 0) {
            breakdowns.push({ amount: -corruptionPenalty, source: botDamp > 0 ? `圣所腐败（机器人抑制 -${Math.round(botDamp * 100)}%）` : '圣所腐败' });
        }
    }
    
    // 工程机器人维护消耗（能源；停机时不消耗。此前这项真实支出不在面板里，玩家只觉得"耗得很凶"却看不到去向）
    if (resourceKey === 'energy' && typeof getEngineeringBotCount === 'function') {
        const botCount = getEngineeringBotCount();
        const perBot = (typeof ENGINEERING_BOTS_CONFIG !== 'undefined') ? ENGINEERING_BOTS_CONFIG.maintenanceCostPerBot : 1;
        const maintenance = botCount * perBot;
        if (maintenance > 0 && state.resources.energy >= maintenance) {
            breakdowns.push({ amount: -maintenance, source: `机器人维护 ×${botCount}` });
        }
    }
    
    // 紧急归档衰减惩罚（作用于所有资源，一次性）
    if (state.nextWeekDecayPenalty > 0) {
        const baseDecay = resourceKey === 'energy' ? 1.0 : resourceKey === 'media' ? 0.5 : resourceKey === 'environment' ? 0.5 : 0.3;
        const penaltyAmt = baseDecay * state.nextWeekDecayPenalty;
        if (penaltyAmt > 0) {
            breakdowns.push({ amount: -penaltyAmt, source: '紧急归档代价' });
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
    
    // 章节提示条：使用独立固定定位覆盖层，避免压住顶栏/封印按钮
    const banner = document.getElementById('chapter-banner');
    if (!banner) return;
    
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

