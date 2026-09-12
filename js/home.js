import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth,currentProfile} from './auth.js';import {getLatestPosts,getNotifications} from './services.js';import {collection,getDocs,query,where,orderBy,limit} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';import { $, escapeHtml, initials, timeAgo, formatDateTime, toast } from './utils.js';
function postCard(p){return `<article class="card post-card compact-post"><div class="post-head"><div class="avatar">${p.photoURL?`<img src="${escapeHtml(p.photoURL)}" alt="">`:initials(p.authorName)}</div><div class="post-meta"><strong>${escapeHtml(p.authorName||'Campus Student')}</strong><span>${escapeHtml(p.branch||'Student')} · ${timeAgo(p.createdAt)}</span></div></div><div class="post-text">${escapeHtml(p.text||'')}</div><div class="post-actions"><span class="action"><i data-lucide="heart"></i>${p.likes||0}</span><span class="action"><i data-lucide="message-circle"></i>${p.comments||0}</span><a class="action" href="feed.html">Open feed <i data-lucide="arrow-up-right"></i></a></div></article>`}
async function upcomingEvents(){
 const box=$('[data-event-list]');if(!box)return;
 if(!db){box.innerHTML='<p class="small muted">Connect Firebase to see real campus events.</p>';return}
 let items=[];try{const snap=await getDocs(query(collection(db,'events'),where('status','==','approved'),orderBy('date','asc'),limit(3)));items=snap.docs.map(d=>({id:d.id,...d.data()}))}catch(e){box.innerHTML='<p class="small muted">Could not load events.</p>';return}
 if(!items.length){box.innerHTML='<p class="small muted">No upcoming events yet.</p>';return}
 box.innerHTML=items.map(e=>{const d=e.date?.toDate?e.date.toDate():new Date(e.date);return `<div class="list-row"><div class="row"><div class="event-date"><span class="small">${d.toLocaleString(undefined,{month:'short'}).toUpperCase()}</span><strong>${d.getDate()}</strong></div><div><strong>${escapeHtml(e.title||'Untitled event')}</strong><div class="small muted">${escapeHtml(e.venue||'Campus')} · ${formatDateTime(e.date)}</div></div></div></div>`}).join('')
}
async function load(){const root=$('[data-home-content]');
 if(!db){root.innerHTML=`<div class="card empty"><i data-lucide="wifi-off"></i><h3>Not connected</h3><p class="muted">Connect Firebase to see your real campus feed.</p></div>`;window.lucide?.createIcons();return}
 let posts=[];try{posts=await getLatestPosts(3)}catch(e){toast('Could not load the live feed.','error')}
 const trending=posts.length?`<div class="stack">${posts.map(postCard).join('')}</div>`:`<div class="card empty"><i data-lucide="pen-line"></i><h3>No posts yet</h3><p class="muted">Be the first to share something with your campus.</p></div>`;
 root.innerHTML=`<div class="section-title"><div><div class="kicker">Community pulse</div><h2>Trending discussions</h2></div><a class="muted-link" href="feed.html">View all <i data-lucide="arrow-right"></i></a></div>${trending}`;window.lucide?.createIcons();upcomingEvents()}
subscribeAuth((user,profile)=>{if(!requireAuth())return;const hour=new Date().getHours();$('[data-greeting]').textContent=`Good ${hour<12?'morning':hour<18?'afternoon':'evening'}, ${profile?.displayName?.split(' ')[0]||'there'}`;
 // Both avatar chips were hardcoded "AK" placeholders in the HTML and never
 // touched again -- every single user saw the same fake initials regardless
 // of who was actually signed in.
 const avatarHtml=profile?.photoURL?`<img src="${escapeHtml(profile.photoURL)}" alt="">`:initials(profile?.displayName);
 const homeAvatar=$('[data-home-avatar]');if(homeAvatar)homeAvatar.innerHTML=avatarHtml;
 const composerAvatar=$('[data-composer-avatar]');if(composerAvatar)composerAvatar.innerHTML=avatarHtml;
 load()});
