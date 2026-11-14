// Organiser workspace for one hackathon: registrations (with Notify Team mail), rounds, submissions, test, exports.
import * as C from './hk-core.js';
import { empty, statusBadge } from './hk-ui.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const STS = C.REG_STATUS;
const MAIL_FOR_STATUS = { shortlisted: 'shortlisted', selected: 'selected', waitlisted: 'waitlisted', rejected: 'rejected', registered: 'registration_confirmation' };

export async function manage(cx, id){
  const { S, view } = cx;
  const h = await C.fetchOne(id); if(cx.stale()) return;
  if(!h || (h.hostUid !== S.user.uid && !C.isStaff(S.site))){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Hackathon not found', 'You can only manage hackathons you host.', '<a class="hk-btn" href="#/host">Back to dashboard</a>')}</div>`; return; }
  const hostUid = h.hostUid, rounds = C.roundsOf(h);
  let [regs, subs, atts, meta] = await Promise.all([C.hackathonRegistrations(id, hostUid), C.hackathonSubmissions(id, hostUid).catch(() => []), C.hackathonAttempts(id, hostUid).catch(() => []), C.getTestMeta(id)]); if(cx.stale()) return;
  const org = { name: S.hk.organiserName || S.hk.displayName || 'The organiser', org: S.hk.org || h.hostName || '' };
  const subOf = uid => subs.find(x => x.uid === uid), attOf = uid => atts.find(x => x.uid === uid);
  const sel = new Set(); let tab = 'regs', q = '', fs = '', fr = '';
  const ph = C.phase(h), roundName = i => rounds[i]?.name || (rounds.length ? 'Completed' : '—');
  const slug = h.title.replace(/[^\w]+/g, '-').toLowerCase();

  const filtered = () => regs.filter(r => (!fs || r.status === fs) && (fr === '' || (r.stage || 0) === +fr) && (!q || [r.name, r.email, r.phone, r.college, r.teamName, ...(r.members || []).map(m => m.name)].join(' ').toLowerCase().includes(q)));
  const mailBtn = r => r.lastMailAtMs
    ? `<button class="hk-mailbtn sent" data-mail="${esc(r.id)}" title="Last: ${esc(C.MAIL_KINDS[r.lastMailKind] || 'email')} · ${C.ago(r.lastMailAtMs)}" aria-label="Notify team"><i data-lucide="mail-check"></i></button>`
    : `<button class="hk-mailbtn" data-mail="${esc(r.id)}" title="Notify team leader" aria-label="Notify team"><i data-lucide="mail"></i></button>`;
  const row = r => { const s = subOf(r.uid), a = attOf(r.uid); return `<tr class="${sel.has(r.id) ? 'sel' : ''}">
    <td><input type="checkbox" data-sel="${esc(r.id)}" ${sel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}"></td>
    <td><b>${esc(r.name)}</b><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td>
    <td>${r.teamMode === 'solo' ? '<span class="hk-chip neutral">Solo</span>' : `<b>${esc(r.teamName || 'Team')}</b><div class="hk-xs hk-muted">${(r.members || []).length + 1} members</div>`}</td>
    <td>${esc(r.college)}<div class="hk-xs hk-muted">${esc(r.year || '')}</div></td>
    <td><select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Round">${(rounds.length ? rounds : [{ name: 'Registered' }]).map((x, i) => `<option value="${i}" ${(r.stage || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
    <td><select class="hk-select sm" data-st="${esc(r.id)}" aria-label="Status">${STS.map(x => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="hk-xs">${s ? `<span class="hk-chip">${s.score != null ? 'Score ' + esc(s.score) : 'Submitted'}</span>` : '<span class="hk-muted">—</span>'}${a?.submittedAtMs ? `<div class="hk-muted" style="margin-top:4px">Test ${a.score}/${a.total}</div>` : ''}</td>
    <td style="text-align:right">${mailBtn(r)}</td></tr>`; };

  const regsTab = () => { const l = filtered(); return `
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="rq" value="${esc(q)}" placeholder="Search name, email, college, team…"></div>
      <select class="hk-select" id="fs" style="width:auto;min-height:46px"><option value="">All statuses</option>${STS.map(x => `<option ${x === fs ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select" id="fr" style="width:auto;min-height:46px"><option value="">All rounds</option>${rounds.map((x, i) => `<option value="${i}" ${fr !== '' && +fr === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="hk-bulk ${sel.size ? 'on' : ''}"><b>${sel.size} selected</b>
      <select class="hk-select sm" id="bSt"><option value="">Set status…</option>${STS.map(x => `<option>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select sm" id="bRd"><option value="">Move to round…</option>${rounds.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
      <button class="hk-btn sm" data-bulkmail><i data-lucide="mail"></i>Notify selected</button></div>
    ${l.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Select all"></th><th>Team leader</th><th>Team</th><th>College</th><th>Round</th><th>Status</th><th>Work</th><th style="text-align:right">Mail</th></tr></thead><tbody id="rb">${l.map(row).join('')}</tbody></table></div>` : empty('users', regs.length ? 'No matches' : 'No registrations yet', regs.length ? 'Try clearing the filters.' : 'Registrations appear here as soon as teams sign up. Share your hackathon link to get started.', regs.length ? '' : '<button class="hk-btn gold" data-share>Copy link</button>')}`; };

  const link = (u, l) => u ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${l}</a>` : '';
  const subsTab = () => subs.length ? `<div class="hk-stack">${subs.map(s => `<div class="hk-card-s" data-sub="${esc(s.id)}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(s.title)}</b><div class="hk-sm hk-muted">${esc(s.teamName || s.leaderName)} · ${C.ago(s.updatedAtMs)}</div></div>${s.reviewStatus === 'reviewed' ? '<span class="hk-chip">Reviewed</span>' : '<span class="hk-chip warn">To review</span>'}</div>
      <p class="hk-sm" style="margin:10px 0;white-space:pre-wrap">${esc(s.idea)}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${link(s.pptUrl, 'PPT')}${link(s.repoUrl, 'Repo')}${link(s.demoUrl, 'Demo')}${link(s.videoUrl, 'Video')}${link(s.extraUrl, 'Other')}</div>
      <div class="hk-grid2" style="margin-top:12px;grid-template-columns:110px 1fr"><input class="hk-input" type="number" min="0" max="100" placeholder="Score" data-score value="${s.score ?? ''}"><input class="hk-input" placeholder="Feedback for the team" data-fb maxlength="500" value="${esc(s.feedback || '')}"></div>
      <button class="hk-btn sm primary" style="margin-top:10px" data-review="${esc(s.id)}">Save review</button></div>`).join('')}</div>` : empty('lightbulb', 'No submissions yet', h.submission?.open === false ? 'Project submissions are switched off for this hackathon.' : 'Teams submit ideas, project links and PPT links from their dashboard.');

  const testTab = () => { const done = atts.filter(a => a.submittedAtMs).sort((a, b) => (b.score || 0) - (a.score || 0));
    return `<div class="hk-card-s" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><b>${meta ? esc(meta.title) : 'No screening test yet'}</b><div class="hk-sm hk-muted">${meta ? `${meta.count} questions · ${meta.durationMin} min · ${meta.total} marks${meta.endMs ? ' · closes ' + C.fmtDT(meta.endMs) : ''}` : 'Create a timed MCQ test. Answers are graded on the server.'}</div></div><div style="display:flex;gap:8px">${meta ? '<button class="hk-btn sm danger" data-rmtest>Remove</button>' : ''}<button class="hk-btn sm gold" data-test>${meta ? 'Edit test' : 'Create test'}</button></div></div>
    ${meta ? `<div class="hk-sec"><h2><i data-lucide="trophy"></i>Results · ${done.length} of ${regs.length} attempted</h2></div>${done.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>#</th><th>Team leader</th><th>Score</th><th>Submitted</th></tr></thead><tbody>${done.map((a, i) => { const r = regs.find(x => x.uid === a.uid); return `<tr><td>${i + 1}</td><td><b>${esc(r?.name || a.uid)}</b><div class="hk-xs hk-muted">${esc(r?.teamName || '')}</div></td><td><b>${a.score}</b> / ${a.total}</td><td>${C.fmtDT(a.submittedAtMs)}</td></tr>`; }).join('')}</tbody></table></div>` : empty('clipboard-check', 'No attempts yet', 'Scores appear here once teams submit.')}` : ''}`; };

  const setTab = t => { tab = t; paint(); };
  const paint = () => {
    const closed = h.registrationClosed, mailed = regs.filter(r => r.lastMailAtMs).length;
    view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="#/host" style="margin-bottom:10px"><i data-lucide="arrow-left"></i>Dashboard</a>
      <div class="hk-page-h"><div><span class="hk-eyebrow" style="color:var(--hk-gold)">Manage</span><h1>${esc(h.title)}</h1><p>${statusBadge(h.status)} <span class="hk-chip ${ph.tone}">${ph.label}</span></p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="hk-btn" href="#/h/${h.id}"><i data-lucide="eye"></i>View page</a><button class="hk-btn" data-announce><i data-lucide="megaphone"></i>Announce</button><button class="hk-btn" data-csv><i data-lucide="file-spreadsheet"></i>CSV</button><button class="hk-btn primary" data-pdf><i data-lucide="file-down"></i>PDF</button></div></div>
      <div class="hk-kpis"><div class="hk-kpi"><div class="ki"><i data-lucide="users"></i></div><strong>${regs.length}</strong><span>Registrations${h.maxParticipants ? ` / ${h.maxParticipants}` : ''}</span></div>
        <div class="hk-kpi g"><div class="ki"><i data-lucide="user-check"></i></div><strong>${regs.filter(r => ['shortlisted', 'selected'].includes(r.status)).length}</strong><span>Shortlisted / selected</span></div>
        <div class="hk-kpi c"><div class="ki"><i data-lucide="lightbulb"></i></div><strong>${subs.length}</strong><span>Submissions</span></div>
        <div class="hk-kpi s"><div class="ki"><i data-lucide="mail-check"></i></div><strong>${mailed}</strong><span>Teams emailed</span></div></div>
      <div class="hk-card-s" style="margin:14px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div><b>Registration is ${closed ? 'closed' : 'open'}</b><div class="hk-sm hk-muted">${h.regDeadlineMs ? 'Deadline ' + C.fmtDT(h.regDeadlineMs) + '. ' : ''}Automatic emails are <b>${h.autoEmail === false ? 'off' : 'on'}</b>.</div></div><button class="hk-btn sm ${closed ? 'primary' : ''}" data-toggle>${closed ? 'Reopen registration' : 'End registration now'}</button></div>
      <div class="hk-tabs" role="tablist">${[['regs', 'users', `Registrations (${regs.length})`], ['subs', 'lightbulb', `Submissions (${subs.length})`], ['test', 'clipboard-check', 'Test']].map(([k, ic, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}" role="tab"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
      <div id="tabBody">${tab === 'regs' ? regsTab() : tab === 'subs' ? subsTab() : testTab()}</div></div>`;
    icons();
  };
  const redrawRows = () => { const b = $('#tabBody'); if(tab === 'regs' && b){ const k = document.activeElement?.id, pos = document.activeElement?.selectionStart; b.innerHTML = regsTab(); icons(); if(k){ const el = $('#' + k); el?.focus(); try { el.setSelectionRange(pos, pos); } catch {} } } };

  /* ---------- compose + send the Notify Team email ---------- */
  function compose(targets){
    const one = targets.length === 1 ? targets[0] : null;
    const def = one ? (MAIL_FOR_STATUS[one.status] || 'custom') : '';
    modal(one ? `Email team · ${one.teamName || one.name}` : `Email ${targets.length} team leaders`, `<form class="hk-form" id="mf">
      <div class="hk-mailhead"><div><span>From</span><b>team@campusconnectone.online</b></div><div><span>To</span><b>${one ? esc(one.name) + ' · ' + esc(one.email) : targets.length + ' team leaders'}</b></div><div><span>Signed</span><b>${esc(org.name)}${org.org ? ', ' + esc(org.org) : ''}</b></div></div>
      <div class="hk-field"><label>Template</label><select class="hk-select" name="kind" id="mk"><option value="">Choose a template…</option>${Object.entries(C.MAIL_KINDS).map(([k, l]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      ${rounds.length ? `<div class="hk-field hk-hidden" id="rdWrap"><label>Round name <small>shown in the email</small></label><select class="hk-select" name="roundName">${rounds.map((x, i) => `<option ${one && (one.stage || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
      <div class="hk-field"><label>Note / idea for the team <small id="noteHint">optional</small></label><textarea class="hk-textarea" name="note" maxlength="1000" style="min-height:110px" placeholder="e.g. Great idea! Please add a short demo video to your PPT before the final round."></textarea></div>
      <div class="hk-msg ok"><i data-lucide="info"></i><span>Replies go to ${esc(S.hk.orgEmail || S.user.email || 'your contact email')}. The email is signed with your organiser name.</span></div>
      <div id="mErr" class="hk-msg err hk-hidden"></div>
      <button class="hk-btn hk-sendbtn" type="submit" id="mSend" disabled><i data-lucide="send"></i><span>Choose a template</span></button></form>`, { onMount(b, close){
      const k = $('#mk', b), btn = $('#mSend', b), n = $('[name=note]', b), err = m => { const e = $('#mErr', b); e.classList.toggle('hk-hidden', !m); e.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); };
      const ready = () => { const ok = !!k.value && (k.value !== 'custom' || n.value.trim().length >= 3); btn.disabled = !ok; btn.classList.toggle('ready', ok); btn.querySelector('span').textContent = ok ? (targets.length > 1 ? `Send to ${targets.length} teams` : 'Send email') : (k.value === 'custom' ? 'Write your message' : 'Choose a template'); $('#rdWrap', b)?.classList.toggle('hk-hidden', !['shortlisted', 'selected'].includes(k.value)); };
      k.onchange = n.oninput = ready; ready();
      $('#mf', b).onsubmit = async ev => {
        ev.preventDefault(); err(''); btn.disabled = true; const f = new FormData(ev.target);
        let ok = 0, bad = 0, last = '';
        for(let i = 0; i < targets.length; i++){
          btn.innerHTML = `<span class="hk-spin"></span> Sending ${i + 1}/${targets.length}…`;
          try { await C.notifyTeam(targets[i].id, f.get('kind'), (f.get('note') || '').trim(), f.get('roundName') || ''); targets[i].lastMailAtMs = Date.now(); targets[i].lastMailKind = f.get('kind'); ok++; }
          catch(e){ bad++; last = e.message; }
        }
        if(!bad){ close(); toast(`Email sent to ${ok} team${ok === 1 ? '' : 's'}`); redrawRows(); paint(); }
        else { err(`${ok} sent, ${bad} failed. ${last}`); btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i><span>Retry</span>'; icons(); redrawRows(); }
      };
    } });
  }

  /* ---------- exports ---------- */
  const flat = r => [r.name, r.email, r.phone, r.college, r.year || '', r.teamMode === 'solo' ? 'Solo' : 'Team', r.teamName || '', (r.members || []).map(m => `${m.name}${m.email ? ' <' + m.email + '>' : ''}`).join('; '), roundName(r.stage || 0), r.status, subOf(r.uid)?.title || '', subOf(r.uid)?.score ?? '', attOf(r.uid)?.submittedAtMs ? `${attOf(r.uid).score}/${attOf(r.uid).total}` : '', C.fmtDT(r.createdAtMs)];
  const HEAD = ['Leader', 'Email', 'Phone', 'College', 'Year', 'Mode', 'Team', 'Members', 'Round', 'Status', 'Project', 'Score', 'Test', 'Registered'];
  function pdf(){
    const w = window.open('', '_blank'); if(!w) return toast('Allow pop-ups to export the PDF.', 'error');
    const rows = filtered();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(h.title)} · registrations</title><style>body{font:12px Inter,Arial,sans-serif;color:#10231a;margin:24px}h1{font-size:20px;margin:0}p{color:#52665b;margin:4px 0 14px}table{border-collapse:collapse;width:100%}th{background:#e6f4ec;text-align:left}th,td{border:1px solid #cfe3d7;padding:5px 6px;vertical-align:top}tr{page-break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style>
      <h1>${esc(h.title)}</h1><p>${esc(org.name)}${org.org ? ' · ' + esc(org.org) : ''} · ${rows.length} registrations · exported ${esc(C.fmtDT(Date.now()))}</p>
      <table><thead><tr><th>#</th>${HEAD.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${flat(r).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>onload=()=>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
  }

  /* ---------- test builder ---------- */
  async function testBuilder(){
    const keys = await C.getTestKeys(id);
    const qs = keys ? keys.questions.map(x => ({ ...x, correct: keys.answers[x.id] })) : [{ text: '', options: ['', '', '', ''], correct: 0, marks: 1 }];
    const m = meta || { title: 'Screening test', durationMin: 30, startMs: 0, endMs: 0 };
    const qRow = (q, i) => `<div class="hk-card-s" data-q="${i}"><div style="display:flex;justify-content:space-between"><b>Question ${i + 1}</b><button type="button" class="hk-btn icon ghost" data-qdel="${i}" aria-label="Remove question"><i data-lucide="trash-2"></i></button></div>
      <input class="hk-input" data-f="text" placeholder="Question" value="${esc(q.text)}" style="margin:8px 0">${q.options.map((o, k) => `<label class="hk-optrow"><input type="radio" name="c${i}" data-f="correct" value="${k}" ${+q.correct === k ? 'checked' : ''} aria-label="Correct answer ${k + 1}"><input class="hk-input" data-f="opt" data-k="${k}" placeholder="Option ${String.fromCharCode(65 + k)}" value="${esc(o)}"></label>`).join('')}
      <div style="margin-top:8px"><label class="hk-sm">Marks <input class="hk-input" type="number" min="1" data-f="marks" value="${q.marks || 1}" style="width:80px;display:inline-block"></label></div></div>`;
    modal(meta ? 'Edit screening test' : 'Create screening test', `<form class="hk-form" id="tf"><div class="hk-field"><label>Title</label><input class="hk-input" name="title" value="${esc(m.title)}" maxlength="80"></div>
      <div class="hk-grid3"><div class="hk-field"><label>Duration (min)</label><input class="hk-input" type="number" min="5" name="dur" value="${m.durationMin}"></div><div class="hk-field"><label>Opens</label><input class="hk-input" type="datetime-local" name="st" value="${C.toLocalInput(m.startMs)}"></div><div class="hk-field"><label>Closes</label><input class="hk-input" type="datetime-local" name="en" value="${C.toLocalInput(m.endMs)}"></div></div>
      <div id="qs" class="hk-stack">${qs.map(qRow).join('')}</div><button type="button" class="hk-btn sm" id="addQ"><i data-lucide="plus"></i>Add question</button>
      <div id="tErr" class="hk-msg err hk-hidden"></div><button class="hk-btn gold lg block" type="submit">Save test</button></form>`, { wide: true, onMount(b, close){
      const read = () => $$('[data-q]', b).map(el => ({ text: $('[data-f=text]', el).value, options: $$('[data-f=opt]', el).map(x => x.value), correct: +($('[data-f=correct]:checked', el)?.value ?? 0), marks: +$('[data-f=marks]', el).value || 1 }));
      const draw = l => { $('#qs', b).innerHTML = l.map(qRow).join(''); icons(); };
      $('#addQ', b).onclick = () => { const l = read(); l.push({ text: '', options: ['', '', '', ''], correct: 0, marks: 1 }); draw(l); };
      $('#qs', b).onclick = e => { const d = e.target.closest('[data-qdel]'); if(d){ const l = read(); l.splice(+d.dataset.qdel, 1); draw(l.length ? l : [{ text: '', options: ['', '', '', ''], correct: 0, marks: 1 }]); } };
      $('#tf', b).onsubmit = async ev => {
        ev.preventDefault(); const f = new FormData(ev.target), l = read(), er = $('#tErr', b), fail = x => { er.classList.remove('hk-hidden'); er.innerHTML = `<i data-lucide="circle-alert"></i><span>${esc(x)}</span>`; icons(); };
        if(l.some(x => x.text.trim().length < 3 || x.options.some(o => !o.trim()))) return fail('Every question needs text and four options.');
        const stM = C.fromLocalInput(f.get('st')), enM = C.fromLocalInput(f.get('en')); if(stM && enM && enM <= stM) return fail('Closing time must be after opening time.');
        try { await C.saveTest(h, S.user, { title: f.get('title').trim() || 'Screening test', durationMin: +f.get('dur') || 30, startMs: stM, endMs: enM }, l); meta = await C.getTestMeta(id); close(); toast('Test saved'); paint(); }
        catch(e){ fail(e.message); }
      };
    } });
  }

  /* ---------- status / round changes ---------- */
  async function patchReg(r, patch){
    await C.updateRegistration(r.id, patch); Object.assign(r, patch);
    const label = patch.status ? `Registration ${patch.status}` : 'Moved to next round';
    C.notify({ toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'status', title: label, body: patch.status ? `Your status for ${h.title} is now ${patch.status}.` : `Your team is now in ${roundName(patch.stage)}.` }).catch(() => {});
  }

  paint();
  view.oninput = e => {
    if(e.target.id === 'rq'){ q = e.target.value.trim().toLowerCase(); redrawRows(); }
  };
  view.onchange = async e => {
    const t = e.target;
    if(t.id === 'fs'){ fs = t.value; return redrawRows(); }
    if(t.id === 'fr'){ fr = t.value; return redrawRows(); }
    if(t.id === 'selAll'){ filtered().forEach(r => t.checked ? sel.add(r.id) : sel.delete(r.id)); return redrawRows(); }
    if(t.dataset.sel){ t.checked ? sel.add(t.dataset.sel) : sel.delete(t.dataset.sel); return redrawRows(); }
    const targets = () => regs.filter(r => sel.has(r.id));
    if(t.id === 'bSt' || t.id === 'bRd'){
      const v = t.value; if(v === '') return; const list = targets(); if(!list.length) return;
      if(!confirm(`Update ${list.length} registration(s)?${h.autoEmail === false ? '' : ' Teams will be emailed automatically.'}`)){ t.value = ''; return; }
      try { for(const r of list) await patchReg(r, t.id === 'bSt' ? { status: v } : { stage: +v }); toast('Updated'); } catch(err){ toast(err.message, 'error'); }
      return paint();
    }
    const stS = t.closest('[data-st]'), stG = t.closest('[data-stage]');
    const r = regs.find(x => x.id === (stS?.dataset.st || stG?.dataset.stage)); if(!r) return;
    const prev = stS ? r.status : (r.stage || 0);
    try { await patchReg(r, stS ? { status: t.value } : { stage: +t.value }); toast(h.autoEmail === false ? 'Updated' : 'Updated. Team will be emailed.'); paint(); }
    catch(err){ toast(err.message, 'error'); t.value = prev; }
  };
  view.onclick = async e => {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if(tb) return setTab(tb.dataset.tab);
    const mb = t.closest('[data-mail]'); if(mb){ const r = regs.find(x => x.id === mb.dataset.mail); if(r) compose([r]); return; }
    if(t.closest('[data-bulkmail]')){ const l = regs.filter(r => sel.has(r.id)); return l.length ? compose(l) : toast('Select teams first.', 'error'); }
    if(t.closest('[data-csv]')) return C.csv(`${slug}-registrations.csv`, [HEAD, ...filtered().map(flat)]);
    if(t.closest('[data-pdf]')) return pdf();
    if(t.closest('[data-share]')){ try { await navigator.clipboard.writeText(location.origin + location.pathname + '#/h/' + h.id); toast('Link copied'); } catch { toast('Copy failed', 'error'); } return; }
    if(t.closest('[data-test]')) return testBuilder();
    if(t.closest('[data-rmtest]')){ if(confirm('Remove the test and all questions?')){ try { await C.removeTest(id); meta = null; paint(); toast('Test removed', 'info'); } catch(err){ toast(err.message, 'error'); } } return; }
    const rv = t.closest('[data-review]');
    if(rv){
      const card = rv.closest('[data-sub]'), s = subs.find(x => x.id === rv.dataset.review), sc = $('[data-score]', card).value, fb = $('[data-fb]', card).value.trim();
      try { const patch = { score: sc === '' ? null : Math.max(0, Math.min(100, +sc)), feedback: fb, reviewStatus: 'reviewed' }; await C.reviewSubmission(s.id, patch); Object.assign(s, patch); toast('Review saved'); paint(); } catch(err){ toast(err.message, 'error'); }
      return;
    }
    if(t.closest('[data-toggle]')){
      try { await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { registrationClosed: !h.registrationClosed, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() }); h.registrationClosed = !h.registrationClosed; cx.S.all = null; toast(h.registrationClosed ? 'Registration ended' : 'Registration reopened', 'info'); paint(); }
      catch(err){ toast(err.message, 'error'); }
      return;
    }
    if(t.closest('[data-announce]')){
      modal('Send an update', `<form class="hk-form" id="an"><p class="hk-sm hk-muted">Shown on the hackathon page and sent as an in-app notification to all ${regs.length} registrant${regs.length === 1 ? '' : 's'}. For email, use the mail button on each row.</p><div class="hk-field"><textarea class="hk-textarea" name="msg" maxlength="500" required style="min-height:110px" placeholder="e.g. Round 1 results are out."></textarea></div><button class="hk-btn gold block" type="submit">Send update</button></form>`, { onMount(b, close){
        $('#an', b).onsubmit = async ev => {
          ev.preventDefault(); const msg = new FormData(ev.target).get('msg').trim(); if(!msg) return;
          const btn = $('button', b); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Sending…';
          try {
            await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { announcement: msg, announcementAtMs: Date.now(), updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
            h.announcement = msg;
            for(let i = 0; i < regs.length; i += 400){
              const wb = FS.writeBatch(C.db);
              regs.slice(i, i + 400).forEach(r => wb.set(FS.doc(FS.collection(C.db, 'hkNotifications')), { toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'announcement', title: `Update: ${h.title}`, body: msg, read: false, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() }));
              await wb.commit();
            }
            cx.S.all = null; close(); toast(`Update sent to ${regs.length} registrant${regs.length === 1 ? '' : 's'}`);
          } catch(err){ toast(err.message, 'error'); btn.disabled = false; btn.innerHTML = 'Send update'; }
        };
      } });
    }
  };
  cx.S.cleanup = () => { view.oninput = view.onchange = view.onclick = null; };
}
