#!/usr/bin/env node
// 把一批「AI 觀念卡」加進 concepts.json。
// 用法: node tools/add-concepts.mjs <new.json> [--dry-run]
//   new.json = 卡片陣列。每張必填 title/body;選填 level/subject/chapter。
import fs from 'node:fs';

const [, , inPath, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');
if (!inPath) { console.error('用法: node tools/add-concepts.mjs <new.json> [--dry-run]'); process.exit(1); }

const FILE = new URL('../concepts.json', import.meta.url).pathname;
const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { cards: [] };
data.cards ||= [];
const incoming = JSON.parse(fs.readFileSync(inPath, 'utf8'));
if (!Array.isArray(incoming)) { console.error('輸入要是卡片陣列 []'); process.exit(1); }

const norm = (s) => String(s || '').replace(/\s/g, '');
const seen = new Set(data.cards.map((c) => norm(c.title)));
const added = [], skipped = [], errors = [];
for (const [i, raw] of incoming.entries()) {
  const where = `第 ${i + 1} 張`;
  if (!raw.title || !raw.body) { errors.push(`${where}: 缺 title 或 body`); continue; }
  if (seen.has(norm(raw.title))) { skipped.push(`${where}: 標題「${raw.title}」重複,略過`); continue; }
  seen.add(norm(raw.title));
  added.push({ level: raw.level || '', subject: raw.subject || '', chapter: raw.chapter || '', title: raw.title, body: raw.body });
}

console.log(`可加入: ${added.length}  重複略過: ${skipped.length}  錯誤: ${errors.length}`);
skipped.forEach((s) => console.log('  - ' + s));
errors.forEach((e) => console.log('  ✗ ' + e));
if (errors.length) { console.error('\n有錯誤,未寫入。'); process.exit(1); }
if (dryRun) { console.log('\n--dry-run:未寫入。'); process.exit(0); }
if (!added.length) { console.log('沒有新卡可加。'); process.exit(0); }

data.cards.push(...added);
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
JSON.parse(fs.readFileSync(FILE, 'utf8'));
console.log(`\n已加入 ${added.length} 張,concepts.json 共 ${data.cards.length} 張。記得 bump sw.js 的 CACHE 版號。`);
