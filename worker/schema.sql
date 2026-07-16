-- 同步/推播的儲存表:key = 's:<同步碼>'(進度 JSON)或 'push:<同步碼>'(推播訂閱 JSON)
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
