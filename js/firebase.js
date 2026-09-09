import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

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

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app };
