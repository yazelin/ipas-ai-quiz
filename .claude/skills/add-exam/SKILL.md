---
name: add-exam
description: 把 iPAS 官方公布的「新梯次/新一次」考試試題加進題庫。當使用者說「加梯次」「iPAS 出新考題了」「補新一次的歷屆試題」或給了新的官方試題 PDF 網址時使用。
---

# 加一個新梯次的官方試題

iPAS 每次考完會公告該次試題(本站考古題來源)。將來有新梯次時,照此流程加入。

## 步驟

1. **拿到官方 PDF 直連網址**。iPAS AIAP 來源頁:
   `https://ipd.nat.gov.tw/ipas/certification/AIAP/learning-resources`
   該頁是 Next.js SSR,可直接 `curl` 頁面原始碼,用 grep 撈出 `/api/proxy/uploads/certification_resource/.../*.pdf` 的完整連結。把新梯次各科的 PDF 網址記到 `tools/sources.json`。

2. **抽文字**(每科一份):
   ```bash
   ./tools/extract.sh '<PDF網址>' /tmp/exam.txt
   ```
   `pdftotext -layout`;**官方答案在每題最左欄**(可能是全形 Ａ-Ｄ,要轉半形再轉 0-based:A=0 B=1 C=2 D=3)。

3. **結構化成題目**(這步要你 AI 判讀 `/tmp/exam.txt`):每題輸出
   `{level, round, subject, question, options[4], answer, chapter, topic, explanation}`,
   寫成一個陣列檔 `/tmp/new.json`。
   - `answer` 取最左欄官方答案。`explanation` 自己寫(為何對 + 為何其他錯 + 概念)。
   - `chapter` 用官方學習指引的章節名(沿用既有題庫已用過的)。
   - 字串內**不要用半形雙引號 `"`**,用「」。

4. **帶圖題**(題幹有「下圖/程式碼/圖表」純文字抽不到的):用 `pdfimages -png -p '<pdf>' /tmp/e` 取**乾淨內嵌圖**(忽略每頁固定尺寸的頁首裝飾圖;**不要用含左側答案欄的整頁截圖**)。圖用 `pdfimages` 取出後**轉 WebP lossless、命名為 `<該題 id>.webp`** 存到 `assets/`(例如 `assets/115-2-m-s3-f1.webp`),該題填 `image: "assets/<id>.webp"`。別沿用 PDF 原始圖號(早期 114-2 沒這樣、踩過坑);題幹寫「附圖」就一定要掛上。中文標點用全形(夾純英文括號維持半形)。

5. **加入 + 驗證**:
   ```bash
   node tools/add-questions.mjs /tmp/new.json --dry-run   # 先試跑
   node tools/add-questions.mjs /tmp/new.json             # 沒錯再加
   node tools/check-questions.mjs                         # 健康檢查:圖/檔名/附圖漏掛/結構/標點(要全綠)
   node core.test.mjs
   ```

6. **收尾**:bump `sw.js` 的 `CACHE` 版號;`tools/sources.json` 該梯次標 `status: done`;commit + push。

詳細資料 schema 見 `AGENTS.md`。
