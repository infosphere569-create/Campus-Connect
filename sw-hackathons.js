// Campus Connect One Hackathons Service Worker v1
const CACHE_VERSION = 'hk-pwa-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const SHELL_ASSETS = [
  '/hackthons.html',
  '/hackthons-portal.html',
  '/login-hackthons.html',
  '/css/hackathons.css',
  '/js/hackathons/hk-portal.js',
  '/js/hackathons/hk-core.js',
  '/js/hackathons/hk-ui.js',
  '/js/hackathons/hk-login.js',
  '/js/hackathons/hk-icons.js',
  '/icon.png',
  '/icon/icon-hackathons.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('hk-pwa-') && key !== SHELL_CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('/hackthons.html'));
    })
  );
});
