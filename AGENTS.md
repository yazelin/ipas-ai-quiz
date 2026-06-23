# AGENTS.md — 給 AI 代理 / 貢獻者的修改指南

這份是讓「你(或你的 AI agent)clone 本 repo 後,能安全地擴充、改題、改功能」的說明。
本站是**純靜態前端**(無框架、無 build),題庫是 JSON,後端只有一個選用的 Cloudflare Worker。

## 檔案地圖

| 檔案 | 作用 | 改它要注意 |
|---|---|---|
| `index.html` | 版面 + 全部 CSS(inline `<style>`)+ PWA head | 改到快取檔請 bump `sw.js` 版號 |
| `app.js` | 全部前端邏輯(ES module,vanilla JS) | DOM 操作集中在這 |
| `core.js` | 純邏輯(Leitner、計分、統計、出題優先序),**有單元測試** | 改完跑 `node core.test.mjs` |
| `core.test.mjs` | `core.js` 的測試 | 改邏輯要同步更新斷言 |
| `questions.json` | **題庫**(主要要改的就是這個) | 見下方 schema |
| `concepts.json` | 每日 AI 觀念卡池 | `{ "cards": [...] }` |
| `sw.js` | Service Worker(離線快取 + 推播顯示) | 改任何快取檔就把 `CACHE` 版號 +1 |
| `manifest.json` | PWA 安裝資訊 | |
| `assets/*.png` | 帶圖題的圖 | |
| `tools/sources.json` `tools/extract.sh` | 官方試題來源清單 + 抽文字腳本 | 加新梯次用 |
| `worker/` | Cloudflare Worker:同步 + 推播 + cron | 要自架後端才需動 |

## 題庫 schema(`questions.json`)

```jsonc
{
  "meta": {
    "title": "...",
    "note": "...",
    "defaultTimeLimitMin": 90,
    "guides": { "科目1:人工智慧基礎概論": "<學習指引PDF網址>", ... }
  },
  "questions": [
    {
      "id": "115-1-b-s1-q3",        // 唯一;慣例 <梯次>-<b初級/m中級>-s<科>-q<N>;帶圖題用 -f<N>
      "level": "初級",              // 初級 / 中級
      "round": "115年第一次",
      "subject": "科目1:人工智慧基礎概論",
      "chapter": "機器學習",         // 練習「範圍」依此分組;沒填會退回用 subject
      "topic": "監督式學習",         // 細標籤(自由),關鍵字搜尋會吃到
      "question": "題幹…",
      "options": ["A選項", "B選項", "C選項", "D選項"],  // 必須剛好 4 個
      "answer": 2,                  // 正解的 0-based 索引:A=0 B=1 C=2 D=3
      "explanation": "詳解…",        // 為何對 + 為何其他錯 + 概念
      "image": "assets/<id>.webp",  // 選填:帶圖題才有,檔名一律 = 題目 id(WebP lossless)
      "source": "學習指引"           // 選填:來源。缺省=歷屆考古題;"學習指引"=官方學習指引範例題(id 以 lg- 開頭、答案與解析皆官方)
    }
  ]
}
```

**加題目最小步驟**:把新物件 append 進 `questions.questions`,確認 `options` 4 個、`answer` 是 0-3、`id` 不重複,然後:
```bash
node -e "JSON.parse(require('fs').readFileSync('questions.json'))"   # 驗 JSON 合法
node core.test.mjs                                                   # 驗邏輯沒壞
python3 -m http.server 8000                                          # 開 http://localhost:8000 看
```
- `chapter` 請沿用既有的(統計頁/範圍選單會自動多出該組);不填則以 `subject` 當範圍。
- 帶圖題:圖放 `assets/`,**檔名一律命名為 `<題目 id>.webp`**(WebP lossless,例如 `assets/114-2-m-s3-f1.webp`),`image` 欄填 `assets/<id>.webp`。看 id 就知道圖、看圖就知道哪題,別沿用原始 PDF 的圖片序號(早期 114-2 沒這樣做,踩過坑)。**不要把含「答案欄」的整頁截圖放進去**(會洩答案)——只放圖本身。
- **題幹若寫「附圖/如圖/下圖」就一定要有 `image`**(歷史教訓:q39 抽圖時漏掛,題目變成無法判讀)。加完用 `node tools/check-questions.mjs` 驗。

### 用 CLI 批次加題(推薦,別手改大 JSON)

看到別人分享一批題目時,把它們整成一個陣列檔(寬鬆格式),用內建 CLI 加入——會**自動驗證 + 配 id + 去重**:

```bash
node tools/add-questions.mjs new.json --dry-run   # 先試跑(只檢查不寫入)
node tools/add-questions.mjs new.json             # 確認沒錯再真的加
```

`new.json` 範例(`answer` 可填數字或 A/B/C/D;`id` 不用給,會自動配):
```json
[
  {
    "level": "初級", "round": "115年第二次", "subject": "科目1:人工智慧基礎概論",
    "chapter": "機器學習", "topic": "過擬合",
    "question": "下列何者最能描述過擬合?",
    "options": ["訓練與測試都差", "訓練好、測試差", "資料太少", "學習率太高"],
    "answer": "B",
    "explanation": "過擬合=過度記憶訓練資料、泛化差…"
  }
]
```
CLI 會擋掉:選項不是 4 個、answer 超範圍、缺必填、題幹重複、id 撞號。全部 OK 才寫入。
**給 AI 的提示**:產 `new.json` 時,字串內不要用半形雙引號 `"`(用「」),且 `answer` 要對應官方正解。

## 常見修改

- **加一個新梯次的真題**:照 `.claude/skills/add-exam`(Claude Code 可用 `/add-exam`)的流程——PDF 網址進 `tools/sources.json` → `tools/extract.sh` 抽文字(`pdftotext`,**答案在最左欄**)→ AI 結構化成 `new.json` → `node tools/add-questions.mjs new.json`。帶圖題用 `pdfimages -png` 取乾淨內嵌圖。
- **加每日觀念卡**:整理成陣列檔後 `node tools/add-concepts.mjs new.json`(自動驗證+去重);或直接 append 進 `concepts.json` 的 `cards`,每張 `{level, subject, chapter, title, body}`。

### 內建工具一覽

| 指令 / skill | 做什麼 |
|---|---|
| `node tools/add-questions.mjs <f.json> [--dry-run]` | 批次加題(驗證+配id+去重) |
| `node tools/add-concepts.mjs <f.json> [--dry-run]` | 批次加觀念卡(驗證+去重) |
| `tools/extract.sh '<pdf>' out.txt` | 官方試題 PDF 抽文字 |
| `node tools/check-resources.mjs [--write]` | 比對官方資源頁 PDF 快照,有新試題/指引就產 issue 內容(GitHub Actions 每日跑) |
| `node tools/check-questions.mjs` | 題庫健康檢查(圖/檔名慣例/附圖漏掛/結構/標點),加題後跑 |
| `/add-questions`(skill) | 引導加題流程 |
| `/add-exam`(skill) | 引導加新梯次流程 |
- **改學習邏輯**:在 `core.js`——`MASTER_BOX`(連對幾次算掌握)、`nextBox`(Leitner)、`reviewPriority`(智慧複習出題優先序)。改完務必更新並跑 `core.test.mjs`。
- **改練習範圍維度**:`app.js` 的 `rangeKey()`(目前 = `chapter || subject`)。
- **自架同步/推播後端**(fork 自己用):需要自己的 Cloudflare Worker + KV + VAPID 金鑰。
  1. `cd worker && npm i`,`wrangler kv namespace create SYNC` 把 id 填進 `wrangler.toml`。
  2. `npx web-push generate-vapid-keys` → 公鑰填 `wrangler.toml [vars] VAPID_PUBLIC` 與 `app.js` 的 `VAPID_PUBLIC`;私鑰 `wrangler secret put VAPID_PRIVATE`。
  3. `wrangler deploy`,把 worker 網址填進 `app.js` 的 `SYNC_URL`。
  - `SYNC_URL` 留空 = 純本機(同步/推播自動停用,站仍可用)。

## 驗證(改完都跑一下)

```bash
node core.test.mjs                 # 核心邏輯
node tools/check-questions.mjs     # 題庫健康:壞圖/孤兒圖/圖檔名慣例/附圖漏掛/選項數/answer/重複id/標點全形
node -e "JSON.parse(require('fs').readFileSync('questions.json'))"   # JSON 合法
python3 -m http.server 8000        # 本機開站(fetch 需要 http,不能 file://)
```

### 慣例(加題/加梯次務必遵守,`check-questions.mjs` 會擋)

- **中文標點全形**:`,;:?` 在中文語境用全形 `,;:?`,中文外層括號用全形 `（ ）`;**夾純英文的括號維持半形**(如 `(LSTM)`、`(B)`、`P(y|x)`)。
- **圖檔名 = 題目 id**:`assets/<id>.webp`(WebP lossless,SW 會自動預載供離線),不沿用原始 PDF 圖號。
- **題幹提到圖就要有 `image`**。

## 禁區 / 注意

- **別 commit**:`worker/node_modules/`、`worker/.wrangler/`、任何金鑰私鑰(私鑰只放 `wrangler secret`)。
- **改到被快取的檔**(index/app/core/questions/concepts/icon…)就把 `sw.js` 的 `CACHE` 版號 +1,否則使用者拿到舊版。
- **答案以官方為準**:`answer` 取自官方公告試題答案,不要憑感覺改。`explanation` 是本站原創。
- **版權**:題幹是 iPAS 官方公告試題(著作權屬官方);程式碼 MIT。對外散布前自行確認。
- AI 寫 JSON 時**別在字串裡用半形雙引號 `"`**,要引用改用「」,否則破壞 JSON。
