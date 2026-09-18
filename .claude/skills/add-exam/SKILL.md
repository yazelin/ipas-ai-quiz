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

2. **抽成題目骨架**(每科一份)。**用這支,不要自己拿 `pdftotext` 硬幹**:
   ```bash
   node tools/extract-exam.mjs '<PDF網址>' --level 初級 --round 115年第三次 \
     --subject "科目1：人工智慧基礎概論" -o /tmp/new-s1.json
   ```
   它會輸出 `{level, round, subject, chapter:'', topic:'', question, options[4], answer, explanation:''}`,
   答案已經是 0-based 且**取自 PDF 最左欄的官方答案**。

   **為什麼要有這支工具**(兩個會「靜默毀題」的坑,都不會讓程式出錯):
   - **`-layout` 的行序會亂**,拿它重建題幹會出錯而且看起來完全正常 → 題幹改用不加 `-layout` 的原始閱讀順序,`-layout` 那份只拿最左欄答案。
   - **頁尾「第 N 頁,共 15 頁」會被插進句子中間**,長成「判斷零件表面是否存第 2 頁,共 15 頁在細微刮痕」→ 已在解析階段濾除,`check-questions.mjs` 也有硬檢查擋。

   答案用三重驗證(欄位式、座標式、孤立字母鄰接),**任何一重對不上就中止**,不會給半成品。
   注意 `-bbox-layout` 的 y 是每頁重新算的,自己寫檢查時跨頁比 y 會假報大量不一致。

3. **填 `chapter` / `topic` / `explanation`**(這步才輪到你 AI 判讀):
   - `chapter` 用官方學習指引的章節名,**沿用既有題庫已用過的**,不要自創。
   - `explanation` 自己寫:為何對 + 逐一駁錯項 + 核心記憶點,中位數約 200 到 250 字。
   - **每則詳解建議以「正解 (X)」開頭**,方便寫一支腳本比對它與官方答案是否一致,不一致就不要產出。
   - 字串內**不要用半形雙引號 `"`**,用「」。
   - **夾純英數的括號用半形**(`(Supervised Learning)`),夾中文的維持全形。既有題庫零例外。

4. **帶圖題**(題幹有「下圖/程式碼/圖表」純文字抽不到的):先跑 `pdfimages -list <pdf>` **看尺寸分佈**——每頁尺寸都一樣的是頁首裝飾,不是題目用圖(115-3 那兩份 30 張全是 1084x454 的裝飾,實際零張帶圖題)。真的有題目用圖才用 `pdfimages -png -p '<pdf>' /tmp/e` 取**乾淨內嵌圖**(忽略每頁固定尺寸的頁首裝飾圖;**不要用含左側答案欄的整頁截圖**)。圖用 `pdfimages` 取出後**轉 WebP lossless、命名為 `<該題 id>.webp`** 存到 `assets/`(例如 `assets/115-2-m-s3-f1.webp`),該題填 `image: "assets/<id>.webp"`。別沿用 PDF 原始圖號(早期 114-2 沒這樣、踩過坑);題幹寫「附圖」就一定要掛上。中文標點用全形(夾純英文括號維持半形)。

5. **加入 + 驗證**:
   ```bash
   node tools/add-questions.mjs /tmp/new.json --dry-run   # 先試跑
   node tools/add-questions.mjs /tmp/new.json             # 沒錯再加
   node tools/check-questions.mjs                         # 健康檢查:圖/檔名/附圖漏掛/結構/標點(要全綠)
   node core.test.mjs
   ```

6. **收尾**:bump `sw.js` 的 `CACHE` 版號;`tools/sources.json` 該梯次標 `status: done`;commit + push。

詳細資料 schema 見 `AGENTS.md`。
