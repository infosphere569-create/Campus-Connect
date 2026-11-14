import { initBg } from './hk-bg.js';
import { $, $$, initTheme, fetchApproved, enrich, trendScore, cachedLocation, publicStats } from './hk-core.js';
import { card, empty, bindReveal, countUp } from './hk-ui.js';

const toggleTheme = initTheme();
initBg($('#hkBg'));
$('#themeBtn').onclick = toggleTheme;
$('#yr').textContent = new Date().getFullYear();
addEventListener('scroll', () => $('#nav').classList.toggle('stuck', scrollY > 8), { passive: true });
bindReveal();

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
  list.innerHTML = ranked.length
    ? ranked.slice(0, 6).map(card).join('')
    : `<div style="grid-column:1/-1">${empty('rocket', 'No hackathon is live right now', 'Organisers can create one in minutes. Log in to host or to be among the first to register.', '<a class="hk-btn gold" href="login-hackthons.html?role=host">Host a hackathon</a>')}</div>`;
  list.onclick = e => { const c = e.target.closest('[data-open]'); if(c) location.href = 'login-hackthons.html?next=' + encodeURIComponent('#/h/' + c.dataset.open); };
  list.onkeydown = e => { if(e.key === 'Enter') e.target.click?.(); };
})();
