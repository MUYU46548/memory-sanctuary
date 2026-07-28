/**
 * canvas.js - Canvas渲染
 * 圣所主厅：圆形穹顶、歌者之座、声波可视化、多闸门
 */

let sanctuaryCanvas = null;
let sanctuaryCtx = null;
let animationId = null;
let time = 0;

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
    drawSanctuary();
    animationId = requestAnimationFrame(animate);
}

function drawSanctuary() {
    const ctx = sanctuaryCtx;
    if (!ctx) return;
    
    const config = SANCTUARY_CONFIG;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    
    ctx.clearRect(0, 0, config.width, config.height);
    
    // 背景
    drawBackground(ctx, config, theme);
    
    // 穹顶
    drawDome(ctx, config, theme);
    
    // 声波
    drawSoundWaves(ctx, config, theme);
    
    // 歌者之座
    drawSingerSeat(ctx, config, theme);
    
    // 闸门
    drawVaultDoors(ctx, config, theme);
    
    // 环境光
    drawAmbientLight(ctx, config, theme);
}

function getThemeColor(theme, darkColor, lightColor) {
    return theme === 'dark' ? darkColor : lightColor;
}

function drawBackground(ctx, config, theme) {
    const gradient = ctx.createRadialGradient(
        config.width / 2, config.height / 2, 0,
        config.width / 2, config.height / 2, config.width / 2
    );
    
    if (theme === 'dark') {
        gradient.addColorStop(0, '#12121a');
        gradient.addColorStop(1, '#0a0a0f');
    } else {
        gradient.addColorStop(0, '#faf7f2');
        gradient.addColorStop(1, '#f5f0e8');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, config.width, config.height);
}

function drawDome(ctx, config, theme) {
    const dome = config.dome;
    
    ctx.beginPath();
    ctx.arc(dome.centerX, dome.centerY, dome.radius, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'dark' ? '#0a0a0f' : '#f5f0e8';
    ctx.fill();
    ctx.strokeStyle = theme === 'dark' ? '#2a2a35' : '#d4cfc8';
    ctx.lineWidth = dome.strokeWidth;
    ctx.stroke();
    
    // 纹理
    ctx.save();
    ctx.globalAlpha = theme === 'dark' ? 0.1 : 0.05;
    
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const x1 = dome.centerX + Math.cos(angle) * 30;
        const y1 = dome.centerY + Math.sin(angle) * 30;
        const x2 = dome.centerX + Math.cos(angle) * dome.radius;
        const y2 = dome.centerY + Math.sin(angle) * dome.radius;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = theme === 'dark' ? '#3a3a45' : '#b0aaa3';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawSoundWaves(ctx, config, theme) {
    const waves = config.soundWaves;
    const seat = config.singerSeat;
    
    ctx.save();
    
    for (let i = 0; i < waves.waveCount; i++) {
        const phase = (time * waves.speed + i * 0.4) % 1;
        const radius = seat.radius + phase * waves.maxRadius;
        const alpha = 0.3 * (1 - phase);
        
        ctx.beginPath();
        ctx.arc(seat.centerX, seat.centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = theme === 'dark' 
            ? `rgba(212, 160, 74, ${alpha})` 
            : `rgba(138, 106, 42, ${alpha})`;
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

function drawAmbientLight(ctx, config, theme) {
    // 点光源
    const lightGradient = ctx.createRadialGradient(
        config.width / 2, 50, 0,
        config.width / 2, 50, 200
    );
    
    if (theme === 'dark') {
        lightGradient.addColorStop(0, 'rgba(212, 160, 74, 0.05)');
    } else {
        lightGradient.addColorStop(0, 'rgba(138, 106, 42, 0.08)');
    }
    lightGradient.addColorStop(1, 'transparent');
    
    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, config.width, config.height);
    
    // 暗角（仅暗色模式）
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
