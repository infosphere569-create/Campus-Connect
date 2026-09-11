import {setUserSuspension,setUserRole} from "./admin-control.js";
import {listAuditLogs} from "./admin-data.js";
import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth,hasRole} from './auth.js';import {collection,collectionGroup,getDocs,getCountFromServer,query,orderBy,limit,startAfter,where,updateDoc,doc,deleteDoc,addDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';import { $, escapeHtml, formatDateTime, timeAgo, toast, showModal, initials } from './utils.js';
let adminProfile;
// Every loader below renders its own error text INSIDE its box (not just a toast)
// when a query fails -- a toast disappears in a few seconds and leaves you staring
// at an empty box with no idea why. The message includes the raw error so a
// missing-index or permission-denied error is visible and actionable, not silent.
function errorBox(msg){return `<div class="card empty"><i data-lucide="alert-triangle"></i><h3>Could not load this</h3><p class="muted">${escapeHtml(msg)}</p></div>`}
function errorRow(cols,msg){return `<tr><td colspan="${cols}" class="muted">${escapeHtml(msg)}</td></tr>`}

async function count(name,q){if(!db)return '—';try{return (await getCountFromServer(q||collection(db,name))).data().count}catch{return '—'}}
async function loadStats(){
 const jobs=[
  ['users',count('users')],
  ['posts',count('posts')],
  // comments now live under posts/{postId}/comments (a subcollection per the
  // updated rules), so a total count needs a collectionGroup query, not a
  // flat top-level collection() query.
  ['comments',count('comments',collectionGroup(db,'comments'))],
  ['groups',count('groups')],
  ['groupRequests',count('groupRequests',query(collection(db,'groupRequests'),where('status','==','pending')))],
  ['issues',count('issues',query(collection(db,'issues'),where('status','in',['Open','Under Review','In Progress'])))],
  ['reports',count('reports')],
  ['events',count('events')],
 ];
 for(const [key,job] of jobs){const el=$(`[data-stat="${key}"]`);if(el)el.textContent=await job}
}

async function loadReports(){if(!db)return;try{const snap=await getDocs(query(collection(db,'reports'),orderBy('createdAt','desc'),limit(15)));const rows=snap.docs.map(d=>({id:d.id,...d.data()}));$('[data-report-rows]').innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.reason)}</td><td><span class="badge ${r.status==='resolved'?'success':'warning'}">${escapeHtml(r.status||'pending')}</span></td><td>${formatDateTime(r.createdAt)}</td><td><button class="btn sm" data-review-report="${r.id}">Review</button></td></tr>`).join(''):'<tr><td colspan="5" class="muted">No reports in the queue.</td></tr>'}catch(e){$('[data-report-rows]').innerHTML=errorRow(5,e.message||'Could not load the moderation queue.')}}

async function loadGroups(){if(!db)return;const box=$('[data-pending-groups]');try{const snap=await getDocs(query(collection(db,'groups'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));box.innerHTML=snap.docs.length?snap.docs.map(d=>{const g=d.data();return `<div class="moderation-item"><div><strong>${escapeHtml(g.name)}</strong><div class="small muted">${escapeHtml(g.category||'Community')} · ${formatDateTime(g.createdAt)}</div><p class="small muted">${escapeHtml(g.description||'')}</p></div><div class="toolbar"><a class="btn sm" href="group.html?id=${encodeURIComponent(d.id)}">View</a><button class="btn sm primary" data-approve-group="${d.id}">Approve</button><button class="btn sm" data-reject-group="${d.id}">Reject</button></div></div>`}).join(''):'<div class="empty"><i data-lucide="inbox"></i><h3>Nothing awaiting approval</h3></div>';window.lucide?.createIcons()}catch(e){box.innerHTML=errorBox(e.message||'Could not load group approvals.')}}

async function loadGroupsTable(){if(!db)return;try{const snap=await getDocs(query(collection(db,'groups'),orderBy('createdAt','desc'),limit(50)));const rows=snap.docs.map(d=>({id:d.id,...d.data()}));$('[data-group-rows]').innerHTML=rows.length?rows.map(g=>`<tr data-group-row="${g.id}"><td>${escapeHtml(g.name||'')}</td><td>${escapeHtml(g.category||'')}</td><td>${Number(g.memberCount||0)}</td><td><span class="badge ${g.status==='approved'?'success':g.status==='rejected'?'danger':'warning'}">${escapeHtml(g.status||'pending')}</span></td><td>${formatDateTime(g.createdAt)}</td><td><div class="toolbar"><a class="btn sm" href="group.html?id=${encodeURIComponent(g.id)}">View</a><button class="btn sm" data-manage-members="${g.id}">Members</button>${g.status==='pending'?`<button class="btn sm primary" data-approve-group="${g.id}">Approve</button><button class="btn sm" data-reject-group="${g.id}">Reject</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="6" class="muted">No groups yet.</td></tr>'}catch(e){$('[data-group-rows]').innerHTML=errorRow(6,e.message||'Could not load groups.')}}

async function manageMembers(groupId){
 showModal('Manage group members','<div class="stack" id="memberList"><div class="skeleton" style="height:60px"></div></div>');
 window.lucide?.createIcons();
 const box=$('#memberList');
 try{
  const snap=await getDocs(query(collection(db,'groupMembers'),where('groupId','==',groupId),limit(50)));
  if(!snap.docs.length){box.innerHTML='<div class="empty"><h3>No members yet</h3></div>';return}
  box.innerHTML=snap.docs.map(d=>{const m=d.data();return `<div class="moderation-item"><div><strong>${escapeHtml(m.displayName||m.uid)}</strong><div class="small muted">Member since ${formatDateTime(m.joinedAt)}</div></div><select class="btn sm" data-member-role data-doc-id="${d.id}"><option value="member" ${(!m.role||m.role==='member')?'selected':''}>Member</option><option value="moderator" ${m.role==='moderator'?'selected':''}>Group moderator</option><option value="admin" ${m.role==='admin'?'selected':''}>Group leader (admin)</option></select></div>`}).join('');
 }catch(e){box.innerHTML=errorBox(e.message||'Could not load members.')}
}

async function loadIssues(){if(!db)return;const box=$('[data-admin-issues]');try{const snap=await getDocs(query(collection(db,'issues'),orderBy('createdAt','desc'),limit(12)));box.innerHTML=snap.docs.length?snap.docs.map(d=>{const i=d.data();return `<div class="moderation-item"><div><div class="badge primary">Anonymous Student</div><strong>${escapeHtml(i.title)}</strong><div class="small muted">${escapeHtml(i.category||'Other')} · ${escapeHtml(i.severity||'Medium')} · <span class="badge ${i.status==='Resolved'?'success':'warning'}">${escapeHtml(i.status||'Open')}</span></div></div><button class="btn sm" data-admin-issue="${d.id}">Update</button></div>`}).join(''):'<div class="empty"><i data-lucide="circle-alert"></i><h3>No issues found</h3></div>';window.lucide?.createIcons()}catch(e){box.innerHTML=errorBox(e.message||'Could not load issues.')}}

let userCursor=null, userRows=[];
async function loadUsers(reset=true){if(!db)return;const box=$('[data-user-rows]');const loadMoreBtn=$('#loadMoreUsers');
 if(reset){userCursor=null;userRows=[];box.innerHTML='<tr><td colspan="7" class="muted">Loading users…</td></tr>'}
 try{
  const constraints=[collection(db,'users'),orderBy('createdAt','desc'),limit(25)];
  if(userCursor)constraints.splice(1,0,startAfter(userCursor));
  const snap=await getDocs(query(...constraints));
  userCursor=snap.docs.at(-1)||userCursor;
  const newRows=snap.docs.map(d=>({id:d.id,...d.data()}));
  userRows=reset?newRows:userRows.concat(newRows);
  renderUsers();
  if(loadMoreBtn)loadMoreBtn.hidden=snap.docs.length<25;
 }catch(e){box.innerHTML=errorRow(7,e.message||'Could not load users.');if(loadMoreBtn)loadMoreBtn.hidden=true}
}
function renderUsers(){
 const box=$('[data-user-rows]');
 const term=($('#userSearch')?.value||'').trim().toLowerCase();
 const rows=term?userRows.filter(u=>(u.displayName||'').toLowerCase().includes(term)||(u.email||'').toLowerCase().includes(term)):userRows;
 box.innerHTML=rows.length?rows.map(u=>`<tr data-user-row="${u.id}">
  <td><div class="row" style="align-items:center;gap:8px"><div class="avatar sm">${u.photoURL?`<img src="${escapeHtml(u.photoURL)}" alt="">`:initials(u.displayName)}</div><div><strong>${escapeHtml(u.displayName||'Student')}</strong><div class="small muted">${escapeHtml(u.email||'')}</div></div></div></td>
  <td class="small muted">${escapeHtml([u.course,u.branch,u.year].filter(Boolean).join(' • ')||'—')}</td>
  <td class="small muted">${escapeHtml(u.college||'—')}</td>
  <td><select class="btn sm" data-role-select data-uid="${u.id}"><option value="student" ${u.role==='student'||!u.role?'selected':''}>Student</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Moderator</option><option value="platformAdmin" ${u.role==='platformAdmin'?'selected':''}>Platform Admin</option></select></td>
  <td><span class="badge ${u.suspended?'danger':'success'}">${u.suspended?'Suspended':'Active'}</span></td>
  <td class="small muted">${formatDateTime(u.createdAt)}</td>
  <td><button class="btn sm ${u.suspended?'':'danger'}" data-toggle-suspend="${u.id}" data-state="${!!u.suspended}">${u.suspended?'Reactivate':'Suspend'}</button></td>
 </tr>`).join(''):'<tr><td colspan="7" class="muted">No users found.</td></tr>';
}

function postRow(p){const status=p.reportCount>0?`<span class="badge warning">${p.reportCount} report${p.reportCount===1?'':'s'}</span>`:'<span class="badge success">Clean</span>';
 return `<article class="card" style="padding:14px" data-admin-post="${p.id}"><div class="split" style="align-items:flex-start"><div style="min-width:0"><div class="row small muted" style="gap:6px"><strong style="color:var(--text)">${escapeHtml(p.authorName||'Campus Student')}</strong>· ${timeAgo(p.createdAt)}</div><p style="margin:6px 0">${escapeHtml((p.text||'').slice(0,220))}${(p.text||'').length>220?'…':''}</p>${p.imageURL?`<img src="${escapeHtml(p.imageURL)}" alt="" style="max-width:160px;border-radius:10px;display:block">`:''}<div class="small muted" style="margin-top:6px">${p.likes||0} likes · ${p.comments||0} comments · ${status}</div></div><div class="toolbar"><a class="btn sm" href="feed.html?post=${encodeURIComponent(p.id)}"><i data-lucide="eye"></i>View</a><button class="btn sm danger" data-remove-post="${p.id}"><i data-lucide="trash-2"></i>Remove</button></div></div></article>`}

async function loadPosts(){if(!db)return;const box=$('[data-admin-posts]');try{
 const snap=await getDocs(query(collection(db,'posts'),orderBy('createdAt','desc'),limit(30)));
 const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
 box.innerHTML=rows.length?rows.map(postRow).join(''):'<div class="empty"><i data-lucide="file-text"></i><h3>No posts yet</h3></div>';
 window.lucide?.createIcons();
}catch(e){box.innerHTML=errorBox(e.message||'Could not load posts.')}}

async function loadEvents(){if(!db)return;
 const pendingBox=$('[data-pending-events]');
 if(pendingBox){try{
  const psnap=await getDocs(query(collection(db,'events'),where('status','==','pending'),orderBy('createdAt','desc'),limit(20)));
  pendingBox.innerHTML=psnap.docs.length?psnap.docs.map(d=>{const ev=d.data();return `<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-event="${d.id}">Approve</button><button class="btn sm danger" data-reject-event="${d.id}">Reject</button></div></div>`}).join(''):'<div class="empty"><i data-lucide="inbox"></i><h3>Nothing awaiting approval</h3></div>';
  window.lucide?.createIcons();
 }catch(e){pendingBox.innerHTML=errorBox(e.message||'Could not load pending events.')}}
 const box=$('[data-admin-events]');try{
 const snap=await getDocs(query(collection(db,'events'),orderBy('date','asc'),limit(30)));
 const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
 box.innerHTML=rows.length?rows.map(ev=>`<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong> <span class="badge ${ev.status==='approved'?'success':ev.status==='rejected'?'danger':'warning'}">${escapeHtml(ev.status||'pending')}</span><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><span class="badge">${Number(ev.interestedCount||0)} interested</span><button class="btn sm danger" data-remove-event="${ev.id}">Remove</button></div></div>`).join(''):'<div class="empty"><i data-lucide="calendar-days"></i><h3>No events yet</h3></div>';
 window.lucide?.createIcons();
}catch(e){box.innerHTML=errorBox(e.message||'Could not load events.')}}

async function loadAudit(){if(!db)return;const box=$('[data-audit-rows]');try{
 const rows=await listAuditLogs();
 box.innerHTML=rows.length?rows.map(a=>`<tr><td>${escapeHtml(a.action||'')}</td><td class="small muted">${escapeHtml(a.actorUid||'')}</td><td class="small muted">${escapeHtml(a.targetId||'')}</td><td>${formatDateTime(a.createdAt)}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">No audit entries yet.</td></tr>';
}catch(e){box.innerHTML=errorRow(4,e.message||'Could not load audit log.')}}

async function loadGroupRequests(){if(!db)return;const box=$('[data-group-requests]');try{const snap=await getDocs(query(collection(db,'groupRequests'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));box.innerHTML=snap.docs.length?snap.docs.map(d=>{const r=d.data();return `<div class="moderation-item"><div><strong>${escapeHtml(r.groupName||r.groupId)}</strong><div class="small muted">Student request · ${formatDateTime(r.createdAt)}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-request="${d.id}">Approve</button><button class="btn sm" data-reject-request="${d.id}">Reject</button></div></div>`}).join(''):'<div class="empty"><h3>No pending requests</h3></div>';window.lucide?.createIcons()}catch(e){box.innerHTML=errorBox(e.message||'Could not load membership requests.')}}

async function reviewReport(id){showModal('Review report','<form class="form" id="reportReview"><div class="field"><label>Decision</label><select name="status"><option value="reviewed">Reviewed</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div><div class="field"><label>Internal note</label><textarea name="note" maxlength="500"></textarea></div><div id="reviewError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Save review</button></div></form>');$('#reportReview').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{const fd=new FormData(e.currentTarget);await httpsCallable(getFunctions(), 'reviewReport')({reportId:id,status:fd.get('status'),note:String(fd.get('note')||'')});document.querySelector('.modal-backdrop')?.remove();toast('Report reviewed');loadReports();loadStats()}catch(err){btn.disabled=false;$('#reviewError').textContent=err.message||'Could not save this review. Is the reviewReport Cloud Function deployed?'}})}

async function updateIssue(id){showModal('Update issue status','<form class="form" id="issueReview"><div class="field"><label>Status</label><select name="status"><option>Open</option><option>Under Review</option><option>In Progress</option><option>Resolved</option><option>Closed</option></select></div><div class="field"><label>Public response</label><textarea name="response" maxlength="1000" placeholder="What should students know?"></textarea></div><div id="issueReviewError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Update issue</button></div></form>');$('#issueReview').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{const fd=new FormData(e.currentTarget);await updateDoc(doc(db,'issues',id),{status:fd.get('status'),adminResponse:String(fd.get('response')||''),updatedAt:serverTimestamp()});document.querySelector('.modal-backdrop')?.remove();toast('Issue updated');loadIssues();loadStats()}catch(err){btn.disabled=false;$('#issueReviewError').textContent=err.message||'Could not update this issue.'}})}

function jumpTo(name){
 for(const btn of document.querySelectorAll('[data-admin-tabs] .tab'))btn.classList.toggle('active',btn.dataset.tab===name);
 document.getElementById('admin-'+name)?.scrollIntoView({behavior:'smooth',block:'start'});
}

document.addEventListener('click',async e=>{
 const tabBtn=e.target.closest('[data-admin-tabs] .tab');if(tabBtn){jumpTo(tabBtn.dataset.tab);return}

 const r=e.target.closest('[data-review-report]');if(r)return reviewReport(r.dataset.reviewReport);

 const a=e.target.closest('[data-approve-group]');if(a){a.disabled=true;try{await updateDoc(doc(db,'groups',a.dataset.approveGroup),{status:'approved',approvedBy:adminProfile.uid,approvedAt:serverTimestamp()});toast('Group approved');loadGroups();loadGroupsTable();loadStats()}catch(err){toast(err.message,'error');a.disabled=false}return}

 const reject=e.target.closest('[data-reject-group]');if(reject){showModal('Reject group','<form id="rejectForm" class="form"><div class="field"><label>Reason</label><textarea name="reason" required maxlength="500"></textarea></div><button class="btn danger" type="submit">Reject group</button></form>');$('#rejectForm').addEventListener('submit',async ev=>{ev.preventDefault();const fd=new FormData(ev.currentTarget);try{await updateDoc(doc(db,'groups',reject.dataset.rejectGroup),{status:'rejected',rejectionReason:String(fd.get('reason')),reviewedBy:adminProfile.uid,reviewedAt:serverTimestamp()});document.querySelector('.modal-backdrop')?.remove();toast('Group rejected');loadGroups();loadGroupsTable()}catch(err){toast(err.message,'error')}});return}

 const manage=e.target.closest('[data-manage-members]');if(manage)return manageMembers(manage.dataset.manageMembers);

 const ar=e.target.closest('[data-approve-request]');if(ar){ar.disabled=true;try{await httpsCallable(getFunctions(),'reviewGroupRequest')({requestId:ar.dataset.approveRequest,decision:'approved'});toast('Request approved');loadGroupRequests();loadStats()}catch(err){toast(err.message||'Could not approve. Is reviewGroupRequest deployed?','error');ar.disabled=false}return}

 const rr=e.target.closest('[data-reject-request]');if(rr){rr.disabled=true;try{await httpsCallable(getFunctions(),'reviewGroupRequest')({requestId:rr.dataset.rejectRequest,decision:'rejected'});toast('Request rejected');loadGroupRequests()}catch(err){toast(err.message||'Could not reject. Is reviewGroupRequest deployed?','error');rr.disabled=false}return}

 const issue=e.target.closest('[data-admin-issue]');if(issue)return updateIssue(issue.dataset.adminIssue);

 const suspendBtn=e.target.closest('[data-toggle-suspend]');if(suspendBtn){
  const uid=suspendBtn.dataset.toggleSuspend, nextState=suspendBtn.dataset.state!=='true';
  suspendBtn.disabled=true;
  try{await setUserSuspension(uid,nextState);toast(nextState?'User suspended':'User reactivated');loadUsers()}
  catch(err){toast(err.message||'Could not update user. Is setUserSuspension deployed?','error');suspendBtn.disabled=false}
  return;
 }

 const removePost=e.target.closest('[data-remove-post]');if(removePost){
  if(!confirm('Remove this post? This cannot be undone.'))return;
  try{await deleteDoc(doc(db,'posts',removePost.dataset.removePost));toast('Post removed');loadPosts();loadStats()}
  catch(err){toast(err.message||'Could not remove post.','error')}
  return;
 }

 const removeEvent=e.target.closest('[data-remove-event]');if(removeEvent){
  if(!confirm('Remove this event?'))return;
  try{await deleteDoc(doc(db,'events',removeEvent.dataset.removeEvent));toast('Event removed');loadEvents();loadStats()}
  catch(err){toast(err.message||'Could not remove event.','error')}
  return;
 }

 const approveEvent=e.target.closest('[data-approve-event]');if(approveEvent){
  approveEvent.disabled=true;
  try{await updateDoc(doc(db,'events',approveEvent.dataset.approveEvent),{status:'approved',approvedBy:adminProfile.uid,approvedAt:serverTimestamp()});toast('Event approved');loadEvents();loadStats()}
  catch(err){toast(err.message||'Could not approve event.','error');approveEvent.disabled=false}
  return;
 }

 const rejectEvent=e.target.closest('[data-reject-event]');if(rejectEvent){
  rejectEvent.disabled=true;
  try{await updateDoc(doc(db,'events',rejectEvent.dataset.rejectEvent),{status:'rejected',reviewedBy:adminProfile.uid,reviewedAt:serverTimestamp()});toast('Event rejected');loadEvents()}
  catch(err){toast(err.message||'Could not reject event.','error');rejectEvent.disabled=false}
  return;
 }

 if(e.target.id==='loadMoreUsers'){e.target.disabled=true;await loadUsers(false);e.target.disabled=false;return}
});
document.addEventListener('input',e=>{if(e.target.id==='userSearch')renderUsers()});
document.addEventListener('change',async e=>{
 const sel=e.target.closest('[data-role-select]');if(sel){
  const uid=sel.dataset.uid, role=sel.value;
  sel.disabled=true;
  try{await setUserRole(uid,role);toast('Role updated')}
  catch(err){toast(err.message||'Only a platform admin can change roles. Is setUserRole deployed?','error')}
  finally{sel.disabled=false}
  return;
 }
 const memberRole=e.target.closest('[data-member-role]');if(memberRole){
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
  toast('Event created');
  e.target.reset();
  loadEvents();loadStats();
 }catch(err){toast(err.message||'Could not create event.','error')}
 finally{submitBtn.disabled=false}
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
 // Every section loads immediately and stays visible -- no more tap-to-reveal
 // tabs hiding the other boxes. The tab bar above just smooth-scrolls to a
 // section for convenience on a long page.
 loadStats();
 loadReports();
 loadUsers();
 loadPosts();
 loadGroups();loadGroupsTable();
 loadGroupRequests();
 loadIssues();
 loadEvents();
 loadAudit();
});
