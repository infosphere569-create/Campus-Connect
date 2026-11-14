// Core helpers shared by every Hackathons page: auth, geo, ranking, Firestore data layer.
import { auth, db, storage, functions } from '../firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import * as FS from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { ref as sRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { ensureProfile } from '../auth.js';
import { isSameInstitution } from '../utils.js';

export { auth, db, FS, isSameInstitution };

export const COURSES = ['B.Tech / B.E.', 'BCA', 'B.Sc', 'B.Com', 'BBA', 'B.A.', 'M.Tech / M.E.', 'MCA', 'M.Sc', 'MBA', 'Diploma', 'Class 11-12', 'Other'];
export const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Final year', 'Passed out'];

export async function checkBannedEmail(email){
  const em = String(email || '').trim().toLowerCase();
  if(!em) return null;
  try {
    const s = await FS.getDoc(FS.doc(db, 'hkBannedEmails', em));
    if(s.exists() && s.data()?.banned) return { email: em, ...s.data() };
  } catch {}
  return null;
}

/* ---------------- tiny DOM / format helpers ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (v = '') => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
export const icons = () => window.lucide?.createIcons?.();
export function safeUrl(u = ''){
  const s = String(u || '').trim();
  return /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i.test(s) ? s : '';
}
export const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
export const fmtDate = ms => ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms)) : '—';
export const fmtDT = ms => ms ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : '—';
export function dateRange(a, b){
  if(!a) return 'Dates TBA';
  const f = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
  return !b || f.format(new Date(a)) === f.format(new Date(b)) ? f.format(new Date(a)) : `${f.format(new Date(a))} – ${f.format(new Date(b))}`;
}
export function ago(ms){
  const s = Math.floor((Date.now() - ms) / 1000);
  if(!Number.isFinite(s) || s < 0) return 'just now';
  if(s < 60) return 'just now'; if(s < 3600) return `${Math.floor(s / 60)}m ago`;
  if(s < 86400) return `${Math.floor(s / 3600)}h ago`; if(s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(ms);
}
export const toLocalInput = ms => { if(!ms) return ''; const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = v => v ? new Date(v).getTime() : 0;
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export function toast(msg, type = 'success'){
  let wrap = $('.hk-toasts');
  if(!wrap){ wrap = document.createElement('div'); wrap.className = 'hk-toasts'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `hk-toast ${type}`;
  el.innerHTML = `<i data-lucide="${type === 'error' ? 'circle-alert' : type === 'info' ? 'info' : 'circle-check'}"></i><span>${esc(msg)}</span>`;
  wrap.appendChild(el); icons();
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.onclick = kill; setTimeout(kill, 4200);
}

export function modal(title, html, { wide = false, onMount } = {}){
  const b = document.createElement('div');
  b.className = 'hk-modal-b';
  b.innerHTML = `<div class="hk-modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hk-modal-h"><h3>${esc(title)}</h3><button class="hk-btn icon ghost" data-x aria-label="Close"><i data-lucide="x"></i></button></div><div data-body>${html}</div></div>`;
  const close = () => { b.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if(e.key === 'Escape') close(); };
  b.addEventListener('mousedown', e => { if(e.target === b) close(); });
  b.querySelector('[data-x]').onclick = close;
  document.addEventListener('keydown', esc_);
  document.body.appendChild(b); document.body.style.overflow = 'hidden'; icons();
  onMount?.(b, close);
  return { el: b, close };
}

export function csv(filename, rows){
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- theme (shares the main site's key) ---------------- */
export function initTheme(){
  const apply = () => {
    const v = localStorage.getItem('cc-theme') || 'system';
    document.documentElement.dataset.theme = v === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : v;
  };
  apply(); matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
  return () => {
    const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cc-theme', cur); apply();
  };
}

/* ---------------- auth + profiles ---------------- */
export const isStaff = site => ['platformAdmin', 'moderator'].includes(site?.role);
export const isAdminUser = site => site?.role === 'platformAdmin';

async function safeGetDoc(ref){
  try { return await FS.getDoc(ref); }
  catch (e) {
    try { return await FS.getDocFromCache(ref); } catch {}
    throw e;
  }
}
async function safeGetDocs(q){
  try { return await FS.getDocs(q); }
  catch (e) {
    try { return await FS.getDocsFromCache(q); } catch {}
    throw e;
  }
}

// cb(user|null, { site, hk })  — site = main-site users/{uid} doc, hk = hkProfiles/{uid} doc
export function watchUser(cb){
  return onAuthStateChanged(auth, async user => {
    if(!user) return cb(null, {});
    let site = null, hk = null;
    try { site = await ensureProfile(user); } catch(e){ console.warn('site profile', e); }
    try { const s = await safeGetDoc(FS.doc(db, 'hkProfiles', user.uid)); hk = s.exists() ? { uid: user.uid, ...s.data() } : null; } catch(e){ console.warn('hk profile', e); }
    cb(user, { site, hk });
  });
}

export async function ensureHkProfile(user, site, role, extra = {}){
  const rf = FS.doc(db, 'hkProfiles', user.uid);
  const snap = await safeGetDoc(rf);
  if(!snap.exists()){
    const data = {
      uid: user.uid, displayName: extra.displayName || user.displayName || site?.displayName || '', email: user.email || '',
      photoURL: user.photoURL || site?.photoURL || '', college: extra.college || site?.college || '', city: extra.city || '',
      course: site?.course || '', branch: site?.branch || '', year: site?.year || '', bio: site?.bio || '',
      github: site?.githubURL || '', linkedin: site?.linkedinURL || '', portfolio: site?.websiteURL || '',
      phone: '', org: '', roles: [role], activeRole: role, hostVerified: false, hostBlocked: false, onboarded: false, hostOnboarded: false,
      createdAtMs: Date.now(), createdAt: FS.serverTimestamp(), updatedAt: FS.serverTimestamp()
    };
    await FS.setDoc(rf, data);
    return data;
  }
  const cur = snap.data();
  const roles = [...new Set([...(cur.roles || []), role])];
  await FS.updateDoc(rf, { roles, activeRole: role, updatedAt: FS.serverTimestamp() });
  return { uid: user.uid, ...cur, roles, activeRole: role };
}
export const updateHkProfile = (uid, patch) => FS.updateDoc(FS.doc(db, 'hkProfiles', uid), { ...patch, updatedAt: FS.serverTimestamp() });
export async function fetchParticipantProfile(uid){
  if(!uid) return null;
  try {
    const s = await safeGetDoc(FS.doc(db, 'hkProfiles', uid));
    return s.exists() ? { uid: s.id, ...s.data() } : null;
  } catch { return null; }
}

/* ---------------- geo ---------------- */
export const CITIES = {
  'Delhi':[28.6139,77.2090,'Delhi'],'Noida':[28.5355,77.3910,'Uttar Pradesh'],'Gurugram':[28.4595,77.0266,'Haryana'],'Ghaziabad':[28.6692,77.4538,'Uttar Pradesh'],
  'Mumbai':[19.0760,72.8777,'Maharashtra'],'Pune':[18.5204,73.8567,'Maharashtra'],'Nagpur':[21.1458,79.0882,'Maharashtra'],'Nashik':[19.9975,73.7898,'Maharashtra'],
  'Bengaluru':[12.9716,77.5946,'Karnataka'],'Mysuru':[12.2958,76.6394,'Karnataka'],'Hyderabad':[17.3850,78.4867,'Telangana'],'Warangal':[17.9689,79.5941,'Telangana'],
  'Chennai':[13.0827,80.2707,'Tamil Nadu'],'Coimbatore':[11.0168,76.9558,'Tamil Nadu'],'Madurai':[9.9252,78.1198,'Tamil Nadu'],'Kochi':[9.9312,76.2673,'Kerala'],'Thiruvananthapuram':[8.5241,76.9366,'Kerala'],
  'Kolkata':[22.5726,88.3639,'West Bengal'],'Durgapur':[23.5204,87.3119,'West Bengal'],'Bhubaneswar':[20.2961,85.8245,'Odisha'],'Guwahati':[26.1445,91.7362,'Assam'],
  'Patna':[25.5941,85.1376,'Bihar'],'Ranchi':[23.3441,85.3096,'Jharkhand'],'Lucknow':[26.8467,80.9462,'Uttar Pradesh'],'Kanpur':[26.4499,80.3319,'Uttar Pradesh'],
  'Prayagraj':[25.4358,81.8463,'Uttar Pradesh'],'Varanasi':[25.3176,82.9739,'Uttar Pradesh'],'Agra':[27.1767,78.0081,'Uttar Pradesh'],'Meerut':[28.9845,77.7064,'Uttar Pradesh'],'Gorakhpur':[26.7606,83.3732,'Uttar Pradesh'],
  'Jaipur':[26.9124,75.7873,'Rajasthan'],'Kota':[25.2138,75.8648,'Rajasthan'],'Jodhpur':[26.2389,73.0243,'Rajasthan'],'Udaipur':[24.5854,73.7125,'Rajasthan'],
  'Ahmedabad':[23.0225,72.5714,'Gujarat'],'Surat':[21.1702,72.8311,'Gujarat'],'Vadodara':[22.3072,73.1812,'Gujarat'],'Indore':[22.7196,75.8577,'Madhya Pradesh'],'Bhopal':[23.2599,77.4126,'Madhya Pradesh'],
  'Chandigarh':[30.7333,76.7794,'Chandigarh'],'Ludhiana':[30.9010,75.8573,'Punjab'],'Amritsar':[31.6340,74.8723,'Punjab'],'Dehradun':[30.3165,78.0322,'Uttarakhand'],'Roorkee':[29.8543,77.8880,'Uttarakhand'],
  'Raipur':[21.2514,81.6296,'Chhattisgarh'],'Visakhapatnam':[17.6868,83.2185,'Andhra Pradesh'],'Vijayawada':[16.5062,80.6480,'Andhra Pradesh'],'Goa':[15.4909,73.8278,'Goa'],'Srinagar':[34.0837,74.7973,'Jammu & Kashmir'],'Jammu':[32.7266,74.8570,'Jammu & Kashmir']
};
export function findCity(name = ''){
  const n = String(name).trim().toLowerCase(); if(!n) return null;
  const k = Object.keys(CITIES).find(c => c.toLowerCase() === n) || Object.keys(CITIES).find(c => n.includes(c.toLowerCase()) || c.toLowerCase().includes(n));
  return k ? { city: k, lat: CITIES[k][0], lng: CITIES[k][1], state: CITIES[k][2] } : null;
}
export function haversine(a, b){
  if(!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
  const R = 6371, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
export const fmtKm = d => d == null ? '' : d < 1 ? '<1 km' : d < 100 ? `${d.toFixed(d < 10 ? 1 : 0)} km` : `${Math.round(d)} km`;
function nearestKnownCity(p){
  let best = null, bd = 1e9;
  for(const [c, v] of Object.entries(CITIES)){ const d = haversine(p, { lat: v[0], lng: v[1] }); if(d < bd){ bd = d; best = c; } }
  return bd < 90 ? { city: best, state: CITIES[best][2] } : null;
}
async function reverseGeocode(p){
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${p.lat}&longitude=${p.lng}&localityLanguage=en`);
    if(r.ok){ const j = await r.json(); const city = j.city || j.locality || ''; if(city) return { city, state: j.principalSubdivision || '' }; }
  } catch {}
  return nearestKnownCity(p) || { city: 'Your area', state: '' };
}
export async function forwardGeocode(q){
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
    if(r.ok){ const j = await r.json(); if(j[0]) return { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name }; }
  } catch {}
  return null;
}
const GEO_KEY = 'hk-geo';
export function cachedLocation(){
  try { const g = JSON.parse(localStorage.getItem(GEO_KEY) || 'null'); return g && g.lat != null ? g : null; } catch { return null; }
}
export function saveLocation(g){ try { localStorage.setItem(GEO_KEY, JSON.stringify({ ...g, ts: Date.now() })); } catch {} return g; }
export function locateGps(){
  return new Promise((res, rej) => {
    if(!navigator.geolocation) return rej(new Error('Location is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(async pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      const place = await reverseGeocode(p);
      res(saveLocation({ ...p, ...place, source: 'gps' }));
    }, err => rej(new Error(err.code === 1 ? 'Location permission denied. Pick your city manually.' : 'Could not detect your location.')),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}
export const locateCity = name => { const c = findCity(name); return c ? saveLocation({ lat: c.lat, lng: c.lng, city: c.city, state: c.state, source: 'manual' }) : null; };

/* ---------------- hackathon logic ---------------- */
export function phase(h, now = Date.now()){
  if(h.status === 'closed') return { key: 'closed', label: 'Closed', tone: 'bad' };
  if(h.endMs && now > h.endMs) return { key: 'ended', label: 'Ended', tone: 'neutral' };
  if(h.startMs && now >= h.startMs) return { key: 'live', label: 'Live now', tone: 'gold' };
  if(h.registrationClosed || (h.regDeadlineMs && now > h.regDeadlineMs)) return { key: 'regclosed', label: 'Registration closed', tone: 'warn' };
  if(h.maxParticipants && (h.regCount || 0) >= h.maxParticipants) return { key: 'full', label: 'Full', tone: 'warn' };
  if(h.regDeadlineMs && h.regDeadlineMs - now < 3 * 864e5) return { key: 'closing', label: 'Closing soon', tone: 'warn' };
  return { key: 'open', label: 'Registration open', tone: '' };
}
export const canRegister = h => ['open', 'closing'].includes(phase(h).key) && h.status === 'approved';
export const sameCampus = (h, college) => !!college && !!h.college && isSameInstitution(college, h.college);
export function trendScore(h, ctx = {}){
  const now = Date.now(), reg = h.regCount || 0;
  let s = reg * 2 + (h.featured ? 40 : 0);
  if(h.startMs){ const d = (h.startMs - now) / 864e5; if(d >= 0 && d <= 45) s += (45 - d) * 1.4; if(d < 0 && h.endMs > now) s += 30; if(h.endMs && now > h.endMs) s -= 200; }
  if(h.createdAtMs && now - h.createdAtMs < 7 * 864e5) s += 12;
  if(ctx.college && sameCampus(h, ctx.college)) s += 15;
  if(h.maxParticipants) s += Math.min(20, (reg / h.maxParticipants) * 20);
  return s;
}
export function enrich(list, { loc, college } = {}){
  return list.map(h => ({
    ...h, _dist: loc ? haversine(loc, { lat: h.lat, lng: h.lng }) : null,
    _campus: sameCampus(h, college), _phase: phase(h), _trend: trendScore(h, { college })
  }));
}

/* ---------------- images ---------------- */
function loadImg(file){
  return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { res(i); URL.revokeObjectURL(u); }; i.onerror = () => rej(new Error('That file is not a valid image.')); i.src = u; });
}
async function shrink(file, maxW, q, ratio){
  const img = await loadImg(file);
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if(ratio){ const r = sw / sh; if(r > ratio){ const nw = sh * ratio; sx = (sw - nw) / 2; sw = nw; } else { const nh = sw / ratio; sy = (sh - nh) / 2; sh = nh; } }
  const scale = Math.min(1, maxW / sw), cw = Math.round(sw * scale), ch = Math.round(sh * scale);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, dataUrl: c.toDataURL('image/jpeg', Math.max(.5, q - .15)) };
}
const CLOUDINARY_CLOUD_NAME = 'bqwj7eos';
const CLOUDINARY_UPLOAD_PRESET = 'campus_connect_unsigned';

// Uploads to Cloudinary (same secure profile photo upload logic), with progress reporting, Firebase Storage, and inline fallbacks.
export async function uploadImage(file, pathOrOpts, onProgress){
  if(!file || !/^image\//.test(file.type)) throw new Error('Please choose an image file (JPG, PNG or WebP).');
  if(file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB.');
  
  let kind = 'thumb';
  if(typeof pathOrOpts === 'object' && pathOrOpts !== null){
    kind = pathOrOpts.kind || 'thumb';
  } else if(typeof pathOrOpts === 'string' && pathOrOpts.includes('banner')) {
    kind = 'banner';
  }
  
  const cfg = kind === 'banner' ? { w: 1600, q: .82, ratio: 16 / 6 } : { w: 720, q: .8, ratio: 4 / 3 };
  const { blob } = await shrink(file, cfg.w, cfg.q, cfg.ratio);
  onProgress?.(15);
  
  try {
    const body = new FormData();
    body.append('file', blob);
    body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    body.append('folder', 'campus-connect');
    onProgress?.(45);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body });
    const data = await res.json();
    if(res.ok && (data.secure_url || data.url)) {
      onProgress?.(100);
      return data.secure_url || data.url;
    }
  } catch(clErr) {
    console.warn('Cloudinary upload fallback:', clErr);
  }
  
  onProgress?.(70);
  try {
    const pathStr = typeof pathOrOpts === 'string' ? pathOrOpts : `hackathons/${pathOrOpts?.uid || 'demo'}/${pathOrOpts?.hid || 'hack'}/${kind}-${Date.now()}.jpg`;
    const r = sRef(storage, pathStr);
    await uploadBytes(r, blob, { contentType: 'image/jpeg' });
    onProgress?.(100);
    return await getDownloadURL(r);
  } catch(e){
    console.warn('Storage upload failed, using inline fallback', e);
    const small = await shrink(file, kind === 'banner' ? 1100 : 520, .62, cfg.ratio);
    if(small.dataUrl.length > 330000) throw new Error('Image could not be uploaded. Try a smaller image.');
    onProgress?.(100);
    return small.dataUrl;
  }
}

/* ---------------- data layer & co-host collaboration ---------------- */
const mapDocs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
export function isHackHost(h, user){
  if(!h || !user) return false;
  if(h.hostUid === user.uid) return true;
  if(Array.isArray(h.coHostUids) && h.coHostUids.includes(user.uid)) return true;
  const em = (user.email || '').trim().toLowerCase();
  return !!(em && Array.isArray(h.coHostEmails) && h.coHostEmails.includes(em));
}
export const coHostInviteUrl = id => `${location.origin}/login-hackthons.html?role=host&invite=${encodeURIComponent(id)}`;
export async function updateCoHosts(hid, { coHostEmails, coHostUids }){
  const patch = { updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() };
  if(Array.isArray(coHostEmails)) patch.coHostEmails = [...new Set(coHostEmails.map(x => String(x).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  if(Array.isArray(coHostUids)) patch.coHostUids = [...new Set(coHostUids.filter(Boolean))];
  await FS.updateDoc(FS.doc(db, 'hkHackathons', hid), patch);
}
export async function claimCoHost(hid, user){
  if(!hid || !user?.uid) return { ok: false, reason: 'invalid' };
  const h = await fetchOne(hid);
  if(!h) return { ok: false, reason: 'not-found' };
  if(h.hostUid === user.uid) return { ok: true, alreadyOwner: true, h };
  const em = (user.email || '').trim().toLowerCase();
  const emails = Array.isArray(h.coHostEmails) ? h.coHostEmails.map(x => String(x).toLowerCase()) : [];
  const uids = Array.isArray(h.coHostUids) ? h.coHostUids : [];
  if(!emails.includes(em) && !uids.includes(user.uid)) return { ok: false, reason: 'not-invited', h };
  if(!uids.includes(user.uid)){
    await FS.updateDoc(FS.doc(db, 'hkHackathons', hid), {
      coHostUids: FS.arrayUnion(user.uid),
      updatedAtMs: Date.now(),
      updatedAt: FS.serverTimestamp()
    });
  }
  return { ok: true, h };
}
export async function fetchApproved(){ return mapDocs(await safeGetDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('status', '==', 'approved'), FS.limit(300)))); }
export async function fetchMine(uid, email = ''){
  const em = String(email || '').trim().toLowerCase();
  const jobs = [
    safeGetDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('hostUid', '==', uid), FS.limit(200))).then(mapDocs).catch(() => []),
    safeGetDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('coHostUids', 'array-contains', uid), FS.limit(100))).then(mapDocs).catch(() => [])
  ];
  if(em){
    jobs.push(safeGetDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('coHostEmails', 'array-contains', em), FS.limit(100))).then(mapDocs).catch(() => []));
  }
  const lists = await Promise.all(jobs);
  const byId = new Map();
  lists.flat().forEach(h => {
    if(!byId.has(h.id)) byId.set(h.id, { ...h, _shared: h.hostUid !== uid });
  });
  return [...byId.values()].sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
}
export async function fetchAll(){ return mapDocs(await safeGetDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.limit(500)))); }
export async function fetchOne(id){ const s = await safeGetDoc(FS.doc(db, 'hkHackathons', id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export const newId = () => FS.doc(FS.collection(db, 'hkHackathons')).id;

export async function saveHackathon(h, user, hk){
  const { id, _shared, _dist, _campus, _phase, _trend, ...rest } = h;
  const rf = FS.doc(db, 'hkHackathons', id);
  const ex = await safeGetDoc(rf);
  const hostPhoto = hk?.photoURL || user?.photoURL || '';
  const hostDisplay = hk?.organiserName || hk?.displayName || user.displayName || '';
  const hostMail = hk?.orgEmail || user.email || '';
  const bannerImg = (rest.bannerURL || rest.thumbURL || '').trim();
  const thumbImg = (rest.thumbURL || rest.bannerURL || '').trim();
  if(!ex.exists()){
    const data = {
      ...rest,
      bannerURL: bannerImg,
      thumbURL: thumbImg,
      hostUid: user.uid,
      hostName: hk?.org || hostDisplay || 'Host',
      hostDisplayName: hostDisplay,
      hostEmail: hostMail,
      hostPhotoURL: hostPhoto,
      hostVerified: !!hk?.hostVerified,
      coHostEmails: Array.isArray(rest.coHostEmails) ? rest.coHostEmails : [],
      coHostUids: [],
      organiser: { name: hostDisplay, designation: hk?.designation || '', org: hk?.org || '', type: hk?.orgType || '', email: hostMail, phone: hk?.orgPhone || hk?.phone || '', photoURL: hostPhoto },
      regCount: 0,
      featured: false,
      autoEmail: rest.autoEmail !== false,
      createdAtMs: Date.now(),
      createdAt: FS.serverTimestamp(),
      updatedAtMs: Date.now(),
      updatedAt: FS.serverTimestamp()
    };
    await FS.setDoc(rf, data);
  } else {
    const existing = ex.data();
    const isOwner = existing.hostUid === user.uid;
    const data = {
      ...rest,
      bannerURL: bannerImg,
      thumbURL: thumbImg,
      hostUid: existing.hostUid,
      hostName: existing.hostName || hk?.org || hostDisplay || 'Host',
      hostDisplayName: existing.hostDisplayName || (isOwner ? hostDisplay : '') || existing.organiser?.name || '',
      hostEmail: existing.hostEmail || (isOwner ? hostMail : '') || existing.organiser?.email || '',
      hostPhotoURL: (isOwner && hostPhoto ? hostPhoto : existing.hostPhotoURL) || existing.organiser?.photoURL || '',
      hostVerified: !!existing.hostVerified,
      organiser: existing.organiser || { name: hostDisplay, designation: hk?.designation || '', org: hk?.org || '', type: hk?.orgType || '', email: hostMail, phone: hk?.orgPhone || hk?.phone || '', photoURL: hostPhoto },
      updatedAtMs: Date.now(),
      updatedAt: FS.serverTimestamp()
    };
    delete data.featured;
    delete data.regCount;
    delete data.createdAtMs;
    delete data.coHostEmails;
    delete data.coHostUids;
    await FS.updateDoc(rf, data);
  }
  return id;
}
export const deleteHackathon = id => FS.deleteDoc(FS.doc(db, 'hkHackathons', id));

export function validateForSubmit(h){
  const e = [], need = (ok, step, msg) => { if(!ok) e.push({ step, msg }); };
  need((h.title || '').trim().length >= 6, 1, 'Add a clear title (6+ characters)');
  need((h.tagline || '').trim().length >= 10, 1, 'Add a one-line tagline (10+ characters)');
  need(!!(h.bannerURL || h.thumbURL), 1, 'Upload a banner or thumbnail image');
  need(!!(h.brandName || '').trim(), 1, 'Add the organising brand / club name');
  need((h.description || '').trim().length >= 80, 2, 'Describe the hackathon (80+ characters)');
  need((h.rules || '').trim().length >= 20, 2, 'Add rules & eligibility');
  need(+h.teamMin >= 1 && +h.teamMax >= +h.teamMin, 2, 'Team size: max must be ≥ min (min 1)');
  need(!!(h.college || '').trim(), 3, 'Add the host college / institute');
  need(!!(h.city || '').trim(), 3, 'Add the city');
  need(h.lat != null && h.lng != null, 3, 'Locate the venue so nearby students can find it');
  need(h.startMs && h.endMs && h.endMs > h.startMs, 3, 'Set valid start and end dates');
  need(h.regDeadlineMs && h.startMs && h.regDeadlineMs <= h.startMs, 3, 'Registration deadline must be on/before the start');
  need(h.startMs > Date.now(), 3, 'Start date must be in the future');
  need(/^\S+@\S+\.\S+$/.test(h.contactEmail || h.hostEmail || h.organiser?.email || ''), 5, 'Add a valid contact email');
  need((h.rounds || []).every(r => !r.name || (r.startMs ? r.endMs > r.startMs : true)), 4, 'Each round must end after it starts');
  need(!(h.submission?.open) || (h.submission?.deadlineMs > 0), 4, 'Set a project submission deadline (or switch submissions off)');
  need(!!h.agree, 6, 'Confirm the host declaration');
  return e;
}

export async function submitForApproval(h, user, hk){
  const errs = validateForSubmit(h);
  if(errs.length) throw Object.assign(new Error('Complete the highlighted items first.'), { errs });
  await saveHackathon({ ...h, status: 'pending', adminNote: '', submittedAtMs: Date.now() }, user, hk);
}

export async function myRegistrations(uid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkRegistrations'), FS.where('uid', '==', uid), FS.limit(200)))).sort((a, b) => b.createdAtMs - a.createdAtMs); }
export function watchMyRegistrations(uid, cb){
  return FS.onSnapshot(FS.query(FS.collection(db, 'hkRegistrations'), FS.where('uid', '==', uid), FS.limit(200)),
    s => cb(mapDocs(s).sort((a, b) => b.createdAtMs - a.createdAtMs)), e => { console.warn('myRegistrations', e); cb([]); });
}
export async function hackathonRegistrations(hid, hostUid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkRegistrations'), FS.where('hackathonId', '==', hid), FS.where('hostUid', '==', hostUid), FS.limit(1000)))).sort((a, b) => b.createdAtMs - a.createdAtMs); }
export async function allRegistrations(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkRegistrations'), FS.limit(1500)))); }
export async function allSubmissions(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkSubmissions'), FS.limit(1500)))); }
export async function allAttempts(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkAttempts'), FS.limit(1500)))); }

export async function registerFor(h, user, d){
  const rid = `${h.id}_${user.uid}`, rr = FS.doc(db, 'hkRegistrations', rid), hr = FS.doc(db, 'hkHackathons', h.id);
  await FS.runTransaction(db, async tx => {
    const [rs, hs] = await Promise.all([tx.get(rr), tx.get(hr)]);
    if(rs.exists()) throw new Error('You are already registered for this hackathon.');
    const cur = hs.data();
    if(!cur || cur.status !== 'approved') throw new Error('This hackathon is not open.');
    if(!canRegister({ ...cur, id: h.id })) throw new Error('Registration is closed for this hackathon.');
    tx.set(rr, { ...d, hackathonId: h.id, hackathonTitle: cur.title, hostUid: cur.hostUid, uid: user.uid, status: 'registered', stage: 0, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() });
    tx.update(hr, { regCount: (cur.regCount || 0) + 1 });
  });
  notify({ toUid: h.hostUid, fromUid: user.uid, hackathonId: h.id, type: 'registration', title: 'New registration', body: `${d.name} registered for ${h.title}.` }).catch(() => {});
}
export async function cancelRegistration(h, user){
  const rr = FS.doc(db, 'hkRegistrations', `${h.id}_${user.uid}`), hr = FS.doc(db, 'hkHackathons', h.id);
  await FS.runTransaction(db, async tx => {
    const [rs, hs] = await Promise.all([tx.get(rr), tx.get(hr)]);
    if(!rs.exists()) return;
    tx.delete(rr);
    const c = hs.exists() ? (hs.data().regCount || 0) : 0;
    if(hs.exists() && c > 0) tx.update(hr, { regCount: c - 1 });
  });
}

export async function notify({ toUid, fromUid, hackathonId = '', type = 'info', title, body }){
  return FS.addDoc(FS.collection(db, 'hkNotifications'), { toUid, fromUid, hackathonId, type, title, body, read: false, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() });
}
export function watchNotifications(uid, cb){
  return FS.onSnapshot(FS.query(FS.collection(db, 'hkNotifications'), FS.where('toUid', '==', uid), FS.limit(80)),
    s => cb(mapDocs(s).sort((a, b) => b.createdAtMs - a.createdAtMs)), e => { console.warn('notifications', e); cb([]); });
}
export const markRead = id => FS.updateDoc(FS.doc(db, 'hkNotifications', id), { read: true });

export async function audit(by, action, target, extra = {}){
  try {
    const u = auth.currentUser;
    await FS.addDoc(FS.collection(db, 'auditLogs'), {
      scope: 'hackathons',
      action,
      target,
      by,
      byEmail: extra.byEmail || u?.email || '',
      byName: extra.byName || u?.displayName || '',
      ...extra,
      createdAtMs: Date.now(),
      createdAt: FS.serverTimestamp()
    });
  } catch(e){ console.warn('audit', e); }
}

/* ---------------- Sub-admin delegation ---------------- */
export const SUBADMIN_PERMS = [
  { key: 'approve', label: 'Approve & Decisions', desc: 'Approve, reject, or request changes on pending hackathons', icon: 'badge-check' },
  { key: 'view_delete', label: 'Inspection & Delete', desc: 'Inspect registrations, tests, host view workspace, and delete hackathons', icon: 'trash-2' },
  { key: 'edit_hackathon', label: 'Edit Hackathons', desc: 'Modify hackathon wizard, details, schedule, rounds, and submission rules', icon: 'pencil' },
  { key: 'ban_unban', label: 'Ban & Unban Users', desc: 'Ban or unban hosts and participants, restrict platform registration', icon: 'shield-alert' },
  { key: 'edit_profile', label: 'Edit Profiles', desc: 'Modify host or participant profile and contact details', icon: 'user' }
];

export async function fetchSubAdmins(){
  return mapDocs(await safeGetDocs(FS.query(FS.collection(db, 'hkSubAdmins'), FS.limit(200)))).sort((a, b) => (b.grantedAtMs || 0) - (a.grantedAtMs || 0));
}

export async function fetchSubAdmin(uid){
  if(!uid) return null;
  try {
    const s = await safeGetDoc(FS.doc(db, 'hkSubAdmins', uid));
    return s.exists() ? { uid: s.id, ...s.data() } : null;
  } catch { return null; }
}

export async function saveSubAdmin(uid, data){
  const rf = FS.doc(db, 'hkSubAdmins', uid);
  await FS.setDoc(rf, {
    ...data,
    uid,
    updatedAtMs: Date.now(),
    updatedAt: FS.serverTimestamp()
  }, { merge: true });
}

export async function deleteSubAdmin(uid){
  await FS.deleteDoc(FS.doc(db, 'hkSubAdmins', uid));
}

export async function searchPlatformUsers(term, cachedProfiles = []){
  const q = String(term || '').trim().toLowerCase();
  if(!q) return [];
  const map = new Map();
  (cachedProfiles || []).forEach(p => {
    const email = (p.email || p.orgEmail || '').toLowerCase();
    const name = (p.displayName || p.organiserName || '').toLowerCase();
    if(email.includes(q) || name.includes(q)){
      map.set(p.uid || p.id, {
        uid: p.uid || p.id,
        displayName: p.displayName || p.organiserName || 'User',
        email: p.email || p.orgEmail || '',
        photoURL: p.photoURL || '',
        college: p.college || '',
        role: Array.isArray(p.roles) ? p.roles.join(', ') : (p.role || 'User')
      });
    }
  });
  try {
    const snap = await safeGetDocs(FS.query(FS.collection(db, 'users'), FS.limit(100)));
    snap.docs.forEach(d => {
      const u = d.data();
      const email = (u.email || '').toLowerCase();
      const name = (u.displayName || '').toLowerCase();
      if(email.includes(q) || name.includes(q)){
        const uid = d.id;
        const ex = map.get(uid);
        map.set(uid, {
          uid,
          displayName: u.displayName || ex?.displayName || 'User',
          email: u.email || ex?.email || '',
          photoURL: u.photoURL || ex?.photoURL || '',
          college: u.college || ex?.college || '',
          role: u.role || ex?.role || 'student'
        });
      }
    });
  } catch(e) { console.warn('search users error', e); }
  return [...map.values()].slice(0, 20);
}


/* ---------------- profile completeness (forms shown right after login) ---------------- */
export const participantComplete = p => !!(p && p.onboarded && (p.displayName || '').trim() && /^[6-9]\d{9}$/.test(String(p.phone || '').replace(/\D/g, '').slice(-10)) && p.college && p.course && p.year && p.city);
export const hostComplete = p => !!(p && p.hostOnboarded && (p.organiserName || '').trim() && (p.org || '').trim() && p.orgType && /^\S+@\S+\.\S+$/.test(p.orgEmail || '') && String(p.orgPhone || '').replace(/\D/g, '').length >= 10);

/* ---------------- backend callables ---------------- */
export async function callFn(name, data){
  if(!functions) throw new Error('Backend is not available.');
  try { return (await httpsCallable(functions, name)(data || {})).data; }
  catch(e){
    const m = String(e?.message || '');
    if(/not-found|NOT_FOUND|404|CORS|Failed to fetch|unavailable/i.test(e?.code + ' ' + m) && /function|fetch|cors|404/i.test(m + e?.code)) throw new Error('The email / test service is not deployed yet. Ask the admin to deploy Cloud Functions (see HACKATHONS.md).');
    throw new Error(m.replace(/^.*?:\s*/, '') || 'Request failed.');
  }
}
export const MAIL_KINDS = {
  registration_confirmation: 'Registration confirmed', shortlisted: 'Shortlisted / moved to next round', selected: 'Selected (finalist / winner)', waitlisted: 'Waitlisted',
  rejected: 'Not selected', submission_reminder: 'Reminder: submit your project', test_reminder: 'Reminder: take the test', custom: 'Custom message'
};
export const notifyTeam = (registrationId, kind, note, roundName) => callFn('hkNotifyTeam', { registrationId, kind, note, roundName });
export const publicStats = () => callFn('hkPublicStats');

/* ---------------- project submissions ---------------- */
export async function getSubmission(hid, uid){
  const s = await FS.getDoc(FS.doc(db, 'hkSubmissions', `${hid}_${uid}`));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function saveSubmission(h, user, reg, d){
  const id = `${h.id}_${user.uid}`, rf = FS.doc(db, 'hkSubmissions', id), ex = await FS.getDoc(rf);
  const body = {
    title: d.title || '',
    idea: d.idea || '',
    repoUrl: d.repoUrl || '',
    demoUrl: d.demoUrl || '',
    pptUrl: d.pptUrl || '',
    videoUrl: d.videoUrl || '',
    introVideoUrl: d.introVideoUrl || '',
    extraUrl: d.extraUrl || '',
    customAnswers: Array.isArray(d.customAnswers) ? d.customAnswers : [],
    updatedAtMs: Date.now()
  };
  if(ex.exists()) await FS.updateDoc(rf, body);
  else {
    await FS.setDoc(rf, { ...body, hackathonId: h.id, hackathonTitle: h.title, hostUid: h.hostUid, uid: user.uid, teamName: reg.teamName || '', leaderName: reg.name || '', createdAtMs: Date.now(), score: null, feedback: '', reviewStatus: 'submitted' });
    notify({ toUid: h.hostUid, fromUid: user.uid, hackathonId: h.id, type: 'submission', title: 'New project submission', body: `${reg.teamName || reg.name} submitted “${d.title}”.` }).catch(() => {});
  }
}
export async function hackathonSubmissions(hid, hostUid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkSubmissions'), FS.where('hackathonId', '==', hid), FS.where('hostUid', '==', hostUid), FS.limit(1000)))).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)); }
export const reviewSubmission = (id, patch) => FS.updateDoc(FS.doc(db, 'hkSubmissions', id), { ...patch, reviewedAtMs: Date.now() });
export const isUrl = v => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(String(v || '').trim());

/* ---------------- screening test ---------------- */
export async function getTestMeta(hid){ try { const s = await FS.getDoc(FS.doc(db, 'hkTests', hid)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch { return null; } }
export async function getTestKeys(hid){ try { const s = await FS.getDoc(FS.doc(db, 'hkTestKeys', hid)); return s.exists() ? s.data() : null; } catch { return null; } }
export async function saveTest(h, user, meta, questions){
  const ownerUid = h.hostUid || user.uid;
  const answers = {}, qs = questions.map((q, i) => { const id = q.id || 'q' + (i + 1); answers[id] = +q.correct; return { id, text: q.text.trim(), options: q.options.map(o => o.trim()), marks: +q.marks || 1 }; });
  await FS.setDoc(FS.doc(db, 'hkTestKeys', h.id), { hostUid: ownerUid, questions: qs, answers });
  await FS.setDoc(FS.doc(db, 'hkTests', h.id), { hostUid: ownerUid, hackathonId: h.id, title: meta.title, durationMin: +meta.durationMin || 30, startMs: meta.startMs || 0, endMs: meta.endMs || 0, count: qs.length, total: qs.reduce((s, q) => s + q.marks, 0), updatedAtMs: Date.now() });
}
export async function shareCoHostInvite(h){
  if(!h?.id) return false;
  const url = coHostInviteUrl(h.id);
  const title = `Co-host Invite · ${h.title || 'Hackathon'}`;
  const text = `You've been invited as a co-host for "${h.title || 'our hackathon'}" on Campus Connect One Hackathons.\nSign in as a Host with your invited Gmail to manage, edit, and review participants:`;
  try {
    if(navigator.share){
      await navigator.share({ title, text, url });
      return true;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Host invite link copied to clipboard');
    return true;
  } catch(e){
    if(e?.name === 'AbortError') return false;
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Host invite link copied'); return true; } catch { return false; }
  }
}
export async function removeTest(hid){ await FS.deleteDoc(FS.doc(db, 'hkTests', hid)); await FS.deleteDoc(FS.doc(db, 'hkTestKeys', hid)); }
export async function myAttempt(hid, uid){ try { const s = await FS.getDoc(FS.doc(db, 'hkAttempts', `${hid}_${uid}`)); return s.exists() ? s.data() : null; } catch { return null; } }
export async function hackathonAttempts(hid, hostUid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkAttempts'), FS.where('hackathonId', '==', hid), FS.where('hostUid', '==', hostUid), FS.limit(1000)))); }

/* ---------------- registrations (host side) ---------------- */
export const updateRegistration = (id, patch) => FS.updateDoc(FS.doc(db, 'hkRegistrations', id), { ...patch, updatedAtMs: Date.now() });
export const getRegistration = async (hid, uid) => { try { const s = await safeGetDoc(FS.doc(db, 'hkRegistrations', `${hid}_${uid}`)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch { return null; } };
export const roundsOf = h => (h.rounds || []).filter(r => r.name);
export const REG_STATUS = ['registered', 'shortlisted', 'selected', 'waitlisted', 'rejected'];

/* ---------------- public URLs & live countdown ---------------- */
export const publicShareUrl = id => `${location.origin}/hackathon.html?id=${encodeURIComponent(id)}`;
export function countdownText(targetMs, now = Date.now()){
  const diff = Math.max(0, Math.floor((targetMs - now) / 1000));
  if(!diff) return '0s';
  const d = Math.floor(diff / 86400), h = Math.floor((diff % 86400) / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
  const p = n => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${p(h)}h ${p(m)}m ${p(s)}s` : `${p(h)}h ${p(m)}m ${p(s)}s`;
}
export function nextMilestone(h, reg = null, now = Date.now()){
  if(!h) return null;
  const rounds = roundsOf(h);
  const curRound = reg && rounds[reg.stage || 0];
  if(curRound?.endMs && curRound.endMs > now && (!curRound.startMs || now >= curRound.startMs)){
    return { label: `${curRound.name} ends in`, targetMs: curRound.endMs };
  }
  if(curRound?.startMs && curRound.startMs > now){
    return { label: `${curRound.name} starts in`, targetMs: curRound.startMs };
  }
  if(h.submission?.open !== false && h.submission?.deadlineMs && h.submission.deadlineMs > now && (!reg || reg.status !== 'rejected')){
    return { label: 'Submission closes in', targetMs: h.submission.deadlineMs };
  }
  if(!reg && h.regDeadlineMs && h.regDeadlineMs > now && !h.registrationClosed){
    return { label: 'Registration closes in', targetMs: h.regDeadlineMs };
  }
  if(h.startMs && h.startMs > now){
    return { label: 'Starts in', targetMs: h.startMs };
  }
  if(h.endMs && h.endMs > now){
    return { label: 'Ends in', targetMs: h.endMs };
  }
  return null;
}

async function imageToShareFile(imgUrl, slug){
  try {
    if(!imgUrl || imgUrl.startsWith('data:image/')) {
      // If it's already a data URL or missing, handle directly
      if(imgUrl && imgUrl.startsWith('data:image/')) {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        return new File([blob], `${slug}.jpg`, { type: 'image/jpeg' });
      }
      return null;
    }
    const res = await fetch(imgUrl, { mode: 'cors' });
    if(!res.ok) return null;
    const blob = await res.blob();
    if(['image/jpeg', 'image/png'].includes(blob.type)){
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      return new File([blob], `${slug}.${ext}`, { type: blob.type });
    }
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = objUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 1200;
      canvas.height = img.naturalHeight || img.height || 630;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpgBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      if(jpgBlob) return new File([jpgBlob], `${slug}.jpg`, { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(objUrl);
    }
    return new File([blob], `${slug}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null;
  }
}

function createDefaultHackathonBannerDataUrl(title, subtitle){
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    
    const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#312e81');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1200, 630);
    
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    ctx.beginPath();
    ctx.arc(1050, 100, 250, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(14, 165, 233, 0.1)';
    ctx.beginPath();
    ctx.arc(150, 530, 300, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(80, 80, 360, 48, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#818cf8';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('⚡ CAMPUS CONNECT ONE HACKATHON', 110, 112);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px system-ui, -apple-system, sans-serif';
    let words = (title || 'Hackathon Event').split(' ');
    let line = '';
    let y = 220;
    let lines = [];
    for(let i = 0; i < words.length; i++) {
      let testLine = line + words[i] + ' ';
      let metrics = ctx.measureText(testLine);
      if(metrics.width > 1040 && i > 0) {
        lines.push(line);
        line = words[i] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    lines.slice(0, 3).forEach((l, idx) => {
      ctx.fillText(l.trim(), 80, y + (idx * 68));
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px system-ui, -apple-system, sans-serif';
    ctx.fillText(subtitle || 'Official Hackathon Portal', 80, 470);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(80, 520, 1040, 2);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillText('🚀 Register Now · Build, Innovate & Win Exciting Prizes', 80, 565);

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return '';
  }
}

export async function shareHackathon(h, role = 'participant'){
  if(!h || !h.id) return false;
  const url = publicShareUrl(h.id);
  const title = h.title || 'Hackathon on Campus Connect One';
  const slug = title.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'hackathon';
  const where = h.mode === 'online' ? '🌐 Online' : `📍 ${[h.college, h.city].filter(Boolean).join(', ') || 'Campus Venue'}`;
  const when = dateRange(h.startMs, h.endMs);
  const prize = h.prizePool ? `🏆 Prize Pool: ${money(h.prizePool)}` : '🏆 Exciting Prizes, Perks & Swag';
  const organizer = h.hostName ? `🏢 Organized by: ${h.hostName}` : (h.college ? `🏢 Organized by: ${h.college}` : '🏢 Organized via Campus Connect One');
  const tagline = h.tagline ? `✨ "${h.tagline}"` : '';
  
  const lead = role === 'host'
    ? `🚀 We're hosting ${title} on Campus Connect One!`
    : `🚀 Join & participate in ${title} on Campus Connect One!`;
  
  const cta = role === 'host'
    ? '📌 Explore tracks, schedule, submissions & register your team here:'
    : '📌 View full hackathon details, schedule, tracks & register here:';

  const textBody = [
    lead,
    tagline,
    organizer,
    `📅 Date: ${when}`,
    where,
    prize,
    '',
    cta
  ].filter(Boolean).join('\n');

  const fullText = `${textBody}\n${url}`;
  
  let imgUrl = safeUrl(h.bannerURL || h.thumbURL) || safeUrl(h.thumbURL);
  if(!imgUrl){
    imgUrl = createDefaultHackathonBannerDataUrl(title, h.college || h.hostName || 'Campus Connect One');
  }

  try {
    if(navigator.share){
      const file = await imageToShareFile(imgUrl, slug);
      if(file && navigator.canShare){
        const withUrl = { title, text: fullText, url, files: [file] };
        if(navigator.canShare(withUrl)){
          await navigator.share(withUrl);
          return true;
        }
        const textOnlyWithFile = { title, text: fullText, files: [file] };
        if(navigator.canShare(textOnlyWithFile)){
          await navigator.share(textOnlyWithFile);
          return true;
        }
      }
      await navigator.share({ title, text: textBody, url });
      return true;
    }
    await navigator.clipboard.writeText(fullText);
    toast('Professional event details & link copied to clipboard!');
    return true;
  } catch(e){
    if(e?.name === 'AbortError') return false;
    try { await navigator.clipboard.writeText(fullText); toast('Event details & link copied'); return true; } catch { return false; }
  }
}
