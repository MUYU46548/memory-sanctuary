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

    // 延迟初始化（用户交互后）
    function init() {
        if (isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            ctx = new AudioContext();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.3;
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
            masterGain.gain.setValueAtTime(isMuted ? 0 : 0.3, ctx.currentTime);
        }
        return isMuted;
    }

    // 主音量控制
    function setVolume(value) {
        if (masterGain && ctx) {
            masterGain.gain.setValueAtTime(value * 0.3, ctx.currentTime);
        }
    }

    return {
        init,
        playArchiveChime,
        playAlertTone,
        playShatterSound,
        playMechanicalEngage,
        playExploreDeploy,
        playExploreReturnResource,
        playExploreReturnNarrative,
        playExploreReturnRisk,
        playSceneSound,
        updateDroneByEnergy,
        updateHeartbeat,
        resume,
        toggleMute,
        setVolume,
        get isMuted() { return isMuted; },
        get isReady() { return isInitialized; }
    };
})();
