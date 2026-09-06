/**
 * canvas.js - Canvas 渲染
 * 圣所主厅（idle）：天文馆冷峻风 × 圣所叙事主体
 * 构图：穹顶肋线 + 两侧立柱 → 中央观察窗（银河带 / 远方行星 / 双层星 / 流星）
 *       → 光井 → 中央「歌者之座」高台（呼吸琥珀共鸣芯 + 向存储室扩散的声波涟漪）
 *       → 前景低控制台 + 拱顶存储室门
 * 主视觉焦点与教程文案（"中央的歌者之座将声波传递至各个存储室"）一致；
 * 冷色为底，唯一暖色焦点是共鸣芯——圣所的"心脏"，不回归早期全视之眼式恐怖意象。
 *
 * 颜色全部从 CSS 变量读取（getComputedStyle），主/浅双主题自动适配，
 * 不在 JS 内写死 #hex。布局全部确定性（index 种子/时刻表动画），渲染循环无随机数。
 */

let sanctuaryCanvas = null;
let sanctuaryCtx = null;
let animationId = null;
let time = 0;

// 场景粒子系统
let particles = [];
let floatingSymbols = [];
let sceneTransition = 0;
let currentSceneId = 1;

// 归档成功灯光脉冲（C6，2026-09-06）：triggerSanctuaryFlash() 置 1，animate 中指数衰减
let sanctuaryFlash = 0;

/**
 * 归档成功触发圣所灯光脉冲（柔和暖光闪过 + 记忆微光爆发）
 * 由 game-archive.js 在归档成功路径调用；幂等，动画循环内自衰减。
 */
function triggerSanctuaryFlash() {
    if (REDUCED_MOTION) return; // 尊重系统减少动效偏好
    sanctuaryFlash = 0.9;
    // 伴随少量记忆微光上涌，增强"保存成功"的实感
    for (let i = 0; i < 6; i++) addParticle();
}

// 章节过渡效果状态
let chapterTransitionEffect = {
    active: false,
    startTime: 0,
    duration: 3000,
    intensity: 0
};

// 调色板（从 CSS 变量读取，启动时 + 主题切换时刷新）
let CANVAS_PALETTE = null;
// 是否尊重"减少动态效果"偏好
let REDUCED_MOTION = false;

// 符号字符库（记忆微光，温和上升漂浮）
const SYMBOL_LIBRARY = {
    language: ['◇', '◈', '◊', '✦', '✧', '⌬'],
    history: ['Ⅰ', 'Ⅱ', 'Ⅲ', '◐', '◑', '◒'],
    disaster: ['✧', '⋆', '❉', '✺', '✸'],
    art: ['♪', '♫', '♬', '△', '○', '●'],
    philosophy: ['∞', '☯', '⚘', '✿', '❀'],
    science: ['⚛', '✶', '⊕', '⊗', '⬡'],
    ecology: ['❀', '✿', '❁', '❃', '🌿'],
    law: ['⚖', '§', '🔱', '✦'],
    daily: ['☀', '☁', '★', '☆', '✩'],
    architecture: ['⌂', '⌘', '⬡', '◈'],
    medicine: ['✚', '❀', '✿', '⊕'],
    astronomy: ['★', '☆', '✩', '✫', '✯']
};

const SANCTUARY_CONFIG = {
    width: 600,
    height: 400,

    // 观察窗（建筑化视窗，矩形，望向星空 / 银河 / 远方行星）
    window: {
        x: 132,
        y: 40,
        w: 336,
        h: 168,
        strokeWidth: 2
    },

    // 地平线（地面从这条线向下延展，产生纵深）
    floorY: 262,

    // 歌者之座（中央高台：圣所的心脏，声波从这里传向各存储室）
    dais: {
        cx: 300,
        baseY: 336,
        w: 190,
        h: 74
    },

    // 前景控制台（画面前下方的低矮桌台剪影，交代"有人在此工作"）
    console: {
        centerX: 300,
        topY: 344,
        width: 480,
        height: 56,
        strokeWidth: 2
    },

    // 存储室冷光舷窗（前景桌台正面的一排冷光门，随 currentVaultId 切换高亮）
    portholes: {
        radius: 7,
        rowY: 384,
        gap: 30
    }
};

// ---- 调色板读取（CSS 变量 → 内部 RGB） ----
function hexToRgb(hex, fallback) {
    hex = (hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) {
        return fallback || { r: 138, g: 106, b: 74 };
    }
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function refreshCanvasPalette() {
    const cs = getComputedStyle(document.documentElement);
    const gv = (name, fb) => {
        const v = cs.getPropertyValue(name);
        return (v && v.trim()) ? v.trim() : fb;
    };
    const pal = {
        bgDeep: hexToRgb(gv('--bg-deep', '#0a0a0f')),
        bgPanel: hexToRgb(gv('--bg-panel', '#12121a')),
        amber: hexToRgb(gv('--amber-primary', '#d4a04a')),
        amberGlow: hexToRgb(gv('--amber-glow', '#e8b85c')),
        amberDim: hexToRgb(gv('--amber-dim', '#8a6a2a')),
        textDim: hexToRgb(gv('--text-dim', '#5a5040')),
        border: hexToRgb(gv('--border-subtle', '#2a2a35')),
        danger: hexToRgb(gv('--danger', '#8a3a2a')),
        warning: hexToRgb(gv('--warning', '#d4a04a')),
        success: hexToRgb(gv('--success', '#3a8a5a')),
        info: hexToRgb(gv('--info-blue', '#6bb8c9')),
        vaultLang: hexToRgb(gv('--vault-language', '#1a2a4a')),
        vaultLangAccent: hexToRgb(gv('--vault-language-accent', '#4a6a9a')),
        shadow: gv('--shadow-color', 'rgba(0,0,0,0.4)'),
        glowAlpha: parseFloat(gv('--glow-alpha', '0.15')) || 0.15
    };
    pal.rgb = (o, a) => (a === undefined)
        ? `rgb(${o.r},${o.g},${o.b})`
        : `rgba(${o.r},${o.g},${o.b},${a})`;
    CANVAS_PALETTE = pal;
}

function initCanvas() {
    sanctuaryCanvas = document.getElementById('sanctuary-canvas');
    if (!sanctuaryCanvas) {
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('[Canvas] 找不到圣所画布');
        return;
    }

    // 防止重复初始化导致多动画循环叠加
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    refreshCanvasPalette();
    if (window.matchMedia) {
        REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // 响应式自适应
    resizeCanvas();

    // 防止重复绑定 resize 监听器
    window.removeEventListener('resize', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);

    sanctuaryCtx = sanctuaryCanvas.getContext('2d');
    time = 0;
    particles = [];
    floatingSymbols = [];

    if (REDUCED_MOTION) {
        drawSanctuary(); // 静态渲染一帧，不进入动画循环
    } else {
        animate();
    }
    if (typeof DEBUG !== 'undefined' && DEBUG) console.log('[Canvas] 圣所主厅初始化完成');
}

function resizeCanvas() {
    if (!sanctuaryCanvas) return;
    const container = sanctuaryCanvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.min(rect.width, 600);
    const height = width * (2 / 3);

    // 防止容器隐藏时 width=0 导致 SANCTUARY_CONFIG 被污染（除零产生 NaN/Infinity）
    if (width < 1 || height < 1) return;

    const scaleX = width / SANCTUARY_CONFIG.width;
    const scaleY = height / SANCTUARY_CONFIG.height;

    sanctuaryCanvas.width = width;
    sanctuaryCanvas.height = height;

    const s = Math.min(scaleX, scaleY);
    SANCTUARY_CONFIG.width = width;
    SANCTUARY_CONFIG.height = height;

    SANCTUARY_CONFIG.window.x = width * 0.22;
    SANCTUARY_CONFIG.window.y = height * 0.10;
    SANCTUARY_CONFIG.window.w = width * 0.56;
    SANCTUARY_CONFIG.window.h = height * 0.42;

    SANCTUARY_CONFIG.floorY = height * 0.655;

    SANCTUARY_CONFIG.dais.cx = width / 2;
    SANCTUARY_CONFIG.dais.baseY = height * 0.84;
    SANCTUARY_CONFIG.dais.w = width * 0.32;
    SANCTUARY_CONFIG.dais.h = height * 0.185;

    SANCTUARY_CONFIG.console.centerX = width / 2;
    SANCTUARY_CONFIG.console.topY = height * 0.86;
    SANCTUARY_CONFIG.console.width = width * 0.80;
    SANCTUARY_CONFIG.console.height = height * 0.14;

    SANCTUARY_CONFIG.portholes.rowY = height * 0.96;
    SANCTUARY_CONFIG.portholes.radius = Math.max(4, width * 0.012);
    SANCTUARY_CONFIG.portholes.gap = Math.max(22, width * 0.05);
}

function animate() {
    time += 1;

    // 场景切换过渡
    const targetScene = MemorySanctuary.currentVaultId || 1;
    if (currentSceneId !== targetScene) {
        currentSceneId = targetScene;
        particles = [];
        floatingSymbols = [];
        sceneTransition = 0;

        // 场景切换音效
        if (typeof AudioSystem !== 'undefined') {
            const themeMap = {
                1: 'language', 2: 'history', 3: 'disaster',
                4: 'art', 5: 'philosophy', 6: 'science',
                7: 'ecology', 8: 'law', 9: 'daily',
                10: 'architecture', 11: 'medicine', 12: 'astronomy'
            };
            AudioSystem.playSceneSound(themeMap[targetScene] || 'language');
        }
    }

    // 动态添加记忆微光
    if (time % 10 === 0) addParticle();

    // 动态添加漂浮符号
    if (time % 55 === 0) addFloatingSymbol();

    // 归档灯光脉冲衰减
    if (sanctuaryFlash > 0) sanctuaryFlash *= 0.90;

    drawSanctuary();
    animationId = requestAnimationFrame(animate);
}

function addParticle() {
    if (particles.length >= 160) return; // 上限保护

    const config = SANCTUARY_CONFIG;
    const w = config.window;
    // 记忆微光：在观察窗内平静升起，像冷色尘雾在星空中漂浮
    particles.push({
        x: w.x + Math.random() * w.w,
        y: w.y + w.h * (0.2 + Math.random() * 0.7),
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.35 + 0.1),
        size: Math.random() * 1.4 + 0.4,
        alpha: Math.random() * 0.4 + 0.15,
        life: 0,
        maxLife: Math.random() * 140 + 90
    });
}

function addFloatingSymbol() {
    if (floatingSymbols.length >= 60) return;

    const config = SANCTUARY_CONFIG;
    const scene = getSceneTheme();
    const symbols = SYMBOL_LIBRARY[scene] || SYMBOL_LIBRARY.language;
    const w = config.window;

    floatingSymbols.push({
        x: w.x + Math.random() * w.w,
        y: w.y + w.h * (Math.random() * 0.6 + 0.1),
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        alpha: 0,
        maxAlpha: Math.random() * 0.22 + 0.1,
        phase: 0,
        speed: Math.random() * 0.012 + 0.006
    });
}

function getSceneTheme() {
    const vaultId = MemorySanctuary.currentVaultId || 1;
    const themeMap = {
        1: 'language', 2: 'history', 3: 'disaster',
        4: 'art', 5: 'philosophy', 6: 'science',
        7: 'ecology', 8: 'law', 9: 'daily',
        10: 'architecture', 11: 'medicine', 12: 'astronomy'
    };
    return themeMap[vaultId] || 'language';
}

function getSceneAccent() {
    // 当前存储室的主色/描边色（来自 data，已随主题着色）
    const vaults = (MemorySanctuary.data && MemorySanctuary.data.vaults) || [];
    const id = MemorySanctuary.currentVaultId || 1;
    const vault = vaults[id - 1] || vaults[0];
    if (vault && vault.color) {
        return { accent: hexToRgb(vault.color, CANVAS_PALETTE.amber), line: hexToRgb(vault.accentColor, CANVAS_PALETTE.amberGlow) };
    }
    return { accent: CANVAS_PALETTE.amber, line: CANVAS_PALETTE.amberGlow };
}

function drawSanctuary() {
    const ctx = sanctuaryCtx;
    if (!ctx || !CANVAS_PALETTE) return;

    const config = SANCTUARY_CONFIG;
    const scene = getSceneTheme();
    const accent = getSceneAccent();

    ctx.clearRect(0, 0, config.width, config.height);

    drawRoom(ctx, config);
    drawObservationWindow(ctx, config, scene, accent);
    drawLightShaft(ctx, config);
    drawSingerDais(ctx, config, accent);
    drawConsoleDeck(ctx, config);
    drawVaultPortholes(ctx, config);
    drawMemoryMotes(ctx, config);
    drawDecayOverlay(ctx, config, scene, accent);
    drawArchiveFlash(ctx, config);
}

/**
 * 归档成功灯光脉冲（C6，2026-09-06）：
 * sanctuaryFlash ∈ (0,1] 时叠加柔和暖光：全屏微光 + 共鸣芯径向光晕。
 * 与共鸣芯（pal.amber）同色调，视觉上像是圣所对"保存"的一次回应。
 */
function drawArchiveFlash(ctx, config) {
    if (sanctuaryFlash <= 0) return;
    const pal = CANVAS_PALETTE;
    const w = config.width, h = config.height;
    const a = sanctuaryFlash;

    // 全屏暖光微闪
    ctx.fillStyle = pal.rgb(pal.amber, a * 0.08);
    ctx.fillRect(0, 0, w, h);

    // 共鸣芯径向光晕（歌者之座上方）
    const dais = config.dais;
    const gx = dais.cx, gy = dais.baseY - 30;
    const grad = ctx.createRadialGradient(gx, gy, 5, gx, gy, 140);
    grad.addColorStop(0, pal.rgb(pal.amberGlow, a * 0.30));
    grad.addColorStop(0.5, pal.rgb(pal.amber, a * 0.12));
    grad.addColorStop(1, pal.rgb(pal.amber, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

function drawRoom(ctx, config) {
    const pal = CANVAS_PALETTE;
    const w = config.width, h = config.height;
    const floorY = config.floorY;

    // 室内背景：上墙（深）→ 地面（微亮，承接来自观察窗与高台的光）
    const wallGrad = ctx.createLinearGradient(0, 0, 0, floorY);
    wallGrad.addColorStop(0, pal.rgb(pal.bgDeep));
    wallGrad.addColorStop(1, pal.rgb(pal.bgPanel));
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, floorY);

    const floorGrad = ctx.createLinearGradient(0, floorY, 0, h);
    floorGrad.addColorStop(0, pal.rgb(pal.bgPanel));
    floorGrad.addColorStop(1, pal.rgb(pal.bgDeep));
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorY, w, h - floorY);

    // 地面透视引导线：两侧向中心收拢，交代空间纵深
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
        const y = floorY + ((h - floorY) * i * i) / 25;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();

    // 穹顶肋线：数道抛物线拱，赋予"厅"的建筑感
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1.2;
    const ribs = 5;
    for (let i = 0; i <= ribs; i++) {
        const x = (w * i) / ribs;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(w / 2 + (x - w / 2) * 0.18, h * 0.16, w / 2 + (x - w / 2) * 0.05, h * 0.085);
        ctx.stroke();
    }
    ctx.restore();

    // 两侧立柱：纵向亮边 + 暗面，构成画框
    const colW = w * 0.045;
    const drawColumn = (x) => {
        const grad = ctx.createLinearGradient(x, 0, x + colW, 0);
        grad.addColorStop(0, pal.rgb(pal.bgDeep));
        grad.addColorStop(0.5, pal.rgb(pal.bgPanel));
        grad.addColorStop(1, pal.rgb(pal.bgDeep));
        ctx.fillStyle = grad;
        ctx.fillRect(x, h * 0.04, colW, floorY - h * 0.04 + 4);
        ctx.strokeStyle = pal.rgb(pal.border);
        ctx.lineWidth = 1;
        ctx.strokeRect(x, h * 0.04, colW, floorY - h * 0.04 + 4);
        // 柱头嵌灯（暖色小点，冷厅里唯一的暖色预埋）
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 0.02 + x);
        ctx.fillStyle = pal.rgb(pal.amber);
        ctx.beginPath();
        ctx.arc(x + colW / 2, h * 0.09, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };
    drawColumn(w * 0.055);
    drawColumn(w - w * 0.055 - colW);
}

function drawObservationWindow(ctx, config, scene, accent) {
    const pal = CANVAS_PALETTE;
    const w = config.window;

    // 窗外：深空 + 银河带 + 远方行星 + 双层星（随存储室主色轻染）
    ctx.save();
    ctx.beginPath();
    ctx.rect(w.x, w.y, w.w, w.h);
    ctx.clip();

    // 深空底
    const spaceGrad = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
    spaceGrad.addColorStop(0, pal.rgb(pal.bgDeep));
    spaceGrad.addColorStop(1, pal.rgb(pal.vaultLang));
    ctx.fillStyle = spaceGrad;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    // 银河带：斜向柔光带 + 沿带密集星尘（天文馆的"纵深"来源）
    ctx.save();
    ctx.translate(w.x + w.w / 2, w.y + w.h / 2);
    ctx.rotate(-0.35);
    const bandW = w.w * 1.3, bandH = w.h * 0.42;
    const band = ctx.createLinearGradient(0, -bandH / 2, 0, bandH / 2);
    band.addColorStop(0, 'transparent');
    band.addColorStop(0.35, pal.rgb(pal.vaultLangAccent, 0.10));
    band.addColorStop(0.5, pal.rgb(pal.info, 0.16));
    band.addColorStop(0.65, pal.rgb(pal.vaultLangAccent, 0.10));
    band.addColorStop(1, 'transparent');
    ctx.fillStyle = band;
    ctx.fillRect(-bandW / 2, -bandH / 2, bandW, bandH);
    // 银河星尘：确定性散布（index 种子，非随机数）
    ctx.fillStyle = pal.rgb(pal.info, 0.5);
    for (let i = 0; i < 60; i++) {
        const dx = (((i * 137.5) % 100) / 100 - 0.5) * bandW;
        const dy = ((((i * 61.8) % 100) / 100) - 0.5) * bandH * (0.4 + 0.6 * Math.abs(Math.sin(i * 3.3)));
        const tw = 0.3 + 0.3 * Math.sin(time * 0.025 + i * 2.1);
        ctx.globalAlpha = tw * 0.55;
        ctx.beginPath();
        ctx.arc(dx, dy, (i % 7 === 0) ? 1.1 : 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 远方行星：右上角，带晨昏线与微弱大气晕
    const px = w.x + w.w * 0.78, py = w.y + w.h * 0.26, pr = w.w * 0.085;
    const atmo = ctx.createRadialGradient(px, py, pr * 0.6, px, py, pr * 1.9);
    atmo.addColorStop(0, pal.rgb(accent.line, 0.10));
    atmo.addColorStop(1, 'transparent');
    ctx.fillStyle = atmo;
    ctx.fillRect(px - pr * 2, py - pr * 2, pr * 4, pr * 4);
    const body = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.35, pr * 0.15, px, py, pr);
    body.addColorStop(0, pal.rgb(accent.accent, 0.85));
    body.addColorStop(0.7, pal.rgb(pal.vaultLangAccent, 0.55));
    body.addColorStop(1, pal.rgb(pal.bgDeep, 0.9));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    // 晨昏线（暗面遮挡，形成月牙感）
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = pal.rgb(pal.bgDeep, 0.55);
    ctx.beginPath();
    ctx.arc(px + pr * 0.55, py + pr * 0.3, pr * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 前景星：缓慢上升漂移 + 闪烁（两层视差）
    for (let i = 0; i < 46; i++) {
        const layer = i % 2;
        const sx = w.x + ((i * 73) % 100) / 100 * w.w;
        const speed = layer === 0 ? 0.08 : 0.05;
        const drift = (time * speed + i * 11) % w.h;
        const sy = w.y + w.h - drift * (0.4 + (i % 3) * 0.2);
        const tw = 0.35 + 0.35 * Math.sin(time * 0.03 + i * 1.7);
        ctx.globalAlpha = tw * (layer === 0 ? 0.75 : 0.5);
        ctx.fillStyle = pal.rgb(layer === 0 ? pal.info : pal.textDim);
        const r = (i % 5 === 0) ? 1.5 : 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 流星：每约 15 秒一枚，确定性轨迹（时刻表式，非随机）
    const meteorPeriod = 900;
    const meteorT = time % meteorPeriod;
    if (meteorT < 46) {
        const prog = meteorT / 46;
        const mx = w.x + w.w * (0.15 + prog * 0.55);
        const my = w.y + w.h * (0.10 + prog * 0.38);
        const tail = 26 * (1 - prog * 0.5);
        const mg = ctx.createLinearGradient(mx - tail, my + tail * 0.6, mx, my);
        mg.addColorStop(0, 'transparent');
        mg.addColorStop(1, pal.rgb(pal.info, 0.8 * (1 - prog * 0.6)));
        ctx.strokeStyle = mg;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(mx - tail, my + tail * 0.6);
        ctx.lineTo(mx, my);
        ctx.stroke();
    }

    // 少量柔和冷光辉点（记忆微光，非暖色）
    ctx.fillStyle = pal.rgb(pal.vaultLangAccent, 0.6);
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + time * 0.002;
        const r = w.w * (0.12 + (i % 4) * 0.08);
        const x = w.x + w.w / 2 + Math.cos(a) * r;
        const y = w.y + w.h / 2 + Math.sin(a) * r * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 窗框：冷色细边框 + 轻微冷光，明确"这是一扇观察窗"
    ctx.save();
    ctx.strokeStyle = pal.rgb(pal.vaultLangAccent);
    ctx.lineWidth = w.strokeWidth;
    ctx.shadowColor = pal.rgb(pal.info, 0.35);
    ctx.shadowBlur = 8;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
    ctx.restore();

    // 建筑化格栅（极淡，去"虚空/邪教"联想）
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    for (let gx = 1; gx <= 3; gx++) {
        const x = w.x + (w.w * gx) / 4;
        ctx.beginPath();
        ctx.moveTo(x, w.y);
        ctx.lineTo(x, w.y + w.h);
        ctx.stroke();
    }
    for (let gy = 1; gy <= 2; gy++) {
        const y = w.y + (w.h * gy) / 3;
        ctx.beginPath();
        ctx.moveTo(w.x, y);
        ctx.lineTo(w.x + w.w, y);
        ctx.stroke();
    }
    ctx.restore();

    // 窗下角标（明确语义，消解恐怖误读）—— 冷色文字 + 极少量琥珀仪器点
    if (MemorySanctuary.state) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = pal.rgb(pal.textDim);
        ctx.font = '12px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const week = MemorySanctuary.state.week || 1;
        const archived = (MemorySanctuary.state.completedArchives || []).length;
        ctx.fillText(`观察窗 · 第 ${week} 周 · 已保存 ${archived} 段记忆`, w.x + 2, w.y + w.h + 8);
        ctx.restore();
    }

    // 右上极小琥珀仪器指示点（仅作极少量仪器点缀，非装饰光池）
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 0.04);
    ctx.fillStyle = pal.rgb(pal.amber);
    ctx.beginPath();
    ctx.arc(w.x + w.w - 6, w.y + 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// 天窗 → 歌者之座的光井：把视线从窗口引向中央高台（构图主轴）
function drawLightShaft(ctx, config) {
    const pal = CANVAS_PALETTE;
    const d = config.dais;
    const breathe = 0.05 + 0.02 * Math.sin(time * 0.02);

    ctx.save();
    const shaft = ctx.createLinearGradient(0, config.window.y + config.window.h, 0, d.baseY);
    shaft.addColorStop(0, pal.rgb(pal.info, 0.10 + breathe));
    shaft.addColorStop(0.6, pal.rgb(pal.info, 0.05));
    shaft.addColorStop(1, pal.rgb(pal.amber, 0.06 + breathe));
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(config.width / 2 - config.window.w * 0.14, config.window.y + config.window.h);
    ctx.lineTo(config.width / 2 + config.window.w * 0.14, config.window.y + config.window.h);
    ctx.lineTo(d.cx + d.w * 0.30, d.baseY - d.h * 0.5);
    ctx.lineTo(d.cx - d.w * 0.30, d.baseY - d.h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// 中央歌者之座：三层高台 + 纤细座碑 + 呼吸的琥珀共鸣芯 + 向存储室扩散的声波涟漪
// （呼应游戏设定"中央的歌者之座将声波传递至各个存储室"——主厅终于有了与文案一致的视觉主体）
function drawSingerDais(ctx, config, accent) {
    const pal = CANVAS_PALETTE;
    const d = config.dais;
    const stepW = d.w, stepH = d.h / 5;

    // 高台三层（下宽上窄的椭圆台阶，带顶面微光）
    for (let i = 0; i < 3; i++) {
        const sw = stepW * (1 - i * 0.18);
        const sy = d.baseY - i * stepH;
        // 台阶立面
        ctx.fillStyle = pal.rgb(pal.bgDeep, 0.9);
        ctx.beginPath();
        ctx.ellipse(d.cx, sy, sw / 2, stepH * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = pal.rgb(pal.border);
        ctx.lineWidth = 1;
        ctx.stroke();
        // 台阶顶面（受光）
        ctx.fillStyle = pal.rgb(pal.bgPanel, 0.95);
        ctx.beginPath();
        ctx.ellipse(d.cx, sy - stepH * 0.35, sw / 2 * 0.96, stepH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const seatBaseY = d.baseY - stepH * 2;

    // 地面柔光反射（琥珀芯的倒影）
    const reflect = ctx.createRadialGradient(d.cx, d.baseY + stepH * 0.8, 0, d.cx, d.baseY + stepH * 0.8, d.w * 0.55);
    reflect.addColorStop(0, pal.rgb(pal.amber, 0.10));
    reflect.addColorStop(1, 'transparent');
    ctx.fillStyle = reflect;
    ctx.fillRect(d.cx - d.w * 0.6, d.baseY, d.w * 1.2, stepH * 2.2);

    // 座碑：细长的碑体，顶部为共鸣芯
    const monumentH = d.h * 0.62;
    const monumentW = d.w * 0.055;
    const grad = ctx.createLinearGradient(d.cx - monumentW, 0, d.cx + monumentW, 0);
    grad.addColorStop(0, pal.rgb(pal.bgDeep));
    grad.addColorStop(0.5, pal.rgb(pal.bgPanel));
    grad.addColorStop(1, pal.rgb(pal.bgDeep));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(d.cx - monumentW, seatBaseY);
    ctx.lineTo(d.cx - monumentW * 0.55, seatBaseY - monumentH);
    ctx.lineTo(d.cx + monumentW * 0.55, seatBaseY - monumentH);
    ctx.lineTo(d.cx + monumentW, seatBaseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    ctx.stroke();

    // 共鸣芯：呼吸的暖光（整幅冷色画面里唯一的暖色焦点 = 圣所"心脏"）
    const coreY = seatBaseY - monumentH - 2;
    const pulse = 0.55 + 0.3 * Math.sin(time * 0.045);
    const halo = ctx.createRadialGradient(d.cx, coreY, 0, d.cx, coreY, monumentW * 5);
    halo.addColorStop(0, pal.rgb(pal.amberGlow, 0.5 * pulse));
    halo.addColorStop(0.4, pal.rgb(pal.amber, 0.18 * pulse));
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(d.cx - monumentW * 5, coreY - monumentW * 5, monumentW * 10, monumentW * 10);
    ctx.fillStyle = pal.rgb(pal.amberGlow, 0.9);
    ctx.beginPath();
    ctx.arc(d.cx, coreY, monumentW * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // 声波涟漪：自共鸣芯周期性扩散的圆环（传向下方一排存储室舷窗）
    const ringPeriod = 220;
    for (let k = 0; k < 3; k++) {
        const t = ((time + k * ringPeriod / 3) % ringPeriod) / ringPeriod;
        const rr = monumentW + t * d.w * 1.15;
        const alpha = 0.28 * (1 - t) * pulse;
        ctx.strokeStyle = pal.rgb(pal.amber, alpha);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(d.cx, coreY + monumentH * 0.25, rr, rr * 0.36, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawConsoleDeck(ctx, config) {
    const pal = CANVAS_PALETTE;
    const c = config.console;
    const left = c.centerX - c.width / 2;
    const top = c.topY;
    const right = c.centerX + c.width / 2;
    const bottom = top + c.height;

    // 前景桌台：深色低剪影（观者视角的近景，框住画面下缘）
    ctx.save();
    ctx.fillStyle = pal.rgb(pal.bgDeep, 0.85);
    ctx.beginPath();
    ctx.moveTo(left, top + 6);
    ctx.lineTo(right, top + 6);
    ctx.lineTo(right - 12, bottom);
    ctx.lineTo(left + 12, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 台缘细青色仪器线 + 在线工位冷光点
    ctx.save();
    ctx.strokeStyle = pal.rgb(pal.info, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + 18, top + 4);
    ctx.lineTo(right - 18, top + 4);
    ctx.stroke();

    const stations = 7;
    for (let i = 0; i < stations; i++) {
        const x = left + 24 + (i + 0.5) * (c.width - 48) / stations;
        const lit = (i + Math.floor(time * 0.002)) % 3 !== 0;
        const a = lit ? (0.45 + 0.25 * Math.sin(time * 0.02 + i)) : 0.12;
        ctx.fillStyle = pal.rgb(pal.info, a);
        ctx.beginPath();
        ctx.arc(x, top + 11, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 极少量琥珀仪器点缀（仅指示灯，禁用暖色光池）
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(time * 0.05);
    ctx.fillStyle = pal.rgb(pal.amber);
    ctx.beginPath();
    ctx.arc(right - 22, top + 11, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawVaultPortholes(ctx, config) {
    const pal = CANVAS_PALETTE;
    const p = config.portholes;
    const vaults = (MemorySanctuary.data && MemorySanctuary.data.vaults) || [];
    if (!vaults.length) return;

    const count = vaults.length;
    const totalW = (count - 1) * p.gap;
    const startX = config.width / 2 - totalW / 2;
    const y = p.rowY;
    const currentId = MemorySanctuary.currentVaultId || 1;
    const doorW = p.radius * 1.7;
    const doorH = p.radius * 2.1;

    vaults.forEach((vault, index) => {
        const x = startX + index * p.gap;
        const isCurrent = (index + 1) === currentId;

        // 拱顶小门：存储室入口剪影（比圆形舷窗更有"建筑"语义）
        ctx.beginPath();
        ctx.moveTo(x - doorW / 2, y + doorH / 2);
        ctx.lineTo(x - doorW / 2, y - doorH / 4);
        ctx.arc(x, y - doorH / 4, doorW / 2, Math.PI, 0);
        ctx.lineTo(x + doorW / 2, y + doorH / 2);
        ctx.closePath();
        ctx.fillStyle = pal.rgb(pal.bgDeep, 0.9);
        ctx.fill();
        ctx.strokeStyle = isCurrent
            ? pal.rgb(pal.info, 0.9)
            : pal.rgb(hexToRgb(vault.accentColor, pal.vaultLangAccent), 0.5);
        ctx.lineWidth = isCurrent ? 1.6 : 1;
        ctx.stroke();

        // 门芯冷光（当前存储室更亮且呼吸，表示"正打开"）
        const coreA = isCurrent ? (0.55 + 0.3 * Math.sin(time * 0.04)) : 0.35;
        ctx.beginPath();
        ctx.arc(x, y, p.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = pal.rgb(hexToRgb(vault.color, pal.info), coreA);
        ctx.fill();
    });
}

function drawMemoryMotes(ctx, config) {
    const pal = CANVAS_PALETTE;

    // 记忆微光
    for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;

        const lifeRatio = pt.life / pt.maxLife;
        const currentAlpha = pt.alpha * (1 - lifeRatio);

        ctx.fillStyle = pal.rgb(pal.info, currentAlpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();

        if (pt.life >= pt.maxLife || pt.y < config.window.y - 10 ||
            pt.x < -20 || pt.x > config.width + 20) {
            particles.splice(i, 1);
        }
    }

    // 漂浮符号（温和的记忆字符，低透明度，冷色）
    for (let i = floatingSymbols.length - 1; i >= 0; i--) {
        const s = floatingSymbols[i];
        s.phase += s.speed;
        const targetAlpha = s.maxAlpha * (0.5 + 0.5 * Math.sin(s.phase));
        s.alpha += (targetAlpha - s.alpha) * 0.02;

        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = pal.rgb(pal.info);
        ctx.font = '12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.symbol, s.x, s.y + Math.sin(s.phase * 2) * 3);

        if (s.phase > Math.PI * 8) {
            floatingSymbols.splice(i, 1);
        }
    }
    ctx.globalAlpha = 1;
}

// ==========================================
// 衰败视觉层（去血红 → 琥珀/去饱和告警，并给出文字说明）
// ==========================================
function drawDecayOverlay(ctx, config, scene, accent) {
    if (!MemorySanctuary.state) return;
    const pal = CANVAS_PALETTE;
    const res = MemorySanctuary.state.resources || {};
    const energy = res.energy != null ? res.energy : 100;
    const media = res.media != null ? res.media : 60;
    const environment = res.environment != null ? res.environment : 95;
    const w = config.width, h = config.height;

    const alerts = [];

    // 能源不足：琥珀色呼吸（非血红）
    if (energy <= 0) {
        const pulse = 0.08 + 0.05 * Math.sin(time * 0.1);
        ctx.fillStyle = pal.rgb(pal.warning, pulse);
        ctx.fillRect(0, 0, w, h);
        alerts.push('能源枯竭');
    } else if (energy < 30) {
        const flicker = Math.sin(time * 0.15) > 0.7 ? 0.06 : 0.02;
        ctx.fillStyle = pal.rgb(pal.warning, flicker);
        ctx.fillRect(0, 0, w, h);
    }

    // 介质不足：中性扫描点
    if (media <= 0) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        for (let i = 0; i < 24; i++) {
            const x = (Math.sin(time * 0.05 + i * 1.3) * 0.5 + 0.5) * w;
            const y = (Math.cos(time * 0.04 + i * 1.7) * 0.5 + 0.5) * h;
            ctx.fillStyle = pal.rgb(pal.textDim);
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        alerts.push('介质中断');
    } else if (media < 20) {
        ctx.save();
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 8; i++) {
            const x = (Math.sin(time * 0.03 + i * 2.1) * 0.5 + 0.5) * w;
            const y = (Math.cos(time * 0.02 + i * 2.3) * 0.5 + 0.5) * h;
            ctx.fillStyle = pal.rgb(pal.textDim);
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // 环境不足：去饱和琥珀暗角（非血色）
    if (environment <= 0) {
        const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.55);
        v.addColorStop(0, 'transparent');
        v.addColorStop(1, pal.rgb(pal.amberDim, 0.5));
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
        alerts.push('环境崩坏');
    } else if (environment < 30) {
        const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.6);
        v.addColorStop(0, 'transparent');
        v.addColorStop(1, pal.rgb(pal.amberDim, 0.25));
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
    }

    // 三资源全危：轻微琥珀震颤
    if (energy < 20 && media < 15 && environment < 20) {
        const shake = Math.sin(time * 0.3) * 0.03;
        ctx.fillStyle = pal.rgb(pal.warning, 0.05 + shake);
        ctx.fillRect(0, 0, w, h);
        alerts.push('圣所告急');
    }

    // 终局倒计时：第32周起边缘泛琥珀（时间压迫，非血色）
    if (MemorySanctuary.state.week >= 32) {
        const intensity = Math.min(0.28, (MemorySanctuary.state.week - 31) * 0.035);
        const weekPulse = intensity * (0.8 + 0.2 * Math.sin(time * 0.05));
        ctx.fillStyle = pal.rgb(pal.warning, weekPulse);
        ctx.fillRect(0, 0, w, h);
        if (MemorySanctuary.state.week >= 40) alerts.push('终期临近');
    }

    // 应急腐败度暗角（C6，2026-09-06）：应急协议抬高腐败度 → 顶部缓缓压下的暗影
    const corruption = MemorySanctuary.state.emergencyCorruption || 0;
    if (corruption >= 50) {
        const corrIntensity = Math.min(0.35, (corruption - 49) * 0.012);
        const breathe2 = corrIntensity * (0.75 + 0.25 * Math.sin(time * 0.03));
        const v = ctx.createLinearGradient(0, 0, 0, h);
        v.addColorStop(0, pal.rgb(pal.amberDim, breathe2));
        v.addColorStop(0.45, 'transparent');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
        if (corruption >= 75) alerts.push('腐败侵蚀');
    }

    // 章节过渡 surge（琥珀色）
    if (chapterTransitionEffect.active) {
        const elapsed = Date.now() - chapterTransitionEffect.startTime;
        const progress = Math.min(1, elapsed / chapterTransitionEffect.duration);
        let surge;
        if (progress < 0.3) surge = progress / 0.3;
        else if (progress < 0.7) surge = 1;
        else surge = 1 - (progress - 0.7) / 0.3;
        const s = surge * 0.22;
        ctx.fillStyle = pal.rgb(pal.warning, s);
        ctx.fillRect(0, 0, w, h);
        if (progress >= 1) chapterTransitionEffect.active = false;
    }

    // 文字告警：把"看不懂的红色"变成明确的资源提示
    if (alerts.length && (time % 90 < 60)) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = pal.rgb(pal.warning);
        ctx.font = 'bold 13px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('⚠ ' + alerts.join(' · '), 12, 12);
        ctx.restore();
    }
}

// 主题切换时刷新调色板并重绘（被 main.js 的主题切换回调调用）
function refreshCanvasTheme() {
    if (!sanctuaryCtx && !sanctuaryCanvas) return;
    refreshCanvasPalette();
    if (window.matchMedia) {
        REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    if (REDUCED_MOTION && sanctuaryCtx) {
        drawSanctuary();
    }
}

// 触发章节过渡效果
function triggerChapterTransitionEffect() {
    chapterTransitionEffect.active = true;
    chapterTransitionEffect.startTime = Date.now();
}
