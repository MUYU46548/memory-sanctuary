/**
 * canvas.js - Canvas 渲染
 * 圣所主厅（idle）：天文馆冷峻风 / 科幻地下工作室
 * 建筑化观察窗（矩形，平静星空 + 微弱冷色星云）+ 克制控制台剪影 + 下缘冷光存储室舷窗
 *
 * 颜色全部从 CSS 变量读取（getComputedStyle），主/浅双主题自动适配，
 * 不再在 JS 内写死 #hex，符合架构红线。无中央发光球、无全视之眼弧、无红色。
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

    // 观察窗（建筑化视窗，矩形，望向平静星空 / 微弱冷色星云）
    window: {
        x: 110,
        y: 46,
        w: 380,
        h: 232,
        strokeWidth: 2
    },

    // 控制台/桌台剪影（冷色几何块 + 青色仪器线 + 少量冷光工位）
    console: {
        centerX: 300,
        topY: 300,
        width: 460,
        height: 92,
        strokeWidth: 2
    },

    // 存储室冷光舷窗（下缘一排小型冷光门，随 currentVaultId 切换高亮）
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

    SANCTUARY_CONFIG.window.x = width * 0.18;
    SANCTUARY_CONFIG.window.y = height * 0.115;
    SANCTUARY_CONFIG.window.w = width * 0.64;
    SANCTUARY_CONFIG.window.h = height * 0.58;

    SANCTUARY_CONFIG.console.centerX = width / 2;
    SANCTUARY_CONFIG.console.topY = height * 0.75;
    SANCTUARY_CONFIG.console.width = width * 0.78;
    SANCTUARY_CONFIG.console.height = height * 0.23;

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
    drawConsoleDeck(ctx, config);
    drawVaultPortholes(ctx, config);
    drawMemoryMotes(ctx, config);
    drawDecayOverlay(ctx, config, scene, accent);
}

function drawRoom(ctx, config) {
    const pal = CANVAS_PALETTE;

    // 室内背景：深蓝灰纵向纵深，冷峻地下科研工作室气质
    const grad = ctx.createLinearGradient(0, 0, 0, config.height);
    grad.addColorStop(0, pal.rgb(pal.bgPanel));
    grad.addColorStop(1, pal.rgb(pal.bgDeep));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, config.width, config.height);

    // 墙面分隔线（极淡冷色，提供建筑感锚定，不喧宾夺主）
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, config.window.y - 10);
    ctx.lineTo(config.width, config.window.y - 10);
    ctx.stroke();
    ctx.restore();
}

function drawObservationWindow(ctx, config, scene, accent) {
    const pal = CANVAS_PALETTE;
    const w = config.window;

    // 窗外：平静星空 + 微弱冷色星云（深蓝/青/紫，低饱和），绝非发光之眼
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

    // 微弱冷色星云（低饱和径向晕染，随存储室主色轻染）
    const neb = ctx.createRadialGradient(
        w.x + w.w * 0.38, w.y + w.h * 0.42, 0,
        w.x + w.w * 0.38, w.y + w.h * 0.42, w.w * 0.55
    );
    neb.addColorStop(0, pal.rgb(accent.line, 0.18));
    neb.addColorStop(0.5, pal.rgb(accent.accent, 0.08));
    neb.addColorStop(1, 'transparent');
    ctx.fillStyle = neb;
    ctx.fillRect(w.x, w.y, w.w, w.h);

    // 平静星点（轻微闪烁，缓慢上升漂移，像天文馆穹顶）
    ctx.fillStyle = pal.rgb(pal.info);
    for (let i = 0; i < 46; i++) {
        const sx = w.x + ((i * 73) % 100) / 100 * w.w;
        const drift = (time * 0.08 + i * 11) % w.h;
        const sy = w.y + w.h - drift * (0.4 + (i % 3) * 0.2);
        const tw = 0.35 + 0.35 * Math.sin(time * 0.03 + i * 1.7);
        ctx.globalAlpha = tw * 0.7;
        const r = (i % 5 === 0) ? 1.5 : 0.9;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

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

function drawConsoleDeck(ctx, config) {
    const pal = CANVAS_PALETTE;
    const c = config.console;
    const left = c.centerX - c.width / 2;
    const top = c.topY;
    const right = c.centerX + c.width / 2;
    const bottom = top + c.height;

    // 桌台剪影：深色几何块（地下工作室的克制控制台）
    ctx.save();
    ctx.fillStyle = pal.rgb(pal.bgDeep, 0.7);
    ctx.beginPath();
    ctx.moveTo(left, top + 8);
    ctx.lineTo(right, top + 8);
    ctx.lineTo(right - 14, bottom);
    ctx.lineTo(left + 14, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.rgb(pal.border);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 台面细青色仪器线（在线工位指示，非装饰光池）
    ctx.save();
    ctx.strokeStyle = pal.rgb(pal.info, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + 18, top + 6);
    ctx.lineTo(right - 18, top + 6);
    ctx.stroke();

    // 少量柔和冷光工位点（表示在线终端）
    const stations = 7;
    for (let i = 0; i < stations; i++) {
        const x = left + 24 + (i + 0.5) * (c.width - 48) / stations;
        const lit = (i + Math.floor(time * 0.002)) % 3 !== 0;
        const a = lit ? (0.45 + 0.25 * Math.sin(time * 0.02 + i)) : 0.12;
        ctx.fillStyle = pal.rgb(pal.info, a);
        ctx.beginPath();
        ctx.arc(x, top + 14, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 极少量琥珀仪器点缀（仅指示灯，禁用暖色光池）
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.2 * Math.sin(time * 0.05);
    ctx.fillStyle = pal.rgb(pal.amber);
    ctx.beginPath();
    ctx.arc(right - 22, top + 14, 1.8, 0, Math.PI * 2);
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

    vaults.forEach((vault, index) => {
        const x = startX + index * p.gap;
        const isCurrent = (index + 1) === currentId;

        // 冷光舷窗：深色门 + 冷色边框 + 在线冷光（非环绕黑洞）
        ctx.beginPath();
        ctx.arc(x, y, p.radius + 2.5, 0, Math.PI * 2);
        ctx.fillStyle = pal.rgb(pal.bgDeep, 0.8);
        ctx.fill();
        ctx.strokeStyle = isCurrent
            ? pal.rgb(pal.info, 0.9)
            : pal.rgb(hexToRgb(vault.accentColor, pal.vaultLangAccent), 0.55);
        ctx.lineWidth = isCurrent ? 2 : 1;
        ctx.stroke();

        // 冷光门芯（当前存储室更亮，表示"正打开"）
        const coreA = isCurrent ? (0.6 + 0.3 * Math.sin(time * 0.04)) : 0.4;
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
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
