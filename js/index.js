import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { subscribeNewsletter } from './services.js';
import { toast } from './utils.js';
import { initChatbot } from './chatbot.js';
import { auth, db, functions, isFirebaseConfigured } from './firebase.js';
import { doc, getDoc, getDocFromCache, collection, query, where, getCountFromServer } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { initQuickRsvp, hydrateQuickRsvpButtons } from './quick-rsvp.js';
import './pwa.js';

initChatbot();
initQuickRsvp();
hydrateQuickRsvpButtons(document);

const root = $('[data-landing]');
if (root) {
  root.querySelector('[data-theme-label]')?.setAttribute('title', `Theme: ${getTheme()}`);
}

// Live platform statistics from Firestore / Cloud Functions (no fake hardcoded numbers)
// Features scroll-triggered viewport detection that animates numbers from zero to final values.
const liveStatsState = {
  data: {},
  inView: false,
  animatedKeys: new Set(),
};

function animateCounter(el, target, duration = 1200) {
  if (!el || typeof target !== 'number' || !Number.isFinite(target)) return;

  // Respect user preference for reduced motion
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target.toLocaleString('en-IN');
    return;
  }

  // Ensure starting value is visibly zero
  el.textContent = '0';
  if (target === 0) return;

  const start = performance.now();
  // Smooth quartic ease-out for a snappy start and a gentle resting stop
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  const tick = (now) => {
    const elapsed = now - start;
    const progress = Math.min(1, Math.max(0, elapsed / duration));
    const val = Math.round(easeOutQuart(progress) * target);
    el.textContent = val.toLocaleString('en-IN');

    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = target.toLocaleString('en-IN');
    }
  };

  requestAnimationFrame(tick);
}

function triggerStatsAnimation() {
  if (!liveStatsState.inView) return;
  const els = [...document.querySelectorAll('[data-live-stat]')];
  els.forEach((el, index) => {
    const key = el.getAttribute('data-live-stat');
    const val = liveStatsState.data[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (liveStatsState.animatedKeys.has(key)) return;
      liveStatsState.animatedKeys.add(key);
      // Staggered roll-in across the cards for visual polish
      setTimeout(() => {
        animateCounter(el, val, 1200);
      }, index * 90);
    }
  });
}

function initLiveStatsScrollTrigger() {
  const statsSection = document.getElementById('live-stats') || document.querySelector('.live-stats-section') || document.querySelector('[data-live-stat]')?.closest('section');

  // Prime any stat elements to 0
  document.querySelectorAll('[data-live-stat]').forEach((el) => {
    if (!el.textContent || el.textContent.trim() === '—' || el.textContent.trim() === '') {
      el.textContent = '0';
    }
  });

  if (!statsSection) {
    liveStatsState.inView = true;
    triggerStatsAnimation();
    return;
  }

  if (typeof IntersectionObserver === 'undefined') {
    liveStatsState.inView = true;
    triggerStatsAnimation();
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          liveStatsState.inView = true;
          triggerStatsAnimation();
          obs.disconnect(); // Trigger once when entering viewport
        }
      });
    },
    {
      root: null,
      threshold: 0.15,
      rootMargin: '0px 0px -20px 0px',
    }
  );

  observer.observe(statsSection);
}

let statsStarted = false;
async function loadLandingStats() {
  if (statsStarted) return;
  statsStarted = true;
  const els = [...document.querySelectorAll('[data-live-stat]')];
  if (!els.length) return;
  const stats = {};
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;

  if (db) {
    try {
      const ref = doc(db, 'publicStats', 'summary');
      const snap = online ? await getDoc(ref) : await getDocFromCache(ref);
      if (snap.exists()) Object.assign(stats, snap.data());
    } catch {}
    if (online) {
      try {
        const hkCount = (await getCountFromServer(query(collection(db, 'hkHackathons'), where('status', '==', 'approved')))).data().count;
        if (typeof hkCount === 'number') stats.hackathons = Math.max(stats.hackathons || 0, hkCount);
      } catch {}
    }
  }

  if (online && functions && (stats.students == null || stats.clubs == null || stats.resolvedIssues == null)) {
    try {
      const res = (await httpsCallable(functions, 'hkPublicStats')())?.data;
      if (res && typeof res === 'object') {
        Object.keys(res).forEach((k) => {
          if (typeof res[k] === 'number') stats[k] = typeof stats[k] === 'number' ? Math.max(stats[k], res[k]) : res[k];
        });
      }
    } catch {}
  }

  Object.assign(liveStatsState.data, stats);
  triggerStatsAnimation();
}

// Check demo or signed-in state first so we don't fire network requests that get aborted on redirect
const isDemo = sessionStorage.getItem('cc-demo') === '1' || localStorage.getItem('cc-demo') === '1';
if (isDemo) {
  location.replace('home.html');
} else {
  initLiveStatsScrollTrigger();
  if (!isFirebaseConfigured || !auth) {
    document.documentElement.dataset.firebaseReady = 'false';
    loadLandingStats();
  } else {
    document.documentElement.dataset.firebaseReady = 'true';
    onAuthStateChanged(auth, (user) => {
      if (user) {
        location.replace('home.html');
        return;
      }
      loadLandingStats();
    });
  }
}

// Working Newsletter Subscription Listener with real-time email validation and feedback
const nForm = document.getElementById('newsletterForm');
if (nForm) {
  const emailInput = document.getElementById('newsletterEmail');
  const msgDiv = document.getElementById('newsletterMsg');
  const subBtn = nForm.querySelector('button[type="submit"]');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (emailInput && msgDiv) {
    emailInput.addEventListener('input', () => {
      const val = emailInput.value.trim();
      if (!val) {
        msgDiv.hidden = true;
        emailInput.style.borderColor = '';
      } else if (!emailRegex.test(val)) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = 'Please enter a valid email address (e.g. name@college.edu)';
        emailInput.style.borderColor = 'var(--danger, #c44949)';
      } else {
        msgDiv.hidden = true;
        emailInput.style.borderColor = 'var(--success, #1f9d69)';
      }
    });
  }

  nForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput?.value?.trim();

    if (!email) {
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = 'Email address is required.';
      }
      return;
    }

    if (!emailRegex.test(email)) {
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = 'Please enter a valid email address before subscribing.';
      }
      toast('Please enter a valid email address', 'error');
      return;
    }

    if (subBtn) {
      subBtn.disabled = true;
      subBtn.dataset.origText = subBtn.innerHTML;
      subBtn.innerHTML = '<span class="btn-spinner"></span> Subscribing…';
    }

    if (msgDiv) {
      msgDiv.hidden = false;
      msgDiv.style.color = 'var(--text-muted, #71717a)';
      msgDiv.textContent = 'Subscribing your email…';
    }

    try {
      await subscribeNewsletter(email);
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--success, #1f9d69)';
        msgDiv.textContent = '✓ Successfully subscribed to campus weekly updates!';
      }
      toast('Subscribed to campus newsletter!', 'success');
      if (emailInput) {
        emailInput.value = '';
        emailInput.style.borderColor = '';
      }
    } catch (err) {
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = err.message || 'Failed to subscribe. Please try again.';
      }
      toast(err.message || 'Subscription failed', 'error');
    } finally {
      if (subBtn) {
        subBtn.disabled = false;
        subBtn.innerHTML = subBtn.dataset.origText || 'Subscribe';
      }
    }
  });
}
