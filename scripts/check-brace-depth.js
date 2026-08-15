// 简易花括号深度检查：定位 game.js 2360 行 override 是否在全局作用域
const fs = require('fs');
const lines = fs.readFileSync('js/game.js', 'utf-8').split('\n');
let depth = 0, inStr = null;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (inStr) {
            if (ch === '\\') { j++; continue; }
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '/' && line[j+1] === '/') break;
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
    }
    const ln = i + 1;
    if (ln === 2359) console.log(`line ${ln} (override 注释前) depth=${depth}`);
    if (ln === 2360) console.log(`line ${ln} (const _originalOnTimeAdvanced) depth=${depth}`);
    if (ln === 2361) console.log(`line ${ln} (onTimeAdvanced=...) depth=${depth}`);
    if (ln === 2378) console.log(`line ${ln} (override 结束) depth=${depth}`);
}
console.log('final depth =', depth);
