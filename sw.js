const CACHE = 'hsi-marketplace-v106';
const PRECACHE = [
  './', './about/', './activities/', './partners/', './marketplace/',
  './manifest.json', './icon-192.png', './icon-512.png', './translations.js',
  './app.js', './nav-auth.js',
  './about/app.js', './activities/app.js', './partners/app.js', './marketplace/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
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
  const url = new URL(e.request.url);
  if (url.hostname.includes('supabase')) return;

  // Network-first for everything we own. Falls back to cache only when the
  // network is unreachable. This guarantees the latest HTML, JS, and CSS ship
  // on every reload — the previous cache-first behaviour was leaving users
  // pinned to a stale app.js after a deploy.
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'opaque')) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
