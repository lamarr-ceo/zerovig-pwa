const CACHE_NAME = 'zerovig-pwa-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/live_feed.json',
  '/manifest.json?v=8',
  '/icons/favicon.svg?v=8',
  '/icons/favicon-32.png?v=8',
  '/icons/apple-touch-icon.png?v=8',
  '/icons/icon-192.png?v=8',
  '/icons/icon-512.png?v=8'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Normalize live_feed.json requests by stripping ?t=... query params so 60s polling never bloats CacheStorage
  if (url.origin === self.location.origin && url.pathname.endsWith('/live_feed.json')) {
    const cleanFeedReq = new Request(url.origin + url.pathname);
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cleanFeedReq, clone));
          }
          return response;
        })
        .catch(() => caches.match(cleanFeedReq))
    );
    return;
  }

  // Always network-first for HTML navigation so live prop lines & slips are never stale
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    const cleanIndexReq = new Request(url.origin + '/index.html');
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cleanIndexReq, clone));
          }
          return response;
        })
        .catch(() => caches.match(cleanIndexReq))
    );
    return;
  }

  // Cache-first for static icons/manifests, normalized without cache-busting timestamps
  const cleanStaticReq = url.origin === self.location.origin && url.search.startsWith('?t=')
    ? new Request(url.origin + url.pathname)
    : event.request;

  event.respondWith(
    caches.match(cleanStaticReq).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cleanStaticReq, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
