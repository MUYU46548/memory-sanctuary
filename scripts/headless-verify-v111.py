# -*- coding: utf-8 -*-
"""
Memory Sanctuary v1.11 headless verification (Playwright + system Edge).
验证目标：
  1. 引导与帮助弹窗不再重叠（帮助在引导结束后才弹出）
  2. AI 助理环境代价 2 → 5
  3. 士气事件修正（getMoraleEventMods 数值）
  4. 士气仪式事件（低语时刻 / 合唱回响）条件触发
Run:
    python -m http.server 8099   (项目根目录)
    python scripts/headless-verify-v111.py
"""
import time, json
from playwright.sync_api import sync_playwright

RESULTS = []

def check(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    print(f"{'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))

def fresh_game_raw(page):
    """Reset storage WITHOUT help-seen / tutorial (引导可用) and start new game."""
    page.goto("http://localhost:8099/", wait_until="networkidle", timeout=30000)
    time.sleep(0.5)
    page.evaluate("localStorage.clear()")
    page.reload(wait_until="networkidle")
    time.sleep(0.5)
    page.click("text=新建游戏")
    time.sleep(0.4)
    page.locator(".save-slot-btn.new").first.click()
    time.sleep(1.5)

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    # ═══ 测试 1：引导期间帮助弹窗不出现；引导结束后帮助弹窗弹出 ═══
    fresh_game_raw(page)
    time.sleep(0.8)  # 等待 300ms 帮助弹窗窗口 + 500ms 引导窗口 全部过去

    t_overlay_hidden = page.evaluate("document.getElementById('tutorial-overlay').classList.contains('hidden')")
    m_overlay_hidden = page.evaluate("document.getElementById('modal-overlay').classList.contains('hidden')")
    check("引导出现（tutorial-overlay 可见）", t_overlay_hidden == False,
          f"hidden={t_overlay_hidden}")
    check("引导期间帮助弹窗未弹出（modal-overlay 隐藏）", m_overlay_hidden == True,
          f"hidden={m_overlay_hidden}")

    # 推进引导直至结束
    n_steps = page.evaluate("TUTORIAL_STEPS.length")
    for _ in range(n_steps + 1):
        page.evaluate("nextTutorialStep()")
        time.sleep(0.15)
    time.sleep(0.8)  # 等 endTutorial 内的 300ms 延迟

    t_overlay_hidden2 = page.evaluate("document.getElementById('tutorial-overlay').classList.contains('hidden')")
    m_overlay_hidden2 = page.evaluate("document.getElementById('modal-overlay').classList.contains('hidden')")
    m_title = page.evaluate("document.getElementById('modal-title') ? document.getElementById('modal-title').textContent : ''")
    check("引导结束后引导遮罩已隐藏", t_overlay_hidden2 == True)
    check("引导结束后帮助弹窗弹出", m_overlay_hidden2 == False and m_title == '游戏帮助',
          f"title={m_title}")

    # ═══ 测试 2：AI 助理环境代价 5 ═══
    env_before = page.evaluate("""
        const s = MemorySanctuary.state;
        s.aiAssistantActive = true;
        s.aiAssistUsedThisWeek = false;
        s.resources.energy = 150; s.resources.media = 150; s.resources.environment = 95;
        const entry = MemorySanctuary.data.archives.find(a => !MemorySanctuary.state.completedArchives.includes(a.id));
        const ok = aiAssistArchive(entry.id);
        ({ ok, envAfter: s.resources.environment, envCost: 95 - s.resources.environment });
    """)
    check("AI 助理可执行", env_before.get("ok") == True)
    check("AI 助理环境代价 = 5", env_before.get("envCost") == 5,
          f"cost={env_before.get('envCost')}, env after={env_before.get('envAfter')}")

    # ═══ 测试 3：士气事件修正数值 ═══
    mods_excellent = page.evaluate("""
        MemorySanctuary.state.guardianMoods = { tika: 7, finn: 7, misha: 7, lorn: 7, ethel: 7 };
        getMoraleEventMods();
    """)
    check("士气高昂修正 (freq 0.8 / pos 1.5 / neg 0.5)",
          mods_excellent.get("freq") == 0.8 and mods_excellent.get("positive") == 1.5 and mods_excellent.get("negative") == 0.5,
          json.dumps(mods_excellent, ensure_ascii=False))
    mods_critical = page.evaluate("""
        MemorySanctuary.state.guardianMoods = { tika: -7, finn: -7, misha: -7, lorn: -7, ethel: -7 };
        getMoraleEventMods();
    """)
    check("士气崩溃修正 (freq 1.3 / pos 0.5 / neg 1.5)",
          mods_critical.get("freq") == 1.3 and mods_critical.get("positive") == 0.5 and mods_critical.get("negative") == 1.5,
          json.dumps(mods_critical, ensure_ascii=False))

    # ═══ 测试 4：士气仪式事件条件触发 ═══
    # 4a: 崩溃 3 周 → 低语时刻
    r_whisper = page.evaluate("""
        MemorySanctuary.activeEvent = null;
        MemorySanctuary.state.moraleStreak = { critical: 3, excellent: 0 };
        MemorySanctuary.state.guardianMoods = { tika: -7, finn: -7, misha: -7, lorn: -7, ethel: -7 };
        MemorySanctuary.state.resources.food = 60; MemorySanctuary.state.resources.energy = 150;
        MemorySanctuary.state.activeEventIds = MemorySanctuary.state.activeEventIds.filter(id => id !== 'event_morale_whisper');
        checkRandomEvent();
        MemorySanctuary.activeEvent ? MemorySanctuary.activeEvent.id : null;
    """)
    check("崩溃 3 周触发「低语时刻」", r_whisper == "event_morale_whisper", f"activeEvent={r_whisper}")
    # 关闭事件面板（resolveEvent 需要清理 activeEvent）
    page.evaluate("MemorySanctuary.activeEvent = null;")

    # 4b: 高昂 3 周 → 合唱回响
    r_chorus = page.evaluate("""
        MemorySanctuary.activeEvent = null;
        MemorySanctuary.state.moraleStreak = { critical: 0, excellent: 3 };
        MemorySanctuary.state.guardianMoods = { tika: 7, finn: 7, misha: 7, lorn: 7, ethel: 7 };
        MemorySanctuary.state.activeEventIds = MemorySanctuary.state.activeEventIds.filter(id => id !== 'event_morale_chorus');
        checkRandomEvent();
        MemorySanctuary.activeEvent ? MemorySanctuary.activeEvent.id : null;
    """)
    check("高昂 3 周触发「合唱回响」", r_chorus == "event_morale_chorus", f"activeEvent={r_chorus}")
    page.evaluate("MemorySanctuary.activeEvent = null;")

    # 4c: 顺带验证饥荒预警修复（scheduled 条件事件查找源）
    r_famine = page.evaluate("""
        MemorySanctuary.activeEvent = null;
        MemorySanctuary.state.resources.food = 5;
        MemorySanctuary.state.activeEventIds = MemorySanctuary.state.activeEventIds.filter(id => id !== 'event_famine_warning_01');
        checkRandomEvent();
        MemorySanctuary.activeEvent ? MemorySanctuary.activeEvent.id : null;
    """)
    check("食物≤15 触发「饥荒预警」（潜伏 bug 修复验证）", r_famine == "event_famine_warning_01", f"activeEvent={r_famine}")
    page.evaluate("MemorySanctuary.activeEvent = null; MemorySanctuary.state.resources.food = 60;")

    # ═══ streak 更新逻辑（onTimeAdvanced 调用 updateMoraleStreak）═══
    streak_test = page.evaluate("""
        MemorySanctuary.state.moraleStreak = { critical: 0, excellent: 0 };
        MemorySanctuary.state.guardianMoods = { tika: -7, finn: -7, misha: -7, lorn: -7, ethel: -7 };
        updateMoraleStreak();
        const c = MemorySanctuary.state.moraleStreak.critical;
        MemorySanctuary.state.guardianMoods = { tika: 7, finn: 7, misha: 7, lorn: 7, ethel: 7 };
        updateMoraleStreak();
        const e2 = MemorySanctuary.state.moraleStreak.excellent;
        MemorySanctuary.state.guardianMoods = { tika: 2, finn: 2, misha: 2, lorn: 2, ethel: 2 };
        updateMoraleStreak();
        const reset = MemorySanctuary.state.moraleStreak.critical + MemorySanctuary.state.moraleStreak.excellent;
        ({ c, e2, reset });
    """)
    check("streak 追踪（崩溃+1、高昂+1、平稳归零）",
          streak_test.get("c") == 1 and streak_test.get("e2") == 1 and streak_test.get("reset") == 0,
          json.dumps(streak_test))

    # ═══ 存档同步 moraleStreak ═══
    save_ok = page.evaluate("""
        MemorySanctuary.state.moraleStreak = { critical: 2, excellent: 1 };
        saveGame(1);
        const raw = JSON.parse(localStorage.getItem('memory-sanctuary-save-slot-1') || 'null');
        raw ? raw.state.moraleStreak : null;
    """)
    check("存档同步 moraleStreak", save_ok is not None and save_ok.get("critical") == 2 and save_ok.get("excellent") == 1,
          json.dumps(save_ok))

    print("\n--- JS errors:", errs if errs else "无")
    failed = [r for r in RESULTS if not r[1]]
    print(f"总计 {len(RESULTS)} 项, 通过 {len(RESULTS)-len(failed)}, 失败 {len(failed)}")
    browser.close()
    if failed or errs:
        raise SystemExit(1)
