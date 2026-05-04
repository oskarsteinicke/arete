const CACHE = 'ns-v25';
const ASSETS = [
  '/northstar/',
  '/northstar/index.html',
  '/northstar/style.css',
  '/northstar/data.js',
  '/northstar/app.js',
  '/northstar/workout.js',
  '/northstar/diet.js',
  '/northstar/coach.js',
  '/northstar/social.js',
  '/northstar/profile.js',
  '/northstar/manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never intercept API calls
  // Network first, fall back to cache for offline
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
