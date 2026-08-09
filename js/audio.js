/**
 * audio.js - Web Audio API 环境音系统
 * 合成音效（零外部资源依赖）
 * 
 * 音频分层：
 * - 基础层：低频drone（始终存在，音量随能源降低而升高）
 * - 事件层：归档成功→清脆风铃；资源归零→低沉警示；条目过期→玻璃碎裂
 * - 场景层：切换存储室时播放特征音效
 * - 终局层：第36-48周逐渐加入心跳声，频率随week增加
 */

window.AudioSystem = (() => {
    let ctx = null;
    let masterGain = null;
    let droneOsc = null;
    let droneGain = null;
    let isInitialized = false;
    let isMuted = false;
    let heartbeatInterval = null;
    let currentScene = null;
    let sfxVolume = 1.0; // 音效音量倍率 (0-1)

    // ─── BGM 配置（数据驱动，方便扩展） ───
    // 文件缺失时自动跳过，不阻塞游戏
    const BGM_CONFIG = {
        title:         { file: 'title.mp3',         loop: true,  volume: 0.6, label: '标题' },
        game:          { file: 'game.mp3',          loop: true,  volume: 0.5, label: '游戏' },
        game_late:     { file: 'game_late.mp3',     loop: true,  volume: 0.5, label: '游戏中期' },
        game_final:    { file: 'game_final.mp3',    loop: true,  volume: 0.5, label: '游戏后期' },
        ending_normal: { file: 'ending_normal.mp3', loop: false, volume: 0.6, label: '普通结局' },
        ending_true:   { file: 'ending_true.mp3',   loop: false, volume: 0.6, label: '真结局' }
    };

    // BGM 状态
    let bgmAudio = new Audio();  // 单一 Audio 元素，复用不重建
    let bgmCurrentScene = null;    // 当前 BGM 场景 ID
    let bgmMuted = false;          // BGM 静音（独立于音效）
    let bgmVolume = 1.0;           // BGM 音量倍率 (0-1)
    let bgmFadeTimer = null;       // 淡入淡出定时器
    let bgmFailedScenes = {};      // 记录加载失败的场景，避免重复请求
    let bgmPendingScene = null;    // 等待用户交互后播放的场景
    let bgmIsPlaying = false;      // 当前是否有 BGM 在播放
    let bgmGeneration = 0;         // 每次 playBGM 递增，用于检测过期回调
    let sfxMuted = false;          // 音效静音状态
    let globalMuted = false;       // 全局静音状态

    // ─── BGM 核心方法 ───

    function getBGMPath(sceneId) {
        const config = BGM_CONFIG[sceneId];
        if (!config) return null;
        return `assets/bgm/${config.file}`;
    }

    // 立即停止（硬切）— 用于场景切换，操作单一 audio 元素
    function hardStopBGM() {
        if (bgmFadeTimer) {
            clearInterval(bgmFadeTimer);
            bgmFadeTimer = null;
        }
        // 先清空 src 强制浏览器停止加载/播放，再 pause
        bgmAudio.src = '';
        bgmAudio.pause();
        bgmCurrentScene = null;
        bgmIsPlaying = false;
    }

    // 淡出停止 — 用于彻底停止 BGM（如返回标题、游戏结束）
    function stopBGM() {
        if (!bgmIsPlaying) return;
        if (bgmFadeTimer) clearInterval(bgmFadeTimer);

        const startVolume = bgmAudio.volume;
        const steps = 20;
        const duration = 800;
        const interval = duration / steps;
        let step = 0;

        bgmFadeTimer = setInterval(() => {
            step++;
            bgmAudio.volume = Math.max(0, startVolume * (1 - step / steps));
            if (step >= steps) {
                clearInterval(bgmFadeTimer);
                bgmFadeTimer = null;
                bgmAudio.src = '';
                bgmAudio.pause();
                bgmCurrentScene = null;
                bgmIsPlaying = false;
            }
        }, interval);
    }

    // 播放 BGM（场景切换：硬切 + 淡入）
    // 同步停止旧音频 + 设置新 src，异步播放（fire-and-forget with race check）
    function playBGM(sceneId) {
        const config = BGM_CONFIG[sceneId];
        if (!config) {
            console.warn(`[BGM] 未知场景: ${sceneId}`);
            return;
        }

        // 同场景已在播放 → 跳过
        if (bgmCurrentScene === sceneId && bgmIsPlaying) return;

        // 已记录为不可用 → 跳过
        if (bgmFailedScenes[sceneId]) {
            console.warn(`[BGM] 场景 ${sceneId} 已记录为不可用，跳过`);
            return;
        }

        // 硬切上一首（立即停止，无淡出）
        hardStopBGM();
    
        // 递增 generation，使过期的 play() 回调失效
        bgmGeneration++;
        const thisGen = bgmGeneration;

        // 设置新 src 并尝试播放
        const path = getBGMPath(sceneId);
        bgmAudio.src = path;
        bgmAudio.loop = config.loop;
        bgmAudio.volume = 0;
        bgmAudio.preload = 'auto';
        bgmCurrentScene = sceneId;

        bgmAudio.play()
            .then(() => {
                // 竞争检查：generation 不匹配说明已有新的 playBGM 调用
                if (thisGen !== bgmGeneration || bgmCurrentScene !== sceneId) {
                    bgmAudio.src = '';
                    bgmAudio.pause();
                    bgmIsPlaying = false;
                    return;
                }
                bgmIsPlaying = true;
                fadeInBGM(config.volume);
                console.log(`[BGM] 开始播放: ${sceneId}`);
            })
            .catch(e => {
                if (e.name === 'NotAllowedError') {
                    console.log(`[BGM] 等待用户交互后播放: ${sceneId}`);
                    bgmPendingScene = sceneId;
                    bgmCurrentScene = null;
                    bgmIsPlaying = false;
                    return;
                }
                // AbortError / interrupted 是切换 BGM 时的正常竞争，静默忽略
                if (e.name === 'AbortError' || e.message?.includes('interrupted')) {
                    console.log(`[BGM] 播放被新请求打断: ${sceneId}`);
                    return;
                }
                console.warn(`[BGM] 播放失败: ${e.message}`);
                bgmFailedScenes[sceneId] = true;
                bgmCurrentScene = null;
                bgmIsPlaying = false;
            });
    }

    // 同步版本（用于已知文件存在的场景）
    function playBGMSync(sceneId) {
        const config = BGM_CONFIG[sceneId];
        if (!config) return;
        if (bgmCurrentScene === sceneId && bgmIsPlaying) return;
        if (bgmFailedScenes[sceneId]) return;

        hardStopBGM();

        bgmGeneration++;
        const thisGen = bgmGeneration;

        const path = getBGMPath(sceneId);
        bgmAudio.src = path;
        bgmAudio.loop = config.loop;
        bgmAudio.volume = 0;
        bgmAudio.preload = 'auto';
        bgmCurrentScene = sceneId;

        bgmAudio.play()
            .then(() => {
                if (thisGen !== bgmGeneration || bgmCurrentScene !== sceneId) {
                    bgmAudio.src = '';
                    bgmAudio.pause();
                    bgmIsPlaying = false;
                    return;
                }
                bgmIsPlaying = true;
                fadeInBGM(config.volume);
                console.log(`[BGM] 开始播放: ${sceneId}`);
            })
            .catch(e => {
                if (e.name === 'NotAllowedError') {
                    console.log(`[BGM] 等待用户交互后播放: ${sceneId}`);
                    bgmPendingScene = sceneId;
                    bgmCurrentScene = null;
                    bgmIsPlaying = false;
                    return;
                }
                if (e.name === 'AbortError' || e.message?.includes('interrupted')) {
                    console.log(`[BGM] 播放被新请求打断: ${sceneId}`);
                    return;
                }
                console.warn(`[BGM] 播放失败: ${e.message}`);
                bgmFailedScenes[sceneId] = true;
                bgmCurrentScene = null;
                bgmIsPlaying = false;
            });
    }

    function getBGMPath(sceneId) {
        return `assets/bgm/${sceneId}.mp3`;
    }

    // 用户交互后尝试播放等待中的 BGM
    function tryPlayBGMAfterInteraction() {
        if (bgmPendingScene) {
            const pending = bgmPendingScene;
            bgmPendingScene = null;
            playBGM(pending);
        }
    }

    // 淡入 BGM
    function fadeInBGM(targetVolume) {
        if (bgmFadeTimer) clearInterval(bgmFadeTimer);
        
        const effectiveVolume = bgmMuted ? 0 : targetVolume * bgmVolume;
        const steps = 30;
        const duration = 1500; // 1.5s
        const interval = duration / steps;
        let step = 0;

        bgmFadeTimer = setInterval(() => {
            step++;
            if (bgmIsPlaying) {
                bgmAudio.volume = Math.min(effectiveVolume, (effectiveVolume * step) / steps);
            }
            if (step >= steps) {
                clearInterval(bgmFadeTimer);
                bgmFadeTimer = null;
            }
        }, interval);
    }

    // 设置 BGM 音量 (0-1)
    function setBGMVolume(value) {
        bgmVolume = Math.max(0, Math.min(1, value));
        if (bgmIsPlaying && !bgmMuted) {
            const config = BGM_CONFIG[bgmCurrentScene];
            const target = config ? config.volume * bgmVolume : bgmVolume;
            bgmAudio.volume = target;
        }
    }

    // BGM 静音切换（独立于音效）
    function toggleBGMMute() {
        bgmMuted = !bgmMuted;
        if (bgmIsPlaying) {
            const config = BGM_CONFIG[bgmCurrentScene];
            const target = bgmMuted ? 0 : (config ? config.volume * bgmVolume : bgmVolume);
            bgmAudio.volume = target;
        }
        return bgmMuted;
    }

    // 获取当前 BGM 场景 ID
    function getCurrentBGM() {
        return bgmCurrentScene;
    }

    // ─── 章节 BGM 自动切换辅助 ───
    // 根据游戏周数返回对应的 game BGM 场景 ID
    function getGameBGMForWeek(week) {
        if (week >= 36) return 'game_final';
        if (week >= 16) return 'game_late';
        return 'game';
    }

    // 延迟初始化（用户交互后）
    function init() {
        if (isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            ctx = new AudioContext();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.3 * sfxVolume * (sfxMuted || globalMuted ? 0 : 1);
            masterGain.connect(ctx.destination);
            
            startDrone();
            isInitialized = true;
            console.log('[Audio] 系统初始化完成');
        
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => console.log('[Audio] AudioContext resumed'));
            }
        } catch (e) {
            console.warn('[Audio] Web Audio 不可用:', e);
        }
    }

    // 启动基础低频drone
    function startDrone() {
        if (!ctx) return;
        
        droneOsc = ctx.createOscillator();
        droneGain = ctx.createGain();
        
        droneOsc.type = 'sine';
        droneOsc.frequency.value = 60; // 低频
        
        // 缓慢频率调制
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.1;
        lfoGain.gain.value = 5;
        lfo.connect(lfoGain);
        lfoGain.connect(droneOsc.frequency);
        lfo.start();
        
        droneGain.gain.value = 0.02;
        
        droneOsc.connect(droneGain);
        droneGain.connect(masterGain);
        droneOsc.start();
    }

    // 根据能源水平调整drone音量
    function updateDroneByEnergy(energy) {
        if (!droneGain || !ctx) return;
        
        // 能源越低，drone越响
        const normalizedEnergy = Math.max(0, Math.min(100, energy));
        const droneVolume = normalizedEnergy < 30 
            ? (30 - normalizedEnergy) / 30 * 0.15 
            : 0;
        
        droneGain.gain.setValueAtTime(droneVolume, ctx.currentTime);
    }

    // 播放风铃声（归档成功）
    function playArchiveChime() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        const frequencies = [800, 1000, 1200, 1500];
        
        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.08, now + i * 0.1 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.8);
            
            osc.connect(gain);
            gain.connect(masterGain);
            
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 1);
        });
    }

    // 播放低沉警示（资源归零）
    function playAlertTone() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.5);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.6);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + 0.7);
    }

    // 播放急促心跳声（资源危急）
    function playHeartbeatAlert() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(80 + i * 10, now + i * 0.15);
            osc.frequency.exponentialRampToValueAtTime(40, now + i * 0.15 + 0.1);
            
            gain.gain.setValueAtTime(0, now + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.12, now + i * 0.15 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.12);
            
            osc.connect(gain);
            gain.connect(masterGain);
            
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.15);
        }
    }

    // 播放勘探出发音效
    function playExploreDeploy() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 低频启动嗡鸣
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        osc.frequency.linearRampToValueAtTime(80, now + 0.4);
        
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + 0.55);
        
        // 金属撞击
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(200, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.06, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc2.connect(gain2);
        gain2.connect(masterGain);
        
        osc2.start(now + 0.1);
        osc2.stop(now + 0.4);
    }

    // 播放勘探返回音效（资源获取 - 上升音阶）
    function playExploreReturnResource() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        const frequencies = [523, 659, 784]; // C5, E5, G5 大三和弦
        
        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, now + i * 0.08);
            gain.gain.linearRampToValueAtTime(0.07, now + i * 0.08 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.5);
            
            osc.connect(gain);
            gain.connect(masterGain);
            
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.6);
        });
    }

    // 播放勘探返回音效（叙事发现 - 低频脉冲 + 人声质感）
    function playExploreReturnNarrative() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 低频脉冲
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.value = 120;
        
        gain1.gain.setValueAtTime(0.1, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc1.connect(gain1);
        gain1.connect(masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.45);
        
        // 人声质感（调制泛音）
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        
        osc2.type = 'sine';
        osc2.frequency.value = 220;
        
        lfo.frequency.value = 5;
        lfoGain.gain.value = 15;
        lfo.connect(lfoGain);
        lfoGain.connect(osc2.frequency);
        
        gain2.gain.setValueAtTime(0, now + 0.1);
        gain2.gain.linearRampToValueAtTime(0.05, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc2.connect(gain2);
        gain2.connect(masterGain);
        
        lfo.start(now);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.65);
        lfo.stop(now + 0.65);
    }

    // 播放勘探返回音效（风险 - 下行滑音 + 撞击低音）
    function playExploreReturnRisk() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 下行滑音
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(300, now);
        osc1.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        
        gain1.gain.setValueAtTime(0.1, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        
        osc1.connect(gain1);
        gain1.connect(masterGain);
        
        osc1.start(now);
        osc1.stop(now + 0.4);
        
        // 撞击低音
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        
        osc2.type = 'sine';
        osc2.frequency.value = 50;
        
        gain2.gain.setValueAtTime(0.2, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        osc2.connect(gain2);
        gain2.connect(masterGain);
        
        osc2.start(now + 0.15);
        osc2.stop(now + 0.35);
    }

    // 播放项目完成音
    // 立即归档音效：清脆短促的确认音
    function playInstantArchive() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        const frequencies = [1047, 1319]; // C6, E6
        
        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + i * 0.08);
            gain.gain.linearRampToValueAtTime(0.12, now + i * 0.08 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.4);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.5);
        });
    }

    function playProjectComplete() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 上升音：象征项目完成
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.2);
        osc.frequency.linearRampToValueAtTime(900, now + 0.4);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + 0.7);
    }
    
    // 播放机械启动音（项目面板/应急协议）
    function playMechanicalEngage() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 低频机械嗡鸣
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.15);
        osc.frequency.linearRampToValueAtTime(60, now + 0.3);
        
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + 0.45);
        
        // 金属撞击泛音
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(300, now + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.06, now + 0.05);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc2.connect(gain2);
        gain2.connect(masterGain);
        
        osc2.start(now + 0.05);
        osc2.stop(now + 0.3);
    }

    // 播放玻璃碎裂（条目过期）
    function playShatterSound() {
        if (!ctx || isMuted) return;
        resume();
        
        const now = ctx.currentTime;
        
        // 白噪声burst模拟碎裂
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 3000;
        
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        
        noise.start(now);
    }

    // 链式完成音效：上升琶音
    function playChainComplete() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6 琶音
        
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.08, now + i * 0.1 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.5);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.6);
        });
    }

    // 守护者事件触发：温暖的和弦
    function playGuardianEventTrigger() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        const notes = [392, 494, 587]; // G4, B4, D5 大调和弦
        
        notes.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.07, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.9);
        });
    }

    // 封印音效：低沉庄严的钟声
    function playSealSound() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        
        // 基础频率：125Hz 低频钟声
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(125, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 2.1);
        
        // 泛音列
        [250, 375, 500].forEach((freq, i) => {
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.value = freq;
            gain2.gain.setValueAtTime(0, now + 0.05);
            gain2.gain.linearRampToValueAtTime(0.04 / (i + 1), now + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.5 - i * 0.2);
            osc2.connect(gain2);
            gain2.connect(masterGain);
            osc2.start(now + 0.05);
            osc2.stop(now + 1.6 - i * 0.2);
        });
    }

    // 通用按钮点击音效

    function playButtonClick() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.06);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // ─── VN 视觉小说音效 ───

    function playVNOpen() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 低沉的开启音，像大门缓缓打开
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.3);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    function playVNAdvance() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 轻柔的点击音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    function playVNSkipConfirm() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 双音提示
        [400, 500].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.08, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.25);
        });
    }

    function playVNSkip() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 下降音，表示跳过
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    function playVNCancel() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 短促的取消音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    function playVNClose() {
        if (!ctx || isMuted) return;
        resume();
        const now = ctx.currentTime;
        // 温暖的关闭音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    // 播放场景特征音效
    function playSceneSound(scene) {
        if (!ctx || isMuted || scene === currentScene) return;
        resume();
        
        currentScene = scene;
        const now = ctx.currentTime;
        
        const sceneSounds = {
            language: { freq: 600, type: 'sine', duration: 0.4 },
            history: { freq: 300, type: 'triangle', duration: 0.5 },
            disaster: { freq: 150, type: 'sawtooth', duration: 0.3 },
            art: { freq: 800, type: 'sine', duration: 0.5 },
            philosophy: { freq: 400, type: 'sine', duration: 0.6 },
            science: { freq: 700, type: 'square', duration: 0.2 },
            ecology: { freq: 500, type: 'sine', duration: 0.4 },
            law: { freq: 350, type: 'triangle', duration: 0.4 },
            daily: { freq: 550, type: 'sine', duration: 0.3 },
            architecture: { freq: 250, type: 'triangle', duration: 0.5 },
            medicine: { freq: 450, type: 'sine', duration: 0.4 },
            astronomy: { freq: 900, type: 'sine', duration: 0.6 }
        };
        
        const sound = sceneSounds[scene];
        if (!sound) return;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = sound.type;
        osc.frequency.setValueAtTime(sound.freq, now);
        osc.frequency.exponentialRampToValueAtTime(sound.freq * 1.5, now + sound.duration);
        
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + sound.duration);
        
        osc.connect(gain);
        gain.connect(masterGain);
        
        osc.start(now);
        osc.stop(now + sound.duration + 0.1);
    }

    // 启动终局心跳
    function startHeartbeat(week) {
        if (!ctx || isMuted || heartbeatInterval) return;
        
        const interval = Math.max(500, 1200 - (week - 36) * 50);
        
        heartbeatInterval = setInterval(() => {
            if (!ctx || isMuted) {
                stopHeartbeat();
                return;
            }
            playHeartbeat();
        }, interval);
    }

    function playHeartbeat() {
        if (!ctx) return;
        
        const now = ctx.currentTime;
        
        // 第一拍
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.frequency.value = 50;
        gain1.gain.setValueAtTime(0.2, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(now);
        osc1.stop(now + 0.2);
        
        // 第二拍
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.frequency.value = 45;
        gain2.gain.setValueAtTime(0.15, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(now + 0.2);
        osc2.stop(now + 0.4);
    }

    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    }

    // 更新终局心跳速度
    function updateHeartbeat(week) {
        if (week >= 36) {
            startHeartbeat(week);
        } else {
            stopHeartbeat();
        }
    }

    // 恢复音频上下文（用户交互后）
    function resume() {
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }
    }

    // 静音切换
    function toggleMute() {
        if (!isInitialized) init();
        if (!ctx) return false;
        isMuted = !isMuted;
        if (masterGain) {
            masterGain.gain.setValueAtTime(isMuted ? 0 : sfxVolume * 0.3, ctx.currentTime);
        }
        // 同时静音 BGM
        if (bgmAudio) {
            bgmAudio.volume = isMuted ? 0 : bgmVolume * (bgmMuted ? 0 : 1);
        }
        return isMuted;
    }

    // 主音量控制
    function setVolume(value) {
        sfxVolume = Math.max(0, Math.min(1, value));
        if (masterGain && ctx) {
            masterGain.gain.setValueAtTime(sfxVolume * 0.3, ctx.currentTime);
        }
    }
    
    function setSFXVolume(value) {
        setVolume(value);
    }
    
    function toggleSFXMute() {
        sfxMuted = !sfxMuted;
        if (masterGain && ctx) {
            masterGain.gain.setValueAtTime(sfxVolume * 0.3 * (sfxMuted || globalMuted ? 0 : 1), ctx.currentTime);
        }
        return sfxMuted;
    }
    
    function toggleGlobalMute() {
        globalMuted = !globalMuted;
        if (globalMuted) {
            // 静音所有音频
            if (masterGain && ctx) {
                masterGain.gain.setValueAtTime(0, ctx.currentTime);
            }
            if (bgmAudio) {
                bgmAudio.volume = 0;
            }
        } else {
            // 恢复
            if (masterGain && ctx) {
                masterGain.gain.setValueAtTime(sfxVolume * 0.3 * (sfxMuted ? 0 : 1), ctx.currentTime);
            }
            if (bgmAudio && !bgmMuted) {
                bgmAudio.volume = bgmVolume * (bgmMuted ? 0 : 1);
            }
        }
        return globalMuted;
    }

    return {
        init,
        playArchiveChime,
        playAlertTone,
        playHeartbeatAlert,
        playShatterSound,
        playMechanicalEngage,
        playInstantArchive,
        playChainComplete,
        playGuardianEventTrigger,
        playSealSound,
        playProjectComplete,
        playExploreDeploy,
        playExploreReturnResource,
        playExploreReturnNarrative,
        playExploreReturnRisk,
        playSceneSound,
        playVNOpen,
        playVNAdvance,
        playVNSkipConfirm,
        playVNSkip,
        playVNCancel,
        playVNClose,
        playButtonClick,
        updateDroneByEnergy,
        updateHeartbeat,
        resume,
        toggleMute,
        setVolume,
        setSFXVolume,
        toggleSFXMute,
        toggleGlobalMute,
        // BGM 系统
        playBGM,
        playBGMSync,
        stopBGM,
        setBGMVolume,
        toggleBGMMute,
        getCurrentBGM,
        getGameBGMForWeek,
        tryPlayBGMAfterInteraction,
        get isMuted() { return isMuted; },
        get isReady() { return isInitialized; },
        get isBGMMuted() { return bgmMuted; },
        get bgmVolumeLevel() { return bgmVolume; }
    };
})();
