// 離線快取:app shell + 題庫。stale-while-revalidate(先給快取、背景更新)。
// 改版要更新快取時,把 CACHE 版號 +1。
const CACHE = 'ipas-v2';
const SHELL = ['./', 'index.html', 'app.js', 'core.js', 'manifest.json', 'favicon.svg', 'questions.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  // 只接管同源 GET;跨網域(同步 worker)不攔
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(r);
    const net = fetch(r).then((res) => { if (res && res.ok) c.put(r, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
