// Shared renderers: hackathon card, detail body, status badges, countdown, empty/skeleton states.
import { esc, safeUrl, money, dateRange, fmtDT, fmtKm, phase, ago, canRegister, nextMilestone, countdownText } from './hk-core.js';

export const MODE = { online: ['Online', 'wifi'], offline: ['In-person', 'map-pin'], hybrid: ['Hybrid', 'globe'] };
export const STATUS = {
  draft: ['Draft', 'neutral', 'file-pen-line'], pending: ['Pending approval', 'warn', 'hourglass'], approved: ['Approved', '', 'badge-check'],
  changes_requested: ['Changes requested', 'warn', 'message-square-warning'], rejected: ['Rejected', 'bad', 'circle-x'], closed: ['Closed', 'neutral', 'lock']
};
export const statusBadge = s => { const [l, t, i] = STATUS[s] || STATUS.draft; return `<span class="hk-chip ${t}"><i data-lucide="${i}"></i>${l}</span>`; };

export function countdownHtml(h, reg = null, gold = false){
  const m = nextMilestone(h, reg);
  if(!m) return '';
  return `<div class="hk-countdown ${gold ? 'gold' : ''}"><i data-lucide="timer"></i><span>${esc(m.label)}</span><span class="tval" data-countdown="${m.targetMs}">${countdownText(m.targetMs)}</span></div>`;
}
export function startCountdowns(root = document){
  const tick = () => {
    const now = Date.now();
    root.querySelectorAll('[data-countdown]').forEach(el => {
      const target = +el.dataset.countdown;
      el.textContent = target > now ? countdownText(target, now) : '00h 00m 00s';
    });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

function hue(str = ''){ let h = 0; for(const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return 118 + (h % 60); } // stays in the green→teal range
export function mediaStyle(h, which = 'thumb'){
  const u = safeUrl(which === 'thumb' ? (h.thumbURL || h.bannerURL) : (h.bannerURL || h.thumbURL));
  if(u) return `background-image:url('${u.replace(/'/g, '%27')}')`;
  const a = hue(h.title);
  return `background-image:linear-gradient(135deg,hsl(${a},58%,22%),hsl(${a + 18},52%,42%))`;
}
export const initials = (t = '') => (t.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || 'H');

export function card(h, i = 0, opts = {}){
  const ph = h._phase || phase(h), [ml, mi] = MODE[h.mode] || MODE.offline, hasImg = !!safeUrl(h.thumbURL || h.bannerURL);
  const regOpen = canRegister(h);
  const isReg = !!opts.registered;
  const pub = !!opts.publicLinks;
  const leftBtn = pub
    ? `<a class="hk-btn sm" href="hackathon.html?id=${esc(h.id)}"><i data-lucide="info"></i>Details</a>`
    : `<button type="button" class="hk-btn sm" data-open="${esc(h.id)}"><i data-lucide="info"></i>Details</button>`;
  let rightBtn;
  if(isReg){
    rightBtn = `<a class="hk-btn sm primary" href="#/my/${esc(h.id)}"><i data-lucide="check-circle-2"></i>Registered</a>`;
  } else if(opts.role === 'host'){
    rightBtn = `<button type="button" class="hk-btn sm gold" data-open="${esc(h.id)}"><i data-lucide="eye"></i>View</button>`;
  } else if(regOpen){
    rightBtn = pub
      ? `<a class="hk-btn sm primary" href="login-hackthons.html?role=participant&next=${encodeURIComponent('#/h/' + h.id)}"><i data-lucide="ticket-check"></i>Apply</a>`
      : `<button type="button" class="hk-btn sm primary" data-act="register" data-id="${esc(h.id)}"><i data-lucide="ticket-check"></i>Apply</button>`;
  } else {
    rightBtn = `<button type="button" class="hk-btn sm" disabled>${esc(ph.label)}</button>`;
  }
  const shareBtn = `<button type="button" class="hk-btn sm share-ic" data-act="share" data-id="${esc(h.id)}" data-title="${esc(h.title)}" aria-label="Share ${esc(h.title)}" title="Share hackathon"><i data-lucide="share-2"></i></button>`;
  return `<article class="hk-card" style="animation-delay:${Math.min(i, 12) * 45}ms">
    <div class="hk-card-media ${hasImg ? '' : 'hk-ph'}" ${pub ? `data-pub-open="${esc(h.id)}"` : `data-open="${esc(h.id)}"`} style="${mediaStyle(h)};cursor:pointer">${hasImg ? '' : esc(initials(h.title))}
      <div class="tl">${h._campus ? '<span class="hk-chip gold"><i data-lucide="graduation-cap"></i>Your campus</span>' : ''}<span class="hk-chip"><i data-lucide="${mi}"></i>${ml}</span></div>
      <div class="tr">${ph.key !== 'open' ? `<span class="hk-chip ${ph.tone}">${ph.label}</span>` : ''}</div>
    </div>
    <div class="hk-card-body">
      <div class="hk-card-host">${h.hostVerified ? '<i data-lucide="badge-check"></i>' : ''}<span>${esc(h.brandName || h.hostName || 'Host')}</span></div>
      <h3 class="hk-clamp2" ${pub ? `data-pub-open="${esc(h.id)}"` : `data-open="${esc(h.id)}"`} style="cursor:pointer">${esc(h.title)}</h3>
      <p class="hk-clamp2">${esc(h.tagline || '')}</p>
      <div class="hk-meta"><span><i data-lucide="calendar-days"></i>${dateRange(h.startMs, h.endMs)}</span><span><i data-lucide="map-pin"></i>${esc(h.mode === 'online' ? 'Online' : (h.city || 'TBA'))}${h._dist != null && h.mode !== 'online' ? ` · ${fmtKm(h._dist)}` : ''}</span></div>
      <div class="hk-card-foot"><span class="hk-prize"><i data-lucide="trophy"></i>${h.prizePool ? money(h.prizePool) : 'Perks & swag'}</span><span class="hk-reg"><i data-lucide="users"></i>${h.regCount || 0}</span></div>
      ${opts.hideActions ? '' : `<div class="hk-card-acts">${leftBtn}${rightBtn}${shareBtn}</div>`}
    </div></article>`;
}
export function spot(h){
  const ph = h._phase || phase(h);
  return `<div class="hk-spot" data-open="${esc(h.id)}" tabindex="0" role="link" style="${mediaStyle(h, 'banner')}">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="hk-chip gold"><i data-lucide="graduation-cap"></i>Happening at your campus</span><span class="hk-chip">${ph.label}</span></div>
    <h3>${esc(h.title)}</h3><p style="opacity:.9;max-width:520px">${esc(h.tagline || '')}</p>
    <div class="hk-meta" style="color:rgba(255,255,255,.88)"><span><i data-lucide="calendar-days" style="color:#fff"></i>${dateRange(h.startMs, h.endMs)}</span><span><i data-lucide="users" style="color:#fff"></i>${h.regCount || 0} registered</span>${h.prizePool ? `<span><i data-lucide="trophy" style="color:#fff"></i>${money(h.prizePool)}</span>` : ''}</div></div>`;
}
export const empty = (icon, title, text, action = '') => `<div class="hk-empty"><i data-lucide="${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
export const skeletonCards = n => `<div class="hk-cards">${Array.from({ length: n }, () => '<div class="hk-skel" style="height:340px"></div>').join('')}</div>`;

const li = (a, ic, b) => b ? `<div class="hk-fact"><i data-lucide="${ic}"></i><div><b>${a}</b>${b}</div></div>` : '';
const link = (u, label) => safeUrl(u) ? `<a class="hk-chip sky" href="${esc(safeUrl(u))}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>${label}</a>` : '';

export function factsCard(h, extra = ''){
  const ph = h._phase || phase(h), [ml, mi] = MODE[h.mode] || MODE.offline;
  return `<aside class="hk-glass hk-facts" style="padding:20px">
    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="hk-chip ${ph.tone}">${ph.label}</span><span class="hk-chip"><i data-lucide="${mi}"></i>${ml}</span>${h._campus ? '<span class="hk-chip gold"><i data-lucide="graduation-cap"></i>Your campus</span>' : ''}</div>
    ${li('When', 'calendar-days', `${fmtDT(h.startMs)} → ${fmtDT(h.endMs)}`)}
    ${li('Register by', 'timer', h.regDeadlineMs ? fmtDT(h.regDeadlineMs) : '')}
    ${li('Where', 'map-pin', h.mode === 'online' ? 'Online' : esc([h.venue, h.college, h.city].filter(Boolean).join(', ')) + (h._dist != null ? `<br><span class="hk-muted">${fmtKm(h._dist)} from you</span>` : ''))}
    ${li('Team size', 'users-round', `${h.teamMin || 1}${+h.teamMax > +h.teamMin ? ' – ' + h.teamMax : ''} member${+h.teamMax > 1 ? 's' : ''}`)}
    ${li('Entry', 'ticket', +h.fee ? money(h.fee) + ' per team' : 'Free')}
    ${li('Prize pool', 'trophy', h.prizePool ? money(h.prizePool) : '')}
    ${li('Registered', 'user-check', `${h.regCount || 0}${h.maxParticipants ? ' / ' + h.maxParticipants : ''}`)}
    <div style="display:flex;gap:8px;flex-wrap:wrap">${link(h.website, 'Website')}${link(h.community, 'Community')}</div>${extra}
  </aside>`;
}

function inlineFmt(escaped){
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function formatProse(text = ''){
  const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
  if(!raw) return '';
  const lines = raw.split('\n');
  const out = [];
  let listItems = [];
  const flushList = () => {
    if(listItems.length){
      out.push(`<ul>${listItems.map(li => `<li>${li}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };
  for(const line of lines){
    const t = line.trim();
    if(!t){ flushList(); continue; }
    if(/^###\s+/.test(t)){
      flushList();
      out.push(`<h5 class="hk-prose-h2">${inlineFmt(esc(t.replace(/^###\s+/, '')))}</h5>`);
    } else if(/^##\s+/.test(t)){
      flushList();
      out.push(`<h4 class="hk-prose-h1">${inlineFmt(esc(t.replace(/^##\s+/, '')))}</h4>`);
    } else if(/^#\s+/.test(t)){
      flushList();
      out.push(`<h4 class="hk-prose-h1">${inlineFmt(esc(t.replace(/^#\s+/, '')))}</h4>`);
    } else if(/^[-*•]\s+/.test(t)){
      listItems.push(inlineFmt(esc(t.replace(/^[-*•]\s+/, ''))));
    } else {
      flushList();
      out.push(`<p>${inlineFmt(esc(t))}</p>`);
    }
  }
  flushList();
  return out.join('');
}

export function detailBody(h){
  const tags = (h.tags || []).map(t => `<span class="hk-chip neutral">#${esc(t)}</span>`).join('');
  const tracks = (h.tracks || []).filter(t => t.title).map(t => `<div class="hk-card-s" style="padding:16px"><b>${esc(t.title)}</b><div class="hk-sm hk-muted hk-prose">${formatProse(t.desc || '')}</div></div>`).join('');
  const sched = (h.schedule || []).filter(s => s.title).map(s => `<div class="hk-tl-i"><b>${esc(s.title)}</b><span>${esc(s.when || '')}</span></div>`).join('');
  const prz = (h.prizes || []).filter(p => p.place).map(p => `<div class="hk-prz"><span>${esc(p.place)}</span><b>${p.amount ? money(p.amount) : esc(p.note || '—')}</b>${p.amount && p.note ? `<span>${esc(p.note)}</span>` : ''}</div>`).join('');
  const faqs = (h.faqs || []).filter(f => f.q).map(f => `<details><summary>${esc(f.q)}</summary><div class="hk-prose">${formatProse(f.a || '')}</div></details>`).join('');
  const org = h.organiser || {};
  const orgPhoto = safeUrl(h.hostPhotoURL || org.photoURL) || 'icon.png';
  const orgName = org.name || h.hostDisplayName || h.contactName || h.brandName || h.hostName || 'Organiser';
  const orgMail = h.contactEmail || h.hostEmail || org.email || '';
  const orgPhone = h.showContactPhone ? (h.contactPhone || org.phone || '') : (h.showContactPhone === undefined ? (h.contactPhone || '') : '');
  const orgSub = [h.brandName && h.brandName !== orgName ? h.brandName : '', orgMail, orgPhone].filter(Boolean).join(' · ');
  const orgStrip = `<div class="hk-org-strip">
      <img src="${esc(orgPhoto)}" alt="${esc(orgName)}" onerror="this.src='icon.png'">
      <div><small>Organised by</small><b>${esc(orgName)}${h.hostVerified ? ' · verified host' : ''}</b>${orgSub ? `<span>${esc(orgSub)}</span>` : ''}</div>
    </div>`;
  return `<div class="hk-tabs" data-tabs>
      <button class="on" data-tab="about">About</button>${sched ? '<button data-tab="schedule">Schedule</button>' : ''}${(prz || h.perks) ? '<button data-tab="prizes">Prizes</button>' : ''}<button data-tab="rules">Rules</button>${faqs ? '<button data-tab="faq">FAQ</button>' : ''}
    </div>
    <div data-panel="about" class="hk-stack"><div class="hk-prose">${formatProse(h.description || '')}</div>${tags ? `<div style="display:flex;gap:7px;flex-wrap:wrap">${tags}</div>` : ''}${tracks ? `<h3 style="margin-top:8px">Tracks & themes</h3><div class="hk-grid2">${tracks}</div>` : ''}${h.announcement ? `<div class="hk-banner"><i data-lucide="megaphone"></i><div class="grow"><b>Latest update</b><div class="hk-sm hk-muted">${esc(h.announcement)}</div></div></div>` : ''}${orgStrip}</div>
    <div data-panel="schedule" class="hk-hidden"><div class="hk-tl">${sched}</div></div>
    <div data-panel="prizes" class="hk-hidden hk-stack">${prz ? `<div class="hk-prizes">${prz}</div>` : ''}${h.perks ? `<div class="hk-card-s"><b>Perks</b><div class="hk-prose hk-sm">${formatProse(h.perks)}</div></div>` : ''}</div>
    <div data-panel="rules" class="hk-hidden hk-stack">${h.eligibility ? `<div class="hk-card-s"><b>Eligibility</b><div class="hk-prose hk-sm">${formatProse(h.eligibility)}</div></div>` : ''}<div class="hk-card-s"><b>Rules</b><div class="hk-prose hk-sm">${formatProse(h.rules || 'Rules will be shared by the organisers.')}</div></div>
      ${orgStrip}</div>
    <div data-panel="faq" class="hk-hidden hk-faq" style="max-width:none">${faqs}</div>`;
}

export function detailHeader(h){
  const imgUrl = safeUrl(h.bannerURL || h.thumbURL);
  const banner = imgUrl
    ? `<div class="hk-hero-img has-img"><img class="hk-hero-photo" src="${esc(imgUrl)}" alt="${esc(h.title || 'Hackathon banner')}" onerror="this.parentElement.classList.remove('has-img');this.parentElement.classList.add('hk-hero-empty');this.remove()"></div>`
    : `<div class="hk-hero-img hk-hero-empty" style="${mediaStyle(h, 'banner')}"></div>`;
  const hostName = h.brandName || h.hostName || '';
  return `${banner}
    <div class="hk-hero-meta">${hostName ? `<div class="hk-hero-host">${h.hostVerified ? '<i data-lucide="badge-check"></i>' : ''}<span>${esc(hostName)}</span></div>` : ''}
    <h1 class="hk-hero-title">${esc(h.title)}</h1>${h.tagline ? `<p class="hk-hero-tag">${esc(h.tagline)}</p>` : ''}</div>`;
}

export function mobileFactsSummary(h, ctaHtml = ''){
  const [ml] = MODE[h.mode] || MODE.offline;
  const where = h.mode === 'online' ? 'Online' : ([h.city, h.college].filter(Boolean).join(' · ') || 'Campus TBA');
  const team = `${h.teamMin || 1}${+h.teamMax > +h.teamMin ? '–' + h.teamMax : ''} member${+h.teamMax > 1 ? 's' : ''}`;
  const fee = +h.fee ? money(h.fee) + ' / team' : 'Free entry';
  const prize = h.prizePool ? money(h.prizePool) : 'Perks & swag';
  const regBy = h.regDeadlineMs ? fmtDT(h.regDeadlineMs) : dateRange(h.startMs, h.endMs);
  return `<section class="hk-mob-summary" aria-label="Event quick facts">
    <div class="hk-mob-facts-grid">
      <div class="hk-mob-fact"><small><i data-lucide="calendar-days"></i>Event dates</small><b>${esc(dateRange(h.startMs, h.endMs))}</b></div>
      <div class="hk-mob-fact"><small><i data-lucide="map-pin"></i>${esc(ml)}</small><b>${esc(where)}</b></div>
      <div class="hk-mob-fact"><small><i data-lucide="trophy"></i>Prize pool</small><b>${esc(prize)}</b></div>
      <div class="hk-mob-fact"><small><i data-lucide="users-round"></i>${esc(team)}</small><b>${esc(fee)}</b></div>
    </div>
    ${h.regDeadlineMs ? `<div class="hk-mob-deadline"><i data-lucide="clock"></i><span>Register by <b>${esc(regBy)}</b></span><span class="hk-mob-regs"><i data-lucide="user-check"></i>${h.regCount || 0}${h.maxParticipants ? '/' + h.maxParticipants : ''} joined</span></div>` : ''}
    ${ctaHtml ? `<div class="hk-mob-cta" id="mobInlineCta">${ctaHtml}</div>` : ''}
  </section>`;
}

export function bindTabs(root){
  root.querySelectorAll('[data-tabs]').forEach(bar => bar.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if(!b) return;
    bar.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    root.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('hk-hidden', p.dataset.panel !== b.dataset.tab));
  }));
}
export function bindReveal(root = document){
  const els = root.querySelectorAll('.hk-reveal:not(.in)');
  if(!('IntersectionObserver' in window)){ els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(x => { if(x.isIntersecting){ x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 });
  els.forEach(e => io.observe(e));
}
export function countUp(el, to, ms = 1100){
  const start = performance.now(), f = t => { const p = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(to * e).toLocaleString('en-IN'); if(p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}
export function computeApplicationProgress({ reg, sub = null, hasSubmission = true, att = null, isWinner = false, winPlace = '' } = {}){
  const status = reg?.status || 'registered';
  const submittedProject = !!sub;
  const hasAttempt = !!(att && att.submittedAtMs);
  const submittedWork = submittedProject || (!hasSubmission && hasAttempt);
  const isReviewed = !!(sub && sub.reviewStatus === 'reviewed');
  const isReviewing = !!(sub && (sub.reviewStatus === 'reviewing' || sub.score != null));

  let activeIndex = 0;
  let mode = 'active'; // 'active' | 'pending_submit' | 'waitlisted' | 'rejected' | 'winner'

  if(isWinner){
    activeIndex = 4;
    mode = 'winner';
  } else if(status === 'selected'){
    activeIndex = 3;
    mode = 'active';
  } else if(status === 'shortlisted'){
    activeIndex = 2;
    mode = 'active';
  } else if(status === 'waitlisted'){
    activeIndex = 2;
    mode = 'waitlisted';
  } else if(status === 'rejected'){
    activeIndex = 2;
    mode = 'rejected';
  } else if(isReviewed || isReviewing || (!hasSubmission && hasAttempt)){
    activeIndex = 1;
    mode = 'active';
  } else if(submittedWork){
    activeIndex = 0;
    mode = 'active';
  } else {
    activeIndex = 0;
    mode = 'pending_submit';
  }

  const defs = [
    {
      key: 'submitted',
      label: 'Submitted',
      icon: 'file-text',
      note: () => {
        if(mode === 'pending_submit') return hasSubmission ? 'Action needed' : 'Registered';
        if(!submittedWork && (mode === 'rejected' || mode === 'waitlisted')) return 'Not submitted';
        return submittedProject && sub?.updatedAtMs ? ago(sub.updatedAtMs) : 'Work received';
      }
    },
    {
      key: 'reviewing',
      label: 'Reviewing',
      icon: 'eye',
      note: () => {
        if(activeIndex > 1) return isReviewed ? 'Reviewed' : 'Evaluated';
        if(activeIndex === 1) return isReviewed ? 'Finalized' : 'In progress';
        return 'Next';
      }
    },
    {
      key: 'shortlisted',
      label: 'Shortlisted',
      icon: 'sparkles',
      note: () => {
        if(mode === 'waitlisted') return 'Waitlisted';
        if(mode === 'rejected') return 'Not selected';
        if(activeIndex > 2) return 'Cleared';
        if(activeIndex === 2) return 'Next round';
        return 'Upcoming';
      }
    },
    {
      key: 'finalist',
      label: 'Finalist',
      icon: 'award',
      note: () => {
        if(activeIndex > 3) return 'Confirmed';
        if(activeIndex === 3) return 'Final stage';
        return 'Upcoming';
      }
    },
    {
      key: 'winner',
      label: 'Winner',
      icon: 'trophy',
      note: () => (mode === 'winner' ? (winPlace || 'Official winner') : 'Finale')
    }
  ];

  const steps = defs.map((d, idx) => {
    let state = 'todo';
    let icon = d.icon;
    let label = d.label;

    if(idx < activeIndex){
      if(idx === 0 && !submittedWork && (mode === 'rejected' || mode === 'waitlisted')){
        state = 'skipped';
      } else {
        state = 'done';
        icon = 'check';
      }
    } else if(idx === activeIndex){
      if(mode === 'waitlisted'){
        state = 'warn';
        icon = 'hourglass';
        label = 'Waitlisted';
      } else if(mode === 'rejected'){
        state = 'bad';
        icon = 'circle-x';
        label = 'Not Selected';
      } else if(mode === 'winner'){
        state = 'gold';
        icon = 'trophy';
      } else if(mode === 'pending_submit'){
        state = 'pending';
      } else {
        state = idx >= 3 ? 'gold' : 'cur';
      }
    }

    return {
      key: d.key,
      label,
      icon,
      state,
      note: d.note(),
      isCurrent: idx === activeIndex
    };
  });

  const cur = steps[activeIndex];
  const summaryLabel = mode === 'pending_submit'
    ? (hasSubmission ? 'Awaiting Submission' : 'Registered')
    : mode === 'winner'
      ? (winPlace ? `Winner · ${winPlace}` : 'Official Winner')
      : cur.label;

  return {
    steps,
    activeIndex,
    mode,
    summaryLabel,
    stepRatio: `Step ${activeIndex + 1} of ${steps.length}`
  };
}

export function applicationStepperHtml({
  reg,
  sub = null,
  hasSubmission = true,
  att = null,
  isWinner = false,
  winPlace = '',
  compact = false,
  teamLabel = '',
  roundName = '',
  hostNote = ''
} = {}){
  const prog = computeApplicationProgress({ reg, sub, hasSubmission, att, isWinner, winPlace });
  const listHtml = `<ol class="hk-app-steps ${compact ? 'compact' : ''}" aria-label="Application progress">${prog.steps.map(s => `
    <li class="hk-app-step is-${s.state}" ${s.isCurrent ? 'aria-current="step"' : ''}>
      <span class="as-node"><i data-lucide="${s.icon}"></i></span>
      <span class="as-meta">
        <b class="as-title">${esc(s.label)}</b>
        ${compact ? '' : `<small class="as-note">${esc(s.note)}</small>`}
      </span>
    </li>`).join('')}</ol>`;

  if(compact){
    return `<div class="hk-app-stepper-compact" aria-label="Application status: ${esc(prog.summaryLabel)}">${listHtml}</div>`;
  }

  const metaParts = [
    teamLabel,
    roundName,
    prog.stepRatio
  ].filter(Boolean);

  return `<section class="hk-card-s hk-app-progress" id="appProgressCard" aria-label="Application progress">
    <div class="ap-head">
      <div class="ap-title">
        <h3>Application Progress</h3>
        ${metaParts.length ? `<div class="ap-sub">${metaParts.map(p => `<span>${esc(p)}</span>`).join('<span class="ap-sep" aria-hidden="true">·</span>')}</div>` : ''}
      </div>
      <div class="ap-status is-${prog.steps[prog.activeIndex].state}">
        <i data-lucide="${prog.steps[prog.activeIndex].icon}"></i>
        <span>${esc(prog.summaryLabel)}</span>
      </div>
    </div>
    ${listHtml}
    ${hostNote ? `<div class="ap-note"><i data-lucide="info"></i><span><b>Organiser note:</b> ${esc(hostNote)}</span></div>` : ''}
  </section>`;
}

export { ago };
