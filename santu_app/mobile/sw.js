/* 四土 · 手机版 service worker —— 网络优先 + 缓存兜底。
   在线时永远拿最新（不会缓存住开发改动）；离线时回退已缓存的壳，让「加到主屏」能打开。
   /api 一律不缓存（动态 + 多为 POST）。 */
const CACHE = 'situ-mobile-v2';   // bump：强制重装并清掉 v1 旧缓存（曾把桌面复盘窗的旧 JS/壳缓存死）
const SHELL = [
  './', 'index.html', 'app.js', 'vocab.js', 'settings.js', 'style.css?v=2',
  'fonts.css', 'fonts/bitter-400.woff2', 'fonts/bitter-600.woff2',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API 的 POST 等：直接走网络
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;  // 动态接口不缓存

  // 同源：网络优先，成功就顺手更新缓存；失败回退缓存（离线壳）
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('index.html')))
    );
    return;
  }

  // 跨源（如 Google Fonts）：缓存优先，背后再更新
  e.respondWith(
    caches.match(req).then(m => m || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => m))
  );
});
