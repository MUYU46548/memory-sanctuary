/**
 * assembly.js — 升天之仪 · 装配台（核心动作）
 *
 * 职责：纯逻辑。槽位、放置/取下、六条读数、红线判定、三个人的盲区、合壳。
 * 不做：DOM（ui-assembly.js）、九阶段时序（game-ascension.js）、空间（ascension-world.js）。
 *
 * 数据：data/dlc/ascension/assembly_parts.json（meta / limits / slots / parts / contents / npcs）
 * 铁律：一个零件动两三个读数，没有最优解只有取舍；读数由数据算，不在这里写死任何数值。
 *
 * 入口（window.Assembly）：
 *   open(gen)      打开装配台，gen = 1|2|3（第几枚）
 *   close()        关掉
 *   sandbox        是否 ?bench=1 沙盒模式
 */

window.Assembly = (function () {
    'use strict';

    const SLOTS = ['crystal', 'pad', 'shell', 'coat', 'ring', 'feather'];
    const SLOT_LABEL = {
        crystal: '晶体座', pad: '缓冲层', shell: '壳体',
        coat: '外层', ring: '固定环', feather: '羽系'
    };
    // 外层允许空（正典：涂层可省，代价写在读数上）
    const OPTIONAL = { coat: true };

    let D = null;      // 数据包
    let S = null;      // 本台状态
    let closedAt = 0;  // 防止连点

    // ══════════════════════════════════════════════════════
    // 数据装载
    // ══════════════════════════════════════════════════════

    function load() {
        const md = window.MemorySanctuary && MemorySanctuary.moduleData && MemorySanctuary.moduleData.ascension;
        const d = md && md.assembly_parts;
        if (!d || !Array.isArray(d.parts) || !d.limits || !d.meta) return false;
        D = d;
        return true;
    }

    /** 第几枚能拿到哪些零件：第一枚十件，第三枚全是残骸，第二枚缺件（库存由幕一决定，沙盒给子集） */
    function partsFor(gen) {
        if (!D) return [];
        if (gen === 3) return D.parts.filter(p => p.gen === 3);
        const base = D.parts.filter(p => !p.gen);
        if (gen === 2) {
            // 第二枚：厚垫、加固环没了（幕一把它们用掉了）
            const gone = ['pad_thick', 'ring_braced'];
            return base.filter(p => gone.indexOf(p.id) < 0);
        }
        // 加固环在库里，但要卡穆复检过才拿得出来（他不说，你不知道该换）
        return base.filter(p => p.id !== 'ring_braced' || !!(S && S.kamuChecked));
    }

    function contentsFor(gen) {
        return D ? D.contents.slice() : [];
    }

    // ══════════════════════════════════════════════════════
    // 新的一次装配
    // ══════════════════════════════════════════════════════

    function open(gen) {
        if (!D && !load()) return false;
        gen = gen || 1;
        S = {
            gen: gen,
            slots: {},
            contents: [],
            sealed: false,
            // 三个人在不在场（在场 = 补上那条盲区）
            blind: { kamu: true, seran: true, wei: true },
            npcUsed: {},
            notes: []
        };
        SLOTS.forEach(s => { S.slots[s] = null; });
        // 不在这里开界面：2D（AssemblyUI）还是 3D（Assembly3D）由调用方决定。
        // 这里自己开 UI 会让 3D 沙盒被 2D 面板盖住（2026-11-14 实际踩到）。
        return true;
    }

    function close() {
        closedAt = Date.now();
        // 同上：界面由调用方关
    }

    // ══════════════════════════════════════════════════════
    // 放 / 取
    // ══════════════════════════════════════════════════════

    function partById(id) {
        return (D && D.parts.find(p => p.id === id)) || null;
    }

    /**
     * 把一个零件放进它的槽。
     * 返回 { ok, replaced, reason }
     */
    function place(partId, slotId) {
        if (!S) return { ok: false, reason: 'no-state' };
        if (S.sealed) return { ok: false, reason: 'sealed' };
        const p = partById(partId);
        if (!p) return { ok: false, reason: 'no-part' };
        const slot = slotId || p.slot;
        if (SLOTS.indexOf(slot) < 0) return { ok: false, reason: 'no-slot' };
        if (p.slot !== slot) return { ok: false, reason: 'wrong-slot' };
        if (partsFor(S.gen).indexOf(p) < 0) return { ok: false, reason: 'not-available' };

        // 同一槽只放一件；换件是允许的，但合壳之后不行
        const replaced = S.slots[slot];
        S.slots[slot] = p;
        return { ok: true, replaced: replaced ? replaced.id : null, part: p };
    }

    function remove(slotId) {
        if (!S || S.sealed) return null;
        const old = S.slots[slotId];
        S.slots[slotId] = null;
        return old;
    }

    // ══════════════════════════════════════════════════════
    // 内容：四格载荷（正典：一枚晶体，四样内容）
    // ══════════════════════════════════════════════════════

    function toggleContent(id) {
        if (!S || S.sealed) return false;
        const c = D.contents.find(x => x.id === id);
        if (!c) return false;
        const i = S.contents.indexOf(c);
        if (i >= 0) S.contents.splice(i, 1);
        else S.contents.push(c);
        return true;
    }

    function contentNeed() {
        return (S ? S.contents : []).reduce((n, c) => n + (c.capacity || 0), 0);
    }

    function contentMass() {
        return (S ? S.contents : []).reduce((n, c) => n + (c.mass || 0), 0);
    }

    // ══════════════════════════════════════════════════════
    // 读数：全部从数据算
    // ══════════════════════════════════════════════════════

    function stats() {
        if (!D || !S) return null;
        const L = D.limits, M = D.meta;

        let mass = contentMass();
        let seal = L.sealBase;
        let resonance = L.resonanceBase;
        let balance = L.balanceBase;
        let ablative = 0;
        let capacity = 0;

        SLOTS.forEach(s => {
            const p = S.slots[s];
            if (!p) return;
            mass += p.mass || 0;
            seal += p.seal || 0;
            resonance += p.resonance || 0;
            balance += p.balance || 0;
            ablative += p.ablative || 0;
            capacity += p.capacity || 0;
        });

        // 瑟兰让他换过绕法：共振真的降一点（她听出来的）
        if (S.seranTuned) resonance -= 0.05;

        // ── 三个人的盲区：不是加减 buff，是打开/关闭一条信息 ──
        // 薇希不在：手伸不到底 → 容量按 80% 计
        const capacityRaw = capacity;
        if (!S.blind.wei) capacity = Math.floor(capacity * 0.8);

        // 卡穆不在：螺纹没人复检 → 平衡读数显示为「目视合格」，不报警
        const balanceHidden = !S.blind.kamu;
        // 瑟兰不在：共振没人听 → 共振读数没有标尺，不报警
        const resonanceHidden = !S.blind.seran;

        // 烧蚀阈值取决于壳体：新壳按新标准，旧壳/残骸按旧标准
        const shell = S.slots.shell;
        const ablMin = (shell && shell.id === 'shell_new') ? L.ablativeMinNew : L.ablativeMinOld;

        const need = contentNeed();
        const missing = SLOTS.filter(s => !S.slots[s] && !OPTIONAL[s]);

        // 红线：每一条都是「这会怎样」，不是「你不合格」
        // pending = 这件东西还没装上，先别报红（空台全红只会变成噪音）
        const has = s => !!S.slots[s];
        const noneOf = (...ss) => ss.every(s => !S.slots[s]);

        const checks = [
            {
                key: 'mass', label: '质量', value: mass, limit: M.massMax, dir: 'max',
                bad: mass > M.massMax, pending: false,
                why: '发射架推到一半会滑。'
            },
            {
                key: 'seal', label: '密封', value: seal, limit: L.sealMin, dir: 'min',
                bad: noneOf('pad', 'shell') ? false : seal < L.sealMin, pending: noneOf('pad', 'shell'),
                why: '上去以后漏气，晶体先氧化。'
            },
            {
                key: 'resonance', label: '共振', value: resonance, limit: L.resonanceMax, dir: 'max',
                bad: noneOf('pad', 'feather') ? false : resonance > L.resonanceMax,
                pending: noneOf('pad', 'feather'), hidden: resonanceHidden,
                why: '台基会把它放大，到上面会颤。'
            },
            {
                key: 'balance', label: '平衡', value: balance, limit: L.balanceMax, dir: 'max',
                bad: has('ring') ? balance > L.balanceMax : false, pending: !has('ring'), hidden: balanceHidden,
                why: '重心偏，抬台的时候会歪。'
            },
            {
                key: 'ablative', label: '烧蚀', value: ablative, limit: ablMin, dir: 'min',
                bad: has('shell') ? ablative < ablMin : false, pending: !has('shell'),
                why: '过大气层的时候外壳先没。'
            },
            {
                key: 'capacity', label: '容量', value: capacity, limit: need, dir: 'min',
                bad: (has('crystal') && need > 0) ? capacity < need : false,
                pending: !has('crystal') || need === 0,
                why: '装不下你选的内容。'
            }
        ];

        return {
            mass, seal, resonance, balance, ablative, capacity, capacityRaw,
            need, missing, checks,
            balanceHidden, resonanceHidden,
            ablMin,
            sealed: S.sealed,
            gen: S.gen
        };
    }

    /** 能不能进下一步：六位齐（外层可空）+ 没有红线 */
    function canSeal() {
        const st = stats();
        if (!st) return false;
        if (st.missing.length) return false;
        return st.checks.every(c => !c.bad);
    }

    /** 合壳：不可逆。返回 {ok, stats} */
    function seal() {
        if (!S) return { ok: false, reason: 'no-state' };
        if (S.sealed) return { ok: false, reason: 'sealed' };
        const st = stats();
        const missing = st.missing;
        if (missing.length) return { ok: false, reason: 'missing', missing };
        S.sealed = true;
        return { ok: true, stats: st };
    }

    /** 合壳之前反悔 */
    function unseal() {
        if (!S) return false;
        S.sealed = false;
        return true;
    }

    // ══════════════════════════════════════════════════════
    // 三个人：各补一个盲区
    // ══════════════════════════════════════════════════════

    function npcById(id) {
        return (D && (D.npcs || []).find(n => n.id === id)) || null;
    }

    /**
     * 让某个人做他能做的那件事。
     * kamu：复检螺纹（打开隐性缺陷，交出加固环）
     * seran：听共振（改系法，共振 −0.05）
     * wei：伸手进去（容量 +20%）
     */
    function npcAct(id) {
        if (!S || S.sealed) return { ok: false, reason: 'sealed' };
        const n = npcById(id);
        if (!n) return { ok: false, reason: 'no-npc' };
        if (!S.blind[id]) return { ok: false, reason: 'absent' };
        if (S.npcUsed[id]) return { ok: false, reason: 'used', says: n.after };

        S.npcUsed[id] = true;
        const ef = n.effects || {};

        if (id === 'kamu') {
            // 他复检过螺纹：加固环才拿得出来（partsFor 读这个）
            S.kamuChecked = true;
            // 而且要记住：你换下来的那只环，螺纹滑了两扣
            S.notes.push({ who: n.name, says: n.says, after: n.after });
            return { ok: true, says: n.says, after: n.after, unlocks: n.unlocks };
        }
        if (id === 'seran') {
            // 她换了绕法：stats() 里的 seranTuned 会减共振
            S.seranTuned = true;
            S.notes.push({ who: n.name, says: n.says, after: n.after });
            return { ok: true, says: n.says, after: n.after, effects: ef };
        }
        // 薇希：她把晶体推到最里面。容量由「她在不在」决定，这里只留她说过的话
        S.notes.push({ who: n.name, says: n.says, after: n.after });
        return { ok: true, says: n.says, after: n.after };
    }

    /** 在场/不在场：缺人则这条盲区永久打开（沙盒里用开关模拟） */
    function setBlind(id, present) {
        if (!S) return false;
        S.blind[id] = !!present;
        return true;
    }

    // ══════════════════════════════════════════════════════
    // 导出
    // ══════════════════════════════════════════════════════

    return {
        /** ?bench=1 → 2D 版；?bench=3d → 3D 台面；没有则是正式流程 */
        get bench() {
            try {
                const v = new URLSearchParams(location.search).get('bench');
                return v === '3d' ? '3d' : (v === '1' ? '2d' : null);
            } catch (e) { return null; }
        },
        get sandbox() { return this.bench === '2d'; },
        get data() { return D; },
        get state() { return S; },
        get slots() { return SLOTS.slice(); },
        slotLabel(id) { return SLOT_LABEL[id] || id; },
        optional(id) { return !!OPTIONAL[id]; },
        load, open, close, partsFor, contentsFor,
        place, remove, toggleContent,
        contentNeed, contentMass,
        stats, canSeal, seal, unseal,
        npcById, npcAct, setBlind,
        _debug: {
            get stats() { return stats(); },
            get state() { return S; },
            pick(partId, slot) { return place(partId, slot); },
            /** 一键装一套指定组合，验收用 */
            preset(ids) {
                (ids || []).forEach(id => { const p = partById(id); if (p) S.slots[p.slot] = p; });
                return stats();
            }
        }
    };
})();
