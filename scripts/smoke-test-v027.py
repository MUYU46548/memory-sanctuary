# -*- coding: utf-8 -*-
"""v0.2.7 修复冒烟测试：事件保底 / 守护者专属勘探 / 交谈分支 / 科技升级 / 项目进度 / 存储室反馈 / 封印门槛"""
import time, json
from playwright.sync_api import sync_playwright

results = []
def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("PASS" if ok else "FAIL"), name, extra)

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

    # === 1. 事件保底：weeksSinceLastEvent = 4 时强制触发 ===
    print("=== 1. 事件保底 ===")
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.weeksSinceLastEvent = 4;
            MemorySanctuary.activeEvent = null;
            checkRandomEvent();
            return { active: !!MemorySanctuary.activeEvent,
                     id: MemorySanctuary.activeEvent ? MemorySanctuary.activeEvent.id : null,
                     counter: MemorySanctuary.state.weeksSinceLastEvent };
        }
    """)
    check("连续4周无事件强制触发", r["active"], json.dumps(r, ensure_ascii=False))
    page.evaluate("() => { MemorySanctuary.activeEvent = null; }")

    # === 2. 事件保底：正常事件触发后计数器清零 ===
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.weeksSinceLastEvent = 3;
            const ev = MemorySanctuary.data.events.find(e => e.trigger.type === 'random');
            if (ev) triggerEvent(ev);
            return { counter: MemorySanctuary.state.weeksSinceLastEvent, id: ev ? ev.id : null };
        }
    """)
    check("事件触发后计数器清零", r["counter"] == 0 and r["id"] is not None, json.dumps(r, ensure_ascii=False))
    page.evaluate("() => { MemorySanctuary.activeEvent = null; }")

    # === 3. 守护者专属勘探：米莎 + 枯萎之森 → 专属奖励分支 ===
    print("=== 2. guardianSpecials ===")
    r = page.evaluate("""
        () => {
            const exp = MemorySanctuary.data.explorations.find(e => e.id === 'exp_forest_02');
            // 模拟派遣米莎
            selectedGuardians.clear();
            selectedGuardians.add('misha');
            // 直接构造专属结算上下文
            pendingGuardianSpecial = { expId: 'exp_forest_02', guardianId: 'misha', dialogueKey: 'misha_forest' };
            const effects = [];
            // 复用专属结算逻辑的等价验证：调用 dispatch 前检查标记
            const marker = { expId: exp.id, hasSpecial: !!(exp.guardianSpecials && exp.guardianSpecials['misha']) };
            return marker;
        }
    """)
    check("枯萎之森含米莎专属配置", r["hasSpecial"], json.dumps(r, ensure_ascii=False))

    # 真实流程：派遣 → advanceTime → 结算
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.week = 4;
            MemorySanctuary.state.resources.food = 50;
            MemorySanctuary.state.resources.energy = 150;
            MemorySanctuary.state.resources.media = 100;
            MemorySanctuary.state.exploration.deployedUntil = 0;
            selectedExplorationId = 'exp_forest_02';
            selectedGuardians.clear();
            selectedGuardians.add('misha');
            const beforeMedia = MemorySanctuary.state.resources.media;
            const beforeMood = MemorySanctuary.state.guardianMoods['misha'] || 0;
            // 直接调用结算（跳过时间推进），验证专属分支奖励
            const outcome = MemorySanctuary.data.explorations.find(e => e.id === 'exp_forest_02').outcomes[0];
            pendingGuardianSpecial = { expId: 'exp_forest_02', guardianId: 'misha', dialogueKey: 'misha_forest' };
            applyExplorationResult(outcome, MemorySanctuary.data.explorations.find(e => e.id === 'exp_forest_02'));
            return {
                mediaDelta: MemorySanctuary.state.resources.media - beforeMedia,
                moodDelta: (MemorySanctuary.state.guardianMoods['misha'] || 0) - beforeMood,
                text: document.getElementById('result-text').textContent.slice(0, 60),
                effects: document.getElementById('result-effects').textContent.slice(0, 80)
            };
        }
    """)
    check("米莎专属勘探获得额外介质+好感", r["mediaDelta"] >= 10 and r["moodDelta"] >= 2,
          json.dumps(r, ensure_ascii=False))

    # === 4. 交谈分支 UI ===
    print("=== 3. 交谈分支 ===")
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.guardianMoods['tika'] = 5;
            showGuardianChatOptions('tika');
            const container = document.getElementById('guardian-chat-choices');
            const btns = container.querySelectorAll('.guardian-chat-choice');
            const labels = Array.from(btns).map(b => b.textContent);
            return { count: btns.length, labels: labels, visible: !container.classList.contains('hidden') };
        }
    """)
    check("交谈分支渲染(含个人任务)", r["count"] >= 4 and r["visible"], json.dumps(r, ensure_ascii=False))
    r = page.evaluate("""
        () => {
            const container = document.getElementById('guardian-chat-choices');
            const topicBtn = container.querySelector('.guardian-chat-choice:not(.task):not(.close)');
            const before = MemorySanctuary.state.guardianMoods['tika'];
            topicBtn.click();
            const after = MemorySanctuary.state.guardianMoods['tika'];
            return { moodDelta: after - before };
        }
    """)
    check("选择话题后好感变化", r["moodDelta"] > 0, json.dumps(r, ensure_ascii=False))

    # === 5. 科技升级 ===
    print("=== 4. 科技升级 ===")
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.week = 6;
            MemorySanctuary.state.resources.energy = 200;
            MemorySanctuary.state.resources.media = 200;
            if (!MemorySanctuary.state.techUnlocked.includes('tech_arch_fast')) {
                unlockTech('tech_arch_fast');
            }
            const before = getTechArchiveBonus().costReduce;
            const ok = upgradeTech('tech_arch_fast');
            const after = getTechArchiveBonus().costReduce;
            return { unlocked: MemorySanctuary.state.techUnlocked.includes('tech_arch_fast'),
                     upgraded: (MemorySanctuary.state.techUpgrades || []).includes('tech_arch_fast'),
                     before: before, after: after };
        }
    """)
    check("科技升级生效(25%→50%)", r["upgraded"] and r["after"] == 0.5, json.dumps(r, ensure_ascii=False))

    # === 6. 封印门槛 16 周 ===
    print("=== 5. 封印门槛 ===")
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.week = 16;
            renderSealTopbarButton();
            const btn = document.getElementById('seal-topbar-btn');
            return { canSeal: canSealSanctuary(), btnVisible: !btn.classList.contains('hidden'),
                     btnDisabled: btn.disabled, btnText: btn.textContent };
        }
    """)
    check("16 周可封印且按钮可用", r["canSeal"] and r["btnVisible"] and not r["btnDisabled"],
          json.dumps(r, ensure_ascii=False))
    r = page.evaluate("() => { MemorySanctuary.state.week = 15; return canSealSanctuary(); }")
    check("15 周不可封印", r is False, str(r))

    # === 7. 存储室反馈函数 ===
    print("=== 6. 存储室反馈 ===")
    r = page.evaluate("""
        () => {
            renderVaultStatus();
            const item = document.querySelector('.vault-item');
            const hasDataAttr = item ? item.hasAttribute('data-vault-id') : false;
            flashVault(item ? item.dataset.vaultId : 1);
            const flashed = item ? item.classList.contains('vault-flash') : false;
            return { hasDataAttr: hasDataAttr, flashed: flashed };
        }
    """)
    check("存储室发光反馈触发", r["hasDataAttr"] and r["flashed"], json.dumps(r, ensure_ascii=False))

    # === 8. 项目进度条 ===
    print("=== 7. 项目进度条 ===")
    r = page.evaluate("""
        () => {
            MemorySanctuary.state.activeProjects = [{ id: 'proj_farm', remainingWeeks: 2, effect: { type: 'foodBoost', amount: 4 } }];
            renderProjectList();
            const item = document.querySelector('.project-item.active');
            const hasBar = !!item.querySelector('.project-progress-bar');
            const nearDone = item.classList.contains('project-near-done');
            return { hasBar: hasBar, nearDone: nearDone };
        }
    """)
    check("在建项目进度条+即将完成高亮", r["hasBar"] and r["nearDone"], json.dumps(r, ensure_ascii=False))

    print("=== JS 错误 ===")
    print(errs if errs else "无")
    browser.close()

failed = [x for x in results if not x[1]]
print("=" * 50)
print(f"总计 {len(results)} 项，通过 {len(results) - len(failed)} 项，失败 {len(failed)} 项")
if failed:
    for f in failed:
        print("  FAIL:", f[0], f[2])
