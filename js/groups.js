import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentProfile,currentUser} from './auth.js';
import {collection,getDocs,query,where,limit,addDoc,setDoc,updateDoc,increment,serverTimestamp,doc,getDoc} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { $, $$, escapeHtml, initials, toast, showModal } from './utils.js';
import {requestMembership} from './services.js';

let all=[];
let myGroupIds=new Set();

const DEMO_GROUPS = [
  { id: 'demo-grp-coders', name: 'Campus Coders', category: 'Coding', memberCount: 142, status: 'approved', description: 'Competitive programming, open-source projects, hackathons and tech interview prep.', rules: 'Share solutions, help juniors, no spam.' },
  { id: 'demo-grp-placement', name: 'Placement Prep 2026', category: 'Placement', memberCount: 230, status: 'approved', description: 'DSA practice, aptitude drills, company experiences and mock interviews.', rules: 'Keep discussions focused on interview preparation and opportunities.' },
  { id: 'demo-grp-music', name: 'Campus Music Society', category: 'Music', memberCount: 68, status: 'approved', description: 'Jam sessions, band formations, instrument practice and annual fest performances.', rules: 'All genres welcome. Respect each musician.' },
  { id: 'demo-grp-sports', name: 'College Sports & Athletics', category: 'Sports', memberCount: 95, status: 'approved', description: 'Badminton, football, cricket, and gym workout routines and inter-hostel matches.', rules: 'Maintain sportsmanship.' }
];

function card(g){
 const joined=myGroupIds.has(g.id);
 const coverStyle=g.coverURL?` style="background-image:url('${escapeHtml(g.coverURL)}');background-size:cover;background-position:center"`:'';
 return `<article class="card group-card group-card-enhanced" data-group data-name="${escapeHtml((g.name||'').toLowerCase())}" data-category="${escapeHtml(g.category||'')}" style="padding:0">
  <div class="group-cover"${coverStyle}>
    <div class="cover-label">
      <span class="badge">${escapeHtml(g.category||'Community')}</span>
      ${joined?'<span class="badge success">Joined</span>':''}
    </div>
  </div>
  <div class="group-body">
    <div class="group-avatar">${g.imageURL?`<img src="${escapeHtml(g.imageURL)}" alt="">`:initials(g.name)}</div>
    <div class="split" style="align-items:flex-start;margin-top:10px">
      <div>
        <h3 style="margin:0">${escapeHtml(g.name)}</h3>
        <div class="small muted">${Number(g.memberCount||0)} members</div>
      </div>
      <span class="badge success">${escapeHtml(g.status||'approved')}</span>
    </div>
    <p class="muted small">${escapeHtml(g.description||'A community on Campus Connect One.')}</p>
    <div class="toolbar">
      <a class="btn sm" href="group.html?id=${encodeURIComponent(g.id||'demo-grp-coders')}"><i data-lucide="arrow-up-right"></i>Open</a>
      ${joined?'':`<button class="btn sm primary" data-join-group="${escapeHtml(g.id||'')}"><i data-lucide="user-plus"></i>Join</button>`}
    </div>
  </div>
 </article>`;
}

async function load(){
  all=[];
  if(db){
    try{
      const [groupsSnap,myMemberSnap]=await Promise.all([
        getDocs(query(collection(db,'groups'),where('status','==','approved'),limit(50))),
        currentUser?getDocs(query(collection(db,'groupMembers'),where('uid','==',currentUser.uid))):Promise.resolve({docs:[]})
      ]);
      all=groupsSnap.docs.map(d=>({id:d.id,...d.data()}));
      myGroupIds=new Set(myMemberSnap.docs.map(d=>d.data().groupId));
    }catch(e){
      console.warn('Groups fetch fallback:', e);
      all=DEMO_GROUPS;
    }
  }
  if(!all.length) all=DEMO_GROUPS;
  render(all);
}

function render(items){
  const box=$('[data-groups]');
  const countEl=$('[data-group-count]');
  if(!box)return;

  box.innerHTML=items.length?items.map(card).join(''):'<div class="card empty"><i data-lucide="users-round"></i><h3>No communities yet</h3><p class="muted">Be the first to start one.</p></div>';
  if(countEl) countEl.textContent=`${items.length} communities`;
  window.lucide?.createIcons();
}

function filter(){
  const term=($('#groupSearch')?.value||'').toLowerCase().trim();
  const cat=$('.chip.active')?.dataset.category||'All';
  render(all.filter(g=>(!term||(g.name||'').toLowerCase().includes(term)||(g.description||'').toLowerCase().includes(term))&&(cat==='All'||g.category===cat)));
}

function createGroup(){
  showModal('Create a group','<form class="form" id="groupForm"><div class="field"><label>Group name</label><input required name="name" maxlength="80" placeholder="e.g. Campus Developers"></div><div class="field"><label>Description</label><textarea required name="description" maxlength="500" placeholder="What is this community for?"></textarea></div><div class="grid grid-2"><div class="field"><label>Category</label><select name="category"><option>Coding</option><option>Placement</option><option>Study</option><option>Music</option><option>Sports</option><option>Gaming</option><option>Photography</option><option>Entrepreneurship</option><option>Clubs</option><option>Department</option></select></div><div class="field"><label>Privacy</label><select name="privacy"><option value="public">Public</option><option value="approval">Request to join</option></select></div></div><div class="field"><label>Community rules</label><textarea name="rules" maxlength="800" placeholder="Be respectful, stay on topic..."></textarea></div><div class="notice small">New groups are submitted for platform review before public discovery.</div><div style="text-align:right"><button class="btn primary"><i data-lucide="send"></i>Submit for approval</button></div></form>');
  window.lucide?.createIcons();

  $('#groupForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const name=String(fd.get('name')).trim();
    if(!name)return;

    try{
      if(db){
        const ref=await addDoc(collection(db,'groups'),{name,searchName:name.toLowerCase(),description:String(fd.get('description')).trim(),category:fd.get('category'),privacy:fd.get('privacy'),rules:String(fd.get('rules')||'').trim(),createdBy:currentUser.uid,memberCount:1,status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        await setDoc(doc(db,'groupMembers',`${ref.id}_${currentUser.uid}`),{groupId:ref.id,uid:currentUser.uid,displayName:currentProfile?.displayName||'',role:'admin',joinedAt:serverTimestamp()});
      } else {
        all.unshift({id:`grp-${Date.now()}`,name,description:String(fd.get('description')).trim(),category:fd.get('category'),memberCount:1,status:'pending'});
      }
      toast('Group submitted for approval');
      document.querySelector('.modal-backdrop')?.remove();
      render(all);
    }catch(err){
      toast(err.message,'error');
    }
  });
}

document.addEventListener('input',e=>{if(e.target.id==='groupSearch')filter()});
document.addEventListener('click',async e=>{
  const chip=e.target.closest('[data-category]');
  if(chip){
    $$('[data-category]').forEach(x=>x.classList.remove('active'));
    chip.classList.add('active');
    filter();
  }
  if(e.target.closest('[data-create-group]'))createGroup();
  const btn=e.target.closest('[data-join-group]');
  if(btn){
    const id=btn.dataset.joinGroup;
    if(!id)return;
    const g=all.find(x=>x.id===id);
    btn.disabled=true;
    try{
      if(db && !id.startsWith('demo')){
        if(g&&g.privacy==='approval'){
          await requestMembership(id,currentUser.uid);
          btn.textContent='Requested';
          toast('Membership request sent');
        }else{
          await setDoc(doc(db,'groupMembers',`${id}_${currentUser.uid}`),{groupId:id,uid:currentUser.uid,displayName:currentProfile?.displayName||'',role:'member',joinedAt:serverTimestamp()});
          await updateDoc(doc(db,'groups',id),{memberCount:increment(1)});
          myGroupIds.add(id);
          if(g)g.memberCount=(g.memberCount||0)+1;
          toast('Joined the group');
          render(all);
        }
      } else {
        myGroupIds.add(id);
        if(g)g.memberCount=(g.memberCount||0)+1;
        toast('Joined the group!');
        render(all);
      }
    }catch(err){
      toast(err.message,'error');
      btn.disabled=false;
    }
  }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});
