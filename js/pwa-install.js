// PWA Install Prompt Banner, Detection & Reactive State
// Handles Chrome/Android/Desktop beforeinstallprompt, live uninstall detection, and iOS Safari instructions

const SHOW_LIMIT = 50;
const COUNT_KEY = 'cc-install-shown-count';
const INSTALLED_KEY = 'cc-install-done';

const debug = (msg) => console.log(`[PWA Debug] ${msg}`);

let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Check whether app is installed or standalone
async function checkIsInstalled() {
  // 1. Standalone display mode (active PWA window on desktop/mobile)
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      sessionStorage.getItem('cc-is-pwa') === '1') {
    localStorage.setItem(INSTALLED_KEY, '1');
    return true;
  }

  // 2. Browser API to check installed web apps
  if ('getInstalledRelatedApps' in navigator) {
    try {
      const apps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(apps)) {
        if (apps.length > 0) {
          localStorage.setItem(INSTALLED_KEY, '1');
          return true;
        } else {
          // Be conservative: don't clear INSTALLED_KEY just because the list is empty,
          // as it might be an API limitation in some contexts.
          return localStorage.getItem(INSTALLED_KEY) === '1';
        }
      }
    } catch (e) {}
  }

  return localStorage.getItem(INSTALLED_KEY) === '1';
}

function alreadyInstalled() {
  return localStorage.getItem(INSTALLED_KEY) === '1' ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    sessionStorage.getItem('cc-is-pwa') === '1';
}

window.alreadyInstalled = alreadyInstalled;
window.checkIsInstalled = checkIsInstalled;

function shownCount() {
  return Number(localStorage.getItem(COUNT_KEY) || 0);
}

// Synchronize all PWA Install buttons on the page with reactive green card fill and live uninstall detection
async function syncInstallUI() {
  const isInstalled = await checkIsInstalled();
  const heroBtn = document.getElementById('heroInstallBtn');
  if (heroBtn) {
    if (isInstalled) {
      heroBtn.classList.add('is-installed');
      heroBtn.setAttribute('data-installed', 'true');
      heroBtn.innerHTML = `
        <span class="pwa-btn-content">
          <span class="pwa-installed-dot" aria-hidden="true"></span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span class="pwa-btn-text">App Installed</span>
          <span class="pwa-tag">Active</span>
        </span>
      `;
      heroBtn.setAttribute('title', 'Campus Connect is installed on your device');
    } else {
      heroBtn.classList.remove('is-installed');
      heroBtn.removeAttribute('data-installed');
      heroBtn.innerHTML = `
        <span class="pwa-btn-content">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="pwa-btn-text">Install App</span>
          <span class="pwa-tag">PWA</span>
        </span>
      `;
      heroBtn.setAttribute('title', 'Install Campus Connect as a standalone fast app');
    }
  }
}
window.syncInstallUI = syncInstallUI;

// Trigger prompt or fallback guide
async function triggerPWAInstall() {
  const isInstalled = await checkIsInstalled();
  if (isInstalled) {
    showInstalledNotice();
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1');
      syncInstallUI();
    }
    deferredPrompt = null;
    return;
  }

  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  if (isIOS) {
    showIOSInstallGuide();
    return;
  }

  showInstallInstructionsModal();
}
window.triggerPWAInstall = triggerPWAInstall;

function showInstalledNotice() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" style="max-width:400px;text-align:center;padding:24px 20px">
      <div style="width:54px;height:54px;border-radius:18px;background:color-mix(in srgb, #10b981 18%, transparent);color:#10b981;display:grid;place-items:center;margin:0 auto 14px">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h3 style="margin:0 0 8px;font-size:1.2rem">Campus Connect is Installed!</h3>
      <p style="margin:0 0 18px;font-size:.9rem;color:var(--muted)">The app is installed on your device. You can launch it directly from your desktop, taskbar, or phone home screen with native performance.</p>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn ghost sm" data-close-installed>Close</button>
        <a class="btn primary sm" href="home.html">Open Dashboard</a>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close-installed]')) modal.remove();
  });
}

function showInstallInstructionsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" style="max-width:420px;padding:24px">
      <div class="modal-head" style="margin-bottom:14px">
        <h3 style="margin:0">Install Campus Connect</h3>
        <button class="btn icon ghost" data-close-guide aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div style="display:grid;gap:12px;font-size:.9rem;color:var(--muted)">
        <div style="display:flex;align-items:flex-start;gap:12px;background:var(--surface-2);padding:12px;border-radius:14px">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:.78rem;flex:0 0 auto">1</div>
          <div>Look at your browser's address bar (top right) and click the <strong>Install</strong> icon (an arrow or monitor with a plus).</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;background:var(--surface-2);padding:12px;border-radius:14px">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:.78rem;flex:0 0 auto">2</div>
          <div>Or open the browser menu (⋮ or ⋯) and choose <strong>"Install Campus Connect..."</strong> or <strong>"Add to Home Screen"</strong>.</div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;background:var(--surface-2);padding:12px;border-radius:14px">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-size:.78rem;flex:0 0 auto">3</div>
          <div>The app will immediately install with offline support and standalone app navigation.</div>
        </div>
      </div>
      <div style="text-align:right;margin-top:18px">
        <button class="btn primary sm" data-close-guide>Understood</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close-guide]')) modal.remove();
  });
}

function showIOSInstallGuide() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" style="max-width:380px;padding:24px">
      <div class="modal-head" style="margin-bottom:14px">
        <h3 style="margin:0">Install on iPhone / iPad</h3>
        <button class="btn icon ghost" data-close-ios aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div style="display:grid;gap:12px;font-size:.9rem;color:var(--muted)">
        <p style="margin:0">To install <strong>Campus Connect</strong> as an app on iOS Safari:</p>
        <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);padding:10px;border-radius:12px">
          <strong>1.</strong> Tap the <strong>Share</strong> button in Safari's bottom toolbar.
        </div>
        <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);padding:10px;border-radius:12px">
          <strong>2.</strong> Scroll down and tap <strong>Add to Home Screen</strong>.
        </div>
        <div style="display:flex;align-items:center;gap:10px;background:var(--surface-2);padding:10px;border-radius:12px">
          <strong>3.</strong> Tap <strong>Add</strong> in the top-right corner.
        </div>
      </div>
      <div style="text-align:right;margin-top:16px">
        <button class="btn primary sm" data-close-ios>Got it</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close-ios]')) modal.remove();
  });
}

function buildBanner() {
  if (document.querySelector('[data-pwa-install-banner]') || alreadyInstalled()) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-pwa-install-banner', '');
  bar.style.cssText = 'position:fixed;left:14px;right:14px;bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 82px);z-index:110000;'
    + 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:18px;'
    + 'background:var(--surface,#11151e);border:1px solid var(--border,#232a37);'
    + 'box-shadow:0 18px 50px rgba(0,0,0,.45);animation:ccInstallUp .25s ease;max-width:540px;margin:0 auto;';
  bar.innerHTML = `
    <img src="icon.png" alt="" style="width:40px;height:40px;border-radius:12px;flex:0 0 auto;object-fit:cover">
    <div style="flex:1;min-width:0">
      <strong style="display:block;font-size:.92rem;color:var(--text,#f5f7fb)">Install Campus Connect</strong>
      <span style="font-size:.8rem;color:var(--muted,#98a0b3)">Add to home screen for the full mobile app experience.</span>
    </div>
    <button data-pwa-dismiss style="background:transparent;border:0;color:var(--muted,#98a0b3);font-weight:700;padding:8px;cursor:pointer">Later</button>
    <button data-pwa-install style="background:linear-gradient(135deg,#5b5cf0,#8b7cf6);color:#fff;border:0;font-weight:800;padding:9px 15px;border-radius:11px;cursor:pointer;white-space:nowrap">Install</button>
  `;
  document.body.appendChild(bar);

  if (!document.getElementById('cc-install-style')) {
    const style = document.createElement('style');
    style.id = 'cc-install-style';
    style.textContent = '@keyframes ccInstallUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}';
    document.head.appendChild(style);
  }

  bar.querySelector('[data-pwa-dismiss]')?.addEventListener('click', () => bar.remove());
  bar.querySelector('[data-pwa-install]')?.addEventListener('click', async () => {
    bar.remove();
    await triggerPWAInstall();
  });
}

// Global click delegation for hero install button
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#heroInstallBtn');
  if (btn) {
    triggerPWAInstall();
  }
});

// Capture browser beforeinstallprompt
window.addEventListener('beforeinstallprompt', (e) => {
  debug('beforeinstallprompt event fired');
  e.preventDefault();
  deferredPrompt = e;
  syncInstallUI();
  
  const installed = alreadyInstalled();
  const count = shownCount();
  debug(`Check: installed=${installed}, count=${count}/${SHOW_LIMIT}`);

  if (installed || count >= SHOW_LIMIT) {
    debug('Banner conditions not met (already installed or limit reached)');
    return;
  }
  
  if (!document.querySelector('[data-pwa-install-banner]')) {
    debug('Showing PWA install banner');
    localStorage.setItem(COUNT_KEY, String(count + 1));
    buildBanner();
  }
});

// App installed event
window.addEventListener('appinstalled', () => {
  localStorage.setItem(INSTALLED_KEY, '1');
  syncInstallUI();
  document.querySelector('[data-pwa-install-banner]')?.remove();
});

// Reactive state detection: Check immediately on load, focus, visibilitychange, and intervals
window.addEventListener('DOMContentLoaded', syncInstallUI);
window.addEventListener('load', syncInstallUI);
window.addEventListener('focus', syncInstallUI);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) syncInstallUI();
});
if (window.matchMedia) {
  window.matchMedia('(display-mode: standalone)').addEventListener('change', syncInstallUI);
}
// Periodic check to immediately detect if user uninstalls from browser menu or settings
setInterval(syncInstallUI, 2000);
