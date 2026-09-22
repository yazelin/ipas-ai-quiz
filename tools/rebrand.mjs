#!/usr/bin/env node
// 把這個 repo 換裝成你自己的刷題站:一行指令取代十五處手動修改。
//
//   node tools/rebrand.mjs --name "台灣汽車駕照筆試" --repo 你的帳號/你的repo
//   node tools/rebrand.mjs --name "…" --repo … --desc "一句話說明" --short "手機App名稱" --keep-sync
//
// 最重要的一項是 STORE_KEY:GitHub Pages 同一個帳號底下所有站共用一個 origin,
// localStorage 也就共用。沿用原站的 key,你的站會讀到、也會污染原站的進度,
// 而且會把對方的資料 PUT 到你的 Worker。2026-09-22 在示範站上實測撞過。
//
// 為什麼要有這支:那十五處只有一處(孤兒圖)會被 check-questions 擋下來,
// 其餘十四處改漏了畫面上完全正常,你不會自己發現。最毒的是 canonical——
// 沒換等於告訴 Google 你這頁是原站的複本,你的站永遠不會被收錄。
// 這種「漏了也看不出來」的清單就該由程式跑,不該印成文件叫人照著改。
//
// 跑完接著:
//   node tools/check-questions.mjs && node core.test.mjs
//   gh repo create <你的repo> --public --source=. --push
//   gh api -X POST repos/<你的repo>/pages -f 'source[branch]=main' -f 'source[path]=/'

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d = null) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);

const NAME = opt('name');
const REPO = opt('repo');                       // 形如 yourname/yourrepo
if (!NAME || !REPO || !/^[^/]+\/[^/]+$/.test(REPO)) {
  console.error('用法: node tools/rebrand.mjs --name "站名" --repo 帳號/repo [--desc "說明"] [--short "App名"] [--keep-sync] [--keep-images] [--dry-run]');
  process.exit(1);
}
const [OWNER, REPONAME] = REPO.split('/');
const SHORT = opt('short', NAME.slice(0, 6));
const DESC = opt('desc', `${NAME}線上模擬考。練習、計時模擬考、錯題本、弱點統計，免費免登入、可離線、可裝到手機。`);
const SITE = `https://${OWNER}.github.io/${REPONAME}/`;
const dry = flag('dry-run');
// 儲存命名空間用的短代號:只留英數與連字號
const SLUG = (REPONAME.replace(/[^a-z0-9-]/gi, '') || 'quiz').toLowerCase();

const OLD_SITE = 'https://yazelin.github.io/ipas-ai-quiz/';
const OLD_REPO = 'yazelin/ipas-ai-quiz';

const changes = [];           // {file, what}
const readIf = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);
function write(f, before, after, what) {
  if (before === after) return;
  changes.push({ file: f, what });
  if (!dry) writeFileSync(f, after);
}

// ---- index.html:站名、SEO、分享卡、連結 ----
{
  const f = 'index.html';
  let s = readIf(f);
  if (!s) { console.error('要在 repo 根目錄跑'); process.exit(1); }
  const before = s;
  s = s.replace(/<title>[^<]*<\/title>/, `<title>${NAME}</title>`);
  s = s.replace(/(<meta name="description" content=")[^"]*(")/, `$1${DESC}$2`);
  s = s.replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${SHORT}$2`);
  s = s.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${NAME}$2`);
  s = s.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESC}$2`);
  s = s.replace(/(<h1 id="title">)[^<]*(<\/h1>)/, `$1${NAME}$2`);
  // canonical / og:url / og:image:沒換等於把 SEO 讓給原站
  s = s.split(OLD_SITE).join(SITE);
  s = s.split(OLD_REPO).join(REPO);
  s = s.replace(/var REPO="[^"]*"/, `var REPO="${REPONAME}"`);
  // promo footer 的開站計數:不換的話你的流量會算到原站頭上
  s = s.replace(/(\/hit\?s=)[a-z0-9_-]+/gi, `$1${REPONAME}`);
  write(f, before, s, '站名、description、og、canonical、回報與 footer 連結、promo REPO');
}

// ---- 其他有寫死網址的檔 ----
for (const f of ['robots.txt', 'sitemap.xml', 'build.html', 'README.md']) {
  const s = readIf(f); if (s === null) continue;
  const out = s.split(OLD_SITE).join(SITE).split(OLD_REPO).join(REPO).split('ipas-ai-quiz').join(REPONAME);
  write(f, s, out, '寫死的原站網址');
}

// ---- 藏在程式裡的預設字串:使用者做了那個動作才會露出來 ----
{
  const f = 'core.js'; const s = readIf(f);
  if (s) write(f, s, s.replace(/title = '[^']*'/, `title = '${NAME}筆記'`), '匯出筆記的預設標題');
}
{
  const f = 'sw.js'; let s = readIf(f);
  if (s) {
    const before = s;
    s = s.replace(/title: '[^']*'/, `title: '${NAME}'`);
    // 快取前綴換成自己的,才不會跟同 origin 的其他站互相清掉
    const slug = SLUG;
    s = s.replace(/const CACHE = "[^"]*"/, `const CACHE = "${slug}-v1"`);
    s = s.replace(/k\.startsWith\('[^']*'\)/, `k.startsWith('${slug}-')`);
    write(f, before, s, '推播通知標題、快取前綴');
  }
}

// ---- app.js:儲存命名空間、SYNC_URL、匯出檔名、回報連結 ----
{
  const f = 'app.js'; let s = readIf(f);
  if (s) {
    const before = s;
    // 同一個 github.io 帳號下所有站共用 origin,沿用原 key 會互相覆蓋進度
    s = s.replace(/const STORE_KEY = '[^']*'/, `const STORE_KEY = '${SLUG}_progress'`);
    s = s.split("'ipas_installbar_off'").join(`'${SLUG}_installbar_off'`);
    s = s.split("'ipas-progress.json'").join(`'${SLUG}-progress.json'`);
    s = s.split("'ipas-notes.md'").join(`'${SLUG}-notes.md'`);
    s = s.split(OLD_REPO).join(REPO);          // 每題「這題有誤?」的 issue 連結
    if (!flag('keep-sync')) s = s.replace(/^const SYNC_URL = .*$/m,
      "const SYNC_URL = ''; // 要跨裝置同步再填自己的 Worker 網址,留空則同步與推播自動停用");
    write(f, before, s, `STORE_KEY→${SLUG}_progress、匯出檔名、回報連結` + (flag('keep-sync') ? '' : '、SYNC_URL 清空'));
  }
}

// ---- manifest.json:裝到手機後的 App 名稱 ----
{
  const f = 'manifest.json'; const s = readIf(f);
  if (s) {
    try {
      const m = JSON.parse(s);
      m.name = NAME; m.short_name = SHORT; m.description = DESC;
      write(f, s, JSON.stringify(m, null, 2) + '\n', 'PWA 的 name / short_name / description');
    } catch { console.error('⚠ manifest.json 不是合法 JSON,略過'); }
  }
}

// ---- 原站的「內容」檔:不清掉會在你的站上冒出跟你無關的東西 ----
//   concepts.json  64 張 iPAS 的 AI 觀念卡。不清的話駕照站每天會跳一張「弱 AI 與強 AI」。
//   exam-dates.json iPAS 的考試日期。不清的話首頁最上面會寫「距初級考試 46 天」,
//                   看起來像真的,但跟你的考試毫無關係。這個比觀念卡更毒,因為它在首頁大字上。
//   兩個清空之後前端都會自動不顯示那一塊(app.js 的 todayConcept 與 daysUntilExam 都有判空),
//   站不會壞,只是少一個功能,等你填進自己的內容就回來。
{
  const f = 'concepts.json'; const s = readIf(f);
  if (s) {
    let n = 0; try { n = (JSON.parse(s).cards || []).length; } catch {}
    write(f, s, JSON.stringify({ cards: [] }, null, 2) + '\n', `清掉 ${n} 張原站的每日觀念卡(換成你自己的就會回來)`);
  }
}
{
  const f = 'exam-dates.json'; const s = readIf(f);
  if (s) {
    write(f, s, JSON.stringify({
      note: '你的考試日期。填進去首頁就會顯示倒數,留空則不顯示。',
      pass: '', exams: {},
    }, null, 2) + '\n', '清掉原站的考試日期(不清的話首頁會顯示跟你無關的倒數)');
  }
}

// ---- 原站的帶圖題資產:換題庫後會變孤兒圖,check-questions 會擋 ----
if (!flag('keep-images') && existsSync('assets')) {
  const imgs = readdirSync('assets').filter((x) => /\.(webp|png|jpg|jpeg)$/i.test(x));
  if (imgs.length) {
    changes.push({ file: 'assets/', what: `刪掉 ${imgs.length} 張原站帶圖題的圖(不刪 check-questions 會報孤兒圖)` });
    if (!dry) for (const x of imgs) unlinkSync(join('assets', x));
  }
}

// ---- 原站專用的自動化:留著會在你的 repo 每天開不相關的 issue ----
for (const p of ['.github/workflows', 'tools/sources.json', 'tools/resources-snapshot.json',
                 'tools/check-resources.mjs', 'tools/extract-exam.mjs', 'tools/extract.sh', 'tools/extract-guide.mjs']) {
  if (!existsSync(p)) continue;
  changes.push({ file: p, what: '原站專用,刪除' });
  if (!dry) rmSync(p, { recursive: true, force: true });
}

// ---- 報告 ----
console.log(`${dry ? '[試跑] ' : ''}換裝成「${NAME}」 → ${SITE}\n`);
for (const c of changes) console.log(`  ${c.file.padEnd(28)} ${c.what}`);
console.log(`\n共 ${changes.length} 項${dry ? '(試跑,未寫入)' : ''}。`);

if (!dry) {
  // 殘留檢查:換漏了就講出來,不要讓人自己發現
  const leftovers = [];
  for (const f of ['index.html', 'app.js', 'core.js', 'sw.js', 'robots.txt', 'sitemap.xml', 'manifest.json', 'build.html']) {
    const s = readIf(f); if (!s) continue;
    if (s.includes('ipas-ai-quiz') || s.includes('yazelin.github.io/ipas')) leftovers.push(f);
  }
  console.log(leftovers.length
    ? `\n⚠ 這些檔還有原站字樣,請自己看一眼: ${leftovers.join(', ')}`
    : '\n✓ 殘留檢查:沒有原站網址或 repo 名稱了');
  // 這兩個換不掉,因為是「內容」不是「品牌」:原站指向 iPAS 官方考試資訊,
  // 你的站要指向你那個考試的官方頁。程式不知道那是什麼,只能提醒。
  const ext = (readIf('app.js') || '') + (readIf('index.html') || '');
  if (ext.includes('ipd.nat.gov.tw')) console.log('⚠ app.js 與 index.html 還有兩個指向 iPAS 官方考試資訊的連結,請換成你那個考試的官方頁(搜尋 ipd.nat.gov.tw)');
  console.log(`
接下來:
  1. 換掉 questions.json 成你的題庫(schema 見 AGENTS.md)
     concepts.json 與 exam-dates.json 已經清空,要那兩個功能就填自己的內容
     ※ 換之前跑 check-questions 會報一堆「image 指到的檔不存在」,那是正常的:
       原站帶圖題的圖已經刪掉,但題庫還是原站的。題庫換成你的就沒了。
  2. node tools/check-questions.mjs && node core.test.mjs
  3. gh repo create ${REPO} --public --source=. --push
  4. gh api -X POST repos/${REPO}/pages -f 'source[branch]=main' -f 'source[path]=/'`);
}
