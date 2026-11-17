import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentProfile} from './auth.js';
import {getLatestPosts,getNotifications,getLatestIssues} from './services.js';
import { $, escapeHtml, initials, timeAgo, toast } from './utils.js';
import { loadEventPreviewsInto } from './quick-rsvp.js';

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
  await loadEventPreviewsInto({
    listSelector: '[data-event-list]',
    mobileSelector: '[data-home-event-mobile]',
    limitCount: 3
  });
}

export async function load(){
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

  let issues = [];
  try {
    issues = await getLatestIssues(3);
  } catch(e) {}

  const issuesHtml = issues.length ? `
    <div class="section-title" style="margin-top:24px"><div><div class="kicker">Campus Hub</div><h2>Recent Issues</h2></div><a class="muted-link" href="issues.html">View all</a></div>
    <div class="stack" style="margin-top:16px">${issues.map(i => `
      <div class="card compact-post">
        <strong>${escapeHtml(i.title)}</strong>
        <p class="small muted">${escapeHtml(i.description.slice(0, 80))}${i.description.length>80?'...':''}</p>
        <div class="toolbar" style="margin-top:8px"><span class="badge">${escapeHtml(i.category)}</span><span class="small muted">${i.supportCount||0} support</span></div>
      </div>
    `).join('')}</div>` : '';

  root.innerHTML=`<div class="section-title"><div><div class="kicker">Community pulse</div><h2>Trending discussions</h2></div><a class="muted-link" href="feed.html">View all <i data-lucide="arrow-right"></i></a></div>${trending}${issuesHtml}`;
  window.lucide?.createIcons();
  upcomingEvents();
  
  // Render activity trend chart
  import('./dashboard-charts.js').then(m => m.renderCampusPulseChart());
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
