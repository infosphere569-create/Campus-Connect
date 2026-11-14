// Hackathons admin portal: approvals, all hackathons, hosts, registrations, analytics, audit log.
import { initBg } from './hk-bg.js';
import * as C from './hk-core.js';
import { empty, statusBadge, mediaStyle, detailHeader, detailBody, factsCard, bindTabs } from './hk-ui.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const toggleTheme = C.initTheme();
initBg($('#hkBg'));

const S = { user: null, site: null, hk: null, all: [], hosts: [], regs: [], logs: [], rt: 0, booted: false, q: '', st: '', hid: '' };
const view = $('#view'), app = $('#app');
const stale = t => t !== S.rt;
const nav = h => { if(location.hash === h) route(); else location.hash = h; };
const curPath = () => (location.hash || '').replace(/^#/, '') || '/overview';
const isAdmin = () => C.isAdminUser(S.site);
const pendingN = () => S.all.filter(h => h.status === 'pending').length;

const NAV = [['/overview', 'layout-dashboard', 'Overview'], ['/approvals', 'badge-check', 'Approvals'], ['/all', 'layers', 'All hackathons'], ['/hosts', 'building-2', 'Hosts'], ['/regs', 'users', 'Registrations'], ['/logs', 'scroll-text', 'Audit log']];
function paintNav(){
  const p = pendingN(), cur = curPath();
  const on = x => cur === x || cur.startsWith(x + '/') || (x === '/all' && cur.startsWith('/view'));
  $('#side').innerHTML = `<div class="lbl">Hackathons admin</div>` + NAV.map(([x, ic, l]) => `<a class="hk-nav-i ${on(x) ? 'on' : ''}" href="#${x}"><i data-lucide="${ic}"></i><span class="t">${l}</span>${x === '/approvals' && p ? `<span class="badge">${p}</span>` : ''}</a>`).join('') +
    `<div class="sp"></div><a class="hk-nav-i" href="hackthons-portal.html"><i data-lucide="rocket"></i><span class="t">Hackathons portal</span></a><a class="hk-nav-i" href="admin.html"><i data-lucide="shield"></i><span class="t">Main admin</span></a><button class="hk-nav-i" data-act="theme"><i data-lucide="sun-moon"></i><span class="t">Theme</span></button><button class="hk-nav-i" data-act="logout"><i data-lucide="log-out"></i><span class="t">Log out</span></button>`;
  const b = (x, ic, l) => `<a href="#${x}" class="${on(x) ? 'on' : ''}"><i data-lucide="${ic}"></i><span>${l}</span>${x === '/approvals' && p ? `<span class="badge">${p}</span>` : ''}</a>`;
  $('#bottom').innerHTML = b('/overview', 'layout-dashboard', 'Home') + b('/approvals', 'badge-check', 'Approve') + b('/all', 'layers', 'All') + b('/hosts', 'building-2', 'Hosts') + b('/regs', 'users', 'Regs');
  const d = $('#bellDot'); d.textContent = p > 9 ? '9+' : p; d.classList.toggle('hk-hidden', !p); icons();
}
$('#menuBtn').onclick = () => { if(matchMedia('(max-width:900px)').matches){ const o = app.classList.toggle('open'); $('#menuBtn').setAttribute('aria-expanded', o); } else app.classList.toggle('collapsed'); };
$('#scrim').onclick = () => app.classList.remove('open');
$('#bellBtn').onclick = () => nav('#/approvals');

const mapDocs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
async function load(){
  const [all, hosts, regs, logs] = await Promise.all([
    C.fetchAll(),
    FS.getDocs(FS.query(FS.collection(C.db, 'hkProfiles'), FS.limit(1000))).then(mapDocs),
    C.allRegistrations(),
    FS.getDocs(FS.query(FS.collection(C.db, 'auditLogs'), FS.where('scope', '==', 'hackathons'), FS.limit(200))).then(mapDocs).catch(() => [])
  ]);
  S.all = all.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)); S.hosts = hosts; S.regs = regs; S.logs = logs.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

const ROUTES = [[/^\/overview$/, overview], [/^\/approvals$/, approvals], [/^\/all$/, allList], [/^\/view\/([\w-]+)$/, viewOne], [/^\/hosts$/, hosts], [/^\/regs$/, regs], [/^\/logs$/, logs]];
async function route(){
  const t = ++S.rt, path = curPath(); app.classList.remove('open'); paintNav();
  for(const [re, fn] of ROUTES){
    const m = path.match(re); if(!m) continue;
    try { fn(t, ...m.slice(1)); } catch(e){ console.error(e); view.innerHTML = `<div class="hk-view">${empty('triangle-alert', 'Could not load', e.message)}</div>`; }
    icons(); scrollTo({ top: 0 }); return;
  }
  nav('#/overview');
}
addEventListener('hashchange', route);
const reload = async () => { await load(); route(); };

/* ---------- Overview ---------- */
function overview(){
  const now = Date.now(), by = k => S.all.filter(h => h.status === k).length;
  const live = S.all.filter(h => h.status === 'approved' && !(h.endMs && now > h.endMs)).length;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(now - (6 - i) * 864e5); d.setHours(0, 0, 0, 0); return d.getTime(); });
  const perDay = days.map(d => S.regs.filter(r => r.createdAtMs >= d && r.createdAtMs < d + 864e5).length), mx = Math.max(1, ...perDay);
  const top = [...S.all].filter(h => h.status === 'approved').sort((a, b) => (b.regCount || 0) - (a.regCount || 0)).slice(0, 6), tmax = Math.max(1, top[0]?.regCount || 1);
  const cities = {}; S.all.filter(h => h.status === 'approved').forEach(h => { const c = h.city || 'Online'; cities[c] = (cities[c] || 0) + 1; });
  const cl = Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 6), cmax = Math.max(1, cl[0]?.[1] || 1);
  const dn = d => new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Admin</span><h1>Hackathons overview</h1><p>Approvals, activity and growth at a glance.</p></div><button class="hk-btn" data-act="refresh"><i data-lucide="refresh-cw"></i>Refresh</button></div>
    ${pendingN() ? `<div class="hk-banner"><i data-lucide="hourglass" style="width:28px;height:28px;color:var(--hk-gold)"></i><div class="grow"><b>${pendingN()} hackathon${pendingN() > 1 ? 's' : ''} waiting for approval</b><div class="hk-sm hk-muted">Hosts are waiting for a decision.</div></div><a class="hk-btn gold sm" href="#/approvals">Review now</a></div>` : ''}
    <div class="hk-kpis"><div class="hk-kpi c"><div class="ki"><i data-lucide="hourglass"></i></div><strong>${pendingN()}</strong><span>Pending approval</span></div><div class="hk-kpi"><div class="ki"><i data-lucide="radio"></i></div><strong>${live}</strong><span>Live / upcoming</span></div>
      <div class="hk-kpi g"><div class="ki"><i data-lucide="layers"></i></div><strong>${S.all.length}</strong><span>All hackathons</span></div><div class="hk-kpi s"><div class="ki"><i data-lucide="users"></i></div><strong>${S.regs.length}</strong><span>Registrations</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="building-2"></i></div><strong>${S.hosts.filter(h => (h.roles || []).includes('host')).length}</strong><span>Hosts</span></div><div class="hk-kpi c"><div class="ki"><i data-lucide="circle-x"></i></div><strong>${by('rejected') + by('changes_requested')}</strong><span>Rejected / changes</span></div></div>
    <div class="hk-grid2" style="margin-top:22px;align-items:start">
      <div class="hk-card-s"><b>Registrations · last 7 days</b><div class="hk-spark" style="margin-top:16px">${perDay.map((n, i) => `<div><span>${n}</span><i style="height:${Math.max(4, n / mx * 88)}px"></i><span>${dn(days[i])}</span></div>`).join('')}</div></div>
      <div class="hk-card-s"><b>Top hackathons</b><div class="hk-bars" style="margin-top:14px">${top.length ? top.map(h => `<div class="hk-bar"><span class="hk-clamp2" style="font-weight:600">${esc(h.title)}</span><i style="width:${(h.regCount || 0) / tmax * 100}%"></i><b>${h.regCount || 0}</b></div>`).join('') : '<span class="hk-muted hk-sm">No data yet.</span>'}</div></div>
      <div class="hk-card-s"><b>Hackathons by city</b><div class="hk-bars" style="margin-top:14px">${cl.length ? cl.map(([c, n]) => `<div class="hk-bar"><span style="font-weight:600">${esc(c)}</span><i style="width:${n / cmax * 100}%"></i><b>${n}</b></div>`).join('') : '<span class="hk-muted hk-sm">No data yet.</span>'}</div></div>
      <div class="hk-card-s"><b>Status breakdown</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">${['draft', 'pending', 'approved', 'changes_requested', 'rejected', 'closed'].map(k => `${statusBadge(k)}<b style="margin-right:10px">${by(k)}</b>`).join('')}</div></div></div></div>`;
}

/* ---------- Approvals ---------- */
function approvals(){
  const q = S.all.filter(h => h.status === 'pending').sort((a, b) => (a.submittedAtMs || 0) - (b.submittedAtMs || 0));
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Queue</span><h1>Approvals</h1><p>Oldest submissions first. Open a hackathon to review everything before deciding.</p></div></div>
    ${q.length ? `<div class="hk-stack">${q.map(h => `<div class="hk-lrow"><div class="th" style="${mediaStyle(h)}"></div><div class="info"><b>${esc(h.title)}</b><span class="hk-sm hk-muted">${esc(h.brandName || h.hostName || '')} · ${esc(h.college || '')} · ${esc(h.city || '')}</span><span class="hk-xs hk-muted" style="display:block">Submitted ${C.ago(h.submittedAtMs || h.updatedAtMs)} · starts ${C.fmtDate(h.startMs)}</span></div><div class="acts"><a class="hk-btn sm" href="#/view/${h.id}"><i data-lucide="eye"></i>Review</a><button class="hk-btn sm primary" data-dec="approved" data-id="${h.id}">Approve</button><button class="hk-btn sm" data-dec="changes_requested" data-id="${h.id}">Changes</button><button class="hk-btn sm danger" data-dec="rejected" data-id="${h.id}">Reject</button></div></div>`).join('')}</div>` : empty('party-popper', 'Queue is clear', 'No hackathons are waiting for approval.')}</div>`;
}

async function decide(id, decision){
  const h = S.all.find(x => x.id === id); if(!h) return;
  const needNote = decision !== 'approved', label = { approved: 'Approve', changes_requested: 'Request changes', rejected: 'Reject' }[decision];
  modal(`${label} · ${h.title}`, `<form class="hk-form" id="dec"><p class="hk-sm hk-muted">${decision === 'approved' ? 'This makes the hackathon visible to all students immediately.' : 'The host will see your note and be notified.'}</p>
    <div class="hk-field"><label>${needNote ? 'Note to host' : 'Note to host <small>optional</small>'}</label><textarea class="hk-textarea" name="note" maxlength="600" ${needNote ? 'required' : ''} placeholder="${decision === 'rejected' ? 'Why is this not approved?' : decision === 'changes_requested' ? 'What should the host fix?' : 'e.g. Looks great!'}"></textarea></div>
    ${decision === 'approved' ? '<label class="hk-check"><input type="checkbox" name="feat"><span>Feature this hackathon (boosts it in Trending)</span></label><label class="hk-check"><input type="checkbox" name="ver" checked><span>Mark host as verified</span></label>' : ''}
    <button class="hk-btn ${decision === 'rejected' ? 'danger' : 'primary'} lg block" type="submit">${label}</button></form>`, { onMount(b, close){
    $('#dec', b).onsubmit = async ev => {
      ev.preventDefault(); const fd = new FormData(ev.target), note = (fd.get('note') || '').trim();
      if(needNote && note.length < 5) return toast('Add a short note for the host.', 'error');
      const btn = $('button[type=submit]', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
      try {
        const patch = { status: decision, adminNote: note, reviewedBy: S.user.uid, reviewedAtMs: Date.now(), updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() };
        if(decision === 'approved'){ patch.featured = !!fd.get('feat'); if(fd.get('ver')) patch.hostVerified = true; }
        await FS.updateDoc(FS.doc(C.db, 'hkHackathons', id), patch);
        if(decision === 'approved' && fd.get('ver')) FS.updateDoc(FS.doc(C.db, 'hkProfiles', h.hostUid), { hostVerified: true }).catch(() => {});
        await C.notify({ toUid: h.hostUid, fromUid: S.user.uid, hackathonId: id, type: decision, title: decision === 'approved' ? 'Your hackathon is live!' : decision === 'rejected' ? 'Hackathon not approved' : 'Changes requested', body: `${h.title}${note ? ': ' + note : ' has been approved and is now visible to students.'}` }).catch(() => {});
        C.audit(S.user.uid, `hackathon.${decision}`, id, { title: h.title, note });
        close(); toast(`${label}d`.replace('Request changesd', 'Changes requested').replace('Rejectd', 'Rejected').replace('Approved', 'Approved')); await reload();
      } catch(e){ toast(e.message, 'error'); btn.disabled = false; btn.textContent = label; }
    };
  } });
}

/* ---------- All hackathons ---------- */
function allList(){
  const q = S.q.toLowerCase();
  const l = S.all.filter(h => (!S.st || h.status === S.st) && (!q || [h.title, h.brandName, h.hostName, h.college, h.city].join(' ').toLowerCase().includes(q)));
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Manage</span><h1>All hackathons</h1><p>${l.length} of ${S.all.length}</p></div></div>
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="aq" value="${esc(S.q)}" placeholder="Search title, brand, college, city…"></div>
    <select class="hk-select" id="ast" style="width:auto;min-height:46px">${[['', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['changes_requested', 'Changes requested'], ['rejected', 'Rejected'], ['draft', 'Draft'], ['closed', 'Closed']].map(([k, v]) => `<option value="${k}" ${k === S.st ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${l.length ? `<div class="hk-stack">${l.map(h => `<div class="hk-lrow"><div class="th" style="${mediaStyle(h)}"></div><div class="info"><b>${esc(h.title || 'Untitled')}${h.featured ? ' <span class="hk-chip gold">Featured</span>' : ''}</b><span class="hk-sm hk-muted">${esc(h.brandName || h.hostName || '')} · ${esc(h.city || '')} · ${C.dateRange(h.startMs, h.endMs)} · ${h.regCount || 0} reg</span></div>${statusBadge(h.status)}<div class="acts"><a class="hk-btn sm" href="#/view/${h.id}">Open</a>${h.status === 'approved' ? `<button class="hk-btn sm" data-feat="${h.id}">${h.featured ? 'Unfeature' : 'Feature'}</button><button class="hk-btn sm danger" data-close="${h.id}">Close</button>` : ''}${h.status === 'closed' ? `<button class="hk-btn sm" data-reopen="${h.id}">Reopen</button>` : ''}<button class="hk-btn sm danger" data-rm="${h.id}"><i data-lucide="trash-2"></i></button></div></div>`).join('')}</div>` : empty('search-x', 'Nothing matches', 'Try another search or status.')}</div>`;
  $('#aq').oninput = C.debounce(e => { S.q = e.target.value.trim(); allList(); icons(); const i = $('#aq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
  $('#ast').onchange = e => { S.st = e.target.value; allList(); icons(); };
}
async function patch(id, data, action, msg){
  try { await FS.updateDoc(FS.doc(C.db, 'hkHackathons', id), { ...data, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() }); C.audit(S.user.uid, action, id); toast(msg); await reload(); } catch(e){ toast(e.message, 'error'); }
}

/* ---------- Review one ---------- */
async function viewOne(t, id){
  const h = S.all.find(x => x.id === id); if(!h){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Not found', 'This hackathon no longer exists.', '<a class="hk-btn" href="#/all">Back</a>')}</div>`; return; }
  const hh = { ...h, _phase: C.phase(h) }, host = S.hosts.find(x => x.uid === h.hostUid);
  const issues = C.validateForSubmit({ ...h, agree: true }).filter(e => !/future/.test(e.msg));
  view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="#/${h.status === 'pending' ? 'approvals' : 'all'}" style="margin-bottom:10px"><i data-lucide="arrow-left"></i>Back</a>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${statusBadge(h.status)}${h.status === 'pending' ? `<button class="hk-btn sm primary" data-dec="approved" data-id="${id}">Approve</button><button class="hk-btn sm" data-dec="changes_requested" data-id="${id}">Request changes</button><button class="hk-btn sm danger" data-dec="rejected" data-id="${id}">Reject</button>` : ''}</div>
    <div class="hk-card-s" style="margin-bottom:16px"><b>Host</b><div class="hk-sm hk-muted" style="margin-top:6px">${esc(host?.displayName || h.hostName || '')} · ${esc(host?.email || h.contactEmail || '')} · ${esc(host?.phone || h.contactPhone || '')} ${host?.hostVerified ? '· <span class="hk-chip"><i data-lucide="badge-check"></i>verified</span>' : ''} · ${S.all.filter(x => x.hostUid === h.hostUid).length} hackathon(s)</div>
      <div class="hk-checklist" style="margin-top:12px">${issues.length ? issues.map(e => `<div class="no"><i data-lucide="circle-alert"></i><span>${esc(e.msg)}</span></div>`).join('') : '<div class="ok"><i data-lucide="circle-check"></i>All required details are present.</div>'}</div></div>
    ${detailHeader(hh)}<div class="hk-detail"><div>${detailBody(hh)}</div>${factsCard(hh)}</div></div>`;
  bindTabs(view);
}

/* ---------- Hosts ---------- */
function hosts(){
  const hs = S.hosts.filter(h => (h.roles || []).includes('host')).map(h => ({ ...h, n: S.all.filter(x => x.hostUid === h.uid).length, ap: S.all.filter(x => x.hostUid === h.uid && x.status === 'approved').length })).sort((a, b) => b.n - a.n);
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">People</span><h1>Hosts</h1><p>Verify trusted hosts or pause misuse.</p></div></div>
    ${hs.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>Host</th><th>Organisation</th><th>College</th><th>Hackathons</th><th>Status</th><th></th></tr></thead><tbody>${hs.map(h => `<tr><td><b>${esc(h.displayName || '—')}</b><div class="hk-xs hk-muted">${esc(h.email || '')}</div></td><td>${esc(h.org || '—')}</td><td>${esc(h.college || '—')}</td><td>${h.ap}/${h.n} approved</td><td>${h.hostBlocked ? '<span class="hk-chip bad">Paused</span>' : h.hostVerified ? '<span class="hk-chip"><i data-lucide="badge-check"></i>Verified</span>' : '<span class="hk-chip neutral">Unverified</span>'}</td><td style="white-space:nowrap"><button class="hk-btn sm" data-verify="${h.uid}">${h.hostVerified ? 'Unverify' : 'Verify'}</button> <button class="hk-btn sm ${h.hostBlocked ? 'primary' : 'danger'}" data-block="${h.uid}">${h.hostBlocked ? 'Restore' : 'Pause'}</button></td></tr>`).join('')}</tbody></table></div>` : empty('building-2', 'No hosts yet', 'Hosts appear here once someone logs in as a host.')}</div>`;
}
async function hostFlag(uid, data, action, msg){
  if(!isAdmin()) return toast('Only platform admins can change host status.', 'error');
  try { await FS.updateDoc(FS.doc(C.db, 'hkProfiles', uid), { ...data, updatedAt: FS.serverTimestamp() }); C.audit(S.user.uid, action, uid); toast(msg); await reload(); } catch(e){ toast(e.message, 'error'); }
}

/* ---------- Registrations ---------- */
function regs(){
  const q = S.q.toLowerCase(), titleOf = id => S.all.find(h => h.id === id)?.title || 'Deleted hackathon';
  const l = S.regs.filter(r => (!S.hid || r.hackathonId === S.hid) && (!q || [r.name, r.email, r.phone, r.college, r.teamName].join(' ').toLowerCase().includes(q))).sort((a, b) => b.createdAtMs - a.createdAtMs);
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Data</span><h1>Registrations</h1><p>${l.length} record${l.length === 1 ? '' : 's'}</p></div><button class="hk-btn" data-csvall><i data-lucide="download"></i>Export CSV</button></div>
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="rq" value="${esc(S.q)}" placeholder="Search participant, college, team…"></div><select class="hk-select" id="rh" style="width:auto;min-height:46px;max-width:100%"><option value="">All hackathons</option>${S.all.map(h => `<option value="${h.id}" ${h.id === S.hid ? 'selected' : ''}>${esc(h.title)}</option>`).join('')}</select></div>
    ${l.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>Participant</th><th>Hackathon</th><th>College</th><th>Team</th><th>Status</th><th>When</th></tr></thead><tbody>${l.slice(0, 300).map(r => `<tr><td><b>${esc(r.name)}</b><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td><td>${esc(titleOf(r.hackathonId))}</td><td>${esc(r.college)}</td><td>${r.teamMode === 'solo' ? 'Solo' : esc(r.teamName || '—')}</td><td><span class="hk-chip ${r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : ''}">${esc(r.status)}</span></td><td>${C.fmtDT(r.createdAtMs)}</td></tr>`).join('')}</tbody></table></div>${l.length > 300 ? '<p class="hk-sm hk-muted" style="margin-top:10px">Showing the latest 300. Export CSV for everything.</p>' : ''}` : empty('users', 'No registrations', 'Nothing matches this filter.')}</div>`;
  $('#rq').oninput = C.debounce(e => { S.q = e.target.value.trim(); regs(); icons(); const i = $('#rq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250);
  $('#rh').onchange = e => { S.hid = e.target.value; regs(); icons(); };
}

/* ---------- Audit log ---------- */
function logs(){
  view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow">Accountability</span><h1>Audit log</h1><p>Every approval decision and admin action.</p></div></div>
    ${S.logs.length ? `<div class="hk-stack">${S.logs.map(g => `<div class="hk-lrow"><div class="info"><b>${esc(g.action)}</b><span class="hk-sm hk-muted">${esc(g.title || g.target)}${g.note ? ' · “' + esc(g.note) + '”' : ''}</span></div><span class="hk-xs hk-muted">${C.fmtDT(g.createdAtMs)}</span></div>`).join('')}</div>` : empty('scroll-text', 'No actions yet', 'Admin actions will be recorded here.')}</div>`;
}

/* ---------- global actions ---------- */
document.addEventListener('click', async e => {
  const d = e.target.closest('[data-dec]'); if(d) return decide(d.dataset.id, d.dataset.dec);
  const f = e.target.closest('[data-feat]'); if(f){ const h = S.all.find(x => x.id === f.dataset.feat); return patch(h.id, { featured: !h.featured }, 'hackathon.feature', h.featured ? 'Unfeatured' : 'Featured'); }
  const c = e.target.closest('[data-close]'); if(c){ if(confirm('Close this hackathon? It will disappear from students.')) patch(c.dataset.close, { status: 'closed' }, 'hackathon.close', 'Closed'); return; }
  const ro = e.target.closest('[data-reopen]'); if(ro) return patch(ro.dataset.reopen, { status: 'approved' }, 'hackathon.reopen', 'Reopened');
  const rm = e.target.closest('[data-rm]'); if(rm){ if(!isAdmin()) return toast('Only platform admins can delete.', 'error'); if(confirm('Delete permanently? Registrations remain but the hackathon is removed.')){ try { await C.deleteHackathon(rm.dataset.rm); C.audit(S.user.uid, 'hackathon.delete', rm.dataset.rm); toast('Deleted', 'info'); await reload(); } catch(err){ toast(err.message, 'error'); } } return; }
  const v = e.target.closest('[data-verify]'); if(v){ const h = S.hosts.find(x => x.uid === v.dataset.verify); return hostFlag(h.uid, { hostVerified: !h.hostVerified }, 'host.verify', h.hostVerified ? 'Unverified' : 'Verified'); }
  const b = e.target.closest('[data-block]'); if(b){ const h = S.hosts.find(x => x.uid === b.dataset.block); return hostFlag(h.uid, { hostBlocked: !h.hostBlocked }, 'host.block', h.hostBlocked ? 'Host restored' : 'Host paused'); }
  if(e.target.closest('[data-csvall]')){
    const t = id => S.all.find(h => h.id === id)?.title || '';
    C.csv('hackathon-registrations.csv', [['Hackathon', 'Name', 'Email', 'Phone', 'College', 'Team', 'Status', 'Registered'], ...S.regs.map(r => [t(r.hackathonId), r.name, r.email, r.phone, r.college, r.teamMode === 'solo' ? 'Solo' : r.teamName, r.status, new Date(r.createdAtMs).toISOString()])]); return;
  }
  const a = e.target.closest('[data-act]'); if(!a) return;
  if(a.dataset.act === 'theme') toggleTheme();
  else if(a.dataset.act === 'logout'){ await signOut(C.auth); location.replace('hackthons.html'); }
  else if(a.dataset.act === 'refresh'){ a.disabled = true; await reload(); toast('Refreshed', 'info'); }
});

/* ---------- boot ---------- */
C.watchUser(async (user, { site }) => {
  if(S.booted) return;
  if(!user){ location.replace('login-hackthons.html'); return; }
  if(!C.isStaff(site)){ view.innerHTML = `<div class="hk-view">${empty('shield-alert', 'Admins only', 'Your account does not have access to the hackathons admin portal.', '<a class="hk-btn primary" href="hackthons-portal.html">Go to portal</a>')}</div>`; $('#side').innerHTML = ''; icons(); return; }
  S.booted = true; Object.assign(S, { user, site });
  const img = $('#avatar'); img.src = C.safeUrl(site.photoURL || user.photoURL) || 'icon.png'; img.onerror = () => { img.onerror = null; img.src = 'icon.png'; };
  $('#uName').textContent = site.displayName || user.displayName || 'Admin'; $('#uRole').textContent = site.role === 'platformAdmin' ? 'Platform admin' : 'Moderator';
  try { await load(); } catch(e){ console.error(e); view.innerHTML = `<div class="hk-view">${empty('triangle-alert', /permission|insufficient/i.test(e.message) ? 'Rules not deployed' : 'Could not load', /permission|insufficient/i.test(e.message) ? 'Deploy the updated firestore.rules, then refresh.' : e.message)}</div>`; icons(); return; }
  route();
});
