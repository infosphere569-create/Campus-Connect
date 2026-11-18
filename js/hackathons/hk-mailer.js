// Auto-generating hackathon mail templates, live previews, multi-channel dispatchers & sent-state tracking.
import * as C from './hk-core.js';

export const MAIL_TPLS = [
  {
    key: 'registration_confirmation',
    label: 'Registration Confirmed',
    short: 'Confirmed',
    icon: 'badge-check',
    tone: 'ok',
    desc: 'Official confirmation with event dates, venue, team lineup & portal link',
    supportsRound: false,
    supportsSchedule: true
  },
  {
    key: 'shortlisted',
    label: 'Shortlisted / Next Round',
    short: 'Shortlisted',
    icon: 'sparkles',
    tone: 'ok',
    desc: 'Congratulate & invite team to next round with schedule, venue / Meet link & checklist',
    supportsRound: true,
    supportsSchedule: true
  },
  {
    key: 'selected',
    label: 'Selected / Finalist / Winner',
    short: 'Selected',
    icon: 'trophy',
    tone: 'gold',
    desc: 'Official selection / finalist / winner letter with prize & reporting instructions',
    supportsRound: true,
    supportsSchedule: true
  },
  {
    key: 'test_reminder',
    label: 'Screening Test Invite / Reminder',
    short: 'Test Invite',
    icon: 'clipboard-check',
    tone: 'warn',
    desc: 'Auto-fills test duration, questions, marks, window timing & direct launch steps',
    supportsRound: false,
    supportsSchedule: true
  },
  {
    key: 'submission_reminder',
    label: 'Project Submission Reminder',
    short: 'Submission',
    icon: 'lightbulb',
    tone: 'warn',
    desc: 'Deadline reminder with required PPT, GitHub repo, live demo & video checklist',
    supportsRound: false,
    supportsSchedule: true
  },
  {
    key: 'waitlisted',
    label: 'Waitlisted Status',
    short: 'Waitlisted',
    icon: 'clock',
    tone: 'warn',
    desc: 'Clear waitlist standing and automatic slot-opening notification assurance',
    supportsRound: true,
    supportsSchedule: false
  },
  {
    key: 'rejected',
    label: 'Not Selected / Encouragement',
    short: 'Not Selected',
    icon: 'heart-handshake',
    tone: 'bad',
    desc: 'Respectful evaluation outcome thanking the team for their effort',
    supportsRound: true,
    supportsSchedule: false
  },
  {
    key: 'custom',
    label: 'Custom Organiser Message',
    short: 'Custom',
    icon: 'pen-line',
    tone: 'neutral',
    desc: 'Write any custom update wrapped cleanly in official hackathon header & signature',
    supportsRound: true,
    supportsSchedule: true
  }
];

export const TPL_BY_KEY = Object.fromEntries(MAIL_TPLS.map(t => [t.key, t]));

export const QUICK_NOTE_SNIPPETS = [
  'Please join 10 minutes early and keep a valid college ID handy.',
  'Include a crisp 2-minute prototype demo video and architecture slide in your PPT.',
  'Ensure your GitHub repository is public and README includes setup instructions.',
  'Report at the main auditorium desk for team verification before your slot.'
];

export function autoSuggestMailKind(reg, { hasTest = false, att = null, sub = null, hackathon = null } = {}) {
  if (!reg) return 'custom';
  if (reg.status === 'selected') return 'selected';
  if (reg.status === 'shortlisted') return 'shortlisted';
  if (reg.status === 'waitlisted') return 'waitlisted';
  if (reg.status === 'rejected') return 'rejected';
  if (hasTest && !att?.submittedAtMs) return 'test_reminder';
  if (hackathon?.submission?.open !== false && !sub) return 'submission_reminder';
  return 'registration_confirmation';
}

function fmtLongDT(ms) {
  if (!ms) return 'To be announced';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms)) + ' IST';
  } catch {
    return C.fmtDT(ms);
  }
}

export function hackathonVenueText(h) {
  if (!h) return 'To be announced';
  if (h.mode === 'online') return 'Online (Remote)';
  const base = [h.venue, h.college, h.city].filter(Boolean).join(', ') || 'Campus Venue (TBA)';
  return h.mode === 'hybrid' ? `${base} (Hybrid)` : base;
}

export function mailSign(h, org = {}) {
  const o = h?.organiser || {};
  const name = (org.name || o.name || h?.hostDisplayName || h?.hostName || 'Organising Team').trim();
  const desig = (org.designation || o.designation || '').trim();
  const club = (org.org || o.org || h?.brandName || h?.hostName || '').trim();
  const email = (org.email || o.email || h?.contactEmail || h?.hostEmail || '').trim();
  const phone = (org.phone || o.phone || h?.contactPhone || '').trim();

  const lines = ['Warm regards,', name];
  if (desig) lines.push(desig);
  if (club && club !== name) lines.push(club);
  lines.push('');
  lines.push('Campus Connect One · Hackathons');
  if (email) lines.push(`Email : ${email}`);
  if (phone) lines.push(`Phone : ${phone}`);
  lines.push('https://campusconnectone.online/hackthons-portal.html');
  return lines.join('\n');
}

export function buildHackathonEmail(kind, ctx = {}) {
  if (!TPL_BY_KEY[kind]) kind = 'custom';
  const h = ctx.hackathon || {};
  const hid = ctx.hackathonId || h.id || '';
  const reg = ctx.reg || {};
  const org = ctx.org || {};
  const rounds = C.roundsOf(h);
  const title = (h.title || 'Hackathon').trim();
  const orgName = (h.brandName || h.hostName || org.org || h.college || 'Organising Team').trim();
  const participant = (reg.name || '').trim() || 'Participant';
  const isTeam = reg.teamMode === 'team' && reg.teamName;
  const teamLabel = isTeam ? `Team "${reg.teamName}" (${(reg.members || []).length + 1} members)` : 'Solo Participant';
  const curRoundObj = rounds[Math.min(reg.stage || 0, Math.max(0, rounds.length - 1))] || null;
  const roundName = (ctx.round || curRoundObj?.name || 'Next Round').trim();
  const venue = hackathonVenueText(h);
  const when = h.startMs ? `${fmtLongDT(h.startMs)}${h.endMs ? ' to ' + fmtLongDT(h.endMs) : ''}` : 'Dates TBA';
  const note = String(ctx.note || '').trim();
  const scheduleText = String(ctx.scheduleText || '').trim();
  const meetLink = String(ctx.meetLink || '').trim();
  const customSubj = String(ctx.customSubject || '').trim();
  const portalUrl = `https://campusconnectone.online/hackthons-portal.html#/my/${encodeURIComponent(hid)}`;
  const eventUrl = hid ? `https://campusconnectone.online/hackathon.html?id=${encodeURIComponent(hid)}` : 'https://campusconnectone.online/hackthons-portal.html';
  const greet = `Dear ${participant},`;
  const sign = mailSign(h, org);
  const testMeta = ctx.testMeta || null;
  const att = ctx.att || null;
  const sub = ctx.sub || null;

  const L = [];
  let subject = '';
  let heading = TPL_BY_KEY[kind]?.label || 'Update';

  if (kind === 'registration_confirmation') {
    subject = customSubj || `Registration Confirmed — ${title} | Campus Connect One`;
    heading = 'Registration Confirmed';
    L.push(
      greet,
      '',
      `Thank you for registering for ${title}${isTeam ? ` with ${teamLabel}` : ''}. Your entry is officially confirmed!`,
      '',
      'Event & Registration Summary',
      '----------------------------',
      `Hackathon     : ${title}`,
      `Organised by  : ${orgName}`,
      `Entry         : ${teamLabel}`,
      `When          : ${when}`,
      `Mode / Venue  : ${venue}`
    );
    if (scheduleText) L.push(`Schedule Note : ${scheduleText}`);
    if (meetLink) L.push(`Join / Link   : ${meetLink}`);
    if (isTeam && Array.isArray(reg.members) && reg.members.length) {
      L.push(`Team Members  : ${participant} (Leader), ${reg.members.map(m => m.name).filter(Boolean).join(', ')}`);
    }
    if (note) L.push('', 'Note from Organiser', '-------------------', note);
    L.push(
      '',
      'What happens next:',
      `  1. Track rounds, deadlines, and team status on your dashboard: ${portalUrl}`,
      `  2. Bookmark the official hackathon page for rules & announcements: ${eventUrl}`,
      '  3. Keep an eye on your email and in-app notifications for round updates.',
      '',
      'We look forward to seeing what you build!',
      '',
      sign
    );
  } else if (kind === 'shortlisted') {
    subject = customSubj || `Congratulations — Shortlisted for ${roundName} · ${title}`;
    heading = `Shortlisted · ${roundName}`;
    L.push(
      greet,
      '',
      `Congratulations! Following our review of entries for ${title}, we are pleased to inform you that ${isTeam ? `your team "${reg.teamName}" has` : 'you have'} been SHORTLISTED for ${roundName}.`,
      '',
      'Round & Reporting Details',
      '-------------------------',
      `Hackathon     : ${title}`,
      `Next Round    : ${roundName}`,
      `Participant   : ${participant}${isTeam ? ` · Team "${reg.teamName}"` : ''}`,
      `Schedule      : ${scheduleText || (curRoundObj?.startMs ? fmtLongDT(curRoundObj.startMs) : 'As listed on dashboard')}`,
      `Venue / Mode  : ${meetLink || venue}`
    );
    if (att?.submittedAtMs || sub) {
      L.push('', 'Your Recorded Evaluation Summary', '--------------------------------');
      if (att?.submittedAtMs) L.push(`Screening Test : ${att.score} / ${att.total}`);
      if (sub?.title) L.push(`Project Title  : ${sub.title}${sub.score != null ? ` (Score: ${sub.score}/100)` : ''}`);
    }
    if (note) L.push('', 'Important Instructions from Organiser', '-------------------------------------', note);
    L.push(
      '',
      'How to prepare & proceed:',
      `  1. Open your Participant Dashboard to view full round guidelines: ${portalUrl}`,
      '  2. Join / report at least 10 minutes early and keep your valid college ID & demo ready.',
      '  3. Update your project deck / GitHub links on the dashboard if any improvements are needed.',
      '',
      'Wishing you the very best for this round!',
      '',
      sign
    );
  } else if (kind === 'selected') {
    const lg = h.submission?.logistics || {};
    const wr = h.submission?.winnerReveal || {};
    const winEntry = Array.isArray(wr.winners) ? wr.winners.find(w => w.uid === reg.uid || w.regId === reg.id) : null;
    const winPlace = ctx.winnerPlace || winEntry?.place || '';
    const winPrize = ctx.winnerPrize || winEntry?.prize || '';
    const lgMode = lg.mode === 'online' ? 'Online (Virtual)' : lg.mode === 'offline' ? 'Offline (In-Person)' : lg.mode === 'hybrid' ? 'Hybrid (Online + In-Person)' : (h.mode || '');
    const lgPlace = [lg.venueName || lg.venue, lg.address, lg.mapUrl || lg.mapLink].filter(Boolean).join(' · ');
    const lgLink = meetLink || lg.meetLink || lgPlace || venue;
    const lgRepTs = lg.reportingTime || lg.reportDateMs;
    const lgSched = scheduleText || (lgRepTs ? (fmtLongDT(lgRepTs) !== '—' ? fmtLongDT(lgRepTs) : String(lgRepTs)) : '');
    const extraNote = [note, lg.instructions || lg.reportingNote, lg.deskContact ? `Reporting Desk: ${lg.deskContact}` : '', lg.dressOrIdNote].filter(Boolean).join('\n');

    subject = customSubj || (winPlace ? `🏆 Winner (${winPlace}) — ${title}!` : `Congratulations — Selected in ${title}!`);
    heading = winPlace ? `Winner Announcement · ${winPlace}` : 'Selected / Finalist Announcement';
    L.push(
      greet,
      '',
      winPlace
        ? `Thrilling news! Out of all participating entries in ${title}, ${isTeam ? `your team "${reg.teamName}" has` : 'you have'} been officially announced as ${winPlace}!`
        : `Great news! We are thrilled to share that ${isTeam ? `your team "${reg.teamName}" has` : 'you have'} been officially SELECTED in ${title}${roundName ? ` (${roundName})` : ''}!`,
      '',
      'Selection & Reporting Summary',
      '-----------------------------',
      `Hackathon     : ${title}`,
      `Organised by  : ${orgName}`,
      `Selected Entry: ${participant} · ${teamLabel}`,
      `Honor / Stage : ${winPlace || roundName || 'Final Selection'}`
    );
    if (winPrize) L.push(`Prize / Honor : ${winPrize}`);
    else if (h.prizePool) L.push(`Prize Pool    : ₹${Number(h.prizePool).toLocaleString('en-IN')}`);
    if (lgMode) L.push(`Event Mode    : ${lgMode}`);
    if (lgSched) L.push(`Reporting Time: ${lgSched}`);
    if (lgLink) L.push(`Venue / Link  : ${lgLink}`);
    if (sub?.title) L.push(`Project       : ${sub.title}`);
    if (extraNote) L.push('', 'Message & Reporting Instructions', '--------------------------------', extraNote);
    L.push(
      '',
      'Next steps to confirm:',
      `  1. Open your Hackathon Dashboard to view your certificate/status card & instructions: ${portalUrl}`,
      '  2. Keep your team details and college ID card ready for verification.',
      '  3. Reply directly to this email if you need any assistance from the organising team.',
      '',
      'Congratulations once again on this achievement!',
      '',
      sign
    );
  } else if (kind === 'test_reminder') {
    subject = customSubj || `Action Required: Screening Test for ${title} | Campus Connect One`;
    heading = 'Screening Test Reminder';
    const tTitle = testMeta?.title || 'Screening Test';
    const tDur = testMeta?.durationMin ? `${testMeta.durationMin} minutes` : 'Timed online test';
    const tInfo = testMeta ? `${testMeta.count || 'Multiple'} questions · ${testMeta.total || 'Graded'} marks` : 'Online MCQ assessment';
    const tClose = scheduleText || (testMeta?.endMs ? fmtLongDT(testMeta.endMs) : 'Check dashboard window');
    L.push(
      greet,
      '',
      `This is a timely reminder regarding your qualifying screening test for ${title}${isTeam ? ` (${teamLabel})` : ''}.`,
      '',
      'Screening Test Details',
      '----------------------',
      `Hackathon     : ${title}`,
      `Test Title    : ${tTitle}`,
      `Format        : ${tInfo}`,
      `Duration      : ${tDur}`,
      `Window Closes : ${tClose}`,
      `Test Portal   : ${portalUrl}`
    );
    if (meetLink) L.push(`Additional Link: ${meetLink}`);
    if (note) L.push('', 'Note from Organiser', '-------------------', note);
    L.push(
      '',
      'How to take your test:',
      `  1. Sign in to your Participant Dashboard: ${portalUrl}`,
      '  2. Tap "Start Screening Test" inside your event card before the test window closes.',
      '  3. Ensure a stable internet connection and submit your answers before the countdown ends.',
      '',
      'Best of luck!',
      '',
      sign
    );
  } else if (kind === 'submission_reminder') {
    subject = customSubj || `Reminder: Submit Your Project for ${title} before Deadline`;
    heading = 'Project Submission Reminder';
    const subClose = scheduleText || (h.submission?.deadlineMs ? fmtLongDT(h.submission.deadlineMs) : 'Before the hackathon submission cutoff');
    L.push(
      greet,
      '',
      `A quick reminder to complete and submit your project deliverables for ${title}${isTeam ? ` (${teamLabel})` : ''}.`,
      '',
      'Submission Summary',
      '------------------',
      `Hackathon     : ${title}`,
      `Team / Entry  : ${teamLabel}`,
      `Deadline      : ${subClose}`,
      `Submit At     : ${portalUrl}`
    );
    if (meetLink) L.push(`Reference Link: ${meetLink}`);
    if (note) L.push('', 'Important Note from Organiser', '-----------------------------', note);
    L.push(
      '',
      'Submission checklist:',
      '  • Clear project title & problem-solution idea summary',
      '  • Public GitHub / Code Repository URL',
      '  • Pitch Deck (PPT / PDF link) & Live Demo / Prototype Video link',
      `  • Submit or update directly via: ${portalUrl}`,
      '',
      'Make sure you submit ahead of the deadline so judges can evaluate your work.',
      '',
      sign
    );
  } else if (kind === 'waitlisted') {
    subject = customSubj || `Application Update (Waitlisted) — ${title}`;
    heading = 'Waitlist Status Update';
    L.push(
      greet,
      '',
      `Thank you for your enthusiasm and participation in ${title}. Your entry${isTeam ? ` (${teamLabel})` : ''} has been placed on our WAITLIST${roundName ? ` for ${roundName}` : ''}.`,
      '',
      'What being waitlisted means:',
      '  1. Your submission/profile showed strong potential and remains under active consideration.',
      '  2. Should a confirmed seat become available, our team will notify you immediately via email and your dashboard.',
      '  3. No further action is required from your side right now.'
    );
    if (note) L.push('', 'Note from Organiser', '-------------------', note);
    L.push(
      '',
      `View live status any time on your dashboard: ${portalUrl}`,
      '',
      'Thank you for your patience!',
      '',
      sign
    );
  } else if (kind === 'rejected') {
    subject = customSubj || `Update on Your Entry — ${title}`;
    heading = 'Application Update';
    L.push(
      greet,
      '',
      `Thank you for applying and investing your time in ${title}${isTeam ? ` with ${teamLabel}` : ''}.`,
      '',
      `After careful evaluation of all entries${roundName ? ` in ${roundName}` : ''}, we regret to inform you that we will not be able to advance your entry to the next stage this time.`
    );
    if (note) L.push('', 'Feedback / Note from Organiser', '------------------------------', note);
    L.push(
      '',
      'This outcome reflects the high competition for limited slots and does not diminish the effort you put in. We warmly encourage you to keep building and join upcoming hackathons on Campus Connect One:',
      `  https://campusconnectone.online/hackthons-portal.html#/explore`,
      '',
      'Wishing you every success ahead!',
      '',
      sign
    );
  } else {
    subject = customSubj || `Update from ${orgName} — ${title}`;
    heading = customSubj || `Update from Organiser`;
    L.push(
      greet,
      '',
      `The organising team of ${title} (${orgName}) has shared an update for ${isTeam ? teamLabel : participant}:`,
      '',
      note || '(Write your custom message / instructions in the note box above to preview here.)'
    );
    if (scheduleText || meetLink) {
      L.push('', 'Key Details', '-----------');
      if (scheduleText) L.push(`Date / Time   : ${scheduleText}`);
      if (meetLink) L.push(`Venue / Link  : ${meetLink}`);
    }
    L.push(
      '',
      'Event & Dashboard Links',
      '-----------------------',
      `Participant Dashboard : ${portalUrl}`,
      `Event Details Page    : ${eventUrl}`,
      '',
      sign
    );
  }

  const body = L.join('\n');
  const whatsappText = `*${subject}*\n\n${body}`;
  return { subject, body, whatsappText, heading, portalUrl, eventUrl };
}

export function isMobileOrTabletDevice() {
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;
  if (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true;
  return window.innerWidth <= 900 && ('ontouchstart' in window);
}

export function openMailClient(to, subject, body) {
  to = String(to || '').trim();
  subject = String(subject || '');
  body = String(body || '');
  if (isMobileOrTabletDevice()) {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return true;
  }
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const a = document.createElement('a');
  a.href = gmailUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export function normalizeIndianPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = '91' + digits;
  return digits;
}

export function openWhatsAppClient(phone, text) {
  const digits = normalizeIndianPhone(phone);
  if (digits.length < 10) return false;
  const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(String(text || ''))}`;
  const a = document.createElement('a');
  a.href = waUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export function parseRecipientText(rawText, regs = []) {
  const text = String(rawText || '').trim();
  if (!text) return [];
  const emailRx = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRx = /(?:\+?91[\s.-]?)?[6-9]\d{9}\b/g;

  const findReg = (email, phone) => {
    const em = String(email || '').trim().toLowerCase();
    const ph = String(phone || '').replace(/\D/g, '').slice(-10);
    return regs.find(r =>
      (em && String(r.email || '').trim().toLowerCase() === em) ||
      (ph.length === 10 && String(r.phone || '').replace(/\D/g, '').slice(-10) === ph)
    ) || null;
  };

  const out = [];
  const pushItem = ({ name = '', email = '', phone = '', source = 'Manual' }) => {
    const matched = findReg(email, phone);
    const resolvedName = (name || matched?.name || '').trim() || (email ? email.split('@')[0] : phone);
    out.push({
      id: matched?.id || '',
      uid: matched?.uid || '',
      reg: matched || null,
      name: resolvedName,
      email: (email || matched?.email || '').trim(),
      phone: (phone || matched?.phone || '').trim(),
      teamName: matched?.teamName || '',
      source: matched ? 'Registered' : source
    });
  };

  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const walk = node => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node === 'string') return parseRecipientText(node, regs).forEach(x => out.push(x));
        if (typeof node === 'object') {
          const email = node.email || node.gmail || node.Email || node.mail || '';
          const phone = node.phone || node.mobile || node.contact || node.Phone || '';
          const name = node.name || node.fullName || node.leader || node.Name || '';
          if (email || phone) pushItem({ name, email, phone, source: 'JSON' });
          else Object.values(node).forEach(walk);
        }
      };
      walk(parsed);
      if (out.length) return out;
    } catch {}
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const emails = line.match(emailRx) || [];
    const phones = line.match(phoneRx) || [];
    if (emails.length > 1) {
      emails.forEach((em, idx) => pushItem({ email: em, phone: phones[idx] || '', source: 'List' }));
      continue;
    }
    if (emails.length === 1 || phones.length >= 1) {
      const email = emails[0] || '';
      const phone = phones[0] || '';
      const leftover = line
        .replace(emailRx, ' ')
        .replace(phoneRx, ' ')
        .replace(/["'<>()[\]{};:|]/g, ' ')
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !/^(name|email|gmail|phone|mobile|leader|team|sr|no|\d+)$/i.test(s))[0] || '';
      pushItem({ name: leftover.slice(0, 48), email, phone, source: 'List' });
    }
  }
  return out;
}

const stateKey = hid => `hk-mail-state-${hid}`;

export function loadLocalMailState(hid) {
  if (!hid) return { sentMap: {}, logs: [] };
  try {
    const raw = localStorage.getItem(stateKey(hid));
    if (!raw) return { sentMap: {}, logs: [] };
    const parsed = JSON.parse(raw);
    return {
      sentMap: parsed && typeof parsed.sentMap === 'object' ? parsed.sentMap : {},
      logs: Array.isArray(parsed?.logs) ? parsed.logs : []
    };
  } catch {
    return { sentMap: {}, logs: [] };
  }
}

export function saveLocalMailState(hid, state) {
  if (!hid) return;
  try {
    localStorage.setItem(stateKey(hid), JSON.stringify({
      sentMap: state.sentMap || {},
      logs: (state.logs || []).slice(0, 300)
    }));
  } catch {}
}

export function recordLocalMailSent(hid, entry) {
  const st = loadLocalMailState(hid);
  const now = entry.createdAtMs || Date.now();
  const regKey = entry.registrationId ? `${entry.registrationId}:${entry.kind}` : '';
  const em = String(entry.to || '').trim().toLowerCase();
  const ph = String(entry.phone || '').replace(/\D/g, '').slice(-10);
  if (regKey) {
    st.sentMap[regKey] = now;
    st.sentMap[`reg:${entry.registrationId}`] = now;
  }
  if (em) {
    st.sentMap[`email:${em}:${entry.kind}`] = now;
    st.sentMap[`email:${em}`] = now;
  }
  if (ph.length === 10) {
    st.sentMap[`phone:${ph}:${entry.kind}`] = now;
    st.sentMap[`phone:${ph}`] = now;
  }
  st.logs = [
    {
      id: entry.id || `loc_${now}_${Math.random().toString(36).slice(2, 7)}`,
      registrationId: entry.registrationId || '',
      to: entry.to || '',
      toName: entry.toName || '',
      phone: entry.phone || '',
      teamName: entry.teamName || '',
      kind: entry.kind || 'custom',
      roundName: entry.roundName || '',
      subject: entry.subject || '',
      body: entry.body || '',
      note: entry.note || '',
      channel: entry.channel || 'platform',
      byName: entry.byName || '',
      createdAtMs: now,
      resendCount: entry.resendCount || 1
    },
    ...(st.logs || [])
  ].slice(0, 300);
  saveLocalMailState(hid, st);
  return st;
}

export function isMailSent(reg, kind, localState = null) {
  if (!reg) return false;
  if (kind) {
    if (reg.mailSent?.[kind]) return true;
    if (reg.lastMailKind === kind && reg.lastMailAtMs) return true;
    if (localState?.sentMap?.[`${reg.id}:${kind}`]) return true;
    const em = String(reg.email || '').trim().toLowerCase();
    if (em && localState?.sentMap?.[`email:${em}:${kind}`]) return true;
    return false;
  }
  return !!(reg.lastMailAtMs || (reg.mailSent && Object.keys(reg.mailSent).length) || localState?.sentMap?.[`reg:${reg.id}`]);
}

export function lastMailTimestamp(reg, kind, localState = null) {
  if (!reg) return 0;
  if (kind) {
    return reg.mailSent?.[`${kind}AtMs`]
      || (reg.lastMailKind === kind ? reg.lastMailAtMs : 0)
      || localState?.sentMap?.[`${reg.id}:${kind}`]
      || 0;
  }
  return reg.lastMailAtMs || localState?.sentMap?.[`reg:${reg.id}`] || 0;
}

export function mergeMailLogs(serverLogs = [], localState = { logs: [] }) {
  const byKey = new Map();
  const keyOf = l => `${(l.registrationId || l.to || l.phone || '').toLowerCase()}|${l.kind || ''}|${Math.floor((l.createdAtMs || 0) / 5000)}`;
  for (const s of serverLogs || []) {
    byKey.set(keyOf(s), { ...s, channel: s.channel || 'platform', source: 'server' });
  }
  for (const l of localState?.logs || []) {
    const k = keyOf(l);
    if (!byKey.has(k)) byKey.set(k, { ...l, source: 'local' });
  }
  return [...byKey.values()].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}
