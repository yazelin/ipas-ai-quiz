// 後端:① 同步碼進度同步(/sync/:code)② Web Push 每日提醒(/push/* + cron)
// 存放:D1(kv 表)。KV binding 只剩唯讀 fallback(2026-07 從 KV 遷來,免費層每日 1000 次寫入被刷題流量吃滿);
// 等 D1 收斂(backfill 完+跑一陣子)就可以把 SYNC binding 和 fallback 一起拔掉。
import { ApplicationServerKeys, generatePushHTTPRequest } from 'webpush-webcrypto';

const CODE_RE = /^[a-z]+-[a-z]+-\d{2,4}$/i;
const MAX_BYTES = 256 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ymdUTC = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// ---- 存取層:D1 為主,舊 KV 資料唯讀 fallback ----
async function readKey(env, key) {
  const row = await env.DB.prepare('SELECT value FROM kv WHERE key = ?1').bind(key).first();
  if (row) return row.value;
  return env.SYNC ? env.SYNC.get(key) : null; // ponytail: 遷移過渡,拔 KV binding 時連這行一起刪
}
const writeKey = (env, key, value) =>
  env.DB.prepare('INSERT INTO kv (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
async function deleteKey(env, key) {
  await env.DB.prepare('DELETE FROM kv WHERE key = ?1').bind(key).run();
  if (env.SYNC) await env.SYNC.delete(key); // 舊 KV 也刪,免得 fallback 把退訂的又撿回來
}

async function sendPush(env, sub, payloadObj) {
  const keys = await ApplicationServerKeys.fromJSON({ publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: keys,
    payload: JSON.stringify(payloadObj),
    target: sub,
    adminContact: env.ADMIN_CONTACT || 'mailto:yazelin@ching-tech.com',
    ttl: 3600,
    urgency: 'normal',
  });
  return fetch(endpoint, { method: 'POST', headers, body });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    // ---- 同步 ----
    const sm = url.pathname.match(/^\/sync\/([^/]+)$/);
    if (sm) {
      let code;
      try { code = decodeURIComponent(sm[1]); } catch { return json({ error: 'bad_code' }, 400); } // 壞的百分號編碼(爬蟲亂打)別讓 worker 拋例外
      if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
      const key = 's:' + code.toLowerCase();
      if (req.method === 'GET') {
        const v = await readKey(env, key);
        return v ? new Response(v, { headers: { ...CORS, 'Content-Type': 'application/json' } }) : json({ error: 'empty' }, 404);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
        try { JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
        await writeKey(env, key, body);
        return json({ ok: true });
      }
      return json({ error: 'method' }, 405);
    }

    // ---- 推播訂閱 ----
    if (url.pathname === '/push/subscribe' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '') || !b.subscription || !b.subscription.endpoint) return json({ error: 'bad' }, 400);
      const rec = { code: b.code.toLowerCase(), subscription: b.subscription, hourUtc: ((b.hourUtc | 0) % 24 + 24) % 24, offsetMin: b.offsetMin | 0 };
      await writeKey(env, 'push:' + rec.code, JSON.stringify(rec));
      return json({ ok: true });
    }
    if (url.pathname === '/push/unsubscribe' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '')) return json({ error: 'bad' }, 400);
      await deleteKey(env, 'push:' + b.code.toLowerCase());
      return json({ ok: true });
    }
    // 測試:立刻發一則給該碼(驗證用)
    if (url.pathname === '/push/test' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '')) return json({ error: 'bad' }, 400);
      const rec = JSON.parse((await readKey(env, 'push:' + b.code.toLowerCase())) || 'null');
      if (!rec) return json({ error: 'not_subscribed' }, 404);
      try {
        const r = await sendPush(env, rec.subscription, { title: 'iPAS 模考測試通知', body: '推播設定成功!每天會在你設定的時間提醒你刷題。', url: './' });
        return json({ ok: true, status: r.status });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    return json({ error: 'not_found' }, 404);
  },

  // ---- 每小時 cron:到點且今天還沒練 → 發提醒 ----
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const nowHourUtc = new Date().getUTCHours();
      const { results } = await env.DB.prepare("SELECT value FROM kv WHERE key LIKE 'push:%'").all();
      for (const { value } of results) {
        const rec = JSON.parse(value || 'null');
        if (!rec || rec.hourUtc !== nowHourUtc) continue;
        // 使用者當地日期(把現在時間平移成他的時區)
        const localNow = new Date(Date.now() - rec.offsetMin * 60000);
        const localToday = ymdUTC(localNow);
        const prog = JSON.parse((await readKey(env, 's:' + rec.code)) || 'null');
        const practicedToday = prog && prog.daily && prog.daily.date === localToday && prog.daily.count > 0;
        if (practicedToday) continue;
        await sendPush(env, rec.subscription, {
          title: 'iPAS 模考 · 今天還沒練',
          body: '花 5 分鐘刷幾題,保持手感、別讓連續打卡斷掉!',
          url: './',
        }).catch(() => {});
      }
    })());
  },
};
