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
  const hasExplicitFlags = ['askPpt', 'askRepo', 'askVideo', 'askIntroVideo', 'askDemo', 'askExtra', 'reqPpt', 'reqRepo', 'reqVideo', 'reqIntroVideo', 'reqDemo', 'reqExtra'].some(k => k in subCfg);
  const stdFields = [
    { key: 'pptUrl', ask: hasExplicitFlags ? !!(subCfg.askPpt || subCfg.reqPpt) : true, req: !!subCfg.reqPpt, label: 'Presentation (PPT / PDF link)', ph: 'https://drive.google.com/…', help: 'drive' },
    { key: 'repoUrl', ask: hasExplicitFlags ? !!(subCfg.askRepo || subCfg.reqRepo) : true, req: !!subCfg.reqRepo, label: 'Repository link', ph: 'https://github.com/…', help: '' },
    { key: 'videoUrl', ask: hasExplicitFlags ? !!(subCfg.askVideo || subCfg.reqVideo) : true, req: !!subCfg.reqVideo, label: 'Prototype / Demo video link', ph: 'https://drive.google.com/… or YouTube', help: 'video' },
    { key: 'introVideoUrl', ask: !!(subCfg.askIntroVideo || subCfg.reqIntroVideo), req: !!subCfg.reqIntroVideo, label: 'Intro / Pitch video link', ph: 'https://drive.google.com/… or YouTube', help: 'video' },
    { key: 'demoUrl', ask: hasExplicitFlags ? !!(subCfg.askDemo || subCfg.reqDemo) : true, req: !!subCfg.reqDemo, label: 'Live demo link', ph: 'https://…', help: 'web' },
    { key: 'extraUrl', ask: hasExplicitFlags ? !!(subCfg.askExtra || subCfg.reqExtra) : true, req: !!subCfg.reqExtra, label: 'Other link (design, docs, dataset)', ph: 'https://…', help: 'drive' }
  ].filter(x => x.ask);

  const customSubFields = (subCfg.customFields || []).filter(cf => (cf.label || '').trim());
  const getCustomSubVal = (cf, i) => {
    const arr = Array.isArray(sub?.customAnswers) ? sub.customAnswers : [];
    const hit = arr.find(a => (cf.id && a.id === cf.id) || a.label === cf.label) || arr[i];
    return hit?.value || '';
  };

  const urlFieldHtml = (name, label, ph, val, req, helpKind, attrExtra = '') => `
    <div class="hk-field"><label>${esc(label)} <small>${req ? 'required' : 'optional'}</small></label>
      <div class="hk-url-wrap">
        <input class="hk-input" ${name ? `name="${esc(name)}"` : ''} ${attrExtra} type="url" placeholder="${esc(ph)}" value="${esc(val)}" ${req ? 'required' : ''} ${subOpen ? '' : 'disabled'}>
        ${helpKind ? `<button type="button" class="hk-help-ic" data-drive-help="${esc(helpKind)}" data-help-label="${esc(label)}" title="How to upload &amp; share link" aria-label="How to upload and share ${esc(label)}"><i data-lucide="info"></i></button>` : ''}
      </div>
    </div>`;

  const stdInputsHtml = stdFields.map(x => urlFieldHtml(x.key, x.label, x.ph, sub?.[x.key] || '', x.req, x.help)).join('');
  const customInputsHtml = customSubFields.map((cf, i) => cf.type === 'url'
    ? urlFieldHtml('', cf.label, 'https://drive.google.com/…', getCustomSubVal(cf, i), !!cf.required, 'drive', `data-sub-cf="${i}"`)
    : `<div class="hk-field"><label>${esc(cf.label)} <small>${cf.required ? 'required' : 'optional'}</small></label><input class="hk-input" data-sub-cf="${i}" type="text" placeholder="Enter your answer…" value="${esc(getCustomSubVal(cf, i))}" ${cf.required ? 'required' : ''} ${subOpen ? '' : 'disabled'}></div>`
  ).join('');

  const subCard = subCfg.open === false ? '' : `<section class="hk-card-s hk-dcard" id="subCard"><div class="dh"><i data-lucide="lightbulb"></i><h3>Project submission</h3>${sub ? `<span class="hk-chip">${sub.reviewStatus === 'reviewed' ? 'Reviewed' : 'Submitted'}</span>` : ''}</div>
    <p class="hk-sm hk-muted">Share your idea and links (upload PPT/Video to Google Drive and tap the <i data-lucide="info" style="width:14px;height:14px;color:var(--hk-sky)"></i> icon next to any link field for upload steps). ${subCfg.deadlineMs ? `<b>Deadline ${C.fmtDT(subCfg.deadlineMs)}.</b>` : ''}${subCfg.instructions ? ' ' + esc(subCfg.instructions) : ''}</p>
    ${reviewed ? `<div class="hk-msg ok" style="margin:12px 0"><i data-lucide="message-square-text"></i><span>${sub.score != null ? `Score: <b>${esc(sub.score)}</b>. ` : ''}${sub.feedback ? esc(sub.feedback) : ''}</span></div>` : ''}
    <form id="subForm" class="hk-form" novalidate style="margin-top:12px">
      <div class="hk-field"><label>Project / idea title</label><input class="hk-input" name="title" maxlength="140" required value="${f('title')}" ${subOpen ? '' : 'disabled'}></div>
      <div class="hk-field"><label>Idea &amp; approach <small>what problem, how you solve it, tech used</small></label><textarea class="hk-textarea" name="idea" maxlength="4000" required style="min-height:130px" ${subOpen ? '' : 'disabled'}>${f('idea')}</textarea></div>
      ${stdInputsHtml ? `<div class="hk-grid2">${stdInputsHtml}</div>` : ''}
      ${customInputsHtml}
      <div id="subErr" class="hk-msg err hk-hidden"></div>
      ${subOpen ? `<button class="hk-btn primary" type="submit">${sub ? 'Update submission' : 'Submit to organiser'}</button>` : `<div class="hk-msg err"><i data-lucide="lock"></i><span>${reg.status === 'rejected' ? 'Submissions are not available for this registration.' : 'The submission window is closed.'}</span></div>`}
    </form></section>`;

  const team = `<section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="users-round"></i><h3>${reg.teamMode === 'solo' ? 'Solo entry' : esc(reg.teamName || 'Your team')}</h3></div>
    <div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(reg.name)}</b><span class="hk-sm hk-muted">Team leader · ${esc(reg.email)}</span></div></div>
    ${members.map(m => `<div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(m.name)}</b><span class="hk-sm hk-muted">${esc([m.email, m.college, m.course, m.year].filter(Boolean).join(' · ') || m.phone || 'Member')}</span></div></div>`).join('')}
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

  const showDriveHelp = (label, kind) => {
    C.modal(`How to share · ${label}`, `<div class="hk-stack">
      <div class="hk-msg ok"><i data-lucide="hard-drive-upload"></i><span>Upload your file to <b>Google Drive</b>${kind === 'video' ? ' (or YouTube as <b>Unlisted</b>)' : ''}, set access to <b>Anyone with the link</b>, and paste the URL here.</span></div>
      <ol style="margin:0;padding-left:20px;display:grid;gap:8px;font-size:.9rem">
        <li>Open <b>drive.google.com</b> and upload your ${kind === 'video' ? 'video (MP4/MOV)' : 'PPT / PDF / document'}.</li>
        <li>Click the three dots (<b>⋮</b>) on your uploaded file &rarr; choose <b>Share</b> &rarr; <b>Share</b>.</li>
        <li>Under <b>General access</b>, change <b>Restricted</b> to <b>Anyone with the link</b> (Viewer role is fine).</li>
        <li>Click <b>Copy link</b> and paste that <code>https://...</code> URL into the <b>${esc(label)}</b> box.</li>
      </ol>
      <div class="hk-hint">Tip: Test your copied link in an incognito/private browser window to verify judges and organisers can open it without requesting permission.</div>
    </div>`);
  };

  view.onclick = e => {
    const hb = e.target.closest('[data-drive-help]');
    if(hb){
      e.preventDefault();
      showDriveHelp(hb.dataset.helpLabel || 'Submission link', hb.dataset.driveHelp);
    }
  };

  const sf = $('#subForm');
  if(sf && subOpen) sf.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(sf).entries()), err = m => { const b = $('#subErr'); b.classList.toggle('hk-hidden', !m); b.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); };
    err('');
    for(const k of Object.keys(d)) d[k] = String(d[k]).trim();
    if(d.title.length < 3) return err('Add a project title.');
    if(d.idea.length < 30) return err('Describe your idea in a few sentences (at least 30 characters).');
    for(const x of stdFields){
      const val = d[x.key] || '';
      if(x.req && !val) return err(`${x.label} is required.`);
      if(val && !C.isUrl(val)) return err(`${x.label} must start with https://`);
    }
    const customAnswers = [];
    for(let i = 0; i < customSubFields.length; i++){
      const cf = customSubFields[i];
      const val = ($(`[data-sub-cf="${i}"]`, sf)?.value || '').trim();
      if(cf.required && !val) return err(`${cf.label} is required.`);
      if(val && cf.type === 'url' && !C.isUrl(val)) return err(`${cf.label} must start with https://`);
      if(val) customAnswers.push({ id: cf.id || ('sf_' + i), label: cf.label, type: cf.type || 'url', value: val });
    }
    const hasAnyStd = ['pptUrl', 'repoUrl', 'demoUrl', 'videoUrl', 'introVideoUrl', 'extraUrl'].some(k => !!d[k]);
    if(!hasAnyStd && !customAnswers.length) return err('Add at least one submission link or answer.');
    d.customAnswers = customAnswers;
    const btn = $('button[type=submit]', sf); btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
    try { await C.saveSubmission(h, S.user, reg, d); toast('Submitted to the organiser'); await dash(cx, hid); icons(); }
    catch(ex){ err(/permission|insufficient/i.test(ex.message) ? 'Submissions are closed or not allowed right now.' : ex.message); btn.disabled = false; btn.textContent = sub ? 'Update submission' : 'Submit to organiser'; }
  };
  const sb = $('[data-start]'); if(sb) sb.onclick = () => runTest(cx, h, meta, () => dash(cx, hid).then(icons));
  cx.S.cleanup = () => { stopTimer?.(); unsubReg?.(); view.onclick = null; };
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
