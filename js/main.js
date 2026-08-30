/**
 * main.js - 入口与初始化
 */

// 调试模式开关：发布时设为 false，开发时设为 true
var DEBUG = false;

// 统一 HTML 转义收口：所有动态字符串拼接进 innerHTML 前必须经此处理，
// 避免未来把 JSON 字段（data/*.json 作者内容）塞进属性/URL 时引入 XSS。
// 用法：esc(text) 仅转义；esc(text, true) 额外把换行转为 <br>。
function esc(str, newlineToBr) {
    if (str === null || str === undefined) return '';
    let s = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    if (newlineToBr) s = s.replace(/\n/g, '<br>');
    return s;
}


// ============================================================
// 全局常量
// ============================================================
const GAME_VERSION = '0.2.4';

// ============================================================
// 退出自动存档：关闭/刷新页面时把当前进度写入当前存档槽
// （pagehide 覆盖移动端与标签页关闭，beforeunload 兜底桌面端；once 守卫防双写。
//   gameOver 后不写，避免结局画面被意外覆盖为中途状态。）
// ============================================================
let exitAutoSaveDone = false;
function performExitAutoSave() {
    if (exitAutoSaveDone) return;
    if (!window.MemorySanctuary || !MemorySanctuary.state || MemorySanctuary.state.gameOver) return;
    const slot = getCurrentSlot();
    if (slot >= 1) {
        saveGame(slot);
    }
    exitAutoSaveDone = true;
}
window.addEventListener('pagehide', performExitAutoSave);
window.addEventListener('beforeunload', performExitAutoSave);
// 页面从 bfcache 恢复（前进/后退）后继续游戏时，允许下次退出再次存档
window.addEventListener('pageshow', () => { exitAutoSaveDone = false; });

// ============================================================
// 全局错误处理：防止加载失败白屏
// ============================================================
window.addEventListener('unhandledrejection', (event) => {
    if (DEBUG) console.error('[记忆圣所] 未处理的Promise异常:', event.reason);
    const statusText = document.getElementById('boot-status');
    if (statusText && statusText.textContent && statusText.textContent.includes('加载失败')) {
        // 已经在显示错误信息，不重复
        return;
    }
    // 尝试显示错误提示
    const bootScreen = document.getElementById('boot-screen');
    if (bootScreen && !bootScreen.classList.contains('fade-out')) {
        const status = document.getElementById('boot-status');
        if (status) status.textContent = '加载失败: ' + (event.reason?.message || event.reason);
    }
});

window.MemorySanctuary = {
    state: null,
    data: {
        archives: [],
        vaults: [],
        guardians: [],
        events: [],
        explorations: [],
        tech: [],
        techMeta: {}
    },
    currentVaultId: 1,
    activeEvent: null
};

/**
 * 启动流程：
 * 1. 显示启动画面（内联 CSS，瞬间出现）
 * 2. 加载游戏数据 + 后台下载字体（并行）
 * 3. 初始化游戏系统
 * 4. 隐藏启动画面，显示标题
 */
// ============================================================
// 移动端检测
// ============================================================
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (window.innerWidth <= 768 && 'ontouchstart' in window);
}

function showMobileWarning() {
    const bootScreen = document.getElementById('boot-screen');
    if (bootScreen) {
        bootScreen.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:2rem;text-align:center;">
                <div style="font-size:3rem;margin-bottom:1rem;">📱</div>
                <div style="font-size:1.2rem;color:#c9a87c;margin-bottom:1rem;">暂不支持移动端</div>
                <div style="font-size:0.9rem;color:#888;max-width:300px;line-height:1.6;">
                    记忆圣所是一款为桌面浏览器设计的游戏。<br>
                    请在 PC 或笔记本上启动本游戏以获得最佳体验。
                </div>
            </div>
        `;
        bootScreen.classList.remove('fade-out');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 早期移动端检测
    if (isMobileDevice()) {
        showMobileWarning();
        return; // 阻止后续初始化
    }
    
    if (DEBUG) console.log('[记忆圣所] 启动中...');
    
    const bootScreen = document.getElementById('boot-screen');
    const progressBar = document.getElementById('boot-progress-bar');
    const statusText = document.getElementById('boot-status');
    
    function updateBoot(percent, message) {
        if (progressBar) progressBar.style.width = percent + '%';
        if (statusText && message) statusText.textContent = message;
    }
    
    try {
        // 阶段1：显示启动画面
        updateBoot(5, '正在初始化...');
        
        // 阶段2：并行加载字体和游戏数据
        const fontLoader = new FontLoader();
        
        const fontPromise = fontLoader.load((pct, msg) => {
            // 字体加载进度映射到 10-95%
            updateBoot(10 + pct * 0.85, msg);
        });
        
        const dataPromise = loadGameData().then(() => {
            updateBoot(92, '正在加载数据...');
        }).catch((err) => {
            // 数据加载失败不阻塞启动（个别文件失败时游戏降级运行）
            if (DEBUG) console.error('[记忆圣所] 数据加载失败:', err);
            if (statusText) statusText.textContent = '数据加载异常（部分内容可能缺失）：' + (err && err.message ? err.message : String(err));
        });
        
        // 并行执行，但字体失败不影响数据加载
        await Promise.all([fontPromise, dataPromise]);
        
        // 阶段3：初始化游戏系统
        updateBoot(95, '正在启动圣所...');
        
        initTheme();
        initSaveData();
        
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
        if (typeof initExportImport === 'function') initExportImport();
        if (typeof initSettings === 'function') initSettings();
        if (typeof initDLC === 'function') initDLC();
        
        if (typeof VN !== 'undefined' && MemorySanctuary.data.scenes) {
            VN.init(MemorySanctuary.data.scenes);
            if (MemorySanctuary.data.endingScenes) {
                VN.loadEndingScenes(MemorySanctuary.data.endingScenes);
            }
        }
        
        if (typeof AudioSystem !== 'undefined') {
            const initAudio = () => {
                AudioSystem.init();
                AudioSystem.tryPlayBGMAfterInteraction();
                document.removeEventListener('click', initAudio);
                document.removeEventListener('keydown', initAudio);
            };
            document.addEventListener('click', initAudio);
            document.addEventListener('keydown', initAudio);
        }
        
        initTitleScreen();

        // 版本更新检测（轻量方案 A，失败静默降级，绝不阻塞启动）
        checkForUpdate();

        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playBGM('title');
        }
        
        // 阶段4：隐藏启动画面
        updateBoot(100, '完成');
        setTimeout(() => {
            if (bootScreen) {
                bootScreen.classList.add('fade-out');
                setTimeout(() => bootScreen.remove(), 500);
            }
        }, 300);
        
        if (DEBUG) console.log('[记忆圣所] 初始化完成');
    } catch (error) {
        if (DEBUG) console.error('[记忆圣所] 初始化失败:', error);
        // 显示具体错误信息（Neutralino 打包排障用：区分加载失败原因）
        if (statusText) {
            const msg = error && error.message ? error.message : String(error);
            statusText.textContent = '加载失败：' + msg;
            if (error && error.stack) {
                const line = error.stack.split('\n').find(l => l.includes('main.js') || l.includes('game') || l.includes('font'));
                if (line) statusText.textContent += ' @ ' + line.trim().slice(0, 140);
            }
        }
    }
});

async function loadGameData() {
    // 带超时的 JSON 加载：Neutralino WebView2 等环境下 fetch 可能挂起（永不 settle），
    // AbortController 强制中止后走 catch 降级，避免启动画面永久卡在「正在初始化」
    const fetchJson = async (path, timeoutMs = 8000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(path, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    };
    const safe = async (path, fallback, name) => {
        try {
            return await fetchJson(path);
        } catch (e) {
            if (DEBUG) console.warn(`[数据] ${name} 加载失败:`, e);
            return fallback;
        }
    };

    const archivesData = await safe('data/archives.json', { archives: [] }, 'archives.json');
    const vaultsData = await safe('data/vaults.json', { vaults: [] }, 'vaults.json');
    const guardiansData = await safe('data/guardians.json', { guardians: [] }, 'guardians.json');
    const eventsData = await safe('data/events.json', { events: [] }, 'events.json');
    const explorationsData = await safe('data/explorations.json', { explorations: [] }, 'explorations.json');
    const projectsData = await safe('data/projects.json', { projects: [] }, 'projects.json');
    const techData = await safe('data/tech.json', { tech: [] }, 'tech.json');

    MemorySanctuary.data.archives = archivesData.archives;
    MemorySanctuary.data.vaults = vaultsData.vaults;
    MemorySanctuary.data.guardians = guardiansData.guardians;
    MemorySanctuary.data.events = eventsData.events.filter(e => e.trigger?.type !== 'scheduled');
    MemorySanctuary.data.scheduledEvents = eventsData.events.filter(e => e.trigger?.type === 'scheduled');
    MemorySanctuary.data.explorations = explorationsData.explorations || [];
    MemorySanctuary.data.projects = projectsData.projects || [];
    MemorySanctuary.data.tech = techData.tech || [];
    MemorySanctuary.data.techMeta = {
        doctrineNames: techData.doctrineNames || {},
        domainNames: techData.domainNames || {}
    };
    try {
        const endingsRes = await fetch('data/endings.json');
        MemorySanctuary.data.endings = (await endingsRes.json()).endings || [];
    } catch (e) {
        if (DEBUG) console.warn('[数据] endings.json 加载失败，使用内置结局');
        MemorySanctuary.data.endings = [];
    }
    try {
        const achievementsRes = await fetch('data/achievements.json');
        MemorySanctuary.data.achievements = (await achievementsRes.json()).achievements || [];
    } catch (e) {
        if (DEBUG) console.warn('[数据] achievements.json 加载失败');
        MemorySanctuary.data.achievements = [];
    }
    try {
        const scenesRes = await fetch('data/scenes.json');
        MemorySanctuary.data.scenes = await scenesRes.json();
        if (DEBUG) console.log(`[数据] ${Object.keys(MemorySanctuary.data.scenes).length} 个剧情场景`);
    } catch (e) {
        if (DEBUG) console.warn('[数据] scenes.json 加载失败，VN系统不可用');
        MemorySanctuary.data.scenes = {};
    }
    try {
        const endingScenesRes = await fetch('data/ending_scenes.json');
        MemorySanctuary.data.endingScenes = await endingScenesRes.json();
        if (DEBUG) console.log(`[数据] ${Object.keys(MemorySanctuary.data.endingScenes).length} 个结局场景`);
    } catch (e) {
        if (DEBUG) console.warn('[数据] ending_scenes.json 加载失败');
        MemorySanctuary.data.endingScenes = {};
    }
    try {
        const guardianEventsRes = await fetch('data/guardian_events.json');
        MemorySanctuary.data.guardianEvents = (await guardianEventsRes.json()).guardian_events || [];
        if (DEBUG) console.log(`[数据] ${MemorySanctuary.data.guardianEvents.length} 个守护者事件`);
    } catch (e) {
        if (DEBUG) console.warn('[数据] guardian_events.json 加载失败');
        MemorySanctuary.data.guardianEvents = [];
    }

    try {
        const guardianStoriesRes = await fetch('data/guardian_stories.json');
        MemorySanctuary.data.guardianStories = (await guardianStoriesRes.json()).guardian_stories || [];
        if (DEBUG) console.log(`[数据] ${MemorySanctuary.data.guardianStories.length} 个守护者故事`);
    } catch (e) {
        if (DEBUG) console.warn('[数据] guardian_stories.json 加载失败');
        MemorySanctuary.data.guardianStories = [];
    }
    
    if (DEBUG) console.log(`[数据] ${MemorySanctuary.data.archives.length}条目, ${MemorySanctuary.data.vaults.length}存储室, ${MemorySanctuary.data.guardians.length}守护者, ${MemorySanctuary.data.events.length}随机事件, ${MemorySanctuary.data.scheduledEvents.length}调度事件, ${MemorySanctuary.data.explorations.length}勘探点, ${MemorySanctuary.data.projects.length}项目`);
}

function initGameState() {
    MemorySanctuary.state = {
        resources: { energy: 150, media: 100, environment: 95, food: 50, engineeringBots: 2 },
        ongoingEffects: [],
        resourceChanges: { energy: 0, media: 0, environment: 0, food: 0, engineeringBots: 0 },
        week: 1,
        chapter: 1,
        completedArchives: [],
        vaultUsage: {},
        narrativeFlags: ['intro_complete'],
        activeEvents: [],
        activeEventIds: [],
        deterioration: { energy: false, media: false, environment: false },
        emergencyCorruption: 0,
        emergencyCooldowns: {},
        gameOver: false,
        guardianMoods: { tika: 2, finn: 2, misha: 2, lorn: 2, ethel: 2 },
        scheduledEvents: [],
        unlockedBonuses: [],
        departedGuardians: [],
        sacrificedGuardian: null,
        guardianSacrifice: false,
        starvationWeeks: 0,
        weeksWithoutStarvation: 0,
        turnsSkipped: 0,
        emergencyArchiveUsed: 0,
        exploration: { deployedUntil: 0, cooldownUntil: 0, completedExplorations: {}, fatigue: {}, explorationLog: [] },
        activeProjects: [],
        completedProjects: [],
        chaptersCompleted: [],
        pendingEnding: null,
        instantArchiveChances: 0,
        lastSupplyWeek: 0,
        aiAssistantActive: false,
        aiAssistUsedThisWeek: false,
        finalPrepHintShown: false,
        panelHints: { project: false, explore: false, emergency: false },
        emergencyExploreFoodFree: false,
        aiAssistCount: 0,
        guardianAidCount: 0,
        emergencyExploreUsed: false,
        famineSurvived: false,
        batchArchiveMode: false,
        batchArchiveCount: 0,
        batchArchiveUsedThisRun: false,
        nextWeekDecayPenalty: 0,
        modules: {},
        // 通用科技树（v0.2.4）：已解锁科技 id 与学说路线（doctrineKey -> 节点 id）
        techUnlocked: [],
        techDoctrines: {},
        // 工程机器人系统
        botFactoryActive: false,
        botMaintenanceCost: 0,
        // 跨周目继承
        inheritedProjects: [],
        inheritedVaultUsage: {},
        memoryEchoSelection: [],
        deepArchiveCount: 0,
        conflictLog: [],
        consecutiveSkips: 0,
        // 叙事连锁
        narrativeFlags: ['intro_complete'],
        sacrificeHistory: [],
        loopCluesFound: []
    };
    
    MemorySanctuary.data.vaults.forEach(vault => {
        MemorySanctuary.state.vaultUsage[vault.id] = 0;
    });
    
    // 重置归档条目的过期状态（NG+ 新游戏必须清除上一局的持久化标记）
    if (MemorySanctuary.data.archives) {
        MemorySanctuary.data.archives.forEach(entry => {
            entry.expired = false;
        });
    }
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
            if (typeof refreshCanvasTheme === 'function') refreshCanvasTheme();
        });
    }
    
    // 静音切换
    const muteToggle = document.getElementById('mute-toggle');
    if (muteToggle && typeof AudioSystem !== 'undefined') {
        muteToggle.addEventListener('click', () => {
            const isMuted = AudioSystem.toggleMute();
            muteToggle.textContent = isMuted ? '🔇' : '🔊';
        });
    }

    // 封印圣所按钮（顶部栏）
    const sealBtn = document.getElementById('seal-topbar-btn');
    if (sealBtn) {
        sealBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            const archivedCount = MemorySanctuary.state.completedArchives.length;
            const week = MemorySanctuary.state.week;
            if (confirm(`确定封印圣所吗？\n\n已归档条目：${archivedCount}\n运行周数：${week}\n\n这将结束当前周目并解锁多周目奖励。`)) {
                sealSanctuary();
            }
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

    // 版本号：单一来源 GAME_VERSION，统一显示
    const titleVersionEl = document.getElementById('title-version');
    if (titleVersionEl) {
        titleVersionEl.textContent = `v${GAME_VERSION}`;
    }

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

    const titleThemeToggle = document.getElementById('title-theme-toggle');
    if (titleThemeToggle) {
        titleThemeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('memory-sanctuary-theme', next);
            titleThemeToggle.textContent = next === 'dark' ? '◐ 主题' : '◑ 主题';
            if (typeof refreshCanvasTheme === 'function') refreshCanvasTheme();
        });
    }
    
    // DLC 模式切换按钮
    const titleDlcBtn = document.getElementById('title-dlc');
    if (titleDlcBtn) {
        titleDlcBtn.addEventListener('click', () => {
            openDLCPanel();
        });
    }
    
    // DLC 面板关闭按钮
    const dlcPanelClose = document.getElementById('dlc-panel-close');
    if (dlcPanelClose) {
        dlcPanelClose.addEventListener('click', () => {
            closeDLCPanel();
        });
    }
    
    // 点击 DLC 面板背景关闭
    const dlcPanel = document.getElementById('dlc-panel');
    if (dlcPanel) {
        dlcPanel.addEventListener('click', (e) => {
            if (e.target === dlcPanel) closeDLCPanel();
        });
    }
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

    // 标题「帮助」直接复用游戏内分层帮助弹窗（单一内容源，避免两份帮助口径漂移）
    if (titleHelp) {
        titleHelp.addEventListener('click', () => {
            if (typeof showHelpModal === 'function') showHelpModal();
        });
    }

    // About button
    if (titleAbout) {
        titleAbout.addEventListener('click', () => {
            showAboutModal();
        });
    }

    // Return to title from game（唯一绑定；此前与 game.js 双重绑定导致确认框形同虚设）
    if (titleBtn) {
        titleBtn.addEventListener('click', () => {
            if (typeof btnClick === 'function') btnClick();
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
    // 清空活跃事件，防止下次读档时残留导致"有事件无法跳过"
    MemorySanctuary.activeEvent = null;
    
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    const ngplusEl = document.getElementById('title-ngplus');
    
    titleScreen.classList.remove('hidden');
    gameContainer.classList.add('hidden');
    
    // 返回标题画面：播放标题 BGM
    if (typeof AudioSystem !== 'undefined') {
        AudioSystem.playBGM('title');
    }
    
    // 刷新 NG+ info
    const ng = getNGPlusData();
    if (ngplusEl && ng.playthroughCount > 0) {
        ngplusEl.innerHTML = `
            <div class="title-ngplus-info">
                <span>已完成 ${ng.playthroughCount} 周目</span>
                <span>累计归档 ${ng.totalArchivesSaved} 条</span>
            </div>
        `;
    }
    
    // 刷新 DLC 当前模式标签
    const dlcLabel = document.getElementById('dlc-current-label');
    if (dlcLabel && MemorySanctuary.activeModule) {
        const module = DLC_MODULES[MemorySanctuary.activeModule];
        if (module) dlcLabel.textContent = module.name;
    }
}

// ==========================================
// DLC 选择面板
// ==========================================

function openDLCPanel() {
    const panel = document.getElementById('dlc-panel');
    const list = document.getElementById('dlc-list');
    if (!panel || !list) return;

    // 填充 DLC 列表
    list.innerHTML = '';

    // DLC 本期未实装（HANDOFF §6）：仅「圣所」主模式可玩
    for (const [id, module] of Object.entries(DLC_MODULES)) {
        const notImplemented = id !== 'sanctuary';
        const unlocked = isModuleUnlocked(id);
        const isActive = MemorySanctuary.activeModule === id;
        const progress = getModuleUnlockProgress(id);

        const item = document.createElement('button');
        item.className = 'dlc-item';
        if (isActive) item.classList.add('dlc-active');
        if (!unlocked) item.classList.add('dlc-locked');
        if (notImplemented) item.classList.add('dlc-unimplemented');

        const statusText = notImplemented
            ? '🚧 暂未实装'
            : (isActive ? '当前' : (unlocked ? '已解锁' : progress));

        item.innerHTML = `
            <span class="dlc-item-icon">${module.icon}</span>
            <div class="dlc-item-info">
                <div class="dlc-item-name">${module.name}</div>
                <div class="dlc-item-desc">${notImplemented ? '该模式正在制作中，请等待后续版本更新。' : module.description}</div>
            </div>
            <span class="dlc-item-status ${notImplemented ? 'dlc-status-locked' : (isActive ? 'dlc-status-active' : (unlocked ? 'dlc-status-unlocked' : 'dlc-status-locked'))}">
                ${statusText}
            </span>
        `;

        if (notImplemented) {
            // 未实装模式不可进入（进入只会看到占位画面）
            item.addEventListener('click', () => {
                if (typeof showTransientNotice === 'function') {
                    showTransientNotice('🚧 该模式暂未实装，请等待后续版本更新。');
                } else {
                    alert('该模式暂未实装，请等待后续版本更新。');
                }
            });
        } else if (unlocked && !isActive) {
            item.addEventListener('click', () => {
                switchModule(id);
                closeDLCPanel();
            });
        }

        list.appendChild(item);
    }

    panel.classList.remove('hidden');
}

function closeDLCPanel() {
    const panel = document.getElementById('dlc-panel');
    if (panel) panel.classList.add('hidden');
}

function startNewGameWithSlotSelect() {
    openSaveScreen('new');
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
            bonuses: [],
            seenScenes: []
        }));
    }
    
    // Initialize settings if not present
    const settingsRaw = localStorage.getItem('memory-sanctuary-settings');
    if (!settingsRaw) {
        localStorage.setItem('memory-sanctuary-settings', JSON.stringify({
            skipConfirm: false,
            showResult: true,
            vnGuardianDialogue: true
        }));
    }
}

// ==========================================
// 设置系统
// ==========================================

function getSettings() {
    const raw = localStorage.getItem('memory-sanctuary-settings');
    if (!raw) return { skipConfirm: false, quickNoteConfirm: true, showResult: true, vnGuardianDialogue: true, animationSpeed: 100, fontSize: 17 };
    try {
        const parsed = JSON.parse(raw);
        return { skipConfirm: false, quickNoteConfirm: true, showResult: true, vnGuardianDialogue: true, animationSpeed: 100, fontSize: 17, ...parsed };
    } catch {
        return { skipConfirm: false, quickNoteConfirm: true, showResult: true, vnGuardianDialogue: true, animationSpeed: 100, fontSize: 17 };
    }
}

function initSettings() {
    const titleSettingsBtn = document.getElementById('title-settings');
    const inGameSettingsBtn = document.getElementById('settings-btn');
    const overlay = document.getElementById('settings-overlay');
    const closeBtn = document.getElementById('settings-close');
    const skipConfirmCheckbox = document.getElementById('setting-skip-confirm');
    const quickNoteConfirmCheckbox = document.getElementById('setting-quick-note-confirm');
    const showResultCheckbox = document.getElementById('setting-show-result');
    const vnGuardianCheckbox = document.getElementById('setting-vn-guardian');
    const checkUpdateBtn = document.getElementById('setting-check-update');
    const bgmVolumeSlider = document.getElementById('setting-bgm-volume');
    const bgmVolumeValue = document.getElementById('bgm-volume-value');
    const bgmMuteBtn = document.getElementById('setting-bgm-mute');
    const sfxVolumeSlider = document.getElementById('setting-sfx-volume');
    const sfxVolumeValue = document.getElementById('sfx-volume-value');

    // Load current settings into checkboxes
    const settings = getSettings();
    if (skipConfirmCheckbox) skipConfirmCheckbox.checked = settings.skipConfirm;
    if (quickNoteConfirmCheckbox) quickNoteConfirmCheckbox.checked = settings.quickNoteConfirm !== false;
    if (showResultCheckbox) showResultCheckbox.checked = settings.showResult;
    if (vnGuardianCheckbox) vnGuardianCheckbox.checked = settings.vnGuardianDialogue;
    
    // 音频控件与 AudioSystem 实际状态同步（静音/音量已持久化，重启后要如实还原）
    function syncAudioSettingsUI() {
        if (typeof AudioSystem === 'undefined') return;

        const globalMuted = AudioSystem.isGlobalMuted;
        const bgmMuted = AudioSystem.isBGMMuted;
        const sfxMuted = AudioSystem.isSFXMuted;

        if (bgmVolumeSlider) {
            bgmVolumeSlider.value = Math.round(AudioSystem.bgmVolumeLevel * 100);
            bgmVolumeSlider.style.filter = (bgmMuted || globalMuted) ? 'grayscale(1)' : '';
        }
        if (bgmVolumeValue) {
            bgmVolumeValue.textContent = Math.round(AudioSystem.bgmVolumeLevel * 100) + '%';
        }
        if (bgmMuteBtn) {
            bgmMuteBtn.textContent = bgmMuted ? '🔇' : '🎵';
            bgmMuteBtn.classList.toggle('muted', bgmMuted);
        }

        if (sfxVolumeSlider) {
            sfxVolumeSlider.value = Math.round((AudioSystem.sfxVolumeLevel ?? 1) * 100);
            sfxVolumeSlider.style.filter = (sfxMuted || globalMuted) ? 'grayscale(1)' : '';
        }
        if (sfxVolumeValue) {
            sfxVolumeValue.textContent = Math.round((AudioSystem.sfxVolumeLevel ?? 1) * 100) + '%';
        }
        if (sfxMuteBtn) {
            sfxMuteBtn.textContent = sfxMuted ? '🔇' : '🔊';
            sfxMuteBtn.classList.toggle('muted', sfxMuted);
        }

        if (globalMuteBtn) {
            globalMuteBtn.textContent = globalMuted ? '🔇 已静音' : '🔇 全局静音';
            globalMuteBtn.classList.toggle('active', globalMuted);
        }

        // 顶栏快捷静音键图标
        const topMute = document.getElementById('mute-toggle');
        if (topMute) {
            topMute.textContent = AudioSystem.isMuted ? '🔇' : '🔊';
        }

        updateSliderFill();
        updateSfxSliderFill();
    }
    window.__syncAudioSettingsUI = syncAudioSettingsUI;
    
    // Open settings from title screen
    if (titleSettingsBtn) {
        titleSettingsBtn.addEventListener('click', () => {
            openSettingsPanel();
        });
    }
    
    // Open settings from in-game func bar
    if (inGameSettingsBtn) {
        inGameSettingsBtn.addEventListener('click', () => {
            openSettingsPanel();
        });
    }
    
    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeSettingsPanel();
        });
    }
    
    // Close on overlay click
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSettingsPanel();
        });
    }
    
    // Save on checkbox change
    if (skipConfirmCheckbox) {
        skipConfirmCheckbox.addEventListener('change', () => {
            const s = getSettings();
            s.skipConfirm = skipConfirmCheckbox.checked;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
        });
    }
    if (quickNoteConfirmCheckbox) {
        quickNoteConfirmCheckbox.addEventListener('change', () => {
            const s = getSettings();
            s.quickNoteConfirm = quickNoteConfirmCheckbox.checked;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
        });
    }
    // 手动检查更新（设置面板入口）
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', () => {
            const statusEl = document.getElementById('check-update-status');
            if (statusEl) statusEl.textContent = '检查中…';
            if (typeof manualCheckUpdate === 'function') {
                manualCheckUpdate((msg) => {
                    if (statusEl) statusEl.textContent = msg;
                    setTimeout(() => { if (statusEl) statusEl.textContent = `当前 v${GAME_VERSION}`; }, 4000);
                });
            }
        });
    }
    if (showResultCheckbox) {
        showResultCheckbox.addEventListener('change', () => {
            const s = getSettings();
            s.showResult = showResultCheckbox.checked;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
        });
    }
    if (vnGuardianCheckbox) {
        vnGuardianCheckbox.addEventListener('change', () => {
            const s = getSettings();
            s.vnGuardianDialogue = vnGuardianCheckbox.checked;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
        });
    }
    
    // BGM 音量滑块
    function updateSliderFill() {
        if (!bgmVolumeSlider) return;
        const val = parseInt(bgmVolumeSlider.value, 10);
        const pct = val + '%';
        bgmVolumeSlider.style.background = `linear-gradient(to right, var(--amber-primary) 0%, var(--amber-primary) ${pct}, var(--bg-panel) ${pct}, var(--bg-panel) 100%)`;
    }
    
    // 初始化填充
    updateSliderFill();
    
    if (bgmVolumeSlider) {
        bgmVolumeSlider.addEventListener('input', () => {
            const val = parseInt(bgmVolumeSlider.value, 10) / 100;
            if (bgmVolumeValue) {
                bgmVolumeValue.textContent = Math.round(val * 100) + '%';
            }
            if (typeof AudioSystem !== 'undefined') {
                AudioSystem.setBGMVolume(val);
            }
            updateSliderFill();
        });
    }
    
    // SFX 音量滑块
    function updateSfxSliderFill() {
        if (!sfxVolumeSlider) return;
        const val = parseInt(sfxVolumeSlider.value, 10);
        const pct = val + '%';
        sfxVolumeSlider.style.background = `linear-gradient(to right, var(--amber-primary) 0%, var(--amber-primary) ${pct}, var(--bg-panel) ${pct}, var(--bg-panel) 100%)`;
    }
    
    updateSfxSliderFill();
    
    if (sfxVolumeSlider) {
        sfxVolumeSlider.addEventListener('input', () => {
            const val = parseInt(sfxVolumeSlider.value, 10) / 100;
            if (sfxVolumeValue) {
                sfxVolumeValue.textContent = Math.round(val * 100) + '%';
            }
            if (typeof AudioSystem !== 'undefined') {
                AudioSystem.setSFXVolume(val);
            }
            updateSfxSliderFill();
        });
    }
    
    // BGM 静音按钮
    if (bgmMuteBtn) {
        bgmMuteBtn.addEventListener('click', () => {
            if (typeof AudioSystem !== 'undefined') {
                const isMuted = AudioSystem.toggleBGMMute();
                bgmMuteBtn.textContent = isMuted ? '🔇' : '🎵';
                bgmMuteBtn.classList.toggle('muted', isMuted);
                // 静音时滑块变灰
                if (bgmVolumeSlider) {
                    if (isMuted) {
                        bgmVolumeSlider.style.filter = 'grayscale(1)';
                        bgmMuteBtn.classList.add('muted');
                    } else {
                        bgmVolumeSlider.style.filter = '';
                        bgmMuteBtn.classList.remove('muted');
                    }
                }
            }
        });
    }
    
    // SFX 静音按钮
    const sfxMuteBtn = document.getElementById('setting-sfx-mute');
    if (sfxMuteBtn) {
        sfxMuteBtn.addEventListener('click', () => {
            if (typeof AudioSystem !== 'undefined') {
                const isMuted = AudioSystem.toggleSFXMute();
                sfxMuteBtn.textContent = isMuted ? '🔇' : '🔊';
                sfxMuteBtn.classList.toggle('muted', isMuted);
                // 静音时滑块变灰
                if (sfxVolumeSlider) {
                    if (isMuted) {
                        sfxVolumeSlider.style.filter = 'grayscale(1)';
                        sfxMuteBtn.classList.add('muted');
                    } else {
                        sfxVolumeSlider.style.filter = '';
                        sfxMuteBtn.classList.remove('muted');
                    }
                }
            }
        });
    }
    
    // 全局静音按钮
    const globalMuteBtn = document.getElementById('setting-global-mute');
    if (globalMuteBtn) {
        globalMuteBtn.addEventListener('click', () => {
            if (typeof AudioSystem !== 'undefined') {
                const isMuted = AudioSystem.toggleGlobalMute();
                globalMuteBtn.textContent = isMuted ? '🔇 已静音' : '🔇 全局静音';
                globalMuteBtn.classList.toggle('active', isMuted);
                // 同步更新两个滑块和静音按钮状态
                if (sfxVolumeSlider && bgmVolumeSlider) {
                    if (isMuted) {
                        sfxVolumeSlider.style.filter = 'grayscale(1)';
                        bgmVolumeSlider.style.filter = 'grayscale(1)';
                    } else {
                        if (sfxMuteBtn && !sfxMuteBtn.classList.contains('muted')) {
                            sfxVolumeSlider.style.filter = '';
                        }
                        if (bgmMuteBtn && !bgmMuteBtn.classList.contains('muted')) {
                            bgmVolumeSlider.style.filter = '';
                        }
                    }
                }
            }
        });
    }
    
    // 动画速度滑块
    const animationSpeedSlider = document.getElementById('setting-animation-speed');
    const animationSpeedValue = document.getElementById('animation-speed-value');
    if (animationSpeedSlider) {
        animationSpeedSlider.value = (getSettings().animationSpeed ?? 100);
        const setFill = () => {
            const min = parseInt(animationSpeedSlider.min, 10) || 0;
            const max = parseInt(animationSpeedSlider.max, 10) || 100;
            const v = parseInt(animationSpeedSlider.value, 10);
            const pct = ((v - min) / (max - min) * 100).toFixed(1) + '%';
            animationSpeedSlider.style.setProperty('--slider-fill', pct);
        };
        setFill();
        if (animationSpeedValue) {
            animationSpeedValue.textContent = animationSpeedSlider.value + '%';
        }
        animationSpeedSlider.addEventListener('input', () => {
            const val = parseInt(animationSpeedSlider.value, 10);
            if (animationSpeedValue) {
                animationSpeedValue.textContent = val + '%';
            }
            const s = getSettings();
            s.animationSpeed = val;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
            document.documentElement.style.setProperty('--animation-speed', (val / 100).toFixed(2));
            setFill();
        });
    }
    
    // 字体大小滑块
    const fontSizeSlider = document.getElementById('setting-font-size');
    const fontSizeValue = document.getElementById('font-size-value');
    if (fontSizeSlider) {
        fontSizeSlider.value = (getSettings().fontSize ?? 17);
        const setFill = () => {
            const min = parseInt(fontSizeSlider.min, 10) || 0;
            const max = parseInt(fontSizeSlider.max, 10) || 100;
            const v = parseInt(fontSizeSlider.value, 10);
            const pct = ((v - min) / (max - min) * 100).toFixed(1) + '%';
            fontSizeSlider.style.setProperty('--slider-fill', pct);
        };
        setFill();
        if (fontSizeValue) {
            fontSizeValue.textContent = fontSizeSlider.value + 'px';
        }
        fontSizeSlider.addEventListener('input', () => {
            const val = parseInt(fontSizeSlider.value, 10);
            if (fontSizeValue) {
                fontSizeValue.textContent = val + 'px';
            }
            const s = getSettings();
            s.fontSize = val;
            localStorage.setItem('memory-sanctuary-settings', JSON.stringify(s));
            document.documentElement.style.fontSize = val + 'px';
            setFill();
        });
    }

    // 此时全部音频控件引用已就绪，按恢复的静音/音量状态同步 UI
    syncAudioSettingsUI();
}

function openSettingsPanel() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('hidden');
    // 面板可能在上次打开后被外部改动（如全局静音联动），每次打开都对齐实际音频状态
    if (typeof window.__syncAudioSettingsUI === 'function') window.__syncAudioSettingsUI();
}

function closeSettingsPanel() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.add('hidden');
}

