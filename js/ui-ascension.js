/**
 * ui-ascension.js — 升天之仪（DLC 模式）界面层
 *
 * 只做 DOM 渲染与事件绑定，业务判断全部交给 AscensionSystem。
 * 文本内容全部来自 data/dlc/ascension/*.json，本文件只保留界面提示语。
 *
 * 依赖：AscensionSystem（js/game-ascension.js）、AudioAscension（js/audio-ascension.js）
 */

window.AscensionUI = (function () {
    'use strict';

    let root = null;
    let els = {};
    let booted = false;
    let inIntro = false;          // 停在开场卡（尚未进入第一阶段）
    let inspectSceneSeen = false; // 检修场景读过一次后收起，把屏幕让给九项清单
    let expandedPayload = null;   // 当前展开的载荷候选 id
    let seenPayloads = new Set(); // 本局展开过全文的候选（用于提示"还没看全"）
    let pendingSeal = null;       // 待二次确认的封装候选 id
    let sealTimer = null;
    let chantRAF = null;

    const TAGS = {
        truth: '真相',
        comfort: '安慰',
        continuity: '延续',
        silence: '沉默'
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtClock(sec) {
        const s = Math.max(0, Math.floor(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    function sfx(name) {
        if (typeof AudioAscension !== 'undefined' && AudioAscension) {
            try { AudioAscension.play(name); } catch (e) { /* 音频失败不阻断流程 */ }
        }
    }

    // ── 骨架 ────────────────────────────────────────────────

    function ensureRoot() {
        if (root) return root;

        root = document.createElement('div');
        root.id = 'ascension-screen';
        root.className = 'hidden';
        root.innerHTML = `
            <div class="asc-shell">
                <div class="asc-top">
                    <span class="asc-stage-indicator" id="asc-stage-ind"></span>
                    <span class="asc-stage-name" id="asc-stage-name"></span>
                    <div class="asc-ritual">
                        <span class="asc-ritual-label">完成度</span>
                        <div class="asc-ritual-bar"><div class="asc-ritual-fill" id="asc-ritual-fill"></div></div>
                    </div>
                    <div class="asc-clock" id="asc-clock">45:00</div>
                </div>
                <div class="asc-scroll" id="asc-scroll"></div>
                <div class="asc-foot">
                    <span class="asc-foot-note" id="asc-foot-note"></span>
                    <span class="spacer"></span>
                    <button class="asc-btn danger" id="asc-abort">中止仪式</button>
                    <button class="asc-btn primary" id="asc-next">继续</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        els = {
            ind: root.querySelector('#asc-stage-ind'),
            name: root.querySelector('#asc-stage-name'),
            clock: root.querySelector('#asc-clock'),
            ritualFill: root.querySelector('#asc-ritual-fill'),
            scroll: root.querySelector('#asc-scroll'),
            note: root.querySelector('#asc-foot-note'),
            next: root.querySelector('#asc-next'),
            abort: root.querySelector('#asc-abort')
        };

        els.next.addEventListener('click', onNext);
        els.abort.addEventListener('click', onAbort);

        return root;
    }

    // ── 开场 / 关闭 ─────────────────────────────────────────

    async function open() {
        if (!window.AscensionSystem) {
            showAlertDialog('加载失败', '升天之仪模块未就绪。');
            return;
        }
        ensureRoot();
        root.classList.remove('hidden');
        if (typeof AudioSystem !== 'undefined' && AudioSystem.stopBGM) AudioSystem.stopBGM();

        els.scroll.innerHTML = `<div class="asc-intro"><p>正在装载仪式数据……</p></div>`;

        // 走 dlc.js 的正式加载接口
        if (typeof loadModuleData === 'function') {
            try { await loadModuleData('ascension'); } catch (e) { /* 下面统一判空 */ }
        }

        if (!AscensionSystem.load() || !AscensionSystem.start()) {
            els.scroll.innerHTML = `<div class="asc-intro">
                <h2>数据未就绪</h2>
                <p>仪式数据加载失败。请确认 data/dlc/ascension/ 下的三个文件存在且为合法 JSON。</p>
            </div>`;
            els.next.disabled = true;
            return;
        }

        booted = true;
        inIntro = true;
        inspectSceneSeen = false;
        seenPayloads = new Set();
        expandedPayload = null;
        renderIntro();
    }

    function close() {
        if (root) root.classList.add('hidden');
        if (typeof AudioAscension !== 'undefined' && AudioAscension) {
            try { AudioAscension.stopAll(); } catch (e) { /* ignore */ }
        }
        // 从 3D 世界进来的：回到世界，不下标题页
        if (typeof AscensionWorld !== 'undefined' && AscensionWorld && AscensionWorld.isOpen) {
            AscensionWorld.onRitualClosed();
            return;
        }
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playBGM) AudioSystem.playBGM('title');
        if (typeof showTitleScreen === 'function') showTitleScreen();
    }

    function renderIntro() {
        updateTop();
        els.next.textContent = '开始检修';
        els.next.disabled = false;
        els.abort.style.visibility = 'hidden';
        els.note.textContent = '';
        els.scroll.innerHTML = `
            <div class="asc-intro">
                <h2>升天之仪</h2>
                <div class="asc-intro-sub">Khal-Morath-En · 向穹顶归还羽毛</div>
                <p>你是这一次发射的执仪者。

从开始检修到点火，天空窗口只有四十分钟。九项检修、四格载荷、两名歌者、一枚羽毛——都要在这四十分钟里落定。</p>
                <p>成败不由运气决定。你此刻按下去的每一个选择，都会在点火那一刻算成物理。</p>
                <div class="asc-intro-rule">
                    按规程处理：稳，但吃时间。<br>
                    自行处理：快，但会进事后记录。<br>
                    上报等复核：不会有人来得及回你。
                </div>
                <p>最后要割一根自己的羽毛投进火盆。规矩里唯一写着你名字的那一条。</p>
            </div>
        `;
        sfx('open');
    }

    // ── 顶栏 ────────────────────────────────────────────────

    function updateTop() {
        const S = AscensionSystem.state;
        if (!S) return;
        const p = AscensionSystem.stageProgress();
        const st = AscensionSystem.currentStage();

        els.ind.textContent = st ? `阶段 ${p.index} / ${p.total}` : `阶段 ${p.total} / ${p.total}`;
        els.name.textContent = st ? st.title : '';
        if (S.clock > 0) {
            els.clock.textContent = fmtClock(S.clock);
            els.clock.title = '';
        } else {
            els.clock.textContent = '--:--';
            els.clock.title = '天空窗口已关闭：发射判定将受惩罚';
        }
        els.clock.classList.toggle('urgent', S.clock > 0 && S.clock <= 300);
        els.clock.classList.toggle('dead', S.clock <= 0);

        const r = Math.max(0, Math.min(100, S.ritual));
        els.ritualFill.style.width = r + '%';
        els.ritualFill.classList.toggle('low', r < 40);
        els.ritualFill.classList.toggle('high', r >= 70);

        if (st) els.abort.style.visibility = 'visible';
    }

    // ── 主渲染 ──────────────────────────────────────────────

    function render() {
        if (!booted) return;
        updateTop();

        const S = AscensionSystem.state;
        if (!S || S.ended) { renderEnding(); return; }

        const st = AscensionSystem.currentStage();
        if (!st) { renderEnding(); return; }

        try {
            switch (st.code) {
                case 'inspect':   renderInspect(st); break;
                case 'unseal':    renderPayloadStage(st, '拆封'); break;
                case 'load':      renderPayloadStage(st, '装舱'); break;
                case 'plume':     renderPlume(st); break;
                case 'singers':   renderPayloadStage(st, '歌者'); break;
                case 'carry':     renderPayloadStage(st, '抬台'); break;
                case 'chant':     renderChant(st); break;
                case 'launch':    renderLaunch(st); break;
                case 'farewell':  renderFarewell(st); break;
                default:
                    els.scroll.innerHTML = `<div class="asc-scene">${esc(st.scene || '')}</div>`;
                    els.next.disabled = false;
            }
        } catch (err) {
            // 任何一段渲染炸掉，都不能让界面静默停在上一阶段
            console.error('[升天] 阶段渲染失败', st.code, err);
            els.scroll.innerHTML = `<div class="asc-intro"><p>界面渲染出错（${esc(st.code)}）：${esc(err && err.message)}</p></div>`;
            els.next.disabled = true;
        }
    }

    function sceneBlock(st, extraHtml) {
        return `
            <div class="asc-scene">${esc(st.scene || '')}</div>
            ${st.hint ? `<div class="asc-hint">${esc(st.hint)}</div>` : ''}
            ${extraHtml || ''}
        `;
    }

    // ── 检修 ────────────────────────────────────────────────

    function renderInspect(st) {
        const S = AscensionSystem.state;
        const list = AscensionSystem.checklist();
        const doneCount = Object.keys(S.checks || {}).length;
        const showScene = !inspectSceneSeen;
        inspectSceneSeen = true;

        const items = list.map((item, i) => {
            const picked = AscensionSystem.checkOption(item.id);
            if (picked) {
                return `
                    <div class="asc-check done" data-item="${esc(item.id)}">
                        <div class="asc-check-head">
                            <span class="asc-check-no">${String(i + 1).padStart(2, '0')}</span>
                            <span class="asc-check-label">${esc(item.label)}</span>
                        </div>
                        <div class="asc-check-result">
                            已裁定：<span class="picked">${esc(picked.text)}</span>
                            <div class="asc-check-note">${esc(picked.note || '')}</div>
                        </div>
                    </div>
                `;
            }
            const opts = item.options.map(o => `
                <button class="asc-btn" data-item="${esc(item.id)}" data-opt="${esc(o.id)}">
                    <span>${esc(o.text)}</span>
                    <span class="asc-cost">${o.time >= 60 ? Math.round(o.time / 60) + ' 分' : o.time + ' 秒'}${o.ritual ? ` · 完成度 ${o.ritual > 0 ? '+' : ''}${o.ritual}` : ''}</span>
                </button>
            `).join('');
            return `
                <div class="asc-check" data-item="${esc(item.id)}">
                    <div class="asc-check-head">
                        <span class="asc-check-no">${String(i + 1).padStart(2, '0')}</span>
                        <span class="asc-check-label">${esc(item.label)}</span>
                    </div>
                    <div class="asc-check-reading">${esc(item.reading)}</div>
                    <div class="asc-check-rule">${esc(item.rule)}</div>
                    <div class="asc-check-options">${opts}</div>
                </div>
            `;
        }).join('');

        els.scroll.innerHTML = `
            ${showScene
                ? `<div class="asc-scene">${esc(st.scene || '')}</div>
                   <div class="asc-hint">${esc(st.hint || '')}</div>`
                : `<div class="asc-scene-bar"><span>检修清单 · 共 ${list.length} 项</span><button data-show-scene>重读场景</button></div>`}
            <div class="asc-progress-mini">已裁定 ${doneCount} / ${list.length}</div>
            <div class="asc-checklist">${items}</div>
        `;

        const showBtn = els.scroll.querySelector('[data-show-scene]');
        if (showBtn) {
            showBtn.addEventListener('click', () => {
                inspectSceneSeen = false;
                renderInspect(st);
            });
        }

        els.scroll.querySelectorAll('.asc-check-options .asc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const itemId = btn.dataset.item;
                const optId = btn.dataset.opt;
                const res = AscensionSystem.applyCheck(itemId, optId);
                if (!res) return;
                sfx('tick');
                if (res.timedOut) sfx('alarm');
                renderInspect(st);
                updateTop();
                updateFoot();
            });
        });

        els.next.textContent = '完成检修';
        els.next.disabled = !AscensionSystem.inspectDone();
        els.note.textContent = AscensionSystem.inspectDone() ? '' : '九项都要落定才能封舱。';
    }

    // ── 载荷阶段 ────────────────────────────────────────────

    function renderPayloadStage(st, label) {
        const slot = st.payloadSlot;
        const chosen = AscensionSystem.selectedPayload(slot);
        const options = AscensionSystem.payloadOptions(slot);
        const seenCount = options.filter(p => seenPayloads.has(p.id)).length;

        const cards = options.map((p, i) => {
            const isSel = chosen && chosen.id === p.id;
            const locked = !!chosen;
            const isOpen = expandedPayload === p.id;
            const preview = isOpen ? p.content : String(p.content || '').slice(0, 70) + '……';

            return `
                <div class="asc-payload ${isSel ? 'selected' : ''} ${locked && !isSel ? 'locked' : ''}" data-pid="${esc(p.id)}">
                    <div class="asc-payload-title">
                        <span class="asc-payload-tag">${i + 1} / ${options.length} · ${TAGS[p.tag] || ''}</span>
                        ${esc(p.title)}
                    </div>
                    <div class="asc-payload-preview">${esc(preview)}</div>
                    ${isOpen ? `
                        <div class="asc-appeal for">
                            <span class="asc-appeal-who">支持 · ${esc(p.appealFor.by)}（${esc(p.appealFor.role)}）</span>
                            ${esc(p.appealFor.text)}
                        </div>
                        <div class="asc-appeal against">
                            <span class="asc-appeal-who">反对 · ${esc(p.appealAgainst.by)}（${esc(p.appealAgainst.role)}）</span>
                            ${esc(p.appealAgainst.text)}
                        </div>
                        ${!locked ? `
                            <div class="asc-seal-box">
                                <div class="asc-seal-warn">封装即不可更改。其余候选永久归档，不会再有第二次升空。</div>
                                <div class="asc-seal-count ${seenCount >= options.length ? 'done' : ''}">${seenCount >= options.length ? '✓ 四份候选都看过了' : `已比对 ${seenCount} / ${options.length} 份候选，还有没点开的`}</div>
                                <button class="asc-btn solid" data-seal="${esc(p.id)}">封装这一格</button>
                            </div>` : ''}
                    ` : `<button class="asc-payload-expand" data-expand="${esc(p.id)}">展开全文与陈情</button>`}
                </div>
            `;
        }).join('');

        // 歌者阶段：先处理歌者，再处理载荷
        const singerBlock = (st.code === 'singers') ? renderSingerChooser() : '';

        els.scroll.innerHTML = `
            <div class="asc-scene">${esc(st.scene || '')}</div>
            ${st.hint ? `<div class="asc-hint">${esc(st.hint)}</div>` : ''}
            ${singerBlock}
            <div class="asc-slot-label">${esc(st.slotHint || label)}</div>
            <div class="asc-payloads">${cards}</div>
        `;

        els.scroll.querySelectorAll('[data-expand]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                expandedPayload = expandedPayload === btn.dataset.expand ? null : btn.dataset.expand;
                if (expandedPayload) seenPayloads.add(expandedPayload);
                sfx('tick');
                renderPayloadStage(st, label);
            });
        });

        els.scroll.querySelectorAll('.asc-payload').forEach(card => {
            card.addEventListener('click', () => {
                if (chosen) return;
                const pid = card.dataset.pid;
                expandedPayload = expandedPayload === pid ? null : pid;
                if (expandedPayload) seenPayloads.add(expandedPayload);
                sfx('tick');
                renderPayloadStage(st, label);
            });
        });

        els.scroll.querySelectorAll('[data-seal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pid = btn.dataset.seal;

                // 不可逆动作要两次：第一次变成"再点一次"，三秒内不再点就撤销
                if (pendingSeal !== pid) {
                    pendingSeal = pid;
                    btn.dataset.origText = btn.textContent;
                    btn.textContent = '再点一次 · 确认封装';
                    btn.classList.add('confirming');
                    clearTimeout(sealTimer);
                    sealTimer = setTimeout(() => {
                        pendingSeal = null;
                        btn.textContent = btn.dataset.origText || '封装这一格';
                        btn.classList.remove('confirming');
                    }, 3000);
                    return;
                }

                clearTimeout(sealTimer);
                pendingSeal = null;
                const p = AscensionSystem.selectPayload(slot, pid);
                if (!p) return;
                sfx('seal');
                expandedPayload = null;
                renderPayloadStage(st, label);
                updateTop();
                updateFoot();
            });
        });

        if (st.code === 'singers') bindSingerChooser(st, label);

        els.next.textContent = '继续';
        updateFoot();
    }

    function renderSingerChooser() {
        const S = AscensionSystem.state;
        if (S.singers) {
            const label = { wait: '等剩下的歌者赶来', skip: '两个人唱完五声部', tech: '让技师代唱' }[S.singers];
            return `<div class="asc-hint">歌者安排：${esc(label)}</div>`;
        }
        return `
            <div class="asc-hint">${esc('两个歌者唱不完五个人的谱子。谁唱哪一段，要现在定。')}</div>
            <div class="asc-check-options" style="margin-bottom:18px">
                <button class="asc-btn" data-singer="wait">
                    <span>等剩下的人赶来</span><span class="asc-cost">7 分 · 完成度 +4</span>
                </button>
                <button class="asc-btn" data-singer="skip">
                    <span>不等，两个人唱</span><span class="asc-cost">完成度 −2</span>
                </button>
                <button class="asc-btn" data-singer="tech">
                    <span>让技师代唱</span><span class="asc-cost">完成度 −7</span>
                </button>
            </div>
        `;
    }

    function bindSingerChooser(st, label) {
        els.scroll.querySelectorAll('[data-singer]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ok = AscensionSystem.chooseSingers(btn.dataset.singer);
                if (!ok) return;
                sfx(btn.dataset.singer === 'tech' ? 'alarm' : 'tick');
                renderPayloadStage(st, label);
                updateTop();
            });
        });
    }

    // ── 羽毛（系在瓶外）──────────────────────────────────────

    function renderPlume(st) {
        const S = AscensionSystem.state;

        if (S.plume) {
            els.scroll.innerHTML = sceneBlock(st, `
                <div class="asc-hint">系在瓶外的是：${S.plume === 'self' ? '你自己的翎羽' : '你妹妹的那一根'}</div>
            `);
            els.next.disabled = false;
            els.note.textContent = '';
            return;
        }

        els.scroll.innerHTML = sceneBlock(st, `
            <div class="asc-slot-label">${esc(st.plumePrompt || '选一枚系在瓶外')}</div>
            <div class="asc-plumes">
                <div class="asc-plume" data-plume="self">
                    <div class="asc-plume-icon">🪶</div>
                    <div class="asc-plume-name">你自己的翎羽</div>
                    <div class="asc-plume-desc">还剩下三根，都不鲜艳了。你的还会长回来，虽然长不回原来的颜色。</div>
                </div>
                <div class="asc-plume" data-plume="kin">
                    <div class="asc-plume-icon">🕯️</div>
                    <div class="asc-plume-name">妮拉的那一根</div>
                    <div class="asc-plume-desc">用金属丝缠了两圈，一直在左胸内袋。她没能进二号避难所。</div>
                </div>
            </div>
        `);

        els.scroll.querySelectorAll('[data-plume]').forEach(el => {
            el.addEventListener('click', () => {
                if (!AscensionSystem.choosePlume(el.dataset.plume)) return;
                sfx(el.dataset.plume === 'kin' ? 'kin' : 'tick');
                render();
                updateTop();
            });
        });

        els.next.textContent = '继续';
        els.next.disabled = true;
        els.note.textContent = '选一枚羽毛系在瓶外。';
    }

    // ── 长啸 ────────────────────────────────────────────────

    function renderChant(st) {
        const S = AscensionSystem.state;

        if (S.chantMs > 0) {
            const sec = (S.chantMs / 1000).toFixed(1);
            els.scroll.innerHTML = sceneBlock(st, `
                <div class="asc-hint">你唱了 ${sec} 秒。嗓子像被砂纸从里面拉过一遍。</div>
            `);
            els.next.disabled = false;
            els.note.textContent = '';
            return;
        }

        els.scroll.innerHTML = sceneBlock(st, `
            <div class="asc-chant-wrap">
                <button class="asc-chant-btn" id="asc-chant-btn">按住 · 发声</button>
                <div class="asc-chant-meter"><div class="asc-chant-fill" id="asc-chant-fill"></div></div>
                <div class="asc-chant-read" id="asc-chant-read">0.0 秒</div>
                <div class="asc-hint" style="max-width:420px;text-align:center">${esc(st.chantNote || '')}</div>
            </div>
        `);

        const btn = els.scroll.querySelector('#asc-chant-btn');
        const fill = els.scroll.querySelector('#asc-chant-fill');
        const read = els.scroll.querySelector('#asc-chant-read');
        let startAt = 0;
        let holding = false;

        const tickUi = () => {
            if (!holding) return;
            const ms = performance.now() - startAt;
            const pct = Math.min(100, (ms / 8000) * 100);
            fill.style.width = pct + '%';
            read.textContent = (ms / 1000).toFixed(1) + ' 秒';
            chantRAF = requestAnimationFrame(tickUi);
        };

        const begin = (e) => {
            e.preventDefault();
            if (holding) return;
            holding = true;
            startAt = performance.now();
            btn.classList.add('holding');
            btn.textContent = '正在长啸……';
            sfx('chantStart');
            chantRAF = requestAnimationFrame(tickUi);
        };

        const end = (e) => {
            if (!holding) return;
            e.preventDefault();
            holding = false;
            btn.classList.remove('holding');
            if (chantRAF) { cancelAnimationFrame(chantRAF); chantRAF = null; }
            const ms = performance.now() - startAt;
            if (ms < 800) {
                btn.textContent = '太短了 · 再来一次';
                fill.style.width = '0%';
                read.textContent = '0.0 秒';
                sfx('alarm');
                return;
            }
            AscensionSystem.recordChant(ms);
            sfx('chantEnd');
            render();
            updateTop();
        };

        btn.addEventListener('pointerdown', begin);
        btn.addEventListener('pointerup', end);
        btn.addEventListener('pointercancel', end);
        btn.addEventListener('pointerleave', end);

        els.next.textContent = '继续';
        els.next.disabled = true;
        els.note.textContent = '按住直到你发不出声音为止。';
    }

    // ── 发射 ────────────────────────────────────────────────

    function renderLaunch(st) {
        const S = AscensionSystem.state;

        if (S.launchScore === null) {
            els.scroll.innerHTML = sceneBlock(st, `
                <div style="margin-top:20px"><button class="asc-btn primary" id="asc-ignite" style="width:220px;padding:16px">点 火</button></div>
            `);
            els.scroll.querySelector('#asc-ignite').addEventListener('click', () => {
                const b = AscensionSystem.computeLaunch();
                sfx('ignite');
                renderLaunch(st);
                updateTop();
            });
            els.next.disabled = true;
            els.next.textContent = '继续';
            els.note.textContent = '';
            return;
        }

        const b = AscensionSystem.launchBreakdown();
        const rows = b.rows.map(r => `
            <div class="asc-launch-row">
                <span>${esc(r.label)}</span>
                <span class="${r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}</span>
            </div>
        `).join('');

        els.scroll.innerHTML = sceneBlock(st, `
            <div class="asc-launch-rows">
                ${rows}
                <div class="asc-launch-row total"><span>合计</span><span>${b.score} / 阈值 ${b.threshold}</span></div>
            </div>
            <div class="asc-hint">${b.pass ? '按这个数，它上得去。' : '按这个数，它上不去。你还有几秒钟可以希望我算错了。'}</div>
        `);

        els.next.textContent = '看着它上去';
        els.next.disabled = false;
        els.note.textContent = b.pass ? '发射判定：通过' : '发射判定：失败';
    }

    // ── 割羽 ────────────────────────────────────────────────

    function renderFarewell(st) {
        const S = AscensionSystem.state;

        if (S.cut) {
            els.scroll.innerHTML = sceneBlock(st, `
                <div class="asc-hint">${S.cut === 'self' ? '你割了自己的。血流到手腕，很快就干了。' : '你割了她的。刀刃碰到那圈金属丝的时候，你停了很久。'}</div>
            `);
            els.next.textContent = '沉默返回地下';
            els.next.disabled = false;
            return;
        }

        els.scroll.innerHTML = sceneBlock(st, `
            <div class="asc-slot-label">${esc(st.cutPrompt || '割羽投入火盆')}</div>
            <div class="asc-plumes">
                <div class="asc-plume" data-cut="self">
                    <div class="asc-plume-icon">🪶</div>
                    <div class="asc-plume-name">割自己的</div>
                    <div class="asc-plume-desc">规程写的就是这一条。疼一下，出血，然后烧掉。</div>
                </div>
                <div class="asc-plume" data-cut="kin">
                    <div class="asc-plume-icon">🕯️</div>
                    <div class="asc-plume-name">割妮拉的</div>
                    <div class="asc-plume-desc">她的那根一直没投过火。这是最后一根她的东西。</div>
                </div>
            </div>
        `);

        els.scroll.querySelectorAll('[data-cut]').forEach(el => {
            el.addEventListener('click', () => {
                if (!AscensionSystem.chooseCut(el.dataset.cut)) return;
                sfx(el.dataset.cut === 'kin' ? 'kin' : 'cut');
                render();
                updateTop();
            });
        });

        els.next.textContent = '继续';
        els.next.disabled = true;
        els.note.textContent = '规矩里唯一写着你名字的那一条。';
    }

    // ── 结局 ────────────────────────────────────────────────

    function renderEnding() {
        const S = AscensionSystem.state;
        if (!S) return;

        const ending = S.ended ? S.ending : AscensionSystem.finish();
        updateTop();

        if (!ending) {
            els.scroll.innerHTML = `<div class="asc-intro"><p>未命中任何结局条件。</p></div>`;
            els.next.disabled = true;
            return;
        }

        const tags = AscensionSystem.tagCounts();
        const bt = S.launchScore === null ? '未点火' : (S.launchOk ? '上天' : '坠回');
        const plumeTxt = S.plume === 'self' ? '自己的翎羽' : S.plume === 'kin' ? '妮拉的那一根' : '未系';
        const cutTxt = S.cut === 'self' ? '割自己的' : S.cut === 'kin' ? '割妮拉的' : '未割';

        const records = (S.records || []).map(r => `<span class="asc-ledge-item">· ${esc(r)}</span>`).join('');

        els.scroll.innerHTML = `
            <div class="asc-ending">
                <div class="asc-ending-title">${esc(ending.title)}</div>
                <div class="asc-ending-body">${esc(ending.description)}</div>
                <div class="asc-ending-sub">一千年之后</div>
                <div class="asc-ending-future">${esc(ending.futureReading || '')}</div>
                <dl class="asc-ending-summary">
                    <dt>完成度</dt><dd>${Math.max(0, Math.min(100, S.ritual))} / 100</dd>
                    <dt>发射</dt><dd>${bt}${S.launchScore === null ? '' : `（${S.launchScore}）`}</dd>
                    <dt>载荷</dt><dd>真相 ${tags.truth} · 安慰 ${tags.comfort} · 延续 ${tags.continuity} · 沉默 ${tags.silence}</dd>
                    <dt>系羽</dt><dd>${plumeTxt}</dd>
                    <dt>投火</dt><dd>${cutTxt}</dd>
                </dl>
                ${records ? `<div class="asc-ending-sub">事后记录</div><div class="asc-ledge">${records}</div>` : ''}
            </div>
        `;

        els.next.textContent = '回到标题';
        els.next.disabled = false;
        els.abort.style.visibility = 'hidden';
        els.note.textContent = '';
        sfx(S.launchOk === false ? 'reject' : 'ending');
    }

    // ── 底栏 ────────────────────────────────────────────────

    function updateFoot() {
        const S = AscensionSystem.state;
        const st = AscensionSystem.currentStage();
        if (!S || !st) return;

        let ok = true;
        let note = '';

        if (st.code === 'inspect') {
            ok = AscensionSystem.inspectDone();
            if (!ok) note = '九项都要落定才能封舱。';
        } else if (st.payloadSlot) {
            ok = !!S.payloads[st.payloadSlot];
            if (!ok) note = '这一格定完才能往下走。';
            if (st.code === 'singers' && !S.singers) { ok = false; note = '先定歌者怎么唱。'; }
        } else if (st.code === 'plume') {
            ok = !!S.plume;
            if (!ok) note = '选一枚羽毛系在瓶外。';
        } else if (st.code === 'chant') {
            ok = S.chantMs > 0;
            if (!ok) note = '按住直到你发不出声音为止。';
        } else if (st.code === 'farewell') {
            ok = !!S.cut;
            if (!ok) note = '规矩里唯一写着你名字的那一条。';
        }

        els.next.disabled = !ok;
        if (note) els.note.textContent = note;
        else if (els.note.textContent && els.note.textContent !== '') els.note.textContent = '';
    }

    function onNext() {
        const S = AscensionSystem.state;
        if (!S) return;

        // 开场卡 → 进入第一阶段（检修）
        if (inIntro) {
            inIntro = false;
            sfx('open');
            render();
            return;
        }

        // 结局 → 回标题
        if (S.ended) { close(); return; }

        const st = AscensionSystem.currentStage();
        if (!st) { AscensionSystem.finish(); renderEnding(); return; }

        // 割羽之后即结算
        if (st.code === 'farewell' && S.cut) {
            sfx('ending');
            AscensionSystem.finish();
            renderEnding();
            return;
        }

        const next = AscensionSystem.advance();
        sfx('step');
        if (!next) {
            AscensionSystem.finish();
            renderEnding();
            return;
        }
        expandedPayload = null;
        render();
    }

    function onAbort() {
        const S = AscensionSystem.state;
        if (!S || S.ended) { close(); return; }
        if (S.stageIndex === 0 && !AscensionSystem.inspectDone()) { close(); return; }
        showConfirmDialog(
            '中止仪式',
            '停下就再没有第二次窗口。瓶子会留在架子上，这一枚不会升空。',
            () => { AscensionSystem.finish(); renderEnding(); },
            { confirmText: '中止' }
        );
    }

    return {
        open,
        close,
        render,
        get isOpen() { return !!(root && !root.classList.contains('hidden')); }
    };
})();
