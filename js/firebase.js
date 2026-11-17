import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  enableNetwork,
  disableNetwork
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBVyhSIm_qwuh5JK8Ww5V9Z7uzZaFWjiqY',
  authDomain: 'campus-connect-2985d.firebaseapp.com',
  projectId: 'campus-connect-2985d',
  storageBucket: 'campus-connect-2985d.firebasestorage.app',
  messagingSenderId: '536661587012',
  appId: '1:536661587012:web:3805f2857c7893930c7811',
  measurementId: 'G-8P8GM3E0JV'
};

export const isFirebaseConfigured = Object.values(firebaseConfig)
  .every(v => v && !String(v).includes('YOUR_'));

let app = null;
export let auth = null;
export let db = null;
export let storage = null;
export let functions = null;

// Guard against Firestore SDK emitting noisy console.error when browser/preview is offline or backend times out and falls back to local cache
if (typeof window !== 'undefined' && !window.__ccFirestoreConsolePatched) {
  window.__ccFirestoreConsolePatched = true;
  const origError = console.error.bind(console);
  console.error = (...args) => {
    const msg = args.map(a => (a && a.message) ? a.message : String(a || '')).join(' ');
    if (
      msg.includes('@firebase/firestore') &&
      msg.includes('Could not reach Cloud Firestore backend')
    ) {
      console.warn('[Firestore offline fallback] Backend unavailable; continuing with local cache.');
      return;
    }
    origError(...args);
  };
}

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e1) {
    try {
      db = initializeFirestore(app, {
        experimentalAutoDetectLongPolling: true,
        localCache: memoryLocalCache()
      });
    } catch (e2) {
      db = getFirestore(app);
    }
  }

  if (db && typeof window !== 'undefined') {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      disableNetwork(db).catch(() => {});
    }
    window.addEventListener('offline', () => {
      disableNetwork(db).catch(() => {});
    });
    window.addEventListener('online', () => {
      enableNetwork(db).catch(() => {});
    });
  }

  storage = getStorage(app);
  functions = getFunctions(app);
}

export { app };
