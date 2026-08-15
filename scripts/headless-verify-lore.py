# -*- coding: utf-8 -*-
"""验证：守护者背景档案 + 回忆片段解锁与弹窗"""
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

    # 打开详情面板（展开 hidden）
    page.evaluate("() => { document.getElementById('guardian-detail-panel').classList.remove('hidden'); }")
    page.evaluate("() => { renderGuardianDetail(); }")
    time.sleep(0.3)
    d1 = page.locator("#guardian-detail-panel").text_content()
    print("=== 第1周目（ptCount=0）===")
    print("含背景档案区:", "背景档案" in d1)
    print("档案锁定:", "？？？" in d1 and "往事未显" in d1)
    print("回忆锁定按钮:", page.locator(".guardian-memory-btn.locked").count(), "个")
    print("可点击回忆:", page.locator(".guardian-memory-btn:not(.locked)").count(), "个")

    # 注入：历史亲密 + 第2周目
    page.evaluate("""
        () => {
            const ng = getNGPlusData();
            ng.playthroughCount = 2;
            ng.guardianHistory = [
                { playthrough: 1, week: 40, moods: { tika: { tier: 'neutral' } } },
                { playthrough: 2, week: 35, moods: { tika: { tier: 'intimate' } } }
            ];
            saveNGPlusData(ng);
            renderGuardianDetail();
        }
    """)
    time.sleep(0.4)
    d2 = page.locator("#guardian-detail-panel").text_content()
    print("=== 第2周目 + 历史亲密 ===")
    print("档案已解锁(含'萨拉达斯'):", "萨拉达斯" in d2)
    print("可点击回忆:", page.locator(".guardian-memory-btn:not(.locked)").count(), "个")
    print("锁定回忆:", page.locator(".guardian-memory-btn.locked").count(), "个")

    # 点击第一个可点击回忆
    first_mem = page.locator(".guardian-memory-btn:not(.locked)").first
    if first_mem.count() > 0:
        mem_title = first_mem.text_content()
        first_mem.click()
        time.sleep(0.5)
        modal_title = page.locator("#modal-title").text_content()
        modal_visible = page.locator("#modal-overlay:not(.hidden)").count() > 0
        modal_len = len(page.locator("#modal-content").text_content() or "")
        print(f"点击「{mem_title}」→ 弹窗显示: {modal_visible}, 标题: {modal_title}, 内容长度: {modal_len}")

    print("=== JS 错误 ===")
    print(errs if errs else "无")
    browser.close()
