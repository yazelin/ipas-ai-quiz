<!--
本專案預設用 AI agent 開發。不論你是 agent 還是人,開 PR 前把下面勾過一遍。
細節看 AGENTS.md(單一事實來源)與 CONTRIBUTING.md。
-->

## 改了什麼

<!-- 一兩句:加了哪些題／改了什麼邏輯／修了什麼 -->

## 提交前自查

- [ ] `node core.test.mjs` 通過
- [ ] `node tools/check-questions.mjs` 通過
- [ ] `questions.json` JSON 合法(`node -e "JSON.parse(require('fs').readFileSync('questions.json'))"`)
- [ ] 改到被快取的檔(questions / concepts / app / core / index / icon…)→ 已 bump `sw.js` 的 `CACHE` 版號
- [ ] 動到章節分類 → `questions.json` 與 `concepts.json` 的 `chapter` 字串一致
- [ ] 答案以官方公告為準,勿憑感覺改;`explanation` 才是原創
- [ ] 沒 commit `worker/node_modules`、`worker/.wrangler`、任何金鑰

## 備註

<!-- 已知殘留、待後續處理、或需要 reviewer 注意的地方 -->
