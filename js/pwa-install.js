// Registers the service worker on every page, and shows a custom "Install app"
// banner (since browsers only fire beforeinstallprompt once and don't style it
// for you). Shown at most 5 times total across the whole site/lifetime, then
// stops -- and stops immediately for good once the app is actually installed.
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
    window.navigator.standalone === true; // iOS Safari home-screen launch
}

function shownCount() { return Number(localStorage.getItem(COUNT_KEY) || 0); }

let deferredPrompt = null;

function buildBanner() {
  if (document.querySelector('[data-pwa-install-banner]')) return;
  const bar = document.createElement('div');
  bar.setAttribute('data-pwa-install-banner', '');
  bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:200;'
    + 'display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;'
    + 'background:var(--surface,#11151e);border:1px solid var(--border,#232a37);'
    + 'box-shadow:0 18px 50px rgba(0,0,0,.28);animation:ccInstallUp .25s ease;';
  bar.innerHTML = `
    <img src="icon.png" alt="" style="width:38px;height:38px;border-radius:11px;flex:0 0 auto">
    <div style="flex:1;min-width:0">
      <strong style="display:block;font-size:.92rem;color:var(--text,#f5f7fb)">Install Campus Connect</strong>
      <span style="font-size:.8rem;color:var(--muted,#98a0b3)">Add it to your home screen for the full app experience.</span>
    </div>
    <button data-pwa-dismiss style="background:transparent;border:0;color:var(--muted,#98a0b3);font-weight:700;padding:8px;cursor:pointer">Later</button>
    <button data-pwa-install style="background:linear-gradient(135deg,#1f9d69,#22c07d);color:#fff;border:0;font-weight:800;padding:10px 16px;border-radius:11px;cursor:pointer;white-space:nowrap">Install</button>
  `;
  document.body.appendChild(bar);

  if (!document.getElementById('cc-install-style')) {
    const style = document.createElement('style');
    style.id = 'cc-install-style';
    style.textContent = '@keyframes ccInstallUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}';
    document.head.appendChild(style);
  }

  bar.querySelector('[data-pwa-dismiss]').addEventListener('click', () => bar.remove());
  bar.querySelector('[data-pwa-install]').addEventListener('click', async () => {
    bar.remove();
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    if (choice && choice.outcome === 'accepted') localStorage.setItem(INSTALLED_KEY, '1');
    deferredPrompt = null;
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
