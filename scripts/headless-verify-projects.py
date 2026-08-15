# -*- coding: utf-8 -*-
"""无头验证：项目剩余周数递减 + UI 显示（headless Edge，不碰用户浏览器）"""
import time, json
from playwright.sync_api import sync_playwright

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

results = {}

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})

    page_errors = []
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    page.goto("http://localhost:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.8)

    # 关闭首次帮助弹窗：先标记已看过
    page.evaluate("localStorage.setItem('memory-sanctuary-help-seen','seen')")
    page.evaluate("localStorage.setItem('memory-sanctuary-tutorial','completed')")
    page.reload(wait_until="networkidle")
    time.sleep(0.8)

    # 新建游戏：点"新游戏" -> 选第一个槽位
    page.click("text=新建游戏")
    time.sleep(0.5)
    new_btns = page.locator(".save-slot-btn.new")
    log(f"空槽位按钮数: {new_btns.count()}")
    if new_btns.count() == 0:
        # 有存档？先用删除清空槽位
        delete_btns = page.locator(".save-slot-btn.delete")
        for i in range(delete_btns.count()):
            page.on("dialog", lambda d: d.accept())
            delete_btns.nth(0).click()
            time.sleep(0.3)
        page.reload(wait_until="networkidle")
        time.sleep(0.5)
        page.click("text=新建游戏")
        time.sleep(0.5)
    new_btns = page.locator(".save-slot-btn.new")
    log(f"清空后空槽位按钮数: {new_btns.count()}")
    new_btns.first.click()
    time.sleep(1.5)

    log("已进入新游戏。第1周初始状态。")

    # ===== 验证 1：手动注入一个"建设中"项目（模拟已启动 farm），检查 UI 文本 =====
    page.evaluate("""
        () => {
            MemorySanctuary.state.activeProjects.push({
                id: 'proj_farm',
                remainingWeeks: 5,
                effect: { type: 'foodBoost', amount: 4 }
            });
        }
    """)
    time.sleep(0.3)

    page.click("#project-btn")
    time.sleep(0.8)
    texts_before = [t.strip() for t in page.locator(".project-btn:disabled").all_text_contents() if "建设中" in t]
    results["ui_before"] = texts_before
    state_before = page.evaluate("() => JSON.stringify(MemorySanctuary.state.activeProjects)")
    results["state_before"] = json.loads(state_before) if state_before else []
    log(f"注入后 UI: {texts_before}")
    log(f"注入后 state: {results['state_before']}")
    page.click("#project-close")
    time.sleep(0.3)

    # ===== 验证 2：推进 2 周 =====
    page.evaluate("() => { advanceTime(1); advanceTime(1); }")
    time.sleep(0.8)
    results["week_after2"] = page.evaluate("() => MemorySanctuary.state.week")
    log(f"推进后 week = {results['week_after2']}")

    # 推进期间跳过? 直接 UI 检查
    page.click("#project-btn")
    time.sleep(0.8)
    texts_after = [t.strip() for t in page.locator(".project-btn:disabled").all_text_contents() if "建设中" in t]
    results["ui_after2"] = texts_after
    state_after = page.evaluate("() => JSON.stringify(MemorySanctuary.state.activeProjects)")
    results["state_after2"] = json.loads(state_after) if state_after else []
    log(f"2周后 UI: {texts_after}")
    log(f"2周后 state: {results['state_after2']}")

    # ===== 验证 3：继续推进至完成 =====
    page.click("#project-close")
    page.evaluate("() => { advanceTime(1); advanceTime(1); advanceTime(1); }")
    time.sleep(0.8)
    results["week_after5"] = page.evaluate("() => MemorySanctuary.state.week")
    completed = page.evaluate("() => MemorySanctuary.state.completedProjects")
    results["completed_projects"] = completed
    log(f"共5周后 week = {results['week_after5']}, completedProjects = {completed}")

    page.click("#project-btn")
    time.sleep(0.8)
    texts_done = [t.strip() for t in page.locator(".project-btn:disabled").all_text_contents()]
    results["ui_after5"] = texts_done
    log(f"5周后 UI: {texts_done}")

    results["page_errors"] = page_errors[:5]
    log(f"JS错误: {page_errors[:5]}")

    browser.close()

print("\n===== 结果 JSON =====")
print(json.dumps(results, ensure_ascii=False, indent=2))
