// Hackathons PWA Install Banner & Service Worker Registration
let hkDeferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw-hackathons.js').catch(err => console.warn('[HK PWA] SW Error:', err));
  });
}

async function checkHkInstalled() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       window.navigator.standalone === true ||
                       sessionStorage.getItem('hk-is-pwa') === '1';
  if (isStandalone) {
    localStorage.setItem('hk-install-done', '1');
    return true;
  }
  return localStorage.getItem('hk-install-done') === '1';
}

function buildHkInstallBanner() {
  if (document.querySelector('[data-hk-pwa-banner]') || localStorage.getItem('hk-install-done') === '1') return;
  const bar = document.createElement('div');
  bar.setAttribute('data-hk-pwa-banner', '');
  bar.style.cssText = 'position:fixed;left:14px;right:14px;bottom:calc(max(14px,env(safe-area-inset-bottom,14px)) + 20px);z-index:110000;'
    + 'display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:18px;'
    + 'background:#0b1410;border:1px solid #178a54;'
    + 'box-shadow:0 18px 50px rgba(0,0,0,.55);animation:hkInstallUp .25s ease;max-width:540px;margin:0 auto;color:#fff;';
  bar.innerHTML = `
    <div style="width:40px;height:40px;border-radius:12px;background:#178a54;display:grid;place-items:center;flex:0 0 auto;color:#fff">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
    </div>
    <div style="flex:1;min-width:0">
      <strong style="display:block;font-size:.92rem;color:#fff">Install Hackathons App</strong>
      <span style="font-size:.8rem;color:#98a0b3">Launch campus hackathons instantly from your home screen.</span>
    </div>
    <button data-hk-dismiss style="background:transparent;border:0;color:#98a0b3;font-weight:700;padding:8px;cursor:pointer">Later</button>
    <button data-hk-install style="background:#178a54;color:#fff;border:0;font-weight:800;padding:9px 15px;border-radius:11px;cursor:pointer;white-space:nowrap">Install</button>
  `;
  document.body.appendChild(bar);

  if (!document.getElementById('hk-install-style')) {
    const style = document.createElement('style');
    style.id = 'hk-install-style';
    style.textContent = '@keyframes hkInstallUp{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}';
    document.head.appendChild(style);
  }

  bar.querySelector('[data-hk-dismiss]')?.addEventListener('click', () => bar.remove());
  bar.querySelector('[data-hk-install]')?.addEventListener('click', async () => {
    bar.remove();
    if (hkDeferredPrompt) {
      hkDeferredPrompt.prompt();
      const choice = await hkDeferredPrompt.userChoice.catch(() => null);
      if (choice && choice.outcome === 'accepted') {
        localStorage.setItem('hk-install-done', '1');
      }
      hkDeferredPrompt = null;
    } else {
      alert('To install, tap your browser menu (⋮ or ⋯) and select "Add to Home Screen" or "Install App".');
    }
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  hkDeferredPrompt = e;
  if (!checkHkInstalled()) {
    buildHkInstallBanner();
  }
});
