// Participant dashboard for one hackathon: round tracker, proctored test, compact submission, prototype round, logistics & winners podium.
import * as C from './hk-core.js';
import { empty, countdownHtml, startCountdowns, applicationStepperHtml } from './hk-ui.js';

const { $, $$, esc, icons, toast, FS } = C;
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
const STATUS_TXT = {
  registered: ['Registered', '', 'ticket-check'],
  shortlisted: ['Shortlisted · Next Round', '', 'sparkles'],
  selected: ['Selected · Finalist', 'gold', 'award'],
  waitlisted: ['Waitlisted', 'warn', 'hourglass'],
  rejected: ['Not selected', 'bad', 'circle-x']
};

export async function dash(cx, hid){
  const { S, view } = cx;
  let editingSub = false, showFullIdea = false, justSubmittedSub = false;
  let editingProto = false, justSubmittedProto = false;
  let h = null, reg = null, sub = null, meta = null, att = null;
  let stopTimer = null, unsubReg = null, unsubHack = null, unsubSub = null, revealReloadTimer = 0;

  async function loadAll(){
    [h, reg] = await Promise.all([C.fetchOne(hid, { fresh: true }), C.getRegistration(hid, S.user.uid, { fresh: true })]);
    if(cx.stale()) return false;
    if(!h || !reg){
      view.innerHTML = `<div class="hk-view">${empty('ticket', 'No registration found', 'Register for this hackathon first, then your dashboard appears here.', `<a class="hk-btn primary" href="#/h/${esc(hid)}">View hackathon</a>`)}</div>`;
      return false;
    }
    [sub, meta, att] = await Promise.all([
      C.getSubmission(hid, S.user.uid, { fresh: true }).catch(() => null),
      C.getTestMeta(hid),
      C.myAttempt(hid, S.user.uid)
    ]);
    if(cx.stale()) return false;
    return true;
  }

  function computeNextStep(now, rounds, subCfg, ideaDl, subOpen, isSubReviewed, protoCfg, protoSub, winCfg, winnersRevealed, myWin){
    const curIdx = reg.stage || 0;
    const curRound = rounds[curIdx];
    const nextRound = rounds[curIdx + 1];

    if(reg.status === 'rejected'){
      return {
        tone: 'bad', icon: 'circle-x', badge: 'Update',
        title: 'Participation status updated',
        desc: 'Your team was not shortlisted for the next stage of this hackathon. Thank you for participating!',
        cta: ''
      };
    }

    if(winnersRevealed && myWin){
      return {
        tone: 'gold', icon: 'trophy', badge: myWin?.place || 'Official Winner',
        title: `Congratulations! ${myWin?.place ? myWin.place + ' — ' : ''}Official Winner`,
        desc: myWin?.prize
          ? `Prize / Recognition: ${myWin.prize}. Check your registered email and official logistics card below.`
          : (reg.hostNote ? `Organiser note: ${reg.hostNote}` : 'Your team has been officially announced as a Winner! Check event logistics and your email.'),
        cta: `<button type="button" class="hk-btn sm gold" data-jump="#winnersSection"><i data-lucide="trophy"></i>View Winner Podium</button>`
      };
    }

    // Step 1: Screening test if open & not attempted
    if(meta){
      const testClosed = meta.endMs && now > meta.endMs;
      const testNotYet = meta.startMs && now < meta.startMs;
      if(!att?.submittedAtMs && !testClosed){
        if(testNotYet){
          return {
            tone: 'sky', icon: 'clock', badge: 'Upcoming Test',
            title: `Next step: ${meta.title || 'Screening test'} opens ${C.fmtDT(meta.startMs)}`,
            desc: `${meta.count} questions · ${meta.durationMin} minutes · ${meta.total} marks. Review instructions below before starting.`,
            cta: `<button type="button" class="hk-btn sm" data-jump="#testCard"><i data-lucide="clipboard-check"></i>View test details</button>`
          };
        }
        return {
          tone: 'warn', icon: 'clipboard-check', badge: 'Action Required',
          title: `Next step: Take ${meta.title || 'Screening test'}${meta.endMs ? ' before ' + C.fmtDT(meta.endMs) : ''}`,
          desc: `Live now · ${meta.count} questions · ${meta.durationMin} minutes · ${meta.total} marks.`,
          cta: `<button type="button" class="hk-btn sm primary" data-start><i data-lucide="play"></i>${att ? 'Resume test' : 'Start test'}</button>`
        };
      }
    }

    // Step 2: Prototype / Build Round if open & eligible
    const protoEligible = !!(protoCfg.open && (protoCfg.audience !== 'shortlisted' || ['shortlisted', 'selected'].includes(reg.status) || protoSub));
    if(protoEligible){
      const protoDl = +protoCfg.deadlineMs || 0;
      const protoOpenNow = !protoDl || now <= protoDl;
      if(!protoSub && protoOpenNow){
        return {
          tone: 'p', icon: 'rocket', badge: protoCfg.title || 'Prototype Round',
          title: `Next step: Submit your ${protoCfg.title || 'Prototype'}${protoDl ? ' by ' + C.fmtDT(protoDl) : ''}`,
          desc: protoCfg.instructions || 'Upload your working prototype build details, GitHub repository, and demo links below.',
          cta: `<button type="button" class="hk-btn sm primary" data-jump="#protoCard"><i data-lucide="rocket"></i>Submit prototype</button>`
        };
      }
      if(protoSub && winCfg.revealAtMs && now < winCfg.revealAtMs){
        return {
          tone: 'gold', icon: 'sparkles', badge: 'Prototype Submitted',
          title: `Prototype saved · Winner announcement on ${C.fmtDT(winCfg.revealAtMs)}`,
          desc: `Your prototype "${protoSub.title}" is submitted for final judging.`,
          cta: `<button type="button" class="hk-btn sm" data-jump="#protoCard"><i data-lucide="eye"></i>View prototype</button>`
        };
      }
    }

    // Step 3: Project Submission
    if(subCfg.open !== false){
      if(!sub && subOpen){
        return {
          tone: 'p', icon: 'upload-cloud', badge: 'Next Step',
          title: `Submit your project details${ideaDl ? ' by ' + C.fmtDT(ideaDl) : ''}`,
          desc: 'Fill in your project title, approach, and links below and submit before the organiser starts reviewing.',
          cta: `<button type="button" class="hk-btn sm primary" data-jump="#subCard"><i data-lucide="lightbulb"></i>Go to submission</button>`
        };
      }
      if(sub && isSubReviewed){
        return {
          tone: 'ok', icon: 'badge-check', badge: 'Marked as Reviewed',
          title: `Marked as Reviewed${sub.score != null ? ` · Score ${sub.score}/100` : ''}${nextRound ? ` → Next: ${nextRound.name}` : ''}`,
          desc: sub.feedback
            ? `Judge feedback: ${sub.feedback}`
            : (nextRound ? `Editing is locked. Get ready for ${nextRound.name}${nextRound.startMs ? ' (' + C.fmtDT(nextRound.startMs) + ')' : ''}.` : 'Your project has been Marked as Reviewed and editing is now disabled.'),
          cta: `<button type="button" class="hk-btn sm" data-jump="#subCard"><i data-lucide="eye"></i>View project card</button>`
        };
      }
      if(sub && subOpen){
        return {
          tone: 'ok', icon: 'circle-check', badge: 'Saved & Editable',
          title: `Project submitted · You can edit until organiser reviews${ideaDl ? ' (' + C.fmtDT(ideaDl) + ')' : ''}`,
          desc: `Your project "${sub.title}" is saved. Tap Edit on the card to update before evaluation starts.`,
          cta: `<button type="button" class="hk-btn sm" data-jump="#subCard"><i data-lucide="eye"></i>View project card</button>`
        };
      }
      if(sub && !subOpen){
        return {
          tone: 'ok', icon: 'lock', badge: 'Under Evaluation',
          title: 'Submission window closed · Under review',
          desc: nextRound
            ? `Submissions are locked. Next milestone: ${nextRound.name}${nextRound.startMs ? ' on ' + C.fmtDT(nextRound.startMs) : ''}.`
            : 'Your project is locked for judging. Updates will appear here and in your email.',
          cta: ''
        };
      }
      if(!sub && !subOpen){
        return {
          tone: 'bad', icon: 'timer-off', badge: 'Window Closed',
          title: 'Project submission window has closed',
          desc: ideaDl ? `The deadline (${C.fmtDT(ideaDl)}) has passed and no submission was recorded.` : 'The organiser has closed submissions for this hackathon.',
          cta: ''
        };
      }
    }

    if(reg.status === 'selected'){
      return {
        tone: 'gold', icon: 'award', badge: 'Finalist · Selected',
        title: `Selected as Finalist${curRound ? ' · ' + curRound.name : ''}`,
        desc: reg.hostNote || 'Your team qualified for the final stage. Watch the winner reveal countdown and logistics details below.',
        cta: ''
      };
    }

    if(curRound){
      return {
        tone: 'p', icon: 'flag', badge: curRound.name,
        title: `Current stage: ${curRound.name}`,
        desc: curRound.startMs ? `Scheduled ${C.fmtDT(curRound.startMs)}${curRound.endMs ? ' → ' + C.fmtDT(curRound.endMs) : ''}.` : (curRound.desc || 'Watch announcements and email updates.'),
        cta: ''
      };
    }

    return {
      tone: 'p', icon: 'calendar-check', badge: 'Active',
      title: h.startMs > now ? `Hackathon starts ${C.fmtDT(h.startMs)}` : 'Hackathon is underway',
      desc: 'Watch announcements and your email for updates from the organiser.',
      cta: ''
    };
  }

  function render(){
    if(cx.stale()) return;
    stopTimer?.();
    clearTimeout(revealReloadTimer);
    const now = Date.now(), rounds = C.roundsOf(h), st = STATUS_TXT[reg.status] || STATUS_TXT.registered;
    const subCfg = C.normalizeSubmissionConfig(h.submission);
    const ideaDl = +(subCfg.ideaDeadlineMs || subCfg.deadlineMs || 0);
    const protoCfg = subCfg.prototype && typeof subCfg.prototype === 'object' ? subCfg.prototype : {};
    const logi = subCfg.logistics && typeof subCfg.logistics === 'object' ? subCfg.logistics : null;
    const winCfg = subCfg.winnerReveal && typeof subCfg.winnerReveal === 'object' ? subCfg.winnerReveal : {};
    const winnersList = Array.isArray(winCfg.winners) ? winCfg.winners : [];
    const winnersRevealed = !!(winCfg.announced && (!winCfg.revealAtMs || now >= winCfg.revealAtMs));
    const myWin = winnersRevealed ? winnersList.find(w => w.uid === S.user.uid) : null;

    const protoSub = extractProto(sub);
    const isSubReviewed = !!(sub && sub.reviewStatus === 'reviewed');
    const isSubReviewing = !!(sub && sub.reviewStatus === 'reviewing');
    const subOpen = subCfg.open !== false && (!ideaDl || now <= ideaDl) && reg.status !== 'rejected';
    const canEditSub = subOpen && !isSubReviewed;
    const members = reg.members || [];

    // Schedule auto re-render when resultRevealMs or winnerReveal.revealAtMs hits while user is viewing dashboard
    const nextRevealAt = [meta?.resultRevealMs, winCfg?.revealAtMs].filter(ms => ms && ms > now).sort((a, b) => a - b)[0];
    if(nextRevealAt && nextRevealAt - now < 3600000){
      revealReloadTimer = setTimeout(() => { if(!cx.stale()) loadAll().then(ok => { if(ok) render(); }); }, (nextRevealAt - now) + 600);
    }

    const tracker = rounds.length
      ? `<ol class="hk-rounds">${rounds.map((r, i) => `<li class="${i < (reg.stage || 0) ? 'done' : i === (reg.stage || 0) ? 'cur' : ''}"><span class="n">${i < (reg.stage || 0) ? '<i data-lucide="check"></i>' : i + 1}</span><b>${esc(r.name)}</b>${r.desc ? `<small>${esc(r.desc)}</small>` : ''}${r.startMs ? `<small>${C.fmtDate(r.startMs)}${r.endMs ? ' → ' + C.fmtDate(r.endMs) : ''}</small>` : ''}</li>`).join('')}</ol>`
      : '<p class="hk-sm hk-muted">The organiser has not defined separate rounds for this hackathon.</p>';

    const effectiveMyWin = myWin || (winnersRevealed && !winnersList.length && reg.status === 'selected' ? { place: 'Official Winner', uid: S.user.uid } : null);
    const nextStep = computeNextStep(now, rounds, subCfg, ideaDl, subOpen, isSubReviewed, protoCfg, protoSub, winCfg, winnersRevealed, effectiveMyWin);

    /* ---------- 1. Winning Celebration & Official Winners Podium ---------- */
    let winnersSection = '';
    if(winnersRevealed && (winnersList.length || effectiveMyWin)){
      const isWinner = !!effectiveMyWin;
      const confetti = isWinner ? `<div class="hk-confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>` : '';
      const heroBanner = isWinner ? `<div class="hk-win-hero">
        ${confetti}
        <div class="wh-ic"><i data-lucide="trophy"></i></div>
        <div class="wh-body">
          <span class="hk-chip gold"><i data-lucide="sparkles"></i>${esc(effectiveMyWin?.place || 'Official Winner')}</span>
          <h3>Congratulations, ${esc(reg.teamMode === 'solo' ? reg.name : (reg.teamName || reg.name))}!</h3>
          <p>${effectiveMyWin?.prize ? `Awarded: <b>${esc(effectiveMyWin.prize)}</b>. ` : ''}You have been officially selected as a winner of <b>${esc(h.title)}</b>.</p>
        </div>
      </div>` : '';

      const podiumGrid = winnersList.length ? `<div class="hk-podium-grid">${winnersList.map((w, idx) => `<div class="hk-podium-card ${w.uid === S.user.uid ? 'me' : ''}">
        <div class="pc-top"><span class="hk-rank top${Math.min(idx + 1, 3)}">${esc(w.place || `#${idx + 1}`)}</span>${w.scoreLabel ? `<span class="hk-chip">${esc(w.scoreLabel)}</span>` : ''}</div>
        <b>${esc(w.teamName || w.leaderName || 'Team')}</b>
        <div class="hk-xs hk-muted">${esc(w.leaderName || '')}${w.college ? ' · ' + esc(w.college) : ''}</div>
        ${w.projectTitle ? `<div class="hk-xs" style="margin-top:4px">Project: <b>${esc(w.projectTitle)}</b></div>` : ''}
        ${w.prize ? `<div class="hk-xs" style="color:var(--hk-gold);font-weight:700;margin-top:4px"><i data-lucide="award" style="width:13px;height:13px"></i> ${esc(w.prize)}</div>` : ''}
      </div>`).join('')}</div>` : '';

      winnersSection = `<section class="hk-card-s hk-dcard hk-winners-public" id="winnersSection" style="margin-bottom:16px">
        <div class="dh"><i data-lucide="trophy" style="color:var(--hk-gold)"></i><h3>Official Winners · ${esc(h.title)}</h3><span class="hk-chip gold">Announced</span></div>
        ${heroBanner}
        ${podiumGrid}
      </section>`;
    } else if(winCfg.revealAtMs && now < winCfg.revealAtMs){
      winnersSection = `<div class="hk-countdown gold" style="margin-bottom:14px">
        <i data-lucide="trophy"></i>
        <span>Official Winners Reveal (${C.fmtDT(winCfg.revealAtMs)})</span>
        <span class="tval" data-cd="${winCfg.revealAtMs}">${C.countdownText(winCfg.revealAtMs, now)}</span>
      </div>`;
    }

    /* ---------- 2. Selected / Shortlisted Event Logistics Card (Online / Offline / Hybrid) ---------- */
    let logisticsCard = '';
    const canSeeLogi = !!(logi && logi.mode && (['selected', 'shortlisted'].includes(reg.status) || logi.visibleTo === 'all'));
    if(canSeeLogi){
      const modeLabel = logi.mode === 'online' ? 'Online / Virtual Event' : logi.mode === 'hybrid' ? 'Hybrid (Online + Campus)' : 'Offline In-Person Venue';
      const modeIc = logi.mode === 'online' ? 'video' : 'map-pin';
      const meetUrl = C.safeUrl(logi.meetLink);
      const mapUrl = C.safeUrl(logi.mapUrl);
      logisticsCard = `<section class="hk-card-s hk-dcard hk-logi-card" id="logisticsCard">
        <div class="hk-sub-head">
          <div class="dh" style="margin-bottom:0;flex:1">
            <i data-lucide="${modeIc}"></i>
            <div>
              <h3>Final Round &amp; Reporting Details</h3>
              <div class="hk-xs hk-muted">${esc(modeLabel)}</div>
            </div>
          </div>
          <span class="hk-chip ${logi.mode === 'online' ? 'sky' : 'gold'}">${esc(logi.mode.toUpperCase())}</span>
        </div>
        <div class="hk-kv-grid" style="margin-top:12px">
          ${logi.reportingTime ? `<div class="hk-kv-item"><small>Reporting Date &amp; Time</small><b>${esc(C.fmtDT(logi.reportingTime) !== '—' ? C.fmtDT(logi.reportingTime) : logi.reportingTime)}</b></div>` : ''}
          ${logi.venueName ? `<div class="hk-kv-item"><small>Venue / Hall</small><b>${esc(logi.venueName)}</b></div>` : ''}
          ${logi.address ? `<div class="hk-kv-item"><small>Full Address</small><b>${esc(logi.address)}</b></div>` : ''}
          ${logi.deskContact ? `<div class="hk-kv-item"><small>Coordinator / Desk</small><b>${esc(logi.deskContact)}</b></div>` : ''}
        </div>
        ${logi.instructions ? `<div class="hk-msg ok" style="margin-top:10px"><i data-lucide="info"></i><span>${esc(logi.instructions)}</span></div>` : ''}
        ${(meetUrl || mapUrl) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          ${meetUrl ? `<a class="hk-btn sm primary" href="${esc(meetUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="video"></i>Join Online Meet</a>` : ''}
          ${mapUrl ? `<a class="hk-btn sm" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation"></i>Open Venue Map</a>` : ''}
        </div>` : ''}
      </section>`;
    }

    /* ---------- 3. Clean Screening Test Card ---------- */
    let testCard = '';
    if(meta){
      const closed = meta.endMs && now > meta.endMs;
      const notYet = meta.startMs && now < meta.startMs;
      const revMs = Number(meta.resultRevealMs || 0);
      const scoreHidden = revMs > 0 && now < revMs;

      let body;
      if(att?.submittedAtMs){
        const total = att.total ?? meta.total ?? 0;
        const pct = total ? Math.round(((att.score ?? 0) / total) * 100) : 0;
        const ansCount = att.answers ? Object.keys(att.answers).length : (att.correctCount != null ? (att.correctCount + (att.wrongCount || 0)) : null);
        const reasonChip = att.submitReason === 'time_up'
          ? '<span class="hk-chip gold"><i data-lucide="timer"></i>Auto-submitted · Time Up</span>'
          : att.submitReason === 'tab_switch'
            ? '<span class="hk-chip bad"><i data-lucide="log-out"></i>Auto-submitted · Left Tab</span>'
            : '<span class="hk-chip"><i data-lucide="circle-check"></i>Test Submitted</span>';

        body = `<div class="hk-test-done">
          <div class="td-head">
            ${reasonChip}
            <span class="hk-xs hk-muted">${C.fmtDT(att.submittedAtMs)} (${C.ago(att.submittedAtMs)})</span>
          </div>
          ${ansCount != null ? `<div class="hk-kv-grid">
            <div class="hk-kv-item"><small>Progress Saved</small><b>${ansCount} / ${meta.count} Answered</b></div>
            <div class="hk-kv-item"><small>Result Reveal Time</small><b>${revMs > 0 ? C.fmtDT(revMs) : 'Immediate'}</b></div>
          </div>` : `<div class="hk-kv-grid"><div class="hk-kv-item"><small>Result Reveal Time</small><b>${revMs > 0 ? C.fmtDT(revMs) : 'Immediate'}</b></div></div>`}
          ${scoreHidden
            ? `<div class="hk-countdown gold"><i data-lucide="clock"></i><span>Results &amp; points reveal on ${C.fmtDT(revMs)}</span><span class="tval" data-cd="${revMs}">${C.countdownText(revMs, now)}</span></div>`
            : `<div class="hk-test-scorebox">
                <div class="ts-main">
                  <small class="hk-eyebrow">Your Test Result</small>
                  <b>${att.score ?? 0} <small>/ ${total} pts (${pct}%)</small></b>
                </div>
                ${(att.correctCount != null) ? `<div class="ts-pills">
                  <span class="hk-chip"><i data-lucide="check"></i>${att.correctCount} Right</span>
                  <span class="hk-chip bad"><i data-lucide="x"></i>${att.wrongCount || 0} Wrong</span>
                  ${att.skippedCount ? `<span class="hk-chip neutral">${att.skippedCount} Skipped</span>` : ''}
                </div>` : ''}
              </div>`}
        </div>`;
      } else if(reg.status === 'rejected'){
        body = '<p class="hk-sm hk-muted">Tests are not available for this registration.</p>';
      } else if(closed && !att){
        body = '<div class="hk-msg err"><i data-lucide="timer-off"></i><span>The test window has closed.</span></div>';
      } else if(notYet){
        body = `<div class="hk-stack" style="gap:10px">
          <div class="hk-kv-grid">
            <div class="hk-kv-item"><small>Questions &amp; Marks</small><b>${meta.count} MCQs · ${meta.total} Marks</b></div>
            <div class="hk-kv-item"><small>Duration</small><b>${meta.durationMin} minutes</b></div>
          </div>
          <div class="hk-countdown"><i data-lucide="clock"></i><span>Test starts at ${C.fmtDT(meta.startMs)}</span><span class="tval" data-cd="${meta.startMs}">${C.countdownText(meta.startMs, now)}</span></div>
        </div>`;
      } else {
        const attDeadline = att ? Math.min(att.startedAtMs + ((+meta.durationMin || 30) * 60000), meta.endMs || Infinity) : 0;
        const attExpiredGrace = att && attDeadline && now > attDeadline && now <= attDeadline + 60000;
        const attExpiredLost = att && attDeadline && now > attDeadline + 60000;
        if(attExpiredLost){
          body = `<div class="hk-stack" style="gap:10px">
            <div class="hk-msg err"><i data-lucide="timer-off"></i><span>Your test timer ended on ${C.fmtDT(attDeadline)} before final submission completed.</span></div>
            ${revMs > 0 ? `<div class="hk-kv-grid"><div class="hk-kv-item"><small>Scheduled Result Reveal</small><b>${C.fmtDT(revMs)}</b></div></div>` : ''}
          </div>`;
        } else {
          body = `<div class="hk-stack" style="gap:12px">
            <div class="hk-kv-grid">
              <div class="hk-kv-item"><small>Format</small><b>${meta.count} Questions · ${meta.total} Marks</b></div>
              <div class="hk-kv-item"><small>Time Limit · Reveal</small><b>${meta.durationMin} min · ${revMs > 0 ? C.fmtDT(revMs) : 'Instant'}</b></div>
            </div>
            ${meta.endMs ? `<div class="hk-countdown"><i data-lucide="timer"></i><span>Window closes ${C.fmtDT(meta.endMs)}</span><span class="tval" data-cd="${meta.endMs}">${C.countdownText(meta.endMs, now)}</span></div>` : ''}
            <ul class="hk-test-rules">
              <li><i data-lucide="zap"></i><span>Single attempt per team; answers auto-save continuously as you mark them.</span></li>
              <li><i data-lucide="shield-alert"></i><span>Leaving the test tab or closing the window immediately saves your progress and auto-submits your test.</span></li>
              <li><i data-lucide="clock"></i><span>Automatically saves &amp; finalizes when the timer hits 00:00, then displays your result reveal time.</span></li>
            </ul>
            <button type="button" class="hk-btn primary lg block" data-start><i data-lucide="play"></i>${attExpiredGrace ? 'Finalize Saved Progress Now' : att ? 'Resume Test Now' : 'Start Test'}</button>
          </div>`;
        }
      }

      testCard = `<section class="hk-card-s hk-dcard hk-test-card-clean" id="testCard">
        <div class="dh"><i data-lucide="clipboard-check"></i><h3>${esc(meta.title || 'Screening test')}</h3>${!att?.submittedAtMs && !closed && !notYet ? '<span class="hk-chip">Live</span>' : ''}</div>
        ${body}
      </section>`;
    }

    /* ---------- 4. Compact Profile-Style Project Submission Card + Review Lock ---------- */
    const f = k => esc(sub?.[k] || '');
    const hasExplicitFlags = ['askPpt', 'askRepo', 'askVideo', 'askIntroVideo', 'askDemo', 'askExtra', 'reqPpt', 'reqRepo', 'reqVideo', 'reqIntroVideo', 'reqDemo', 'reqExtra'].some(k => k in subCfg);
    const stdFields = [
      { key: 'pptUrl', ask: hasExplicitFlags ? !!(subCfg.askPpt || subCfg.reqPpt) : true, req: !!subCfg.reqPpt, label: 'Presentation (PPT / PDF link)', short: 'Presentation / PPT', icon: 'presentation', ph: 'https://drive.google.com/…', help: 'drive' },
      { key: 'repoUrl', ask: hasExplicitFlags ? !!(subCfg.askRepo || subCfg.reqRepo) : true, req: !!subCfg.reqRepo, label: 'Repository link', short: 'GitHub / Code', icon: 'git-branch', ph: 'https://github.com/…', help: '' },
      { key: 'videoUrl', ask: hasExplicitFlags ? !!(subCfg.askVideo || subCfg.reqVideo) : true, req: !!subCfg.reqVideo, label: 'Prototype / Demo video link', short: 'Demo Video', icon: 'video', ph: 'https://drive.google.com/… or YouTube', help: 'video' },
      { key: 'introVideoUrl', ask: !!(subCfg.askIntroVideo || subCfg.reqIntroVideo), req: !!subCfg.reqIntroVideo, label: 'Intro / Pitch video link', short: 'Pitch Video', icon: 'clapperboard', ph: 'https://drive.google.com/… or YouTube', help: 'video' },
      { key: 'demoUrl', ask: hasExplicitFlags ? !!(subCfg.askDemo || subCfg.reqDemo) : true, req: !!subCfg.reqDemo, label: 'Live demo link', short: 'Live Demo', icon: 'globe', ph: 'https://…', help: 'web' },
      { key: 'extraUrl', ask: hasExplicitFlags ? !!(subCfg.askExtra || subCfg.reqExtra) : true, req: !!subCfg.reqExtra, label: 'Other link (design, docs, dataset)', short: 'Other Link', icon: 'link-2', ph: 'https://…', help: 'drive' }
    ].filter(x => x.ask);

    const customSubFields = (subCfg.customFields || []).filter(cf => (cf.label || '').trim());
    const getCustomSubVal = (cf, i) => {
      const arr = Array.isArray(sub?.customAnswers) ? sub.customAnswers.filter(x => x && x.id !== '__proto_meta') : [];
      const hit = arr.find(a => (cf.id && a.id === cf.id) || a.label === cf.label) || arr[i];
      return hit?.value || '';
    };

    const urlFieldHtml = (name, label, ph, val, req, helpKind, attrExtra = '') => `
      <div class="hk-field"><label>${esc(label)} <small>${req ? 'required' : 'optional'}</small></label>
        <div class="hk-url-wrap">
          <input class="hk-input" ${name ? `name="${esc(name)}"` : ''} ${attrExtra} type="url" placeholder="${esc(ph)}" value="${esc(val)}" ${req ? 'required' : ''} ${canEditSub || (!sub && subOpen) ? '' : 'disabled'}>
          ${helpKind ? `<button type="button" class="hk-help-ic" data-drive-help="${esc(helpKind)}" data-help-label="${esc(label)}" title="How to upload &amp; share link" aria-label="How to upload and share ${esc(label)}"><i data-lucide="info"></i></button>` : ''}
        </div>
      </div>`;

    const stdInputsHtml = stdFields.map(x => urlFieldHtml(x.key, x.label, x.ph, sub?.[x.key] || '', x.req, x.help)).join('');
    const customInputsHtml = customSubFields.map((cf, i) => cf.type === 'url'
      ? urlFieldHtml('', cf.label, 'https://drive.google.com/…', getCustomSubVal(cf, i), !!cf.required, 'drive', `data-sub-cf="${i}"`)
      : `<div class="hk-field"><label>${esc(cf.label)} <small>${cf.required ? 'required' : 'optional'}</small></label><input class="hk-input" data-sub-cf="${i}" type="text" placeholder="Enter your answer…" value="${esc(getCustomSubVal(cf, i))}" ${cf.required ? 'required' : ''} ${canEditSub || (!sub && subOpen) ? '' : 'disabled'}></div>`
    ).join('');

    const showSavedSub = !!(sub && (!editingSub || !canEditSub));
    let subCard = '';
    if(subCfg.open !== false){
      if(showSavedSub){
        const savedLinks = [
          { key: 'pptUrl', label: 'Presentation / PPT', icon: 'presentation' },
          { key: 'repoUrl', label: 'GitHub Repo', icon: 'git-branch' },
          { key: 'demoUrl', label: 'Live Demo', icon: 'globe' },
          { key: 'videoUrl', label: 'Demo Video', icon: 'video' },
          { key: 'introVideoUrl', label: 'Pitch Video', icon: 'clapperboard' },
          { key: 'extraUrl', label: 'Additional Link', icon: 'link-2' }
        ].map(x => ({ ...x, href: C.safeUrl(sub[x.key]) })).filter(x => x.href);
        const savedCustom = (Array.isArray(sub.customAnswers) ? sub.customAnswers : []).filter(a => a && a.value && a.id !== '__proto_meta');
        const ideaLong = (sub.idea || '').length > 165;
        const statusChip = isSubReviewed
          ? `<span class="hk-chip gold"><i data-lucide="badge-check"></i>Marked as Reviewed${sub.score != null ? ` · ${esc(sub.score)}/100` : ''}</span>`
          : isSubReviewing
            ? `<span class="hk-chip sky"><i data-lucide="hourglass"></i>Reviewing (Editable)</span>`
            : `<span class="hk-chip"><i data-lucide="circle-check"></i>Submitted</span>`;
        const lockChip = !canEditSub ? `<span class="hk-chip neutral"><i data-lucide="lock"></i>Edit Disabled</span>` : '';

        subCard = `<section class="hk-card-s hk-dcard hk-sub-saved ${justSubmittedSub ? 'hk-submit-celeb' : ''}" id="subCard">
          ${justSubmittedSub ? `<div class="hk-celeb-strip"><i data-lucide="sparkles"></i><span>Project submitted &amp; saved cleanly! You can edit anytime before review.</span></div>` : ''}
          <div class="hk-prof-head hk-sub-compact-head">
            <div class="hk-sub-badge ${isSubReviewed ? 'gold' : ''}"><i data-lucide="${isSubReviewed ? 'badge-check' : 'lightbulb'}"></i></div>
            <div class="grow">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <h3 style="font-size:1.12rem">${esc(sub.title)}</h3>
                ${statusChip}
                ${lockChip}
              </div>
              <div class="hk-xs hk-muted" style="margin-top:3px">Project Submission · Saved ${sub.updatedAtMs ? C.ago(sub.updatedAtMs) : 'now'}${isSubReviewed ? ' · Marked as Reviewed (Locked)' : (ideaDl ? ` · Editable until ${C.fmtDT(ideaDl)}` : '')}</div>
            </div>
            ${canEditSub
              ? `<button type="button" class="hk-btn primary sm" id="editSubBtn"><i data-lucide="pencil"></i>Edit</button>`
              : `<button type="button" class="hk-btn sm ghost" disabled title="Editing disabled after review"><i data-lucide="lock"></i>Edit Disabled</button>`}
          </div>

          ${isSubReviewed ? `<div class="hk-msg ok" style="margin-top:12px"><i data-lucide="badge-check"></i><span><b>Marked as Reviewed</b>${sub.score != null ? ` · Score: <b>${esc(sub.score)} / 100</b>` : ''}. ${sub.feedback ? `Judge feedback: ${esc(sub.feedback)}` : 'Editing is disabled for this finalized submission.'}</span></div>` : ''}

          <div class="hk-kv-grid" style="margin-top:12px">
            <div class="hk-kv-item"><small>Project Title</small><b>${esc(sub.title)}</b></div>
            <div class="hk-kv-item"><small>Submission Status</small><b>${isSubReviewed ? 'Marked as Reviewed (Locked)' : (isSubReviewing ? 'Reviewing (Editable)' : (subOpen ? 'Submitted (Editable)' : 'Submitted (Locked)'))}</b></div>
          </div>

          <div class="hk-sub-compact-idea" style="margin-top:10px">
            <small class="hk-eyebrow" style="margin-bottom:4px">Idea &amp; Approach</small>
            <p class="hk-sm ${showFullIdea ? '' : 'hk-clamp2'}" style="margin:0;white-space:pre-wrap;line-height:1.5">${esc(sub.idea)}</p>
            ${ideaLong ? `<button type="button" class="hk-linkbtn" id="toggleIdeaBtn">${showFullIdea ? 'Show less' : 'Read full idea'}</button>` : ''}
          </div>

          ${(savedLinks.length || savedCustom.length) ? `<div style="margin-top:12px">
            <small class="hk-eyebrow" style="margin-bottom:8px">Attached Links</small>
            <div class="hk-prof-links">
              ${savedLinks.map(l => `<a class="hk-chip btn" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer"><i data-lucide="${l.icon}"></i>${esc(l.label)}<i data-lucide="external-link" style="width:12px;height:12px"></i></a>`).join('')}
              ${savedCustom.map(a => C.safeUrl(a.value)
                ? `<a class="hk-chip btn" href="${esc(C.safeUrl(a.value))}" target="_blank" rel="noopener noreferrer"><i data-lucide="link"></i>${esc(a.label || 'Link')}</a>`
                : `<span class="hk-chip neutral">${esc(a.label)}: ${esc(a.value)}</span>`).join('')}
            </div>
          </div>` : ''}
        </section>`;
      } else {
        subCard = `<section class="hk-card-s hk-dcard" id="subCard">
          <div class="hk-sub-head">
            <div class="dh" style="margin-bottom:0;flex:1;min-width:180px">
              <i data-lucide="lightbulb"></i>
              <h3>${sub ? 'Edit project submission' : 'Project submission'}</h3>
            </div>
            <div class="hk-sub-head-acts">
              ${sub ? `<button type="button" class="hk-btn sm ghost" id="cancelEditSubBtn"><i data-lucide="x"></i>Cancel</button>` : `<span class="hk-chip neutral">Not submitted</span>`}
            </div>
          </div>
          <p class="hk-sm hk-muted" style="margin-top:8px">Fill in your idea and links. Editable until the organiser reviews your submission${ideaDl ? ` (or deadline <b>${C.fmtDT(ideaDl)}</b>)` : ''}. ${subCfg.instructions ? esc(subCfg.instructions) : ''}</p>
          <form id="subForm" class="hk-form" novalidate style="margin-top:12px">
            <div class="hk-field"><label>Project / idea title</label><input class="hk-input" name="title" maxlength="140" required placeholder="e.g. Smart Campus Utility App" value="${f('title')}" ${subOpen ? '' : 'disabled'}></div>
            <div class="hk-field"><label>Idea &amp; approach <small>problem, solution, tech used</small></label><textarea class="hk-textarea" name="idea" maxlength="4000" required placeholder="Describe the problem you solve, approach, and tech stack (min 30 characters)…" style="min-height:110px" ${subOpen ? '' : 'disabled'}>${f('idea')}</textarea></div>
            ${stdInputsHtml ? `<div class="hk-grid2">${stdInputsHtml}</div>` : ''}
            ${customInputsHtml}
            <div id="subErr" class="hk-msg err hk-hidden"></div>
            ${subOpen
              ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                  <button class="hk-btn primary" type="submit"><i data-lucide="check"></i>${sub ? 'Save changes' : 'Submit to organiser'}</button>
                  ${sub ? `<button type="button" class="hk-btn ghost" id="cancelEditSubBtn2">Cancel</button>` : ''}
                </div>`
              : `<div class="hk-msg err"><i data-lucide="lock"></i><span>${reg.status === 'rejected' ? 'Submissions are not available for this registration.' : (ideaDl && now > ideaDl ? `The submission window closed on ${C.fmtDT(ideaDl)}.` : 'Submissions are locked.')}</span></div>`}
          </form>
        </section>`;
      }
    }

    /* ---------- 5. Prototype / Build Round Submission Card ---------- */
    let protoCard = '';
    const protoEligible = !!(protoCfg.open && (protoCfg.audience !== 'shortlisted' || ['shortlisted', 'selected'].includes(reg.status) || protoSub));
    if(protoEligible){
      const protoDl = +protoCfg.deadlineMs || 0;
      const protoOpenNow = (!protoDl || now <= protoDl) && reg.status !== 'rejected';
      const pLinks = protoSub ? [
        { url: protoSub.repoUrl, label: 'GitHub Repo', icon: 'git-branch' },
        { url: protoSub.demoUrl, label: 'Prototype Link', icon: 'rocket' },
        { url: protoSub.videoUrl, label: 'Demo Video', icon: 'video' },
        { url: protoSub.extraUrl, label: 'Other Doc / Link', icon: 'link-2' }
      ].map(x => ({ ...x, href: C.safeUrl(x.url) })).filter(x => x.href) : [];

      if(protoSub && !editingProto){
        protoCard = `<section class="hk-card-s hk-dcard hk-proto-card ${justSubmittedProto ? 'hk-submit-celeb' : ''}" id="protoCard">
          ${justSubmittedProto ? `<div class="hk-celeb-strip"><i data-lucide="sparkles"></i><span>Prototype submitted cleanly! ${winCfg.revealAtMs && now < winCfg.revealAtMs ? 'Winners reveal countdown started below.' : 'Track winner updates here.'}</span></div>` : ''}
          <div class="hk-prof-head hk-sub-compact-head">
            <div class="hk-sub-badge gold"><i data-lucide="rocket"></i></div>
            <div class="grow">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <h3 style="font-size:1.12rem">${esc(protoSub.title)}</h3>
                <span class="hk-chip"><i data-lucide="circle-check"></i>Prototype Submitted</span>
              </div>
              <div class="hk-xs hk-muted" style="margin-top:3px">${esc(protoCfg.title || 'Prototype Round')} · Submitted ${C.ago(protoSub.submittedAtMs)}${protoDl ? ` · Deadline ${C.fmtDT(protoDl)}` : ''}</div>
            </div>
            ${protoOpenNow ? `<button type="button" class="hk-btn primary sm" id="editProtoBtn"><i data-lucide="pencil"></i>Edit</button>` : ''}
          </div>
          ${protoSub.details ? `<div class="hk-sub-compact-idea" style="margin-top:10px"><small class="hk-eyebrow" style="margin-bottom:4px">Prototype Build Details</small><p class="hk-sm" style="margin:0;white-space:pre-wrap;line-height:1.5">${esc(protoSub.details)}</p></div>` : ''}
          ${pLinks.length ? `<div style="margin-top:12px"><small class="hk-eyebrow" style="margin-bottom:8px">Submitted Prototype Links</small><div class="hk-prof-links">${pLinks.map(l => `<a class="hk-chip btn" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer"><i data-lucide="${l.icon}"></i>${esc(l.label)}<i data-lucide="external-link" style="width:12px;height:12px"></i></a>`).join('')}</div></div>` : ''}
          ${winCfg.revealAtMs && now < winCfg.revealAtMs ? `<div class="hk-countdown gold" style="margin-top:12px"><i data-lucide="trophy"></i><span>Winners reveal on ${C.fmtDT(winCfg.revealAtMs)}</span><span class="tval" data-cd="${winCfg.revealAtMs}">${C.countdownText(winCfg.revealAtMs, now)}</span></div>` : ''}
        </section>`;
      } else {
        const askRepo = protoCfg.askRepo !== false;
        const askDemo = protoCfg.askDemo !== false;
        const askVideo = !!protoCfg.askVideo;
        const askExtra = !!protoCfg.askExtra;
        protoCard = `<section class="hk-card-s hk-dcard hk-proto-card" id="protoCard">
          <div class="hk-sub-head">
            <div class="dh" style="margin-bottom:0;flex:1;min-width:180px">
              <i data-lucide="rocket"></i>
              <div>
                <h3>${esc(protoCfg.title || 'Prototype & Final Build Submission')}</h3>
                <div class="hk-xs hk-muted">${protoDl ? `Deadline: ${C.fmtDT(protoDl)}` : 'Open for submission'}</div>
              </div>
            </div>
            <div class="hk-sub-head-acts">
              ${protoSub ? `<button type="button" class="hk-btn sm ghost" id="cancelEditProtoBtn"><i data-lucide="x"></i>Cancel</button>` : `<span class="hk-chip gold">Next Round</span>`}
            </div>
          </div>
          ${protoCfg.instructions ? `<div class="hk-msg ok" style="margin-top:10px"><i data-lucide="clipboard-list"></i><span>${esc(protoCfg.instructions)}</span></div>` : ''}
          ${protoDl && now < protoDl ? `<div class="hk-countdown" style="margin-top:10px"><i data-lucide="timer"></i><span>Prototype window closes in</span><span class="tval" data-cd="${protoDl}">${C.countdownText(protoDl, now)}</span></div>` : ''}
          <form id="protoForm" class="hk-form" novalidate style="margin-top:12px">
            <div class="hk-field"><label>Prototype / Build Name</label><input class="hk-input" name="title" maxlength="140" required placeholder="e.g. Working Prototype v1" value="${esc(protoSub?.title || sub?.title || '')}" ${protoOpenNow ? '' : 'disabled'}></div>
            <div class="hk-field"><label>What did you build? <small>features, working flow, tech stack</small></label><textarea class="hk-textarea" name="details" maxlength="3500" required placeholder="Describe what works in your prototype, architecture, and any test credentials…" style="min-height:96px" ${protoOpenNow ? '' : 'disabled'}>${esc(protoSub?.details || '')}</textarea></div>
            <div class="hk-grid2">
              ${askRepo ? `<div class="hk-field"><label>GitHub Repository Link <small>${protoCfg.reqRepo ? 'required' : 'optional'}</small></label><input class="hk-input" name="repoUrl" type="url" placeholder="https://github.com/..." value="${esc(protoSub?.repoUrl || sub?.repoUrl || '')}" ${protoCfg.reqRepo ? 'required' : ''} ${protoOpenNow ? '' : 'disabled'}></div>` : ''}
              ${askDemo ? `<div class="hk-field"><label>Hosted Prototype / Live Link <small>${protoCfg.reqDemo ? 'required' : 'optional'}</small></label><input class="hk-input" name="demoUrl" type="url" placeholder="https://..." value="${esc(protoSub?.demoUrl || sub?.demoUrl || '')}" ${protoCfg.reqDemo ? 'required' : ''} ${protoOpenNow ? '' : 'disabled'}></div>` : ''}
              ${askVideo ? `<div class="hk-field"><label>Demo Video Link <small>${protoCfg.reqVideo ? 'required' : 'optional'}</small></label><input class="hk-input" name="videoUrl" type="url" placeholder="https://drive.google.com/... or YouTube" value="${esc(protoSub?.videoUrl || sub?.videoUrl || '')}" ${protoCfg.reqVideo ? 'required' : ''} ${protoOpenNow ? '' : 'disabled'}></div>` : ''}
              ${askExtra ? `<div class="hk-field"><label>Additional Docs / Figma Link <small>optional</small></label><input class="hk-input" name="extraUrl" type="url" placeholder="https://..." value="${esc(protoSub?.extraUrl || '')}" ${protoOpenNow ? '' : 'disabled'}></div>` : ''}
            </div>
            <div id="protoErr" class="hk-msg err hk-hidden"></div>
            ${protoOpenNow
              ? `<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="hk-btn primary" type="submit"><i data-lucide="rocket"></i>${protoSub ? 'Update Prototype' : 'Submit Prototype'}</button>${protoSub ? `<button type="button" class="hk-btn ghost" id="cancelEditProtoBtn2">Cancel</button>` : ''}</div>`
              : `<div class="hk-msg err"><i data-lucide="lock"></i><span>The prototype deadline (${C.fmtDT(protoDl)}) has passed.</span></div>`}
          </form>
        </section>`;
      }
    }

    const team = `<section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="users-round"></i><h3>${reg.teamMode === 'solo' ? 'Solo entry' : esc(reg.teamName || 'Your team')}</h3></div>
      <div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(reg.name)}</b><span class="hk-sm hk-muted">Team leader · ${esc(reg.email)}</span></div></div>
      ${members.map(m => `<div class="hk-lrow" style="padding:8px 0"><div class="info"><b>${esc(m.name)}</b><span class="hk-sm hk-muted">${esc([m.email, m.college, m.course, m.year].filter(Boolean).join(' · ') || m.phone || 'Member')}</span></div></div>`).join('')}
      <p class="hk-xs hk-muted" style="margin-top:8px">All updates are emailed to the team leader from team@campusconnectone.online.</p></section>`;

    const org = h.organiser || {};
    const cd = countdownHtml(h, reg, !!effectiveMyWin);
    const curRound = rounds[reg.stage || 0]?.name || '';

    const appProgressSection = applicationStepperHtml({
      reg,
      sub,
      hasSubmission: subCfg.open !== false,
      att,
      isWinner: !!effectiveMyWin,
      winPlace: effectiveMyWin?.place || '',
      teamLabel: reg.teamMode === 'solo' ? `Solo · ${reg.name}` : `Team ${reg.teamName || reg.name}`,
      roundName: curRound || '',
      hostNote: reg.hostNote || ''
    });

    const nextStepCard = `<div class="hk-next-step ${esc(nextStep.tone)}">
      <div class="ns-ic"><i data-lucide="${nextStep.icon}"></i></div>
      <div class="ns-body">
        <div class="ns-top"><span class="hk-chip ${nextStep.tone === 'gold' ? 'gold' : nextStep.tone === 'bad' ? 'bad' : nextStep.tone === 'warn' ? 'warn' : ''}">${esc(nextStep.badge)}</span><b>${esc(nextStep.title)}</b></div>
        <p class="hk-sm hk-muted">${esc(nextStep.desc)}</p>
      </div>
      ${nextStep.cta ? `<div class="ns-cta">${nextStep.cta}</div>` : ''}
    </div>`;

    view.innerHTML = `<div class="hk-view"><a class="hk-btn ghost sm" href="#/my" style="margin-bottom:12px"><i data-lucide="arrow-left"></i>My hackathons</a>
      <div class="hk-page-h"><div><span class="hk-eyebrow">My dashboard</span><h1>${esc(h.title)}</h1><p>Hosted by ${esc(org.name || h.hostName || 'the organiser')}${org.org ? ' · ' + esc(org.org) : ''}</p></div><span class="hk-chip ${st[1]}">${st[0]}</span></div>
      ${appProgressSection}
      ${winnersSection}
      ${nextStepCard}
      ${cd ? `<div style="margin-bottom:14px">${cd}</div>` : ''}
      <section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="list-ordered"></i><h3>Process &amp; round timeline</h3></div>${tracker}</section>
      <div class="hk-dgrid">
        <div class="hk-stack">${logisticsCard}${protoCard}${testCard}${subCard}</div>
        <aside class="hk-stack">${team}
          <section class="hk-card-s hk-dcard"><div class="dh"><i data-lucide="calendar-days"></i><h3>Key dates</h3></div><ul class="hk-kv"><li><span>Starts</span><b>${C.fmtDT(h.startMs)}</b></li><li><span>Ends</span><b>${C.fmtDT(h.endMs)}</b></li>${ideaDl ? `<li><span>Submission</span><b>${C.fmtDT(ideaDl)}</b></li>` : ''}${protoCfg.open && protoCfg.deadlineMs ? `<li><span>Prototype</span><b>${C.fmtDT(protoCfg.deadlineMs)}</b></li>` : ''}${winCfg.revealAtMs ? `<li><span>Winners Reveal</span><b>${C.fmtDT(winCfg.revealAtMs)}</b></li>` : ''}</ul>
          ${org.email ? `<a class="hk-btn sm block" style="margin-top:10px" href="mailto:${esc(org.email)}"><i data-lucide="mail"></i>Contact organiser</a>` : ''}<a class="hk-btn sm block" style="margin-top:8px" href="#/h/${esc(h.id)}">View hackathon page</a></section>
        </aside>
      </div></div>`;

    stopTimer = startCountdowns(view);

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

      const formElements = $$('input, textarea, button', sf);
      formElements.forEach(el => el.disabled = true);
      const btn = $('button[type=submit]', sf);
      if(btn) btn.innerHTML = '<span class="hk-spin"></span> Saving project…';
      try {
        await C.saveSubmission(h, S.user, reg, d);
        editingSub = false;
        justSubmittedSub = true;
        toast(sub ? 'Project updated and saved!' : 'Project submitted cleanly!', 'success');
        await loadAll();
        render();
        setTimeout(() => { justSubmittedSub = false; }, 5000);
      } catch(ex){
        formElements.forEach(el => el.disabled = false);
        err(ex?.message || 'Could not submit right now.');
        if(btn) btn.innerHTML = `<i data-lucide="check"></i>${sub ? 'Save changes' : 'Submit to organiser'}`;
        icons();
      }
    };

    const pf = $('#protoForm');
    if(pf) pf.onsubmit = async e => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(pf).entries());
      const perr = m => { const b = $('#protoErr'); b.classList.toggle('hk-hidden', !m); b.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); };
      perr('');
      for(const k of Object.keys(d)) d[k] = String(d[k]).trim();
      if((d.title || '').length < 3) return perr('Add a prototype title.');
      if((d.details || '').length < 15) return perr('Describe what you built (at least 15 characters).');
      if(protoCfg.reqRepo && !d.repoUrl) return perr('GitHub Repository link is required.');
      if(protoCfg.reqDemo && !d.demoUrl) return perr('Prototype live link is required.');
      if(protoCfg.reqVideo && !d.videoUrl) return perr('Demo video link is required.');
      for(const k of ['repoUrl', 'demoUrl', 'videoUrl', 'extraUrl']){
        if(d[k] && !C.isUrl(d[k])) return perr('Links must start with https://');
      }
      const btn = $('button[type=submit]', pf);
      if(btn){ btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Submitting prototype…'; }
      try {
        await C.savePrototypeSubmission(h, S.user, reg, d);
        editingProto = false;
        justSubmittedProto = true;
        toast('Prototype submitted cleanly! 🚀', 'success');
        await loadAll();
        render();
        setTimeout(() => { justSubmittedProto = false; }, 5000);
      } catch(ex){
        perr(ex?.message || 'Could not submit prototype.');
        if(btn){ btn.disabled = false; btn.innerHTML = `<i data-lucide="rocket"></i>${protoSub ? 'Update Prototype' : 'Submit Prototype'}`; icons(); }
      }
    };

    icons();
  }

  const ok = await loadAll();
  if(!ok) return;

  const showDriveHelp = (label, kind) => {
    C.modal(`How to share · ${label}`, `<div class="hk-stack">
      <div class="hk-msg ok"><i data-lucide="hard-drive-upload"></i><span>Upload your file to <b>Google Drive</b>${kind === 'video' ? ' (or YouTube as <b>Unlisted</b>)' : ''}, set access to <b>Anyone with the link</b>, and paste the URL here.</span></div>
      <ol style="margin:0;padding-left:20px;display:grid;gap:8px;font-size:.9rem">
        <li>Open <b>drive.google.com</b> and upload your ${kind === 'video' ? 'video (MP4/MOV)' : 'PPT / PDF / document'}.</li>
        <li>Click the three dots (<b>⋮</b>) on your uploaded file &rarr; choose <b>Share</b> &rarr; <b>Share</b>.</li>
        <li>Under <b>General access</b>, change <b>Restricted</b> to <b>Anyone with the link</b> (Viewer role is fine).</li>
        <li>Click <b>Copy link</b> and paste that <code>https://...</code> URL into the <b>${esc(label)}</b> box.</li>
      </ol>
      <div class="hk-hint">Tip: Verify your link in an incognito window so organisers can open it without permission prompts.</div>
    </div>`);
  };

  view.onclick = e => {
    const startBtn = e.target.closest('[data-start]');
    if(startBtn){
      runTest(cx, h, meta, () => dash(cx, hid).then(icons));
      return;
    }
    const hb = e.target.closest('[data-drive-help]');
    if(hb){
      e.preventDefault();
      showDriveHelp(hb.dataset.helpLabel || 'Submission link', hb.dataset.driveHelp);
      return;
    }
    if(e.target.closest('#editSubBtn')){
      editingSub = true;
      render();
      $('#subCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if(e.target.closest('#cancelEditSubBtn, #cancelEditSubBtn2')){
      editingSub = false;
      render();
      return;
    }
    if(e.target.closest('#toggleIdeaBtn')){
      showFullIdea = !showFullIdea;
      render();
      return;
    }
    if(e.target.closest('#editProtoBtn')){
      editingProto = true;
      render();
      $('#protoCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if(e.target.closest('#cancelEditProtoBtn, #cancelEditProtoBtn2')){
      editingProto = false;
      render();
      return;
    }
    const jp = e.target.closest('[data-jump]');
    if(jp){
      const el = $(jp.dataset.jump);
      if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  unsubReg = FS.onSnapshot(FS.doc(C.db, 'hkRegistrations', `${hid}_${S.user.uid}`), async snap => {
    if(!snap.exists() || cx.stale()) return;
    const live = snap.data();
    if(live.status !== reg.status || (live.stage || 0) !== (reg.stage || 0) || (live.hostNote || '') !== (reg.hostNote || '')){
      const activeTag = document.activeElement?.tagName;
      if(editingSub || editingProto || ['INPUT', 'TEXTAREA'].includes(activeTag)){
        reg = { ...reg, ...live };
        toast(`Status updated: ${(STATUS_TXT[live.status] || STATUS_TXT.registered)[0]}`, 'info');
      } else {
        await loadAll();
        render();
      }
    }
  }, () => {});

  unsubHack = FS.onSnapshot(FS.doc(C.db, 'hkHackathons', hid), async snap => {
    if(!snap.exists() || cx.stale()) return;
    const liveH = { id: snap.id, ...snap.data() };
    const prevKey = JSON.stringify({ p: h?.submission?.prototype, l: h?.submission?.logistics, w: h?.submission?.winnerReveal });
    const nextKey = JSON.stringify({ p: liveH?.submission?.prototype, l: liveH?.submission?.logistics, w: liveH?.submission?.winnerReveal });
    if(prevKey !== nextKey){
      h = liveH;
      const activeTag = document.activeElement?.tagName;
      if(!editingSub && !editingProto && !['INPUT', 'TEXTAREA'].includes(activeTag)){
        render();
      }
    }
  }, () => {});

  unsubSub = FS.onSnapshot(FS.doc(C.db, 'hkSubmissions', `${hid}_${S.user.uid}`), snap => {
    if(cx.stale()) return;
    const liveSub = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if(!liveSub) return;
    const changed = liveSub.reviewStatus !== sub?.reviewStatus || liveSub.score !== sub?.score || (liveSub.feedback || '') !== (sub?.feedback || '');
    if(changed){
      const becameFinal = liveSub.reviewStatus === 'reviewed' && sub?.reviewStatus !== 'reviewed';
      sub = liveSub;
      if(becameFinal){
        editingSub = false;
        toast('Your project was Marked as Reviewed — editing is now disabled.', 'info');
      }
      const activeTag = document.activeElement?.tagName;
      if(becameFinal || (!editingSub && !editingProto && !['INPUT', 'TEXTAREA'].includes(activeTag))){
        render();
      }
    }
  }, () => {});

  cx.S.cleanup = () => {
    stopTimer?.();
    clearTimeout(revealReloadTimer);
    unsubReg?.();
    unsubHack?.();
    unsubSub?.();
    view.onclick = null;
  };
  render();
}

/* ---------- Lag-Free Modern Proctored Test Player ---------- */
async function runTest(cx, h, meta, done){
  const { view } = cx;
  const loadEl = view;
  const startBtn = $('[data-start]');
  const prevBtnHtml = startBtn ? startBtn.innerHTML : '';
  if(startBtn){ startBtn.disabled = true; startBtn.innerHTML = '<span class="hk-spin"></span> Starting test…'; }

  let t;
  try { t = await C.callFn('hkStartTest', { hackathonId: h.id }); }
  catch(e){
    if(startBtn){ startBtn.disabled = false; startBtn.innerHTML = prevBtnHtml || '<i data-lucide="play"></i>Start Test'; icons(); }
    return toast(e.message, 'error');
  }
  cx.S.cleanup?.();
  cx.S.cleanup = null;

  const draftKey = `hk-test-draft-${h.id}_${cx.S.user.uid}`;
  const qs = t.questions || [];
  let ans = {};
  let i = 0, timer = 0, backupTimer = 0, over = false, warnings = 0, warnModal = null, lastViolationAt = 0, stopFinalCd = null;

  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
    if(saved && typeof saved === 'object'){
      const loadedAns = saved.answers && typeof saved.answers === 'object' ? saved.answers : saved;
      Object.entries(loadedAns).forEach(([k, v]) => {
        if(Number.isInteger(v)) ans[k] = v;
      });
      if(Number.isInteger(saved.i) && saved.i >= 0 && saved.i < qs.length) i = saved.i;
    }
  } catch {}

  const left = () => Math.max(0, Math.floor((t.deadlineMs - Date.now()) / 1000));
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const flashSavedPill = () => {
    const el = $('#draftSavedPill');
    if(!el) return;
    el.innerHTML = '<i data-lucide="cloud-check"></i>Progress saved';
    el.classList.add('saved');
    icons(el);
  };
  const saveDraft = () => {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        answers: ans,
        i,
        savedAtMs: Date.now(),
        deadlineMs: t.deadlineMs || 0
      }));
      flashSavedPill();
    } catch {}
  };

  // Build static shell once for zero-lag switching & option toggling
  loadEl.innerHTML = `<div class="hk-view hk-test">
    <div class="hk-test-hd">
      <div class="th-left">
        <span class="hk-eyebrow">${esc(t.title)}</span>
        <div class="th-sub"><b id="qProg">Question 1 of ${qs.length}</b> · <span id="ansCount" class="hk-muted">0/${qs.length} answered</span></div>
      </div>
      <div class="th-right">
        <span class="hk-chip neutral" id="draftSavedPill"><i data-lucide="cloud-check"></i>Auto-saving</span>
        <span class="hk-chip neutral" id="warnPill"><i data-lucide="shield-alert"></i>Auto-submit on tab leave</span>
        <span class="hk-timer" id="tleft">${fmt(left())}</span>
        <button type="button" class="hk-btn sm gold" data-finish><i data-lucide="send"></i>Submit</button>
      </div>
    </div>
    <div class="hk-progress"><i id="qBar" style="width:${Math.round(((i + 1) / Math.max(1, qs.length)) * 100)}%"></i></div>
    <div class="hk-qpal" id="qPal">${qs.map((q, idx) => `<button type="button" class="hk-qdot ${idx === i ? 'cur' : ''} ${ans[q.id] !== undefined ? 'ans' : ''}" data-qidx="${idx}">${idx + 1}</button>`).join('')}</div>
    <section class="hk-card-s hk-dcard hk-test-qbox" id="qBox"></section>
    <div class="hk-test-nav">
      <button type="button" class="hk-btn" data-prev disabled><i data-lucide="arrow-left"></i>Previous</button>
      <button type="button" class="hk-btn ghost sm" data-clear>Clear answer</button>
      <button type="button" class="hk-btn primary" data-next>Next<i data-lucide="arrow-right"></i></button>
    </div>
  </div>`;
  icons();

  const qBox = $('#qBox', view), qProg = $('#qProg', view), ansCountEl = $('#ansCount', view);
  const qBar = $('#qBar', view), qPal = $('#qPal', view), warnPill = $('#warnPill', view);
  const prevBtn = $('[data-prev]', view), nextBtn = $('[data-next]', view);

  const updateCounts = () => {
    const c = qs.filter(q => ans[q.id] !== undefined).length;
    if(ansCountEl) ansCountEl.textContent = `${c}/${qs.length} answered`;
  };

  const renderQuestion = () => {
    const q = qs[i];
    if(!q || !qBox) return;
    qProg.textContent = `Question ${i + 1} of ${qs.length}`;
    qBar.style.width = `${Math.round(((i + 1) / Math.max(1, qs.length)) * 100)}%`;
    updateCounts();

    $$('.hk-qdot', qPal).forEach((dot, idx) => {
      dot.classList.toggle('cur', idx === i);
      dot.classList.toggle('ans', ans[qs[idx].id] !== undefined);
    });

    qBox.innerHTML = `<div class="q-meta"><span class="hk-chip neutral">Q${i + 1}</span><span class="hk-xs hk-muted">${q.marks} mark${q.marks > 1 ? 's' : ''}</span></div>
      <h3 class="q-title">${esc(q.text)}</h3>
      <div class="hk-opts">${q.options.map((o, k) => `<button type="button" class="hk-opt ${ans[q.id] === k ? 'on' : ''}" data-k="${k}"><span>${String.fromCharCode(65 + k)}</span><div>${esc(o)}</div></button>`).join('')}</div>`;

    prevBtn.disabled = i <= 0;
    if(i >= qs.length - 1){
      nextBtn.className = 'hk-btn gold';
      nextBtn.dataset.finish = '1';
      nextBtn.removeAttribute('data-next');
      nextBtn.innerHTML = 'Submit Test ✓';
    } else {
      nextBtn.className = 'hk-btn primary';
      nextBtn.dataset.next = '1';
      nextBtn.removeAttribute('data-finish');
      nextBtn.innerHTML = 'Next &rarr;';
    }
  };

  const teardownListeners = () => {
    clearInterval(timer);
    clearInterval(backupTimer);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onHash);
    window.removeEventListener('beforeunload', onBeforeUnload);
    warnModal?.close?.();
    warnModal = null;
  };

  const renderFinalizedView = ({ reason, result, errMsg, revMs, submittedAtMs, answeredCount }) => {
    const now = Date.now();
    const hidePts = revMs > 0 && now < revMs;
    const isTime = reason === 'time_up';
    const isTab = reason === 'tab_switch';
    const badgeHtml = isTime
      ? '<span class="hk-chip gold"><i data-lucide="timer"></i>Auto-Submitted · Timer Hit 00:00</span>'
      : isTab
        ? '<span class="hk-chip bad"><i data-lucide="log-out"></i>Auto-Submitted · Tab Left</span>'
        : '<span class="hk-chip"><i data-lucide="circle-check"></i>Test Finalized</span>';
    const headline = isTime
      ? 'Time is up — your test has been auto-submitted'
      : isTab
        ? 'You left the test tab — progress saved & auto-submitted'
        : 'Your test has been saved and finalized';

    const revealSection = revMs > 0
      ? (hidePts
          ? `<div class="hk-countdown gold"><i data-lucide="clock"></i><span>Result Reveal Time: <b>${C.fmtDT(revMs)}</b></span><span class="tval" data-cd="${revMs}">${C.countdownText(revMs, now)}</span></div>
             <p class="hk-xs hk-muted" style="margin:6px 0 0">Your score is sealed until ${C.fmtDT(revMs)}. You can safely track the countdown here or on your dashboard.</p>`
          : `<div class="hk-msg ok"><i data-lucide="sparkles"></i><span>Results were scheduled to reveal on <b>${C.fmtDT(revMs)}</b> and are now unlocked below.</span></div>`)
      : `<div class="hk-msg ok"><i data-lucide="sparkles"></i><span><b>Result Reveal Time:</b> Immediate (${C.fmtDT(submittedAtMs)})</span></div>`;

    const scoreSection = (!hidePts && result && typeof result.score === 'number')
      ? `<div class="hk-test-scorebox" style="margin-top:12px">
          <div class="ts-main">
            <small class="hk-eyebrow">Your Final Score</small>
            <b>${result.score} <small>/ ${result.total} pts (${result.total ? Math.round((result.score / result.total) * 100) : 0}%)</small></b>
          </div>
        </div>`
      : '';

    view.innerHTML = `<div class="hk-view">
      <section class="hk-card-s hk-dcard hk-test-final">
        <div class="td-head">${badgeHtml}<span class="hk-xs hk-muted">${C.fmtDT(submittedAtMs)}</span></div>
        <h2 style="margin:10px 0 6px;font-size:1.25rem">${headline}</h2>
        <div class="hk-kv-grid" style="margin:12px 0">
          <div class="hk-kv-item"><small>Progress Saved &amp; Finalized</small><b>${answeredCount} / ${qs.length} Answered</b></div>
          <div class="hk-kv-item"><small>Result Reveal Time</small><b>${revMs > 0 ? C.fmtDT(revMs) : 'Immediate'}</b></div>
        </div>
        ${errMsg ? `<div class="hk-msg err" style="margin-bottom:10px"><i data-lucide="wifi-off"></i><span>${esc(errMsg)}</span></div>` : ''}
        ${revealSection}
        ${scoreSection}
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px">
          ${errMsg ? `<button type="button" class="hk-btn primary" id="retrySubBtn"><i data-lucide="refresh-cw"></i>Retry Finalize Submission</button>` : ''}
          <button type="button" class="hk-btn ${errMsg ? '' : 'primary'}" id="testDoneBtn"><i data-lucide="layout-dashboard"></i>Back to Hackathon Dashboard</button>
        </div>
      </section>
    </div>`;
    icons(view);
    stopFinalCd?.();
    stopFinalCd = startCountdowns(view);

    $('#retrySubBtn', view)?.addEventListener('click', () => {
      over = false;
      finish(true, reason);
    });
    $('#testDoneBtn', view)?.addEventListener('click', () => {
      stopFinalCd?.();
      done();
    });
  };

  const finish = async (auto, reason = 'manual') => {
    if(over) return;
    over = true;
    saveDraft();
    teardownListeners();

    const answeredCount = qs.filter(q => ans[q.id] !== undefined).length;
    const revMs = Number(t.resultRevealMs || meta?.resultRevealMs || 0);
    const submittingMsg = reason === 'time_up'
      ? 'Time hit 00:00 — saving progress & finalizing submission…'
      : reason === 'tab_switch'
        ? 'Tab leave detected — saving progress & auto-submitting…'
        : 'Saving answers & finalizing your submission…';

    view.innerHTML = `<div class="hk-view"><div class="hk-card-s" style="text-align:center;padding:40px"><span class="hk-spin" style="margin:0 auto 12px;display:block"></span><b>${submittingMsg}</b><p class="hk-sm hk-muted" style="margin-top:6px">Grading responses securely and loading result reveal time.</p></div></div>`;

    try {
      const r = await C.callFn('hkSubmitTest', {
        hackathonId: h.id,
        answers: ans,
        tabSwitches: reason === 'tab_switch' ? Math.max(1, warnings) : warnings,
        submitReason: reason
      });
      try { localStorage.removeItem(draftKey); } catch {}
      const submittedAtMs = Date.now();
      const hidePts = revMs > 0 && submittedAtMs < revMs;
      const prefix = reason === 'time_up' ? 'Time up — auto-submitted! ' : reason === 'tab_switch' ? 'Tab left — auto-submitted! ' : 'Test submitted! ';
      toast(hidePts ? `${prefix}Results reveal on ${C.fmtDT(revMs)}.` : `${prefix}Score ${r.score} / ${r.total}`);
      renderFinalizedView({ reason, result: r, revMs, submittedAtMs, answeredCount });
    } catch(e){
      const msg = String(e?.message || 'Submission could not complete.');
      if(/already submitted/i.test(msg)){
        try { localStorage.removeItem(draftKey); } catch {}
        renderFinalizedView({ reason, result: null, revMs, submittedAtMs: Date.now(), answeredCount });
        return;
      }
      toast(msg, 'error');
      renderFinalizedView({
        reason,
        result: null,
        errMsg: `${msg} Your ${answeredCount} answer(s) remain safely saved on this device — tap Retry below.`,
        revMs,
        submittedAtMs: Date.now(),
        answeredCount
      });
    }
  };

  const triggerBackGuard = () => {
    if(over) return;
    const nowMs = Date.now();
    if(nowMs - lastViolationAt < 900) return;
    lastViolationAt = nowMs;
    warnings++;
    saveDraft();
    if(warnPill){ warnPill.className = 'hk-chip bad'; }

    if(warnings >= 2){
      finish(true, 'tab_switch');
      return;
    }
    if(!warnModal){
      warnModal = C.modal('⚠️ Confirm Exit or Return to Test', `<div class="hk-stack">
        <div class="hk-msg err"><i data-lucide="shield-alert"></i><span><b>Back navigation blocked!</b> Leaving the test automatically saves your progress and submits your current answers.</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="hk-btn danger sm" id="wAutoSub">Save Progress &amp; Submit Now</button>
          <button type="button" class="hk-btn primary" id="wResume">Return to Test</button>
        </div>
      </div>`, {
        onMount(b, close){
          $('#wResume', b).onclick = () => { close(); warnModal = null; };
          $('#wAutoSub', b).onclick = () => { close(); warnModal = null; finish(true, 'tab_switch'); };
        }
      });
    }
  };

  // Push a state entry so Back button stays in test unless confirmed
  try { history.pushState({ hkTest: h.id }, '', location.href); } catch {}
  const onPop = () => {
    if(over) return;
    try { history.pushState({ hkTest: h.id }, '', location.href); } catch {}
    triggerBackGuard();
  };
  const onHash = () => {
    if(over) return;
    if(!location.hash.includes(h.id)){
      try { history.replaceState({ hkTest: h.id }, '', `#/my/${h.id}`); } catch {}
    }
    triggerBackGuard();
  };
  // Leaving the tab immediately saves progress and finalizes submission
  const onVis = () => {
    if(over) return;
    if(document.hidden || document.visibilityState === 'hidden'){
      warnings++;
      saveDraft();
      finish(true, 'tab_switch');
    } else if(left() <= 0){
      saveDraft();
      finish(true, 'time_up');
    }
  };
  const onPageHide = () => {
    if(over) return;
    warnings++;
    saveDraft();
    finish(true, 'tab_switch');
  };
  const onBeforeUnload = e => {
    if(!over){
      saveDraft();
      e.preventDefault();
      e.returnValue = '';
    }
  };

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onHash);
  window.addEventListener('beforeunload', onBeforeUnload);

  view.onclick = e => {
    if(over) return;
    const o = e.target.closest('[data-k]');
    if(o){
      const k = +o.dataset.k;
      const q = qs[i];
      ans[q.id] = k;
      saveDraft();
      // Instant DOM class toggle without rebuilding HTML -> zero lag!
      $$('.hk-opt', qBox).forEach(btn => btn.classList.toggle('on', +btn.dataset.k === k));
      qPal.children[i]?.classList.add('ans');
      updateCounts();
      return;
    }
    const qd = e.target.closest('[data-qidx]');
    if(qd){
      i = +qd.dataset.qidx;
      saveDraft();
      renderQuestion();
      return;
    }
    if(e.target.closest('[data-clear]')){
      delete ans[qs[i].id];
      saveDraft();
      $$('.hk-opt', qBox).forEach(btn => btn.classList.remove('on'));
      qPal.children[i]?.classList.remove('ans');
      updateCounts();
      return;
    }
    if(e.target.closest('[data-prev]') && i > 0){ i--; saveDraft(); renderQuestion(); return; }
    if(e.target.closest('[data-finish]')){
      const un = qs.filter(q => ans[q.id] === undefined).length;
      if(!un){ finish(false, 'manual'); return; }
      C.modal('Submit Test?', `<div class="hk-stack">
        <p class="hk-sm">${un} question${un === 1 ? ' is' : 's are'} still unanswered out of ${qs.length}. Are you sure you want to submit now?</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" class="hk-btn ghost" id="cfBack">Keep Answering</button>
          <button type="button" class="hk-btn gold" id="cfSub">Yes, Submit Test</button>
        </div>
      </div>`, {
        onMount(b, close){
          $('#cfBack', b).onclick = close;
          $('#cfSub', b).onclick = () => { close(); finish(false, 'manual'); };
        }
      });
      return;
    }
    if(e.target.closest('[data-next]') && i < qs.length - 1){ i++; saveDraft(); renderQuestion(); }
  };

  const updateTimerTick = () => {
    const s = left();
    const el = $('#tleft');
    if(el){
      el.textContent = fmt(s);
      el.classList.toggle('warn', s <= 120 && s > 60);
      el.classList.toggle('low', s <= 60);
    }
    if(s <= 0) finish(true, 'time_up');
  };

  timer = setInterval(updateTimerTick, 1000);
  backupTimer = setInterval(() => { if(!over) saveDraft(); }, 5000);

  cx.S.cleanup = () => {
    if(!over){
      saveDraft();
      finish(true, left() <= 0 ? 'time_up' : 'tab_switch');
    } else {
      teardownListeners();
      stopFinalCd?.();
    }
    view.onclick = null;
  };
  updateCounts();
  renderQuestion();
  updateTimerTick();
}
