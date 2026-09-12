import {isGroupMember,hasGroupRequest} from "./data-layer.js";
import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth,currentProfile,currentUser} from './auth.js';import {doc,getDoc,setDoc,updateDoc,collection,getDocs,query,where,limit,addDoc,serverTimestamp,increment} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';import { $, getQuery, escapeHtml, initials, toast } from './utils.js';import {uploadImage} from './services.js';
let group=null;

async function load(){
 const id=getQuery('id'), inviteCode=getQuery('invite');
 if(!db){group={id:'demo',name:'Campus Coders',category:'Coding',description:'Connect Firebase to see real campus groups.',memberCount:0,status:'approved',rules:'Be useful, respectful and on-topic.'};renderGroup();return}

 // Someone opened a shared invite link (group.html?invite=CODE) instead of a
 // normal ?id= link. Resolve the code to a group and auto-join them directly
 // -- WhatsApp/Telegram style -- instead of going through the request/approve
 // flow, since arriving via a trusted invite link implies consent to join.
 let resolvedId=id;
 if(inviteCode&&!id){
  try{
   const inviteSnap=await getDoc(doc(db,'groupInvites',inviteCode));
   if(!inviteSnap.exists()){document.querySelector('[data-group-name]').textContent='Invite link is invalid or expired';return}
   resolvedId=inviteSnap.data().groupId;
   const memberRef=doc(db,'groupMembers',`${resolvedId}_${currentUser.uid}`);
   const already=await getDoc(memberRef);
   if(!already.exists()){
    await setDoc(memberRef,{groupId:resolvedId,uid:currentUser.uid,role:'member',joinedAt:serverTimestamp()});
    await updateDoc(doc(db,'groups',resolvedId),{memberCount:increment(1)});
    toast('Joined the group via invite link');
   }
   history.replaceState(null,'',`group.html?id=${encodeURIComponent(resolvedId)}`);
  }catch(err){toast(err.message||'Could not join via this invite link.','error');return}
 }

 if(!resolvedId){document.querySelector('[data-group-name]').textContent='Group not found';return}
 try{const s=await getDoc(doc(db,'groups',resolvedId));if(s.exists()){group={id:s.id,...s.data()}}else{document.querySelector('[data-group-name]').textContent='Group not found';document.querySelector('[data-group-description]').textContent='This group may have been removed or the link is incorrect.';return}}
 catch(e){toast('Could not load this group.','error');document.querySelector('[data-group-name]').textContent='Could not load group';return}
 renderGroup();
}

async function refreshJoinButton(){
 const btn=document.querySelector('[data-group-join]');
 if(!btn||!db||group.id==='demo')return;
 if(group.createdBy===currentUser.uid){btn.innerHTML='<i data-lucide="crown"></i>You lead this group';btn.disabled=true;btn.classList.remove('primary');window.lucide?.createIcons();return}
 try{
  const [isMember,hasRequest]=await Promise.all([isGroupMember(group.id),hasGroupRequest(group.id)]);
  if(isMember){btn.innerHTML='<i data-lucide="check"></i>Joined';btn.disabled=true;btn.classList.remove('primary')}
  else if(hasRequest){btn.innerHTML='<i data-lucide="clock"></i>Request sent';btn.disabled=true;btn.classList.remove('primary')}
  else{btn.innerHTML='<i data-lucide="user-plus"></i>Join group';btn.disabled=false;btn.classList.add('primary')}
  window.lucide?.createIcons();
 }catch(e){}
}

function renderGroup(){
 document.querySelector('[data-group-name]').textContent=group.name;
 document.querySelector('[data-group-category]').textContent=group.category||'Community';
 document.querySelector('[data-group-description]').textContent=group.description||'';
 document.querySelector('[data-member-count]').textContent=`${group.memberCount||0} members`;
 document.querySelector('[data-group-avatar]').textContent=initials(group.name);
 document.querySelector('[data-group-rules]').textContent=group.rules||'Be respectful and on-topic.';
 document.querySelector('[data-group-rules-aside]').textContent=group.rules||'Be respectful and on-topic.';
 const cover=document.querySelector('[data-group-cover]');
 if(cover&&group.coverURL)cover.style.backgroundImage=`url("${group.coverURL}")`,cover.style.backgroundSize='cover',cover.style.backgroundPosition='center';
 const isLeader=db&&group.id!=='demo'&&group.createdBy===currentUser?.uid;
 const coverLabel=document.getElementById('coverUploadLabel');if(coverLabel)coverLabel.hidden=!isLeader;
 const inviteBtn=document.querySelector('[data-group-invite]');if(inviteBtn)inviteBtn.hidden=!isLeader;
 loadGroupPosts();loadMembers();refreshJoinButton();
}

async function loadGroupPosts(){const box=document.querySelector('[data-group-posts]');
 if(!db||group.id==='demo'){box.innerHTML='<div class="card empty"><i data-lucide="wifi-off"></i><h3>Not connected</h3><p class="muted">Connect Firebase to see this group\u2019s posts.</p></div>';window.lucide?.createIcons();return}
 let posts=[];try{const snap=await getDocs(query(collection(db,'posts'),where('groupId','==',group.id),limit(15)));posts=snap.docs.map(d=>({id:d.id,...d.data()}))}catch{}
 if(!posts.length){box.innerHTML='<div class="card empty"><i data-lucide="message-circle"></i><h3>No posts yet</h3><p class="muted">Share the first update, question or resource with this group.</p></div>';window.lucide?.createIcons();return}
 box.innerHTML=posts.map(p=>`<article class="card post-card"><div class="post-head"><div class="avatar">${initials(p.authorName)}</div><div class="post-meta"><strong>${escapeHtml(p.authorName)}</strong><span>${escapeHtml(p.branch||'Student')} · ${p.createdAt?.toDate?p.createdAt.toDate().toLocaleString(): 'Just now'}</span></div></div><div class="post-text">${escapeHtml(p.text)}</div><div class="post-actions"><button class="action"><i data-lucide="heart"></i>${p.likes||0}</button><button class="action"><i data-lucide="message-circle"></i>${p.comments||0}</button></div></article>`).join('');window.lucide?.createIcons()}

async function loadMembers(){
 const targets=[document.querySelector('[data-members]'),document.querySelector('[data-members-main]')].filter(Boolean);
 if(!targets.length)return;
 if(!db||group.id==='demo'){for(const box of targets)box.innerHTML='<div class="empty"><i data-lucide="users"></i><h3>Not connected</h3><p>Members appear here once the community is connected to Firebase.</p></div>';window.lucide?.createIcons();return}
 try{
  const snap=await getDocs(query(collection(db,'groupMembers'),where('groupId','==',group.id),limit(50)));
  const html=snap.docs.map(d=>{const m=d.data();const label=m.uid===group.createdBy?'Leader':(m.role==='admin'?'Group leader':m.role==='moderator'?'Moderator':'Member');
   return `<div class="list-row row"><div class="avatar">${initials(m.displayName||'Student')}</div><div><strong>${escapeHtml(m.displayName||'Student')}</strong><div class="small muted">${escapeHtml(label)}</div></div></div>`}).join('')||'<div class="empty"><h3>No members listed yet</h3></div>';
  for(const box of targets)box.innerHTML=html;
 }catch{for(const box of targets)box.innerHTML='<div class="empty"><h3>Members unavailable</h3></div>'}
}

function activateGroupTab(name){
 for(const btn of document.querySelectorAll('[data-group-tabs] .tab'))btn.classList.toggle('active',btn.dataset.gtab===name);
 for(const panel of document.querySelectorAll('[data-gtab-panel]'))panel.hidden=panel.dataset.gtabPanel!==name;
}

document.addEventListener('click',async e=>{
 const tabBtn=e.target.closest('[data-group-tabs] .tab');if(tabBtn){activateGroupTab(tabBtn.dataset.gtab);return}

 if(e.target.closest('[data-group-join]')){
  if(!db||group.id==='demo')return toast('Connect Firebase to persist membership.','warning');
  const btn=e.target.closest('[data-group-join]');btn.disabled=true;
  try{await addDoc(collection(db,'groupRequests'),{groupId:group.id,groupName:group.name,uid:currentUser.uid,status:'pending',createdAt:serverTimestamp()});toast('Membership request sent');refreshJoinButton()}
  catch(err){toast(err.message,'error');btn.disabled=false}
  return;
 }

 if(e.target.closest('[data-group-invite]')){
  if(!db||group.id==='demo')return toast('Connect Firebase to create invite links.','warning');
  try{
   const code=(crypto.randomUUID?crypto.randomUUID():String(Math.random())).replace(/-/g,'').slice(0,10);
   await setDoc(doc(db,'groupInvites',code),{groupId:group.id,createdBy:currentUser.uid,createdAt:serverTimestamp()});
   const url=`${location.origin}${location.pathname.replace(/[^/]*$/,'')}group.html?invite=${code}`;
   if(navigator.share){await navigator.share({title:`Join ${group.name} on Campus Connect`,text:'Join our group on Campus Connect',url})}
   else{await navigator.clipboard.writeText(url);toast('Invite link copied — share it to add members instantly')}
  }catch(err){if(err?.name!=='AbortError')toast(err.message||'Could not create invite link.','error')}
  return;
 }

 if(e.target.closest('[data-group-post]')){if(!db||group.id==='demo')return toast('Connect Firebase to post in this demo group.','warning');}
});

document.getElementById('coverInput')?.addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file||!db||group.id==='demo')return;
 try{
  toast('Uploading cover…');
  const url=await uploadImage(file,`groups/${group.id}/cover-${Date.now()}`);
  await updateDoc(doc(db,'groups',group.id),{coverURL:url});
  group.coverURL=url;
  const cover=document.querySelector('[data-group-cover]');
  if(cover){cover.style.backgroundImage=`url("${url}")`;cover.style.backgroundSize='cover';cover.style.backgroundPosition='center'}
  toast('Cover photo updated');
 }catch(err){toast(err.message||'Could not update cover photo.','error')}
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export async function getMembershipState(groupId){
 const [member,request]=await Promise.all([isGroupMember(groupId),hasGroupRequest(groupId)]);
 return member?"member":request?"pending":"none";
}
