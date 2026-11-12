/**
 * ascension-rooms.js — 升天之仪（DLC）· 房间：看见 → 话头 → 问
 *
 * 一层的数据全在 data/dlc/ascension/rooms/*.json：
 *   物件（props）身上挂若干「一眼」；一眼可能给一个话头；
 *   带着话头去问人，才能把话题问进第二层、第三层；第三层可以再发放新话头。
 *
 * 本文件只做「读数据 + 判定 + 渲染 DOM」，不碰 3D，不碰存档（状态由 AscensionWorld 传入并持久化）。
 * 依赖：data/dlc/ascension/rooms/*.json、css/ascension-world.css
 *
 * 接口（window.AscensionRooms）：
 *   mount({ state, save, toast })   state = 世界状态（含 threads / seen / asked）
 *   load(files)                     读房间文件，合并成一本总账
 *   openProp(prop) / openNpc(npcId) 打开面板
 *   renderKnow() / toggleKnow()     抽屉
 *   isOpen / back() / close()
 */

window.AscensionRooms = (function () {
    'use strict';

    // ── 总账（多间房间合并成一本）───────────────────────────
    let book = { props: [], threads: {}, npcs: {} };
    let S = null;             // 世界状态（引用，不复制）
    let hooks = {};           // { save, toast }
    let panel = { open: false, kind: null, prop: null, npcId: null, detail: null };
    let seenOpen = false;     // 抽屉里「看见的」默认折起来
    let els = {};

    // ── 取 DOM ─────────────────────────────────────────────
    function bind() {
        els = {
            dialog: document.getElementById('aw-dialog'),
            speaker: document.getElementById('aw-speaker'),
            text: document.getElementById('aw-text'),
            choices: document.getElementById('aw-choices'),
            hint: document.getElementById('aw-hint'),
            prompt: document.getElementById('aw-prompt'),
            know: document.getElementById('aw-know'),
            knowBtn: document.getElementById('aw-know-btn'),
            knowCount: document.getElementById('aw-know-count'),
            knowThreads: document.getElementById('aw-threads'),
            knowSeen: document.getElementById('aw-seen'),
            knowSeenCount: document.getElementById('aw-seen-total'),
            knowSeenToggle: document.getElementById('aw-seen-toggle'),
            knowHeadThreads: document.getElementById('aw-threads-head'),
            knowHeadSeen: document.getElementById('aw-seen-head')
        };
    }

    // ── 装载 ───────────────────────────────────────────────
    async function load(files) {
        book = { props: [], threads: {}, npcs: {} };
        for (const f of files) {
            try {
                const res = await fetch(f + '?v=0.2.13', { cache: 'no-store' });
                if (!res.ok) continue;
                const r = await res.json();
                (r.props || []).forEach(p => { p.roomName = r.title || '房间'; book.props.push(p); });
                Object.assign(book.threads, r.threads || {});
                Object.assign(book.npcs, r.npcs || {});
                if (r.shell) (book.shells = book.shells || []).push(r.shell);
            } catch (e) {
                console.warn('[升天之仪·房间] 读不了 ' + f, e);
            }
        }
        return book;
    }

    function reset() {
        panel = { open: false, kind: null, prop: null, npcId: null, detail: null };
        hidDialog();
        renderKnow();
    }

    // ── 小工具 ─────────────────────────────────────────────
    function threads() { return book.threads || {}; }
    function npcById(id) { return (book.npcs || {})[id] || null; }
    function curNpc() { return npcById(panel.npcId); }
    function hasThreads(need) { return (need || []).every(t => !!S.threads[t]); }
    function askedTier(topicId) {
        const v = S.asked[topicId];
        return v === undefined ? -1 : v;
    }
    function threadCount() { return Object.keys(S.threads).length; }
    function tiersAsked() {
        return Object.keys(S.asked).reduce((n, id) => n + S.asked[id] + 1, 0);
    }
    function persist() { if (hooks.save) { try { hooks.save(); } catch (e) { /* 存档失败不该打断游戏 */ } } }

    /** 这个话题现在能被问到第几层：-1 = 你还问不出口 */
    function maxTierOf(topic) {
        let best = -1;
        topic.tiers.forEach((tier, i) => {
            if (tier.after !== undefined && askedTier(topic.id) < tier.after) return;
            if (!hasThreads(tier.need)) return;
            if (i > best) best = i;
        });
        return best;
    }

    function noteThread(id) {
        if (!id || S.threads[id]) return false;
        S.threads[id] = true;
        const t = threads()[id] || {};
        const who = t.ask && npcById(t.ask) ? npcById(t.ask).name : '';
        if (!panel.open && hooks.toast) {
            hooks.toast(who ? '多了一句能问的话——' + who + '也许说得清。' : '多了一句能问的话。');
        }
        persist();
        renderKnow();
        return true;
    }

    // ── 面板 ───────────────────────────────────────────────
    function showDialog(lines, speaker, hint) {
        els.speaker.textContent = speaker || '';
        els.text.textContent = (lines || []).join('\n');
        els.choices.innerHTML = '';
        els.hint.textContent = hint || '';
        els.dialog.classList.remove('hidden');
        if (els.prompt) els.prompt.classList.add('hidden');
    }

    function hidDialog() {
        if (els.dialog) els.dialog.classList.add('hidden');
        if (els.choices) els.choices.innerHTML = '';
    }

    function addRow(label, cls, onPick) {
        const b = document.createElement('button');
        b.className = 'aw-choice' + (cls ? ' ' + cls : '');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', e => { e.stopPropagation(); onPick(); });
        els.choices.appendChild(b);
        return b;
    }

    function openProp(prop) {
        if (!prop) return;
        panel = { open: true, kind: 'prop', prop, npcId: null, detail: null };
        render();
    }

    function openNpc(npcId) {
        if (!npcById(npcId)) return;
        panel = { open: true, kind: 'npc', prop: null, npcId, detail: null };
        render();
    }

    function render() {
        if (!panel.open) return;
        if (panel.kind === 'prop') renderProp();
        else renderNpc();
    }

    function renderProp() {
        const p = panel.prop;
        const d = panel.detail;

        if (d && d.kind === 'obs') {
            showDialog(d.lines, d.speaker, d.hint);
            addRow('再看别处', '', () => { panel.detail = null; render(); });
            addRow('收起', 'quiet', close);
            return;
        }

        const seen = p.obs.filter(o => S.seen[o.id]).length;
        showDialog([p.desc], p.name + ' · ' + (p.roomName || '房间'),
            '看过 ' + seen + ' / ' + p.obs.length + '　空格 收起');

        p.obs.forEach(o => {
            const done = !!S.seen[o.id];
            addRow((done ? '已看 · ' : '看 · ') + o.label, done ? 'quiet' : 'look',
                () => readObs(p.name, o));
        });

        if (p.action) {
            addRow(p.action.label, 'act', () => {
                close();
                if (typeof hooks.action === 'function') hooks.action(p.action.id);
            });
        }

        addRow('收起', 'quiet', close);
    }

    function npcMood() {
        const q = curNpc();
        if (!q || !q.mood) return '';
        const n = tiersAsked();
        let idx = 0;
        (q.moodBreaks || [0]).forEach((brk, i) => { if (n >= brk) idx = i; });
        return q.mood[idx] || q.mood[0] || '';
    }

    function renderNpc() {
        const q = curNpc();
        const d = panel.detail;

        if (d && d.kind === 'obs') {
            showDialog(d.lines, d.speaker, d.hint);
            addRow('再看别的', '', () => { panel.detail = null; render(); });
            addRow('不说了', 'quiet', close);
            return;
        }
        if (d && d.kind === 'topic') {
            showDialog(d.lines, q.name + (q.role ? ' · ' + q.role : ''), '空格 收起');
            addRow('再问别的', '', () => { panel.detail = null; render(); });
            addRow('不说了', 'quiet', close);
            return;
        }

        showDialog([npcMood()], q.name + (q.role ? ' · ' + q.role : ''), '空格 收起');

        // 问：只列你问得出口的话
        (q.topics || []).forEach(t => {
            const top = maxTierOf(t);
            if (top < 0) return;
            const asked = askedTier(t.id);
            const more = top > asked;
            let cls = 'ask';
            if (asked >= 0 && !more) cls = 'quiet';
            else if (more && asked >= 0) cls = 'ask has-more';
            const prefix = (more && asked >= 0) ? '再问 · ' : '问 · ';
            addRow(prefix + t.label, cls, () => askTopic(t, Math.max(top, asked)));
        });

        // 看：他身上也有东西可看
        (q.obs || []).forEach(o => {
            const done = !!S.seen[o.id];
            addRow((done ? '已看 · ' : '看 · ') + o.label, done ? 'quiet' : 'look',
                () => readObs(q.name, o));
        });

        addRow('不说了', 'quiet', close);
    }

    // ── 两个动作：看，问 ───────────────────────────────────
    function readObs(speakerName, o) {
        const first = !S.seen[o.id];
        S.seen[o.id] = true;

        const lines = [o.text];
        let hint = '空格 收起';
        if (first && o.thread) {
            const t = threads()[o.thread];
            lines.push('');
            lines.push('你在心里记下一句能问的话：' + (t ? t.label : '') + '。');
            hint = '这句能拿去问人　空格 收起';
            panel.detail = { kind: 'obs', lines, hint, speaker: speakerName };
            render();
            noteThread(o.thread);
            return;
        }
        panel.detail = { kind: 'obs', lines, hint, speaker: speakerName };
        render();
        persist();
        renderKnow();
    }

    function askTopic(topic, tierIdx) {
        const tier = topic.tiers[tierIdx];
        if (!tier) return;

        const lines = tier.text.slice();
        (tier.bonus || []).forEach(b => {
            if (hasThreads(b.need)) { lines.push(''); lines.push.apply(lines, b.text); }
        });

        const fresh = (tier.grants || []).filter(id => !S.threads[id]);
        if (tierIdx > askedTier(topic.id)) S.asked[topic.id] = tierIdx;

        panel.detail = { kind: 'topic', lines };
        render();
        fresh.forEach(id => noteThread(id));
        persist();
        renderKnow();
    }

    function back() {
        if (!panel.open) return false;
        if (panel.detail) { panel.detail = null; render(); return true; }
        close();
        return true;
    }

    function close() {
        panel = { open: false, kind: null, prop: null, npcId: null, detail: null };
        hidDialog();
    }

    // ── 抽屉：你记住的话 ───────────────────────────────────
    function renderKnow() {
        if (!els.know || !S) return;

        if (els.knowCount) els.knowCount.textContent = String(threadCount());

        // 哪些话头已经拿去问过了
        const used = {};
        Object.keys(book.npcs || {}).forEach(id => {
            (book.npcs[id].topics || []).forEach(t => {
                const a = askedTier(t.id);
                (t.tiers || []).forEach((tier, i) => {
                    if (i <= a) (tier.need || []).forEach(n => { used[n] = true; });
                });
            });
        });

        const ids = Object.keys(threads()).filter(id => S.threads[id]);

        // 所有话头都问同一个人时，那句提示收到标题里，不在每一行重复
        const askers = {};
        ids.forEach(id => {
            const t = threads()[id];
            if (t.ask && npcById(t.ask)) askers[t.ask] = npcById(t.ask).name;
        });
        const askIds = Object.keys(askers);
        const single = askIds.length === 1 ? askers[askIds[0]] : '';
        if (els.knowHeadThreads) {
            els.knowHeadThreads.textContent = '能问的' + (single ? ' · 可以问' + single : '');
        }

        els.knowThreads.innerHTML = ids.length
            ? ids.map(id => {
                const t = threads()[id];
                const who = (!single && t.ask && npcById(t.ask)) ? npcById(t.ask).name : '';
                return '<div class="aw-know-row' + (used[id] ? ' used' : '') + '">' +
                    '<span class="aw-know-t">' + esc(t.label) + '</span>' +
                    (who ? '<span class="aw-know-who">可以问 ' + esc(who) + '</span>' : '') +
                    '</div>';
            }).join('')
            : '<div class="aw-know-empty">还没有。这间屋子里有东西你还没看。</div>';

        // 「看见的」按物件归组，挤成一段
        const groups = [];
        const pushSeen = (name, o) => {
            if (!S.seen[o.id]) return;
            let g = groups.find(x => x.name === name);
            if (!g) { g = { name, labels: [] }; groups.push(g); }
            g.labels.push(o.label);
        };
        (book.props || []).forEach(p => (p.obs || []).forEach(o => pushSeen(p.name, o)));
        Object.keys(book.npcs || {}).forEach(id => {
            (book.npcs[id].obs || []).forEach(o => pushSeen(book.npcs[id].name, o));
        });
        const total = groups.reduce((n, g) => n + g.labels.length, 0);

        els.knowSeen.innerHTML = groups.length
            ? '<div class="aw-know-seen">' + groups.map(g =>
                esc(g.name) + '：' + g.labels.map(esc).join('、')).join('　·　') + '</div>'
            : '<div class="aw-know-empty">还没看什么。</div>';
        if (els.knowSeenCount) els.knowSeenCount.textContent = '（' + total + '）';
        els.knowSeen.classList.toggle('hidden', !seenOpen);
        if (els.knowSeenToggle) els.knowSeenToggle.textContent = seenOpen ? '▾ 收起' : '▸ 展开';
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function toggleKnow(force) {
        if (!els.know) return;
        const show = force === undefined ? els.know.classList.contains('hidden') : force;
        els.know.classList.toggle('hidden', !show);
        if (els.knowBtn) els.knowBtn.classList.toggle('on', show);
        if (show) renderKnow();
    }

    // ── 挂载 ───────────────────────────────────────────────
    function mount(opts) {
        S = opts.state;
        hooks = { save: opts.save, toast: opts.toast, action: opts.action };
        bind();

        if (els.knowBtn) els.knowBtn.addEventListener('click', () => toggleKnow());
        if (els.knowHeadSeen) {
            els.knowHeadSeen.addEventListener('click', () => {
                seenOpen = !seenOpen;
                renderKnow();
            });
        }
        // 点面板空白处 = 返回上一层
        if (els.dialog) {
            els.dialog.addEventListener('click', e => {
                if (e.target.closest('.aw-choice')) return;
                back();
            });
        }
        renderKnow();
    }

    return {
        mount,
        load,
        reset,
        openProp,
        openNpc,
        back,
        close,
        render,
        renderKnow,
        toggleKnow,
        get isOpen() { return panel.open; },
        get book() { return book; }
    };
})();
