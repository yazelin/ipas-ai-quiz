# Next

- [ ] sync 已遷 D1(2026-07-16):跑穩一兩週後拔 worker 的 KV fallback(wrangler.toml [[kv_namespaces]] + src/index.js 三處 env.SYNC),另開 PR
- [ ] 11 月考前(初級 11/7、中級 11/14)回頭比對兩個數字,看 8/17 那次改動有沒有用:設了考試日期的人(改動前 131/2137=6%)、開推播的人(改動前 17/2137=0.8%)。查法:npx wrangler d1 execute ipas-quiz-sync --remote --command "SELECT COUNT(*) FROM kv WHERE key LIKE 'pu%'"
