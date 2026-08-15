/**
 * game-tutorial.js - 从 game.js 拆分的模块
 * 包含: initTutorial, showTutorialStep, nextTutorialStep...
 */

// 一次性标志：字体就绪后只重测一次定位（防止 ready 立即 resolve 造成递归）
let fontReadyRepositioned = false;

function initTutorial() {
    const saved = localStorage.getItem('memory-sanctuary-tutorial');
    if (saved) return;

    tutorialActive = true;
    tutorialStep = 0;
    showTutorialStep();
}


/**
 * 面板级引导：各功能面板首次打开时在面板顶部显示一条提示（仅一次）
 * key: project / explore / emergency
 */
function showPanelHint(key, container, text) {
    const st = MemorySanctuary.state;
    if (!st || !container) return;
    if (!st.panelHints) st.panelHints = { project: false, explore: false, emergency: false };
    if (st.panelHints[key]) return;
    st.panelHints[key] = true;

    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = text;
    container.prepend(hint);
}


function showTutorialStep() {
    const overlay = document.getElementById('tutorial-overlay');
    const highlight = document.getElementById('tutorial-highlight');
    const tip = document.getElementById('tutorial-tip');
    const text = document.getElementById('tutorial-text');
    const nextBtn = document.getElementById('tutorial-next');

    if (!overlay || !highlight || !tip || !text || !nextBtn) return;

    const step = TUTORIAL_STEPS[tutorialStep];

    text.textContent = step.text;

    if (tutorialStep === TUTORIAL_STEPS.length - 1) {
        nextBtn.textContent = '开始守护';
    } else {
        nextBtn.textContent = '下一步';
    }

    // 高亮目标（同步滚动到目标，强制重排后再测量——smooth 异步滚动会在滚动完成前测量到旧坐标，导致高亮框/气泡错位）
    let rect = null;
    if (step.target) {
        const target = document.querySelector(step.target);
        if (target) {
            // 目标不可见（display:none / 零尺寸）时隐藏高亮框，避免定位到左上角「对着空气」
            const visible = (target.offsetWidth > 0) || (target.offsetHeight > 0);
            if (visible) {
                try { target.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { target.scrollIntoView(true); }
                // 强制同步布局，确保滚动已结束
                void document.documentElement.offsetHeight;
                rect = target.getBoundingClientRect();
                highlight.style.left = rect.left - 4 + 'px';
                highlight.style.top = rect.top - 4 + 'px';
                highlight.style.width = rect.width + 8 + 'px';
                highlight.style.height = rect.height + 8 + 'px';
                highlight.classList.remove('hidden');
            } else {
                highlight.classList.add('hidden');
            }
        } else {
            highlight.classList.add('hidden');
        }
    } else {
        highlight.classList.add('hidden');
    }

    // 字体就绪后重测一次：首次游玩霞鹜文楷异步加载，字体就位后布局变化，需矫正高亮/气泡位置
    if (document.fonts && document.fonts.ready && !fontReadyRepositioned) {
        fontReadyRepositioned = true; // 一次性标志，避免 ready 后重测 → 再注册 → 无限递归
        document.fonts.ready.then(() => {
            if (tutorialActive) showTutorialStep();
        });
    }

    overlay.classList.remove('hidden');

    // 提示框定位：默认跟随目标（带箭头指向），无目标时居中
    tip.classList.remove('tip-below', 'tip-above', 'tip-left');
    tip.style.left = 'auto';
    tip.style.right = 'auto';
    tip.style.top = 'auto';
    tip.style.bottom = 'auto';
    tip.style.transform = '';

    const tipW = tip.offsetWidth || 320;
    const tipH = tip.offsetHeight || 180;
    const pad = 16;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const clampX = (x) => Math.max(12, Math.min(x, viewW - tipW - 12));
    const clampY = (y) => Math.max(12, Math.min(y, viewH - tipH - 12));

    if (rect && step.position && step.position !== 'center') {
        if (step.position === 'left') {
            // 目标左侧；放不下则移到右侧
            let left = rect.left - tipW - pad;
            let arrowClass = 'tip-left';
            if (left < 12) { left = rect.right + pad; arrowClass = 'tip-below'; }
            tip.style.left = clampX(left) + 'px';
            tip.style.top = clampY(rect.top) + 'px';
            tip.classList.add(arrowClass);
        } else if (step.position === 'top') {
            // 目标上方；放不下则移到下方
            let top = rect.top - tipH - pad;
            let arrowClass = 'tip-above';
            if (top < 12) { top = rect.bottom + pad; arrowClass = 'tip-below'; }
            tip.style.left = clampX(rect.left) + 'px';
            tip.style.top = clampY(top) + 'px';
            tip.classList.add(arrowClass);
        } else {
            // bottom（默认）：目标下方；放不下则移到上方
            let top = rect.bottom + pad;
            let arrowClass = 'tip-below';
            if (top + tipH > viewH - 12) { top = Math.max(12, rect.top - tipH - pad); arrowClass = 'tip-above'; }
            tip.style.left = clampX(rect.left) + 'px';
            tip.style.top = clampY(top) + 'px';
            tip.classList.add(arrowClass);
        }
    } else {
        // 居中显示（无目标 / center）
        tip.style.left = '50%';
        tip.style.top = '50%';
        tip.style.transform = 'translate(-50%, -50%)';
    }
}


function nextTutorialStep() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
    } else {
        showTutorialStep();
    }
}


function endTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');
    tutorialActive = false;
    window.removeEventListener('resize', onTutorialResize);
    localStorage.setItem('memory-sanctuary-tutorial', 'completed');
    addLog('新手引导已完成。愿你的选择得到善待。', 'system');

    // 所有引导视觉提示结束后，再弹出游戏帮助弹窗（仅首次游玩）
    // 时序保证：引导 overlay 已隐藏（display:none），帮助弹窗（z-index 1100）不再被聚光灯阴影遮挡
    const hasSeenHelp = localStorage.getItem('memory-sanctuary-help-seen');
    if (!hasSeenHelp) {
        localStorage.setItem('memory-sanctuary-help-seen', 'seen');
        if (typeof showHelpModal === 'function') {
            setTimeout(() => {
                showHelpModal();
                addLog('点击底部「帮助」可随时查看操作指南。', 'system');
            }, 300);
        }
    }
}


function initTutorialListener() {
    const nextBtn = document.getElementById('tutorial-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextTutorialStep);
    }

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                endTutorial();
            }
        });
    }

    // 窗口尺寸变化时重测高亮/气泡位置（防缩放、侧栏开合导致错位）
    window.addEventListener('resize', onTutorialResize);
}

function onTutorialResize() {
    if (tutorialActive) showTutorialStep();
}
