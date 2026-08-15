# -*- coding: utf-8 -*-
"""综合回归：引导遮罩 / 勘探布局 / AI按钮+剧情弹窗"""
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
    page.reload(wait_until="networkidle")
    time.sleep(0.5)
    page.click("text=新建游戏")
    time.sleep(0.4)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.5)

    print("=== 1. 引导遮罩（聚光灯） ===")
    print("引导 overlay 背景:", page.evaluate("getComputedStyle(document.getElementById('tutorial-overlay')).backgroundColor"))
    print("overlay 可见:", page.locator("#tutorial-overlay:not(.hidden)").count() > 0)
    # 结束引导
    for i in range(9):
        page.evaluate("() => { if (typeof nextTutorialStep === 'function') nextTutorialStep(); }")
        time.sleep(0.1)

    print("=== 2. 勘探布局 ===")
    page.click("#explore-btn")
    time.sleep(0.8)
    layout = page.evaluate("""
        () => {
            const r = (el) => { const b = el.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width)}; };
            return { left: r(document.querySelector('.explore-left')), right: r(document.querySelector('.explore-right')) };
        }
    """)
    print("left:", layout["left"], "right:", layout["right"])
    print("同行同高:", layout["left"]["y"] == layout["right"]["y"] and layout["left"]["x"] < layout["right"]["x"])
    page.click("#explore-close")
    time.sleep(0.3)

    print("=== 3. AI 按钮 + 剧情弹窗 ===")
    # 直接开启 AI 助理并给足资源，渲染条目列表
    page.evaluate("""
        () => {
            MemorySanctuary.state.aiAssistantActive = true;
            MemorySanctuary.state.resources.energy = 150;
            MemorySanctuary.state.resources.media = 150;
            MemorySanctuary.state.resources.environment = 95;
            renderAll();
        }
    """)
    time.sleep(0.5)
    ai_btns = page.locator(".ai-assist-btn")
    print("AI 辅助按钮数量:", ai_btns.count())
    # 检查按钮是否在同一行容器里
    in_actions = page.evaluate("() => !!document.querySelector('.entry-actions .ai-assist-btn')")
    print("AI 按钮在 .entry-actions 容器内:", in_actions)

    if ai_btns.count() > 0:
        ai_btns.first.click()
        time.sleep(0.8)
        modal_title = page.locator("#modal-title").text_content() if page.locator("#modal-title").count() else None
        modal_visible = page.locator("#modal-overlay:not(.hidden)").count() > 0
        modal_content = (page.locator("#modal-content").text_content() or "")[:80]
        print("剧情弹窗显示:", modal_visible)
        print("弹窗标题:", modal_title)
        print("弹窗内容前80字:", modal_content.replace(chr(10), ' '))
        print("aiAssistCount:", page.evaluate("() => MemorySanctuary.state.aiAssistCount"))

    print("=== 4. JS 错误 ===")
    print(errs if errs else "无")
    browser.close()
