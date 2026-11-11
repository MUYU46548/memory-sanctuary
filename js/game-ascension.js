/**
 * game-ascension.js — 升天之仪（DLC 模式）核心状态机
 *
 * 职责：仪式九阶段推进、检修裁定、四格载荷、羽毛处置、发射判定、结局结算。
 * 不做 DOM，不做音频。UI 见 ui-ascension.js，声音见 audio-ascension.js。
 *
 * 设计依据（设定库 E:\图书馆\ROSA）：
 *   10 扩展术语/升天之仪.md  3.1 参与者 / 3.2 载荷与羽毛 / 3.3 六至七成成败 / 3.4 时序
 *   10 扩展术语/记忆圣所.md  第六节 双轴对比（向上=概要、向外=能被谁看到）
 *
 * 铁律：
 *   1. 数据全部来自 data/dlc/ascension/*.json，本文件不写任何业务文本。
 *   2. 发射成败是确定性的（由检修选择 + 完成度算出），不掷骰——玩家能学会规则。
 *   3. 任何访问 MemorySanctuary.state 的地方先判空。
 */

window.AscensionSystem = (function () {
    'use strict';

    // 天空窗口：从开始检修到点火，四十分钟。
    // 全按规程约需 38 分钟（含九次阶段开销），全上报必超时——时间压力来自「你选了稳」。
    // 正典 3.3：发射时机依赖观测者对晴朗窗口的经验判断，六至七成能上天。
    const WINDOW_SECONDS = 40 * 60;

    // 每进入一个新阶段的固定耗时（走位、喊话、等待）。
    const STAGE_OVERHEAD = 90;

    // 发射成功阈值（满分 120 上下）
    const LAUNCH_PASS = 50;

    let D = null;   // 数据包
    let S = null;   // 本局状态

    // ── 数据装载 ────────────────────────────────────────────

    function load() {
        const md = MemorySanctuary.moduleData && MemorySanctuary.moduleData.ascension;
        if (!md) return false;

        const stages = md.ascension_stages && md.ascension_stages.stages;
        const payloads = md.ascension_payloads && md.ascension_payloads.payloads;
        const endings = md.ascension_endings && md.ascension_endings.endings;

        if (!Array.isArray(stages) || !Array.isArray(payloads) || !Array.isArray(endings)) {
            if (typeof DEBUG !== 'undefined' && DEBUG) {
                console.warn('[升天] 数据不完整', {
                    stages: !!stages, payloads: !!payloads, endings: !!endings
                });
            }
            return false;
        }

        D = {
            stages: stages.slice().sort((a, b) => a.order - b.order),
            payloads,
            endings: endings.slice().sort((a, b) => b.priority - a.priority),
            byId: {}
        };
        D.payloads.forEach(p => { D.byId[p.id] = p; });
        return true;
    }

    // ── 新局 ────────────────────────────────────────────────

    function start() {
        if (!D && !load()) return false;

        S = {
            stageIndex: 0,
            clock: WINDOW_SECONDS,
            ritual: 60,              // 完成度，初始 60
            records: [],             // 事后记录（自行处理/上报都会留痕）
            checks: {},              // ck_id -> option_id
            payloads: {},            // slot -> payload_id
            plume: null,             // self | kin（系在瓶外）
            cut: null,               // self | kin（投入火盆）
            singers: null,           // wait | skip | tech
            chantMs: 0,
            launchScore: null,
            launchOk: null,
            timeAtLaunch: null,
            ended: false,
            ending: null,
            stageOf: 0
        };
        return true;
    }

    // ── 阶段 ────────────────────────────────────────────────

    function currentStage() {
        if (!S || !D) return null;
        if (S.stageIndex >= D.stages.length) return null;
        return D.stages[S.stageIndex];
    }

    function stageList() {
        return D ? D.stages : [];
    }

    function stageProgress() {
        if (!S || !D) return { index: 0, total: 0 };
        return { index: S.stageIndex + 1, total: D.stages.length };
    }

    /** 扣时间。返回扣完后是否已经超时（窗口已过）。 */
    function spend(seconds) {
        if (!S) return true;
        S.clock = Math.max(0, S.clock - Math.max(0, seconds | 0));
        return S.clock <= 0;
    }

    /**
     * 进入下一阶段。带载荷格的阶段，必须先选定载荷才允许推进。
     * @returns {object|null} 新阶段；已到末尾返回 null
     */
    function advance() {
        if (!S || !D) return null;
        const cur = currentStage();
        if (cur && cur.payloadSlot && !S.payloads[cur.payloadSlot]) return null;

        S.stageIndex += 1;
        if (S.stageIndex >= D.stages.length) return null;

        spend(STAGE_OVERHEAD);
        const next = D.stages[S.stageIndex];
        if (next.code === 'launch') S.timeAtLaunch = S.clock;
        return next;
    }

    // ── 检修裁定 ────────────────────────────────────────────

    function checklist() {
        const st = D && D.stages.find(s => s.code === 'inspect');
        return st ? st.checklist || [] : [];
    }

    /**
     * 对某一项做裁定。
     * @param {string} itemId  ck_xx
     * @param {string} optionId ck_xx_a|b|c
     */
    function applyCheck(itemId, optionId) {
        if (!S) return null;
        if (S.checks[itemId]) return null;               // 已裁定，不可改
        const item = checklist().find(i => i.id === itemId);
        if (!item) return null;
        const opt = item.options.find(o => o.id === optionId);
        if (!opt) return null;

        S.checks[itemId] = optionId;
        S.ritual += (opt.ritual | 0);
        if (opt.record) S.records.push(opt.record);
        const timedOut = spend(opt.time | 0);
        return { option: opt, timedOut, ritual: S.ritual, clock: S.clock };
    }

    function inspectDone() {
        if (!S) return false;
        return checklist().every(i => !!S.checks[i.id]);
    }

    function checkOption(itemId) {
        if (!S || !S.checks[itemId]) return null;
        const item = checklist().find(i => i.id === itemId);
        if (!item) return null;
        return item.options.find(o => o.id === S.checks[itemId]) || null;
    }

    // ── 四格载荷 ────────────────────────────────────────────

    function payloadOptions(slot) {
        return D ? D.payloads.filter(p => p.slot === slot) : [];
    }

    function selectPayload(slot, payloadId) {
        if (!S) return null;
        if (S.payloads[slot]) return null;               // 已封，不可改
        const p = D.byId[payloadId];
        if (!p || p.slot !== slot) return null;
        S.payloads[slot] = payloadId;
        return p;
    }

    function payloadOrder() {
        const st = D && D.stages.find(s => s.payloadSlot);
        return st ? ['base', 'lexicon', 'art', 'greeting'] : [];
    }

    function payloadById(id) {
        return (D && D.byId[id]) || null;
    }

    function selectedPayload(slot) {
        if (!S || !S.payloads[slot]) return null;
        return D.byId[S.payloads[slot]] || null;
    }

    function allPayloadsChosen() {
        return payloadOrder().every(slot => !!S.payloads[slot]);
    }

    // ── 羽毛 ────────────────────────────────────────────────

    /** 系在瓶外的羽毛：自己 / 已故亲人 */
    function choosePlume(which) {
        if (!S || S.plume) return false;
        if (which !== 'self' && which !== 'kin') return false;
        S.plume = which;
        if (which === 'kin') S.ritual += 2;   // 把她的印记交出去，仪轨上更重
        return true;
    }

    /** 投入火盆的羽毛：规程写的是自己的 */
    function chooseCut(which) {
        if (!S || S.cut) return false;
        if (which !== 'self' && which !== 'kin') return false;
        S.cut = which;
        if (which === 'self') {
            S.ritual += 3;
        } else {
            // 割亲人的羽毛不合规程，完成度减，但会成为结局里的重笔
            S.ritual -= 6;
            S.records.push('归寂阶段：投入火盆的羽毛并非执仪者本人的，无复核签字。');
        }
        return true;
    }

    // ── 歌者 ────────────────────────────────────────────────

    /**
     * wait  — 等剩下的歌者赶来（耗时，可能等不到）
     * skip  — 不等，两个人唱
     * tech  — 让技师代唱（不合仪轨，但流程能走完）
     */
    function chooseSingers(which) {
        if (!S || S.singers) return false;
        if (!['wait', 'skip', 'tech'].includes(which)) return false;
        S.singers = which;
        if (which === 'wait') {
            S.ritual += 4;
            spend(420);
            S.records.push('歌者阶段：等待缺员到场，耗时七分钟，未等到。');
        } else if (which === 'skip') {
            S.ritual -= 2;
            S.records.push('歌者阶段：两名词唱者完成五声部谱，缺员未补。');
        } else {
            S.ritual -= 7;
            S.records.push('歌者阶段：由技师代唱，不合仪轨。');
        }
        return true;
    }

    // ── 长啸 ────────────────────────────────────────────────

    /** 记录长啸时长（毫秒）。越长，载波调制越完整，但嗓子只经得起一次。 */
    function recordChant(ms) {
        if (!S) return 0;
        S.chantMs = Math.max(0, ms | 0);
        if (S.chantMs >= 8000) S.ritual += 6;
        else if (S.chantMs >= 4000) S.ritual += 3;
        else if (S.chantMs < 1200) S.ritual -= 3;
        return S.chantMs;
    }

    // ── 发射判定（确定性）────────────────────────────────────

    function launchBreakdown() {
        const rows = [];
        let score = 40;
        rows.push({ label: '基础', delta: 40, total: score });

        const drug = S.checks['ck_05'];
        const drugD = drug === 'ck_05_a' ? 30 : drug === 'ck_05_b' ? 15 : 0;
        score += drugD; rows.push({ label: '固体燃料药柱', delta: drugD, total: score });

        const rail = S.checks['ck_04'];
        const railD = rail === 'ck_04_a' ? 25 : rail === 'ck_04_b' ? 10 : -5;
        score += railD; rows.push({ label: '弹射轨角度', delta: railD, total: score });

        const abl = S.checks['ck_01'];
        const ablD = abl === 'ck_01_a' ? 15 : abl === 'ck_01_b' ? 0 : -5;
        score += ablD; rows.push({ label: '壳体烧蚀层', delta: ablD, total: score });

        const ant = S.checks['ck_06'];
        const antD = ant === 'ck_06_a' ? 10 : ant === 'ck_06_b' ? 0 : -5;
        score += antD; rows.push({ label: '通信天线', delta: antD, total: score });

        const ritD = S.ritual >= 70 ? 20 : S.ritual < 40 ? -30 : 0;
        score += ritD; rows.push({ label: '仪式完成度', delta: ritD, total: score });

        const clockD = (S.timeAtLaunch !== null && S.timeAtLaunch <= 0) ? -15 : 0;
        score += clockD; if (clockD) rows.push({ label: '窗口耗尽', delta: clockD, total: score });

        const singD = S.singers === 'wait' ? 5 : S.singers === 'tech' ? -10 : 0;
        score += singD; if (singD) rows.push({ label: '歌者状态', delta: singD, total: score });

        const chantD = S.chantMs >= 8000 ? 10 : S.chantMs >= 4000 ? 5 : 0;
        score += chantD; if (chantD) rows.push({ label: '长啸调制', delta: chantD, total: score });

        return { score, pass: score >= LAUNCH_PASS, rows, threshold: LAUNCH_PASS };
    }

    function computeLaunch() {
        if (!S) return null;
        const b = launchBreakdown();
        S.launchScore = b.score;
        S.launchOk = b.pass;
        return b;
    }

    // ── 结局 ────────────────────────────────────────────────

    function tagCounts() {
        const c = { truth: 0, comfort: 0, continuity: 0, silence: 0 };
        Object.values(S.payloads).forEach(id => {
            const p = D.byId[id];
            if (p && c[p.tag] !== undefined) c[p.tag] += 1;
        });
        return c;
    }

    function matchEnding() {
        if (!S || !D) return null;
        const tags = tagCounts();

        for (const e of D.endings) {
            const c = e.condition || {};
            if (c.crossModule) continue;                       // 跨模块结局：缤球号未实装，永不成立
            if (c.maxRitual !== undefined && S.ritual > c.maxRitual) continue;
            if (c.minRitual !== undefined && S.ritual < c.minRitual) continue;
            if (c.launchFailed === true && S.launchOk !== false) continue;
            if (c.launchFailed === false && S.launchOk !== true) continue;
            if (c.tagCount) {
                const ok = Object.entries(c.tagCount).every(([k, v]) => (tags[k] || 0) >= v);
                if (!ok) continue;
            }
            if (c.plume && S.plume !== c.plume) continue;
            if (c.cut && S.cut !== c.cut) continue;
            return e;
        }
        return D.endings[D.endings.length - 1] || null;
    }

    function finish() {
        if (!S) return null;
        S.ended = true;
        S.ending = matchEnding();
        return S.ending;
    }

    // ── 对外 ────────────────────────────────────────────────

    return {
        WINDOW_SECONDS,
        LAUNCH_PASS,
        load,
        start,
        currentStage,
        stageList,
        stageProgress,
        advance,
        spend,
        checklist,
        applyCheck,
        inspectDone,
        checkOption,
        payloadOptions,
        payloadOrder,
        payloadById,
        selectPayload,
        selectedPayload,
        allPayloadsChosen,
        choosePlume,
        chooseCut,
        chooseSingers,
        recordChant,
        launchBreakdown,
        computeLaunch,
        tagCounts,
        matchEnding,
        finish,
        isLoaded: () => !!D,
        get data() { return D; },
        get state() { return S; }
    };
})();
