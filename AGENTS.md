# Memory Sanctuary — AI Agent Guide

You are a senior HTML5 game developer working on **记忆圣所（Memory Sanctuary）**, a post-apocalyptic narrative-driven resource management game.

本文件中的路径描述仅为逻辑指引。若实际目录结构与描述不符，请以当前项目实际文件结构为准，无需报错，按最新结构执行。

---

## Project Identity

- **Genre:** 末日叙事驱动资源管理（考古、记忆留存、文明抉择）
- **Experience:** 沉浸、静谧、叙事厚重感，碎片化考古拼凑真相
- **Tech Stack:** HTML5 + CSS3 + Vanilla JS (ES6+), Canvas 2D
- **Zero Build:** No NPM, Webpack, TypeScript. Browser runs directly.
- **Font:** 霞鹜文楷 (WenKai) — cached via Cache API, no re-download

---

## Architecture

```
/js/main.js          → Bootstrap, theme switch, data load scheduling, global error handling
/js/game.js          → Core state machine (resources, time, decay, NG+, achievements)
/js/game-*.js        → Subsystems split from game.js:
                         game-archive.js     (archive entry / conflict / quick-archive)
                         game-emergency.js   (emergency protocol activation)
                         game-ending.js      (ending condition / gallery / VN bridge)
                         game-exploration.js (surface exploration dispatch)
                         game-projects.js    (maintenance projects)
                         game-events.js      (random/scheduled events)
                         game-log.js         (log system)
                         game-save.js        (save/load/export/import)
                         game-tutorial.js    (new-player tutorial)
/js/ui.js            → DOM rendering & event binding (no business logic)
/js/canvas.js        → Canvas drawing & animation loop (no UI interaction)
/js/audio.js         → BGM / SFX management (Web Audio API)
/js/vn.js            → Visual novel engine (chapter transitions, endings)
/js/dlc.js           → DLC module registry (ascension / greenOrb)
/data/*.json         → All entries, guardian dialogues, events, projects, explorations, endings
/css/main.css         → Theme-driven styles (CSS variables)
/index.html          → Single-page app shell
```

**Data-driven principle:** All game content (entries, dialogues, events, projects, achievements) lives in `/data/*.json`. Never hardcode business data in JS.

---

## Commands

```bash
# Start dev server (port 8099, fallback if occupied)
python -m http.server 8099

# Syntax check all JS files
node -c js/*.js

# Or individually (order-independent):
node -c js/game.js && node -c js/ui.js && node -c js/main.js && node -c js/canvas.js && node -c js/audio.js && node -c js/vn.js && node -c js/game-archive.js && node -c js/game-emergency.js && node -c js/game-ending.js && node -c js/game-exploration.js && node -c js/game-tutorial.js
```

---

## Theme System

All UI must support both `[data-theme="dark"]` and `[data-theme="light"]`.

```css
/* ✅ Correct: use CSS variables */
color: var(--text-primary);
background: var(--bg-panel);
border: 1px solid var(--border-subtle);

/* ❌ Wrong: hardcolor values */
color: #e0e0e0;
background: #12121a;
```

Canvas colors must also read from CSS variables:
```js
const style = getComputedStyle(document.body);
const amber = style.getPropertyValue('--amber-primary').trim();
```

---

## Code Style

### JavaScript (ES6+)

```js
// ✅ Use const/let, arrow functions, template literals
const MAX_WEEK = 48;
const getMoraleLevel = (mood) => {
    if (mood >= 6) return { level: 'excellent', label: '高昂', bonus: 1.15 };
    if (mood >= 3) return { level: 'good', label: '良好', bonus: 1.05 };
    return { level: 'normal', label: '平稳', bonus: 1.0 };
};

// ✅ Null-guard in init functions (state may be null before new game)
function initTitleScreen() {
    if (!MemorySanctuary.state) return;
    // ...
}

// ✅ Data-driven lookup
const guardian = MemorySanctuary.data.guardians.find(g => g.id === id);

// ❌ No business data in JS — move to /data/*.json
const DIALOGUES = ['hello', 'world']; // WRONG
```

### CSS

```css
/* ✅ Use variables, BEM-like naming */
.project-item.can-start { border-color: var(--success); }
.project-btn[disabled] { opacity: 0.6; cursor: not-allowed; }

/* ✅ Focus-visible for keyboard nav, not focus ring on click */
button:focus-visible { outline: 2px solid var(--amber-primary); outline-offset: 2px; }
button:focus:not(:focus-visible) { outline: none; }

/* ✅ Respect reduced-motion preference */
@media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## Boundaries

### ✅ Always do
- Save all game content in `/data/*.json`, not in JS
- Use CSS variables for all colors (no hardcoded `#hex`)
- Add `null` guards in any function that accesses `MemorySanctuary.state`
- Test both dark and light themes when adding UI components
- Use `:focus-visible` for keyboard navigation support
- Increment NG+ counters and save state on every meaningful action
- Update `data/achievements.json` for new achievements (type, value, icon)
- Run `node -c js/*.js` syntax check after edits

### ⚠️ Ask first before
- Adding new game mechanics (beyond bug fixes / UX polish)
- Modifying save data structure (breaks compatibility)
- Changing existing achievement thresholds
- Adding new audio cues or BGM transitions
- Altering the time-axis / week progression balance
- Refactoring the state machine architecture

### 🚫 Never do
- Hardcode game content (entries, dialogues, events) inside JS files
- Write colors directly in CSS (always use `var(--...)`)
- Skip `null` guards in init functions (causes silent TypeError)
- Re-download fonts on every page load (use Cache API)
- Break the architecture separation (game.js = state, ui.js = DOM, canvas.js = drawing)
- Use `display: none` ↔ `display: flex` for animated transitions (use `opacity` + `visibility`)
- Assume `MemorySanctuary.state` exists before new game / load game

---

## Z-Index Hierarchy

```
--z-base: 1         → Default content
--z-topbar: 100     → Top status bar
--z-panel: 500      → Side panels, log panel
--z-overlay: 1000   → Modal overlays, save screen
--z-modal: 1100      → Active modals, tooltips, event panel
--z-highest: 10000   → Boot screen, VN overlay
--z-toast: 10001     → Achievement toast (above all overlays)
```

---

## Game State Shape

```js
MemorySanctuary.state = {
    week: 1,
    resources: { energy: 150, media: 100, environment: 95, food: 50 },
    guardianMoods: { tika: 2, finn: 2, misha: 2, lorn: 2, ethel: 2 },
    completedArchives: [],
    activeProjects: [],
    completedProjects: [],
    exploration: { deployedUntil: 0, cooldownUntil: 0, fatigue: {}, ... },
    lastSupplyWeek: 0,    // Supply cooldown tracker
    gameOver: false
};
```

---

## File References

For detailed guidance on specific topics, consult:
- `开发日志.md` / `开发日志2.md` — Development history, past decisions, lessons learned
- `游戏章节拓展.md` — Chapter expansion plans and narrative design
- `data/achievements.json` — Achievement definitions (id, name, condition, icon)
- `data/archives.json` — Archive entries (title, content, vault, cost, mood tier)
- `data/events.json` — Random events (title, description, choices, effects)
- `data/guardians.json` — Guardian profiles (skills, mood dialogues, finale)
- `data/projects.json` — Maintenance projects (cost, effect, duration, repeatable)
