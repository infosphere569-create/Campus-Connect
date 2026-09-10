// Campus Connect service worker.
// Bump this on every deploy so old clients pick up new files instead of stale cache.
const CACHE_VERSION = 'cc-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  'index.html','home.html','feed.html','grouplist.html','group.html','issues.html',
  'events.html','notifications.html','profile.html','settings.html','admin.html',
  'login.html','onboarding.html','report.html',
  'css/global.css','css/components.css','css/pages.css','css/responsive.css',
  'js/app.js','js/firebase.js','js/auth.js','js/theme.js','js/utils.js',
  'manifest.json','icon.png',
  'icons/icon-192.png','icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {}) // never let a missing/renamed file block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isFirebaseOrApi(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|googleapis\.com|gstatic\.com\/firebasejs|cloudfunctions\.net|identitytoolkit|firebasestorage|cloudinary\.com/.test(url);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept writes/callable POSTs
  const url = req.url;

  // Firebase/Firestore/Cloudinary traffic must always hit the network directly --
  // caching auth/data calls would show stale or wrong-user data.
  if (isFirebaseOrApi(url)) return;

  // Page navigations: network-first so logged-in users always see fresh content,
  // falling back to the cached shell page when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('home.html')))
    );
    return;
  }

  // Static same-origin assets (css/js/icons): stale-while-revalidate.
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
