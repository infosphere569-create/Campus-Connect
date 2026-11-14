// Hackathons portal: shell (header / sidebar / bottom nav), hash router, participant views.
// Host views (dashboard, create wizard, manage) live in hk-host.js.
import { initBg } from './hk-bg.js';
import * as C from './hk-core.js';
import { card, spot, empty, skeletonCards, detailHeader, detailBody, factsCard, bindTabs, statusBadge } from './hk-ui.js';
import { hostDash, wizard } from './hk-host.js';
import { manage } from './hk-manage.js';
import { dash } from './hk-dash.js';
import { participantForm, organiserForm } from './hk-forms.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const toggleTheme = C.initTheme();
initBg($('#hkBg'));

const S = { user: null, site: null, hk: null, role: 'participant', all: null, allAt: 0, mine: null, regs: null, loc: C.cachedLocation(), notifs: [], rt: 0, booted: false,
  f: { q: '', mode: '', fee: '', when: '', sort: 'trending', tag: '' }, cleanup: null };
const view = $('#view'), app = $('#app');
const myCollege = () => S.hk?.college || S.site?.college || '';
const firstName = () => (S.hk?.displayName || S.site?.displayName || S.user?.displayName || 'there').split(' ')[0];
const stale = t => t !== S.rt;
const nav = h => { if(location.hash === h) route(); else location.hash = h; };
const fail = e => { console.error(e); const perm = /permission|insufficient/i.test(e?.message || ''); return `<div class="hk-view">${empty('triangle-alert', perm ? 'Hackathon rules not deployed yet' : 'Could not load this', perm ? 'Ask the admin to deploy the updated firestore.rules, then refresh.' : (e?.message || 'Please check your connection and try again.'), '<button class="hk-btn" onclick="location.reload()">Retry</button>')}</div>`; };

/* ---------- data helpers ---------- */
async function ensureAll(force){
  if(force || !S.all || Date.now() - S.allAt > 60000){ S.all = await C.fetchApproved(); S.allAt = Date.now(); }
  return S.all;
}
const enriched = () => C.enrich(S.all || [], { loc: S.loc, college: myCollege() });
const active = list => list.filter(h => h._phase.key !== 'ended' && h._phase.key !== 'closed');
async function ensureRegs(force){ if(force || !S.regs) S.regs = await C.myRegistrations(S.user.uid); return S.regs; }
async function ensureMine(force){ if(force || !S.mine) S.mine = await C.fetchMine(S.user.uid); return S.mine; }
const refreshMine = async () => { S.mine = null; return ensureMine(true); };

/* ---------- shell ---------- */
const NAV = () => S.role === 'host'
  ? [['/host', 'layout-dashboard', 'Dashboard'], ['/host/new', 'circle-plus', 'Create hackathon'], ['/home', 'compass', 'Browse hackathons'], ['/alerts', 'bell', 'Notifications'], ['/profile', 'user-round', 'Profile']]
  : [['/home', 'house', 'Home'], ['/explore', 'compass', 'Explore'], ['/my', 'ticket', 'My hackathons'], ['/alerts', 'bell', 'Notifications'], ['/profile', 'user-round', 'Profile']];
const curPath = () => (location.hash || '').replace(/^#/, '') || (S.role === 'host' ? '/host' : '/home');
const isOn = p => { const c = curPath(); return p === '/home' ? (c === '/home' || c.startsWith('/h/')) && S.role !== 'host' || (S.role === 'host' && c === '/home') : p === '/host' ? c === '/host' || /^\/host\/(edit|manage)/.test(c) : c === p || c.startsWith(p + '/'); };

function paintHeader(){
  const img = $('#avatar'), src = C.safeUrl(S.hk?.photoURL || S.site?.photoURL || S.user?.photoURL || '') || 'icon.png';
  img.src = src; img.onerror = () => { img.onerror = null; img.src = 'icon.png'; };
  $('#uName').textContent = S.hk?.displayName || S.site?.displayName || S.user?.displayName || 'Campus Connect One';
  const r = $('#uRole'); r.textContent = S.role === 'host' ? 'Host' : 'Participant'; r.className = S.role === 'host' ? 'host' : '';
}
function paintNav(){
  const unread = S.notifs.filter(n => !n.read).length;
  $('#side').innerHTML = `<div class="lbl">${S.role === 'host' ? 'Host space' : 'Participant space'}</div>` +
    NAV().map(([p, ic, l]) => `<a class="hk-nav-i ${isOn(p) ? 'on' : ''}" href="#${p}" title="${l}"><i data-lucide="${ic}"></i><span class="t">${l}</span>${p === '/alerts' && unread ? `<span class="badge">${unread}</span>` : ''}</a>`).join('') +
    `<div class="sp"></div><div class="lbl">More</div>
     ${C.isStaff(S.site) ? '<a class="hk-nav-i" href="hackthons-admin.html" title="Admin portal"><i data-lucide="shield-check"></i><span class="t">Admin portal</span></a>' : ''}
     <a class="hk-nav-i" href="home.html" title="Campus Connect One"><i data-lucide="school"></i><span class="t">Campus Connect One</span></a>
     <button class="hk-nav-i" data-act="theme" title="Theme"><i data-lucide="sun-moon"></i><span class="t">Theme</span></button>
     <button class="hk-nav-i" data-act="logout" title="Log out"><i data-lucide="log-out"></i><span class="t">Log out</span></button>`;
  const b = (p, ic, l, extra = '') => `<a href="#${p}" class="${isOn(p) ? 'on' : ''} ${extra}" aria-label="${l}"><i data-lucide="${ic}"></i><span>${extra === 'mid' ? '' : l}</span>${p === '/alerts' && unread ? `<span class="badge">${unread}</span>` : ''}</a>`;
  $('#bottom').innerHTML = S.role === 'host'
    ? b('/host', 'layout-dashboard', 'Dashboard') + b('/home', 'compass', 'Browse') + b('/host/new', 'plus', 'Create', 'mid') + b('/alerts', 'bell', 'Alerts') + b('/profile', 'user-round', 'Profile')
    : b('/home', 'house', 'Home') + b('/explore', 'compass', 'Explore') + b('/my', 'ticket', 'My hacks') + b('/alerts', 'bell', 'Alerts') + b('/profile', 'user-round', 'Profile');
  const dot = $('#bellDot'); dot.textContent = unread > 9 ? '9+' : unread; dot.classList.toggle('hk-hidden', !unread);
  icons();
}
function closeDrawer(){ app.classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false'); }
$('#menuBtn').onclick = () => {
  if(matchMedia('(max-width:900px)').matches){ const o = app.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); }
  else { const c = app.classList.toggle('collapsed'); try { localStorage.setItem('hk-collapsed', c ? '1' : ''); } catch {} }
};
$('#scrim').onclick = closeDrawer;
$('#bellBtn').onclick = () => nav('#/alerts');
if(localStorage.getItem('hk-collapsed')) app.classList.add('collapsed');

/* ---------- location ---------- */
const locLabel = () => S.loc ? `${S.loc.city}${S.loc.state ? ', ' + S.loc.state : ''}` : 'Set your location';
function locChip(){ return `<button class="hk-chip btn" data-act="loc" aria-label="Change location"><i data-lucide="map-pin"></i>${esc(locLabel())}<i data-lucide="chevron-down"></i></button>`; }
function locModal(){
  modal('Your location', `<div class="hk-form">
    <p class="hk-muted hk-sm">We use this only to rank hackathons by distance. It is never shown to other users.</p>
    <button class="hk-btn primary block" id="gps"><i data-lucide="crosshair"></i>Use my current location</button>
    <div class="hk-divider">or choose a city</div>
    <div class="hk-field"><input class="hk-input" id="cityIn" list="hkCities" placeholder="Type your city" autocomplete="off"><datalist id="hkCities">${Object.keys(C.CITIES).map(c => `<option value="${c}">`).join('')}</datalist></div>
    <button class="hk-btn block" id="setCity">Use this city</button></div>`, { onMount(b, close){
    const done = l => { S.loc = l; close(); toast(`Location set to ${l.city}`); route(); };
    $('#gps', b).onclick = async e => { const bt = e.currentTarget; bt.disabled = true; bt.innerHTML = '<span class="hk-spin"></span> Detecting…'; try { done(await C.locateGps()); } catch(err){ toast(err.message, 'error'); bt.disabled = false; bt.innerHTML = '<i data-lucide="crosshair"></i>Use my current location'; icons(); } };
    $('#setCity', b).onclick = () => { const l = C.locateCity($('#cityIn', b).value); l ? done(l) : toast('City not found. Pick one from the list.', 'error'); };
  } });
}

/* ---------- router ---------- */
const ROUTES = [
  [/^\/home$/, home], [/^\/explore$/, explore], [/^\/h\/([\w-]+)$/, detail], [/^\/my$/, myHacks], [/^\/my\/([\w-]+)$/, (t, id) => guardPart(t, () => dash(ctx(t), id))],
  [/^\/host$/, (t) => guardHost(t, () => hostDash(ctx(t)))], [/^\/host\/new$/, (t) => guardHost(t, () => wizard(ctx(t), null))],
  [/^\/host\/edit\/([\w-]+)$/, (t, id) => guardHost(t, () => wizard(ctx(t), id))], [/^\/host\/manage\/([\w-]+)$/, (t, id) => guardHost(t, () => manage(ctx(t), id))],
  [/^\/alerts$/, alerts], [/^\/profile$/, profile]
];
const ctx = t => ({ S, view, stale: () => stale(t), nav, refreshMine, ensureAll, fail, myCollege });
function guardHost(t, fn){
  if(S.role !== 'host'){ view.innerHTML = `<div class="hk-view">${empty('megaphone', 'Organiser area', 'You are logged in as a participant. To organise hackathons, log out and log in again as an organiser.', '<button class="hk-btn gold" data-act="logout"><i data-lucide="log-out"></i>Log out</button>')}</div>`; icons(); return; }
  return fn();
}
function guardPart(t, fn){
  if(S.role === 'host'){ view.innerHTML = `<div class="hk-view">${empty('rocket', 'Participant area', 'You are logged in as an organiser. Log out and log in as a participant to register and submit projects.', '<button class="hk-btn primary" data-act="logout"><i data-lucide="log-out"></i>Log out</button>')}</div>`; icons(); return; }
  return fn();
}
async function route(){
  const path = curPath(); const t = ++S.rt;
  S.cleanup?.(); S.cleanup = null; closeDrawer(); paintNav();
  for(const [re, fn] of ROUTES){
    const m = path.match(re); if(!m) continue;
    view.innerHTML = `<div class="hk-view">${skeletonCards(3)}</div>`;
    try { await fn(t, ...m.slice(1)); } catch(e){ if(!stale(t)){ view.innerHTML = fail(e); icons(); } }
    if(!stale(t)){ icons(); scrollTo({ top: 0 }); }
    return;
  }
  nav(S.role === 'host' ? '#/host' : '#/home');
}
addEventListener('hashchange', route);

/* ---------- Home ---------- */
const secH = (ic, t, right = '') => `<div class="hk-sec"><h2><i data-lucide="${ic}"></i>${t}</h2>${right}</div>`;
async function home(t){
  await ensureAll(); if(stale(t)) return;
  if(!S.loc){
    const pc = C.findCity(S.hk?.city); if(pc) S.loc = { lat: pc.lat, lng: pc.lng, city: pc.city, state: pc.state, source: 'profile' };
    if(!sessionStorage.getItem('hk-geo-asked')){
      sessionStorage.setItem('hk-geo-asked', '1');
      C.locateGps().then(l => { S.loc = l; if(curPath() === '/home') route(); }).catch(() => {});
    }
  }
  const all = active(enriched()), college = myCollege();
  const mine = all.filter(h => h._campus).sort((a, b) => (a.startMs || 9e15) - (b.startMs || 9e15));
  const trending = [...all].sort((a, b) => b._trend - a._trend).slice(0, 8);
  const near = all.filter(h => h._dist != null && h.mode !== 'online').sort((a, b) => a._dist - b._dist).slice(0, 8);
  const closing = all.filter(h => h._phase.key === 'closing').sort((a, b) => a.regDeadlineMs - b.regDeadlineMs).slice(0, 4);

  const campusBlock = mine.length
    ? `<div class="hk-spots">${mine.map(spot).join('')}</div>`
    : `<div class="hk-banner"><i data-lucide="graduation-cap" style="width:28px;height:28px;color:var(--hk-gold)"></i><div class="grow"><b>${college ? `No hackathon at ${esc(college)} yet` : 'Add your college to see hackathons at your campus'}</b><div class="hk-sm hk-muted">${college ? 'Ask your club or department to host one, or explore the nearest events below.' : 'Your campus events are highlighted here once your college is set.'}</div></div>${college ? '' : '<a class="hk-btn gold sm" href="#/profile">Set college</a>'}</div>`;

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">${S.role === 'host' ? 'Browse' : 'Discover'}</span><h1>Hey ${esc(firstName())}, ready to build?</h1><p>Hackathons at your campus and around you.</p></div><div class="hk-loc">${locChip()}</div></div>
    <div class="hk-search" style="margin-bottom:6px"><i data-lucide="search"></i><input class="hk-input" id="homeQ" placeholder="Search hackathons, colleges, cities, tags…" aria-label="Search hackathons"></div>
    ${secH('graduation-cap', 'Your campus', mine.length ? `<span class="hk-chip gold">${mine.length} at ${esc(college.length > 24 ? college.slice(0, 22) + '…' : college)}</span>` : '')}${campusBlock}
    ${secH('flame', 'Trending now', '<a class="hk-btn ghost sm" href="#/explore">See all <i data-lucide="arrow-right"></i></a>')}
    ${trending.length ? `<div class="hk-rail">${trending.map(card).join('')}</div>` : empty('rocket', 'No hackathons live yet', S.role === 'host' ? 'Create one for your campus from your dashboard.' : 'Check back soon, or ask your club to host one.', S.role === 'host' ? '<a class="hk-btn gold" href="#/host/new">Create hackathon</a>' : '')}
    ${secH('navigation', 'Nearest to you', locChip())}
    ${S.loc ? (near.length ? `<div class="hk-rail">${near.map(card).join('')}</div>` : empty('map-pinned', 'Nothing nearby yet', `No in-person hackathons found around ${S.loc.city}. Check Explore for online events.`, '<a class="hk-btn" href="#/explore">Explore all</a>')) : empty('map-pin', 'Turn on location to see nearby events', 'Allow location access or pick your city to rank hackathons by distance.', '<button class="hk-btn primary" data-act="loc">Set location</button>')}
    ${closing.length ? `${secH('timer', 'Closing soon')}<div class="hk-cards">${closing.map(card).join('')}</div>` : ''}
  </div>`;
  $('#homeQ').addEventListener('keydown', e => { if(e.key === 'Enter'){ S.f = { ...S.f, q: e.target.value.trim() }; nav('#/explore'); } });
}

/* ---------- Explore ---------- */
async function explore(t){
  await ensureAll(); if(stale(t)) return;
  const all = enriched(), tagCount = {};
  all.forEach(h => (h.tags || []).forEach(x => tagCount[x] = (tagCount[x] || 0) + 1));
  const tags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(x => x[0]);
  const sel = (id, opts, v) => `<select class="hk-select" id="${id}" style="min-height:46px;width:auto;min-width:130px">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">Explore</span><h1>All hackathons</h1><p>Filter by mode, fee, timing and more.</p></div><div class="hk-loc">${locChip()}</div></div>
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="fq" value="${esc(S.f.q)}" placeholder="Search…" aria-label="Search"></div>
      ${sel('fmode', [['', 'Any mode'], ['offline', 'In-person'], ['online', 'Online'], ['hybrid', 'Hybrid']], S.f.mode)}${sel('ffee', [['', 'Any fee'], ['free', 'Free'], ['paid', 'Paid']], S.f.fee)}
      ${sel('fwhen', [['', 'Upcoming & live'], ['open', 'Registration open'], ['live', 'Live now'], ['ended', 'Ended']], S.f.when)}${sel('fsort', [['trending', 'Trending'], ['nearest', 'Nearest'], ['soonest', 'Starting soon'], ['prize', 'Prize pool'], ['newest', 'Newest']], S.f.sort)}</div>
    ${tags.length ? `<div class="hk-rail" style="display:flex;gap:8px;margin-bottom:10px">${tags.map(x => `<button class="hk-chip btn ${S.f.tag === x ? 'on' : ''}" style="flex:0 0 auto" data-tag="${esc(x)}">#${esc(x)}</button>`).join('')}</div>` : ''}
    <div id="exGrid"></div></div>`;
  const draw = () => {
    const f = S.f, q = f.q.toLowerCase();
    let l = all.filter(h => {
      const k = h._phase.key;
      if(f.when === 'ended' ? !(k === 'ended' || k === 'closed') : (k === 'ended' || k === 'closed')) return false;
      if(f.when === 'open' && !['open', 'closing'].includes(k)) return false;
      if(f.when === 'live' && k !== 'live') return false;
      if(f.mode && h.mode !== f.mode) return false;
      if(f.fee === 'free' && +h.fee > 0) return false; if(f.fee === 'paid' && !(+h.fee > 0)) return false;
      if(f.tag && !(h.tags || []).includes(f.tag)) return false;
      if(q && ![h.title, h.tagline, h.brandName, h.college, h.city, (h.tags || []).join(' ')].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    const by = { trending: (a, b) => b._trend - a._trend, nearest: (a, b) => (a._dist ?? 1e9) - (b._dist ?? 1e9), soonest: (a, b) => (a.startMs || 9e15) - (b.startMs || 9e15), prize: (a, b) => (b.prizePool || 0) - (a.prizePool || 0), newest: (a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0) };
    l.sort(by[f.sort] || by.trending);
    $('#exGrid').innerHTML = l.length ? `<div class="hk-cards">${l.map(card).join('')}</div>` : empty('search-x', 'No hackathons match', 'Try clearing a filter or searching something broader.', '<button class="hk-btn" data-act="clear-filters">Clear filters</button>');
    icons();
  };
  const bind = (id, k) => $(id).addEventListener('input', e => { S.f[k] = e.target.value; draw(); });
  bind('#fq', 'q'); bind('#fmode', 'mode'); bind('#ffee', 'fee'); bind('#fwhen', 'when'); bind('#fsort', 'sort');
  $$('[data-tag]').forEach(b => b.onclick = () => { S.f.tag = S.f.tag === b.dataset.tag ? '' : b.dataset.tag; $$('[data-tag]').forEach(x => x.classList.toggle('on', x.dataset.tag === S.f.tag)); draw(); });
  draw();
}

/* ---------- Detail ---------- */
async function getH(id){
  let h = S.all?.find(x => x.id === id);
  if(!h){ try { h = await C.fetchOne(id); } catch { h = null; } }
  return h ? C.enrich([h], { loc: S.loc, college: myCollege() })[0] : null;
}
async function getReg(id){
  try { const s = await FS.getDoc(FS.doc(C.db, 'hkRegistrations', `${id}_${S.user.uid}`)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch { return null; }
}
async function detail(t, id){
  if(!S.all) await ensureAll();
  const h = await getH(id); if(stale(t)) return;
  if(!h){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Hackathon not found', 'It may have been removed or is not published yet.', '<a class="hk-btn" href="#/home">Back to home</a>')}</div>`; return; }
  const reg = await getReg(id); if(stale(t)) return;
  const own = h.hostUid === S.user.uid, ph = h._phase;
  let cta;
  if(own) cta = `<a class="hk-btn gold" href="#/host/manage/${h.id}"><i data-lucide="users"></i>Manage</a><a class="hk-btn" href="#/host/edit/${h.id}"><i data-lucide="pencil"></i>Edit</a>`;
  else if(S.role === 'host') cta = `<button class="hk-btn" disabled>Log in as participant to register</button>`;
  else if(reg) cta = `<a class="hk-btn primary" href="#/my/${h.id}"><i data-lucide="layout-dashboard"></i>Open my dashboard</a><button class="hk-btn danger" data-act="cancel-reg" data-id="${h.id}">Cancel</button>`;
  else if(h.status !== 'approved') cta = `<button class="hk-btn" disabled>Not open for registration</button>`;
  else if(C.canRegister(h)) cta = `<button class="hk-btn primary lg" data-act="register" data-id="${h.id}"><i data-lucide="ticket-check"></i>Register now</button>`;
  else cta = `<button class="hk-btn" disabled>${ph.label}</button>`;
  const notice = h.status !== 'approved' ? `<div class="hk-banner" style="margin:14px 0 0"><i data-lucide="eye"></i><div class="grow"><b>Preview</b><div class="hk-sm hk-muted">Status: ${statusBadge(h.status)} ${h.adminNote ? '· ' + esc(h.adminNote) : ''}</div></div></div>` : '';
  const regNote = reg ? `<div class="hk-banner" style="margin:14px 0 0"><i data-lucide="party-popper" style="color:var(--hk-p)"></i><div class="grow"><b>You're registered</b><div class="hk-sm hk-muted">${reg.teamMode === 'solo' ? 'Solo' : 'Team ' + esc(reg.teamName || '')} · status: ${esc(reg.status)}</div></div></div>` : '';
  view.innerHTML = `<div class="hk-view"><button class="hk-btn ghost sm" data-act="back" style="margin-bottom:12px"><i data-lucide="arrow-left"></i>Back</button>
    ${detailHeader(h)}${notice}${regNote}
    <div class="hk-detail"><div>${detailBody(h)}</div>${factsCard(h, `<div class="hk-cta-inline" style="display:grid;gap:10px">${cta}</div>`)}</div>
    <div class="hk-sticky-cta">${cta}</div>
    <div style="margin-top:18px"><button class="hk-btn sm" data-act="share" data-id="${h.id}" data-title="${esc(h.title)}"><i data-lucide="share-2"></i>Share</button></div></div>`;
  bindTabs(view);
  S.cur = h;
}

function registerModal(h){
  const hk = S.hk, max = Math.max(1, +h.teamMax || 1), min = Math.max(1, +h.teamMin || 1), soloOnly = max <= 1, teamOnly = min > 1;
  const memRow = (i, m = {}) => `<div class="hk-mem" data-i="${i}"><div class="hk-grid3"><input class="hk-input" name="mn" placeholder="Member name" value="${esc(m.name || '')}" maxlength="80"><input class="hk-input" name="me" type="email" placeholder="Email" value="${esc(m.email || '')}"><input class="hk-input" name="mp" inputmode="tel" placeholder="Phone (optional)" value="${esc(m.phone || '')}"></div><button type="button" class="hk-btn sm ghost" data-rm aria-label="Remove member"><i data-lucide="x"></i></button></div>`;
  modal(`Register · ${h.title}`, `<form class="hk-form" id="regForm" novalidate>
    <div class="hk-msg ok"><i data-lucide="mail-check"></i><span>A confirmation email goes to <b>${esc(S.user.email || '')}</b> from team@campusconnectone.online. The team leader receives all updates.</span></div>
    ${soloOnly ? '<input type="hidden" name="teamMode" value="solo"><div class="hk-chip">Solo hackathon</div>' : `<div class="hk-field"><label>How are you joining?</label><div class="hk-seg" id="tm">${teamOnly ? '' : '<button type="button" class="on" data-m="solo">Solo</button>'}<button type="button" class="${teamOnly ? 'on' : ''}" data-m="team">Team</button></div><input type="hidden" name="teamMode" value="${teamOnly ? 'team' : 'solo'}"></div>
    <div id="teamBox" class="${teamOnly ? '' : 'hk-hidden'} hk-form"><div class="hk-field"><label>Team name</label><input class="hk-input" name="teamName" maxlength="60" placeholder="e.g. Null Pointers"></div>
      <div class="hk-field"><label>Team members <small>you are the team leader · ${min > 1 ? `${min - 1} to ` : 'up to '}${max - 1} more</small></label><div id="mems" class="hk-stack"></div><button type="button" class="hk-btn sm" id="addMem"><i data-lucide="user-plus"></i>Add member</button></div></div>`}
    <fieldset class="hk-fs"><legend>Team leader (you)</legend><div class="hk-grid2"><div class="hk-field"><label>Full name</label><input class="hk-input" name="name" required value="${esc(hk.displayName || '')}"></div><div class="hk-field"><label>Phone</label><input class="hk-input" name="phone" inputmode="tel" required value="${esc(hk.phone || '')}"></div></div>
    <div class="hk-grid2"><div class="hk-field"><label>College</label><input class="hk-input" name="college" required value="${esc(myCollege())}"></div><div class="hk-field"><label>Year / course</label><input class="hk-input" name="year" value="${esc([hk.course, hk.year].filter(Boolean).join(' · '))}"></div></div></fieldset>
    ${+h.fee > 0 ? `<div class="hk-msg ok"><i data-lucide="ticket"></i><span>Entry fee ${C.money(h.fee)} per team. The organiser will contact you to collect it.</span></div>` : ''}
    <label class="hk-check"><input type="checkbox" name="agree"><span>I have read the rules and agree to share these details with the organisers.</span></label>
    <div id="regErr" class="hk-msg err hk-hidden"></div>
    <button class="hk-btn primary lg block" type="submit">Confirm registration</button></form>`, { onMount(b, close){
    const f = $('#regForm', b), err = m => { const e = $('#regErr', b); e.classList.toggle('hk-hidden', !m); e.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); };
    const mems = $('#mems', b), count = () => mems ? mems.children.length : 0;
    const add = () => { if(count() >= max - 1) return toast(`Maximum team size is ${max}.`, 'error'); mems.insertAdjacentHTML('beforeend', memRow(count())); icons(); };
    if(mems){ for(let i = 0; i < Math.max(0, min - 1); i++) mems.insertAdjacentHTML('beforeend', memRow(i)); $('#addMem', b).onclick = add; mems.onclick = e => { const r = e.target.closest('[data-rm]'); if(r) r.closest('.hk-mem').remove(); }; }
    $('#tm', b)?.addEventListener('click', e => { const bt = e.target.closest('[data-m]'); if(!bt) return; $$('#tm button', b).forEach(x => x.classList.toggle('on', x === bt)); f.teamMode.value = bt.dataset.m; $('#teamBox', b).classList.toggle('hk-hidden', bt.dataset.m !== 'team'); });
    icons();
    f.onsubmit = async ev => {
      ev.preventDefault(); err('');
      const d = Object.fromEntries(new FormData(f).entries());
      if(d.name.trim().length < 2) return err('Enter your full name.');
      if(!/^[6-9]\d{9}$/.test(d.phone.replace(/\D/g, '').slice(-10))) return err('Enter a valid 10-digit mobile number.');
      if(!d.college.trim()) return err('Enter your college.');
      let members = [];
      if(d.teamMode === 'team'){
        if(!(d.teamName || '').trim()) return err('Give your team a name.');
        members = $$('.hk-mem', b).map(r => { const [n, e, p] = $$('input', r).map(x => x.value.trim()); return { name: n, email: e, phone: p }; });
        if(members.some(m => m.name.length < 2)) return err('Enter a name for every team member (or remove the empty row).');
        if(members.some(m => m.email && !/^\S+@\S+\.\S+$/.test(m.email))) return err('A member email is not valid.');
        if(members.length + 1 < min) return err(`This hackathon needs at least ${min} members including you.`);
        if(members.length + 1 > max) return err(`Maximum team size is ${max}.`);
      }
      if(!d.agree) return err('Please accept the rules to continue.');
      const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Registering…';
      try {
        await C.registerFor(h, S.user, { name: d.name.trim(), phone: d.phone.replace(/\D/g, '').slice(-10), email: S.user.email || '', college: d.college.trim(), year: (d.year || '').trim(), skills: S.hk.skills || '', teamMode: d.teamMode, teamName: d.teamMode === 'team' ? d.teamName.trim() : '', members, teamSize: members.length + 1 });
        S.regs = null; S.all = null; close(); toast('You are registered! Check your email.'); nav('#/my/' + h.id);
      } catch(e){ err(/permission|insufficient/i.test(e.message) ? 'Registration is not available right now.' : e.message); btn.disabled = false; btn.textContent = 'Confirm registration'; }
    };
  } });
}

/* ---------- My hackathons ---------- */
async function myHacks(t){
  const regs = await ensureRegs(true); if(stale(t)) return;
  const rows = regs.map(r => `<div class="hk-lrow"><div class="info"><b>${esc(r.hackathonTitle || 'Hackathon')}</b><span class="hk-sm hk-muted">${r.teamMode === 'solo' ? 'Solo' : 'Team ' + esc(r.teamName || '')} · registered ${C.ago(r.createdAtMs)}</span></div>
    <span class="hk-chip ${r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : ''}">${esc(r.status)}</span><div class="acts"><a class="hk-btn sm primary" href="#/my/${esc(r.hackathonId)}">Dashboard</a><a class="hk-btn sm" href="#/h/${esc(r.hackathonId)}">View</a></div></div>`).join('');
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Your activity</span><h1>My hackathons</h1><p>Everything you've registered for.</p></div><a class="hk-btn primary" href="#/explore"><i data-lucide="compass"></i>Find more</a></div>
    ${regs.length ? `<div class="hk-stack">${rows}</div>` : empty('ticket', 'No registrations yet', 'Register for a hackathon and it will show up here.', '<a class="hk-btn primary" href="#/explore">Explore hackathons</a>')}</div>`;
}

/* ---------- Notifications ---------- */
async function alerts(t){
  const ic = { approved: 'badge-check', rejected: 'circle-x', changes_requested: 'message-square-warning', registration: 'user-plus', announcement: 'megaphone', status: 'refresh-cw' };
  const draw = () => {
    if(curPath() !== '/alerts') return;
    view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Inbox</span><h1>Notifications</h1><p>Approvals, registrations and host announcements.</p></div>${S.notifs.some(n => !n.read) ? '<button class="hk-btn" data-act="read-all"><i data-lucide="check-check"></i>Mark all read</button>' : ''}</div>
      ${S.notifs.length ? `<div class="hk-stack">${S.notifs.map(n => `<button class="hk-notif ${n.read ? '' : 'un'}" data-notif="${esc(n.id)}" data-h="${esc(n.hackathonId || '')}"><span class="ni"><i data-lucide="${ic[n.type] || 'bell'}"></i></span><span><b>${esc(n.title)}</b><span class="hk-sm hk-muted" style="display:block">${esc(n.body)}</span><span class="hk-xs hk-muted">${C.ago(n.createdAtMs)}</span></span></button>`).join('')}</div>` : empty('bell', 'You are all caught up', 'Approval decisions, registrations and announcements will appear here.')}</div>`;
    icons();
  };
  draw(); S.redrawAlerts = draw; S.cleanup = () => { S.redrawAlerts = null; };
}

/* ---------- Profile ---------- */
async function profile(t){
  const h = S.hk, cities = Object.keys(C.CITIES).map(c => `<option value="${c}">`).join('');
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Account</span><h1>Profile & settings</h1><p>Your campus is used to highlight hackathons at your college.</p></div></div>
    <div class="hk-detail" style="margin-top:0"><form class="hk-glass hk-form" id="pf" style="padding:clamp(18px,3vw,28px)">
      <div style="display:flex;gap:14px;align-items:center"><img class="hk-avatar" style="width:68px;height:68px" src="${esc(C.safeUrl(h.photoURL || S.site?.photoURL || S.user.photoURL) || 'icon.png')}" alt="" onerror="this.src='icon.png'"><div><b>${esc(S.user.email || '')}</b><div class="hk-sm hk-muted">Photo comes from your Campus Connect One / Google account.</div></div></div>
      <div class="hk-grid2"><div class="hk-field"><label>Full name</label><input class="hk-input" name="displayName" value="${esc(h.displayName || '')}" required></div><div class="hk-field"><label>Phone</label><input class="hk-input" name="phone" inputmode="tel" value="${esc(h.phone || '')}"></div></div>
      <div class="hk-grid2"><div class="hk-field"><label>College / institute</label><input class="hk-input" name="college" value="${esc(h.college || S.site?.college || '')}" placeholder="e.g. IIT Delhi"></div><div class="hk-field"><label>City</label><input class="hk-input" name="city" list="pc" value="${esc(h.city || '')}"><datalist id="pc">${cities}</datalist></div></div>
      ${S.role === 'host' ? `<div class="hk-grid2"><div class="hk-field"><label>Organiser name <small>signed on emails</small></label><input class="hk-input" name="organiserName" value="${esc(h.organiserName || '')}"></div><div class="hk-field"><label>Organisation / club</label><input class="hk-input" name="org" value="${esc(h.org || '')}"></div></div><div class="hk-grid2"><div class="hk-field"><label>Contact email</label><input class="hk-input" name="orgEmail" type="email" value="${esc(h.orgEmail || S.user.email || '')}"></div><div class="hk-field"><label>Contact phone</label><input class="hk-input" name="orgPhone" inputmode="tel" value="${esc(h.orgPhone || '')}"></div></div>` : `<div class="hk-grid3"><div class="hk-field"><label>Course</label><input class="hk-input" name="course" value="${esc(h.course || '')}"></div><div class="hk-field"><label>Branch</label><input class="hk-input" name="branch" value="${esc(h.branch || '')}"></div><div class="hk-field"><label>Year</label><input class="hk-input" name="year" value="${esc(h.year || '')}"></div></div><div class="hk-field"><label>Skills</label><input class="hk-input" name="skills" value="${esc(h.skills || '')}"></div>`}
      <div class="hk-field"><label>Bio <small>optional</small></label><textarea class="hk-textarea" name="bio" style="min-height:90px" maxlength="280">${esc(h.bio || '')}</textarea></div>
      <button class="hk-btn primary" type="submit">Save changes</button></form>
    <aside class="hk-stack"><div class="hk-card-s"><b>Logged in as</b><p style="margin-top:8px"><span class="hk-chip ${S.role === 'host' ? 'gold' : ''}">${S.role === 'host' ? 'Organiser' : 'Participant'}</span></p><p class="hk-sm hk-muted" style="margin-top:10px">To use the other side, log out and log in again with that role.</p>${S.role === 'host' ? `<p class="hk-sm hk-muted" style="margin-top:6px">${h.hostVerified ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Verified organiser</span>' : 'Verification is done by admins after your first approved hackathon.'}</p>` : ''}</div>
      <div class="hk-card-s"><b>Location</b><p class="hk-sm hk-muted" style="margin:6px 0 12px">${esc(locLabel())}</p><button class="hk-btn sm" data-act="loc">Change</button></div>
      <div class="hk-card-s"><button class="hk-btn block danger" data-act="logout"><i data-lucide="log-out"></i>Log out</button></div></aside></div></div>`;
  $('#pf').onsubmit = async e => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(e.target).entries()); const btn = $('button[type=submit]', e.target);
    if((d.displayName || '').trim().length < 2) return toast('Enter your name.', 'error');
    btn.disabled = true;
    const T = k => (d[k] || '').trim(), extra = S.role === 'host' ? { organiserName: T('organiserName'), org: T('org'), orgEmail: T('orgEmail'), orgPhone: T('orgPhone').replace(/\D/g, '').slice(-10) } : { course: T('course'), branch: T('branch'), year: T('year'), skills: T('skills') };
    try { await C.updateHkProfile(S.user.uid, { displayName: d.displayName.trim(), phone: (d.phone || '').trim(), college: (d.college || '').trim(), city: (d.city || '').trim(), bio: (d.bio || '').trim(), ...extra });
      Object.assign(S.hk, { displayName: d.displayName.trim(), phone: d.phone, college: d.college.trim(), city: d.city.trim(), bio: d.bio, ...extra });
      const c = C.findCity(d.city); if(c && S.loc?.source !== 'gps') S.loc = C.saveLocation({ lat: c.lat, lng: c.lng, city: c.city, state: c.state, source: 'profile' });
      paintHeader(); toast('Profile saved'); } catch(err){ toast(err.message, 'error'); }
    btn.disabled = false;
  };
}

/* ---------- global click actions ---------- */
document.addEventListener('click', async e => {
  const open = e.target.closest('[data-open]'); if(open){ nav('#/h/' + open.dataset.open); return; }
  const n = e.target.closest('[data-notif]');
  if(n){ const id = n.dataset.notif; const it = S.notifs.find(x => x.id === id); if(it && !it.read){ it.read = true; C.markRead(id).catch(() => {}); paintNav(); S.redrawAlerts?.(); } if(n.dataset.h) nav('#/h/' + n.dataset.h); return; }
  const a = e.target.closest('[data-act]'); if(!a) return; const act = a.dataset.act;
  if(act === 'loc') locModal();
  else if(act === 'theme') toggleTheme();
  else if(act === 'logout'){ await signOut(C.auth); sessionStorage.removeItem('hk-role'); location.replace('hackthons.html'); }
  else if(act === 'back') history.length > 1 ? history.back() : nav('#/home');
  else if(act === 'clear-filters'){ S.f = { q: '', mode: '', fee: '', when: '', sort: 'trending', tag: '' }; route(); }
  else if(act === 'register'){ const h = S.cur?.id === a.dataset.id ? S.cur : await getH(a.dataset.id); if(h) registerModal(h); }
  else if(act === 'cancel-reg'){
    if(!confirm('Cancel your registration for this hackathon?')) return;
    try { await C.cancelRegistration(S.cur, S.user); S.regs = null; S.all = null; toast('Registration cancelled', 'info'); route(); } catch(err){ toast(err.message, 'error'); }
  }
  else if(act === 'share'){
    const url = location.origin + location.pathname + '#/h/' + a.dataset.id;
    try { if(navigator.share) await navigator.share({ title: a.dataset.title, url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch {}
  }
  else if(act === 'read-all'){ S.notifs.filter(x => !x.read).forEach(x => { x.read = true; C.markRead(x.id).catch(() => {}); }); paintNav(); S.redrawAlerts?.(); }
});

/* ---------- boot ---------- */
C.watchUser((user, { site, hk }) => {
  if(S.booted) return;
  const back = 'login-hackthons.html' + (location.hash.length > 2 ? '?next=' + encodeURIComponent(location.hash) : '');
  if(!user || !hk){ location.replace(back); return; }
  // The role is fixed at login (sessionStorage). No in-portal switching: log out and log in again to change side.
  const chosen = sessionStorage.getItem('hk-role');
  const role = ['participant', 'host'].includes(chosen) ? chosen : (hk.activeRole === 'host' ? 'host' : 'participant');
  S.booted = true; Object.assign(S, { user, site, hk, role });
  sessionStorage.setItem('hk-role', role);
  paintHeader(); paintNav();
  C.watchNotifications(user.uid, list => { S.notifs = list; paintNav(); S.redrawAlerts?.(); });
  const gate = role === 'host' ? !C.hostComplete(hk) : !C.participantComplete(hk);
  if(gate){
    // post-login intake form: builds the dashboard (participant) / organiser identity (host)
    const f = role === 'host' ? organiserForm : participantForm;
    f({ S, view }, () => { paintHeader(); paintNav(); location.hash.length > 2 ? route() : nav(role === 'host' ? '#/host' : '#/home'); });
    icons(); return;
  }
  route();
});
