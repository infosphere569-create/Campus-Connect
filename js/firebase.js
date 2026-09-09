import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
export const firebaseConfig={apiKey:'YOUR_FIREBASE_API_KEY',authDomain:'YOUR_PROJECT.firebaseapp.com',projectId:'YOUR_PROJECT_ID',storageBucket:'YOUR_PROJECT.firebasestorage.app',messagingSenderId:'YOUR_MESSAGING_SENDER_ID',appId:'YOUR_APP_ID'};
export const isFirebaseConfigured=Object.values(firebaseConfig).every(v=>v&&!String(v).includes('YOUR_'));
let app=null;export let auth=null;export let db=null;export let storage=null;
if(isFirebaseConfigured){app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);storage=getStorage(app)}
export {app};
