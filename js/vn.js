/**
 * 记忆圣所 — 视觉小说引擎 (VN Engine)
 * 
 * 分层设计：VN Layer 覆盖在 Event Layer 之上
 * - 章节过渡：强制完整演出
 * - 结局：强制完整演出
 * - 守护者对话：可选（设置开关）
 * 
 * 首次观看保护：第一次游玩某段剧情时，跳过按钮灰色不可点击
 * 跳过确认：非首次观看时，点击跳过需确认
 */

// 调试模式开关：发布时设为 false，开发时设为 true
// DEBUG 由 js/main.js 统一声明（单一来源），此处不再重复声明

const VN = (() => {
    'use strict';

    // ─────────────────────────────────────
    // State
    // ─────────────────────────────────────
    let overlay = null;
    let currentScene = null;
    let currentDialogueIndex = 0;
    let typewriterTimer = null;
    let onComplete = null;
    let isTyping = false;
    let isFirstView = true;
    let scenes = {};
    let endingScenes = {};
    let settings = { vnGuardianDialogue: true };

    // ─────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────
    const isActive = () => overlay && !overlay.classList.contains('hidden');

    // ─────────────────────────────────────
    // DOM Cache
    // ─────────────────────────────────────
    let els = {};

    // ─────────────────────────────────────
    // Guardian Visual Identity (抽象几何风格)
    // ─────────────────────────────────────
    const GUARDIAN_VISUALS = {
        tika:   { shape: 'circle',   color: '#d4a04a', glow: '#e8b85c', label: '缇卡' },
        finn:   { shape: 'square',   color: '#4a6a9a', glow: '#6a8aba', label: '芬恩' },
        misha:  { shape: 'triangle', color: '#3a8a5a', glow: '#5aba7a', label: '米莎' },
        lorn:   { shape: 'diamond',  color: '#c47a3a', glow: '#e89a5c', label: '洛恩' },
        ethel:  { shape: 'star',     color: '#8a5a9a', glow: '#aa7aba', label: '埃塞尔' },
        narrator: { shape: 'narrator', color: '#5a5040', glow: '#8a8070', label: '旁白' }
    };

    // ─────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────
    function init(sceneData) {
        overlay = document.getElementById('vn-overlay');
        if (!overlay) {
            if (DEBUG) console.error('[VN] #vn-overlay 未找到');
            return false;
        }

        els = {
            overlay: overlay,
            dialogueBox: document.getElementById('vn-dialogue-box'),
            speakerName: document.getElementById('vn-speaker-name'),
            dialogueText: document.getElementById('vn-dialogue-text'),
            portraits: document.getElementById('vn-portraits'),
            skipBtn: document.getElementById('vn-skip-btn'),
            confirmModal: document.getElementById('vn-confirm-modal'),
            confirmYes: document.getElementById('vn-confirm-yes'),
            confirmNo: document.getElementById('vn-confirm-no'),
            clickHint: document.getElementById('vn-click-hint'),
            closeHint: document.getElementById('vn-close-hint')
        };

        if (sceneData) scenes = sceneData;

        // Load settings
        if (typeof getSettings === 'function') {
            settings = { ...settings, ...getSettings() };
        }

        // Bind events
        els.dialogueBox.addEventListener('click', handleAdvance);
        els.skipBtn.addEventListener('click', handleSkipClick);
        els.confirmYes.addEventListener('click', confirmSkip);
        els.confirmNo.addEventListener('click', cancelSkip);

        // Keyboard support
        document.addEventListener('keydown', handleKeydown);

        if (DEBUG) console.log('[VN] 初始化完成');
        return true;
    }

    function handleKeydown(e) {
        if (!isActive()) return;
        
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleAdvance();
        } else if (e.key === 'Escape') {
            handleSkipClick();
        }
    }

    // ─────────────────────────────────────
    // Scene Loading
    // ─────────────────────────────────────
    function loadScenes(data) {
        scenes = { ...scenes, ...data };
    }

    function getScene(sceneId) {
        return scenes[sceneId] || null;
    }

    function loadEndingScenes(data) {
        endingScenes = { ...endingScenes, ...data };
    }

    function getEndingScene(sceneId) {
        return endingScenes[sceneId] || null;
    }

    // ─────────────────────────────────────
    // First View Detection
    // ─────────────────────────────────────
    function checkFirstView(sceneId) {
        const ngData = (typeof getNGPlusData === 'function') ? getNGPlusData() : {};
        const seen = ngData.seenScenes || [];
        isFirstView = !seen.includes(sceneId);
        updateSkipButton();
    }

    function markAsSeen(sceneId) {
        if (typeof getNGPlusData !== 'function') return;
        const ngData = getNGPlusData();
        if (!ngData.seenScenes) ngData.seenScenes = [];
        if (!ngData.seenScenes.includes(sceneId)) {
            ngData.seenScenes.push(sceneId);
            if (typeof saveNGPlusData === 'function') {
                saveNGPlusData(ngData);
            }
        }
    }

    // ─────────────────────────────────────
    // Show Scene
    // ─────────────────────────────────────
    function show(sceneId, completeCallback) {
        const scene = scenes[sceneId];
        if (!scene) {
            if (DEBUG) console.warn(`[VN] 场景未找到: ${sceneId}`);
            if (completeCallback) completeCallback();
            return;
        }

        currentScene = { ...scene, id: sceneId };
        currentDialogueIndex = 0;
        onComplete = completeCallback;

        // Check first view
        checkFirstView(sceneId);

        // Show overlay with fade
        overlay.classList.remove('hidden');
        overlay.classList.remove('vn-fade-out');
        overlay.classList.add('vn-fade-in');

        // Render first dialogue
        renderDialogue();

        // Play sound
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNOpen) {
            AudioSystem.playVNOpen();
        }
    }

    function showEnding(sceneId, completeCallback) {
        const scene = endingScenes[sceneId];
        if (!scene) {
            if (DEBUG) console.warn(`[VN] 结局场景未找到: ${sceneId}`);
            if (completeCallback) completeCallback();
            return;
        }

        currentScene = { ...scene, id: sceneId };
        currentDialogueIndex = 0;
        onComplete = completeCallback;
        isFirstView = false; // Endings are always skippable

        updateSkipButton();

        // Show overlay with fade
        overlay.classList.remove('hidden');
        overlay.classList.remove('vn-fade-out');
        overlay.classList.add('vn-fade-in');

        // Render first dialogue
        renderDialogue();

        // Play sound & BGM
        if (typeof AudioSystem !== 'undefined') {
            AudioSystem.playVNOpen();
            // 结局 BGM 切换：真结局用 ending_true，其余用 ending_normal
            const bgmScene = (sceneId === 'true_ending') ? 'ending_true' : 'ending_normal';
            AudioSystem.playBGM(bgmScene);
        }
    }

    // ─────────────────────────────────────
    // Hide
    // ─────────────────────────────────────
    function hide() {
        overlay.classList.remove('vn-fade-in');
        overlay.classList.add('vn-fade-out');

        setTimeout(() => {
            overlay.classList.add('hidden');
            cleanup();
            if (onComplete) {
                const cb = onComplete;
                onComplete = null;
                cb();
            }
        }, 300);
    }

    function cleanup() {
        if (typewriterTimer) {
            clearInterval(typewriterTimer);
            typewriterTimer = null;
        }
        isTyping = false;
    }

    // ─────────────────────────────────────
    // Render Dialogue
    // ─────────────────────────────────────
    function renderDialogue() {
        const dialogue = currentScene.dialogue[currentDialogueIndex];
        if (!dialogue) {
            // Scene complete
            markAsSeen(currentScene.id);
            hide();
            if (onComplete) onComplete();
            return;
        }

        // Update speaker
        renderSpeaker(dialogue.speaker);

        // Update portraits
        renderPortraits(dialogue.speaker);

        // Typewriter effect
        typewrite(dialogue.text, els.dialogueText);

        // Hide click hint during typing
        if (els.clickHint) {
            els.clickHint.classList.add('hidden');
        }
    }

    function renderSpeaker(speakerId) {
        const visual = GUARDIAN_VISUALS[speakerId] || GUARDIAN_VISUALS.narrator;
        els.speakerName.textContent = visual.label;
        els.speakerName.style.setProperty('--speaker-color', visual.color);
    }

    function renderPortraits(activeSpeaker) {
        els.portraits.innerHTML = '';

        // Get unique speakers in this scene
        const speakers = [...new Set(currentScene.dialogue.map(d => d.speaker))];

        speakers.forEach(speakerId => {
            const visual = GUARDIAN_VISUALS[speakerId];
            if (!visual) return;

            const portrait = document.createElement('div');
            portrait.className = `vn-portrait vn-portrait-${visual.shape}`;
            if (speakerId === activeSpeaker) {
                portrait.classList.add('active');
            }
            portrait.style.setProperty('--portrait-color', visual.color);
            portrait.style.setProperty('--portrait-glow', visual.glow);
            portrait.dataset.speaker = speakerId;

            // Add label
            const label = document.createElement('span');
            label.className = 'vn-portrait-label';
            label.textContent = visual.label;
            portrait.appendChild(label);

            els.portraits.appendChild(portrait);
        });
    }

    // ─────────────────────────────────────
    // Typewriter Effect
    // ─────────────────────────────────────
    function typewrite(text, element) {
        cleanup();
        isTyping = true;
        element.textContent = '';
        element.classList.add('typing');

        let i = 0;
        const speed = 25; // ms per character

        typewriterTimer = setInterval(() => {
            if (i < text.length) {
                element.textContent += text[i];
                i++;
            } else {
                cleanup();
                element.classList.remove('typing');

                // Show click hint
                if (els.clickHint) {
                    els.clickHint.classList.remove('hidden');
                }
            }
        }, speed);
    }

    // ─────────────────────────────────────
    // Advance
    // ─────────────────────────────────────
    function handleAdvance(e) {
        if (e) e.stopPropagation();
        
        // 音效反馈
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNAdvance) {
            AudioSystem.playVNAdvance();
        }

        if (isTyping) {
            // Skip to end of current text
            cleanup();
            const dialogue = currentScene.dialogue[currentDialogueIndex];
            els.dialogueText.textContent = dialogue.text;
            els.dialogueText.classList.remove('typing');

            // Show click hint
            if (els.clickHint) {
                els.clickHint.classList.remove('hidden');
            }
            return;
        }

        currentDialogueIndex++;
        renderDialogue();
    }

    // ─────────────────────────────────────
    // Skip
    // ─────────────────────────────────────
    function handleSkipClick(e) {
        if (e) e.stopPropagation();

        if (isFirstView) return; // Greyed out, can't skip
        
        // 音效反馈
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNSkipConfirm) {
            AudioSystem.playVNSkipConfirm();
        }

        // Show confirmation
        els.confirmModal.classList.remove('hidden');
    }

    function confirmSkip() {
        els.confirmModal.classList.add('hidden');
        
        // 音效反馈
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNSkip) {
            AudioSystem.playVNSkip();
        }
        
        markAsSeen(currentScene.id);
        hide();
        if (onComplete) onComplete();
    }

    function cancelSkip() {
        els.confirmModal.classList.add('hidden');
        
        // 音效反馈
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNCancel) {
            AudioSystem.playVNCancel();
        }
    }

    function updateSkipButton() {
        if (isFirstView) {
            els.skipBtn.classList.add('disabled');
            els.skipBtn.title = '首次观看，无法跳过';
        } else {
            els.skipBtn.classList.remove('disabled');
            els.skipBtn.title = '跳过剧情';
        }
    }

    // ─────────────────────────────────────
    // Quick Dialogue (for guardian talks)
    // ─────────────────────────────────────
    function showQuickDialogue(guardianId, text, onDone) {
        if (!overlay) return;
        
        currentScene = { id: '_quick', dialogue: [{ speaker: guardianId, text: text }] };
        currentDialogueIndex = 0;
        onComplete = onDone;
        isFirstView = false; // Quick dialogues are always skippable
        
        updateSkipButton();
        
        overlay.classList.remove('hidden');
        overlay.classList.remove('vn-fade-out');
        overlay.classList.add('vn-fade-in');
        
        renderDialogue();
        
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playVNOpen) {
            AudioSystem.playVNOpen();
        }
    }

    // ─────────────────────────────────────
    // Public API
    // ─────────────────────────────────────
    return {
        init,
        show,
        showEnding,
        hide,
        showQuickDialogue,
        loadScenes,
        loadEndingScenes,
        getScene,
        getEndingScene,
        isActive,
        isSceneFirstView: (sceneId) => {
            const ngData = (typeof getNGPlusData === 'function') ? getNGPlusData() : {};
            return !(ngData.seenScenes && ngData.seenScenes.includes(sceneId));
        },
        get isFirstView() { return isFirstView; },
        settings
    };
})();
