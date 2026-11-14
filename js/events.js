import {toggleEventInterest} from "./interactions.js";
import {isEventInterested} from "./data-layer.js";
import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentUser} from './auth.js';
import {collection,getDoc,getDocs,addDoc,updateDoc,deleteDoc,doc,query,where,orderBy,limit,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { $, $$, escapeHtml, linkifyHtml, formatDateTime, toast, showModal } from './utils.js';

const DEMO_EVENTS = [
  {
    id: 'demo-ev-1',
    title: 'Campus Hacknight 2026',
    organizer: 'Campus Coders',
    venue: 'Main Lab Block B',
    description: 'A 24-hour non-stop prototyping hackathon focusing on AI, Web3, and student campus utilities. Free food, mentor reviews and prizes!',
    date: new Date(Date.now() + 86400000 * 3),
    interestedCount: 78,
    status: 'approved'
  },
  {
    id: 'demo-ev-2',
    title: 'Placement Talk: Tech Career Roadmap & System Design',
    organizer: 'Placement Cell',
    venue: 'Auditorium A',
    description: 'Senior engineers share tips on cracking tech interviews, resume crafting, and portfolio building.',
    date: new Date(Date.now() + 86400000 * 6),
    interestedCount: 145,
    status: 'approved'
  },
  {
    id: 'demo-ev-3',
    title: 'Annual Cultural Fest Auditions',
    organizer: 'Music & Arts Society',
    venue: 'Open Amphitheatre',
    description: 'Calling all singers, dancers, instrumentalists, and stage actors for the annual college fest auditions.',
    date: new Date(Date.now() + 86400000 * 10),
    interestedCount: 92,
    status: 'approved'
  }
];

let allEvents = [...DEMO_EVENTS];

function card(e){
  const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
  const mine = currentUser && e.createdBy === currentUser.uid;

  return `<article class="card event-card event-enhanced" data-event-id="${escapeHtml(e.id)}">
    <div class="event-date-large">
      <span>${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span>
      <strong>${d.getDate()}</strong>
    </div>
    <div class="event-main">
      <div class="badge primary">${escapeHtml(e.organizer||'Campus event')}</div>
      <h3>${escapeHtml(e.title)}</h3>
      <div class="muted">${linkifyHtml(e.description||'')}</div>
      <div class="small muted row" style="margin-top:6px">
        <i data-lucide="clock"></i>${formatDateTime(e.date)}
        <span>•</span>
        <i data-lucide="map-pin"></i>${escapeHtml(e.venue||'Campus')}
      </div>
    </div>
    <div class="event-action">
      <button class="btn sm primary" data-interest>
        <span data-interest-count>Interested · ${e.interestedCount||0}</span>
      </button>
      ${mine?`<div class="toolbar" style="margin-top:6px"><button class="btn sm" data-edit-event="${e.id}">Edit</button><button class="btn sm danger" data-delete-event="${e.id}">Delete</button></div>`:''}
    </div>
  </article>`;
}

async function load(){
  const box = $('#eventList');
  if(!box) return;

  let items = [];
  if(db){
    try{
      const snap = await getDocs(query(collection(db,'events'),where('status','==','approved'),orderBy('date','asc'),limit(30)));
      items = snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){
      console.warn('Events fetch fallback:', e);
      items = DEMO_EVENTS;
    }
  }
  if(!items.length) items = DEMO_EVENTS;
  allEvents = items;

  box.innerHTML = items.map(card).join('');
  window.lucide?.createIcons();

  for(const el of $$('[data-event-id]')){
    refreshEventInterestButton(el.dataset.eventId, el.querySelector('[data-interest]'));
  }
}

function proposeForm(existing){
  const isEdit = Boolean(existing);
  showModal(isEdit?'Edit event':'Propose an event',`<form class="form" id="eventForm">
    <div class="grid grid-2">
      <div class="field">
        <label>Title</label>
        <input name="title" required maxlength="140" value="${existing?escapeHtml(existing.title):''}" placeholder="e.g. Campus Hacknight">
      </div>
      <div class="field">
        <label>Organizer</label>
        <input name="organizer" maxlength="100" value="${existing?escapeHtml(existing.organizer||''):''}" placeholder="e.g. Coding Community">
      </div>
    </div>
    <div class="grid grid-2">
      <div class="field">
        <label>Date &amp; time</label>
        <input name="date" type="datetime-local" required value="${existing?toLocalInput(existing.date):''}">
      </div>
      <div class="field">
        <label>Venue</label>
        <input name="venue" maxlength="120" value="${existing?escapeHtml(existing.venue||''):''}" placeholder="e.g. Main Auditorium">
      </div>
    </div>
    <div class="field">
      <label>Description</label>
      <textarea name="description" maxlength="1000" placeholder="What is this event about?">${existing?existing.description||'':''}</textarea>
    </div>
    ${isEdit?'':'<div class="notice small">New events need staff approval before they appear publicly. You will be able to edit or remove it once approved.</div>'}
    <div id="eventFormError" class="small" style="color:var(--danger)"></div>
    <div style="text-align:right">
      <button class="btn primary" type="submit">${isEdit?'Save changes':'Submit for approval'}</button>
    </div>
  </form>`);
  window.lucide?.createIcons();

  $('#eventForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    const dateVal = fd.get('date');
    if(!dateVal){
      $('#eventFormError').textContent = 'Pick a date and time.';
      return;
    }
    btn.disabled = true;

    try{
      const payload = {
        title: String(fd.get('title')||'').trim(),
        organizer: String(fd.get('organizer')||'').trim(),
        venue: String(fd.get('venue')||'').trim(),
        description: String(fd.get('description')||'').trim(),
        date: new Date(dateVal)
      };

      if(isEdit){
        if(db && !existing.id.startsWith('demo')) await updateDoc(doc(db,'events',existing.id),payload);
        toast('Event updated');
      }else{
        if(db){
          await addDoc(collection(db,'events'),{
            ...payload,
            searchName: payload.title.toLowerCase(),
            status: 'approved',
            interestedCount: 0,
            createdBy: currentUser?.uid || 'demo-user',
            createdAt: serverTimestamp()
          });
        } else {
          allEvents.unshift({
            id: `ev-${Date.now()}`,
            ...payload,
            interestedCount: 0,
            status: 'approved',
            createdBy: currentUser?.uid || 'demo-user'
          });
        }
        toast('Event submitted and scheduled!');
      }
      document.querySelector('.modal-backdrop')?.remove();
      load();
    }catch(err){
      $('#eventFormError').textContent = err.message||'Could not save this event.';
      btn.disabled = false;
    }
  });
}

function toLocalInput(d){
  const dt = d?.toDate ? d.toDate() : new Date(d);
  const pad = n => String(n).padStart(2,'0');
  return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

document.addEventListener('click',async e=>{
  if(e.target.closest('#proposeEventBtn')){
    proposeForm(null);
    return;
  }

  const b = e.target.closest('[data-interest]');
  if(b){
    const cardEl = b.closest('[data-event-id]');
    const id = cardEl?.dataset.eventId;
    if(!id) return;

    const wasActive = b.classList.contains('active');
    const nextActive = !wasActive;
    b.classList.toggle('active', nextActive);

    const span = b.querySelector('[data-interest-count]');
    if(span){
      const n = Number((span.textContent.match(/\d+/)||[0])[0]);
      span.textContent = `Interested · ${Math.max(0, n + (nextActive ? 1 : -1))}`;
    }
    toast(nextActive ? 'Marked interested!' : 'Interest removed');

    if(db && !id.startsWith('demo')){
      toggleEventInterest(id).catch(err => {
        b.classList.toggle('active', wasActive);
      });
    }
    return;
  }

  const editBtn = e.target.closest('[data-edit-event]');
  if(editBtn){
    const evId = editBtn.dataset.editEvent;
    const existing = allEvents.find(x => x.id === evId);
    if(existing) proposeForm(existing);
    return;
  }

  const delBtn = e.target.closest('[data-delete-event]');
  if(delBtn){
    if(!confirm('Remove this event?')) return;
    const evId = delBtn.dataset.deleteEvent;
    try{
      if(db && !evId.startsWith('demo')) await deleteDoc(doc(db,'events',evId));
      allEvents = allEvents.filter(x => x.id !== evId);
      toast('Event removed');
      load();
    }catch(err){
      toast(err.message||'Could not remove event.','error');
    }
    return;
  }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export async function refreshEventInterestButton(eventId,button){
  if(!button) return;
  try{
    if(db && !eventId.startsWith('demo')){
      button.classList.toggle("active", await isEventInterested(eventId));
    }
  }catch(e){}
}
