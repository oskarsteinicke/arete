const CACHE = 'hvi-v5';
const ASSETS = ['/northstar/', '/northstar/index.html', '/northstar/style.css', '/northstar/data.js', '/northstar/app.js', '/northstar/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first for same-origin HTML/JS/CSS so updates are fresh; cache fallback for offline
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // don't intercept external APIs
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
