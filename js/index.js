import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
import { subscribeAuth } from './auth.js';
import { subscribeNewsletter } from './services.js';
import { toast } from './utils.js';
import { initChatbot } from './chatbot.js';
import { db, functions } from './firebase.js';
import { doc, getDoc, collection, query, where, getCountFromServer } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import './pwa.js';

initChatbot();

const root = $('[data-landing]');
if (root) {
  root.querySelector('[data-theme-label]')?.setAttribute('title', `Theme: ${getTheme()}`);
}

// If already signed in, skip landing page and jump straight to the dashboard
subscribeAuth((user) => {
  const isDemo = sessionStorage.getItem('cc-demo') === '1';
  if (user || isDemo) {
    location.replace('home.html');
  }
});

// Live platform statistics from Firestore / Cloud Functions (no fake hardcoded numbers)
function animateCounter(el, target) {
  if (!el || typeof target !== 'number' || !Number.isFinite(target)) return;
  const start = performance.now();
  const dur = 800;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const val = Math.round((1 - Math.pow(1 - p, 3)) * target);
    el.textContent = val.toLocaleString('en-IN');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function loadLandingStats() {
  const els = [...document.querySelectorAll('[data-live-stat]')];
  if (!els.length) return;
  const stats = {};

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'publicStats', 'summary'));
      if (snap.exists()) Object.assign(stats, snap.data());
    } catch {}
    try {
      const hkCount = (await getCountFromServer(query(collection(db, 'hkHackathons'), where('status', '==', 'approved')))).data().count;
      if (typeof hkCount === 'number') stats.hackathons = Math.max(stats.hackathons || 0, hkCount);
    } catch {}
  }

  if (functions && (stats.students == null || stats.clubs == null || stats.resolvedIssues == null)) {
    try {
      const res = (await httpsCallable(functions, 'hkPublicStats')())?.data;
      if (res && typeof res === 'object') {
        Object.keys(res).forEach((k) => {
          if (typeof res[k] === 'number') stats[k] = typeof stats[k] === 'number' ? Math.max(stats[k], res[k]) : res[k];
        });
      }
    } catch {}
  }

  els.forEach((el) => {
    const key = el.getAttribute('data-live-stat');
    if (typeof stats[key] === 'number') animateCounter(el, stats[key]);
  });
}

loadLandingStats();

// Working Newsletter Subscription Listener
const nForm = document.getElementById('newsletterForm');
if (nForm) {
  nForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const msgDiv = document.getElementById('newsletterMsg');
    const subBtn = nForm.querySelector('button[type="submit"]');
    const email = emailInput?.value?.trim();

    if (!email) return;

    subBtn.disabled = true;
    const origText = subBtn.innerHTML;
    subBtn.innerHTML = '<span class="btn-spinner"></span> Subscribing…';

    try {
      await subscribeNewsletter(email);
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--success, #1f9d69)';
        msgDiv.textContent = 'Successfully subscribed to campus updates!';
      }
      toast('Subscribed to campus newsletter!', 'success');
      emailInput.value = '';
    } catch (err) {
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = err.message || 'Failed to subscribe.';
      }
      toast(err.message || 'Subscription failed', 'error');
    } finally {
      subBtn.disabled = false;
      subBtn.innerHTML = origText;
    }
  });
}
