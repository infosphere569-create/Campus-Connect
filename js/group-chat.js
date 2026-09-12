// Real-time WhatsApp-style chat for a group: live message stream, pin (leader
// only), and a leader-only "announce to all" broadcast that also notifies
// every member (via the broadcastGroupMessage Cloud Function, since creating
// notifications for other people is staff-gated at the rules level -- a group
// leader isn't necessarily platform staff, so this has to go through a
// function that verifies leadership server-side).
import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentUser,currentProfile} from './auth.js';
import {collection,addDoc,doc,getDoc,updateDoc,onSnapshot,query,orderBy,limit,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import { getQuery, escapeHtml, linkifyHtml, initials, timeAgo, toast } from './utils.js';

let groupId=null, isLeader=false, unsub=null;

function bubble(m){
 const mine=m.authorId===currentUser?.uid;
 const pinned=m.pinned?'<div class="chat-pinned-tag"><i data-lucide="pin"></i>Pinned</div>':'';
 const broadcastTag=m.broadcast?'<div class="chat-broadcast-tag"><i data-lucide="megaphone"></i>Announcement</div>':'';
 return `<div class="chat-row ${mine?'mine':''}" data-msg-id="${escapeHtml(m.id)}">
  ${mine?'':`<div class="avatar sm">${initials(m.authorName)}</div>`}
  <div class="chat-bubble ${m.broadcast?'chat-bubble-broadcast':''}">
   ${broadcastTag}${pinned}
   ${mine?'':`<div class="chat-author">${escapeHtml(m.authorName||'Student')}</div>`}
   <div class="chat-text">${linkifyHtml(m.text||'')}</div>
   <div class="chat-time">${timeAgo(m.createdAt)}</div>
   ${isLeader?`<button class="chat-pin-btn" data-toggle-pin="${escapeHtml(m.id)}" title="${m.pinned?'Unpin':'Pin'}"><i data-lucide="pin"></i></button>`:''}
  </div>
 </div>`;
}

function renderMessages(msgs){
 const win=document.getElementById('chatWindow');
 if(!win)return;
 const wasAtBottom=win.scrollTop+win.clientHeight>=win.scrollHeight-40;
 if(!msgs.length){
  win.innerHTML='<div class="empty"><i data-lucide="message-circle"></i><h3>No messages yet</h3><p class="muted">Say hello to the group.</p></div>';
 }else{
  win.innerHTML=msgs.map(bubble).join('');
 }
 window.lucide?.createIcons();
 const pinned=msgs.find(m=>m.pinned);
 const pinBar=document.getElementById('pinnedMessageBar');
 if(pinBar){
  if(pinned){pinBar.hidden=false;pinBar.className='chat-pinned-bar';pinBar.innerHTML=`<i data-lucide="pin"></i><span>${escapeHtml((pinned.text||'').slice(0,80))}</span>`;window.lucide?.createIcons()}
  else{pinBar.hidden=true}
 }
 if(wasAtBottom)win.scrollTop=win.scrollHeight;
}

async function start(){
 groupId=getQuery('id');
 if(!db||!groupId)return;
 try{
  const gsnap=await getDoc(doc(db,'groups',groupId));
  if(!gsnap.exists())return;
  isLeader=gsnap.data().createdBy===currentUser?.uid;
  const bcOption=document.getElementById('broadcastOption');if(bcOption)bcOption.hidden=!isLeader;
 }catch(e){}
 const q=query(collection(db,'groups',groupId,'messages'),orderBy('createdAt','asc'),limit(100));
 unsub=onSnapshot(q,snap=>{
  const msgs=snap.docs.map(d=>({id:d.id,...d.data()}));
  renderMessages(msgs);
 },err=>{
  const win=document.getElementById('chatWindow');
  if(win)win.innerHTML=`<div class="empty"><i data-lucide="alert-triangle"></i><h3>Could not load chat</h3><p class="muted">${escapeHtml(err.message||'')}</p></div>`;
  window.lucide?.createIcons();
 });
}

document.getElementById('chatForm')?.addEventListener('submit',async e=>{
 e.preventDefault();
 if(!db||!groupId)return toast('Connect Firebase to chat.','warning');
 const input=document.getElementById('chatInput');
 const text=input.value.trim();if(!text)return;
 const broadcastCheck=document.getElementById('broadcastCheck');
 const wantsBroadcast=isLeader&&broadcastCheck?.checked;
 input.value='';
 const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
 try{
  if(wantsBroadcast){
   await httpsCallable(getFunctions(),'broadcastGroupMessage')({groupId,text});
   if(broadcastCheck)broadcastCheck.checked=false;
   toast('Announcement sent to all members');
  }else{
   await addDoc(collection(db,'groups',groupId,'messages'),{text,authorId:currentUser.uid,authorName:currentProfile?.displayName||'Student',pinned:false,broadcast:false,createdAt:serverTimestamp()});
  }
 }catch(err){input.value=text;toast(err.message||'Could not send message.','error')}
 finally{btn.disabled=false}
});

document.addEventListener('click',async e=>{
 const pinBtn=e.target.closest('[data-toggle-pin]');
 if(pinBtn&&groupId){
  const id=pinBtn.dataset.togglePin;
  const row=pinBtn.closest('[data-msg-id]');
  const currentlyPinned=row?.querySelector('.chat-pinned-tag');
  try{await updateDoc(doc(db,'groups',groupId,'messages',id),{pinned:!currentlyPinned})}
  catch(err){toast(err.message||'Could not update pin.','error')}
 }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;start()});
