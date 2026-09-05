# -*- coding: utf-8 -*-
"""v0.2.7 深度回归：12 周游戏循环（归档/勘探/项目/事件/存档）+ 新字段持久化"""
import time, json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    page.goto("http://127.0.0.1:8098/", wait_until="networkidle", timeout=30000)
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

    # 12 周循环：归档 → 偶发勘探/项目/跳过
    r = page.evaluate("""
        () => {
            const log = [];
            const state = MemorySanctuary.state;
            state.resources.energy = 150; state.resources.media = 120;
            state.resources.food = 60; state.resources.environment = 90;
            for (let i = 0; i < 12; i++) {
                // 尝试归档一条
                const entry = MemorySanctuary.data.archives.find(a =>
                    !state.completedArchives.includes(a.id) && !a.expired &&
                    (!a.availableAfter || state.week >= a.availableAfter) &&
                    (!a.fragmentFrom && !a.botPassive) &&
                    canArchiveEntry(a));
                if (entry && Math.random() < 0.7) {
                    archiveEntry(entry.id);
                } else if (i % 4 === 1) {
                    // 勘探
                    const exp = MemorySanctuary.data.explorations.find(e =>
                        !isExplorationCompleted(e.id) && !e.botOnly &&
                        (!e.availableAfter || state.week >= e.availableAfter) &&
                        (!e.requiredBots || (state.resources.engineeringBots || 0) >= e.requiredBots));
                    if (exp) {
                        selectedExplorationId = exp.id;
                        selectedGuardians.clear();
                        // 优先选熟悉此地的守护者
                        let picked = null;
                        if (exp.guardianSpecials) {
                            picked = Object.keys(exp.guardianSpecials).find(gid =>
                                !isGuardianFatigued(gid) && !state.departedGuardians.includes(gid));
                        }
                        selectedGuardians.add(picked || 'finn');
                        // 直接推进时间模拟返回结算
                        state.exploration.deployedUntil = state.week + 1;
                        executeExploration();
                        // 让返回结算立即执行
                        state.week = state.exploration.deployedUntil;
                        state.exploration.deployedUntil = 0;
                        pendingGuardianSpecial = null;
                    }
                } else if (i % 5 === 3) {
                    // 项目
                    const proj = MemorySanctuary.data.projects.find(p => canStartProject(p));
                    if (proj) startProject(proj.id);
                } else {
                    skipTurn(true);
                }
                if (MemorySanctuary.activeEvent) {
                    // 处理事件（选第一个选项）
                    resolveEvent(0);
                }
                if (state.gameOver) break;
            }
            return {
                week: state.week,
                archived: state.completedArchives.length,
                projects: state.activeProjects.map(p => p.id + ':' + p.remainingWeeks),
                weeksSinceLastEvent: state.weeksSinceLastEvent,
                gameOver: state.gameOver
            };
        }
    """)
    print("12 周循环:", json.dumps(r, ensure_ascii=False))

    # 存档 → 读档 → 新字段保留
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.weeksSinceLastEvent = 2;
            if (!MemorySanctuary.state.techUpgrades.includes('x')) MemorySanctuary.state.techUpgrades.push('x');
            saveGame(1);
            // 篡改当前状态模拟读档
            MemorySanctuary.state.weeksSinceLastEvent = 99;
            MemorySanctuary.state.techUpgrades = [];
            loadGame(1);
            return {
                weeksSinceLastEvent: MemorySanctuary.state.weeksSinceLastEvent,
                techUpgrades: MemorySanctuary.state.techUpgrades
            };
        }
    """)
    ok = r["weeksSinceLastEvent"] == 2 and r["techUpgrades"] == ["x"]
    print(("PASS" if ok else "FAIL"), "存档/读档保留新字段", json.dumps(r, ensure_ascii=False))

    # 紧急归档按钮 24 周文案
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.week = 23;
            updateBatchArchiveBtn();
            const t23 = document.getElementById('batch-archive-btn').textContent;
            MemorySanctuary.state.week = 24;
            updateBatchArchiveBtn();
            const t24 = document.getElementById('batch-archive-btn').textContent;
            return { t23: t23, t24: t24 };
        }
    """)
    ok2 = "/24" in r["t23"] and "紧急归档" in r["t24"] and "/24" not in r["t24"]
    print(("PASS" if ok2 else "FAIL"), "紧急归档解锁周 24", json.dumps(r, ensure_ascii=False))

    print("=== JS 错误 ===")
    print(errs if errs else "无")
    browser.close()
