import { initBg } from './hk-bg.js';
import { $, $$, initTheme, fetchApproved, enrich, cachedLocation, publicStats, publicShareUrl, safeUrl, watchUser, shareHackathon, icons } from './hk-core.js';
import { card, empty, bindReveal, countUp } from './hk-ui.js';

const toggleTheme = initTheme();
initBg($('#hkBg'));
$('#themeBtn').onclick = toggleTheme;
$('#yr').textContent = new Date().getFullYear();
addEventListener('scroll', () => $('#nav').classList.toggle('stuck', scrollY > 8), { passive: true });
bindReveal();

let currentUser = null;
let currentHk = null;
watchUser((user, { hk }) => {
  currentUser = user;
  currentHk = hk || null;
});

function shareRoleFor(h){
  try {
    if(sessionStorage.getItem('hk-role') === 'host') return 'host';
  } catch {}
  if(currentUser && h?.hostUid && h.hostUid === currentUser.uid) return 'host';
  if(currentHk?.activeRole === 'host') return 'host';
  return 'participant';
}

function injectEventListLd(list){
  if(!list.length) return;
  const old = document.getElementById('hkListLd');
  if(old) old.remove();
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.id = 'hkListLd';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Live Student Hackathons on Campus Connect One',
    itemListElement: list.slice(0, 20).map((h, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'Event',
        name: h.title,
        description: h.tagline || h.description || '',
        url: publicShareUrl(h.id),
        image: safeUrl(h.bannerURL || h.thumbURL) || 'https://campusconnectone.online/icon.png',
        startDate: h.startMs ? new Date(h.startMs).toISOString() : undefined,
        endDate: h.endMs ? new Date(h.endMs).toISOString() : undefined,
        location: h.mode === 'online'
          ? { '@type': 'VirtualLocation', url: publicShareUrl(h.id) }
          : { '@type': 'Place', name: h.college || h.city || 'Campus' }
      }
    }))
  });
  document.head.appendChild(ld);
}

// Live counters: real numbers from the backend (cached server-side for 10 minutes). No fake fallback values.
(async () => {
  let stats = null;
  try { stats = await publicStats(); } catch(e){ console.warn('stats unavailable', e.message); }
  const run = () => $$('[data-n]').forEach(el => { const v = stats?.[el.dataset.n]; if(typeof v === 'number') countUp(el, v); });
  if(!stats) return; // leaves "—" in place rather than showing invented numbers
  const box = $('#stats');
  if(!('IntersectionObserver' in window)) return run();
  const io = new IntersectionObserver(es => { if(es.some(x => x.isIntersecting)){ run(); io.disconnect(); } }, { threshold: .25 });
  io.observe(box);
})();

(async () => {
  const list = $('#featuredList');
  let items = [];
  try { items = await fetchApproved(); } catch(e){ console.warn(e); }
  const now = Date.now();
  const live = items.filter(h => !(h.endMs && now > h.endMs));
  const ranked = enrich(live, { loc: cachedLocation() }).sort((a, b) => b._trend - a._trend);
  injectEventListLd(ranked);
  list.innerHTML = ranked.length
    ? ranked.slice(0, 6).map((h, i) => card(h, i, { publicLinks: true })).join('')
    : `<div style="grid-column:1/-1">${empty('rocket', 'No hackathon is live right now', 'Organisers can create one in minutes. Log in to host or to be among the first to register.', '<a class="hk-btn gold" href="login-hackthons.html?role=host">Host a hackathon</a>')}</div>`;
  icons();
  list.onclick = async e => {
    const sh = e.target.closest('[data-act="share"]');
    if(sh){
      e.preventDefault(); e.stopPropagation();
      const h = ranked.find(x => x.id === sh.dataset.id) || { id: sh.dataset.id, title: sh.dataset.title };
      await shareHackathon(h, shareRoleFor(h));
      return;
    }
    const p = e.target.closest('[data-pub-open]');
    if(p){ location.href = `hackathon.html?id=${encodeURIComponent(p.dataset.pubOpen)}`; return; }
    const c = e.target.closest('[data-open]');
    if(c) location.href = `hackathon.html?id=${encodeURIComponent(c.dataset.open)}`;
  };
  list.onkeydown = e => { if(e.key === 'Enter') e.target.click?.(); };
})();
