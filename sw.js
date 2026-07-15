// 離線快取:app shell + 題庫。stale-while-revalidate(先給快取、背景更新)。
// 改版要更新快取時,把 CACHE 版號 +1。

const CACHE = 'ipas-v43';
const SHELL = ['./', 'index.html', 'build.html', 'app.js', 'core.js', 'manifest.json', 'favicon.svg', 'questions.json', 'concepts.json', 'exam-dates.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL); // 核心檔:原子,任一失敗則安裝失敗(本來就該齊)
    // 帶圖題的圖:從 questions.json 撈出 best-effort 預載,離線也看得到圖;壞一張不影響其他
    try {
      const q = await (await (await c.match('questions.json')) || await fetch('questions.json')).json();
      const imgs = [...new Set(q.questions.filter((x) => x.image).map((x) => x.image))];
      await Promise.allSettled(imgs.map((u) => fetch(u).then((r) => r.ok && c.put(u, r))));
    } catch {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 推播:顯示通知
self.addEventListener('push', (e) => {
  let d = { title: 'iPAS 模考', body: '來刷幾題吧!', url: '/' };
  try { d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // 一律錨定到本 app 的 scope:payload 帶絕對路徑 '/' 會開到網域根(GitHub Pages 子站會跑掉)
  const raw = (e.notification.data && e.notification.data.url) || './';
  const url = new URL(raw.replace(/^\//, './'), self.registration.scope).href;
  // includeUncontrolled:沒加抓不到已安裝 PWA 的視窗 → 會在瀏覽器又開一個而非聚焦 app
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus();
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  // 只接管同源 GET;跨網域(同步 worker)不攔
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()).catch(() => {}); return res; }).catch(() => cached);
    return cached || net;
  }));
});
