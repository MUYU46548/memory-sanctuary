/**
 * game.js - 游戏核心逻辑
 * 资源管理、归档流程、存储室管理、事件系统
 */

// ==========================================
// 资源管理
// ==========================================

function consumeResources(energy, media) {
    const state = MemorySanctuary.state;
    
    if (state.resources.energy < energy) {
        addLog('能源不足，无法执行录入操作。', 'system');
        return false;
    }
    if (state.resources.media < media) {
        addLog('存储介质不足，无法执行录入操作。', 'system');
        return false;
    }
    
    state.resources.energy -= energy;
    state.resources.media -= media;
    return true;
}

function hasResources(energy, media) {
    const state = MemorySanctuary.state;
    return state.resources.energy >= energy && state.resources.media >= media;
}

function getResourceStatus() {
    const state = MemorySanctuary.state;
    return {
        energy: state.resources.energy,
        media: state.resources.media,
        environment: state.resources.environment
    };
}

// ==========================================
// 归档流程
// ==========================================

function getArchiveById(id) {
    return MemorySanctuary.data.archives.find(a => a.id === id) || null;
}

function getArchivesByVault(vaultId) {
    return MemorySanctuary.data.archives.filter(a => a.vault === vaultId);
}

function isArchiveCompleted(id) {
    return MemorySanctuary.state.completedArchives.includes(id);
}

function archiveEntry(archiveId) {
    const entry = getArchiveById(archiveId);
    
    if (!entry) {
        addLog(`错误：找不到条目 ${archiveId}`, 'system');
        return false;
    }
    
    if (isArchiveCompleted(archiveId)) {
        addLog(`条目 "${entry.title}" 已被归档。`, 'system');
        return false;
    }
    
    if (!hasResources(entry.energyCost, entry.dataCost)) {
        addLog(`资源不足，无法归档 "${entry.title}"。`, 'system');
        return false;
    }
    
    const vault = MemorySanctuary.data.vaults.find(v => v.id === entry.vault);
    if (!vault) {
        addLog(`错误：找不到存储室 ${entry.vault}`, 'system');
        return false;
    }
    
    const currentUsage = MemorySanctuary.state.vaultUsage[vault.id] || 0;
    if (currentUsage + entry.dataCost > vault.capacity) {
        addLog(`存储室 "${vault.name}" 容量不足。`, 'system');
        return false;
    }
    
    if (!consumeResources(entry.energyCost, entry.dataCost)) return false;
    
    MemorySanctuary.state.completedArchives.push(archiveId);
    MemorySanctuary.state.vaultUsage[vault.id] = currentUsage + entry.dataCost;
    advanceTime(1);
    
    addLog(`已完成归档："${entry.title}"`, 'success');
    
    // 守护者反应
    const guardianId = Object.keys(entry.guardianReactions || {})[0];
    if (guardianId && entry.guardianReactions[guardianId]) {
        addLog(`${getGuardianName(guardianId)}：「${entry.guardianReactions[guardianId]}」`, 'guardian');
        showGuardianDialogue(guardianId, 'archive');
    }
    
    showArchiveCompleteModal(entry);
    
    // 归档后可能触发事件
    if (typeof checkRandomEvent === 'function') checkRandomEvent();
    
    renderAll();
    return true;
}

// ==========================================
// 时间系统
// ==========================================

function advanceTime(weeks) {
    MemorySanctuary.state.week += weeks;
    MemorySanctuary.state.chapter = Math.ceil(MemorySanctuary.state.week / 4);
    onTimeAdvanced(weeks);
}

function onTimeAdvanced(weeks) {
    // 检查过期条目
    MemorySanctuary.data.archives.forEach(entry => {
        if (entry.expiresAfter && !isArchiveCompleted(entry.id) && !entry.expired) {
            const remaining = entry.expiresAfter - MemorySanctuary.state.week;
            if (remaining <= 0) {
                addLog(`条目 "${entry.title}" 已永久消失。`, 'system');
                entry.expired = true;
            } else if (remaining <= 4) {
                addLog(`警告："${entry.title}" 即将在 ${remaining} 周后消失。`, 'system');
            }
        }
    });
    
    // 环境稳定度自然下降
    const envDecay = weeks * 0.5;
    MemorySanctuary.state.resources.environment = Math.max(0, 
        MemorySanctuary.state.resources.environment - envDecay
    );
    
    // 守护者主动事件
    if (typeof checkGuardianInitiative === 'function') checkGuardianInitiative();
}

// ==========================================
// 存储室管理
// ==========================================

function getVaultStatus(vaultId) {
    const vault = MemorySanctuary.data.vaults.find(v => v.id === vaultId);
    if (!vault) return null;
    
    const used = MemorySanctuary.state.vaultUsage[vaultId] || 0;
    const percent = (used / vault.capacity) * 100;
    
    return { ...vault, used, percent: Math.min(100, percent) };
}

function selectVault(vaultId) {
    MemorySanctuary.currentVaultId = vaultId;
    renderAll();
}

// ==========================================
// 守护者系统
// ==========================================

function getGuardianById(id) {
    return MemorySanctuary.data.guardians.find(g => g.id === id) || null;
}

function getGuardianName(id) {
    const g = getGuardianById(id);
    return g ? g.name : id;
}

function showGuardianDialogue(guardianId, type) {
    const guardian = getGuardianById(guardianId);
    if (!guardian || !guardian.dialogues[type]) return;
    
    const dialogues = guardian.dialogues[type];
    const randomDialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
    
    const nameEl = document.getElementById('guardian-name');
    const roleEl = document.getElementById('guardian-role');
    const dialogueEl = document.getElementById('guardian-dialogue');
    const avatarEl = document.getElementById('guardian-avatar');
    
    if (nameEl) nameEl.textContent = guardian.name;
    if (roleEl) roleEl.textContent = guardian.role;
    if (dialogueEl) dialogueEl.textContent = randomDialogue;
    if (avatarEl) avatarEl.textContent = guardian.avatar;
}

// ==========================================
// 守护者互动增强
// ==========================================

function initGuardianInteraction() {
    const avatar = document.getElementById('guardian-avatar');
    const menu = document.getElementById('guardian-menu');
    const talkBtn = document.getElementById('guardian-talk');
    const recommendBtn = document.getElementById('guardian-recommend');
    
    // 点击头像展开菜单
    if (avatar && menu) {
        avatar.style.cursor = 'pointer';
        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        });
    }
    
    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        if (menu) menu.classList.add('hidden');
    });
    
    if (menu) {
        menu.addEventListener('click', (e) => e.stopPropagation());
    }
    
    // 交谈按钮
    if (talkBtn) {
        talkBtn.addEventListener('click', () => {
            const currentGuardian = getCurrentGuardianId();
            showGuardianDialogue(currentGuardian, 'idle');
            menu.classList.add('hidden');
        });
    }
    
    // 推荐归档按钮
    if (recommendBtn) {
        recommendBtn.addEventListener('click', () => {
            guardianRecommendArchive();
            menu.classList.add('hidden');
        });
    }
}

function getCurrentGuardianId() {
    const nameEl = document.getElementById('guardian-name');
    if (!nameEl) return 'tika';
    
    const name = nameEl.textContent;
    const guardian = MemorySanctuary.data.guardians.find(g => g.name === name);
    return guardian ? guardian.id : 'tika';
}

function guardianRecommendArchive() {
    const guardianId = getCurrentGuardianId();
    const guardian = getGuardianById(guardianId);
    if (!guardian) return;
    
    // 根据守护者技能推荐对应存储室的条目
    const skillVaultMap = {
        'languages': 1,
        'history': 1,
        'law': 2,
        'ecology': 3,
        'exploration': 3,
        'engineering': 2,
        'religion': 3,
        'philosophy': 3
    };
    
    // 找到守护者技能对应的存储室
    let targetVault = null;
    for (const skill of guardian.skills) {
        if (skillVaultMap[skill]) {
            targetVault = skillVaultMap[skill];
            break;
        }
    }
    
    // 获取该存储室未归档的条目
    const entries = getArchivesByVault(targetVault || MemorySanctuary.currentVaultId);
    const unarchived = entries.filter(e => !isArchiveCompleted(e.id) && !e.expired);
    
    if (unarchived.length === 0) {
        addLog(`${guardian.name}：「当前存储室已无待归档条目。」`, 'guardian');
        showGuardianDialogue(guardianId, 'idle');
        return;
    }
    
    // 推荐成本最低的条目
    const recommended = unarchived.sort((a, b) => (a.energyCost + a.dataCost) - (b.energyCost + b.dataCost))[0];
    
    // 高亮推荐条目
    highlightRecommendedEntry(recommended.id);
    
    // 守护者对话
    const recommendDialogues = {
        'tika': `我建议优先录入「${recommended.title}」——语言是文明的根基。`,
        'finn': `从历史价值来看，「${recommended.title}」值得优先保存。`,
        'misha': `「${recommended.title}」——这段记忆不应该被遗忘。`,
        'lorn': `系统建议：优先录入「${recommended.title}」，资源效率最优。`,
        'ethel': `「${recommended.title}」——它承载着我们的信仰与尊严。`
    };
    
    addLog(`${guardian.name}：「${recommendDialogues[guardianId] || '这个条目值得保存。'}」`, 'guardian');
    
    // 更新守护者面板对话
    const dialogueEl = document.getElementById('guardian-dialogue');
    if (dialogueEl) dialogueEl.textContent = recommendDialogues[guardianId] || '这个条目值得保存。';
}

function highlightRecommendedEntry(archiveId) {
    // 切换到对应存储室
    const entry = getArchiveById(archiveId);
    if (!entry) return;
    
    if (MemorySanctuary.currentVaultId !== entry.vault) {
        selectVault(entry.vault);
    }
    
    // 等待渲染后高亮
    setTimeout(() => {
        const btn = document.querySelector(`button[data-archive-id="${archiveId}"]`);
        if (btn) {
            btn.classList.add('recommended');
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // 3秒后移除高亮
            setTimeout(() => btn.classList.remove('recommended'), 3000);
        }
    }, 100);
}

// 守护者主动事件
function checkGuardianInitiative() {
    if (MemorySanctuary.activeEvent) return;
    if (MemorySanctuary.state.week < 3) return;
    
    // 每5-8周可能触发一次守护者主动事件
    if (MemorySanctuary.state.week % 6 !== 0) return;
    if (Math.random() > 0.35) return;
    
    const guardianEvents = [
        {
            guardianId: 'tika',
            title: '缇卡的请求',
            description: '缇卡希望录入一段她刚回忆起的古老歌谣——关于星辰起源的叙事诗。',
            dialogue: '「我刚刚想起了小时候祖母唱的歌……让我把它记录下来吧。」',
            reward: { media: 5 },
            archiveId: 'arch_001'
        },
        {
            guardianId: 'finn',
            title: '芬恩的发现',
            description: '芬恩在旧档案中发现了一份被遗忘的附录，补充了《共享公约》的立法背景。',
            dialogue: '「这份附录能帮助我们理解当时的立法者面临的困境……」',
            reward: { energy: 5 },
            archiveId: 'arch_004'
        },
        {
            guardianId: 'misha',
            title: '米莎的勘探报告',
            description: '米莎从地表带回了一份完整的植物标本数据，记录了最后一片森林的消亡。',
            dialogue: '「这是最后的证据……证明这里曾经有生命。」',
            reward: { media: 8 },
            archiveId: 'arch_008'
        },
        {
            guardianId: 'lorn',
            title: '洛恩的维护成果',
            description: '洛恩优化了发电机效率，本周能源产出增加。',
            dialogue: '「系统升级完成。能源利用效率提升了12%。」',
            reward: { energy: 15 },
            archiveId: null
        },
        {
            guardianId: 'ethel',
            title: '埃塞尔的祈祷',
            description: '埃塞尔完成了一场净化仪式，圣所环境稳定度有所恢复。',
            dialogue: '「仪式完成了。愿圣所得到庇佑。」',
            reward: { environment: 10 },
            archiveId: null
        }
    ];
    
    const event = guardianEvents[Math.floor(Math.random() * guardianEvents.length)];
    triggerGuardianInitiative(event);
}

function triggerGuardianInitiative(event) {
    const guardian = getGuardianById(event.guardianId);
    if (!guardian) return;
    
    // 更新守护者面板
    showGuardianDialogue(event.guardianId, 'event');
    
    // 显示事件面板
    const panel = document.getElementById('event-panel');
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    
    if (!panel || !titleEl || !descEl || !choicesEl) return;
    
    titleEl.textContent = event.title;
    descEl.textContent = event.description;
    choicesEl.innerHTML = '';
    
    // 接受按钮
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'event-choice';
    acceptBtn.textContent = '接受';
    acceptBtn.addEventListener('click', () => {
        // 应用奖励
        if (event.reward.energy) {
            MemorySanctuary.state.resources.energy = Math.min(100, MemorySanctuary.state.resources.energy + event.reward.energy);
        }
        if (event.reward.media) {
            MemorySanctuary.state.resources.media = Math.min(100, MemorySanctuary.state.resources.media + event.reward.media);
        }
        if (event.reward.environment) {
            MemorySanctuary.state.resources.environment = Math.min(100, MemorySanctuary.state.resources.environment + event.reward.environment);
        }
        
        addLog(`${guardian.name}：「${event.dialogue}」`, 'guardian');
        addLog(`获得奖励：${formatReward(event.reward)}`, 'success');
        
        // 如果有指定条目，自动高亮
        if (event.archiveId) {
            highlightRecommendedEntry(event.archiveId);
        }
        
        panel.classList.add('hidden');
        renderAll();
    });
    
    // 婉拒按钮
    const declineBtn = document.createElement('button');
    declineBtn.className = 'event-choice';
    declineBtn.textContent = '婉拒';
    declineBtn.addEventListener('click', () => {
        addLog(`婉拒了${guardian.name}的提议。`, 'system');
        panel.classList.add('hidden');
    });
    
    choicesEl.appendChild(acceptBtn);
    choicesEl.appendChild(declineBtn);
    panel.classList.remove('hidden');
}

function formatReward(reward) {
    const parts = [];
    if (reward.energy) parts.push(`能源+${reward.energy}`);
    if (reward.media) parts.push(`介质+${reward.media}`);
    if (reward.environment) parts.push(`环境+${reward.environment}`);
    return parts.join('、') || '无';
}

// ==========================================
// 事件系统
// ==========================================

function initEventSystem() {
    // 定期检查随机事件
    console.log('[事件系统] 初始化完成');
}

function checkRandomEvent() {
    if (MemorySanctuary.activeEvent) return; // 已有活跃事件
    
    const week = MemorySanctuary.state.week;
    const availableEvents = MemorySanctuary.data.events.filter(e => {
        if (MemorySanctuary.state.activeEventIds.includes(e.id)) return false;
        return week >= e.trigger.weekMin && week <= e.trigger.weekMax;
    });
    
    for (const event of availableEvents) {
        if (Math.random() < event.trigger.probability) {
            triggerEvent(event);
            break;
        }
    }
}

function triggerEvent(event) {
    MemorySanctuary.activeEvent = event;
    MemorySanctuary.state.activeEventIds.push(event.id);
    addLog(`突发事件：${event.title}`, 'event');
    renderEvent(event);
}

function renderEvent(event) {
    const panel = document.getElementById('event-panel');
    const titleEl = document.getElementById('event-title');
    const descEl = document.getElementById('event-desc');
    const choicesEl = document.getElementById('event-choices');
    
    if (!panel || !titleEl || !descEl || !choicesEl) return;
    
    titleEl.textContent = event.title;
    descEl.textContent = event.description;
    choicesEl.innerHTML = '';
    
    event.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'event-choice';
        btn.textContent = choice.text;
        btn.addEventListener('click', () => resolveEvent(index));
        choicesEl.appendChild(btn);
    });
    
    panel.classList.remove('hidden');
}

function resolveEvent(choiceIndex) {
    const event = MemorySanctuary.activeEvent;
    if (!event) return;
    
    const choice = event.choices[choiceIndex];
    
    // 应用效果
    if (choice.effect.energy) {
        MemorySanctuary.state.resources.energy = Math.max(0, 
            MemorySanctuary.state.resources.energy + choice.effect.energy);
    }
    if (choice.effect.media) {
        MemorySanctuary.state.resources.media = Math.max(0, 
            MemorySanctuary.state.resources.media + choice.effect.media);
    }
    if (choice.effect.environment) {
        MemorySanctuary.state.resources.environment = Math.max(0, 
            MemorySanctuary.state.resources.environment + choice.effect.environment);
    }
    if (choice.effect.time) {
        advanceTime(choice.effect.time);
    }
    
    addLog(`选择：${choice.text} —— ${choice.result}`, 'event');
    
    // 隐藏事件面板
    const panel = document.getElementById('event-panel');
    if (panel) panel.classList.add('hidden');
    
    MemorySanctuary.activeEvent = null;
    
    // 随机守护者回应
    const guardiansWithDialogue = MemorySanctuary.data.guardians.filter(g => g.dialogues.event);
    if (guardiansWithDialogue.length > 0) {
        const randomGuardian = guardiansWithDialogue[Math.floor(Math.random() * guardiansWithDialogue.length)];
        showGuardianDialogue(randomGuardian.id, 'event');
    }
    
    renderAll();
}

// ==========================================
// 日志系统
// ==========================================

let logUnreadCount = 0;
let logPanelOpen = false;

function initLogSystem() {
    const toggle = document.getElementById('log-toggle');
    const closeBtn = document.getElementById('log-close');
    const panel = document.getElementById('log-panel');

    if (toggle) {
        toggle.addEventListener('click', () => {
            // 点击按钮即清零红点
            clearUnread();
            
            panel.classList.toggle('hidden');
            logPanelOpen = !panel.classList.contains('hidden');
            if (logPanelOpen) {
                const logContent = document.getElementById('log-content');
                if (logContent) logContent.scrollTop = logContent.scrollHeight;
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            panel.classList.add('hidden');
            logPanelOpen = false;
        });
    }
}

function updateUnreadBadge() {
    const badge = document.getElementById('log-unread');
    if (!badge) return;

    if (logUnreadCount > 0) {
        badge.textContent = logUnreadCount > 99 ? '99+' : logUnreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function clearUnread() {
    logUnreadCount = 0;
    updateUnreadBadge();
}

function addLog(message, type = 'system') {
    const logContent = document.getElementById('log-content');
    if (!logContent) return;

    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[第${MemorySanctuary.state.week}周] ${message}`;

    logContent.appendChild(entry);
    logContent.scrollTop = logContent.scrollHeight;

    const entries = logContent.querySelectorAll('.log-entry');
    if (entries.length > 50) entries[0].remove();

    // 如果面板关闭，增加未读计数
    if (!logPanelOpen) {
        logUnreadCount++;
        updateUnreadBadge();
    }
}

// ==========================================
// 弹窗系统
// ==========================================

function showArchiveCompleteModal(entry) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    
    if (!overlay || !title || !content) return;
    
    title.textContent = `归档完成：${entry.title}`;
    
    let modalContent = `${entry.description}\n\n`;
    modalContent += `「${entry.content.substring(0, 120)}...」\n\n`;
    
    if (entry.guardianReactions) {
        const reactions = Object.entries(entry.guardianReactions);
        if (reactions.length > 0) {
            modalContent += `守护者反应：\n`;
            reactions.forEach(([guardian, reaction]) => {
                modalContent += `• ${getGuardianName(guardian)}：「${reaction}」\n`;
            });
        }
    }
    
    content.textContent = modalContent;
    overlay.classList.remove('hidden');
    
    const closeBtn = document.getElementById('modal-close');
    closeBtn.onclick = () => overlay.classList.add('hidden');
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
}

// ==========================================
// 新手引导系统
// ==========================================

const TUTORIAL_STEPS = [
    {
        target: '#sanctuary-canvas',
        text: '欢迎来到「记忆圣所」。\n\n这是圣所主厅。中央的歌者之座将声波传递至各个存储室，保存文明的碎片。',
        position: 'bottom'
    },
    {
        target: '#vault-tabs',
        text: '圣所共有3间存储室：\n\n• 语言与语法 — 记录文明的语言遗产\n• 历史编年 — 保存历史时间线\n• 灾难纪实 — 记录末日经过\n\n点击标签切换存储室。',
        position: 'bottom'
    },
    {
        target: '#guardian-panel',
        text: '这是守护者面板。\n\n5名守护者各司其职——歌者缇卡、学者芬恩、生态学家米莎、工程师洛恩、前祭司埃塞尔。\n\n💡 点击守护者头像可以互动：交谈或获取归档建议。',
        position: 'left'
    },
    {
        target: '#res-energy',
        text: '圣所运作依赖三种资源：\n\n◈ 能源 — 维持圣所运转\n◇ 存储介质 — 存储归档数据\n○ 环境稳定 — 保护设备正常运作\n\n归档条目需要消耗资源和介质。',
        position: 'bottom'
    },
    {
        target: '#entry-list',
        text: '这里是待归档条目列表。\n\n每条条目都有录入成本（能源+介质）和过期时间。资源充足时请点击「录入归档」保存它们。\n\n⚠️ 过期的条目将永远消失！',
        position: 'left'
    },
    {
        target: null,
        text: '准备就绪。\n\n你的选择决定了后世「看到」怎样的萨拉达斯文明。\n\n每一段记忆都值得被认真对待。\n\n——终来之刻，何物当存？',
        position: 'center'
    }
];

let tutorialStep = 0;
let tutorialActive = false;

function initTutorial() {
    const saved = localStorage.getItem('memory-sanctuary-tutorial');
    if (saved) return;

    tutorialActive = true;
    tutorialStep = 0;
    showTutorialStep();
}

function showTutorialStep() {
    const overlay = document.getElementById('tutorial-overlay');
    const highlight = document.getElementById('tutorial-highlight');
    const tip = document.getElementById('tutorial-tip');
    const text = document.getElementById('tutorial-text');
    const nextBtn = document.getElementById('tutorial-next');

    if (!overlay || !highlight || !tip || !text || !nextBtn) return;

    const step = TUTORIAL_STEPS[tutorialStep];

    if (step.target) {
        const target = document.querySelector(step.target);
        if (target) {
            const rect = target.getBoundingClientRect();
            highlight.style.left = rect.left - 4 + 'px';
            highlight.style.top = rect.top - 4 + 'px';
            highlight.style.width = rect.width + 8 + 'px';
            highlight.style.height = rect.height + 8 + 'px';
            highlight.classList.remove('hidden');

            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            highlight.classList.add('hidden');
        }
    } else {
        highlight.classList.add('hidden');
    }

    // 提示始终居中显示，跟随步骤切换内容
    tip.style.top = '50%';
    tip.style.left = '50%';
    tip.style.transform = 'translate(-50%, -50%)';
    tip.className = 'tutorial-tip';

    text.textContent = step.text;

    if (tutorialStep === TUTORIAL_STEPS.length - 1) {
        nextBtn.textContent = '开始守护';
    } else {
        nextBtn.textContent = '下一步';
    }

    overlay.classList.remove('hidden');
}

function nextTutorialStep() {
    tutorialStep++;
    if (tutorialStep >= TUTORIAL_STEPS.length) {
        endTutorial();
    } else {
        showTutorialStep();
    }
}

function endTutorial() {
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('hidden');
    tutorialActive = false;
    localStorage.setItem('memory-sanctuary-tutorial', 'completed');
    addLog('新手引导已完成。愿你的选择得到善待。', 'system');
}

function initTutorialListener() {
    const nextBtn = document.getElementById('tutorial-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextTutorialStep);
    }

    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                endTutorial();
            }
        });
    }
}

// ==========================================
// 帮助与关于
// ==========================================

function initFuncBar() {
    const helpBtn = document.getElementById('help-btn');
    const aboutBtn = document.getElementById('about-btn');

    // 帮助按钮：重新播放新手引导
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            localStorage.removeItem('memory-sanctuary-tutorial');
            tutorialActive = true;
            tutorialStep = 0;
            showTutorialStep();
        });
    }

    // 关于按钮：显示版权信息
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => {
            showAboutModal();
        });
    }
}

function showAboutModal() {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    title.textContent = '关于 记忆圣所';

    let aboutContent = '记忆圣所 (Nar-Sil-Veth)\n';
    aboutContent += '终来之刻，何物当存？\n\n';
    aboutContent += '版本：MVP v1.0\n';
    aboutContent += '技术：HTML5 + CSS3 + Canvas 2D + Vanilla JavaScript\n\n';
    aboutContent += '— 绒花计划 系列IP —\n\n';
    aboutContent += '守护者：\n';
    aboutContent += '  缇卡 · 首席歌者\n';
    aboutContent += '  芬恩 · 历史编年学者\n';
    aboutContent += '  米莎 · 生态学家\n';
    aboutContent += '  洛恩 · 前航天工程师\n';
    aboutContent += '  埃塞尔 · 前祭司\n\n';
    aboutContent += '「我们曾存在，我们曾仰望，我们曾渴望触碰你们。」';

    content.textContent = aboutContent;
    overlay.classList.remove('hidden');

    if (closeBtn) closeBtn.onclick = () => overlay.classList.add('hidden');
}

// ==========================================
// 存档系统
// ==========================================

const SAVE_KEY_PREFIX = 'memory-sanctuary-save-slot-';
const SAVE_SLOT_COUNT = 3;
const NG_PLUS_KEY = 'memory-sanctuary-ngplus';
const CURRENT_SLOT_KEY = 'memory-sanctuary-current-slot';

function saveGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;

    const ngData = getNGPlusData();

    const saveData = {
        version: 1,
        slot: slot,
        savedAt: Date.now(),
        playthrough: ngData.playthroughCount,
        state: {
            resources: { ...MemorySanctuary.state.resources },
            week: MemorySanctuary.state.week,
            chapter: MemorySanctuary.state.chapter,
            completedArchives: [...MemorySanctuary.state.completedArchives],
            vaultUsage: { ...MemorySanctuary.state.vaultUsage },
            narrativeFlags: [...MemorySanctuary.state.narrativeFlags],
            activeEvents: [],
            activeEventIds: [...MemorySanctuary.state.activeEventIds]
        },
        currentVaultId: MemorySanctuary.currentVaultId
    };

    try {
        localStorage.setItem(SAVE_KEY_PREFIX + slot, JSON.stringify(saveData));
        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));
        addLog(`游戏已保存至存档槽 ${slot}。`, 'system');
        return true;
    } catch (e) {
        console.error('[存档] 保存失败:', e);
        addLog('存档失败：存储空间不足。', 'system');
        return false;
    }
}

function loadGame(slot) {
    if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;

    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return false;

    try {
        const saveData = JSON.parse(raw);

        MemorySanctuary.state.resources = { ...saveData.state.resources };
        MemorySanctuary.state.week = saveData.state.week;
        MemorySanctuary.state.chapter = saveData.state.chapter;
        MemorySanctuary.state.completedArchives = [...saveData.state.completedArchives];
        MemorySanctuary.state.vaultUsage = { ...saveData.state.vaultUsage };
        MemorySanctuary.state.narrativeFlags = [...(saveData.state.narrativeFlags || [])];
        MemorySanctuary.state.activeEvents = [];
        MemorySanctuary.state.activeEventIds = [...(saveData.state.activeEventIds || [])];

        MemorySanctuary.currentVaultId = saveData.currentVaultId || 1;
        MemorySanctuary.activeEvent = null;

        localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

        renderAll();
        if (typeof initCanvas === 'function') initCanvas();

        const guardian = MemorySanctuary.data.guardians[0];
        if (guardian) showGuardianDialogue(guardian.id, 'idle');

        addLog(`已从存档槽 ${slot} 读取游戏。`, 'system');
        return true;
    } catch (e) {
        console.error('[存档] 读取失败:', e);
        addLog('读档失败：存档数据已损坏。', 'system');
        return false;
    }
}

function getSaveSlotInfo(slot) {
    const raw = localStorage.getItem(SAVE_KEY_PREFIX + slot);
    if (!raw) return null;

    try {
        const data = JSON.parse(raw);
        return {
            slot: data.slot,
            savedAt: data.savedAt,
            week: data.state.week,
            chapter: data.state.chapter,
            archivedCount: data.state.completedArchives.length,
            currentVaultId: data.currentVaultId,
            playthrough: data.playthrough || 1
        };
    } catch (e) {
        return null;
    }
}

function getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
        slots.push(getSaveSlotInfo(i));
    }
    return slots;
}

function deleteSaveSlot(slot) {
    localStorage.removeItem(SAVE_KEY_PREFIX + slot);
}

function hasAnySaves() {
    for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
        if (localStorage.getItem(SAVE_KEY_PREFIX + i)) return true;
    }
    return false;
}

function getCurrentSlot() {
    return parseInt(localStorage.getItem(CURRENT_SLOT_KEY) || '0');
}

// ==========================================
// 多周目继承
// ==========================================

function getNGPlusData() {
    const raw = localStorage.getItem(NG_PLUS_KEY);
    if (!raw) {
        return {
            playthroughCount: 0,
            totalArchivesSaved: 0,
            bonuses: []
        };
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        return {
            playthroughCount: 0,
            totalArchivesSaved: 0,
            bonuses: []
        };
    }
}

function saveNGPlusData(data) {
    localStorage.setItem(NG_PLUS_KEY, JSON.stringify(data));
}

function startNewGamePlus() {
    const ngData = getNGPlusData();
    ngData.playthroughCount++;
    ngData.bonuses = calculateNGPlusBonuses(ngData.playthroughCount);
    saveNGPlusData(ngData);
    return ngData;
}

function calculateNGPlusBonuses(playthrough) {
    const bonuses = [];
    if (playthrough >= 2) bonuses.push({ type: 'resource', resource: 'energy', value: 20, label: '起始能源+20' });
    if (playthrough >= 2) bonuses.push({ type: 'resource', resource: 'media', value: 15, label: '起始介质+15' });
    if (playthrough >= 3) bonuses.push({ type: 'resource', resource: 'energy', value: 30, label: '起始能源+30' });
    if (playthrough >= 3) bonuses.push({ type: 'resource', resource: 'media', value: 25, label: '起始介质+25' });
    if (playthrough >= 4) bonuses.push({ type: 'resource', resource: 'environment', value: 10, label: '起始环境+10' });
    if (playthrough >= 5) bonuses.push({ type: 'resource', resource: 'energy', value: 50, label: '起始能源+50' });
    return bonuses;
}

function applyNGPlusBonuses() {
    const ngData = getNGPlusData();
    if (!ngData.bonuses || ngData.bonuses.length === 0) return;

    ngData.bonuses.forEach(bonus => {
        if (bonus.type === 'resource') {
            MemorySanctuary.state.resources[bonus.resource] = Math.min(
                100,
                MemorySanctuary.state.resources[bonus.resource] + bonus.value
            );
        }
    });
}

// ==========================================
// 新游戏
// ==========================================

function startNewGame(slot, isNGPlus) {
    if (isNGPlus) {
        startNewGamePlus();
    }

    initGameState();

    if (isNGPlus) {
        applyNGPlusBonuses();
    }

    const logContent = document.getElementById('log-content');
    if (logContent) logContent.innerHTML = '';

    localStorage.setItem(CURRENT_SLOT_KEY, String(slot));

    renderAll();
    if (typeof initCanvas === 'function') initCanvas();

    showGuardianDialogue('tika', 'idle');

    saveGame(slot);

    const ngData = getNGPlusData();
    if (isNGPlus && ngData.playthroughCount > 1) {
        addLog(`第 ${ngData.playthroughCount} 周目开始。继承奖励已应用。`, 'system');
    } else {
        addLog('新游戏开始。愿你的选择得到善待。', 'system');
    }
}

// ==========================================
// 存档界面
// ==========================================

function openSaveScreen(mode) {
    const overlay = document.getElementById('save-overlay');
    const title = document.getElementById('save-panel-title');
    if (!overlay) return;

    if (title) {
        if (mode === 'load') {
            title.textContent = '记忆圣所 · 读档';
        } else if (mode === 'new') {
            title.textContent = '记忆圣所 · 新建游戏';
        } else {
            title.textContent = '记忆圣所 · 存档';
        }
    }

    renderSaveSlots(mode);
    overlay.classList.remove('hidden');
}

function closeSaveScreen() {
    const overlay = document.getElementById('save-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function renderSaveSlots(mode) {
    const container = document.getElementById('save-slots');
    if (!container) return;

    container.innerHTML = '';
    const slots = getAllSaveSlots();
    const currentSlot = getCurrentSlot();

    slots.forEach((info, index) => {
        const slotNum = index + 1;
        const card = document.createElement('div');
        card.className = 'save-slot-card';

        if (info) {
            const date = new Date(info.savedAt);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

            card.innerHTML = `
                <div class="save-slot-header">
                    <span class="save-slot-number">存档 ${slotNum}</span>
                    ${slotNum === currentSlot ? '<span class="save-slot-current">当前</span>' : ''}
                    <span class="save-slot-playthrough">第${info.playthrough}周目</span>
                </div>
                <div class="save-slot-info">
                    <div class="save-slot-week">第 ${info.week}周 · 第 ${info.chapter}章</div>
                    <div class="save-slot-archived">已归档: ${info.archivedCount} 条</div>
                    <div class="save-slot-date">${dateStr}</div>
                </div>
                <div class="save-slot-actions">
                    <button class="save-slot-btn load" data-slot="${slotNum}">读取</button>
                    ${mode === 'save' ? `<button class="save-slot-btn overwrite" data-slot="${slotNum}">覆盖</button>` : ''}
                    <button class="save-slot-btn delete" data-slot="${slotNum}">删除</button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="save-slot-header">
                    <span class="save-slot-number">存档 ${slotNum}</span>
                </div>
                <div class="save-slot-info">
                    <div class="save-slot-empty">空槽位</div>
                </div>
                <div class="save-slot-actions">
                    <button class="save-slot-btn new" data-slot="${slotNum}">新游戏</button>
                </div>
            `;
        }

        container.appendChild(card);
    });

    container.querySelectorAll('.save-slot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const slot = parseInt(e.target.dataset.slot);
            const action = e.target.classList.contains('load') ? 'load' :
                          e.target.classList.contains('overwrite') ? 'overwrite' :
                          e.target.classList.contains('delete') ? 'delete' :
                          e.target.classList.contains('new') ? 'new' : null;

            handleSaveAction(slot, action, mode);
        });
    });
}

function handleSaveAction(slot, action, mode) {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    
    switch (action) {
        case 'load':
            closeSaveScreen();
            // Always ensure title is hidden and game container visible
            if (titleScreen) titleScreen.classList.add('hidden');
            if (gameContainer) gameContainer.classList.remove('hidden');
            loadGame(slot);
            break;
        case 'overwrite':
            if (confirm(`确定要覆盖存档槽 ${slot} 吗？`)) {
                if (saveGame(slot)) {
                    closeSaveScreen();
                }
            }
            break;
        case 'delete':
            if (confirm(`确定要删除存档槽 ${slot} 吗？`)) {
                deleteSaveSlot(slot);
                renderSaveSlots(mode);
            }
            break;
        case 'new': {
            const ngData = getNGPlusData();
            const isNGPlus = ngData.playthroughCount > 0;
            
            closeSaveScreen();
            if (titleScreen) titleScreen.classList.add('hidden');
            if (gameContainer) gameContainer.classList.remove('hidden');
            startNewGame(slot, isNGPlus);
            break;
        }
    }
}

function initSaveSystem() {
    const saveBtn = document.getElementById('save-btn');
    const loadBtn = document.getElementById('load-btn');
    const saveCloseBtn = document.getElementById('save-close');

    // Save button: open slot selection panel
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            openSaveScreen('save');
        });
    }

    // Load button: open slot selection panel
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            openSaveScreen('load');
        });
    }

    if (saveCloseBtn) {
        saveCloseBtn.addEventListener('click', closeSaveScreen);
    }

    const overlay = document.getElementById('save-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSaveScreen();
        });
    }
}

// Start game after loading from title screen
function startGameAfterLoad(slot) {
    const titleScreen = document.getElementById('title-screen');
    const gameContainer = document.getElementById('game-container');
    
    titleScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    
    loadGame(slot);
    
    // Show tutorial for first-time players
    const savedTutorial = localStorage.getItem('memory-sanctuary-tutorial');
    if (!savedTutorial) {
        setTimeout(() => {
            if (typeof initTutorial === 'function') initTutorial();
        }, 500);
    }
}

// ==========================================
// 封印圣所 / 游戏完成
// ==========================================

function canSealSanctuary() {
    if (!MemorySanctuary.state) return false;
    return MemorySanctuary.state.week >= 10;
}

function sealSanctuary() {
    const archivedCount = MemorySanctuary.state.completedArchives.length;
    const totalCount = MemorySanctuary.data.archives.length;
    const ngData = getNGPlusData();

    // Update NG+ data
    ngData.totalArchivesSaved = (ngData.totalArchivesSaved || 0) + archivedCount;
    if (!ngData.bestRun || archivedCount > ngData.bestRun.count) {
        ngData.bestRun = { count: archivedCount, week: MemorySanctuary.state.week };
    }
    saveNGPlusData(ngData);

    // Show completion modal
    showSealModal(archivedCount, totalCount);
}

function showSealModal(archivedCount, totalCount) {
    const overlay = document.getElementById('modal-overlay');
    const title = document.getElementById('modal-title');
    const content = document.getElementById('modal-content');
    const closeBtn = document.getElementById('modal-close');

    if (!overlay || !title || !content) return;

    title.textContent = '圣所已封印';

    let modalContent = `你选择在此刻封印记忆圣所。\n\n`;
    modalContent += `最终统计：\n`;
    modalContent += `• 运行周数：${MemorySanctuary.state.week} 周\n`;
    modalContent += `• 归档条目：${archivedCount} / ${totalCount}\n`;
    modalContent += `• 存储室利用率：${Math.round((archivedCount / totalCount) * 100)}%\n\n`;

    const ngData = getNGPlusData();
    if (ngData.playthroughCount > 0) {
        modalContent += `多周目进度：\n`;
        modalContent += `• 已完成周目：${ngData.playthroughCount}\n`;
        modalContent += `• 累计归档：${ngData.totalArchivesSaved} 条\n`;
        if (ngData.bestRun) {
            modalContent += `• 最佳记录：${ngData.bestRun.count} 条（第${ngData.bestRun.week}周）\n`;
        }
    }

    modalContent += `\n你的选择决定了后世「看到」怎样的萨拉达斯文明。\n`;
    modalContent += `「——终来之刻，何物当存？」`;

    content.textContent = modalContent;
    overlay.classList.remove('hidden');

    if (closeBtn) {
        closeBtn.textContent = '继续游戏';
        closeBtn.onclick = () => {
            overlay.classList.add('hidden');
            closeBtn.textContent = '确认';
        };
    }
}

function renderSealButton() {
    const container = document.getElementById('save-info');
    if (!container) return;

    // Only show seal button if game is active (state exists)
    if (!MemorySanctuary.state) {
        container.innerHTML = '';
        return;
    }

    const canSeal = canSealSanctuary();
    const archivedCount = MemorySanctuary.state.completedArchives.length;

    if (!canSeal) {
        const weeksLeft = 10 - MemorySanctuary.state.week;
        container.innerHTML = `圣所需运行至少 10 周方可封印。还需 ${weeksLeft} 周。`;
        return;
    }

    container.innerHTML = '';
    const sealBtn = document.createElement('button');
    sealBtn.id = 'seal-btn';
    sealBtn.textContent = `封印圣所（已归档 ${archivedCount} 条）`;
    sealBtn.addEventListener('click', () => {
        if (confirm('确定封印圣所吗？这将结束当前周目并解锁多周目奖励。')) {
            sealSanctuary();
        }
    });
    container.appendChild(sealBtn);
}

// Override renderSaveSlots to also render the seal button
const _origRenderSaveSlots = renderSaveSlots;
renderSaveSlots = function(mode) {
    _origRenderSaveSlots(mode);
    renderSealButton();
};
