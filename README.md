# iPAS AI 應用規劃師 模擬考練習

純靜態的線上刷題 / 模擬考網頁。無後端、無資料庫、無帳號,進度存在瀏覽器 localStorage。
丟上 GitHub Pages,分享網址,手機電腦都能練。

## 功能

- **練習模式**:選科目、隨機抽題,答完即時看正解與解析,可寫筆記、加星標。
- **模擬考模式**:整份試卷計時作答,交卷前不顯示答案,結束給分並可檢討錯題。
- **錯題本(Leitner 間隔重複)**:答對升一格、答錯掉回第 1 格,到第 5 格算「掌握」自動移出。一鍵只練錯題。
- **學習統計**:各科目正確率、已練習 / 目前錯題 / 已掌握題數。
- **筆記匯出**:把星標題目 + 解析 + 自己的筆記匯出成 Markdown,考前掃一遍。
- **備份 / 轉移**:匯出/匯入進度 JSON。每台裝置有一組「同步碼」,雲端自動同步為下一步(見下)。

## 在本機跑

`fetch` 讀 `questions.json` 需要 http(直接雙擊開檔的 `file://` 會被瀏覽器擋):

```bash
python3 -m http.server 8000
# 開 http://localhost:8000
```

## 測試核心邏輯

```bash
node core.test.mjs   # 印出 PASS;Leitner / 計分 / 統計 / 匯出 壞掉會 throw
```

## 補題庫

編輯 `questions.json` 的 `questions` 陣列,push 即更新。每題格式:

```json
{
  "id": "115-1-s1-q3",
  "level": "初級",
  "round": "115年第一次",
  "subject": "科目1：人工智慧基礎概論",
  "topic": "機器學習",
  "question": "題幹…",
  "options": ["選項A", "選項B", "選項C", "選項D"],
  "answer": 2,
  "explanation": "解析…(官方不附,自行或 AI 補)"
}
```

- `answer` 是正解選項的索引(從 0 起算)。
- 模擬考的「試卷」由 `level｜round｜subject` 自動分組,不必另外維護試卷清單。

## 授權與題庫版權

- 程式碼:MIT(見 `LICENSE`)。
- 題庫內容**不在 MIT 範圍**:目前 `questions.json` 內為自寫範例題。iPAS 官方歷屆試題有其著作權,公開散布前請確認重製條款;自行撰寫的解析才是可公開的原創內容。

## Roadmap

- [ ] 雲端同步(Cloudflare Worker + KV,用同步碼,免帳號)——目前同步碼已產生並顯示,推拉尚未接。
