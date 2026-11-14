import { auth, db, isFirebaseConfigured } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { doc, getDoc, getDocFromCache, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { toast, demoProfile } from './utils.js';

export let currentUser = null; 
export let currentProfile = null;

export async function ensureProfile(user, extra = {}) {
  if (!user) return null;
  if (!db) {
    currentProfile = { ...demoProfile(), ...extra, uid: user.uid || 'demo-user', displayName: user.displayName || extra.displayName || demoProfile().displayName };
    return currentProfile;
  }
  const ref = doc(db, 'users', user.uid);
  let snap = null;
  let offline = false;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    offline = true;
    try {
      snap = await getDocFromCache(ref);
    } catch {}
  }
  if (snap && snap.exists()) {
    currentProfile = { uid: user.uid, ...snap.data() };
    return currentProfile;
  }
  currentProfile = {
    uid: user.uid,
    displayName: user.displayName || extra.displayName || '',
    photoURL: user.photoURL || '',
    role: 'student',
    isActive: true,
    ...extra,
    ...(offline ? { _offlineFallback: true } : {})
  };
  if (!offline) {
    const searchName = String(currentProfile.displayName || '').trim().toLowerCase();
    try {
      await setDoc(ref, { ...currentProfile, searchName, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } catch (e) {
      console.warn('[Auth] Profile write deferred:', e?.message || e);
    }
  }
  return currentProfile;
}

export function profileNeedsOnboarding(profile) {
  return Boolean(profile && profile.uid !== 'demo-user' && (!profile.course || !profile.branch || !profile.year || !profile.college));
}

export function subscribeAuth(cb) {
  const isDemoActive = sessionStorage.getItem('cc-demo') === '1' || localStorage.getItem('cc-demo') === '1';

  if (!isFirebaseConfigured || !auth) {
    if (isDemoActive) {
      currentUser = { uid: 'demo-user', displayName: demoProfile().displayName };
      currentProfile = demoProfile();
    } else {
      currentUser = null;
      currentProfile = null;
    }
    document.documentElement.dataset.firebaseReady = 'false';
    const page = document.body.dataset.page;
    if (!currentUser && page && page !== 'login' && page !== 'landing' && !location.pathname.endsWith('index.html') && location.pathname !== '/') {
      location.href = 'login.html';
      return () => {};
    }
    queueMicrotask(() => cb(currentUser, currentProfile));
    return () => {};
  }

  document.documentElement.dataset.firebaseReady = 'true';
  return onAuthStateChanged(auth, async user => {
    if (!user && isDemoActive) {
      currentUser = { uid: 'demo-user', displayName: demoProfile().displayName };
      currentProfile = demoProfile();
      cb(currentUser, currentProfile);
      return;
    }

    currentUser = user;
    try {
      currentProfile = user ? await ensureProfile(user) : null;
    } catch (e) {
      console.warn('[Auth] ensureProfile error:', e?.message || e);
      currentProfile = user ? { uid: user.uid, displayName: user.displayName || '', photoURL: user.photoURL || '', role: 'student', isActive: true, _offlineFallback: true } : null;
    }
    const page = document.body.dataset.page;

    if (!currentUser && page && page !== 'login' && page !== 'landing' && !location.pathname.endsWith('index.html') && location.pathname !== '/') {
      location.href = 'login.html';
      return;
    }

    if (user && !currentProfile?._offlineFallback && profileNeedsOnboarding(currentProfile) && page !== 'onboarding') {
      location.href = 'onboarding.html';
      return;
    }

    cb(user, currentProfile);
  });
}

export async function login(email, password) {
  if (!auth) throw new Error('Firebase is not configured. Demo mode is available for UI testing.');
  return signInWithEmailAndPassword(auth, email, password);
}

export async function register({ email, password, displayName, profile = {} }) {
  if (!auth) throw new Error('Firebase is not configured.');
  sessionStorage.setItem('cc-just-registered', '1');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await ensureProfile(cred.user, { displayName, ...profile });
  return cred.user;
}

export async function googleLogin() {
  if (!auth) throw new Error('Firebase is not configured.');
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export async function resetPassword(email) {
  if (!auth) throw new Error('Firebase is not configured.');
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  if (auth) await signOut(auth);
  sessionStorage.removeItem('cc-demo');
  localStorage.removeItem('cc-demo');
  sessionStorage.removeItem('cc-pwa-splash-shown');
  location.href = 'login.html';
}

export function requireAuth() {
  if (!currentUser) {
    location.href = 'login.html';
    return false;
  }
  if (currentProfile?.isActive === false) {
    toast('Your account is currently inactive.', 'error');
    logout();
    return false;
  }
  return true;
}

export function hasRole(...roles) {
  return Boolean(currentProfile?.role && roles.includes(currentProfile.role));
}

export function demoLogin() {
  currentUser = { uid: 'demo-user', displayName: 'Ayush Kumar' };
  currentProfile = demoProfile();
  sessionStorage.setItem('cc-demo', '1');
  sessionStorage.setItem('cc-just-registered', '1');
  location.href = 'home.html';
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-logout]')) logout();
});
