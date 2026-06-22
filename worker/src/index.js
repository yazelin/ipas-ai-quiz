// 同步碼後端:GET/PUT /sync/:code,把整包進度 JSON 存進 KV。免帳號。
// 安全:驗證碼格式(不讓任意 key 進 KV)、限制大小、只認合法 JSON。
const CODE_RE = /^[a-z]+-[a-z]+-\d{2,4}$/i;
const MAX_BYTES = 256 * 1024; // 進度 JSON 幾 KB 就夠,256KB 是寬鬆上限

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const m = new URL(req.url).pathname.match(/^\/sync\/([^/]+)$/);
    if (!m) return json({ error: 'not_found' }, 404);
    const code = decodeURIComponent(m[1]);
    if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
    const key = 's:' + code.toLowerCase();

    if (req.method === 'GET') {
      const v = await env.SYNC.get(key);
      return v
        ? new Response(v, { headers: { ...CORS, 'Content-Type': 'application/json' } })
        : json({ error: 'empty' }, 404);
    }

    if (req.method === 'PUT') {
      const body = await req.text();
      if (body.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
      try { JSON.parse(body); } catch { return json({ error: 'invalid_json' }, 400); }
      await env.SYNC.put(key, body); // ponytail: snapshot last-write-wins;客戶端開啟時先 pull,單人多裝置夠用
      return json({ ok: true });
    }
    return json({ error: 'method' }, 405);
  },
};
// ponytail: 公開端點,理論上有人狂打 PUT 可燒掉 KV 免費寫入(1000/天)。
// 真遇到再加 Cloudflare 內建 Rate Limiting 規則(免寫程式)或掛 Turnstile,先不做。
