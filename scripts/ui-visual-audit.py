# -*- coding: utf-8 -*-
"""
Memory Sanctuary UI 视觉审查脚本 v2（重叠 / 文本溢出 / 控制台错误 / 特殊状态注入）
用法：
  python -m http.server 8099        (项目根目录)
  python scripts/ui-visual-audit.py
"""
import time, json, sys
from playwright.sync_api import sync_playwright

HOST = "http://localhost:8099/"
RESULTS = []

def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (("  | " + detail) if detail else ""))

def fresh_game(page, skip_tutorial=True):
    page.goto(HOST, wait_until="networkidle", timeout=30000)
    page.evaluate("localStorage.clear()")
    if skip_tutorial:
        page.evaluate("localStorage.setItem('memory-sanctuary-tutorial','1')")
    page.reload(wait_until="networkidle")
    time.sleep(0.3)
    page.click("text=新建游戏")
    time.sleep(0.3)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.8)

OVERLAP_JS = """() => {
    const cache = new Map();
    const visibleRect = (el) => {
        if (cache.has(el)) return cache.get(el);
        let rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) { cache.set(el, null); return null; }
        let p = el.parentElement;
        while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            const ovx = cs.overflowX, ovy = cs.overflowY;
            if (ovx !== 'visible' || ovy !== 'visible') {
                const pr = p.getBoundingClientRect();
                const clip = {
                    left: Math.max(rect.left, pr.left), top: Math.max(rect.top, pr.top),
                    right: Math.min(rect.right, pr.right), bottom: Math.min(rect.bottom, pr.bottom)
                };
                if (clip.right <= clip.left || clip.bottom <= clip.top) { cache.set(el, null); return null; }
                rect = clip;
            }
            p = p.parentElement;
        }
        cache.set(el, rect);
        return rect;
    };
    const inOverlay = (el) => {
        let p = el;
        while (p) {
            const id = p.id || '';
            const cls = typeof p.className === 'string' ? p.className : '';
            if (/overlay|modal/i.test(id + ' ' + cls)) return true;
            p = p.parentElement;
        }
        return false;
    };
    const out = [];
    const els = [...document.querySelectorAll('body *')].filter(el => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
        if (el.closest('.hidden')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 5 && r.height > 5;
    });
    for (let i = 0; i < els.length; i++) {
        const a = els[i], ra = visibleRect(a);
        if (!ra) continue;
        if (ra.bottom < 0 || ra.top > innerHeight || ra.right < 0 || ra.left > innerWidth) continue;
        const aOv = inOverlay(a);
        for (let j = i + 1; j < els.length; j++) {
            const b = els[j], rb = visibleRect(b);
            if (!rb) continue;
            if (rb.bottom < 0 || rb.top > innerHeight || rb.right < 0 || rb.left > innerWidth) continue;
            const bOv = inOverlay(b);
            if (aOv !== bOv) continue; // 弹层/遮罩与背景交叠是设计
            const ix = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left));
            const iy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top));
            const inter = ix * iy;
            if (inter <= 0) continue;
            if (a.contains(b) || b.contains(a)) continue;
            if (a.tagName === 'CANVAS' || b.tagName === 'CANVAS') continue;
            // 未读徽标等小角标：与相邻元素边缘相交属设计
            if ((a.id === 'log-unread') || (b.id === 'log-unread')) continue;
            const minArea = Math.min(ra.width * ra.height, rb.width * rb.height);
            if (inter / minArea < 0.10) continue;
            out.push({
                a: (a.id ? '#' + a.id : a.className ? '.' + String(a.className).split(' ').join('.') : a.tagName),
                b: (b.id ? '#' + b.id : b.className ? '.' + String(b.className).split(' ').join('.') : b.tagName),
                interPct: Math.round(inter / minArea * 100),
                aRect: [Math.round(ra.left), Math.round(ra.top), Math.round(ra.width), Math.round(ra.height)],
                bRect: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)]
            });
        }
    }
    return out;
}"""

OVERFLOW_JS = """() => {
    // 已知安全的白名单（精确测量/截图确认过，非真实视觉溢出）：
    //  - #log-toggle：flex 容器 scrollWidth 含 gap/padding 舍入，label 实测完全在按钮内
    //  - #guardian-avatar：emoji 字形 advance width 噪音，48px 容器完整显示
    const SAFE_IDS = new Set(['log-toggle', 'guardian-avatar']);
    const out = [];
    document.querySelectorAll('body *').forEach(el => {
        if (SAFE_IDS.has(el.id)) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        if (el.closest('.hidden')) return;
        if (el.scrollWidth > el.clientWidth + 3 && cs.overflowX !== 'hidden' && cs.whiteSpace !== 'nowrap') {
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            out.push({
                el: (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ').join('.') : el.tagName),
                text: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 40),
                sw: el.scrollWidth, cw: el.clientWidth,
                rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]
            });
        }
    });
    return out;
}"""

def audit(page, label, shots=[]):
    time.sleep(0.5)
    ov = page.evaluate(OVERLAP_JS)
    of = page.evaluate(OVERFLOW_JS)
    check(f"[{label}] 元素重叠", len(ov) == 0, json.dumps(ov[:8], ensure_ascii=False))
    check(f"[{label}] 文本溢出", len(of) == 0, json.dumps(of[:8], ensure_ascii=False))
    for tag in shots:
        page.screenshot(path=f"scripts/audit-{label.replace(' ','-')}-{tag}.png")
    return ov, of

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)

    for vw, vh in [(1600, 900), (1280, 800)]:
        page = browser.new_page(viewport={"width": vw, "height": vh})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

        fresh_game(page)
        time.sleep(0.8)

        audit(page, f"{vw}x{vh} 主界面", shots=["main"])
        page.screenshot(path=f"scripts/audit-{vw}x{vh}-main-full.png", full_page=True)

        for tab in ["guardian", "vault", "tech"]:
            page.click(f".action-tab[data-tab='{tab}']")
            time.sleep(0.4)
            audit(page, f"{vw}x{vh} 标签-{tab}")

        page.click(".action-tab[data-tab='archive']")
        time.sleep(0.4)

        # 勘探面板
        try:
            page.evaluate("""() => { const b = document.querySelector('#explore-btn') || document.querySelector('.explore-btn') || document.querySelector('[id*="explore"][id*="btn"]'); if (b) b.click(); }""")
            time.sleep(0.6)
            audit(page, f"{vw}x{vh} 勘探面板", shots=["explore"])
            page.evaluate("""() => { const c = document.querySelector('#explore-overlay .close-btn') || document.querySelector('#explore-close'); if (c) c.click(); }""")
            time.sleep(0.3)
        except Exception as e:
            check(f"[{vw}x{vh}] 勘探面板打开", False, str(e)[:100])

        # 特殊状态 1：环境归零 → env-warning 横幅
        page.evaluate("""() => {
            const st = MemorySanctuary.state;
            st.resources.environment = 0;
            if (typeof renderAll === 'function') renderAll();
        }""")
        time.sleep(0.4)
        ov = page.evaluate(OVERLAP_JS)
        of = page.evaluate(OVERFLOW_JS)
        banner_ok = page.evaluate("""() => {
            const w = document.getElementById('env-warning');
            return !!w && !w.classList.contains('hidden') && w.offsetHeight > 0;
        }""")
        check(f"[{vw}x{vh}] 环境归零横幅显示", banner_ok)
        check(f"[{vw}x{vh}] 环境归零无重叠", len(ov) == 0, json.dumps(ov[:6], ensure_ascii=False))
        check(f"[{vw}x{vh}] 环境归零无溢出", len(of) == 0, json.dumps(of[:6], ensure_ascii=False))
        page.screenshot(path=f"scripts/audit-{vw}x{vh}-envzero.png")
        # 恢复
        page.evaluate("""() => { MemorySanctuary.state.resources.environment = 50; if (typeof renderAll === 'function') renderAll(); }""")
        time.sleep(0.3)

        # 特殊状态 2：全局死局 → deadlock 横幅（注入资源 + 伪造饥饿螺旋）
        page.evaluate("""() => {
            const st = MemorySanctuary.state;
            st.resources.food = 0;
            st.starvationWeeks = 3;
            st.resources.energy = 2;
            st.resources.media = 2;
            // 让所有可见条目不可归档：用 energy 衰竭翻倍惩罚 + 低资源
            if (typeof checkStuckState === 'function') checkStuckState();
        }""")
        time.sleep(0.4)
        dead_ok = page.evaluate("""() => {
            const b = document.getElementById('stuck-banner');
            return !!b && b.className.includes('deadlock');
        }""")
        check(f"[{vw}x{vh}] 死局横幅 deadlock 样式", dead_ok)
        if dead_ok:
            ov = page.evaluate(OVERLAP_JS)
            of = page.evaluate(OVERFLOW_JS)
            check(f"[{vw}x{vh}] 死局横幅无重叠", len(ov) == 0, json.dumps(ov[:6], ensure_ascii=False))
            check(f"[{vw}x{vh}] 死局横幅无溢出", len(of) == 0, json.dumps(of[:6], ensure_ascii=False))
            page.screenshot(path=f"scripts/audit-{vw}x{vh}-deadlock.png")

        check(f"[{vw}x{vh}] 无页面/控制台错误", len(errs) == 0, "; ".join(errs[:5])[:200])
        page.close()

    browser.close()

print("=== SUMMARY ===")
fails = [r for r in RESULTS if not r[1]]
print(f"{len(RESULTS) - len(fails)}/{len(RESULTS)} passed")
for f in fails:
    print("FAIL:", f[0], "|", f[2][:300])
sys.exit(1 if fails else 0)
