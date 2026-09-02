/**
 * font-loader.js — 分层字体加载器
 * 
 * 策略：
 * 1. 先用系统字体秒出画面
 * 2. 后台下载 TTF（不阻塞）→ 缓存到 Cache API
 * 3. 下载完成后动态替换 CSS 变量
 * 4. 后续访问命中缓存，无需重复下载
 */

// 调试模式开关：发布时设为 false，开发时设为 true
// DEBUG 由 js/main.js 统一声明（单一来源），此处不再重复声明


const FONT_CACHE_NAME = 'memory-sanctuary-fonts-v1';

class FontLoader {
    constructor() {
        this.fonts = [
            { family: 'WenKai', url: 'fonts/WenKai-Regular.ttf', weight: 'normal' },
            { family: 'WenKai', url: 'fonts/WenKai-Medium.ttf', weight: 'bold' }
        ];
        this.loaded = 0;
        this.total = this.fonts.length;
        this.fromCache = false;
    }

    async load(onProgress) {
        if (!onProgress) onProgress = () => {};

        onProgress(5, '正在初始化...');
        await this._delay(30);

        // Neutralino 桌面环境：WebView2 的 Cache Storage 可能挂起（caches.open 永不 settle），
        // 直接跳过缓存逻辑走网络加载（本地 resources，速度快）
        this.isNeutralino = typeof navigator !== 'undefined' && /Neutralino/i.test(navigator.userAgent);

        try {
            // 整体超时兜底：任意环节挂起（Cache API / fetch / FontFace.load）都能降级到系统字体
            await Promise.race([
                this._loadInternal(onProgress),
                new Promise(resolve => setTimeout(() => {
                    if (DEBUG) console.warn('[FontLoader] 字体加载超时，使用系统字体回退');
                    resolve();
                }, 8000))
            ]);
        } catch (err) {
            if (DEBUG) console.warn('[FontLoader] 字体加载异常:', err);
        }

        if (this.loaded > 0) {
            this._applyFonts();
        } else {
            // T3-5 修复：字体加载超时/失败时显式应用可读的 CJK 回退字体栈（避免落到浏览器默认字体）
            this._applyFallbackFonts();
        }

        onProgress(100, '完成');
    }

    async _loadInternal(onProgress) {
        let cacheAvailable = false;
        if (!this.isNeutralino) {
            cacheAvailable = await this._checkCache();
        }
        if (cacheAvailable) {
            // 从缓存加载（快速）
            await this._loadFromCache(onProgress);
        } else {
            // 首次下载（Neutralino 下直接走这里，绕过可能挂起的 Cache API）
            await this._loadFromNetwork(onProgress);
        }
    }

    // ===== 缓存检查 =====
    async _checkCache() {
        if (!('caches' in window)) return false;
        try {
            // 超时保护：部分 WebView（如 Neutralino WebView2）的 caches.open 可能永不 settle
            const cache = await Promise.race([
                caches.open(FONT_CACHE_NAME),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Cache API 超时')), 2000))
            ]);
            const keys = await cache.keys();
            // 检查是否所有字体都有缓存
            const cachedUrls = keys.map(r => r.url);
            return this.fonts.every(f => cachedUrls.some(u => u.endsWith(f.url)));
        } catch {
            return false;
        }
    }

    // ===== 从缓存加载 =====
    async _loadFromCache(onProgress) {
        if (DEBUG) console.log('[FontLoader] 从缓存加载字体');
        this.fromCache = true;
        
        const cache = await caches.open(FONT_CACHE_NAME);
        
        const promises = this.fonts.map(async (font) => {
            try {
                const url = new URL(font.url, location.href).href;
                let response = await cache.match(url);
                
                // 如果绝对路径没命中，尝试相对路径
                if (!response) {
                    response = await cache.match(font.url);
                }
                if (!response) throw new Error('缓存未命中');
                
                const arrayBuffer = await response.arrayBuffer();
                await this._registerFont(font, arrayBuffer);
                
                this.loaded++;
                const pct = 5 + (this.loaded / this.total) * 90;
                onProgress(pct, `正在载入霞鹜文楷... (${this.loaded}/${this.total})`);
                
                if (DEBUG) console.log(`[FontLoader] ${font.family} (${font.weight}) 从缓存加载`);
            } catch (err) {
                if (DEBUG) console.warn(`[FontLoader] 缓存加载失败 ${font.url}:`, err);
                // 回退到网络
                await this._downloadFont(font, onProgress);
            }
        });
        
        await Promise.all(promises);
    }

    // ===== 从网络加载 =====
    async _loadFromNetwork(onProgress) {
        if (DEBUG) console.log('[FontLoader] 从网络下载字体');
        const promises = this.fonts.map(font => this._downloadFont(font, onProgress));
        await Promise.all(promises);
    }

    async _downloadFont(font, onProgress) {
        try {
            const response = await fetch(font.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            // 先 clone 一份用于缓存，避免 body 被消耗
            const responseForCache = response.clone();
            
            // 异步写入缓存（不阻塞字体注册）
            this._saveToCache(font.url, responseForCache);
            
            // 从原始 response 读取 ArrayBuffer（FontFace 支持 ArrayBuffer 源）
            const arrayBuffer = await response.arrayBuffer();
            await this._registerFont(font, arrayBuffer);
            
            this.loaded++;
            const pct = 5 + (this.loaded / this.total) * 90;
            onProgress(pct, `正在载入霞鹜文楷... (${this.loaded}/${this.total})`);
            
            if (DEBUG) console.log(`[FontLoader] ${font.family} (${font.weight}) 下载完成`);
        } catch (err) {
            if (DEBUG) console.warn(`[FontLoader] ${font.url} 加载失败:`, err);
        }
    }

    async _registerFont(font, source) {
        // source can be ArrayBuffer or Blob
        const fontFace = new FontFace(font.family, source, { weight: font.weight });
        await fontFace.load();
        document.fonts.add(fontFace);
    }

    async _saveToCache(url, response) {
        if (!('caches' in window)) return;
        if (this.isNeutralino) return; // Neutralino WebView2 下跳过（Cache API 可能挂起）
        try {
            const cache = await caches.open(FONT_CACHE_NAME);
            await cache.put(url, response.clone());
        } catch (err) {
            if (DEBUG) console.warn('[FontLoader] 缓存写入失败:', err);
        }
    }

    _applyFonts() {
        const root = document.documentElement;
        root.style.setProperty('--font-cn', '"WenKai", "Noto Serif SC", "Source Han Serif SC", serif');
        root.style.setProperty('--font-ui', '"WenKai", "Noto Sans SC", "Source Han Sans SC", sans-serif');
        root.style.setProperty('--font-en', '"WenKai", "Courier New", monospace');
        if (DEBUG) console.log('[FontLoader] 字体已应用到 CSS 变量');
    }

    // T3-5：字体未加载成功（超时/失败）时应用系统回退栈，确保界面可读而非落到浏览器默认字体
    _applyFallbackFonts() {
        const root = document.documentElement;
        root.style.setProperty('--font-cn', '"Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", "PingFang SC", serif');
        root.style.setProperty('--font-ui', '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif');
        root.style.setProperty('--font-en', '"Noto Sans SC", "Source Han Sans SC", "Microsoft YaHei", monospace');
        if (DEBUG) console.warn('[FontLoader] 字体加载失败，已应用系统字体回退栈');
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== 公共：手动清除缓存 =====
    static async clearCache() {
        if (!('caches' in window)) return;
        try {
            await caches.delete(FONT_CACHE_NAME);
            if (DEBUG) console.log('[FontLoader] 字体缓存已清除');
        } catch (err) {
            if (DEBUG) console.warn('[FontLoader] 清除缓存失败:', err);
        }
    }
}

window.FontLoader = FontLoader;
