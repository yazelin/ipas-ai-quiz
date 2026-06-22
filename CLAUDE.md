# CLAUDE.md

本專案給 AI 代理的完整指南在 AGENTS.md(資料 schema、加題/加梯次/加觀念卡、改學習邏輯、自架後端、驗證與禁區)。

@AGENTS.md

快速提醒:
- 加題目用 `node tools/add-questions.mjs <new.json>`(會驗證+配 id+去重),別手改大 JSON。
- 改完跑 `node core.test.mjs`;改到被快取的檔就 bump `sw.js` 的 `CACHE` 版號。
- 別 commit `worker/node_modules`、`worker/.wrangler`、任何私鑰。
