// Pure certificate formatting, cryptographic fingerprint, LinkedIn deep-link, and Canva-inspired white editorial HTML renderer.
// Kept free of DOM/Firebase imports so it runs identically in browsers and Node test suites.

export function escHtml(v = '') {
  return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function safeUrl(u = '') {
  const s = String(u || '').trim();
  return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,)/i.test(s) ? s : '';
}

export function certDocId(hackathonId, uid, category = 'participant') {
  const cleanHid = String(hackathonId || '').trim();
  const cleanUid = String(uid || '').trim();
  const suffix = category === 'winner' ? 'win' : 'part';
  return `${cleanHid}_${cleanUid}_${suffix}`;
}

export function certCode(cid) {
  const clean = String(cid || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return 'CCO-HK-' + (clean.slice(-10) || 'VERIFIED');
}

export function certVerifyUrl(cid, originOverride = '') {
  const origin = originOverride
    || (typeof window !== 'undefined' && window.location && window.location.origin && !window.location.origin.startsWith('file')
      ? window.location.origin
      : 'https://campusconnectone.online');
  return `${origin.replace(/\/$/, '')}/hackathon-certificate.html?v=${encodeURIComponent(String(cid || ''))}`;
}

export function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') {
      const n = v.toMillis();
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    if (typeof v.seconds === 'number') {
      const n = v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    if (v instanceof Date) {
      const n = v.getTime();
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  if (typeof v === 'string') {
    const num = Number(v);
    if (Number.isFinite(num) && num > 0) return num;
    const p = Date.parse(v);
    return Number.isFinite(p) && p > 0 ? p : 0;
  }
  return 0;
}

export function fmtFullDate(ms) {
  const n = toMs(ms);
  if (!n) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(n));
  } catch {
    return '';
  }
}

export function defaultEventDateLabel(h) {
  if (!h) return 'Official Event Date';
  const a = toMs(h.startMs);
  const b = toMs(h.endMs);
  if (!a && !b) return fmtFullDate(h.regDeadlineMs || h.createdAtMs || Date.now()) || 'Official Event';
  if (a && (!b || Math.abs(b - a) < 12 * 3600000)) return fmtFullDate(a);
  try {
    const da = new Date(a);
    const db = new Date(b);
    const sameYear = da.getFullYear() === db.getFullYear();
    const sameMonth = sameYear && da.getMonth() === db.getMonth();
    const sameDay = sameMonth && da.getDate() === db.getDate();
    if (sameDay) return fmtFullDate(a);
    if (sameMonth) {
      const monYr = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(da);
      return `${da.getDate()} – ${db.getDate()} ${monYr}`;
    }
    if (sameYear) {
      const fa = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(da);
      const fb = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(db);
      return `${fa} – ${fb}`;
    }
    return `${fmtFullDate(a)} – ${fmtFullDate(b)}`;
  } catch {
    return fmtFullDate(a || b) || 'Official Event';
  }
}

export function rankLabelForIndex(idx) {
  if (idx === 0) return '1st Prize · Champion';
  if (idx === 1) return '2nd Prize · Runner-Up';
  if (idx === 2) return '3rd Prize · Second Runner-Up';
  return `Top ${idx + 1} · Finalist Winner`;
}

export function resolveHostSignature(hk = null, h = null) {
  const name = String(hk?.digitalSignatoryName || h?.organiser?.signatoryName || '').trim();
  const orgLabel = String(hk?.org || h?.organiser?.org || h?.brandName || '').trim();
  const fallbackTitle = String(hk?.designation || h?.organiser?.designation || (orgLabel ? `Organiser, ${orgLabel}` : 'Hackathon Organiser')).trim();
  const title = String(hk?.digitalSignatoryTitle || h?.organiser?.signatoryTitle || fallbackTitle).trim();
  return {
    name,
    title,
    configured: name.length >= 2,
    updatedAtMs: toMs(hk?.digitalSignatoryUpdatedAtMs) || 0
  };
}

export function buildCertificateRecord({
  h,
  reg,
  category = 'participant',
  rankTitle = '',
  prize = '',
  projectTitle = '',
  eventDateLabel = '',
  signatoryName = '',
  signatoryTitle = '',
  hostUid = ''
}) {
  const hid = h?.id || reg?.hackathonId || '';
  const uid = reg?.uid || '';
  const isWinner = category === 'winner';
  const cleanCat = isWinner ? 'winner' : 'participant';
  const cid = certDocId(hid, uid, cleanCat);
  const now = Date.now();
  const teamLabel = reg?.teamMode === 'team' && reg?.teamName ? String(reg.teamName).trim() : '';
  const recipientName = String(reg?.name || reg?.leaderName || 'Participant').trim() || 'Participant';
  const hostOrg = String(h?.brandName || h?.college || h?.organiser?.org || h?.hostName || 'Campus Connect One').trim();
  const cleanDate = String(eventDateLabel || '').trim() || defaultEventDateLabel(h);
  const cleanSig = String(signatoryName || h?.organiser?.signatoryName || h?.organiser?.name || 'Hackathon Organiser').trim();
  const cleanSigTitle = String(signatoryTitle || h?.organiser?.signatoryTitle || h?.organiser?.designation || (hostOrg ? `Organiser, ${hostOrg}` : 'Hackathon Organiser')).trim();
  const cleanRank = isWinner ? (String(rankTitle || '').trim() || 'Official Winner') : 'Participant';

  return {
    id: cid,
    hackathonId: hid,
    hostUid: hostUid || h?.hostUid || reg?.hostUid || '',
    uid,
    regId: reg?.id || (hid && uid ? `${hid}_${uid}` : ''),
    name: recipientName,
    teamName: teamLabel,
    college: String(reg?.college || '').trim(),
    hackathonTitle: String(h?.title || reg?.hackathonTitle || 'Hackathon').trim(),
    hostOrg,
    mode: String(h?.mode || '').trim(),
    city: String(h?.city || '').trim(),
    category: cleanCat,
    rankTitle: cleanRank,
    prize: isWinner ? String(prize || '').trim() : '',
    projectTitle: String(projectTitle || '').trim(),
    eventDateLabel: cleanDate,
    eventStartMs: toMs(h?.startMs) || 0,
    eventEndMs: toMs(h?.endMs) || toMs(h?.startMs) || now,
    signatoryName: cleanSig,
    signatoryTitle: cleanSigTitle,
    status: 'issued',
    issuedAtMs: now,
    updatedAtMs: now,
    certViewedAtMs: 0,
    certDownloadAtMs: 0,
    certPrintAtMs: 0,
    certShareAtMs: 0,
    certLinkedInAtMs: 0
  };
}

export function buildLinkedInAddUrl(cert, originOverride = '') {
  if (!cert) return 'https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME';
  const refMs = toMs(cert.issuedAtMs || cert.eventEndMs || cert.eventStartMs) || Date.now();
  const d = new Date(refMs);
  const isWin = cert.category === 'winner';
  const certTitle = isWin
    ? `${cert.rankTitle || 'Winner'} — ${cert.hackathonTitle || 'Hackathon'}`
    : `Certificate of Participation — ${cert.hackathonTitle || 'Hackathon'}`;
  const verify = certVerifyUrl(cert.id, originOverride);
  const code = certCode(cert.id);
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: certTitle,
    organizationName: 'Campus Connect One',
    issueYear: String(d.getFullYear()),
    issueMonth: String(d.getMonth() + 1),
    certUrl: verify,
    certId: code
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

export async function computeFingerprint(cert) {
  const payload = [
    cert?.id || '',
    cert?.name || '',
    cert?.hackathonTitle || '',
    cert?.category || '',
    cert?.rankTitle || '',
    cert?.eventDateLabel || '',
    cert?.signatoryName || ''
  ].join('|');
  try {
    const sub = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;
    if (sub && typeof TextEncoder !== 'undefined') {
      const buf = await sub.digest('SHA-256', new TextEncoder().encode(payload));
      const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase().slice(0, 16);
      return hex.match(/.{4}/g).join('-');
    }
  } catch {}
  let h1 = 2166136261;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 16777619);
  }
  const hex = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).toUpperCase();
  return hex.match(/.{4}/g).join('-');
}

export function signatureSvgHtml(name = 'Organiser', inkColor = '#0C5535') {
  const clean = String(name || 'Organiser').trim().slice(0, 38);
  const fontSize = clean.length > 24 ? 27 : clean.length > 16 ? 32 : 37;
  return `<svg viewBox="0 0 360 76" xmlns="http://www.w3.org/2000/svg" aria-label="Digital signature of ${escHtml(clean)}" style="display:block;width:100%;height:100%">
    <path d="M 24 62 Q 150 53 336 60" fill="none" stroke="${inkColor}" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M 62 67 Q 180 61 292 65" fill="none" stroke="${inkColor}" stroke-opacity="0.18" stroke-width="1.1" stroke-linecap="round"/>
    <text x="180" y="47" text-anchor="middle" fill="${inkColor}" font-family="'Great Vibes','Brush Script MT','Segoe Script',cursive" font-size="${fontSize}" font-weight="400" letter-spacing="0.4">${escHtml(clean)}</text>
  </svg>`;
}

export function certSheetHtml(cert, qrDataUrl = '', fp = '', opts = {}) {
  const isWin = cert?.category === 'winner';
  const cid = cert?.id || '';
  const code = certCode(cid);
  const name = String(cert?.name || 'Participant').trim();
  const teamName = String(cert?.teamName || '').trim();
  const hackTitle = String(cert?.hackathonTitle || 'Hackathon').trim();
  const hostOrg = String(cert?.hostOrg || '').trim();
  const eventDate = String(cert?.eventDateLabel || defaultEventDateLabel(cert)).trim();
  const rankTitle = String(cert?.rankTitle || (isWin ? 'Official Winner' : 'Participant')).trim();
  const prize = isWin ? String(cert?.prize || '').trim() : '';
  const sigName = String(cert?.signatoryName || 'Hackathon Organiser').trim();
  const sigTitle = String(cert?.signatoryTitle || (hostOrg ? `Organiser, ${hostOrg}` : 'Hackathon Organiser')).trim();
  const issuedDate = fmtFullDate(cert?.issuedAtMs) || eventDate;
  const logoSrc = safeUrl(opts.logoSrc) || 'icon/icon-hackathons.png';

  const sigInk = isWin ? '#1E293B' : '#0C5535';
  const sealAccent = isWin ? '#B45309' : '#0C5535';
  const sealRing = isWin ? '#F59E0B' : '#178A54';
  const headingSub = isWin ? 'CERTIFICATE OF ACHIEVEMENT' : 'CERTIFICATE OF PARTICIPATION';
  const mainTitle = isWin ? 'Certificate of Achievement' : 'Certificate of Participation';

  const bodyLine = isWin
    ? `For securing <b>${escHtml(rankTitle)}</b>${prize ? ` (${escHtml(prize)})` : ''} in <b>${escHtml(hackTitle)}</b>, held on <b>${escHtml(eventDate)}</b>${hostOrg ? ` and organised by <b>${escHtml(hostOrg)}</b>` : ''} on Campus Connect One.`
    : `For active participation and innovation in <b>${escHtml(hackTitle)}</b>, held on <b>${escHtml(eventDate)}</b>${hostOrg ? ` and organised by <b>${escHtml(hostOrg)}</b>` : ''} on Campus Connect One.`;

  return `<div class="hkc-sheet ${isWin ? 'is-winner' : 'is-participant'}">
    <div class="hkc-accent-rail"></div>
    <div class="hkc-geo-tl" aria-hidden="true">
      <svg viewBox="0 0 180 180" fill="none">
        <circle cx="0" cy="0" r="150" stroke="${isWin ? '#F59E0B' : '#178A54'}" stroke-opacity="0.16" stroke-width="1.5"/>
        <circle cx="0" cy="0" r="106" stroke="${isWin ? '#0C5535' : '#0F172A'}" stroke-opacity="0.09" stroke-width="1"/>
      </svg>
    </div>
    <div class="hkc-geo-br" aria-hidden="true">
      <svg viewBox="0 0 200 200" fill="none">
        <circle cx="200" cy="200" r="168" stroke="${isWin ? '#0C5535' : '#178A54'}" stroke-opacity="0.13" stroke-width="1.5"/>
        <path d="M200 72 L72 200" stroke="${isWin ? '#D97706' : '#178A54'}" stroke-opacity="0.14" stroke-width="1.2"/>
      </svg>
    </div>

    <div class="hkc-frame-outer"></div>
    <div class="hkc-frame-inner"></div>

    <div class="hkc-canvas-in">
      <header class="hkc-top-row">
        <div class="hkc-brand-left">
          <img class="hkc-brand-logo" src="${escHtml(logoSrc)}" alt="Campus Connect One" crossorigin="anonymous" onerror="this.onerror=null;this.src='icon.png';">
          <div class="hkc-brand-copy">
            <div class="hkc-brand-main">CAMPUS CONNECT ONE</div>
            <div class="hkc-brand-sub">OFFICIAL HACKATHONS CREDENTIAL</div>
          </div>
        </div>
        <div class="hkc-brand-right">
          <div class="hkc-event-org">${escHtml(hostOrg || hackTitle)}</div>
          <div class="hkc-event-meta">${escHtml(hackTitle)} &middot; ${escHtml(eventDate)}</div>
        </div>
      </header>

      <main class="hkc-center">
        <div class="hkc-kicker">${headingSub}</div>
        <h1 class="hkc-serif-title">${mainTitle}</h1>
        ${isWin ? `<div class="hkc-rank-banner">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#92400E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
          <span>${escHtml(rankTitle)}</span>
        </div>` : '<div class="hkc-rule-ornament"><span></span><i></i><span></span></div>'}

        <div class="hkc-present-lbl">THIS CERTIFICATE IS PROUDLY PRESENTED TO</div>
        <div class="hkc-recipient">${escHtml(name)}</div>
        ${teamName ? `<div class="hkc-team-line">Team: <b>${escHtml(teamName)}</b></div>` : '<div class="hkc-team-spacer"></div>'}
        <p class="hkc-statement">${bodyLine}</p>

        <div class="hkc-facts-row">
          <div class="hkc-fact-cell">
            <small>HACKATHON</small>
            <b>${escHtml(hackTitle)}</b>
          </div>
          <div class="hkc-fact-cell">
            <small>${isWin ? 'AWARD / POSITION' : 'CREDENTIAL'}</small>
            <b>${escHtml(isWin ? rankTitle : 'Official Participant')}</b>
          </div>
          <div class="hkc-fact-cell">
            <small>EVENT DATE</small>
            <b>${escHtml(eventDate)}</b>
          </div>
        </div>
      </main>

      <footer class="hkc-foot-row">
        <div class="hkc-qr-block">
          ${qrDataUrl ? `<img class="hkc-qr-img" src="${escHtml(qrDataUrl)}" alt="QR Verification Code">` : '<div class="hkc-qr-img"></div>'}
          <div class="hkc-qr-txt">
            <b>SCAN TO VERIFY</b>
            <div>ID: ${escHtml(code)}</div>
            <div>Issued: ${escHtml(issuedDate)}</div>
          </div>
        </div>

        <div class="hkc-seal-mid" aria-hidden="true">
          <svg viewBox="0 0 100 100" width="90" height="90">
            <circle cx="50" cy="50" r="45" fill="${sealAccent}"/>
            <circle cx="50" cy="50" r="39" fill="none" stroke="${sealRing}" stroke-width="1.5"/>
            <circle cx="50" cy="50" r="34" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-dasharray="2.5 2.5"/>
            <path d="m50 24 5.5 11.2 12.4 1.8-9 8.7 2.1 12.3L50 52.2l-11 5.8 2.1-12.3-9-8.7 12.4-1.8z" fill="#FFFFFF"/>
            <text x="50" y="75" text-anchor="middle" font-size="7" font-weight="700" fill="#FFFFFF" letter-spacing="1.2">${isWin ? 'HONOREE' : 'VERIFIED'}</text>
          </svg>
        </div>

        <div class="hkc-sig-block">
          <div class="hkc-sig-art">${signatureSvgHtml(sigName, sigInk)}</div>
          <div class="hkc-sig-line"></div>
          <div class="hkc-sig-name">${escHtml(sigName)}</div>
          <div class="hkc-sig-role">${escHtml(sigTitle)}</div>
          <div class="hkc-ds-box">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" fill="#16A34A"/><path d="m8.5 12 2.6 2.6L16 9.7" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div><b>Digitally signed</b> &middot; Campus Connect One<br>${escHtml(sigName)} &middot; ${escHtml(fp || code)}</div>
          </div>
        </div>
      </footer>
    </div>
  </div>`;
}
