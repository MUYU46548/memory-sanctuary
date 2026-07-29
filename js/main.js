/**
 * main.js - 入口与初始化
 */

window.MemorySanctuary = {
    state: null,
    data: {
        archives: [],
        vaults: [],
        guardians: [],
        events: [],
        explorations: []
    },
    currentVaultId: 1,
    activeEvent: null
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[记忆圣所] 初始化开始...');
    
    try {
        await loadGameData();
        initTheme();
        initSaveData();
        
        // Initialize game systems while game container is visible
        if (typeof initCanvas === 'function') initCanvas();
        if (typeof initUI === 'function') initUI();
        if (typeof initEventSystem === 'function') initEventSystem();
        if (typeof initLogSystem === 'function') initLogSystem();
        if (typeof initGuardianInteraction === 'function') initGuardianInteraction();
        if (typeof initTutorialListener === 'function') initTutorialListener();
        if (typeof initFuncBar === 'function') initFuncBar();
        if (typeof initSkipTurn === 'function') initSkipTurn();
        if (typeof initProjects === 'function') initProjects();
        if (typeof initStuckBanner === 'function') initStuckBanner();
        if (typeof initCivilizationAtlas === 'function') initCivilizationAtlas();
        if (typeof initSaveSystem === 'function') initSaveSystem();
        
        // Show title screen after game systems are ready
        initTitleScreen();
        
        console.log('[记忆圣所] 初始化完成');
    } catch (error) {
        console.error('[记忆圣所] 初始化失败:', error);
    }
});

async function loadGameData() {
    const archivesRes = await fetch('data/archives.json');
    const vaultsRes = await fetch('data/vaults.json');
    const guardiansRes = await fetch('data/guardians.json');
    const eventsRes = await fetch('data/events.json');
    const explorationsRes = await fetch('data/explorations.json');
    const projectsRes = await fetch('data/projects.json');

    MemorySanctuary.data.archives = (await archivesRes.json()).archives;
    MemorySanctuary.data.vaults = (await vaultsRes.json()).vaults;
    MemorySanctuary.data.guardians = (await guardiansRes.json()).guardians;
    const eventsData = await eventsRes.json();
    MemorySanctuary.data.events = eventsData.events;
    MemorySanctuary.data.scheduledEvents = eventsData.scheduledEvents || [];
    MemorySanctuary.data.explorations = (await explorationsRes.json()).explorations || [];
    MemorySanctuary.data.projects = (await projectsRes.json()).projects || [];

    console.log(`[数据] ${MemorySanctuary.data.archives.length}条目, ${MemorySanctuary.data.vaults.length}存储室, ${MemorySanctuary.data.guardians.length}守护者, ${MemorySanctuary.data.events.length}随机事件, ${MemorySanctuary.data.scheduledEvents.length}调度事件, ${MemorySanctuary.data.explorations.length}勘探点, ${MemorySanctuary.data.projects.length}项目`);
}

function initGameState() {
    MemorySanctuary.state = {
        resources: { energy: 100, media: 60, environment: 95 },
        week: 1,
        chapter: 1,
        completedArchives: [],
        vaultUsage: {},
        narrativeFlags: ['intro_complete'],
        activeEvents: [],
        activeEventIds: [],
        deterioration: { energy: false, media: false, environment: false },
        gameOver: false,
        guardianMoods: {},
        scheduledEvents: [],
        unlockedBonuses: [],
        exploration: { deployedUntil: 0, cooldownUntil: 0 },
        activeProjects: [],
        completedProjects: []
    };
    
    MemorySanctuary.data.vaults.forEach(vault => {
        MemorySanctuary.state.vaultUsage[vault.id] = 0;
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('memory-sanctuary-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.textContent = savedTheme === 'dark' ? '◐' : '◑';
        toggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('memory-sanctuary-theme', next);
            toggle.textContent = next === 'dark' ? '◐' : '◑';
        });
    }
}

// ==========================================
// 标题画面
// ==========================================

function initTitleScreen() {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    const titleNew = document.getElementById('title-new');
    const titleLoad = document.getElementById('title-load');
    const titleHelp = document.getElementById('title-help');
    const titleAbout = document.getElementById('title-about');
    const titleBtn = document.getElementById('title-btn');

    // Update NG+ display
    const ngData = getNGPlusData();
    const ngplusEl = document.getElementById('title-ngplus');
    if (ngplusEl && ngData.playthroughCount > 0) {
        ngplusEl.innerHTML = `
            <div class="title-ngplus-info">
                <span>已完成 ${ngData.playthroughCount} 周目</span>
                <span>累计归档 ${ngData.totalArchivesSaved} 条</span>
            </div>
        `;
    }

    // New game button - open save screen for slot selection
    if (titleNew) {
        titleNew.addEventListener('click', () => {
            openSaveScreen('new');
        });
    }

    // Load game button - open save screen in load mode
    if (titleLoad) {
        titleLoad.addEventListener('click', () => {
            openSaveScreen('load');
        });
    }

    // Help button
    if (titleHelp) {
        titleHelp.addEventListener('click', () => {
            showTitleHelpModal();
        });
    }

    // About button
    if (titleAbout) {
        titleAbout.addEventListener('click', () => {
            showAboutModal();
        });
    }

    // Return to title from game
    if (titleBtn) {
        titleBtn.addEventListener('click', () => {
            if (confirm('确定要返回标题画面吗？当前进度将会自动保存。')) {
                const currentSlot = getCurrentSlot();
                if (currentSlot >= 1) {
                    saveGame(currentSlot);
                }
                showTitleScreen();
            }
        });
    }
}

function showTitleScreen() {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    const ngplusEl = document.getElementById('title-ngplus');
    
    titleScreen.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    
    // Refresh NG+ info
    const ng = getNGPlusData();
    if (ngplusEl && ng.playthroughCount > 0) {
        ngplusEl.innerHTML = `
            <div class="title-ngplus-info">
                <span>已完成 ${ng.playthroughCount} 周目</span>
                <span>累计归档 ${ng.totalArchivesSaved} 条</span>
            </div>
        `;
    }
}

function startNewGameWithSlotSelect() {
    openSaveScreen('new');
}

function showTitleHelpModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    title.textContent = '游戏帮助';

    let helpContent = '欢迎来到「记忆圣所」。\n\n';
    helpContent += '【游戏目标】\n';
    helpContent += '在有限的时间内，尽可能多地归档文明碎片，为后世保存萨拉达斯文明的记忆。\n\n';
    helpContent += '【操作指南】\n';
    helpContent += '• 选择存储室 → 查看可归档条目 → 点击「录入归档」\n';
    helpContent += '• 管理资源（能源/介质/环境），它们会随时间消耗\n';
    helpContent += '• 与守护者互动获取建议，应对突发事件\n';
    helpContent += '• 点击底部「存档」保存进度，「读档」恢复进度\n\n';
    helpContent += '【进阶系统】\n';
    helpContent += '• 封印圣所（10 周后）可触发多周目奖励\n';
    helpContent += '• 奖励随周目递增，鼓励重复游玩探索不同选择\n\n';
    helpContent += '「——终来之刻，何物当存？」';

    content.textContent = helpContent;
    overlay.classList.remove('hidden');

    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
}

// ==========================================
// 初始化存档数据
// ==========================================

function initSaveData() {
    // Initialize NG+ data if not present
    const raw = localStorage.getItem('memory-sanctuary-ngplus');
    if (!raw) {
        localStorage.setItem('memory-sanctuary-ngplus', JSON.stringify({
            playthroughCount: 0,
            totalArchivesSaved: 0,
            bonuses: []
        }));
    }
}

// ==========================================
// 启动游戏
// ==========================================

function startNewGame(slot, isNGPlus) {
    if (isNGPlus) {
        startNewGamePlus();
    }

    initGameState();

    if (isNGPlus) {
        applyNGPlusBonuses();
    }

    const logContent = document.getElementById('log-content');
    if (logContent) logContent.innerHTML = '';

    localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

    renderAll();
    if (typeof initCanvas === 'function') initCanvas();

    showGuardianDialogue('tika', 'idle');

    saveGame(slot);

    const ngData = getNGPlusData();
    if (isNGPlus && ngData.playthroughCount > 1) {
        addLog(`第 ${ngData.playthroughCount} 周目开始。继承奖励已应用。`, 'system');
    } else {
        addLog('新游戏开始。愿你的选择得到善待。', 'system');
    }

    // Start tutorial for first play
    setTimeout(() => {
        if (typeof initTutorial === 'function') initTutorial();
    }, 500);
}
