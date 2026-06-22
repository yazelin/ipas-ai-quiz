# iPAS AI 應用規劃師 模擬考練習

**線上版:https://yazelin.github.io/ipas-ai-quiz/**

iPAS「AI 應用規劃師(初級・中級)」的線上模擬考刷題網頁。**611 題歷屆官方公告試題**,附官方答案 + 自寫詳解 + 對應教材章節。

純靜態前端(vanilla JS,無框架、無 build),進度存在瀏覽器 localStorage;**免帳號、可離線、可裝成手機 app**。雲端同步與每日推播提醒由一個選用的 Cloudflare Worker 提供。

## 功能

- **練習模式**:多選「官方章節」範圍 + 關鍵字過濾 + 三種出題(智慧複習/隨機);答完即時看正解、詳解、對應教材連結,可寫筆記、加星標。
  - 智慧複習:優先出「答錯的 → 沒做過的 → 還沒掌握的」,讓間隔重複真正生效。
- **模擬考模式**:整份試卷計時作答,交卷前不給答案,結束給分並可逐題檢討。
- **錯題本(Leitner 間隔重複)**:答錯會留著,同一題之後**連續答對 2 次**算掌握、自動移出;一鍵只練錯題。
- **學習統計**:涵蓋率、近期正確率(最近 50 題)、各範圍正確率/掌握度、成就徽章、最近 14 天題數趨勢。
- **每日**:今日挑戰(每天固定 3 題)、每日 AI 觀念卡(**會優先挑你較弱的章節**)、每日目標 / 連續打卡 / 考前倒數(可在設定調)。
- **雲端同步**:一組「同步碼」跨裝置同步進度(含錯題本),免帳號免密碼。
- **每日推播提醒**:到設定時間若當天還沒練,推播提醒(需安裝 PWA;iPhone 需 iOS 16.4+)。
- **可安裝 + 離線**:加到手機主畫面當 app,沒網路也能刷題(題庫已快取)。
- **社群**:每題可「回報」開 GitHub issue;footer 連到考生討論區(GitHub Discussions);筆記可匯出 Markdown。

## 題庫

12 份歷屆公告試題、共 **611 題**:

- 初級:114年第四次 / 115年第一次 / 115年第二次 — 科目 1、2
- 中級:114年第二次 / 115年第一次 — 科目 1、2、3
- 含中級 34 題「帶圖題」(圖在 `assets/`,題卡會顯示)。
- 每題依官方學習指引分到 18 個章節之一,供「範圍」選擇與弱點統計。

正解取自官方公告答案;解析為本站自寫。

## 在本機跑

```bash
python3 -m http.server 8000   # fetch 需要 http,不能直接 file:// 開
# 開 http://localhost:8000
node core.test.mjs            # 核心邏輯測試(Leitner/計分/統計/出題優先序/匯出)
```

## 部署

### GitHub Pages(前端)
推到 GitHub、開 Pages(branch=master、path=/)即可。`SYNC_URL` 留空時,同步/推播自動停用,站台仍可純本機使用。

### Cloudflare Worker(選用:雲端同步 + 推播,免費方案即可)

```bash
cd worker && npm install
npx wrangler kv namespace create SYNC          # 把 id 填進 wrangler.toml
npx web-push generate-vapid-keys               # VAPID 金鑰
#   公鑰 → wrangler.toml [vars] VAPID_PUBLIC + app.js 的 VAPID_PUBLIC
#   私鑰 → npx wrangler secret put VAPID_PRIVATE
npx wrangler deploy                            # 取得 https://<name>.<帳號>.workers.dev
```

再把 worker 網址填進 `app.js` 最上面的 `SYNC_URL`,push。

- 同步:背景自動(debounce 5 秒、切走 app、開設定頁時上傳);換裝置在「設定」輸入同步碼一次即可。
- 推播:Worker 用 `[triggers] crons = ["0 * * * *"]` 每小時檢查,到點且當天沒練就發。
- 免費額度很夠;KV 寫入 1,000 次/天是唯一上限,debounce 後一人一天才幾十次。

## 擴充題庫 / 貢獻(給人 & AI 代理)

完整修改 SOP 在 **[AGENTS.md](AGENTS.md)**(資料 schema、加題/加梯次/加觀念卡、改學習邏輯、自架後端、驗證與禁區);Claude Code 透過 `CLAUDE.md` 自動讀到,並可用 `/add-questions`、`/add-exam` skill。

常用內建工具:

```bash
node tools/add-questions.mjs new.json [--dry-run]   # 批次加題(驗證+配id+去重)
node tools/add-concepts.mjs  new.json [--dry-run]   # 批次加觀念卡
tools/extract.sh '<官方PDF網址>' out.txt            # 抽試題文字(答案在最左欄)
```

題目 schema(`questions.json`):

```jsonc
{
  "id": "115-1-b-s1-q3",   // 唯一;<梯次>-<b初級/m中級>-s<科>-q<N>(帶圖題用 -f<N>)
  "level": "初級", "round": "115年第一次", "subject": "科目1:人工智慧基礎概論",
  "chapter": "機器學習",    // 練習範圍依此分組;沒填用 subject
  "topic": "監督式學習",
  "question": "題幹…",
  "options": ["A","B","C","D"],   // 剛好 4 個
  "answer": 2,                    // 正解 0-based:A=0 B=1 C=2 D=3
  "explanation": "詳解…",
  "image": "assets/xxx.png"       // 選填:帶圖題
}
```

改動後請跑 `node core.test.mjs`,並把 `sw.js` 的 `CACHE` 版號 +1(否則使用者拿到舊快取)。

## 授權與版權

- **程式碼**:MIT(見 `LICENSE`),作者 林亞澤。
- **題庫內容**:題幹為 iPAS 官方公告試題,著作權屬官方;解析為本站原創。公開散布前請自行確認官方重製條款。

## 檔案結構

| 路徑 | 作用 |
|---|---|
| `index.html` | 版面 + CSS + PWA head |
| `app.js` | 前端邏輯(練習/模擬考/統計/同步/推播/安裝…) |
| `core.js` / `core.test.mjs` | 純邏輯 + 測試 |
| `questions.json` | 題庫 |
| `concepts.json` | 每日 AI 觀念卡池 |
| `sw.js` `manifest.json` | PWA(離線快取 + 安裝 + 推播顯示) |
| `assets/` | 帶圖題圖片 |
| `worker/` | Cloudflare Worker:同步 + 推播 + cron |
| `tools/` | 加題/加觀念卡 CLI、抽 PDF 腳本、來源清單 |
| `AGENTS.md` `CLAUDE.md` `.claude/skills/` | 給 AI 代理的擴充指南與 skill |
