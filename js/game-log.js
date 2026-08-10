/**
 * game-log.js - 从 game.js 拆分的模块
 * 包含: initLogSystem, initLogFilter, applyLogFilter...
 */

function initLogSystem() {
    const toggle = document.getElementById('log-toggle');
    const closeBtn = document.getElementById('log-close');
    const copyBtn = document.getElementById('log-copy');
    const panel = document.getElementById('log-panel');

    // 初始化筛选按钮事件
    initLogFilter();

    if (toggle) {
        toggle.addEventListener('click', () => {
            // 点击按钮即清零红点
            clearUnread();
            
            panel.classList.toggle('hidden');
            logPanelOpen = !panel.classList.contains('hidden');
            if (logPanelOpen) {
                const logContent = document.getElementById('log-content');
                if (logContent) logContent.scrollTop = logContent.scrollHeight;
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
            logPanelOpen = false;
        });
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const logContent = document.getElementById('log-content');
            if (!logContent) return;
            
            // 只复制当前筛选可见的日志
            const entries = logContent.querySelectorAll('.log-entry:not(.filtered-out)');
            const text = Array.from(entries).map(e => e.textContent).join('\n');
            
            navigator.clipboard.writeText(text).then(() => {
                copyBtn.textContent = '✓ 已复制';
                setTimeout(() => {
                    copyBtn.textContent = '📋 复制';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                copyBtn.textContent = '✓ 已复制';
                setTimeout(() => {
                    copyBtn.textContent = '📋 复制';
                }, 2000);
            });
        });
    }
}


function initLogFilter() {
    const filterBar = document.getElementById('log-filter-bar');
    if (!filterBar) return;
    
    filterBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.log-filter');
        if (!btn) return;
        
        // 更新激活状态
        filterBar.querySelectorAll('.log-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 应用筛选
        logFilter = btn.dataset.filter;
        applyLogFilter();
    });
}


function applyLogFilter() {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;
    
    const entries = logContent.querySelectorAll('.log-entry');
    entries.forEach(entry => {
        const types = entry.className.replace('log-entry', '').trim().split(/\s+/);
        const matches = logFilter === 'all' || types.includes(logFilter);
        entry.classList.toggle('filtered-out', !matches);
    });
}


function updateUnreadBadge() {
    const badge = document.getElementById('log-unread');
    if (!badge) return;

    if (logUnreadCount > 0) {
        badge.textContent = logUnreadCount > 99 ? '99+' : logUnreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}


function clearUnread() {
    logUnreadCount = 0;
    updateUnreadBadge();
}


function addLog(message, type = 'system') {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[第${MemorySanctuary.state.week}周] ${message}`;

    // 重要日志标记为固定（不会被截断）
    const pinnedTypes = ['success', 'event', 'warning'];
    if (pinnedTypes.some(t => type.split(/\s+/).includes(t))) {
        entry.classList.add('pinned');
    }

    // 如果当前筛选不匹配，立即标记为隐藏
    if (logFilter !== 'all' && !type.split(/\s+/).includes(logFilter)) {
        entry.classList.add('filtered-out');
    }

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;

    // 截断策略：只删除未固定的旧日志
    const entries = logContent.querySelectorAll('.log-entry');
    if (entries.length > 200) {
        // 找到最旧的非固定日志删除
        for (const e of entries) {
            if (!e.classList.contains('pinned')) {
                e.remove();
                break;
            }
        }
    }

    // 如果面板关闭，增加未读计数
    if (!logPanelOpen) {
        logUnreadCount++;
        updateUnreadBadge();
    }
}
