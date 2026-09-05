# -*- coding: utf-8 -*-
"""调试：归档列表为何不显示已发现的碎片"""
import time, io
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
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

    # 直接模拟：解锁碎片 + 设置周数，然后查 isArchiveAvailable 与列表渲染
    debug = page.evaluate("""
        (function(){
            MemorySanctuary.state.unlockedFragments = ['arch_sf_ruins_01'];
            MemorySanctuary.state.week = 4;
            const entry = MemorySanctuary.data.archives.find(a => a.id === 'arch_sf_ruins_01');
            const avail = isArchiveAvailable(entry);
            // 检查列表过滤逻辑（renderArchiveEntries 内部）
            const vaultEntries = getArchivesByVault(3);
            const inVault = vaultEntries.some(a => a.id === 'arch_sf_ruins_01');
            return JSON.stringify({
                isArchiveAvailable: avail,
                inVaultList: inVault,
                week: MemorySanctuary.state.week,
                unlocked: MemorySanctuary.state.unlockedFragments,
                entry: { id: entry.id, availableAfter: entry.availableAfter, expiresAfter: entry.expiresAfter, fragmentFrom: entry.fragmentFrom }
            });
        })()
    """)
    print("DEBUG:", debug)
    browser.close()
