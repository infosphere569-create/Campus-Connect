import {setUserSuspension,setUserRole} from "./admin-control.js";
import {listAuditLogs} from "./admin-data.js";
import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,hasRole} from './auth.js';
import {collection,collectionGroup,getDocs,getCountFromServer,query,orderBy,limit,startAfter,where,updateDoc,doc,deleteDoc,addDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { $, $$, escapeHtml, formatDateTime, timeAgo, toast, showModal, initials } from './utils.js';
import { getNewsletterSubscribers, broadcastNewsletter } from './services.js';

let adminProfile = null;
let activeTab = 'overview';
let rawReports = [], rawUsers = [], rawPosts = [], rawGroups = [], rawIssues = [];
let userCursor = null;

function errorBox(msg){return `<div class="card empty"><i data-lucide="alert-triangle"></i><h3>Could not load this</h3><p class="muted">${escapeHtml(msg)}</p></div>`}
function errorRow(cols,msg){return `<tr><td colspan="${cols}" class="muted">${escapeHtml(msg)}</td></tr>`}

async function count(name,q){if(!db)return '—';try{return (await getCountFromServer(q||collection(db,name))).data().count}catch{return '—'}}

async function loadStats(){
 const jobs=[
  ['users',count('users')],
  ['posts',count('posts')],
  ['comments',count('comments',collectionGroup(db,'comments'))],
  ['groups',count('groups')],
  ['groupRequests',count('groupRequests',query(collection(db,'groupRequests'),where('status','==','pending')))],
  ['issues',count('issues',query(collection(db,'issues'),where('status','in',['Open','Under Review','In Progress'])))],
  ['reports',count('reports')],
  ['events',count('events')],
 ];
 for(const [key,job] of jobs){
   const val = await job;
   const el=$(`[data-stat="${key}"]`);
   if(el)el.textContent=val;
   if(key==='groupRequests'){
     const b=$('#badgePendingRequests');
     if(b){ b.textContent=val; b.hidden = (val==='—'||val===0||val==='0'); }
   }
 }
}

// Tab Switching
function switchTab(tabName){
  activeTab = tabName;
  $$('.admin-nav-tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tabName));
  $$('.admin-panel').forEach(p=>p.classList.toggle('active',p.dataset.adminPanel===tabName));
  loadTab(tabName);
}

function loadTab(tabName){
  switch(tabName){
    case 'overview': loadReports(); break;
    case 'users': if(!rawUsers.length) loadUsers(true); else renderUsers(); break;
    case 'posts': loadPosts(); break;
    case 'groups': loadGroups(); loadGroupsTable(); break;
    case 'requests': loadGroupRequests(); break;
    case 'issues': loadIssues(); break;
    case 'events': loadEvents(); break;
    case 'newsletter': loadNewsletter(); break;
    case 'audit': loadAudit(); break;
  }
}

// Reports / Overview
async function loadReports(){
  if(!db)return;
  try{
    const snap=await getDocs(query(collection(db,'reports'),orderBy('createdAt','desc'),limit(30)));
    rawReports=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderReports();
  }catch(e){
    $('[data-report-rows]').innerHTML=errorRow(5,e.message||'Could not load moderation queue.');
  }
}

function renderReports(){
  const filter = $('#reportFilterChips .chip.active')?.dataset.reportFilter||'all';
  const filtered = filter==='all' ? rawReports : rawReports.filter(r=>(r.status||'pending')===filter);
  const tbody = $('[data-report-rows]');
  if(!tbody)return;
  tbody.innerHTML = filtered.length ? filtered.map(r=>`<tr>
    <td><span class="badge primary">${escapeHtml(r.type||'General')}</span></td>
    <td><strong>${escapeHtml(r.reason||'No details')}</strong></td>
    <td><span class="badge ${r.status==='resolved'?'success':r.status==='dismissed'?'muted':'warning'}">${escapeHtml(r.status||'pending')}</span></td>
    <td class="small muted">${formatDateTime(r.createdAt)}</td>
    <td><button class="btn sm" data-review-report="${r.id}"><i data-lucide="shield-check"></i>Review</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="muted">No reports found in this view.</td></tr>';
  window.lucide?.createIcons();
}

// Users
async function loadUsers(reset=true){
  if(!db)return;
  const box=$('[data-user-rows]');
  const loadMoreBtn=$('#loadMoreUsers');
  if(reset){userCursor=null;rawUsers=[];box.innerHTML='<tr><td colspan="7" class="muted">Loading users…</td></tr>'}
  try{
    const constraints=[collection(db,'users'),orderBy('createdAt','desc'),limit(25)];
    if(userCursor)constraints.splice(1,0,startAfter(userCursor));
    const snap=await getDocs(query(...constraints));
    userCursor=snap.docs.at(-1)||userCursor;
    const newRows=snap.docs.map(d=>({id:d.id,...d.data()}));
    rawUsers=reset?newRows:rawUsers.concat(newRows);
    renderUsers();
    if(loadMoreBtn)loadMoreBtn.hidden=snap.docs.length<25;
  }catch(e){
    box.innerHTML=errorRow(7,e.message||'Could not load users.');
    if(loadMoreBtn)loadMoreBtn.hidden=true;
  }
}

function renderUsers(){
  const box=$('[data-user-rows]');
  if(!box)return;
  const term=($('#userSearch')?.value||'').trim().toLowerCase();
  const roleFilter=$('#userRoleFilter')?.value||'all';
  const statusFilter=$('#userStatusFilter')?.value||'all';

  const rows=rawUsers.filter(u=>{
    const matchTerm = !term || (u.displayName||'').toLowerCase().includes(term) || (u.email||'').toLowerCase().includes(term) || (u.branch||'').toLowerCase().includes(term);
    const matchRole = roleFilter==='all' || (u.role||'student')===roleFilter;
    const matchStatus = statusFilter==='all' || (statusFilter==='suspended' ? !!u.suspended : !u.suspended);
    return matchTerm && matchRole && matchStatus;
  });

  box.innerHTML=rows.length?rows.map(u=>`<tr data-user-row="${u.id}">
    <td><div class="row" style="align-items:center;gap:10px"><div class="avatar sm">${u.photoURL?`<img src="${escapeHtml(u.photoURL)}" alt="">`:initials(u.displayName)}</div><div><strong>${escapeHtml(u.displayName||'Student')}</strong><div class="small muted">${escapeHtml(u.email||'')}</div></div></div></td>
    <td class="small muted">${escapeHtml([u.course,u.branch,u.year].filter(Boolean).join(' • ')||'—')}</td>
    <td class="small muted">${escapeHtml(u.college||'—')}</td>
    <td>
      <select class="btn sm" data-role-select data-uid="${u.id}">
        <option value="student" ${u.role==='student'||!u.role?'selected':''}>Student</option>
        <option value="moderator" ${u.role==='moderator'?'selected':''}>Moderator</option>
        <option value="platformAdmin" ${u.role==='platformAdmin'?'selected':''}>Platform Admin</option>
      </select>
    </td>
    <td><span class="badge ${u.suspended?'danger':'success'}">${u.suspended?'Suspended':'Active'}</span></td>
    <td class="small muted">${formatDateTime(u.createdAt)}</td>
    <td><button class="btn sm ${u.suspended?'':'danger'}" data-toggle-suspend="${u.id}" data-state="${!!u.suspended}">${u.suspended?'Reactivate':'Suspend'}</button></td>
  </tr>`).join(''):'<tr><td colspan="7" class="muted">No matching users found.</td></tr>';
}

// Posts
function postRow(p){
  const status=p.reportCount>0?`<span class="badge warning">${p.reportCount} report${p.reportCount===1?'':'s'}</span>`:'<span class="badge success">Clean</span>';
  return `<article class="card" style="padding:16px" data-admin-post="${p.id}">
    <div class="split" style="align-items:flex-start">
      <div style="min-width:0">
        <div class="row small muted" style="gap:6px">
          <strong style="color:var(--text)">${escapeHtml(p.authorName||'Campus Student')}</strong> · ${timeAgo(p.createdAt)}
        </div>
        <p style="margin:8px 0">${escapeHtml((p.text||'').slice(0,240))}${(p.text||'').length>240?'…':''}</p>
        ${p.imageURL?`<img src="${escapeHtml(p.imageURL)}" alt="" style="max-width:160px;max-height:100px;object-fit:cover;border-radius:10px;display:block;margin-bottom:8px">`:''}
        <div class="small muted">${p.likes||0} likes · ${p.comments||0} comments · ${status}</div>
      </div>
      <div class="toolbar">
        <a class="btn sm" href="feed.html?post=${encodeURIComponent(p.id)}"><i data-lucide="eye"></i>View</a>
        <button class="btn sm danger" data-remove-post="${p.id}"><i data-lucide="trash-2"></i>Remove</button>
      </div>
    </div>
  </article>`;
}

async function loadPosts(){
  if(!db)return;
  const box=$('[data-admin-posts]');
  try{
    const snap=await getDocs(query(collection(db,'posts'),orderBy('createdAt','desc'),limit(30)));
    rawPosts=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderPosts();
  }catch(e){
    box.innerHTML=errorBox(e.message||'Could not load posts.');
  }
}

function renderPosts(){
  const box=$('[data-admin-posts]');
  if(!box)return;
  const filter = $('#postFilterChips .chip.active')?.dataset.postFilter||'all';
  const filtered = filter==='reported' ? rawPosts.filter(p=>(p.reportCount||0)>0) : rawPosts;
  box.innerHTML=filtered.length ? filtered.map(postRow).join('') : '<div class="empty"><i data-lucide="file-text"></i><h3>No posts found</h3></div>';
  window.lucide?.createIcons();
}

// Groups
async function loadGroups(){
  if(!db)return;
  const box=$('[data-pending-groups]');
  try{
    const snap=await getDocs(query(collection(db,'groups'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));
    const pendingCount = snap.docs.length;
    const badge=$('#badgePendingGroups');
    if(badge){ badge.textContent=pendingCount; badge.hidden = pendingCount===0; }
    box.innerHTML=pendingCount?snap.docs.map(d=>{
      const g=d.data();
      return `<div class="moderation-item"><div><strong>${escapeHtml(g.name)}</strong><div class="small muted">${escapeHtml(g.category||'Community')} · ${formatDateTime(g.createdAt)}</div><p class="small muted">${escapeHtml(g.description||'')}</p></div><div class="toolbar"><a class="btn sm" href="group.html?id=${encodeURIComponent(d.id)}">View</a><button class="btn sm primary" data-approve-group="${d.id}">Approve</button><button class="btn sm danger" data-reject-group="${d.id}">Reject</button></div></div>`;
    }).join(''):'<div class="empty"><i data-lucide="check-circle-2"></i><h3>No groups awaiting approval</h3></div>';
    window.lucide?.createIcons();
  }catch(e){
    box.innerHTML=errorBox(e.message||'Could not load group approvals.');
  }
}

async function loadGroupsTable(){
  if(!db)return;
  try{
    const snap=await getDocs(query(collection(db,'groups'),orderBy('createdAt','desc'),limit(50)));
    rawGroups=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderGroupsTable();
  }catch(e){
    $('[data-group-rows]').innerHTML=errorRow(6,e.message||'Could not load groups.');
  }
}

function renderGroupsTable(){
  const tbody=$('[data-group-rows]');
  if(!tbody)return;
  const term=($('#groupSearchInput')?.value||'').trim().toLowerCase();
  const rows=term ? rawGroups.filter(g=>(g.name||'').toLowerCase().includes(term)||(g.category||'').toLowerCase().includes(term)) : rawGroups;
  tbody.innerHTML=rows.length?rows.map(g=>`<tr data-group-row="${g.id}">
    <td><strong>${escapeHtml(g.name||'Untitled Group')}</strong></td>
    <td><span class="badge">${escapeHtml(g.category||'General')}</span></td>
    <td>${Number(g.memberCount||0)}</td>
    <td><span class="badge ${g.status==='approved'?'success':g.status==='rejected'||g.status==='banned'?'danger':'warning'}">${escapeHtml(g.status||'pending')}</span></td>
    <td class="small muted">${formatDateTime(g.createdAt)}</td>
    <td>
      <div class="toolbar">
        <a class="btn sm" href="group.html?id=${encodeURIComponent(g.id)}">View</a>
        <button class="btn sm" data-manage-members="${g.id}">Members</button>
        ${g.status==='pending'?`<button class="btn sm primary" data-approve-group="${g.id}">Approve</button><button class="btn sm danger" data-reject-group="${g.id}">Reject</button>`:g.status==='banned'?`<button class="btn sm primary" data-unban-group="${g.id}">Unban</button>`:`<button class="btn sm danger" data-ban-group="${g.id}">Ban</button>`}
      </div>
    </td>
  </tr>`).join(''):'<tr><td colspan="6" class="muted">No groups found.</td></tr>';
}

async function manageMembers(groupId){
  showModal('Manage Group Members','<div class="stack" id="memberList"><div class="skeleton" style="height:60px"></div></div>');
  window.lucide?.createIcons();
  const box=$('#memberList');
  try{
    const snap=await getDocs(query(collection(db,'groupMembers'),where('groupId','==',groupId),limit(50)));
    if(!snap.docs.length){box.innerHTML='<div class="empty"><h3>No members yet</h3></div>';return}
    box.innerHTML=snap.docs.map(d=>{
      const m=d.data();
      return `<div class="moderation-item"><div><strong>${escapeHtml(m.displayName||m.uid)}</strong><div class="small muted">Joined ${formatDateTime(m.joinedAt)}</div></div><select class="btn sm" data-member-role data-doc-id="${d.id}"><option value="member" ${(!m.role||m.role==='member')?'selected':''}>Member</option><option value="moderator" ${m.role==='moderator'?'selected':''}>Group Moderator</option><option value="admin" ${m.role==='admin'?'selected':''}>Group Admin</option></select></div>`;
    }).join('');
  }catch(e){
    box.innerHTML=errorBox(e.message||'Could not load members.');
  }
}

// Issues
async function loadIssues(){
  if(!db)return;
  const box=$('[data-admin-issues]');
  try{
    const snap=await getDocs(query(collection(db,'issues'),orderBy('createdAt','desc'),limit(25)));
    rawIssues=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderIssues();
  }catch(e){
    box.innerHTML=errorBox(e.message||'Could not load issues.');
  }
}

function renderIssues(){
  const box=$('[data-admin-issues]');
  if(!box)return;
  const statusFilter=$('#issueStatusFilter')?.value||'all';
  const filtered = statusFilter==='all' ? rawIssues : rawIssues.filter(i=>(i.status||'Open')===statusFilter);

  box.innerHTML=filtered.length?filtered.map(d=>`<div class="card" style="padding:16px">
    <div class="split" style="align-items:flex-start">
      <div>
        <div class="row" style="gap:8px;margin-bottom:4px">
          <span class="badge primary"><i data-lucide="shield-check"></i> Anonymous Student</span>
          <span class="badge ${d.status==='Resolved'?'success':d.status==='In Progress'?'warning':'primary'}">${escapeHtml(d.status||'Open')}</span>
          <span class="badge">${escapeHtml(d.category||'Other')}</span>
        </div>
        <strong>${escapeHtml(d.title)}</strong>
        <p class="small muted" style="margin:6px 0">${escapeHtml(d.description||'')}</p>
        <div class="small muted">${d.supportCount||0} supports · ${escapeHtml(d.location||'Campus')} · ${formatDateTime(d.createdAt)}</div>
        ${d.adminResponse?`<div class="notice" style="margin-top:10px;font-size:.85rem"><strong>Admin Response:</strong> ${escapeHtml(d.adminResponse)}</div>`:''}
      </div>
      <button class="btn sm" data-admin-issue="${d.id}"><i data-lucide="pencil"></i>Update</button>
    </div>
  </div>`).join(''):'<div class="empty"><i data-lucide="circle-alert"></i><h3>No issues found</h3></div>';
  window.lucide?.createIcons();
}

// Events
async function loadEvents(){
  if(!db)return;
  const pendingBox=$('[data-pending-events]');
  if(pendingBox){
    try{
      const psnap=await getDocs(query(collection(db,'events'),where('status','==','pending'),orderBy('createdAt','desc'),limit(20)));
      pendingBox.innerHTML=psnap.docs.length?psnap.docs.map(d=>{
        const ev=d.data();
        return `<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-event="${d.id}">Approve</button><button class="btn sm danger" data-reject-event="${d.id}">Reject</button></div></div>`;
      }).join(''):'<div class="empty"><i data-lucide="check-circle-2"></i><h3>No events awaiting approval</h3></div>';
      window.lucide?.createIcons();
    }catch(e){pendingBox.innerHTML=errorBox(e.message||'Could not load pending events.')}
  }
  const box=$('[data-admin-events]');
  try{
    const snap=await getDocs(query(collection(db,'events'),orderBy('date','asc'),limit(30)));
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
    box.innerHTML=rows.length?rows.map(ev=>`<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong> <span class="badge ${ev.status==='approved'?'success':ev.status==='rejected'?'danger':'warning'}">${escapeHtml(ev.status||'pending')}</span><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><span class="badge">${Number(ev.interestedCount||0)} interested</span><button class="btn sm danger" data-remove-event="${ev.id}">Remove</button></div></div>`).join(''):'<div class="empty"><i data-lucide="calendar"></i><h3>No events yet</h3></div>';
    window.lucide?.createIcons();
  }catch(e){box.innerHTML=errorBox(e.message||'Could not load events.')}
}

// Audit Log
async function loadAudit(){
  if(!db)return;
  const box=$('[data-audit-rows]');
  try{
    const rows=await listAuditLogs();
    box.innerHTML=rows.length?rows.map(a=>`<tr><td><strong>${escapeHtml(a.action||'')}</strong></td><td class="small muted">${escapeHtml(a.actorUid||'—')}</td><td class="small muted">${escapeHtml(a.targetId||'—')}</td><td class="small muted">${formatDateTime(a.createdAt)}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">No audit entries logged yet.</td></tr>';
  }catch(e){box.innerHTML=errorRow(4,e.message||'Could not load audit log.')}
}

// Group Requests
async function loadGroupRequests(){
  if(!db)return;
  const box=$('[data-group-requests]');
  try{
    const snap=await getDocs(query(collection(db,'groupRequests'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));
    box.innerHTML=snap.docs.length?snap.docs.map(d=>{
      const r=d.data();
      return `<div class="moderation-item"><div><strong>${escapeHtml(r.displayName||'A student')}</strong><div class="small muted">Wants to join ${escapeHtml(r.groupName||'a group')} · ${formatDateTime(r.createdAt)}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-request="${d.id}">Approve</button><button class="btn sm" data-reject-request="${d.id}">Reject</button></div></div>`;
    }).join(''):'<div class="empty"><h3>No pending requests</h3></div>';
    window.lucide?.createIcons();
  }catch(e){box.innerHTML=errorBox(e.message||'Could not load membership requests.')}
}

// Action Handlers
async function reviewReport(id){
  showModal('Review Report','<form class="form" id="reportReview"><div class="field"><label>Decision</label><select name="status"><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div><div class="field"><label>Internal Moderator Note</label><textarea name="note" maxlength="500" placeholder="Notes for team..."></textarea></div><div id="reviewError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Save Review</button></div></form>');
  $('#reportReview')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.currentTarget.querySelector('button[type="submit"]');
    btn.disabled=true;
    try{
      const fd=new FormData(e.currentTarget);
      const status=String(fd.get('status')),note=String(fd.get('note')||'');
      try{
        await httpsCallable(getFunctions(),'reviewReport')({reportId:id,status,note});
      }catch(e){
        if(db)await updateDoc(doc(db,'reports',id),{status,moderatorNote:note,reviewedAt:serverTimestamp()});
      }
      document.querySelector('.modal-backdrop')?.remove();
      toast('Report reviewed');
      loadReports();
      loadStats();
    }catch(err){
      btn.disabled=false;
      $('#reviewError').textContent=err.message||'Could not save this review.';
    }
  });
}

async function updateIssue(id){
  showModal('Update Campus Issue','<form class="form" id="issueReview"><div class="field"><label>Status</label><select name="status"><option>Open</option><option>Under Review</option><option>In Progress</option><option>Resolved</option><option>Closed</option></select></div><div class="field"><label>Official Public Response</label><textarea name="response" maxlength="1000" placeholder="What progress or action has been taken?"></textarea></div><div id="issueReviewError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Publish Update</button></div></form>');
  $('#issueReview')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.currentTarget.querySelector('button[type="submit"]');
    btn.disabled=true;
    try{
      const fd=new FormData(e.currentTarget);
      await updateDoc(doc(db,'issues',id),{status:fd.get('status'),adminResponse:String(fd.get('response')||''),updatedAt:serverTimestamp()});
      document.querySelector('.modal-backdrop')?.remove();
      toast('Issue updated successfully');
      loadIssues();
      loadStats();
    }catch(err){
      btn.disabled=false;
      $('#issueReviewError').textContent=err.message||'Could not update this issue.';
    }
  });
}

// Global Listeners
document.addEventListener('click',async e=>{
  const tabBtn=e.target.closest('[data-admin-tabs] .tab');
  if(tabBtn){ switchTab(tabBtn.dataset.tab); return; }

  if(e.target.closest('#refreshAdminBtn')){
    const btn=e.target.closest('#refreshAdminBtn');
    btn.disabled=true;
    toast('Refreshing admin data...');
    await loadStats();
    await loadTab(activeTab);
    btn.disabled=false;
    return;
  }

  const r=e.target.closest('[data-review-report]');if(r)return reviewReport(r.dataset.reviewReport);

  const a=e.target.closest('[data-approve-group]');
  if(a){
    a.disabled=true;
    try{
      await updateDoc(doc(db,'groups',a.dataset.approveGroup),{status:'approved',approvedBy:adminProfile.uid,approvedAt:serverTimestamp()});
      toast('Group approved');
      loadGroups();loadGroupsTable();loadStats();
    }catch(err){toast(err.message,'error');a.disabled=false}
    return;
  }

  const reject=e.target.closest('[data-reject-group]');
  if(reject){
    showModal('Reject Group Proposal','<form id="rejectForm" class="form"><div class="field"><label>Rejection Reason</label><textarea name="reason" required maxlength="500" placeholder="Specify reason..."></textarea></div><button class="btn danger" type="submit">Reject Proposal</button></form>');
    $('#rejectForm')?.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const fd=new FormData(ev.currentTarget);
      try{
        await updateDoc(doc(db,'groups',reject.dataset.rejectGroup),{status:'rejected',rejectionReason:String(fd.get('reason')),reviewedBy:adminProfile.uid,reviewedAt:serverTimestamp()});
        document.querySelector('.modal-backdrop')?.remove();
        toast('Group rejected');
        loadGroups();loadGroupsTable();
      }catch(err){toast(err.message,'error')}
    });
    return;
  }

  const manage=e.target.closest('[data-manage-members]');if(manage)return manageMembers(manage.dataset.manageMembers);

  const banGroup=e.target.closest('[data-ban-group]');
  if(banGroup){
    if(!confirm('Ban this group? It will be hidden immediately.'))return;
    banGroup.disabled=true;
    try{
      await updateDoc(doc(db,'groups',banGroup.dataset.banGroup),{status:'banned',bannedBy:adminProfile.uid,bannedAt:serverTimestamp()});
      toast('Group banned');loadGroupsTable();loadStats();
    }catch(err){toast(err.message||'Could not ban group.','error');banGroup.disabled=false}
    return;
  }

  const unbanGroup=e.target.closest('[data-unban-group]');
  if(unbanGroup){
    unbanGroup.disabled=true;
    try{
      await updateDoc(doc(db,'groups',unbanGroup.dataset.unbanGroup),{status:'approved',bannedBy:null,bannedAt:null});
      toast('Group unbanned');loadGroupsTable();loadStats();
    }catch(err){toast(err.message||'Could not unban group.','error');unbanGroup.disabled=false}
    return;
  }

  const ar=e.target.closest('[data-approve-request]');
  if(ar){
    ar.disabled=true;
    try{
      try{await httpsCallable(getFunctions(),'reviewGroupRequest')({requestId:ar.dataset.approveRequest,decision:'approved'});}
      catch(e){if(db)await updateDoc(doc(db,'groupRequests',ar.dataset.approveRequest),{status:'approved',reviewedAt:serverTimestamp()});}
      toast('Request approved');loadGroupRequests();loadStats();
    }catch(err){toast(err.message||'Could not approve request.','error');ar.disabled=false}
    return;
  }

  const rr=e.target.closest('[data-reject-request]');
  if(rr){
    rr.disabled=true;
    try{
      try{await httpsCallable(getFunctions(),'reviewGroupRequest')({requestId:rr.dataset.rejectRequest,decision:'rejected'});}
      catch(e){if(db)await updateDoc(doc(db,'groupRequests',rr.dataset.rejectRequest),{status:'rejected',reviewedAt:serverTimestamp()});}
      toast('Request rejected');loadGroupRequests();
    }catch(err){toast(err.message||'Could not reject request.','error');rr.disabled=false}
    return;
  }

  const issue=e.target.closest('[data-admin-issue]');if(issue)return updateIssue(issue.dataset.adminIssue);

  const suspendBtn=e.target.closest('[data-toggle-suspend]');
  if(suspendBtn){
    const uid=suspendBtn.dataset.toggleSuspend, nextState=suspendBtn.dataset.state!=='true';
    suspendBtn.disabled=true;
    try{await setUserSuspension(uid,nextState);toast(nextState?'User suspended':'User reactivated');loadUsers()}
    catch(err){toast(err.message||'Could not update user.','error');suspendBtn.disabled=false}
    return;
  }

  const removePost=e.target.closest('[data-remove-post]');
  if(removePost){
    if(!confirm('Remove this post? This cannot be undone.'))return;
    try{await deleteDoc(doc(db,'posts',removePost.dataset.removePost));toast('Post removed');loadPosts();loadStats()}
    catch(err){toast(err.message||'Could not remove post.','error')}
    return;
  }

  const removeEvent=e.target.closest('[data-remove-event]');
  if(removeEvent){
    if(!confirm('Remove this event?'))return;
    try{await deleteDoc(doc(db,'events',removeEvent.dataset.removeEvent));toast('Event removed');loadEvents();loadStats()}
    catch(err){toast(err.message||'Could not remove event.','error')}
    return;
  }

  const approveEvent=e.target.closest('[data-approve-event]');
  if(approveEvent){
    approveEvent.disabled=true;
    try{await updateDoc(doc(db,'events',approveEvent.dataset.approveEvent),{status:'approved',approvedBy:adminProfile.uid,approvedAt:serverTimestamp()});toast('Event approved');loadEvents();loadStats()}
    catch(err){toast(err.message||'Could not approve event.','error');approveEvent.disabled=false}
    return;
  }

  const rejectEvent=e.target.closest('[data-reject-event]');
  if(rejectEvent){
    rejectEvent.disabled=true;
    try{await updateDoc(doc(db,'events',rejectEvent.dataset.rejectEvent),{status:'rejected',reviewedBy:adminProfile.uid,reviewedAt:serverTimestamp()});toast('Event rejected');loadEvents()}
    catch(err){toast(err.message||'Could not reject event.','error');rejectEvent.disabled=false}
    return;
  }

  const reportFilterBtn=e.target.closest('#reportFilterChips .chip');
  if(reportFilterBtn){
    $$('#reportFilterChips .chip').forEach(c=>c.classList.remove('active'));
    reportFilterBtn.classList.add('active');
    renderReports();
    return;
  }

  const postFilterBtn=e.target.closest('#postFilterChips .chip');
  if(postFilterBtn){
    $$('#postFilterChips .chip').forEach(c=>c.classList.remove('active'));
    postFilterBtn.classList.add('active');
    renderPosts();
    return;
  }

  if(e.target.id==='loadMoreUsers'){e.target.disabled=true;await loadUsers(false);e.target.disabled=false;return}
});

document.addEventListener('input',e=>{
  if(e.target.id==='userSearch') renderUsers();
  if(e.target.id==='groupSearchInput') renderGroupsTable();
});

document.addEventListener('change',async e=>{
  if(e.target.id==='userRoleFilter' || e.target.id==='userStatusFilter') renderUsers();
  if(e.target.id==='issueStatusFilter') renderIssues();

  const sel=e.target.closest('[data-role-select]');
  if(sel){
    const uid=sel.dataset.uid, role=sel.value;
    sel.disabled=true;
    try{await setUserRole(uid,role);toast('Role updated');loadUsers()}
    catch(err){toast(err.message||'Only platform admin can change roles.','error')}
    finally{sel.disabled=false}
    return;
  }

  const memberRole=e.target.closest('[data-member-role]');
  if(memberRole){
    memberRole.disabled=true;
    try{await updateDoc(doc(db,'groupMembers',memberRole.dataset.docId),{role:memberRole.value});toast('Member role updated')}
    catch(err){toast(err.message||'Could not update member role.','error')}
    finally{memberRole.disabled=false}
  }
});

document.addEventListener('submit',async e=>{
  if(e.target.id!=='adminEventForm')return;
  e.preventDefault();
  if(!db)return toast('Connect Firebase to create events.','warning');
  const fd=new FormData(e.target), submitBtn=e.target.querySelector('button[type="submit"]');
  const dateVal=fd.get('date');
  if(!dateVal)return toast('Pick a date and time.','error');
  submitBtn.disabled=true;
  try{
    const titleVal=String(fd.get('title')||'').trim();
    await addDoc(collection(db,'events'),{
      title:titleVal,
      searchName:titleVal.toLowerCase(),
      status:'approved',
      organizer:String(fd.get('organizer')||'').trim(),
      venue:String(fd.get('venue')||'').trim(),
      description:String(fd.get('description')||'').trim(),
      date:new Date(dateVal),
      interestedCount:0,
      createdBy:adminProfile.uid,
      createdAt:serverTimestamp(),
    });
    toast('Event published');
    e.target.reset();
    loadEvents();loadStats();
  }catch(err){toast(err.message||'Could not create event.','error')}
  finally{submitBtn.disabled=false}
// Newsletter & Broadcast Panel
async function loadNewsletter(){
  const tbody = $('[data-newsletter-rows]');
  const badge = $('#badgeNewsletterSubs');
  if(!tbody) return;
  
  try {
    const subs = await getNewsletterSubscribers();
    if(badge) {
      badge.textContent = subs.length;
      badge.hidden = (subs.length === 0);
    }
    
    tbody.innerHTML = subs.length ? subs.map(s => `<tr>
      <td><strong>${escapeHtml(s.email)}</strong></td>
      <td><span class="badge success">${s.active ? 'Active' : 'Unsubscribed'}</span></td>
      <td class="small muted">${s.createdAt ? formatDateTime(s.createdAt) : 'Recently'}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="muted">No newsletter subscribers yet. Subscriptions from footer forms appear here.</td></tr>';
  } catch(e) {
    tbody.innerHTML = errorRow(3, e.message || 'Could not load newsletter subscribers.');
  }
}

document.addEventListener('submit', async (e) => {
  const bcForm = e.target.closest('#broadcastNewsletterForm');
  if (!bcForm) return;
  e.preventDefault();
  const subject = $('#newsletterSubject')?.value?.trim();
  const message = $('#newsletterBody')?.value?.trim();
  const statusDiv = $('#broadcastStatus');
  const submitBtn = bcForm.querySelector('button[type="submit"]');

  if (!subject || !message) return;

  submitBtn.disabled = true;
  const origText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="btn-spinner"></span> Broadcasting…';

  try {
    const res = await broadcastNewsletter({
      subject,
      message,
      senderName: adminProfile?.displayName || 'Campus Admin'
    });
    if (statusDiv) {
      statusDiv.style.color = 'var(--success, #1f9d69)';
      statusDiv.textContent = ` Broadcast sent to ${res.recipientCount} subscriber(s)!`;
    }
    toast(`Newsletter broadcast sent to ${res.recipientCount} subscriber(s)!`, 'success');
    bcForm.reset();
    loadNewsletter();
  } catch(err) {
    if (statusDiv) {
      statusDiv.style.color = 'var(--danger, #c44949)';
      statusDiv.textContent = err.message || 'Failed to send broadcast.';
    }
    toast(err.message || 'Broadcast failed', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = origText;
  }
});

subscribeAuth((u,p)=>{
  if(!requireAuth())return;
  adminProfile=p;
  if(!db){
    const banner=document.createElement('div');
    banner.className='notice warning';
    banner.style.marginBottom='16px';
    banner.innerHTML='<strong>Demo mode.</strong> Connect Firebase and sign in with a platformAdmin or moderator account to load live moderation data.';
    const target=document.querySelector('.page-head');
    target?.parentElement?.insertBefore(banner,target.nextSibling);
    return;
  }
  if(!hasRole('platformAdmin','moderator')){
    const root=document.querySelector('[data-app-main] section')||document.querySelector('main section');
    if(root){
      root.innerHTML='<div class="empty"><i data-lucide="shield-off"></i><h2>Admin access required</h2><p class="muted">This area is restricted to platform administrators and moderators.</p><a class="btn primary" href="home.html">Back to Home</a></div>';
      window.lucide?.createIcons();
    }
    return;
  }
  loadStats();
  loadTab(activeTab);
});
