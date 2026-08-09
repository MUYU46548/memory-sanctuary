/**
 * canvas.js - Canvas渲染
 * 圣所主厅：圆形穹顶、歌者之座、声波可视化、多闸门
 */

let sanctuaryCanvas = null;
let sanctuaryCtx = null;
let animationId = null;
let time = 0;

// 场景粒子系统
let particles = [];
let floatingSymbols = [];
let crackLines = [];
let sceneTransition = 0;
let currentSceneId = 1;

// 章节过渡效果状态
let chapterTransitionEffect = {
    active: false,
    startTime: 0,
    duration: 3000,
    intensity: 0
};

const SANCTUARY_CONFIG = {
    width: 600,
    height: 400,
    
    dome: {
        centerX: 300,
        centerY: 200,
        radius: 170,
        strokeWidth: 2
    },
    
    singerSeat: {
        centerX: 300,
        centerY: 280,
        radius: 35,
        glowRadius: 55,
        strokeWidth: 2
    },
    
    soundWaves: {
        lineWidth: 1,
        waveCount: 5,
        maxRadius: 140,
        speed: 0.02
    },
    
    vaultDoors: {
        radius: 11,
        orbitRadius: 145
    }
};

// 符号字符库
const SYMBOL_LIBRARY = {
    language: ['◇', '◈', '◊', '⬡', '⬢', '✦', '✧', '⊕', '⊗', '⌬'],
    history: ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', '◐', '◑', '◒', '◓', '◔'],
    disaster: ['✦', '✧', '⋆', '﹡', '※', '⁕', '⁜', '⁂', '☄', '✴'],
    art: ['♪', '♫', '♬', '♭', '♮', '♯', '△', '▽', '○', '●'],
    philosophy: ['∞', '☯', '☮', '♾', '⚖', '⚙', '⚠', '⚡', '✡', '☸'],
    science: ['⚛', '⚙', '⚡', '✦', '⊕', '⊗', '⌬', '⬡', '⬢', '◇'],
    ecology: ['❀', '✿', '❁', '❃', '❋', '✤', '✥', '❉', '❊', '✽'],
    law: ['⚖', '⚙', '⚠', '§', '¶', '†', '‡', '•', '‥', '…'],
    daily: ['☀', '☁', '☂', '☃', '★', '☆', '☽', '☾', '✩', '✪'],
    architecture: ['⌂', '⌐', '⌑', '⌒', '⌓', '⌔', '⌕', '⌖', '⌗', '⌘'],
    medicine: ['✚', '✛', '✜', '✝', '✞', '✟', '✠', '✡', '☤', '⚕'],
    astronomy: ['★', '☆', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '✰']
};

function initCanvas() {
    sanctuaryCanvas = document.getElementById('sanctuary-canvas');
    if (!sanctuaryCanvas) {
        console.error('[Canvas] 找不到圣所画布');
        return;
    }
    
    sanctuaryCtx = sanctuaryCanvas.getContext('2d');
    animate();
    console.log('[Canvas] 圣所主厅初始化完成');
}

function animate() {
    time += 1;
    
    // 场景切换过渡
    const targetScene = MemorySanctuary.currentVaultId || 1;
    if (currentSceneId !== targetScene) {
        sceneTransition = 0;
        currentSceneId = targetScene;
        particles = [];
        floatingSymbols = [];
        crackLines = [];
        
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
    
    // 动态添加粒子
    if (time % 8 === 0) {
        addParticle();
    }
    
    // 动态添加漂浮符号
    if (time % 45 === 0) {
        addFloatingSymbol();
    }
    
    drawSanctuary();
    animationId = requestAnimationFrame(animate);
}

function addParticle() {
    const scene = getSceneTheme();
    const config = SANCTUARY_CONFIG;
    
    // 灾难粒子 - 从上往下
    if (scene === 'disaster') {
        particles.push({
            x: Math.random() * config.width,
            y: -10,
            vx: (Math.random() - 0.5) * 0.5,
            vy: Math.random() * 1.5 + 0.5,
            size: Math.random() * 3 + 1,
            alpha: Math.random() * 0.6 + 0.2,
            life: 0,
            maxLife: Math.random() * 100 + 100
        });
    } else if (scene === 'history') {
        // 尘埃粒子 - 缓慢漂浮上升
        particles.push({
            x: Math.random() * config.width,
            y: config.height + 10,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -(Math.random() * 0.5 + 0.2),
            size: Math.random() * 2 + 1,
            alpha: Math.random() * 0.4 + 0.1,
            life: 0,
            maxLife: Math.random() * 150 + 100
        });
    } else if (scene === 'astronomy') {
        // 星星粒子 - 闪烁
        particles.push({
            x: Math.random() * config.width,
            y: Math.random() * config.height,
            vx: 0,
            vy: 0,
            size: Math.random() * 2 + 0.5,
            alpha: Math.random() * 0.8 + 0.2,
            life: 0,
            maxLife: Math.random() * 60 + 30
        });
    } else if (scene === 'ecology') {
        // 种子粒子 - 飘落
        particles.push({
            x: Math.random() * config.width,
            y: -10,
            vx: (Math.random() - 0.5) * 0.8,
            vy: Math.random() * 0.5 + 0.2,
            size: Math.random() * 3 + 1,
            alpha: Math.random() * 0.5 + 0.2,
            life: 0,
            maxLife: Math.random() * 120 + 80
        });
    } else {
        // 默认粒子 - 上升
        particles.push({
            x: config.dome.centerX + (Math.random() - 0.5) * config.dome.radius * 1.5,
            y: config.dome.centerY + config.dome.radius * 0.8,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -(Math.random() * 1.0 + 0.3),
            size: Math.random() * 4 + 2,
            alpha: Math.random() * 0.5 + 0.2,
            life: 0,
            maxLife: Math.random() * 80 + 60
        });
    }
}

function addFloatingSymbol() {
    const scene = getSceneTheme();
    const config = SANCTUARY_CONFIG;
    const symbols = SYMBOL_LIBRARY[scene] || SYMBOL_LIBRARY.language;
    
    floatingSymbols.push({
        x: Math.random() * config.width,
        y: Math.random() * config.height * 0.6 + config.height * 0.2,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        alpha: 0,
        maxAlpha: Math.random() * 0.3 + 0.1,
        phase: 0,
        speed: Math.random() * 0.02 + 0.01
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

function drawSanctuary() {
    const ctx = sanctuaryCtx;
    if (!ctx) return;

    const config = SANCTUARY_CONFIG;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    const scene = getSceneTheme();

    ctx.clearRect(0, 0, config.width, config.height);

    // 背景
    drawBackground(ctx, config, theme, scene);

    // 场景特效层
    drawSceneEffects(ctx, config, theme, scene);

    // 穹顶
    drawDome(ctx, config, theme, scene);

    // 声波
    drawSoundWaves(ctx, config, theme, scene);

    // 歌者之座
    drawSingerSeat(ctx, config, theme);

    // 闸门
    drawVaultDoors(ctx, config, theme);

    // 环境光
    drawAmbientLight(ctx, config, theme, scene);

    // 场景覆盖层（粒子、符号等）
    drawSceneOverlay(ctx, config, theme, scene);
    
    // 衰败视觉层
    drawDecayOverlay(ctx, config, theme, scene);
}

function getThemeColor(theme, darkColor, lightColor) {
    return theme === 'dark' ? darkColor : lightColor;
}

function drawBackground(ctx, config, theme, scene) {
    const gradient = ctx.createRadialGradient(
        config.width / 2, config.height / 2, 0,
        config.width / 2, config.height / 2, config.width / 2
    );
    
    if (theme === 'dark') {
        if (scene === 'language') {
            gradient.addColorStop(0, '#141420');
            gradient.addColorStop(1, '#0a0a12');
        } else if (scene === 'history') {
            gradient.addColorStop(0, '#1a1410');
            gradient.addColorStop(1, '#0f0a08');
        } else {
            gradient.addColorStop(0, '#1a1010');
            gradient.addColorStop(1, '#0f0808');
        }
    } else {
        if (scene === 'language') {
            gradient.addColorStop(0, '#f0ece5');
            gradient.addColorStop(1, '#e8e0d8');
        } else if (scene === 'history') {
            gradient.addColorStop(0, '#f5f0e8');
            gradient.addColorStop(1, '#ebe5d8');
        } else {
            gradient.addColorStop(0, '#f5ebe8');
            gradient.addColorStop(1, '#ebe0d8');
        }
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, config.width, config.height);
}

function drawSceneEffects(ctx, config, theme, scene) {
    const dome = config.dome;
    
    if (scene === 'language') {
        // 同心圆波纹
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.06 : 0.04;
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(dome.centerX, dome.centerY, dome.radius * i / 4, 0, Math.PI * 2);
            ctx.strokeStyle = theme === 'dark' ? '#4a6a9a' : '#6a8ab0';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();
    } else if (scene === 'history') {
        // 时间轴圆环
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.12 : 0.08;
        ctx.beginPath();
        ctx.arc(dome.centerX, dome.centerY, dome.radius + 20, 0, Math.PI * 2);
        ctx.setLineDash([8, 12]);
        ctx.strokeStyle = theme === 'dark' ? '#8a6a3a' : '#a07a4a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    } else if (scene === 'disaster') {
        // 裂痕纹理
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.15 : 0.1;
        ctx.strokeStyle = theme === 'dark' ? '#8a3a3a' : '#a05050';
        ctx.lineWidth = 1;
        const cracks = [
            { x1: 50, y1: 30, x2: 120, y2: 100, x3: 100, y3: 160 },
            { x1: 550, y1: 50, x2: 480, y2: 120, x3: 500, y3: 180 },
            { x1: 100, y1: 380, x2: 180, y2: 320, x3: 200, y3: 350 }
        ];
        cracks.forEach(crack => {
            ctx.beginPath();
            ctx.moveTo(crack.x1, crack.y1);
            ctx.lineTo(crack.x2, crack.y2);
            ctx.lineTo(crack.x3, crack.y3);
            ctx.stroke();
        });
        ctx.restore();
    } else if (scene === 'art') {
        // 音符与色彩漩涡
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.strokeStyle = theme === 'dark' ? '#7a4a9a' : '#9060b0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + time * 0.001;
            const r = 60 + i * 15;
            ctx.beginPath();
            ctx.arc(dome.centerX + Math.cos(angle) * 30, dome.centerY + Math.sin(angle) * 30, r, angle, angle + Math.PI);
            ctx.stroke();
        }
        ctx.restore();
    } else if (scene === 'philosophy') {
        // 无限符号 - 莫比乌斯环
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.08 : 0.05;
        ctx.strokeStyle = theme === 'dark' ? '#4a9a7a' : '#60b090';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let t = 0; t < Math.PI * 2; t += 0.05) {
            const scale = 50;
            const x = dome.centerX + scale * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
            const y = dome.centerY + scale * Math.sin(t) * Math.cos(t) / (1 + Math.sin(t) * Math.sin(t));
            if (t === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    } else if (scene === 'science') {
        // 原子轨道
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.strokeStyle = theme === 'dark' ? '#4a9aaa' : '#60b0b0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(dome.centerX, dome.centerY, 80 + i * 25, 40 + i * 12, i * 0.5, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    } else if (scene === 'ecology') {
        // 叶脉纹理
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.strokeStyle = theme === 'dark' ? '#4a9a4a' : '#60b060';
        ctx.lineWidth = 1;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(dome.centerX, dome.centerY);
            const endX = dome.centerX + Math.cos(angle) * (dome.radius - 20);
            const endY = dome.centerY + Math.sin(angle) * (dome.radius - 20);
            ctx.lineTo(endX, endY);
            // 侧脉
            for (let j = 1; j <= 3; j++) {
                const midX = dome.centerX + Math.cos(angle) * (15 + j * 15);
                const midY = dome.centerY + Math.sin(angle) * (15 + j * 15);
                ctx.moveTo(midX, midY);
                ctx.lineTo(midX + Math.cos(angle + 0.5) * 10, midY + Math.sin(angle + 0.5) * 10);
                ctx.moveTo(midX, midY);
                ctx.lineTo(midX + Math.cos(angle - 0.5) * 10, midY + Math.sin(angle - 0.5) * 10);
            }
            ctx.stroke();
        }
        ctx.restore();
    } else if (scene === 'law') {
        // 天平与天平刻度
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.08 : 0.05;
        ctx.strokeStyle = theme === 'dark' ? '#7a7a7a' : '#909090';
        ctx.lineWidth = 1;
        // 水平刻度线
        for (let i = 0; i < 5; i++) {
            const y = dome.centerY - 40 + i * 20;
            ctx.beginPath();
            ctx.moveTo(dome.centerX - 60, y);
            ctx.lineTo(dome.centerX + 60, y);
            ctx.stroke();
        }
        // 垂直支柱
        ctx.beginPath();
        ctx.moveTo(dome.centerX, dome.centerY - 50);
        ctx.lineTo(dome.centerX, dome.centerY + 50);
        ctx.stroke();
        ctx.restore();
    } else if (scene === 'daily') {
        // 生活碎片 - 小圆点
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.fillStyle = theme === 'dark' ? '#9a9a4a' : '#b0b060';
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2 + time * 0.0005;
            const r = 50 + (i % 3) * 20;
            const x = dome.centerX + Math.cos(angle) * r;
            const y = dome.centerY + Math.sin(angle) * r;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    } else if (scene === 'architecture') {
        // 建筑蓝图网格
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.06 : 0.04;
        ctx.strokeStyle = theme === 'dark' ? '#9a7a7a' : '#b09090';
        ctx.lineWidth = 0.5;
        const gridSize = 20;
        for (let x = dome.centerX - dome.radius; x < dome.centerX + dome.radius; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, dome.centerY - dome.radius);
            ctx.lineTo(x, dome.centerY + dome.radius);
            ctx.stroke();
        }
        for (let y = dome.centerY - dome.radius; y < dome.centerY + dome.radius; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(dome.centerX - dome.radius, y);
            ctx.lineTo(dome.centerX + dome.radius, y);
            ctx.stroke();
        }
        ctx.restore();
    } else if (scene === 'medicine') {
        // 生命脉络 - 心跳波形
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.strokeStyle = theme === 'dark' ? '#9a4a7a' : '#b06090';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 60; i++) {
            const x = dome.centerX - 60 + i * 2;
            const y = dome.centerY + Math.sin(i * 0.3 + time * 0.01) * 15 * Math.sin(i * 0.1);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
    } else if (scene === 'astronomy') {
        // 星轨 - 椭圆轨道
        ctx.save();
        ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.06;
        ctx.strokeStyle = theme === 'dark' ? '#4a4a9a' : '#6060b0';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.ellipse(dome.centerX, dome.centerY, 40 + i * 20, 25 + i * 12, time * 0.001 * (i + 1), 0, Math.PI * 2);
            ctx.stroke();
        }
        // 中心星
        ctx.fillStyle = theme === 'dark' ? '#8a8aff' : '#4040c0';
        ctx.beginPath();
        ctx.arc(dome.centerX, dome.centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawDome(ctx, config, theme, scene) {
    const dome = config.dome;
    
    ctx.beginPath();
    ctx.arc(dome.centerX, dome.centerY, dome.radius, 0, Math.PI * 2);
    
    // 根据场景改变穹顶颜色
    const domeColors = {
        language:      { fill: ['#0e1220', '#e8e0d8'], stroke: ['#2a3a5a', '#8aa0c0'] },
        history:       { fill: ['#14100a', '#ebe5d8'], stroke: ['#5a4a2a', '#a08a60'] },
        disaster:      { fill: ['#140a0a', '#ebe0d8'], stroke: ['#5a2a2a', '#a06060'] },
        art:           { fill: ['#120e1a', '#ede8f0'], stroke: ['#4a2a6a', '#9060b0'] },
        philosophy:    { fill: ['#0a1a12', '#e8f0ea'], stroke: ['#2a5a4a', '#60b090'] },
        science:       { fill: ['#0a141a', '#e8f0f0'], stroke: ['#2a5a6a', '#60b0b0'] },
        ecology:       { fill: ['#0a1a0a', '#e8f0e8'], stroke: ['#2a5a2a', '#60b060'] },
        law:           { fill: ['#121212', '#ececec'], stroke: ['#4a4a4a', '#909090'] },
        daily:         { fill: ['#1a1a0a', '#f0f0e0'], stroke: ['#5a5a2a', '#b0b060'] },
        architecture:  { fill: ['#141210', '#f0ece5'], stroke: ['#5a4a3a', '#b09070'] },
        medicine:      { fill: ['#1a0e12', '#f0e8ec'], stroke: ['#5a2a4a', '#b06090'] },
        astronomy:     { fill: ['#060620', '#e0e0f0'], stroke: ['#2a2a6a', '#6060b0'] },
    };
    
    const colors = domeColors[scene] || domeColors.language;
    ctx.fillStyle = theme === 'dark' ? colors.fill[0] : colors.fill[1];
    ctx.strokeStyle = theme === 'dark' ? colors.stroke[0] : colors.stroke[1];
    
    ctx.fill();
    ctx.lineWidth = dome.strokeWidth;
    ctx.stroke();
    
    // 纹理 - 场景定制
    ctx.save();
    ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.05;
    
    if (scene === 'language') {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const x1 = dome.centerX + Math.cos(angle) * 25;
            const y1 = dome.centerY + Math.sin(angle) * 25;
            const x2 = dome.centerX + Math.cos(angle) * dome.radius;
            const y2 = dome.centerY + Math.sin(angle) * dome.radius;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = theme === 'dark' ? '#3a5a8a' : '#7a9ac0';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else if (scene === 'history') {
        ctx.beginPath();
        ctx.strokeStyle = theme === 'dark' ? '#6a5a3a' : '#9a8a60';
        ctx.lineWidth = 1;
        for (let t = 0; t < 200; t += 0.1) {
            const r = t * 0.7;
            const x = dome.centerX + Math.cos(t) * r;
            const y = dome.centerY + Math.sin(t) * r;
            if (t === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    } else if (scene === 'disaster') {
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2 + time * 0.002;
            const x1 = dome.centerX + Math.cos(angle) * 40;
            const y1 = dome.centerY + Math.sin(angle) * 40;
            const x2 = dome.centerX + Math.cos(angle) * (dome.radius - 10);
            const y2 = dome.centerY + Math.sin(angle) * (dome.radius - 10);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = theme === 'dark' ? '#6a3a3a' : '#9a6060';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    } else if (scene === 'art') {
        // 音符点
        ctx.fillStyle = theme === 'dark' ? '#9a6aca' : '#7040a0';
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const x = dome.centerX + Math.cos(angle) * 50;
            const y = dome.centerY + Math.sin(angle) * 50;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (scene === 'philosophy') {
        // 圆环
        ctx.beginPath();
        ctx.arc(dome.centerX, dome.centerY, 40, 0, Math.PI * 2);
        ctx.strokeStyle = theme === 'dark' ? '#4a9a7a' : '#60b090';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'science') {
        // 六边形
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const x = dome.centerX + Math.cos(angle) * 35;
            const y = dome.centerY + Math.sin(angle) * 35;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = theme === 'dark' ? '#4a9aaa' : '#60b0b0';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'ecology') {
        // 叶形
        ctx.beginPath();
        ctx.ellipse(dome.centerX, dome.centerY, 30, 50, 0, 0, Math.PI * 2);
        ctx.strokeStyle = theme === 'dark' ? '#4a9a4a' : '#60b060';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'law') {
        // 天平
        ctx.beginPath();
        ctx.moveTo(dome.centerX - 30, dome.centerY);
        ctx.lineTo(dome.centerX + 30, dome.centerY);
        ctx.moveTo(dome.centerX, dome.centerY - 10);
        ctx.lineTo(dome.centerX, dome.centerY - 40);
        ctx.strokeStyle = theme === 'dark' ? '#7a7a7a' : '#909090';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'daily') {
        // 房屋轮廓
        ctx.beginPath();
        ctx.moveTo(dome.centerX, dome.centerY - 30);
        ctx.lineTo(dome.centerX - 25, dome.centerY);
        ctx.lineTo(dome.centerX - 25, dome.centerY + 20);
        ctx.lineTo(dome.centerX + 25, dome.centerY + 20);
        ctx.lineTo(dome.centerX + 25, dome.centerY);
        ctx.closePath();
        ctx.strokeStyle = theme === 'dark' ? '#9a9a4a' : '#b0b060';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'architecture') {
        // 拱门
        ctx.beginPath();
        ctx.arc(dome.centerX, dome.centerY + 20, 25, Math.PI, 0);
        ctx.lineTo(dome.centerX + 25, dome.centerY + 20);
        ctx.lineTo(dome.centerX - 25, dome.centerY + 20);
        ctx.closePath();
        ctx.strokeStyle = theme === 'dark' ? '#9a7a7a' : '#b09090';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (scene === 'medicine') {
        // 十字
        ctx.beginPath();
        ctx.moveTo(dome.centerX, dome.centerY - 20);
        ctx.lineTo(dome.centerX, dome.centerY + 20);
        ctx.moveTo(dome.centerX - 15, dome.centerY);
        ctx.lineTo(dome.centerX + 15, dome.centerY);
        ctx.strokeStyle = theme === 'dark' ? '#9a4a7a' : '#b06090';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    } else if (scene === 'astronomy') {
        // 星星
        ctx.fillStyle = theme === 'dark' ? '#8a8aff' : '#4040c0';
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const x = dome.centerX + Math.cos(angle) * 40;
            const y = dome.centerY + Math.sin(angle) * 40;
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    ctx.restore();
}

function drawSoundWaves(ctx, config, theme, scene) {
    const waves = config.soundWaves;
    const seat = config.singerSeat;
    
    ctx.save();
    
    // 根据场景改变声波颜色
    const waveColors = {
        language:      theme === 'dark' ? [74, 106, 154] : [90, 120, 170],
        history:       theme === 'dark' ? [138, 106, 58] : [150, 120, 70],
        disaster:      theme === 'dark' ? [138, 58, 58] : [160, 80, 80],
        art:           theme === 'dark' ? [138, 74, 154] : [150, 90, 170],
        philosophy:    theme === 'dark' ? [74, 154, 138] : [90, 170, 150],
        science:       theme === 'dark' ? [74, 154, 170] : [90, 170, 180],
        ecology:       theme === 'dark' ? [74, 154, 74] : [90, 170, 90],
        law:           theme === 'dark' ? [138, 138, 138] : [150, 150, 150],
        daily:         theme === 'dark' ? [154, 154, 74] : [170, 170, 90],
        architecture:  theme === 'dark' ? [154, 138, 138] : [170, 150, 150],
        medicine:      theme === 'dark' ? [154, 74, 138] : [170, 90, 150],
        astronomy:     theme === 'dark' ? [74, 74, 154] : [90, 90, 170],
    };
    
    const waveColor = waveColors[scene] || waveColors.language;
    
    for (let i = 0; i < waves.waveCount; i++) {
        const phase = (time * waves.speed + i * 0.4) % 1;
        const radius = seat.radius + phase * waves.maxRadius;
        const alpha = 0.3 * (1 - phase);
        
        ctx.beginPath();
        ctx.arc(seat.centerX, seat.centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${waveColor[0]}, ${waveColor[1]}, ${waveColor[2]}, ${alpha})`;
        ctx.lineWidth = waves.lineWidth;
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawSingerSeat(ctx, config, theme) {
    const seat = config.singerSeat;
    
    // 光晕
    const glowGradient = ctx.createRadialGradient(
        seat.centerX, seat.centerY, 0,
        seat.centerX, seat.centerY, seat.glowRadius
    );
    
    if (theme === 'dark') {
        glowGradient.addColorStop(0, 'rgba(212, 160, 74, 0.15)');
    } else {
        glowGradient.addColorStop(0, 'rgba(138, 106, 42, 0.2)');
    }
    glowGradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = glowGradient;
    ctx.fillRect(seat.centerX - seat.glowRadius, seat.centerY - seat.glowRadius, 
                 seat.glowRadius * 2, seat.glowRadius * 2);
    
    // 底座
    ctx.beginPath();
    ctx.arc(seat.centerX, seat.centerY, seat.radius, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'dark' ? '#1a1a25' : '#faf7f2';
    ctx.fill();
    ctx.strokeStyle = '#d4a04a';
    ctx.lineWidth = seat.strokeWidth;
    ctx.stroke();
    
    // 声波符号
    drawSoundSymbol(ctx, seat.centerX, seat.centerY, theme);
}

function drawSoundSymbol(ctx, x, y, theme) {
    ctx.save();
    ctx.strokeStyle = '#d4a04a';
    ctx.lineWidth = 1.5;
    
    for (let i = 0; i < 3; i++) {
        const r = 7 + i * 5;
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI * 0.3, Math.PI * 0.3);
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawVaultDoors(ctx, config, theme) {
    const dome = config.dome;
    const doors = config.vaultDoors;
    const vaults = MemorySanctuary.data.vaults;
    
    // 根据存储室数量计算闸门位置
    const count = vaults.length;
    const startAngle = -Math.PI / 2; // 从正上方开始
    const angleStep = (Math.PI * 2) / Math.max(count, 3);
    
    vaults.forEach((vault, index) => {
        const angle = startAngle + index * angleStep;
        const doorX = dome.centerX + Math.cos(angle) * doors.orbitRadius;
        const doorY = dome.centerY + Math.sin(angle) * doors.orbitRadius;
        
        // 闸门背景
        ctx.beginPath();
        ctx.arc(doorX, doorY, doors.radius + 3, 0, Math.PI * 2);
        ctx.fillStyle = theme === 'dark' ? '#0a0a0f' : '#f5f0e8';
        ctx.fill();
        
        // 闸门
        ctx.beginPath();
        ctx.arc(doorX, doorY, doors.radius, 0, Math.PI * 2);
        ctx.fillStyle = theme === 'dark' ? vault.color : lightenColor(vault.color, 0.7);
        ctx.fill();
        ctx.strokeStyle = vault.accentColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 闸门编号
        ctx.fillStyle = vault.accentColor;
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(vault.id).padStart(2, '0'), doorX, doorY);
    });
}

function lightenColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);
    
    return `rgb(${nr}, ${ng}, ${nb})`;
}

function drawAmbientLight(ctx, config, theme, scene) {
    const lightGradient = ctx.createRadialGradient(
        config.width / 2, 50, 0,
        config.width / 2, 50, 200
    );
    
    const ambientColors = {
        language:      theme === 'dark' ? 'rgba(74, 106, 154, 0.06)' : 'rgba(90, 120, 170, 0.08)',
        history:       theme === 'dark' ? 'rgba(138, 106, 58, 0.06)' : 'rgba(150, 120, 70, 0.08)',
        disaster:      theme === 'dark' ? 'rgba(138, 58, 58, 0.06)' : 'rgba(160, 80, 80, 0.08)',
        art:           theme === 'dark' ? 'rgba(138, 74, 154, 0.06)' : 'rgba(150, 90, 170, 0.08)',
        philosophy:    theme === 'dark' ? 'rgba(74, 154, 138, 0.06)' : 'rgba(90, 170, 150, 0.08)',
        science:       theme === 'dark' ? 'rgba(74, 154, 170, 0.06)' : 'rgba(90, 170, 180, 0.08)',
        ecology:       theme === 'dark' ? 'rgba(74, 154, 74, 0.06)' : 'rgba(90, 170, 90, 0.08)',
        law:           theme === 'dark' ? 'rgba(138, 138, 138, 0.05)' : 'rgba(150, 150, 150, 0.07)',
        daily:         theme === 'dark' ? 'rgba(154, 154, 74, 0.06)' : 'rgba(170, 170, 90, 0.08)',
        architecture:  theme === 'dark' ? 'rgba(154, 138, 138, 0.06)' : 'rgba(170, 150, 150, 0.08)',
        medicine:      theme === 'dark' ? 'rgba(154, 74, 138, 0.06)' : 'rgba(170, 90, 150, 0.08)',
        astronomy:     theme === 'dark' ? 'rgba(74, 74, 154, 0.06)' : 'rgba(90, 90, 170, 0.08)',
    };
    
    lightGradient.addColorStop(0, ambientColors[scene] || ambientColors.language);
    lightGradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, config.width, config.height);
    
    if (theme === 'dark') {
        const vignetteGradient = ctx.createRadialGradient(
            config.width / 2, config.height / 2, config.width * 0.3,
            config.width / 2, config.height / 2, config.width * 0.7
        );
        vignetteGradient.addColorStop(0, 'transparent');
        vignetteGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, config.width, config.height);
    }
}

function drawSceneOverlay(ctx, config, theme, scene) {
    // 绘制粒子
    ctx.save();
    
    // 粒子颜色映射
    const particleColors = {
        language:      theme === 'dark' ? [100, 150, 200] : [80, 120, 180],
        history:       theme === 'dark' ? [138, 106, 58] : [160, 130, 80],
        disaster:      theme === 'dark' ? [212, 160, 74] : [180, 130, 60],
        art:           theme === 'dark' ? [180, 100, 220] : [150, 80, 190],
        philosophy:    theme === 'dark' ? [100, 200, 180] : [80, 180, 160],
        science:       theme === 'dark' ? [100, 200, 220] : [80, 180, 200],
        ecology:       theme === 'dark' ? [100, 200, 100] : [80, 180, 80],
        law:           theme === 'dark' ? [180, 180, 180] : [200, 200, 200],
        daily:         theme === 'dark' ? [200, 200, 100] : [220, 220, 80],
        architecture:  theme === 'dark' ? [200, 160, 160] : [220, 180, 180],
        medicine:      theme === 'dark' ? [200, 100, 180] : [220, 80, 160],
        astronomy:     theme === 'dark' ? [100, 100, 220] : [80, 80, 200],
    };
    
    const pColor = particleColors[scene] || particleColors.language;
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        
        const lifeRatio = p.life / p.maxLife;
        const currentAlpha = p.alpha * (1 - lifeRatio);
        
        ctx.fillStyle = `rgba(${pColor[0]}, ${pColor[1]}, ${pColor[2]}, ${currentAlpha})`;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        
        if (p.life >= p.maxLife || p.y > config.height + 20 || p.y < -20 || p.x < -20 || p.x > config.width + 20) {
            particles.splice(i, 1);
        }
    }
    
    // 绘制漂浮符号
    for (let i = floatingSymbols.length - 1; i >= 0; i--) {
        const s = floatingSymbols[i];
        s.phase += s.speed;
        
        const targetAlpha = s.maxAlpha * (0.5 + 0.5 * Math.sin(s.phase));
        s.alpha += (targetAlpha - s.alpha) * 0.02;
        
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = theme === 'dark' ? '#d4a04a' : '#8a6a2a';
        ctx.font = '12px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.symbol, s.x, s.y + Math.sin(s.phase * 2) * 3);
        
        if (s.phase > Math.PI * 8) {
            floatingSymbols.splice(i, 1);
        }
    }
    
    ctx.restore();
}

// ==========================================
// 衰败视觉层
// ==========================================

function drawDecayOverlay(ctx, config, theme, scene) {
    // 获取游戏状态
    if (!MemorySanctuary.state) return;
    
    const resources = MemorySanctuary.state.resources;
    const energy = resources ? resources.energy : 100;
    const media = resources ? resources.media : 60;
    const environment = resources ? resources.environment : 95;
    
    const w = config.width;
    const h = config.height;
    
    // 能源衰败：穹顶闪烁 + 整体偏红
    if (energy <= 0) {
        // 完全枯竭：强烈红色呼吸
        const pulse = 0.1 + 0.05 * Math.sin(time * 0.1);
        ctx.fillStyle = `rgba(138, 58, 58, ${pulse})`;
        ctx.fillRect(0, 0, w, h);
    } else if (energy < 30) {
        // 能源不足：间歇性闪烁
        const flicker = Math.sin(time * 0.15) > 0.7 ? 0.08 : 0.02;
        ctx.fillStyle = `rgba(138, 58, 58, ${flicker})`;
        ctx.fillRect(0, 0, w, h);
    }
    
    // 介质衰败：雪花噪点
    if (media <= 0) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        const dotCount = 30;
        for (let i = 0; i < dotCount; i++) {
            const x = (Math.sin(time * 0.05 + i * 1.3) * 0.5 + 0.5) * w;
            const y = (Math.cos(time * 0.04 + i * 1.7) * 0.5 + 0.5) * h;
            const size = Math.random() * 2 + 1;
            ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#000000';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    } else if (media < 20) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        const dotCount = 10;
        for (let i = 0; i < dotCount; i++) {
            const x = (Math.sin(time * 0.03 + i * 2.1) * 0.5 + 0.5) * w;
            const y = (Math.cos(time * 0.02 + i * 2.3) * 0.5 + 0.5) * h;
            ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#000000';
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    
    // 环境衰败：边缘暗角加重
    if (environment <= 0) {
        const vignetteGradient = ctx.createRadialGradient(
            w / 2, h / 2, w * 0.15,
            w / 2, h / 2, w * 0.55
        );
        vignetteGradient.addColorStop(0, 'transparent');
        vignetteGradient.addColorStop(1, 'rgba(50, 0, 0, 0.6)');
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, w, h);
    } else if (environment < 30) {
        const vignetteGradient = ctx.createRadialGradient(
            w / 2, h / 2, w * 0.2,
            w / 2, h / 2, w * 0.6
        );
        vignetteGradient.addColorStop(0, 'transparent');
        vignetteGradient.addColorStop(1, 'rgba(80, 40, 0, 0.3)');
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, w, h);
    }
    
    // 三种资源全部危急：整体震颤效果
    if (energy < 20 && media < 15 && environment < 20) {
        const shake = Math.sin(time * 0.3) * 0.03;
        ctx.fillStyle = `rgba(100, 0, 0, ${0.05 + shake})`;
        ctx.fillRect(0, 0, w, h);
    }
    
    // 终局倒计时：第32周起边缘泛红
    if (MemorySanctuary.state.week >= 32) {
        const intensity = Math.min(0.3, (MemorySanctuary.state.week - 31) * 0.04);
        const weekPulse = intensity * (0.8 + 0.2 * Math.sin(time * 0.05));
        ctx.fillStyle = `rgba(80, 20, 20, ${weekPulse})`;
        ctx.fillRect(0, 0, w, h);
    }
    
    // 章节过渡强化效果
    if (chapterTransitionEffect.active) {
        const elapsed = Date.now() - chapterTransitionEffect.startTime;
        const progress = Math.min(1, elapsed / chapterTransitionEffect.duration);
        
        // 前30%：衰败效果突然加重
        // 40%-70%：保持高峰
        // 70%-100%：缓慢消退
        let surgeIntensity;
        if (progress < 0.3) {
            surgeIntensity = progress / 0.3;
        } else if (progress < 0.7) {
            surgeIntensity = 1;
        } else {
            surgeIntensity = 1 - (progress - 0.7) / 0.3;
        }
        
        const surge = surgeIntensity * 0.25;
        ctx.fillStyle = `rgba(120, 30, 30, ${surge})`;
        ctx.fillRect(0, 0, w, h);
        
        // 边缘暗角脉冲
        const vignetteGradient = ctx.createRadialGradient(
            w / 2, h / 2, w * 0.1,
            w / 2, h / 2, w * 0.5
        );
        vignetteGradient.addColorStop(0, 'transparent');
        vignetteGradient.addColorStop(1, `rgba(60, 10, 10, ${surge * 0.8})`);
        ctx.fillStyle = vignetteGradient;
        ctx.fillRect(0, 0, w, h);
        
        if (progress >= 1) {
            chapterTransitionEffect.active = false;
        }
    }
}

// 触发章节过渡效果
function triggerChapterTransitionEffect() {
    chapterTransitionEffect.active = true;
    chapterTransitionEffect.startTime = Date.now();
}
