// Participant dashboard for one hackathon: round tracker, screening test, project submission, team.
import * as C from './hk-core.js';
import { empty, countdownHtml, startCountdowns } from './hk-ui.js';

const { $, $$, esc, icons, toast, FS } = C;
const STATUS_TXT = {
  registered: ['Registered', '', 'ticket-check'],
  shortlisted: ['Shortlisted', '', 'sparkles'],
  selected: ['Selected', 'gold', 'trophy'],
  waitlisted: ['Waitlisted', 'warn', 'hourglass'],
  rejected: ['Not selected', 'bad', 'circle-x']
};

export async function dash(cx, hid){
  const { S, view } = cx;
  const [h, reg] = await Promise.all([C.fetchOne(hid), C.getRegistration(hid, S.user.uid)]); if(cx.stale()) return;
  if(!h || !reg){ view.innerHTML = `<div class="hk-view">${empty('ticket', 'No registration found', 'Register for this hackathon first, then your dashboard appears here.', `<a class="hk-btn primary" href="#/h/${esc(hid)}">View hackathon</a>`)}</div>`; return; }
  const [sub, meta, att] = await Promise.all([C.getSubmission(hid, S.user.uid).catch(() => null), C.getTestMeta(hid), C.myAttempt(hid, S.user.uid)]); if(cx.stale()) return;
  const now = Date.now(), rounds = C.roundsOf(h), st = STATUS_TXT[reg.status] || STATUS_TXT.registered;
  const subCfg = h.submission || {}, subOpen = subCfg.open !== false && (!subCfg.deadlineMs || now <= subCfg.deadlineMs) && reg.status !== 'rejected';
  const members = reg.members || [];

  const tracker = rounds.length
    ? `<ol class="hk-rounds">${rounds.map((r, i) => `<li class="${i < (reg.stage || 0) ? 'done' : i === (reg.stage || 0) ? 'cur' : ''}"><span class="n">${i < (reg.stage || 0) ? '<i data-lucide="check"></i>' : i + 1}</span><b>${esc(r.name)}</b>${r.desc ? `<small>${esc(r.desc)}</small>` : ''}${r.startMs ? `<small>${C.fmtDate(r.startMs)}${r.endMs ? ' → ' + C.fmtDate(r.endMs) : ''}</small>` : ''}</li>`).join('')}</ol>`
    : '<p class="hk-sm hk-muted">The organiser has not defined separate rounds for this hackathon.</p>';

  /* screening test card */
  let testCard = '';
  if(meta){
    const closed = meta.endMs && now > meta.endMs, notYet = meta.startMs && now < meta.startMs;
    let body;
    if(att?.submittedAtMs) body = `<div class="hk-msg ok"><i data-lucide="circle-check"></i><span>Submitted ${C.ago(att.submittedAtMs)}. Your score: <b>${att.score ?? 0} / ${att.total ?? meta.total}</b></span></div>`;
    else if(reg.status === 'rejected') body = '<p class="hk-sm hk-muted">Tests are not available for this registration.</p>';
    else if(closed && !att) body = '<div class="hk-msg err"><i data-lucide="timer-off"></i><span>The test window has closed.</span></div>';
    else if(notYet) body = `<p class="hk-sm hk-muted">Opens ${C.fmtDT(meta.startMs)}.</p>`;
    else body = `<p class="hk-sm hk-muted">${meta.count} questions · ${meta.durationMin} minutes · ${meta.total} marks. ${meta.endMs ? 'Closes ' + C.fmtDT(meta.endMs) + '.' : ''} Once you start, the timer cannot be paused.</p><button class="hk-btn primary" data-start>${att ? 'Resume test' : 'Start test'}</button>`;
    testCard = `<section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="clipboard-check"></i><h3>${esc(meta.title || 'Screening test')}</h3></div>${body}</section>`;
  }

  /* project submission card */
  const f = (k) => esc(sub?.[k] || '');
  const reviewed = sub && (sub.score != null || sub.feedback);
  const subCard = subCfg.open === false ? '' : `<section class="hk-card-s hk-dcard" id="subCard"><div class="dh"><i data-lucide="lightbulb"></i><h3>Project submission</h3>${sub ? `<span class="hk-chip">${sub.reviewStatus === 'reviewed' ? 'Reviewed' : 'Submitted'}</span>` : ''}</div>
    <p class="hk-sm hk-muted">Share your idea and external links (GitHub, demo, PPT on Google Drive / Canva / OneDrive). The organiser evaluates what you submit. ${subCfg.deadlineMs ? `<b>Deadline ${C.fmtDT(subCfg.deadlineMs)}.</b>` : ''}${subCfg.instructions ? ' ' + esc(subCfg.instructions) : ''}</p>
    ${reviewed ? `<div class="hk-msg ok" style="margin:12px 0"><i data-lucide="message-square-text"></i><span>${sub.score != null ? `Score: <b>${esc(sub.score)}</b>. ` : ''}${sub.feedback ? esc(sub.feedback) : ''}</span></div>` : ''}
    <form id="subForm" class="hk-form" novalidate style="margin-top:12px">
      <div class="hk-field"><label>Project / idea title</label><input class="hk-input" name="title" maxlength="140" required value="${f('title')}" ${subOpen ? '' : 'disabled'}></div>
      <div class="hk-field"><label>Idea &amp; approach <small>what problem, how you solve it, tech used</small></label><textarea class="hk-textarea" name="idea" maxlength="4000" required style="min-height:130px" ${subOpen ? '' : 'disabled'}>${f('idea')}</textarea></div>
      <div class="hk-grid2"><div class="hk-field"><label>Presentation (PPT / PDF link)</label><input class="hk-input" name="pptUrl" type="url" placeholder="https://…" value="${f('pptUrl')}" ${subOpen ? '' : 'disabled'}></div><div class="hk-field"><label>Repository link</label><input class="hk-input" name="repoUrl" type="url" placeholder="https://github.com/…" value="${f('repoUrl')}" ${subOpen ? '' : 'disabled'}></div></div>
      <div class="hk-grid2"><div class="hk-field"><label>Live demo link <small>optional</small></label><input class="hk-input" name="demoUrl" type="url" placeholder="https://…" value="${f('demoUrl')}" ${subOpen ? '' : 'disabled'}></div><div class="hk-field"><label>Demo video link <small>optional</small></label><input class="hk-input" name="videoUrl" type="url" placeholder="https://…" value="${f('videoUrl')}" ${subOpen ? '' : 'disabled'}></div></div>
      <div class="hk-field"><label>Other link <small>optional (design, docs, dataset)</small></label><input class="hk-input" name="extraUrl" type="url" placeholder="https://…" value="${f('extraUrl')}" ${subOpen ? '' : 'disabled'}></div>
      <div id="subErr" class="hk-msg err hk-hidden"></div>
      ${subOpen ? `<button class="hk-btn primary" type="submit">${sub ? 'Update submission' : 'Submit to organiser'}</button>` : `<div class="hk-msg err"><i data-lucide="lock"></i><span>${reg.status === 'rejected' ? 'Submissions are not available for this registration.' : 'The submission window is closed.'}</span></div>`}
    </form></section>`;

  const team = `<section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="users-round"></i><h3>${reg.teamMode === 'solo' ? 'Solo entry' : esc(reg.teamName || 'Your team')}</h3></div>
    <div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(reg.name)}</b><span class="hk-sm hk-muted">Team leader · ${esc(reg.email)}</span></div></div>
    ${members.map(m => `<div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(m.name)}</b><span class="hk-sm hk-muted">${esc(m.email || m.phone || 'Member')}</span></div></div>`).join('')}
    <p class="hk-xs hk-muted" style="margin-top:8px">All updates are emailed to the team leader from team@campusconnectone.online.</p></section>`;

  const org = h.organiser || {};
  const cd = countdownHtml(h, reg, reg.status === 'selected');
  const curRound = rounds[reg.stage || 0]?.name || '';
  const statusBanner = `<div class="hk-my-card" style="margin-bottom:14px">
    <div class="hk-my-banner ${esc(reg.status || 'registered')}"><span style="display:inline-flex;align-items:center;gap:6px"><i data-lucide="${st[2]}"></i>Status: ${st[0]}</span>${curRound ? `<span class="hk-xs">${esc(curRound)}</span>` : ''}</div>
    ${reg.hostNote ? `<div class="hk-my-body" style="padding:12px 16px"><div class="hk-sm"><b>Note from organiser:</b> ${esc(reg.hostNote)}</div></div>` : ''}
  </div>`;

  view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="#/my" style="margin-bottom:12px"><i data-lucide="arrow-left"></i>My hackathons</a>
    <div class="hk-page-h"><div><span class="hk-eyebrow">My dashboard</span><h1>${esc(h.title)}</h1><p>Hosted by ${esc(org.name || h.hostName || 'the organiser')}${org.org ? ' · ' + esc(org.org) : ''}</p></div><span class="hk-chip ${st[1]}">${st[0]}</span></div>
    ${statusBanner}
    ${cd ? `<div style="margin-bottom:14px">${cd}</div>` : ''}
    <section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="list-ordered"></i><h3>Process &amp; round timeline</h3></div>${tracker}</section>
    <div class="hk-dgrid"><div class="hk-stack">${testCard}${subCard}</div><aside class="hk-stack">${team}
      <section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="calendar-days"></i><h3>Key dates</h3></div><ul class="hk-kv"><li><span>Starts</span><b>${C.fmtDT(h.startMs)}</b></li><li><span>Ends</span><b>${C.fmtDT(h.endMs)}</b></li>${subCfg.deadlineMs ? `<li><span>Submission</span><b>${C.fmtDT(subCfg.deadlineMs)}</b></li>` : ''}</ul>
      ${org.email ? `<a class="hk-btn sm block" style="margin-top:10px" href="mailto:${esc(org.email)}"><i data-lucide="mail"></i>Contact organiser</a>` : ''}<a class="hk-btn sm block" style="margin-top:8px" href="#/h/${esc(h.id)}">View hackathon page</a></section></aside></div></div>`;

  const stopTimer = startCountdowns(view);
  let unsubReg = null;
  unsubReg = FS.onSnapshot(FS.doc(C.db, 'hkRegistrations', `${hid}_${S.user.uid}`), snap => {
    if(!snap.exists() || cx.stale()) return;
    const live = snap.data();
    if(live.status !== reg.status || (live.stage || 0) !== (reg.stage || 0) || (live.hostNote || '') !== (reg.hostNote || '')){
      const activeTag = document.activeElement?.tagName;
      if(['INPUT', 'TEXTAREA'].includes(activeTag)){
        toast(`Status updated: ${(STATUS_TXT[live.status] || STATUS_TXT.registered)[0]}`, 'info');
      } else {
        dash(cx, hid);
      }
    }
  }, () => {});

  const sf = $('#subForm');
  if(sf && subOpen) sf.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(sf).entries()), err = m => { const b = $('#subErr'); b.classList.toggle('hk-hidden', !m); b.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); };
    err('');
    for(const k of Object.keys(d)) d[k] = String(d[k]).trim();
    if(d.title.length < 3) return err('Add a project title.');
    if(d.idea.length < 30) return err('Describe your idea in a few sentences (at least 30 characters).');
    if(!(d.pptUrl || d.repoUrl || d.demoUrl || d.videoUrl || d.extraUrl)) return err('Add at least one link (PPT, repository, demo or video).');
    for(const k of ['pptUrl', 'repoUrl', 'demoUrl', 'videoUrl', 'extraUrl']) if(d[k] && !C.isUrl(d[k])) return err('Links must start with https://');
    const btn = $('button[type=submit]', sf); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
    try { await C.saveSubmission(h, S.user, reg, d); toast('Submitted to the organiser'); await dash(cx, hid); icons(); }
    catch(ex){ err(/permission|insufficient/i.test(ex.message) ? 'Submissions are closed or not allowed right now.' : ex.message); btn.disabled = false; btn.textContent = sub ? 'Update submission' : 'Submit to organiser'; }
  };
  const sb = $('[data-start]'); if(sb) sb.onclick = () => runTest(cx, h, meta, () => dash(cx, hid).then(icons));
  cx.S.cleanup = () => { stopTimer?.(); unsubReg?.(); };
  icons();
}

/* ---------- timed test (graded on the server) ---------- */
async function runTest(cx, h, meta, done){
  const { view } = cx;
  let t;
  try { t = await C.callFn('hkStartTest', { hackathonId: h.id }); } catch(e){ return toast(e.message, 'error'); }
  const ans = {}; let i = 0, timer = 0, over = false;
  const left = () => Math.max(0, Math.floor((t.deadlineMs - Date.now()) / 1000));
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const draw = () => {
    const q = t.questions[i];
    view.innerHTML = `<div class="hk-view hk-test"><div class="hk-test-top"><div><span class="hk-eyebrow">${esc(t.title)}</span><b>Question ${i + 1} of ${t.questions.length}</b></div><span class="hk-chip" id="tleft"><i data-lucide="timer"></i>${fmt(left())}</span></div>
      <div class="hk-progress"><i style="width:${Math.round((i + 1) / t.questions.length * 100)}%"></i></div>
      <section class="hk-card-s hk-dcard"><h3 style="font-size:1.1rem;margin-bottom:14px">${esc(q.text)} <small class="hk-muted">(${q.marks} mark${q.marks > 1 ? 's' : ''})</small></h3>
      <div class="hk-opts">${q.options.map((o, k) => `<button type="button" class="hk-opt ${ans[q.id] === k ? 'on' : ''}" data-k="${k}"><span>${String.fromCharCode(65 + k)}</span>${esc(o)}</button>`).join('')}</div></section>
      <div class="hk-test-nav"><button class="hk-btn" data-prev ${i ? '' : 'disabled'}>Previous</button>${i < t.questions.length - 1 ? '<button class="hk-btn primary" data-next>Next</button>' : '<button class="hk-btn gold" data-finish>Submit test</button>'}</div></div>`;
    icons();
  };
  const finish = async auto => {
    if(over) return; over = true; clearInterval(timer);
    view.innerHTML = '<div class="hk-view"><div class="hk-skel" style="height:200px"></div></div>';
    try { const r = await C.callFn('hkSubmitTest', { hackathonId: h.id, answers: ans }); toast(`${auto ? 'Time is up. ' : ''}Submitted. Score ${r.score} / ${r.total}`); }
    catch(e){ toast(e.message, 'error'); }
    done();
  };
  view.onclick = e => {
    const o = e.target.closest('[data-k]'); if(o){ ans[t.questions[i].id] = +o.dataset.k; draw(); return; }
    if(e.target.closest('[data-prev]')){ i--; draw(); } else if(e.target.closest('[data-next]')){ i++; draw(); }
    else if(e.target.closest('[data-finish]')){ const un = t.questions.filter(q => !(q.id in ans)).length; if(!un || confirm(`${un} question(s) unanswered. Submit anyway?`)) finish(false); }
  };
  timer = setInterval(() => { const s = left(), el = $('#tleft'); if(el) el.lastChild.textContent = fmt(s); if(s <= 0) finish(true); }, 1000);
  cx.S.cleanup = () => { clearInterval(timer); view.onclick = null; };
  draw();
}
