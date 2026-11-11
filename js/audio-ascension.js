/**
 * audio-ascension.js — 升天之仪（DLC 模式）程序化声音
 *
 * 全部用 Web Audio 现场合成，不含任何音频素材文件。
 * 依据设定库：升天之仪 3.1（三至五名诵唱者全程吟唱）、3.4（长啸、割羽投入火盆）、
 *              记忆圣所 3.2（环境声采集：风、水、绳、鸟群）。
 *
 * 设计原则：
 *   1. 没有真实人声。合成器只做"无词长音"，这是能力边界，不假装能唱。
 *   2. 环境是沙风 + 极低频 drone，发射台的声音比你想象的小。
 *   3. 任何一路失败都不抛异常，不影响流程。
 */

window.AudioAscension = (function () {
    'use strict';

    let ctx = null;
    let master = null;
    let ambient = null;       // { noise, filter, gain, drone, droneGain }
    let volume = 0.7;
    let started = false;

    function muted() {
        try {
            if (window.AudioSystem && AudioSystem.isGlobalMuted) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    function ensure() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            return ctx;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = volume;
            master.connect(ctx.destination);
            // 一层整体的低通，压掉数码感，贴近老设备的听感
            const tone = ctx.createBiquadFilter();
            tone.type = 'lowpass';
            tone.frequency.value = 6800;
            master.disconnect();
            master.connect(tone);
            tone.connect(ctx.destination);
        } catch (e) {
            ctx = null;
        }
        return ctx;
    }

    function now() { return ctx.currentTime; }

    // ── 基础积木 ────────────────────────────────────────────

    function noiseBuffer(seconds) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;   // 棕噪声，比白噪声更像风
            data[i] = last * 3.2;
        }
        return buf;
    }

    function envGain(peak, attack, decay, startAt) {
        const g = ctx.createGain();
        const t = startAt || now();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
        if (decay > 0) g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        return g;
    }

    function osc(type, freq, at) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        if (at) o.start(at);
        return o;
    }

    // ── 环境：沙风 + drone ──────────────────────────────────

    function startAmbience() {
        if (!ensure() || started) return;
        const t = now();

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(6);
        src.loop = true;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 720;
        lp.Q.value = 0.6;

        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.055, t + 2.4);

        src.connect(lp);
        lp.connect(g);
        g.connect(master);
        src.start(t);

        // 极低频 drone：行星本身在响
        const dOsc = osc('sine', 46, t);
        const dOsc2 = osc('sine', 69, t);
        const dGain = ctx.createGain();
        dGain.gain.value = 0.0001;
        dGain.gain.exponentialRampToValueAtTime(0.032, t + 3.2);
        dOsc.connect(dGain);
        dOsc2.connect(dGain);
        dGain.connect(master);

        ambient = { src, lp, g, dOsc, dOsc2, dGain };
        started = true;
    }

    /** 阶段推进时压低环境的高频：越接近发射，世界越闷 */
    function muffle(progress) {
        if (!ambient || !ctx) return;
        const p = Math.max(0, Math.min(1, progress));
        const f = 720 - 420 * p;
        try {
            ambient.lp.frequency.cancelScheduledValues(now());
            ambient.lp.frequency.linearRampToValueAtTime(f, now() + 1.2);
        } catch (e) { /* ignore */ }
    }

    function stopAll() {
        if (!ctx) return;
        const t = now();
        try {
            if (ambient) {
                ambient.g.gain.cancelScheduledValues(t);
                ambient.g.gain.linearRampToValueAtTime(0.0001, t + 0.6);
                ambient.dGain.gain.cancelScheduledValues(t);
                ambient.dGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
                setTimeout(() => {
                    try { ambient.src.stop(); } catch (e) {}
                    try { ambient.dOsc.stop(); } catch (e) {}
                    try { ambient.dOsc2.stop(); } catch (e) {}
                    ambient = null;
                    started = false;
                }, 800);
            }
        } catch (e) { /* ignore */ }
    }

    // ── 音效 ────────────────────────────────────────────────

    function tick() {
        if (!ensure()) return;
        const t = now();
        const o = osc('triangle', 1180, t);
        const g = envGain(0.05, 0.004, 0.06, t);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 2200;
        bp.Q.value = 2;
        o.connect(bp); bp.connect(g); g.connect(master);
        o.stop(t + 0.1);
    }

    function seal() {
        if (!ensure()) return;
        const t = now();
        // 金属吸附：短促的低频撞击 + 一点气声
        const o = osc('square', 180, t);
        const g = envGain(0.09, 0.004, 0.22, t);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 900;
        o.connect(lp); lp.connect(g); g.connect(master);
        o.stop(t + 0.3);

        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.4);
        const ng = envGain(0.05, 0.002, 0.26, t);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 1800;
        src.connect(hp); hp.connect(ng); ng.connect(master);
        src.start(t); src.stop(t + 0.4);
    }

    function alarm() {
        if (!ensure()) return;
        const t = now();
        [220, 174].forEach((f, i) => {
            const o = osc('sine', f, t + i * 0.16);
            const g = envGain(0.07, 0.01, 0.3, t + i * 0.16);
            o.connect(g); g.connect(master);
            o.stop(t + i * 0.16 + 0.35);
        });
    }

    function step() {
        if (!ensure()) return;
        const t = now();
        const o = osc('sine', 96, t);
        const g = envGain(0.05, 0.006, 0.18, t);
        o.connect(g); g.connect(master);
        o.stop(t + 0.25);
    }

    function openSound() {
        if (!ensure()) return;
        const t = now();
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(2.4);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(300, t);
        lp.frequency.linearRampToValueAtTime(1400, t + 1.8);
        const g = envGain(0.045, 1.2, 1.0, t);
        src.connect(lp); lp.connect(g); g.connect(master);
        src.start(t); src.stop(t + 2.4);
    }

    // ── 长啸：两个人声部（合成，不是人）──────────────────────

    let chantNodes = null;

    function chantStart() {
        if (!ensure() || chantNodes) return;
        const t = now();
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.9);
        g.connect(master);

        // 元音化共振：两个带通模拟"啊"的两个共振峰
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 620; f1.Q.value = 6;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 8;
        f1.connect(g); f2.connect(g);

        const nodes = [];
        // 声部一与声部二差一个纯五度，两个声部，因为今天只来了两个人
        [[196, 'sawtooth'], [294, 'triangle']].forEach(([f, type], i) => {
            const o = osc(type, f, t);
            // 轻微的音高游移，人唱不可能稳
            const lfo = osc('sine', 4.6 + i * 0.7, t);
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 1.6 + i * 0.5;
            lfo.connect(lfoGain);
            lfoGain.connect(o.frequency);
            o.connect(f1); o.connect(f2);
            nodes.push(o, lfo);
        });

        // 呼吸：一层很轻的噪声，模拟换气
        const breath = ctx.createBufferSource();
        breath.buffer = noiseBuffer(6);
        breath.loop = true;
        const bGain = ctx.createGain();
        bGain.gain.value = 0.012;
        const bLp = ctx.createBiquadFilter();
        bLp.type = 'bandpass'; bLp.frequency.value = 900; bLp.Q.value = 1.2;
        breath.connect(bLp); bLp.connect(bGain); bGain.connect(g);
        breath.start(t);

        chantNodes = { nodes, g, breath };
    }

    function chantEnd() {
        if (!ctx || !chantNodes) return;
        const t = now();
        try {
            chantNodes.g.gain.cancelScheduledValues(t);
            chantNodes.g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
            chantNodes.nodes.forEach(n => { try { n.stop(t + 0.9); } catch (e) {} });
            try { chantNodes.breath.stop(t + 0.9); } catch (e) {}
        } catch (e) { /* ignore */ }
        chantNodes = null;
    }

    // ── 点火 ────────────────────────────────────────────────

    function ignite() {
        if (!ensure()) return;
        const t = now();
        // 吸气：噪声从低频扫到高频
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(2.6);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 0.8;
        bp.frequency.setValueAtTime(180, t);
        bp.frequency.exponentialRampToValueAtTime(2400, t + 1.1);
        const g = envGain(0.14, 0.5, 1.2, t);
        src.connect(bp); bp.connect(g); g.connect(master);
        src.start(t); src.stop(t + 2.4);

        // 低频推力
        const o = osc('sine', 58, t + 0.9);
        o.frequency.setValueAtTime(58, t + 0.9);
        o.frequency.exponentialRampToValueAtTime(28, t + 2.6);
        const og = envGain(0.16, 0.08, 2.0, t + 0.9);
        o.connect(og); og.connect(master);
        o.stop(t + 3.2);
    }

    function cut() {
        if (!ensure()) return;
        const t = now();
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.5);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 2600;
        const g = envGain(0.06, 0.006, 0.22, t);
        src.connect(hp); hp.connect(g); g.connect(master);
        src.start(t); src.stop(t + 0.5);

        // 火焰接住它
        const fSrc = ctx.createBufferSource();
        fSrc.buffer = noiseBuffer(1.4);
        const flp = ctx.createBiquadFilter();
        flp.type = 'lowpass'; flp.frequency.value = 1400;
        const fg = envGain(0.07, 0.12, 1.0, t + 0.1);
        fSrc.connect(flp); flp.connect(fg); fg.connect(master);
        fSrc.start(t + 0.1); fSrc.stop(t + 1.6);
    }

    function kin() {
        if (!ensure()) return;
        const t = now();
        // 更低、更长的一记钟
        [148, 222].forEach((f, i) => {
            const o = osc('sine', f, t + i * 0.02);
            const g = envGain(0.09, 0.02, 2.6, t + i * 0.02);
            o.connect(g); g.connect(master);
            o.stop(t + 2.8);
        });
    }

    function reject() {
        if (!ensure()) return;
        const t = now();
        const o = osc('sine', 62, t);
        o.frequency.exponentialRampToValueAtTime(24, t + 3.0);
        const g = envGain(0.12, 0.3, 2.6, t);
        o.connect(g); g.connect(master);
        o.stop(t + 3.2);
    }

    function ending() {
        if (!ensure()) return;
        const t = now();
        // 一个向上的四度，像被接住
        [[147, 0], [196, 0.9], [294, 1.8]].forEach(([f, d]) => {
            const o = osc('triangle', f, t + d);
            const g = envGain(0.045, 0.6, 3.2, t + d);
            o.connect(g); g.connect(master);
            o.stop(t + d + 3.8);
        });
    }

    // ── 对外 ────────────────────────────────────────────────

    const MAP = {
        tick, seal, alarm, step, open: openSound,
        ignite, cut, kin, reject, ending,
        chantStart, chantEnd
    };

    function play(name) {
        if (muted()) return;
        const fn = MAP[name];
        if (fn) { try { fn(); } catch (e) { /* 音频失败不阻断 */ } }
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, Number(v) || 0));
        if (master) master.gain.value = volume;
    }

    return { play, startAmbience, muffle, stopAll, setVolume, get ready() { return !!ctx; } };
})();
