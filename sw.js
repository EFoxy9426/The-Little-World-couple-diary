/* 小小世界 PWA Service Worker（网络优先：保证每次部署都能拿到最新代码） */
var CACHE = 'xx-world-v3';
var ASSETS = ['/', '/cloud/app.html', '/cloud/index.html', '/styles.css', '/js/store.js', '/js/app.js', '/js/cloud-store.js', '/js/vendor/supabase.js', '/cloud/cloud-store.js', '/cloud/config.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS).catch(function () {}); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('/cloud/app.html');
        return new Response('offline', { status: 503, statusText: 'offline' });
      });
    })
  );
});

/* 新版本就绪时，让页面自动重载一次，确保用上最新代码 */
self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
