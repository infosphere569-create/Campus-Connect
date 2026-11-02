import './theme.js';
import {db} from './firebase.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js';
import {subscribeAuth,requireAuth,currentUser} from './auth.js';
import {collection,getDocs,query,orderBy,limit,doc,writeBatch,serverTimestamp,addDoc} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { $, $$, escapeHtml, formatDate, toast, showModal } from './utils.js';
import {supportIssue} from './services.js';

let all=[];

function issueCard(i){
  return `<article class="card issue-card" data-issue data-status="${escapeHtml(i.status)}" data-category="${escapeHtml(i.category)}">
    <div class="issue-status">
      <span class="badge primary"><i data-lucide="shield-check"></i> Anonymous Student</span>
      <span class="badge ${i.status==='Resolved'?'success':i.status==='In Progress'?'warning':'primary'}">${escapeHtml(i.status)}</span>
    </div>
    <h3>${escapeHtml(i.title)}</h3>
    <p class="muted">${escapeHtml(i.description)}</p>
    <div class="toolbar small">
      <span class="badge">${escapeHtml(i.category)}</span>
      <span class="badge">${escapeHtml(i.severity)} severity</span>
      <span class="muted"><i data-lucide="map-pin" class="icon"></i>${escapeHtml(i.location||'Campus')}</span>
    </div>
    <div class="split" style="margin-top:12px">
      <span class="small muted"><span data-support-count>${i.supportCount||0}</span> students support this · ${formatDate(i.createdAt)}</span>
      <button class="btn sm" data-support="${escapeHtml(i.id)}"><i data-lucide="thumbs-up"></i>Support</button>
    </div>
  </article>`;
}

async function load(){
  all=[];
  if(db){
    try{
      const snap=await getDocs(query(collection(db,'issues'),orderBy('createdAt','desc'),limit(50)));
      all=snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){
      console.warn('Issues fetch error:', e);
      all=[];
    }
  }
  render(all);
}

function render(items){
  const box=$('[data-issues]');
  if(!box)return;
  box.innerHTML=items.length?items.map(issueCard).join(''):`<div class="card empty"><i data-lucide="circle-alert"></i><h3>No issues found</h3><p>Try a different filter or raise the first issue.</p></div>`;
  window.lucide?.createIcons();
}

function apply(){
  const status=$('.issue-filter.active')?.dataset.status||'All';
  const category=$('#issueCategory')?.value||'All';
  const term=($('#issueSearch')?.value||'').toLowerCase().trim();
  render(all.filter(i=>(status==='All'||i.status===status)&&(category==='All'||i.category===category)&&(!term||(i.title||'').toLowerCase().includes(term)||(i.description||'').toLowerCase().includes(term))));
}

async function raise(){
  showModal('Raise an anonymous issue',`<form class="form" id="issueForm">
    <div class="notice">
      <strong>Your public identity stays private.</strong>
      <div class="small muted">Your profile name, photo, email and student UID are strictly excluded from the public campus issue feed.</div>
    </div>
    <div class="field">
      <label>Title</label>
      <input name="title" maxlength="140" required placeholder="What campus issue needs attention?">
    </div>
    <div class="field">
      <label>Description</label>
      <textarea name="description" maxlength="2500" required placeholder="Explain what is happening and how it affects students..."></textarea>
    </div>
    <div class="grid grid-2">
      <div class="field">
        <label>Category</label>
        <select name="category">
          <option>Wi-Fi</option>
          <option>Infrastructure</option>
          <option>Classroom</option>
          <option>Library</option>
          <option>Hostel</option>
          <option>Canteen</option>
          <option>Safety</option>
          <option>Transport</option>
          <option>Academic</option>
          <option>Faculty</option>
          <option>Other</option>
        </select>
      </div>
      <div class="field">
        <label>Severity</label>
        <select name="severity">
          <option>Low</option>
          <option selected>Medium</option>
          <option>High</option>
          <option>Critical</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Location</label>
      <input name="location" maxlength="120" placeholder="Block, floor, lab or campus area">
    </div>
    <label class="check-row">
      <input type="checkbox" required>
      <span>I understand this issue will be publicly visible to the campus community while my identity remains anonymous.</span>
    </label>
    <div style="text-align:right">
      <button type="submit" class="btn primary"><i data-lucide="shield-plus"></i>Submit anonymously</button>
    </div>
  </form>`);
  window.lucide?.createIcons();

  $('#issueForm')?.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const submit=e.currentTarget.querySelector('button[type="submit"]');
    submit.disabled=true;
    submit.innerHTML='Submitting…';

    const title = String(fd.get('title')).trim();
    const description = String(fd.get('description')).trim();
    const category = String(fd.get('category'));
    const severity = String(fd.get('severity'));
    const location = String(fd.get('location')||'Campus').trim();

    try{
      let createdId = '';
      if(db){
        try{
          const call=httpsCallable(getFunctions(),'submitAnonymousIssue');
          const result=await call({title,description,category,severity,location});
          createdId = result.data.id;
        }catch(fnErr){
          // Cloud function fallback to direct client-side Firestore batch write
          console.warn('submitAnonymousIssue function fallback:', fnErr);
          const issueRef = doc(collection(db, 'issues'));
          const privateRef = doc(db, 'issuePrivate', issueRef.id);
          const now = serverTimestamp();
          const batch = writeBatch(db);
          batch.set(issueRef, {
            title, description, category, severity, location,
            status: 'Open', supportCount: 0, createdAt: now, updatedAt: now,
            displayName: 'Anonymous Student', isAnonymous: true
          });
          batch.set(privateRef, {
            issueId: issueRef.id, authorUid: currentUser?.uid || 'anon', createdAt: now
          });
          await batch.commit();
          createdId = issueRef.id;
        }
      } else {
        createdId = `local-iss-${Date.now()}`;
        all.unshift({
          id: createdId,
          title, description, category, severity, location,
          status: 'Open', supportCount: 0, createdAt: new Date()
        });
      }

      document.querySelector('.modal-backdrop')?.remove();
      toast('Issue submitted anonymously!');
      load();
    }catch(err){
      submit.disabled=false;
      submit.innerHTML='<i data-lucide="shield-plus"></i>Submit anonymously';
      window.lucide?.createIcons();
      toast(err.message||'Issue could not be submitted.','error');
    }
  });
}

document.addEventListener('input',e=>{if(e.target.matches('#issueSearch'))apply()});
document.addEventListener('change',e=>{if(e.target.matches('#issueCategory'))apply()});
document.addEventListener('click',async e=>{
  if(e.target.closest('[data-raise-issue]'))return raise();
  const filter=e.target.closest('.issue-filter');
  if(filter){
    $$('.issue-filter').forEach(x=>x.classList.remove('active'));
    filter.classList.add('active');
    apply();
  }
  const btn=e.target.closest('[data-support]');
  if(btn){
    const id=btn.dataset.support;
    if(!id)return;
    const cardEl=btn.closest('.issue-card');
    const countEl=cardEl?.querySelector('[data-support-count]');
    const wasActive=btn.classList.contains('active');
    const nextActive=!wasActive;

    btn.classList.toggle('active',nextActive);
    if(countEl){
      const currentVal=Number(countEl.textContent||0);
      countEl.textContent=String(Math.max(0,currentVal+(nextActive?1:-1)));
    }
    toast(nextActive?'Support recorded.':'Support removed.');

    if(db && !id.startsWith('demo') && !id.startsWith('local')){
      supportIssue(id,currentUser?.uid).catch(err=>{
        btn.classList.toggle('active',wasActive);
        toast(err.message||'Could not save support.','error');
      });
    }
  }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});
