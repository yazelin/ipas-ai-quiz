// 監看 IPAS「AI 應用規劃師」學習資源頁(試題/學習指引)與考試資訊頁(簡章),比對 PDF 連結快照,有變動就產出 issue 內容。
// 用法:
//   node tools/check-resources.mjs           # 只比對、印結果(不寫檔)
//   node tools/check-resources.mjs --write    # 有變動(或首次無快照)時寫入快照 + issue 檔
// GitHub Actions 會讀 GITHUB_OUTPUT 的 changed= 決定要不要開 issue。
import fs from 'fs';

const PAGES = [
  { key: 'pdfs', name: '學習資源頁', url: 'https://ipd.nat.gov.tw/ipas/certification/AIAP/learning-resources',
    re: /https:\/\/[^"\\]*certification_resource[^"\\]*\.pdf/g },
  // 簡章在這頁。新簡章 = 新年度的考試日、成績公告日、證書寄發日,要抄進 exam-dates.json。
  { key: 'examInfoPdfs', name: '考試資訊頁', url: 'https://ipd.nat.gov.tw/ipas/certification/AIAP/exam-info',
    re: /https:\/\/[^"\\]*\/uploads\/certification(?:_attachment)?\/[^"\\]*\.pdf/g },
];
const SNAP = 'tools/resources-snapshot.json';
const BODY = 'resource-change.md';
const TITLE = 'resource-change-title.txt';
const write = process.argv.includes('--write');
const nameOf = (u) => decodeURIComponent(u.split('/').pop());

async function scrape(page) {
  let res;
  try {
    res = await fetch(page.url, { headers: { 'User-Agent': 'Mozilla/5.0 (ipas-ai-quiz resource watcher)' } });
  } catch (err) { console.error(`${page.name} fetch failed: ${err.message}`); return null; } // 別因暫時抓不到就誤判(含網路層失敗,如 DNS/連線逾時)
  if (!res.ok) { console.error(`${page.name} fetch failed: HTTP ${res.status}`); return null; }
  const t = (await res.text()).replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
  const urls = [...new Set(t.match(page.re) || [])].sort();
  // 抓到 0 筆 = 頁面結構變了或被擋,視為抓取失敗,不動快照、不誤報「全部移除」。
  if (urls.length === 0) { console.error(`${page.name}抓到 0 個 PDF 連結,可能頁面結構變動或被擋;不更新快照。`); return null; }
  return urls;
}

const snapExists = fs.existsSync(SNAP);
const snap = snapExists ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : {};
const diffs = [];
let snapDirty = false;
for (const page of PAGES) {
  const urls = await scrape(page);
  if (!urls) continue;
  const hasBase = Array.isArray(snap[page.key]);
  const old = hasBase ? snap[page.key] : [];
  const oldSet = new Set(old), curSet = new Set(urls);
  const added = urls.filter((u) => !oldSet.has(u));
  const removed = old.filter((u) => !curSet.has(u));
  console.log(`${page.name}:目前 ${urls.length} 份 PDF;新增 ${added.length}、移除/取代 ${removed.length}${hasBase ? '' : '(首次,建立基準快照)'}`);
  if (!hasBase || added.length || removed.length) { snap[page.key] = urls; snapDirty = true; }
  if (hasBase && (added.length || removed.length)) diffs.push({ page, added, removed });
}
const changed = diffs.length > 0;

const out = process.env.GITHUB_OUTPUT;
if (out) fs.appendFileSync(out, `changed=${changed ? 'true' : 'false'}\n`);

if (write && snapDirty) {
  snap.updated = new Date().toISOString();
  const { updated, ...rest } = snap;
  fs.writeFileSync(SNAP, JSON.stringify({ updated, ...rest }, null, 2) + '\n');
  console.log(`已寫入快照 ${SNAP}`);
}

if (changed && write) {
  const L = [];
  for (const { page, added, removed } of diffs) {
    L.push(`## IPAS「AI 應用規劃師」${page.name}有變動`, '');
    if (added.length) L.push('### 新增 / 更新', '', ...added.map((u) => `- [${nameOf(u)}](${encodeURI(u)})`), '');
    if (removed.length) L.push('### 移除 / 被取代(通常是被新版取代)', '', ...removed.map((u) => `- ${nameOf(u)}`), '');
    if (page.key === 'pdfs') {
      L.push(
        '### 後續(手動,答案以官方為準)', '',
        '- [ ] 新試題照 `/add-exam` 流程:`node tools/extract-exam.mjs \'<pdf>\' --level --round --subject -o new.json`',
        '- [ ] 填 chapter / topic / explanation,`node tools/add-questions.mjs new.json`',
        '- [ ] `node tools/check-questions.mjs`、`node core.test.mjs`、bump `sw.js` 的 `CACHE`',
        '');
    } else {
      L.push(
        '### 後續(手動,日期以官方為準)', '',
        '- [ ] 新簡章:把「重要日程表」的考試日期抄進 `exam-dates.json` 的 `exams`',
        '- [ ] 每場的成績公告日、證書寄發日抄進 `after`(`{ "<考試日>": { "score": ..., "cert": ... } }`),`brochure` 換成新簡章網址',
        '- [ ] 及格規定若有改,更新 `pass`',
        '- [ ] `node core.test.mjs`、bump `sw.js` 的 `CACHE`',
        '');
    }
    L.push(`來源:${page.url}`, '');
  }
  fs.writeFileSync(BODY, L.join('\n'));
  const label = diffs.map(({ page, added, removed }) => `${page.name}:新增 ${added.length} / 移除 ${removed.length}`).join(';');
  fs.writeFileSync(TITLE, `[資源更新] AIAP ${label}（${new Date().toISOString().slice(0, 10)}）`);
  console.log(`已寫入 ${BODY} / ${TITLE}`);
}
