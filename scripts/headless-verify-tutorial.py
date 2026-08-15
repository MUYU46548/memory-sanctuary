# -*- coding: utf-8 -*-
"""综合回归：新手引导 + 面板提示条 + 项目递减（headless Edge）"""
import time, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto("http://localhost:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.5)
    # 清理 localStorage 让引导出现（但保留 help-seen 避免帮助弹窗干扰）
    page.evaluate("localStorage.clear()")
    page.evaluate("localStorage.setItem('memory-sanctuary-help-seen','seen')")
    page.reload(wait_until="networkidle")
    time.sleep(0.5)

    page.click("text=新建游戏")
    time.sleep(0.4)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.5)

    print("=== 1. 新手引导 ===")
    print("引导 overlay 可见:", page.locator("#tutorial-overlay:not(.hidden)").count() > 0)
    print("高亮框可见:", page.locator("#tutorial-highlight:not(.hidden)").count() > 0)
    print("提示文本:", (page.locator("#tutorial-text").text_content() or "")[:50])
    # 用页面函数直接推进全部步骤（避免滚动动画干扰点击）
    for i in range(9):
        page.evaluate("() => { if (typeof nextTutorialStep === 'function') nextTutorialStep(); }")
        time.sleep(0.15)
    time.sleep(0.3)
    print("9步后 overlay 隐藏:", page.locator("#tutorial-overlay.hidden").count() > 0)

    print("=== 2. 项目面板提示条 + 项目递减 ===")
    page.click("#project-btn")
    time.sleep(0.6)
    hints = page.locator(".panel-hint").all_text_contents()
    print("面板提示条:", hints)

    # 注入项目 + 推进
    page.evaluate("""
        () => {
            MemorySanctuary.state.activeProjects.push({
                id: 'proj_farm', remainingWeeks: 3, effect: { type: 'foodBoost', amount: 4 }
            });
        }
    """)
    page.click("#project-close")
    time.sleep(0.2)
    page.evaluate("() => { advanceTime(1); }")
    time.sleep(0.5)
    page.click("#project-btn")
    time.sleep(0.6)
    btns = [t.strip() for t in page.locator(".project-btn:disabled").all_text_contents() if "建设中" in t]
    print("推进1周后 UI:", btns)
    page.click("#project-close")
    page.evaluate("() => { advanceTime(1); advanceTime(1); }")
    time.sleep(0.5)
    done = page.evaluate("() => MemorySanctuary.state.completedProjects")
    print("再推进2周后 completedProjects:", done)

    print("=== 3. JS 错误 ===")
    print(errs if errs else "无")
    browser.close()
