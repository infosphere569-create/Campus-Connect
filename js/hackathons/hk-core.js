// Core helpers shared by every Hackathons page: auth, geo, ranking, Firestore data layer.
import { auth, db, storage, functions } from '../firebase.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import * as FS from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { ref as sRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
import { ensureProfile } from '../auth.js';
import { isSameInstitution } from '../utils.js';

export { auth, db, FS };

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

// cb(user|null, { site, hk })  — site = main-site users/{uid} doc, hk = hkProfiles/{uid} doc
export function watchUser(cb){
  return onAuthStateChanged(auth, async user => {
    if(!user) return cb(null, {});
    let site = null, hk = null;
    try { site = await ensureProfile(user); } catch(e){ console.warn('site profile', e); }
    try { const s = await FS.getDoc(FS.doc(db, 'hkProfiles', user.uid)); hk = s.exists() ? { uid: user.uid, ...s.data() } : null; } catch(e){ console.warn('hk profile', e); }
    cb(user, { site, hk });
  });
}

export async function ensureHkProfile(user, site, role, extra = {}){
  const rf = FS.doc(db, 'hkProfiles', user.uid);
  const snap = await FS.getDoc(rf);
  if(!snap.exists()){
    const data = {
      uid: user.uid, displayName: extra.displayName || user.displayName || site?.displayName || '', email: user.email || '',
      photoURL: user.photoURL || site?.photoURL || '', college: extra.college || site?.college || '', city: extra.city || '',
      phone: '', bio: '', org: '', roles: [role], activeRole: role, hostVerified: false, hostBlocked: false, onboarded: false, hostOnboarded: false,
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

/* ---------------- data layer ---------------- */
const mapDocs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
export async function fetchApproved(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('status', '==', 'approved'), FS.limit(300)))); }
export async function fetchMine(uid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.where('hostUid', '==', uid), FS.limit(200)))).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0)); }
export async function fetchAll(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkHackathons'), FS.limit(500)))); }
export async function fetchOne(id){ const s = await FS.getDoc(FS.doc(db, 'hkHackathons', id)); return s.exists() ? { id: s.id, ...s.data() } : null; }
export const newId = () => FS.doc(FS.collection(db, 'hkHackathons')).id;

export async function saveHackathon(h, user, hk){
  const { id, ...rest } = h;
  const data = { ...rest, hostUid: user.uid, hostName: hk?.org || hk?.organiserName || hk?.displayName || user.displayName || 'Host', hostVerified: !!hk?.hostVerified,
    organiser: { name: hk?.organiserName || hk?.displayName || '', designation: hk?.designation || '', org: hk?.org || '', type: hk?.orgType || '', email: hk?.orgEmail || user.email || '', phone: hk?.orgPhone || hk?.phone || '' },
    updatedAtMs: Date.now(), updatedAt: FS.serverTimestamp() };
  const rf = FS.doc(db, 'hkHackathons', id);
  const ex = await FS.getDoc(rf);
  if(!ex.exists()) await FS.setDoc(rf, { ...data, regCount: 0, featured: false, autoEmail: data.autoEmail !== false, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() });
  else { delete data.featured; delete data.regCount; delete data.createdAtMs; await FS.updateDoc(rf, data); }
  return id;
}
export const deleteHackathon = id => FS.deleteDoc(FS.doc(db, 'hkHackathons', id));

export function validateForSubmit(h){
  const e = [], need = (ok, step, msg) => { if(!ok) e.push({ step, msg }); };
  need((h.title || '').trim().length >= 6, 1, 'Add a clear title (6+ characters)');
  need((h.tagline || '').trim().length >= 10, 1, 'Add a one-line tagline (10+ characters)');
  need(!!h.bannerURL, 1, 'Upload a banner image');
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
  need(/^\S+@\S+\.\S+$/.test(h.contactEmail || ''), 5, 'Add a valid contact email');
  need((h.contactName || '').trim().length >= 2, 5, 'Add a contact person');
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
export async function hackathonRegistrations(hid, hostUid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkRegistrations'), FS.where('hackathonId', '==', hid), FS.where('hostUid', '==', hostUid), FS.limit(1000)))).sort((a, b) => b.createdAtMs - a.createdAtMs); }
export async function allRegistrations(){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkRegistrations'), FS.limit(1500)))); }

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
  try { await FS.addDoc(FS.collection(db, 'auditLogs'), { scope: 'hackathons', action, target, by, ...extra, createdAtMs: Date.now(), createdAt: FS.serverTimestamp() }); } catch(e){ console.warn('audit', e); }
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
  const body = { title: d.title, idea: d.idea, repoUrl: d.repoUrl, demoUrl: d.demoUrl, pptUrl: d.pptUrl, videoUrl: d.videoUrl, extraUrl: d.extraUrl, updatedAtMs: Date.now() };
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
  const answers = {}, qs = questions.map((q, i) => { const id = q.id || 'q' + (i + 1); answers[id] = +q.correct; return { id, text: q.text.trim(), options: q.options.map(o => o.trim()), marks: +q.marks || 1 }; });
  await FS.setDoc(FS.doc(db, 'hkTestKeys', h.id), { hostUid: user.uid, questions: qs, answers });
  await FS.setDoc(FS.doc(db, 'hkTests', h.id), { hostUid: user.uid, hackathonId: h.id, title: meta.title, durationMin: +meta.durationMin || 30, startMs: meta.startMs || 0, endMs: meta.endMs || 0, count: qs.length, total: qs.reduce((s, q) => s + q.marks, 0), updatedAtMs: Date.now() });
}
export async function removeTest(hid){ await FS.deleteDoc(FS.doc(db, 'hkTests', hid)); await FS.deleteDoc(FS.doc(db, 'hkTestKeys', hid)); }
export async function myAttempt(hid, uid){ try { const s = await FS.getDoc(FS.doc(db, 'hkAttempts', `${hid}_${uid}`)); return s.exists() ? s.data() : null; } catch { return null; } }
export async function hackathonAttempts(hid, hostUid){ return mapDocs(await FS.getDocs(FS.query(FS.collection(db, 'hkAttempts'), FS.where('hackathonId', '==', hid), FS.where('hostUid', '==', hostUid), FS.limit(1000)))); }

/* ---------------- registrations (host side) ---------------- */
export const updateRegistration = (id, patch) => FS.updateDoc(FS.doc(db, 'hkRegistrations', id), { ...patch, updatedAtMs: Date.now() });
export const getRegistration = async (hid, uid) => { try { const s = await FS.getDoc(FS.doc(db, 'hkRegistrations', `${hid}_${uid}`)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch { return null; } };
export const roundsOf = h => (h.rounds || []).filter(r => r.name);
export const REG_STATUS = ['registered', 'shortlisted', 'selected', 'waitlisted', 'rejected'];
