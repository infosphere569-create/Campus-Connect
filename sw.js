// Campus Connect One Service Worker v24
const CACHE_VERSION = 'cc-v24';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  '/',
  'index.html',
  'home.html',
  'feed.html',
  'grouplist.html',
  'group.html',
  'issues.html',
  'events.html',
  'notifications.html',
  'profile.html',
  'settings.html',
  'saved.html',
  'contact.html',
  'about.html',
  'admin.html',
  'login.html',
  'hackthons.html',
  'hackathon.html',
  'login-hackthons.html',
  'hackthons-portal.html',
  'hackthons-admin.html',
  'css/hackathons.css',
  'js/hackathons/hk-public.js',
  'onboarding.html',
  'report.html',
  'css/global.css',
  'css/components.css',
  'css/pages.css',
  'css/responsive.css',
  'js/app.js',
  'js/spa-router.js',
  'js/contact.js',
  'js/firebase.js',
  'js/auth.js',
  'js/theme.js',
  'js/utils.js',
  'js/pwa.js',
  'js/pwa-install.js',
  'manifest.json',
  'icon.png',
  'icon/icon-192.png',
  'icon/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((err) => console.warn('[PWA SW] Pre-caching partial:', err))
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
  if (req.method !== 'GET') return; // never intercept non-GET
  const url = req.url;

  // Firebase/Firestore/Cloudinary/API requests must always bypass SW cache to prevent stale auth/data
  if (isFirebaseOrApi(url)) return;

  // Page navigations: network-first, fallback to cached home.html/shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        return caches.match(req).then((r) => r || caches.match('home.html') || caches.match('index.html'));
      })
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate
  if (url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
