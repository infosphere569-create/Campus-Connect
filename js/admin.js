import {setUserSuspension,setUserRole} from "./admin-control.js";
import {listAuditLogs} from "./admin-data.js";
import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,hasRole} from './auth.js';
import {collection,collectionGroup,getDocs,getCountFromServer,query,orderBy,limit,startAfter,where,updateDoc,doc,deleteDoc,addDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { $, $$, escapeHtml, formatDateTime, timeAgo, toast, showModal, initials } from './utils.js';
import { getNewsletterSubscribers, broadcastNewsletter } from './services.js';
import {
  EVENT_TYPES,
  detectEventType,
  extractPlaceholders,
  generateNotificationEmail,
  buildSamplePayloads,
  dispatchAutomatedEmailNotification,
  listAutoEmailLogs,
  buildGmailComposeUrl
} from './email-templates.js';

let adminProfile = null;
let activeTab = 'overview';
let rawReports = [], rawUsers = [], rawPosts = [], rawGroups = [], rawIssues = [];
let userCursor = null;

function errorBox(msg){return `<div class="card empty"><i data-lucide="alert-triangle"></i><h3>Could not load this</h3><p class="muted">${escapeHtml(msg)}</p></div>`}
function errorRow(cols,msg){return `<tr><td colspan="${cols}" class="muted">${escapeHtml(msg)}</td></tr>`}

async function count(name,q){
  if(!db) return Math.floor(Math.random() * 50) + 10;
  try{return (await getCountFromServer(q||collection(db,name))).data().count}catch{return '—'}
}

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
    case 'auto-emails': initAutoEmailStudio(); break;
    case 'audit': loadAudit(); break;
  }
}

// Reports / Overview
async function loadReports(){
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'reports'),orderBy('createdAt','desc'),limit(30)));
      items=snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      items = [
        { id: 'rep-1', type: 'post', reason: 'Inappropriate content', status: 'pending', createdAt: new Date() },
        { id: 'rep-2', type: 'comment', reason: 'Spam', status: 'pending', createdAt: new Date(Date.now() - 3600000) }
      ];
    }
    rawReports = items;
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
  const box=$('[data-user-rows]');
  const loadMoreBtn=$('#loadMoreUsers');
  if(reset){userCursor=null;rawUsers=[];if(box)box.innerHTML='<tr><td colspan="7" class="muted">Loading users…</td></tr>'}
  try{
    let newRows = [];
    if(db){
      const constraints=[collection(db,'users'),orderBy('createdAt','desc'),limit(25)];
      if(userCursor)constraints.splice(1,0,startAfter(userCursor));
      const snap=await getDocs(query(...constraints));
      userCursor=snap.docs.at(-1)||userCursor;
      newRows=snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      newRows = [
        { id: 'u1', displayName: 'Ayush Kumar', email: 'ayush@example.edu', college: 'NITRA Technical Campus', role: 'student', createdAt: new Date() },
        { id: 'u2', displayName: 'Priya Singh', email: 'priya@example.edu', college: 'IIT Delhi', role: 'moderator', createdAt: new Date(Date.now() - 86400000) }
      ];
    }
    rawUsers=reset?newRows:rawUsers.concat(newRows);
    renderUsers();
    if(loadMoreBtn)loadMoreBtn.hidden=!db || newRows.length<25;
  }catch(e){
    if(box)box.innerHTML=errorRow(7,e.message||'Could not load users.');
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
  const box=$('[data-admin-posts]');
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'posts'),orderBy('createdAt','desc'),limit(30)));
      items=snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      items = [
        { id: 'p1', authorName: 'Aarav Sharma', text: 'Has anyone seen my library card? I lost it near the cafeteria.', likes: 5, comments: 2, reportCount: 0, createdAt: new Date() },
        { id: 'p2', authorName: 'Sneha Verma', text: 'The canteen special today is actually good for once! 😂', likes: 24, comments: 8, reportCount: 1, createdAt: new Date(Date.now() - 7200000) }
      ];
    }
    rawPosts = items;
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
  const box=$('[data-pending-groups]');
  if(!box) return;
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'groups'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));
      items = snap.docs.map(d=>({id:d.id, ...d.data()}));
    } else {
      items = [
        { id: 'g-pend-1', name: 'Campus Photography Club', category: 'Arts', description: 'A place for shutterbugs to share their work.', createdAt: new Date() }
      ];
    }
    const pendingCount = items.length;
    const badge=$('#badgePendingGroups');
    if(badge){ badge.textContent=pendingCount; badge.hidden = pendingCount===0; }
    box.innerHTML=pendingCount?items.map(g=>{
      return `<div class="moderation-item"><div><strong>${escapeHtml(g.name)}</strong><div class="small muted">${escapeHtml(g.category||'Community')} · ${formatDateTime(g.createdAt)}</div><p class="small muted">${escapeHtml(g.description||'')}</p></div><div class="toolbar"><a class="btn sm" href="group.html?id=${encodeURIComponent(g.id)}">View</a><button class="btn sm primary" data-approve-group="${g.id}">Approve</button><button class="btn sm danger" data-reject-group="${g.id}">Reject</button></div></div>`;
    }).join(''):'<div class="empty"><i data-lucide="check-circle-2"></i><h3>No groups awaiting approval</h3></div>';
    window.lucide?.createIcons();
  }catch(e){
    box.innerHTML=errorBox(e.message||'Could not load group approvals.');
  }
}

async function loadGroupsTable(){
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'groups'),orderBy('createdAt','desc'),limit(50)));
      items=snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      items = [
        { id: 'g1', name: 'Campus Coders', category: 'Technology', memberCount: 156, status: 'approved', createdAt: new Date(Date.now() - 86400000 * 30) },
        { id: 'g2', name: 'Cricket Warriors', category: 'Sports', memberCount: 42, status: 'approved', createdAt: new Date(Date.now() - 86400000 * 15) }
      ];
    }
    rawGroups = items;
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
  const box=$('[data-admin-issues]');
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'issues'),orderBy('createdAt','desc'),limit(25)));
      items=snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      items = [
        { id: 'is1', title: 'Water cooler broken in Block C', description: 'It has been leaking for 3 days and now it stopped cooling.', status: 'Open', category: 'Infrastructure', location: 'Block C, 2nd Floor', supportCount: 15, createdAt: new Date() },
        { id: 'is2', title: 'Library Wi-Fi very slow', description: 'Cannot even open Google Docs in the evening.', status: 'In Progress', category: 'IT Services', location: 'Central Library', supportCount: 42, createdAt: new Date(Date.now() - 86400000) }
      ];
    }
    rawIssues=items;
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
  const pendingBox=$('[data-pending-events]');
  if(pendingBox){
    try{
      let pitems = [];
      if(db){
        const psnap=await getDocs(query(collection(db,'events'),where('status','==','pending'),orderBy('createdAt','desc'),limit(20)));
        pitems = psnap.docs.map(d=>({id:d.id, ...d.data()}));
      } else {
        pitems = [
          { id: 'ev-pend-1', title: 'Guest Lecture: AI in 2025', organizer: 'IEEE Student Branch', date: new Date(Date.now() + 86400000 * 5), venue: 'Main Auditorium' }
        ];
      }
      pendingBox.innerHTML=pitems.length?pitems.map(ev=>{
        return `<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-event="${ev.id}">Approve</button><button class="btn sm danger" data-reject-event="${ev.id}">Reject</button></div></div>`;
      }).join(''):'<div class="empty"><i data-lucide="check-circle-2"></i><h3>No events awaiting approval</h3></div>';
      window.lucide?.createIcons();
    }catch(e){pendingBox.innerHTML=errorBox(e.message||'Could not load pending events.')}
  }
  const box=$('[data-admin-events]');
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'events'),orderBy('date','asc'),limit(30)));
      items = snap.docs.map(d=>({id:d.id,...d.data()}));
    } else {
      items = [
        { id: 'ev1', title: 'Tech Fest 2024', status: 'approved', organizer: 'Tech Society', date: new Date(Date.now() + 86400000 * 10), venue: 'Campus Grounds', interestedCount: 450 },
        { id: 'ev2', title: 'Blood Donation Camp', status: 'approved', organizer: 'Red Cross', date: new Date(Date.now() + 86400000 * 2), venue: 'Health Center', interestedCount: 85 }
      ];
    }
    box.innerHTML=items.length?items.map(ev=>`<div class="moderation-item"><div><strong>${escapeHtml(ev.title||'Untitled event')}</strong> <span class="badge ${ev.status==='approved'?'success':ev.status==='rejected'?'danger':'warning'}">${escapeHtml(ev.status||'pending')}</span><div class="small muted">${escapeHtml(ev.organizer||'')} · ${formatDateTime(ev.date)} · ${escapeHtml(ev.venue||'')}</div></div><div class="toolbar"><span class="badge">${Number(ev.interestedCount||0)} interested</span><button class="btn sm danger" data-remove-event="${ev.id}">Remove</button></div></div>`).join(''):'<div class="empty"><i data-lucide="calendar"></i><h3>No events yet</h3></div>';
    window.lucide?.createIcons();
  }catch(e){box.innerHTML=errorBox(e.message||'Could not load events.')}
}

// Audit Log
async function loadAudit(){
  const box=$('[data-audit-rows]');
  if(!box) return;
  try{
    let rows = [];
    if(db){
      rows = await listAuditLogs();
    } else {
      rows = [
        { action: 'user_suspended', actorUid: 'admin-1', targetId: 'u1', createdAt: new Date() },
        { action: 'post_deleted', actorUid: 'mod-1', targetId: 'p2', createdAt: new Date(Date.now() - 3600000) }
      ];
    }
    box.innerHTML=rows.length?rows.map(a=>`<tr><td><strong>${escapeHtml(a.action||'')}</strong></td><td class="small muted">${escapeHtml(a.actorUid||'—')}</td><td class="small muted">${escapeHtml(a.targetId||'—')}</td><td class="small muted">${formatDateTime(a.createdAt)}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">No audit entries logged yet.</td></tr>';
  }catch(e){box.innerHTML=errorRow(4,e.message||'Could not load audit log.')}
}

// Group Requests
async function loadGroupRequests(){
  const box=$('[data-group-requests]');
  if(!box) return;
  try{
    let items = [];
    if(db){
      const snap=await getDocs(query(collection(db,'groupRequests'),where('status','==','pending'),orderBy('createdAt','desc'),limit(15)));
      items = snap.docs.map(d=>({id:d.id, ...d.data()}));
    } else {
      items = [
        { id: 'req1', displayName: 'Rahul Mehra', groupName: 'Campus Coders', createdAt: new Date() }
      ];
    }
    box.innerHTML=items.length?items.map(r=>{
      return `<div class="moderation-item"><div><strong>${escapeHtml(r.displayName||'A student')}</strong><div class="small muted">Wants to join ${escapeHtml(r.groupName||'a group')} · ${formatDateTime(r.createdAt)}</div></div><div class="toolbar"><button class="btn sm primary" data-approve-request="${r.id}">Approve</button><button class="btn sm" data-reject-request="${r.id}">Reject</button></div></div>`;
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
  const existing = rawIssues.find(x => x.id === id) || {};
  const curStatus = existing.status || 'Open';
  const curResp = existing.adminResponse || '';
  showModal('Update Campus Issue',`<form class="form" id="issueReview"><div class="field"><label>Status</label><select name="status"><option ${curStatus==='Open'?'selected':''}>Open</option><option ${curStatus==='Under Review'?'selected':''}>Under Review</option><option ${curStatus==='In Progress'?'selected':''}>In Progress</option><option ${curStatus==='Resolved'?'selected':''}>Resolved</option><option ${curStatus==='Closed'?'selected':''}>Closed</option></select></div><div class="field"><label>Official Public Response</label><textarea name="response" maxlength="1000" placeholder="What progress or action has been taken?">${escapeHtml(curResp)}</textarea></div><label class="check-row small"><input type="checkbox" name="notifyEmail" checked><span>Send automated HTML status email to the anonymous reporter</span></label><div id="issueReviewError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Publish Update</button></div></form>`);
  $('#issueReview')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=e.currentTarget.querySelector('button[type="submit"]');
    btn.disabled=true;
    try{
      const fd=new FormData(e.currentTarget);
      const nextStatus = String(fd.get('status') || 'Open');
      const nextResp = String(fd.get('response') || '').trim();
      const sendEmail = fd.get('notifyEmail') === 'on';
      if(db){
        await updateDoc(doc(db,'issues',id),{status:nextStatus,adminResponse:nextResp,updatedAt:serverTimestamp()});
      }
      if(sendEmail){
        await dispatchAutomatedEmailNotification({
          payload:{
            collection:'issues',
            action:'update',
            issueId:id,
            title:existing.title || 'Campus Issue',
            category:existing.category || 'General',
            location:existing.location || 'Campus',
            previousStatus:curStatus,
            status:nextStatus,
            adminResponse:nextResp
          },
          sendNow:true,
          source:'admin_issue_update'
        }).catch(()=>{});
      }
      document.querySelector('.modal-backdrop')?.remove();
      toast(sendEmail ? 'Issue updated & automated email notification triggered' : 'Issue updated successfully');
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
      catch(fnErr){
        if(db)await updateDoc(doc(db,'groupRequests',ar.dataset.approveRequest),{status:'approved',reviewedAt:serverTimestamp()});
        await dispatchAutomatedEmailNotification({payload:{collection:'groupRequests',action:'update',requestId:ar.dataset.approveRequest,status:'approved',reviewerName:adminProfile?.displayName||'Admin'},sendNow:true,source:'admin_request_approve'}).catch(()=>{});
      }
      toast('Request approved & notification triggered');loadGroupRequests();loadStats();
    }catch(err){toast(err.message||'Could not approve request.','error');ar.disabled=false}
    return;
  }

  const rr=e.target.closest('[data-reject-request]');
  if(rr){
    rr.disabled=true;
    try{
      try{await httpsCallable(getFunctions(),'reviewGroupRequest')({requestId:rr.dataset.rejectRequest,decision:'rejected'});}
      catch(fnErr){
        if(db)await updateDoc(doc(db,'groupRequests',rr.dataset.rejectRequest),{status:'rejected',reviewedAt:serverTimestamp()});
        await dispatchAutomatedEmailNotification({payload:{collection:'groupRequests',action:'update',requestId:rr.dataset.rejectRequest,status:'rejected',reviewerName:adminProfile?.displayName||'Admin'},sendNow:true,source:'admin_request_reject'}).catch(()=>{});
      }
      toast('Request rejected & notification triggered');loadGroupRequests();
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
});

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

// =========================================================================
// Automated Event-Driven Email Notification Studio
// =========================================================================
const SAMPLE_PAYLOADS = buildSamplePayloads();
let autoEmailInitialized = false;
let studioState = {
  payload: { ...SAMPLE_PAYLOADS.event_registration },
  eventType: 'event_registration',
  placeholders: {},
  overrides: { subject: '', ctaLabel: '', headline: '', customNote: '' },
  keepPlaceholders: false,
  previewMode: 'html',
  mobilePreview: false,
  lastRendered: null,
  liveRecords: []
};

function setStudioPayload(rawPayload, explicitEventType = null) {
  const det = explicitEventType && EVENT_TYPES[explicitEventType]
    ? { eventType: explicitEventType, confidence: 'explicit', reason: 'Selected preset template', definition: EVENT_TYPES[explicitEventType] }
    : detectEventType(rawPayload);

  studioState.payload = { ...(rawPayload || {}) };
  studioState.eventType = det.eventType;
  studioState.placeholders = extractPlaceholders(det.eventType, studioState.payload);

  const def = det.definition;
  studioState.overrides = {
    subject: def.defaultSubject,
    ctaLabel: def.defaultCtaLabel,
    headline: def.defaultHeadline,
    customNote: ''
  };

  const subjEl = $('#autoEmailSubjectOverride');
  const ctaEl = $('#autoEmailCtaOverride');
  const headEl = $('#autoEmailHeadlineOverride');
  const noteEl = $('#autoEmailNoteOverride');
  const jsonEl = $('#autoEmailRawJson');
  if (subjEl) subjEl.value = studioState.overrides.subject;
  if (ctaEl) ctaEl.value = studioState.overrides.ctaLabel;
  if (headEl) headEl.value = studioState.overrides.headline;
  if (noteEl) noteEl.value = '';
  if (jsonEl) jsonEl.value = JSON.stringify(studioState.payload, null, 2);

  renderAutoEmailPresetBar();
  renderAutoEmailDetectionBar(det);
  renderAutoEmailPlaceholderFields(def);
  renderAutoEmailPreview();
}

function renderAutoEmailPresetBar() {
  const box = $('#autoEmailPresets');
  if (!box) return;
  const order = [
    'event_registration',
    'issue_update',
    'issue_resolved',
    'community_join_request',
    'community_join_approved',
    'community_join_rejected',
    'event_approved',
    'issue_created',
    'moderation_report'
  ];
  box.innerHTML = order
    .filter((k) => EVENT_TYPES[k])
    .map((k) => {
      const def = EVENT_TYPES[k];
      return `<button type="button" class="auto-email-preset-btn ${studioState.eventType === k ? 'active' : ''}" data-email-preset="${k}">${escapeHtml(def.label)}</button>`;
    })
    .join('');
}

function renderAutoEmailDetectionBar(det) {
  const lbl = $('#detectedTypeLabel');
  const reason = $('#detectedTypeReason');
  const keyEl = $('#detectedTypeKey');
  const conf = $('#detectedConfidence');
  if (lbl) lbl.textContent = det.definition.label;
  if (reason) reason.textContent = det.reason;
  if (keyEl) keyEl.textContent = det.eventType;
  if (conf) conf.textContent = `Confidence: ${det.confidence}`;
}

function renderAutoEmailPlaceholderFields(def) {
  const box = $('#autoEmailDynamicFields');
  const countLbl = $('#placeholderCountLabel');
  if (!box) return;
  const schema = def.placeholders || [];
  if (countLbl) countLbl.textContent = `${schema.length} placeholders`;
  box.innerHTML = schema
    .map((p) => {
      const val = studioState.placeholders[p.key] ?? '';
      return `<div class="field" style="margin:0">
        <label class="split" for="ph_${escapeHtml(p.key)}" style="margin-bottom:4px">
          <span>${escapeHtml(p.label)}${p.required ? ' *' : ''}</span>
          <code class="auto-email-token">{{${escapeHtml(p.key)}}}</code>
        </label>
        <input id="ph_${escapeHtml(p.key)}" data-placeholder-key="${escapeHtml(p.key)}" value="${escapeHtml(val)}" placeholder="${escapeHtml(p.example || '')}">
      </div>`;
    })
    .join('');
}

function renderAutoEmailPreview() {
  const res = generateNotificationEmail(studioState.payload, {
    eventType: studioState.eventType,
    placeholders: studioState.placeholders,
    overrides: studioState.overrides,
    keepPlaceholders: studioState.keepPlaceholders
  });
  studioState.lastRendered = res;

  const toLine = $('#previewToLine');
  const subjLine = $('#previewSubjectLine');
  if (toLine) {
    const email = studioState.keepPlaceholders ? '{{recipientEmail}}' : (res.variables.recipientEmail || '(recipientEmail empty)');
    const name = studioState.keepPlaceholders ? '{{recipientName}}' : res.variables.recipientName;
    toLine.textContent = `${name} <${email}>`;
  }
  if (subjLine) subjLine.textContent = res.subject;

  const iframe = $('#autoEmailIframe');
  const srcBox = $('#autoEmailSourceBox');
  const txtBox = $('#autoEmailTextBox');
  if (iframe) iframe.srcdoc = res.html;
  if (srcBox) srcBox.value = res.html;
  if (txtBox) txtBox.value = res.text;

  const gmailBtn = $('#openGmailDraftBtn');
  if (gmailBtn) {
    gmailBtn.href = buildGmailComposeUrl({
      to: res.variables.recipientEmail || '',
      subject: res.subject,
      body: res.text
    });
  }
}

async function populateLiveRecordOptions() {
  const sel = $('#autoEmailLiveSource');
  if (!sel) return;
  const records = [];
  if (db) {
    try {
      const [issSnap, reqSnap, evSnap] = await Promise.all([
        getDocs(query(collection(db, 'issues'), orderBy('createdAt', 'desc'), limit(5))),
        getDocs(query(collection(db, 'groupRequests'), orderBy('createdAt', 'desc'), limit(5))),
        getDocs(query(collection(db, 'events'), orderBy('date', 'asc'), limit(5)))
      ]);
      issSnap.docs.forEach((d) => {
        const data = d.data();
        records.push({
          id: `iss:${d.id}`,
          label: `Issue: ${(data.title || '').slice(0, 38)} (${data.status || 'Open'})`,
          payload: { collection: 'issues', action: 'update', issueId: d.id, ...data }
        });
      });
      reqSnap.docs.forEach((d) => {
        const data = d.data();
        records.push({
          id: `req:${d.id}`,
          label: `Join Req: ${data.displayName || 'Student'} → ${data.groupName || data.groupId} (${data.status || 'pending'})`,
          payload: { collection: 'groupRequests', action: data.status === 'pending' ? 'create' : 'update', requestId: d.id, ...data }
        });
      });
      evSnap.docs.forEach((d) => {
        const data = d.data();
        records.push({
          id: `ev:${d.id}`,
          label: `Event RSVP: ${(data.title || '').slice(0, 38)}`,
          payload: { collection: 'eventInterest', action: 'create', eventId: d.id, eventTitle: data.title, eventOrganizer: data.organizer, eventVenue: data.venue, eventDate: data.date, registrationId: `EVT-${d.id.slice(0, 6).toUpperCase()}` }
        });
      });
    } catch {}
  }

  if (!records.length) {
    records.push(
      { id: 'demo-ev', label: 'Demo Event Registration: Campus Hacknight', payload: SAMPLE_PAYLOADS.event_registration },
      { id: 'demo-iss', label: 'Demo Issue Update: Library Wi-Fi', payload: SAMPLE_PAYLOADS.issue_update },
      { id: 'demo-grp', label: 'Demo Community Request: Campus Coders', payload: SAMPLE_PAYLOADS.community_join_request }
    );
  }
  studioState.liveRecords = records;
  sel.innerHTML = '<option value="">Load Live Campus Record…</option>' +
    records.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.label)}</option>`).join('');
}

async function loadAutoEmailLogs() {
  const tbody = $('[data-auto-email-logs]');
  if (!tbody) return;
  try {
    const logs = await listAutoEmailLogs(20);
    tbody.innerHTML = logs.length
      ? logs
          .map(
            (l) => `<tr>
        <td><code class="auto-email-token">${escapeHtml(l.eventType || 'unknown')}</code></td>
        <td class="small">${escapeHtml(l.recipientEmail || '—')}</td>
        <td class="small"><strong>${escapeHtml((l.subject || '').slice(0, 70))}</strong></td>
        <td class="small muted">${escapeHtml(l.source || 'studio')}</td>
        <td><span class="badge ${l.status === 'sent' ? 'success' : l.status === 'failed' ? 'danger' : 'warning'}">${escapeHtml(l.status || 'preview')}</span></td>
        <td class="small muted">${l.createdAtMs ? formatDateTime(l.createdAtMs) : l.createdAt ? formatDateTime(l.createdAt) : 'Just now'}</td>
      </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="muted">No automated emails dispatched yet. Send a test email above or trigger an issue/event action.</td></tr>';
  } catch (err) {
    tbody.innerHTML = errorRow(6, err.message || 'Could not load auto-email logs.');
  }
}

function initAutoEmailStudio() {
  if (!autoEmailInitialized) {
    autoEmailInitialized = true;
    setStudioPayload(SAMPLE_PAYLOADS.event_registration, 'event_registration');
  }
  populateLiveRecordOptions();
  loadAutoEmailLogs();
  window.lucide?.createIcons();
}

// Auto Email Studio Event Listeners
document.addEventListener('click', async (e) => {
  const presetBtn = e.target.closest('[data-email-preset]');
  if (presetBtn) {
    const key = presetBtn.dataset.emailPreset;
    const sample = SAMPLE_PAYLOADS[key] || { eventType: key };
    setStudioPayload(sample, key);
    return;
  }

  if (e.target.closest('#autoEmailToggleJsonBtn')) {
    const drawer = $('#autoEmailJsonDrawer');
    if (drawer) drawer.hidden = !drawer.hidden;
    return;
  }

  if (e.target.closest('#autoEmailResetJsonBtn')) {
    const sample = SAMPLE_PAYLOADS[studioState.eventType] || SAMPLE_PAYLOADS.event_registration;
    setStudioPayload(sample, studioState.eventType);
    return;
  }

  if (e.target.closest('#autoEmailDetectBtn')) {
    const rawText = $('#autoEmailRawJson')?.value?.trim();
    if (!rawText) return toast('Paste a JSON event payload first.', 'warning');
    try {
      const parsed = JSON.parse(rawText);
      const det = detectEventType(parsed);
      setStudioPayload(parsed, null);
      toast(`Detected event type: ${det.definition.label}`);
    } catch {
      toast('Invalid JSON payload. Check syntax and try again.', 'error');
    }
    return;
  }

  const viewBtn = e.target.closest('[data-preview-mode]');
  if (viewBtn) {
    const mode = viewBtn.dataset.previewMode;
    studioState.previewMode = mode;
    $$('#autoEmailViewTabs button').forEach((b) => b.classList.toggle('active', b.dataset.previewMode === mode));
    $('#previewHtmlPane').hidden = mode !== 'html';
    $('#previewSourcePane').hidden = mode !== 'source';
    $('#previewTextPane').hidden = mode !== 'text';
    return;
  }

  if (e.target.closest('#autoEmailWidthToggle')) {
    studioState.mobilePreview = !studioState.mobilePreview;
    const iframe = $('#autoEmailIframe');
    const btn = $('#autoEmailWidthToggle');
    iframe?.classList.toggle('mobile', studioState.mobilePreview);
    if (btn) {
      btn.querySelector('span').textContent = studioState.mobilePreview ? 'Desktop Width' : 'Mobile Width';
    }
    return;
  }

  if (e.target.closest('#copyEmailHtmlBtn')) {
    const html = studioState.lastRendered?.html || '';
    if (!html) return;
    await navigator.clipboard?.writeText(html).catch(() => {});
    toast(studioState.keepPlaceholders ? 'Copied HTML template with {{placeholders}}' : 'Copied rendered HTML email');
    return;
  }

  if (e.target.closest('#copyEmailTextBtn')) {
    const txt = studioState.lastRendered?.text || '';
    if (!txt) return;
    await navigator.clipboard?.writeText(txt).catch(() => {});
    toast('Copied plain-text email');
    return;
  }

  if (e.target.closest('#refreshAutoEmailLogsBtn')) {
    loadAutoEmailLogs();
    return;
  }

  if (e.target.closest('#sendAutoEmailBtn')) {
    const btn = $('#sendAutoEmailBtn');
    const statusBox = $('#autoEmailDispatchStatus');
    const to = String(studioState.placeholders.recipientEmail || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      toast('Enter a valid {{recipientEmail}} before dispatching.', 'warning');
      $('#ph_recipientEmail')?.focus();
      return;
    }
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span> Dispatching…';
    try {
      const res = await dispatchAutomatedEmailNotification({
        payload: studioState.payload,
        context: { eventType: studioState.eventType },
        placeholders: studioState.placeholders,
        overrides: studioState.overrides,
        sendNow: true,
        source: 'admin_studio'
      });
      if (statusBox) {
        statusBox.style.color = 'var(--success, #16a34a)';
        statusBox.textContent = res.dispatched
          ? `Delivered via SMTP to ${to} (${res.eventType}).`
          : `Template rendered & logged for ${to} (${res.eventType}). Deploy Cloud Functions with SMTP_PASS for live inbox delivery.`;
      }
      toast(res.dispatched ? `Email sent to ${to}` : `Automated email logged for ${to}`);
      loadAutoEmailLogs();
    } catch (err) {
      if (statusBox) {
        statusBox.style.color = 'var(--danger, #dc2626)';
        statusBox.textContent = err.message || 'Dispatch failed.';
      }
      toast(err.message || 'Failed to dispatch email', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
      window.lucide?.createIcons();
    }
  }
});

document.addEventListener('input', (e) => {
  const phKey = e.target?.dataset?.placeholderKey;
  if (phKey) {
    studioState.placeholders[phKey] = e.target.value;
    renderAutoEmailPreview();
    return;
  }
  if (e.target.id === 'autoEmailSubjectOverride') {
    studioState.overrides.subject = e.target.value;
    renderAutoEmailPreview();
  } else if (e.target.id === 'autoEmailCtaOverride') {
    studioState.overrides.ctaLabel = e.target.value;
    renderAutoEmailPreview();
  } else if (e.target.id === 'autoEmailHeadlineOverride') {
    studioState.overrides.headline = e.target.value;
    renderAutoEmailPreview();
  } else if (e.target.id === 'autoEmailNoteOverride') {
    studioState.overrides.customNote = e.target.value;
    renderAutoEmailPreview();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'autoEmailKeepPlaceholders') {
    studioState.keepPlaceholders = Boolean(e.target.checked);
    renderAutoEmailPreview();
    return;
  }
  if (e.target.id === 'autoEmailLiveSource') {
    const val = e.target.value;
    const match = studioState.liveRecords.find((r) => r.id === val);
    if (match) {
      setStudioPayload(match.payload, null);
      toast(`Loaded & detected: ${EVENT_TYPES[studioState.eventType]?.label || studioState.eventType}`);
    }
  }
});

subscribeAuth((u,p)=>{
  if(!requireAuth())return;
  adminProfile=p;
  if(!db){
    const banner=document.createElement('div');
    banner.className='notice warning';
    banner.style.marginBottom='16px';
    banner.innerHTML='<strong>Demo mode.</strong> Showing simulated moderation data. Connect Firebase to manage live campus data.';
    const target=document.querySelector('.page-head');
    target?.parentElement?.insertBefore(banner,target.nextSibling);
  }
  if(db && !hasRole('platformAdmin','moderator')){
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
