import { initBg } from './hk-bg.js';
import { $, $$, esc, initTheme, icons, watchUser, ensureHkProfile, CITIES, toast, auth } from './hk-core.js';
import { login, register, googleLogin, resetPassword, ensureProfile } from '../auth.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';

const toggleTheme = initTheme();
initBg($('#hkBg'));
$('#themeBtn').onclick = toggleTheme;
$('#cityList').innerHTML = Object.keys(CITIES).map(c => `<option value="${c}">`).join('');
icons();

const qs = new URLSearchParams(location.search);
const next = qs.get('next') && /^#\/[\w\-\/]*$/.test(qs.get('next')) ? qs.get('next') : '';
let role = ['participant', 'host'].includes(qs.get('role')) ? qs.get('role') : '';
let mode = 'login', busy = false, current = null;

const msg = (t, kind = 'err') => { const m = $('#msg'); if(!t){ m.classList.add('hk-hidden'); return; } m.className = `hk-msg ${kind}`; m.innerHTML = `<i data-lucide="${kind === 'ok' ? 'circle-check' : 'circle-alert'}"></i><span>${esc(t)}</span>`; icons(); };
const friendly = e => {
  const c = e?.code || '';
  if(/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Email or password is incorrect.';
  if(c.includes('email-already-in-use')) return 'An account with this email already exists. Try logging in.';
  if(c.includes('weak-password')) return 'Password must be at least 6 characters.';
  if(c.includes('invalid-email')) return 'Enter a valid email address.';
  if(c.includes('too-many-requests')) return 'Too many attempts. Please wait a bit and retry.';
  if(c.includes('popup-closed') || c.includes('cancelled-popup')) return 'Sign-in was cancelled.';
  if(c.includes('network')) return 'Network problem. Check your connection.';
  if(c.includes('permission-denied') || /insufficient permissions/i.test(e?.message || '')) return 'Hackathon rules are not deployed yet. Ask the admin to deploy firestore.rules.';
  return e?.message || 'Something went wrong. Please try again.';
};

function setRole(r){
  role = r;
  $$('.hk-role').forEach(b => { const on = b.dataset.role === r; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  if(!current){
    $('#formWrap').classList.remove('hk-hidden');
    $('#title').innerHTML = r === 'host' ? 'Host on <span class="hk-grad-text">Campus Connect</span>' : 'Join as a <span class="hk-grad-text">participant</span>';
    $('#sub').textContent = r === 'host' ? 'Log in or create an account to start your hackathon.' : 'Log in or create an account to find hackathons near you.';
    $('#formWrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
function setMode(m){
  mode = m; msg('');
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $('#regOnly').classList.toggle('hk-hidden', m !== 'register');
  $('#submitBtn').innerHTML = (m === 'login' ? 'Log in' : 'Create account') + ' <i data-lucide="arrow-right"></i>';
  $('#password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  icons();
}

async function finish(user, extra = {}){
  const site = await ensureProfile(user);
  await ensureHkProfile(user, site, role, extra);
  sessionStorage.setItem('hk-role', role);
  location.replace('hackthons-portal.html' + next);
}

$$('.hk-role').forEach(b => b.onclick = async () => {
  if(busy) return;
  setRole(b.dataset.role);
  if(current){
    busy = true; b.querySelector('.pick').innerHTML = '<span class="hk-spin"></span> Opening…';
    try { await finish(current); } catch(e){ busy = false; toast(friendly(e), 'error'); b.querySelector('.pick').innerHTML = 'Continue <i data-lucide="arrow-right"></i>'; icons(); }
  }
});
$$('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#backBtn').onclick = () => { $('#formWrap').classList.add('hk-hidden'); role = ''; $$('.hk-role').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', false); }); $('#title').innerHTML = 'How do you want to <span class="hk-grad-text">join in?</span>'; scrollTo({ top: 0, behavior: 'smooth' }); };
$('#togglePw').onclick = () => { const i = $('#password'); i.type = i.type === 'password' ? 'text' : 'password'; };
$('#forgotBtn').onclick = async () => {
  const email = $('#email').value.trim();
  if(!email) return msg('Enter your email first, then tap “Forgot password”.');
  try { await resetPassword(email); msg('Password reset email sent. Check your inbox.', 'ok'); } catch(e){ msg(friendly(e)); }
};

async function run(btn, fn){
  if(busy) return; busy = true; msg('');
  const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Please wait…';
  try { await fn(); } catch(e){ msg(friendly(e)); busy = false; btn.disabled = false; btn.innerHTML = html; icons(); }
}
$('#googleBtn').onclick = e => run(e.currentTarget, async () => { const u = await googleLogin(); await finish(u); });
$('#form').onsubmit = e => {
  e.preventDefault();
  const email = $('#email').value.trim(), password = $('#password').value;
  if(!/^\S+@\S+\.\S+$/.test(email)) return msg('Enter a valid email address.');
  if(password.length < 6) return msg('Password must be at least 6 characters.');
  if(mode === 'register' && $('#name').value.trim().length < 2) return msg('Please enter your full name.');
  run($('#submitBtn'), async () => {
    if(mode === 'login'){ const c = await login(email, password); await finish(c.user); }
    else {
      const name = $('#name').value.trim(), college = $('#college').value.trim(), city = $('#city').value.trim();
      const u = await register({ email, password, displayName: name, profile: { college, city } });
      await finish(u, { displayName: name, college, city });
    }
  });
};

setMode('login');
if(role) setRole(role);
watchUser((user, { site, hk }) => {
  current = user;
  const bar = $('#signedBar');
  if(!user){ bar.classList.add('hk-hidden'); return; }
  if(busy) return; // a login/register flow is already finishing and will redirect
  const name = hk?.displayName || site?.displayName || user.displayName || user.email;
  bar.classList.remove('hk-hidden');
  bar.innerHTML = `<i data-lucide="circle-check"></i><span>Signed in as <b>${esc(name)}</b>. Pick a role to continue. <a href="#" id="otherAcc" style="text-decoration:underline">Use another account</a></span>`;
  $('#formWrap').classList.add('hk-hidden');
  $('#title').innerHTML = `Welcome back, <span class="hk-grad-text">${esc((name || '').split(' ')[0])}</span>`;
  $('#sub').textContent = 'Continue as a participant or a host.';
  $('#otherAcc').onclick = async ev => { ev.preventDefault(); await signOut(auth); location.reload(); };
  icons();
  if(role && qs.get('role') && !busy){ busy = true; finish(user).catch(e => { busy = false; toast(friendly(e), 'error'); }); }
});
