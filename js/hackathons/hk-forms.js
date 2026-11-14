// Intake forms shown right after login:
//  - participantForm: builds the participant dashboard profile
//  - organiserForm:   organiser / host identity (name shown on hackathons and signed on every email)
import * as C from './hk-core.js';
const { $, esc, icons, toast } = C;

const COURSES = ['B.Tech / B.E.', 'BCA', 'B.Sc', 'B.Com', 'BBA', 'B.A.', 'M.Tech / M.E.', 'MCA', 'M.Sc', 'MBA', 'Diploma', 'Class 11-12', 'Other'];
const YEARS = ['1st year', '2nd year', '3rd year', '4th year', '5th year', 'Final year', 'Passed out'];
const ORG_TYPES = [['college_club', 'College club / society'], ['department', 'College department / cell'], ['college', 'College / university'], ['community', 'Student community'], ['company', 'Company / startup'], ['ngo', 'NGO / foundation'], ['individual', 'Individual organiser']];
const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

const opt = (list, cur, ph) => `<option value="">${ph}</option>` + list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const tx = (label, name, v, o = {}) => `<div class="hk-field"><label for="o_${name}">${label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><input class="hk-input" id="o_${name}" name="${name}" type="${o.type || 'text'}" ${o.req ? 'required' : ''} ${o.list ? `list="${o.list}"` : ''} ${o.max ? `maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}" value="${esc(v || '')}" ${o.mode ? `inputmode="${o.mode}"` : ''} autocomplete="${o.ac || 'off'}"></div>`;
const cityList = `<datalist id="oc">${Object.keys(C.CITIES).map(c => `<option value="${c}">`).join('')}</datalist>`;

function fill(cx, title, sub, icon, tone, inner, onSubmit, btn){
  const { view } = cx;
  view.innerHTML = `<div class="hk-view hk-onb"><div class="hk-onb-head"><div class="ic ${tone}"><i data-lucide="${icon}"></i></div><div><span class="hk-eyebrow">One-time setup</span><h1 style="font-size:clamp(1.5rem,3.4vw,2.1rem)">${title}</h1><p class="hk-muted">${sub}</p></div></div>
    <div class="hk-progress"><i id="pg" style="width:0"></i></div>
    <form id="onb" class="hk-form" novalidate>${inner}<div id="onbErr" class="hk-msg err hk-hidden"></div><button class="hk-btn ${tone === 'g' ? 'gold' : 'primary'} lg" type="submit" id="onbBtn">${btn}</button></form>${cityList}</div>`;
  const f = $('#onb'), pg = $('#pg');
  const meter = () => { const els = [...f.querySelectorAll('[required]')]; const ok = els.filter(e => e.type === 'checkbox' ? e.checked : String(e.value).trim()).length; pg.style.width = Math.round(ok / Math.max(1, els.length) * 100) + '%'; };
  f.addEventListener('input', meter); f.addEventListener('change', meter); meter();
  f.onsubmit = async e => {
    e.preventDefault();
    const err = m => { const b = $('#onbErr'); b.classList.toggle('hk-hidden', !m); b.innerHTML = m ? `<i data-lucide="circle-alert"></i><span>${esc(m)}</span>` : ''; icons(); if(m) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    err('');
    const d = Object.fromEntries(new FormData(f).entries());
    const msg = onSubmit.validate(d); if(msg) return err(msg);
    const btnEl = $('#onbBtn'); btnEl.disabled = true; btnEl.innerHTML = '<span class="hk-spin"></span> Saving…';
    try { await onSubmit.save(d); toast('Profile saved'); onSubmit.done(); }
    catch(ex){ err(/permission|insufficient/i.test(ex.message) ? 'Could not save. Hackathon rules may not be deployed yet.' : ex.message); btnEl.disabled = false; btnEl.innerHTML = btn; }
  };
}

export function participantForm(cx, done){
  const { S } = cx, h = S.hk, s = S.site || {};
  const inner = `
    <fieldset class="hk-fs"><legend>About you</legend>
      <div class="hk-grid2">${tx('Full name', 'displayName', h.displayName || s.displayName, { req: 1, ac: 'name', max: 80 })}${tx('Mobile number', 'phone', h.phone, { req: 1, mode: 'tel', ac: 'tel', ph: '10-digit mobile', hint: 'organisers use it to reach you' })}</div>
      <div class="hk-grid2">${tx('City', 'city', h.city, { req: 1, list: 'oc', ph: 'e.g. Prayagraj' })}<div class="hk-field"><label for="o_gender">Gender <small>optional</small></label><select class="hk-select" id="o_gender" name="gender">${opt([['female', 'Female'], ['male', 'Male'], ['other', 'Other'], ['na', 'Prefer not to say']], h.gender, 'Select')}</select></div></div>
    </fieldset>
    <fieldset class="hk-fs"><legend>Education</legend>
      ${tx('College / institute', 'college', h.college || s.college, { req: 1, ac: 'organization', ph: 'e.g. MNNIT Allahabad', hint: 'used to highlight hackathons at your campus', max: 100 })}
      <div class="hk-grid3"><div class="hk-field"><label for="o_course">Course</label><select class="hk-select" id="o_course" name="course" required>${opt(COURSES, h.course || s.course, 'Select')}</select></div>
        ${tx('Branch / stream', 'branch', h.branch || s.branch, { ph: 'e.g. CSE', max: 60 })}<div class="hk-field"><label for="o_year">Year</label><select class="hk-select" id="o_year" name="year" required>${opt(YEARS, h.year || s.year, 'Select')}</select></div></div>
    </fieldset>
    <fieldset class="hk-fs"><legend>Skills & links</legend>
      ${tx('Skills', 'skills', h.skills, { ph: 'React, Python, UI design, ML…', hint: 'comma separated', max: 200 })}
      <div class="hk-field"><label for="o_level">Experience level</label><select class="hk-select" id="o_level" name="level">${opt(LEVELS, h.level, 'Select')}</select></div>
      <div class="hk-grid2">${tx('GitHub', 'github', h.github, { type: 'url', ph: 'https://github.com/you', hint: 'optional' })}${tx('LinkedIn', 'linkedin', h.linkedin, { type: 'url', ph: 'https://linkedin.com/in/you', hint: 'optional' })}</div>
      ${tx('Portfolio / website', 'portfolio', h.portfolio, { type: 'url', ph: 'https://…', hint: 'optional' })}
      <div class="hk-field"><label for="o_bio">Short bio <small>optional</small></label><textarea class="hk-textarea" id="o_bio" name="bio" maxlength="280" style="min-height:84px">${esc(h.bio || '')}</textarea></div>
    </fieldset>
    <label class="hk-check"><input type="checkbox" name="consent" required><span>I agree to share these details with organisers of hackathons I register for.</span></label>`;
  fill(cx, 'Set up your participant profile', 'This builds your dashboard and pre-fills every registration. It takes about a minute.', 'user-round', 'p', inner, {
    validate: d => d.displayName.trim().length < 2 ? 'Enter your full name.' : !/^[6-9]\d{9}$/.test(d.phone.replace(/\D/g, '').slice(-10)) ? 'Enter a valid 10-digit mobile number.' : !d.city.trim() ? 'Enter your city.' : !d.college.trim() ? 'Enter your college.' : !d.course ? 'Select your course.' : !d.year ? 'Select your year.' : [d.github, d.linkedin, d.portfolio].some(u => u && !C.isUrl(u)) ? 'Links must start with https://' : !d.consent ? 'Please accept to continue.' : '',
    save: async d => {
      const patch = { displayName: d.displayName.trim(), phone: d.phone.replace(/\D/g, '').slice(-10), city: d.city.trim(), gender: d.gender || '', college: d.college.trim(), course: d.course, branch: (d.branch || '').trim(), year: d.year, skills: (d.skills || '').trim(), level: d.level || '', github: (d.github || '').trim(), linkedin: (d.linkedin || '').trim(), portfolio: (d.portfolio || '').trim(), bio: (d.bio || '').trim(), onboarded: true };
      await C.updateHkProfile(S.user.uid, patch); Object.assign(S.hk, patch);
      const c = C.findCity(patch.city); if(c && S.loc?.source !== 'gps') S.loc = C.saveLocation({ lat: c.lat, lng: c.lng, city: c.city, state: c.state, source: 'profile' });
    }, done
  }, 'Save and open my dashboard');
}

export function organiserForm(cx, done){
  const { S } = cx, h = S.hk;
  const inner = `
    <fieldset class="hk-fs"><legend>Organiser (you)</legend>
      <div class="hk-grid2">${tx('Organiser name', 'organiserName', h.organiserName || h.displayName, { req: 1, ac: 'name', hint: 'signed on every email', max: 80 })}${tx('Your role / designation', 'designation', h.designation, { ph: 'e.g. Secretary, Tech lead', max: 60 })}</div>
      <div class="hk-grid2">${tx('Contact email', 'orgEmail', h.orgEmail || S.user.email, { req: 1, type: 'email', ac: 'email', hint: 'replies from participants come here' })}${tx('Contact phone', 'orgPhone', h.orgPhone || h.phone, { req: 1, mode: 'tel', ac: 'tel', ph: '10-digit mobile' })}</div>
    </fieldset>
    <fieldset class="hk-fs"><legend>Organisation</legend>
      <div class="hk-grid2">${tx('Organisation / club name', 'org', h.org, { req: 1, ph: 'e.g. Coding Club, XYZ Institute', hint: 'shown as the host', max: 80 })}<div class="hk-field"><label for="o_orgType">Type</label><select class="hk-select" id="o_orgType" name="orgType" required>${opt(ORG_TYPES, h.orgType, 'Select')}</select></div></div>
      <div class="hk-grid2">${tx('College / institute', 'college', h.college, { ph: 'Hosting campus', ac: 'organization', max: 100 })}${tx('City', 'city', h.city, { list: 'oc', ph: 'e.g. Prayagraj' })}</div>
      <div class="hk-grid2">${tx('Website', 'website', h.website, { type: 'url', ph: 'https://…', hint: 'optional' })}${tx('Instagram / LinkedIn', 'social', h.social, { type: 'url', ph: 'https://…', hint: 'optional' })}</div>
      ${tx('Proof of affiliation', 'proofUrl', h.proofUrl, { type: 'url', ph: 'Link to ID card / faculty letter / website page', hint: 'optional, speeds up approval' })}
      <div class="hk-field"><label for="o_about">About your organisation <small>optional</small></label><textarea class="hk-textarea" id="o_about" name="about" maxlength="400" style="min-height:84px">${esc(h.about || '')}</textarea></div>
    </fieldset>
    <label class="hk-check"><input type="checkbox" name="consent" required><span>I am authorised to organise hackathons for this organisation and will follow the community guidelines.</span></label>`;
  fill(cx, 'Set up your organiser profile', 'Participants see your organisation on every hackathon, and admins use this to approve you faster.', 'megaphone', 'g', inner, {
    validate: d => d.organiserName.trim().length < 2 ? 'Enter the organiser name.' : !/^\S+@\S+\.\S+$/.test(d.orgEmail) ? 'Enter a valid contact email.' : d.orgPhone.replace(/\D/g, '').length < 10 ? 'Enter a valid contact phone.' : !d.org.trim() ? 'Enter your organisation or club name.' : !d.orgType ? 'Select the organisation type.' : [d.website, d.social, d.proofUrl].some(u => u && !C.isUrl(u)) ? 'Links must start with https://' : !d.consent ? 'Please accept to continue.' : '',
    save: async d => {
      const patch = { organiserName: d.organiserName.trim(), designation: (d.designation || '').trim(), orgEmail: d.orgEmail.trim(), orgPhone: d.orgPhone.replace(/\D/g, '').slice(-10), org: d.org.trim(), orgType: d.orgType, college: (d.college || '').trim(), city: (d.city || '').trim(), website: (d.website || '').trim(), social: (d.social || '').trim(), proofUrl: (d.proofUrl || '').trim(), about: (d.about || '').trim(), hostOnboarded: true };
      await C.updateHkProfile(S.user.uid, patch); Object.assign(S.hk, patch);
    }, done
  }, 'Save and open organiser dashboard');
}
