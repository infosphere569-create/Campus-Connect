import {getSavedPosts,getMyGroups,getMyEventInterest} from "./data-layer.js";
import './theme.js';import {db,storage} from './firebase.js';import {subscribeAuth,requireAuth,currentProfile,currentUser} from './auth.js';import {doc,updateDoc,serverTimestamp,collection,getDocs,query,where,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';import { $, escapeHtml, linkifyHtml, initials, timeAgo, toast, showModal } from './utils.js';import {uploadImage} from './services.js';
let profile;

function render(p){profile=p;$('[data-profile-name]').textContent=p.displayName||'Student';$('[data-profile-bio]').textContent=p.bio||'Part of the Campus Connect community.';$('[data-profile-avatar]').innerHTML=p.photoURL?`<img src="${escapeHtml(p.photoURL)}" alt="Profile photo">`:escapeHtml(initials(p.displayName));$('[data-profile-academic]').textContent=[p.course,p.branch,p.year].filter(Boolean).join(' • ')||'Student';$('#profileCollege').textContent=p.college||'';const sectionEl=$('#profileSection'); if(sectionEl) sectionEl.textContent=p.section?`Section ${p.section}`:'';}

function edit(){showModal('Edit profile','<form class="form" id="profileForm"><div class="field"><label>Name</label><input name="displayName" value="'+escapeHtml(profile.displayName||'')+'" required></div><div class="field"><label>Bio</label><textarea name="bio" maxlength="250">'+escapeHtml(profile.bio||'')+'</textarea></div><div class="field"><label>Profile photo</label><input id="profilePhoto" type="file" accept="image/*"><div id="profileUploadStatus" class="small muted">Use a clear square image under 8 MB.</div></div><div class="grid grid-2"><div class="field"><label>Course</label><input name="course" value="'+escapeHtml(profile.course||'')+'"></div><div class="field"><label>Branch</label><input name="branch" value="'+escapeHtml(profile.branch||'')+'"></div><div class="field"><label>Year</label><input name="year" value="'+escapeHtml(profile.year||'')+'"></div><div class="field"><label>Section</label><input name="section" value="'+escapeHtml(profile.section||'')+'"></div></div><div style="text-align:right"><button class="btn primary" type="submit">Save changes</button></div></form>');$('#profileForm').addEventListener('submit',async e=>{e.preventDefault();if(!db)return toast('Connect Firebase to save profile changes.','warning');const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;const fd=new FormData(e.currentTarget);try{let photoURL=profile.photoURL||'';const file=$('#profilePhoto').files[0];if(file)photoURL=await uploadImage(file,`users/${currentUser.uid}/avatar-${Date.now()}`,p=>$('#profileUploadStatus').textContent=`Uploading… ${p}%`);const values={displayName:String(fd.get('displayName')).trim(),bio:String(fd.get('bio')||'').trim(),course:String(fd.get('course')||'').trim(),branch:String(fd.get('branch')||'').trim(),year:String(fd.get('year')||'').trim(),section:String(fd.get('section')||'').trim(),photoURL,updatedAt:serverTimestamp()};await updateDoc(doc(db,'users',profile.uid),values);Object.assign(profile,values);render(profile);document.querySelector('.modal-backdrop')?.remove();toast('Profile updated')}catch(err){btn.disabled=false;toast(err.message,'error')}})}

function empty(icon,title,body){return `<div class="card empty"><i data-lucide="${icon}"></i><h3>${title}</h3><p class="muted">${body}</p></div>`}
function errorState(msg){return `<div class="card empty"><i data-lucide="alert-triangle"></i><h3>Could not load this</h3><p class="muted">${escapeHtml(msg||'')}</p></div>`}

async function loadPosts(){
 const box=$('[data-ptab-panel="posts"]');
 if(!db){box.innerHTML=empty('wifi-off','Not connected','Connect Firebase to see your posts.');window.lucide?.createIcons();return}
 try{
  const snap=await getDocs(query(collection(db,'posts'),where('authorId','==',currentUser.uid),orderBy('createdAt','desc'),limit(30)));
  const posts=snap.docs.map(d=>({id:d.id,...d.data()}));
  $('[data-stat-posts]').textContent=posts.length;
  box.innerHTML=posts.length?posts.map(p=>`<article class="card post-card"><div class="post-text">${linkifyHtml(p.text||'')}</div>${p.imageURL?`<img class="post-media" src="${escapeHtml(p.imageURL)}" alt="Post image">`:''}<div class="small muted" style="margin-top:8px">${timeAgo(p.createdAt)} · ${p.likes||0} likes · ${p.comments||0} comments</div></article>`).join(''):empty('pen-line','No posts yet','Share your first update with your campus.');
  window.lucide?.createIcons();
 }catch(e){box.innerHTML=errorState(e.message);$('[data-stat-posts]').textContent='—';window.lucide?.createIcons()}
}
async function loadGroups(){
 const box=$('[data-ptab-panel="groups"]');
 if(!db){box.innerHTML=empty('wifi-off','Not connected','Connect Firebase to see your groups.');window.lucide?.createIcons();return}
 try{
  const groups=await getMyGroups();
  $('[data-stat-groups]').textContent=groups.length;
  box.innerHTML=groups.length?groups.map(g=>`<a class="card" href="group.html?id=${encodeURIComponent(g.id)}"><strong>${escapeHtml(g.name||'Group')}</strong><div class="small muted">${escapeHtml(g.category||'')}</div></a>`).join(''):empty('users-round','No groups yet','Join a community from the Groups tab.');
  window.lucide?.createIcons();
 }catch(e){box.innerHTML=errorState(e.message);$('[data-stat-groups]').textContent='—';window.lucide?.createIcons()}
}
async function loadSaved(){
 const box=$('[data-ptab-panel="saved"]');
 if(!db){box.innerHTML=empty('wifi-off','Not connected','Connect Firebase to see saved posts.');window.lucide?.createIcons();return}
 try{
  const posts=await getSavedPosts();
  $('[data-stat-saved]').textContent=posts.length;
  box.innerHTML=posts.length?posts.map(p=>`<article class="card post-card"><div class="post-text">${linkifyHtml(p.text||'')}</div><div class="small muted" style="margin-top:8px">${timeAgo(p.createdAt)}</div></article>`).join(''):empty('bookmark','No saved posts','Tap Save on a post in the feed to keep it here.');
  window.lucide?.createIcons();
 }catch(e){box.innerHTML=errorState(e.message);$('[data-stat-saved]').textContent='—';window.lucide?.createIcons()}
}
async function loadEvents(){
 const box=$('[data-ptab-panel="events"]');
 if(!db){box.innerHTML=empty('wifi-off','Not connected','Connect Firebase to see your events.');window.lucide?.createIcons();return}
 try{
  const events=await getMyEventInterest();
  box.innerHTML=events.length?events.map(e=>`<a class="card" href="events.html"><strong>${escapeHtml(e.title||'Event')}</strong><div class="small muted">${escapeHtml(e.venue||'')}</div></a>`).join(''):empty('calendar-days','No events yet','Mark yourself interested in an event to see it here.');
  window.lucide?.createIcons();
 }catch(e){box.innerHTML=errorState(e.message);window.lucide?.createIcons()}
}
const tabLoaders={posts:loadPosts,groups:loadGroups,saved:loadSaved,events:loadEvents};
const loadedTabs=new Set();
function activateTab(name){
 for(const btn of document.querySelectorAll('[data-profile-tabs] .tab'))btn.classList.toggle('active',btn.dataset.ptab===name);
 for(const panel of document.querySelectorAll('[data-ptab-panel]'))panel.hidden=panel.dataset.ptabPanel!==name;
 if(!loadedTabs.has(name)){loadedTabs.add(name);tabLoaders[name]?.()}
}

document.addEventListener('click',e=>{
 if(e.target.closest('[data-edit-profile]'))edit();
 const tabBtn=e.target.closest('[data-profile-tabs] .tab');if(tabBtn)activateTab(tabBtn.dataset.ptab);
});
subscribeAuth((u,p)=>{if(!requireAuth())return;render(p);activateTab('posts');loadGroups();loadSaved()});
