// 監看 IPAS「AI 應用規劃師」學習資源頁,比對 PDF 連結快照,有變動就產出 issue 內容。
// 用法:
//   node tools/check-resources.mjs           # 只比對、印結果(不寫檔)
//   node tools/check-resources.mjs --write    # 有變動(或首次無快照)時寫入快照 + issue 檔
// GitHub Actions 會讀 GITHUB_OUTPUT 的 changed= 決定要不要開 issue。
import fs from 'fs';

const PAGE = 'https://ipd.nat.gov.tw/ipas/certification/AIAP/learning-resources';
const SNAP = 'tools/resources-snapshot.json';
const BODY = 'resource-change.md';
const TITLE = 'resource-change-title.txt';
const write = process.argv.includes('--write');
const nameOf = (u) => decodeURIComponent(u.split('/').pop());

const res = await fetch(PAGE, { headers: { 'User-Agent': 'Mozilla/5.0 (ipas-ai-quiz resource watcher)' } });
if (!res.ok) { console.error(`fetch failed: HTTP ${res.status}`); process.exit(0); } // 別因暫時抓不到就誤判
const raw = await res.text();
const t = raw.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
const urls = [...new Set(t.match(/https:\/\/[^"\\]*certification_resource[^"\\]*\.pdf/g) || [])].sort();

// 抓到 0 筆 = 頁面結構變了或被擋,視為抓取失敗,不動快照、不誤報「全部移除」。
if (urls.length === 0) { console.error('抓到 0 個 PDF 連結,可能頁面結構變動或被擋;不更新快照。'); process.exit(0); }

const exists = fs.existsSync(SNAP);
const old = exists ? (JSON.parse(fs.readFileSync(SNAP, 'utf8')).pdfs || []) : [];
const oldSet = new Set(old), curSet = new Set(urls);
const added = urls.filter((u) => !oldSet.has(u));
const removed = old.filter((u) => !curSet.has(u));
const changed = exists && (added.length || removed.length);

console.log(`目前 ${urls.length} 份 PDF;新增 ${added.length}、移除/取代 ${removed.length}${exists ? '' : '(首次,建立基準快照)'}`);

const out = process.env.GITHUB_OUTPUT;
if (out) fs.appendFileSync(out, `changed=${changed ? 'true' : 'false'}\n`);

if (write && (!exists || changed)) {
  fs.writeFileSync(SNAP, JSON.stringify({ updated: new Date().toISOString(), pdfs: urls }, null, 2) + '\n');
  console.log(`已寫入快照 ${SNAP}`);
}

if (changed && write) {
  const L = ['IPAS「AI 應用規劃師」學習資源頁有變動。', ''];
  if (added.length) L.push('## 新增 / 更新', '', ...added.map((u) => `- [${nameOf(u)}](${encodeURI(u)})`), '');
  if (removed.length) L.push('## 移除 / 被取代(通常是被新版取代)', '', ...removed.map((u) => `- ${nameOf(u)}`), '');
  L.push(
    '## 後續(手動,答案以官方為準)', '',
    '- [ ] 下載上面新增的試題 / 學習指引 PDF',
    '- [ ] `tools/extract.sh \'<pdf>\' out.txt` 抽文字(答案在最左欄)',
    '- [ ] 結構化成 `new.json`,**人工核對官方正解**',
    '- [ ] `node tools/add-questions.mjs new.json`(驗證 + 配 id + 去重)',
    '- [ ] `node core.test.mjs`、bump `sw.js` 的 `CACHE`',
    '', `來源:${PAGE}`,
  );
  fs.writeFileSync(BODY, L.join('\n') + '\n');
  fs.writeFileSync(TITLE, `[資源更新] AIAP 學習資源頁:新增 ${added.length} / 移除 ${removed.length}（${new Date().toISOString().slice(0, 10)}）`);
  console.log(`已寫入 ${BODY} / ${TITLE}`);
}
