import {toggleEventInterest} from "./interactions.js";
import {isEventInterested} from "./data-layer.js";
import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth,currentUser} from './auth.js';import {collection,getDoc,getDocs,addDoc,updateDoc,deleteDoc,doc,query,where,orderBy,limit,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';import { $, $$, escapeHtml, linkifyHtml, formatDateTime, toast, showModal } from './utils.js';

function card(e){const d=e.date?.toDate?e.date.toDate():new Date(e.date);const mine=currentUser&&e.createdBy===currentUser.uid;
 return `<article class="card event-card event-enhanced" data-event-id="${escapeHtml(e.id)}"><div class="event-date-large"><span>${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span><strong>${d.getDate()}</strong></div><div class="event-main"><div class="badge primary">${escapeHtml(e.organizer||'Campus event')}</div><h3>${escapeHtml(e.title)}</h3><div class="muted">${linkifyHtml(e.description||'')}</div><div class="small muted row"><i data-lucide="clock"></i>${formatDateTime(e.date)} <span>•</span><i data-lucide="map-pin"></i>${escapeHtml(e.venue||'Campus')}</div></div><div class="event-action"><button class="btn sm primary" data-interest><span data-interest-count>Interested · ${e.interestedCount||0}</span></button>${mine?`<div class="toolbar" style="margin-top:6px"><button class="btn sm" data-edit-event="${e.id}">Edit</button><button class="btn sm danger" data-delete-event="${e.id}">Delete</button></div>`:''}</div></article>`}

async function load(){
 if(!db){$('#eventList').innerHTML='<div class="card empty"><i data-lucide="wifi-off"></i><h3>Not connected</h3><p class="muted">Connect Firebase to see real campus events.</p></div>';window.lucide?.createIcons();return}
 let items=[];try{const snap=await getDocs(query(collection(db,'events'),where('status','==','approved'),orderBy('date','asc'),limit(30)));items=snap.docs.map(d=>({id:d.id,...d.data()}))}catch(e){$('#eventList').innerHTML=`<div class="card empty"><i data-lucide="alert-triangle"></i><h3>Could not load events</h3><p class="muted">${escapeHtml(e.message||'')}</p></div>`;window.lucide?.createIcons();return}
 if(!items.length){$('#eventList').innerHTML='<div class="card empty"><i data-lucide="calendar-days"></i><h3>No upcoming events</h3><p class="muted">Be the first to propose one above.</p></div>';window.lucide?.createIcons();return}
 $('#eventList').innerHTML=items.map(card).join('');window.lucide?.createIcons();
 for(const el of $$('[data-event-id]'))refreshEventInterestButton(el.dataset.eventId,el.querySelector('[data-interest]'));
}

function proposeForm(existing){
 const isEdit=Boolean(existing);
 showModal(isEdit?'Edit event':'Propose an event',`<form class="form" id="eventForm"><div class="grid grid-2"><div class="field"><label>Title</label><input name="title" required maxlength="140" value="${existing?escapeHtml(existing.title):''}" placeholder="e.g. Campus Hacknight"></div><div class="field"><label>Organizer</label><input name="organizer" maxlength="100" value="${existing?escapeHtml(existing.organizer||''):''}" placeholder="e.g. Coding Community"></div></div><div class="grid grid-2"><div class="field"><label>Date &amp; time</label><input name="date" type="datetime-local" required value="${existing?toLocalInput(existing.date):''}"></div><div class="field"><label>Venue</label><input name="venue" maxlength="120" value="${existing?escapeHtml(existing.venue||''):''}" placeholder="e.g. Main Auditorium"></div></div><div class="field"><label>Description</label><textarea name="description" maxlength="1000" placeholder="What is this event about? Links are OK.">${existing?existing.description||'':''}</textarea></div>${isEdit?'':'<div class="notice small">New events need staff approval before they appear publicly. You will be able to edit or remove it once approved.</div>'}<div id="eventFormError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">${isEdit?'Save changes':'Submit for approval'}</button></div></form>`);
 window.lucide?.createIcons();
 $('#eventForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!db)return toast('Connect Firebase to propose events.','warning');
  const fd=new FormData(e.currentTarget),btn=e.currentTarget.querySelector('button[type="submit"]');
  const dateVal=fd.get('date');if(!dateVal){$('#eventFormError').textContent='Pick a date and time.';return}
  btn.disabled=true;
  try{
   const payload={title:String(fd.get('title')||'').trim(),organizer:String(fd.get('organizer')||'').trim(),venue:String(fd.get('venue')||'').trim(),description:String(fd.get('description')||'').trim(),date:new Date(dateVal)};
   if(isEdit){
    await updateDoc(doc(db,'events',existing.id),payload);
    toast('Event updated');
   }else{
    await addDoc(collection(db,'events'),{...payload,searchName:payload.title.toLowerCase(),status:'pending',interestedCount:0,createdBy:currentUser.uid,createdAt:serverTimestamp()});
    toast('Submitted for approval — it will appear once a moderator approves it.');
   }
   document.querySelector('.modal-backdrop')?.remove();
   load();
  }catch(err){$('#eventFormError').textContent=err.message||'Could not save this event.';btn.disabled=false}
 });
}
function toLocalInput(d){const dt=d?.toDate?d.toDate():new Date(d);const pad=n=>String(n).padStart(2,'0');return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`}

document.addEventListener('click',async e=>{
 if(e.target.closest('#proposeEventBtn')){if(!db)return toast('Connect Firebase to propose events.','warning');proposeForm(null);return}

 const b=e.target.closest('[data-interest]');if(b){
  if(!db)return toast('Connect Firebase to save event interest.','warning');
  const id=b.closest('[data-event-id]')?.dataset.eventId;if(!id)return;
  b.disabled=true;
  try{
   const active=await toggleEventInterest(id);
   b.classList.toggle('active',active);
   const span=b.querySelector('[data-interest-count]');
   const n=Number((span.textContent.match(/\d+/)||[0])[0]);
   span.textContent=`Interested · ${Math.max(0,n+(active?1:-1))}`;
  }catch(err){toast(err.message||'Could not save interest.','error')}
  finally{b.disabled=false}
  return;
 }

 const editBtn=e.target.closest('[data-edit-event]');if(editBtn){
  try{const snap=await getDoc(doc(db,'events',editBtn.dataset.editEvent));if(snap.exists())proposeForm({id:snap.id,...snap.data()})}catch(err){toast('Could not load this event.','error')}
  return;
 }

 const delBtn=e.target.closest('[data-delete-event]');if(delBtn){
  if(!confirm('Remove this event?'))return;
  try{await deleteDoc(doc(db,'events',delBtn.dataset.deleteEvent));toast('Event removed');load()}catch(err){toast(err.message||'Could not remove event.','error')}
  return;
 }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export async function refreshEventInterestButton(eventId,button){
 try{button.classList.toggle("active",await isEventInterested(eventId));}catch(e){}
}
