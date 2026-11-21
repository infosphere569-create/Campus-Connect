// Standalone Certificate Viewer & Public QR Verification Page (?v=<certId> or signed-in owner wallet)
import { initBg } from './hk-bg.js';
import * as C from './hk-core.js';
import * as HC from './hk-cert.js';
import { signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const { $, esc, icons, toast } = C;
const toggleTheme = C.initTheme();
initBg($('#hkBg'));
$('#themeBtn')?.addEventListener('click', toggleTheme);

const view = $('#certPageView');
const badge = $('#topVerifyBadge');
const params = new URLSearchParams(location.search);
const verifyId = (params.get('v') || params.get('id') || '').trim();
const wantHid = (params.get('hid') || '').trim();

let currentUser = null;
let myCerts = [];
let activeCert = null;

function actionBarHtml(cert, isOwner) {
  const verify = HC.certVerifyUrl(cert.id);
  const code = HC.certCode(cert.id);
  return `<div class="hkc-verify-bar">
      <div class="vb-copy">
        <small>VERIFY URL &middot; ${esc(code)}</small>
        <span>${esc(verify)}</span>
      </div>
      <button type="button" class="hk-btn sm" id="cpVerifyBtn"><i data-lucide="copy"></i>Copy</button>
    </div>
    <div class="hkc-act-bar">
      <button type="button" class="hk-btn primary" id="cpDlPng"><i data-lucide="image"></i>Download Image (PNG)</button>
      <button type="button" class="hk-btn" id="cpDlPdf"><i data-lucide="file-down"></i>Download PDF</button>
      <button type="button" class="hk-btn" id="cpShare"><i data-lucide="share-2"></i>Share Certificate</button>
      ${isOwner ? `<button type="button" class="hk-btn hkc-li-btn" id="cpLi"><i data-lucide="linkedin"></i>Add to LinkedIn</button>` : ''}
      <button type="button" class="hk-btn ghost" id="cpPrint"><i data-lucide="printer"></i>Print</button>
    </div>`;
}

function bindActions(container, cert, isOwner, onAfter) {
  if (!container || !cert) return;
  container.querySelector('#cpVerifyBtn')?.addEventListener('click', async () => {
    const u = HC.certVerifyUrl(cert.id);
    try { await navigator.clipboard.writeText(u); toast('Verification URL copied!'); }
    catch { toast(u, 'info'); }
  });
  container.querySelector('#cpDlPng')?.addEventListener('click', e => HC.downloadCertPng(cert, e.currentTarget, isOwner ? onAfter : null));
  container.querySelector('#cpDlPdf')?.addEventListener('click', e => HC.downloadCertPdf(cert, e.currentTarget, isOwner ? onAfter : null));
  container.querySelector('#cpShare')?.addEventListener('click', e => HC.shareCertImage(cert, e.currentTarget, isOwner ? onAfter : null));
  container.querySelector('#cpPrint')?.addEventListener('click', e => HC.printCert(cert, e.currentTarget, isOwner ? onAfter : null));
  container.querySelector('#cpLi')?.addEventListener('click', () => HC.openLinkedInAdd(cert, isOwner ? onAfter : null));
}

async function renderVerify(cid) {
  document.title = 'Verify Hackathon Certificate — Campus Connect One';
  view.innerHTML = `<div class="hk-card-s hkc-v-card" id="vcBox" style="text-align:center;padding:34px 20px">
      <div class="hkc-v-seal"><div class="hkc-v-scan"></div></div>
      <h2 style="margin:8px 0 4px">Verifying Credential…</h2>
      <p class="hk-sm hk-muted">Checking Campus Connect One official hackathon records</p>
    </div>
    <div id="vcStage"></div>`;

  const t0 = Date.now();
  let cert = null;
  try { cert = await HC.fetchCertById(cid); } catch (e) { console.warn(e); }
  const wait = Math.max(0, 550 - (Date.now() - t0));
  if (wait) await new Promise(r => setTimeout(r, wait));

  const vcBox = $('#vcBox');
  if (!cert || cert.status === 'revoked') {
    vcBox.innerHTML = `<div class="hkc-v-seal">
        <svg class="hkc-shield is-bad" viewBox="0 0 100 100"><path class="sh" d="M50 6 14 20v28c0 22 15 38 36 46 21-8 36-24 36-46V20z"/><path class="ck" d="M36 36l28 28M64 36 36 64"/></svg>
      </div>
      <h2 style="color:var(--hk-bad);margin:6px 0 4px">${cert ? 'Certificate Revoked' : 'Credential Not Found'}</h2>
      <p class="hk-sm hk-muted">${cert ? 'The hackathon organiser has revoked this certificate and it is no longer valid.' : 'No official hackathon certificate matches this ID in Campus Connect One records.'}</p>
      <div style="margin-top:16px"><a class="hk-btn" href="hackthons.html">Explore Hackathons</a></div>`;
    icons();
    return;
  }

  if (badge) badge.style.display = 'inline-flex';
  const isWin = cert.category === 'winner';
  const isOwner = !!(currentUser && cert.uid && currentUser.uid === cert.uid);
  if (isOwner) HC.markCertActivity(cert, 'certViewedAtMs');

  vcBox.innerHTML = `<div class="hkc-v-seal">
      <div class="hkc-v-pulse"></div>
      <svg class="hkc-shield" viewBox="0 0 100 100"><path class="sh" d="M50 6 14 20v28c0 22 15 38 36 46 21-8 36-24 36-46V20z"/><path class="ck" d="m33 50 12 12 23-26"/></svg>
    </div>
    <h1 style="font-size:1.38rem;color:#16a34a;margin:4px 0">Verified Official Credential &#10003;</h1>
    <p class="hk-sm hk-muted">${isWin ? 'Official Hackathon Winner Certificate' : 'Official Hackathon Participation Certificate'} &middot; <b>Campus Connect One</b></p>

    <div class="hkc-v-grid">
      <div><b>Recipient</b><span>${esc(cert.name)}${cert.teamName ? ` (Team ${esc(cert.teamName)})` : ''}</span></div>
      <div><b>Hackathon</b><span>${esc(cert.hackathonTitle)}</span></div>
      <div><b>${isWin ? 'Position / Award' : 'Credential Type'}</b><span>${esc(isWin ? cert.rankTitle : 'Certificate of Participation')}${cert.prize ? ` (${esc(cert.prize)})` : ''}</span></div>
      <div><b>Event Date</b><span>${esc(cert.eventDateLabel || 'Official Event')}</span></div>
      <div><b>Organised By</b><span>${esc(cert.hostOrg || 'Campus Connect One')}</span></div>
      <div><b>Digital Signatory</b><span>${esc(cert.signatoryName)} (${esc(cert.signatoryTitle || 'Organiser')})</span></div>
      <div><b>Certificate ID</b><span style="font-family:var(--hk-mono)">${esc(HC.certCode(cert.id))}</span></div>
      <div><b>Verification Status</b><span style="color:#16a34a">Authentic &amp; Digitally Signed &#10003;</span></div>
    </div>

    ${isOwner ? `<div class="hk-stack" style="margin-top:16px">${actionBarHtml(cert, true)}</div>` : `<div class="hk-xs hk-muted" style="margin-top:14px">Are you the certificate holder? <button type="button" class="hk-linkbtn" id="vcSignInBtn">Sign in with Google</button> to download or add to LinkedIn.</div>`}`;

  const stage = $('#vcStage');
  stage.innerHTML = `<div class="hk-card-s" style="margin-top:16px;padding:14px"><div id="vcPreviewMount"></div></div>`;
  await HC.mountCertPreview($('#vcPreviewMount'), cert);
  if (isOwner) bindActions(vcBox, cert, true);
  $('#vcSignInBtn')?.addEventListener('click', () => signInWithPopup(C.auth, new GoogleAuthProvider()).catch(() => toast('Sign-in cancelled', 'info')));
  icons();
}

function renderOwnerWallet(user) {
  if (!user) {
    view.innerHTML = `<div class="hk-card-s" style="text-align:center;padding:42px 20px;max-width:520px;margin:24px auto">
      <div class="hk-sub-badge" style="margin:0 auto 12px"><i data-lucide="award"></i></div>
      <h2>Sign in to view your Hackathon Certificates</h2>
      <p class="hk-sm hk-muted" style="margin:6px 0 18px">Use the same Google account you used to register for the hackathon.</p>
      <button type="button" class="hk-btn primary" id="certLoginBtn"><i data-lucide="shield-check"></i>Continue with Google</button>
    </div>`;
    icons();
    $('#certLoginBtn')?.addEventListener('click', () => signInWithPopup(C.auth, new GoogleAuthProvider()).catch(() => toast('Sign-in failed', 'error')));
    return;
  }

  const active = myCerts.filter(c => c.status !== 'revoked');
  const filtered = wantHid ? active.filter(c => c.hackathonId === wantHid) : active;
  if (!activeCert || !filtered.some(c => c.id === activeCert.id)) {
    activeCert = filtered[0] || active[0] || null;
  }

  if (!activeCert) {
    view.innerHTML = `<div class="hk-card-s" style="text-align:center;padding:42px 20px">
      <div class="hk-sub-badge" style="margin:0 auto 12px"><i data-lucide="award"></i></div>
      <h2>No Certificates Issued Yet</h2>
      <p class="hk-sm hk-muted" style="margin:6px 0 18px">Once a hackathon organiser generates your Winner or Participation certificate, it will appear here automatically.</p>
      <a class="hk-btn primary" href="hackthons-portal.html#/my"><i data-lucide="arrow-left"></i>Back to My Hackathons</a>
    </div>`;
    icons();
    return;
  }

  if (badge) badge.style.display = 'inline-flex';
  HC.markCertActivity(activeCert, 'certViewedAtMs');
  const switcher = active.length > 1 ? `<div class="hk-chips" style="margin-bottom:14px">
    ${active.map(c => `<button type="button" class="hk-chip btn ${c.id === activeCert.id ? 'on' : ''}" data-pickcert="${esc(c.id)}"><i data-lucide="${c.category === 'winner' ? 'trophy' : 'award'}"></i>${esc(c.hackathonTitle)} &middot; ${esc(c.category === 'winner' ? c.rankTitle : 'Participant')}</button>`).join('')}
  </div>` : '';

  view.innerHTML = `<div class="hk-stack">
    <div class="hk-page-h" style="margin-bottom:4px">
      <div>
        <span class="hk-eyebrow">${activeCert.category === 'winner' ? 'Official Winner Credential' : 'Official Participation Credential'}</span>
        <h1>${esc(activeCert.hackathonTitle)}</h1>
        <p>Issued to <b>${esc(activeCert.name)}</b>${activeCert.teamName ? ` &middot; Team ${esc(activeCert.teamName)}` : ''} &middot; ${esc(activeCert.eventDateLabel)}</p>
      </div>
      <a class="hk-btn sm" href="hackthons-portal.html#/my/${esc(activeCert.hackathonId)}"><i data-lucide="layout-dashboard"></i>Hackathon Dashboard</a>
    </div>
    ${switcher}
    <div class="hk-card-s" style="padding:16px">
      <div id="ownerCertStage"></div>
      ${actionBarHtml(activeCert, true)}
    </div>
  </div>`;

  HC.mountCertPreview($('#ownerCertStage'), activeCert);
  bindActions(view, activeCert, true);
  view.querySelectorAll('[data-pickcert]').forEach(btn => {
    btn.onclick = () => {
      activeCert = active.find(c => c.id === btn.dataset.pickcert) || activeCert;
      renderOwnerWallet(user);
    };
  });
  icons();
}

C.watchUser(async user => {
  currentUser = user;
  if (verifyId) {
    await renderVerify(verifyId);
    return;
  }
  if (!user) {
    renderOwnerWallet(null);
    return;
  }
  try {
    myCerts = await HC.fetchMyHackathonCerts(user.uid);
  } catch (e) {
    console.warn(e);
    myCerts = [];
  }
  renderOwnerWallet(user);
});
