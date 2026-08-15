# -*- coding: utf-8 -*-
"""验证：立即归档弹窗 / 介质豁免改名 / 历史最高好感度"""
import time, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto("http://localhost:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.5)
    page.evaluate("localStorage.clear()")
    page.evaluate("localStorage.setItem('memory-sanctuary-help-seen','seen')")
    page.evaluate("localStorage.setItem('memory-sanctuary-tutorial','completed')")
    page.reload(wait_until="networkidle")
    time.sleep(0.5)
    page.click("text=新建游戏")
    time.sleep(0.4)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.5)

    print("=== 1. 介质豁免改名 ===")
    page.evaluate("() => { if (typeof openEmergencyProtocol === 'function') openEmergencyProtocol(); }")
    time.sleep(0.5)
    names = page.locator(".emergency-name").all_text_contents()
    print("应急协议列表:", [n.strip()[:20] for n in names])
    page.keyboard.press("Escape")
    page.evaluate("() => { document.getElementById('emergency-overlay').classList.add('hidden'); }")

    print("=== 2. 立即归档剧情弹窗 ===")
    page.evaluate("""
        () => {
            MemorySanctuary.state.instantArchiveChances = 1;
            MemorySanctuary.state.resources.energy = 150;
            MemorySanctuary.state.resources.media = 150;
            renderAll();
        }
    """)
    time.sleep(0.4)
    r = page.evaluate("""
        () => {
            const entry = MemorySanctuary.data.archives.find(a => !MemorySanctuary.state.completedArchives.includes(a.id));
            const ok = useInstantArchive(entry.id);
            return { ok, title: document.getElementById('modal-title').textContent,
                     modalVisible: !document.getElementById('modal-overlay').classList.contains('hidden'),
                     chances: MemorySanctuary.state.instantArchiveChances };
        }
    """)
    print("useInstantArchive:", json.dumps(r, ensure_ascii=False))
    page.evaluate("() => { document.getElementById('modal-overlay').classList.add('hidden'); }")

    print("=== 3. 历史最高好感度 ===")
    page.evaluate("""
        () => {
            const ng = getNGPlusData();
            ng.guardianHistory = [
                { playthrough: 1, week: 40, moods: { tika: { tier: 'friendly' }, finn: { tier: 'neutral' } } },
                { playthrough: 2, week: 35, moods: { tika: { tier: 'intimate' }, finn: { tier: 'friendly' } } }
            ];
            saveNGPlusData(ng);
            renderGuardianDetail();
        }
    """)
    time.sleep(0.3)
    detail = page.locator("#guardian-detail-panel").text_content()
    has_history = "历史最深羁绊" in detail
    print("详情面板含历史羁绊:", has_history)
    if has_history:
        import re
        m = re.search(r"历史最深羁绊：([^\n（]+)", detail)
        print("历史羁绊文本:", m.group(1).strip() if m else detail[:120])

    print("=== JS 错误 ===")
    print(errs if errs else "无")
    browser.close()
