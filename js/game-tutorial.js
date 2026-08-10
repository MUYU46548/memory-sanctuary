/**
 * game-tutorial.js - 从 game.js 拆分的模块
 * 包含: initTutorial, showTutorialStep, nextTutorialStep...
 */

function initTutorial() {
    const saved = localStorage.getItem('memory-sanctuary-tutorial');
    if (saved) return;

    tutorialActive = true;
    tutorialStep = 0;
    showTutorialStep();
}


function showTutorialStep() {
    const overlay = document.getElementById('tutorial-overlay');
    const highlight = document.getElementById('tutorial-highlight');
    const tip = document.getElementById('tutorial-tip');
    const text = document.getElementById('tutorial-text');
    const nextBtn = document.getElementById('tutorial-next');

    if (!overlay || !highlight || !tip || !text || !nextBtn) return;

    const step = TUTORIAL_STEPS[tutorialStep];

    if (step.target) {
        const target = document.querySelector(step.target);
        if (target) {
            const rect = target.getBoundingClientRect();
            highlight.style.left = rect.left - 4 + 'px';
            highlight.style.top = rect.top - 4 + 'px';
            highlight.style.width = rect.width + 8 + 'px';
            highlight.style.height = rect.height + 8 + 'px';
            highlight.classList.remove('hidden');

            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            highlight.classList.add('hidden');
        }
    } else {
        highlight.classList.add('hidden');
    }

    // 提示始终居中显示，跟随步骤切换内容
    tip.style.top = '50%';
    tip.style.left = '50%';
    tip.style.transform = 'translate(-50%, -50%)';
    tip.className = 'tutorial-tip';

    text.textContent = step.text;

    if (tutorialStep === TUTORIAL_STEPS.length - 1) {
        nextBtn.textContent = '开始守护';
    } else {
        nextBtn.textContent = '下一步';
    }

    overlay.classList.remove('hidden');
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
    localStorage.setItem('memory-sanctuary-tutorial', 'completed');
    addLog('新手引导已完成。愿你的选择得到善待。', 'system');
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
}
