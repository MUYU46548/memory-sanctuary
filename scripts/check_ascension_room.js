#!/usr/bin/env node
/**
 * 房间数据校验：观察点 → 话头 → 话题（三层）
 *
 *   node scripts/check_ascension_room.js                       # 全部房间
 *   node scripts/check_ascension_room.js data/dlc/ascension/rooms/living.json
 *
 * 七（房间）× 三幕都照同一形状写，所以每一份房间文件都必须能过这里。
 * 校验对象：data/dlc/ascension/rooms/*.json（升天之仪 3D 世界的房间层）。
 * 一次传多个文件时按「合并后的一本总账」校验——话头可以跨房间问人。
 * 不会替你判断文案好坏，只回答五件事：
 *   1. 数量对不对（观察点 / 话头 / 话题 / 对话段）
 *   2. 话头有没有断链（某人给你一个话头，却没有任何话题用得上它，或反之）
 *   3. 有没有问不到的层（模拟一个「全部看见、按最优顺序问」的玩家）
 *   4. 有没有指向不存在的人（thread.ask)
 *   5. 有没有孤儿文案（不存在的 thread / topic 引用）
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ── 收集文件：不带参数时校验全部房间 ──────────────────────
let files = process.argv.slice(2);
if (!files.length) {
    const dir = 'data/dlc/ascension/rooms';
    files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f))
        : [];
}
if (!files.length) {
    console.error('没有找到房间文件。');
    process.exit(1);
}

const rooms = files.map(f => ({ file: f, data: JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) }));

const errors = [];
const warns = [];

// ── 合并成一本总账（世界就是这么装的：话头可以跨房间问人）──
const book = { props: [], threads: {}, npcs: {} };
rooms.forEach(r => {
    (r.data.props || []).forEach(p => book.props.push({ ...p, _room: r.data.title || r.data.id }));
    Object.assign(book.threads, r.data.threads || {});
    Object.assign(book.npcs, r.data.npcs || {});
});

const props = book.props;
const npcIds = Object.keys(book.npcs);
const threads = book.threads;

// ── 收集全部观察点 ─────────────────────────────────────
const obs = [];
props.forEach(p => (p.obs || []).forEach(o => obs.push({ ...o, where: p.name })));
npcIds.forEach(id => {
  const n = book.npcs[id];
  (n.obs || []).forEach(o => obs.push({ ...o, where: n.name }));
});

// ── 收集全部话题与层 ───────────────────────────────────
const topics = [];
npcIds.forEach(id => (book.npcs[id].topics || []).forEach(t => topics.push({ ...t, npc: id })));
const tiers = [];
topics.forEach(t => t.tiers.forEach((tier, i) => tiers.push({ topic: t.id, npc: t.npc, index: i, tier })));

// ── 1. 断链 ───────────────────────────────────────────
const grantedByObs = new Set(obs.filter(o => o.thread).map(o => o.thread));
const grantedByTopic = new Set();
tiers.forEach(t => (t.tier.grants || []).forEach(g => grantedByTopic.add(g)));
const needed = new Set();
tiers.forEach(t => {
  (t.tier.need || []).forEach(n => needed.add(n));
  (t.tier.bonus || []).forEach(b => (b.need || []).forEach(n => needed.add(n)));
});

obs.forEach(o => {
  if (o.thread && !threads[o.thread]) errors.push(`观察点 ${o.where} · ${o.label} 指向不存在的话头 ${o.thread}`);
});
Object.keys(threads).forEach(id => {
  const ask = threads[id].ask;
  if (ask && !book.npcs[ask]) errors.push(`话头 ${id} 指向不存在的人 ${ask}`);
});
[...grantedByTopic].forEach(g => {
  if (!threads[g]) errors.push(`话题发放了不存在的话头 ${g}`);
});
[...grantedByObs, ...grantedByTopic].forEach(g => {
  if (!needed.has(g)) warns.push(`话头 ${g}（${threads[g] ? threads[g].label : '?'}）没有任何话题用得上——玩家拿到它却没人可问`);
});
[...needed].forEach(n => {
  if (!grantedByObs.has(n) && !grantedByTopic.has(n)) errors.push(`话题需要的话头 ${n} 永远拿不到`);
});

// ── 2. 模拟：看见全部 → 反复问，直到问不动 ─────────────
const held = new Set(grantedByObs);
const asked = {};
let changed = true;
let guard = 0;
while (changed && guard++ < 200) {
  changed = false;
  tiers.forEach(t => {
    const prev = asked[t.topic] === undefined ? -1 : asked[t.topic];
    if (t.tier.after !== undefined && prev < t.tier.after) return;
    if (!(t.tier.need || []).every(n => held.has(n))) return;
    if (t.index > prev) { asked[t.topic] = t.index; changed = true; }
    (t.tier.grants || []).forEach(g => { if (!held.has(g)) { held.add(g); changed = true; } });
  });
}

const unreached = tiers.filter(t => (asked[t.topic] === undefined || asked[t.topic] < t.index));
unreached.forEach(t => errors.push(`问不到的层：${t.topic} 第 ${t.index} 层（需要 ${(t.tier.need || []).join(' + ') || '无'}${t.tier.after !== undefined ? `，且先问过第 ${t.tier.after} 层` : ''}）`));

// ── 3. 报表 ───────────────────────────────────────────
console.log(`房间 ${rooms.length} 间：` +
    rooms.map(r => `${r.data.title || r.data.id}（第 ${r.data.act || '?'} 幕）`).join('　·　'));
rooms.forEach(r => {
    const nObs = (r.data.props || []).reduce((n, p) => n + (p.obs || []).length, 0)
        + Object.keys(r.data.npcs || {}).reduce((n, id) => n + ((r.data.npcs[id].obs || []).length), 0);
    const nTier = Object.keys(r.data.npcs || {}).reduce((n, id) =>
        n + ((r.data.npcs[id].topics || []).reduce((m, t) => m + t.tiers.length, 0)), 0);
    console.log(`  ${(r.data.title || r.data.id).padEnd(5)} 物件 ${String((r.data.props || []).length).padStart(2)}` +
        `　观察点 ${String(nObs).padStart(2)}　话头 ${String(Object.keys(r.data.threads || {}).length).padStart(2)}` +
        `　人 ${String(Object.keys(r.data.npcs || {}).length).padStart(2)}　对话段 ${String(nTier).padStart(2)}`);
});
console.log(`\n合并后：观察点 ${obs.length}　话头 ${Object.keys(threads).length}　话题 ${topics.length}　对话段 ${tiers.length}`);
topics.forEach(t => {
    const got = (asked[t.id] === undefined ? -1 : asked[t.id]) + 1;
    const mark = got === t.tiers.length ? '' : `  ← 只到第 ${got} 层`;
    console.log(`  ${t.id.padEnd(9)} ${book.npcs[t.npc].name} · ${t.label} — ${got}/${t.tiers.length}${mark}`);
});

const texture = obs.filter(o => !o.thread).length;
console.log(`只有描写、不给话头的观察点：${texture} / ${obs.length}（让这个地方存在的那一批）`);

// ── 4. 结论 ───────────────────────────────────────────
console.log('');
if (warns.length) { console.log('提醒：'); warns.forEach(w => console.log('  · ' + w)); }
if (errors.length) {
  console.log('错误：');
  errors.forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('✓ 通过：没有断链的话头，没有问不到的层，没有指向不存在的人。');
