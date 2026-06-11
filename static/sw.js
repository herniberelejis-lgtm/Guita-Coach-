/* Service worker: cache-first para estáticos, network-first para API. */
const CACHE = 'guita-v1';
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/api.js', '/static/js/auth.js', '/static/js/app.js',
  '/static/js/dashboard.js', '/static/js/transactions.js',
  '/static/js/insights.js', '/static/js/settings.js',
  '/static/js/chat.js', '/static/js/goals.js',
  '/static/manifest.json', '/static/icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/')) {
    // API: red primero; si no hay red, último cache conocido
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Estáticos: cache primero, actualiza en segundo plano
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
