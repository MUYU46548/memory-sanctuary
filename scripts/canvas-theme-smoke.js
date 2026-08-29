// 临时烟雾测试：验证 canvas.js 启动时无异常，且绘制调用不把裸 #hex 直接传给 ctx
const fs = require('fs');
const path = require('path');

// 最小 DOM/Canvas 桩
function makeCtx() {
    const calls = [];
    const noop = () => {};
    const handler = {
        get(t, prop) {
            if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') {
                return t['__' + prop];
            }
            if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
                return () => ({ addColorStop: noop });
            }
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop in t) return t[prop];
            return noop;
        },
        set(t, prop, val) {
            if (prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') {
                t['__' + prop] = val;
                // 记录颜色参数
                if (typeof val === 'string') calls.push(val);
            }
            t[prop] = val;
            return true;
        }
    };
    return { _calls: calls, _el: {}, canvas: { width: 600, height: 400 }, ...new Proxy({ _set: {} }, handler) };
}

global.window = {
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    addEventListener: noop,
    devicePixelRatio: 1
};
function noop() {}
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = noop;

const doc = {
    documentElement: {},
    getElementById: () => null,
    createElement: () => ({ getContext: () => makeCtx(), style: {}, addEventListener: noop, appendChild: noop, setAttribute: noop }),
    addEventListener: noop
};
global.document = doc;
global.getComputedStyle = (el) => ({
    getPropertyValue: (n) => {
        const map = {
            '--bg-deep': '#0a0a0f', '--bg-panel': '#14141c', '--bg-panel-hover': '#1c1c26',
            '--amber-primary': '#d4a04a', '--amber-bright': '#e8b85e', '--amber-dim': '#8a6a2a',
            '--text-primary': '#e0e0e0', '--text-secondary': '#a0a0a8', '--text-dim': '#6a6a72',
            '--border-subtle': '#2a2a34', '--border-strong': '#3a3a46', '--border-color': '#2a2a34',
            '--success': '#3a8a5a', '--warning': '#d4a04a', '--danger': '#8a3a2a',
            '--info-blue': '#6bb8c9', '--vault-language': '#1a2a4a', '--vault-language-accent': '#4a6a9a',
            '--font-cn': 'sans-serif'
        };
        return map[n] || '#000000';
    }
});
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };

// 加载 canvas.js
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'canvas.js'), 'utf8');
try {
    const fn = new Function(code + '\n;return { initCanvas, drawSanctuary, refreshCanvasTheme };');
    const api = fn();
    // 模拟初始化
    const canvasEl = { width: 600, height: 400, getContext: () => makeCtx(), style: {}, addEventListener: noop, getBoundingClientRect: () => ({ width: 600, height: 400 }) };
    global.__canvasEl = canvasEl;
    if (typeof api.initCanvas === 'function') api.initCanvas();
    if (typeof api.drawSanctuary === 'function') api.drawSanctuary();
    // 主题切换刷新
    if (typeof api.refreshCanvasTheme === 'function') { api.refreshCanvasTheme(); api.drawSanctuary(); }
    console.log('SMOKE_OK: canvas.js 执行无异常');
} catch (e) {
    console.error('SMOKE_FAIL:', e.message);
    process.exit(1);
}

// 检查源码中是否有裸 #hex 直接传给 ctx（除 hexToRgb 兜底默认值外）
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'canvas.js'), 'utf8');
const rawHex = (src.match(/ctx\.(?:fill|stroke|shadow)Style\s*=\s*['"]#/g) || []);
const fillRaw = (src.match(/fillStyle\s*=\s*['"]#[0-9a-fA-F]{3,8}['"]/g) || []);
console.log('裸hex直接赋值ctx次数:', rawHex.length + fillRaw.length);
if (rawHex.length + fillRaw.length === 0) {
    console.log('RED_LINE_OK: 无裸 hex 直接流入 ctx');
} else {
    console.log('RED_LINE_WARN: 存在可能的裸 hex 赋值');
}
