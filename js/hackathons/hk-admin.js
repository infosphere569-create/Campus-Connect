// Hackathons admin portal: overview, approvals, approved cards (with date/search filters & host tap),
// deep hackathon process inspection, confirmed Host View workspace, hosts & participants management (view/edit/ban).
import { initBg } from './hk-bg.js';
import * as C from './hk-core.js';
import { empty, statusBadge, mediaStyle, detailHeader, detailBody, factsCard, bindTabs, countdownHtml, startCountdowns } from './hk-ui.js';
import { manage } from './hk-manage.js';
import { wizard } from './hk-host.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const toggleTheme = C.initTheme();
initBg($('#hkBg'));

const S = {
  user: null, site: null, hk: null,
  subAdmins: [], subAdmin: null,
  all: [], hosts: [], regs: [], subs: [], atts: [], logs: [],
  rt: 0, booted: false, cleanup: null,
  q: '', st: '', hid: '',
  apQ: '', apPhase: '', apDateField: 'approved', apPreset: '', apFrom: '', apTo: '',
  hq: '', hst: '', pq: '', pst: '',
  saQ: '', saUser: null, saResults: [],
  saPerms: { approve: false, view_delete: false, edit_hackathon: false, ban_unban: false, edit_profile: false }
};
const view = $('#view'), app = $('#app');
const stale = t => t !== S.rt;
const nav = h => { if(location.hash === h) route(); else location.hash = h; };
const curPath = () => (location.hash || '').replace(/^#/, '') || '/overview';
const isAdmin = () => C.isAdminUser(S.site);
const isSubAdmin = () => !isAdmin() && !!S.subAdmin;
const can = perm => {
  if(isAdmin()) return true;
  if(!S.subAdmin) return false;
  return !!S.subAdmin.permissions?.[perm];
};
const pendingN = () => S.all.filter(h => h.status === 'pending').length;

const isCompleted = h => h.status === 'closed' || (h.status === 'approved' && !!h.endMs && Date.now() > h.endMs);
const isLiveOrUpcoming = h => h.status === 'approved' && !(h.endMs && Date.now() > h.endMs);
const fmtFullDT = ms => ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '—';
const keepFocus = (id, fn) => {
  const el = document.activeElement?.id === id ? document.activeElement : null;
  const pos = el ? el.selectionStart : null;
  fn();
  icons();
  const next = $('#' + id);
  if(next){
    next.focus();
    if(pos != null){ try { next.setSelectionRange(pos, pos); } catch {} }
  }
};

function statsForHack(id){
  const r = S.regs.filter(x => x.hackathonId === id);
  const s = S.subs.filter(x => x.hackathonId === id);
  const a = S.atts.filter(x => x.hackathonId === id && x.submittedAtMs);
  return {
    regs: r,
    subs: s,
    atts: a,
    applied: r.length,
    shortlisted: r.filter(x => x.status === 'shortlisted').length,
    selected: r.filter(x => x.status === 'selected').length,
    waitlisted: r.filter(x => x.status === 'waitlisted').length,
    rejected: r.filter(x => x.status === 'rejected').length,
    testsDone: a.length,
    subsDone: s.length
  };
}

function buildParticipantsList(){
  const byUid = new Map();
  const regsByUid = new Map();
  S.regs.forEach(r => {
    if(!r.uid) return;
    if(!regsByUid.has(r.uid)) regsByUid.set(r.uid, []);
    regsByUid.get(r.uid).push(r);
  });
  S.hosts.forEach(p => {
    const uid = p.uid || p.id;
    const isPart = (p.roles || []).includes('participant') || p.onboarded || regsByUid.has(uid);
    if(!isPart) return;
    byUid.set(uid, { ...p, uid, _regs: regsByUid.get(uid) || [] });
  });
  regsByUid.forEach((list, uid) => {
    if(byUid.has(uid)) return;
    const r = list[0] || {};
    byUid.set(uid, {
      uid,
      displayName: r.name || 'Participant',
      email: r.email || '',
      phone: r.phone || '',
      college: r.college || '',
      city: r.city || '',
      course: r.course || '',
      branch: r.branch || '',
      year: r.year || '',
      skills: r.skills || '',
      level: r.level || '',
      gender: r.gender || '',
      github: r.github || '',
      linkedin: r.linkedin || '',
      portfolio: r.portfolio || '',
      bio: r.bio || '',
      photoURL: r.photoURL || '',
      roles: ['participant'],
      participantBlocked: false,
      banned: false,
      _regs: list
    });
  });
  return [...byUid.values()].map(p => ({
    ...p,
    _applied: p._regs.length,
    _selected: p._regs.filter(r => r.status === 'selected').length,
    _shortlisted: p._regs.filter(r => r.status === 'shortlisted').length,
    _banned: !!(p.participantBlocked || p.banned)
  })).sort((a, b) => (b._applied - a._applied) || (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

const BASE_NAV = [
  ['/overview', 'layout-dashboard', 'Overview'],
  ['/approvals', 'badge-check', 'Approvals'],
  ['/approved', 'circle-check-big', 'Approved'],
  ['/all', 'layers', 'All hackathons'],
  ['/hosts', 'building-2', 'Hosts'],
  ['/participants', 'user-check', 'Participants'],
  ['/regs', 'users', 'Registrations'],
  ['/logs', 'scroll-text', 'Audit log']
];
const getNavItems = () => isAdmin() ? [...BASE_NAV, ['/subadmins', 'shield-plus', 'Sub-admins']] : BASE_NAV;

function paintNav(){
  const p = pendingN(), cur = curPath(), navItems = getNavItems();
  const on = x => cur === x || cur.startsWith(x + '/')
    || (x === '/all' && (cur.startsWith('/view') || cur.startsWith('/manage') || cur.startsWith('/edit')));
  $('#side').innerHTML = `<div class="lbl">Hackathons admin</div>` +
    navItems.map(([x, ic, l]) => `<a class="hk-nav-i ${on(x) ? 'on' : ''}" href="#${x}"><i data-lucide="${ic}"></i><span class="t">${l}</span>${x === '/approvals' && p ? `<span class="badge">${p}</span>` : ''}</a>`).join('') +
    `<div class="sp"></div><a class="hk-nav-i" href="hackthons-portal.html"><i data-lucide="rocket"></i><span class="t">Hackathons portal</span></a>${isAdmin() ? `<a class="hk-nav-i" href="admin.html"><i data-lucide="shield"></i><span class="t">Main admin</span></a>` : ''}<button class="hk-nav-i" data-act="theme"><i data-lucide="sun-moon"></i><span class="t">Theme</span></button><button class="hk-nav-i" data-act="logout"><i data-lucide="log-out"></i><span class="t">Log out</span></button>`;
  const b = (x, ic, l) => `<a href="#${x}" class="${on(x) ? 'on' : ''}"><i data-lucide="${ic}"></i><span>${l}</span>${x === '/approvals' && p ? `<span class="badge">${p}</span>` : ''}</a>`;
  $('#bottom').innerHTML = b('/overview', 'layout-dashboard', 'Home') + b('/approvals', 'badge-check', 'Approve') + b('/approved', 'circle-check-big', 'Approved') + b('/hosts', 'building-2', 'Hosts') + b('/participants', 'user-check', 'Users');
  const d = $('#bellDot'); d.textContent = p > 9 ? '9+' : p; d.classList.toggle('hk-hidden', !p);
  icons();
}

$('#menuBtn').onclick = () => { if(matchMedia('(max-width:900px)').matches){ const o = app.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); } else app.classList.toggle('collapsed'); };
$('#scrim').onclick = () => app.classList.remove('open');
$('#bellBtn').onclick = () => nav('#/approvals');

const mapDocs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
async function load(){
  const [all, hosts, regs, subs, atts, logs, subAdmins] = await Promise.all([
    C.fetchAll(),
    FS.getDocs(FS.query(FS.collection(C.db, 'hkProfiles'), FS.limit(1000))).then(mapDocs),
    C.allRegistrations(),
    C.allSubmissions().catch(() => []),
    C.allAttempts().catch(() => []),
    FS.getDocs(FS.query(FS.collection(C.db, 'auditLogs'), FS.where('scope', '==', 'hackathons'), FS.limit(400))).then(mapDocs).catch(() => []),
    C.fetchSubAdmins().catch(() => [])
  ]);
  S.all = all.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  S.hosts = hosts;
  S.regs = regs;
  S.subs = subs;
  S.atts = atts;
  S.logs = logs.sort((a, b) => b.createdAtMs - a.createdAtMs);
  S.subAdmins = subAdmins;
  if(!isAdmin() && S.user){
    S.subAdmin = subAdmins.find(x => x.uid === S.user.uid) || S.subAdmin;
  }
}

const adminCtx = t => ({
  S, view,
  stale: () => stale(t),
  nav,
  refreshMine: async () => S.all,
  ensureAll: async () => S.all,
  fail: e => `<div class="hk-view">${empty('triangle-alert', 'Could not load', e.message)}</div>`,
  myCollege: () => S.site?.college || '',
  backHash: '#/all',
  backLabel: 'Back to Admin',
  viewHref: ''
});

const ROUTES = [
  [/^\/overview$/, overview],
  [/^\/approvals$/, approvals],
  [/^\/approved$/, approvedList],
  [/^\/all$/, allList],
  [/^\/view\/([\w-]+)$/, viewOne],
  [/^\/manage\/([\w-]+)$/, (t, id) => {
    if(!can('view_delete')){
      toast('Permission required: Inspection & Delete to enter Host View', 'error');
      nav('#/view/' + id);
      return;
    }
    return manage({ ...adminCtx(t), backHash: `#/view/${id}`, backLabel: 'Back to Hackathon View', viewHref: `#/view/${id}` }, id);
  }],
  [/^\/edit\/([\w-]+)$/, (t, id) => {
    if(!can('edit_hackathon')){
      toast('Permission required: Edit Hackathons', 'error');
      nav('#/view/' + id);
      return;
    }
    return wizard({ ...adminCtx(t), backHash: `#/view/${id}` }, id);
  }],
  [/^\/hosts$/, hostsView],
  [/^\/participants$/, participantsView],
  [/^\/regs$/, regsView],
  [/^\/logs$/, logsView],
  [/^\/subadmins$/, subAdminsView]
];

async function route(){
  const t = ++S.rt, path = curPath();
  try { S.cleanup?.(); } catch {}
  S.cleanup = null;
  app.classList.remove('open');
  paintNav();
  for(const [re, fn] of ROUTES){
    const m = path.match(re); if(!m) continue;
    try { await fn(t, ...m.slice(1)); } catch(e){ console.error(e); view.innerHTML = `<div class="hk-view">${empty('triangle-alert', 'Could not load', e.message)}</div>`; }
    icons(); scrollTo({ top: 0 }); return;
  }
  nav('#/overview');
}
addEventListener('hashchange', route);
const reload = async () => { await load(); route(); };

/* =====================================================================
   Overview (Admin Dashboard)
   ===================================================================== */
function overview(){
  const now = Date.now(), by = k => S.all.filter(h => h.status === k).length;
  const live = S.all.filter(isLiveOrUpcoming).length;
  const completed = S.all.filter(isCompleted).length;
  const selectedTotal = S.regs.filter(r => r.status === 'selected').length;
  const hostCount = S.hosts.filter(h => (h.roles || []).includes('host') || h.hostOnboarded).length;
  const partCount = buildParticipantsList().length;

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5); d.setHours(0, 0, 0, 0); return d.getTime(); });
  const perDay = days.map(d => S.regs.filter(r => r.createdAtMs >= d && r.createdAtMs < d + 864e5).length), mx = Math.max(1, ...perDay);
  const top = [...S.all].filter(h => h.status === 'approved' || h.status === 'closed').sort((a, b) => (b.regCount || 0) - (a.regCount || 0)).slice(0, 6), tmax = Math.max(1, top[0]?.regCount || 1);
  const cities = {}; S.all.filter(h => h.status === 'approved').forEach(h => { const c = h.city || 'Online'; cities[c] = (cities[c] || 0) + 1; });
  const cl = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 6), cmax = Math.max(1, cl[0]?.[1] || 1);
  const dn = d => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);

  const activeRows = S.all.filter(h => ['approved', 'closed'].includes(h.status)).sort((a, b) => (b.reviewedAtMs || b.updatedAtMs || 0) - (a.reviewedAtMs || a.updatedAtMs || 0));

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">Admin dashboard</span><h1>Hackathons command center</h1><p>Live events, completed hackathons, applications, tests, selections, and host activity.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="hk-btn primary" href="#/approved"><i data-lucide="circle-check-big"></i>Approved cards</a><button class="hk-btn" data-act="refresh"><i data-lucide="refresh-cw"></i>Refresh</button></div></div>

    ${pendingN() ? `<div class="hk-banner"><i data-lucide="hourglass" style="width:28px;height:28px;color:var(--hk-gold)"></i><div class="grow"><b>${pendingN()} hackathon${pendingN() > 1 ? 's' : ''} waiting for approval</b><div class="hk-sm hk-muted">Hosts are waiting for a decision.</div></div><a class="hk-btn gold sm" href="#/approvals">Review now</a></div>` : ''}

    <div class="hk-kpis">
      <div class="hk-kpi c"><div class="ki"><i data-lucide="hourglass"></i></div><strong>${pendingN()}</strong><span>Pending approval</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="radio"></i></div><strong>${live}</strong><span>Live / upcoming</span></div>
      <div class="hk-kpi g"><div class="ki"><i data-lucide="flag"></i></div><strong>${completed}</strong><span>Completed / ended</span></div>
      <div class="hk-kpi s"><div class="ki"><i data-lucide="users"></i></div><strong>${S.regs.length}</strong><span>Total applied</span></div>
      <div class="hk-kpi g"><div class="ki"><i data-lucide="trophy"></i></div><strong>${selectedTotal}</strong><span>Final selected</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="building-2"></i></div><strong>${hostCount}</strong><span>Hosts</span></div>
      <div class="hk-kpi s"><div class="ki"><i data-lucide="user-check"></i></div><strong>${partCount}</strong><span>Participants</span></div>
      <div class="hk-kpi c"><div class="ki"><i data-lucide="layers"></i></div><strong>${S.all.length}</strong><span>All hackathons</span></div>
    </div>

    <div class="hk-sec"><h2><i data-lucide="activity"></i>Hackathon-wise applications &amp; process</h2><a class="hk-btn ghost sm" href="#/approved">Open Approved <i data-lucide="arrow-right"></i></a></div>
    ${activeRows.length ? `<div class="hk-tablewrap"><table class="hk-table">
      <thead><tr><th>Hackathon</th><th>Host</th><th>Created</th><th>Approved</th><th>Applied</th><th>Tests</th><th>Submissions</th><th>Shortlisted</th><th>Selected</th><th>Phase</th><th></th></tr></thead>
      <tbody>${activeRows.map(h => {
        const st = statsForHack(h.id);
        const ph = C.phase(h);
        const host = S.hosts.find(x => x.uid === h.hostUid);
        const hostLabel = host?.org || host?.displayName || h.brandName || h.hostName || 'Organiser';
        return `<tr>
          <td><button type="button" class="hk-rowlink" data-open-view="${esc(h.id)}"><b>${esc(h.title || 'Untitled')}</b></button><div class="hk-xs hk-muted">${esc(h.college || h.city || 'Online')}</div></td>
          <td><button type="button" class="hk-rowlink" data-view-host="${esc(h.hostUid)}"><b>${esc(hostLabel)}</b></button><div class="hk-xs hk-muted">${esc(host?.email || h.contactEmail || '')}</div></td>
          <td class="hk-xs">${C.fmtDate(h.createdAtMs)}</td>
          <td class="hk-xs">${C.fmtDate(h.reviewedAtMs || h.updatedAtMs)}</td>
          <td><b>${st.applied}</b></td>
          <td>${st.testsDone}</td>
          <td>${st.subsDone}</td>
          <td>${st.shortlisted}</td>
          <td><b style="color:var(--hk-gold)">${st.selected}</b></td>
          <td><span class="hk-chip ${ph.tone}">${esc(ph.label)}</span></td>
          <td style="text-align:right;white-space:nowrap"><a class="hk-btn sm primary" href="#/view/${esc(h.id)}"><i data-lucide="eye"></i>Details</a></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : empty('layers', 'No approved hackathons yet', 'Approved hackathons and their live application metrics appear here.')}

    <div class="hk-grid2" style="margin-top:22px;align-items:start">
      <div class="hk-card-s"><b>Registrations · last 7 days</b><div class="hk-spark" style="margin-top:16px">${perDay.map((n, i) => `<div><span>${n}</span><i style="height:${Math.max(4, n / mx * 88)}px"></i><span>${dn(days[i])}</span></div>`).join('')}</div></div>
      <div class="hk-card-s"><b>Top hackathons by applications</b><div class="hk-bars" style="margin-top:14px">${top.length ? top.map(h => `<div class="hk-bar"><span class="hk-clamp2" style="font-weight:600">${esc(h.title)}</span><i style="width:${(h.regCount || 0) / tmax * 100}%"></i><b>${h.regCount || 0}</b></div>`).join('') : '<span class="hk-muted hk-sm">No data yet.</span>'}</div></div>
      <div class="hk-card-s"><b>Hackathons by city</b><div class="hk-bars" style="margin-top:14px">${cl.length ? cl.map(([c, n]) => `<div class="hk-bar"><span style="font-weight:600">${esc(c)}</span><i style="width:${n / cmax * 100}%"></i><b>${n}</b></div>`).join('') : '<span class="hk-muted hk-sm">No data yet.</span>'}</div></div>
      <div class="hk-card-s"><b>Status breakdown</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${['draft', 'pending', 'approved', 'changes_requested', 'rejected', 'closed'].map(k => `${statusBadge(k)}<b style="margin-right:10px">${by(k)}</b>`).join('')}</div></div>
    </div>
  </div>`;
}

/* =====================================================================
   Approvals Queue
   ===================================================================== */
function approvals(){
  const q = S.all.filter(h => h.status === 'pending').sort((a, b) => (a.submittedAtMs || 0) - (b.submittedAtMs || 0));
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Queue</span><h1>Approvals</h1><p>Oldest submissions first. Open a hackathon to review everything before deciding.</p></div></div>
    ${q.length ? `<div class="hk-stack">${q.map(h => `<div class="hk-lrow"><div class="th" style="${mediaStyle(h)}"></div><div class="info"><b>${esc(h.title)}</b><span class="hk-sm hk-muted">${esc(h.brandName || h.hostName || '')} · ${esc(h.college || '')} · ${esc(h.city || '')}</span><span class="hk-xs hk-muted" style="display:block">Created ${fmtFullDT(h.createdAtMs)} · Submitted ${C.ago(h.submittedAtMs || h.updatedAtMs)} · starts ${C.fmtDate(h.startMs)}</span></div><div class="acts"><button class="hk-btn sm" data-view-host="${esc(h.hostUid)}"><i data-lucide="user-round"></i>Host</button><a class="hk-btn sm" href="#/view/${h.id}"><i data-lucide="eye"></i>Review</a><button class="hk-btn sm primary" data-dec="approved" data-id="${h.id}">Approve</button><button class="hk-btn sm" data-dec="changes_requested" data-id="${h.id}">Changes</button><button class="hk-btn sm danger" data-dec="rejected" data-id="${h.id}">Reject</button></div></div>`).join('')}</div>` : empty('party-popper', 'Queue is clear', 'No hackathons are waiting for approval.')}</div>`;
}

async function decide(id, decision){
  if(!can('approve')) return toast('Permission required: Approve & Decisions', 'error');
  const h = S.all.find(x => x.id === id); if(!h) return;
  const needNote = decision !== 'approved', label = { approved: 'Approve', changes_requested: 'Request changes', rejected: 'Reject' }[decision];
  modal(`${label} · ${h.title}`, `<form class="hk-form" id="dec"><p class="hk-sm hk-muted">${decision === 'approved' ? 'This makes the hackathon visible to all students immediately and adds it to the Approved section.' : 'The host will see your note and be notified.'}</p>
    <div class="hk-field"><label>${needNote ? 'Note to host' : 'Note to host <small>optional</small>'}</label><textarea class="hk-textarea" name="note" maxlength="600" ${needNote ? 'required' : ''} placeholder="${decision === 'rejected' ? 'Why is this not approved?' : decision === 'changes_requested' ? 'What should the host fix?' : 'e.g. Looks great!'}"></textarea></div>
    ${decision === 'approved' ? '<label class="hk-check"><input type="checkbox" name="feat"><span>Feature this hackathon (boosts it in Trending)</span></label><label class="hk-check"><input type="checkbox" name="ver" checked><span>Mark host as verified</span></label>' : ''}
    <button class="hk-btn ${decision === 'rejected' ? 'danger' : 'primary'} lg block" type="submit">${label}</button></form>`, { onMount(b, close){
    $('#dec', b).onsubmit = async ev => {
      ev.preventDefault(); const fd = new FormData(ev.target), note = (fd.get('note') || '').trim();
      if(needNote && note.length < 5) return toast('Add a short note for the host.', 'error');
      const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
      try {
        const now = Date.now();
        const patch = { status: decision, adminNote: note, reviewedBy: S.user.uid, reviewedAtMs: now, updatedAtMs: now, updatedAt: FS.serverTimestamp() };
        if(decision === 'approved'){ patch.featured = !!fd.get('feat'); patch.approvedAtMs = now; if(fd.get('ver')) patch.hostVerified = true; }
        await FS.updateDoc(FS.doc(C.db, 'hkHackathons', id), patch);
        if(decision === 'approved' && fd.get('ver')) FS.updateDoc(FS.doc(C.db, 'hkProfiles', h.hostUid), { hostVerified: true }).catch(() => {});
        await C.notify({ toUid: h.hostUid, fromUid: S.user.uid, hackathonId: id, type: decision, title: decision === 'approved' ? 'Your hackathon is live!' : decision === 'rejected' ? 'Hackathon not approved' : 'Changes requested', body: `${h.title}${note ? ': ' + note : ' has been approved and is now visible to students.'}` }).catch(() => {});
        C.audit(S.user.uid, `hackathon.${decision}`, id, { title: h.title, note });
        close(); toast(`${label}d`.replace('Request changesd', 'Changes requested').replace('Rejectd', 'Rejected').replace('Approved', 'Approved')); await reload();
      } catch(e){ toast(e.message, 'error'); btn.disabled = false; btn.textContent = label; }
    };
  } });
}

/* =====================================================================
   Approved Section (Search + Date Filter + Rich Cards + Host Tap)
   ===================================================================== */
function approvedList(){
  const approvedAll = S.all.filter(h => h.status === 'approved');
  const q = S.apQ.toLowerCase();
  const fieldMs = h => S.apDateField === 'created'
    ? (h.createdAtMs || 0)
    : S.apDateField === 'start'
    ? (h.startMs || 0)
    : (h.approvedAtMs || h.reviewedAtMs || h.updatedAtMs || 0);

  let fromMs = S.apFrom ? new Date(S.apFrom + 'T00:00:00').getTime() : 0;
  let toMs = S.apTo ? new Date(S.apTo + 'T23:59:59.999').getTime() : 0;
  if(S.apPreset === 'today'){
    const d = new Date(); d.setHours(0, 0, 0, 0); fromMs = d.getTime(); toMs = Date.now();
  } else if(S.apPreset === '7d'){
    fromMs = Date.now() - 7 * 864e5; toMs = Date.now();
  } else if(S.apPreset === '30d'){
    fromMs = Date.now() - 30 * 864e5; toMs = Date.now();
  }

  const list = approvedAll.filter(h => {
    const host = S.hosts.find(x => x.uid === h.hostUid);
    if(S.apPhase === 'live' && !isLiveOrUpcoming(h)) return false;
    if(S.apPhase === 'completed' && !isCompleted(h)) return false;
    const ms = fieldMs(h);
    if(fromMs && (!ms || ms < fromMs)) return false;
    if(toMs && (!ms || ms > toMs)) return false;
    if(q){
      const hay = [h.title, h.tagline, h.brandName, h.hostName, h.college, h.city, h.contactEmail, host?.displayName, host?.email, host?.org, host?.college].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.approvedAtMs || b.reviewedAtMs || b.updatedAtMs || 0) - (a.approvedAtMs || a.reviewedAtMs || a.updatedAtMs || 0));

  const renderCard = h => {
    const ph = C.phase(h);
    const host = S.hosts.find(x => x.uid === h.hostUid);
    const st = statsForHack(h.id);
    const approvedTs = h.approvedAtMs || h.reviewedAtMs || h.updatedAtMs;
    const hostPhoto = C.safeUrl(host?.photoURL) || 'icon.png';
    const hostTitle = host?.org || h.brandName || host?.organiserName || h.hostName || 'Organiser';
    const hostSub = [host?.organiserName || host?.displayName, host?.college || h.college, host?.email || h.contactEmail].filter(Boolean).join(' · ');

    return `<article class="hk-acard">
      <div class="hk-card-media" data-open-view="${esc(h.id)}" style="${mediaStyle(h, 'banner')};cursor:pointer">
        <div class="tl"><span class="hk-chip ${ph.tone}">${esc(ph.label)}</span>${h.featured ? '<span class="hk-chip gold"><i data-lucide="sparkles"></i>Featured</span>' : ''}</div>
        <div class="tr"><span class="hk-chip"><i data-lucide="calendar-days"></i>${C.dateRange(h.startMs, h.endMs)}</span></div>
      </div>
      <div class="hk-acard-main" data-open-view="${esc(h.id)}">
        <div>
          <h3 class="hk-clamp2" style="margin-bottom:4px">${esc(h.title || 'Untitled hackathon')}</h3>
          <p class="hk-sm hk-muted hk-clamp2" style="margin:0">${esc(h.tagline || h.college || h.city || '')}</p>
        </div>
        <div class="hk-acard-dates">
          <div><span>Created on</span><b>${fmtFullDT(h.createdAtMs)}</b></div>
          <div><span>Admin approved</span><b>${fmtFullDT(approvedTs)}</b></div>
        </div>
        <div class="hk-acard-metrics">
          <div><b>${st.applied}</b><small>Applied</small></div>
          <div><b>${st.testsDone}</b><small>Tests</small></div>
          <div><b>${st.shortlisted}</b><small>Shortlisted</small></div>
          <div><b style="color:var(--hk-gold)">${st.selected}</b><small>Selected</small></div>
        </div>
      </div>
      <button type="button" class="hk-acard-host" data-view-host="${esc(h.hostUid)}" title="Tap to view host profile">
        <span class="hw">
          <img src="${esc(hostPhoto)}" alt="" onerror="this.src='icon.png'">
          <span class="hn">
            <b>${esc(hostTitle)} ${host?.hostVerified || h.hostVerified ? '<i data-lucide="badge-check" style="width:14px;height:14px;color:var(--hk-p)"></i>' : ''}</b>
            <small>${esc(hostSub || 'Tap to view host profile')}</small>
          </span>
        </span>
        <span class="hk-chip neutral"><i data-lucide="user-round"></i>Host</span>
      </button>
    </article>`;
  };

  const hasFilter = !!(S.apQ || S.apPhase || S.apPreset || S.apFrom || S.apTo);
  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">Approved directory</span><h1>Approved hackathons</h1><p>${list.length} of ${approvedAll.length} approved · tap any card to view registrations, tests &amp; selections, or tap the host bar below a card for full host details.</p></div></div>
    <div class="hk-toolbar" style="margin-bottom:10px">
      <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="apQ" value="${esc(S.apQ)}" placeholder="Search hackathon, host, email, college, city…"></div>
      <select class="hk-select" id="apPhase" style="width:auto;min-height:46px">
        <option value="" ${S.apPhase === '' ? 'selected' : ''}>All phases</option>
        <option value="live" ${S.apPhase === 'live' ? 'selected' : ''}>Live / upcoming</option>
        <option value="completed" ${S.apPhase === 'completed' ? 'selected' : ''}>Completed / ended</option>
      </select>
    </div>
    <div class="hk-card-s hk-datebar" style="padding:12px 14px;margin-bottom:18px">
      <span class="hk-xs hk-muted" style="font-weight:700;text-transform:uppercase;letter-spacing:.05em"><i data-lucide="calendar-range" style="width:14px;height:14px"></i> Date filter:</span>
      <select class="hk-select sm" id="apDateField">
        <option value="approved" ${S.apDateField === 'approved' ? 'selected' : ''}>Approved date</option>
        <option value="created" ${S.apDateField === 'created' ? 'selected' : ''}>Created date</option>
        <option value="start" ${S.apDateField === 'start' ? 'selected' : ''}>Event start date</option>
      </select>
      <select class="hk-select sm" id="apPreset">
        <option value="" ${S.apPreset === '' ? 'selected' : ''}>Custom / All dates</option>
        <option value="today" ${S.apPreset === 'today' ? 'selected' : ''}>Today</option>
        <option value="7d" ${S.apPreset === '7d' ? 'selected' : ''}>Last 7 days</option>
        <option value="30d" ${S.apPreset === '30d' ? 'selected' : ''}>Last 30 days</option>
      </select>
      <input type="date" class="hk-input" id="apFrom" value="${esc(S.apFrom)}" aria-label="From date" title="From date">
      <span class="hk-xs hk-muted">to</span>
      <input type="date" class="hk-input" id="apTo" value="${esc(S.apTo)}" aria-label="To date" title="To date">
      ${hasFilter ? `<button type="button" class="hk-btn sm ghost" id="apClear"><i data-lucide="x"></i>Clear</button>` : ''}
    </div>
    ${list.length ? `<div class="hk-cards">${list.map(renderCard).join('')}</div>` : empty('search-x', 'No approved hackathons match', 'Try clearing the search query or date filter.')}
  </div>`;

  $('#apQ').oninput = C.debounce(e => { S.apQ = e.target.value.trim(); keepFocus('apQ', approvedList); }, 220);
  $('#apPhase').onchange = e => { S.apPhase = e.target.value; approvedList(); icons(); };
  $('#apDateField').onchange = e => { S.apDateField = e.target.value; approvedList(); icons(); };
  $('#apPreset').onchange = e => { S.apPreset = e.target.value; if(S.apPreset){ S.apFrom = ''; S.apTo = ''; } approvedList(); icons(); };
  $('#apFrom').onchange = e => { S.apFrom = e.target.value; S.apPreset = ''; approvedList(); icons(); };
  $('#apTo').onchange = e => { S.apTo = e.target.value; S.apPreset = ''; approvedList(); icons(); };
  $('#apClear')?.addEventListener('click', () => { S.apQ = ''; S.apPhase = ''; S.apPreset = ''; S.apFrom = ''; S.apTo = ''; approvedList(); icons(); });
}

/* =====================================================================
   All hackathons
   ===================================================================== */
function allList(){
  const q = S.q.toLowerCase();
  const l = S.all.filter(h => (!S.st || h.status === S.st) && (!q || [h.title, h.brandName, h.hostName, h.college, h.city].join(' ').toLowerCase().includes(q)));
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Manage</span><h1>All hackathons</h1><p>${l.length} of ${S.all.length}</p></div></div>
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="aq" value="${esc(S.q)}" placeholder="Search title, brand, college, city…"></div>
    <select class="hk-select" id="ast" style="width:auto;min-height:46px">${[['', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['changes_requested', 'Changes requested'], ['rejected', 'Rejected'], ['draft', 'Draft'], ['closed', 'Closed']].map(([k, v]) => `<option value="${k}" ${k === S.st ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${l.length ? `<div class="hk-stack">${l.map(h => {
      const st = statsForHack(h.id);
      return `<div class="hk-lrow"><div class="th" style="${mediaStyle(h)}"></div><div class="info"><b>${esc(h.title || 'Untitled')}${h.featured ? ' <span class="hk-chip gold">Featured</span>' : ''}</b><span class="hk-sm hk-muted">${esc(h.brandName || h.hostName || '')} · ${esc(h.city || 'Online')} · ${C.dateRange(h.startMs, h.endMs)} · ${st.applied} applied · ${st.selected} selected</span><span class="hk-xs hk-muted" style="display:block">Created ${C.fmtDate(h.createdAtMs)}${h.reviewedAtMs ? ' · Reviewed ' + C.fmtDate(h.reviewedAtMs) : ''}</span></div>${statusBadge(h.status)}<div class="acts"><button class="hk-btn sm" data-view-host="${esc(h.hostUid)}"><i data-lucide="user-round"></i>Host</button><a class="hk-btn sm primary" href="#/view/${h.id}">Open</a>${h.status === 'approved' ? `<button class="hk-btn sm" data-feat="${h.id}">${h.featured ? 'Unfeature' : 'Feature'}</button><button class="hk-btn sm danger" data-close="${h.id}">Close</button>` : ''}${h.status === 'closed' ? `<button class="hk-btn sm" data-reopen="${h.id}">Reopen</button>` : ''}<button class="hk-btn sm danger" data-rm="${h.id}"><i data-lucide="trash-2"></i></button></div></div>`;
    }).join('')}</div>` : empty('search-x', 'Nothing matches', 'Try another search or status.')}</div>`;
  $('#aq').oninput = C.debounce(e => { S.q = e.target.value.trim(); keepFocus('aq', allList); }, 250);
  $('#ast').onchange = e => { S.st = e.target.value; allList(); icons(); };
}

async function patch(id, data, action, msg){
  try {
    await FS.updateDoc(FS.doc(C.db, 'hkHackathons', id), { ...data, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
    const h = S.all.find(x => x.id === id);
    if(h?.hostUid){
      const nMap = {
        'hackathon.feature': { type: 'featured', title: data.featured ? 'Hackathon featured' : 'Featured badge updated', body: data.featured ? `${h.title} is now featured in Trending.` : `${h.title} is no longer featured.` },
        'hackathon.close': { type: 'closed', title: 'Hackathon closed by admin', body: `${h.title} has been closed and hidden from new listings.` },
        'hackathon.reopen': { type: 'reopened', title: 'Hackathon reopened', body: `${h.title} is live again for participants.` }
      };
      const meta = nMap[action];
      if(meta) C.notify({ toUid: h.hostUid, fromUid: S.user.uid, hackathonId: id, ...meta }).catch(() => {});
    }
    C.audit(S.user.uid, action, id); toast(msg); await reload();
  } catch(e){ toast(e.message, 'error'); }
}

/* =====================================================================
   Deep Hackathon View (#/view/:id) + Confirm Host Mode Gate
   ===================================================================== */
function confirmHostModeModal(h, action = 'manage'){
  const isEdit = action === 'edit';
  if(isEdit && !can('edit_hackathon')) return toast('Permission required: Edit Hackathons', 'error');
  if(!isEdit && !can('view_delete')) return toast('Permission required: Inspection & Delete to enter Host View', 'error');
  modal(`Confirm Host View · ${h.title}`, `<div class="hk-form">
    <div class="hk-msg ok"><i data-lucide="shield-alert"></i><span>You are entering <b>Host-level controls</b> for <b>${esc(h.title)}</b>.</span></div>
    <p class="hk-sm hk-muted">Inside Host View you can perform every action a host can: shortlist/select/reject participants, move teams between rounds, score project submissions, manage screening tests, send team emails/announcements, and edit hackathon details.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:6px">
      <button type="button" class="hk-btn" data-cancel-hv>Cancel</button>
      <button type="button" class="hk-btn gold" id="confirmHvBtn"><i data-lucide="${isEdit ? 'pencil' : 'terminal'}"></i>Confirm &amp; Open ${isEdit ? 'Host Editor' : 'Host View'}</button>
    </div>
  </div>`, {
    onMount(b, close){
      $('[data-cancel-hv]', b).onclick = close;
      $('#confirmHvBtn', b).onclick = () => {
        C.audit(S.user.uid, isEdit ? 'hackathon.admin_host_edit' : 'hackathon.admin_host_view', h.id, { title: h.title });
        close();
        nav(isEdit ? `#/edit/${h.id}` : `#/manage/${h.id}`);
      };
    }
  });
}

async function viewOne(t, id){
  const h = S.all.find(x => x.id === id) || await C.fetchOne(id).catch(() => null);
  if(stale(t)) return;
  if(!h){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Not found', 'This hackathon no longer exists.', '<a class="hk-btn" href="#/approved">Back</a>')}</div>`; return; }

  const host = S.hosts.find(x => x.uid === h.hostUid);
  const [regs, subs, atts, testMeta] = await Promise.all([
    C.hackathonRegistrations(id, h.hostUid).catch(() => S.regs.filter(r => r.hackathonId === id)),
    C.hackathonSubmissions(id, h.hostUid).catch(() => S.subs.filter(s => s.hackathonId === id)),
    C.hackathonAttempts(id, h.hostUid).catch(() => S.atts.filter(a => a.hackathonId === id)),
    C.getTestMeta(id).catch(() => null)
  ]);
  if(stale(t)) return;

  const hh = { ...h, _phase: C.phase(h) };
  const rounds = C.roundsOf(h);
  const roundName = i => rounds[i]?.name || (rounds.length ? 'Completed' : 'Registered');
  const subOf = uid => subs.find(x => x.uid === uid);
  const attOf = uid => atts.find(x => x.uid === uid);
  const shortlistedN = regs.filter(r => r.status === 'shortlisted').length;
  const selectedN = regs.filter(r => r.status === 'selected').length;
  const testDone = atts.filter(a => a.submittedAtMs).sort((a, b) => (b.score || 0) - (a.score || 0));
  const issues = C.validateForSubmit({ ...h, agree: true }).filter(e => !/future/.test(e.msg));
  const approvedTs = h.approvedAtMs || h.reviewedAtMs || (h.status === 'approved' ? h.updatedAtMs : 0);
  const cd = countdownHtml(h, null, false);

  let activeTab = 'process', pq = '', pSt = '';

  const renderProcessTab = () => {
    const flt = regs.filter(r => (!pSt || r.status === pSt) && (!pq || [r.name, r.email, r.phone, r.college, r.teamName].join(' ').toLowerCase().includes(pq.toLowerCase())));
    return `
      <div class="hk-toolbar">
        <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="vpQ" value="${esc(pq)}" placeholder="Search applicant name, email, college, team…"></div>
        <select class="hk-select" id="vpSt" style="width:auto;min-height:46px">
          <option value="">All statuses (${regs.length})</option>
          ${C.REG_STATUS.map(s => `<option value="${s}" ${pSt === s ? 'selected' : ''}>${s} (${regs.filter(r => r.status === s).length})</option>`).join('')}
        </select>
      </div>
      ${flt.length ? `<div class="hk-tablewrap"><table class="hk-table">
        <thead><tr><th>Applicant</th><th>Team</th><th>College</th><th>Round</th><th>Status</th><th>Test</th><th>Project</th><th></th></tr></thead>
        <tbody>${flt.map(r => {
          const s = subOf(r.uid), a = attOf(r.uid);
          const chipCls = r.status === 'selected' ? 'gold' : r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : '';
          return `<tr>
            <td><button type="button" class="hk-rowlink" data-view-part="${esc(r.uid)}" data-hid="${esc(h.id)}"><b>${esc(r.name)}</b></button><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td>
            <td>${r.teamMode === 'solo' ? '<span class="hk-chip neutral">Solo</span>' : `<b>${esc(r.teamName || 'Team')}</b><div class="hk-xs hk-muted">${(r.members || []).length + 1} members</div>`}</td>
            <td>${esc(r.college || '—')}<div class="hk-xs hk-muted">${esc(r.year || '')}</div></td>
            <td class="hk-xs">${esc(roundName(r.stage || 0))}</td>
            <td><span class="hk-chip ${chipCls}">${esc(r.status)}</span></td>
            <td class="hk-xs">${a?.submittedAtMs ? `<b>${a.score}/${a.total}</b>` : '<span class="hk-muted">—</span>'}</td>
            <td class="hk-xs">${s ? `<span class="hk-chip">${s.score != null ? 'Score ' + esc(s.score) : 'Submitted'}</span>` : '<span class="hk-muted">—</span>'}</td>
            <td style="text-align:right"><button type="button" class="hk-btn sm" data-view-part="${esc(r.uid)}" data-hid="${esc(h.id)}"><i data-lucide="user-round"></i>Profile</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : empty('users', regs.length ? 'No matching applicants' : 'No registrations yet', regs.length ? 'Try another search or status filter.' : 'Applicants will appear here as soon as teams register.')}
    `;
  };

  const renderTestsTab = () => {
    if(!testMeta && !testDone.length) return empty('clipboard-check', 'No screening test created', 'The host has not added a screening test for this hackathon yet.');
    return `<div class="hk-card-s" style="margin-bottom:14px">
      <b>${esc(testMeta?.title || 'Screening test')}</b>
      <div class="hk-sm hk-muted">${testMeta ? `${testMeta.count} questions · ${testMeta.durationMin} min · ${testMeta.total} marks` : ''} · ${testDone.length} of ${regs.length} completed</div>
    </div>
    ${testDone.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>#</th><th>Applicant</th><th>Team</th><th>Score</th><th>Submitted</th><th></th></tr></thead><tbody>${testDone.map((a, i) => {
      const r = regs.find(x => x.uid === a.uid);
      return `<tr><td>${i + 1}</td><td><button type="button" class="hk-rowlink" data-view-part="${esc(a.uid)}" data-hid="${esc(h.id)}"><b>${esc(r?.name || a.uid)}</b></button><div class="hk-xs hk-muted">${esc(r?.email || '')}</div></td><td>${esc(r?.teamName || 'Solo')}</td><td><b>${a.score}</b> / ${a.total}</td><td class="hk-xs">${C.fmtDT(a.submittedAtMs)}</td><td style="text-align:right"><button type="button" class="hk-btn sm" data-view-part="${esc(a.uid)}" data-hid="${esc(h.id)}"><i data-lucide="user-round"></i>Profile</button></td></tr>`;
    }).join('')}</tbody></table></div>` : empty('clipboard-check', 'No test attempts yet', 'Scores appear here as participants submit.')}`;
  };

  const linkChip = (u, l) => C.safeUrl(u) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${l}</a>` : '';
  const renderSubsTab = () => subs.length ? `<div class="hk-stack">${subs.map(s => `<div class="hk-card-s">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
      <div><b>${esc(s.title)}</b><div class="hk-sm hk-muted"><button type="button" class="hk-rowlink" data-view-part="${esc(s.uid)}" data-hid="${esc(h.id)}"><b>${esc(s.teamName || s.leaderName)}</b></button> · ${C.ago(s.updatedAtMs)}</div></div>
      <div style="display:flex;gap:8px;align-items:center">${s.score != null ? `<span class="hk-chip gold">Score ${esc(s.score)}</span>` : ''}${s.reviewStatus === 'reviewed' ? '<span class="hk-chip">Reviewed</span>' : '<span class="hk-chip warn">Pending review</span>'}</div>
    </div>
    <p class="hk-sm hk-prose" style="margin:10px 0">${esc(s.idea || '')}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${linkChip(s.pptUrl, 'PPT')}${linkChip(s.repoUrl, 'Repo')}${linkChip(s.demoUrl, 'Demo')}${linkChip(s.videoUrl, 'Prototype Video')}${linkChip(s.introVideoUrl, 'Intro Video')}${linkChip(s.extraUrl, 'Other')}</div>
    ${(s.customAnswers || []).length ? `<div class="hk-stack" style="gap:4px;margin-top:8px">${s.customAnswers.map(c => `<div class="hk-xs"><b>${esc(c.label)}:</b> ${C.safeUrl(c.value) ? `<a href="${esc(C.safeUrl(c.value))}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline">${esc(c.value)}</a>` : esc(c.value)}</div>`).join('')}</div>` : ''}
    ${s.feedback ? `<div class="hk-msg ok" style="margin-top:10px;padding:8px 12px"><i data-lucide="message-square-text"></i><span><b>Host feedback:</b> ${esc(s.feedback)}</span></div>` : ''}
  </div>`).join('')}</div>` : empty('lightbulb', 'No submissions yet', 'Submitted project ideas, GitHub repos, and PPTs appear here.');

  const renderDetailsTab = () => `<div class="hk-detail"><div>${detailBody(hh)}</div>${factsCard(hh)}</div>`;

  const drawBody = () => {
    const bodyEl = $('#vBody');
    if(!bodyEl) return;
    if(activeTab === 'process') bodyEl.innerHTML = renderProcessTab();
    else if(activeTab === 'tests') bodyEl.innerHTML = renderTestsTab();
    else if(activeTab === 'subs') bodyEl.innerHTML = renderSubsTab();
    else { bodyEl.innerHTML = renderDetailsTab(); bindTabs(bodyEl); }
    icons();
    $('#vpQ')?.addEventListener('input', C.debounce(e => { pq = e.target.value.trim(); keepFocus('vpQ', drawBody); }, 200));
    $('#vpSt')?.addEventListener('change', e => { pSt = e.target.value; drawBody(); });
  };

  view.innerHTML = `<div class="hk-view">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <a class="hk-btn ghost sm" href="#/${h.status === 'pending' ? 'approvals' : h.status === 'approved' ? 'approved' : 'all'}"><i data-lucide="arrow-left"></i>Back</a>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${h.status === 'pending' ? `<button class="hk-btn sm primary" data-dec="approved" data-id="${h.id}">Approve</button><button class="hk-btn sm" data-dec="changes_requested" data-id="${h.id}">Request changes</button><button class="hk-btn sm danger" data-dec="rejected" data-id="${h.id}">Reject</button>` : ''}
        ${h.status === 'approved' ? `<button class="hk-btn sm" data-feat="${h.id}">${h.featured ? 'Unfeature' : 'Feature'}</button><button class="hk-btn sm danger" data-close="${h.id}">Close</button>` : ''}
        ${h.status === 'closed' ? `<button class="hk-btn sm" data-reopen="${h.id}">Reopen</button>` : ''}
        <button type="button" class="hk-btn sm" id="enterHostEdit"><i data-lucide="pencil"></i>Host Edit</button>
        <button type="button" class="hk-btn sm gold" id="enterHostView"><i data-lucide="shield-check"></i>Host View</button>
      </div>
    </div>

    ${detailHeader(hh)}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      ${statusBadge(h.status)}
      <span class="hk-chip ${hh._phase.tone}">${esc(hh._phase.label)}</span>
      <span class="hk-chip neutral"><i data-lucide="calendar-plus"></i>Created ${fmtFullDT(h.createdAtMs)}</span>
      ${approvedTs ? `<span class="hk-chip"><i data-lucide="badge-check"></i>Approved ${fmtFullDT(approvedTs)}</span>` : ''}
    </div>
    ${cd ? `<div style="margin-top:12px">${cd}</div>` : ''}

    <div class="hk-card-s" style="margin-top:16px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <img class="hk-avatar" style="width:48px;height:48px" src="${esc(C.safeUrl(host?.photoURL) || 'icon.png')}" alt="" onerror="this.src='icon.png'">
        <div style="min-width:0">
          <b>${esc(host?.org || h.brandName || host?.displayName || h.hostName || 'Organiser')} ${host?.hostVerified || h.hostVerified ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Verified</span>' : ''}</b>
          <div class="hk-sm hk-muted">${esc(host?.organiserName || host?.displayName || h.hostName || '')} · ${esc(host?.email || h.contactEmail || '')}${host?.orgPhone || h.contactPhone ? ' · ' + esc(host?.orgPhone || h.contactPhone) : ''}</div>
          <div class="hk-xs hk-muted">${esc(host?.college || h.college || '')}${host?.city || h.city ? ' · ' + esc(host?.city || h.city) : ''} · ${S.all.filter(x => x.hostUid === h.hostUid).length} hackathon(s)</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="hk-btn sm primary" data-view-host="${esc(h.hostUid)}"><i data-lucide="user-round"></i>Host profile</button>
      </div>
    </div>

    ${h.status === 'pending' ? `<div class="hk-card-s" style="margin-top:12px"><b>Submission checklist</b><div class="hk-checklist" style="margin-top:10px">${issues.length ? issues.map(e => `<div class="no"><i data-lucide="circle-alert"></i><span>${esc(e.msg)}</span></div>`).join('') : '<div class="ok"><i data-lucide="circle-check"></i>All required details are present.</div>'}</div></div>` : ''}

    <div class="hk-kpis" style="margin-top:16px">
      <div class="hk-kpi s"><div class="ki"><i data-lucide="users"></i></div><strong>${regs.length}</strong><span>Registrations${h.maxParticipants ? ` / ${h.maxParticipants}` : ''}</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="clipboard-check"></i></div><strong>${testDone.length}</strong><span>Tests completed</span></div>
      <div class="hk-kpi c"><div class="ki"><i data-lucide="lightbulb"></i></div><strong>${subs.length}</strong><span>Submissions</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="sparkles"></i></div><strong>${shortlistedN}</strong><span>Shortlisted</span></div>
      <div class="hk-kpi g"><div class="ki"><i data-lucide="trophy"></i></div><strong>${selectedN}</strong><span>Final selected</span></div>
    </div>

    ${rounds.length ? `<div class="hk-card-s" style="margin-top:16px">
      <b style="display:block;margin-bottom:10px">Selection rounds (${rounds.length})</b>
      <ol class="hk-rounds">${rounds.map((r, i) => {
        const cnt = regs.filter(x => (x.stage || 0) === i).length;
        const now = Date.now();
        const stCls = r.endMs && now > r.endMs ? 'done' : (r.startMs && now >= r.startMs ? 'cur' : '');
        return `<li class="${stCls}"><span class="n">${i + 1}</span><b>${esc(r.name)}</b><small>${cnt} team${cnt === 1 ? '' : 's'}${r.startMs ? ' · ' + C.fmtDate(r.startMs) : ''}</small></li>`;
      }).join('')}</ol>
    </div>` : ''}

    <div class="hk-tabs" id="vTabs" role="tablist">
      <button class="on" data-vtab="process" role="tab">Registrations &amp; Process (${regs.length})</button>
      <button data-vtab="tests" role="tab">Tests (${testDone.length})</button>
      <button data-vtab="subs" role="tab">Submissions (${subs.length})</button>
      <button data-vtab="details" role="tab">Hackathon Info</button>
    </div>
    <div id="vBody"></div>
  </div>`;

  $('#vTabs').onclick = e => {
    const b = e.target.closest('[data-vtab]'); if(!b) return;
    activeTab = b.dataset.vtab;
    $$('#vTabs button').forEach(x => x.classList.toggle('on', x === b));
    drawBody();
  };
  $('#enterHostView').onclick = () => {
    if(!can('view_delete')) return toast('Permission required: Inspection & Delete to enter Host View', 'error');
    confirmHostModeModal(h, 'manage');
  };
  $('#enterHostEdit').onclick = () => {
    if(!can('edit_hackathon')) return toast('Permission required: Edit Hackathons', 'error');
    confirmHostModeModal(h, 'edit');
  };
  drawBody();
  const stopTimer = startCountdowns(view);
  S.cleanup = () => { try { stopTimer?.(); } catch {} };
}

/* =====================================================================
   Profile Details Modals, Edit Modals & Ban/Unban (Hosts + Participants)
   ===================================================================== */
function viewHostModal(uid){
  const p = S.hosts.find(x => x.uid === uid || x.id === uid) || {};
  const hacks = S.all.filter(h => h.hostUid === uid || (Array.isArray(h.coHostUids) && h.coHostUids.includes(uid)));
  const banned = !!(p.hostBlocked || p.banned);
  const kv = (k, v) => v ? `<div class="hk-kv-item"><small>${k}</small><b>${esc(v)}</b></div>` : '';
  const lnk = (u, ic, l) => C.safeUrl(u) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="${ic}"></i>${l}</a>` : '';

  modal(`Host Profile · ${p.org || p.displayName || 'Organiser'}`, `<div class="hk-stack">
    <div class="hk-prof-head">
      <img class="hk-avatar" style="width:68px;height:68px" src="${esc(C.safeUrl(p.photoURL) || 'icon.png')}" alt="" onerror="this.src='icon.png'">
      <div class="grow">
        <h3 style="font-size:1.22rem;margin-bottom:2px">${esc(p.displayName || p.organiserName || 'Organiser')}</h3>
        <div class="hk-sm hk-muted">${esc(p.email || p.orgEmail || '')}${p.orgPhone || p.phone ? ' · ' + esc(p.orgPhone || p.phone) : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${banned ? '<span class="hk-chip bad"><i data-lucide="ban"></i>Banned / Paused</span>' : p.hostVerified ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Verified host</span>' : '<span class="hk-chip neutral">Unverified</span>'}
          <span class="hk-chip neutral">${hacks.length} hackathon${hacks.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="hk-btn sm" id="mEditHost"><i data-lucide="pencil"></i>Edit</button>
        <button type="button" class="hk-btn sm" id="mVerHost">${p.hostVerified ? 'Unverify' : 'Verify'}</button>
        <button type="button" class="hk-btn sm ${banned ? 'primary' : 'danger'}" id="mBanHost"><i data-lucide="${banned ? 'check-circle-2' : 'ban'}"></i>${banned ? 'Unban' : 'Ban host'}</button>
      </div>
    </div>
    ${p.banReason && banned ? `<div class="hk-msg err"><i data-lucide="ban"></i><span><b>Ban reason:</b> ${esc(p.banReason)}</span></div>` : ''}
    <div class="hk-kv-grid">
      ${kv('Organiser name', p.organiserName || p.displayName)}
      ${kv('Designation', p.designation)}
      ${kv('Organisation / Club', p.org)}
      ${kv('Organisation type', p.orgType)}
      ${kv('Account email', p.email)}
      ${kv('Contact email', p.orgEmail)}
      ${kv('Contact phone', p.orgPhone || p.phone)}
      ${kv('College / Institute', p.college)}
      ${kv('City', p.city)}
      ${kv('Joined on', fmtFullDT(p.createdAtMs))}
    </div>
    ${p.about ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:4px">About organisation</small><p class="hk-sm hk-prose" style="margin:0">${esc(p.about)}</p></div>` : ''}
    <div class="hk-prof-links">${lnk(p.website, 'globe', 'Website')}${lnk(p.social, 'share-2', 'Social / LinkedIn')}${lnk(p.proofUrl, 'file-check', 'Affiliation proof')}</div>

    <div class="hk-card-s" style="padding:14px">
      <b style="display:block;margin-bottom:8px">Hackathons by this host (${hacks.length})</b>
      ${hacks.length ? `<div class="hk-stack" style="gap:8px">${hacks.map(h => `<div class="hk-cohost-item">
        <div style="min-width:0"><b style="display:block;font-size:.88rem">${esc(h.title || 'Untitled')}</b><span class="hk-xs hk-muted">Created ${C.fmtDate(h.createdAtMs)} · ${h.regCount || 0} reg · ${h.hostUid === uid ? 'Owner' : 'Co-host'}</span></div>
        <div style="display:flex;gap:6px;align-items:center">${statusBadge(h.status)}<a class="hk-btn sm" href="#/view/${esc(h.id)}" data-close-go>Open</a></div>
      </div>`).join('')}</div>` : '<span class="hk-sm hk-muted">No hackathons created yet.</span>'}
    </div>
  </div>`, {
    wide: true,
    onMount(b, close){
      $('#mEditHost', b).onclick = () => { close(); editHostModal({ ...p, uid }); };
      $('#mVerHost', b).onclick = () => { close(); hostFlag(uid, { hostVerified: !p.hostVerified }, 'host.verify', p.hostVerified ? 'Host unverified' : 'Host verified'); };
      $('#mBanHost', b).onclick = () => { close(); toggleBan(uid, 'host', !banned, p.displayName || p.org || 'Host'); };
      $$('[data-close-go]', b).forEach(a => a.onclick = close);
    }
  });
}

function editHostModal(p){
  if(!isAdmin()) return toast('Only platform admins can edit profiles.', 'error');
  const fld = (label, name, val, type = 'text') => `<div class="hk-field"><label>${label}</label><input class="hk-input" name="${name}" type="${type}" value="${esc(val || '')}"></div>`;
  modal(`Edit Host · ${p.org || p.displayName || 'Organiser'}`, `<form class="hk-form" id="ehForm">
    <div class="hk-grid2">${fld('Display Name', 'displayName', p.displayName)}${fld('Organiser Name', 'organiserName', p.organiserName)}</div>
    <div class="hk-grid2">${fld('Designation', 'designation', p.designation)}${fld('Organisation / Club', 'org', p.org)}</div>
    <div class="hk-grid2">${fld('Contact Email', 'orgEmail', p.orgEmail || p.email, 'email')}${fld('Contact Phone', 'orgPhone', p.orgPhone || p.phone)}</div>
    <div class="hk-grid2">${fld('College / Institute', 'college', p.college)}${fld('City', 'city', p.city)}</div>
    <div class="hk-grid2">${fld('Website URL', 'website', p.website, 'url')}${fld('Social / LinkedIn URL', 'social', p.social, 'url')}</div>
    ${fld('Affiliation Proof URL', 'proofUrl', p.proofUrl, 'url')}
    <div class="hk-field"><label>About Organisation</label><textarea class="hk-textarea" name="about" rows="3">${esc(p.about || '')}</textarea></div>
    <button class="hk-btn primary lg block" type="submit">Save host profile</button>
  </form>`, {
    wide: true,
    onMount(b, close){
      $('#ehForm', b).onsubmit = async ev => {
        ev.preventDefault();
        const fd = Object.fromEntries(new FormData(ev.target).entries());
        const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
        try {
          const patchData = {
            uid: p.uid,
            displayName: fd.displayName.trim(),
            organiserName: fd.organiserName.trim(),
            designation: fd.designation.trim(),
            org: fd.org.trim(),
            orgEmail: fd.orgEmail.trim(),
            orgPhone: fd.orgPhone.trim(),
            college: fd.college.trim(),
            city: fd.city.trim(),
            website: fd.website.trim(),
            social: fd.social.trim(),
            proofUrl: fd.proofUrl.trim(),
            about: fd.about.trim(),
            updatedAt: FS.serverTimestamp()
          };
          await FS.setDoc(FS.doc(C.db, 'hkProfiles', p.uid), patchData, { merge: true });
          C.audit(S.user.uid, 'host.edit', p.uid, { title: patchData.org || patchData.displayName });
          toast('Host profile updated');
          close();
          await reload();
        } catch(e){ toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Save host profile'; }
      };
    }
  });
}

function viewParticipantModal(uid, preferredHackId = ''){
  const allParts = buildParticipantsList();
  const base = allParts.find(x => x.uid === uid) || S.hosts.find(x => x.uid === uid) || {};
  const regs = S.regs.filter(r => r.uid === uid).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  const r0 = (preferredHackId && regs.find(r => r.hackathonId === preferredHackId)) || regs[0] || {};
  const p = {
    uid,
    displayName: base.displayName || r0.name || 'Participant',
    email: base.email || r0.email || '',
    phone: base.phone || r0.phone || '',
    college: base.college || r0.college || '',
    city: base.city || r0.city || '',
    gender: base.gender || r0.gender || '',
    course: base.course || r0.course || '',
    branch: base.branch || r0.branch || '',
    year: base.year || r0.year || '',
    skills: base.skills || r0.skills || '',
    level: base.level || r0.level || '',
    github: base.github || r0.github || '',
    linkedin: base.linkedin || r0.linkedin || '',
    portfolio: base.portfolio || r0.portfolio || '',
    bio: base.bio || r0.bio || '',
    photoURL: base.photoURL || r0.photoURL || '',
    participantBlocked: !!base.participantBlocked,
    banned: !!(base.participantBlocked || base.banned),
    banReason: base.banReason || '',
    createdAtMs: base.createdAtMs || r0.createdAtMs || 0
  };
  const banned = p.banned;
  const kv = (k, v) => v ? `<div class="hk-kv-item"><small>${k}</small><b>${esc(v)}</b></div>` : '';
  const extLink = (u, ic, label) => C.safeUrl(u)
    ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="${ic}"></i>${label}</a>`
    : `<span class="hk-chip neutral"><i data-lucide="${ic}"></i>${label}: Not added</span>`;

  modal(`Participant Profile · ${p.displayName}`, `<div class="hk-stack">
    <div class="hk-prof-head">
      <img class="hk-avatar" style="width:68px;height:68px" src="${esc(C.safeUrl(p.photoURL) || 'icon.png')}" alt="" onerror="this.src='icon.png'">
      <div class="grow">
        <h3 style="font-size:1.22rem;margin-bottom:2px">${esc(p.displayName)}</h3>
        <div class="hk-sm hk-muted">${esc(p.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          ${banned ? '<span class="hk-chip bad"><i data-lucide="ban"></i>Banned</span>' : '<span class="hk-chip"><i data-lucide="circle-check"></i>Active</span>'}
          <span class="hk-chip neutral">${regs.length} application${regs.length === 1 ? '' : 's'}</span>
          <span class="hk-chip gold">${regs.filter(r => r.status === 'selected').length} selected</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="hk-btn sm" id="mEditPart"><i data-lucide="pencil"></i>Edit</button>
        <button type="button" class="hk-btn sm ${banned ? 'primary' : 'danger'}" id="mBanPart"><i data-lucide="${banned ? 'check-circle-2' : 'ban'}"></i>${banned ? 'Unban' : 'Ban user'}</button>
      </div>
    </div>
    ${p.banReason && banned ? `<div class="hk-msg err"><i data-lucide="ban"></i><span><b>Ban reason:</b> ${esc(p.banReason)}</span></div>` : ''}
    <div class="hk-kv-grid">
      ${kv('College / Institute', p.college)}
      ${kv('City', p.city)}
      ${kv('Course / Degree', p.course)}
      ${kv('Branch / Stream', p.branch)}
      ${kv('Year / Status', p.year)}
      ${kv('Experience level', p.level)}
      ${kv('Gender', p.gender)}
      ${kv('Joined on', fmtFullDT(p.createdAtMs))}
    </div>
    ${p.skills ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:4px">Skills</small><div class="hk-sm">${esc(p.skills)}</div></div>` : ''}
    ${p.bio ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:4px">Bio</small><p class="hk-sm hk-prose" style="margin:0">${esc(p.bio)}</p></div>` : ''}
    <div>
      <small class="hk-eyebrow" style="display:block;margin-bottom:8px">Developer &amp; Social links</small>
      <div class="hk-prof-links">${extLink(p.github, 'github', 'GitHub')}${extLink(p.linkedin, 'linkedin', 'LinkedIn')}${extLink(p.portfolio, 'globe', 'Portfolio')}</div>
    </div>

    <div class="hk-card-s" style="padding:14px">
      <b style="display:block;margin-bottom:8px">Hackathon applications (${regs.length})</b>
      ${regs.length ? `<div class="hk-stack" style="gap:8px">${regs.map(r => {
        const h = S.all.find(x => x.id === r.hackathonId);
        const sub = S.subs.find(x => x.hackathonId === r.hackathonId && x.uid === uid);
        const att = S.atts.find(x => x.hackathonId === r.hackathonId && x.uid === uid);
        const rounds = h ? C.roundsOf(h) : [];
        const rName = rounds[r.stage || 0]?.name || 'Registered';
        const stCls = r.status === 'selected' ? 'gold' : r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : '';
        return `<div class="hk-cohost-item" style="align-items:flex-start">
          <div style="min-width:0">
            <b style="display:block;font-size:.9rem">${esc(h?.title || r.hackathonTitle || 'Hackathon')}</b>
            <div class="hk-xs hk-muted">${r.teamMode === 'solo' ? 'Solo' : 'Team: ' + esc(r.teamName || 'Team')} · Round: ${esc(rName)} · Applied ${C.fmtDate(r.createdAtMs)}</div>
            ${att?.submittedAtMs ? `<div class="hk-xs">Test score: <b>${att.score}/${att.total}</b></div>` : ''}
            ${sub ? `<div class="hk-xs">Project: <b>${esc(sub.title)}</b>${sub.score != null ? ` (Score ${sub.score})` : ''}</div>` : ''}
            ${(r.members || []).length ? `<div class="hk-xs hk-muted">Members: ${r.members.map(m => `${esc(m.name)}${m.college ? ' (' + esc(m.college) + ')' : ''}`).join(', ')}</div>` : ''}
            ${(r.customAnswers || []).length ? `<div class="hk-xs hk-muted">${r.customAnswers.map(c => `<b>${esc(c.label)}:</b> ${esc(c.value)}`).join(' · ')}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex:none">
            <span class="hk-chip ${stCls}">${esc(r.status)}</span>
            ${h ? `<a class="hk-btn sm" href="#/view/${esc(h.id)}" data-close-go>Open</a>` : ''}
          </div>
        </div>`;
      }).join('')}</div>` : '<span class="hk-sm hk-muted">Has not applied to any hackathons yet.</span>'}
    </div>
  </div>`, {
    wide: true,
    onMount(b, close){
      $('#mEditPart', b).onclick = () => { close(); editParticipantModal(p); };
      $('#mBanPart', b).onclick = () => { close(); toggleBan(uid, 'participant', !banned, p.displayName); };
      $$('[data-close-go]', b).forEach(a => a.onclick = close);
    }
  });
}

function editParticipantModal(p){
  if(!isAdmin()) return toast('Only platform admins can edit profiles.', 'error');
  const fld = (label, name, val, type = 'text') => `<div class="hk-field"><label>${label}</label><input class="hk-input" name="${name}" type="${type}" value="${esc(val || '')}"></div>`;
  modal(`Edit Participant · ${p.displayName}`, `<form class="hk-form" id="epForm">
    <div class="hk-grid2">${fld('Full Name', 'displayName', p.displayName)}${fld('Phone', 'phone', p.phone)}</div>
    <div class="hk-grid2">${fld('College / Institute', 'college', p.college)}${fld('City', 'city', p.city)}</div>
    <div class="hk-grid3">${fld('Course', 'course', p.course)}${fld('Branch', 'branch', p.branch)}${fld('Year', 'year', p.year)}</div>
    <div class="hk-grid2">${fld('Experience Level', 'level', p.level)}${fld('Gender', 'gender', p.gender)}</div>
    ${fld('Skills (comma separated)', 'skills', p.skills)}
    <div class="hk-grid3">${fld('GitHub URL', 'github', p.github, 'url')}${fld('LinkedIn URL', 'linkedin', p.linkedin, 'url')}${fld('Portfolio URL', 'portfolio', p.portfolio, 'url')}</div>
    <div class="hk-field"><label>Bio</label><textarea class="hk-textarea" name="bio" rows="3">${esc(p.bio || '')}</textarea></div>
    <button class="hk-btn primary lg block" type="submit">Save participant profile</button>
  </form>`, {
    wide: true,
    onMount(b, close){
      $('#epForm', b).onsubmit = async ev => {
        ev.preventDefault();
        const fd = Object.fromEntries(new FormData(ev.target).entries());
        const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
        try {
          const patchData = {
            uid: p.uid,
            displayName: fd.displayName.trim(),
            phone: fd.phone.trim(),
            college: fd.college.trim(),
            city: fd.city.trim(),
            course: fd.course.trim(),
            branch: fd.branch.trim(),
            year: fd.year.trim(),
            level: fd.level.trim(),
            gender: fd.gender.trim(),
            skills: fd.skills.trim(),
            github: fd.github.trim(),
            linkedin: fd.linkedin.trim(),
            portfolio: fd.portfolio.trim(),
            bio: fd.bio.trim(),
            hostVerified: p.hostVerified ?? false,
            hostBlocked: p.hostBlocked ?? false,
            updatedAt: FS.serverTimestamp()
          };
          await FS.setDoc(FS.doc(C.db, 'hkProfiles', p.uid), patchData, { merge: true });
          C.audit(S.user.uid, 'participant.edit', p.uid, { title: patchData.displayName });
          toast('Participant profile updated');
          close();
          await reload();
        } catch(e){ toast(e.message, 'error'); btn.disabled = false; btn.textContent = 'Save participant profile'; }
      };
    }
  });
}

async function hostFlag(uid, data, action, msg){
  if(!isAdmin()) return toast('Only platform admins can change host status.', 'error');
  try {
    await FS.setDoc(FS.doc(C.db, 'hkProfiles', uid), { uid, ...data, updatedAt: FS.serverTimestamp() }, { merge: true });
    const meta = action === 'host.verify'
      ? { type: 'verified', title: data.hostVerified ? 'Host profile verified' : 'Host verification updated', body: data.hostVerified ? 'Your organiser profile now carries the verified host badge.' : 'Your verified host badge was removed.' }
      : { type: data.hostBlocked ? 'rejected' : 'approved', title: data.hostBlocked ? 'Hosting paused' : 'Hosting access restored', body: data.hostBlocked ? 'Your hosting access has been paused by an admin.' : 'Your hosting access has been restored.' };
    C.notify({ toUid: uid, fromUid: S.user.uid, ...meta }).catch(() => {});
    C.audit(S.user.uid, action, uid); toast(msg); await reload();
  } catch(e){ toast(e.message, 'error'); }
}

function toggleBan(uid, roleKind, ban, label){
  if(!isAdmin()) return toast('Only platform admins can ban or unban accounts.', 'error');
  const isHost = roleKind === 'host';
  modal(`${ban ? 'Ban' : 'Unban'} ${isHost ? 'Host' : 'Participant'} · ${label}`, `<form class="hk-form" id="banForm">
    <p class="hk-sm hk-muted">${ban
      ? (isHost ? 'Banning stops this host from creating new hackathons or publishing drafts, while keeping their existing dashboard visible.' : 'Banning prevents this participant from participating in new hackathons or being added to teams.')
      : 'Restoring removes the ban and lets this account participate normally.'}</p>
    ${ban ? '<div class="hk-field"><label>Reason <small>optional, shown to user</small></label><input class="hk-input" name="reason" maxlength="200" placeholder="e.g. Policy violation / spam"></div>' : ''}
    <button type="submit" class="hk-btn ${ban ? 'danger' : 'primary'} lg block">${ban ? 'Confirm Ban' : 'Confirm Unban'}</button>
  </form>`, {
    onMount(b, close){
      $('#banForm', b).onsubmit = async ev => {
        ev.preventDefault();
        const reason = (new FormData(ev.target).get('reason') || '').trim();
        const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Updating…';
        try {
          const patchData = isHost
            ? { uid, hostBlocked: ban, banned: ban, banReason: ban ? reason : '', updatedAt: FS.serverTimestamp() }
            : { uid, participantBlocked: ban, banned: ban, banReason: ban ? reason : '', updatedAt: FS.serverTimestamp() };
          await FS.setDoc(FS.doc(C.db, 'hkProfiles', uid), patchData, { merge: true });
          if(!isHost){
            const prof = S.hosts.find(x => x.uid === uid) || {};
            const reg = S.regs.find(x => x.uid === uid) || {};
            const em = String(prof.email || reg.email || '').trim().toLowerCase();
            if(em){
              const banRef = FS.doc(C.db, 'hkBannedEmails', em);
              if(ban) await FS.setDoc(banRef, { banned: true, reason, uid, updatedAtMs: Date.now() }).catch(() => {});
              else await FS.deleteDoc(banRef).catch(() => {});
            }
          }
          C.notify({
            toUid: uid, fromUid: S.user.uid, type: ban ? 'rejected' : 'approved',
            title: ban ? `${isHost ? 'Hosting' : 'Participant'} access paused` : `${isHost ? 'Hosting' : 'Participant'} access restored`,
            body: ban ? (reason ? `Account paused: ${reason}` : 'Your access has been paused by an admin.') : 'Your account access has been restored by an admin.'
          }).catch(() => {});
          C.audit(S.user.uid, `${roleKind}.${ban ? 'ban' : 'unban'}`, uid, { title: label, note: reason });
          close();
          toast(ban ? `${label} banned` : `${label} unbanned`, ban ? 'info' : 'success');
          await reload();
        } catch(e){ toast(e.message, 'error'); btn.disabled = false; btn.textContent = ban ? 'Confirm Ban' : 'Confirm Unban'; }
      };
    }
  });
}

/* =====================================================================
   Hosts Section (/hosts)
   ===================================================================== */
function hostsView(){
  const raw = S.hosts.filter(h => (h.roles || []).includes('host') || h.hostOnboarded || S.all.some(x => x.hostUid === h.uid))
    .map(h => ({
      ...h,
      n: S.all.filter(x => x.hostUid === h.uid).length,
      ap: S.all.filter(x => x.hostUid === h.uid && x.status === 'approved').length,
      _banned: !!(h.hostBlocked || h.banned)
    })).sort((a, b) => b.n - a.n);

  const q = S.hq.toLowerCase();
  const hs = raw.filter(h => {
    if(S.hst === 'verified' && (!h.hostVerified || h._banned)) return false;
    if(S.hst === 'unverified' && (h.hostVerified || h._banned)) return false;
    if(S.hst === 'banned' && !h._banned) return false;
    if(q && ![h.displayName, h.organiserName, h.email, h.orgEmail, h.phone, h.orgPhone, h.org, h.college, h.city].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">People · Organisers</span><h1>Hosts</h1><p>${hs.length} of ${raw.length} hosts · tap any host to view full profile, edit, verify, or ban/unban.</p></div></div>
    <div class="hk-toolbar">
      <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="hq" value="${esc(S.hq)}" placeholder="Search host name, org, email, phone, college, city…"></div>
      <select class="hk-select" id="hst" style="width:auto;min-height:46px">
        <option value="">All statuses</option>
        <option value="verified" ${S.hst === 'verified' ? 'selected' : ''}>Verified</option>
        <option value="unverified" ${S.hst === 'unverified' ? 'selected' : ''}>Unverified</option>
        <option value="banned" ${S.hst === 'banned' ? 'selected' : ''}>Banned</option>
      </select>
    </div>
    ${hs.length ? `<div class="hk-tablewrap"><table class="hk-table">
      <thead><tr><th>Host</th><th>Organisation</th><th>College</th><th>Hackathons</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${hs.map(h => `<tr>
        <td><button type="button" class="hk-rowlink" data-view-host="${esc(h.uid)}"><b>${esc(h.displayName || h.organiserName || '—')}</b></button><div class="hk-xs hk-muted">${esc(h.email || h.orgEmail || '')}${h.orgPhone || h.phone ? ' · ' + esc(h.orgPhone || h.phone) : ''}</div></td>
        <td>${esc(h.org || '—')}</td>
        <td>${esc(h.college || '—')}</td>
        <td>${h.ap}/${h.n} approved</td>
        <td>${h._banned ? '<span class="hk-chip bad">Banned</span>' : h.hostVerified ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Verified</span>' : '<span class="hk-chip neutral">Unverified</span>'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button type="button" class="hk-btn sm" data-view-host="${esc(h.uid)}"><i data-lucide="eye"></i>View</button>
          <button type="button" class="hk-btn sm" data-edit-host="${esc(h.uid)}"><i data-lucide="pencil"></i>Edit</button>
          <button type="button" class="hk-btn sm" data-verify="${esc(h.uid)}">${h.hostVerified ? 'Unverify' : 'Verify'}</button>
          <button type="button" class="hk-btn sm ${h._banned ? 'primary' : 'danger'}" data-ban-host="${esc(h.uid)}">${h._banned ? 'Unban' : 'Ban'}</button>
        </td>
      </tr>`).join('')}</tbody></table></div>` : empty('building-2', 'No matching hosts', 'Try clearing your search or status filter.')}
  </div>`;

  $('#hq').oninput = C.debounce(e => { S.hq = e.target.value.trim(); keepFocus('hq', hostsView); }, 220);
  $('#hst').onchange = e => { S.hst = e.target.value; hostsView(); icons(); };
}

/* =====================================================================
   Participants Section (/participants)
   ===================================================================== */
function participantsView(){
  const raw = buildParticipantsList();
  const q = S.pq.toLowerCase();
  const list = raw.filter(p => {
    if(S.pst === 'active' && p._banned) return false;
    if(S.pst === 'banned' && !p._banned) return false;
    if(q && ![p.displayName, p.email, p.phone, p.college, p.city, p.course, p.branch, p.skills].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow">People · Students</span><h1>Participants</h1><p>${list.length} of ${raw.length} participants · tap to inspect full profile &amp; applications, edit details, or ban/unban.</p></div></div>
    <div class="hk-toolbar">
      <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="pq" value="${esc(S.pq)}" placeholder="Search name, email, phone, college, skills, city…"></div>
      <select class="hk-select" id="pst" style="width:auto;min-height:46px">
        <option value="">All statuses</option>
        <option value="active" ${S.pst === 'active' ? 'selected' : ''}>Active</option>
        <option value="banned" ${S.pst === 'banned' ? 'selected' : ''}>Banned</option>
      </select>
    </div>
    ${list.length ? `<div class="hk-tablewrap"><table class="hk-table">
      <thead><tr><th>Participant</th><th>College</th><th>Course / Year</th><th>Applications</th><th>Status</th><th style="text-align:right">Actions</th></tr></thead>
      <tbody>${list.slice(0, 350).map(p => `<tr>
        <td><button type="button" class="hk-rowlink" data-view-part="${esc(p.uid)}"><b>${esc(p.displayName || 'Participant')}</b></button><div class="hk-xs hk-muted">${esc(p.email || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</div></td>
        <td>${esc(p.college || '—')}<div class="hk-xs hk-muted">${esc(p.city || '')}</div></td>
        <td class="hk-xs">${esc([p.course, p.branch, p.year].filter(Boolean).join(' · ') || '—')}</td>
        <td><b>${p._applied}</b> applied${p._selected ? ` · <span style="color:var(--hk-gold);font-weight:700">${p._selected} selected</span>` : ''}</td>
        <td>${p._banned ? '<span class="hk-chip bad">Banned</span>' : '<span class="hk-chip">Active</span>'}</td>
        <td style="text-align:right;white-space:nowrap">
          <button type="button" class="hk-btn sm" data-view-part="${esc(p.uid)}"><i data-lucide="eye"></i>View</button>
          <button type="button" class="hk-btn sm" data-edit-part="${esc(p.uid)}"><i data-lucide="pencil"></i>Edit</button>
          <button type="button" class="hk-btn sm ${p._banned ? 'primary' : 'danger'}" data-ban-part="${esc(p.uid)}">${p._banned ? 'Unban' : 'Ban'}</button>
        </td>
      </tr>`).join('')}</tbody></table></div>` : empty('user-check', 'No matching participants', 'Try clearing your search or status filter.')}
  </div>`;

  $('#pq').oninput = C.debounce(e => { S.pq = e.target.value.trim(); keepFocus('pq', participantsView); }, 220);
  $('#pst').onchange = e => { S.pst = e.target.value; participantsView(); icons(); };
}

/* =====================================================================
   Registrations & Audit Log
   ===================================================================== */
function regsView(){
  const q = S.q.toLowerCase(), titleOf = id => S.all.find(h => h.id === id)?.title || 'Deleted hackathon';
  const l = S.regs.filter(r => (!S.hid || r.hackathonId === S.hid) && (!q || [r.name, r.email, r.phone, r.college, r.teamName].join(' ').toLowerCase().includes(q))).sort((a, b) => b.createdAtMs - a.createdAtMs);
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Data</span><h1>Registrations</h1><p>${l.length} record${l.length === 1 ? '' : 's'}</p></div><button class="hk-btn" data-csvall><i data-lucide="download"></i>Export CSV</button></div>
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="rq" value="${esc(S.q)}" placeholder="Search participant, college, team…"></div><select class="hk-select" id="rh" style="width:auto;min-height:46px;max-width:100%"><option value="">All hackathons</option>${S.all.map(h => `<option value="${h.id}" ${h.id === S.hid ? 'selected' : ''}>${esc(h.title)}</option>`).join('')}</select></div>
    ${l.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>Participant</th><th>Hackathon</th><th>College</th><th>Team</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>${l.slice(0, 300).map(r => `<tr><td><button type="button" class="hk-rowlink" data-view-part="${esc(r.uid)}" data-hid="${esc(r.hackathonId)}"><b>${esc(r.name)}</b></button><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td><td><a href="#/view/${esc(r.hackathonId)}">${esc(titleOf(r.hackathonId))}</a></td><td>${esc(r.college)}</td><td>${r.teamMode === 'solo' ? 'Solo' : esc(r.teamName || '—')}</td><td><span class="hk-chip ${r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : r.status === 'selected' ? 'gold' : ''}">${esc(r.status)}</span></td><td>${C.fmtDT(r.createdAtMs)}</td><td style="text-align:right"><button type="button" class="hk-btn sm" data-view-part="${esc(r.uid)}" data-hid="${esc(r.hackathonId)}"><i data-lucide="user-round"></i>Profile</button></td></tr>`).join('')}</tbody></table></div>${l.length > 300 ? '<p class="hk-sm hk-muted" style="margin-top:10px">Showing the latest 300. Export CSV for everything.</p>' : ''}` : empty('users', 'No registrations', 'Nothing matches this filter.')}</div>`;
  $('#rq').oninput = C.debounce(e => { S.q = e.target.value.trim(); keepFocus('rq', regsView); }, 250);
  $('#rh').onchange = e => { S.hid = e.target.value; regsView(); icons(); };
}

function logsView(){
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Accountability</span><h1>Audit log</h1><p>Every approval decision and admin action.</p></div></div>
    ${S.logs.length ? `<div class="hk-stack">${S.logs.map(g => `<div class="hk-lrow"><div class="info"><b>${esc(g.action)}</b><span class="hk-sm hk-muted">${esc(g.title || g.target)}${g.note ? ' · “' + esc(g.note) + '”' : ''}</span></div><span class="hk-xs hk-muted">${C.fmtDT(g.createdAtMs)}</span></div>`).join('')}</div>` : empty('scroll-text', 'No actions yet', 'Admin actions will be recorded here.')}</div>`;
}

/* =====================================================================
   Sub-Admins Delegation Section (/subadmins) — Platform Admin Only
   ===================================================================== */
async function subAdminsView(){
  if(!isAdmin()){
    toast('Only Platform Admins can manage sub-admin delegations.', 'error');
    nav('#/overview');
    return;
  }

  const list = S.subAdmins || [];

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h">
      <div>
        <span class="hk-eyebrow">Access Control · Delegation</span>
        <h1>Sub-Admins</h1>
        <p>Grant delegated sub-admin access to platform users with granular permissions for hackathon approvals, deep process view &amp; deletion, editing, user bans, and profile edits.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="hk-btn" data-act="refresh"><i data-lucide="refresh-cw"></i>Refresh</button>
      </div>
    </div>

    <!-- Grant Sub-Admin Access Card -->
    <div class="hk-card-s hk-subadmin-grant" style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="ki" style="width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--hk-p) 14%,var(--hk-surface));color:var(--hk-p)"><i data-lucide="user-plus"></i></div>
        <div>
          <b style="font-size:1.05rem">Delegate New Sub-Admin</b>
          <div class="hk-xs hk-muted">Search any registered user by Gmail or display name, configure checkboxes, and tap grant.</div>
        </div>
      </div>

      <!-- Step 1: User Search & Selection -->
      <div class="hk-field" style="margin-bottom:16px">
        <label>Platform User <small>(Search by Gmail or Name)</small></label>
        <div id="saSelectedBox">
          ${S.saUser ? `
            <div class="hk-user-pick">
              <img class="hk-avatar" src="${C.safeUrl(S.saUser.photoURL) || 'icon.png'}" alt="" width="38" height="38">
              <div class="grow" style="min-width:0">
                <b>${esc(S.saUser.displayName || 'User')}</b>
                <div class="hk-xs hk-muted">${esc(S.saUser.email || '')}${S.saUser.college ? ' · ' + esc(S.saUser.college) : ''}</div>
              </div>
              <button type="button" class="hk-btn sm ghost" id="saChangeUserBtn"><i data-lucide="x"></i>Change</button>
            </div>
          ` : `
            <div class="hk-user-search-wrap">
              <div class="hk-search" style="margin-bottom:4px">
                <i data-lucide="search"></i>
                <input class="hk-input" id="saSearchInput" value="${esc(S.saQ)}" placeholder="Type user's Gmail address or name to search…">
              </div>
              <div class="hk-user-dropdown ${S.saResults.length ? 'show' : ''}" id="saResultsBox">
                ${S.saResults.map(u => `
                  <div class="hk-user-opt" data-pick-user="${esc(u.uid)}">
                    <img class="hk-avatar" src="${C.safeUrl(u.photoURL) || 'icon.png'}" alt="" width="32" height="32">
                    <div class="grow" style="min-width:0">
                      <b>${esc(u.displayName || 'User')}</b>
                      <div class="hk-xs hk-muted">${esc(u.email || '')}${u.college ? ' · ' + esc(u.college) : ''}</div>
                    </div>
                    <button type="button" class="hk-btn sm primary" data-pick-user="${esc(u.uid)}">Select</button>
                  </div>
                `).join('')}
              </div>
            </div>
          `}
        </div>
      </div>

      <!-- Step 2: Granular Permission Checkboxes -->
      <div style="margin-top:16px;border-top:1px solid var(--hk-line);padding-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <b style="font-size:.92rem">Select Permissions to Delegate</b>
            <div class="hk-xs hk-muted">Select individual boxes or toggle Full Access. Unchecked actions will be strictly forbidden.</div>
          </div>
          <label class="hk-check" style="font-weight:700;font-size:.82rem;color:var(--hk-p)">
            <input type="checkbox" id="saPermAll" ${Object.values(S.saPerms).every(Boolean) ? 'checked' : ''}>
            <span>Select All (Full Sub-Admin)</span>
          </label>
        </div>

        <div class="hk-perm-grid">
          ${C.SUBADMIN_PERMS.map(p => `
            <label class="hk-perm-card ${S.saPerms[p.key] ? 'on' : ''}">
              <input type="checkbox" data-sa-perm="${p.key}" ${S.saPerms[p.key] ? 'checked' : ''}>
              <div class="chk"><i data-lucide="${S.saPerms[p.key] ? 'circle-check' : 'circle'}"></i></div>
              <div class="meta">
                <b><i data-lucide="${p.icon}"></i> ${esc(p.label)}</b>
                <small>${esc(p.desc)}</small>
              </div>
            </label>
          `).join('')}
        </div>
      </div>

      <!-- Step 3: Action Button -->
      <div style="display:flex;justify-content:flex-end;margin-top:18px;border-top:1px solid var(--hk-line);padding-top:14px">
        <button type="button" class="hk-btn primary lg" id="saGrantBtn" ${!S.saUser || !Object.values(S.saPerms).some(Boolean) ? 'disabled' : ''}>
          <i data-lucide="shield-plus"></i>Grant Sub-Admin Access
        </button>
      </div>
    </div>

    <!-- Active Sub-Admins Directory -->
    <div class="hk-sec">
      <h2><i data-lucide="users"></i>Active Sub-Admins (${list.length})</h2>
      <span class="hk-sm hk-muted">Tap any card to view their activity history log</span>
    </div>

    ${list.length ? `
      <div class="hk-subadmins-grid">
        ${list.map(sa => {
          const perms = sa.permissions || {};
          const isFull = Object.keys(perms).length >= 5 && Object.values(perms).every(Boolean);
          return `
            <div class="hk-sacard" data-sa-card="${esc(sa.uid)}">
              <div class="hk-sacard-top">
                <img class="hk-avatar" src="${C.safeUrl(sa.photoURL) || 'icon.png'}" alt="" width="44" height="44">
                <div class="grow" style="min-width:0">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <b>${esc(sa.displayName || 'Sub-admin')}</b>
                    <span class="hk-chip sm">Sub-admin</span>
                  </div>
                  <div class="hk-xs hk-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sa.email || '')}</div>
                  ${sa.college ? `<div class="hk-xs hk-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i data-lucide="school"></i>${esc(sa.college)}</div>` : ''}
                </div>
              </div>

              <div class="hk-sacard-perms">
                ${isFull ? `
                  <span class="hk-chip gold"><i data-lucide="award"></i>Full Access (All 5)</span>
                ` : `
                  ${perms.approve ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Approve</span>' : ''}
                  ${perms.view_delete ? '<span class="hk-chip warn"><i data-lucide="trash-2"></i>Inspect &amp; Delete</span>' : ''}
                  ${perms.edit_hackathon ? '<span class="hk-chip"><i data-lucide="pencil"></i>Edit Hackathon</span>' : ''}
                  ${perms.ban_unban ? '<span class="hk-chip bad"><i data-lucide="shield-alert"></i>Ban / Unban</span>' : ''}
                  ${perms.edit_profile ? '<span class="hk-chip neutral"><i data-lucide="user"></i>Edit Profiles</span>' : ''}
                  ${!Object.values(perms).some(Boolean) ? '<span class="hk-chip neutral">No permissions</span>' : ''}
                `}
              </div>

              <div class="hk-sacard-meta">
                <span>Granted ${fmtFullDT(sa.grantedAtMs || sa.updatedAtMs)}</span>
                ${sa.grantedByName ? `<span class="hk-muted">by ${esc(sa.grantedByName)}</span>` : ''}
              </div>

              <div class="hk-sacard-acts" onclick="event.stopPropagation()">
                <button type="button" class="hk-btn sm ghost" data-view-sa-activity="${esc(sa.uid)}" title="View activity log"><i data-lucide="history"></i>Activity</button>
                <button type="button" class="hk-btn sm" data-edit-sa="${esc(sa.uid)}" title="Edit permissions"><i data-lucide="pencil"></i>Edit</button>
                <button type="button" class="hk-btn sm danger" data-revoke-sa="${esc(sa.uid)}" title="Revoke access"><i data-lucide="trash-2"></i>Revoke</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : empty('shield-alert', 'No sub-admins yet', 'Use the panel above to grant granular sub-admin access to any user.')}
  </div>`;

  // Bind events for user search & selection
  const searchInput = $('#saSearchInput');
  if(searchInput){
    searchInput.oninput = C.debounce(async e => {
      S.saQ = e.target.value.trim();
      if(!S.saQ){
        S.saResults = [];
        const box = $('#saResultsBox');
        if(box){ box.classList.remove('show'); box.innerHTML = ''; }
        return;
      }
      try {
        S.saResults = await C.searchPlatformUsers(S.saQ, S.hosts);
        const box = $('#saResultsBox');
        if(box){
          if(S.saResults.length){
            box.classList.add('show');
            box.innerHTML = S.saResults.map(u => `
              <div class="hk-user-opt" data-pick-user="${esc(u.uid)}">
                <img class="hk-avatar" src="${C.safeUrl(u.photoURL) || 'icon.png'}" alt="" width="32" height="32">
                <div class="grow" style="min-width:0">
                  <b>${esc(u.displayName || 'User')}</b>
                  <div class="hk-xs hk-muted">${esc(u.email || '')}${u.college ? ' · ' + esc(u.college) : ''}</div>
                </div>
                <button type="button" class="hk-btn sm primary" data-pick-user="${esc(u.uid)}">Select</button>
              </div>
            `).join('');
            icons();
          } else {
            box.classList.add('show');
            box.innerHTML = `<div class="hk-sm hk-muted" style="padding:12px">No users found matching “${esc(S.saQ)}”.</div>`;
          }
        }
      } catch(err){ console.warn('search error', err); }
    }, 240);
  }

  $('#saChangeUserBtn')?.addEventListener('click', () => {
    S.saUser = null;
    S.saQ = '';
    S.saResults = [];
    subAdminsView();
    icons();
  });

  // Pick user from results
  $('#saResultsBox')?.addEventListener('click', e => {
    const opt = e.target.closest('[data-pick-user]');
    if(!opt) return;
    const uid = opt.dataset.pickUser;
    const u = S.saResults.find(x => x.uid === uid);
    if(u){
      S.saUser = u;
      S.saResults = [];
      S.saQ = '';
      subAdminsView();
      icons();
    }
  });

  // Permission toggles
  $('#saPermAll')?.addEventListener('change', e => {
    const val = !!e.target.checked;
    Object.keys(S.saPerms).forEach(k => { S.saPerms[k] = val; });
    subAdminsView();
    icons();
  });

  $$('[data-sa-perm]').forEach(chk => {
    chk.addEventListener('change', e => {
      const k = e.target.dataset.saPerm;
      S.saPerms[k] = !!e.target.checked;
      const allChecked = Object.values(S.saPerms).every(Boolean);
      const allChk = $('#saPermAll');
      if(allChk) allChk.checked = allChecked;
      const card = e.target.closest('.hk-perm-card');
      if(card){
        card.classList.toggle('on', !!e.target.checked);
        const iconEl = card.querySelector('.chk i');
        if(iconEl) iconEl.setAttribute('data-lucide', e.target.checked ? 'circle-check' : 'circle');
        icons();
      }
      const grantBtn = $('#saGrantBtn');
      if(grantBtn) grantBtn.disabled = !S.saUser || !Object.values(S.saPerms).some(Boolean);
    });
  });

  // Grant button
  $('#saGrantBtn')?.addEventListener('click', async () => {
    if(!S.saUser) return toast('Please select a platform user first.', 'error');
    if(!Object.values(S.saPerms).some(Boolean)) return toast('Please select at least one permission.', 'error');

    const btn = $('#saGrantBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="hk-spin"></span> Granting…';
    try {
      const payload = {
        uid: S.saUser.uid,
        displayName: S.saUser.displayName || 'Sub-admin',
        email: S.saUser.email || '',
        photoURL: S.saUser.photoURL || '',
        college: S.saUser.college || '',
        permissions: { ...S.saPerms },
        grantedByUid: S.user.uid,
        grantedByName: S.site?.displayName || S.user.displayName || 'Platform Admin',
        grantedByEmail: S.user.email || '',
        grantedAtMs: Date.now()
      };
      await C.saveSubAdmin(S.saUser.uid, payload);
      C.audit(S.user.uid, 'subadmin.grant', S.saUser.email || S.saUser.uid, {
        targetUid: S.saUser.uid,
        targetName: S.saUser.displayName,
        permissions: S.saPerms,
        note: `Granted sub-admin permissions: ${Object.keys(S.saPerms).filter(k => S.saPerms[k]).join(', ')}`
      });
      toast(`Sub-admin access granted to ${S.saUser.displayName || S.saUser.email}`, 'success');
      S.saUser = null;
      S.saQ = '';
      S.saResults = [];
      Object.keys(S.saPerms).forEach(k => { S.saPerms[k] = false; });
      await reload();
    } catch(err){
      toast(err.message, 'error');
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="shield-plus"></i>Grant Sub-Admin Access';
      icons();
    }
  });

  // Card click: opens activity modal
  $$('[data-sa-card]').forEach(c => {
    c.addEventListener('click', e => {
      if(e.target.closest('button') || e.target.closest('a')) return;
      viewSubAdminActivityModal(c.dataset.saCard);
    });
  });
}

function viewSubAdminActivityModal(uid){
  const sa = S.subAdmins.find(x => x.uid === uid) || { uid, displayName: 'Sub-admin', email: '' };
  const subLogs = S.logs.filter(l => l.by === uid || (l.byEmail && sa.email && l.byEmail.toLowerCase() === sa.email.toLowerCase()));

  const actionBadge = act => {
    switch(act){
      case 'hackathon.approved':
      case 'hackathon.approve':
      case 'hackathon.reopen':
      case 'host.unban':
      case 'participant.unban':
        return '<span class="hk-chip" style="background:color-mix(in srgb,var(--hk-p) 14%,var(--hk-surface));color:var(--hk-p)"><i data-lucide="circle-check"></i>Approved / Restored</span>';
      case 'hackathon.rejected':
      case 'hackathon.reject':
      case 'host.ban':
      case 'participant.ban':
      case 'hackathon.delete':
        return '<span class="hk-chip bad"><i data-lucide="circle-x"></i>Rejected / Banned / Deleted</span>';
      case 'hackathon.changes_requested':
      case 'hackathon.close':
        return '<span class="hk-chip warn"><i data-lucide="circle-alert"></i>Changes / Closed</span>';
      case 'host.edit':
      case 'participant.edit':
      case 'hackathon.admin_host_edit':
        return '<span class="hk-chip" style="background:color-mix(in srgb,var(--hk-sky) 14%,var(--hk-surface));color:var(--hk-sky)"><i data-lucide="pencil"></i>Edited</span>';
      case 'hackathon.admin_host_view':
        return '<span class="hk-chip neutral"><i data-lucide="eye"></i>Host Workspace View</span>';
      case 'subadmin.grant':
      case 'subadmin.update':
        return '<span class="hk-chip gold"><i data-lucide="shield-plus"></i>Sub-Admin Access</span>';
      case 'subadmin.revoke':
        return '<span class="hk-chip bad"><i data-lucide="trash-2"></i>Access Revoked</span>';
      default:
        return `<span class="hk-chip neutral">${esc(act)}</span>`;
    }
  };

  const perms = sa.permissions || {};
  const isFull = Object.keys(perms).length >= 5 && Object.values(perms).every(Boolean);

  const html = `
    <div class="hk-stack" style="gap:16px">
      <!-- Profile summary banner -->
      <div class="hk-org-strip">
        <img src="${C.safeUrl(sa.photoURL) || 'icon.png'}" alt="" width="44" height="44">
        <div class="grow" style="min-width:0">
          <small>Sub-Admin Activity Trail</small>
          <b>${esc(sa.displayName || 'Sub-admin')}</b>
          <span>${esc(sa.email || '')}${sa.college ? ' · ' + esc(sa.college) : ''}</span>
        </div>
        <div style="text-align:right">
          ${isFull ? '<span class="hk-chip gold sm"><i data-lucide="award"></i>Full Access</span>' : '<span class="hk-chip sm">Delegated</span>'}
        </div>
      </div>

      <!-- Enabled permissions overview -->
      <div class="hk-card-s" style="padding:10px 14px">
        <div class="hk-xs hk-muted" style="font-weight:700;text-transform:uppercase;margin-bottom:6px">Active Assigned Permissions:</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${perms.approve ? '<span class="hk-chip sm"><i data-lucide="badge-check"></i>Approve</span>' : ''}
          ${perms.view_delete ? '<span class="hk-chip warn sm"><i data-lucide="trash-2"></i>Inspect &amp; Delete</span>' : ''}
          ${perms.edit_hackathon ? '<span class="hk-chip sm"><i data-lucide="pencil"></i>Edit Hackathons</span>' : ''}
          ${perms.ban_unban ? '<span class="hk-chip bad sm"><i data-lucide="shield-alert"></i>Ban / Unban</span>' : ''}
          ${perms.edit_profile ? '<span class="hk-chip neutral sm"><i data-lucide="user"></i>Edit Profiles</span>' : ''}
        </div>
      </div>

      <!-- Activity Timeline -->
      <div>
        <div class="hk-xs hk-muted" style="font-weight:700;text-transform:uppercase;margin-bottom:10px">History Log (${subLogs.length} action${subLogs.length === 1 ? '' : 's'})</div>
        ${subLogs.length ? `
          <div class="hk-activity-timeline">
            ${subLogs.map(l => `
              <div class="hk-activity-item">
                <div class="hk-activity-head">
                  ${actionBadge(l.action)}
                  <span class="hk-xs hk-muted">${C.fmtDT(l.createdAtMs)} · ${C.ago(l.createdAtMs)}</span>
                </div>
                <div class="hk-activity-body">
                  <b>Target: ${esc(l.title || l.target || '—')}</b>
                  ${l.note ? `<div class="hk-xs hk-muted" style="margin-top:2px">“${esc(l.note)}”</div>` : ''}
                  ${l.byName ? `<div class="hk-xs hk-muted" style="margin-top:2px">Logged by: ${esc(l.byName)}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : empty('history', 'No activity recorded yet', 'This sub-admin has not performed any approvals, edits, bans, or workspace actions yet.')}
      </div>
    </div>
  `;

  modal(`Activity Log: ${sa.displayName || sa.email}`, html, { wide: true });
}

function editSubAdminModal(sa){
  const perms = { ...(sa.permissions || {}) };
  const html = `
    <form class="hk-form" id="editSaForm">
      <p class="hk-sm hk-muted">Update delegated permissions for <b>${esc(sa.displayName || sa.email)}</b>.</p>
      <div class="hk-perm-grid" style="margin:14px 0">
        ${C.SUBADMIN_PERMS.map(p => `
          <label class="hk-perm-card ${perms[p.key] ? 'on' : ''}">
            <input type="checkbox" name="perm_${p.key}" ${perms[p.key] ? 'checked' : ''}>
            <div class="chk"><i data-lucide="${perms[p.key] ? 'circle-check' : 'circle'}"></i></div>
            <div class="meta">
              <b><i data-lucide="${p.icon}"></i> ${esc(p.label)}</b>
              <small>${esc(p.desc)}</small>
            </div>
          </label>
        `).join('')}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
        <button type="button" class="hk-btn" data-cancel-edit-sa>Cancel</button>
        <button type="submit" class="hk-btn primary"><i data-lucide="save"></i>Save Permissions</button>
      </div>
    </form>
  `;

  modal(`Edit Permissions · ${sa.displayName || sa.email}`, html, {
    onMount(b, close){
      $('[data-cancel-edit-sa]', b).onclick = close;
      $$('input[type="checkbox"]', b).forEach(chk => {
        chk.onchange = e => {
          const card = e.target.closest('.hk-perm-card');
          card?.classList.toggle('on', e.target.checked);
          const ic = card?.querySelector('.chk i');
          if(ic) ic.setAttribute('data-lucide', e.target.checked ? 'circle-check' : 'circle');
          icons();
        };
      });
      $('#editSaForm', b).onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(ev.target);
        const updatedPerms = {};
        C.SUBADMIN_PERMS.forEach(p => {
          updatedPerms[p.key] = !!fd.get(`perm_${p.key}`);
        });
        const btn = $('button[type="submit"]', b);
        btn.disabled = true;
        btn.innerHTML = '<span class="hk-spin"></span> Saving…';
        try {
          await C.saveSubAdmin(sa.uid, { permissions: updatedPerms });
          C.audit(S.user.uid, 'subadmin.update', sa.email || sa.uid, {
            targetUid: sa.uid,
            permissions: updatedPerms,
            note: 'Updated sub-admin permissions'
          });
          toast('Permissions updated', 'success');
          close();
          await reload();
        } catch(err){
          toast(err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="save"></i>Save Permissions';
          icons();
        }
      };
    }
  });
}

async function revokeSubAdmin(uid){
  const sa = S.subAdmins.find(x => x.uid === uid);
  const name = sa?.displayName || sa?.email || 'this sub-admin';
  if(!confirm(`Revoke sub-admin access for ${name}? They will immediately lose access to the hackathons admin portal.`)) return;

  try {
    await C.deleteSubAdmin(uid);
    C.audit(S.user.uid, 'subadmin.revoke', sa?.email || uid, {
      targetUid: uid,
      note: `Revoked sub-admin access for ${name}`
    });
    toast(`Revoked sub-admin access for ${name}`, 'info');
    await reload();
  } catch(err){
    toast(err.message, 'error');
  }
}

/* =====================================================================
   Global delegated actions
   ===================================================================== */
document.addEventListener('click', async e => {
  const ov = e.target.closest('[data-open-view]'); if(ov){ nav(`#/view/${ov.dataset.openView}`); return; }
  const vh = e.target.closest('[data-view-host]'); if(vh){ viewHostModal(vh.dataset.viewHost); return; }
  const eh = e.target.closest('[data-edit-host]'); if(eh){ if(!can('edit_profile')) return toast('Permission required: Edit Profiles', 'error'); const p = S.hosts.find(x => x.uid === eh.dataset.editHost); if(p) editHostModal(p); return; }
  const bh = e.target.closest('[data-ban-host]'); if(bh){ if(!can('ban_unban')) return toast('Permission required: Ban & Unban Users', 'error'); const p = S.hosts.find(x => x.uid === bh.dataset.banHost); if(p) toggleBan(p.uid, 'host', !(p.hostBlocked || p.banned), p.displayName || p.org || 'Host'); return; }
  const vp = e.target.closest('[data-view-part]'); if(vp){ viewParticipantModal(vp.dataset.viewPart, vp.dataset.hid || ''); return; }
  const ep = e.target.closest('[data-edit-part]'); if(ep){ if(!can('edit_profile')) return toast('Permission required: Edit Profiles', 'error'); const p = buildParticipantsList().find(x => x.uid === ep.dataset.editPart); if(p) editParticipantModal(p); return; }
  const bp = e.target.closest('[data-ban-part]'); if(bp){ if(!can('ban_unban')) return toast('Permission required: Ban & Unban Users', 'error'); const p = buildParticipantsList().find(x => x.uid === bp.dataset.banPart); if(p) toggleBan(p.uid, 'participant', !p._banned, p.displayName || 'Participant'); return; }

  const saAct = e.target.closest('[data-view-sa-activity]'); if(saAct){ viewSubAdminActivityModal(saAct.dataset.viewSaActivity); return; }
  const saEd = e.target.closest('[data-edit-sa]'); if(saEd){ const sa = S.subAdmins.find(x => x.uid === saEd.dataset.editSa); if(sa) editSubAdminModal(sa); return; }
  const saRev = e.target.closest('[data-revoke-sa]'); if(saRev){ revokeSubAdmin(saRev.dataset.revokeSa); return; }

  const d = e.target.closest('[data-dec]'); if(d){ if(!can('approve')) return toast('Permission required: Approve & Decisions', 'error'); return decide(d.dataset.id, d.dataset.dec); }
  const f = e.target.closest('[data-feat]'); if(f){ if(!can('approve')) return toast('Permission required: Approve & Decisions', 'error'); const h = S.all.find(x => x.id === f.dataset.feat); return patch(h.id, { featured: !h.featured }, 'hackathon.feature', h.featured ? 'Unfeatured' : 'Featured'); }
  const c = e.target.closest('[data-close]'); if(c){ if(!can('approve')) return toast('Permission required: Approve & Decisions', 'error'); if(confirm('Close this hackathon? It will disappear from students.')) patch(c.dataset.close, { status: 'closed' }, 'hackathon.close', 'Closed'); return; }
  const ro = e.target.closest('[data-reopen]'); if(ro){ if(!can('approve')) return toast('Permission required: Approve & Decisions', 'error'); return patch(ro.dataset.reopen, { status: 'approved' }, 'hackathon.reopen', 'Reopened'); }
  const rm = e.target.closest('[data-rm]'); if(rm){
    if(!isAdmin() && !can('view_delete')) return toast('Permission required: Inspection & Delete to remove hackathons.', 'error');
    if(confirm('Delete permanently? Registrations remain but the hackathon is removed.')){
      try {
        await C.deleteHackathon(rm.dataset.rm);
        C.audit(S.user.uid, 'hackathon.delete', rm.dataset.rm);
        toast('Deleted', 'info');
        await reload();
      } catch(err){ toast(err.message, 'error'); }
    }
    return;
  }
  const v = e.target.closest('[data-verify]'); if(v){ if(!can('ban_unban') && !isAdmin()) return toast('Permission required: Ban & Unban / Verify', 'error'); const h = S.hosts.find(x => x.uid === v.dataset.verify); return hostFlag(h.uid, { hostVerified: !h.hostVerified }, 'host.verify', h.hostVerified ? 'Unverified' : 'Verified'); }
  const b = e.target.closest('[data-block]'); if(b){ if(!can('ban_unban') && !isAdmin()) return toast('Permission required: Ban & Unban', 'error'); const h = S.hosts.find(x => x.uid === b.dataset.block); return hostFlag(h.uid, { hostBlocked: !h.hostBlocked }, 'host.block', h.hostBlocked ? 'Host restored' : 'Host paused'); }
  if(e.target.closest('[data-csvall]')){
    const t = id => S.all.find(h => h.id === id)?.title || '';
    C.csv('hackathon-registrations.csv', [['Hackathon', 'Name', 'Email', 'Phone', 'College', 'Team', 'Status', 'Registered'], ...S.regs.map(r => [t(r.hackathonId), r.name, r.email, r.phone, r.college, r.teamMode === 'solo' ? 'Solo' : r.teamName, r.status, new Date(r.createdAtMs).toISOString()])]); return;
  }
  const a = e.target.closest('[data-act]'); if(!a) return;
  if(a.dataset.act === 'theme') toggleTheme();
  else if(a.dataset.act === 'logout'){ await signOut(C.auth); location.replace('hackthons.html'); }
  else if(a.dataset.act === 'refresh'){ a.disabled = true; await reload(); toast('Refreshed', 'info'); }
});

/* =====================================================================
   Boot
   ===================================================================== */
C.watchUser(async (user, { site, hk }) => {
  if(S.booted) return;
  if(!user){ location.replace('login-hackthons.html'); return; }
  let mySubAdmin = null;
  if(!C.isStaff(site)){
    try { mySubAdmin = await C.fetchSubAdmin(user.uid); } catch(e){ console.warn('subadmin check', e); }
    if(!mySubAdmin){
      view.innerHTML = `<div class="hk-view">${empty('shield-alert', 'Admins only', 'Your account does not have access to the hackathons admin portal.', '<a class="hk-btn primary" href="hackthons-portal.html">Go to portal</a>')}</div>`;
      $('#side').innerHTML = ''; icons(); return;
    }
  } else {
    try { mySubAdmin = await C.fetchSubAdmin(user.uid); } catch {}
  }
  S.booted = true;
  Object.assign(S, { user, site, hk, subAdmin: mySubAdmin });
  const img = $('#avatar');
  img.src = C.safeUrl(site?.photoURL || user.photoURL) || 'icon.png';
  img.onerror = () => { img.onerror = null; img.src = 'icon.png'; };
  $('#uName').textContent = site?.displayName || user.displayName || 'Admin';
  $('#uRole').textContent = isAdmin() ? 'Platform admin' : (isSubAdmin() ? 'Sub-admin' : (site?.role === 'moderator' ? 'Moderator' : 'Staff'));
  try { await load(); } catch(e){
    console.error(e);
    view.innerHTML = `<div class="hk-view">${empty('triangle-alert', /permission|insufficient/i.test(e.message) ? 'Rules not deployed' : 'Could not load', /permission|insufficient/i.test(e.message) ? 'Deploy the updated firestore.rules, then refresh.' : e.message)}</div>`;
    icons(); return;
  }
  route();
});
