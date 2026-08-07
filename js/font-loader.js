/**
 * font-loader.js — 分层字体加载器
 * 
 * 策略：
 * 1. 先用系统字体秒出画面
 * 2. 后台下载 TTF（不阻塞）→ 缓存到 Cache API
 * 3. 下载完成后动态替换 CSS 变量
 * 4. 后续访问命中缓存，无需重复下载
 */

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

        // 检查缓存可用性
        const cacheAvailable = await this._checkCache();
        
        if (cacheAvailable) {
            // 从缓存加载（快速）
            await this._loadFromCache(onProgress);
        } else {
            // 首次下载并缓存
            await this._loadFromNetwork(onProgress);
        }

        if (this.loaded > 0) {
            this._applyFonts();
        }
        
        onProgress(100, '完成');
    }

    // ===== 缓存检查 =====
    async _checkCache() {
        if (!('caches' in window)) return false;
        try {
            const cache = await caches.open(FONT_CACHE_NAME);
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
        console.log('[FontLoader] 从缓存加载字体');
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
                
                console.log(`[FontLoader] ${font.family} (${font.weight}) 从缓存加载`);
            } catch (err) {
                console.warn(`[FontLoader] 缓存加载失败 ${font.url}:`, err);
                // 回退到网络
                await this._downloadFont(font, onProgress);
            }
        });
        
        await Promise.all(promises);
    }

    // ===== 从网络加载 =====
    async _loadFromNetwork(onProgress) {
        console.log('[FontLoader] 从网络下载字体');
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
            
            console.log(`[FontLoader] ${font.family} (${font.weight}) 下载完成`);
        } catch (err) {
            console.warn(`[FontLoader] ${font.url} 加载失败:`, err);
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
        try {
            const cache = await caches.open(FONT_CACHE_NAME);
            await cache.put(url, response.clone());
        } catch (err) {
            console.warn('[FontLoader] 缓存写入失败:', err);
        }
    }

    _applyFonts() {
        const root = document.documentElement;
        root.style.setProperty('--font-cn', '"WenKai", "Noto Serif SC", "Source Han Serif SC", serif');
        root.style.setProperty('--font-ui', '"WenKai", "Noto Sans SC", "Source Han Sans SC", sans-serif');
        root.style.setProperty('--font-en', '"WenKai", "Courier New", monospace');
        console.log('[FontLoader] 字体已应用到 CSS 变量');
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===== 公共：手动清除缓存 =====
    static async clearCache() {
        if (!('caches' in window)) return;
        try {
            await caches.delete(FONT_CACHE_NAME);
            console.log('[FontLoader] 字体缓存已清除');
        } catch (err) {
            console.warn('[FontLoader] 清除缓存失败:', err);
        }
    }
}

window.FontLoader = FontLoader;
