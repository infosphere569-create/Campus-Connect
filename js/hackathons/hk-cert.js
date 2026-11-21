// Hackathon Certificate engine: Firestore data layer, QR generator, crisp 2x PNG/PDF export, Web Share (image + text), LinkedIn Add & modal viewer.
import * as C from './hk-core.js';
import * as CC from './hk-cert-core.js';

export * from './hk-cert-core.js';

const { db, FS, icons, toast, modal } = C;

/* ---------------- Firestore Operations ---------------- */
const ALLOWED_METRICS = new Set(['certViewedAtMs', 'certDownloadAtMs', 'certPrintAtMs', 'certShareAtMs', 'certLinkedInAtMs']);

export async function fetchHackathonCerts(hid) {
  if (!hid) return [];
  const q = FS.query(FS.collection(db, 'hkCertificates'), FS.where('hackathonId', '==', hid), FS.limit(1000));
  const snap = await FS.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.category === 'winner' ? -1 : 1) - (b.category === 'winner' ? -1 : 1) || (b.issuedAtMs || 0) - (a.issuedAtMs || 0));
}

export async function fetchMyHackathonCerts(uid) {
  if (!uid) return [];
  const q = FS.query(FS.collection(db, 'hkCertificates'), FS.where('uid', '==', uid), FS.limit(200));
  const snap = await FS.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.issuedAtMs || 0) - (a.issuedAtMs || 0));
}

export async function fetchCertById(cid) {
  if (!cid) return null;
  const s = await FS.getDoc(FS.doc(db, 'hkCertificates', cid));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function issueHackathonCerts(records = [], issuerUid = '') {
  if (!records.length) return [];
  const prepared = await Promise.all(records.map(async rec => {
    const fp = await CC.computeFingerprint(rec);
    return { ...rec, fingerprint: fp, status: 'issued', issuedAtMs: rec.issuedAtMs || Date.now(), updatedAtMs: Date.now() };
  }));

  for (let i = 0; i < prepared.length; i += 350) {
    const chunk = prepared.slice(i, i + 350);
    const wb = FS.writeBatch(db);
    chunk.forEach(cert => {
      wb.set(FS.doc(db, 'hkCertificates', cert.id), {
        ...cert,
        issuedAt: FS.serverTimestamp(),
        updatedAt: FS.serverTimestamp()
      }, { merge: true });
      if (cert.uid && issuerUid && cert.uid !== issuerUid) {
        const isWin = cert.category === 'winner';
        wb.set(FS.doc(FS.collection(db, 'hkNotifications')), {
          toUid: cert.uid,
          fromUid: issuerUid,
          hackathonId: cert.hackathonId,
          type: 'certificate',
          title: isWin ? `Winner Certificate Issued · ${cert.hackathonTitle}` : `Certificate Ready · ${cert.hackathonTitle}`,
          body: isWin
            ? `Your official ${cert.rankTitle} certificate is now ready to download and add to LinkedIn.`
            : `Your Certificate of Participation for ${cert.hackathonTitle} is ready to download and share.`,
          read: false,
          createdAtMs: Date.now(),
          createdAt: FS.serverTimestamp()
        });
      }
    });
    await wb.commit();
  }
  return prepared;
}

export async function setCertStatus(cid, status = 'revoked') {
  if (!cid) return;
  await FS.updateDoc(FS.doc(db, 'hkCertificates', cid), {
    status,
    updatedAtMs: Date.now(),
    updatedAt: FS.serverTimestamp()
  });
}

export async function markCertActivity(cert, field) {
  if (!cert?.id || !ALLOWED_METRICS.has(field)) return false;
  if (cert[field]) return true;
  const now = Date.now();
  try {
    await FS.updateDoc(FS.doc(db, 'hkCertificates', cert.id), { [field]: now });
    cert[field] = now;
    return true;
  } catch (e) {
    console.warn('[HK Cert] markCertActivity:', field, e?.message);
    return false;
  }
}

/* ---------------- Host Digital Signature Management ---------------- */
export async function saveHostSignature({ uid, hk, signatoryName, signatoryTitle = '', hackathon = null }) {
  const cleanName = String(signatoryName || '').trim();
  if (cleanName.length < 2) throw new Error('Enter your full name (at least 2 characters) for the digital signature.');
  const orgLabel = String(hk?.org || hackathon?.organiser?.org || hackathon?.brandName || '').trim();
  const cleanTitle = String(signatoryTitle || '').trim()
    || String(hk?.designation || hackathon?.organiser?.designation || '').trim()
    || (orgLabel ? `Organiser, ${orgLabel}` : 'Hackathon Organiser');
  const now = Date.now();
  const patch = {
    digitalSignatoryName: cleanName,
    digitalSignatoryTitle: cleanTitle,
    digitalSignatoryUpdatedAtMs: now
  };
  await C.updateHkProfile(uid, patch);
  if (hk && typeof hk === 'object') Object.assign(hk, patch);
  if (hackathon && typeof hackathon === 'object') {
    if (!hackathon.organiser || typeof hackathon.organiser !== 'object') hackathon.organiser = {};
    hackathon.organiser.signatoryName = cleanName;
    hackathon.organiser.signatoryTitle = cleanTitle;
    if (hackathon.id) {
      FS.updateDoc(FS.doc(db, 'hkHackathons', hackathon.id), {
        'organiser.signatoryName': cleanName,
        'organiser.signatoryTitle': cleanTitle
      }).catch(() => {});
    }
  }
  return { name: cleanName, title: cleanTitle, configured: true, updatedAtMs: now };
}

export function signatureStampPreviewHtml(name = '', title = '') {
  const displayName = String(name || '').trim() || 'Your Full Name';
  const displayTitle = String(title || '').trim() || 'Hackathon Organiser';
  const isPlaceholder = !String(name || '').trim();
  return `<div class="hkc-stamp-card">
    <div class="hkc-stamp-label">LIVE CERTIFICATE SIGNATURE STAMP</div>
    <div class="hkc-sig-block" style="width:100%;max-width:300px;margin:0 auto">
      <div class="hkc-sig-art" style="opacity:${isPlaceholder ? '.45' : '1'}">${CC.signatureSvgHtml(displayName, '#0C5535')}</div>
      <div class="hkc-sig-line"></div>
      <div class="hkc-sig-name">${CC.escHtml(displayName)}</div>
      <div class="hkc-sig-role">${CC.escHtml(displayTitle)}</div>
      <div class="hkc-ds-box">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z" fill="#16A34A"/><path d="m8.5 12 2.6 2.6L16 9.7" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div><b>Digitally signed</b> &middot; Campus Connect One<br>${CC.escHtml(displayName)} &middot; Verified Host</div>
      </div>
    </div>
  </div>`;
}

export function openSignatureConfigModal({ S, h = null, onSaved } = {}) {
  if (!S?.user?.uid) return;
  const cur = CC.resolveHostSignature(S.hk, h);
  const initName = cur.name || S.hk?.organiserName || S.hk?.displayName || '';
  const initTitle = cur.title || S.hk?.designation || (S.hk?.org ? `Organiser, ${S.hk.org}` : 'Hackathon Organiser');

  modal(cur.configured ? 'Manage Digital Signature' : 'Digital Signature Setup', `<form id="hkcSigModalForm" class="hk-form">
    <div class="hk-msg ok">
      <i data-lucide="shield-check"></i>
      <span>Enter your full name once below. It saves permanently to your host account and <b>automatically stamps every future generated certificate</b> with your digital signature.</span>
    </div>
    <div class="hk-grid2" style="align-items:start">
      <div class="hk-stack" style="gap:12px">
        <div class="hk-field">
          <label for="hkcModalSigName">Full Signatory Name *</label>
          <input class="hk-input" id="hkcModalSigName" name="sigName" required maxlength="60" value="${CC.escHtml(initName)}" placeholder="e.g. Dr. Riya Sharma">
        </div>
        <div class="hk-field">
          <label for="hkcModalSigTitle">Designation / Title <small>optional</small></label>
          <input class="hk-input" id="hkcModalSigTitle" name="sigTitle" maxlength="80" value="${CC.escHtml(initTitle)}" placeholder="e.g. Convenor, Coding Club">
        </div>
      </div>
      <div id="hkcModalSigPrev">${signatureStampPreviewHtml(initName, initTitle)}</div>
    </div>
    <div id="hkcSigModalErr" class="hk-msg err hk-hidden"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      <button type="submit" class="hk-btn primary"><i data-lucide="badge-check"></i>Save Signature Permanently</button>
    </div>
  </form>`, {
    wide: true,
    onMount(b, close) {
      const f = b.querySelector('#hkcSigModalForm');
      const nameIn = b.querySelector('#hkcModalSigName');
      const titleIn = b.querySelector('#hkcModalSigTitle');
      const prev = b.querySelector('#hkcModalSigPrev');
      const errBox = b.querySelector('#hkcSigModalErr');
      const updatePrev = () => {
        if (prev) prev.innerHTML = signatureStampPreviewHtml(nameIn?.value, titleIn?.value || initTitle);
      };
      nameIn?.addEventListener('input', updatePrev);
      titleIn?.addEventListener('input', updatePrev);
      f.onsubmit = async ev => {
        ev.preventDefault();
        if (errBox) { errBox.classList.add('hk-hidden'); errBox.innerHTML = ''; }
        const btn = f.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.innerHTML = '<span class="hk-spin"></span> Saving signature…';
        try {
          const saved = await saveHostSignature({
            uid: S.user.uid,
            hk: S.hk,
            signatoryName: nameIn?.value || '',
            signatoryTitle: titleIn?.value || '',
            hackathon: h
          });
          toast('Digital signature saved! All future certificates will use it automatically.');
          close();
          onSaved?.(saved);
        } catch (err) {
          if (errBox) {
            errBox.classList.remove('hk-hidden');
            errBox.innerHTML = `<i data-lucide="circle-alert"></i><span>${CC.escHtml(err?.message || 'Could not save signature.')}</span>`;
            icons(errBox);
          }
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="badge-check"></i>Save Signature Permanently';
          icons(btn);
        }
      };
    }
  });
}

/* ---------------- Lazy External Vendors (QRCode, html2canvas, jsPDF) ---------------- */
const scriptCache = new Map();
function loadScriptOnce(src, globalCheck) {
  if (globalCheck()) return Promise.resolve();
  if (scriptCache.has(src)) return scriptCache.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
  scriptCache.set(src, p);
  return p;
}

const ensureQR = () => loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => !!window.QRCode);
const ensureCanvas = () => loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', () => !!window.html2canvas);
const ensurePdf = () => loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', () => !!(window.jspdf && window.jspdf.jsPDF));

/* ---------------- Deterministic Fallback SVG QR Matrix (if CDN blocked offline) ---------------- */
function fallbackQrSvgDataUrl(text) {
  const N = 21;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const inFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const isFinderDot = (r, c) => {
    const lr = r < 7 ? r : r - (N - 7);
    const lc = c < 7 ? c : c - (N - 7);
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    return lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
  };
  let rects = '';
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let on = false;
      if (inFinder(r, c)) on = isFinderDot(r, c);
      else if (r === 6 || c === 6) on = (r + c) % 2 === 0;
      else {
        hash ^= (r * 31 + c * 17 + text.charCodeAt((r + c) % Math.max(1, text.length)));
        hash = Math.imul(hash, 16777619);
        on = ((hash >>> 3) & 1) === 1;
      }
      if (on) rects += `<rect x="${c + 2}" y="${r + 2}" width="1" height="1" fill="#0F172A"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N + 4} ${N + 4}" shape-rendering="crispEdges"><rect width="${N + 4}" height="${N + 4}" fill="#FFFFFF"/>${rects}</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

const qrCache = new Map();
export async function makeQrDataUrl(text) {
  if (qrCache.has(text)) return qrCache.get(text);
  try {
    await ensureQR();
    if (window.QRCode) {
      const url = await new Promise(res => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden';
        document.body.appendChild(d);
        new window.QRCode(d, {
          text,
          width: 240,
          height: 240,
          colorDark: '#0F172A',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
        setTimeout(() => {
          const cv = d.querySelector('canvas');
          const img = d.querySelector('img');
          const out = cv ? cv.toDataURL('image/png') : (img?.src || '');
          d.remove();
          res(out || fallbackQrSvgDataUrl(text));
        }, 65);
      });
      qrCache.set(text, url);
      return url;
    }
  } catch {}
  const fb = fallbackQrSvgDataUrl(text);
  qrCache.set(text, fb);
  return fb;
}

/* ---------------- Responsive Preview Stage ---------------- */
function fitStage(host) {
  if (!host) return;
  const st = host.querySelector('.hkc-stage');
  if (!st) return;
  const w = st.clientWidth || host.clientWidth || host.parentElement?.clientWidth || window.innerWidth || 340;
  if (!w || w < 30) return;
  const sc = Math.max(0.2, Math.min(1, w / 1123));
  const scaler = st.querySelector('.hkc-scaler');
  if (scaler) scaler.style.transform = `scale(${sc})`;
  st.style.height = Math.round(794 * sc) + 'px';
}

export async function mountCertPreview(host, cert, { locked = false } = {}) {
  if (!host || !cert) return;
  try {
    const verify = CC.certVerifyUrl(cert.id);
    const [qr, fp] = await Promise.all([
      makeQrDataUrl(verify),
      cert.fingerprint ? Promise.resolve(cert.fingerprint) : CC.computeFingerprint(cert)
    ]);
    host.classList.add('hkc-host');
    host.innerHTML = `<div class="hkc-stage-wrap">
      <div class="hkc-stage ${locked ? 'is-locked' : ''}">
        <div class="hkc-scaler">${CC.certSheetHtml(cert, qr, fp)}</div>
        ${locked ? '<div class="hkc-lock-ov"><i data-lucide="lock"></i><span>Credential Revoked</span></div>' : ''}
      </div>
    </div>`;
    fitStage(host);
    requestAnimationFrame(() => fitStage(host));
    setTimeout(() => fitStage(host), 140);

    if (!host._hkcRo && typeof ResizeObserver !== 'undefined') {
      host._hkcRo = new ResizeObserver(() => fitStage(host));
      host._hkcRo.observe(host);
    }
    icons();
  } catch (err) {
    console.error('[HK Cert] Preview mount error:', err);
  }
}

/* ---------------- High-Res 2x Export (PNG / PDF / Print / Image Share) ---------------- */
async function renderCertCanvas(cert) {
  await ensureCanvas();
  const verify = CC.certVerifyUrl(cert.id);
  const [qr, fp] = await Promise.all([
    makeQrDataUrl(verify),
    cert.fingerprint ? Promise.resolve(cert.fingerprint) : CC.computeFingerprint(cert)
  ]);

  const off = document.createElement('div');
  off.style.cssText = 'position:fixed;left:-14000px;top:0;width:1123px;height:794px;background:#ffffff;z-index:-1';
  off.innerHTML = CC.certSheetHtml(cert, qr, fp);
  document.body.appendChild(off);
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready.catch(() => {});
    }
    await new Promise(r => setTimeout(r, 220));
    return await window.html2canvas(off.firstElementChild, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false
    });
  } finally {
    off.remove();
  }
}

const fileSlug = cert => {
  const cat = cert?.category === 'winner' ? (cert.rankTitle || 'Winner') : 'Participation';
  return `CampusConnectOne_${cat}_${cert?.name || 'Certificate'}`.replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
};

async function withBusy(btn, busyLabel, fn) {
  if (btn && btn.dataset.busy === '1') return;
  const old = btn ? btn.innerHTML : '';
  if (btn) {
    btn.dataset.busy = '1';
    btn.disabled = true;
    btn.innerHTML = `<span class="hk-spin"></span> ${CC.escHtml(busyLabel)}`;
  }
  try {
    await fn();
  } catch (err) {
    console.error('[HK Cert] Action error:', err);
    toast(err?.message || 'Could not process certificate. Please try again.', 'error');
  } finally {
    if (btn) {
      delete btn.dataset.busy;
      btn.disabled = false;
      btn.innerHTML = old;
      icons();
    }
  }
}

export function downloadCertPng(cert, btn, onMarked) {
  return withBusy(btn, 'Rendering PNG…', async () => {
    const cv = await renderCertCanvas(cert);
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `${fileSlug(cert)}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 300);
    await markCertActivity(cert, 'certDownloadAtMs');
    onMarked?.('certDownloadAtMs');
    toast('Certificate PNG downloaded!');
  });
}

export function downloadCertPdf(cert, btn, onMarked) {
  return withBusy(btn, 'Building PDF…', async () => {
    await ensurePdf();
    const cv = await renderCertCanvas(cert);
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794] });
    pdf.addImage(cv.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 1123, 794);
    pdf.save(`${fileSlug(cert)}.pdf`);
    await markCertActivity(cert, 'certDownloadAtMs');
    onMarked?.('certDownloadAtMs');
    toast('Certificate PDF downloaded!');
  });
}

export function printCert(cert, btn, onMarked) {
  return withBusy(btn, 'Preparing Print…', async () => {
    const cv = await renderCertCanvas(cert);
    let area = document.getElementById('hkCertPrintArea');
    if (!area) {
      area = document.createElement('div');
      area.id = 'hkCertPrintArea';
      document.body.appendChild(area);
    }
    area.innerHTML = `<img src="${cv.toDataURL('image/png')}" alt="Printable Certificate">`;
    await markCertActivity(cert, 'certPrintAtMs');
    onMarked?.('certPrintAtMs');
    await new Promise(r => setTimeout(r, 180));
    window.print();
  });
}

export function shareCertImage(cert, btn, onMarked) {
  return withBusy(btn, 'Preparing Image…', async () => {
    const verify = CC.certVerifyUrl(cert.id);
    const isWin = cert.category === 'winner';
    const title = isWin
      ? `${cert.rankTitle} Certificate — ${cert.hackathonTitle}`
      : `Certificate of Participation — ${cert.hackathonTitle}`;
    const textBody = isWin
      ? `Honoured to receive ${cert.rankTitle} at ${cert.hackathonTitle} on Campus Connect One! Verify credential:\n${verify}`
      : `Completed ${cert.hackathonTitle} on Campus Connect One! Verify my participation credential:\n${verify}`;

    try {
      if (navigator.share) {
        try {
          const cv = await renderCertCanvas(cert);
          const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
          if (blob) {
            const file = new File([blob], `${fileSlug(cert)}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title, text: textBody });
              await markCertActivity(cert, 'certShareAtMs');
              onMarked?.('certShareAtMs');
              toast('Certificate image shared!');
              return;
            }
          }
        } catch (shareFileErr) {
          if (shareFileErr?.name === 'AbortError') return;
        }
        await navigator.share({ title, text: isWin ? `Honoured to receive ${cert.rankTitle} at ${cert.hackathonTitle} on Campus Connect One!` : `Completed ${cert.hackathonTitle} on Campus Connect One!`, url: verify });
        await markCertActivity(cert, 'certShareAtMs');
        onMarked?.('certShareAtMs');
        toast('Certificate shared!');
        return;
      }
      await navigator.clipboard.writeText(textBody);
      await markCertActivity(cert, 'certShareAtMs');
      onMarked?.('certShareAtMs');
      toast('Share message & verification link copied!');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(textBody);
        await markCertActivity(cert, 'certShareAtMs');
        onMarked?.('certShareAtMs');
        toast('Verification link copied!');
      } catch {
        toast('Could not copy link', 'error');
      }
    }
  });
}

export async function openLinkedInAdd(cert, onMarked) {
  const url = CC.buildLinkedInAddUrl(cert);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 250);
  await markCertActivity(cert, 'certLinkedInAtMs');
  onMarked?.('certLinkedInAtMs');
  toast('Opening LinkedIn Add Certification…');
}

/* ---------------- Full Interactive Certificate Modal Viewer ---------------- */
export function openCertViewerModal(cert, { isOwner = true, onActivity } = {}) {
  if (!cert) return;
  const isWin = cert.category === 'winner';
  const verify = CC.certVerifyUrl(cert.id);
  const code = CC.certCode(cert.id);
  const subtitle = isWin
    ? `${cert.rankTitle || 'Winner'} · ${cert.hackathonTitle}`
    : `Certificate of Participation · ${cert.hackathonTitle}`;

  modal(subtitle, `<div class="hk-stack">
    <div id="hkcModalStage"></div>

    <div class="hkc-verify-bar">
      <div class="vb-copy">
        <small>VERIFY URL · ${CC.escHtml(code)}</small>
        <span>${CC.escHtml(verify)}</span>
      </div>
      <button type="button" class="hk-btn sm" id="hkcCopyUrl"><i data-lucide="copy"></i>Copy</button>
      <a class="hk-btn sm" href="${CC.escHtml(verify)}" target="_blank" rel="noopener noreferrer"><i data-lucide="shield-check"></i>Verify Page</a>
    </div>

    <div class="hkc-act-bar">
      <button type="button" class="hk-btn primary" id="hkcDlPng"><i data-lucide="image"></i>Download Image (PNG)</button>
      <button type="button" class="hk-btn" id="hkcDlPdf"><i data-lucide="file-down"></i>Download PDF</button>
      <button type="button" class="hk-btn" id="hkcShareImg"><i data-lucide="share-2"></i>Share Certificate</button>
      ${isOwner ? `<button type="button" class="hk-btn hkc-li-btn" id="hkcLinkedIn"><i data-lucide="linkedin"></i>Add to LinkedIn</button>` : ''}
      <button type="button" class="hk-btn ghost" id="hkcPrint"><i data-lucide="printer"></i>Print</button>
    </div>

    <div class="hkc-track-strip" id="hkcModalTrack">
      <span class="hk-chip ${cert.certDownloadAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certDownloadAtMs ? 'check-circle-2' : 'download'}"></i>${cert.certDownloadAtMs ? 'Downloaded ✓' : 'Not downloaded yet'}</span>
      <span class="hk-chip ${cert.certShareAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certShareAtMs ? 'check-circle-2' : 'share-2'}"></i>${cert.certShareAtMs ? 'Shared ✓' : 'Not shared yet'}</span>
      <span class="hk-chip ${cert.certLinkedInAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certLinkedInAtMs ? 'check-circle-2' : 'linkedin'}"></i>${cert.certLinkedInAtMs ? 'Added to LinkedIn ✓' : 'Not on LinkedIn yet'}</span>
    </div>
  </div>`, {
    wide: true,
    onMount(b) {
      if (isOwner) {
        markCertActivity(cert, 'certViewedAtMs').then(() => onActivity?.('certViewedAtMs'));
      }
      mountCertPreview(b.querySelector('#hkcModalStage'), cert, { locked: cert.status === 'revoked' });

      const refreshBadges = (field) => {
        onActivity?.(field);
        const strip = b.querySelector('#hkcModalTrack');
        if (!strip) return;
        strip.innerHTML = `
          <span class="hk-chip ${cert.certDownloadAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certDownloadAtMs ? 'check-circle-2' : 'download'}"></i>${cert.certDownloadAtMs ? 'Downloaded ✓' : 'Not downloaded yet'}</span>
          <span class="hk-chip ${cert.certShareAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certShareAtMs ? 'check-circle-2' : 'share-2'}"></i>${cert.certShareAtMs ? 'Shared ✓' : 'Not shared yet'}</span>
          <span class="hk-chip ${cert.certLinkedInAtMs ? 'hkc-green' : 'neutral'}"><i data-lucide="${cert.certLinkedInAtMs ? 'check-circle-2' : 'linkedin'}"></i>${cert.certLinkedInAtMs ? 'Added to LinkedIn ✓' : 'Not on LinkedIn yet'}</span>`;
        icons();
      };

      b.querySelector('#hkcCopyUrl').onclick = async () => {
        try { await navigator.clipboard.writeText(verify); toast('Verification URL copied!'); }
        catch { toast(verify, 'info'); }
      };
      b.querySelector('#hkcDlPng').onclick = ev => downloadCertPng(cert, ev.currentTarget, isOwner ? refreshBadges : null);
      b.querySelector('#hkcDlPdf').onclick = ev => downloadCertPdf(cert, ev.currentTarget, isOwner ? refreshBadges : null);
      b.querySelector('#hkcShareImg').onclick = ev => shareCertImage(cert, ev.currentTarget, isOwner ? refreshBadges : null);
      b.querySelector('#hkcPrint').onclick = ev => printCert(cert, ev.currentTarget, isOwner ? refreshBadges : null);
      b.querySelector('#hkcLinkedIn')?.addEventListener('click', () => openLinkedInAdd(cert, isOwner ? refreshBadges : null));
    }
  });
}
