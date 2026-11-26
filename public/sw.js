// Service Worker para Mi aula · Aplicaciones (PWA + resiliencia ante cortes de Wi-Fi)
const CACHE_NAME = 'mi-aula-v2';
const PRECACHE_URLS = [
  '/',
  '/abrir',
  '/favicon.svg',
  '/manifest.json',
  '/styles/tokens.css',
  '/styles/portal.css',
  '/styles/aula.css',
  '/scripts/portal.js',
  '/scripts/gate.js',
  '/scripts/qrcode.js',
  '/registro.js',
  '/assets/mercadito-cover.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache dynamic API, short code redirects, or teacher panel HTML
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/codigo/') ||
    url.pathname === '/docente' ||
    url.pathname === '/docente.html'
  ) {
    return;
  }

  // Cache-first for immutable media & icons
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/icon-192.png' ||
    url.pathname === '/icon-512.png'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return resp;
        });
      })
    );
    return;
  }

  // Network-first with cache fallback for portal, apps, JS and CSS
  // Use pathname-only key for app documents so ?libre=1 / ?aula=1 share cached HTML cleanly
  const cacheKey = url.pathname.startsWith('/apps/') && (url.pathname.endsWith('/') || url.pathname.endsWith('.html'))
    ? new Request(url.origin + url.pathname)
    : request;

  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(cacheKey, clone));
        }
        return resp;
      })
      .catch(() => caches.match(cacheKey))
  );
});
