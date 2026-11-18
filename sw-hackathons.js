// Campus Connect One Hackathons Service Worker v8
const CACHE_VERSION = 'hk-pwa-v8';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  'hackthons',
  'hackthons.html',
  'hackthons-portal',
  'hackthons-portal.html',
  'login-hackthons',
  'login-hackthons.html',
  'css/hackathons.css',
  'js/hackathons/hk-portal.js',
  'js/hackathons/hk-core.js',
  'js/hackathons/hk-ui.js',
  'js/hackathons/hk-dash.js',
  'js/hackathons/hk-host.js',
  'js/hackathons/hk-manage.js',
  'js/hackathons/hk-mailer.js',
  'js/hackathons/hk-login.js',
  'js/hackathons/hk-icons.js',
  'js/hackathons/hk-pwa.js',
  'manifest-hackathons.json',
  'icon.png',
  'icon/icon-hackathons.png',
  'icon/icon-hackathons-192.png',
  'icon/icon-hackathons-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => {
        return Promise.allSettled(
          SHELL_ASSETS.map((url) =>
            fetch(url, { cache: 'reload' })
              .then((res) => {
                if (res && (res.status === 200 || res.type === 'opaque')) {
                  return cache.put(url, res);
                }
              })
              .catch((err) => console.warn('[HK PWA SW] Pre-cache partial:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('hk-pwa-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isFirebaseOrApi(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|securetoken\.googleapis\.com|googleapis\.com|apis\.google\.com|gstatic\.com\/firebasejs|firebaseapp\.com|cloudfunctions\.net|identitytoolkit|firebasestorage|cloudinary\.com|\/__\/|\/api\//.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept non-GET requests

  const url = req.url;
  // Always bypass external APIs, Firebase Auth & Firestore
  if (isFirebaseOrApi(url)) return;

  // Navigation requests: Network-First with safe redirect handling
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (!res) {
            return caches.match(req, { ignoreSearch: true });
          }
          // Fix for Chromium ERR_FAILED: When a server responds with a redirect (e.g. 308 from .html to clean URL),
          // returning a response with redirected=true directly to event.respondWith() triggers ERR_FAILED in Chromium.
          // Unwrapping body & headers into a fresh clean Response bypasses the restriction safely.
          if (res.redirected) {
            return new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers
            });
          }
          if (res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          // Network unavailable: try exact and query-stripped cache matches
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;

          // Try alternate path without or with .html
          try {
            const path = new URL(req.url).pathname;
            const altPath = path.endsWith('.html') ? path.replace(/\.html$/, '') : (path + '.html');
            const altCached = await caches.match(altPath, { ignoreSearch: true });
            if (altCached) return altCached;
          } catch (e) {}

          // Fallback to cached shells
          const portal = await caches.match('hackthons-portal.html', { ignoreSearch: true }) ||
                         await caches.match('hackthons-portal', { ignoreSearch: true });
          if (portal) return portal;

          const login = await caches.match('login-hackthons.html', { ignoreSearch: true }) ||
                        await caches.match('login-hackthons', { ignoreSearch: true });
          if (login) return login;

          const landing = await caches.match('hackthons.html', { ignoreSearch: true }) ||
                          await caches.match('hackthons', { ignoreSearch: true });
          if (landing) return landing;

          // Fail-safe response (never return undefined which triggers ERR_FAILED)
          return new Response('Campus Connect One Hackathons is currently offline. Please reconnect and refresh.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Same-origin code/style assets: Network-First so ES module graphs never mix stale & new files
  if (url.startsWith(self.location.origin)) {
    let isCodeOrStyle = false;
    try { isCodeOrStyle = /\.(js|mjs|css|json)$/i.test(new URL(url).pathname); } catch {}
    if (isCodeOrStyle) {
      event.respondWith(
        fetch(req, { cache: 'no-cache' })
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => caches.match(req, { ignoreSearch: true }))
      );
      return;
    }

    // Images, icons, fonts: stale-while-revalidate
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
