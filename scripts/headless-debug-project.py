# -*- coding: utf-8 -*-
"""深度调试：为什么 remainingWeeks 不递减"""
import time, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto("http://localhost:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.5)
    page.evaluate("localStorage.setItem('memory-sanctuary-help-seen','seen')")
    page.evaluate("localStorage.setItem('memory-sanctuary-tutorial','completed')")
    page.reload(wait_until="networkidle")
    time.sleep(0.5)
    page.click("text=新建游戏")
    time.sleep(0.4)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.2)

    # 注入项目
    page.evaluate("""
        () => {
            MemorySanctuary.state.activeProjects.push({
                id: 'proj_farm', remainingWeeks: 5, effect: { type: 'foodBoost', amount: 4 }
            });
        }
    """)

    r = page.evaluate("""
        () => {
            const out = {};
            // 1. override 是否生效？
            out.overrideBody = onTimeAdvanced.toString().slice(0, 180);
            out.hasProcessCall = onTimeAdvanced.toString().includes('processActiveProjects');
            // 2. 直接调用 processActiveProjects
            const before = JSON.stringify(MemorySanctuary.state.activeProjects.map(p => p.remainingWeeks));
            let directError = null;
            try { processActiveProjects(); } catch (e) { directError = String(e); }
            const after = JSON.stringify(MemorySanctuary.state.activeProjects.map(p => p.remainingWeeks));
            out.directBefore = before;
            out.directAfter = after;
            out.directError = directError;
            // 3. getProjectById 是否找到 farm
            out.farmFound = !!getProjectById('proj_farm');
            out.farmName = getProjectById('proj_farm') ? getProjectById('proj_farm').name : null;
            return out;
        }
    """)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    print("page errors:", errs)
    browser.close()
