# Next

- [ ] sync 已遷 D1(2026-07-16):跑穩一兩週後拔 worker 的 KV fallback(wrangler.toml [[kv_namespaces]] + src/index.js 三處 env.SYNC),另開 PR
- [x] 11 月考前(初級 11/7、中級 11/14)回頭比對兩個數字,看 8/17 那次改動有沒有用:設了考試日期的人(改動前 131/2137=6%)、開推播的人(改動前 17/2137=0.8%)。查法:npx wrangler d1 execute ipas-quiz-sync --remote --command "SELECT COUNT(*) FROM kv WHERE key LIKE 'pu%'"
  - 2026-11-12 查(中級考前兩天):同步碼 4,611(8/17 是 2,137)。設了考試日期 335(7.3%,改動前 6.1%),其中設 11/7 的 144、設 11/14 的 81。開推播 131(2.8%,改動前 17 個、0.8%)。查法:`value LIKE '%"examDate":"20%'` 數 `s:` 開頭的鍵;`pu` 開頭的鍵數推播。wrangler 要先 `export CLOUDFLARE_ACCOUNT_ID=<個人帳號>`,不然兩個帳號選不出來。
