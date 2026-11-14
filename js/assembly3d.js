/**
 * assembly3d.js — 装配台 · 3D 台面（A 方案）
 *
 * 为什么不是 DOM：The Room 与 KSP 的台面之所以像台面，是因为它是渲染出来的——
 * 有高光、有厚度、有影子、光从一个方向打过来。HTML 三栏再怎么调都是「画在纸上的框」。
 *
 * 这里做的：一张桌子、六个凹槽、能拖起来的零件、一块真会转的机械表盘。
 * 判定全部问 Assembly（js/assembly.js），本文件只管「看得见、拖得动」。
 *
 * 颜色一律从 CSS 变量读（--aw-*），切 data-theme 立刻重读，本文件零硬编码色值。
 *
 * 入口（window.Assembly3D）：
 *   open(gen)   ?bench=3d 沙盒 / M2 正式接线
 *   close()
 *   isOpen
 */

window.Assembly3D = (function () {
    'use strict';

    const CFG = {
        benchW: 6.8, benchD: 4.2, benchH: 0.24,
        slotY: 0.012,
        slotGap: 1.06,
        dragY: 0.62,          // 拖动时零件悬在这个高度
        cardY: 0.10
    };

    const SLOTS = ['crystal', 'pad', 'shell', 'coat', 'ring', 'feather'];

    let root, canvas, renderer, scene, camera, raycaster;
    let benchGroup, partsGroup, vesselGroup, dialMesh, dialCanvas, dialTex;
    let slotObjs = [];      // { id, mesh, marker, labelEl, pos }
    let partObjs = [];      // { id, slot, mesh, home, labelEl }
    let running = false, rafId = 0, lastT = 0;
    let dragging = null, hoverSlot = null;
    const lastMouse = { x: 0, y: 0 };
    let noText = false;
    let focusKey = 'mass';  // 表盘当前看哪条读数
    let themeObserver = null;
    let colorSlots = [];
    let lastBadKey = '';
    let sandbox = false;      // ?bench=3d：只验手感，不推进任何状态    // 主题变化时重读颜色的材质

    const $ = id => document.getElementById(id);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    /** 声音：全部借 audio-ascension 的现场合成，零素材 */
    function sfx(name) {
        if (!window.AudioAscension || !AudioAscension.play) return;
        try { AudioAscension.play(name); } catch (e) { /* 音频失败不阻断 */ }
    }

    // ══════════════════════════════════════════════════════
    // 颜色：全部从 CSS 变量读
    // ══════════════════════════════════════════════════════

    function cssVar(name) {
        const v = getComputedStyle(document.body).getPropertyValue(name).trim();
        return v || '';
    }

    function hexToInt(hex, fb) {
        let h = (hex || '').trim();
        if (!h) return fb;
        if (h[0] === '#') h = h.slice(1);
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        const n = parseInt(h, 16);
        return isNaN(n) ? fb : n;
    }

    function C(name, fb) {
        return hexToInt(cssVar(name), fb);
    }

    /** 注册一个「主题变化要重设颜色」的材质 */
    function keepColor(mesh, varName, opts) {
        colorSlots.push({ mesh, varName, opts: opts || {} });
        applyColor(mesh, varName, opts || {});
        return mesh;
    }

    function applyColor(mesh, varName, opts) {
        const c = C(varName, opts.fallback || 0x888888);
        const m = mesh.material;
        if (!m) return;
        if (opts.emissive) {
            m.emissive = new THREE.Color(c);
            m.emissiveIntensity = opts.emissiveIntensity || 0.4;
        }
        if (opts.opacity != null) m.opacity = opts.opacity;
        if (m.color) m.color = new THREE.Color(c);
        m.needsUpdate = true;
    }

    function refreshColors() {
        if (scene) scene.background = new THREE.Color(C('--aw-void', 0x0a0a10));
        colorSlots.forEach(s => {
            if (s.opts && s.opts.stone) {
                const old = s.mesh.userData.stoneTex;
                const tex = stoneTexture('--a3-stone', '--a3-stone-grain');
                s.mesh.material.map = tex;
                s.mesh.material.bumpMap = tex;
                s.mesh.material.needsUpdate = true;
                if (old) old.dispose();
                s.mesh.userData.stoneTex = tex;
                s.mesh.material.color = new THREE.Color(0xffffff);
                return;
            }
            applyColor(s.mesh, s.varName, s.opts);
        });
        if (dialCanvas) drawDial();
        document.documentElement.style.setProperty('--x', '');
    }

    // ══════════════════════════════════════════════════════
    // 骨架
    // ══════════════════════════════════════════════════════

    function ensureRoot() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'a3-root';
        root.className = 'hidden';
        root.innerHTML = `
          <canvas id="a3-canvas"></canvas>
          <div class="a3-labels" id="a3-labels"></div>
          <header class="a3-bar">
            <div class="a3-title">
              <span class="a3-kicker a3-t">祈愿瓶</span>
              <span class="a3-ord" id="a3-gen"></span>
            </div>
            <div class="a3-read" id="a3-read"></div>
            <div class="a3-tools">
              <button class="a3-tool" id="a3-dial-next" title="换一块表（D）">
                <span class="a3-t"><span id="a3-dial-name">质量</span> · 换表</span>
              </button>
              <button class="a3-tool" id="a3-notext" title="遮住文字（Tab）">
                <span class="a3-t">遮字</span>
              </button>
              <button class="a3-tool" id="a3-close"><span class="a3-t">放下</span></button>
            </div>
          </header>
          <footer class="a3-foot">
            <div class="a3-cargo" id="a3-cargo"></div>
            <div class="a3-status" id="a3-status"></div>
            <button class="a3-btn" id="a3-seal"><span class="a3-t">合壳</span></button>
          </footer>`;
        document.body.appendChild(root);

        canvas = $('a3-canvas');

        $('a3-close').addEventListener('click', close);
        $('a3-notext').addEventListener('click', () => {
            noText = !noText;
            root.classList.toggle('a3-notext', noText);
            $('a3-notext').classList.toggle('on', noText);
        });
        $('a3-dial-next').addEventListener('click', nextDial);
        $('a3-seal').addEventListener('click', doSeal);

        document.addEventListener('keydown', e => {
            if (!running) return;
            if (e.key === 'Tab') { e.preventDefault(); $('a3-notext').click(); }
            if (e.key.toLowerCase() === 'd') nextDial();
            if (e.key === 'Escape') close();
        });

        return root;
    }

    function nextDial() {
        const order = ['mass', 'seal', 'resonance', 'balance', 'ablative', 'capacity'];
        const label = { mass: '质量', seal: '密封', resonance: '共振', balance: '平衡', ablative: '烧蚀', capacity: '容量' };
        focusKey = order[(order.indexOf(focusKey) + 1) % order.length];
        sfx('tick');
        $('a3-dial-name').textContent = label[focusKey];
        drawDial();
    }

    // ══════════════════════════════════════════════════════
    // 场景
    // ══════════════════════════════════════════════════════

    function initThree() {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        // 压亮：之前 26 强度的点光把台面照到眼瞎
        try {
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 0.62;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        } catch (e) { /* 老版本 three 没有这些属性 */ }
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
        camera.position.set(0, 4.35, 5.55);
        camera.lookAt(0, 0.95, -0.25);

        scene.background = new THREE.Color(C('--aw-void', 0x0a0a10));
        scene.fog = new THREE.Fog(C('--aw-void', 0x0a0a10), 7.5, 15);

        buildLights();
        buildBench();
        buildVessel();
        buildDial();
        buildSlots();
        buildParts();
        resize();
        window.addEventListener('resize', resize);
    }

    function buildLights() {
        const hemi = new THREE.HemisphereLight(C('--aw-hemi-sky', 0x24222e), C('--aw-hemi-ground', 0x050508), 0.16);
        scene.add(hemi);
        keepColor(hemi, '--aw-hemi-sky', { else: true });

        // 台口那盏灯：整个画面的光源，也是「暖」的来源
        const lamp = new THREE.PointLight(C('--aw-lamp', 0xd8a860), 7.2, 11, 2.2);
        lamp.position.set(-0.4, 3.5, 1.5);
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(1024, 1024);
        lamp.shadow.bias = -0.0012;
        scene.add(lamp);
        colorSlots.push({ mesh: { material: null }, varName: '--aw-lamp', opts: {}, light: lamp });

        const fill = new THREE.DirectionalLight(C('--aw-trim', 0x6a7a9a), 0.12);
        fill.position.set(3.2, 4.5, -3.5);
        scene.add(fill);

        // 掠射灯：贴着台面擦过去，让石板的颗粒与裂纹投出微影
        const rake = new THREE.DirectionalLight(C('--aw-lamp', 0xd8a860), 0.55);
        rake.position.set(-5.5, 0.9, -2.2);
        rake.castShadow = false;
        scene.add(rake);
    }

    function mat(varName, opts) {
        const o = opts || {};
        const m = new THREE.MeshStandardMaterial({
            color: C(varName, 0x555555),
            roughness: o.roughness != null ? o.roughness : 0.75,
            metalness: o.metalness != null ? o.metalness : 0.15,
            transparent: !!o.transparent,
            opacity: o.opacity != null ? o.opacity : 1,
            emissive: o.emissiveVar ? C(o.emissiveVar, 0x000000) : 0x000000,
            emissiveIntensity: o.emissiveIntensity || 0
        });
        return m;
    }

    /** 石板纹理：颗粒、细裂纹、斑点——一块石头该有的东西 */
    function stoneTexture(baseVar, grainVar) {
        const S = 512;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const g = cv.getContext('2d');
        const base = cssVar(baseVar) || '#33313a';
        const grain = cssVar(grainVar) || '#3d3b45';

        g.fillStyle = base;
        g.fillRect(0, 0, S, S);

        const img = g.getImageData(0, 0, S, S), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() - 0.5) * 46;
            d[i] += n; d[i + 1] += n; d[i + 2] += n;
        }
        g.putImageData(img, 0, 0);

        g.strokeStyle = grain;
        for (let i = 0; i < 30; i++) {
            g.globalAlpha = 0.24 + Math.random() * 0.36;
            g.beginPath();
            let x = Math.random() * S, y = Math.random() * S;
            g.moveTo(x, y);
            for (let k = 0; k < 8; k++) {
                x += (Math.random() - 0.5) * 74;
                y += (Math.random() - 0.5) * 74;
                g.lineTo(x, y);
            }
            g.lineWidth = 0.8 + Math.random() * 2.4;
            g.stroke();
        }

        g.globalAlpha = 0.3;
        g.fillStyle = grain;
        for (let i = 0; i < 220; i++) {
            g.beginPath();
            g.arc(Math.random() * S, Math.random() * S, Math.random() * 2.4, 0, Math.PI * 2);
            g.fill();
        }
        g.globalAlpha = 1;

        const tex = new THREE.CanvasTexture(cv);
        try { tex.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* 老版本 */ }
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(2, 1.35);
        return tex;
    }

    function buildBench() {
        benchGroup = new THREE.Group();
        scene.add(benchGroup);

        // 台面
        const stoneTex = stoneTexture('--a3-stone', '--a3-stone-grain');
        const topMat = new THREE.MeshStandardMaterial({
            map: stoneTex,
            bumpMap: stoneTex,
            bumpScale: 0.08,
            color: 0xffffff,
            roughness: 0.94,
            metalness: 0.03
        });
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(CFG.benchW, CFG.benchH, CFG.benchD),
            topMat
        );
        top.userData.stoneTex = stoneTex;
        top.position.y = -CFG.benchH / 2;
        top.receiveShadow = true;
        benchGroup.add(top);
        colorSlots.push({ mesh: top, varName: '--a3-stone', opts: { stone: true } });

        // 台沿（一圈稍亮的线）
        const edgeGeo = new THREE.BoxGeometry(CFG.benchW + 0.16, 0.05, CFG.benchD + 0.16);
        const edge = new THREE.Mesh(edgeGeo, mat('--aw-post', { roughness: 0.6, metalness: 0.35 }));
        edge.position.y = -CFG.benchH - 0.02;
        benchGroup.add(edge);
        keepColor(edge, '--aw-post', {});

        // 台布/垫子：一块略暗的斜纹面，让台面不是一块光板
        const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(CFG.benchW - 0.5, CFG.benchD - 0.5),
            new THREE.MeshStandardMaterial({
                color: C('--aw-void', 0x101018), roughness: 1, metalness: 0,
                transparent: true, opacity: 0.55
            })
        );
        cloth.rotation.x = -Math.PI / 2;
        cloth.position.y = 0.002;
        cloth.receiveShadow = true;
        benchGroup.add(cloth);
        keepColor(cloth, '--aw-void', { opacity: 0.55, transparent: true });
    }

    /** 瓶胚：立在台面后方，装上的零件会在它身上长出来 */
    function buildVessel() {
        vesselGroup = new THREE.Group();
        vesselGroup.position.set(0, 0, -1.34);
        scene.add(vesselGroup);

        const glass = new THREE.Mesh(
            new THREE.CylinderGeometry(0.34, 0.42, 1.9, 28, 1, true),
            new THREE.MeshStandardMaterial({
                color: C('--aw-mark', 0x9ac0d0),
                transparent: true, opacity: 0.16,
                roughness: 0.15, metalness: 0.6,
                side: THREE.DoubleSide
            })
        );
        glass.position.y = 0.95;
        vesselGroup.add(glass);
        colorSlots.push({
            mesh: glass, varName: '--aw-mark',
            opts: { opacity: 0.16, transparent: true }
        });

        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.34, 0.26, 24),
            mat('--aw-metal', { roughness: 0.6, metalness: 0.5 })
        );
        cap.position.y = 2.02;
        vesselGroup.add(cap);
        keepColor(cap, '--aw-metal', {});

        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.46, 0.44, 0.12, 28),
            mat('--aw-metal', { roughness: 0.7 })
        );
        base.position.y = 0.06;
        base.receiveShadow = true;
        vesselGroup.add(base);
        keepColor(base, '--aw-metal', {});

        // 六段「层」：装上的零件让对应的层亮起来
        vesselGroup.userData.layers = {};
        ['feather', 'ring', 'coat', 'shell', 'pad', 'crystal'].forEach((id, i) => {
            const y = 0.28 + i * 0.28;
            const ring = new THREE.Mesh(
                new THREE.CylinderGeometry(0.355, 0.355, 0.075, 24, 1, true),
                new THREE.MeshStandardMaterial({
                    color: C('--aw-metal', 0x3c3542),
                    transparent: true, opacity: 0.35,
                    roughness: 0.5, metalness: 0.4,
                    side: THREE.DoubleSide
                })
            );
            ring.position.y = y;
            vesselGroup.add(ring);
            vesselGroup.userData.layers[id] = ring;
        });
    }

    // ══════════════════════════════════════════════════════
    // 机械表盘（Canvas 贴图，指针真会转）
    // ══════════════════════════════════════════════════════

    function buildDial() {
        const size = 512;
        dialCanvas = document.createElement('canvas');
        dialCanvas.width = dialCanvas.height = size;
        dialTex = new THREE.CanvasTexture(dialCanvas);
        dialTex.anisotropy = 4;

        const geo = new THREE.CircleGeometry(0.46, 48);
        const m = new THREE.MeshStandardMaterial({
            map: dialTex, transparent: true, roughness: 0.6, metalness: 0.2
        });
        dialMesh = new THREE.Mesh(geo, m);
        dialMesh.rotation.x = -Math.PI / 2;
        dialMesh.position.set(2.16, CFG.slotY + 0.004, 1.16);
        dialMesh.receiveShadow = true;
        scene.add(dialMesh);

        drawDial();
    }

    function dialCheck() {
        const st = Assembly.stats();
        if (!st) return null;
        return st.checks.find(c => c.key === focusKey) || st.checks[0];
    }

    function drawDial() {
        if (!dialCanvas) return;
        const cv = dialCanvas, g = cv.getContext('2d');
        const S = cv.width, R = S / 2, cx = R, cy = R;
        const ink = cssVar('--text-primary') || '#ddd';
        const soft = cssVar('--aw-trim') || '#888';
        const hot = cssVar('--aw-lamp') || '#d8a860';
        const bad = cssVar('--danger') || '#c66855';
        const cb = dialCheck();

        g.clearRect(0, 0, S, S);

        // 盘面
        g.beginPath(); g.arc(cx, cy, R * 0.97, 0, Math.PI * 2);
        g.fillStyle = 'rgba(0,0,0,0.42)'; g.fill();
        g.lineWidth = S * 0.008; g.strokeStyle = soft; g.stroke();

        // 刻度：0 → 满，走 270°
        const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
        for (let i = 0; i <= 10; i++) {
            const a = a0 + (a1 - a0) * (i / 10);
            const r1 = R * (i % 5 === 0 ? 0.72 : 0.80);
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            g.lineTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88);
            g.strokeStyle = soft; g.lineWidth = S * (i % 5 === 0 ? 0.010 : 0.005);
            g.stroke();
        }

        // 红线位置：ratio = 1（规程下限/上限）
        const aLim = a0 + (a1 - a0) * (1 / 1.4);
        g.beginPath();
        g.moveTo(cx + Math.cos(aLim) * R * 0.66, cy + Math.sin(aLim) * R * 0.66);
        g.lineTo(cx + Math.cos(aLim) * R * 0.92, cy + Math.sin(aLim) * R * 0.92);
        g.strokeStyle = hot; g.lineWidth = S * 0.012; g.stroke();

        // 红区弧（红线之外）
        g.beginPath();
        g.arc(cx, cy, R * 0.84, aLim, a1 + 0.02);
        g.strokeStyle = bad; g.lineWidth = S * 0.016; g.globalAlpha = 0.55;
        g.stroke(); g.globalAlpha = 1;

        // 指针
        if (cb) {
            const ratio = cb.pending ? 0 : Math.max(0, Math.min(1.4, cb.value / (cb.limit || 1)));
            const a = a0 + (a1 - a0) * (ratio / 1.4);
            g.beginPath();
            g.moveTo(cx, cy);
            g.lineTo(cx + Math.cos(a) * R * 0.70, cy + Math.sin(a) * R * 0.70);
            g.strokeStyle = (cb.bad && !cb.hidden) ? bad : ink;
            g.lineWidth = S * 0.016; g.lineCap = 'round'; g.stroke();
            g.beginPath(); g.arc(cx, cy, S * 0.022, 0, Math.PI * 2);
            g.fillStyle = (cb.bad && !cb.hidden) ? bad : ink; g.fill();
        }

        // 表盘边缘的状态环
        if (cb) {
            g.beginPath(); g.arc(cx, cy, R * 0.965, 0, Math.PI * 2);
            g.strokeStyle = cb.pending ? soft : (cb.hidden ? soft : (cb.bad ? bad : hot));
            g.lineWidth = S * 0.022; g.stroke();
        }

        dialTex.needsUpdate = true;
    }

    // ══════════════════════════════════════════════════════
    // 六个凹槽
    // ══════════════════════════════════════════════════════

    function slotLabel(id) {
        return Assembly.slotLabel(id);
    }

    function slotX(i) {
        return (i - (SLOTS.length - 1) / 2) * CFG.slotGap;
    }

    function buildSlots() {
        const labelBox = $('a3-labels');

        SLOTS.forEach((id, i) => {
            const x = slotX(i);
            const g = new THREE.Group();
            g.position.set(x, 0, 0.52);
            scene.add(g);

            // 凹槽：一块压下去的深色方片 + 一圈边
            const pit = new THREE.Mesh(
                new THREE.BoxGeometry(0.78, 0.06, 0.78),
                new THREE.MeshStandardMaterial({
                    color: C('--aw-void', 0x0a0a10), roughness: 1, metalness: 0
                })
            );
            pit.position.y = -0.028;
            pit.receiveShadow = true;
            g.add(pit);
            colorSlots.push({ mesh: pit, varName: '--aw-void', opts: {} });

            const rim = new THREE.Mesh(
                new THREE.BoxGeometry(0.86, 0.03, 0.86),
                mat('--aw-trim', { roughness: 0.55, metalness: 0.45 })
            );
            rim.position.y = 0.004;
            g.add(rim);
            keepColor(rim, '--aw-trim', {});

            // 状态标记：槽上空着 = 暗，装对 = 亮，超红线 = 红
            const marker = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.055),
                new THREE.MeshStandardMaterial({
                    color: C('--aw-mark', 0x9ac0d0),
                    emissive: C('--aw-mark', 0x9ac0d0),
                    emissiveIntensity: 0.2,
                    transparent: true, opacity: 0.85
                })
            );
            marker.position.y = 0.11;
            g.add(marker);

            // HTML 标签（可遮）
            const el = document.createElement('span');
            el.className = 'a3-label a3-t';
            el.textContent = slotLabel(id);
            labelBox.appendChild(el);

            slotObjs.push({ id, group: g, marker, labelEl: el, filled: null });
        });
    }

    // ══════════════════════════════════════════════════════
    // 零件（能拖起来的东西）
    // ══════════════════════════════════════════════════════

    /** 每个槽位给一个不同的几何体：形状本身就是信息（遮字后仍然认得出） */
    function partGeometry(slot, p) {
        switch (slot) {
            case 'crystal':
                return new THREE.IcosahedronGeometry(0.2, 0);
            case 'pad':
                return new THREE.CylinderGeometry(0.28, 0.28, (p.id === 'pad_thick' ? 0.09 : 0.045), 24);
            case 'shell':
                return new THREE.CylinderGeometry(0.3, 0.3, 0.26, 24, 1, true);
            case 'coat':
                return new THREE.TorusGeometry(0.26, 0.035, 8, 28);
            case 'ring':
                return new THREE.TorusGeometry(0.24, 0.05, 10, 6);
            case 'feather':
                return new THREE.ConeGeometry(0.045, 0.52, 6);
            default:
                return new THREE.BoxGeometry(0.2, 0.2, 0.2);
        }
    }

    function buildParts() {
        const S = Assembly.state;
        const labelBox = $('a3-labels');
        partsGroup = new THREE.Group();
        scene.add(partsGroup);

        const list = Assembly.partsFor(S.gen);
        const bySlot = {};
        list.forEach(p => { (bySlot[p.slot] || (bySlot[p.slot] = [])).push(p); });

        // 零件摆在台面左侧靠后，按槽位分组排队
        SLOTS.forEach((slot, si) => {
            const items = bySlot[slot] || [];
            items.forEach((p, j) => {
                const geo = partGeometry(slot, p);
                const isCrystal = slot === 'crystal';
                const m = new THREE.MeshStandardMaterial({
                    color: isCrystal ? C('--aw-mark', 0x9ac0d0) : C('--aw-metal', 0x3c3542),
                    roughness: 0.45,
                    metalness: isCrystal ? 0.75 : 0.35,
                    emissive: isCrystal ? C('--aw-mark', 0x9ac0d0) : 0x000000,
                    emissiveIntensity: isCrystal ? 0.25 : 0,
                    transparent: slot === 'shell',
                    opacity: slot === 'shell' ? 0.75 : 1,
                    side: slot === 'shell' ? THREE.DoubleSide : THREE.FrontSide
                });
                const mesh = new THREE.Mesh(geo, m);
                mesh.castShadow = true;
                mesh.userData = { partId: p.id, slot };

                // 摆位：一个槽位一行，行内最多三件（不叠、不出台面、不被瓶体挡）
                const home = new THREE.Vector3(
                    -CFG.benchW / 2 + 0.64 + j * 0.66,
                    CFG.cardY + 0.15,
                    -CFG.benchD / 2 + 0.62 + si * 0.50
                );
                mesh.position.copy(home);
                partsGroup.add(mesh);

                const el = document.createElement('span');
                el.className = 'a3-label a3-part-label a3-t';
                el.textContent = p.name;
                labelBox.appendChild(el);

                partObjs.push({ id: p.id, slot, mesh, home, labelEl: el, part: p });
            });
        });
    }

    /** 换一枚时把台面上的零件整批换掉（第 2 枚没有厚垫、没有加固环） */
    function rebuildParts() {
        if (partsGroup) {
            scene.remove(partsGroup);
            partsGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
            partsGroup = null;
        }
        partObjs.forEach(p => { if (p.labelEl && p.labelEl.parentNode) p.labelEl.parentNode.removeChild(p.labelEl); });
        partObjs = [];
        buildParts();
    }

    // ══════════════════════════════════════════════════════
    // 交互：拾起 / 悬停 / 落位
    // ══════════════════════════════════════════════════════

    function ndc(e) {
        const r = canvas.getBoundingClientRect();
        return new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            -((e.clientY - r.top) / r.height) * 2 + 1
        );
    }

    function dragPlane() {
        return new THREE.Plane(new THREE.Vector3(0, 1, 0), -CFG.dragY);
    }

    /** 拾取：按屏幕上离鼠标最近的零件判定。
     *  不用射线命中几何——环、开口筒的中心是空的，射线会从洞里穿过去。*/
    function pickPart(e) {
        const r = canvas.getBoundingClientRect();
        let best = null, bestD = 46;
        partObjs.forEach(p => {
            if (!p.mesh.visible) return;
            const v = p.mesh.position.clone().project(camera);
            const sx = r.left + (v.x * 0.5 + 0.5) * r.width;
            const sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
            const d = Math.hypot(sx - e.clientX, sy - e.clientY);
            if (d < bestD) { best = p; bestD = d; }
        });
        return best;
    }

    /** 按屏幕距离找槽位：拖动平面比槽位高，世界距离会偏，屏幕距离才是玩家的直觉 */
    function nearestSlotScreen(e) {
        const r = canvas.getBoundingClientRect();
        let best = null, bestD = 78;
        slotObjs.forEach(s => {
            const v = s.group.position.clone().setY(0.10).project(camera);
            const sx = r.left + (v.x * 0.5 + 0.5) * r.width;
            const sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
            const d = Math.hypot(sx - e.clientX, sy - e.clientY);
            if (d < bestD) { best = s; bestD = d; }
        });
        return best;
    }

    function nearestSlot(pos) {
        let best = null, bestD = 0.62;
        slotObjs.forEach(s => {
            if (Assembly.state.sealed) return;
            const d = Math.hypot(s.group.position.x - pos.x, s.group.position.z - pos.z);
            if (d < bestD) { best = s; bestD = d; }
        });
        return best;
    }

    function onDown(e) {
        if (!running || (Assembly.state && Assembly.state.sealed)) return;
        const p = pickPart(e);
        if (!p) return;
        dragging = p;
        sfx('tick');
        p.mesh.scale.setScalar(1.18);
        p.mesh.position.y = CFG.dragY;
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }

    function onMove(e) {
        if (!running) return;
        lastMouse.x = e.clientX; lastMouse.y = e.clientY;

        if (!dragging) {
            const over = pickPart(e);
            canvas.style.cursor = over ? 'grab' : 'default';
            return;
        }

        canvas.style.cursor = 'grabbing';
        raycaster.setFromCamera(ndc(e), camera);
        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlane(), hit)) {
            dragging.mesh.position.set(hit.x, CFG.dragY, hit.z);
        }
        const s = nearestSlotScreen(e) || nearestSlot(dragging.mesh.position);
        slotObjs.forEach(o => o.group.scale.setScalar(o === s ? 1.06 : 1));
        hoverSlot = s;
    }

    function onUp(e) {
        if (!running || !dragging) return;
        const p = dragging;
        dragging = null;
        canvas.style.cursor = 'default';

        const slot = hoverSlot;
        hoverSlot = null;
        slotObjs.forEach(o => o.group.scale.setScalar(1));

        if (!slot) {
            animateTo(p.mesh, p.home.clone().setY(CFG.cardY + 0.16));
            p.mesh.scale.setScalar(1);
            return;
        }

        const res = Assembly.place(p.id, slot.id);
        if (!res.ok) {
            toast({
                'wrong-slot': '这个零件不进那个槽。',
                'not-available': '这批零件里没有它。',
                'sealed': '壳已经合上了。'
            }[res.reason] || '放不进去。');
            sfx('tick');
            animateTo(p.mesh, p.home.clone().setY(CFG.cardY + 0.16));
            p.mesh.scale.setScalar(1);
            return;
        }

        // 落位：吸到槽里，弹一下
        sfx('seal');
        p.mesh.scale.setScalar(1);
        const target = slot.group.position.clone().setY(0.075);
        animateTo(p.mesh, target, 160);
        p.placedIn = slot.id;
        refresh();
    }

    /** 极简补间（不引动画库） */
    const tweens = [];
    function animateTo(obj, target, ms) {
        tweens.push({ obj, from: obj.position.clone(), to: target.clone(), t0: performance.now(), ms: ms || 220 });
    }

    function stepTweens(now) {
        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            const k = Math.min(1, (now - tw.t0) / tw.ms);
            const e = 1 - Math.pow(1 - k, 3);
            tw.obj.position.lerpVectors(tw.from, tw.to, e);
            if (k >= 1) tweens.splice(i, 1);
        }
    }

    // ══════════════════════════════════════════════════════
    // 刷新：把 Assembly 的状态画到台面上
    // ══════════════════════════════════════════════════════

    function refresh() {
        const S = Assembly.state;
        if (!S) return;
        const st = Assembly.stats();

        // 槽位标记
        slotObjs.forEach(o => {
            const p = S.slots[o.id];
            o.filled = p ? p.id : null;
            const c = st.checks.find(x => x.key === slotCheckKey(o.id));
            const tone = c ? (c.pending ? 'pending' : (c.hidden ? 'unknown' : (c.bad ? 'bad' : 'ok'))) : 'pending';
            const col = tone === 'bad' ? C('--danger', 0xc66855)
                : tone === 'ok' ? C('--aw-mark', 0x9ac0d0)
                    : C('--aw-trim', 0x6a7a9a);
            o.marker.material.color = new THREE.Color(col);
            o.marker.material.emissive = new THREE.Color(col);
            o.marker.material.emissiveIntensity = tone === 'bad' ? 0.9 : (tone === 'ok' ? 0.5 : 0.12);
            o.marker.material.opacity = tone === 'pending' ? 0.3 : 0.95;
            o.group.visible = true;
        });

        // 零件：已装的从台面上消失（它进瓶子了）
        partObjs.forEach(p => {
            const inSlot = S.slots[p.slot] && S.slots[p.slot].id === p.id;
            p.mesh.visible = !inSlot || p.placedIn === p.slot;
            if (inSlot) {
                p.mesh.position.copy(slotObjs.find(s => s.id === p.slot).group.position).setY(0.045);
                p.mesh.scale.setScalar(0.62);
            } else if (p.mesh.scale.x !== 1 && !tweens.some(tw => tw.obj === p.mesh)) {
                p.mesh.scale.setScalar(1);
            }
        });

        // 瓶身各层：装了才亮
        const layers = vesselGroup.userData.layers || {};
        Object.keys(layers).forEach(id => {
            const on = !!S.slots[id];
            const m = layers[id].material;
            m.opacity = on ? 1 : 0.18;
            const col = on ? C('--aw-lamp', 0xd8a860) : C('--aw-metal', 0x3c3542);
            m.color = new THREE.Color(col);
            m.emissive = new THREE.Color(col);
            m.emissiveIntensity = on ? 1.1 : 0;
            m.needsUpdate = true;
        });

        drawDial();
        renderCargo();
        updateStatus();

        // 第一次踩到红线响一次，之后不再吵
        const badKey = st.checks.filter(c => c.bad && !c.hidden && !c.pending).map(c => c.key).join(',');
        if (badKey && badKey !== lastBadKey) {
            if (lastBadKey) sfx('alarm');
            lastBadKey = badKey;
        } else if (!badKey) {
            lastBadKey = '';
        }
    }

    function slotCheckKey(slot) {
        return {
            crystal: 'capacity', pad: 'seal', shell: 'ablative',
            coat: 'ablative', ring: 'balance', feather: 'resonance'
        }[slot];
    }

    /** 晶体里装什么：四样内容，选几样由容量说话 */
    function renderCargo() {
        const el = $('a3-cargo');
        if (!el) return;
        const S = Assembly.state;
        if (!S) return;
        const list = Assembly.contentsFor(S.gen);
        el.innerHTML = list.map(c => {
            const on = S.contents.some(x => x.id === c.id);
            return `<button class="a3-crate${on ? ' on' : ''}" data-c="${esc(c.id)}"
                         ${S.sealed ? 'disabled' : ''} title="${esc(c.note || '')}">
                      <span class="a3-crate-fill" style="width:${Math.min(100, c.capacity)}%"></span>
                      <span class="a3-t a3-crate-name">${esc(c.name)}</span>
                      <span class="a3-t a3-crate-n">${c.capacity}</span>
                    </button>`;
        }).join('');
        el.querySelectorAll('[data-c]').forEach(b => {
            b.addEventListener('click', () => {
                if (Assembly.state.sealed) return;
                Assembly.toggleContent(b.dataset.c);
                sfx('tick');
                refresh();
            });
        });
    }

    function updateStatus() {
        const st = Assembly.stats();
        if (!st) return;
        const S = Assembly.state;
        const bads = st.checks.filter(c => c.bad && !c.hidden && !c.pending);
        const cb = dialCheck();

        // 顶部：当前这块表在说什么
        const readEl = $('a3-read');
        if (readEl) {
            const label = { mass: '质量', seal: '密封', resonance: '共振', balance: '平衡', ablative: '烧蚀', capacity: '容量' };
            const txt = cb
                ? `${label[cb.key]} ${cb.pending ? '未装' : (cb.hidden ? (cb.key === 'balance' ? '目视合格' : '听着还行') : fmt(cb))}`
                : '';
            readEl.innerHTML = `<span class="a3-t">${txt}</span>`;
            readEl.className = 'a3-read' + (cb && cb.bad && !cb.hidden ? ' bad' : '');
        }

        let line;
        if (st.missing.length) line = '还缺：' + st.missing.map(s => Assembly.slotLabel(s)).join(' · ');
        else if (bads.length) line = bads.map(c => c.label).join(' · ') + ' 过不了';
        else line = '六位齐了，都在线内。';
        const stEl = $('a3-status');
        stEl.innerHTML = `<span class="a3-t">${line}</span>`;
        stEl.className = 'a3-status' + (bads.length ? ' bad' : (st.missing.length ? '' : ' ok'));

        const can = Assembly.canSeal();
        const sealBtn = $('a3-seal');
        sealBtn.disabled = S.sealed || !can;
        sealBtn.innerHTML = S.sealed ? '<span class="a3-t">已合壳</span>'
            : (can ? '<span class="a3-t">合壳</span>' : '<span class="a3-t">还不能合</span>');
    }

    function fmt(c) {
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

    /** 装配结果摘要：仪式接着用，不用再问一遍「装了什么」 */
    function buildSummary() {
        const st = Assembly.stats();
        const S = Assembly.state;
        const bad = st.checks.filter(c => c.bad && !c.pending).length;
        // 六条全绿 +18；一项超限 +8；两项以上 −4
        const ritualBonus = bad === 0 ? 18 : (bad === 1 ? 8 : -4);
        const payloads = {};
        const tags = { truth: 0, comfort: 0, silence: 0 };
        (S.contents || []).forEach(c => {
            if (c.slot) payloads[c.slot] = c.id;
            if (c.tag) tags[c.tag] = (tags[c.tag] || 0) + 1;
        });
        return {
            gen: S.gen,
            sealed: true,
            ritualBonus: ritualBonus,
            badCount: bad,
            checks: st.checks.reduce((o, c) => {
                o[c.key] = c.pending ? 'pending' : (c.bad ? 'over' : (c.hidden ? 'unknown' : 'ok'));
                return o;
            }, {}),
            slots: Object.keys(S.slots).reduce((o, k) => {
                o[k] = S.slots[k] ? S.slots[k].id : null;
                return o;
            }, {}),
            payloads: payloads,
            contents: (S.contents || []).map(c => c.id),
            tags: tags,
            // 规程线：发射判定要用它把「你装成什么样」说成一句话
            limits: st.checks.reduce((o, c) => {
                o[c.key + 'Limit'] = c.limit;
                return o;
            }, {}),
            stats: {
                mass: st.mass, seal: st.seal, resonance: st.resonance,
                balance: st.balance, ablative: st.ablative, capacity: st.capacity
            }
        };
    }

    function doSeal() {
        const res = Assembly.seal();
        if (!res.ok) {
            toast(res.reason === 'missing' ? '还有槽是空的。' : '合不上。');
            sfx('tick');
            return;
        }
        sfx('seal');
        setTimeout(() => sfx('ignite'), 260);
        refresh();
        toast('封条压下去了。');

        // 交给世界：这一枚装完了。沙盒（?bench=3d）只做验证，不推进任何东西。
        const summary = buildSummary();
        if (!sandbox && window.AscensionWorld && AscensionWorld.onAssemblySealed) {
            setTimeout(() => { try { AscensionWorld.onAssemblySealed(summary); } catch (e) { /* 不阻断 */ } }, 900);
        }
    }

    // ══════════════════════════════════════════════════════
    // 标签定位（HTML 浮层跟着 3D 走）
    // ══════════════════════════════════════════════════════

    const _v = new THREE.Vector3();
    function placeLabel(el, worldPos, dy) {
        _v.copy(worldPos);
        _v.y += dy || 0;
        _v.project(camera);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        el.style.transform = `translate(-50%, -50%) translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px)`;
        el.style.opacity = _v.z > 1 ? '0' : '1';
    }

    function updateLabels() {
        slotObjs.forEach(s => placeLabel(s.labelEl, s.group.position, 0.44));
        // 零件的名字只在「拿起来」或「鼠标停在附近」时出现，否则十几个标签会糊满屏幕
        const mx = lastMouse.x, my = lastMouse.y;
        const r = canvas.getBoundingClientRect();
        partObjs.forEach(p => {
            if (!p.mesh.visible) { p.labelEl.style.opacity = '0'; return; }
            let show = (dragging && dragging === p);
            if (!show && mx) {
                const v = p.mesh.position.clone().project(camera);
                const sx = r.left + (v.x * 0.5 + 0.5) * r.width;
                const sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
                show = Math.hypot(sx - mx, sy - my) < 52;
            }
            p.labelEl.style.opacity = show ? '0.95' : '0';
            if (show) placeLabel(p.labelEl, p.mesh.position, 0.34);
        });
    }

    // ══════════════════════════════════════════════════════
    // 渲染循环 / 开关
    // ══════════════════════════════════════════════════════

    function resize() {
        if (!renderer || !canvas) return;
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function loop(t) {
        if (!running) return;
        rafId = requestAnimationFrame(loop);
        const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
        lastT = t;

        stepTweens(t);

        // 台口灯轻微呼吸 + 标记缓慢自转（静止画面里唯一在动的东西）
        slotObjs.forEach((o, i) => {
            o.marker.rotation.y += dt * 0.9;
            o.marker.position.y = 0.11 + Math.sin(t / 900 + i) * 0.012;
        });
        if (dragging) dragging.mesh.rotation.y += dt * 1.6;

        updateLabels();
        renderer.render(scene, camera);
    }

    function open(gen) {
        ensureRoot();
        sandbox = !!(window.Assembly && Assembly.bench === '3d');
        if (typeof Assembly === 'undefined') return false;

        // 每一枚都是一次新的装配：已合壳、或换了一枚，就重开（否则会沿用上一枚的槽位）
        gen = gen || 1;
        const needNew = !Assembly.state || Assembly.state.sealed || Assembly.state.gen !== gen;
        if (needNew) {
            if (!Assembly.open(gen)) return false;
            // 第一次开时场景还没建，initThree 自己会摆一次零件
            if (scene) rebuildParts();   // 第 2 枚的零件库不一样，台面上也得换
        }
        if (!Assembly.state) return false;

        // 世界里的「谁还在」直接决定台面上看得见什么
        const people = (window.AscensionWorld && AscensionWorld.state && AscensionWorld.state.people) || null;
        if (people) {
            ['kamu', 'seran', 'wei'].forEach(id => {
                if (people[id]) Assembly.setBlind(id, people[id] === 'present');
            });
        }

        root.classList.remove('hidden');
        document.body.classList.add('a3-open');
        $('a3-gen').textContent = '第 ' + Assembly.state.gen + ' 枚';

        if (!renderer) {
            initThree();
            canvas.addEventListener('pointerdown', onDown);
            canvas.addEventListener('pointermove', onMove);
            canvas.addEventListener('pointerup', onUp);
            canvas.addEventListener('pointercancel', onUp);
            raycaster = new THREE.Raycaster();
            themeObserver = new MutationObserver(refreshColors);
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        } else {
            resize();
        }

        refresh();
        running = true;
        lastT = performance.now();
        rafId = requestAnimationFrame(loop);
        return true;
    }

    function close(opts) {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        if (root) root.classList.add('hidden');
        document.body.classList.remove('a3-open');
        // 静默关闭：交棒给仪式时不能把世界唤醒（否则会 resume 到台面上）
        if (opts && opts.silent) return;
        if (window.AscensionWorld && AscensionWorld.onRitualClosed) {
            try { AscensionWorld.onRitualClosed(); } catch (e) { /* 世界没开也不影响 */ }
        }
    }

    let toastT = null;
    function toast(text) {
        const el = $('a3-status');
        if (!el) return;
        const prev = el.innerHTML;
        el.innerHTML = `<span class="a3-t">${text}</span>`;
        el.classList.add('flash');
        clearTimeout(toastT);
        toastT = setTimeout(() => {
            el.classList.remove('flash');
            updateStatus();
        }, 2600);
    }

    return {
        open, close,
        get isOpen() { return !!(root && !root.classList.contains('hidden')); },
        _debug: {
            get state() { return { dragging: dragging ? dragging.id : null, hover: hoverSlot ? hoverSlot.id : null, focus: focusKey, parts: partObjs.length, slots: slotObjs.length }; },
            get camera() { return camera ? [camera.position.x, camera.position.y, camera.position.z] : null; },
            pickAt(partId, slotId) {
                const p = partObjs.find(x => x.id === partId);
                const s = slotObjs.find(x => x.id === slotId);
                if (!p || !s) return null;
                return Assembly.place(partId, slotId);
            },
            refresh() { refresh(); return true; },
            nextDial() { nextDial(); return focusKey; },
            screenOf(partId) {
                const p = partObjs.find(x => x.id === partId);
                if (!p) return null;
                const v = p.mesh.position.clone().project(camera);
                const r = canvas.getBoundingClientRect();
                return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width),
                        Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
            },
            screenOfSlot(slotId) {
                const s = slotObjs.find(x => x.id === slotId);
                if (!s) return null;
                const v = s.group.position.clone().setY(0.075).project(camera);
                const r = canvas.getBoundingClientRect();
                return [Math.round(r.left + (v.x * 0.5 + 0.5) * r.width),
                        Math.round(r.top + (-v.y * 0.5 + 0.5) * r.height)];
            }
        }
    };
})();
