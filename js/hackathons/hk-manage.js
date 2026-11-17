// Organiser workspace for one hackathon: registrations, smart Mailer & Outreach, submissions, test, exports.
import * as C from './hk-core.js';
import * as M from './hk-mailer.js';
import { empty, statusBadge } from './hk-ui.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const STS = C.REG_STATUS;

export async function manage(cx, id){
  const { S, view } = cx;
  const h = await C.fetchOne(id, { fresh: true }); if(cx.stale()) return;
  if(!h || (!C.isHackHost(h, S.user) && !C.isStaff(S.site))){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Hackathon not found', 'You can only manage hackathons you host.', `<a class="hk-btn" href="${esc(cx.backHash || '#/host')}">Back to dashboard</a>`)}</div>`; return; }
  const hostUid = h.hostUid, rounds = C.roundsOf(h);
  let [regs, subs, atts, meta, serverMailLogs] = await Promise.all([
    C.hackathonRegistrations(id, hostUid),
    C.hackathonSubmissions(id, hostUid).catch(() => []),
    C.hackathonAttempts(id, hostUid).catch(() => []),
    C.getTestMeta(id),
    C.hackathonMailLogs(id, hostUid).catch(() => [])
  ]);
  if(cx.stale()) return;

  const org = {
    name: S.hk?.organiserName || S.hk?.displayName || h.organiser?.name || S.site?.displayName || 'The organiser',
    designation: S.hk?.designation || h.organiser?.designation || '',
    org: S.hk?.org || h.brandName || h.hostName || '',
    email: S.hk?.orgEmail || h.contactEmail || h.hostEmail || S.user?.email || '',
    phone: S.hk?.orgPhone || h.contactPhone || h.organiser?.phone || ''
  };
  const subOf = uid => subs.find(x => x.uid === uid), attOf = uid => atts.find(x => x.uid === uid);
  const sel = new Set(); let tab = 'regs', q = '', fs = '', fr = '';
  const ph = C.phase(h), roundName = i => rounds[i]?.name || (rounds.length ? 'Completed' : '—');
  const slug = (h.title || 'hackathon').replace(/[^\w]+/g, '-').toLowerCase();

  let localMail = M.loadLocalMailState(h.id);
  const getLogs = () => M.mergeMailLogs(serverMailLogs, localMail);

  // Persistent state for the Mailer tab
  const mailer = {
    kind: 'shortlisted',
    channel: 'platform', // 'platform' | 'gmail' | 'whatsapp'
    previewMode: 'email', // 'email' | 'whatsapp'
    roundName: rounds[0]?.name || '',
    scheduleText: '',
    meetLink: M.hackathonVenueText(h),
    customSubject: '',
    note: '',
    quickQ: '',
    recSearch: '',
    recKind: 'all',
    recChannel: 'all',
    showPaste: false,
    queue: [] // [{ qid, regId, uid, name, email, phone, teamName, status, channel, source, sent, sentCount }]
  };

  function defaultScheduleForKind(kind, rName){
    if(kind === 'test_reminder' && meta?.endMs){
      return `${meta.startMs ? C.fmtDT(meta.startMs) + ' to ' : 'Closes '}${C.fmtDT(meta.endMs)}`;
    }
    if(kind === 'submission_reminder' && h.submission?.deadlineMs){
      return `Before ${C.fmtDT(h.submission.deadlineMs)}`;
    }
    const rd = rounds.find(x => x.name === rName);
    if(rd?.startMs){
      return `${C.fmtDT(rd.startMs)}${rd.endMs ? ' – ' + C.fmtDT(rd.endMs) : ''}`;
    }
    return '';
  }

  async function markRegSentLocally(reg, kind, channel, mail, note, roundVal){
    const now = Date.now();
    if(reg){
      reg.lastMailAtMs = now;
      reg.lastMailKind = kind;
      reg.mailSent = { ...(reg.mailSent || {}), [kind]: true, [`${kind}AtMs`]: now };
    }
    localMail = M.recordLocalMailSent(h.id, {
      registrationId: reg?.id || '',
      to: reg?.email || '',
      toName: reg?.name || '',
      phone: reg?.phone || '',
      teamName: reg?.teamName || '',
      kind,
      roundName: roundVal || '',
      subject: mail.subject,
      body: mail.body,
      note: note || '',
      channel,
      byName: org.name,
      createdAtMs: now
    });
    if(reg && channel !== 'platform'){
      // Also push in-app notification & gracefully persist mailSent timestamp on registration
      if(reg.uid){
        C.notify({
          toUid: reg.uid,
          fromUid: S.user.uid,
          hackathonId: h.id,
          type: 'status',
          title: mail.subject,
          body: note ? note.slice(0, 160) : `${M.TPL_BY_KEY[kind]?.label || 'Update'} sent to your team.`
        }).catch(() => {});
      }
      C.updateRegistration(reg.id, {
        lastMailAtMs: now,
        lastMailKind: kind,
        mailSent: reg.mailSent
      }).catch(() => {});
    }
  }

  async function sendOne(targetReg, opts){
    const { kind, note, roundVal, scheduleText, meetLink, customSubject, channel } = opts;
    const regObj = targetReg.reg || regs.find(x => x.id === targetReg.id || x.id === targetReg.regId) || targetReg;
    const mail = M.buildHackathonEmail(kind, {
      hackathon: h,
      hackathonId: h.id,
      reg: regObj,
      round: roundVal,
      note,
      scheduleText,
      meetLink,
      customSubject,
      org,
      testMeta: meta,
      att: regObj.uid ? attOf(regObj.uid) : null,
      sub: regObj.uid ? subOf(regObj.uid) : null
    });

    if(channel === 'whatsapp'){
      const ph = regObj.phone || targetReg.phone || '';
      if(!M.openWhatsAppClient(ph, mail.whatsappText)){
        throw new Error(`No valid 10-digit phone number for ${regObj.name || 'this participant'}.`);
      }
      await markRegSentLocally(regObj.id ? regObj : null, kind, 'whatsapp', mail, note, roundVal);
      if(!regObj.id){
        localMail = M.recordLocalMailSent(h.id, { to: '', toName: targetReg.name, phone: ph, kind, roundName: roundVal, subject: mail.subject, body: mail.body, note, channel: 'whatsapp', byName: org.name });
      }
      return { ok: true, mode: 'whatsapp', mail };
    }

    if(channel === 'gmail'){
      const em = regObj.email || targetReg.email || '';
      if(!em || !em.includes('@')) throw new Error(`No valid email address for ${regObj.name || 'this participant'}.`);
      M.openMailClient(em, mail.subject, mail.body);
      await markRegSentLocally(regObj.id ? regObj : null, kind, 'gmail', mail, note, roundVal);
      if(!regObj.id){
        localMail = M.recordLocalMailSent(h.id, { to: em, toName: targetReg.name, phone: targetReg.phone || '', kind, roundName: roundVal, subject: mail.subject, body: mail.body, note, channel: 'gmail', byName: org.name });
      }
      return { ok: true, mode: 'gmail', mail };
    }

    // Platform auto-email via Cloud Function
    if(!regObj.id) throw new Error('Platform auto-email works for registered teams. Switch this external recipient to Gmail or WhatsApp.');
    await C.notifyTeam(regObj.id, kind, note, roundVal, { scheduleText, meetLink, customSubject });
    await markRegSentLocally(regObj, kind, 'platform', mail, note, roundVal);
    return { ok: true, mode: 'platform', mail };
  }

  const filtered = () => regs.filter(r => (!fs || r.status === fs) && (fr === '' || (r.stage || 0) === +fr) && (!q || [r.name, r.email, r.phone, r.college, r.teamName, ...(r.members || []).map(m => m.name)].join(' ').toLowerCase().includes(q)));
  const mailBtn = r => {
    const sent = M.isMailSent(r, null, localMail);
    const lastTs = M.lastMailTimestamp(r, null, localMail);
    const kindLbl = C.MAIL_KINDS[r.lastMailKind] || 'email';
    return sent
      ? `<button class="hk-mailbtn sent" data-mail="${esc(r.id)}" title="Sent: ${esc(kindLbl)}${lastTs ? ' · ' + C.ago(lastTs) : ''} (click to mail again)" aria-label="Mail sent"><i data-lucide="check-circle-2"></i><span>Sent</span></button>`
      : `<button class="hk-mailbtn" data-mail="${esc(r.id)}" title="Open smart email composer" aria-label="Notify team"><i data-lucide="mail"></i><span>Mail</span></button>`;
  };

  const row = r => { const s = subOf(r.uid), a = attOf(r.uid); return `<tr class="${sel.has(r.id) ? 'sel' : ''}">
    <td><input type="checkbox" data-sel="${esc(r.id)}" ${sel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}"></td>
    <td><button type="button" data-prof="${esc(r.id)}" style="background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer"><b style="text-decoration:underline;text-underline-offset:2px">${esc(r.name)}</b></button><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td>
    <td>${r.teamMode === 'solo' ? '<span class="hk-chip neutral">Solo</span>' : `<b>${esc(r.teamName || 'Team')}</b><div class="hk-xs hk-muted">${(r.members || []).length + 1} members</div>`}</td>
    <td>${esc(r.college)}<div class="hk-xs hk-muted">${esc(r.year || '')}</div></td>
    <td><select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Round">${(rounds.length ? rounds : [{ name: 'Registered' }]).map((x, i) => `<option value="${i}" ${(r.stage || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
    <td><select class="hk-select sm" data-st="${esc(r.id)}" aria-label="Status">${STS.map(x => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="hk-xs">${s ? `<span class="hk-chip">${s.score != null ? 'Score ' + esc(s.score) : 'Submitted'}</span>` : '<span class="hk-muted">—</span>'}${a?.submittedAtMs ? `<div class="hk-muted" style="margin-top:4px">Test ${a.score}/${a.total}</div>` : ''}</td>
    <td class="act" style="text-align:right;white-space:nowrap"><button type="button" class="hk-btn sm" data-prof="${esc(r.id)}" title="View full applicant profile"><i data-lucide="user-round"></i>Profile</button> ${mailBtn(r)}</td></tr>`; };

  const regsTab = () => { const l = filtered(); return `
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="rq" value="${esc(q)}" placeholder="Search name, email, college, team…"></div>
      <select class="hk-select" id="fs" style="width:auto;min-height:46px"><option value="">All statuses</option>${STS.map(x => `<option ${x === fs ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select" id="fr" style="width:auto;min-height:46px"><option value="">All rounds</option>${rounds.map((x, i) => `<option value="${i}" ${fr !== '' && +fr === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
    <div class="hk-bulk ${sel.size ? 'on' : ''}"><b>${sel.size} selected</b>
      <select class="hk-select sm" id="bSt"><option value="">Set status…</option>${STS.map(x => `<option>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select sm" id="bRd"><option value="">Move to round…</option>${rounds.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
      <button class="hk-btn sm" data-bulkmail><i data-lucide="mail"></i>Compose email (${sel.size})</button>
      <button class="hk-btn sm" data-bulkqueue><i data-lucide="list-plus"></i>Load into Mailer</button></div>
    ${l.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th><input type="checkbox" id="selAll" aria-label="Select all"></th><th>Team leader</th><th>Team</th><th>College</th><th>Round</th><th>Status</th><th>Work</th><th class="act" style="text-align:right">Profile &amp; mail</th></tr></thead><tbody id="rb">${l.map(row).join('')}</tbody></table></div>` : empty('users', regs.length ? 'No matches' : 'No registrations yet', regs.length ? 'Try clearing the filters.' : 'Registrations appear here as soon as teams sign up. Share your hackathon link to get started.', regs.length ? '' : '<button class="hk-btn gold" data-share>Copy link</button>')}`; };

  const link = (u, l) => C.safeUrl(u) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${esc(l)}</a>` : '';
  const subCustomHtml = s => (s.customAnswers || []).filter(a => a && a.value).map(a => C.isUrl(a.value) ? link(a.value, a.label || 'Link') : `<span class="hk-chip neutral">${esc(a.label)}: ${esc(a.value)}</span>`).join('');
  const subsTab = () => subs.length ? `<div class="hk-stack">${subs.map(s => `<div class="hk-card-s" data-sub="${esc(s.id)}"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(s.title)}</b><div class="hk-sm hk-muted">${esc(s.teamName || s.leaderName)} · ${C.ago(s.updatedAtMs)}</div></div>${s.reviewStatus === 'reviewed' ? '<span class="hk-chip">Reviewed</span>' : '<span class="hk-chip warn">To review</span>'}</div>
      <p class="hk-sm" style="margin:10px 0;white-space:pre-wrap">${esc(s.idea)}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${link(s.pptUrl, 'PPT')}${link(s.repoUrl, 'Repo')}${link(s.demoUrl, 'Demo')}${link(s.videoUrl, 'Prototype Video')}${link(s.introVideoUrl, 'Intro Video')}${link(s.extraUrl, 'Other')}${subCustomHtml(s)}</div>
      <div class="hk-grid2" style="margin-top:12px;grid-template-columns:110px 1fr"><input class="hk-input" type="number" min="0" max="100" placeholder="Score" data-score value="${s.score ?? ''}"><input class="hk-input" placeholder="Feedback for the team" data-fb maxlength="500" value="${esc(s.feedback || '')}"></div>
      <button class="hk-btn sm primary" style="margin-top:10px" data-review="${esc(s.id)}">Save review</button></div>`).join('')}</div>` : empty('lightbulb', 'No submissions yet', h.submission?.open === false ? 'Project submissions are switched off for this hackathon.' : 'Teams submit ideas, project links and PPT links from their dashboard.');

  const testTab = () => { const done = atts.filter(a => a.submittedAtMs).sort((a, b) => (b.score || 0) - (a.score || 0));
    return `<div class="hk-card-s" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><div><b>${meta ? esc(meta.title) : 'No screening test yet'}</b><div class="hk-sm hk-muted">${meta ? `${meta.count} questions · ${meta.durationMin} min · ${meta.total} marks${meta.endMs ? ' · closes ' + C.fmtDT(meta.endMs) : ''}` : 'Create a timed MCQ test. Answers are graded on the server.'}</div></div><div style="display:flex;gap:8px">${meta ? '<button class="hk-btn sm danger" data-rmtest>Remove</button>' : ''}<button class="hk-btn sm gold" data-test>${meta ? 'Edit test' : 'Create test'}</button></div></div>
    ${meta ? `<div class="hk-sec"><h2><i data-lucide="trophy"></i>Results · ${done.length} of ${regs.length} attempted</h2></div>${done.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th>#</th><th>Team leader</th><th>Score</th><th>Submitted</th></tr></thead><tbody>${done.map((a, i) => { const r = regs.find(x => x.uid === a.uid); return `<tr><td>${i + 1}</td><td><b>${esc(r?.name || a.uid)}</b><div class="hk-xs hk-muted">${esc(r?.teamName || '')}</div></td><td><b>${a.score}</b> / ${a.total}</td><td>${C.fmtDT(a.submittedAtMs)}</td></tr>`; }).join('')}</tbody></table></div>` : empty('clipboard-check', 'No attempts yet', 'Scores appear here once teams submit.')}` : ''}`; };

  /* ---------- Mailer & Outreach Tab (inspired by Role Mailer) ---------- */
  function queueAddRegs(list, defaultChannel = mailer.channel){
    let added = 0;
    for(const r of list){
      const em = (r.email || '').trim().toLowerCase();
      const ph = (r.phone || '').replace(/\D/g, '').slice(-10);
      if(!em && !ph) continue;
      if(mailer.queue.some(q => (r.id && q.regId === r.id) || (em && q.email.toLowerCase() === em) || (ph.length === 10 && q.phone.replace(/\D/g, '').slice(-10) === ph))){
        continue;
      }
      const ch = defaultChannel === 'platform' && !r.id ? (em ? 'gmail' : 'whatsapp') : defaultChannel;
      const alreadySent = r.id ? M.isMailSent(r, mailer.kind, localMail) : !!localMail.sentMap?.[`email:${em}:${mailer.kind}`];
      mailer.queue.push({
        qid: `mq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        regId: r.id || '',
        uid: r.uid || '',
        reg: r.id ? r : null,
        name: r.name || (em ? em.split('@')[0] : ph),
        email: r.email || '',
        phone: r.phone || '',
        teamName: r.teamName || '',
        status: r.status || 'guest',
        channel: ch,
        source: r.source || (r.id ? 'Registered' : 'Manual'),
        sent: alreadySent,
        sentCount: alreadySent ? 1 : 0
      });
      added++;
    }
    return added;
  }

  function syncQueueSentFlags(){
    mailer.queue.forEach(item => {
      const reg = item.regId ? regs.find(r => r.id === item.regId) : null;
      const em = (item.email || '').trim().toLowerCase();
      item.sent = reg ? M.isMailSent(reg, mailer.kind, localMail) : !!localMail.sentMap?.[`email:${em}:${mailer.kind}`];
    });
  }

  function getMailerPreviewData(){
    const first = mailer.queue.find(x => !x.sent) || mailer.queue[0] || regs[0] || { name: 'Team Leader', email: 'team@example.com', teamMode: 'team', teamName: 'Alpha Builders' };
    const regObj = first.reg || (first.regId ? regs.find(r => r.id === first.regId) : first) || first;
    return M.buildHackathonEmail(mailer.kind, {
      hackathon: h,
      hackathonId: h.id,
      reg: regObj,
      round: mailer.roundName,
      note: mailer.note,
      scheduleText: mailer.scheduleText || defaultScheduleForKind(mailer.kind, mailer.roundName),
      meetLink: mailer.meetLink,
      customSubject: mailer.customSubject,
      org,
      testMeta: meta,
      att: regObj?.uid ? attOf(regObj.uid) : null,
      sub: regObj?.uid ? subOf(regObj.uid) : null
    });
  }

  function mailTab(){
    syncQueueSentFlags();
    const pendTest = regs.filter(r => r.status !== 'rejected' && meta && !attOf(r.uid)?.submittedAtMs);
    const pendSub = regs.filter(r => r.status !== 'rejected' && h.submission?.open !== false && !subOf(r.uid));
    const shortlisted = regs.filter(r => r.status === 'shortlisted');
    const selected = regs.filter(r => r.status === 'selected');
    const unmailed = regs.filter(r => !M.isMailSent(r, null, localMail));
    const tplMeta = M.TPL_BY_KEY[mailer.kind] || M.MAIL_TPLS[0];
    const quickMatches = regs.filter(r => !mailer.quickQ || [r.name, r.email, r.phone, r.teamName, r.college].join(' ').toLowerCase().includes(mailer.quickQ)).slice(0, 10);
    const prev = getMailerPreviewData();
    const sentInQ = mailer.queue.filter(x => x.sent).length;
    const logs = getLogs();
    const recQ = mailer.recSearch.toLowerCase();
    const recList = logs.filter(l =>
      (mailer.recKind === 'all' || l.kind === mailer.recKind) &&
      (mailer.recChannel === 'all' || (l.channel || 'platform') === mailer.recChannel) &&
      (!recQ || [l.to, l.toName, l.phone, l.teamName, l.subject, l.note].join(' ').toLowerCase().includes(recQ))
    );

    return `<div class="hk-stack">
      <div class="hk-card-s hk-mailpanel">
        <div class="hk-mailpanel-head">
          <div><b><i data-lucide="send"></i>Smart Team Mailer &amp; Outreach</b><div class="hk-sm hk-muted">Auto-generated structured emails for every hackathon stage, with optional custom note, live preview &amp; multi-channel sending.</div></div>
          <div class="hk-chseg" role="group" aria-label="Default dispatch channel">
            <button type="button" class="${mailer.channel === 'platform' ? 'on' : ''}" data-mch="platform"><i data-lucide="sparkles"></i>Auto Email</button>
            <button type="button" class="${mailer.channel === 'gmail' ? 'on' : ''}" data-mch="gmail"><i data-lucide="mail"></i>Gmail / Mail</button>
            <button type="button" class="${mailer.channel === 'whatsapp' ? 'on wa' : ''}" data-mch="whatsapp"><i data-lucide="message-circle"></i>WhatsApp</button>
          </div>
        </div>

        <label class="hk-eyebrow" style="display:block;margin-top:4px">1. Choose Auto-Generated Template</label>
        <div class="hk-tplgrid" id="mtGrid">
          ${M.MAIL_TPLS.map(t => `<button type="button" class="hk-tpl ${mailer.kind === t.key ? 'on' : ''}" data-mtpl="${t.key}">
            <i data-lucide="${t.icon}"></i>
            <span class="hk-tpl-meta"><b>${esc(t.label)}</b><small>${esc(t.desc)}</small></span>
          </button>`).join('')}
        </div>

        <div class="hk-grid2" style="margin-top:4px">
          ${tplMeta.supportsRound ? `<div class="hk-field"><label>Round / Stage</label>${rounds.length
            ? `<select class="hk-select" id="mtRound">${rounds.map(r => `<option value="${esc(r.name)}" ${mailer.roundName === r.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`
            : `<input class="hk-input" id="mtRound" value="${esc(mailer.roundName)}" placeholder="e.g. Idea Round / Final Presentation">`}</div>` : ''}
          ${tplMeta.supportsSchedule ? `<div class="hk-field"><label>Schedule / Timing <small>auto-filled or custom</small></label><input class="hk-input" id="mtSched" value="${esc(mailer.scheduleText)}" placeholder="${esc(defaultScheduleForKind(mailer.kind, mailer.roundName) || 'e.g. 20 Nov, 10:00 AM IST')}"></div>` : ''}
          <div class="hk-field"><label>Venue / Google Meet Link <small>optional</small></label><input class="hk-input" id="mtMeet" value="${esc(mailer.meetLink)}" placeholder="e.g. https://meet.google.com/... or Room 204"></div>
          <div class="hk-field"><label>Subject Override <small>leave blank to auto-generate</small></label><input class="hk-input" id="mtSubj" value="${esc(mailer.customSubject)}" placeholder="${esc(prev.subject)}"></div>
        </div>

        <div class="hk-field">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <label style="margin:0">Custom Note / Organiser Instructions <small>optional · updates preview live</small></label>
            <div class="hk-sniprow">${M.QUICK_NOTE_SNIPPETS.map((s, i) => `<button type="button" class="hk-snip" data-snip="${i}" title="${esc(s)}">+ ${esc(s.slice(0, 26))}…</button>`).join('')}</div>
          </div>
          <textarea class="hk-textarea" id="mtNote" maxlength="1200" style="min-height:84px" placeholder="Add any custom note, reporting desk details, evaluation feedback, or reminder to inject into the email…">${esc(mailer.note)}</textarea>
        </div>

        <div class="hk-quickbox">
          <div class="hk-quickhead">
            <b>2. Build Recipient Send List</b>
            <div class="hk-quickloads">
              ${meta ? `<button type="button" class="hk-btn sm" data-qload="pend_test"><i data-lucide="clipboard-check"></i>+ Pending Test (${pendTest.length})</button>` : ''}
              <button type="button" class="hk-btn sm" data-qload="pend_sub"><i data-lucide="lightbulb"></i>+ No Submission (${pendSub.length})</button>
              <button type="button" class="hk-btn sm" data-qload="shortlisted"><i data-lucide="sparkles"></i>+ Shortlisted (${shortlisted.length})</button>
              <button type="button" class="hk-btn sm" data-qload="selected"><i data-lucide="trophy"></i>+ Selected (${selected.length})</button>
              <button type="button" class="hk-btn sm" data-qload="unmailed"><i data-lucide="mail-plus"></i>+ Not Emailed (${unmailed.length})</button>
              <button type="button" class="hk-btn sm" data-qload="all"><i data-lucide="users"></i>+ All Teams (${regs.length})</button>
            </div>
          </div>
          <div class="hk-quicksearch">
            <div class="hk-search" style="flex:1;min-width:220px"><i data-lucide="search"></i><input class="hk-input" id="mqSearch" value="${esc(mailer.quickQ)}" placeholder="Search team leader, Gmail, phone, college to add…"></div>
            <button type="button" class="hk-btn sm" data-togglepaste><i data-lucide="clipboard-paste"></i>Paste Emails / Phones</button>
            <label class="hk-btn sm" style="cursor:pointer"><i data-lucide="upload"></i>Upload CSV / TXT<input type="file" id="mqCsv" accept=".csv,.txt,.json,.tsv" style="display:none"></label>
          </div>
          ${quickMatches.length ? `<div class="hk-pickchips">${quickMatches.map(r => `<button type="button" class="hk-pickchip" data-qadd="${esc(r.id)}"><b>${esc(r.name)}</b><span>${esc(r.teamName || r.email)}</span><i data-lucide="plus"></i></button>`).join('')}</div>` : `<div class="hk-xs hk-muted" style="margin-top:6px">No registered teams match "${esc(mailer.quickQ)}".</div>`}
          ${mailer.showPaste ? `<div class="hk-pastebox">
            <label class="hk-sm" style="font-weight:700">Paste comma-separated emails, phones, CSV lines, or JSON</label>
            <textarea class="hk-textarea" id="mqPasteTxt" style="min-height:76px" placeholder="Rahul Sharma, rahul@gmail.com, 9876543210&#10;priya@college.edu"></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="hk-btn sm ghost" data-togglepaste>Close</button><button type="button" class="hk-btn sm primary" data-analyze>Analyze &amp; Add to List</button></div>
          </div>` : ''}
        </div>

        ${mailer.queue.length ? `<div class="hk-mailq">
          <div class="hk-mailq-head">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <b>Recipient Send Queue (${sentInQ}/${mailer.queue.length} Sent ✓)</b>
              <span class="hk-chip ${sentInQ === mailer.queue.length ? '' : 'warn'}">${mailer.queue.length - sentInQ} pending</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <button type="button" class="hk-btn sm ${mailer.queue.every(x => !x.sent) ? '' : ''}" data-qallch="platform">All Auto</button>
              <button type="button" class="hk-btn sm" data-qallch="gmail">All Gmail</button>
              <button type="button" class="hk-btn sm" data-qallch="whatsapp">All WhatsApp</button>
              <button type="button" class="hk-btn sm ${mailer.queue.some(x => !x.sent) ? 'primary' : 'gold'}" data-qsendnext><i data-lucide="${mailer.queue.every(x => x.sent) ? 'check-circle-2' : 'send'}"></i>${mailer.queue.every(x => x.sent) ? `All ${mailer.queue.length} Sent ✓` : `Send Next (${mailer.queue.length - sentInQ} left)`}</button>
              <button type="button" class="hk-btn sm gold" data-qsendall><i data-lucide="zap"></i>Send All Pending</button>
              <button type="button" class="hk-btn sm" data-qclearsent>Clear Sent</button>
              <button type="button" class="hk-btn sm danger" data-qclearall>Clear All</button>
            </div>
          </div>
          <div class="hk-mailq-list">
            ${mailer.queue.map((item, idx) => `<div class="hk-qrow ${item.sent ? 'sent' : ''}">
              <div class="hk-qrow-main">
                <span class="hk-qidx">${item.sent ? '✓' : `#${idx + 1}`}</span>
                <div class="hk-qwho">
                  <b>${esc(item.name)}</b>${item.teamName ? ` <span class="hk-chip neutral">${esc(item.teamName)}</span>` : ''}
                  <div class="hk-xs hk-muted">${esc(item.email || 'no email')}${item.phone ? ' · ' + esc(item.phone) : ''} · ${esc(item.source)}</div>
                </div>
              </div>
              <div class="hk-qrow-acts">
                <select class="hk-select sm" data-qch="${esc(item.qid)}" aria-label="Delivery channel">
                  ${item.regId ? `<option value="platform" ${item.channel === 'platform' ? 'selected' : ''}>⚡ Auto Email</option>` : ''}
                  <option value="gmail" ${item.channel === 'gmail' ? 'selected' : ''}>✉️ Gmail / Mail</option>
                  <option value="whatsapp" ${item.channel === 'whatsapp' ? 'selected' : ''}>💬 WhatsApp</option>
                </select>
                <button type="button" class="hk-mailbtn ${item.sent ? 'sent' : 'ready'}" data-qsend="${esc(item.qid)}">
                  <i data-lucide="${item.sent ? 'check-circle-2' : (item.channel === 'whatsapp' ? 'message-circle' : 'send')}"></i>
                  <span>${item.sent ? 'Mail Sent ✓' : (item.channel === 'whatsapp' ? 'Send WhatsApp' : 'Send Mail')}</span>
                </button>
                <button type="button" class="hk-btn icon sm ghost" data-qrm="${esc(item.qid)}" aria-label="Remove from queue"><i data-lucide="x"></i></button>
              </div>
            </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="hk-mailprev" style="margin-top:8px">
          <div class="mh" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div>
              <small style="opacity:.8;letter-spacing:.1em;text-transform:uppercase;display:block;font-size:.68rem">Live ${mailer.previewMode === 'whatsapp' ? 'WhatsApp Message' : 'Email'} Preview</small>
              <span id="mtPrevSubj">${esc(prev.subject)}</span>
            </div>
            <div style="display:flex;gap:6px">
              <button type="button" class="hk-btn sm" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35);color:#fff" data-mprev="${mailer.previewMode === 'whatsapp' ? 'email' : 'whatsapp'}">${mailer.previewMode === 'whatsapp' ? 'View Email Format' : 'View WhatsApp Format'}</button>
              <button type="button" class="hk-btn sm" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35);color:#fff" data-mcopy><i data-lucide="copy"></i>Copy</button>
            </div>
          </div>
          <pre class="mb hk-mailpre" id="mtPrevBody">${esc(mailer.previewMode === 'whatsapp' ? prev.whatsappText : prev.body)}</pre>
          <div class="ms hk-xs">From: <b>team@campusconnectone.online</b> (Auto) or your Gmail · Replies to: <b>${esc(org.email || 'host email')}</b> · Auto-includes portal links &amp; team context.</div>
        </div>
      </div>

      <div class="hk-card-s">
        <div class="hk-quickhead" style="margin-bottom:10px">
          <div><b><i data-lucide="history"></i>Sent Mails &amp; Messages History</b> <span class="hk-chip">${logs.length} sent</span></div>
          <span class="hk-xs hk-muted">Showing ${recList.length} of ${logs.length}</span>
        </div>
        <div class="hk-toolbar" style="margin-bottom:12px">
          <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="recSearch" value="${esc(mailer.recSearch)}" placeholder="Search recipient name, Gmail, phone, subject or note…"></div>
          <select class="hk-select" id="recKind" style="width:auto;min-height:44px"><option value="all">All templates</option>${M.MAIL_TPLS.map(t => `<option value="${t.key}" ${mailer.recKind === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
          <select class="hk-select" id="recChan" style="width:auto;min-height:44px"><option value="all">All channels</option><option value="platform" ${mailer.recChannel === 'platform' ? 'selected' : ''}>Platform Auto-Email</option><option value="gmail" ${mailer.recChannel === 'gmail' ? 'selected' : ''}>Gmail / Mail App</option><option value="whatsapp" ${mailer.recChannel === 'whatsapp' ? 'selected' : ''}>WhatsApp</option></select>
        </div>
        ${recList.length ? `<div class="hk-stack" style="gap:8px">${recList.slice(0, 60).map(l => {
          const tMeta = M.TPL_BY_KEY[l.kind] || { short: l.kind || 'Update' };
          const chBadge = l.channel === 'whatsapp'
            ? '<span class="hk-chip"><i data-lucide="message-circle"></i>WhatsApp</span>'
            : (l.channel === 'gmail' ? '<span class="hk-chip neutral"><i data-lucide="mail"></i>Gmail</span>' : '<span class="hk-chip gold"><i data-lucide="sparkles"></i>Auto Email</span>');
          return `<div class="hk-lrow" style="align-items:center">
            <div style="min-width:0;flex:1">
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${chBadge}<span class="hk-chip neutral">${esc(tMeta.short)}</span><b>${esc(l.toName || l.to || l.phone || 'Team')}</b>${l.teamName ? `<span class="hk-xs hk-muted">(${esc(l.teamName)})</span>` : ''}</div>
              <div class="hk-xs hk-muted" style="margin-top:4px;overflow-wrap:anywhere">${esc(l.to || l.phone)} · ${esc(l.subject || '')}</div>
              <div class="hk-xs hk-muted" style="margin-top:2px">Sent ${C.fmtDT(l.createdAtMs)}${l.roundName ? ` · Round: ${esc(l.roundName)}` : ''}${l.note ? ` · Note: "${esc(l.note.slice(0, 80))}${l.note.length > 80 ? '…' : ''}"` : ''}</div>
            </div>
            <button type="button" class="hk-mailbtn sent" data-resend="${esc(l.id)}"><i data-lucide="check-circle-2"></i><span>Send Again</span></button>
          </div>`;
        }).join('')}</div>` : empty('mail', logs.length ? 'No matching sent records' : 'No mails sent yet', logs.length ? 'Try clearing the search or filter.' : 'Emails & WhatsApp updates you send to teams appear here with timestamps and 1-tap resend.')}
      </div>
    </div>`;
  }

  const updateMailerPreviewDom = () => {
    const prev = getMailerPreviewData();
    const sEl = $('#mtPrevSubj'), bEl = $('#mtPrevBody');
    if(sEl) sEl.textContent = prev.subject;
    if(bEl) bEl.textContent = mailer.previewMode === 'whatsapp' ? prev.whatsappText : prev.body;
  };

  const setTab = t => { tab = t; paint(); };
  const paint = () => {
    const closed = h.registrationClosed, mailed = regs.filter(r => M.isMailSent(r, null, localMail)).length;
    view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="${esc(cx.backHash || '#/host')}" style="margin-bottom:10px"><i data-lucide="arrow-left"></i>${cx.backLabel || 'Dashboard'}</a>
      <div class="hk-page-h"><div><span class="hk-eyebrow" style="color:var(--hk-gold)">Manage</span><h1>${esc(h.title)}</h1><p>${statusBadge(h.status)} <span class="hk-chip ${ph.tone}">${ph.label}</span></p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${cx.viewHref ? `<a class="hk-btn" href="${esc(cx.viewHref)}"><i data-lucide="eye"></i>View page</a>` : `<a class="hk-btn" href="#/h/${h.id}"><i data-lucide="eye"></i>View page</a>`}<button class="hk-btn" data-announce><i data-lucide="megaphone"></i>Announce</button><button class="hk-btn" data-csv><i data-lucide="file-spreadsheet"></i>CSV</button><button class="hk-btn primary" data-pdf><i data-lucide="file-down"></i>PDF</button></div></div>
      <div class="hk-kpis"><div class="hk-kpi"><div class="ki"><i data-lucide="users"></i></div><strong>${regs.length}</strong><span>Registrations${h.maxParticipants ? ` / ${h.maxParticipants}` : ''}</span></div>
        <div class="hk-kpi g"><div class="ki"><i data-lucide="user-check"></i></div><strong>${regs.filter(r => ['shortlisted', 'selected'].includes(r.status)).length}</strong><span>Shortlisted / selected</span></div>
        <div class="hk-kpi c"><div class="ki"><i data-lucide="lightbulb"></i></div><strong>${subs.length}</strong><span>Submissions</span></div>
        <div class="hk-kpi s"><div class="ki"><i data-lucide="mail-check"></i></div><strong>${mailed}</strong><span>Teams emailed</span></div></div>
      <div class="hk-card-s" style="margin:14px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div><b>Registration is ${closed ? 'closed' : 'open'}</b><div class="hk-sm hk-muted">${h.regDeadlineMs ? 'Deadline ' + C.fmtDT(h.regDeadlineMs) + '. ' : ''}Automatic emails are <b>${h.autoEmail === false ? 'off' : 'on'}</b>.</div></div><button class="hk-btn sm ${closed ? 'primary' : ''}" data-toggle>${closed ? 'Reopen registration' : 'End registration now'}</button></div>
      <div class="hk-tabs" role="tablist">${[['regs', 'users', `Registrations (${regs.length})`], ['mail', 'mail', `Mailer & Outreach`], ['subs', 'lightbulb', `Submissions (${subs.length})`], ['test', 'clipboard-check', 'Test']].map(([k, ic, l]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}" role="tab"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
      <div id="tabBody">${tab === 'regs' ? regsTab() : tab === 'mail' ? mailTab() : tab === 'subs' ? subsTab() : testTab()}</div></div>`;
    icons();
  };
  const redrawRows = () => {
    const b = $('#tabBody');
    if(!b) return;
    if(tab === 'regs' || tab === 'mail'){
      const k = document.activeElement?.id, pos = document.activeElement?.selectionStart;
      b.innerHTML = tab === 'regs' ? regsTab() : mailTab();
      icons();
      if(k){ const el = $('#' + k); el?.focus(); try { el.setSelectionRange(pos, pos); } catch {} }
    }
  };

  /* ---------- Smart Email Composer Modal (row / profile / bulk) ---------- */
  function compose(targets, presetKind = ''){
    const one = targets.length === 1 ? targets[0] : null;
    const def = presetKind || (one
      ? M.autoSuggestMailKind(one, { hasTest: !!meta, att: attOf(one.uid), sub: subOf(one.uid), hackathon: h })
      : 'shortlisted');
    const curRound = one ? (rounds[one.stage || 0]?.name || rounds[0]?.name || '') : (rounds[0]?.name || '');

    modal(one ? `Email Team · ${one.teamName || one.name}` : `Email ${targets.length} Team Leaders`, `<form class="hk-form" id="mf">
      <div class="hk-to">
        <div class="av">${esc((one?.name || `${targets.length}`).slice(0, 2).toUpperCase())}</div>
        <div style="min-width:0;flex:1">
          <b>${one ? esc(one.name) + (one.teamName ? ` · Team ${esc(one.teamName)}` : '') : `${targets.length} selected team leaders`}</b>
          <div class="hk-xs hk-muted" style="overflow-wrap:anywhere">${one ? `${esc(one.email)}${one.phone ? ' · ' + esc(one.phone) : ''}` : targets.slice(0, 4).map(x => esc(x.name)).join(', ') + (targets.length > 4 ? ` +${targets.length - 4} more` : '')}</div>
        </div>
        ${one ? `<span class="hk-chip ${one.status === 'selected' ? 'gold' : one.status === 'rejected' ? 'bad' : ''}">${esc(one.status)}</span>` : ''}
      </div>

      <div class="hk-field">
        <label>Template <small id="tplSentBadge"></small></label>
        <div class="hk-tplgrid" id="cmTpls">
          ${M.MAIL_TPLS.map(t => `<button type="button" class="hk-tpl ${t.key === def ? 'on' : ''}" data-ckind="${t.key}">
            <i data-lucide="${t.icon}"></i>
            <span class="hk-tpl-meta"><b>${esc(t.label)}</b><small>${esc(t.short)}</small></span>
          </button>`).join('')}
        </div>
        <input type="hidden" name="kind" id="mk" value="${esc(def)}">
      </div>

      <div class="hk-grid2">
        <div class="hk-field ${M.TPL_BY_KEY[def]?.supportsRound ? '' : 'hk-hidden'}" id="rdWrap">
          <label>Round / Stage</label>
          ${rounds.length
            ? `<select class="hk-select" name="roundName" id="mRd">${rounds.map(x => `<option value="${esc(x.name)}" ${x.name === curRound ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`
            : `<input class="hk-input" name="roundName" id="mRd" value="${esc(curRound)}" placeholder="e.g. Round 2 / Finals">`}
        </div>
        <div class="hk-field ${M.TPL_BY_KEY[def]?.supportsSchedule ? '' : 'hk-hidden'}" id="scWrap">
          <label>Schedule / Timing <small>optional</small></label>
          <input class="hk-input" name="scheduleText" id="mSc" value="${esc(defaultScheduleForKind(def, curRound))}" placeholder="e.g. 21 Nov, 10:00 AM IST">
        </div>
      </div>

      <div class="hk-grid2">
        <div class="hk-field">
          <label>Venue / Google Meet Link <small>optional</small></label>
          <input class="hk-input" name="meetLink" id="mMeet" value="${esc(M.hackathonVenueText(h))}" placeholder="https://meet.google.com/... or Hall A">
        </div>
        <div class="hk-field">
          <label>Subject Override <small>leave blank to auto-generate</small></label>
          <input class="hk-input" name="customSubject" id="mSubj" maxlength="140" placeholder="Auto-generated from template &amp; hackathon">
        </div>
      </div>

      <div class="hk-field">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="margin:0">Note / Instructions for Team <small id="noteHint">optional</small></label>
          <div class="hk-sniprow">${M.QUICK_NOTE_SNIPPETS.slice(0, 3).map((s, i) => `<button type="button" class="hk-snip" data-csnip="${i}">+ ${esc(s.slice(0, 22))}…</button>`).join('')}</div>
        </div>
        <textarea class="hk-textarea" name="note" id="mNote" maxlength="1200" style="min-height:92px" placeholder="e.g. Great prototype! Please arrive 15 mins early or attach your demo video link before judging."></textarea>
      </div>

      <div class="hk-mailprev">
        <div class="mh" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>
            <small style="opacity:.82;letter-spacing:.1em;text-transform:uppercase;display:block;font-size:.66rem">Live Auto-Generated Preview</small>
            <span id="pSubj">—</span>
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="hk-btn sm" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35);color:#fff" id="pToggleMode">WhatsApp View</button>
            <button type="button" class="hk-btn sm" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35);color:#fff" id="pCopy"><i data-lucide="copy"></i>Copy</button>
          </div>
        </div>
        <pre class="mb hk-mailpre" id="pBody"></pre>
        <div class="ms hk-xs">From <b>team@campusconnectone.online</b> · Reply-to <b>${esc(org.email || 'host email')}</b> · Auto-logged to team dashboard.</div>
      </div>

      <div id="mErr" class="hk-msg err hk-hidden"></div>

      <div class="hk-comp-acts">
        <button class="hk-btn hk-sendbtn" type="submit" id="mSend"><i data-lucide="send"></i><span>Send Auto Email + Alert</span></button>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${one ? `<button type="button" class="hk-btn sm hk-mailbtn ${M.isMailSent(one, def, localMail) ? 'sent' : ''}" id="mGmail" style="flex:1;min-height:42px"><i data-lucide="mail"></i><span>Open in Gmail / Mail</span></button>` : ''}
          ${one && one.phone ? `<button type="button" class="hk-btn sm hk-mailbtn" id="mWa" style="flex:1;min-height:42px"><i data-lucide="message-circle"></i><span>WhatsApp Message</span></button>` : ''}
        </div>
      </div>
    </form>`, { wide: true, onMount(b, close){
      const k = $('#mk', b), rd = $('#mRd', b), sc = $('#mSc', b), mt = $('#mMeet', b), sb = $('#mSubj', b), n = $('#mNote', b);
      const btn = $('#mSend', b), gmailBtn = $('#mGmail', b), waBtn = $('#mWa', b);
      let waMode = false;

      const err = (m, showGmailFallback = false) => {
        const e = $('#mErr', b);
        e.classList.toggle('hk-hidden', !m);
        if(!m){ e.innerHTML = ''; return; }
        e.innerHTML = `<i data-lucide="circle-alert"></i><div style="flex:1"><span>${esc(m)}</span>${showGmailFallback && one ? ` <button type="button" class="hk-btn sm primary" id="fbGmail" style="margin-left:8px">Send via Gmail / Mail App instead</button>` : ''}</div>`;
        icons();
        const fb = $('#fbGmail', e);
        if(fb) fb.onclick = () => gmailBtn?.click();
      };

      const curPreview = (targetReg = one || targets[0]) => M.buildHackathonEmail(k.value || 'custom', {
        hackathon: h, hackathonId: h.id, reg: targetReg, round: rd?.value || '',
        note: n.value, scheduleText: sc?.value || '', meetLink: mt?.value || '', customSubject: sb?.value || '',
        org, testMeta: meta, att: targetReg?.uid ? attOf(targetReg.uid) : null, sub: targetReg?.uid ? subOf(targetReg.uid) : null
      });

      const refresh = () => {
        const kv = k.value || 'custom';
        const tm = M.TPL_BY_KEY[kv] || M.MAIL_TPLS[0];
        $('#rdWrap', b)?.classList.toggle('hk-hidden', !tm.supportsRound);
        $('#scWrap', b)?.classList.toggle('hk-hidden', !tm.supportsSchedule);
        $('#noteHint', b).textContent = kv === 'custom' ? 'required (3+ chars)' : 'optional · highlights in email';
        const ok = !!kv && (kv !== 'custom' || n.value.trim().length >= 3);
        const alreadySent = one && M.isMailSent(one, kv, localMail);
        const sentAt = one && M.lastMailTimestamp(one, kv, localMail);
        $('#tplSentBadge', b).innerHTML = alreadySent ? `<span class="hk-chip" style="margin-left:6px">Sent ✓ ${sentAt ? C.ago(sentAt) : ''}</span>` : '';

        btn.disabled = !ok;
        btn.classList.toggle('ready', ok && !alreadySent);
        btn.classList.toggle('sent', !!alreadySent);
        btn.querySelector('span').textContent = !ok
          ? 'Write your custom message above'
          : (alreadySent
            ? 'Already Sent ✓ · Send Again'
            : (targets.length > 1 ? `Send Auto Email to ${targets.length} Teams` : 'Send Auto Email + Alert'));

        if(gmailBtn) gmailBtn.classList.toggle('sent', !!alreadySent);
        const pr = curPreview();
        if(sb) sb.placeholder = pr.subject;
        $('#pSubj', b).textContent = pr.subject;
        $('#pBody', b).textContent = waMode ? pr.whatsappText : pr.body;
      };

      $('#cmTpls', b).onclick = ev => {
        const tb = ev.target.closest('[data-ckind]'); if(!tb) return;
        $$('.hk-tpl', b).forEach(x => x.classList.toggle('on', x === tb));
        k.value = tb.dataset.ckind;
        if(sc && !sc.value.trim()) sc.value = defaultScheduleForKind(k.value, rd?.value || '');
        refresh();
      };
      b.addEventListener('click', ev => {
        const sn = ev.target.closest('[data-csnip]');
        if(sn){
          const txt = M.QUICK_NOTE_SNIPPETS[+sn.dataset.csnip];
          if(txt){ n.value = (n.value.trim() ? n.value.trim() + '\n' : '') + txt; refresh(); }
        }
      });
      $('#pToggleMode', b).onclick = () => {
        waMode = !waMode;
        $('#pToggleMode', b).textContent = waMode ? 'Email View' : 'WhatsApp View';
        refresh();
      };
      $('#pCopy', b).onclick = async () => {
        const pr = curPreview();
        try { await navigator.clipboard.writeText(`Subject: ${pr.subject}\n\n${pr.body}`); toast('Email copied to clipboard'); }
        catch { toast('Could not copy', 'error'); }
      };
      [rd, sc, mt, sb, n].forEach(el => { if(el) el.oninput = el.onchange = refresh; });
      refresh();

      if(gmailBtn){
        gmailBtn.onclick = async () => {
          err('');
          if(k.value === 'custom' && n.value.trim().length < 3) return err('Write your message for a custom email first.');
          try {
            await sendOne(one, { kind: k.value, note: n.value.trim(), roundVal: rd?.value || '', scheduleText: sc?.value.trim() || '', meetLink: mt?.value.trim() || '', customSubject: sb?.value.trim() || '', channel: 'gmail' });
            refresh();
            gmailBtn.classList.add('sent');
            gmailBtn.querySelector('span').textContent = 'Gmail Opened · Sent ✓';
            toast(`Opened email & marked sent for ${one.name}`);
            redrawRows(); paint();
          } catch(e){ err(e.message); }
        };
      }
      if(waBtn){
        waBtn.onclick = async () => {
          err('');
          if(k.value === 'custom' && n.value.trim().length < 3) return err('Write your message for a custom email first.');
          try {
            await sendOne(one, { kind: k.value, note: n.value.trim(), roundVal: rd?.value || '', scheduleText: sc?.value.trim() || '', meetLink: mt?.value.trim() || '', customSubject: sb?.value.trim() || '', channel: 'whatsapp' });
            refresh();
            waBtn.classList.add('sent');
            waBtn.querySelector('span').textContent = 'WhatsApp Sent ✓';
            toast(`Opened WhatsApp for ${one.name}`);
            redrawRows(); paint();
          } catch(e){ err(e.message); }
        };
      }

      $('#mf', b).onsubmit = async ev => {
        ev.preventDefault(); err(''); btn.disabled = true;
        const kindVal = k.value, noteVal = n.value.trim(), roundVal = rd?.value || '';
        const extra = { scheduleText: sc?.value.trim() || '', meetLink: mt?.value.trim() || '', customSubject: sb?.value.trim() || '' };
        let ok = 0, bad = 0, last = '';
        for(let i = 0; i < targets.length; i++){
          btn.innerHTML = `<span class="hk-spin"></span> Sending ${i + 1}/${targets.length}…`;
          try { await sendOne(targets[i], { kind: kindVal, note: noteVal, roundVal, ...extra, channel: 'platform' }); ok++; }
          catch(e){ bad++; last = e.message; }
        }
        if(!bad){ close(); toast(`Auto email sent to ${ok} team${ok === 1 ? '' : 's'}`); redrawRows(); paint(); }
        else {
          const isUnavail = /not deployed|unavailable|SMTP|Backend is not available/i.test(last);
          err(`${ok} sent, ${bad} failed. ${last}`, isUnavail);
          btn.disabled = false; btn.innerHTML = '<i data-lucide="send"></i><span>Retry Auto Email</span>'; icons(); redrawRows();
        }
      };
    } });
  }

  /* ---------- full applicant profile modal ---------- */
  async function viewApplicantModal(r){
    const sub = subOf(r.uid), att = attOf(r.uid);
    modal(`Applicant Profile · ${r.name}`, `<div class="hk-stack"><div class="hk-sm hk-muted"><span class="hk-spin"></span> Loading full profile…</div></div>`, {
      wide: true,
      async onMount(b, close){
        const live = await C.fetchParticipantProfile(r.uid);
        const p = {
          ...r, ...(live || {}),
          name: r.name || live?.displayName || 'Participant',
          email: r.email || live?.email || '',
          phone: r.phone || live?.phone || '',
          college: r.college || live?.college || '',
          year: r.year || [live?.course, live?.year].filter(Boolean).join(' · '),
          course: live?.course || r.course || '',
          branch: live?.branch || r.branch || '',
          city: live?.city || r.city || '',
          skills: live?.skills || r.skills || '',
          level: live?.level || r.level || '',
          gender: live?.gender || r.gender || '',
          github: live?.github || r.github || '',
          linkedin: live?.linkedin || r.linkedin || '',
          portfolio: live?.portfolio || r.portfolio || '',
          bio: live?.bio || r.bio || '',
          photoURL: live?.photoURL || r.photoURL || ''
        };
        const extLink = (u, ic, label) => C.safeUrl(u)
          ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="${ic}"></i>${label}</a>`
          : `<span class="hk-chip neutral"><i data-lucide="${ic}"></i>${label}: Not added</span>`;
        const kv = (k, v) => v ? `<div class="hk-kv-item"><small>${k}</small><b>${esc(v)}</b></div>` : '';
        const body = $('[data-body]', b);
        body.innerHTML = `<div class="hk-stack">
          <div class="hk-prof-head">
            <img class="hk-avatar" style="width:64px;height:64px" src="${esc(C.safeUrl(p.photoURL) || 'icon.png')}" alt="" onerror="this.src='icon.png'">
            <div class="grow">
              <h3 style="font-size:1.2rem;margin-bottom:2px">${esc(p.name)}</h3>
              <div class="hk-sm hk-muted">${esc(p.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                <span class="hk-chip ${r.status === 'selected' ? 'gold' : r.status === 'rejected' ? 'bad' : r.status === 'waitlisted' ? 'warn' : ''}">${esc(r.status)}</span>
                <span class="hk-chip neutral">${esc(roundName(r.stage || 0))}</span>
                <span class="hk-chip neutral">${r.teamMode === 'solo' ? 'Solo' : 'Team: ' + esc(r.teamName || '')}</span>
              </div>
            </div>
            <button type="button" class="hk-btn sm primary" id="appMailBtn"><i data-lucide="mail"></i>Send email</button>
          </div>

          <div class="hk-kv-grid">
            ${kv('College / Institute', p.college)}
            ${kv('City', p.city)}
            ${kv('Course / Year', p.year || p.course)}
            ${kv('Branch / Stream', p.branch)}
            ${kv('Experience level', p.level)}
            ${kv('Gender', p.gender)}
            ${kv('Registered', C.fmtDT(r.createdAtMs))}
            ${kv('Skills', p.skills)}
          </div>

          ${p.bio ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:4px">Bio</small><p class="hk-sm hk-prose" style="margin:0">${esc(p.bio)}</p></div>` : ''}

          <div>
            <small class="hk-eyebrow" style="display:block;margin-bottom:8px">Social &amp; developer links</small>
            <div class="hk-prof-links">
              ${extLink(p.github, 'github', 'GitHub')}
              ${extLink(p.linkedin, 'linkedin', 'LinkedIn')}
              ${extLink(p.portfolio, 'globe', 'Portfolio / Website')}
            </div>
          </div>

          ${(r.customAnswers || []).filter(a => a && a.value).length ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:6px">Organiser questions</small>
            <div class="hk-kv-grid">${r.customAnswers.filter(a => a && a.value).map(a => `<div class="hk-kv-item"><small>${esc(a.label)}</small><b>${C.isUrl(a.value) ? `<a href="${esc(C.safeUrl(a.value))}" target="_blank" rel="noopener noreferrer" style="text-decoration:underline;color:var(--hk-p)">${esc(a.value)}</a>` : esc(a.value)}</b></div>`).join('')}</div>
          </div>` : ''}

          ${(r.members || []).length ? `<div class="hk-card-s" style="padding:12px 14px"><small class="hk-eyebrow" style="display:block;margin-bottom:6px">Team members (${r.members.length + 1} total)</small>
            ${r.members.map(m => `<div class="hk-sm" style="padding:6px 0;border-bottom:1px dashed var(--hk-line)"><b>${esc(m.name)}</b>${m.email ? ' · ' + esc(m.email) : ''}${m.phone ? ' · ' + esc(m.phone) : ''}${(m.college || m.course || m.year) ? `<div class="hk-xs hk-muted">${esc([m.college, m.course, m.year].filter(Boolean).join(' · '))}</div>` : ''}</div>`).join('')}
          </div>` : ''}

          ${(sub || att?.submittedAtMs) ? `<div class="hk-card-s" style="padding:12px 14px">
            <small class="hk-eyebrow" style="display:block;margin-bottom:6px">Evaluation</small>
            ${att?.submittedAtMs ? `<div class="hk-sm" style="margin-bottom:6px"><b>Test score:</b> ${att.score} / ${att.total} (${C.ago(att.submittedAtMs)})</div>` : ''}
            ${sub ? `<div class="hk-sm"><b>Project:</b> ${esc(sub.title)}${sub.score != null ? ` · Score <b>${esc(sub.score)}</b>` : ''}</div>
              <div class="hk-prof-links" style="margin-top:8px">${link(sub.pptUrl, 'PPT')}${link(sub.repoUrl, 'Repo')}${link(sub.demoUrl, 'Demo')}${link(sub.videoUrl, 'Prototype Video')}${link(sub.introVideoUrl, 'Intro Video')}${link(sub.extraUrl, 'Other')}${subCustomHtml(sub)}</div>` : ''}
          </div>` : ''}

          <form id="hostNoteForm" class="hk-card-s hk-form" style="padding:12px 14px;gap:8px">
            <label for="hnIn" style="font-size:.82rem;font-weight:700">Note visible to applicant <small class="hk-muted">updates live on their dashboard</small></label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input class="hk-input" id="hnIn" name="hostNote" maxlength="300" placeholder="e.g. Great prototype! Report at Room 204 by 10 AM." value="${esc(r.hostNote || '')}" style="flex:1;min-width:200px">
              <button type="submit" class="hk-btn sm primary">Save note</button>
            </div>
          </form>
        </div>`;
        icons();
        $('#appMailBtn', b).onclick = () => { close(); compose([r]); };
        $('#hostNoteForm', b).onsubmit = async ev => {
          ev.preventDefault();
          const note = $('#hnIn', b).value.trim();
          const bt = $('button[type=submit]', ev.target);
          bt.disabled = true; bt.textContent = 'Saving…';
          try {
            await C.updateRegistration(r.id, { hostNote: note });
            r.hostNote = note;
            if(note){
              C.notify({ toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'status', title: `Note from ${h.title}`, body: note }).catch(() => {});
            }
            toast('Note saved');
          } catch(e){ toast(e.message, 'error'); }
          bt.disabled = false; bt.textContent = 'Save note';
        };
      }
    });
  }

  /* ---------- exports ---------- */
  const flat = r => [r.name, r.email, r.phone, r.college, r.year || '', r.teamMode === 'solo' ? 'Solo' : 'Team', r.teamName || '', (r.members || []).map(m => `${m.name}${m.email ? ' <' + m.email + '>' : ''}${m.college ? ' [' + [m.college, m.course, m.year].filter(Boolean).join(', ') + ']' : ''}`).join('; '), roundName(r.stage || 0), r.status, subOf(r.uid)?.title || '', subOf(r.uid)?.score ?? '', attOf(r.uid)?.submittedAtMs ? `${attOf(r.uid).score}/${attOf(r.uid).total}` : '', C.fmtDT(r.createdAtMs)];
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
        try {
          const hadMeta = !!meta;
          await C.saveTest(h, S.user, { title: f.get('title').trim() || 'Screening test', durationMin: +f.get('dur') || 30, startMs: stM, endMs: enM }, l);
          meta = await C.getTestMeta(id);
          if(!hadMeta && regs.length){
            for(let i = 0; i < regs.length; i += 400){
              const wb = FS.writeBatch(C.db);
              regs.slice(i, i + 400).forEach(r => wb.set(FS.doc(FS.collection(C.db, 'hkNotifications')), { toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'test', title: `Screening test · ${h.title}`, body: `${meta.title} (${meta.durationMin} min) is published. Open your dashboard to view timings.`, read: false, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() }));
              await wb.commit();
            }
          }
          close(); toast('Test saved'); paint();
        }
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
    const t = e.target;
    if(t.id === 'rq'){ q = t.value.trim().toLowerCase(); redrawRows(); }
    if(t.id === 'mtRound'){ mailer.roundName = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtSched'){ mailer.scheduleText = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtMeet'){ mailer.meetLink = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtSubj'){ mailer.customSubject = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtNote'){ mailer.note = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mqSearch'){ mailer.quickQ = t.value.trim().toLowerCase(); redrawRows(); }
    if(t.id === 'recSearch'){ mailer.recSearch = t.value.trim(); redrawRows(); }
  };
  view.onchange = async e => {
    const t = e.target;
    if(t.id === 'fs'){ fs = t.value; return redrawRows(); }
    if(t.id === 'fr'){ fr = t.value; return redrawRows(); }
    if(t.id === 'recKind'){ mailer.recKind = t.value; return redrawRows(); }
    if(t.id === 'recChan'){ mailer.recChannel = t.value; return redrawRows(); }
    if(t.id === 'mtRound'){ mailer.roundName = t.value; return updateMailerPreviewDom(); }
    if(t.dataset.qch){
      const it = mailer.queue.find(x => x.qid === t.dataset.qch);
      if(it){ it.channel = t.value; redrawRows(); }
      return;
    }
    if(t.id === 'mqCsv' && t.files?.length){
      try {
        const txt = await t.files[0].text();
        const parsed = M.parseRecipientText(txt, regs);
        const n = queueAddRegs(parsed);
        toast(n ? `Added ${n} recipient${n === 1 ? '' : 's'} from file` : 'No new recipients found in file', n ? 'success' : 'info');
        t.value = '';
        redrawRows();
      } catch(err){ toast('Could not read file', 'error'); }
      return;
    }
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
    const pb = t.closest('[data-prof]'); if(pb){ const r = regs.find(x => x.id === pb.dataset.prof); if(r) viewApplicantModal(r); return; }
    const tb = t.closest('[data-tab]'); if(tb) return setTab(tb.dataset.tab);
    const mb = t.closest('[data-mail]'); if(mb){ const r = regs.find(x => x.id === mb.dataset.mail); if(r) compose([r]); return; }
    if(t.closest('[data-bulkmail]')){ const l = regs.filter(r => sel.has(r.id)); return l.length ? compose(l) : toast('Select teams first.', 'error'); }
    if(t.closest('[data-bulkqueue]')){
      const l = regs.filter(r => sel.has(r.id));
      if(!l.length) return toast('Select teams first.', 'error');
      const added = queueAddRegs(l);
      toast(`${added} team${added === 1 ? '' : 's'} loaded into Mailer queue`);
      return setTab('mail');
    }

    // Mailer Tab events
    const mch = t.closest('[data-mch]');
    if(mch){ mailer.channel = mch.dataset.mch; mailer.previewMode = mailer.channel === 'whatsapp' ? 'whatsapp' : 'email'; return paint(); }
    const mtpl = t.closest('[data-mtpl]');
    if(mtpl){
      mailer.kind = mtpl.dataset.mtpl;
      if(!mailer.scheduleText) mailer.scheduleText = defaultScheduleForKind(mailer.kind, mailer.roundName);
      return paint();
    }
    const snip = t.closest('[data-snip]');
    if(snip){
      const s = M.QUICK_NOTE_SNIPPETS[+snip.dataset.snip];
      if(s){ mailer.note = (mailer.note.trim() ? mailer.note.trim() + '\n' : '') + s; return paint(); }
    }
    const ql = t.closest('[data-qload]');
    if(ql){
      const k = ql.dataset.qload;
      const sets = {
        pend_test: regs.filter(r => r.status !== 'rejected' && meta && !attOf(r.uid)?.submittedAtMs),
        pend_sub: regs.filter(r => r.status !== 'rejected' && h.submission?.open !== false && !subOf(r.uid)),
        shortlisted: regs.filter(r => r.status === 'shortlisted'),
        selected: regs.filter(r => r.status === 'selected'),
        unmailed: regs.filter(r => !M.isMailSent(r, null, localMail)),
        all: regs
      };
      const n = queueAddRegs(sets[k] || []);
      toast(n ? `Added ${n} team${n === 1 ? '' : 's'} to queue` : 'All matching teams are already in the queue', n ? 'success' : 'info');
      return paint();
    }
    const qa = t.closest('[data-qadd]');
    if(qa){
      const r = regs.find(x => x.id === qa.dataset.qadd);
      if(r){ const n = queueAddRegs([r]); toast(n ? `Added ${r.name} to queue` : `${r.name} is already in the queue`, n ? 'success' : 'info'); paint(); }
      return;
    }
    if(t.closest('[data-togglepaste]')){ mailer.showPaste = !mailer.showPaste; return paint(); }
    if(t.closest('[data-analyze]')){
      const raw = $('#mqPasteTxt')?.value || '';
      const parsed = M.parseRecipientText(raw, regs);
      if(!parsed.length) return toast('No valid emails or 10-digit phone numbers found.', 'error');
      const n = queueAddRegs(parsed);
      mailer.showPaste = false;
      toast(`Added ${n} recipient${n === 1 ? '' : 's'} to queue`);
      return paint();
    }
    const qac = t.closest('[data-qallch]');
    if(qac){
      const ch = qac.dataset.qallch;
      mailer.queue.forEach(item => { item.channel = (ch === 'platform' && !item.regId) ? (item.email ? 'gmail' : 'whatsapp') : ch; });
      return paint();
    }
    const qrm = t.closest('[data-qrm]');
    if(qrm){ mailer.queue = mailer.queue.filter(x => x.qid !== qrm.dataset.qrm); return paint(); }
    if(t.closest('[data-qclearsent]')){ mailer.queue = mailer.queue.filter(x => !x.sent); return paint(); }
    if(t.closest('[data-qclearall]')){ mailer.queue = []; return paint(); }
    const qsend = t.closest('[data-qsend]');
    if(qsend){
      const item = mailer.queue.find(x => x.qid === qsend.dataset.qsend); if(!item) return;
      if(mailer.kind === 'custom' && mailer.note.trim().length < 3) return toast('Write a custom note (3+ chars) first.', 'error');
      qsend.disabled = true;
      try {
        await sendOne(item, { kind: mailer.kind, note: mailer.note.trim(), roundVal: mailer.roundName, scheduleText: mailer.scheduleText.trim(), meetLink: mailer.meetLink.trim(), customSubject: mailer.customSubject.trim(), channel: item.channel });
        item.sent = true; item.sentCount = (item.sentCount || 0) + 1;
        toast(`Sent to ${item.name}`);
        paint();
      } catch(err){ toast(err.message, 'error'); qsend.disabled = false; }
      return;
    }
    if(t.closest('[data-qsendnext]')){
      const next = mailer.queue.find(x => !x.sent);
      if(!next) return toast('All queued recipients are already marked sent!', 'info');
      if(mailer.kind === 'custom' && mailer.note.trim().length < 3) return toast('Write a custom note (3+ chars) first.', 'error');
      try {
        await sendOne(next, { kind: mailer.kind, note: mailer.note.trim(), roundVal: mailer.roundName, scheduleText: mailer.scheduleText.trim(), meetLink: mailer.meetLink.trim(), customSubject: mailer.customSubject.trim(), channel: next.channel });
        next.sent = true; next.sentCount = (next.sentCount || 0) + 1;
        toast(`Sent to ${next.name}`);
        paint();
      } catch(err){ toast(err.message, 'error'); }
      return;
    }
    if(t.closest('[data-qsendall]')){
      const pending = mailer.queue.filter(x => !x.sent);
      if(!pending.length) return toast('Nothing pending in the queue!', 'info');
      if(mailer.kind === 'custom' && mailer.note.trim().length < 3) return toast('Write a custom note (3+ chars) first.', 'error');
      if(!confirm(`Send ${pending.length} pending message(s) now?`)) return;
      let ok = 0, bad = 0, lastErr = '';
      for(const item of pending){
        try {
          await sendOne(item, { kind: mailer.kind, note: mailer.note.trim(), roundVal: mailer.roundName, scheduleText: mailer.scheduleText.trim(), meetLink: mailer.meetLink.trim(), customSubject: mailer.customSubject.trim(), channel: item.channel });
          item.sent = true; ok++;
        } catch(err){ bad++; lastErr = err.message; }
      }
      paint();
      return toast(bad ? `${ok} sent, ${bad} failed (${lastErr})` : `Sent to all ${ok} team(s)`, bad ? 'error' : 'success');
    }
    const mp = t.closest('[data-mprev]');
    if(mp){ mailer.previewMode = mp.dataset.mprev; return paint(); }
    if(t.closest('[data-mcopy]')){
      const pr = getMailerPreviewData();
      try { await navigator.clipboard.writeText(`Subject: ${pr.subject}\n\n${pr.body}`); toast('Copied email preview'); } catch { toast('Copy failed', 'error'); }
      return;
    }
    const rs = t.closest('[data-resend]');
    if(rs){
      const l = getLogs().find(x => x.id === rs.dataset.resend); if(!l) return;
      const reg = l.registrationId ? regs.find(r => r.id === l.registrationId) : null;
      if(reg) return compose([reg], l.kind);
      const pr = { subject: l.subject || `${h.title} Update`, body: l.body || l.note || '' };
      if(l.channel === 'whatsapp' && l.phone){
        M.openWhatsAppClient(l.phone, `*${pr.subject}*\n\n${pr.body}`);
        M.recordLocalMailSent(h.id, { ...l, id: undefined, createdAtMs: Date.now(), resendCount: (l.resendCount || 1) + 1 });
        localMail = M.loadLocalMailState(h.id);
        toast(`Opened WhatsApp for ${l.phone}`);
        paint();
      } else if(l.to){
        M.openMailClient(l.to, pr.subject, pr.body);
        M.recordLocalMailSent(h.id, { ...l, id: undefined, createdAtMs: Date.now(), resendCount: (l.resendCount || 1) + 1 });
        localMail = M.loadLocalMailState(h.id);
        toast(`Opened mail for ${l.to}`);
        paint();
      }
      return;
    }

    if(t.closest('[data-csv]')) return C.csv(`${slug}-registrations.csv`, [HEAD, ...filtered().map(flat)]);
    if(t.closest('[data-pdf]')) return pdf();
    if(t.closest('[data-share]')){ try { await navigator.clipboard.writeText(C.publicShareUrl(h.id)); toast('Public link copied'); } catch { toast('Copy failed', 'error'); } return; }
    if(t.closest('[data-test]')) return testBuilder();
    if(t.closest('[data-rmtest]')){ if(confirm('Remove the test and all questions?')){ try { await C.removeTest(id); meta = null; paint(); toast('Test removed', 'info'); } catch(err){ toast(err.message, 'error'); } } return; }
    const rv = t.closest('[data-review]');
    if(rv){
      const card = rv.closest('[data-sub]'), s = subs.find(x => x.id === rv.dataset.review), sc = $('[data-score]', card).value, fb = $('[data-fb]', card).value.trim();
      try {
        const patch = { score: sc === '' ? null : Math.max(0, Math.min(100, +sc)), feedback: fb, reviewStatus: 'reviewed' };
        await C.reviewSubmission(s.id, patch); Object.assign(s, patch);
        C.notify({ toUid: s.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'submission_review', title: `Project reviewed · ${h.title}`, body: `Your submission "${s.title}" was reviewed${patch.score != null ? ` (Score: ${patch.score}/100)` : ''}${fb ? ': ' + fb : '.'}` }).catch(() => {});
        toast('Review saved'); paint();
      } catch(err){ toast(err.message, 'error'); }
      return;
    }
    if(t.closest('[data-toggle]')){
      try { await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { registrationClosed: !h.registrationClosed, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() }); h.registrationClosed = !h.registrationClosed; cx.S.all = null; toast(h.registrationClosed ? 'Registration ended' : 'Registration reopened', 'info'); paint(); }
      catch(err){ toast(err.message, 'error'); }
      return;
    }
    if(t.closest('[data-announce]')){
      modal('Send an update', `<form class="hk-form" id="an"><p class="hk-sm hk-muted">Shown on the hackathon page and sent as an in-app notification to all ${regs.length} registrant${regs.length === 1 ? '' : 's'}. For email, use the Mailer tab or mail button on each row.</p><div class="hk-field"><textarea class="hk-textarea" name="msg" maxlength="500" required style="min-height:110px" placeholder="e.g. Round 1 results are out."></textarea></div><button class="hk-btn gold block" type="submit">Send update</button></form>`, { onMount(b, close){
        $('#an', b).onsubmit = async ev => {
          ev.preventDefault(); const msg = new FormData(ev.target).get('msg').trim(); if(!msg) return;
          const bt = $('button', b); bt.disabled = true; bt.innerHTML = '<span class="hk-spin"></span> Sending…';
          try {
            await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { announcement: msg, announcementAtMs: Date.now(), updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
            h.announcement = msg;
            for(let i = 0; i < regs.length; i += 400){
              const wb = FS.writeBatch(C.db);
              regs.slice(i, i + 400).forEach(r => wb.set(FS.doc(FS.collection(C.db, 'hkNotifications')), { toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'announcement', title: `Update: ${h.title}`, body: msg, read: false, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() }));
              await wb.commit();
            }
            cx.S.all = null; close(); toast(`Update sent to ${regs.length} registrant${regs.length === 1 ? '' : 's'}`);
          } catch(err){ toast(err.message, 'error'); bt.disabled = false; bt.innerHTML = 'Send update'; }
        };
      } });
    }
  };
  cx.S.cleanup = () => { view.oninput = view.onchange = view.onclick = null; };
}
