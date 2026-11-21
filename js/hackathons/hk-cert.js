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

export async function issueHackathonCerts(records = [], issuerUid = '', { onProgress } = {}) {
  if (!records.length) return [];
  const prepared = await Promise.all(records.map(async rec => {
    const fp = await CC.computeFingerprint(rec);
    return { ...rec, fingerprint: fp, status: 'issued', issuedAtMs: rec.issuedAtMs || Date.now(), updatedAtMs: Date.now() };
  }));

  const chunkSize = 350;
  const totalBatches = Math.ceil(prepared.length / chunkSize);
  let issuedCount = 0;

  for (let i = 0; i < prepared.length; i += chunkSize) {
    const batchIndex = Math.floor(i / chunkSize) + 1;
    const chunk = prepared.slice(i, i + chunkSize);
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
    issuedCount += chunk.length;
    onProgress?.({ batchIndex, totalBatches, issuedCount, totalCount: prepared.length });
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
export async function saveHostSignature({ uid, hk, signatoryName, signatoryTitle = '', hackathon = null, targetProfile = null, canPatchHackathon = false }) {
  const cleanName = String(signatoryName || '').trim();
  if (cleanName.length < 2) throw new Error('Enter full name (at least 2 characters) for the digital signature.');
  const refProfile = targetProfile || hk;
  const orgLabel = String(refProfile?.org || hackathon?.organiser?.org || hackathon?.brandName || '').trim();
  const cleanTitle = String(signatoryTitle || '').trim()
    || String(refProfile?.designation || hackathon?.organiser?.designation || '').trim()
    || (orgLabel ? `Organiser, ${orgLabel}` : 'Hackathon Organiser');
  const now = Date.now();
  const patch = {
    digitalSignatoryName: cleanName,
    digitalSignatoryTitle: cleanTitle,
    digitalSignatoryUpdatedAtMs: now
  };
  try {
    await C.updateHkProfile(uid, patch);
  } catch (err) {
    // Fallback if profile doc hasn't been initialized yet (allowed when self or staff)
    await FS.setDoc(FS.doc(db, 'hkProfiles', uid), { uid, ...patch, updatedAt: FS.serverTimestamp() }, { merge: true });
  }
  if (hk && typeof hk === 'object' && (!hk.uid || hk.uid === uid)) Object.assign(hk, patch);
  if (targetProfile && typeof targetProfile === 'object') Object.assign(targetProfile, patch);
  if (hackathon && typeof hackathon === 'object') {
    if (!hackathon.organiser || typeof hackathon.organiser !== 'object') hackathon.organiser = {};
    hackathon.organiser.signatoryName = cleanName;
    hackathon.organiser.signatoryTitle = cleanTitle;
    if (hackathon.id && (canPatchHackathon || hackathon.status !== 'approved')) {
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

export function openSignatureConfigModal({ S, h = null, targetUid = '', targetProfile = null, onSaved } = {}) {
  if (!S?.user?.uid) return;
  const saveUid = targetUid || h?.hostUid || S.user.uid;
  const isStaffUser = typeof C.isStaff === 'function' ? C.isStaff(S.site) : false;
  const refProfile = targetProfile || (saveUid === S.user.uid ? S.hk : null);
  const cur = CC.resolveHostSignature(refProfile || S.hk, h, S.hk);
  const initName = cur.name || refProfile?.organiserName || refProfile?.displayName || h?.hostName || '';
  const initTitle = cur.title || refProfile?.designation || (refProfile?.org ? `Organiser, ${refProfile.org}` : (h?.brandName ? `Organiser, ${h.brandName}` : 'Hackathon Organiser'));

  modal(cur.configured ? 'Manage Digital Signature' : 'Digital Signature Setup', `<form id="hkcSigModalForm" class="hk-form">
    <div class="hk-msg ok">
      <i data-lucide="shield-check"></i>
      <span>Enter the host's full name once below. It saves permanently to the host profile and <b>automatically stamps all future generated certificates</b> with this digital signature.</span>
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
          const effectiveUid = (saveUid === S.user.uid || isStaffUser) ? saveUid : S.user.uid;
          const saved = await saveHostSignature({
            uid: effectiveUid,
            hk: S.hk,
            targetProfile: effectiveUid === targetProfile?.uid ? targetProfile : null,
            signatoryName: nameIn?.value || '',
            signatoryTitle: titleIn?.value || '',
            hackathon: h,
            canPatchHackathon: isStaffUser
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

/* ---------------- Bulk Generate Certificates Modal Studio ---------------- */
export function openBulkGenerateModal({
  h,
  regs = [],
  subs = [],
  atts = [],
  certs = [],
  S,
  ownerProfile = null,
  preselectedUids = null,
  initialFilter = 'all',
  onGenerated
} = {}) {
  if (!h || !S?.user?.uid) return;
  const hostUid = h.hostUid || S.user.uid;
  const isStaffUser = typeof C.isStaff === 'function' ? C.isStaff(S.site) : false;
  const canEditSig = isStaffUser || S.user.uid === hostUid;
  const candidates = CC.buildBulkCertCandidates({ h, regs, subs, atts, certs });

  const selected = new Set();
  const categoryMap = new Map();
  const rankMap = new Map();

  candidates.forEach(c => {
    categoryMap.set(c.uid, c.defaultCategory);
    rankMap.set(c.uid, c.defaultRankTitle);
    if (Array.isArray(preselectedUids) && preselectedUids.length) {
      if (preselectedUids.includes(c.uid)) selected.add(c.uid);
    } else if (!c.hasIssuedDefault) {
      selected.add(c.uid);
    }
  });

  let filterKey = initialFilter || 'all';
  let searchQ = '';
  let eventDateLabel = CC.defaultEventDateLabel(h);
  let showSigEditor = !CC.resolveHostSignature(ownerProfile || S.hk, h, S.hk).configured;

  const currentSig = () => CC.resolveHostSignature(ownerProfile || S.hk, h, S.hk);

  const visibleCandidates = () => {
    const q = searchQ.trim().toLowerCase();
    return candidates.filter(c => {
      const cat = c.isWinner ? 'winner' : (categoryMap.get(c.uid) || c.defaultCategory);
      if (filterKey === 'winners' && !c.isWinner && cat !== 'winner') return false;
      if (filterKey === 'participants' && (c.isWinner || cat === 'winner')) return false;
      if (filterKey === 'shortlisted' && !['shortlisted', 'selected'].includes(c.status)) return false;
      if (filterKey === 'unissued' && c.hasIssuedDefault) return false;
      if (filterKey === 'issued' && !c.hasIssuedWinner && !c.hasIssuedPart) return false;
      if (!q) return true;
      return [c.name, c.teamName, c.email, c.college, c.projectTitle, rankMap.get(c.uid) || ''].join(' ').toLowerCase().includes(q);
    });
  };

  modal(`Bulk Generate Certificates · ${h.title || 'Hackathon'}`, `<div id="hkcBulkRoot" class="hkc-bulk-wrap"></div>`, {
    wide: true,
    onMount(box, close) {
      const root = box.querySelector('#hkcBulkRoot');
      if (!root) return;

      const buildSelectionsPayload = () => {
        const list = [];
        candidates.forEach(c => {
          if (!selected.has(c.uid)) return;
          const cat = c.isWinner ? 'winner' : (categoryMap.get(c.uid) || c.defaultCategory);
          list.push({
            uid: c.uid,
            reg: c.reg,
            isWinner: c.isWinner,
            category: cat,
            rankTitle: cat === 'winner' ? (rankMap.get(c.uid) || c.defaultRankTitle) : 'Participant',
            prize: cat === 'winner' ? c.prize : '',
            projectTitle: c.projectTitle
          });
        });
        return list;
      };

      const countBreakdown = () => {
        let win = 0, part = 0;
        candidates.forEach(c => {
          if (!selected.has(c.uid)) return;
          const cat = c.isWinner ? 'winner' : (categoryMap.get(c.uid) || c.defaultCategory);
          if (cat === 'winner') win++;
          else part++;
        });
        return { win, part, totalCerts: win + part, people: selected.size };
      };

      const render = () => {
        const sig = currentSig();
        const vis = visibleCandidates();
        const { win, part, totalCerts, people } = countBreakdown();
        const winTotal = candidates.filter(c => c.isWinner).length;
        const partOnlyTotal = candidates.filter(c => !c.isWinner).length;
        const shortTotal = candidates.filter(c => ['shortlisted', 'selected'].includes(c.status)).length;
        const unissuedTotal = candidates.filter(c => !c.hasIssuedDefault).length;
        const issuedTotal = candidates.filter(c => c.hasIssuedWinner || c.hasIssuedPart).length;
        const allVisSelected = vis.length > 0 && vis.every(c => selected.has(c.uid));

        const initSigName = sig.name || ownerProfile?.organiserName || ownerProfile?.displayName || h?.hostName || '';
        const initSigTitle = sig.title || ownerProfile?.designation || (ownerProfile?.org ? `Organiser, ${ownerProfile.org}` : (h?.brandName ? `Organiser, ${h.brandName}` : 'Hackathon Organiser'));

        root.innerHTML = `
          <div class="hkc-sig-banner">
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div class="hkc-sig-preview" id="hkcBulkSigMini">${CC.signatureSvgHtml(sig.name || 'Host Signature', '#0C5535')}</div>
              <div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <b>${sig.configured ? CC.escHtml(sig.name) : 'Host Digital Signature Required'}</b>
                  ${sig.configured
                    ? '<span class="hk-chip hkc-green"><i data-lucide="badge-check"></i>Stored Signature Active</span>'
                    : '<span class="hk-chip warn"><i data-lucide="circle-alert"></i>Not Configured</span>'}
                </div>
                <div class="hk-xs hk-muted">${sig.configured ? `${CC.escHtml(sig.title)} &middot; Applied automatically to every certificate in this batch` : 'Save the host full signatory name once below to generate all selected certificates.'}</div>
              </div>
            </div>
            ${canEditSig ? `<button type="button" class="hk-btn sm" id="hkcBulkToggleSig"><i data-lucide="${showSigEditor ? 'x' : 'pencil'}"></i>${showSigEditor ? 'Close Signature' : (sig.configured ? 'Change Signature' : 'Set Signature')}</button>` : ''}
          </div>

          ${showSigEditor && canEditSig ? `<div class="hk-card-s hkc-bulk-sigbox" style="padding:14px">
            <div class="hk-grid2" style="align-items:end">
              <div class="hk-field" style="margin:0">
                <label for="hkcBulkSigName">Host Signatory Full Name *</label>
                <input class="hk-input" id="hkcBulkSigName" maxlength="60" value="${CC.escHtml(initSigName)}" placeholder="e.g. Dr. Riya Sharma">
              </div>
              <div class="hk-field" style="margin:0">
                <label for="hkcBulkSigTitle">Designation / Title</label>
                <input class="hk-input" id="hkcBulkSigTitle" maxlength="80" value="${CC.escHtml(initSigTitle)}" placeholder="e.g. Convenor, Coding Club">
              </div>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
              <button type="button" class="hk-btn sm primary" id="hkcBulkSaveSigBtn"><i data-lucide="badge-check"></i>Save Stored Signature</button>
            </div>
          </div>` : ''}

          <div class="hkc-bulk-head">
            <div class="hk-field" style="margin:0;flex:1;min-width:210px">
              <label for="hkcBulkDateIn">Official Event Date <small>printed on all certificates</small></label>
              <div style="display:flex;gap:6px">
                <input class="hk-input" id="hkcBulkDateIn" maxlength="64" value="${CC.escHtml(eventDateLabel)}" placeholder="e.g. 18 – 20 Nov 2026">
                <button type="button" class="hk-btn sm" id="hkcBulkDateReset" title="Use official hackathon dates"><i data-lucide="rotate-ccw"></i></button>
              </div>
            </div>
            <div class="hk-xs hk-muted" style="align-self:center;padding:8px 12px;border-radius:10px;background:var(--hk-surface2);border:1px solid var(--hk-line)">
              <i data-lucide="shield-check" style="width:14px;height:14px;vertical-align:-2px;color:var(--hk-p)"></i>
              Winners receive <b>Winner Certificates</b> only (excluded from Participation).
            </div>
          </div>

          <div class="hkc-bulk-tools">
            <div class="hk-search" style="flex:1;min-width:200px">
              <i data-lucide="search"></i>
              <input class="hk-input" id="hkcBulkSearch" value="${CC.escHtml(searchQ)}" placeholder="Search winner or participant by name, team, email, college…">
            </div>
            <div class="hk-chips" style="margin:0">
              <button type="button" class="hk-chip btn ${filterKey === 'all' ? 'on' : ''}" data-bgfilt="all">All (${candidates.length})</button>
              <button type="button" class="hk-chip btn ${filterKey === 'winners' ? 'on' : ''}" data-bgfilt="winners">Winners (${winTotal})</button>
              <button type="button" class="hk-chip btn ${filterKey === 'participants' ? 'on' : ''}" data-bgfilt="participants">Participants (${partOnlyTotal})</button>
              <button type="button" class="hk-chip btn ${filterKey === 'shortlisted' ? 'on' : ''}" data-bgfilt="shortlisted">Shortlisted (${shortTotal})</button>
              <button type="button" class="hk-chip btn ${filterKey === 'unissued' ? 'on' : ''}" data-bgfilt="unissued">Unissued (${unissuedTotal})</button>
              <button type="button" class="hk-chip btn ${filterKey === 'issued' ? 'on' : ''}" data-bgfilt="issued">Already Issued (${issuedTotal})</button>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <label class="hk-check" style="margin:0;font-weight:700">
              <input type="checkbox" id="hkcBulkMasterCb" ${allVisSelected ? 'checked' : ''}>
              <span>Select Visible (${vis.length})</span>
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="hk-btn sm" data-bgq="unissued"><i data-lucide="sparkles"></i>Select Unissued (${unissuedTotal})</button>
              <button type="button" class="hk-btn sm" data-bgq="winners"><i data-lucide="trophy"></i>Winners Only (${winTotal})</button>
              <button type="button" class="hk-btn sm" data-bgq="participants"><i data-lucide="users"></i>Participants Only (${partOnlyTotal})</button>
              <button type="button" class="hk-btn sm" data-bgq="all"><i data-lucide="list-checks"></i>Select All (${candidates.length})</button>
              <button type="button" class="hk-btn sm ghost" data-bgq="none">Clear</button>
            </div>
          </div>

          ${vis.length ? `<div class="hkc-check-list" style="max-height:330px">
            ${vis.map(c => {
              const checked = selected.has(c.uid);
              const cat = c.isWinner ? 'winner' : (categoryMap.get(c.uid) || c.defaultCategory);
              const isWinCat = cat === 'winner';
              const rankVal = rankMap.get(c.uid) ?? c.defaultRankTitle;
              const issuedBadge = c.hasIssuedWinner
                ? '<span class="hk-chip hkc-green"><i data-lucide="trophy"></i>Winner Issued</span>'
                : (c.hasIssuedPart
                    ? '<span class="hk-chip hkc-green"><i data-lucide="check-circle-2"></i>Part Issued</span>'
                    : '<span class="hk-chip neutral">Unissued</span>');
              return `<div class="hkc-check-row hkc-bulk-row ${checked ? 'is-on' : ''}">
                <input type="checkbox" data-bguid="${CC.escHtml(c.uid)}" ${checked ? 'checked' : ''} aria-label="Select ${CC.escHtml(c.name)}">
                ${c.isWinner ? `<span class="hk-rank top${Math.min(c.winnerRank || 3, 3)}">#${c.winnerRank}</span>` : ''}
                <div style="flex:1;min-width:170px">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <b>${CC.escHtml(c.name)}</b>
                    ${c.teamName ? `<span class="hk-chip neutral">${CC.escHtml(c.teamName)}</span>` : ''}
                    ${c.status === 'shortlisted' ? '<span class="hk-chip">Shortlisted</span>' : ''}
                  </div>
                  <div class="hk-xs hk-muted">${CC.escHtml(c.email || c.college || 'Verified Participant')}${c.college && c.email ? ' &middot; ' + CC.escHtml(c.college) : ''}${c.subScore != null ? ` &middot; Project ${c.subScore}` : ''}${c.hasTest ? ` &middot; Test ${c.testScore}/${c.testTotal}` : ''}</div>
                </div>
                ${c.isWinner
                  ? `<span class="hk-chip gold"><i data-lucide="trophy"></i>Winner Award</span>`
                  : `<select class="hk-select sm" data-bgcat="${CC.escHtml(c.uid)}" style="width:auto;min-width:136px">
                      <option value="participant" ${!isWinCat ? 'selected' : ''}>Participation</option>
                      <option value="winner" ${isWinCat ? 'selected' : ''}>Winner Award</option>
                    </select>`}
                ${isWinCat ? `<input class="hk-input" data-bgrank="${CC.escHtml(c.uid)}" value="${CC.escHtml(rankVal)}" placeholder="Rank / Award Title" style="max-width:190px;min-height:36px">` : ''}
                ${issuedBadge}
              </div>`;
            }).join('')}
          </div>` : `<div class="hk-card-s" style="text-align:center;padding:24px"><span class="hk-sm hk-muted">${candidates.length ? 'No candidates match this search or filter.' : 'No eligible participants or winners found yet.'}</span></div>`}

          <div class="hkc-bulk-foot">
            <div>
              <b id="hkcBulkCountLbl">${people} recipient${people === 1 ? '' : 's'} selected</b>
              <div class="hk-xs hk-muted">${totalCerts ? `Will generate ${totalCerts} certificate${totalCerts === 1 ? '' : 's'} (${win} Winner${win === 1 ? '' : 's'}, ${part} Participation) with stored signature` : 'Pick winners or participants above to generate'}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="hk-btn" id="hkcBulkCancel">Cancel</button>
              <button type="button" class="hk-btn primary lg" id="hkcBulkRunBtn" ${sig.configured && totalCerts ? '' : 'disabled'}>
                <i data-lucide="award"></i>Bulk Generate (${totalCerts})
              </button>
            </div>
          </div>
        `;

        icons(root);
        bindEvents();
      };

      const bindEvents = () => {
        root.querySelector('#hkcBulkToggleSig')?.addEventListener('click', () => { showSigEditor = !showSigEditor; render(); });
        root.querySelector('#hkcBulkCancel')?.addEventListener('click', close);
        root.querySelector('#hkcBulkDateIn')?.addEventListener('input', e => { eventDateLabel = e.target.value; });
        root.querySelector('#hkcBulkDateReset')?.addEventListener('click', () => { eventDateLabel = CC.defaultEventDateLabel(h); render(); });

        const sigNameIn = root.querySelector('#hkcBulkSigName');
        const sigTitleIn = root.querySelector('#hkcBulkSigTitle');
        const sigMini = root.querySelector('#hkcBulkSigMini');
        sigNameIn?.addEventListener('input', () => {
          if (sigMini) sigMini.innerHTML = CC.signatureSvgHtml(sigNameIn.value || 'Host Signature', '#0C5535');
        });

        root.querySelector('#hkcBulkSaveSigBtn')?.addEventListener('click', async ev => {
          const btn = ev.currentTarget;
          const sName = String(sigNameIn?.value || '').trim();
          const sTitle = String(sigTitleIn?.value || '').trim();
          if (sName.length < 2) return toast('Enter host full name (at least 2 characters).', 'error');
          btn.disabled = true;
          btn.innerHTML = '<span class="hk-spin"></span> Saving…';
          try {
            const effectiveUid = (hostUid === S.user.uid || isStaffUser) ? hostUid : S.user.uid;
            await saveHostSignature({
              uid: effectiveUid,
              hk: S.hk,
              targetProfile: ownerProfile,
              signatoryName: sName,
              signatoryTitle: sTitle,
              hackathon: h,
              canPatchHackathon: isStaffUser
            });
            showSigEditor = false;
            toast('Stored host digital signature updated!');
            render();
          } catch (err) {
            toast(err?.message || 'Could not save signature.', 'error');
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="badge-check"></i>Save Stored Signature';
            icons(btn);
          }
        });

        const sEl = root.querySelector('#hkcBulkSearch');
        sEl?.addEventListener('input', e => {
          const pos = e.target.selectionStart;
          searchQ = e.target.value;
          render();
          const nextIn = root.querySelector('#hkcBulkSearch');
          if (nextIn) {
            nextIn.focus();
            if (pos != null) try { nextIn.setSelectionRange(pos, pos); } catch {}
          }
        });

        root.querySelectorAll('[data-bgfilt]').forEach(b => {
          b.onclick = () => { filterKey = b.dataset.bgfilt; render(); };
        });

        root.querySelectorAll('[data-bgq]').forEach(b => {
          b.onclick = () => {
            const mode = b.dataset.bgq;
            if (mode === 'none') selected.clear();
            else if (mode === 'all') candidates.forEach(c => selected.add(c.uid));
            else if (mode === 'winners') {
              selected.clear();
              candidates.filter(c => c.isWinner).forEach(c => { selected.add(c.uid); categoryMap.set(c.uid, 'winner'); });
            } else if (mode === 'participants') {
              selected.clear();
              candidates.filter(c => !c.isWinner).forEach(c => { selected.add(c.uid); categoryMap.set(c.uid, 'participant'); });
            } else if (mode === 'unissued') {
              selected.clear();
              candidates.filter(c => !c.hasIssuedDefault).forEach(c => selected.add(c.uid));
            }
            render();
          };
        });

        root.querySelector('#hkcBulkMasterCb')?.addEventListener('change', e => {
          const vis = visibleCandidates();
          vis.forEach(c => e.target.checked ? selected.add(c.uid) : selected.delete(c.uid));
          render();
        });

        root.querySelectorAll('[data-bguid]').forEach(cb => {
          cb.onchange = () => {
            cb.checked ? selected.add(cb.dataset.bguid) : selected.delete(cb.dataset.bguid);
            render();
          };
        });

        root.querySelectorAll('[data-bgcat]').forEach(sel => {
          sel.onchange = () => {
            categoryMap.set(sel.dataset.bgcat, sel.value);
            selected.add(sel.dataset.bgcat);
            render();
          };
        });

        root.querySelectorAll('[data-bgrank]').forEach(inp => {
          inp.oninput = () => { rankMap.set(inp.dataset.bgrank, inp.value); };
        });

        root.querySelector('#hkcBulkRunBtn')?.addEventListener('click', async ev => {
          const btn = ev.currentTarget;
          const sig = currentSig();
          if (!sig.configured) return toast('Save the host digital signature first.', 'error');
          const selections = buildSelectionsPayload();
          if (!selections.length) return toast('Select at least one recipient.', 'error');

          const cleanDate = String(eventDateLabel || '').trim() || CC.defaultEventDateLabel(h);
          let records;
          try {
            records = CC.buildBulkCertificateRecords({
              h,
              selections,
              eventDateLabel: cleanDate,
              signatoryName: sig.name,
              signatoryTitle: sig.title,
              hostUid
            });
          } catch (err) {
            return toast(err?.message || 'Invalid selection.', 'error');
          }

          btn.disabled = true;
          btn.innerHTML = `<span class="hk-spin"></span> Generating 0/${records.length}…`;
          try {
            await issueHackathonCerts(records, S.user.uid, {
              onProgress({ issuedCount, totalCount }) {
                btn.innerHTML = `<span class="hk-spin"></span> Generating ${issuedCount}/${totalCount}…`;
              }
            });
            if (isStaffUser && typeof C.audit === 'function') {
              C.audit(S.user.uid, 'certificates.bulk_generate', h.id, {
                title: h.title,
                count: records.length,
                note: `Bulk generated ${records.length} certificate(s) with signature "${sig.name}"`
              }).catch(() => {});
            }
            const freshCerts = await fetchHackathonCerts(h.id).catch(() => records);
            toast(`Bulk generated ${records.length} official certificate${records.length === 1 ? '' : 's'} using "${sig.name}"!`);
            close();
            onGenerated?.(freshCerts, records);
          } catch (err) {
            console.error('[HK Cert] Bulk generate error:', err);
            toast(err?.message || 'Bulk generation failed. Check permissions and try again.', 'error');
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="award"></i>Bulk Generate (${records.length})`;
            icons(btn);
          }
        });
      };

      render();
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
