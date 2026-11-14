import { initBg } from './hk-bg.js';
import * as C from './hk-core.js';
import { empty, statusBadge, detailHeader, detailBody, factsCard, bindTabs, countdownHtml, startCountdowns, card } from './hk-ui.js';

const { $, esc, icons, toast } = C;
const toggleTheme = C.initTheme();
initBg($('#hkBg'));
$('#themeBtn').onclick = toggleTheme;

const view = $('#pubView');
let currentUser = null;
let currentHk = null;
let stopTimers = null;

function getHackathonId(){
  const qs = new URLSearchParams(location.search);
  const qId = qs.get('id');
  if(qId) return qId.trim();
  const pathMatch = location.pathname.match(/\/(?:h|hackathon)\/([\w-]+)/);
  if(pathMatch) return pathMatch[1];
  const hashMatch = (location.hash || '').match(/^#\/h\/([\w-]+)/);
  return hashMatch ? hashMatch[1] : '';
}

function setMeta(nameOrProp, val, isProp = false){
  if(!val) return;
  const sel = isProp ? `meta[property="${nameOrProp}"]` : `meta[name="${nameOrProp}"]`;
  let el = document.querySelector(sel);
  if(!el){
    el = document.createElement('meta');
    el.setAttribute(isProp ? 'property' : 'name', nameOrProp);
    document.head.appendChild(el);
  }
  el.setAttribute('content', val);
}

function applySeo(h){
  const url = C.publicShareUrl(h.id);
  const title = `${h.title} — Campus Connect One Hackathons`;
  const desc = [h.tagline, h.college, h.city, h.prizePool ? `Prize pool ${C.money(h.prizePool)}` : ''].filter(Boolean).join(' · ').slice(0, 160);
  const kw = [h.title, h.brandName, h.college, h.city, ...(h.tags || []), 'hackathon', 'Campus Connect One'].filter(Boolean).join(', ');
  const img = C.safeUrl(h.bannerURL || h.thumbURL) || 'https://campusconnectone.online/icon.png';

  document.title = title;
  setMeta('description', desc);
  setMeta('keywords', kw);
  setMeta('og:title', title, true);
  setMeta('og:description', desc, true);
  setMeta('og:image', img, true);
  setMeta('og:url', url, true);
  setMeta('twitter:title', title);
  setMeta('twitter:description', desc);
  setMeta('twitter:image', img);

  let can = document.querySelector('link[rel="canonical"]');
  if(!can){ can = document.createElement('link'); can.rel = 'canonical'; document.head.appendChild(can); }
  can.href = url;

  const oldLd = document.getElementById('hkEventLd');
  if(oldLd) oldLd.remove();
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.id = 'hkEventLd';
  const loc = h.mode === 'online'
    ? { '@type': 'VirtualLocation', url }
    : { '@type': 'Place', name: [h.venue, h.college].filter(Boolean).join(', ') || h.city || 'Campus', address: { '@type': 'PostalAddress', addressLocality: h.city || '', addressRegion: h.state || '', addressCountry: 'IN' } };
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: h.title,
    description: h.description || h.tagline || '',
    startDate: h.startMs ? new Date(h.startMs).toISOString() : undefined,
    endDate: h.endMs ? new Date(h.endMs).toISOString() : undefined,
    eventAttendanceMode: h.mode === 'online' ? 'https://schema.org/OnlineEventAttendanceMode' : h.mode === 'hybrid' ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: h.status === 'closed' ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    location: loc,
    image: [img],
    organizer: { '@type': 'Organization', name: h.brandName || h.hostName || 'Campus Connect One' },
    offers: { '@type': 'Offer', price: String(h.fee || 0), priceCurrency: 'INR', availability: C.canRegister(h) ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut', url }
  });
  document.head.appendChild(ld);
}

function paintBottomNav(hid){
  const loginBase = 'login-hackthons.html?role=participant';
  const target = p => currentUser ? `hackthons-portal.html#${p}` : `${loginBase}&next=${encodeURIComponent('#' + p)}`;
  const applyHref = hid ? (currentUser ? `hackthons-portal.html#/h/${encodeURIComponent(hid)}` : `${loginBase}&next=${encodeURIComponent('#/h/' + hid)}`) : target('/explore');
  $('#pubBottom').innerHTML = `
    <a href="hackthons.html"><i data-lucide="house"></i><span>Home</span></a>
    <a href="hackthons.html#featured"><i data-lucide="compass"></i><span>Explore</span></a>
    <a href="${applyHref}" class="mid" aria-label="Apply"><i data-lucide="ticket-check"></i><span></span></a>
    <a href="${target('/my')}"><i data-lucide="ticket"></i><span>My hacks</span></a>
    <a href="${target('/profile')}"><i data-lucide="user-round"></i><span>Profile</span></a>`;
  icons();
}

function requireLoginOrPortal(hid, routeHash){
  if(currentUser){
    location.href = `hackthons-portal.html${routeHash || `#/h/${hid}`}`;
    return;
  }
  toast('Sign in as a participant to continue', 'info');
  setTimeout(() => {
    location.href = `login-hackthons.html?role=participant&next=${encodeURIComponent(routeHash || `#/h/${hid}`)}`;
  }, 300);
}

async function render(){
  const hid = getHackathonId();
  paintBottomNav(hid);
  if(!hid){
    // Show directory index of all approved hackathons for users & crawlers
    let items = [];
    try { items = await C.fetchApproved(); } catch {}
    const enriched = C.enrich(items).sort((a, b) => b._trend - a._trend);
    view.innerHTML = `<div class="hk-page-h"><div><span class="hk-eyebrow">Directory</span><h1>All live hackathons</h1><p>Open any hackathon to inspect full rounds, prizes, tracks, and apply.</p></div><a class="hk-btn" href="hackthons.html"><i data-lucide="arrow-left"></i>Hackathons home</a></div>
      ${enriched.length ? `<div class="hk-cards">${enriched.map((h, i) => card(h, i, { publicLinks: true })).join('')}</div>` : empty('rocket', 'No hackathons live right now', 'Check back soon or log in to host one.', '<a class="hk-btn primary" href="login-hackthons.html">Get started</a>')}`;
    view.onclick = e => {
      const p = e.target.closest('[data-pub-open]');
      if(p) location.href = `hackathon.html?id=${encodeURIComponent(p.dataset.pubOpen)}`;
    };
    icons();
    return;
  }

  let h = null;
  try {
    const raw = await C.fetchOne(hid);
    if(raw) h = C.enrich([raw])[0];
  } catch {}

  if(!h){
    view.innerHTML = empty('search-x', 'Hackathon not found', 'This hackathon link may have expired or is not published yet.', '<a class="hk-btn primary" href="hackthons.html">Browse hackathons</a>');
    icons();
    return;
  }

  currentHk = h;
  applySeo(h);
  const ph = h._phase;
  const open = C.canRegister(h);
  const ctaBtn = open
    ? `<button class="hk-btn primary lg" data-pub-apply><i data-lucide="ticket-check"></i>Apply / Register now</button>`
    : `<button class="hk-btn lg" disabled>${esc(ph.label)}</button>`;
  const shareBtn = `<button class="hk-btn" data-pub-share><i data-lucide="share-2"></i>Share hackathon</button>`;
  const cd = countdownHtml(h, null, false);

  view.innerHTML = `<div class="hk-view">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <a class="hk-btn ghost sm" href="hackthons.html"><i data-lucide="arrow-left"></i>All hackathons</a>
      <span class="hk-chip ${ph.tone}">${esc(ph.label)}</span>
    </div>
    ${detailHeader(h)}
    ${cd ? `<div style="margin-top:14px">${cd}</div>` : ''}
    <div class="hk-detail">
      <div>${detailBody(h)}</div>
      ${factsCard(h, `<div class="hk-cta-inline" style="display:grid;gap:10px">${ctaBtn}${shareBtn}</div>`)}
    </div>
    <div class="hk-sticky-cta">${ctaBtn}<button class="hk-btn" data-pub-share aria-label="Share"><i data-lucide="share-2"></i></button></div>
  </div>`;

  bindTabs(view);
  stopTimers?.();
  stopTimers = startCountdowns(view);
  icons();

  view.onclick = async e => {
    if(e.target.closest('[data-pub-apply]')){
      requireLoginOrPortal(h.id, `#/h/${h.id}`);
      return;
    }
    if(e.target.closest('[data-pub-share]')){
      await C.shareHackathon(currentHk, 'participant');
    }
  };
}

C.watchUser((user) => {
  currentUser = user;
  const topBtn = $('#topAuthBtn');
  if(user && topBtn){
    topBtn.textContent = 'Open portal';
    topBtn.href = `hackthons-portal.html${getHackathonId() ? '#/h/' + encodeURIComponent(getHackathonId()) : ''}`;
  }
  paintBottomNav(getHackathonId());
});

render();
