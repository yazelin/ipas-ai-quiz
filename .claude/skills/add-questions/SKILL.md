---
name: add-questions
description: 把一批 iPAS 題目安全加進本站題庫(questions.json)。當使用者要新增/匯入題目、貼來一批分享的考題、或說「加題目」「匯入題庫」時使用。
---

# 加題目到 iPAS 題庫

本站題庫是 `questions.json`。**不要手動編輯整包 JSON**,改用內建 CLI(會自動驗證、配 id、去重)。

## 步驟

1. 把要加入的題目整理成一個 JSON 陣列檔(例如 `/tmp/new.json`)。每題:
   - 必填:`level`(初級/中級)、`round`(如「115年第二次」)、`subject`(如「科目1:人工智慧基礎概論」)、`question`、`options`(剛好 4 個)、`answer`(0-3 或 "A"/"B"/"C"/"D")
   - 選填:`chapter`(練習範圍,沒填會用 subject)、`topic`、`explanation`、`image`(帶圖題,圖放 `assets/`)
   - **字串內不要用半形雙引號 `"`,用「」**;`answer` 要對應官方正解。

2. 先試跑(只檢查不寫入):
   ```bash
   node tools/add-questions.mjs /tmp/new.json --dry-run
   ```

3. 沒錯誤再正式加入:
   ```bash
   node tools/add-questions.mjs /tmp/new.json
   ```

4. 收尾:
   - 跑 `node core.test.mjs` 確認沒壞。
   - 題庫被 Service Worker 快取,**把 `sw.js` 的 `CACHE` 版號 +1**,否則使用者拿到舊題庫。
   - commit + push(若用 GitHub Pages 部署)。

更完整的資料 schema 與其他修改(加梯次、觀念卡、改學習邏輯、自架同步/推播)見 repo 根目錄的 `AGENTS.md`。
