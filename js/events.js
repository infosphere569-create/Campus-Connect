import {toggleEventInterest} from "./interactions.js";
import {isEventInterested} from "./data-layer.js";
import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth} from './auth.js';import {collection,getDocs,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';import { $, $$, escapeHtml, formatDateTime, toast } from './utils.js';
function card(e){const d=e.date?.toDate?e.date.toDate():new Date(e.date);return `<article class="card event-card event-enhanced" data-event-id="${escapeHtml(e.id)}"><div class="event-date-large"><span>${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span><strong>${d.getDate()}</strong></div><div class="event-main"><div class="badge primary">${escapeHtml(e.organizer||'Campus event')}</div><h3>${escapeHtml(e.title)}</h3><p class="muted">${escapeHtml(e.description||'')}</p><div class="small muted row"><i data-lucide="clock"></i>${formatDateTime(e.date)} <span>•</span><i data-lucide="map-pin"></i>${escapeHtml(e.venue||'Campus')}</div></div><div class="event-action"><button class="btn sm primary" data-interest><span data-interest-count>Interested · ${e.interestedCount||0}</span></button></div></article>}
async function load(){
 if(!db){$('#eventList').innerHTML='<div class="card empty"><i data-lucide="wifi-off"></i><h3>Not connected</h3><p class="muted">Connect Firebase to see real campus events.</p></div>';window.lucide?.createIcons();return}
 let items=[];try{const snap=await getDocs(query(collection(db,'events'),orderBy('date','asc'),limit(30)));items=snap.docs.map(d=>({id:d.id,...d.data()}))}catch(e){toast('Could not load events.','error')}
 if(!items.length){$('#eventList').innerHTML='<div class="card empty"><i data-lucide="calendar-days"></i><h3>No upcoming events</h3><p class="muted">Check back soon or ask your group to schedule one.</p></div>';window.lucide?.createIcons();return}
 $('#eventList').innerHTML=items.map(card).join('');window.lucide?.createIcons();
 for(const el of $$('[data-event-id]'))refreshEventInterestButton(el.dataset.eventId,el.querySelector('[data-interest]'));
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-interest]');if(!b)return;
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
});
subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export async function refreshEventInterestButton(eventId,button){
 try{button.classList.toggle("active",await isEventInterested(eventId));}catch(e){}
}
