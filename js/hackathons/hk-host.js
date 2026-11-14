// Host side of the portal: dashboard, create/edit wizard (→ submit for approval), registrations manager.
import * as C from './hk-core.js';
import { card, empty, statusBadge, mediaStyle } from './hk-ui.js';

const { $, $$, esc, icons, toast, modal, FS } = C;

/* =====================================================================
   Host dashboard
   ===================================================================== */
export async function hostDash(cx){
  const { S, view } = cx;
  const blocked = !!(S.hk?.hostBlocked || S.hk?.banned) && !C.isStaff(S.site);
  const mine = await cx.refreshMine(); if(cx.stale()) return;
  const now = Date.now();
  const liveN = mine.filter(h => h.status === 'approved' && !(h.endMs && now > h.endMs)).length;
  const pendN = mine.filter(h => h.status === 'pending').length;
  const regs = mine.reduce((s, h) => s + (h.regCount || 0), 0);
  const needSetup = false; // organiser profile is collected right after login

  const row = h => {
    const shared = h.hostUid !== S.user.uid;
    const sharedBadge = shared ? '<span class="hk-chip sky"><i data-lucide="users"></i>Shared</span>' : '';
    const note = ['changes_requested', 'rejected'].includes(h.status) && h.adminNote ? `<div class="hk-msg err" style="margin-top:8px"><i data-lucide="message-square-warning"></i><span><b>Admin note:</b> ${esc(h.adminNote)}</span></div>` : '';
    const blockedDraftAct = `<button type="button" class="hk-btn sm" disabled title="Hosting paused — drafts cannot be published"><i data-lucide="lock"></i>Publishing paused</button>`;
    const acts = {
      draft: blocked ? blockedDraftAct : `<a class="hk-btn sm primary" href="#/host/edit/${h.id}">Continue</a>`,
      changes_requested: blocked ? `${blockedDraftAct}<a class="hk-btn sm" href="#/h/${h.id}">Preview</a>` : `<a class="hk-btn sm primary" href="#/host/edit/${h.id}">Fix & resubmit</a>`,
      rejected: blocked ? `<a class="hk-btn sm" href="#/h/${h.id}">Preview</a>` : `<a class="hk-btn sm" href="#/host/edit/${h.id}">Edit</a>`,
      pending: `<a class="hk-btn sm" href="#/h/${h.id}">Preview</a>${blocked ? '' : `<a class="hk-btn sm" href="#/host/edit/${h.id}">Edit</a>`}`,
      approved: `<a class="hk-btn sm gold" href="#/host/manage/${h.id}"><i data-lucide="users"></i>Manage</a><a class="hk-btn sm" href="#/h/${h.id}">View</a>${blocked ? '' : `<a class="hk-btn sm" href="#/host/edit/${h.id}">Edit</a>`}`,
      closed: `<a class="hk-btn sm" href="#/h/${h.id}">View</a>`
    }[h.status] || '';
    const moreBtn = `<button type="button" class="hk-btn icon sm ghost" data-more="${esc(h.id)}" title="Give access &amp; options" aria-label="Give access and options"><i data-lucide="more-vertical"></i></button>`;
    return `<div class="hk-lrow"><div class="th" style="${mediaStyle(h)}"></div><div class="info"><b>${esc(h.title || 'Untitled hackathon')}</b><span class="hk-sm hk-muted">${C.dateRange(h.startMs, h.endMs)} · ${esc(h.mode === 'online' ? 'Online' : h.city || 'No city yet')} · ${h.regCount || 0} registered</span>${note}</div>${sharedBadge}${statusBadge(h.status)}<div class="acts">${acts}${moreBtn}</div></div>`;
  };

  const blockedBanner = blocked ? `<div class="hk-msg err" style="margin-bottom:16px"><i data-lucide="shield-alert"></i><div style="flex:1"><b>Hosting actions paused by admin</b><div class="hk-sm" style="margin-top:2px;color:var(--hk-ink)">You can still view your dashboard and manage live events, but creating new hackathons and publishing drafts are disabled.${S.hk?.banReason ? ' <b>Reason:</b> ' + esc(S.hk.banReason) + '.' : ''} To resolve this, email <a href="mailto:support@campusconnectone.online" style="text-decoration:underline;font-weight:700">support@campusconnectone.online</a> or visit <a href="contact.html" style="text-decoration:underline;font-weight:700">Support</a>.</div></div></div>` : '';

  view.innerHTML = `<div class="hk-view">
    <div class="hk-page-h"><div><span class="hk-eyebrow" style="color:var(--hk-gold)">Host dashboard</span><h1>Your hackathons</h1><p>Create, get approved, go live and manage registrations.</p></div>${blocked ? `<button type="button" class="hk-btn" data-blocked-info><i data-lucide="shield-alert"></i>Creation paused</button>` : `<a class="hk-btn gold lg" href="#/host/new"><i data-lucide="circle-plus"></i>Create hackathon</a>`}</div>
    ${blockedBanner}
    ${needSetup ? `<div class="hk-banner"><i data-lucide="building-2" style="width:28px;height:28px;color:var(--hk-gold)"></i><div class="grow"><b>Finish your host profile</b><div class="hk-sm hk-muted">Add your organisation / club name and a contact number so participants and admins can trust your events.</div></div><button class="hk-btn gold sm" data-setup>Complete now</button></div>` : ''}
    <div class="hk-kpis">
      <div class="hk-kpi g"><div class="ki"><i data-lucide="layers"></i></div><strong>${mine.length}</strong><span>Total hackathons</span></div>
      <div class="hk-kpi c"><div class="ki"><i data-lucide="hourglass"></i></div><strong>${pendN}</strong><span>Awaiting approval</span></div>
      <div class="hk-kpi"><div class="ki"><i data-lucide="radio"></i></div><strong>${liveN}</strong><span>Live / upcoming</span></div>
      <div class="hk-kpi s"><div class="ki"><i data-lucide="users"></i></div><strong>${regs}</strong><span>Total registrations</span></div></div>
    <div class="hk-sec"><h2><i data-lucide="list-checks"></i>All hackathons</h2></div>
    ${mine.length ? `<div class="hk-stack">${mine.map(row).join('')}</div>` : empty('rocket', 'Create your first hackathon', blocked ? 'Creating new hackathons is currently paused for your account.' : 'Add a banner, the details, schedule and prizes, then publish your event. It takes about 10 minutes.', blocked ? '' : '<a class="hk-btn gold" href="#/host/new">Start creating</a>')}</div>`;

  view.onclick = async e => {
    if(e.target.closest('[data-blocked-info]')){
      modal('Hosting paused', `<div class="hk-stack">
        <div class="hk-msg err"><i data-lucide="shield-alert"></i><span>Creating new hackathons and publishing drafts have been paused by an admin.${S.hk?.banReason ? ' Reason: ' + esc(S.hk.banReason) : ''}</span></div>
        <p class="hk-sm hk-muted">You can still view your dashboard and manage any already-live events. To appeal or restore full hosting privileges, contact our support team:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="hk-btn primary sm" href="mailto:support@campusconnectone.online?subject=${encodeURIComponent('Host account review: ' + (S.user?.email || ''))}"><i data-lucide="mail"></i>Email support@campusconnectone.online</a><a class="hk-btn sm" href="contact.html"><i data-lucide="life-buoy"></i>Contact page</a></div>
      </div>`);
      return;
    }
    if(e.target.closest('[data-setup]')) return setupModal(cx, () => cx.nav('#/host'));
    const m = e.target.closest('[data-more]');
    if(m){
      const h = mine.find(x => x.id === m.dataset.more);
      if(h) accessModal(cx, h, () => hostDash(cx));
      return;
    }
    const d = e.target.closest('[data-del]');
    if(d && confirm('Delete this hackathon permanently?')){
      try { await C.deleteHackathon(d.dataset.del); toast('Deleted', 'info'); await hostDash(cx); icons(); } catch(err){ toast(err.message, 'error'); }
    }
  };
}

function accessModal(cx, h, onChanged){
  const { S } = cx;
  const isOwner = h.hostUid === S.user.uid;
  const canDelete = isOwner && ['draft', 'rejected', 'changes_requested'].includes(h.status);
  let emails = [...new Set((h.coHostEmails || []).map(x => String(x).toLowerCase()))];
  const inviteUrl = C.coHostInviteUrl(h.id);

  modal(`Give access · ${h.title || 'Hackathon'}`, '<div id="accWrap" class="hk-form"></div>', {
    onMount(b, close){
      const render = () => {
        const listHtml = emails.length
          ? emails.map(em => `<div class="hk-cohost-item">
              <div style="display:flex;align-items:center;gap:10px;min-width:0">
                <i data-lucide="mail" style="color:var(--hk-p);flex:none"></i>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:.88rem">${esc(em)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px">
                <span class="hk-chip neutral">Co-host</span>
                ${isOwner ? `<button type="button" class="hk-btn icon sm ghost" data-rm-email="${esc(em)}" aria-label="Remove ${esc(em)}"><i data-lucide="x"></i></button>` : ''}
              </div>
            </div>`).join('')
          : '<div class="hk-sm hk-muted" style="padding:6px 0">No co-hosts added yet. Add a collaborator\'s Gmail below to grant full host access.</div>';

        const inviteSection = emails.length || !isOwner
          ? `<div class="hk-card-s" style="padding:14px;display:grid;gap:10px;background:var(--hk-surface2)">
              <div>
                <b style="font-size:.9rem">Share host invite link</b>
                <div class="hk-xs hk-muted">Opening this link directs your collaborator straight to Host login and adds this hackathon under their dashboard as <b>Shared</b>.</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <input class="hk-input" id="invLink" readonly value="${esc(inviteUrl)}" style="flex:1;min-width:190px;font-size:.8rem;min-height:40px">
                <button type="button" class="hk-btn sm" id="copyInv"><i data-lucide="copy"></i>Copy</button>
                <button type="button" class="hk-btn sm gold" id="shareInv"><i data-lucide="share-2"></i>Share to invite</button>
              </div>
            </div>`
          : `<div class="hk-hint">Add a Gmail address above to generate the dedicated host invite link.</div>`;

        $('#accWrap', b).innerHTML = `
          ${isOwner
            ? `<form id="addCoForm" class="hk-form" style="gap:10px" novalidate>
                <div class="hk-field">
                  <label for="coEmail">Collaborator Gmail / Email <small>gets host edit &amp; manage access</small></label>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <input class="hk-input" id="coEmail" name="email" type="email" required placeholder="teammate@gmail.com" style="flex:1;min-width:200px">
                    <button type="submit" class="hk-btn primary" id="addCoBtn"><i data-lucide="user-plus"></i>Add</button>
                  </div>
                </div>
              </form>`
            : `<div class="hk-msg ok"><i data-lucide="users"></i><span>You have <b>Shared co-host</b> access to this hackathon (hosted by ${esc(h.hostName || 'Organiser')}).</span></div>`
          }

          <div class="hk-card-s" style="padding:14px;display:grid;gap:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <b style="font-size:.88rem">Collaborators (${emails.length})</b>
              <span class="hk-chip ${isOwner ? '' : 'sky'}">${isOwner ? 'Owner' : 'Shared'}</span>
            </div>
            <div class="hk-stack" style="gap:6px">${listHtml}</div>
          </div>

          ${inviteSection}

          <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--hk-line)">
            ${h.status !== 'closed' ? `<a class="hk-btn sm" href="#/host/edit/${esc(h.id)}" data-close-nav><i data-lucide="pencil"></i>Edit</a>` : ''}
            ${h.status === 'approved' ? `<a class="hk-btn sm gold" href="#/host/manage/${esc(h.id)}" data-close-nav><i data-lucide="users"></i>Manage</a>` : ''}
            <button type="button" class="hk-btn sm" id="sharePubBtn"><i data-lucide="share-2"></i>Share public link</button>
            ${canDelete ? `<button type="button" class="hk-btn sm danger" id="delHackBtn" style="margin-left:auto"><i data-lucide="trash-2"></i>Delete</button>` : ''}
          </div>
        `;
        icons();

        $('#addCoForm', b)?.addEventListener('submit', async ev => {
          ev.preventDefault();
          const inp = $('#coEmail', b), btn = $('#addCoBtn', b);
          const em = (inp.value || '').trim().toLowerCase();
          if(!/^\S+@\S+\.\S+$/.test(em)) return toast('Enter a valid email address.', 'error');
          if(em === (S.user.email || '').trim().toLowerCase()) return toast('You are already the host of this hackathon.', 'info');
          if(emails.includes(em)) return toast('This email already has access.', 'info');
          if(emails.length >= 20) return toast('Maximum 20 collaborators allowed.', 'error');
          btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Adding…';
          const nextEmails = [...emails, em];
          try {
            await C.updateCoHosts(h.id, { coHostEmails: nextEmails });
            emails = nextEmails;
            h.coHostEmails = nextEmails;
            S.mine = null;
            toast(`Access granted to ${em}`);
            render();
            onChanged?.();
          } catch(err){
            toast(err.message, 'error');
            btn.disabled = false; btn.innerHTML = '<i data-lucide="user-plus"></i>Add'; icons();
          }
        });

        $$('[data-rm-email]', b).forEach(btn => {
          btn.onclick = async () => {
            const target = btn.dataset.rmEmail;
            const nextEmails = emails.filter(x => x !== target);
            try {
              await C.updateCoHosts(h.id, { coHostEmails: nextEmails });
              emails = nextEmails;
              h.coHostEmails = nextEmails;
              S.mine = null;
              toast('Access removed', 'info');
              render();
              onChanged?.();
            } catch(err){ toast(err.message, 'error'); }
          };
        });

        $('#copyInv', b)?.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(inviteUrl); toast('Invite link copied'); }
          catch { $('#invLink', b)?.select(); toast('Press Ctrl+C to copy link'); }
        });
        $('#shareInv', b)?.addEventListener('click', () => C.shareCoHostInvite(h));
        $('#sharePubBtn', b)?.addEventListener('click', () => C.shareHackathon(h, 'host'));
        $$('[data-close-nav]', b).forEach(a => a.addEventListener('click', close));
        $('#delHackBtn', b)?.addEventListener('click', async () => {
          if(!confirm('Delete this hackathon permanently?')) return;
          try { await C.deleteHackathon(h.id); S.mine = null; close(); toast('Deleted', 'info'); onChanged?.(); }
          catch(err){ toast(err.message, 'error'); }
        });
      };
      render();
    }
  });
}

function setupModal(cx, done){
  const { S } = cx;
  modal('Host profile', `<form class="hk-form" id="hs"><div class="hk-field"><label>Organisation / club name</label><input class="hk-input" name="org" required value="${esc(S.hk.org || '')}" placeholder="e.g. Coding Club, XYZ Institute"></div>
    <div class="hk-field"><label>Contact number</label><input class="hk-input" name="phone" inputmode="tel" required value="${esc(S.hk.phone || '')}" placeholder="10-digit mobile"></div>
    <div class="hk-field"><label>College / institute</label><input class="hk-input" name="college" value="${esc(S.hk.college || '')}" placeholder="Where do you host from?"></div>
    <button class="hk-btn gold lg block" type="submit">Save</button></form>`, { onMount(b, close){
    $('#hs', b).onsubmit = async ev => {
      ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.target).entries());
      if(!d.org.trim()) return toast('Enter your organisation name.', 'error');
      if(d.phone.replace(/\D/g, '').length < 10) return toast('Enter a valid phone number.', 'error');
      try { await C.updateHkProfile(S.user.uid, { org: d.org.trim(), phone: d.phone.trim(), college: d.college.trim() }); Object.assign(S.hk, { org: d.org.trim(), phone: d.phone.trim(), college: d.college.trim() }); close(); toast('Host profile saved'); done?.(); } catch(e){ toast(e.message, 'error'); }
    };
  } });
}

/* =====================================================================
   Create / edit wizard
   ===================================================================== */
const STEPS = [['image-up', 'Media & brand'], ['file-text', 'Details'], ['map-pin', 'When & where'], ['list-ordered', 'Rounds & submissions'], ['trophy', 'Prizes & contact'], ['send', 'Review & submit']];
const SUGGEST = ['AI/ML', 'Web', 'App', 'IoT', 'Web3', 'Open Innovation', 'Cybersecurity', 'Game Dev', 'Sustainability', 'FinTech', 'HealthTech'];

export async function wizard(cx, id){
  const { S, view } = cx;
  const hk = S.hk || {};
  const blocked = !!(hk.hostBlocked || hk.banned) && !C.isStaff(S.site);
  if(blocked && !id){
    view.innerHTML = `<div class="hk-view">${empty('shield-alert', 'Hosting creation is paused', `Creating new hackathons is disabled for your account.${hk.banReason ? ' Reason: ' + esc(hk.banReason) : ''} Contact support@campusconnectone.online to resolve this.`, '<a class="hk-btn" href="#/host">Back to dashboard</a> <a class="hk-btn primary" href="mailto:support@campusconnectone.online">Email support</a>')}</div>`;
    return;
  }
  const blank = () => ({
    id: C.newId(), status: 'draft', title: '', tagline: '', description: '', tags: [], mode: 'offline', bannerURL: '', thumbURL: '', brandName: hk.org || '', website: '',
    college: hk.college || S.site?.college || '', city: hk.city || '', state: '', venue: '', lat: null, lng: null, regDeadlineMs: 0, startMs: 0, endMs: 0,
    teamMin: 1, teamMax: 4, maxParticipants: 0, fee: 0, eligibility: '', rules: '', tracks: [{ title: '', desc: '' }], schedule: [{ when: '', title: '' }],
    regFields: { askGithub: false, reqGithub: false, askLinkedin: false, reqLinkedin: false, askPortfolio: false, reqPortfolio: false, customFields: [] },
    prizePool: 0, prizes: [{ place: '1st Prize', amount: '', note: '' }], perks: '',
    contactName: hk.organiserName || hk.displayName || '', contactEmail: hk.orgEmail || S.user.email || '', contactPhone: '', showContactPhone: false,
    rounds: [{ name: 'Idea submission', desc: '', startMs: 0, endMs: 0 }, { name: 'Final round', desc: '', startMs: 0, endMs: 0 }],
    submission: { open: true, deadlineMs: 0, instructions: '', askPpt: true, reqPpt: false, askRepo: true, reqRepo: false, askVideo: false, reqVideo: false, askIntroVideo: false, reqIntroVideo: false, askDemo: false, reqDemo: false, askExtra: false, reqExtra: false, customFields: [] },
    autoEmail: true, community: '', faqs: [{ q: '', a: '' }], agree: false
  });
  const BK = `hk-draft-new-${S.user.uid}`;
  let D, isNew = !id, restored = false;
  if(id){
    const h = await C.fetchOne(id); if(cx.stale()) return;
    if(!h || (!C.isHackHost(h, S.user) && !C.isStaff(S.site))){ view.innerHTML = `<div class="hk-view">${empty('search-x', 'Hackathon not found', 'You can only edit hackathons you host or were invited to co-host.', `<a class="hk-btn" href="${esc(cx.backHash || '#/host')}">Back to dashboard</a>`)}</div>`; return; }
    if(h.status === 'closed' && !C.isStaff(S.site)){ view.innerHTML = `<div class="hk-view">${empty('lock', 'This hackathon is closed', 'Closed hackathons cannot be edited. Contact support if this is a mistake.', '<a class="hk-btn" href="#/host">Back</a>')}</div>`; return; }
    D = { ...blank(), ...h, agree: false };
    D.regFields = { ...blank().regFields, ...(h.regFields || {}), customFields: Array.isArray(h.regFields?.customFields) ? h.regFields.customFields.map(x => ({ ...x })) : [] };
    D.submission = { ...blank().submission, ...(h.submission || {}), customFields: Array.isArray(h.submission?.customFields) ? h.submission.customFields.map(x => ({ ...x })) : [] };
    ['tracks', 'schedule', 'prizes', 'faqs', 'rounds'].forEach(k => { if(!D[k]?.length) D[k] = blank()[k]; });
  } else {
    D = blank();
    try { const b = JSON.parse(localStorage.getItem(BK) || 'null'); if(b?.id){ D = { ...D, ...b }; D.regFields = { ...blank().regFields, ...(b.regFields || {}), customFields: Array.isArray(b.regFields?.customFields) ? b.regFields.customFields : [] }; D.submission = { ...blank().submission, ...(b.submission || {}), customFields: Array.isArray(b.submission?.customFields) ? b.submission.customFields : [] }; restored = true; } } catch {}
  }
  let step = 1, dirty = false, saving = false, errs = [];
  const live = D.status === 'approved';

  /* --- tiny field builders --- */
  const attr = (k, t) => `data-k="${k}"${t ? ` data-t="${t}"` : ''}`;
  const fText = (label, k, o = {}) => `<div class="hk-field"><label for="f_${k}">${label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><input class="hk-input" id="f_${k}" ${attr(k)} type="${o.type || 'text'}" ${o.max ? `maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}" ${o.list ? `list="${o.list}"` : ''} value="${esc(D[k] ?? '')}"></div>`;
  const fNum = (label, k, o = {}) => `<div class="hk-field"><label for="f_${k}">${label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><input class="hk-input" id="f_${k}" ${attr(k, 'num')} type="number" min="${o.min ?? 0}" inputmode="numeric" placeholder="${esc(o.ph || '')}" value="${D[k] === 0 || D[k] ? D[k] : ''}"></div>`;
  const fArea = (label, k, o = {}) => `<div class="hk-field"><label for="f_${k}">${label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><textarea class="hk-textarea" id="f_${k}" ${attr(k)} rows="${o.rows || 5}" ${o.max ? `maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}">${esc(D[k] ?? '')}</textarea>${o.max ? `<div class="hk-count" data-count="${k}">${(D[k] || '').length}/${o.max}</div>` : ''}</div>`;
  const fDt = (label, k, o = {}) => `<div class="hk-field"><label for="f_${k}">${label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><input class="hk-input" id="f_${k}" ${attr(k, 'dt')} type="datetime-local" value="${C.toLocalInput(D[k])}"></div>`;
  const listEd = (name, cols, addLabel) => `<div class="hk-list-ed">${D[name].map((r, i) => `<div class="hk-row-ed" style="--cols:${cols.length}">${cols.map(c => c.dt
    ? `<input class="hk-input" data-l="${name}" data-i="${i}" data-f="${c.f}" data-t="dt" type="datetime-local" title="${esc(c.ph)}" aria-label="${esc(c.ph)}" value="${C.toLocalInput(r[c.f])}">`
    : c.area
    ? `<textarea class="hk-textarea" style="min-height:64px" data-l="${name}" data-i="${i}" data-f="${c.f}" placeholder="${esc(c.ph)}">${esc(r[c.f] ?? '')}</textarea>`
    : `<input class="hk-input" data-l="${name}" data-i="${i}" data-f="${c.f}" ${c.num ? 'data-t="num" type="number" min="0" inputmode="numeric"' : 'type="text"'} placeholder="${esc(c.ph)}" value="${esc(r[c.f] ?? '')}">`).join('')}<button type="button" class="hk-btn icon ghost" data-del="${name}:${i}" aria-label="Remove row"><i data-lucide="trash-2"></i></button></div>`).join('')}
    <button type="button" class="hk-btn sm" data-add="${name}"><i data-lucide="plus"></i>${addLabel}</button></div>`;
  const drop = (kind, label, hint) => { const u = C.safeUrl(kind === 'banner' ? D.bannerURL : D.thumbURL); return `<label class="hk-drop ${kind} ${u ? 'has' : ''}" style="${u ? `background-image:url('${u.replace(/'/g, '%27')}')` : ''}"><input type="file" accept="image/*" data-up="${kind}" aria-label="${label}"><span class="dz"><i data-lucide="${u ? 'refresh-cw' : 'image-up'}"></i><span>${u ? 'Change ' : 'Upload '}${label}</span><small>${hint}</small></span></label>`; };
  const tagsHtml = () => D.tags.map((t, i) => `<span class="hk-chip">#${esc(t)} <button type="button" data-tagrm="${i}" aria-label="Remove ${esc(t)}"><i data-lucide="x"></i></button></span>`).join('');

  const customFieldsEd = (scope, list, types, addBtnAttr, addLabel) => `
    <div class="hk-list-ed" style="margin-top:8px">
      ${(list || []).map((cf, i) => `<div class="hk-row-ed" style="--cols:3;align-items:center">
        <input class="hk-input" data-cf="${scope}" data-i="${i}" data-f="label" placeholder="Field title (e.g. Figma link / Portfolio)" value="${esc(cf.label || '')}">
        <select class="hk-select" data-cf="${scope}" data-i="${i}" data-f="type">${types.map(([v, l]) => `<option value="${v}" ${cf.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="hk-check" style="font-size:.82rem"><input type="checkbox" data-cf="${scope}" data-i="${i}" data-f="required" ${cf.required ? 'checked' : ''}><span>Required</span></label>
        <button type="button" class="hk-btn icon ghost" data-cf-del="${scope}:${i}" aria-label="Remove field"><i data-lucide="trash-2"></i></button>
      </div>`).join('')}
      <button type="button" class="hk-btn sm" ${addBtnAttr}><i data-lucide="plus"></i>${addLabel}</button>
    </div>`;

  const toggleRow = (scope, askKey, reqKey, label) => {
    const obj = D[scope] || {};
    const ask = !!obj[askKey], req = !!obj[reqKey];
    return `<div class="hk-toggle-row">
      <label class="hk-check"><input type="checkbox" data-${scope === 'regFields' ? 'regf' : 'sub'}="${askKey}" ${ask || req ? 'checked' : ''}><span>${label}</span></label>
      <label class="hk-check hk-xs hk-muted"><input type="checkbox" data-${scope === 'regFields' ? 'regf' : 'sub'}="${reqKey}" ${req ? 'checked' : ''}><span>Required</span></label>
    </div>`;
  };

  const hostPhoto = C.safeUrl(hk.photoURL || S.user?.photoURL || '') || 'icon.png';
  const hostOrgName = D.contactName || hk.organiserName || hk.displayName || S.user?.displayName || 'Organiser';
  const hostOrgEmail = D.contactEmail || hk.orgEmail || S.user?.email || '';

  const body = n => ({
    1: () => `<h2 style="margin-bottom:4px">Media & brand</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">First impressions count. A good banner makes people click.</p><div class="hk-form">
      <div class="hk-field"><label>Banner <small>wide image shown on the hackathon page · 16:6</small></label>${drop('banner', 'banner', 'JPG / PNG / WebP · up to 8 MB')}</div>
      <div class="hk-field"><label>Thumbnail <small>card image · 4:3 · optional (we'll use the banner)</small></label><div style="max-width:280px">${drop('thumb', 'thumbnail', 'Square-ish works best')}</div></div>
      <div class="hk-grid2">${fText('Hackathon title', 'title', { ph: 'e.g. CodeSprint 36h', max: 80 })}${fText('Organised by', 'brandName', { ph: 'Brand / club / college name', hint: 'shown on the card', max: 60 })}</div>
      ${fText('Tagline', 'tagline', { ph: 'One line that sells it', max: 120 })}
      <div class="hk-grid2">${fText('Website', 'website', { ph: 'https://…', type: 'url', hint: 'optional' })}${fText('Community link', 'community', { ph: 'Discord / WhatsApp invite', type: 'url', hint: 'optional' })}</div>
      <div class="hk-field"><label>Tags <small>press Enter · up to 8</small></label><input class="hk-input" id="tagIn" placeholder="e.g. AI/ML, Web3…" maxlength="24"><div class="hk-tags-in" id="tagBox">${tagsHtml()}</div><div class="hk-tags-in">${SUGGEST.map(s => `<button type="button" class="hk-chip btn neutral" data-sugg="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div></div></div>`,
    2: () => `<h2 style="margin-bottom:4px">What, why & how</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">Tell participants exactly what they're signing up for.</p><div class="hk-form">
      ${fArea('About the hackathon', 'description', { rows: 7, max: 3000, ph: 'What is it? Why should students join? What will they build? What do they get?' })}
      <div class="hk-field"><label>Mode</label><div class="hk-seg" data-seg="mode"><button type="button" data-v="offline" class="${D.mode === 'offline' ? 'on' : ''}">In-person</button><button type="button" data-v="online" class="${D.mode === 'online' ? 'on' : ''}">Online</button><button type="button" data-v="hybrid" class="${D.mode === 'hybrid' ? 'on' : ''}">Hybrid</button></div></div>
      <div class="hk-field"><label>Tracks / themes <small>optional</small></label>${listEd('tracks', [{ f: 'title', ph: 'Track name' }, { f: 'desc', ph: 'Short description', area: true }], 'Add track')}</div>
      ${fArea('Eligibility', 'eligibility', { rows: 3, max: 600, ph: 'Who can join? e.g. Any UG/PG student from a recognised institute.' })}
      ${fArea('Rules', 'rules', { rows: 5, max: 2500, ph: 'Judging criteria, originality, code of conduct, what to bring…' })}
      <div class="hk-grid3">${fNum('Min team size', 'teamMin', { min: 1 })}${fNum('Max team size', 'teamMax', { min: 1, hint: '1 = solo' })}${fNum('Max participants', 'maxParticipants', { hint: '0 = unlimited' })}</div>
      ${fNum('Entry fee per team (₹)', 'fee', { hint: '0 = free', ph: '0' })}
      <div class="hk-card-s" style="padding:16px;display:grid;gap:10px">
        <div><b>Applicant registration fields <span class="hk-xs hk-muted">(Solo &amp; Team)</span></b><div class="hk-xs hk-muted">Ask participants for GitHub, LinkedIn, Portfolio/Resume, or add any custom question during registration.</div></div>
        ${toggleRow('regFields', 'askGithub', 'reqGithub', 'GitHub profile URL')}
        ${toggleRow('regFields', 'askLinkedin', 'reqLinkedin', 'LinkedIn profile URL')}
        ${toggleRow('regFields', 'askPortfolio', 'reqPortfolio', 'Portfolio / Resume link')}
        <div class="hk-divider" style="margin:4px 0">Custom applicant fields</div>
        ${customFieldsEd('regFields', D.regFields?.customFields, [['url', 'Link / URL'], ['text', 'Short text'], ['textarea', 'Long answer']], 'data-add-regfield', 'Add field')}
      </div></div>`,
    3: () => `<h2 style="margin-bottom:4px">When & where</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">Location is used to show your hackathon to nearby students and to students at your campus.</p><div class="hk-form">
      <div class="hk-grid2">${fText('College / institute', 'college', { ph: 'Hosting campus', max: 100 })}${fText('Venue', 'venue', { ph: D.mode === 'online' ? 'Platform (Zoom, Discord…)' : 'Building / hall', hint: 'optional', max: 100 })}</div>
      <div class="hk-grid2">${fText('City', 'city', { ph: 'e.g. Prayagraj', list: 'hkCityList', max: 60 })}${fText('State', 'state', { ph: 'e.g. Uttar Pradesh', max: 60 })}</div><datalist id="hkCityList">${Object.keys(C.CITIES).map(c => `<option value="${c}">`).join('')}</datalist>
      <div class="hk-card-s" style="padding:14px;display:grid;gap:10px"><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="hk-btn sm primary" data-geo="venue"><i data-lucide="map-pinned"></i>Locate venue</button><button type="button" class="hk-btn sm" data-geo="gps"><i data-lucide="crosshair"></i>Use my current location</button></div><div class="hk-sm" id="locState">${locText()}</div></div>
      <div class="hk-grid3">${fDt('Registration deadline', 'regDeadlineMs')}${fDt('Starts', 'startMs')}${fDt('Ends', 'endMs')}</div>
      <div class="hk-field"><label>Schedule / timeline <small>optional</small></label>${listEd('schedule', [{ f: 'when', ph: 'e.g. Day 1 · 10:00 AM' }, { f: 'title', ph: 'e.g. Opening ceremony' }], 'Add milestone')}</div></div>`,
    4: () => `<h2 style="margin-bottom:4px">Rounds & submissions</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">Define the stages teams move through and what they must submit for evaluation. You can add a screening test later from Manage.</p><div class="hk-form">
      <div class="hk-field"><label>Rounds <small>in order · teams start in round 1</small></label>${listEd('rounds', [{ f: 'name', ph: 'Round name' }, { f: 'startMs', ph: 'Starts', dt: true }, { f: 'endMs', ph: 'Ends', dt: true }, { f: 'desc', ph: 'What happens in this round' }], 'Add round')}</div>
      <div class="hk-card-s" style="padding:16px;display:grid;gap:12px"><b>Project submission</b>
        <label class="hk-check"><input type="checkbox" data-sub="open" ${D.submission?.open !== false ? 'checked' : ''}><span>Let teams submit idea, PPT, prototype video, or project links for evaluation</span></label>
        <div class="hk-field"><label>Submission deadline</label><input class="hk-input" type="datetime-local" data-sub="deadlineMs" data-t="dt" value="${C.toLocalInput(D.submission?.deadlineMs)}"></div>
        <div class="hk-field"><label>Instructions <small>optional</small></label><textarea class="hk-textarea" data-sub="instructions" maxlength="600" style="min-height:70px" placeholder="e.g. Upload PPT/Video on Google Drive with Anyone with the link access and paste the URL.">${esc(D.submission?.instructions || '')}</textarea></div>
        <div class="hk-divider" style="margin:2px 0">What participants submit</div>
        ${toggleRow('submission', 'askPpt', 'reqPpt', 'PPT / Pitch Deck (Drive / PDF link)')}
        ${toggleRow('submission', 'askRepo', 'reqRepo', 'GitHub / Code Repository link')}
        ${toggleRow('submission', 'askVideo', 'reqVideo', 'Prototype / Demo Video link')}
        ${toggleRow('submission', 'askIntroVideo', 'reqIntroVideo', 'Intro / Team Pitch Video link')}
        ${toggleRow('submission', 'askDemo', 'reqDemo', 'Live Demo link')}
        ${toggleRow('submission', 'askExtra', 'reqExtra', 'Other link (Figma, doc, dataset)')}
        <div class="hk-divider" style="margin:2px 0">Custom submission fields</div>
        ${customFieldsEd('submission', D.submission?.customFields, [['url', 'Link / Drive URL'], ['text', 'Short text']], 'data-add-subfield', 'Add submission field')}
      </div>
      <label class="hk-check"><input type="checkbox" ${attr('autoEmail', 'bool')} ${D.autoEmail !== false ? 'checked' : ''}><span>Send automatic emails (confirmation, shortlist, selection) to team leaders from team@campusconnectone.online, signed with your organiser name.</span></label></div>`,
    5: () => `<h2 style="margin-bottom:4px">Prizes & contact</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">Prizes attract teams. Contact details are optional—your Organised by identity is always shown subtly.</p><div class="hk-form">
      ${fNum('Total prize pool (₹)', 'prizePool', { hint: '0 if none', ph: '0' })}
      <div class="hk-field"><label>Prize breakdown</label>${listEd('prizes', [{ f: 'place', ph: 'e.g. Winner' }, { f: 'amount', ph: 'Amount ₹', num: true }, { f: 'note', ph: 'Note (e.g. + goodies)' }], 'Add prize')}</div>
      ${fArea('Perks & swag', 'perks', { rows: 3, max: 800, ph: 'Certificates, internships, mentorship, food, swag…' })}
      <div class="hk-grid2">${fText('Contact person', 'contactName', { ph: 'Optional', hint: 'optional', max: 60 })}${fText('Contact email', 'contactEmail', { type: 'email', hint: 'optional' })}</div>
      ${fText('Contact phone', 'contactPhone', { ph: 'Optional', hint: 'optional' })}
      <label class="hk-check"><input type="checkbox" ${attr('showContactPhone', 'bool')} ${D.showContactPhone ? 'checked' : ''}><span>Show contact phone publicly on the hackathon page</span></label>
      <div class="hk-org-strip">
        <img src="${esc(hostPhoto)}" alt="" onerror="this.src='icon.png'">
        <div><small>Organised by · live preview</small><b>${esc(hostOrgName)}</b>${hostOrgEmail ? `<span>${esc(hostOrgEmail)}</span>` : ''}</div>
      </div>
      <div class="hk-field"><label>FAQs <small>optional</small></label>${listEd('faqs', [{ f: 'q', ph: 'Question' }, { f: 'a', ph: 'Answer', area: true }], 'Add FAQ')}</div></div>`,
    6: () => { errs = C.validateForSubmit({ ...D, agree: true }); const ok = !errs.length;
      return `<h2 style="margin-bottom:4px">Review & submit</h2><p class="hk-muted hk-sm" style="margin-bottom:18px">${live ? 'Saving updated details will re-verify your live listing.' : 'Check your details carefully before submitting your hackathon.'}</p>
      <div class="hk-form">${blocked ? `<div class="hk-msg err"><i data-lucide="shield-alert"></i><span><b>Hosting paused:</b> You cannot publish or submit drafts until admin restores your access. Email support@campusconnectone.online.</span></div>` : ''}
      <div class="hk-card-s" style="padding:16px"><b>Checklist</b><div class="hk-checklist" style="margin-top:10px">${ok ? '<div class="ok"><i data-lucide="circle-check"></i>Everything looks good. Ready to submit.</div>' : errs.map(e => `<div class="no"><i data-lucide="circle-x"></i><span>${esc(e.msg)} · <a href="#" data-jump="${e.step}">fix in step ${e.step}</a></span></div>`).join('')}</div></div>
      ${live ? '<div class="hk-banner" style="margin:0"><i data-lucide="triangle-alert" style="color:var(--hk-warn)"></i><div class="grow"><b>This hackathon is live</b><div class="hk-sm hk-muted">Updated details are verified before returning to the live feed.</div></div></div>' : ''}
      <label class="hk-check"><input type="checkbox" ${attr('agree', 'bool')} ${D.agree ? 'checked' : ''}><span>I confirm the details are accurate, I'm authorised to host this event and I'll follow the platform's community guidelines.</span></label></div>`; }
  }[n]());
  const locText = () => D.lat != null ? `<span style="color:var(--hk-ok);font-weight:700"><i data-lucide="circle-check" class="hk-ic" style="vertical-align:-4px"></i> Located · ${(+D.lat).toFixed(4)}, ${(+D.lng).toFixed(4)}</span>` : '<span class="hk-muted">Not located yet. Tap “Locate venue” so nearby students can find you.</span>';

  /* --- paint --- */
  const paint = () => {
    view.innerHTML = `<div class="hk-view"><div class="hk-page-h"><div><span class="hk-eyebrow" style="color:var(--hk-gold)">Host · ${isNew ? 'new hackathon' : 'edit'}</span><h1>${isNew ? 'Create a hackathon' : esc(D.title || 'Edit hackathon')}</h1></div><div style="display:flex;gap:8px;align-items:center">${statusBadge(D.status)}<a class="hk-btn ghost sm" href="${esc(cx.backHash || '#/host')}">Exit</a></div></div>
      ${['changes_requested', 'rejected'].includes(D.status) && D.adminNote ? `<div class="hk-msg err" style="margin-bottom:16px"><i data-lucide="message-square-warning"></i><span><b>Admin note:</b> ${esc(D.adminNote)}</span></div>` : ''}
      ${restored ? '<div class="hk-msg ok" style="margin-bottom:16px"><i data-lucide="history"></i><span>Restored your unsaved draft from this device.</span></div>' : ''}
      <div class="hk-stepper" id="stepper">${STEPS.map(([ic, l], i) => `<button type="button" data-step="${i + 1}"><span class="n">${i + 1}</span>${l}</button>`).join('')}</div>
      <div class="hk-wiz"><section class="hk-glass hk-wiz-main" id="stepBody"></section><aside class="hk-sidecard"><div class="hk-eyebrow">Live card preview</div><div id="prev" style="pointer-events:none"></div><div class="hk-card-s hk-sm hk-muted"><b style="color:var(--hk-ink)">Tip</b><br>Your draft is saved to your account whenever you change step, and kept on this device as you type.</div></aside></div></div>`;
    paintStep();
  };
  const preview = () => { const el = $('#prev'); if(el) { el.innerHTML = card({ ...D, _phase: C.phase({ ...D, status: 'approved' }), hostVerified: D.hostVerified || hk.hostVerified || false, regCount: D.regCount || 0 }); icons(); } };
  const paintStep = () => {
    $$('#stepper button').forEach((b, i) => { b.classList.toggle('on', i + 1 === step); b.classList.toggle('done', i + 1 < step); });
    const last = step === 6;
    $('#stepBody').innerHTML = body(step) + `<div class="hk-wiz-nav"><div style="display:flex;gap:8px">${step > 1 ? '<button type="button" class="hk-btn" data-go="-1"><i data-lucide="arrow-left"></i>Back</button>' : ''}${!live && !blocked ? '<button type="button" class="hk-btn ghost" data-save>Save draft</button>' : ''}</div>
      ${last ? `<button type="button" class="hk-btn gold lg" data-submit ${blocked ? 'disabled title="Hosting paused — publishing disabled"' : ''}><i data-lucide="send"></i>${blocked ? 'Publishing paused' : live ? 'Save & resubmit' : 'Submit for approval'}</button>` : '<button type="button" class="hk-btn primary" data-go="1">Next<i data-lucide="arrow-right"></i></button>'}</div>`;
    preview(); icons();
    $('#stepper button.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  /* --- persistence --- */
  const backup = C.debounce(() => { if(isNew) try { localStorage.setItem(BK, JSON.stringify(D)); } catch {} }, 500);
  async function persist(kind){
    if(blocked){
      toast('Hosting is paused by admin. You cannot publish or create new hackathons.', 'error');
      return false;
    }
    if(saving) return false; saving = true;
    try {
      const status = kind === 'submit' ? 'pending' : (['approved', 'pending'].includes(D.status) ? D.status : 'draft');
      if(kind === 'submit'){ await C.submitForApproval({ ...D, agree: true }, S.user, S.hk); D.status = 'pending'; D.adminNote = ''; }
      else { await C.saveHackathon({ ...D, status }, S.user, S.hk); D.status = status; }
      if(isNew){ isNew = false; try { localStorage.removeItem(BK); } catch {} }
      dirty = false; S.mine = null; return true;
    } catch(e){
      if(e.errs){ errs = e.errs; throw e; }
      toast(/permission|insufficient/i.test(e.message) ? 'Could not save. Hackathon rules may not be deployed yet.' : e.message, 'error'); return false;
    } finally { saving = false; }
  }
  const go = async n => {
    if(n === step) return; if(dirty && (D.title || '').trim() && !live && !blocked) await persist('draft');
    step = Math.max(1, Math.min(6, n)); paintStep(); scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* --- events (delegated) --- */
  const root = view;
  root.oninput = root.onchange = e => {
    const t = e.target;
    if(t.matches('[data-k]')){
      const k = t.dataset.k, ty = t.dataset.t;
      D[k] = ty === 'num' ? (t.value === '' ? 0 : Math.max(0, Number(t.value))) : ty === 'dt' ? C.fromLocalInput(t.value) : ty === 'bool' ? t.checked : t.value;
      const c = $(`[data-count="${k}"]`); if(c) c.textContent = `${(D[k] || '').length}/${t.maxLength}`;
      if(['city'].includes(k) && e.type === 'change'){ const f = C.findCity(D.city); if(f && !D.state) { D.state = f.state; const s = $('#f_state'); if(s) s.value = f.state; } }
    } else if(t.matches('[data-l]')){
      const row = D[t.dataset.l][+t.dataset.i]; row[t.dataset.f] = t.dataset.t === 'num' ? (t.value === '' ? '' : Number(t.value)) : t.dataset.t === 'dt' ? C.fromLocalInput(t.value) : t.value;
    } else if(t.matches('[data-regf]')){
      const k = t.dataset.regf; D.regFields = { ...(D.regFields || {}) };
      D.regFields[k] = t.checked;
      if(k.startsWith('req') && t.checked){ const askKey = 'ask' + k.slice(3); D.regFields[askKey] = true; const askEl = $(`[data-regf="${askKey}"]`, root); if(askEl) askEl.checked = true; }
      if(k.startsWith('ask') && !t.checked){ const reqKey = 'req' + k.slice(3); D.regFields[reqKey] = false; const reqEl = $(`[data-regf="${reqKey}"]`, root); if(reqEl) reqEl.checked = false; }
    } else if(t.matches('[data-sub]')){
      const k = t.dataset.sub; D.submission = { ...(D.submission || {}) };
      D.submission[k] = t.type === 'checkbox' ? t.checked : t.dataset.t === 'dt' ? C.fromLocalInput(t.value) : t.value;
      if(k.startsWith('req') && t.checked){ const askKey = 'ask' + k.slice(3); D.submission[askKey] = true; const askEl = $(`[data-sub="${askKey}"]`, root); if(askEl) askEl.checked = true; }
      if(k.startsWith('ask') && !t.checked){ const reqKey = 'req' + k.slice(3); D.submission[reqKey] = false; const reqEl = $(`[data-sub="${reqKey}"]`, root); if(reqEl) reqEl.checked = false; }
    } else if(t.matches('[data-cf]')){
      const scope = t.dataset.cf, idx = +t.dataset.i, field = t.dataset.f;
      D[scope] = { ...(D[scope] || {}), customFields: [...(D[scope]?.customFields || [])] };
      const item = { ...(D[scope].customFields[idx] || {}) };
      item[field] = t.type === 'checkbox' ? t.checked : t.value;
      D[scope].customFields[idx] = item;
    } else if(t.matches('[data-up]') && e.type === 'change') return upload(t);
    else return;
    dirty = true; backup(); C.debounce(preview, 200)();
  };
  root.onkeydown = e => {
    if(e.target.id === 'tagIn' && (e.key === 'Enter' || e.key === ',')){ e.preventDefault(); addTag(e.target.value); e.target.value = ''; }
  };
  const addTag = v => { const t = v.replace(/[#,]/g, '').trim().slice(0, 24); if(!t || D.tags.length >= 8 || D.tags.some(x => x.toLowerCase() === t.toLowerCase())) return; D.tags.push(t); $('#tagBox').innerHTML = tagsHtml(); dirty = true; backup(); preview(); icons(); };
  async function upload(inp){
    const kind = inp.dataset.up, f = inp.files[0]; if(!f) return;
    const lab = inp.closest('.hk-drop'), dz = lab.querySelector('.dz'); dz.innerHTML = '<span class="hk-spin"></span><span>Uploading… 0%</span>';
    try {
      const url = await C.uploadImage(f, { uid: S.user.uid, hid: D.id, kind }, pct => {
        dz.innerHTML = `<span class="hk-spin"></span><span>Uploading… ${pct}%</span>`;
      });
      D[kind === 'banner' ? 'bannerURL' : 'thumbURL'] = url;
      lab.classList.add('has'); lab.style.backgroundImage = `url('${url.replace(/'/g, '%27')}')`; dirty = true; backup(); preview();
      dz.innerHTML = `<i data-lucide="refresh-cw"></i><span>Change ${kind}</span><small>Uploaded ✓</small>`;
    } catch(e){ toast(e.message, 'error'); dz.innerHTML = `<i data-lucide="image-up"></i><span>Upload ${kind}</span><small>Try again</small>`; }
    inp.value = ''; icons();
  }
  async function geo(kind, btn){
    const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="hk-spin"></span> Locating…';
    try {
      let p = null;
      if(kind === 'gps'){ const g = await C.locateGps(); p = { lat: g.lat, lng: g.lng }; if(!D.city){ D.city = g.city; D.state = g.state; $('#f_city') && ($('#f_city').value = g.city); $('#f_state') && ($('#f_state').value = g.state); } }
      else {
        const tries = [[D.venue, D.college, D.city, D.state], [D.college, D.city, D.state], [D.city, D.state]].map(a => a.filter(Boolean).join(', ')).filter(Boolean);
        for(const q of tries){ const r = await C.forwardGeocode(q + ', India'); if(r){ p = r; break; } }
        if(!p){ const c = C.findCity(D.city); if(c) p = { lat: c.lat, lng: c.lng }; }
        if(!p) throw new Error('Could not locate that place. Check the city and try again.');
      }
      D.lat = +p.lat; D.lng = +p.lng; dirty = true; backup(); $('#locState').innerHTML = locText(); toast('Venue located');
    } catch(e){ toast(e.message, 'error'); }
    btn.disabled = false; btn.innerHTML = old; icons();
  }
  root.onclick = async e => {
    const t = e.target;
    const st = t.closest('[data-step]'); if(st) return go(+st.dataset.step);
    const g = t.closest('[data-go]'); if(g) return go(step + +g.dataset.go);
    const j = t.closest('[data-jump]'); if(j){ e.preventDefault(); return go(+j.dataset.jump); }
    const seg = t.closest('[data-seg] [data-v]'); if(seg){ D.mode = seg.dataset.v; $$('[data-seg] button').forEach(b => b.classList.toggle('on', b === seg)); dirty = true; backup(); preview(); return; }
    if(t.closest('[data-add-regfield]')){ D.regFields = { ...(D.regFields || {}), customFields: [...(D.regFields?.customFields || []), { id: 'rf_' + Date.now().toString(36), label: '', type: 'url', required: false }] }; dirty = true; return paintStepKeep(); }
    if(t.closest('[data-add-subfield]')){ D.submission = { ...(D.submission || {}), customFields: [...(D.submission?.customFields || []), { id: 'sf_' + Date.now().toString(36), label: '', type: 'url', required: false }] }; dirty = true; return paintStepKeep(); }
    const cfd = t.closest('[data-cf-del]');
    if(cfd){ const [scope, i] = cfd.dataset.cfDel.split(':'); if(D[scope]?.customFields){ D[scope].customFields.splice(+i, 1); dirty = true; return paintStepKeep(); } }
    const ad = t.closest('[data-add]'); if(ad){ const n = ad.dataset.add; D[n].push(({ tracks: { title: '', desc: '' }, schedule: { when: '', title: '' }, prizes: { place: '', amount: '', note: '' }, faqs: { q: '', a: '' }, rounds: { name: '', desc: '', startMs: 0, endMs: 0 } })[n]); dirty = true; return paintStepKeep(); }
    const de = t.closest('[data-del]'); if(de && de.dataset.del.includes(':')){ const [n, i] = de.dataset.del.split(':'); D[n].splice(+i, 1); if(!D[n].length) D[n].push(({ tracks: { title: '', desc: '' }, schedule: { when: '', title: '' }, prizes: { place: '', amount: '', note: '' }, faqs: { q: '', a: '' }, rounds: { name: '', desc: '', startMs: 0, endMs: 0 } })[n]); dirty = true; return paintStepKeep(); }
    const tr = t.closest('[data-tagrm]'); if(tr){ D.tags.splice(+tr.dataset.tagrm, 1); $('#tagBox').innerHTML = tagsHtml(); dirty = true; backup(); preview(); icons(); return; }
    const sg = t.closest('[data-sugg]'); if(sg) return addTag(sg.dataset.sugg);
    const ge = t.closest('[data-geo]'); if(ge) return geo(ge.dataset.geo, ge);
    if(t.closest('[data-save]')){ if(blocked) return toast('Hosting is paused by admin.', 'error'); const b = t.closest('[data-save]'); b.disabled = true; if(await persist('draft')) toast('Draft saved'); b.disabled = false; return; }
    const sb = t.closest('[data-submit]');
    if(sb){
      if(blocked) return toast('Hosting is paused. You cannot publish or submit drafts.', 'error');
      if(!D.agree){ errs = C.validateForSubmit(D); }
      sb.disabled = true; const o = sb.innerHTML; sb.innerHTML = '<span class="hk-spin"></span> Submitting…';
      try { if(await persist('submit')){ toast(live ? 'Resubmitted for approval' : 'Submitted for approval. We will notify you.'); cx.nav(cx.backHash || '#/host'); } }
      catch(err){ if(err.errs){ toast('Please complete the checklist first.', 'error'); step = 6; paintStep(); } }
      sb.disabled = false; sb.innerHTML = o; icons();
    }
  };
  function paintStepKeep(){ const y = scrollY; paintStep(); scrollTo(0, y); }

  paint();
  cx.S.cleanup = () => { root.oninput = root.onchange = root.onkeydown = root.onclick = null; };
}
