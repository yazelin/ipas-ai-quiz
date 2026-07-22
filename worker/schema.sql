-- 同步/推播的儲存表:key = 's:<同步碼>'(進度 JSON)或 'push:<同步碼>'(推播訂閱 JSON)
-- updated_at = 該筆最後寫入時間(epoch ms),用來查真正的活躍時間,不用再靠 history 猜
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER);
