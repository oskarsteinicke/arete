const CACHE = 'hvi-v9';
const ASSETS = ['/northstar/', '/northstar/index.html', '/northstar/style.css?v=8', '/northstar/data.js?v=8', '/northstar/app.js?v=8', '/northstar/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting(); // activate new SW immediately, don't wait for tabs to close
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
      .then(clients => Promise.all(clients.map(c => c.navigate(c.url)))) // reload all open tabs
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
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
