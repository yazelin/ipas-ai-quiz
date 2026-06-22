#!/usr/bin/env node
// 把一批題目安全加進 questions.json。
// 用法: node tools/add-questions.mjs <new.json> [--dry-run]
//   new.json = 題目陣列。每題必填 level/round/subject/question/options(4)/answer。
//   answer 可填 0-3 或 "A"/"B"/"C"/"D"。chapter/topic/explanation/image 選填。
//   id 可不填(自動依 梯次-級別-科-序 產生);填了就沿用並檢查唯一。
import fs from 'node:fs';

const [, , inPath, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');
if (!inPath) { console.error('用法: node tools/add-questions.mjs <new.json> [--dry-run]'); process.exit(1); }

const QFILE = new URL('../questions.json', import.meta.url).pathname;
const data = JSON.parse(fs.readFileSync(QFILE, 'utf8'));
const incoming = JSON.parse(fs.readFileSync(inPath, 'utf8'));
if (!Array.isArray(incoming)) { console.error('輸入要是題目陣列 []'); process.exit(1); }

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const num = (s) => { const m = String(s).match(/[0-9]+/); if (m) return +m[0]; for (const c of String(s)) if (CN[c]) return CN[c]; return null; };
function deriveCode(q) {
  const lv = q.level && q.level.includes('中') ? 'm' : 'b';
  const ym = (q.round || '').match(/(\d+)\s*年/); const tm = num((q.round || '').replace(/.*第/, ''));
  const sj = num((q.subject || '').replace(/.*科目|.*第/, ''));
  if (!ym || tm == null || sj == null) return null;
  return `${ym[1]}-${tm}-${lv}-s${sj}`;
}
const norm = (s) => String(s).replace(/\s/g, '');
const seenQ = new Set(data.questions.map((q) => norm(q.question)));
const usedId = new Set(data.questions.map((q) => q.id));
const nextIdx = {}; // prefix -> 下一個 q 序號
for (const q of data.questions) { const m = (q.id || '').match(/^(.*)-q(\d+)$/); if (m) nextIdx[m[1]] = Math.max(nextIdx[m[1]] || 0, +m[2]); }

const added = [], skipped = [], errors = [];
for (const [i, raw] of incoming.entries()) {
  const where = `第 ${i + 1} 筆`;
  const q = { ...raw };
  // 必填
  for (const f of ['level', 'round', 'subject', 'question', 'options']) if (!q[f]) { errors.push(`${where}: 缺 ${f}`); }
  if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${where}: options 必須剛好 4 個`);
  // answer 正規化(letter -> index)
  if (typeof q.answer === 'string') { const idx = 'ABCD'.indexOf(q.answer.trim().toUpperCase()); if (idx >= 0) q.answer = idx; }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) errors.push(`${where}: answer 要是 0-3 或 A-D`);
  if (errors.some((e) => e.startsWith(where))) continue;
  // 去重
  if (seenQ.has(norm(q.question))) { skipped.push(`${where}: 題幹重複,略過`); continue; }
  // id
  if (q.id) { if (usedId.has(q.id)) { errors.push(`${where}: id「${q.id}」已存在`); continue; } }
  else {
    const code = deriveCode(q);
    if (!code) { errors.push(`${where}: 無法從 level/round/subject 推 id,請手動給 id`); continue; }
    nextIdx[code] = (nextIdx[code] || 0) + 1;
    q.id = `${code}-q${nextIdx[code]}`;
  }
  if (!q.chapter) q.chapter = q.subject; // 沒章節就退回科目當範圍
  if (!q.explanation) q.explanation = '';
  seenQ.add(norm(q.question)); usedId.add(q.id);
  added.push(q);
}

console.log(`可加入: ${added.length}  重複略過: ${skipped.length}  錯誤: ${errors.length}`);
skipped.forEach((s) => console.log('  - ' + s));
errors.forEach((e) => console.log('  ✗ ' + e));
if (errors.length) { console.error('\n有錯誤,未寫入。修正後再跑。'); process.exit(1); }
if (dryRun) { console.log('\n--dry-run:未寫入。'); process.exit(0); }
if (!added.length) { console.log('沒有新題可加。'); process.exit(0); }

data.questions.push(...added);
fs.writeFileSync(QFILE, JSON.stringify(data, null, 2) + '\n');
JSON.parse(fs.readFileSync(QFILE, 'utf8')); // 自我驗證仍是合法 JSON
console.log(`\n已加入 ${added.length} 題,questions.json 共 ${data.questions.length} 題。`);
console.log('提醒:若有帶圖題請把圖放 assets/ 並在該題填 image;改了題庫記得 bump sw.js 的 CACHE 版號。');
