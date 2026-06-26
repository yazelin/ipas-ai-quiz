# 貢獻指南

這個專案預設用 **AI agent 開發**。維護者（與大多數貢獻）都是把需求交給 agent（Claude Code / Codex / Cursor 等），由 agent 讀規格、改 code、跑驗證、開 PR，維護者 review 後 merge。

所以本 repo 的文件分工是這樣：

- **`AGENTS.md`** — 給 agent（也給想深入的人）的完整規格:資料 schema、加題／加梯次／加觀念卡流程、學習邏輯、驗證指令、禁區。**這是單一事實來源。**
- **`CLAUDE.md`** — Claude Code 進來時的入口,直接 `@import` 了 `AGENTS.md`。
- **本檔** — 給人類看的入口與貢獻方式。

## 怎麼貢獻

你不一定要會寫 code。三條路都歡迎:

1. **開 issue** — 回報錯題、提想法、回饋。用 repo 內的 issue 範本即可,這條最輕。
2. **讓你的 agent 開 PR** — 把你的 AI agent 指向 `AGENTS.md`,告訴它你想加什麼題／改什麼,讓它照規格產出 PR。提交前請它跑過下方「提交前自查」。
3. **自己手動改** — 照 `AGENTS.md` 的流程(加題用 `node tools/add-questions.mjs`,別手改大 JSON),改完跑驗證再開 PR。

不管哪條,進到 PR 後都由維護者 review 再 merge。小瑕疵維護者會自己補,不會為難貢獻者 — 但下面這份自查能讓你的 PR 更快過。

## 提交前自查

開 PR 前(agent 或人都一樣)請確認:

```bash
node core.test.mjs                 # 核心邏輯沒壞
node tools/check-questions.mjs     # 題庫健康:圖/慣例/結構/標點
node -e "JSON.parse(require('fs').readFileSync('questions.json'))"   # JSON 合法
```

外加幾個容易漏的:

- 改到**被快取的檔**(`questions.json` / `concepts.json` / `app.js` / `core.js` / `index.html` / icon…)→ 把 `sw.js` 的 `CACHE` 版號 +1,否則已安裝 PWA 的用戶會拿到舊版。
- 動到**章節分類**時,`questions.json` 與 `concepts.json` 的 `chapter` 字串要一致(`app.js` 用精確比對來連結觀念卡)。
- **答案以官方為準**:`answer` 取自官方公告試題,不要憑感覺改;`explanation` 才是本站原創。

PR 範本(`.github/pull_request_template.md`)就是這份清單,開 PR 時會自動帶出來,勾一勾即可。

## 版權

- **程式碼**:MIT(見 `LICENSE`),作者 林亞澤。
- **題庫內容**:題幹為 iPAS 官方公告試題與學習指引,著作權屬官方;歷屆題解析為本站原創。公開散布前請自行確認官方重製條款。

貢獻你的內容即表示同意以上述授權釋出。
