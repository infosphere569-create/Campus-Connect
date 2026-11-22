// Organiser workspace for one hackathon: registrations, smart Mailer & Outreach, submissions, test, exports.
import * as C from './hk-core.js';
import * as M from './hk-mailer.js';
import * as HC from './hk-cert.js';
import { empty, statusBadge, applicationStepperHtml } from './hk-ui.js';

const { $, $$, esc, icons, toast, modal, FS } = C;
const STS = C.REG_STATUS;
const extractProto = sub => {
  if(typeof C.getPrototypeSubmission === 'function') return C.getPrototypeSubmission(sub);
  if(!sub || !Array.isArray(sub.customAnswers)) return null;
  const hit = sub.customAnswers.find(a => a && a.id === '__proto_meta');
  if(!hit) return null;
  try {
    const d = typeof hit.value === 'string' ? JSON.parse(hit.value) : (hit.data || hit);
    return d && d.title ? d : null;
  } catch { return null; }
};

export async function manage(cx, id){
  const { S, view } = cx;
  const h = await C.fetchOne(id, { fresh: true }); if(cx.stale()) return;
  if(!h || (!C.isHackHost(h, S.user) && !C.isStaff(S.site))){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Hackathon not found', 'You can only manage hackathons you host.', `<a class="hk-btn" href="${esc(cx.backHash || '#/host')}">Back to dashboard</a>`)}</div>`; return; }
  const hostUid = h.hostUid, rounds = C.roundsOf(h);
  let [regs, subs, atts, meta, keys, serverMailLogs, certs, ownerProfile] = await Promise.all([
    C.hackathonRegistrations(id, hostUid),
    C.hackathonSubmissions(id, hostUid).catch(() => []),
    C.hackathonAttempts(id, hostUid).catch(() => []),
    C.getTestMeta(id),
    C.getTestKeys(id).catch(() => null),
    C.hackathonMailLogs(id, hostUid).catch(() => []),
    HC.fetchHackathonCerts(id).catch(() => []),
    cx.ownerProfile
      ? Promise.resolve(cx.ownerProfile)
      : (S.user?.uid === hostUid ? Promise.resolve(S.hk) : C.fetchParticipantProfile(hostUid).catch(() => null))
  ]);
  if(cx.stale()) return;

  const org = {
    name: ownerProfile?.organiserName || ownerProfile?.displayName || S.hk?.organiserName || S.hk?.displayName || h.organiser?.name || S.site?.displayName || 'The organiser',
    designation: ownerProfile?.designation || S.hk?.designation || h.organiser?.designation || '',
    org: ownerProfile?.org || S.hk?.org || h.brandName || h.hostName || '',
    email: ownerProfile?.orgEmail || S.hk?.orgEmail || h.contactEmail || h.hostEmail || S.user?.email || '',
    phone: ownerProfile?.orgPhone || S.hk?.orgPhone || h.contactPhone || h.organiser?.phone || ''
  };
  const subOf = uid => subs.find(x => x.uid === uid), attOf = uid => atts.find(x => x.uid === uid), regOf = uid => regs.find(x => x.uid === uid);
  let subWeight = '50_50'; // '50_50' | '30_70' | '70_30'
  const evalMetrics = uid => {
    const att = attOf(uid), sub = subOf(uid);
    const testScore = att?.submittedAtMs ? Number(att.score ?? 0) : null;
    const testTotal = att?.total ?? meta?.total ?? 0;
    const testPct = testScore != null && testTotal > 0 ? Math.round((testScore / testTotal) * 100) : null;
    const subScore = sub?.score != null ? Number(sub.score) : null;
    const [wtT, wtP] = subWeight === '70_30' ? [0.7, 0.3] : subWeight === '30_70' ? [0.3, 0.7] : [0.5, 0.5];
    let combined = -1;
    if(subScore != null && testPct != null) combined = Math.round((testPct * wtT) + (subScore * wtP));
    else if(subScore != null) combined = subScore;
    else if(testPct != null) combined = testPct;
    return { att, sub, testScore, testTotal, testPct, subScore, combined };
  };
  const sel = new Set();
  const subSel = new Set(), testSel = new Set();
  const initT = ['review', 'subs'].includes(cx.initialTab) ? 'subs' : (['regs', 'mail', 'test', 'next', 'certs'].includes(cx.initialTab) ? cx.initialTab : 'regs');
  let tab = initT, q = '', fs = '', fr = '', regSort = 'recent';
  let subsView = 'leaderboard', subRankBy = 'combined';
  let subQ = '', subFilter = 'all', subSort = 'score_desc', topSubN = 5, subCut = 75;
  let testQ = '', testFilter = 'attempted', testSort = 'score_desc', topTestN = 5, testCut = 60;
  let winCriteria = 'combined', winPool = 'qualified', winTopN = 3, winMailMode = 'email';
  let certMode = 'winners', certPartScope = 'all', certDateLabel = HC.defaultEventDateLabel(h);
  let certFilter = 'all', certSearch = '', certPartQ = '', editingSig = false;
  const certWinSel = new Set(), certPartSel = new Set(), certRankOverrides = new Map();
  let certWinInit = false;
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
    const { kind, note, roundVal, scheduleText, meetLink, customSubject, channel, winnerPlace, winnerPrize } = opts;
    const regObj = targetReg.reg || regs.find(x => x.id === targetReg.id || x.id === targetReg.regId) || targetReg;
    const winCfg = h.submission?.winnerReveal;
    const winEntry = winCfg?.announced && Array.isArray(winCfg.winners)
      ? winCfg.winners.find(w => (regObj.uid && w.uid === regObj.uid) || (regObj.id && w.regId === regObj.id))
      : null;
    const mail = M.buildHackathonEmail(kind, {
      hackathon: h,
      hackathonId: h.id,
      reg: regObj,
      round: roundVal,
      note,
      scheduleText,
      meetLink,
      customSubject,
      winnerPlace: winnerPlace ?? winEntry?.place ?? '',
      winnerPrize: winnerPrize ?? winEntry?.prize ?? '',
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

  const filtered = () => {
    const list = regs.filter(r => (!fs || r.status === fs) && (fr === '' || (r.stage || 0) === +fr) && (!q || [r.name, r.email, r.phone, r.college, r.teamName, ...(r.members || []).map(m => m.name)].join(' ').toLowerCase().includes(q)));
    if(regSort === 'combined_desc') return [...list].sort((a, b) => evalMetrics(b.uid).combined - evalMetrics(a.uid).combined || (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if(regSort === 'sub_desc') return [...list].sort((a, b) => (evalMetrics(b.uid).subScore ?? -1) - (evalMetrics(a.uid).subScore ?? -1) || (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if(regSort === 'test_desc') return [...list].sort((a, b) => (evalMetrics(b.uid).testPct ?? -1) - (evalMetrics(a.uid).testPct ?? -1) || (b.createdAtMs || 0) - (a.createdAtMs || 0));
    if(regSort === 'name_asc') return [...list].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return list;
  };
  const mailBtn = r => {
    const sent = M.isMailSent(r, null, localMail);
    const lastTs = M.lastMailTimestamp(r, null, localMail);
    const kindLbl = C.MAIL_KINDS[r.lastMailKind] || 'email';
    return sent
      ? `<button class="hk-mailbtn sent" data-mail="${esc(r.id)}" title="Sent: ${esc(kindLbl)}${lastTs ? ' · ' + C.ago(lastTs) : ''} (click to mail again)" aria-label="Mail sent"><i data-lucide="check-circle-2"></i><span>Sent</span></button>`
      : `<button class="hk-mailbtn" data-mail="${esc(r.id)}" title="Open smart email composer" aria-label="Notify team"><i data-lucide="mail"></i><span>Mail</span></button>`;
  };

  const row = (r, idx) => { const em = evalMetrics(r.uid), s = em.sub, a = em.att; const rankBadge = regSort !== 'recent' && regSort !== 'name_asc' && em.combined >= 0 ? `<span class="hk-rank ${idx < 3 ? 'top' + (idx + 1) : ''}">#${idx + 1}</span> ` : ''; return `<tr class="${sel.has(r.id) ? 'sel' : ''}">
    <td><input type="checkbox" data-sel="${esc(r.id)}" ${sel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}"></td>
    <td>${rankBadge}<button type="button" data-prof="${esc(r.id)}" style="background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer"><b style="text-decoration:underline;text-underline-offset:2px">${esc(r.name)}</b></button><div class="hk-xs hk-muted">${esc(r.email)} · ${esc(r.phone)}</div></td>
    <td>${r.teamMode === 'solo' ? '<span class="hk-chip neutral">Solo</span>' : `<b>${esc(r.teamName || 'Team')}</b><div class="hk-xs hk-muted">${(r.members || []).length + 1} members</div>`}</td>
    <td>${esc(r.college)}<div class="hk-xs hk-muted">${esc(r.year || '')}</div></td>
    <td><select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Round">${(rounds.length ? rounds : [{ name: 'Registered' }]).map((x, i) => `<option value="${i}" ${(r.stage || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
    <td><select class="hk-select sm" data-st="${esc(r.id)}" aria-label="Status">${STS.map(x => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="hk-xs">${s ? `<span class="hk-chip">${s.score != null ? 'Project ' + esc(s.score) : 'Submitted'}</span>` : '<span class="hk-muted">—</span>'}${a?.submittedAtMs ? `<div class="hk-muted" style="margin-top:4px">Test ${a.score}/${a.total}${em.testPct != null ? ` (${em.testPct}%)` : ''}</div>` : ''}${em.combined >= 0 ? `<div style="margin-top:3px;font-weight:700;color:var(--hk-p)">Overall ${em.combined}%</div>` : ''}</td>
    <td class="act" style="text-align:right;white-space:nowrap"><button type="button" class="hk-btn sm" data-prof="${esc(r.id)}" title="View full applicant profile"><i data-lucide="user-round"></i>Profile</button> ${mailBtn(r)}</td></tr>`; };

  const regsTab = () => { const l = filtered(); return `
    <div class="hk-toolbar"><div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="rq" value="${esc(q)}" placeholder="Search name, email, college, team…"></div>
      <select class="hk-select" id="fs" style="width:auto;min-height:46px"><option value="">All statuses</option>${STS.map(x => `<option ${x === fs ? 'selected' : ''}>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select" id="fr" style="width:auto;min-height:46px"><option value="">All rounds</option>${rounds.map((x, i) => `<option value="${i}" ${fr !== '' && +fr === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
      <select class="hk-select" id="rs" style="width:auto;min-height:46px" aria-label="Sort registrations">
        <option value="recent" ${regSort === 'recent' ? 'selected' : ''}>Sort: Newest</option>
        <option value="combined_desc" ${regSort === 'combined_desc' ? 'selected' : ''}>Sort: Overall Rank</option>
        <option value="sub_desc" ${regSort === 'sub_desc' ? 'selected' : ''}>Sort: Project Score</option>
        <option value="test_desc" ${regSort === 'test_desc' ? 'selected' : ''}>Sort: Test Score</option>
        <option value="name_asc" ${regSort === 'name_asc' ? 'selected' : ''}>Sort: Leader A–Z</option>
      </select></div>
    <div class="hk-bulk ${sel.size ? 'on' : ''}"><b>${sel.size} selected</b>
      <select class="hk-select sm" id="bSt"><option value="">Set status…</option>${STS.map(x => `<option>${x}</option>`).join('')}</select>
      ${rounds.length ? `<select class="hk-select sm" id="bRd"><option value="">Move to round…</option>${rounds.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
      <button class="hk-btn sm" data-bulkmail="regs"><i data-lucide="mail"></i>Compose email (${sel.size})</button>
      <button class="hk-btn sm" data-bulkqueue="regs"><i data-lucide="list-plus"></i>Load into Mailer</button>
      <button class="hk-btn sm gold" data-bulkcerts="regs"><i data-lucide="award"></i>Bulk Generate Certs (${sel.size})</button></div>
    ${l.length ? `<div class="hk-tablewrap"><table class="hk-table"><thead><tr><th><input type="checkbox" id="selAll" ${l.length && l.every(r => sel.has(r.id)) ? 'checked' : ''} aria-label="Select all"></th><th>Team leader</th><th>Team</th><th>College</th><th>Round</th><th>Status</th><th>Work &amp; Rank</th><th class="act" style="text-align:right">Profile &amp; mail</th></tr></thead><tbody id="rb">${l.map((r, i) => row(r, i)).join('')}</tbody></table></div>` : empty('users', regs.length ? 'No matches' : 'No registrations yet', regs.length ? 'Try clearing the filters.' : 'Registrations appear here as soon as teams sign up. Share your hackathon link to get started.', regs.length ? '' : '<button class="hk-btn gold" data-share>Copy link</button>')}`; };

  const link = (u, l) => C.safeUrl(u) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${esc(l)}</a>` : '';
  const subCustomHtml = s => (s.customAnswers || []).filter(a => a && a.value && a.id !== '__proto_meta').map(a => C.isUrl(a.value) ? link(a.value, a.label || 'Link') : `<span class="hk-chip neutral">${esc(a.label)}: ${esc(a.value)}</span>`).join('');

  const statusChipHtml = st => {
    const tone = st === 'selected' ? 'gold' : st === 'rejected' ? 'bad' : st === 'waitlisted' ? 'warn' : (st === 'shortlisted' ? '' : 'neutral');
    const lbl = st === 'selected' ? 'Finalist' : (st === 'rejected' ? 'Not selected' : (st || 'registered'));
    return `<span class="hk-chip ${tone}">${esc(lbl)}</span>`;
  };

  const subStatusToggleHtml = s => {
    const isFinal = s?.reviewStatus === 'reviewed';
    return `<div class="hk-revtoggle" role="group" aria-label="Review status for ${esc(s.title || 'project')}">
      <button type="button" class="rt-btn reviewing ${!isFinal ? 'on' : ''}" data-revstate="${esc(s.id)}:reviewing" title="Mark as Reviewing (student can still edit)"><i data-lucide="hourglass"></i>Reviewing</button>
      <button type="button" class="rt-btn finalized ${isFinal ? 'on' : ''}" data-revstate="${esc(s.id)}:reviewed" title="Mark as Finalized (Marked as Reviewed &amp; locks student editing)"><i data-lucide="lock"></i>Finalized</button>
    </div>`;
  };

  const getFilteredSubs = () => {
    const qLower = subQ.trim().toLowerCase();
    const list = subs.filter(s => {
      const r = regOf(s.uid);
      const st = r?.status || 'registered';
      if(subFilter === 'pending' && s.reviewStatus === 'reviewed') return false;
      if(subFilter === 'reviewed' && s.reviewStatus !== 'reviewed') return false;
      if(['shortlisted', 'selected', 'waitlisted', 'rejected', 'registered'].includes(subFilter) && st !== subFilter) return false;
      if(qLower){
        const hay = [s.title, s.idea, s.teamName, s.leaderName, r?.name, r?.email, r?.college].join(' ').toLowerCase();
        if(!hay.includes(qLower)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const ea = evalMetrics(a.uid), eb = evalMetrics(b.uid);
      if(subRankBy === 'test') return (eb.testPct ?? -1) - (ea.testPct ?? -1) || (eb.testScore ?? -1) - (ea.testScore ?? -1) || (ea.att?.submittedAtMs || Infinity) - (eb.att?.submittedAtMs || Infinity);
      if(subRankBy === 'project' || subSort === 'score_desc') return (eb.subScore ?? -1) - (ea.subScore ?? -1) || (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      if(subRankBy === 'combined' || subSort === 'combined_desc') return eb.combined - ea.combined || (eb.subScore ?? -1) - (ea.subScore ?? -1);
      if(subSort === 'pending_first') return (a.reviewStatus === 'reviewed' ? 1 : 0) - (b.reviewStatus === 'reviewed' ? 1 : 0) || (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
    });
  };

  const getLeaderboardTeams = () => {
    const qLower = subQ.trim().toLowerCase();
    const list = regs.filter(r => {
      const em = evalMetrics(r.uid), s = em.sub, a = em.att;
      const st = r.status || 'registered';
      if(subFilter === 'submitted' && !s) return false;
      if(subFilter === 'pending' && (!s || s.reviewStatus === 'reviewed')) return false;
      if(subFilter === 'reviewed' && (!s || s.reviewStatus !== 'reviewed')) return false;
      if(subFilter === 'test_done' && !a?.submittedAtMs) return false;
      if(['shortlisted', 'selected', 'waitlisted', 'rejected', 'registered'].includes(subFilter) && st !== subFilter) return false;
      if(qLower){
        const hay = [r.name, r.email, r.college, r.teamName, s?.title, s?.idea, ...(r.members || []).map(m => m.name)].join(' ').toLowerCase();
        if(!hay.includes(qLower)) return false;
      }
      return true;
    }).map(r => {
      const em = evalMetrics(r.uid);
      let rankVal = -1;
      if(subRankBy === 'test') rankVal = em.testPct ?? -1;
      else if(subRankBy === 'project') rankVal = em.subScore ?? -1;
      else if(subRankBy === 'readiness'){
        const base = (em.sub ? 30 : 0) + (em.att?.submittedAtMs ? 20 : 0) + (r.status === 'selected' ? 20 : r.status === 'shortlisted' ? 10 : 0);
        rankVal = base + (em.combined >= 0 ? Math.round(em.combined * 0.3) : 0);
      } else {
        rankVal = em.combined;
      }
      return { r, s: em.sub, a: em.att, em, rankVal };
    });

    list.sort((x, y) => {
      if(y.rankVal !== x.rankVal) return y.rankVal - x.rankVal;
      if((y.em.subScore ?? -1) !== (x.em.subScore ?? -1)) return (y.em.subScore ?? -1) - (x.em.subScore ?? -1);
      if((y.em.testPct ?? -1) !== (x.em.testPct ?? -1)) return (y.em.testPct ?? -1) - (x.em.testPct ?? -1);
      if(x.a?.submittedAtMs && y.a?.submittedAtMs && x.a.submittedAtMs !== y.a.submittedAtMs) return x.a.submittedAtMs - y.a.submittedAtMs;
      return (x.r.createdAtMs || 0) - (y.r.createdAtMs || 0);
    });
    return list;
  };

  const subsTab = () => {
    const finalists = regs.filter(r => r.status === 'selected');
    const qualified = regs.filter(r => ['shortlisted', 'selected'].includes(r.status));
    const reviewedCount = subs.filter(s => s.reviewStatus === 'reviewed').length;
    const pendingCount = subs.length - reviewedCount;
    const testDoneCount = atts.filter(a => a.submittedAtMs).length;
    const shortlistedCount = regs.filter(r => r.status === 'shortlisted').length;
    const topCombined = regs.reduce((m, r) => Math.max(m, evalMetrics(r.uid).combined), -1);
    const lbRows = subsView === 'leaderboard' ? getLeaderboardTeams() : [];
    const cardList = subsView === 'cards' ? getFilteredSubs() : [];
    const winRevCfg = h.submission?.winnerReveal || {};

    const roundProgressCard = qualified.length ? `<div class="hk-winners-box">
      <div class="wb-head">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="hk-win-ic"><i data-lucide="sparkles"></i></span><div><b>Shortlisted for Next Round (${qualified.length})</b><div class="hk-xs hk-muted">${shortlistedCount} Shortlisted · ${finalists.length} Round 2 Finalists${winRevCfg.announced && (winRevCfg.winners || []).length ? ` · ${winRevCfg.winners.length} Official Winners announced` : ' · Official Winners are selected after Round 2'}</div></div></div>
        <button type="button" class="hk-btn sm primary" data-tab="next"><i data-lucide="rocket"></i>Round 2 Prototype &amp; Winners</button>
      </div>
    </div>` : '';

    return `<div class="hk-stack">
      <div class="hk-card-s hk-rev-banner">
        <div>
          <span class="hk-eyebrow" style="color:var(--hk-p)">Round 1 · Evaluation &amp; Shortlisting</span>
          <h2 style="font-size:1.25rem;margin-top:2px">Review Submissions &amp; Team Leaderboard</h2>
          <p class="hk-sm hk-muted" style="margin-top:2px">Score Round 1 ideas, finalize reviews, and <b>Shortlist</b> top teams to unlock Round 2 (Prototype &amp; Finale). Official Winners are decided after Round 2 in <b>Next Step &amp; Winners</b>.</p>
        </div>
        <div class="hk-chseg" role="group" aria-label="Review Submissions view mode">
          <button type="button" class="${subsView === 'leaderboard' ? 'on' : ''}" data-subview="leaderboard"><i data-lucide="trophy"></i>Leaderboard (${regs.length})</button>
          <button type="button" class="${subsView === 'cards' ? 'on' : ''}" data-subview="cards"><i data-lucide="layout-grid"></i>Project Cards (${subs.length})</button>
        </div>
      </div>

      ${roundProgressCard}

      <div class="hk-eval-kpis">
        <div class="hk-ek"><span>Participating teams</span><b>${regs.length}</b></div>
        <div class="hk-ek"><span>Projects submitted</span><b>${subs.length} <small>(${reviewedCount} reviewed)</small></b></div>
        <div class="hk-ek warn"><span>Pending review</span><b>${pendingCount}</b></div>
        <div class="hk-ek p"><span>Shortlisted (Next Round)</span><b>${shortlistedCount}</b></div>
        <div class="hk-ek gold"><span>Round 2 Finalists</span><b>${finalists.length}</b></div>
        <div class="hk-ek"><span>Top rank score</span><b>${topCombined >= 0 ? `${topCombined}%` : '—'}</b></div>
      </div>

      <div class="hk-toolbar">
        <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="sq" value="${esc(subQ)}" placeholder="Search team, leader, college, project title…"></div>
        <select class="hk-select" id="subRankBy" style="width:auto;min-height:46px" aria-label="Rank teams by criteria">
          <option value="combined" ${subRankBy === 'combined' ? 'selected' : ''}>Rank by: Combined (Test + Project)</option>
          <option value="test" ${subRankBy === 'test' ? 'selected' : ''}>Rank by: Screening Test Results</option>
          <option value="project" ${subRankBy === 'project' ? 'selected' : ''}>Rank by: Project Review Score</option>
          <option value="readiness" ${subRankBy === 'readiness' ? 'selected' : ''}>Rank by: Completion + Evaluation</option>
        </select>
        ${subRankBy === 'combined' ? `<select class="hk-select" id="subWeight" style="width:auto;min-height:46px" aria-label="Ranking weight criteria">
          <option value="50_50" ${subWeight === '50_50' ? 'selected' : ''}>Criteria: 50% Test + 50% Project</option>
          <option value="30_70" ${subWeight === '30_70' ? 'selected' : ''}>Criteria: 30% Test + 70% Project</option>
          <option value="70_30" ${subWeight === '70_30' ? 'selected' : ''}>Criteria: 70% Test + 30% Project</option>
        </select>` : ''}
      </div>

      <div class="hk-filter-row" role="group" aria-label="Filter teams and submissions">
        ${[
          ['all', `All Teams (${regs.length})`],
          ['submitted', `Submitted (${subs.length})`],
          ['pending', `Reviewing (${pendingCount})`],
          ['reviewed', `Finalized (${reviewedCount})`],
          ['test_done', `Test Done (${testDoneCount})`],
          ['shortlisted', `Shortlisted (${shortlistedCount})`],
          ['selected', `Round 2 Finalists (${finalists.length})`],
          ['waitlisted', `Waitlisted (${regs.filter(r => r.status === 'waitlisted').length})`],
          ['rejected', `Not Selected (${regs.filter(r => r.status === 'rejected').length})`]
        ].map(([k, lbl]) => `<button type="button" class="hk-fchip ${subFilter === k ? 'on' : ''}" data-subf="${k}">${lbl}</button>`).join('')}
      </div>

      <div class="hk-qshortbar">
        <div class="qs-lbl"><i data-lucide="sparkles"></i><b>Round 1 Shortlisting for Next Round</b><span class="hk-xs hk-muted">Promotes top ranked teams to Shortlisted (${subRankBy === 'test' ? 'Test Results' : subRankBy === 'project' ? 'Project Score' : subRankBy === 'readiness' ? 'Readiness' : 'Combined Criteria'})</span></div>
        <div class="qs-acts">
          <label class="hk-xs">Top <input class="hk-input hk-num-sm" id="topSubN" type="number" min="1" max="${Math.max(1, regs.length)}" value="${topSubN}"></label>
          <button type="button" class="hk-btn sm primary" data-qshort="sub-top-shortlist"><i data-lucide="sparkles"></i>Shortlist Top ${topSubN} for Next Round</button>
          <span class="qs-sep"></span>
          <label class="hk-xs">Score ≥ <input class="hk-input hk-num-sm" id="subCut" type="number" min="0" max="100" value="${subCut}"></label>
          <button type="button" class="hk-btn sm" data-qshort="sub-cut">Shortlist ≥ ${subCut}</button>
        </div>
      </div>

      <div class="hk-bulk ${subSel.size ? 'on' : ''}"><b>${subSel.size} selected</b>
        <select class="hk-select sm" id="bSubSt"><option value="">Set status…</option>${STS.map(x => `<option>${x}</option>`).join('')}</select>
        ${rounds.length ? `<select class="hk-select sm" id="bSubRd"><option value="">Move to round…</option>${rounds.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
        <button class="hk-btn sm" data-bulkmail="subs"><i data-lucide="mail"></i>Compose email (${subSel.size})</button>
        <button class="hk-btn sm" data-bulkqueue="subs"><i data-lucide="list-plus"></i>Load into Mailer</button>
      </div>

      ${subsView === 'leaderboard'
        ? (lbRows.length ? `<div class="hk-tablewrap"><table class="hk-table hk-lb-table"><thead><tr>
            <th><input type="checkbox" id="subSelAll" ${lbRows.length && lbRows.every(x => subSel.has(x.r.id)) ? 'checked' : ''} aria-label="Select all teams"></th>
            <th>Rank</th>
            <th>Participating Team &amp; Leader</th>
            <th>Test Results</th>
            <th>Project Submission</th>
            <th>Criteria Score</th>
            <th>Round &amp; Status</th>
            <th class="act" style="text-align:right">Review &amp; Next Round</th>
          </tr></thead><tbody>${lbRows.map((x, idx) => {
            const { r, s, a, em, rankVal } = x;
            const rankCls = idx < 3 && rankVal >= 0 ? `top${idx + 1}` : '';
            const isShort = r.status === 'shortlisted';
            const isFinalist = r.status === 'selected';
            const teamTitle = r.teamMode === 'solo' ? `${r.name} (Solo)` : `${r.teamName || 'Team'}`;
            const projLinks = s ? [
              C.safeUrl(s.pptUrl) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(s.pptUrl))}" target="_blank" rel="noopener noreferrer">PPT</a>` : '',
              C.safeUrl(s.repoUrl) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(s.repoUrl))}" target="_blank" rel="noopener noreferrer">Repo</a>` : '',
              C.safeUrl(s.demoUrl) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(s.demoUrl))}" target="_blank" rel="noopener noreferrer">Demo</a>` : '',
              C.safeUrl(s.videoUrl) ? `<a class="hk-chip btn" href="${esc(C.safeUrl(s.videoUrl))}" target="_blank" rel="noopener noreferrer">Video</a>` : ''
            ].filter(Boolean).join('') : '';

            return `<tr class="${subSel.has(r.id) ? 'sel' : ''} ${isFinalist ? 'hk-row-winner' : ''}">
              <td><input type="checkbox" data-subsel="${esc(r.id)}" ${subSel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}"></td>
              <td><span class="hk-rank ${rankCls}">#${idx + 1}</span></td>
              <td>
                <button type="button" class="hk-rowlink" data-prof="${esc(r.id)}"><b>${esc(teamTitle)}</b></button>
                <div class="hk-xs hk-muted">${r.teamMode === 'solo' ? esc(r.email) : `Leader: ${esc(r.name)} (${(r.members || []).length + 1})`}${r.college ? ` · ${esc(r.college)}` : ''}</div>
              </td>
              <td>
                ${a?.submittedAtMs
                  ? `<div><b>${a.score}</b> / ${a.total} <span class="hk-chip ${em.testPct >= 75 ? 'gold' : em.testPct >= 50 ? '' : 'warn'}" style="margin-left:4px">${em.testPct}%</span></div><div class="hk-xs hk-muted">${C.ago(a.submittedAtMs)}</div>`
                  : `<span class="hk-chip neutral">${meta ? 'Pending test' : 'No test'}</span>`}
              </td>
              <td>
                ${s
                  ? `<div style="font-weight:700;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.title)}">${esc(s.title)}</div>
                      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;align-items:center">
                        ${s.score != null ? `<span class="hk-chip ${+s.score >= 80 ? 'gold' : ''}">Score ${esc(s.score)}/100</span>` : ''}
                        ${extractProto(s) ? `<span class="hk-chip sky">Proto ✓</span>` : ''}
                        ${projLinks}
                      </div>
                      <div style="margin-top:6px">${subStatusToggleHtml(s)}</div>`
                  : '<span class="hk-xs hk-muted">No project submitted</span>'}
              </td>
              <td>
                ${rankVal >= 0
                  ? `<div class="hk-crit-meter"><b>${rankVal}${subRankBy === 'readiness' ? ' pts' : '%'}</b><div class="bar"><i style="width:${Math.min(100, Math.max(4, rankVal))}%"></i></div></div>`
                  : '<span class="hk-muted hk-xs">Unranked</span>'}
              </td>
              <td>
                <div style="display:grid;gap:5px">
                  ${statusChipHtml(r.status)}
                  ${rounds.length ? `<select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Round">${rounds.map((rd, ri) => `<option value="${ri}" ${(r.stage || 0) === ri ? 'selected' : ''}>${esc(rd.name)}</option>`).join('')}</select>` : ''}
                </div>
              </td>
              <td class="act" style="text-align:right;white-space:nowrap">
                <div style="display:inline-flex;gap:6px;align-items:center;flex-wrap:nowrap">
                  ${s ? `<button type="button" class="hk-btn sm" data-openreview="${esc(s.id)}"><i data-lucide="clipboard-pen"></i>Review</button>` : ''}
                  ${isFinalist
                    ? `<button type="button" class="hk-btn sm gold" data-unfinalist="${esc(r.id)}" title="Round 2 Finalist (click to move back to Shortlisted)"><i data-lucide="award"></i>Finalist ✓</button>`
                    : isShort
                      ? `<button type="button" class="hk-btn sm" data-unshortlist="${esc(r.id)}" title="Shortlisted for Next Round (click to revert)"><i data-lucide="sparkles"></i>Shortlisted ✓</button>`
                      : `<button type="button" class="hk-btn sm primary" data-shortlist="${esc(r.id)}" title="Shortlist this team for Next Round"><i data-lucide="sparkles"></i>Shortlist</button>`}
                  ${mailBtn(r)}
                </div>
              </td>
            </tr>`;
          }).join('')}</tbody></table></div>` : empty('users', regs.length ? 'No matching teams' : 'No participating teams yet', regs.length ? 'Try clearing the search or filter.' : 'Teams appear on the leaderboard once they register, attempt the test, or submit projects.'))
        : (cardList.length ? `<div class="hk-stack">${cardList.map((s, idx) => {
          const r = regOf(s.uid), em = evalMetrics(s.uid);
          const showRank = (subRankBy === 'project' && s.score != null) || (subRankBy === 'test' && em.testPct != null) || (subRankBy === 'combined' && em.combined >= 0);
          const rankCls = idx < 3 ? `top${idx + 1}` : '';
          const teamTitle = r ? (r.teamMode === 'solo' ? `${r.name} (Solo)` : `${r.teamName || 'Team'} · ${r.name}`) : (s.teamName || s.leaderName);
          return `<div class="hk-card-s hk-eval-card ${r?.status === 'selected' ? 'is-selected' : r?.status === 'shortlisted' ? 'is-shortlisted' : ''}" data-sub="${esc(s.id)}">
            <div class="hk-eval-head">
              <div class="eh-left">
                ${r ? `<input type="checkbox" data-subsel="${esc(r.id)}" ${subSel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(s.title)}">` : ''}
                ${showRank ? `<span class="hk-rank ${rankCls}">#${idx + 1}</span>` : ''}
                <div style="min-width:0">
                  <b class="eh-title">${esc(s.title)}</b>
                  <div class="hk-sm hk-muted" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px">
                    ${r ? `<button type="button" class="hk-rowlink" data-prof="${esc(r.id)}"><b>${esc(teamTitle)}</b></button>` : `<span>${esc(teamTitle)}</span>`}
                    ${r?.college ? `<span>· ${esc(r.college)}</span>` : ''}
                    ${r && (r.members || []).length ? `<span>· ${(r.members || []).length + 1} members</span>` : ''}
                    <span>· Updated ${C.ago(s.updatedAtMs)}</span>
                  </div>
                </div>
              </div>
              <div class="eh-badges">
                ${subStatusToggleHtml(s)}
                ${em.testScore != null ? `<span class="hk-chip sky" title="Screening test score"><i data-lucide="clipboard-check"></i>Test ${em.testScore}/${em.testTotal}${em.testPct != null ? ` (${em.testPct}%)` : ''}</span>` : ''}
                ${s.reviewStatus === 'reviewed' ? `<span class="hk-chip gold"><i data-lucide="badge-check"></i>Marked as Reviewed${s.score != null ? ` · ${esc(s.score)}/100` : ''}</span>` : (s.score != null ? `<span class="hk-chip warn">Draft Score ${esc(s.score)}/100</span>` : '')}
                ${r ? statusChipHtml(r.status) : ''}
                ${r && rounds.length ? `<span class="hk-chip neutral">${esc(roundName(r.stage || 0))}</span>` : ''}
              </div>
            </div>

            <p class="hk-sm" style="margin:10px 0;white-space:pre-wrap">${esc(s.idea)}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${link(s.pptUrl, 'PPT')}${link(s.repoUrl, 'Repo')}${link(s.demoUrl, 'Demo')}${link(s.videoUrl, 'Prototype Video')}${link(s.introVideoUrl, 'Intro Video')}${link(s.extraUrl, 'Other')}${subCustomHtml(s)}</div>

            <div class="hk-eval-review">
              <div class="er-inputs">
                <input class="hk-input hk-score-in" type="number" min="0" max="100" placeholder="Score /100" data-score value="${s.score ?? ''}">
                <input class="hk-input" placeholder="Feedback for the team (saved &amp; shown on their dashboard)" data-fb maxlength="500" value="${esc(s.feedback || '')}">
                <button class="hk-btn sm primary" data-review="${esc(s.id)}"><i data-lucide="check"></i>Save &amp; Finalize</button>
              </div>
            </div>

            ${r ? `<div class="hk-eval-decide">
              <div class="ed-pills" role="group" aria-label="Round progression for ${esc(teamTitle)}">
                <span class="hk-xs hk-muted" style="font-weight:700">Decision:</span>
                ${[
                  ['shortlisted', 'sparkles', 'Shortlist (Next Round)'],
                  ['selected', 'award', 'Round 2 Finalist'],
                  ['waitlisted', 'hourglass', 'Waitlist'],
                  ['rejected', 'circle-x', 'Not selected']
                ].map(([stVal, ic, lbl]) => `<button type="button" class="hk-decbtn ${stVal} ${r.status === stVal ? 'on' : ''}" data-quickst="${esc(r.id)}:${stVal}"><i data-lucide="${ic}"></i>${lbl}</button>`).join('')}
              </div>
              <div class="ed-acts">
                ${rounds.length ? `<select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Move round">${rounds.map((x, i) => `<option value="${i}" ${(r.stage || 0) === i ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
                <button type="button" class="hk-btn sm" data-prof="${esc(r.id)}"><i data-lucide="user-round"></i>Profile</button>
                ${mailBtn(r)}
              </div>
            </div>` : ''}
          </div>`;
        }).join('')}</div>` : empty('lightbulb', subs.length ? 'No matching submissions' : 'No submissions yet', subs.length ? 'Try clearing your search or changing the submission filter.' : (h.submission?.open === false ? 'Project submissions are switched off for this hackathon.' : 'Teams submit ideas, project links and PPT links from their dashboard.')))}
    </div>`;
  };

  const getFilteredTestRows = () => {
    const qLower = testQ.trim().toLowerCase();
    const attByUid = new Map(atts.filter(a => a.submittedAtMs).map(a => [a.uid, a]));
    let rows = regs.map(r => ({ r, att: attByUid.get(r.uid) || null, em: evalMetrics(r.uid) }));
    // include orphaned attempts whose registration isn't loaded
    atts.filter(a => a.submittedAtMs && !regOf(a.uid)).forEach(a => {
      rows.push({ r: null, att: a, em: { att: a, testScore: a.score ?? 0, testTotal: a.total ?? meta?.total ?? 0, testPct: a.total ? Math.round(((a.score ?? 0) / a.total) * 100) : 0, sub: subOf(a.uid), subScore: subOf(a.uid)?.score ?? null, combined: -1 } });
    });

    if(testFilter === 'attempted') rows = rows.filter(x => !!x.att);
    else if(testFilter === 'pending') rows = rows.filter(x => !x.att && x.r?.status !== 'rejected');
    else if(testFilter === 'shortlisted') rows = rows.filter(x => x.r?.status === 'shortlisted');
    else if(testFilter === 'selected') rows = rows.filter(x => x.r?.status === 'selected');

    if(qLower){
      rows = rows.filter(x => [x.r?.name, x.r?.email, x.r?.teamName, x.r?.college, x.att?.uid].join(' ').toLowerCase().includes(qLower));
    }

    rows.sort((a, b) => {
      if(testSort === 'combined_desc') return (b.em.combined ?? -1) - (a.em.combined ?? -1);
      if(testSort === 'earliest') return (a.att?.submittedAtMs || Infinity) - (b.att?.submittedAtMs || Infinity);
      return (b.att?.score ?? -1) - (a.att?.score ?? -1) || (a.att?.submittedAtMs || Infinity) - (b.att?.submittedAtMs || Infinity);
    });
    return rows;
  };

  const attStats = a => {
    if(!a?.submittedAtMs) return null;
    if(a.correctCount != null) return { right: a.correctCount, wrong: a.wrongCount || 0, skipped: a.skippedCount || 0 };
    if(!keys?.questions?.length || !a.answers) return null;
    let right = 0, wrong = 0, skipped = 0;
    keys.questions.forEach(q => {
      const pick = a.answers[q.id];
      if(pick === undefined || pick === null) skipped++;
      else if(+pick === +keys.answers[q.id]) right++;
      else wrong++;
    });
    return { right, wrong, skipped };
  };

  function viewAttemptModal(a, r){
    const qs = keys?.questions || [];
    const ans = a.answers || {};
    const st = attStats(a);
    const total = a.total ?? meta?.total ?? 0;
    const pct = total > 0 ? Math.round(((a.score ?? 0) / total) * 100) : 0;
    const who = r ? `${r.name}${r.teamName ? ' · ' + r.teamName : ''}` : a.uid;
    modal(`Test Breakdown · ${who}`, `<div class="hk-stack">
      <div class="hk-to">
        <div class="av">${esc((who || 'T').slice(0, 2).toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <b>${esc(who)}</b>
          <div class="hk-xs hk-muted">Submitted ${C.fmtDT(a.submittedAtMs)}${a.tabSwitches ? ` · ${a.tabSwitches} proctor alert${a.tabSwitches > 1 ? 's' : ''}` : ''}${a.submitReason && a.submitReason !== 'manual' ? ` · ${esc(a.submitReason)}` : ''}</div>
        </div>
        <span class="hk-chip gold">${a.score ?? 0} / ${total} (${pct}%)</span>
      </div>
      ${st ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="hk-chip"><i data-lucide="check"></i>${st.right} Right</span>
        <span class="hk-chip bad"><i data-lucide="x"></i>${st.wrong} Wrong</span>
        <span class="hk-chip neutral">${st.skipped} Skipped</span>
      </div>` : ''}
      ${qs.length ? `<div class="hk-stack" style="gap:10px">${qs.map((q, qi) => {
        const picked = ans[q.id];
        const correctIdx = keys.answers?.[q.id];
        const isSkipped = picked === undefined || picked === null;
        const isRight = !isSkipped && +picked === +correctIdx;
        return `<div class="hk-qa-item ${isRight ? 'ok' : isSkipped ? 'skip' : 'bad'}">
          <div class="qa-head">
            <b>Q${qi + 1}. ${esc(q.text)}</b>
            <span class="hk-chip ${isRight ? '' : isSkipped ? 'neutral' : 'bad'}">${isRight ? `+${q.marks || 1} Right ✓` : isSkipped ? 'Skipped' : '0 Wrong ✗'}</span>
          </div>
          <div class="qa-opts">${q.options.map((opt, oi) => {
            const isC = oi === +correctIdx, isP = !isSkipped && oi === +picked;
            return `<div class="qa-opt ${isC ? 'correct' : ''} ${isP && !isC ? 'picked-bad' : ''}">
              <span>${String.fromCharCode(65 + oi)}</span>
              <b>${esc(opt)}</b>
              ${isC ? '<small>Correct answer</small>' : isP ? '<small>Team picked</small>' : ''}
            </div>`;
          }).join('')}</div>
        </div>`;
      }).join('')}</div>` : '<p class="hk-sm hk-muted">Question breakdown is unavailable because test keys were not found.</p>'}
    </div>`, { wide: true });
  }

  const testTab = () => {
    const done = atts.filter(a => a.submittedAtMs);
    const totalPossible = meta?.total || done[0]?.total || 0;
    const high = done.length ? Math.max(...done.map(a => Number(a.score ?? 0))) : null;
    const avgPct = done.length && totalPossible > 0
      ? Math.round(done.reduce((sum, a) => sum + ((Number(a.score ?? 0) / totalPossible) * 100), 0) / done.length)
      : null;
    const pendCount = regs.filter(r => r.status !== 'rejected' && !done.some(a => a.uid === r.uid)).length;
    const testQualCount = done.filter(a => ['shortlisted', 'selected'].includes(regOf(a.uid)?.status)).length;
    const rows = meta ? getFilteredTestRows() : [];
    const revMs = Number(meta?.resultRevealMs || 0);
    const revScheduled = revMs > Date.now();

    return `<div class="hk-stack">
      <div class="hk-card-s" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b>${meta ? esc(meta.title) : 'No screening test yet'}</b>
            ${meta ? (revScheduled ? `<span class="hk-chip warn">Results hidden until ${C.fmtDT(revMs)}</span>` : '<span class="hk-chip">Results Visible</span>') : ''}
          </div>
          <div class="hk-sm hk-muted">${meta ? `${meta.count} questions · ${meta.durationMin} min · ${meta.total} marks${meta.endMs ? ' · closes ' + C.fmtDT(meta.endMs) : ''}` : 'Create a timed MCQ test. Answers are graded automatically on the server.'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${revScheduled ? '<button type="button" class="hk-btn sm primary" data-revealtest><i data-lucide="eye"></i>Reveal Results Now</button>' : ''}
          ${meta ? '<button class="hk-btn sm danger" data-rmtest>Remove</button>' : ''}
          <button class="hk-btn sm gold" data-test>${meta ? 'Edit test' : 'Create test'}</button>
        </div>
      </div>

      ${meta ? `
      <div class="hk-eval-kpis">
        <div class="hk-ek"><span>Attempted</span><b>${done.length} <small>/ ${regs.length}</small></b></div>
        <div class="hk-ek warn"><span>Pending test</span><b>${pendCount}</b></div>
        <div class="hk-ek gold"><span>Highest score</span><b>${high != null ? `${high}/${totalPossible}` : '—'}</b></div>
        <div class="hk-ek"><span>Average accuracy</span><b>${avgPct != null ? `${avgPct}%` : '—'}</b></div>
        <div class="hk-ek p"><span>Shortlisted / Finalists</span><b>${testQualCount}</b></div>
      </div>

      <div class="hk-toolbar">
        <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="tq" value="${esc(testQ)}" placeholder="Search leader, team, college, email…"></div>
        <select class="hk-select" id="tf" style="width:auto;min-height:46px" aria-label="Filter test results">
          <option value="attempted" ${testFilter === 'attempted' ? 'selected' : ''}>Attempted Leaderboard (${done.length})</option>
          <option value="pending" ${testFilter === 'pending' ? 'selected' : ''}>Not Attempted Yet (${pendCount})</option>
          <option value="all" ${testFilter === 'all' ? 'selected' : ''}>All Registrants (${regs.length})</option>
          <option value="shortlisted" ${testFilter === 'shortlisted' ? 'selected' : ''}>Shortlisted Only</option>
          <option value="selected" ${testFilter === 'selected' ? 'selected' : ''}>Finalists Only</option>
        </select>
        <select class="hk-select" id="ts" style="width:auto;min-height:46px" aria-label="Sort test results">
          <option value="score_desc" ${testSort === 'score_desc' ? 'selected' : ''}>Sort: Highest Test Score</option>
          <option value="combined_desc" ${testSort === 'combined_desc' ? 'selected' : ''}>Sort: Combined (Test + Project)</option>
          <option value="earliest" ${testSort === 'earliest' ? 'selected' : ''}>Sort: Earliest Submitted</option>
        </select>
      </div>

      ${(done.length || (testFilter === 'pending' && pendCount)) ? `<div class="hk-qshortbar">
        <div class="qs-lbl"><i data-lucide="sparkles"></i><b>Screening Test Shortlisting (Next Round)</b><span class="hk-xs hk-muted">Advance top performers from Round 1 screening to the next round</span></div>
        <div class="qs-acts">
          ${done.length ? `<label class="hk-xs">Top <input class="hk-input hk-num-sm" id="topTestN" type="number" min="1" max="${done.length}" value="${topTestN}"></label>
          <button type="button" class="hk-btn sm primary" data-qshort="test-top-shortlist"><i data-lucide="sparkles"></i>Shortlist Top ${topTestN} for Next Round</button>
          <span class="qs-sep"></span>
          <label class="hk-xs">Accuracy ≥ <input class="hk-input hk-num-sm" id="testCut" type="number" min="0" max="100" value="${testCut}">%</label>
          <button type="button" class="hk-btn sm" data-qshort="test-cut">Shortlist ≥ ${testCut}%</button>` : ''}
          ${testFilter === 'pending' && pendCount ? `<button type="button" class="hk-btn sm primary" data-qload-pendingtest><i data-lucide="mail-plus"></i>Load ${pendCount} Pending into Mailer</button>` : ''}
        </div>
      </div>` : ''}

      <div class="hk-bulk ${testSel.size ? 'on' : ''}"><b>${testSel.size} selected</b>
        <select class="hk-select sm" id="bTestSt"><option value="">Set status…</option>${STS.map(x => `<option>${x}</option>`).join('')}</select>
        ${rounds.length ? `<select class="hk-select sm" id="bTestRd"><option value="">Move to round…</option>${rounds.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>` : ''}
        <button class="hk-btn sm" data-bulkmail="test"><i data-lucide="mail"></i>Compose email (${testSel.size})</button>
        <button class="hk-btn sm" data-bulkqueue="test"><i data-lucide="list-plus"></i>Load into Mailer</button>
      </div>

      ${rows.length ? `<div class="hk-tablewrap"><table class="hk-table hk-lb-table"><thead><tr>
        <th><input type="checkbox" id="testSelAll" ${rows.some(x => x.r) && rows.filter(x => x.r).every(x => testSel.has(x.r.id)) ? 'checked' : ''} aria-label="Select all"></th>
        <th>Rank</th><th>Team &amp; Leader</th><th>Score &amp; Right / Wrong</th><th>Project</th><th>Round &amp; Status</th><th class="act" style="text-align:right">Inspect &amp; Next Round</th>
      </tr></thead><tbody>${rows.map((x, i) => {
        const r = x.r, a = x.att, em = x.em;
        const pct = em.testPct;
        const pctCls = pct == null ? 'neutral' : pct >= 75 ? 'gold' : pct >= 50 ? '' : 'warn';
        const rankCls = a && i < 3 ? `top${i + 1}` : '';
        const st = attStats(a);
        const isShort = r?.status === 'shortlisted';
        const isFinalist = r?.status === 'selected';
        return `<tr class="${r && testSel.has(r.id) ? 'sel' : ''} ${isFinalist ? 'hk-row-winner' : ''}">
          <td>${r ? `<input type="checkbox" data-testsel="${esc(r.id)}" ${testSel.has(r.id) ? 'checked' : ''} aria-label="Select ${esc(r.name)}">` : ''}</td>
          <td>${a ? `<span class="hk-rank ${rankCls}">#${i + 1}</span>` : '<span class="hk-muted">—</span>'}</td>
          <td>${r ? `<button type="button" class="hk-rowlink" data-prof="${esc(r.id)}"><b>${esc(r.teamMode === 'solo' ? r.name : (r.teamName || r.name))}</b></button><div class="hk-xs hk-muted">${r.teamMode !== 'solo' ? esc(r.name) + ' · ' : ''}${esc(r.college || r.email)}</div>` : `<b>${esc(a?.uid || 'Unknown')}</b>`}</td>
          <td>${a ? `<div><b>${a.score}</b> / ${a.total} <span class="hk-chip ${pctCls}" style="margin-left:4px">${pct != null ? pct + '%' : 'Done'}</span></div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;align-items:center">
              ${st ? `<span class="hk-chip"><i data-lucide="check"></i>${st.right}</span><span class="hk-chip bad"><i data-lucide="x"></i>${st.wrong}</span>` : ''}
              ${a.tabSwitches ? `<span class="hk-chip warn">${a.tabSwitches} alert</span>` : ''}
            </div>
            <div class="hk-xs hk-muted" style="margin-top:2px">${C.ago(a.submittedAtMs)}</div>` : '<span class="hk-chip warn">Not attempted</span>'}</td>
          <td class="hk-xs">${em.sub ? `<span class="hk-chip">${em.sub.score != null ? `Score ${em.sub.score}` : 'Submitted'}</span>` : '<span class="hk-muted">—</span>'}</td>
          <td>${r ? `<div style="display:grid;gap:4px">${statusChipHtml(r.status)}${rounds.length ? `<select class="hk-select sm" data-stage="${esc(r.id)}" aria-label="Round">${rounds.map((rd, ri) => `<option value="${ri}" ${(r.stage || 0) === ri ? 'selected' : ''}>${esc(rd.name)}</option>`).join('')}</select>` : ''}</div>` : '—'}</td>
          <td class="act" style="text-align:right;white-space:nowrap"><div style="display:inline-flex;gap:6px;align-items:center">
            ${a ? `<button type="button" class="hk-btn sm" data-viewatt="${esc(a.uid)}" title="Inspect Right / Wrong Q&amp;A breakdown"><i data-lucide="list-checks"></i>Q&amp;A</button>` : ''}
            ${r ? (isFinalist
              ? `<button type="button" class="hk-btn sm gold" data-unfinalist="${esc(r.id)}" title="Round 2 Finalist (click to move back to Shortlisted)"><i data-lucide="award"></i>Finalist ✓</button>`
              : isShort
                ? `<button type="button" class="hk-btn sm" data-unshortlist="${esc(r.id)}" title="Shortlisted for Next Round"><i data-lucide="sparkles"></i>Shortlisted ✓</button>`
                : `<button type="button" class="hk-btn sm primary" data-shortlist="${esc(r.id)}" title="Shortlist for Next Round"><i data-lucide="sparkles"></i>Shortlist</button>`) : ''}
            ${r ? mailBtn(r) : ''}
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : empty('clipboard-check', done.length ? 'No matches for this filter' : 'No attempts yet', done.length ? 'Try switching the filter or clearing your search.' : 'Scores, accuracy, and selection rankings appear here once teams submit.')}
      ` : ''}
    </div>`;
  };

  /* ---------- Next Step & Winners Studio Tab (Round 2 Prototype, Logistics, Two-Round Official Winner Selection) ---------- */
  const nextTab = () => {
    const subCfg = C.normalizeSubmissionConfig(h.submission);
    const protoCfg = subCfg.prototype && typeof subCfg.prototype === 'object' ? subCfg.prototype : {};
    const logi = subCfg.logistics && typeof subCfg.logistics === 'object' ? subCfg.logistics : {};
    const winCfg = subCfg.winnerReveal && typeof subCfg.winnerReveal === 'object' ? subCfg.winnerReveal : {};
    const qualifiedRegs = regs.filter(r => ['shortlisted', 'selected'].includes(r.status));
    const finalists = regs.filter(r => r.status === 'selected');
    const protoSubs = subs.map(s => ({ s, r: regOf(s.uid), proto: extractProto(s) })).filter(x => !!x.proto);
    const announcedWinners = winCfg.announced && Array.isArray(winCfg.winners) ? winCfg.winners : [];

    const candidateSource = winPool === 'qualified' && qualifiedRegs.length
      ? qualifiedRegs
      : regs.filter(r => r.status !== 'rejected');

    const rankedCandidates = [...candidateSource]
      .map(r => {
        const em = evalMetrics(r.uid);
        let pts = 0;
        if(winCriteria === 'project') pts = em.subScore ?? -1;
        else if(winCriteria === 'test') pts = em.testPct ?? -1;
        else pts = em.combined;
        const hasProto = !!(em.sub && extractProto(em.sub));
        return { r, em, pts, hasProto };
      })
      .sort((a, b) => (b.r.status === 'selected' ? 1 : 0) - (a.r.status === 'selected' ? 1 : 0) || (b.hasProto ? 1 : 0) - (a.hasProto ? 1 : 0) || b.pts - a.pts || (b.em.subScore ?? -1) - (a.em.subScore ?? -1) || (b.em.testPct ?? -1) - (a.em.testPct ?? -1));

    const placeLabels = ['1st Prize · Champion', '2nd Prize · Runner Up', '3rd Prize · 2nd Runner Up'];
    const firstAnnouncedWin = announcedWinners[0] || null;
    const defaultWinnersMailTarget = (firstAnnouncedWin ? regs.find(r => r.uid === firstAnnouncedWin.uid) : null) || finalists[0] || rankedCandidates[0]?.r || { name: 'Team Leader', email: 'team@example.com', teamName: 'Sample Team', status: 'selected' };
    const winMailPreview = M.buildHackathonEmail('selected', {
      hackathon: h, hackathonId: h.id, reg: defaultWinnersMailTarget,
      winnerPlace: firstAnnouncedWin?.place || placeLabels[0],
      winnerPrize: firstAnnouncedWin?.prize || '',
      round: rounds[rounds.length - 1]?.name || 'Grand Finale',
      org, testMeta: meta,
      att: defaultWinnersMailTarget?.uid ? attOf(defaultWinnersMailTarget.uid) : null,
      sub: defaultWinnersMailTarget?.uid ? subOf(defaultWinnersMailTarget.uid) : null
    });

    return `<div class="hk-stack">
      <div class="hk-card-s hk-rev-banner">
        <div>
          <span class="hk-eyebrow" style="color:var(--hk-p)">Round 2 &amp; Finale Orchestrator</span>
          <h2 style="font-size:1.25rem;margin-top:2px">Prototype Round, Event Logistics &amp; Official Winners</h2>
          <p class="hk-sm hk-muted" style="margin-top:2px">After Round 1 shortlisting (${qualifiedRegs.length} qualified), open the Round 2 Prototype form, mark Finalists, share Online/Offline logistics, and announce Official Winners after both rounds are evaluated.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span class="hk-chip ${qualifiedRegs.length ? '' : 'neutral'}">Shortlisted: ${qualifiedRegs.length}</span>
          <span class="hk-chip ${protoCfg.open ? '' : 'neutral'}">Prototype: ${protoCfg.open ? 'Open' : 'Off'}</span>
          <span class="hk-chip ${finalists.length ? 'sky' : 'neutral'}">Finalists: ${finalists.length}</span>
          <span class="hk-chip ${announcedWinners.length ? 'gold' : 'neutral'}">Winners: ${announcedWinners.length}</span>
        </div>
      </div>

      <!-- 1. Prototype Round Builder -->
      <section class="hk-card-s hk-stack">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0">
            <i data-lucide="rocket"></i>
            <div>
              <h3>1. Round 2 · Prototype / Next Round Submission Form</h3>
              <div class="hk-xs hk-muted">Sent directly to Shortlisted teams' dashboards after Round 1 shortlisting.</div>
            </div>
          </div>
          <span class="hk-chip">${protoSubs.length} Prototype${protoSubs.length === 1 ? '' : 's'} Received</span>
        </div>
        <form id="protoCfgForm" class="hk-form">
          <div class="hk-grid3">
            <div class="hk-field"><label>Prototype Round Status</label>
              <select class="hk-select" name="open">
                <option value="1" ${protoCfg.open ? 'selected' : ''}>Open (Active for Teams)</option>
                <option value="0" ${!protoCfg.open ? 'selected' : ''}>Closed / Hidden</option>
              </select>
            </div>
            <div class="hk-field"><label>Who Can Submit?</label>
              <select class="hk-select" name="audience">
                <option value="shortlisted" ${protoCfg.audience !== 'all' ? 'selected' : ''}>Shortlisted &amp; Finalist Teams (${qualifiedRegs.length})</option>
                <option value="all" ${protoCfg.audience === 'all' ? 'selected' : ''}>All Non-Rejected Teams</option>
              </select>
            </div>
            <div class="hk-field"><label>Prototype Deadline</label>
              <input class="hk-input" type="datetime-local" name="deadline" value="${C.toLocalInput(protoCfg.deadlineMs)}">
            </div>
          </div>
          <div class="hk-grid2">
            <div class="hk-field"><label>Round / Form Title</label>
              <input class="hk-input" name="title" maxlength="90" value="${esc(protoCfg.title || 'Prototype & Final Build Round')}" placeholder="e.g. Round 2 · Working Prototype">
            </div>
            <div class="hk-field"><label>Fields Requested from Participants</label>
              <div style="display:flex;gap:12px;flex-wrap:wrap;padding:8px 12px;border-radius:12px;border:1.5px solid var(--hk-line);background:var(--hk-surface2)">
                <label class="hk-check"><input type="checkbox" name="askRepo" ${protoCfg.askRepo !== false ? 'checked' : ''}><span>GitHub Repo</span></label>
                <label class="hk-check"><input type="checkbox" name="askDemo" ${protoCfg.askDemo !== false ? 'checked' : ''}><span>Prototype Link</span></label>
                <label class="hk-check"><input type="checkbox" name="askVideo" ${protoCfg.askVideo ? 'checked' : ''}><span>Demo Video</span></label>
                <label class="hk-check"><input type="checkbox" name="askExtra" ${protoCfg.askExtra ? 'checked' : ''}><span>Extra Doc</span></label>
              </div>
            </div>
          </div>
          <div class="hk-field"><label>Instructions / Build Requirements</label>
            <textarea class="hk-textarea" name="instructions" style="min-height:76px" maxlength="800" placeholder="e.g. Deploy your working prototype link, push full code to GitHub, and record a 2-minute walkthrough video.">${esc(protoCfg.instructions || '')}</textarea>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
            <button type="submit" class="hk-btn primary"><i data-lucide="save"></i>Save &amp; Push Form to Participants</button>
          </div>
        </form>

        ${protoSubs.length ? `<div class="hk-stack" style="margin-top:8px;padding-top:14px;border-top:1px dashed var(--hk-line)">
          <b class="hk-sm">Round 2 Submitted Prototypes (${protoSubs.length})</b>
          <div class="hk-stack" style="gap:10px">${protoSubs.map(({ s, r, proto }) => {
            const tName = r ? (r.teamMode === 'solo' ? r.name : (r.teamName || r.name)) : (s.teamName || s.leaderName);
            const isFinalist = r?.status === 'selected';
            return `<div class="hk-lrow" style="align-items:flex-start">
              <div class="info">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <b>${esc(proto.title)}</b>
                  <span class="hk-chip neutral">${esc(tName)}</span>
                  ${s.score != null ? `<span class="hk-chip gold">Score ${esc(s.score)}/100</span>` : ''}
                  ${isFinalist ? `<span class="hk-chip gold">Finalist ✓</span>` : ''}
                </div>
                <p class="hk-sm hk-muted" style="margin:4px 0">${esc(proto.details)}</p>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
                  ${link(proto.repoUrl, 'GitHub Repo')}
                  ${link(proto.demoUrl, 'Prototype Link')}
                  ${link(proto.videoUrl, 'Demo Video')}
                  ${link(proto.extraUrl, 'Extra Link')}
                </div>
              </div>
              <div class="acts">
                <button type="button" class="hk-btn sm" data-openreview="${esc(s.id)}"><i data-lucide="clipboard-pen"></i>Score</button>
                ${r ? (isFinalist
                  ? `<button type="button" class="hk-btn sm gold" data-unfinalist="${esc(r.id)}" title="Finalist (click to move back to Shortlisted)"><i data-lucide="award"></i>Finalist ✓</button>`
                  : `<button type="button" class="hk-btn sm primary" data-finalist="${esc(r.id)}" title="Select this team as Finalist for Round 2 / Finale"><i data-lucide="award"></i>Mark Finalist</button>`) : ''}
              </div>
            </div>`;
          }).join('')}</div>
        </div>` : ''}
      </section>

      <!-- 2. Online / Offline Selected Venue & Logistics -->
      <section class="hk-card-s hk-stack">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0">
            <i data-lucide="map-pin"></i>
            <div>
              <h3>2. Official Online / Offline Logistics for Selected Teams</h3>
              <div class="hk-xs hk-muted">Shown directly on participants' dashboards &amp; auto-filled into Winner/Selected emails.</div>
            </div>
          </div>
        </div>
        <form id="logiForm" class="hk-form">
          <div class="hk-grid3">
            <div class="hk-field"><label>Final Round Mode</label>
              <select class="hk-select" name="mode">
                <option value="offline" ${logi.mode === 'offline' ? 'selected' : ''}>Offline (In-Person Campus/Venue)</option>
                <option value="online" ${logi.mode === 'online' ? 'selected' : ''}>Online (Virtual Google Meet)</option>
                <option value="hybrid" ${logi.mode === 'hybrid' ? 'selected' : ''}>Hybrid (Online + Venue)</option>
              </select>
            </div>
            <div class="hk-field"><label>Visible To</label>
              <select class="hk-select" name="visibleTo">
                <option value="selected" ${logi.visibleTo !== 'all' ? 'selected' : ''}>Shortlisted &amp; Selected Teams</option>
                <option value="all" ${logi.visibleTo === 'all' ? 'selected' : ''}>All Registered Teams</option>
              </select>
            </div>
            <div class="hk-field"><label>Reporting Date &amp; Time</label>
              <input class="hk-input" type="datetime-local" name="reportingTime" value="${C.toLocalInput(logi.reportingTime)}">
            </div>
          </div>
          <div class="hk-grid2">
            <div class="hk-field"><label>Venue / Auditorium / Room</label>
              <input class="hk-input" name="venueName" value="${esc(logi.venueName || h.venue || '')}" placeholder="e.g. Main Auditorium, Block C">
            </div>
            <div class="hk-field"><label>Full Address</label>
              <input class="hk-input" name="address" value="${esc(logi.address || [h.college, h.city].filter(Boolean).join(', '))}" placeholder="Campus address &amp; city">
            </div>
          </div>
          <div class="hk-grid2">
            <div class="hk-field"><label>Google Meet / Video Call Link <small>for online/hybrid</small></label>
              <input class="hk-input" type="url" name="meetLink" value="${esc(logi.meetLink || '')}" placeholder="https://meet.google.com/...">
            </div>
            <div class="hk-field"><label>Google Maps Link &amp; Helpdesk <small>optional</small></label>
              <input class="hk-input" name="mapUrl" type="url" value="${esc(logi.mapUrl || '')}" placeholder="https://maps.google.com/...">
            </div>
          </div>
          <div class="hk-grid2">
            <div class="hk-field"><label>Helpdesk / Coordinator Contact</label>
              <input class="hk-input" name="deskContact" value="${esc(logi.deskContact || org.phone || org.email || '')}" placeholder="Phone or email at reporting desk">
            </div>
            <div class="hk-field"><label>Special Reporting Notes</label>
              <input class="hk-input" name="instructions" value="${esc(logi.instructions || '')}" placeholder="e.g. Carry College ID &amp; laptop charger. Check-in starts 9:30 AM.">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button type="submit" class="hk-btn primary"><i data-lucide="check"></i>Save Event Logistics</button>
          </div>
        </form>
      </section>

      <!-- 3. Final Winner Selection (After Two Rounds) + Official Winners Podium + Built-in Emailer -->
      <section class="hk-card-s hk-stack hk-win-studio" id="winSection">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0">
            <i data-lucide="trophy" style="color:var(--hk-gold)"></i>
            <div>
              <h3>3. Decide Official Winners (After Round 1 &amp; Round 2) &amp; Publish Podium</h3>
              <div class="hk-xs hk-muted">Rank Shortlisted &amp; Round 2 Finalist teams by scores, assign 1st / 2nd / 3rd prizes, schedule or reveal immediately, and send Winner Emails.</div>
            </div>
          </div>
          ${winCfg.announced ? `<button type="button" class="hk-btn sm danger" data-unannouncewin>Hide Public Podium</button>` : ''}
        </div>

        <form id="autoWinForm" class="hk-form">
          <div class="hk-grid2" style="grid-template-columns:repeat(auto-fit,minmax(175px,1fr))">
            <div class="hk-field"><label>Candidate Pool</label>
              <select class="hk-select" id="winPoolSel" name="pool">
                <option value="qualified" ${winPool === 'qualified' ? 'selected' : ''}>Shortlisted &amp; Finalists (${qualifiedRegs.length})</option>
                <option value="all" ${winPool === 'all' ? 'selected' : ''}>All Active Teams (${regs.filter(r => r.status !== 'rejected').length})</option>
              </select>
            </div>
            <div class="hk-field"><label>Rank &amp; Pick Criteria</label>
              <select class="hk-select" id="winCritSel" name="criteria">
                <option value="combined" ${winCriteria === 'combined' ? 'selected' : ''}>Combined (Test + Project)</option>
                <option value="project" ${winCriteria === 'project' ? 'selected' : ''}>Project / Prototype Score</option>
                <option value="test" ${winCriteria === 'test' ? 'selected' : ''}>Screening Test Score</option>
              </select>
            </div>
            <div class="hk-field"><label>How Many Top Winners?</label>
              <input class="hk-input" id="winTopNIn" type="number" min="1" max="${Math.max(1, rankedCandidates.length)}" name="topN" value="${Math.min(winTopN, Math.max(1, rankedCandidates.length))}">
            </div>
            <div class="hk-field"><label>Winner Reveal Time <small>blank = Reveal Now</small></label>
              <input class="hk-input" type="datetime-local" name="revealAt" value="${C.toLocalInput(winCfg.revealAtMs)}">
            </div>
          </div>

          ${rankedCandidates.length ? `<div class="hk-stack" style="gap:8px">
            <small class="hk-eyebrow">Preview Top ${Math.min(winTopN, rankedCandidates.length)} Winner Candidates &amp; Assign Prizes</small>
            ${rankedCandidates.slice(0, Math.min(winTopN, rankedCandidates.length)).map((c, idx) => {
              const tName = c.r.teamMode === 'solo' ? c.r.name : (c.r.teamName || c.r.name);
              const existingW = (winCfg.winners || []).find(w => w.uid === c.r.uid);
              return `<div class="hk-win-pick-row">
                <span class="hk-rank top${Math.min(idx + 1, 3)}">#${idx + 1}</span>
                <div style="flex:1;min-width:160px">
                  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    <b>${esc(tName)}</b>
                    ${statusChipHtml(c.r.status)}
                    ${c.hasProto ? '<span class="hk-chip sky">Prototype ✓</span>' : ''}
                  </div>
                  <div class="hk-xs hk-muted">${esc(c.r.name)} · ${c.pts >= 0 ? `Score: <b>${c.pts}%</b>` : 'Not scored yet'}${c.em.sub ? ` · ${esc(c.em.sub.title)}` : ''}</div>
                </div>
                <input class="hk-input" style="max-width:190px;min-height:40px" data-wplace="${esc(c.r.uid)}" value="${esc(existingW?.place || placeLabels[idx] || `${idx + 1}th Place`)}" placeholder="Place label">
                <input class="hk-input" style="max-width:210px;min-height:40px" data-wprize="${esc(c.r.uid)}" value="${esc(existingW?.prize || '')}" placeholder="Prize (e.g. ₹25,000 + Trophy)">
              </div>`;
            }).join('')}
          </div>` : '<p class="hk-sm hk-muted">Shortlist teams from Round 1 first (or switch Candidate Pool to All Active Teams).</p>'}

          <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
            <button type="submit" class="hk-btn gold lg" ${rankedCandidates.length ? '' : 'disabled'}><i data-lucide="trophy"></i>Decide Winners &amp; Publish Official Podium</button>
          </div>
        </form>

        ${announcedWinners.length ? `<div class="hk-winners-box" style="margin-top:8px">
          <div class="wb-head">
            <div style="display:flex;align-items:center;gap:8px"><span class="hk-win-ic"><i data-lucide="trophy"></i></span><div><b>Official Announced Winners (${announcedWinners.length})</b><div class="hk-xs hk-muted">${winCfg.revealAtMs && winCfg.revealAtMs > Date.now() ? `Countdown live · reveals ${C.fmtDT(winCfg.revealAtMs)}` : 'Live on participants\' dashboards & My Hackathons cards'}</div></div></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="hk-btn sm primary" data-tab="certs"><i data-lucide="award"></i>Generate Winner Certificates</button>
              <button type="button" class="hk-btn sm gold" data-mailwinners><i data-lucide="send"></i>Open Auto-Emailer for Winners</button>
            </div>
          </div>
          <div class="hk-winners-grid">${announcedWinners.map((wMeta, wi) => {
            const w = regs.find(x => x.uid === wMeta.uid) || { id: wMeta.regId || '', uid: wMeta.uid, name: wMeta.leaderName || 'Winner', teamName: wMeta.teamName || '', email: '', phone: '' };
            const tName = wMeta.teamName || w.teamName || w.name;
            return `<div class="hk-winner-card">
              <div class="wc-top"><span class="hk-rank top${Math.min(wi + 1, 3)}">${esc(wMeta.place || `Winner #${wi + 1}`)}</span>${wMeta.prize ? `<span class="hk-chip gold">${esc(wMeta.prize)}</span>` : ''}</div>
              ${w.id ? `<button type="button" class="hk-rowlink" data-prof="${esc(w.id)}"><b>${esc(tName)}</b></button>` : `<b>${esc(tName)}</b>`}
              <div class="hk-xs hk-muted">${esc(w.name)}${w.email ? ' · ' + esc(w.email) : ''}</div>
              ${w.id ? `<div class="wc-acts">
                <button type="button" class="hk-btn sm primary" data-winchan="${esc(w.id)}:platform"><i data-lucide="sparkles"></i>Auto Email</button>
                <button type="button" class="hk-btn sm" data-winchan="${esc(w.id)}:gmail"><i data-lucide="mail"></i>Gmail</button>
                ${w.phone ? `<button type="button" class="hk-btn sm" data-winchan="${esc(w.id)}:whatsapp"><i data-lucide="message-circle"></i>WhatsApp</button>` : ''}
              </div>` : ''}
            </div>`;
          }).join('')}</div>

          <div class="hk-mailprev" style="margin-top:4px">
            <div class="mh" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <div><small style="opacity:.8;letter-spacing:.1em;text-transform:uppercase;display:block;font-size:.66rem">Live Auto-Filled Winner Message Preview (Includes Online/Offline Logistics &amp; Prize)</small><span>${esc(winMailPreview.subject)}</span></div>
              <div style="display:flex;gap:6px">
                <button type="button" class="hk-btn sm" style="background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.35);color:#fff" data-wprevtoggle>${winMailMode === 'whatsapp' ? 'View Email Format' : 'View WhatsApp Format'}</button>
              </div>
            </div>
            <pre class="mb hk-mailpre">${esc(winMailMode === 'whatsapp' ? winMailPreview.whatsappText : winMailPreview.body)}</pre>
          </div>
        </div>` : ''}
      </section>
    </div>`;
  };

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
    const first = mailer.queue.find(x => !x.sent) || mailer.queue[0] || regs[0] || { name: 'Team Leader', email: 'team@example.com', teamMode: 'team', teamName: 'Sample Team' };
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

  const certOf = (uid, category) => certs.find(c => c.uid === uid && c.category === category);
  const getSavedSignatory = () => HC.resolveHostSignature(ownerProfile || S.hk, h, S.hk);
  const getWinnerCandidates = () => {
    const winCfg = h.submission?.winnerReveal || {};
    const announced = Array.isArray(winCfg.winners) ? winCfg.winners : [];
    if(announced.length){
      return announced.map((w, idx) => {
        const reg = regs.find(x => (w.uid && x.uid === w.uid) || (w.regId && x.id === w.regId))
          || { id: w.regId || `${h.id}_${w.uid}`, uid: w.uid, name: w.leaderName || w.teamName || 'Winner', teamName: w.teamName || '', teamMode: w.teamName ? 'team' : 'solo', college: w.college || '', email: '' };
        const sub = subOf(reg.uid);
        return {
          reg,
          rank: idx + 1,
          defaultRankTitle: w.place || HC.rankLabelForIndex(idx),
          prize: w.prize || '',
          projectTitle: w.projectTitle || sub?.title || '',
          scoreLabel: w.scoreLabel || '',
          isAnnounced: true
        };
      }).filter(x => x.reg?.uid);
    }
    const finalists = regs.filter(r => r.status === 'selected')
      .map(r => ({ r, em: evalMetrics(r.uid) }))
      .sort((a, b) => b.em.combined - a.em.combined || (b.em.subScore ?? -1) - (a.em.subScore ?? -1));
    return finalists.map((x, idx) => ({
      reg: x.r,
      rank: idx + 1,
      defaultRankTitle: HC.rankLabelForIndex(idx),
      prize: '',
      projectTitle: x.em.sub?.title || '',
      scoreLabel: x.em.combined >= 0 ? `${x.em.combined}%` : '',
      isAnnounced: false
    }));
  };

  const getParticipantOnlyRegs = () => HC.excludeWinnersFromParticipants(regs, getWinnerCandidates().map(w => w.reg.uid));

  function certsTab(){
    const sig = getSavedSignatory();
    const hasSig = sig.configured;
    const winnerList = getWinnerCandidates();
    if(!certWinInit && winnerList.length){
      winnerList.forEach(w => certWinSel.add(w.reg.uid));
      certWinInit = true;
    }

    const partOnlyRegs = getParticipantOnlyRegs();
    const partOnlyUids = new Set(partOnlyRegs.map(r => r.uid));
    certPartSel.forEach(uid => { if(!partOnlyUids.has(uid)) certPartSel.delete(uid); });
    const pq = certPartQ.trim().toLowerCase();
    const filteredParts = partOnlyRegs.filter(r => !pq || [r.name, r.teamName, r.email, r.college].join(' ').toLowerCase().includes(pq));
    const activeIssuedCount = certs.filter(c => c.status !== 'revoked').length;
    const formInitName = sig.name || org.name || S.hk?.displayName || '';
    const formInitTitle = sig.title || org.designation || (org.org ? `Organiser, ${org.org}` : 'Hackathon Organiser');

    const sigBanner = (hasSig && !editingSig) ? `<section class="hkc-sig-banner">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="hkc-sig-preview">${HC.signatureSvgHtml(sig.name, '#0C5535')}</div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <b>${esc(sig.name)}</b>
            <span class="hk-chip hkc-green"><i data-lucide="badge-check"></i>Digital Signature Active</span>
          </div>
          <div class="hk-xs hk-muted">${esc(sig.title)} &middot; Automatically stamps all future certificates in this &amp; upcoming hackathons</div>
        </div>
      </div>
      <button type="button" class="hk-btn sm" id="editSigBtn"><i data-lucide="pencil"></i>Edit Signatory</button>
    </section>` : `<section class="hk-card-s hk-stack">
      <div class="hk-sub-head">
        <div class="dh" style="margin-bottom:0">
          <i data-lucide="pen-tool"></i>
          <div>
            <h3>${hasSig ? 'Update Saved Digital Signature' : 'One-Time Digital Signatory Setup'}</h3>
            <div class="hk-xs hk-muted">Enter your full name once below. It stays saved on your host profile and automatically updates all future certificates with your digital signature.</div>
          </div>
        </div>
        ${hasSig ? `<button type="button" class="hk-btn sm ghost" id="cancelSigBtn">Cancel</button>` : ''}
      </div>
      <form id="sigSetupForm" class="hk-form">
        <div class="hk-grid2" style="align-items:start">
          <div class="hk-stack" style="gap:12px">
            <div class="hk-field">
              <label for="sigNameIn">Full Signatory Name *</label>
              <input class="hk-input" id="sigNameIn" name="sigName" required maxlength="60" value="${esc(formInitName)}" placeholder="e.g. Dr. Riya Sharma">
            </div>
            <div class="hk-field">
              <label for="sigTitleIn">Designation / Title <small>shown below signature</small></label>
              <input class="hk-input" id="sigTitleIn" name="sigTitle" maxlength="80" value="${esc(formInitTitle)}" placeholder="e.g. Convenor / Organiser, ${esc(org.org || h.college || 'Campus Club')}">
            </div>
            ${activeIssuedCount ? `<label class="hk-check"><input type="checkbox" id="sigSyncExistingCb"><span>Also re-sign all ${activeIssuedCount} active certificate${activeIssuedCount === 1 ? '' : 's'} already issued in this hackathon</span></label>` : ''}
          </div>
          <div id="sigLiveStamp">${HC.signatureStampPreviewHtml(formInitName, formInitTitle)}</div>
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button type="submit" class="hk-btn primary"><i data-lucide="badge-check"></i>Save Digital Signature Permanently</button>
        </div>
      </form>
    </section>`;

    const winnerGenHtml = winnerList.length ? `<div class="hk-stack" style="gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <label class="hk-check" style="margin:0;font-weight:700"><input type="checkbox" id="certWinAll" ${winnerList.every(w => certWinSel.has(w.reg.uid)) ? 'checked' : ''}><span>Select All Winners (${winnerList.length})</span></label>
        <span class="hk-xs hk-muted">${winnerList[0]?.isAnnounced ? 'Auto-loaded from Official Announced Winners' : 'Auto-loaded from Round 2 Finalists'}</span>
      </div>
      <div class="hkc-check-list">${winnerList.map(w => {
        const uid = w.reg.uid;
        const tName = w.reg.teamMode === 'team' && w.reg.teamName ? `Team ${w.reg.teamName} · ` : '';
        const existing = certOf(uid, 'winner');
        const rankVal = certRankOverrides.has(uid) ? certRankOverrides.get(uid) : w.defaultRankTitle;
        return `<div class="hkc-check-row">
          <input type="checkbox" data-cwsel="${esc(uid)}" ${certWinSel.has(uid) ? 'checked' : ''} aria-label="Select ${esc(w.reg.name)}">
          <span class="hk-rank top${Math.min(w.rank, 3)}">#${w.rank}</span>
          <div style="flex:1;min-width:170px">
            <b>${esc(w.reg.name)}</b>
            <div class="hk-xs hk-muted">${esc(tName)}${esc(w.reg.college || '')}${w.prize ? ` · ${esc(w.prize)}` : ''}</div>
          </div>
          <input class="hk-input" style="max-width:240px;min-height:38px" data-cwrank="${esc(uid)}" value="${esc(rankVal)}" placeholder="Rank / Title on Certificate">
          ${existing && existing.status !== 'revoked' ? '<span class="hk-chip hkc-green"><i data-lucide="check-circle-2"></i>Issued</span>' : '<span class="hk-chip neutral">Ready</span>'}
        </div>`;
      }).join('')}</div>
      <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="hk-btn gold lg" id="genWinCertsBtn" ${hasSig && certWinSel.size ? '' : 'disabled'}><i data-lucide="award"></i>Generate Winner Certificates (${certWinSel.size})</button>
      </div>
    </div>` : empty('trophy', 'No Winners or Finalists Selected Yet', 'Announce winners in the Next Step & Winners tab (or mark Finalists) so their ranks auto-load here.', '<button type="button" class="hk-btn primary sm" data-tab="next">Open Next Step &amp; Winners</button>');

    const partGenHtml = partOnlyRegs.length ? `<div class="hk-stack" style="gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div class="hk-chseg" role="group" aria-label="Participant certificate audience">
          <button type="button" class="${certPartScope === 'all' ? 'on' : ''}" data-cpscope="all"><i data-lucide="users"></i>All Participants (${partOnlyRegs.length})</button>
          <button type="button" class="${certPartScope === 'specific' ? 'on' : ''}" data-cpscope="specific"><i data-lucide="user-check"></i>Specific Participants (${certPartSel.size})</button>
        </div>
        <span class="hk-xs hk-muted">${winnerList.length ? `Excludes ${winnerList.length} winner${winnerList.length === 1 ? '' : 's'} (awarded Winner Certificates) · ` : ''}Generates <b>Certificate of Participation</b> with Campus Connect One branding.</span>
      </div>
      ${certPartScope === 'specific' ? `<div class="hk-stack" style="gap:8px">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="hk-search" style="flex:1;min-width:200px"><i data-lucide="search"></i><input class="hk-input" id="cpSearch" value="${esc(certPartQ)}" placeholder="Search participant name, team, email or college…"></div>
          <label class="hk-check" style="margin:0;font-weight:700"><input type="checkbox" id="cpSelAll" ${filteredParts.length && filteredParts.every(r => certPartSel.has(r.uid)) ? 'checked' : ''}><span>Select Matching (${filteredParts.length})</span></label>
        </div>
        <div class="hkc-check-list">${filteredParts.map(r => {
          const ex = certOf(r.uid, 'participant');
          return `<label class="hkc-check-row" style="cursor:pointer">
            <input type="checkbox" data-cpsel="${esc(r.uid)}" ${certPartSel.has(r.uid) ? 'checked' : ''}>
            <div style="flex:1;min-width:170px">
              <b>${esc(r.name)}</b>${r.teamMode === 'team' && r.teamName ? ` <span class="hk-chip neutral">${esc(r.teamName)}</span>` : ''}
              <div class="hk-xs hk-muted">${esc(r.email || '')}${r.college ? ` · ${esc(r.college)}` : ''}</div>
            </div>
            ${ex && ex.status !== 'revoked' ? '<span class="hk-chip hkc-green"><i data-lucide="check-circle-2"></i>Issued</span>' : '<span class="hk-chip neutral">Not issued</span>'}
          </label>`;
        }).join('')}</div>
      </div>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="hk-btn primary lg" id="genPartCertsBtn" ${hasSig && (certPartScope === 'all' ? partOnlyRegs.length : certPartSel.size) ? '' : 'disabled'}><i data-lucide="award"></i>Generate Participation Certificates (${certPartScope === 'all' ? partOnlyRegs.length : certPartSel.size})</button>
      </div>
    </div>` : empty('users', winnerList.length ? 'All Active Teams Are Winners' : 'No Active Participants Yet', winnerList.length ? 'Winners receive official Winner Certificates in the For Winners section — they are automatically excluded from Participation Certificates.' : 'Registered teams will appear here once registrations come in.');

    // Symmetrical Issued Dashboard Filtering
    const cq = certSearch.trim().toLowerCase();
    const visibleCerts = certs.filter(c => {
      if(certFilter === 'revoked' ? c.status !== 'revoked' : c.status === 'revoked') return false;
      if(certFilter === 'winner' && c.category !== 'winner') return false;
      if(certFilter === 'participant' && c.category !== 'participant') return false;
      if(certFilter === 'engaged' && !c.certDownloadAtMs && !c.certShareAtMs && !c.certLinkedInAtMs) return false;
      if(!cq) return true;
      const reg = regOf(c.uid);
      return [c.name, c.teamName, c.rankTitle, HC.certCode(c.id), reg?.email || '', reg?.college || ''].join(' ').toLowerCase().includes(cq);
    });

    const activeIssued = certs.filter(c => c.status !== 'revoked');
    const winCount = activeIssued.filter(c => c.category === 'winner').length;
    const partCount = activeIssued.filter(c => c.category === 'participant').length;
    const dlCount = activeIssued.filter(c => c.certDownloadAtMs).length;
    const shCount = activeIssued.filter(c => c.certShareAtMs).length;
    const liCount = activeIssued.filter(c => c.certLinkedInAtMs).length;
    const engagedCount = activeIssued.filter(c => c.certDownloadAtMs || c.certShareAtMs || c.certLinkedInAtMs).length;
    const revCount = certs.filter(c => c.status === 'revoked').length;

    return `<div class="hk-stack">
      ${sigBanner}

      <section class="hk-card-s hk-stack">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0">
            <i data-lucide="award"></i>
            <div>
              <h3>Generate Official Hackathon Certificates</h3>
              <div class="hk-xs hk-muted">Crisp white Canva-editorial design · Campus Connect One + ${esc(h.brandName || h.college || 'Organiser')} branding &middot; Scannable QR verify</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button type="button" class="hk-btn sm primary" id="openBulkGenBtn" ${partOnlyRegs.length || winnerList.length ? '' : 'disabled'}><i data-lucide="layers"></i>Bulk Generate</button>
            <div class="hk-chseg" role="group" aria-label="Certificate generation category">
              <button type="button" class="${certMode === 'winners' ? 'on' : ''}" data-cmode="winners"><i data-lucide="trophy"></i>For Winners (${winnerList.length})</button>
              <button type="button" class="${certMode === 'participants' ? 'on' : ''}" data-cmode="participants"><i data-lucide="users"></i>For Participants (${partOnlyRegs.length})</button>
            </div>
          </div>
        </div>

        <div class="hk-grid2" style="align-items:end;padding:12px 14px;border-radius:14px;background:var(--hk-surface2);border:1px solid var(--hk-line)">
          <div class="hk-field" style="margin:0">
            <label for="certDateIn">Official Hackathon Date <small>pre-filled from event dates · editable</small></label>
            <input class="hk-input" id="certDateIn" value="${esc(certDateLabel)}" maxlength="64" placeholder="e.g. 18 – 20 Nov 2026">
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button type="button" class="hk-btn sm" id="certResetDateBtn"><i data-lucide="rotate-ccw"></i>Use Event Date (${esc(HC.defaultEventDateLabel(h))})</button>
            ${!hasSig ? `<span class="hk-xs" style="color:var(--hk-warn);font-weight:700">Save your Digital Signature above first to enable generation.</span>` : ''}
          </div>
        </div>

        ${certMode === 'winners' ? winnerGenHtml : partGenHtml}
      </section>

      <section class="hk-card-s hk-stack">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0">
            <i data-lucide="shield-check"></i>
            <div>
              <h3>Issued Certificates &amp; Live Activity Tracker</h3>
              <div class="hk-xs hk-muted">Green indicators light up live whenever recipients download, share, or add to LinkedIn.</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <span class="hk-chip gold">${winCount} Winner</span>
            <span class="hk-chip">${partCount} Participant</span>
            <span class="hk-chip ${dlCount ? 'hkc-green' : 'neutral'}"><span class="hkc-dot ${dlCount ? 'on' : ''}"></span>${dlCount} Downloaded</span>
            <span class="hk-chip ${shCount ? 'hkc-green' : 'neutral'}"><span class="hkc-dot ${shCount ? 'on' : ''}"></span>${shCount} Shared</span>
            <span class="hk-chip ${liCount ? 'hkc-green' : 'neutral'}"><span class="hkc-dot ${liCount ? 'on' : ''}"></span>${liCount} LinkedIn</span>
          </div>
        </div>

        <div class="hk-toolbar">
          <div class="hk-search"><i data-lucide="search"></i><input class="hk-input" id="certSearchIn" value="${esc(certSearch)}" placeholder="Search recipient, team, email, rank or certificate ID…"></div>
          <div class="hk-chips" style="margin:0">
            <button type="button" class="hk-chip btn ${certFilter === 'all' ? 'on' : ''}" data-cfilt="all">All (${activeIssued.length})</button>
            <button type="button" class="hk-chip btn ${certFilter === 'winner' ? 'on' : ''}" data-cfilt="winner">Winners (${winCount})</button>
            <button type="button" class="hk-chip btn ${certFilter === 'participant' ? 'on' : ''}" data-cfilt="participant">Participants (${partCount})</button>
            <button type="button" class="hk-chip btn ${certFilter === 'engaged' ? 'on' : ''}" data-cfilt="engaged">Engaged (${engagedCount})</button>
            ${revCount ? `<button type="button" class="hk-chip btn ${certFilter === 'revoked' ? 'on' : ''}" data-cfilt="revoked">Revoked (${revCount})</button>` : ''}
          </div>
        </div>

        ${visibleCerts.length ? `<div class="hkc-host-grid">${visibleCerts.map(c => {
          const isWin = c.category === 'winner';
          const isRev = c.status === 'revoked';
          const reg = regOf(c.uid);
          const verify = HC.certVerifyUrl(c.id);
          const code = HC.certCode(c.id);
          const dlOn = !!c.certDownloadAtMs;
          const shOn = !!c.certShareAtMs;
          const liOn = !!c.certLinkedInAtMs;
          const doneCount = (dlOn ? 1 : 0) + (shOn ? 1 : 0) + (liOn ? 1 : 0);
          return `<article class="hkc-host-card ${isWin ? 'is-win' : ''} ${isRev ? 'is-revoked' : ''} ${doneCount > 0 ? 'has-activity' : ''} ${doneCount === 3 ? 'all-engaged' : ''}">
            <div class="hkc-hc-top">
              <span class="hk-chip ${isWin ? 'gold' : ''}"><i data-lucide="${isWin ? 'trophy' : 'award'}"></i>${esc(isWin ? c.rankTitle : 'Participant')}</span>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="hk-chip ${doneCount > 0 ? 'hkc-green' : 'neutral'}" style="font-size:.68rem;padding:2px 8px" title="${doneCount} of 3 actions completed (Downloaded, Shared, LinkedIn)">
                  <span class="hkc-dot ${doneCount > 0 ? 'on' : ''}"></span>
                  ${doneCount === 3 ? '3/3 Active ✓' : doneCount > 0 ? `${doneCount}/3 Active` : 'Issued'}
                </span>
                <span class="hkc-hc-id">${esc(code)}</span>
              </div>
            </div>
            <div class="hkc-hc-meta">
              <b>${esc(c.name)}</b>
              <div class="hk-xs hk-muted">${c.teamName ? `Team ${esc(c.teamName)} · ` : ''}${esc(reg?.email || c.college || 'Verified Recipient')}</div>
              <div class="hk-xs hk-muted">Date: <b>${esc(c.eventDateLabel)}</b> · Signed by ${esc(c.signatoryName)}</div>
            </div>
            <div class="hkc-seg-bar" aria-label="Certificate activity progress">
              <span class="${dlOn ? 'on' : ''}" title="${dlOn ? 'Downloaded ' + C.ago(c.certDownloadAtMs) : 'Pending download'}"></span>
              <span class="${shOn ? 'on' : ''}" title="${shOn ? 'Shared ' + C.ago(c.certShareAtMs) : 'Pending share'}"></span>
              <span class="${liOn ? 'on' : ''}" title="${liOn ? 'Added to LinkedIn ' + C.ago(c.certLinkedInAtMs) : 'Pending LinkedIn'}"></span>
            </div>
            <div class="hkc-hc-track">${HC.certStatusChipsHtml(c, { compact: true })}</div>
            <div class="hkc-hc-url">
              <i data-lucide="qr-code" style="width:14px;height:14px;flex:none"></i>
              <span>${esc(verify)}</span>
              <button type="button" class="hk-btn sm ghost" data-certcopy="${esc(c.id)}" title="Copy verify link" style="padding:2px 6px;min-height:24px"><i data-lucide="copy"></i></button>
            </div>
            <div class="hkc-hc-acts">
              <button type="button" class="hk-btn sm primary" data-certprev="${esc(c.id)}"><i data-lucide="eye"></i>Preview</button>
              <a class="hk-btn sm" href="${esc(verify)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>Verify</a>
              ${isRev
                ? `<button type="button" class="hk-btn sm" data-certreissue="${esc(c.id)}"><i data-lucide="rotate-ccw"></i>Restore</button>`
                : `<button type="button" class="hk-btn sm danger" data-certrevoke="${esc(c.id)}"><i data-lucide="ban"></i>Revoke</button>`}
            </div>
          </article>`;
        }).join('')}</div>` : empty('award', certs.length ? 'No matching certificates' : 'No certificates generated yet', certs.length ? 'Try changing your filter or search query.' : 'Save your Digital Signature and click Generate above — generated certificates appear here symmetrically with live participant download/share/LinkedIn status.')}
      </section>
    </div>`;
  }

  const updateMailerPreviewDom = () => {
    const prev = getMailerPreviewData();
    const sEl = $('#mtPrevSubj'), bEl = $('#mtPrevBody');
    if(sEl) sEl.textContent = prev.subject;
    if(bEl) bEl.textContent = mailer.previewMode === 'whatsapp' ? prev.whatsappText : prev.body;
  };

  const renderActiveTab = () => {
    try {
      return tab === 'regs' ? regsTab()
        : tab === 'mail' ? mailTab()
        : tab === 'subs' ? subsTab()
        : tab === 'next' ? nextTab()
        : tab === 'certs' ? certsTab()
        : testTab();
    } catch(err){
      console.error('[HK Manage] Tab render error:', tab, err);
      return `<div class="hk-card-s" style="border-color:color-mix(in srgb,var(--hk-bad) 40%,var(--hk-line))">
        <b>Could not render this section</b>
        <p class="hk-sm hk-muted" style="margin:6px 0 12px">${esc(err?.message || 'Unexpected rendering error')}</p>
        <button type="button" class="hk-btn sm primary" data-tab="regs">Return to Registrations</button>
      </div>`;
    }
  };

  const setTab = t => { if(!t) return; tab = t; paint(); };
  const paint = () => {
    const closed = h.registrationClosed, mailed = regs.filter(r => M.isMailSent(r, null, localMail)).length;
    const issuedCount = certs.filter(c => c.status !== 'revoked').length;
    view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="${esc(cx.backHash || '#/host')}" style="margin-bottom:10px"><i data-lucide="arrow-left"></i>${cx.backLabel || 'Dashboard'}</a>
      <div class="hk-page-h"><div><span class="hk-eyebrow" style="color:var(--hk-gold)">Manage</span><h1>${esc(h.title)}</h1><p>${statusBadge(h.status)} <span class="hk-chip ${ph.tone}">${ph.label}</span></p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${cx.viewHref ? `<a class="hk-btn" href="${esc(cx.viewHref)}"><i data-lucide="eye"></i>View page</a>` : `<a class="hk-btn" href="#/h/${h.id}"><i data-lucide="eye"></i>View page</a>`}<button type="button" class="hk-btn" data-announce><i data-lucide="megaphone"></i>Announce</button><button type="button" class="hk-btn" data-csv><i data-lucide="file-spreadsheet"></i>CSV</button><button type="button" class="hk-btn primary" data-pdf><i data-lucide="file-down"></i>PDF</button></div></div>
      <div class="hk-kpis"><div class="hk-kpi"><div class="ki"><i data-lucide="users"></i></div><strong>${regs.length}</strong><span>Registrations${h.maxParticipants ? ` / ${h.maxParticipants}` : ''}</span></div>
        <div class="hk-kpi g"><div class="ki"><i data-lucide="user-check"></i></div><strong>${regs.filter(r => ['shortlisted', 'selected'].includes(r.status)).length}</strong><span>Shortlisted / selected</span></div>
        <div class="hk-kpi c"><div class="ki"><i data-lucide="lightbulb"></i></div><strong>${subs.length}</strong><span>Submissions</span></div>
        <div class="hk-kpi s"><div class="ki"><i data-lucide="mail-check"></i></div><strong>${mailed}</strong><span>Teams emailed</span></div></div>
      <div class="hk-card-s" style="margin:14px 0;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between"><div><b>Registration is ${closed ? 'closed' : 'open'}</b><div class="hk-sm hk-muted">${h.regDeadlineMs ? 'Deadline ' + C.fmtDT(h.regDeadlineMs) + '. ' : ''}Automatic emails are <b>${h.autoEmail === false ? 'off' : 'on'}</b>.</div></div><button type="button" class="hk-btn sm ${closed ? 'primary' : ''}" data-toggle>${closed ? 'Reopen registration' : 'End registration now'}</button></div>
      <div class="hk-tabs" role="tablist">${[['regs', 'users', `Registrations (${regs.length})`], ['subs', 'trophy', `Review Submissions (${subs.length})`], ['test', 'clipboard-check', 'Test'], ['next', 'rocket', 'Next Step & Winners'], ['mail', 'mail', `Mailer & Outreach`], ['certs', 'award', `Certificates${issuedCount ? ` (${issuedCount})` : ''}`]].map(([k, ic, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-tab="${k}" role="tab" aria-selected="${tab === k ? 'true' : 'false'}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
      <div id="tabBody">${renderActiveTab()}</div></div>`;
    icons();
    try { bindNextTabForms(); } catch(err){ console.error('[HK Manage] Form bind error:', err); }
    try { bindCertTabForms(); } catch(err){ console.error('[HK Manage] Cert bind error:', err); }
  };
  const redrawRows = () => {
    const b = $('#tabBody');
    if(!b) return;
    if(['regs', 'mail', 'subs', 'test', 'next', 'certs'].includes(tab)){
      const k = document.activeElement?.id, pos = document.activeElement?.selectionStart;
      b.innerHTML = renderActiveTab();
      icons();
      try { bindNextTabForms(); } catch(err){ console.error('[HK Manage] Form bind error:', err); }
      try { bindCertTabForms(); } catch(err){ console.error('[HK Manage] Cert bind error:', err); }
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

  /* ---------- Review Submission Modal (for Leaderboard) ---------- */
  function openReviewModal(s){
    const r = regOf(s.uid), em = evalMetrics(s.uid);
    const teamTitle = r ? (r.teamMode === 'solo' ? r.name : (r.teamName || r.name)) : (s.teamName || s.leaderName);
    const winCfg = h.submission?.winnerReveal;
    const winEntry = winCfg?.announced && Array.isArray(winCfg.winners)
      ? winCfg.winners.find(w => (r?.uid && w.uid === r.uid) || (r?.id && w.regId === r.id) || (s?.uid && w.uid === s.uid))
      : null;
    const reviewStepper = applicationStepperHtml({
      reg: r || { status: 'registered' },
      sub: s,
      hasSubmission: true,
      att: em.att,
      isWinner: !!winEntry,
      winPlace: winEntry?.place || '',
      compact: true
    });
    modal(`Review Submission · ${s.title}`, `<form id="revModForm" class="hk-form">
      <div class="hk-to">
        <div class="av">${esc((teamTitle || 'T').slice(0, 2).toUpperCase())}</div>
        <div style="min-width:0;flex:1">
          <b>${esc(teamTitle)}</b>
          <div class="hk-xs hk-muted">${r ? `${esc(r.name)} · ${esc(r.college || r.email)}` : esc(s.leaderName)} · Updated ${C.ago(s.updatedAtMs)}</div>
        </div>
        ${em.testScore != null ? `<span class="hk-chip sky">Test ${em.testScore}/${em.testTotal} (${em.testPct}%)</span>` : ''}
        ${r ? statusChipHtml(r.status) : ''}
      </div>

      ${reviewStepper}

      <div class="hk-card-s" style="padding:12px 14px">
        <small class="hk-eyebrow" style="display:block;margin-bottom:4px">Project Idea &amp; Approach</small>
        <p class="hk-sm" style="margin:0;white-space:pre-wrap;line-height:1.5">${esc(s.idea)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${link(s.pptUrl, 'PPT')}${link(s.repoUrl, 'Repo')}${link(s.demoUrl, 'Demo')}${link(s.videoUrl, 'Prototype Video')}${link(s.introVideoUrl, 'Intro Video')}${link(s.extraUrl, 'Other')}${subCustomHtml(s)}</div>
      </div>

      <div class="hk-grid2" style="grid-template-columns:150px 1fr">
        <div class="hk-field"><label for="rmScore">Review Score (0–100)</label><input class="hk-input" id="rmScore" name="score" type="number" min="0" max="100" placeholder="e.g. 88" value="${s.score ?? ''}"></div>
        <div class="hk-field"><label for="rmFb">Judge Feedback <small>visible to team</small></label><input class="hk-input" id="rmFb" name="feedback" maxlength="500" placeholder="Share strengths, criteria notes, or suggestions…" value="${esc(s.feedback || '')}"></div>
      </div>

      <div class="hk-field">
        <label>Review Status <small>Finalized disables student editing &amp; shows "Marked as Reviewed"</small></label>
        <div class="hk-chseg" id="rmRevMode" role="group" aria-label="Review status mode">
          <button type="button" class="${s.reviewStatus !== 'reviewed' ? 'on' : ''}" data-rmst="reviewing"><i data-lucide="hourglass"></i>Reviewing (Keep Editable)</button>
          <button type="button" class="${s.reviewStatus === 'reviewed' ? 'on' : ''}" data-rmst="reviewed"><i data-lucide="lock"></i>Finalized (Marked as Reviewed)</button>
        </div>
        <input type="hidden" id="rmRevVal" value="${s.reviewStatus === 'reviewed' ? 'reviewed' : 'reviewing'}">
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button type="submit" class="hk-btn primary"><i data-lucide="check"></i>Save Review Status</button>
        ${r && !['shortlisted', 'selected'].includes(r.status) ? `<button type="button" class="hk-btn gold" id="rmSaveWin"><i data-lucide="sparkles"></i>Finalize &amp; Shortlist (Next Round)</button>` : ''}
      </div>
    </form>`, { wide: true, onMount(b, close){
      $$('[data-rmst]', b).forEach(btn => {
        btn.onclick = () => {
          const val = btn.dataset.rmst;
          $('#rmRevVal', b).value = val;
          $$('[data-rmst]', b).forEach(x => x.classList.toggle('on', x.dataset.rmst === val));
        };
      });
      const saveRev = async (alsoShortlist) => {
        const scVal = $('#rmScore', b).value;
        const fbVal = $('#rmFb', b).value.trim();
        const revSt = alsoShortlist ? 'reviewed' : ($('#rmRevVal', b).value || 'reviewed');
        const patch = { score: scVal === '' ? null : Math.max(0, Math.min(100, +scVal)), feedback: fbVal, reviewStatus: revSt };
        await C.reviewSubmission(s.id, patch);
        Object.assign(s, patch);
        if(revSt === 'reviewed'){
          C.notify({ toUid: s.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'submission_review', title: `Marked as Reviewed · ${h.title}`, body: `Your submission "${s.title}" was finalized & marked as reviewed${patch.score != null ? ` (Score: ${patch.score}/100)` : ''}. Editing is now locked.` }).catch(() => {});
        }
        if(alsoShortlist && r){
          const regPatch = { status: 'shortlisted', ...(rounds.length > 1 && (r.stage || 0) === 0 ? { stage: 1 } : {}) };
          await patchReg(r, regPatch);
          toast(`Finalized review & shortlisted ${teamTitle} for Next Round!`, 'success');
        } else {
          toast(revSt === 'reviewed' ? 'Marked as Reviewed (Finalized) — student editing locked' : 'Saved as Reviewing — student can still edit');
        }
        close();
        paint();
      };
      $('#revModForm', b).onsubmit = async ev => {
        ev.preventDefault();
        try { await saveRev(false); } catch(err){ toast(err.message, 'error'); }
      };
      $('#rmSaveWin', b)?.addEventListener('click', async () => {
        try { await saveRev(true); } catch(err){ toast(err.message, 'error'); }
      });
    } });
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
    const liveKeys = await C.getTestKeys(id).catch(() => null);
    if(liveKeys) keys = liveKeys;
    const qs = keys ? keys.questions.map(x => ({ ...x, correct: keys.answers[x.id] })) : [{ text: '', options: ['', '', '', ''], correct: 0, marks: 1 }];
    const m = meta || { title: 'Screening test', durationMin: 30, startMs: 0, endMs: 0, resultRevealMs: 0 };
    const qRow = (q, i) => `<div class="hk-card-s" data-q="${i}"><div style="display:flex;justify-content:space-between"><b>Question ${i + 1}</b><button type="button" class="hk-btn icon ghost" data-qdel="${i}" aria-label="Remove question"><i data-lucide="trash-2"></i></button></div>
      <input class="hk-input" data-f="text" placeholder="Question" value="${esc(q.text)}" style="margin:8px 0">${q.options.map((o, k) => `<label class="hk-optrow"><input type="radio" name="c${i}" data-f="correct" value="${k}" ${+q.correct === k ? 'checked' : ''} aria-label="Correct answer ${k + 1}"><input class="hk-input" data-f="opt" data-k="${k}" placeholder="Option ${String.fromCharCode(65 + k)}" value="${esc(o)}"></label>`).join('')}
      <div style="margin-top:8px"><label class="hk-sm">Marks <input class="hk-input" type="number" min="1" data-f="marks" value="${q.marks || 1}" style="width:80px;display:inline-block"></label></div></div>`;
    modal(meta ? 'Edit screening test' : 'Create screening test', `<form class="hk-form" id="tf"><div class="hk-grid2"><div class="hk-field"><label>Title</label><input class="hk-input" name="title" value="${esc(m.title)}" maxlength="80"></div><div class="hk-field"><label>Result Reveal Time <small>blank = instant points</small></label><input class="hk-input" type="datetime-local" name="rev" value="${C.toLocalInput(m.resultRevealMs)}"></div></div>
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
        const stM = C.fromLocalInput(f.get('st')), enM = C.fromLocalInput(f.get('en')), revM = C.fromLocalInput(f.get('rev'));
        if(stM && enM && enM <= stM) return fail('Closing time must be after opening time.');
        try {
          const hadMeta = !!meta;
          await C.saveTest(h, S.user, { title: f.get('title').trim() || 'Screening test', durationMin: +f.get('dur') || 30, startMs: stM, endMs: enM, resultRevealMs: revM }, l);
          [meta, keys] = await Promise.all([C.getTestMeta(id), C.getTestKeys(id).catch(() => null)]);
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

  /* ---------- Next Step & Winners Tab Form Bindings ---------- */
  function bindNextTabForms(){
    if(tab !== 'next') return;
    const pForm = $('#protoCfgForm');
    if(pForm){
      pForm.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(pForm);
        const curSub = C.normalizeSubmissionConfig(h.submission);
        const protoDl = C.fromLocalInput(fd.get('deadline'));
        const protoCfg = {
          open: fd.get('open') === '1',
          audience: fd.get('audience') === 'all' ? 'all' : 'shortlisted',
          title: String(fd.get('title') || 'Prototype Round').trim(),
          deadlineMs: protoDl,
          instructions: String(fd.get('instructions') || '').trim(),
          askRepo: !!fd.get('askRepo'),
          askDemo: !!fd.get('askDemo'),
          askVideo: !!fd.get('askVideo'),
          askExtra: !!fd.get('askExtra')
        };
        const ideaDl = +(curSub.ideaDeadlineMs || curSub.deadlineMs || 0);
        const nextDeadlineMs = (protoCfg.open && protoDl > (curSub.deadlineMs || 0)) ? protoDl : (curSub.deadlineMs || 0);
        const nextSub = {
          ...curSub,
          open: true,
          ideaDeadlineMs: ideaDl,
          deadlineMs: nextDeadlineMs,
          prototype: protoCfg
        };
        const btn = $('button[type=submit]', pForm);
        btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
        try {
          await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { submission: nextSub, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
          h.submission = nextSub;
          toast('Prototype form pushed to participants! 🚀');
          paint();
        } catch(err){ toast(err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i>Save &amp; Push Form'; icons(); }
      };
    }

    const lForm = $('#logiForm');
    if(lForm){
      lForm.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(lForm);
        const curSub = C.normalizeSubmissionConfig(h.submission);
        const logistics = {
          mode: String(fd.get('mode') || 'offline'),
          visibleTo: String(fd.get('visibleTo') || 'selected'),
          reportingTime: C.fromLocalInput(fd.get('reportingTime')),
          venueName: String(fd.get('venueName') || '').trim(),
          address: String(fd.get('address') || '').trim(),
          meetLink: String(fd.get('meetLink') || '').trim(),
          mapUrl: String(fd.get('mapUrl') || '').trim(),
          deskContact: String(fd.get('deskContact') || '').trim(),
          instructions: String(fd.get('instructions') || '').trim()
        };
        const nextSub = { ...curSub, logistics };
        const btn = $('button[type=submit]', lForm);
        btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving…';
        try {
          await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { submission: nextSub, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
          h.submission = nextSub;
          toast('Event logistics saved and synced to participants!');
          paint();
        } catch(err){ toast(err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i data-lucide="check"></i>Save Event Logistics'; icons(); }
      };
    }

    const wForm = $('#autoWinForm');
    if(wForm){
      wForm.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(wForm);
        const crit = String(fd.get('criteria') || 'combined');
        const poolMode = String(fd.get('pool') || 'qualified');
        const count = Math.max(1, Math.min(20, +fd.get('topN') || 3));
        const revMs = C.fromLocalInput(fd.get('revealAt'));
        const qualPool = regs.filter(r => ['shortlisted', 'selected'].includes(r.status));
        const basePool = poolMode === 'qualified' && qualPool.length ? qualPool : regs.filter(r => r.status !== 'rejected');
        const candidates = [...basePool].map(r => {
          const em = evalMetrics(r.uid);
          const pts = crit === 'project' ? (em.subScore ?? -1) : crit === 'test' ? (em.testPct ?? -1) : em.combined;
          const hasProto = !!(em.sub && extractProto(em.sub));
          return { r, em, pts, hasProto };
        }).sort((a, b) => (b.r.status === 'selected' ? 1 : 0) - (a.r.status === 'selected' ? 1 : 0) || (b.hasProto ? 1 : 0) - (a.hasProto ? 1 : 0) || b.pts - a.pts || (b.em.subScore ?? -1) - (a.em.subScore ?? -1) || (b.em.testPct ?? -1) - (a.em.testPct ?? -1));

        const chosen = candidates.slice(0, count);
        if(!chosen.length) return toast('No teams available to select.', 'error');
        if(!confirm(`Publish top ${chosen.length} team(s) as Official Winners and ${revMs && revMs > Date.now() ? 'schedule reveal for ' + C.fmtDT(revMs) : 'reveal immediately'}?`)) return;

        const btn = $('button[type=submit]', wForm);
        btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Publishing winners…';
        try {
          const winnersList = [];
          for(let idx = 0; idx < chosen.length; idx++){
            const { r, em, pts } = chosen[idx];
            if(r.status !== 'selected') await patchReg(r, { status: 'selected' });
            const place = $(`[data-wplace="${r.uid}"]`, wForm)?.value?.trim() || `${idx + 1} Prize`;
            const prize = $(`[data-wprize="${r.uid}"]`, wForm)?.value?.trim() || '';
            winnersList.push({
              uid: r.uid,
              regId: r.id,
              teamName: r.teamMode === 'solo' ? r.name : (r.teamName || r.name),
              leaderName: r.name || '',
              college: r.college || '',
              projectTitle: em.sub?.title || '',
              place,
              prize,
              scoreLabel: pts >= 0 ? `${pts}%` : ''
            });
          }
          const curSub = C.normalizeSubmissionConfig(h.submission);
          const nextSub = {
            ...curSub,
            winnerReveal: {
              announced: true,
              revealAtMs: revMs || 0,
              announcedAtMs: Date.now(),
              winners: winnersList
            }
          };
          await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { submission: nextSub, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
          h.submission = nextSub;
          toast(`🏆 ${winnersList.length} Winner(s) selected & podium published!`);
          paint();
        } catch(err){
          toast(err.message, 'error');
          btn.disabled = false; btn.innerHTML = '<i data-lucide="trophy"></i>Auto-Select Winners &amp; Publish Podium'; icons();
        }
      };
    }
  }

  /* ---------- Certificates Tab Form & Action Bindings ---------- */
  function bindCertTabForms(){
    if(tab !== 'certs') return;
    const sigForm = $('#sigSetupForm');
    if(sigForm){
      const nameIn = $('#sigNameIn', sigForm);
      const titleIn = $('#sigTitleIn', sigForm);
      const stampEl = $('#sigLiveStamp', sigForm);
      const updateStamp = () => {
        if(stampEl) stampEl.innerHTML = HC.signatureStampPreviewHtml(nameIn?.value, titleIn?.value);
      };
      nameIn?.addEventListener('input', updateStamp);
      titleIn?.addEventListener('input', updateStamp);

      sigForm.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(sigForm);
        const sName = String(fd.get('sigName') || '').trim();
        const sTitle = String(fd.get('sigTitle') || '').trim();
        const alsoSync = !!$('#sigSyncExistingCb', sigForm)?.checked;
        if(sName.length < 2) return toast('Enter your full name for the digital signature.', 'error');
        const btn = $('button[type=submit]', sigForm);
        btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Saving signature…';
        try {
          const isStaffUser = C.isStaff(S.site);
          const effectiveSigUid = (hostUid === S.user.uid || isStaffUser) ? hostUid : S.user.uid;
          const saved = await HC.saveHostSignature({
            uid: effectiveSigUid,
            hk: S.hk,
            targetProfile: ownerProfile,
            signatoryName: sName,
            signatoryTitle: sTitle,
            hackathon: h,
            canPatchHackathon: isStaffUser
          });
          if(alsoSync){
            const activeCerts = certs.filter(c => c.status !== 'revoked');
            if(activeCerts.length){
              const stamped = activeCerts.map(c => ({
                ...c,
                signatoryName: saved.name,
                signatoryTitle: saved.title
              }));
              await HC.issueHackathonCerts(stamped);
              certs = await HC.fetchHackathonCerts(id).catch(() => certs);
            }
          }
          editingSig = false;
          toast(alsoSync ? 'Signature saved & re-stamped onto active certificates!' : 'Digital signature saved! All future certificates will use it automatically.');
          redrawRows();
        } catch(err){
          toast(err.message || 'Could not save signature.', 'error');
          btn.disabled = false; btn.innerHTML = '<i data-lucide="badge-check"></i>Save Digital Signature Permanently'; icons();
        }
      };
    }

    const genWinBtn = $('#genWinCertsBtn');
    if(genWinBtn){
      genWinBtn.onclick = async () => {
        const sig = getSavedSignatory();
        if(!sig.name) return toast('Save your Digital Signature first.', 'error');
        const winners = getWinnerCandidates().filter(w => certWinSel.has(w.reg.uid));
        if(!winners.length) return toast('Select at least one winner.', 'error');
        genWinBtn.disabled = true; genWinBtn.innerHTML = `<span class="hk-spin"></span> Generating ${winners.length}…`;
        try {
          const cleanDate = ($('#certDateIn')?.value || certDateLabel || '').trim() || HC.defaultEventDateLabel(h);
          certDateLabel = cleanDate;
          const recs = winners.map(w => {
            const rankTitle = (certRankOverrides.get(w.reg.uid) ?? $(`[data-cwrank="${w.reg.uid}"]`)?.value ?? w.defaultRankTitle).trim() || w.defaultRankTitle;
            return HC.buildCertificateRecord({
              h,
              reg: w.reg,
              category: 'winner',
              rankTitle,
              prize: w.prize,
              projectTitle: w.projectTitle,
              eventDateLabel: cleanDate,
              signatoryName: sig.name,
              signatoryTitle: sig.title,
              hostUid
            });
          });
          await HC.issueHackathonCerts(recs, S.user.uid);
          certs = await HC.fetchHackathonCerts(id).catch(() => certs);
          toast(`Generated ${recs.length} official Winner Certificate${recs.length === 1 ? '' : 's'}!`);
          paint();
        } catch(err){
          toast(err.message || 'Could not generate certificates.', 'error');
          genWinBtn.disabled = false; genWinBtn.innerHTML = `<i data-lucide="award"></i>Generate Winner Certificates (${winners.length})`; icons();
        }
      };
    }

    const genPartBtn = $('#genPartCertsBtn');
    if(genPartBtn){
      genPartBtn.onclick = async () => {
        const sig = getSavedSignatory();
        if(!sig.name) return toast('Save your Digital Signature first.', 'error');
        const partOnlyRegs = getParticipantOnlyRegs();
        const targets = certPartScope === 'all' ? partOnlyRegs : partOnlyRegs.filter(r => certPartSel.has(r.uid));
        if(!targets.length) return toast('Select at least one non-winner participant.', 'error');
        if(certPartScope === 'all' && targets.length > 25 && !confirm(`Generate Participation Certificates for all ${targets.length} non-winner participants?`)) return;
        genPartBtn.disabled = true; genPartBtn.innerHTML = `<span class="hk-spin"></span> Generating ${targets.length}…`;
        try {
          const cleanDate = ($('#certDateIn')?.value || certDateLabel || '').trim() || HC.defaultEventDateLabel(h);
          certDateLabel = cleanDate;
          const recs = targets.map(r => HC.buildCertificateRecord({
            h,
            reg: r,
            category: 'participant',
            rankTitle: 'Participant',
            eventDateLabel: cleanDate,
            signatoryName: sig.name,
            signatoryTitle: sig.title,
            hostUid
          }));
          await HC.issueHackathonCerts(recs, S.user.uid);
          certs = await HC.fetchHackathonCerts(id).catch(() => certs);
          toast(`Generated ${recs.length} Participation Certificate${recs.length === 1 ? '' : 's'}!`);
          paint();
        } catch(err){
          toast(err.message || 'Could not generate certificates.', 'error');
          genPartBtn.disabled = false; genPartBtn.innerHTML = `<i data-lucide="award"></i>Generate Participation Certificates (${targets.length})`; icons();
        }
      };
    }
  }

  /* ---------- status / round changes ---------- */
  async function patchReg(r, patch){
    await C.updateRegistration(r.id, patch); Object.assign(r, patch);
    const label = patch.status ? `Registration ${patch.status}` : 'Moved to next round';
    C.notify({ toUid: r.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'status', title: label, body: patch.status ? `Your status for ${h.title} is now ${patch.status}.` : `Your team is now in ${roundName(patch.stage)}.` }).catch(() => {});
  }

  async function applyBulkRegUpdate(list, patch, actionLabel){
    if(!list.length) return toast('No matching registrations found.', 'info');
    if(!confirm(`${actionLabel} for ${list.length} team${list.length === 1 ? '' : 's'}?${h.autoEmail === false ? '' : ' Teams will be emailed automatically.'}`)) return false;
    try {
      for(const r of list) await patchReg(r, typeof patch === 'function' ? patch(r) : patch);
      toast(`Updated ${list.length} team${list.length === 1 ? '' : 's'}`);
      return true;
    } catch(err){
      toast(err.message, 'error');
      return false;
    }
  }

  paint();
  view.oninput = e => {
    const t = e.target;
    if(t.id === 'rq'){ q = t.value.trim().toLowerCase(); redrawRows(); }
    if(t.id === 'sq'){ subQ = t.value; redrawRows(); }
    if(t.id === 'tq'){ testQ = t.value; redrawRows(); }
    if(t.id === 'topSubN'){ topSubN = Math.max(1, +t.value || 1); redrawRows(); }
    if(t.id === 'subCut'){ subCut = Math.max(0, Math.min(100, +t.value || 0)); redrawRows(); }
    if(t.id === 'topTestN'){ topTestN = Math.max(1, +t.value || 1); redrawRows(); }
    if(t.id === 'testCut'){ testCut = Math.max(0, Math.min(100, +t.value || 0)); redrawRows(); }
    if(t.id === 'mtRound'){ mailer.roundName = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtSched'){ mailer.scheduleText = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtMeet'){ mailer.meetLink = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtSubj'){ mailer.customSubject = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mtNote'){ mailer.note = t.value; updateMailerPreviewDom(); }
    if(t.id === 'mqSearch'){ mailer.quickQ = t.value.trim().toLowerCase(); redrawRows(); }
    if(t.id === 'recSearch'){ mailer.recSearch = t.value.trim(); redrawRows(); }
    if(t.id === 'certDateIn'){ certDateLabel = t.value; }
    if(t.id === 'certSearchIn'){ certSearch = t.value; redrawRows(); }
    if(t.id === 'cpSearch'){ certPartQ = t.value; redrawRows(); }
    if(t.dataset.cwrank){ certRankOverrides.set(t.dataset.cwrank, t.value); }
  };
  view.onchange = async e => {
    const t = e.target;
    if(t.id === 'certWinAll'){
      getWinnerCandidates().forEach(w => t.checked ? certWinSel.add(w.reg.uid) : certWinSel.delete(w.reg.uid));
      return redrawRows();
    }
    if(t.dataset.cwsel){
      t.checked ? certWinSel.add(t.dataset.cwsel) : certWinSel.delete(t.dataset.cwsel);
      return redrawRows();
    }
    if(t.id === 'cpSelAll'){
      const pq = certPartQ.trim().toLowerCase();
      getParticipantOnlyRegs().filter(r => !pq || [r.name, r.teamName, r.email, r.college].join(' ').toLowerCase().includes(pq))
        .forEach(r => t.checked ? certPartSel.add(r.uid) : certPartSel.delete(r.uid));
      return redrawRows();
    }
    if(t.dataset.cpsel){
      t.checked ? certPartSel.add(t.dataset.cpsel) : certPartSel.delete(t.dataset.cpsel);
      return redrawRows();
    }
    if(t.id === 'fs'){ fs = t.value; return redrawRows(); }
    if(t.id === 'fr'){ fr = t.value; return redrawRows(); }
    if(t.id === 'rs'){ regSort = t.value; return redrawRows(); }
    if(t.id === 'subRankBy'){ subRankBy = t.value; return redrawRows(); }
    if(t.id === 'subWeight'){ subWeight = t.value; return redrawRows(); }
    if(t.id === 'tf'){ testFilter = t.value; return redrawRows(); }
    if(t.id === 'ts'){ testSort = t.value; return redrawRows(); }
    if(t.id === 'winPoolSel'){ winPool = t.value; return redrawRows(); }
    if(t.id === 'winCritSel'){ winCriteria = t.value; return redrawRows(); }
    if(t.id === 'winTopNIn'){ winTopN = Math.max(1, +t.value || 1); return redrawRows(); }
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
    if(t.id === 'subSelAll'){ getLeaderboardTeams().forEach(x => t.checked ? subSel.add(x.r.id) : subSel.delete(x.r.id)); return redrawRows(); }
    if(t.dataset.subsel){ t.checked ? subSel.add(t.dataset.subsel) : subSel.delete(t.dataset.subsel); return redrawRows(); }
    if(t.id === 'testSelAll'){
      getFilteredTestRows().forEach(x => { if(x.r) t.checked ? testSel.add(x.r.id) : testSel.delete(x.r.id); });
      return redrawRows();
    }
    if(t.dataset.testsel){ t.checked ? testSel.add(t.dataset.testsel) : testSel.delete(t.dataset.testsel); return redrawRows(); }

    const handleBulkSel = async (setRef, isStatus) => {
      const v = t.value; if(v === '') return;
      const list = regs.filter(r => setRef.has(r.id));
      if(!list.length){ t.value = ''; return; }
      const ok = await applyBulkRegUpdate(list, isStatus ? { status: v } : { stage: +v }, isStatus ? `Set status to "${v}"` : `Move to "${roundName(+v)}"`);
      if(ok) paint(); else t.value = '';
    };
    if(t.id === 'bSt' || t.id === 'bRd') return handleBulkSel(sel, t.id === 'bSt');
    if(t.id === 'bSubSt' || t.id === 'bSubRd') return handleBulkSel(subSel, t.id === 'bSubSt');
    if(t.id === 'bTestSt' || t.id === 'bTestRd') return handleBulkSel(testSel, t.id === 'bTestSt');

    const stS = t.closest('[data-st]'), stG = t.closest('[data-stage]');
    const r = regs.find(x => x.id === (stS?.dataset.st || stG?.dataset.stage)); if(!r) return;
    const prev = stS ? r.status : (r.stage || 0);
    try { await patchReg(r, stS ? { status: t.value } : { stage: +t.value }); toast(h.autoEmail === false ? 'Updated' : 'Updated. Team will be emailed.'); paint(); }
    catch(err){ toast(err.message, 'error'); t.value = prev; }
  };
  view.onclick = async e => {
    try {
      const t = e.target;
      if(!t || typeof t.closest !== 'function') return;
      const pb = t.closest('[data-prof]'); if(pb){ const r = regs.find(x => x.id === pb.dataset.prof); if(r) viewApplicantModal(r); return; }
      const tb = t.closest('[data-tab]'); if(tb) return setTab(tb.dataset.tab);
      if(t.closest('#openBulkGenBtn')){
        HC.openBulkGenerateModal({
          h, regs, subs, atts, certs, S, ownerProfile,
          initialFilter: certMode === 'winners' && getWinnerCandidates().length ? 'winners' : (certMode === 'participants' && getParticipantOnlyRegs().length ? 'participants' : 'all'),
          onGenerated: fresh => { certs = fresh; paint(); }
        });
        return;
      }
      if(t.closest('#editSigBtn')){ editingSig = true; return redrawRows(); }
      if(t.closest('#cancelSigBtn')){ editingSig = false; return redrawRows(); }
      if(t.closest('#certResetDateBtn')){ certDateLabel = HC.defaultEventDateLabel(h); return redrawRows(); }
      const cm = t.closest('[data-cmode]'); if(cm){ certMode = cm.dataset.cmode; return redrawRows(); }
      const cps = t.closest('[data-cpscope]'); if(cps){ certPartScope = cps.dataset.cpscope; return redrawRows(); }
      const cf = t.closest('[data-cfilt]'); if(cf){ certFilter = cf.dataset.cfilt; return redrawRows(); }
      const cp = t.closest('[data-certcopy]'); if(cp){
        const u = HC.certVerifyUrl(cp.dataset.certcopy);
        try { await navigator.clipboard.writeText(u); toast('Verification URL copied!'); } catch { toast(u, 'info'); }
        return;
      }
      const cprev = t.closest('[data-certprev]'); if(cprev){
        const cert = certs.find(x => x.id === cprev.dataset.certprev);
        if(cert) HC.openCertViewerModal(cert, { isOwner: false });
        return;
      }
      const crev = t.closest('[data-certrevoke]'); if(crev){
        const cert = certs.find(x => x.id === crev.dataset.certrevoke);
        if(!cert || !confirm(`Revoke certificate for ${cert.name}? Public QR verification will show it as Revoked.`)) return;
        try { await HC.setCertStatus(cert.id, 'revoked'); cert.status = 'revoked'; toast('Certificate revoked.', 'info'); paint(); }
        catch(err){ toast(err.message, 'error'); }
        return;
      }
      const crei = t.closest('[data-certreissue]'); if(crei){
        const cert = certs.find(x => x.id === crei.dataset.certreissue);
        if(!cert) return;
        try { await HC.setCertStatus(cert.id, 'issued'); cert.status = 'issued'; toast('Certificate restored to valid!', 'success'); paint(); }
        catch(err){ toast(err.message, 'error'); }
        return;
      }
    const mb = t.closest('[data-mail]'); if(mb){ const r = regs.find(x => x.id === mb.dataset.mail); if(r) compose([r]); return; }
    const sv = t.closest('[data-subview]'); if(sv){ subsView = sv.dataset.subview; return redrawRows(); }
    const sfBtn = t.closest('[data-subf]'); if(sfBtn){ subFilter = sfBtn.dataset.subf; return redrawRows(); }
    const orv = t.closest('[data-openreview]'); if(orv){ const s = subs.find(x => x.id === orv.dataset.openreview); if(s) openReviewModal(s); return; }

    if(t.closest('[data-mailwinners]')){
      const winCfg = h.submission?.winnerReveal;
      const winList = winCfg?.announced && Array.isArray(winCfg.winners) ? winCfg.winners : [];
      const w = winList.length
        ? regs.filter(r => winList.some(x => (r.uid && x.uid === r.uid) || x.regId === r.id))
        : regs.filter(r => r.status === 'selected');
      return w.length ? compose(w, 'selected') : toast('Announce official winners or mark Finalists first.', 'info');
    }

    const shBtn = t.closest('[data-shortlist]');
    if(shBtn){
      const r = regs.find(x => x.id === shBtn.dataset.shortlist); if(!r) return;
      shBtn.disabled = true;
      try {
        await patchReg(r, { status: 'shortlisted', ...(rounds.length > 1 && (r.stage || 0) === 0 ? { stage: 1 } : {}) });
        toast(`${r.teamName || r.name} shortlisted for Next Round! ✨${h.autoEmail === false ? '' : ' · Team notified'}`);
        paint();
      } catch(err){ toast(err.message, 'error'); shBtn.disabled = false; }
      return;
    }

    const unshBtn = t.closest('[data-unshortlist]');
    if(unshBtn){
      const r = regs.find(x => x.id === unshBtn.dataset.unshortlist); if(!r) return;
      if(!confirm(`Remove "${r.teamName || r.name}" from Shortlisted?`)) return;
      unshBtn.disabled = true;
      try {
        await patchReg(r, { status: 'registered', ...(rounds.length > 1 && (r.stage || 0) === 1 ? { stage: 0 } : {}) });
        toast(`${r.teamName || r.name} moved back to Registered`);
        paint();
      } catch(err){ toast(err.message, 'error'); unshBtn.disabled = false; }
      return;
    }

    const finBtn = t.closest('[data-finalist], [data-winselect]');
    if(finBtn){
      const rid = finBtn.dataset.finalist || finBtn.dataset.winselect;
      const r = regs.find(x => x.id === rid); if(!r) return;
      finBtn.disabled = true;
      try {
        await patchReg(r, { status: 'selected', ...(rounds.length > 1 && (r.stage || 0) === 0 ? { stage: 1 } : {}) });
        toast(`${r.teamName || r.name} marked as Round 2 Finalist!${h.autoEmail === false ? '' : ' · Team notified'}`);
        paint();
      } catch(err){ toast(err.message, 'error'); finBtn.disabled = false; }
      return;
    }

    const unfinBtn = t.closest('[data-unfinalist], [data-winunselect]');
    if(unfinBtn){
      const rid = unfinBtn.dataset.unfinalist || unfinBtn.dataset.winunselect;
      const r = regs.find(x => x.id === rid); if(!r) return;
      if(!confirm(`Remove "${r.teamName || r.name}" from Round 2 Finalists (moves back to Shortlisted)?`)) return;
      unfinBtn.disabled = true;
      try {
        await patchReg(r, { status: 'shortlisted' });
        toast(`${r.teamName || r.name} moved back to Shortlisted`);
        paint();
      } catch(err){ toast(err.message, 'error'); unfinBtn.disabled = false; }
      return;
    }

    const qstBtn = t.closest('[data-quickst]');
    if(qstBtn){
      const [rid, nextSt] = qstBtn.dataset.quickst.split(':');
      const r = regs.find(x => x.id === rid);
      if(!r || r.status === nextSt) return;
      qstBtn.disabled = true;
      try {
        const regPatch = { status: nextSt };
        if(nextSt === 'shortlisted' && rounds.length > 1 && (r.stage || 0) === 0) regPatch.stage = 1;
        await patchReg(r, regPatch);
        const stLbl = nextSt === 'selected' ? 'Finalist' : (nextSt === 'rejected' ? 'not selected' : nextSt);
        toast(`Marked ${r.teamName || r.name} as ${stLbl}${h.autoEmail === false ? '' : ' · Team notified'}`);
        paint();
      } catch(err){ toast(err.message, 'error'); qstBtn.disabled = false; }
      return;
    }

    const qs = t.closest('[data-qshort]');
    if(qs){
      const mode = qs.dataset.qshort;
      const shortlistPatch = r => ({ status: 'shortlisted', ...(rounds.length > 1 && (r.stage || 0) === 0 ? { stage: 1 } : {}) });
      if(mode === 'sub-top-shortlist'){
        const ranked = getLeaderboardTeams().filter(x => x.rankVal >= 0).map(x => x.r);
        if(!ranked.length) return toast('Score submissions or run the screening test first so teams can be ranked.', 'info');
        const list = ranked.slice(0, Math.max(1, topSubN)).filter(r => r && !['shortlisted', 'selected'].includes(r.status));
        if(await applyBulkRegUpdate(list, shortlistPatch, `Shortlist top ${Math.min(topSubN, ranked.length)} ranked teams for Next Round`)) paint();
        return;
      }
      if(mode === 'sub-cut'){
        const list = getLeaderboardTeams().filter(x => x.rankVal >= subCut).map(x => x.r).filter(r => r && !['shortlisted', 'selected'].includes(r.status));
        if(await applyBulkRegUpdate(list, shortlistPatch, `Shortlist teams with score ≥ ${subCut} for Next Round`)) paint();
        return;
      }
      if(mode === 'test-top-shortlist'){
        const ranked = [...atts].filter(a => a.submittedAtMs && regOf(a.uid)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.submittedAtMs || 0) - (b.submittedAtMs || 0));
        if(!ranked.length) return toast('No attempted test records found.', 'info');
        const list = ranked.slice(0, Math.max(1, topTestN)).map(a => regOf(a.uid)).filter(r => r && !['shortlisted', 'selected'].includes(r.status));
        if(await applyBulkRegUpdate(list, shortlistPatch, `Shortlist top ${Math.min(topTestN, ranked.length)} test scorers for Next Round`)) paint();
        return;
      }
      if(mode === 'test-cut'){
        const list = atts.filter(a => {
          if(!a.submittedAtMs) return false;
          const tot = a.total ?? meta?.total ?? 0;
          const pct = tot > 0 ? Math.round(((a.score ?? 0) / tot) * 100) : 0;
          return pct >= testCut;
        }).map(a => regOf(a.uid)).filter(r => r && !['shortlisted', 'selected'].includes(r.status));
        if(await applyBulkRegUpdate(list, shortlistPatch, `Shortlist teams with test accuracy ≥ ${testCut}% for Next Round`)) paint();
        return;
      }
    }

    if(t.closest('[data-qload-pendingtest]')){
      const pend = regs.filter(r => r.status !== 'rejected' && meta && !attOf(r.uid)?.submittedAtMs);
      const added = queueAddRegs(pend);
      mailer.kind = 'test_reminder';
      mailer.scheduleText = defaultScheduleForKind('test_reminder', mailer.roundName);
      toast(`${added} pending-test team${added === 1 ? '' : 's'} loaded into Mailer`);
      return setTab('mail');
    }

    const bm = t.closest('[data-bulkmail]');
    if(bm){
      const src = bm.dataset.bulkmail === 'subs' ? subSel : (bm.dataset.bulkmail === 'test' ? testSel : sel);
      const l = regs.filter(r => src.has(r.id));
      return l.length ? compose(l) : toast('Select teams first.', 'error');
    }
    const bq = t.closest('[data-bulkqueue]');
    if(bq){
      const src = bq.dataset.bulkqueue === 'subs' ? subSel : (bq.dataset.bulkqueue === 'test' ? testSel : sel);
      const l = regs.filter(r => src.has(r.id));
      if(!l.length) return toast('Select teams first.', 'error');
      const added = queueAddRegs(l);
      toast(`${added} team${added === 1 ? '' : 's'} loaded into Mailer queue`);
      return setTab('mail');
    }
    const bc = t.closest('[data-bulkcerts]');
    if(bc){
      const src = bc.dataset.bulkcerts === 'subs' ? subSel : (bc.dataset.bulkcerts === 'test' ? testSel : sel);
      const uids = regs.filter(r => src.has(r.id) && r.status !== 'rejected').map(r => r.uid).filter(Boolean);
      if(!uids.length) return toast('Select at least one eligible participant or winner first.', 'error');
      HC.openBulkGenerateModal({
        h, regs, subs, atts, certs, S, ownerProfile,
        preselectedUids: uids,
        onGenerated: fresh => { certs = fresh; tab = 'certs'; paint(); }
      });
      return;
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
    if(t.closest('[data-rmtest]')){ if(confirm('Remove the test and all questions?')){ try { await C.removeTest(id); meta = null; keys = null; paint(); toast('Test removed', 'info'); } catch(err){ toast(err.message, 'error'); } } return; }
    if(t.closest('[data-revealtest]')){
      try {
        await FS.updateDoc(FS.doc(C.db, 'hkTests', id), { resultRevealMs: Date.now(), updatedAtMs: Date.now() });
        if(meta) meta.resultRevealMs = Date.now();
        toast('Test results revealed to all participants!');
        paint();
      } catch(err){ toast(err.message, 'error'); }
      return;
    }
    const va = t.closest('[data-viewatt]');
    if(va){
      const a = atts.find(x => x.uid === va.dataset.viewatt);
      if(a) viewAttemptModal(a, regOf(a.uid));
      return;
    }
    const wch = t.closest('[data-winchan]');
    if(wch){
      const [rid, ch] = wch.dataset.winchan.split(':');
      const r = regs.find(x => x.id === rid);
      if(!r) return;
      wch.disabled = true;
      try {
        await sendOne(r, { kind: 'selected', note: '', roundVal: rounds[rounds.length - 1]?.name || 'Grand Finale', scheduleText: h.submission?.logistics?.reportingTime ? C.fmtDT(h.submission.logistics.reportingTime) : '', meetLink: h.submission?.logistics?.meetLink || M.hackathonVenueText(h), customSubject: '', channel: ch });
        toast(`Winner update sent via ${ch} to ${r.name}!`);
        paint();
      } catch(err){ toast(err.message, 'error'); wch.disabled = false; }
      return;
    }
    if(t.closest('[data-wprevtoggle]')){ winMailMode = winMailMode === 'whatsapp' ? 'email' : 'whatsapp'; return redrawRows(); }
    if(t.closest('[data-unannouncewin]')){
      if(!confirm('Hide the public Winner Podium? Team statuses remain untouched.')) return;
      try {
        const curSub = C.normalizeSubmissionConfig(h.submission);
        const nextSub = { ...curSub, winnerReveal: { ...(curSub.winnerReveal || {}), announced: false } };
        await FS.updateDoc(FS.doc(C.db, 'hkHackathons', h.id), { submission: nextSub, updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() });
        h.submission = nextSub;
        toast('Winner podium hidden.', 'info');
        paint();
      } catch(err){ toast(err.message, 'error'); }
      return;
    }
    const rvs = t.closest('[data-revstate]');
    if(rvs){
      const [sid, nextState] = rvs.dataset.revstate.split(':');
      const s = subs.find(x => x.id === sid);
      if(!s || (s.reviewStatus === nextState)) return;
      const card = rvs.closest('[data-sub]');
      const patch = { reviewStatus: nextState };
      if(card){
        const scIn = $('[data-score]', card), fbIn = $('[data-fb]', card);
        if(scIn && scIn.value !== '') patch.score = Math.max(0, Math.min(100, +scIn.value));
        if(fbIn) patch.feedback = fbIn.value.trim();
      }
      rvs.disabled = true;
      try {
        await C.reviewSubmission(s.id, patch);
        Object.assign(s, patch);
        if(nextState === 'reviewed'){
          C.notify({ toUid: s.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'submission_review', title: `Marked as Reviewed · ${h.title}`, body: `Your project "${s.title}" was finalized and marked as reviewed${patch.score != null ? ` (Score: ${patch.score}/100)` : ''}. Editing is now locked.` }).catch(() => {});
          toast(`"${s.title}" marked as Finalized (Reviewed) — student editing disabled`, 'success');
        } else {
          toast(`"${s.title}" set to Reviewing — student can edit`, 'info');
        }
        paint();
      } catch(err){ toast(err.message, 'error'); rvs.disabled = false; }
      return;
    }
    const rv = t.closest('[data-review]');
    if(rv){
      const card = rv.closest('[data-sub]'), s = subs.find(x => x.id === rv.dataset.review), sc = $('[data-score]', card).value, fb = $('[data-fb]', card).value.trim();
      try {
        const patch = { score: sc === '' ? null : Math.max(0, Math.min(100, +sc)), feedback: fb, reviewStatus: 'reviewed' };
        await C.reviewSubmission(s.id, patch); Object.assign(s, patch);
        C.notify({ toUid: s.uid, fromUid: S.user.uid, hackathonId: h.id, type: 'submission_review', title: `Marked as Reviewed · ${h.title}`, body: `Your submission "${s.title}" was finalized & marked as reviewed${patch.score != null ? ` (Score: ${patch.score}/100)` : ''}${fb ? ': ' + fb : '.'}` }).catch(() => {});
        toast('Marked as Finalized (Reviewed) — student editing locked'); paint();
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
    } catch(err){
      console.error('[HK Manage] Click error:', err);
      toast(err?.message || 'Could not complete action', 'error');
    }
  };
  const certTrackKey = list => JSON.stringify((list || []).map(c => [c.id, c.status, c.updatedAtMs, c.certDownloadAtMs, c.certShareAtMs, c.certLinkedInAtMs]));
  const unsubCerts = FS.onSnapshot(FS.query(FS.collection(C.db, 'hkCertificates'), FS.where('hackathonId', '==', id)), snap => {
    if(cx.stale()) return;
    const nextCerts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.category === 'winner' ? -1 : 1) - (b.category === 'winner' ? -1 : 1) || (b.issuedAtMs || 0) - (a.issuedAtMs || 0));
    if(certTrackKey(nextCerts) !== certTrackKey(certs)){
      certs = nextCerts;
      const activeTag = document.activeElement?.tagName;
      if(!['INPUT', 'TEXTAREA'].includes(activeTag)){
        if(tab === 'certs') redrawRows();
        else {
          const badgeBtn = $('.hk-tab[data-tab="certs"]', view);
          const n = certs.filter(c => c.status !== 'revoked').length;
          if(badgeBtn) badgeBtn.innerHTML = `<i data-lucide="award"></i>Certificates (${n})`;
          icons(badgeBtn);
        }
      }
    }
  }, () => {});
  cx.S.cleanup = () => { unsubCerts?.(); view.oninput = view.onchange = view.onclick = null; };
}
