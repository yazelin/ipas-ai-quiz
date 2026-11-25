# Next

- [x] sync 已遷 D1(2026-07-16):跑穩一兩週後拔 worker 的 KV fallback — 2026-08-07 #38 已拔並部署(線上版本 08-06 18:20 UTC),當時漏勾。舊 KV namespace 本身沒刪,留著不影響。
- [x] 11 月考前(初級 11/7、中級 11/14)回頭比對兩個數字,看 8/17 那次改動有沒有用:設了考試日期的人(改動前 131/2137=6%)、開推播的人(改動前 17/2137=0.8%)。查法:npx wrangler d1 execute ipas-quiz-sync --remote --command "SELECT COUNT(*) FROM kv WHERE key LIKE 'pu%'"
  - 2026-11-12 查(中級考前兩天):同步碼 4,611(8/17 是 2,137)。設了考試日期 335(7.3%,改動前 6.1%),其中設 11/7 的 144、設 11/14 的 81。開推播 131(2.8%,改動前 17 個、0.8%)。查法:`value LIKE '%"examDate":"20%'` 數 `s:` 開頭的鍵;`pu` 開頭的鍵數推播。wrangler 要先 `export CLOUDFLARE_ACCOUNT_ID=<個人帳號>`,不然兩個帳號選不出來。

- [ ] 考後感謝卡計數(2026-11-21 加,PR thanks-card-hit-counts):四個站名 `ipas-ai-quiz-thanks-seen`(看到,每分頁每考試日一次)、`-coffee`、`-line`、`-close`,只在 yazelin.github.io 上記。查法:`curl -s https://k-rider-api.yazelinj303.workers.dev/hits | grep ipas-ai-quiz-thanks`(公開儀表板,每站一列累計)。考試當天 17:00 後到考後 14 天、累計作答 20 題以上的人才會看到卡,所以下一個有數字的時間是下次考試後。

- [ ] 116 年考試日期:官方公布後補進 `exam-dates.json`(來源 https://ipd.nat.gov.tw/ipas/certification/AIAP/exam-info )。沒補之前首頁倒數顯示「尚未公布」(2026-11-25 加)。
