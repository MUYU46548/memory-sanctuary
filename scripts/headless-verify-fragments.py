# -*- coding: utf-8 -*-
"""v0.2.6 勘探重设计 headless 验证（时序修正版）
结果写入 verify-result.txt（UTF-8）。
"""
import time, io
from playwright.sync_api import sync_playwright

OUT = io.StringIO()
def log(*a):
    s = " ".join(str(x) for x in a)
    OUT.write(s + "\n")
    print(s)

fails = []
def check(label, cond, detail=""):
    mark = "✓" if cond else "✗"
    log(f"[{mark}] {label}" + (f" — {detail}" if detail else ""))
    if not cond:
        fails.append(label)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    page.goto("http://127.0.0.1:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.5)
    page.evaluate("localStorage.clear()")
    page.evaluate("localStorage.setItem('memory-sanctuary-help-seen','seen')")
    page.evaluate("localStorage.setItem('memory-sanctuary-tutorial','completed')")
    page.reload(wait_until="networkidle")
    time.sleep(0.5)

    page.click("text=新建游戏")
    time.sleep(0.3)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.0)

    data_arch = page.evaluate("MemorySanctuary.data.archives.length")
    data_exp = page.evaluate("MemorySanctuary.data.explorations.length")
    log(f"数据: 归档 {data_arch} 条 · 勘探点 {data_exp} 个")
    check("202 条归档（146+56）", data_arch == 202, str(data_arch))
    check("34 个勘探点（28+6）", data_exp == 34, str(data_exp))

    # ── 1. 勘探面板徽章 ──
    page.click("#explore-btn")
    page.wait_for_selector("#explore-list .explore-item", timeout=5000)
    time.sleep(0.5)
    frag_badges = page.locator(".explore-item-frag").count()
    bot_badges = page.locator(".explore-item:has-text('机器人专属')").count()
    check("勘探列表显示碎片徽章", frag_badges >= 5, f"{frag_badges} 个")
    check("机器人专属勘探点徽章", bot_badges == 8, f"{bot_badges} 个")

    # ── 2. 地表勘探（第 1 周，寂静之城，碎片窗口 3-20） ──
    page.locator(".explore-item:has-text('寂静之城')").first.click()
    page.wait_for_function(
        "document.getElementById('dispatch-btn').textContent.includes('派遣勘探队')",
        timeout=5000)
    # 碎片奖励提示
    outcomes_text = page.evaluate("document.getElementById('dispatch-outcomes').textContent")
    check("派遣面板显示碎片奖励提示", "碎片" in outcomes_text, outcomes_text[:60].replace(chr(10), ' '))
    # 普通点有守护者网格
    guard_grid = page.evaluate("document.querySelectorAll('.dispatch-guardian').length")
    check("普通点保留守护者选择网格", guard_grid > 0, str(guard_grid))
    page.locator(".dispatch-guardian:not(.fatigued)").first.click()
    page.click("#dispatch-btn")
    page.wait_for_function(
        "MemorySanctuary.state.unlockedFragments.includes('arch_sf_ruins_01')", timeout=5000)
    log("— 勘探返回，arch_sf_ruins_01 已解锁 —")

    # 第 3 周碎片窗口开启后出现在归档列表（先切到归档标签页）
    page.evaluate("""
        MemorySanctuary.state.week = 4;
        MemorySanctuary.currentVaultId = 3;
        document.querySelectorAll('.action-tab').forEach(b => b.classList.remove('active'));
        const ab = document.querySelector('.action-tab[data-tab="archive"]');
        if (ab) { ab.classList.add('active'); switchActionTab('archive'); }
        renderAll();
    """)
    time.sleep(0.6)
    list_text = page.evaluate("document.getElementById('entry-list') ? document.getElementById('entry-list').textContent : ''")
    check("已发现碎片进入归档列表", "广场钟楼" in list_text, list_text[:80])
    check("未发现碎片不出现在列表", "最后一片绿叶标本" not in list_text, "")
    blocked = page.evaluate("""
        (function(){
            const before = MemorySanctuary.state.completedArchives.length;
            const r = archiveEntry('arch_sf_forest_02');
            return r === false && MemorySanctuary.state.completedArchives.length === before;
        })()
    """)
    check("未发现碎片 archiveEntry 被拦截", blocked)
    archived = page.evaluate("""
        (function(){
            const r = archiveEntry('arch_sf_ruins_01', 'standard');
            return r === true && MemorySanctuary.state.completedArchives.includes('arch_sf_ruins_01');
        })()
    """)
    check("已发现碎片可正常归档", archived)
    # 关闭归档完成弹窗（挡住后续点击）
    page.evaluate("if (window.closeModal) closeModal();")
    time.sleep(0.3)

    # ── 3. 机器人专属点（第 20 周，管网/库房已解锁） ──
    page.evaluate("MemorySanctuary.state.week = 20; renderAll()")
    time.sleep(0.3)
    page.evaluate("openExplorePanel()")
    time.sleep(0.5)
    page.locator(".explore-item:has-text('地下管网维护区')").first.click()
    try:
        page.wait_for_function(
            "document.getElementById('dispatch-btn').textContent.includes('机器人编队')",
            timeout=4000)
        bot_ok = True
    except Exception:
        bot_ok = False
    check("机器人点派遣按钮=派遣机器人编队", bot_ok,
          page.evaluate("document.getElementById('dispatch-btn').textContent"))
    bot_only_text = page.evaluate("document.getElementById('dispatch-guardians').textContent")
    check("机器人自动派遣提示", "工程机器人编队" in bot_only_text, bot_only_text[:80].replace(chr(10), ' '))
    guard_grid_bot = page.evaluate("document.querySelectorAll('.dispatch-guardian').length")
    check("机器人点无守护者选择网格", guard_grid_bot == 0, str(guard_grid_bot))

    # 自动化农场（双碎片）检查：avail 24，先把周数推到 25
    page.evaluate("MemorySanctuary.state.week = 25; renderAll(); openExplorePanel()")
    time.sleep(0.4)
    page.locator(".explore-item:has-text('自动化农场废墟')").first.click()
    time.sleep(0.4)
    farm_outcomes = page.evaluate("document.getElementById('dispatch-outcomes').textContent")
    check("机器人点显示碎片×2提示", "碎片 ×2" in farm_outcomes, farm_outcomes[:80].replace(chr(10), ' '))
    page.click("#explore-close")
    time.sleep(0.3)

    # ── 4. 机器人定期产出 ──
    page.evaluate("""
        MemorySanctuary.state.week = 24;
        MemorySanctuary.state.botPassiveTick = 3;
        MemorySanctuary.state.resources.energy = 200;
        MemorySanctuary.activeEvent = null;
        renderAll();
    """)
    time.sleep(0.3)
    page.evaluate("if (typeof advanceTime === 'function') { advanceTime(1); renderAll(); }")
    time.sleep(0.5)
    passive_unlocked = page.evaluate("MemorySanctuary.state.unlockedFragments")
    check("被动产出解锁 arch_bot_log_03", "arch_bot_log_03" in passive_unlocked, str(passive_unlocked))

    # ── 5. 紧急稳定 ──
    page.evaluate("""
        MemorySanctuary.state.resources.environment = 12;
        MemorySanctuary.state.resources.energy = 100;
        MemorySanctuary.state.botStabilizeLogged = false;
        MemorySanctuary.activeEvent = null;
        renderAll();
    """)
    time.sleep(0.2)
    page.evaluate("if (typeof advanceTime === 'function') { advanceTime(1); renderAll(); }")
    time.sleep(0.5)
    env_after = page.evaluate("MemorySanctuary.state.resources.environment")
    energy_after = page.evaluate("MemorySanctuary.state.resources.energy")
    check("紧急稳定回抬环境", env_after > 12, f"env {env_after:.1f}")
    check("紧急稳定消耗能源", energy_after < 100, f"energy {energy_after:.1f}")

    # ── 6. JS 错误 ──
    real_errs = [e for e in errs if 'favicon' not in e.lower()]
    check("无 JS 报错", len(real_errs) == 0, str(real_errs[:5]))

    browser.close()

log("")
log("=== 结果 ===")
log("全部通过" if not fails else f"失败项: {fails}")

with open("verify-result.txt", "w", encoding="utf-8") as f:
    f.write(OUT.getvalue())
