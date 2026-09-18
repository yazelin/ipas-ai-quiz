#!/usr/bin/env node
// 把一份 iPAS 公告試題 PDF 抽成 add-questions.mjs 吃得下的骨架(不含 explanation)。
//
//   node tools/extract-exam.mjs <pdf或網址> --level 初級 --round 115年第三次 --subject "科目1：人工智慧基礎概論" -o new.json
//
// 為什麼不是只跑一次 pdftotext:這份 PDF 有兩個會「靜默毀題」的坑,2026-09-18 加 115-3 時
// 逐字讀輸出才發現的,兩個都不會讓程式出錯,只會讓題目變成不能作答的樣子:
//
//   坑 1  `-layout` 的行序會亂,拿它重建題幹會出錯,而且看起來完全正常。
//         → 題幹與選項改用「不加 -layout」的原始閱讀順序重建,`-layout` 那份只拿最左欄的答案。
//   坑 2  頁尾「第 N 頁,共 15 頁」會被當成同一段插進句子中間,長成
//         「判斷零件表面是否存第 2 頁,共 15 頁在細微刮痕」。
//         → 解析階段濾掉,check-questions.mjs 也有一條硬檢查擋它。
//
// 答案一律取自 PDF 最左欄(官方答案),而且用兩支互相獨立的解析器對過才輸出:
//   欄位式:-layout 輸出的最左欄(靠空白欄位)
//   座標式:-bbox-layout 的 x 座標最左帶(靠座標)
//   ※ -bbox-layout 的 y 是「每頁重新算」的,跨頁比 y 會假報大量不一致。要分頁比。
// 再加第三重:段落內的孤立字母若不等於本題答案,必等於下一題答案(版面決定它印在哪);
// 出現「兩者都不是」就代表答案序列錯位,直接中止。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('-') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const outPath = opt('o', null) || args[args.indexOf('-o') + 1];
const level = opt('level', '初級');
const round = opt('round', null);
const subject = opt('subject', null);

if (!src || !round || !subject || !outPath) {
  console.error('用法: node tools/extract-exam.mjs <pdf或網址> --level 初級 --round 115年第三次 --subject "科目1：..." -o new.json');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'ipas-'));
const pdf = join(tmp, 'exam.pdf');
if (/^https?:/.test(src)) execFileSync('curl', ['-fsSL', src, '-o', pdf]);
else if (existsSync(src)) execFileSync('cp', [src, pdf]);
else { console.error('找不到:' + src); process.exit(1); }

const run = (a) => execFileSync('pdftotext', a, { encoding: 'utf8' });
run([...['-layout'], pdf, join(tmp, 'layout.txt')]);
run([pdf, join(tmp, 'flow.txt')]);
run(['-bbox-layout', pdf, join(tmp, 'bbox.xml')]);

const half = (c) => 'ABCD'['ＡＢＣＤ'.indexOf(c)] ?? c;

// ---- 答案:欄位式 ----
function answersByColumn(file) {
  const toks = [];
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const left = raw.slice(0, 11);
    if (!left.trim()) continue;
    const both = left.match(/^\s*([A-DＡ-Ｄ])\s+(\d{1,2})\.\s*$/);
    const num = left.match(/^\s{0,8}(\d{1,2})\.\s*$/);
    const ans = left.match(/^\s*([A-DＡ-Ｄ])\s*$/);
    if (both) toks.push({ k: 'A', v: half(both[1]) }, { k: 'N', v: +both[2] });
    else if (num) toks.push({ k: 'N', v: +num[1] });
    else if (ans) toks.push({ k: 'A', v: half(ans[1]) });
  }
  const m = new Map();
  toks.forEach((t, i) => {
    if (t.k !== 'N') return;
    const before = toks[i - 1]?.k === 'A' && !toks[i - 1].used ? toks[i - 1] : null;
    const after = toks[i + 1]?.k === 'A' && !toks[i + 1].used ? toks[i + 1] : null;
    const hit = before || after;
    if (hit) { hit.used = true; m.set(t.v, hit.v); }
  });
  return m;
}

// ---- 答案:座標式(獨立第二法;y 每頁重算,必須分頁比) ----
function answersByBbox(file) {
  const pages = readFileSync(file, 'utf8').split('<page ').slice(1);
  const ans = [], nums = [];
  pages.forEach((pg, p) => {
    for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)<\/word>/g)) {
      const w = { p, x: +m[1], y: +m[2], t: m[3] };
      if (/^[A-DＡ-Ｄ]$/.test(w.t)) ans.push(w);
      else if (/^\d{1,2}\.$/.test(w.t)) nums.push(w);
    }
  });
  const cut = ans.map((w) => w.x).sort((a, b) => a - b)[0] + 12;
  const A = ans.filter((w) => w.x <= cut), N = nums.filter((w) => w.x <= cut + 45);
  const m = new Map();
  for (const n of N) {
    let best = null, bd = 1e9;
    for (const a of A) { if (a.used || a.p !== n.p) continue; const d = Math.abs(a.y - n.y); if (d < bd) { bd = d; best = a; } }
    if (best && bd < 40) { best.used = true; m.set(+n.t.slice(0, -1), half(best.t)); }
  }
  return m;
}

const byCol = answersByColumn(join(tmp, 'layout.txt'));
const byBox = answersByBbox(join(tmp, 'bbox.xml'));
const mismatch = [...byCol.keys()].filter((k) => byCol.get(k) !== byBox.get(k));
if (mismatch.length) {
  console.error(`✗ 兩支解析器對答案不一致 ${mismatch.length} 題:` +
    mismatch.map((k) => `${k}(欄式${byCol.get(k)}/座標${byBox.get(k)})`).join(' '));
  console.error('  先確認是哪一支壞了再往下,不要挑一支相信。');
  process.exit(1);
}
console.log(`答案:欄位式與座標式各 ${byCol.size} / ${byBox.size} 題,不一致 0 題`);

// ---- 題幹與選項:用原始閱讀順序那份 ----
const JUNK = [/^[A-DＡ-Ｄ]$/, /^(答案|題目|一、選擇題)$/, /能力鑑定/, /^第[一二三]科[：:]/, /^考試日期[：:]/, /^[-－]?\s*\d+\s*[-－]?$/];
const stripFooter = (s) => s.replace(/第\s*\d+\s*頁[，,]\s*共\s*\d+\s*頁/g, '');   // 坑 2
// house style:夾純英數的括號用半形,夾中文的維持全形
const parens = (s) => s.replace(/（([^（）]*)）/g, (m, i) => (/[一-鿿]/.test(i) ? m : `(${i})`));
const clean = (s) => parens(stripFooter(s.replace(/\n/g, ''))).replace(/[；;]\s*$/, '')
  .replace(/([一-鿿])\s+(?=[一-鿿])/g, '$1').replace(/\s{2,}/g, ' ').trim();

const lines = readFileSync(join(tmp, 'flow.txt'), 'utf8').split('\n').map((l) => l.trim());
const marks = [];
let want = 1;
lines.forEach((l, i) => { const m = l.match(/^(\d{1,2})\.$/); if (m && +m[1] === want) { marks.push({ n: want, i }); want++; } });

const out = [], problems = [];
marks.forEach((mk, k) => {
  const body = lines.slice(mk.i + 1, k + 1 < marks.length ? marks[k + 1].i : lines.length)
    .filter((l) => l && !JUNK.some((re) => re.test(l)));
  const txt = body.join('\n');
  const idx = ['(A)', '(B)', '(C)', '(D)'].map((t) => txt.indexOf(t));
  if (idx.some((x) => x < 0) || idx.some((x, i) => i && x < idx[i - 1])) { problems.push(`第 ${mk.n} 題切不出四個選項`); return; }
  const a = byCol.get(mk.n);
  if (!a) { problems.push(`第 ${mk.n} 題沒有官方答案`); return; }
  out.push({
    level, round, subject,
    chapter: '', topic: '',                       // 留白,由人或 AI 依官方學習指引章節填
    question: clean(txt.slice(0, idx[0])),
    options: [clean(txt.slice(idx[0] + 3, idx[1])), clean(txt.slice(idx[1] + 3, idx[2])),
              clean(txt.slice(idx[2] + 3, idx[3])), clean(txt.slice(idx[3] + 3))],
    answer: 'ABCD'.indexOf(a),
    explanation: '',                               // 留白,自己寫(為何對 + 逐一駁錯項 + 核心記憶點)
  });
});

// 第三重:孤立字母不是本題答案就必須是下一題答案,出現「都不是」代表答案錯位
let stray = 0;
marks.forEach((mk, k) => {
  const body = lines.slice(mk.i + 1, k + 1 < marks.length ? marks[k + 1].i : lines.length);
  const ls = body.filter((l) => /^[A-DＡ-Ｄ]$/.test(l)).map((l) => half(l));
  if (ls.length !== 1) return;
  if (ls[0] !== byCol.get(mk.n) && ls[0] !== byCol.get(mk.n + 1)) { problems.push(`第 ${mk.n} 題孤立字母 ${ls[0]} 對不上本題或下一題的答案 — 答案可能錯位`); }
  else stray++;
});

rmSync(tmp, { recursive: true, force: true });
if (problems.length) { console.error('✗ ' + problems.join('\n✗ ')); process.exit(1); }
writeFileSync(outPath, JSON.stringify(out, null, 1) + '\n');
console.log(`題目:${out.length} 題;第三重(孤立字母)可比對 ${stray} 題,對不上 0 題`);
console.log(`已寫出 ${outPath}。接下來:填 chapter / topic / explanation,然後`);
console.log(`  node tools/add-questions.mjs ${outPath} --dry-run`);
console.log(`  node tools/check-questions.mjs`);
