// 後端:① 同步碼進度同步(/sync/:code)② Web Push 每日提醒(/push/* + cron)
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
      const code = decodeURIComponent(sm[1]);
      if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
      const key = 's:' + code.toLowerCase();
      if (req.method === 'GET') {
        const v = await env.SYNC.get(key);
        return v ? new Response(v, { headers: { ...CORS, 'Content-Type': 'application/json' } }) : json({ error: 'empty' }, 404);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
        try { JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
        await env.SYNC.put(key, body);
        return json({ ok: true });
      }
      return json({ error: 'method' }, 405);
    }

    // ---- 推播訂閱 ----
    if (url.pathname === '/push/subscribe' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '') || !b.subscription || !b.subscription.endpoint) return json({ error: 'bad' }, 400);
      const rec = { code: b.code.toLowerCase(), subscription: b.subscription, hourUtc: ((b.hourUtc | 0) % 24 + 24) % 24, offsetMin: b.offsetMin | 0 };
      await env.SYNC.put('push:' + rec.code, JSON.stringify(rec));
      return json({ ok: true });
    }
    if (url.pathname === '/push/unsubscribe' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '')) return json({ error: 'bad' }, 400);
      await env.SYNC.delete('push:' + b.code.toLowerCase());
      return json({ ok: true });
    }
    // 測試:立刻發一則給該碼(驗證用)
    if (url.pathname === '/push/test' && req.method === 'POST') {
      const b = await req.json().catch(() => null);
      if (!b || !CODE_RE.test(b.code || '')) return json({ error: 'bad' }, 400);
      const rec = JSON.parse((await env.SYNC.get('push:' + b.code.toLowerCase())) || 'null');
      if (!rec) return json({ error: 'not_subscribed' }, 404);
      try {
        const r = await sendPush(env, rec.subscription, { title: 'iPAS 模考測試通知', body: '推播設定成功!每天會在你設定的時間提醒你刷題。', url: '/' });
        return json({ ok: true, status: r.status });
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    return json({ error: 'not_found' }, 404);
  },

  // ---- 每小時 cron:到點且今天還沒練 → 發提醒 ----
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const nowHourUtc = new Date().getUTCHours();
      let cursor;
      do {
        const list = await env.SYNC.list({ prefix: 'push:', cursor });
        cursor = list.list_complete ? null : list.cursor;
        for (const k of list.keys) {
          const rec = JSON.parse((await env.SYNC.get(k.name)) || 'null');
          if (!rec || rec.hourUtc !== nowHourUtc) continue;
          // 使用者當地日期(把現在時間平移成他的時區)
          const localNow = new Date(Date.now() - rec.offsetMin * 60000);
          const localToday = ymdUTC(localNow);
          const prog = JSON.parse((await env.SYNC.get('s:' + rec.code)) || 'null');
          const practicedToday = prog && prog.daily && prog.daily.date === localToday && prog.daily.count > 0;
          if (practicedToday) continue;
          await sendPush(env, rec.subscription, {
            title: 'iPAS 模考 · 今天還沒練',
            body: '花 5 分鐘刷幾題,保持手感、別讓連續打卡斷掉!',
            url: '/',
          }).catch(() => {});
        }
      } while (cursor);
    })());
  },
};
