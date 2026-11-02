import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentProfile} from './auth.js';
import {getLatestPosts,getNotifications} from './services.js';
import {collection,getDocs,query,where,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { $, escapeHtml, initials, timeAgo, formatDateTime, toast } from './utils.js';

const DEMO_EVENTS = [
  { id: 'demo-ev-1', title: 'Campus Hacknight 2026', venue: 'Main Lab Block B', date: new Date(Date.now() + 86400000 * 2), organizer: 'Campus Coders' },
  { id: 'demo-ev-2', title: 'Placement Talk: Tech Career Roadmap', venue: 'Auditorium A', date: new Date(Date.now() + 86400000 * 5), organizer: 'Placement Cell' },
  { id: 'demo-ev-3', title: 'Annual Cultural Fest Auditions', venue: 'Open Amphitheatre', date: new Date(Date.now() + 86400000 * 9), organizer: 'Cultural Society' }
];

const DEMO_POSTS = [
  { id: 'demo-post-1', authorName: 'Aarav Sharma', branch: 'CSE 3rd Year', text: 'Anyone forming teams for the upcoming inter-college hackathon? We need a frontend dev and designer!', likes: 24, comments: 8, createdAt: new Date(Date.now() - 3600000 * 2) },
  { id: 'demo-post-2', authorName: 'Priya Patel', branch: 'ECE 2nd Year', text: 'Library 2nd floor silent study room is now open until 10 PM throughout exam week.', likes: 42, comments: 5, createdAt: new Date(Date.now() - 3600000 * 5) },
  { id: 'demo-post-3', authorName: 'Campus Placement Prep', branch: 'Career Cell', text: 'Mock technical interview sessions starting this Saturday. Register through the Groups tab.', likes: 65, comments: 14, createdAt: new Date(Date.now() - 3600000 * 12) }
];

function postCard(p){
  return `<article class="card post-card compact-post">
    <div class="post-head">
      <div class="avatar">${p.photoURL?`<img src="${escapeHtml(p.photoURL)}" alt="">`:initials(p.authorName)}</div>
      <div class="post-meta">
        <strong>${escapeHtml(p.authorName||'Campus Student')}</strong>
        <span>${escapeHtml(p.branch||'Student')} · ${timeAgo(p.createdAt)}</span>
      </div>
    </div>
    <div class="post-text">${escapeHtml(p.text||'')}</div>
    <div class="post-actions">
      <span class="action"><i data-lucide="heart"></i>${p.likes||0}</span>
      <span class="action"><i data-lucide="message-circle"></i>${p.comments||0}</span>
      <a class="action" href="feed.html?post=${encodeURIComponent(p.id)}">Open discussion <i data-lucide="arrow-up-right"></i></a>
    </div>
  </article>`;
}

async function upcomingEvents(){
  const box=$('[data-event-list]');if(!box)return;
  let items=[];
  if(db){
    try{
      const snap=await getDocs(query(collection(db,'events'),where('status','==','approved'),orderBy('date','asc'),limit(3)));
      items=snap.docs.map(d=>({id:d.id,...d.data()}));
    }catch(e){
      items=DEMO_EVENTS;
    }
  }
  if(!items.length) items=DEMO_EVENTS;

  box.innerHTML=items.map(e=>{
    const d=e.date?.toDate?e.date.toDate():new Date(e.date);
    return `<div class="list-row"><div class="row"><div class="event-date"><span class="small">${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span><strong>${d.getDate()}</strong></div><div><strong>${escapeHtml(e.title||'Untitled event')}</strong><div class="small muted">${escapeHtml(e.venue||'Campus')} · ${formatDateTime(e.date)}</div></div></div></div>`;
  }).join('');
  window.lucide?.createIcons();
}

async function load(){
  const root=$('[data-home-content]');
  if(!root)return;
  let posts=[];
  if(db){
    try{
      posts=await getLatestPosts(3);
    }catch(e){
      posts=DEMO_POSTS;
    }
  }
  if(!posts.length) posts=DEMO_POSTS;

  const trending=posts.length
    ? `<div class="stack">${posts.map(postCard).join('')}</div>`
    : `<div class="card empty"><i data-lucide="pen-line"></i><h3>No posts yet</h3><p class="muted">Be the first to share something with your campus.</p></div>`;

  root.innerHTML=`<div class="section-title"><div><div class="kicker">Community pulse</div><h2>Trending discussions</h2></div><a class="muted-link" href="feed.html">View all <i data-lucide="arrow-right"></i></a></div>${trending}`;
  window.lucide?.createIcons();
  upcomingEvents();
}

subscribeAuth((user,profile)=>{
  if(!requireAuth())return;
  const hour=new Date().getHours();
  const greetingEl=$('[data-greeting]');
  if(greetingEl){
    greetingEl.textContent=`Good ${hour<12?'morning':hour<18?'afternoon':'evening'}, ${profile?.displayName?.split(' ')[0]||'there'}`;
  }

  const avatarHtml=profile?.photoURL?`<img src="${escapeHtml(profile.photoURL)}" alt="">`:initials(profile?.displayName);
  const homeAvatar=$('[data-home-avatar]');if(homeAvatar)homeAvatar.innerHTML=avatarHtml;
  const composerAvatar=$('[data-composer-avatar]');if(composerAvatar)composerAvatar.innerHTML=avatarHtml;
  load();
});
