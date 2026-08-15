# -*- coding: utf-8 -*-
"""勘探面板布局实测"""
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
    time.sleep(1.2)

    # 打开勘探面板
    page.click("#explore-btn")
    time.sleep(0.8)

    layout = page.evaluate("""
        () => {
            const r = (el) => el ? (() => { const b = el.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; })() : null;
            return {
                panel: r(document.getElementById('explore-panel')),
                body: r(document.querySelector('.explore-body')),
                left: r(document.querySelector('.explore-left')),
                right: r(document.querySelector('.explore-right')),
                list: r(document.getElementById('explore-list-container')),
                dispatch: r(document.getElementById('explore-dispatch')),
                placeholder: r(document.getElementById('explore-placeholder')),
                listItems: document.querySelectorAll('.explore-item').length,
                dispatchVisible: document.getElementById('explore-dispatch') ? !document.getElementById('explore-dispatch').classList.contains('hidden') : null,
                bodyDisplay: document.querySelector('.explore-body') ? getComputedStyle(document.querySelector('.explore-body')).display : null,
                bodyCols: document.querySelector('.explore-body') ? getComputedStyle(document.querySelector('.explore-body')).gridTemplateColumns : null
            };
        }
    """)
    print(json.dumps(layout, ensure_ascii=False, indent=2))
    print("JS errors:", errs)
    browser.close()
