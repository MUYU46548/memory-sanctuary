// ============================================================
// 版本更新检测（轻量方案 A）
// 标题界面加载后异步检查远程 version.json，与本地 GAME_VERSION 比对；
// 有新版则右下角非阻塞提示 + 跳转下载页。
// 任何失败（超时/网络/CORS/解析）一律静默降级，绝不阻塞游戏启动。
// 零依赖：仅用 fetch + DOM，符合零构建约束。
// ============================================================

const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/MUYU46548/memory-sanctuary/main/version.json';
const UPDATE_IGNORE_KEY = 'memory-sanctuary-update-ignored';

// 语义化版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0
function compareVersion(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

function hideUpdateToast() {
    const toast = document.getElementById('update-toast');
    if (!toast) return;
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 320);
}

function showUpdateToast(remote) {
    const toast = document.getElementById('update-toast');
    if (!toast) return;

    const verEl = document.getElementById('update-toast-version');
    const notesEl = document.getElementById('update-toast-notes');
    const dlEl = document.getElementById('update-toast-download');
    const ignoreEl = document.getElementById('update-toast-ignore');

    if (verEl) verEl.textContent = `v${remote.version}`;
    if (notesEl) notesEl.textContent = remote.notes || '';
    // 仅允许 http(s) 链接，拒绝 javascript:/data: 等注入载体
    if (dlEl && typeof remote.downloadUrl === 'string' && /^https?:\/\//.test(remote.downloadUrl)) {
        dlEl.href = remote.downloadUrl;
    }

    if (ignoreEl) {
        ignoreEl.onclick = () => {
            try { localStorage.setItem(UPDATE_IGNORE_KEY, remote.version); } catch (e) {}
            hideUpdateToast();
        };
    }

    // 先移除 hidden 使其可显示，下一帧加 show 触发过渡
    toast.classList.remove('hidden');
    requestAnimationFrame(() => toast.classList.add('show'));
}

async function checkForUpdate() {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${UPDATE_CHECK_URL}?t=${Date.now()}`, {
            signal: controller.signal,
            cache: 'no-store'
        });
        clearTimeout(timer);
        if (!res.ok) return; // 静默降级

        const remote = await res.json();
        if (!remote || !remote.version) return;

        // 已忽略该版本则不再打扰
        let ignored = null;
        try { ignored = localStorage.getItem(UPDATE_IGNORE_KEY); } catch (e) {}
        if (ignored === remote.version) return;

        // 本地版本来自 main.js 全局常量 GAME_VERSION（单一来源）
        const local = (typeof GAME_VERSION !== 'undefined') ? GAME_VERSION : '0.0.0';
        if (compareVersion(remote.version, local) > 0) {
            showUpdateToast(remote);
        }
    } catch (e) {
        // 网络/CORS/超时/解析失败：静默忽略，游戏照常进行
        if (typeof DEBUG !== 'undefined' && DEBUG) {
            console.warn('[更新检测] 已跳过（不影响游戏）:', e);
        }
    }
}
