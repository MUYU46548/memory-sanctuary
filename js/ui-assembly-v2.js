/**
 * ui-assembly.js — 装配台的 DOM 层（v2：一个舞台，不是一张后台表单）
 *
 * 设计参考（不是凭感觉）：
 *   · KSP 载具装配楼 —— 物件在中间当主角，零件在左，工程数据在右；数据靠图示与数字，不靠进度条。
 *   · Frostpunk —— 读数用表盘、刻度、红区；暗场里只有一盏暖灯。
 *   · The Room —— 材质压倒一切：做出来要像一个真物件，不是一张网页。
 *   · Disco Elysium —— 人站在旁边，不是一排按钮。
 *
 * 六个读数各有各的仪表（这是「工程感」的全部来源，也是遮字模式的底气）：
 *   质量 → 天平　密封 → 压力表　共振 → 示波器　平衡 → 重心十字　烧蚀 → 毫米尺　容量 → 晶体格
 *
 * 边界：这里不写一句台词；判定全问 Assembly。
 */

window.AssemblyUI = (function () {
    'use strict';

    const SLOT_ORDER = ['crystal', 'pad', 'shell', 'coat', 'ring', 'feather'];
    // 瓶身剖面自上而下（羽在外，晶体在里）
    const VESSEL_ORDER = ['feather', 'ring', 'coat', 'shell', 'pad', 'crystal'];

    let root = null, els = {};
    let selectedPart = null;
    let noText = false;
    let sealedShown = false;
    let flashT = null;

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    // ══════════════════════════════════════════════════════
    // 骨架
    // ══════════════════════════════════════════════════════

    function ensureRoot() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'as-root';
        root.className = 'hidden';
        root.innerHTML = `
          <div class="as-stage">
            <header class="as-top">
              <div class="as-title">
                <span class="as-kicker as-t">祈愿瓶</span>
                <span class="as-ord" id="as-gen"></span>
              </div>
              <div class="as-tools">
                <button class="as-tool" id="as-notext" title="遮住文字（Tab）">
                  <span class="as-t">遮字</span><span class="as-key">Tab</span>
                </button>
                <button class="as-tool" id="as-close"><span class="as-t">离开</span></button>
              </div>
            </header>

            <div class="as-scene">
              <aside class="as-drawer" id="as-parts" aria-label="零件"></aside>

              <main class="as-core">
                <div class="as-vessel-wrap">
                  <div class="as-vessel" id="as-vessel"></div>
                  <div class="as-total" id="as-total"></div>
                </div>
                <div class="as-hint" id="as-hint"></div>
              </main>

              <aside class="as-figures" id="as-people" aria-label="在场的人"></aside>
            </div>

            <footer class="as-tray">
              <div class="as-cargo" id="as-contents"></div>
              <div class="as-commit">
                <div class="as-status" id="as-status"></div>
                <div class="as-commit-btns">
                  <button class="as-btn as-btn-ghost" id="as-reset"><span class="as-t">全部取下</span></button>
                  <button class="as-btn" id="as-seal"><span class="as-t">合壳</span></button>
                </div>
              </div>
            </footer>
          </div>`;
        document.body.appendChild(root);

        els = {
            gen: $('as-gen'), people: $('as-people'), parts: $('as-parts'),
            vessel: $('as-vessel'), hint: $('as-hint'), total: $('as-total'),
            contents: $('as-contents'), status: $('as-status'),
            seal: $('as-seal'), reset: $('as-reset'),
            notext: $('as-notext'), close: $('as-close')
        };

        els.close.addEventListener('click', close);
        els.notext.addEventListener('click', toggleNoText);
        els.seal.addEventListener('click', doSeal);
        els.reset.addEventListener('click', () => {
            if (Assembly.state && Assembly.state.sealed) return;
            SLOT_ORDER.forEach(s => Assembly.remove(s));
            render();
        });

        document.addEventListener('keydown', e => {
            if (!root || root.classList.contains('hidden')) return;
            if (e.key === 'Tab') { e.preventDefault(); toggleNoText(); }
            if (e.key === 'Escape') close();
        });

        return root;
    }

    function open() {
        ensureRoot();
        root.classList.remove('hidden');
        document.body.classList.add('as-open');
        selectedPart = null;
        sealedShown = false;
        noText = false;
        root.classList.remove('as-notext');
        render();
    }

    function close() {
        if (root) root.classList.add('hidden');
        document.body.classList.remove('as-open');
        // 不再回调 Assembly.close()（它会回头调这里，死循环）
        if (window.AscensionWorld && AscensionWorld.onRitualClosed) {
            try { AscensionWorld.onRitualClosed(); } catch (e) { /* 世界没开也不影响 */ }
        }
    }

    function toggleNoText() {
        noText = !noText;
        root.classList.toggle('as-notext', noText);
        if (els.notext) els.notext.classList.toggle('on', noText);
    }

    // ══════════════════════════════════════════════════════
    // 渲染
    // ══════════════════════════════════════════════════════

    function render() {
        const S = Assembly.state;
        if (!S) return;
        els.gen.textContent = '第 ' + S.gen + ' 枚';
        renderPeople();
        renderDrawer();
        renderVessel();
        renderTotal();
        renderCargo();
        renderStatus();
    }

    // ── 人：站在台边的剪影 ───────────────────────────────

    function renderPeople() {
        const S = Assembly.state;
        const meta = {
            kamu: { name: '卡穆', job: '螺纹' },
            seran: { name: '瑟兰', job: '共振' },
            wei: { name: '薇希', job: '容量' }
        };
        els.people.innerHTML = ['kamu', 'seran', 'wei'].map(id => {
            const here = !!S.blind[id];
            const used = !!S.npcUsed[id];
            const m = meta[id];
            return `<button class="as-figure${here ? '' : ' gone'}${used ? ' used' : ''}"
                        data-npc="${id}" ${(!here || used || S.sealed) ? 'disabled' : ''}
                        title="${esc(m.name)}">
                      <span class="as-figure-head"></span>
                      <span class="as-figure-body"></span>
                      <span class="as-figure-name as-t">${m.name}</span>
                      <span class="as-figure-job as-t">${m.job}</span>
                    </button>`;
        }).join('');
        els.people.querySelectorAll('[data-npc]').forEach(b => {
            b.addEventListener('click', () => {
                const res = Assembly.npcAct(b.dataset.npc);
                if (res.ok) flashHint(res.says + (res.after ? ' ' + res.after : ''));
                else if (res.says) flashHint(res.says);
                render();
            });
        });
    }

    // ── 零件：抽屉里的实物清单 ───────────────────────────

    /** 零件的物理示意：条宽按质量给，遮字后靠它认大小 */
    function chunkVisual(p) {
        const w = Math.max(7, Math.min(32, Math.round((p.mass || 0) * 1.3)));
        return `<span class="as-chunk" style="width:${w}px"></span>`;
    }

    function renderDrawer() {
        const S = Assembly.state;
        const list = Assembly.partsFor(S.gen);
        const bySlot = {};
        list.forEach(p => { (bySlot[p.slot] || (bySlot[p.slot] = [])).push(p); });

        els.parts.innerHTML = SLOT_ORDER.filter(s => bySlot[s] && bySlot[s].length).map(slot => {
            const items = bySlot[slot];
            const placedId = S.slots[slot] ? S.slots[slot].id : null;
            return `<section class="as-bin">
              <h3 class="as-bin-name as-t">${esc(Assembly.slotLabel(slot))}</h3>
              ${items.map(p => {
                const placed = placedId === p.id;
                const pick = selectedPart === p.id;
                return `<button class="as-part${placed ? ' placed' : ''}${pick ? ' picked' : ''}"
                             draggable="${S.sealed ? 'false' : 'true'}"
                             data-part="${esc(p.id)}" data-slot="${slot}">
                          <span class="as-part-top">
                            ${chunkVisual(p)}
                            <span class="as-part-name as-t">${esc(p.name)}</span>
                            <span class="as-part-mass">${p.mass}</span>
                          </span>
                          <span class="as-part-note as-t">${esc(p.note || '')}</span>
                        </button>`;
            }).join('')}
            </section>`;
        }).join('');

        els.parts.querySelectorAll('[data-part]').forEach(el => {
            el.addEventListener('dragstart', e => {
                if (S.sealed) return;
                e.dataTransfer.setData('text/plain', el.dataset.part);
                e.dataTransfer.effectAllowed = 'move';
                el.classList.add('dragging');
            });
            el.addEventListener('dragend', () => el.classList.remove('dragging'));
            el.addEventListener('click', () => {
                if (S.sealed) return;
                selectedPart = selectedPart === el.dataset.part ? null : el.dataset.part;
                render();
            });
        });
    }

    // ── 瓶身：中间的主角（读数长在对应的那一段上）─────────

    // 每一段负责哪条读数：羽→共振　环→平衡　外层/壳→烧蚀　垫→密封　晶体→容量
    const SEG_DIAL = {
        feather: 'resonance',
        ring: 'balance',
        coat: 'ablative',
        shell: 'ablative',
        pad: 'seal',
        crystal: 'capacity'
    };

    function renderVessel() {
        const S = Assembly.state;
        const st = Assembly.stats();
        els.vessel.innerHTML = `<div class="as-vessel-nose"></div>` + VESSEL_ORDER.map(slot => {
            const p = S.slots[slot];
            const opt = Assembly.optional(slot);
            const c = st.checks.find(x => x.key === SEG_DIAL[slot]);
            const tone = c ? dialTone(c) : 'pending';
            return `<div class="as-seg ${slot}${p ? ' filled' : ''}${opt ? ' optional' : ''}"
                        data-slot="${slot}">
                      <span class="as-seg-label as-t">${esc(Assembly.slotLabel(slot))}</span>
                      <span class="as-seg-body">${p ? vesselMaterial(p) : ''}</span>
                      <span class="as-seg-tag as-t">${p ? esc(p.name) : (opt ? '可空' : '空')}</span>
                      <span class="as-seg-dial ${tone}">${c ? dialFace(c, tone) : ''}</span>
                    </div>`;
        }).join('') + `<div class="as-vessel-tail"></div>`;

        els.vessel.querySelectorAll('.as-seg').forEach(seg => {
            const slot = seg.dataset.slot;
            seg.addEventListener('dragover', e => {
                if (S.sealed) return;
                e.preventDefault();
                seg.classList.add('hover');
            });
            seg.addEventListener('dragleave', () => seg.classList.remove('hover'));
            seg.addEventListener('drop', e => {
                e.preventDefault();
                seg.classList.remove('hover');
                if (S.sealed) return;
                doPlace(e.dataTransfer.getData('text/plain'), slot);
            });
            seg.addEventListener('click', () => {
                if (S.sealed) return;
                if (selectedPart) { doPlace(selectedPart, slot); return; }
                const removed = Assembly.remove(slot);
                if (removed) { flashHint('取下：' + removed.name); render(); }
            });
        });
    }

    /** 装了零件之后，那一段的剖面真的变了（厚度、材质） */
    function vesselMaterial(p) {
        const id = p.id || '';
        if (id.indexOf('crystal') === 0) return `<span class="mat mat-crystal${id === 'crystal_big' ? ' big' : ''}"></span>`;
        if (id.indexOf('pad') === 0) return `<span class="mat mat-pad ${id === 'pad_thick' ? 'thick' : 'thin'}"></span>`;
        if (id.indexOf('shell') === 0) return `<span class="mat mat-shell ${id === 'shell_new' ? 'new' : 'old'}"></span>`;
        if (id.indexOf('coat') === 0) return `<span class="mat mat-coat"></span>`;
        if (id.indexOf('ring') === 0) return `<span class="mat mat-ring${id === 'ring_braced' ? ' braced' : ''}"></span>`;
        if (id.indexOf('feather') === 0) return `<span class="mat mat-feather"></span>`;
        return `<span class="mat"></span>`;
    }

    function doPlace(partId, slot) {
        const res = Assembly.place(partId, slot);
        if (!res.ok) {
            flashHint({
                'wrong-slot': '这个零件不进那个槽。',
                'not-available': '这批零件里没有它。',
                'sealed': '壳已经合上了。'
            }[res.reason] || '放不进去。');
            return;
        }
        selectedPart = null;
        const st = Assembly.stats();
        flashHint(res.replaced ? '换下 ' + res.part.name + '。' : '落位：' + res.part.name + '。' + firstBad(st));
        render();
    }

    function firstBad(st) {
        if (!st) return '';
        const bad = st.checks.filter(c => c.bad && !c.hidden && !c.pending);
        return bad.length ? bad[0].why : '';
    }

    // ══════════════════════════════════════════════════════
    // 六种仪表
    // ══════════════════════════════════════════════════════

    function renderTotal() {
        const st = Assembly.stats();
        if (!st) return;
        const mass = st.checks.find(c => c.key === 'mass');
        const tone = dialTone(mass);
        const pills = st.checks.map(c => {
            const tn = dialTone(c);
            return `<span class="as-pill ${tn}" title="${esc(c.label)}"></span>`;
        }).join('');
        els.total.innerHTML = `
          <figure class="as-mass ${tone}">
            <figcaption class="as-t">质量</figcaption>
            ${dialFace(mass, tone)}
            <div class="as-mass-read as-t">${dialText(mass, tone)}</div>
          </figure>
          <div class="as-pills">${pills}</div>`;
    }

    function dialTone(c) {
        if (c.pending) return 'pending';
        if (c.hidden) return 'unknown';
        return c.bad ? 'bad' : 'ok';
    }

    function dialText(c, tone) {
        if (tone === 'pending') return '未装';
        if (tone === 'unknown') return c.key === 'balance' ? '目视合格' : '听着还行';
        switch (c.key) {
            case 'mass': return c.value.toFixed(1) + ' / ' + c.limit + ' kg';
            case 'seal': return c.value.toFixed(3);
            case 'resonance': return c.value.toFixed(2);
            case 'balance': return c.value.toFixed(2);
            case 'ablative': return c.value.toFixed(1) + ' / ' + c.limit + ' mm';
            case 'capacity': return c.value + ' / ' + c.limit;
            default: return String(c.value);
        }
    }

    /** 每种读数一张自己的脸 */
    function dialFace(c, tone) {
        const V = 'viewBox="0 0 90 46" class="as-svg"';
        switch (c.key) {
            // 质量：天平，越重越往砝码那侧沉
            case 'mass': {
                const ratio = c.pending ? 0.5 : Math.max(0, Math.min(1, c.value / c.limit));
                const tilt = ((ratio - 0.5) * 16).toFixed(1);
                return `<svg ${V}>
                  <g transform="rotate(${tilt} 45 30)">
                    <line x1="16" y1="12" x2="74" y2="12" class="ink-bean"/>
                    <line x1="16" y1="12" x2="16" y2="22" class="ink-thin"/>
                    <line x1="74" y1="12" x2="74" y2="22" class="ink-thin"/>
                    <circle cx="16" cy="27" r="4.2" class="ink-dot"/>
                    <rect x="67" y="22" width="14" height="10" class="ink-solid"/>
                  </g>
                  <line x1="45" y1="30" x2="45" y2="40" class="ink-thin"/>
                  <path d="M33 41 H57" class="ink-bean"/>
                </svg>`;
            }
            // 密封：压力表，指针偏到左边红区就是漏
            case 'seal': {
                const r = c.pending ? 1 : Math.max(0, Math.min(1, (c.value - 0.94) / (1.0 - 0.94)));
                const ang = (-180 + r * 180).toFixed(1);
                return `<svg ${V}>
                  <path d="M12 38 A33 33 0 0 1 78 38" class="ink-thin" fill="none"/>
                  <path d="M12 38 A33 33 0 0 1 26 17" class="ink-red" fill="none"/>
                  <line x1="45" y1="38" x2="45" y2="9" class="ink-pointer"
                        transform="rotate(${ang} 45 38)"/>
                  <circle cx="45" cy="38" r="2.4" class="ink-solid"/>
                  <line x1="45" y1="5" x2="45" y2="9" class="ink-thin"/>
                </svg>`;
            }
            // 共振：示波器，越近红线，波越尖越密
            case 'resonance': {
                const t = c.pending ? 0.12 : Math.max(0, Math.min(1, c.value / (c.limit * 1.4)));
                const amp = 3 + t * 13;
                const freq = 2.2 + t * 3.4;
                let d = '';
                for (let i = 0; i <= 64; i++) {
                    const x = 8 + (i / 64) * 74;
                    const y = 24 - Math.sin((i / 64) * Math.PI * 2 * freq) * amp;
                    d += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
                }
                return `<svg ${V}>
                  <line x1="6" y1="24" x2="84" y2="24" class="ink-thin"/>
                  <line x1="84" y1="8" x2="84" y2="40" class="ink-limit"/>
                  <path d="${d}" class="ink-loop" fill="none"/>
                </svg>`;
            }
            // 平衡：重心十字，偏了多少一眼看得见
            case 'balance': {
                const off = c.pending ? 0 : Math.max(-1, Math.min(1, (c.value - 0.5) / 1.4));
                const cx = (45 + off * 21).toFixed(1);
                return `<svg ${V}>
                  <line x1="45" y1="8" x2="45" y2="40" class="ink-thin dashed"/>
                  <line x1="16" y1="24" x2="74" y2="24" class="ink-thin dashed"/>
                  <circle cx="45" cy="24" r="1.8" class="ink-dot"/>
                  <circle cx="${cx}" cy="24" r="4.6" class="ink-solid"/>
                </svg>`;
            }
            // 烧蚀：毫米尺，厚度块到哪儿就是哪儿，下限画一道
            case 'ablative': {
                const max = Math.max(6, c.limit + 1);
                const h = c.pending ? 0 : Math.max(0, Math.min(1, c.value / max)) * 32;
                const limY = (38 - (c.limit / max) * 32).toFixed(1);
                return `<svg ${V}>
                  <rect x="30" y="6" width="9" height="32" class="ink-track"/>
                  <rect x="30" y="${(38 - h).toFixed(1)}" width="9" height="${h.toFixed(1)}" class="ink-solid"/>
                  <line x1="20" y1="${limY}" x2="52" y2="${limY}" class="ink-limit"/>
                  <line x1="56" y1="6" x2="56" y2="38" class="ink-thin"/>
                  <line x1="56" y1="12" x2="64" y2="12" class="ink-thin"/>
                  <line x1="56" y1="24" x2="64" y2="24" class="ink-thin"/>
                  <line x1="56" y1="38" x2="64" y2="38" class="ink-thin"/>
                </svg>`;
            }
            // 容量：晶体里的格子，一格一格亮
            case 'capacity': {
                const need = Math.max(1, c.limit || 115);
                const have = c.pending ? 0 : c.value;
                let out = '';
                for (let i = 0; i < 20; i++) {
                    const on = ((i + 0.5) / 20) * need <= have;
                    out += `<rect x="${8 + (i % 10) * 7.6}" y="${i < 10 ? 9 : 25}" width="6" height="12"
                                  class="${on ? 'ink-solid' : 'ink-track'}"/>`;
                }
                return `<svg ${V}>${out}</svg>`;
            }
            default:
                return '';
        }
    }

    // ── 底部货格：四个抽屉 ───────────────────────────────

    function renderCargo() {
        const S = Assembly.state;
        const list = Assembly.contentsFor(S.gen);
        els.contents.innerHTML = `
          <div class="as-cargo-head as-t">晶体里装什么 · 一枚晶体，四样内容</div>
          <div class="as-cargo-row">
            ${list.map(c => {
            const on = S.contents.some(x => x.id === c.id);
            return `<button class="as-crate${on ? ' on' : ''}" data-content="${esc(c.id)}"
                         ${S.sealed ? 'disabled' : ''} title="${esc(c.note || '')}">
                      <span class="as-crate-fill" style="height:${Math.min(100, c.capacity)}%"></span>
                      <span class="as-crate-name as-t">${esc(c.name)}</span>
                      <span class="as-crate-need as-t">${c.capacity}</span>
                    </button>`;
        }).join('')}
          </div>`;
        els.contents.querySelectorAll('[data-content]').forEach(b => {
            b.addEventListener('click', () => { Assembly.toggleContent(b.dataset.content); render(); });
        });
    }

    function renderStatus() {
        const st = Assembly.stats();
        const S = Assembly.state;
        const bads = st.checks.filter(c => c.bad && !c.hidden && !c.pending);
        const unknowns = st.checks.filter(c => c.bad && c.hidden);
        let line;
        if (st.missing.length) line = '还缺：' + st.missing.map(s => Assembly.slotLabel(s)).join(' · ');
        else if (bads.length) line = bads.map(c => c.label).join(' · ') + ' 过不了';
        else if (unknowns.length) line = '有两项你看不见，但它们在红线外';
        else line = '六位齐了，都在线内。';

        els.status.innerHTML = `<span class="as-t">${esc(line)}</span>`;
        els.status.className = 'as-status' + (bads.length ? ' bad' : (st.missing.length ? '' : ' ok'));

        const can = Assembly.canSeal();
        els.seal.disabled = S.sealed || !can;
        els.seal.classList.toggle('ready', !S.sealed && can);
        els.seal.innerHTML = S.sealed
            ? '<span class="as-t">已合壳</span>'
            : (can ? '<span class="as-t">合壳</span>' : '<span class="as-t">还不能合</span>');

        if (S.sealed && !sealedShown) {
            sealedShown = true;
            els.hint.innerHTML = `<div class="as-result as-t">
                <b>封条压下去了。</b>
                ${st.checks.map(c => `<span>${c.label} · ${dialText(c, dialTone(c))}${c.bad ? '（红线外）' : ''}</span>`).join('')}
                <span class="as-result-note">${st.checks.some(c => c.bad)
                    ? '有几项在红线外。它也许会上去，但它保不住里面的东西。'
                    : '这一枚，能上去。'}</span>
              </div>`;
        } else if (!S.sealed) {
            els.hint.innerHTML = '';
        }
    }

    function doSeal() {
        const res = Assembly.seal();
        if (!res.ok) {
            flashHint(res.reason === 'missing' ? '还有槽是空的。' : '合不上。');
            return;
        }
        render();
    }

    function flashHint(text) {
        if (!els.hint || !text) return;
        if (els.hint.querySelector('.as-result')) return;
        els.hint.textContent = text;
        clearTimeout(flashT);
        flashT = setTimeout(() => {
            if (!Assembly.state || !Assembly.state.sealed) els.hint.textContent = '';
        }, 3800);
    }

    return { open, close, render, get isOpen() { return !!(root && !root.classList.contains('hidden')); } };
})();
