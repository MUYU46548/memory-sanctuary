/**
 * ascension-world.js — 升天之仪（DLC）· 3D 世界层
 *
 * 职责：空间（地表 / 避难所）、走动、交互、房间壳与物件、人。
 * 不做：对话判定（ascension-rooms.js）、仪式九阶段（game-ascension.js / ui-ascension.js）、音频（audio-ascension.js）。
 *
 * 两条铁律：
 *   1. 颜色全部来自 CSS 变量（css/ascension-world.css 的 --aw-*），切换 data-theme 即刻重读，
 *      本文件里没有任何硬编码色值。几何与文案全部来自 data/dlc/ascension/rooms/*.json 与本文件的结构常量。
 *   2. 访问 MemorySanctuary.state 一律先判空——标题页时它可能不存在。
 *
 * 入口（window.AscensionWorld）：
 *   open()            从 DLC 面板进入
 *   close()           回标题
 *   pause()/resume()  仪式界面打开时暂停渲染循环
 *   isOpen
 */

window.AscensionWorld = (function () {
    'use strict';

    const CFG = {
        moveSpeed: 7.2,          // 米/秒，俯视机位下走得动但不飘
        playerRadius: 0.42,
        interactRange: 3.4,
        camHeight: 13.5,
        camBack: 9.5
    };

    const ROOM_FILES = [
        'data/dlc/ascension/rooms/ration.json',
        'data/dlc/ascension/rooms/living.json'
    ];

    // 避难所大厅的边界（房间在里面，见 json 的 shell）
    const SHELTER = { minX: -15, maxX: 15, minZ: -13, maxZ: 13 };
    const SURFACE = { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };

    // ── 世界状态（threads / seen / asked 进 DLC 存档）────────
    let S = null;

    // ── 运行时 ─────────────────────────────────────────────
    let root, canvas, scene, camera, renderer;
    let surfaceGroup, shelterGroup, player, playerParts = {};
    let interactables = [], colliders = [], npcs = [];
    let keys = Object.create(null);
    let nearest = null;
    let running = false, paused = false, booted = false;
    let lastT = 0;
    let colorSlots = [];      // 主题切换时重读的颜色槽
    let groundSlots = [];     // 主题切换时要重建的地面纹理
    let fadeTimer = null;

    const $ = id => document.getElementById(id);

    // ══════════════════════════════════════════════════════
    // 颜色：一律从 CSS 变量读（切主题即刻生效）
    // ══════════════════════════════════════════════════════

    function cssVarRaw(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function toHex(raw) {
        if (!raw) return null;
        const v = raw.trim();
        if (v.charAt(0) === '#') {
            let h = v.slice(1);
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            const n = parseInt(h.slice(0, 6), 16);
            return isNaN(n) ? null : n;
        }
        const m = v.match(/rgba?\(([^)]+)\)/);
        if (m) {
            const p = m[1].split(',').map(Number);
            return ((p[0] & 255) << 16) | ((p[1] & 255) << 8) | (p[2] & 255);
        }
        return null;
    }

    /** 读一个 CSS 变量成 three 用的色号 */
    function C(name, fallback) {
        const n = toHex(cssVarRaw(name));
        return n === null ? fallback : n;
    }

    /** 读一个 CSS 变量成 rgba 字符串（画程序化纹理用） */
    function CA(name, alpha, fallbackRGB) {
        const n = toHex(cssVarRaw(name));
        const v = n === null ? fallbackRGB : n;
        return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + alpha + ')';
    }

    function mat(colorVar, opts) {
        const o = opts || {};
        const m = new THREE.MeshStandardMaterial({
            color: C(colorVar, o.fallback === undefined ? 0x888888 : o.fallback),
            roughness: o.roughness === undefined ? 0.85 : o.roughness,
            metalness: o.metalness === undefined ? 0.2 : o.metalness,
            transparent: !!o.transparent,
            opacity: o.opacity === undefined ? 1 : o.opacity
        });
        colorSlots.push({ m, prop: 'color', v: colorVar, fb: o.fallback });
        if (o.emissiveVar) {
            m.emissive = new THREE.Color(C(o.emissiveVar, o.emissiveFallback || 0x000000));
            m.emissiveIntensity = o.emissiveIntensity === undefined ? 0.8 : o.emissiveIntensity;
            colorSlots.push({ m, prop: 'emissive', v: o.emissiveVar, fb: o.emissiveFallback });
        }
        return m;
    }

    function basic(colorVar, opts) {
        const o = opts || {};
        const m = new THREE.MeshBasicMaterial({
            color: C(colorVar, o.fallback === undefined ? 0x888888 : o.fallback),
            transparent: !!o.transparent,
            opacity: o.opacity === undefined ? 1 : o.opacity,
            side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide
        });
        colorSlots.push({ m, prop: 'color', v: colorVar, fb: o.fallback });
        return m;
    }

    function refreshColors() {
        // 灯与雾
        scene.background = new THREE.Color(C('--aw-void', 0x05050a));
        if (scene.fog) scene.fog.color.setHex(C('--aw-void', 0x05050a));
        if (lampRefs) {
            lampRefs.forEach(r => r.light.color.setHex(C(r.varName, r.fb)));
        }
        colorSlots.forEach(s => {
            const hex = C(s.v, s.fb === undefined ? 0x888888 : s.fb);
            if (s.prop === 'color') s.m.color.setHex(hex);
            else if (s.prop === 'emissive') s.m.emissive.setHex(hex);
        });
        // 程序化地面纹理要按新主题重画
        groundSlots.forEach(g => rebuildGround(g));
    }

    // ══════════════════════════════════════════════════════
    // 几何小工具
    // ══════════════════════════════════════════════════════

    function box(w, h, d, colorVar, opts) {
        return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(colorVar, opts));
    }

    function cyl(rt, rb, h, seg, colorVar, opts) {
        return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(colorVar, opts));
    }

    function addCollider(group, mesh, pad) {
        const p = pad || 0;
        mesh.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(mesh);
        colliders.push({
            area: group,
            minX: b.min.x - p, maxX: b.max.x + p,
            minZ: b.min.z - p, maxZ: b.max.z + p
        });
    }

    // ── 程序化地面（不引素材）────────────────────────────────
    function makeGroundTextures(baseVar, grainVar, crackVar, cell) {
        const size = 256;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = cssVarRaw(baseVar) || '#101018';
        ctx.fillRect(0, 0, size, size);
        const rnd = (n) => (Math.sin(n * 127.1) * 43758.5453) % 1;
        for (let i = 0; i < 900; i++) {
            const x = Math.abs(rnd(i + 1)) * size;
            const y = Math.abs(rnd(i + 7.7)) * size;
            const r = 0.6 + Math.abs(rnd(i + 3.3)) * 2.4;
            ctx.fillStyle = CA(grainVar, 0.16 + Math.abs(rnd(i + 9)) * 0.22, 0x444444);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        for (let i = 0; i < cell; i++) {
            ctx.strokeStyle = CA(crackVar, 0.1, 0x333333);
            ctx.lineWidth = 1;
            ctx.beginPath();
            const x = Math.abs(rnd(i + 21)) * size;
            const y = Math.abs(rnd(i + 31)) * size;
            ctx.moveTo(x, y);
            ctx.lineTo(x + (Math.abs(rnd(i + 41)) - 0.5) * 46, y + (Math.abs(rnd(i + 51)) - 0.5) * 46);
            ctx.stroke();
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function groundPlane(size, repeat, baseVar, grainVar, crackVar, cells) {
        const tex = makeGroundTextures(baseVar, grainVar, crackVar, cells);
        tex.repeat.set(repeat, repeat);
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
        mesh.rotation.x = -Math.PI / 2;
        groundSlots.push({
            material: m, size, repeat,
            baseVar, grainVar, crackVar, cells
        });
        return mesh;
    }

    function rebuildGround(g) {
        if (g.material.map) g.material.map.dispose();
        const tex = makeGroundTextures(g.baseVar, g.grainVar, g.crackVar, g.cells);
        tex.repeat.set(g.repeat, g.repeat);
        g.material.map = tex;
        g.material.needsUpdate = true;
    }

    // ══════════════════════════════════════════════════════
    // 场景
    // ══════════════════════════════════════════════════════

    let lampRefs = [];
    let rain = null;

    function initThree() {
        canvas = $('aw-canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(C('--aw-void', 0x05050a));

        camera = new THREE.PerspectiveCamera(46, (canvas.clientWidth || 1) / (canvas.clientHeight || 1), 0.1, 200);
        camera.position.set(0, CFG.camHeight, CFG.camBack);

        surfaceGroup = new THREE.Group();
        shelterGroup = new THREE.Group();
        scene.add(surfaceGroup, shelterGroup);

        window.addEventListener('resize', onResize);
    }

    function onResize() {
        if (!renderer || !canvas) return;
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
    }

    // ── 地表 ────────────────────────────────────────────────
    function buildSurface() {
        const g = surfaceGroup;

        const ground = groundPlane(90, 7, '--aw-ground', '--aw-ground-grain', '--aw-ground-crack', 40);
        g.add(ground);

        g.add(new THREE.HemisphereLight(C('--aw-hemi-sky', 0x24222e), C('--aw-hemi-ground', 0x050508), 0.7));

        const key = new THREE.DirectionalLight(C('--aw-trim', 0x6a7a9a), 0.5);
        key.position.set(-18, 22, 14);
        g.add(key);

        // 远处的剪影：不建模，只立黑影，把虚空挡住
        for (let i = 0; i < 20; i++) {
            const ang = (i / 20) * Math.PI * 2 + 0.3;
            const rad = 30 + ((i * 7) % 18);
            const h = 2 + ((i * 5) % 11);
            const b = box(1.6 + ((i * 3) % 4), h, 1.6 + ((i * 2) % 4), '--aw-silhouette', { roughness: 1, metalness: 0 });
            b.position.set(Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad);
            b.rotation.y = ang;
            g.add(b);
        }

        // 发射架：四根立柱 + 三层圈 + 顶灯（顶灯只亮两盏，第三盏熄着——正典细节）
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            const leg = box(0.7, 9, 0.7, '--aw-metal', { metalness: 0.5, roughness: 0.6 });
            leg.position.set(Math.cos(a) * 4.6, 4.5, Math.sin(a) * 4.6);
            g.add(leg);
            addCollider(g, leg);
        }
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(4.9, 0.16, 8, 28),
                mat('--aw-metal', { metalness: 0.6, roughness: 0.5 })
            );
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 2.4 + i * 3;
            g.add(ring);
        }
        const cap = cyl(0.5, 0.9, 1.2, 8, '--aw-metal', { metalness: 0.5 });
        cap.position.y = 9.6;
        g.add(cap);

        [[-2.2, 8.4], [2.2, 8.4], [0, 8.4]].forEach(([x, y], i) => {
            const lit = i < 2;   // 第三盏在上个月的配给单里被划掉了
            const bulb = new THREE.Mesh(
                new THREE.SphereGeometry(0.16, 8, 8),
                lit ? basic('--aw-lamp-bulb', { fallback: 0xffb050 }) : mat('--aw-metal', { roughness: 0.9 })
            );
            bulb.position.set(x, y, 0);
            g.add(bulb);
            if (lit) {
                const l = new THREE.PointLight(C('--aw-lamp', 0xd8a860), 1.1, 16, 2);
                l.position.set(x, y, 0);
                g.add(l);
                lampRefs.push({ light: l, varName: '--aw-lamp', fb: 0xd8a860 });
            }
        });

        // 台基：一圈矮台，南侧一道缝（焊缝是能看的东西）
        const base = cyl(7.4, 7.8, 0.55, 40, '--aw-wall', { roughness: 0.9 });
        base.position.set(0, 0.27, 0);
        g.add(base);

        // 地上那圈记号
        const mark = new THREE.Mesh(
            new THREE.RingGeometry(6.2, 6.45, 64),
            basic('--amber-primary', { transparent: true, opacity: 0.16, doubleSide: true, fallback: 0xd4a04a })
        );
        mark.rotation.x = -Math.PI / 2;
        mark.position.y = 0.02;
        g.add(mark);

        // 装配台（走近按 E 进仪式）
        const bench = box(2.6, 1.0, 1.4, '--aw-metal', { metalness: 0.4, roughness: 0.6 });
        bench.position.set(0, 0.5, -6.4);
        g.add(bench);
        addCollider(g, bench);
        const benchGlow = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.14),
            basic('--amber-primary', { fallback: 0xd4a04a })
        );
        benchGlow.position.set(0, 1.3, -6.4);
        g.add(benchGlow);
        interactables.push({
            kind: 'ritual', id: 'assembly_bench', label: '装配台',
            group: bench, anchor: new THREE.Vector3(0, 1.2, -6.4), radius: CFG.interactRange
        });

        // 通向避难所的通道口（西侧）
        const hatch = box(2.4, 0.12, 2.4, '--aw-metal', { metalness: 0.3 });
        hatch.position.set(-9.4, 0.06, 4.2);
        g.add(hatch);
        interactables.push({
            kind: 'stairs', id: 'down', label: '下到避难所',
            group: hatch, anchor: new THREE.Vector3(-9.4, 1.2, 4.2), radius: CFG.interactRange
        });

        // 风向标：风沙里唯一在动的东西
        const pole = cyl(0.09, 0.09, 5.2, 6, '--aw-metal', { metalness: 0.6 });
        pole.position.set(7.6, 2.6, 5.2);
        g.add(pole);
        const vane = box(1.1, 0.5, 0.06, '--aw-metal', { metalness: 0.5 });
        vane.position.set(7.6, 5.0, 5.2);
        g.add(vane);
        window.__awVane = vane;

        // 光雨（正典：天上落的是光，不是水）
        rain = makeRain(g);

    }

    function makeRain(group) {
        const COUNT = 900;
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(COUNT * 3);
        const speed = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) {
            pos[i * 3] = (Math.sin(i * 12.9) * 0.5) * 80;
            pos[i * 3 + 1] = Math.abs(Math.sin(i * 3.7)) * 26;
            pos[i * 3 + 2] = (Math.cos(i * 7.3) * 0.5) * 80;
            speed[i] = 3 + Math.abs(Math.sin(i * 1.7)) * 6;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const m = new THREE.PointsMaterial({
            color: C('--aw-lamp-bulb', 0xffb050),
            size: 0.09,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        colorSlots.push({ m, prop: 'color', v: '--aw-lamp-bulb', fb: 0xffb050 });
        const points = new THREE.Points(geo, m);
        group.add(points);
        return { points, pos, speed, count: COUNT };
    }

    // ── 避难所 ──────────────────────────────────────────────
    function buildShelter() {
        const g = shelterGroup;

        const ground = groundPlane(46, 6, '--aw-ground', '--aw-ground-grain', '--aw-ground-crack', 24);
        ground.position.y = 0;
        g.add(ground);

        g.add(new THREE.HemisphereLight(C('--aw-hemi-sky', 0x24222e), C('--aw-hemi-ground', 0x050508), 0.8));
        g.add(new THREE.AmbientLight(C('--aw-hemi-sky', 0x24222e), 0.55));

        // 大厅四面墙（墙顶一道冷光带，俯视时就是空间的边界）
        const wallH = 3.6;
        [[0, -14, 34, 0.6], [0, 14, 34, 0.6], [-16, 0, 0.6, 28], [16, 0, 0.6, 28]].forEach(([x, z, w, d]) => {
            const m = box(w, wallH, d, '--aw-wall', { roughness: 0.9 });
            m.position.set(x, wallH / 2, z);
            g.add(m);
            addCollider(g, m);
            const trim = box(w + 0.06, 0.08, d + 0.06, '--aw-trim', { emissiveVar: '--aw-trim-glow', emissiveIntensity: 0.7, metalness: 0.4 });
            trim.position.set(x, wallH + 0.04, z);
            g.add(trim);
        });

        // 沿墙的管道
        [[-12, -13.4], [-8, 13.4], [6, -13.4], [10, 13.4]].forEach(([x, z]) => {
            const pipe = cyl(0.18, 0.18, 26, 8, '--aw-pipe', { metalness: 0.6, roughness: 0.5 });
            pipe.rotation.z = Math.PI / 2;
            pipe.position.set(x, 3.1, z);
            g.add(pipe);
        });

        // 储物柜
        [[-12, 12.4, 1.1, 2.0], [-9.4, 12.4, 1.1, 1.6], [-12, 9, 1.2, 1.7]].forEach(([x, z, w, h]) => {
            const l = box(w, h, 0.9, '--aw-metal', { metalness: 0.35, roughness: 0.7 });
            l.position.set(x, h / 2, z);
            g.add(l);
            addCollider(g, l);
            const glow = box(w * 0.35, 0.06, 0.06, '--amber-primary', { emissiveVar: '--amber-primary', emissiveIntensity: 0.5, fallback: 0xd4a04a });
            glow.position.set(x, h - 0.25, z + 0.48);
            g.add(glow);
        });

        // 大厅里不摆床：床在居住区。这里只放两条长凳，让大厅不至于空。
        [[-6.4, 3.0], [-3.2, 3.0]].forEach(([x, z]) => {
            const bench = box(2.4, 0.4, 0.6, '--aw-prop-2', { roughness: 0.95 });
            bench.position.set(x, 0.2, z);
            g.add(bench);
        });

        // 避难所里那几盏灯
        [[-6, 1], [3, 5.5], [-10, -6]].forEach(([x, z]) => {
            const l = new THREE.PointLight(C('--aw-lamp', 0xd8a860), 0.9, 11, 2);
            l.position.set(x, 2.4, z);
            g.add(l);
            lampRefs.push({ light: l, varName: '--aw-lamp', fb: 0xd8a860 });
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), basic('--aw-lamp-bulb', { fallback: 0xffb050 }));
            bulb.position.set(x, 2.4, z);
            g.add(bulb);
        });

        // 回到地表的通道
        const up = box(2.4, 0.12, 2.4, '--aw-metal', { metalness: 0.3 });
        up.position.set(-9.4, 0.06, 10.4);
        g.add(up);
        interactables.push({
            kind: 'stairs', id: 'up', label: '上到地表',
            group: up, anchor: new THREE.Vector3(-9.4, 1.2, 10.4), radius: CFG.interactRange
        });

        // 房间：壳与物件（全部来自 data/dlc/ascension/rooms/*.json）
        const book = window.AscensionRooms ? window.AscensionRooms.book : null;
        (book && book.shells ? book.shells : []).forEach(sh => buildRoomShell(g, sh));
        (book && book.shells ? book.shells : []).forEach(sh => buildBedsInShell(g, sh));
        buildRoomProps(g);
    }

    function buildRoomShell(group, r) {
        const midX = (r.x0 + r.x1) / 2;
        const wallH = r.wallH || 2.6;

        // 地板
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0),
            mat('--aw-floor-room', { roughness: 0.95, metalness: 0.1 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(midX, 0.012, (r.z0 + r.z1) / 2);
        group.add(floor);

        const wall = (cx, cz, w, d) => {
            const m = box(w, wallH, d, '--aw-wall-room', { roughness: 0.9 });
            m.position.set(cx, wallH / 2, cz);
            group.add(m);
            addCollider(group, m);
            const trim = box(w + 0.05, 0.07, d + 0.05, '--aw-trim', { emissiveVar: '--aw-trim-glow', emissiveIntensity: 0.5, metalness: 0.4 });
            trim.position.set(cx, wallH + 0.035, cz);
            group.add(trim);
        };

        wall(midX, r.z0, r.x1 - r.x0, 0.22);
        wall(midX, r.z1, r.x1 - r.x0, 0.22);
        wall(r.x1, (r.z0 + r.z1) / 2, 0.22, r.z1 - r.z0);

        if (r.doorZ0 !== undefined && r.doorZ1 !== undefined) {
            const segA = r.doorZ0 - r.z0;
            const segB = r.z1 - r.doorZ1;
            if (segA > 0.1) wall(r.x0, r.z0 + segA / 2, 0.22, segA);
            if (segB > 0.1) wall(r.x0, r.doorZ1 + segB / 2, 0.22, segB);
            [r.doorZ0, r.doorZ1].forEach(z => {
                const post = box(0.3, wallH - 0.2, 0.3, '--aw-post', { metalness: 0.4, roughness: 0.6 });
                post.position.set(r.x0, (wallH - 0.2) / 2, z);
                group.add(post);
                addCollider(group, post);
            });
        } else {
            wall(r.x0, (r.z0 + r.z1) / 2, 0.22, r.z1 - r.z0);
        }

        (r.lights || []).forEach(l => {
            const light = new THREE.PointLight(C(l.colorVar || '--aw-lamp', 0xd8a860), (l.intensity || 1.2) * 2.0, (l.range || 12) * 1.35, 2);
            light.position.set(l.x, l.y || 2.35, l.z);
            group.add(light);
            lampRefs.push({ light, varName: l.colorVar || '--aw-lamp', fb: 0xd8a860 });
            const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 7), basic('--aw-lamp-bulb', { fallback: 0xffb050 }));
            bulb.position.set(l.x, l.y || 2.35, l.z);
            group.add(bulb);
        });
    }

    // 床：第一幕二十八张（四张一列、七列）。文本里「数得出来」，场景里就得真数得出来。
    function buildBedsInShell(group, r) {
        const b = r && r.beds;
        if (!b) return;
        for (let c = 0; c < b.cols; c++) {
            for (let i = 0; i < b.perCol; i++) {
                const bx = b.x0 + c * b.dx;
                const bz = b.z0 + i * b.dz;
                const bed = box(b.w, 0.35, b.d, '--aw-prop-2', { roughness: 0.95 });
                bed.position.set(bx, 0.18, bz);
                group.add(bed);
                // 床头的号牌
                const tag = box(0.16, 0.1, 0.04, '--aw-metal', { metalness: 0.4, roughness: 0.7 });
                tag.position.set(bx + 0.4, 0.95, bz + b.d / 2 - 0.08);
                group.add(tag);
            }
        }
    }

    function buildRoomProps(group) {
        const book = window.AscensionRooms ? window.AscensionRooms.book : null;
        if (!book) return;

        (book.props || []).forEach(p => {
            const x = p.at.x, z = p.at.z;
            let mesh, markY = 0.55, markVar = '--aw-mark';

            if (p.shape === 'wall') {
                mesh = box(0.85, 0.9, 0.1, '--aw-prop', { roughness: 0.85 });
                mesh.position.set(x, 1.5, z);
                markY = 0.5;
            } else if (p.shape === 'floor') {
                // 地上画的东西 / 落在地上的东西：一块贴地的薄板
                mesh = box(1.5, 0.05, 1.5, '--aw-prop', { roughness: 0.95, metalness: 0.05 });
                mesh.position.set(x, 0.03, z);
                markY = 0.35;
            } else if (p.shape === 'bed') {
                mesh = box(1.1, 0.35, 2.1, '--aw-prop-2', { roughness: 0.95 });
                mesh.position.set(x, 0.18, z);
                markY = 0.5;
            } else if (p.shape === 'shelf') {
                mesh = box(1.15, 1.85, 0.6, '--aw-shelf', { roughness: 0.85 });
                mesh.position.set(x, 0.93, z);
                for (let i = 0; i < 3; i++) {
                    const board = box(1.05, 0.05, 0.54, '--aw-shelf-board', { roughness: 0.95 });
                    board.position.set(0, -0.62 + i * 0.58, 0);
                    mesh.add(board);
                }
                markY = 1.05;
            } else if (p.shape === 'lamp') {
                mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), mat('--aw-metal', { roughness: 0.6 }));
                mesh.position.set(x, 2.3, z);
                markY = 0.25;
            } else if (p.shape === 'vent') {
                mesh = box(0.9, 0.72, 0.09, '--aw-vent', { metalness: 0.5, roughness: 0.6 });
                mesh.position.set(x, 0.55, z);
                markY = 0.45;
            } else {
                mesh = box(1.0, 0.85, 0.95, '--aw-prop-2', { metalness: 0.3, roughness: 0.7 });
                mesh.position.set(x, 0.43, z);
                markY = 0.5;
            }
            if (p.rotY) mesh.rotation.y = p.rotY;
            group.add(mesh);

            // 冷色菱形 = 能看（和金色的「能做的事」分开）
            const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09),
                mat(markVar, { emissiveVar: '--aw-mark-glow', emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.5 }));
            m.position.set(x, mesh.position.y + markY, z);
            group.add(m);

            interactables.push({
                kind: 'prop', id: p.id, label: p.name, group: mesh,
                anchor: new THREE.Vector3(x, 1.2, z), radius: CFG.interactRange, prop: p
            });
        });

        // 房间里的人
        Object.keys(book.npcs || {}).forEach(id => {
            const n = book.npcs[id];
            if (!n.at) return;
            addNpc(group, id, n.at.x, n.at.z);
        });
    }

    function addNpc(group, id, x, z) {
        const data = (window.AscensionRooms.book.npcs || {})[id] || { name: id };

        const grp = new THREE.Group();
        const body = cyl(0.32, 0.38, 0.95, 9, '--aw-npc', { roughness: 0.85 });
        body.position.y = 0.48;
        grp.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 9), mat('--aw-skin', { roughness: 0.85 }));
        head.position.y = 1.2;
        grp.add(head);

        // 头顶标记：金色 = 这个人有事可问
        const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.12),
            mat('--amber-primary', { emissiveVar: '--amber-primary', emissiveIntensity: 1.0, fallback: 0xd4a04a }));
        mark.position.y = 1.75;
        grp.add(mark);

        grp.position.set(x, 0, z);
        group.add(grp);

        const label = document.createElement('div');
        label.className = 'aw-label';
        label.textContent = data.name;
        $('aw-labels').appendChild(label);

        const item = {
            kind: 'npc', id, name: data.name, group: grp,
            anchor: new THREE.Vector3(x, 2.0, z), label, radius: CFG.interactRange
        };
        interactables.push(item);
        npcs.push(item);
    }

    // ── 玩家 ────────────────────────────────────────────────
    function buildPlayer() {
        player = new THREE.Group();

        const body = cyl(0.34, 0.4, 1.0, 10, '--aw-body', { roughness: 0.7 });
        body.position.y = 0.5;
        player.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), mat('--aw-skin', { roughness: 0.8 }));
        head.position.y = 1.26;
        player.add(head);

        // 肩上一根羽毛：执仪者的记号
        const feather = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 5),
            mat('--amber-primary', { emissiveVar: '--amber-dim', emissiveIntensity: 0.6, fallback: 0xd4a04a }));
        feather.position.set(0.22, 1.5, -0.05);
        feather.rotation.z = -0.35;
        player.add(feather);

        const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 20),
            basic('--amber-primary', { transparent: true, opacity: 0.2, doubleSide: true, fallback: 0xd4a04a }));
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.03;
        player.add(halo);

        playerParts = { body, head, feather, halo };
        scene.add(player);
    }

    // ══════════════════════════════════════════════════════
    // 状态 / 存档
    // ══════════════════════════════════════════════════════

    function freshState() {
        return { area: 'surface', threads: {}, seen: {}, asked: {} };
    }

    const ROOM_KEY = 'memory-sanctuary-ascension-room';

    function loadState() {
        S = freshState();
        // 1) 优先读 DLC 自己的遗迹账（标题页进来时没有游戏存档，所以它得独立存）
        try {
            const raw = localStorage.getItem(ROOM_KEY);
            if (raw) {
                const room = JSON.parse(raw);
                if (room && typeof room === 'object') {
                    S.threads = room.threads || {};
                    S.seen = room.seen || {};
                    S.asked = room.asked || {};
                    return;
                }
            }
        } catch (e) { /* 坏数据就当新的一份 */ }

        // 2) 退一步看游戏内存檔里有没有（有存档时跟存档一起走）
        try {
            const st = window.MemorySanctuary && window.MemorySanctuary.state;
            const room = st && st.modules && st.modules.ascension && st.modules.ascension.room;
            if (room && typeof room === 'object') {
                S.threads = room.threads || {};
                S.seen = room.seen || {};
                S.asked = room.asked || {};
            }
        } catch (e) { /* 没有就是新的一份 */ }
    }

    function saveState() {
        const room = { threads: S.threads, seen: S.seen, asked: S.asked };
        // DLC 自己的账：标题页直接进 DLC 也存得住
        try { localStorage.setItem(ROOM_KEY, JSON.stringify(room)); } catch (e) { /* 满/禁用都不打断 */ }
        // 有游戏存档时跟着存档走（只增字段，不动结构）
        try {
            const st = window.MemorySanctuary && window.MemorySanctuary.state;
            if (!st) return;
            st.modules = st.modules || {};
            st.modules.ascension = st.modules.ascension || {};
            st.modules.ascension.room = room;
        } catch (e) { /* 存档失败不打断 */ }
    }

    function toast(text) {
        const p = $('aw-prompt');
        const t = $('aw-prompt-text');
        if (!p || !t) return;
        t.textContent = text;
        p.classList.remove('hidden');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => {
            p.classList.add('hidden');
            if (window.AscensionRooms && window.AscensionRooms.isOpen) return;
        }, 3200);
    }

    // ══════════════════════════════════════════════════════
    // 输入 / 移动 / 交互
    // ══════════════════════════════════════════════════════

    function bindInput() {
        // 捕获阶段拦下我们用的键，免得本体的全局快捷键在标题页上也响应
        document.addEventListener('keydown', e => {
            if (!running) return;
            const k = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'q', ' ', 'escape'].indexOf(k) < 0) return;
            if (paused) return;

            e.stopPropagation();
            keys[k] = true;

            if (k === 'q') { e.preventDefault(); window.AscensionRooms.toggleKnow(); return; }
            if (k === 'escape') {
                e.preventDefault();
                if (!window.AscensionRooms.back()) window.AscensionRooms.toggleKnow(false);
                return;
            }
            if (window.AscensionRooms.isOpen) {
                if (k === ' ' || k === 'enter' || k === 'e') { e.preventDefault(); window.AscensionRooms.back(); }
                return;
            }
            if (k === 'e' || k === ' ') {
                if (nearest) { e.preventDefault(); doInteract(nearest); }
            }
        }, true);

        document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; }, true);
        window.addEventListener('blur', () => { keys = Object.create(null); });

        if (canvas) {
            canvas.addEventListener('click', () => {
                if (window.AscensionRooms.isOpen) window.AscensionRooms.back();
            });
        }

        const knowBtn = $('aw-know-btn');
        if (knowBtn) knowBtn.addEventListener('click', () => window.AscensionRooms.toggleKnow());
    }

    function doInteract(it) {
        if (it.kind === 'prop') { window.AscensionRooms.openProp(it.prop); return; }
        if (it.kind === 'npc') { window.AscensionRooms.openNpc(it.id); return; }
        if (it.kind === 'stairs') {
            switchArea(it.id === 'up' ? 'surface' : 'shelter');
            return;
        }
        if (it.kind === 'ritual') { openRitual(); return; }
    }

    function hitsCollider(x, z) {
        const areaGroup = S.area === 'surface' ? surfaceGroup : shelterGroup;
        const r = CFG.playerRadius;
        for (const c of colliders) {
            if (c.area !== areaGroup) continue;
            if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
        }
        return false;
    }

    function movePlayer(dt) {
        let dx = 0, dz = 0;
        if (keys['w'] || keys['arrowup']) dz -= 1;
        if (keys['s'] || keys['arrowdown']) dz += 1;
        if (keys['a'] || keys['arrowleft']) dx -= 1;
        if (keys['d'] || keys['arrowright']) dx += 1;

        if (!dx && !dz) {
            playerParts.body.position.y = 0.5 + Math.sin(performance.now() / 600) * 0.01;
            return;
        }

        const len = Math.hypot(dx, dz);
        dx /= len; dz /= len;

        const nx = player.position.x + dx * CFG.moveSpeed * dt;
        const nz = player.position.z + dz * CFG.moveSpeed * dt;

        if (!hitsCollider(nx, player.position.z)) player.position.x = nx;
        if (!hitsCollider(player.position.x, nz)) player.position.z = nz;

        const b = S.area === 'surface' ? SURFACE : SHELTER;
        player.position.x = Math.max(b.minX, Math.min(b.maxX, player.position.x));
        player.position.z = Math.max(b.minZ, Math.min(b.maxZ, player.position.z));

        const angle = Math.atan2(dx, dz);
        player.rotation.y += (angle - player.rotation.y) * Math.min(1, dt * 14);
        playerParts.body.position.y = 0.5 + Math.abs(Math.sin(performance.now() / 160)) * 0.045;
    }

    function updateCamera(dt) {
        const t = player.position;
        const desired = new THREE.Vector3(t.x, CFG.camHeight, t.z + CFG.camBack);
        camera.position.lerp(desired, Math.min(1, dt * 4.2));
        camera.lookAt(t.x, 1.0, t.z);
    }

    function updateInteraction() {
        if (paused || window.AscensionRooms.isOpen) {
            nearest = null;
            $('aw-prompt').classList.add('hidden');
            return;
        }

        const areaGroup = S.area === 'surface' ? surfaceGroup : shelterGroup;
        let best = null, bestD = Infinity;
        for (const it of interactables) {
            if (it.group.parent !== areaGroup) continue;
            const d = Math.hypot(player.position.x - it.anchor.x, player.position.z - it.anchor.z);
            if (d < it.radius && d < bestD) { best = it; bestD = d; }
        }
        nearest = best;

        const prompt = $('aw-prompt');
        const text = $('aw-prompt-text');
        if (best) {
            text.textContent = best.kind === 'npc' ? '与' + best.name + '交谈'
                : best.kind === 'prop' ? '看 · ' + best.label
                    : best.label;
            prompt.classList.remove('hidden');
        } else {
            prompt.classList.add('hidden');
        }
    }

    function updateLabels() {
        const v = new THREE.Vector3();
        for (const it of npcs) {
            const inArea = it.group.parent === (S.area === 'surface' ? surfaceGroup : shelterGroup);
            it.label.style.display = inArea ? '' : 'none';
            if (!inArea) continue;
            v.copy(it.anchor).project(camera);
            it.label.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
            it.label.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
            const d = Math.hypot(player.position.x - it.anchor.x, player.position.z - it.anchor.z);
            it.label.classList.toggle('near', d < CFG.interactRange);
        }
    }

    function updateHud() {
        $('aw-region').textContent = S.area === 'surface' ? '发射场 · 地表' : '避难所 · 地下';
        $('aw-thread-count').textContent = String(Object.keys(S.threads).length);
        $('aw-seen-count').textContent = String(Object.keys(S.seen).length);
        const goals = {
            surface: '· 走到装配台，开始这一枚',
            shelter: '· 配给室、居住区，两个人还没问完'
        };
        $('aw-goal').textContent = goals[S.area] || '';
    }

    function updateWorldAnim(t) {
        if (rain && S.area === 'surface') {
            const p = rain.pos;
            for (let i = 0; i < rain.count; i++) {
                p[i * 3 + 1] -= rain.speed[i] * 0.016;
                if (p[i * 3 + 1] < 0) {
                    p[i * 3 + 1] = 24 + (i % 7);
                    p[i * 3] = player.position.x + Math.sin(t / 900 + i) * 34;
                    p[i * 3 + 2] = player.position.z + Math.cos(t / 1100 + i) * 34;
                }
            }
            rain.points.geometry.attributes.position.needsUpdate = true;
        }
        if (window.__awVane) {
            window.__awVane.rotation.y = Math.sin(t / 900) * 0.5;
        }
        if (playerParts.halo) {
            playerParts.halo.material.opacity = 0.14 + Math.sin(t / 850) * 0.05;
        }
    }

    function loop(t) {
        if (!running) return;
        requestAnimationFrame(loop);
        const dt = Math.min((t - lastT) / 1000, 0.05);
        lastT = t;
        if (paused) return;

        updateHud();
        movePlayer(dt);
        updateCamera(dt);
        updateInteraction();
        updateLabels();
        updateWorldAnim(t);
        renderer.render(scene, camera);
    }

    // ── 区域切换 ────────────────────────────────────────────
    function enterArea(area, instant) {
        S.area = area;
        const isSurface = area === 'surface';
        surfaceGroup.visible = isSurface;
        shelterGroup.visible = !isSurface;
        if (isSurface) player.position.set(-6.6, 0, 6.2);
        else player.position.set(-9.4, 0, 8.6);
        player.position.y = 0;
        if (instant) camera.position.set(player.position.x, CFG.camHeight, player.position.z + CFG.camBack);
        npcs.forEach(it => { it.label.style.display = 'none'; });
    }

    function switchArea(area) {
        const fade = $('aw-fade');
        if (fade) fade.classList.add('on');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
            enterArea(area, true);
            if (fade) fade.classList.remove('on');
        }, 360);
    }

    // ══════════════════════════════════════════════════════
    // 仪式：装配台 → 现有九阶段界面
    // ══════════════════════════════════════════════════════

    function openRitual() {
        if (typeof AscensionUI === 'undefined' || !AscensionUI) return;
        pause();
        if (typeof AudioAscension !== 'undefined' && AudioAscension) {
            try { AudioAscension.startAmbience(); } catch (e) { /* 无音频也能玩 */ }
        }
        AscensionUI.open();
    }

    function onRitualClosed() {
        resume();
    }

    // ══════════════════════════════════════════════════════
    // 开关
    // ══════════════════════════════════════════════════════

    function ensureRoot() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'aw-root';
        root.className = 'hidden';
        root.innerHTML = `
            <canvas id="aw-canvas"></canvas>
            <div id="aw-hud">
                <span id="aw-region">发射场 · 地表</span>
                <div id="aw-stats">
                    <span class="aw-stat">话头 <b id="aw-thread-count">0</b></span>
                    <span class="aw-stat">看见 <b id="aw-seen-count">0</b></span>
                </div>
            </div>
            <div id="aw-goal"></div>
            <div id="aw-labels"></div>

            <div id="aw-prompt" class="hidden"><kbd>E</kbd><span id="aw-prompt-text"></span></div>

            <div id="aw-dialog" class="hidden">
                <div id="aw-speaker"></div>
                <div id="aw-text"></div>
                <div id="aw-choices"></div>
                <div id="aw-hint"></div>
            </div>

            <button id="aw-know-btn" type="button">话头 <b id="aw-know-count">0</b></button>
            <div id="aw-know" class="hidden">
                <div class="aw-know-head">你记住的话</div>
                <div class="aw-know-grp">
                    <div class="aw-know-h" id="aw-threads-head">能问的</div>
                    <div id="aw-threads"></div>
                </div>
                <div class="aw-know-grp">
                    <div class="aw-know-h clickable" id="aw-seen-head">看见的 <span id="aw-seen-total" class="aw-dim"></span><span class="aw-know-toggle" id="aw-seen-toggle">▸ 展开</span></div>
                    <div id="aw-seen" class="hidden"></div>
                </div>
                <div class="aw-know-foot">Q 收起面板　Esc 退出</div>
            </div>

            <div id="aw-help"><b>W A S D</b> 走　<b>E</b> 看 / 说话　<b>空格</b> 收起　<b>Q</b> 你记住的话</div>

            <div id="aw-fade"></div>
            <div id="aw-boot">装载中……</div>
        `;
        document.body.appendChild(root);
        return root;
    }

    async function boot() {
        ensureRoot();

        // 房间数据先到位，再建模
        if (typeof AscensionRooms === 'undefined') {
            $('aw-boot').textContent = '房间模块未加载（js/ascension-rooms.js）';
            return;
        }
        await AscensionRooms.load(ROOM_FILES);
        loadState();

        initThree();
        buildSurface();
        buildShelter();
        buildPlayer();
        enterArea('surface', true);

        AscensionRooms.mount({
            state: S,
            save: saveState,
            toast: toast,
            action: () => { /* 物件上的「动手」动作留给 P1：睡觉过周 / 撬晶体 */ }
        });

        bindInput();
        onResize();
        $('aw-boot').classList.add('hidden');
        booted = true;

        if (window.__awBooted) window.__awBooted();
    }

    async function open() {
        ensureRoot();
        root.classList.remove('hidden');
        // 标题页收起来：世界层盖在它上面，但别让它在底下继续跑动效
        const title = document.getElementById('title-screen');
        if (title) title.classList.add('hidden');
        if (typeof AudioSystem !== 'undefined' && AudioSystem.stopBGM) AudioSystem.stopBGM();

        if (!booted) await boot();

        running = true;
        paused = false;
        lastT = performance.now();
        onResize();
        requestAnimationFrame(loop);

        const help = $('aw-help');
        if (help) {
            help.classList.remove('fade');
            setTimeout(() => help.classList.add('fade'), 9000);
        }
        updateHud();
    }

    function close() {
        running = false;
        paused = false;
        if (root) root.classList.add('hidden');
        if (window.AscensionRooms) { AscensionRooms.close(); AscensionRooms.toggleKnow(false); }
        if (typeof AudioSystem !== 'undefined' && AudioSystem.playBGM) AudioSystem.playBGM('title');
        if (typeof showTitleScreen === 'function') showTitleScreen();
    }

    function pause() { paused = true; }
    function resume() { if (!running) return; paused = false; lastT = performance.now(); }

    // ── 主题切换：重读颜色（观察 data-theme）─────────────────
    (function watchTheme() {
        try {
            const ob = new MutationObserver(() => {
                if (running && scene) refreshColors();
            });
            ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        } catch (e) { /* 老浏览器忽略 */ }
    })();

    return {
        open,
        close,
        pause,
        resume,
        onRitualClosed,
        get isOpen() { return !!(root && !root.classList.contains('hidden')); },
        get state() { return S; },
        // 验收用（无鼠标自动化）：只在 ?dlc=ascension 的临时环境里用得到
        _debug: {
            get state() { return S; },
            enterArea,
            tp(x, z) { if (player) player.position.set(x, 0, z); return [player.position.x, player.position.z]; },
            get nearest() { return nearest ? { kind: nearest.kind, id: nearest.id, label: nearest.label } : null; },
            interact() { if (nearest) doInteract(nearest); return nearest ? nearest.id : null; },
            openRitual
        }
    };
})();
