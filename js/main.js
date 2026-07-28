/**
 * main.js - 入口与初始化
 */

window.MemorySanctuary = {
    state: null,
    data: {
        archives: [],
        vaults: [],
        guardians: [],
        events: []
    },
    currentVaultId: 1,
    activeEvent: null
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[记忆圣所] 初始化开始...');
    
    try {
        await loadGameData();
        initGameState();
        initTheme();
        
        if (typeof initCanvas === 'function') initCanvas();
        if (typeof initUI === 'function') initUI();
        if (typeof initEventSystem === 'function') initEventSystem();
        if (typeof initLogSystem === 'function') initLogSystem();
        if (typeof initGuardianInteraction === 'function') initGuardianInteraction();
        if (typeof initTutorialListener === 'function') initTutorialListener();
        if (typeof initFuncBar === 'function') initFuncBar();
        
        renderAll();
        
        // 延迟启动新手引导
        setTimeout(() => {
            if (typeof initTutorial === 'function') initTutorial();
        }, 500);
        
        // 初始守护者对话
        showGuardianDialogue('tika', 'idle');
        
        console.log('[记忆圣所] 初始化完成');
    } catch (error) {
        console.error('[记忆圣所] 初始化失败:', error);
    }
});

async function loadGameData() {
    const [archivesRes, vaultsRes, guardiansRes, eventsRes] = await Promise.all([
        fetch('data/archives.json'),
        fetch('data/vaults.json'),
        fetch('data/guardians.json'),
        fetch('data/events.json')
    ]);
    
    MemorySanctuary.data.archives = (await archivesRes.json()).archives;
    MemorySanctuary.data.vaults = (await vaultsRes.json()).vaults;
    MemorySanctuary.data.guardians = (await guardiansRes.json()).guardians;
    MemorySanctuary.data.events = (await eventsRes.json()).events;
    
    console.log(`[数据] ${MemorySanctuary.data.archives.length}条目, ${MemorySanctuary.data.vaults.length}存储室, ${MemorySanctuary.data.guardians.length}守护者, ${MemorySanctuary.data.events.length}事件`);
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
        activeEventIds: []
    };
    
    MemorySanctuary.data.vaults.forEach(vault => {
        MemorySanctuary.state.vaultUsage[vault.id] = 0;
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('memory-sanctuary-theme') || 'dark';
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
