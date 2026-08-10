/**
 * debug-panel.js - 调试面板
 * 
 * 功能：
 * - 资源修改（能源/介质/环境/食物）
 * - 时间跳转（跳转到指定周数）
 * - 事件触发（手动触发指定事件、强制随机事件）
 * - 成就操作（解锁指定成就、重置成就）
 * - 状态导入/导出（导出当前state JSON、导入state JSON、清除存档）
 * 
 * 快捷键：Ctrl+Shift+D 切换面板
 * 
 * 注意：仅在 DEBUG = true 时激活
 */

// 调试面板状态
let debugPanelOpen = false;
let debugInitialized = false;

function initDebugPanel() {
    if (debugInitialized) return;
    debugInitialized = true;
    
    const overlay = document.getElementById('debug-overlay');
    const closeBtn = document.getElementById('debug-close');
    const tabs = document.querySelectorAll('.debug-tab');
    const contents = document.querySelectorAll('.debug-tab-content');
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            contents.forEach(c => {
                c.classList.toggle('active', c.id === `debug-tab-${target}`);
            });
        });
    });
    
    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDebugPanel);
    }
    
    // Close on overlay click
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDebugPanel();
        });
    }
    
    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            toggleDebugPanel();
        }
        if (e.key === 'Escape' && debugPanelOpen) {
            closeDebugPanel();
        }
    });
    
    // Initialize resource sliders
    initDebugResourceSliders();
    
    // Initialize event select
    initDebugEventSelect();
    
    // Initialize achievement select
    initDebugAchievementSelect();
    
    // Initialize buttons
    initDebugButtons();
}

function toggleDebugPanel() {
    const overlay = document.getElementById('debug-overlay');
    if (!overlay) return;
    
    debugPanelOpen = !debugPanelOpen;
    overlay.classList.toggle('hidden', !debugPanelOpen);
    
    if (debugPanelOpen) {
        refreshDebugUI();
    }
}

function closeDebugPanel() {
    const overlay = document.getElementById('debug-overlay');
    if (!overlay) return;
    debugPanelOpen = false;
    overlay.classList.add('hidden');
}

function refreshDebugUI() {
    if (!MemorySanctuary.state) return;
    
    const state = MemorySanctuary.state;
    const resources = state.resources;
    
    // Update resource sliders
    const energySlider = document.getElementById('debug-energy');
    const mediaSlider = document.getElementById('debug-media');
    const envSlider = document.getElementById('debug-environment');
    const foodSlider = document.getElementById('debug-food');
    
    if (energySlider) {
        energySlider.value = resources.energy;
        document.getElementById('debug-energy-val').textContent = resources.energy;
    }
    if (mediaSlider) {
        mediaSlider.value = resources.media;
        document.getElementById('debug-media-val').textContent = resources.media;
    }
    if (envSlider) {
        envSlider.value = resources.environment;
        document.getElementById('debug-environment-val').textContent = resources.environment;
    }
    if (foodSlider) {
        foodSlider.value = resources.food;
        document.getElementById('debug-food-val').textContent = resources.food;
    }
    
    // Update week input
    const weekInput = document.getElementById('debug-week-input');
    if (weekInput) weekInput.value = state.week;
}

function initDebugResourceSliders() {
    const resources = ['energy', 'media', 'environment', 'food'];
    
    resources.forEach(res => {
        const slider = document.getElementById(`debug-${res}`);
        const valSpan = document.getElementById(`debug-${res}-val`);
        
        if (slider && valSpan) {
            slider.addEventListener('input', () => {
                valSpan.textContent = slider.value;
            });
        }
    });
    
    // Apply button
    const applyBtn = document.getElementById('debug-apply-resources');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            
            const energy = parseInt(document.getElementById('debug-energy').value);
            const media = parseInt(document.getElementById('debug-media').value);
            const environment = parseInt(document.getElementById('debug-environment').value);
            const food = parseInt(document.getElementById('debug-food').value);
            
            MemorySanctuary.state.resources.energy = energy;
            MemorySanctuary.state.resources.media = media;
            MemorySanctuary.state.resources.environment = environment;
            MemorySanctuary.state.resources.food = food;
            
            if (typeof renderAll === 'function') renderAll();
            addLog(`🛠️ [调试] 资源已修改: 能源=${energy}, 介质=${media}, 环境=${environment}, 食物=${food}`, 'system');
        });
    }
}

function initDebugEventSelect() {
    const select = document.getElementById('debug-event-select');
    if (!select) return;
    
    // Load events from data
    if (MemorySanctuary.data && MemorySanctuary.data.events) {
        MemorySanctuary.data.events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = event.title;
            select.appendChild(option);
        });
    }
}

function initDebugAchievementSelect() {
    const select = document.getElementById('debug-achievement-select');
    if (!select) return;
    
    // Load achievements from data
    if (MemorySanctuary.data && MemorySanctuary.data.achievements) {
        MemorySanctuary.data.achievements.forEach(ach => {
            const option = document.createElement('option');
            option.value = ach.id;
            option.textContent = ach.name;
            select.appendChild(option);
        });
    }
}

function initDebugButtons() {
    // Jump week
    const jumpBtn = document.getElementById('debug-jump-week');
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            const input = document.getElementById('debug-week-input');
            const week = parseInt(input.value);
            if (isNaN(week) || week < 1 || week > 48) {
                alert('请输入1-48之间的周数');
                return;
            }
            jumpToWeek(week);
        });
    }
    
    // Quick jump buttons
    document.querySelectorAll('.debug-jump-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const week = parseInt(btn.dataset.week);
            jumpToWeek(week);
        });
    });
    
    // Trigger event
    const triggerBtn = document.getElementById('debug-trigger-event');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            const select = document.getElementById('debug-event-select');
            const eventId = select.value;
            if (!eventId) return;
            
            const event = MemorySanctuary.data.events.find(e => e.id === eventId);
            if (event && typeof triggerEvent === 'function') {
                triggerEvent(event);
                addLog(`🛠️ [调试] 触发事件: ${event.title}`, 'system');
            }
        });
    }
    
    // Force random event
    const randomBtn = document.getElementById('debug-random-event');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            if (typeof checkRandomEvent === 'function') {
                // Force trigger by setting probability to 1
                const originalEvents = MemorySanctuary.data.events;
                const randomEvents = originalEvents.filter(e => 
                    e.trigger && e.trigger.type === 'random'
                );
                if (randomEvents.length > 0) {
                    const event = randomEvents[Math.floor(Math.random() * randomEvents.length)];
                    if (typeof triggerEvent === 'function') {
                        triggerEvent(event);
                        addLog(`🛠️ [调试] 强制随机事件: ${event.title}`, 'system');
                    }
                }
            }
        });
    }
    
    // Unlock achievement
    const unlockBtn = document.getElementById('debug-unlock-achievement');
    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            const select = document.getElementById('debug-achievement-select');
            const achId = select.value;
            if (!achId) return;
            
            if (typeof unlockAchievement === 'function') {
                unlockAchievement(achId);
                addLog(`🛠️ [调试] 解锁成就: ${achId}`, 'system');
            }
        });
    }
    
    // Reset achievements
    const resetBtn = document.getElementById('debug-reset-achievements');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('确定要重置所有成就吗？')) {
                localStorage.removeItem('memory-sanctuary-achievements');
                addLog('🛠️ [调试] 所有成就已重置', 'system');
            }
        });
    }
    
    // Export state
    const exportBtn = document.getElementById('debug-export-state');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            if (!MemorySanctuary.state) return;
            
            const stateCopy = JSON.parse(JSON.stringify(MemorySanctuary.state));
            const json = JSON.stringify(stateCopy, null, 2);
            
            const textarea = document.getElementById('debug-state-json');
            textarea.value = json;
            textarea.select();
        });
    }
    
    // Import state
    const importBtn = document.getElementById('debug-import-state');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const textarea = document.getElementById('debug-state-json');
            try {
                const state = JSON.parse(textarea.value);
                if (state.resources && state.week) {
                    MemorySanctuary.state = state;
                    if (typeof renderAll === 'function') renderAll();
                    addLog('🛠️ [调试] 状态已导入', 'system');
                } else {
                    alert('无效的状态JSON：缺少resources或week字段');
                }
            } catch (e) {
                alert('JSON解析错误: ' + e.message);
            }
        });
    }
    
    // Clear saves
    const clearBtn = document.getElementById('debug-clear-state');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm('确定要清除所有存档吗？此操作不可恢复。')) {
                for (let i = 1; i <= 3; i++) {
                    localStorage.removeItem(`memory-sanctuary-save-slot-${i}`);
                    localStorage.removeItem(`memory-sanctuary-backup-slot-${i}`);
                }
                localStorage.removeItem('memory-sanctuary-current-slot');
                localStorage.removeItem('memory-sanctuary-ngplus');
                localStorage.removeItem('memory-sanctuary-achievements');
                localStorage.removeItem('memory-sanctuary-settings');
                addLog('🛠️ [调试] 所有存档已清除', 'system');
            }
        });
    }
}

function jumpToWeek(targetWeek) {
    if (!MemorySanctuary.state) return;
    
    const currentWeek = MemorySanctuary.state.week;
    if (targetWeek === currentWeek) return;
    
    if (targetWeek < currentWeek) {
        // Restart from beginning - not supported, would need full reinit
        alert('不能向后跳转周数。请重新开始新游戏。');
        return;
    }
    
    // Advance time
    const weeksToAdvance = targetWeek - currentWeek;
    if (typeof advanceTime === 'function') {
        advanceTime(weeksToAdvance);
        addLog(`🛠️ [调试] 跳转到第 ${targetWeek} 周`, 'system');
        closeDebugPanel();
    }
}

// 自动初始化（始终初始化，但仅在DEBUG=true时自动打开）
document.addEventListener('DOMContentLoaded', () => {
    initDebugPanel();
    if (typeof DEBUG !== 'undefined' && DEBUG) {
        // DEBUG模式下自动打开调试面板
        setTimeout(() => toggleDebugPanel(), 500);
    }
});

// 暴露到全局，方便浏览器控制台调用
if (typeof window !== 'undefined') {
    window.toggleDebugPanel = toggleDebugPanel;
    window.closeDebugPanel = closeDebugPanel;
    window.jumpToWeek = jumpToWeek;
}
