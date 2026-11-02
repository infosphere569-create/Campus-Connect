// Campus Connect PWA Controller
// Handles PWA detection, native app feel, login-first gating, and PWA-only animated splash with Welcome Back greeting

export function isPWAMode() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    new URLSearchParams(location.search).get('pwa') === '1' ||
    sessionStorage.getItem('cc-is-pwa') === '1';

  if (standalone) {
    sessionStorage.setItem('cc-is-pwa', '1');
    document.documentElement.dataset.isPwa = 'true';
    document.body?.classList?.add('is-pwa-app');
  }
  return standalone;
}

export function initPWA() {
  const pwa = isPWAMode();
  const page = document.body?.dataset?.page || '';
  const isLanding = document.body?.hasAttribute('data-landing') || location.pathname.endsWith('index.html') || location.pathname === '/';

  // 1. PWA Route Gating: Skip marketing landing page in PWA.
  // Go straight to dashboard IF logged in, or login if NOT logged in.
  if (pwa && isLanding) {
    import('./auth.js').then(({ currentUser }) => {
      const demoAuth = sessionStorage.getItem('cc-demo') === '1' || localStorage.getItem('cc-demo') === '1';
      if (currentUser || demoAuth) {
        location.replace('home.html?pwa=1');
      } else {
        location.replace('login.html?mode=login&pwa=1');
      }
    }).catch(() => {
      location.replace('login.html?mode=login&pwa=1');
    });
    return;
  }

  // 2. Open Logo & Welcome Back Animation ONLY in PWA App
  if (pwa) {
    const splashAlreadyShown = sessionStorage.getItem('cc-pwa-splash-shown') === '1';
    if (!splashAlreadyShown && !document.getElementById('cc-pwa-splash')) {
      import('./auth.js').then(({ currentProfile, currentUser }) => {
        showPWASplash(currentProfile || currentUser);
      }).catch(() => {
        showPWASplash(null);
      });
    }
  }

  // 3. Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.warn('[PWA] Service worker registration:', err);
      });
    });
  }

  // 4. Offline status toast
  window.addEventListener('offline', () => {
    let offPill = document.getElementById('cc-offline-pill');
    if (!offPill) {
      offPill = document.createElement('div');
      offPill.id = 'cc-offline-pill';
      offPill.className = 'cc-offline-badge';
      offPill.innerHTML = '<span class="cc-offline-dot"></span> Offline mode · Using cached campus data';
      document.body.appendChild(offPill);
    }
  });

  window.addEventListener('online', () => {
    document.getElementById('cc-offline-pill')?.remove();
  });
}

export function showPWASplash(profile) {
  sessionStorage.setItem('cc-pwa-splash-shown', '1');

  const name = profile?.displayName || profile?.name || '';
  let titleText = 'Campus Connect';
  let subText = 'Your Campus. Your Community.';

  if (name) {
    const isNew = sessionStorage.getItem('cc-just-registered') === '1';
    if (isNew) {
      sessionStorage.removeItem('cc-just-registered');
      titleText = `Welcome, ${name.split(' ')[0]}!`;
      subText = 'Your campus profile is ready 🎉';
    } else {
      titleText = `Welcome Back!`;
      subText = `Glad to see you again, ${name.split(' ')[0]} 👋`;
    }
  }

  const splash = document.createElement('div');
  splash.id = 'cc-pwa-splash';
  splash.className = 'cc-pwa-splash-screen';
  splash.innerHTML = `
    <div class="cc-splash-content">
      <div class="cc-splash-glow"></div>
      <div class="cc-splash-logo-wrap">
        <div class="cc-splash-ring"></div>
        <img class="cc-splash-logo" src="icon.png" alt="Campus Connect">
      </div>
      <div class="cc-splash-title">${titleText}</div>
      <div class="cc-splash-sub">${subText}</div>
      <div class="cc-splash-loader">
        <div class="cc-splash-bar"></div>
      </div>
    </div>
  `;
  document.body.appendChild(splash);

  // Transition out after logo animation completes
  setTimeout(() => {
    splash.classList.add('cc-splash-hide');
    setTimeout(() => {
      splash.remove();
    }, 450);
  }, 1400);
}

// Auto-run on script execution
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
