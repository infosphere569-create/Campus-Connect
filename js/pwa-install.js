// PWA Install Prompt Banner & Registration
// Handles Chrome/Android/Desktop beforeinstallprompt and iOS Safari Add to Home Screen instructions

const SHOW_LIMIT = 5;
const COUNT_KEY = 'cc-install-shown-count';
const INSTALLED_KEY = 'cc-install-done';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

function alreadyInstalled() {
  return localStorage.getItem(INSTALLED_KEY) === '1' ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    sessionStorage.getItem('cc-is-pwa') === '1';
}
window.alreadyInstalled = alreadyInstalled;

function shownCount() {
  return Number(localStorage.getItem(COUNT_KEY) || 0);
}

let deferredPrompt = null;

function buildBanner() {
  if (document.querySelector('[data-pwa-install-banner]') || alreadyInstalled()) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-pwa-install-banner', '');
  bar.style.cssText = 'position:fixed;left:14px;right:14px;bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 58px);z-index:200;'
    + 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:18px;'
    + 'background:var(--surface,#11151e);border:1px solid var(--border,#232a37);'
    + 'box-shadow:0 18px 50px rgba(0,0,0,.35);animation:ccInstallUp .25s ease;max-width:540px;margin:0 auto;';
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
    if (!deferredPrompt) {
      // If on iOS Safari
      const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      if (isIOS) {
        showIOSInstallGuide();
      }
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') {
      localStorage.setItem(INSTALLED_KEY, '1');
    }
    deferredPrompt = null;
  });
}

function showIOSInstallGuide() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <section class="modal" role="dialog" style="max-width:380px">
      <div class="modal-head">
        <h3>Install on iPhone / iPad</h3>
        <button class="btn icon ghost" data-close-ios aria-label="Close"><i data-lucide="x"></i></button>
      </div>
      <div style="display:grid;gap:12px;font-size:.9rem;color:var(--muted)">
        <p>To install <strong>Campus Connect</strong> as an app on iOS:</p>
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
  window.lucide?.createIcons();
  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.closest('[data-close-ios]')) modal.remove();
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (alreadyInstalled() || shownCount() >= SHOW_LIMIT) return;
  localStorage.setItem(COUNT_KEY, String(shownCount() + 1));
  buildBanner();
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem(INSTALLED_KEY, '1');
  document.querySelector('[data-pwa-install-banner]')?.remove();
});
