import {watchUnreadCount} from "./realtime.js";
import './theme.js';import {subscribeAuth} from './auth.js';import {initials,escapeHtml,$} from './utils.js';
export function renderShell(profile){const page=document.body.dataset.page;const nav=[['home.html','house','Home','home'],['feed.html','rss','Feed','feed'],['grouplist.html','users-round','Groups','groups'],['issues.html','circle-alert','Issues','issues'],['events.html','calendar-days','Events','events'],['notifications.html','bell','Notifications','notifications'],['profile.html','user-round','Profile','profile']];const desktop=nav.map(([href,icon,label,key])=>`<a class="nav-item ${page===key?'active':''}" href="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('');const admin=(profile?.role==='platformAdmin'||profile?.role==='moderator')?`<a class="nav-item ${page==='admin'?'active':''}" href="admin.html"><i data-lucide="shield"></i><span>Admin</span></a>`:'';const mobile=nav.filter((_,i)=>[0,1,2,3,6].includes(i)).map(([href,icon,label,key])=>`<a class="${page===key?'active':''}" href="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('');const top=`<header class="topbar"><div class="topbar-inner"><a class="brand" href="home.html"><span class="brand-mark"><i data-lucide="sparkles"></i></span><span class="brand-name">Campus Connect</span></a><button class="mobile-search-btn btn icon ghost" data-open-search aria-label="Search"><i data-lucide="search"></i></button><label class="top-search"><i data-lucide="search" class="icon"></i><input id="globalSearch" placeholder="Search campus, groups, posts..." aria-label="Search"></label><div class="top-actions"><a class="btn icon ghost hide-mobile" href="feed.html" title="Create post"><i data-lucide="plus"></i></a><a class="btn icon ghost notif-link" href="notifications.html" title="Notifications"><i data-lucide="bell"></i><span class="notif-dot" data-unread-dot hidden></span></a><a class="avatar" href="profile.html" title="Profile">${profile?.photoURL?`<img src="${escapeHtml(profile.photoURL)}" alt="">`:initials(profile?.displayName)}</a></div></div></header>`;
 // IMPORTANT: we MOVE the real [data-app-main] node into the shell instead of
 // copying its innerHTML. Copying left the original node sitting in the DOM
 // (as a sibling of [data-app-root]), which rendered as a duplicate/partial
 // copy of the page underneath the real, styled page on every screen that
 // uses this shell (home, feed, admin, groups, issues, events, notifications,
 // profile). Detach it first so re-running this function (auth state can fire
 // more than once) never destroys it and never leaves a stray duplicate.
 const mainContent=document.querySelector('[data-app-main]');
 if(mainContent&&mainContent.parentNode)mainContent.parentNode.removeChild(mainContent);
 const shell=`<div class="app-shell"><aside class="sidebar"><div class="side-nav">${desktop}${admin}</div><div class="sidebar-footer"><button class="nav-item" style="width:100%" data-logout><i data-lucide="log-out"></i><span>Logout</span></button></div></aside><main class="main" data-shell-slot></main></div><nav class="bottom-nav">${mobile}</nav>`;const root=$('[data-app-root]');if(root){root.innerHTML=top+shell;const slot=root.querySelector('[data-shell-slot]');if(mainContent&&slot)slot.appendChild(mainContent);}window.lucide?.createIcons();import('./services.js').then(({getNotifications})=>getNotifications(8).then(ns=>{const dot=document.querySelector('[data-unread-dot]');if(dot)dot.hidden=!ns.some(n=>!n.read)}).catch(()=>{}));document.querySelector('[data-open-search]')?.addEventListener('click',()=>{const panel=document.createElement('div');panel.className='search-overlay';panel.innerHTML='<div class="search-dialog"><div class="split"><h2>Search Campus Connect</h2><button class="btn icon ghost" data-close><i data-lucide="x"></i></button></div><input id="mobileSearch" placeholder="Search people, groups, posts or events..."><div id="mobileSearchResults" class="search-results"></div></div>';document.body.appendChild(panel);window.lucide?.createIcons();panel.addEventListener('click',e=>{if(e.target===panel||e.target.closest('[data-close]'))panel.remove()});panel.querySelector('input').focus();wireSearch('mobileSearch','mobileSearchResults')});
// Both search boxes existed in the markup with zero listeners attached -- typing
// into either one did nothing. Wired here, plus a dropdown result panel is
// inserted next to the desktop search box since it never had one.
const topSearchLabel=document.querySelector('.top-search');
if(topSearchLabel&&!document.getElementById('globalSearchResults')){
 const box=document.createElement('div');box.id='globalSearchResults';box.className='search-results search-results-floating';
 topSearchLabel.parentElement?.style && (topSearchLabel.style.position='relative');
 topSearchLabel.appendChild(box);
}
wireSearch('globalSearch','globalSearchResults');
function wireSearch(inputId,resultsId){
 const input=document.getElementById(inputId), box=document.getElementById(resultsId);
 if(!input||!box||input.dataset.wired)return; input.dataset.wired='1';
 let timer=null;
 const iconFor=t=>({users:'user-round',groups:'users-round',events:'calendar-days',posts:'file-text'}[t]||'search');
 const hrefFor=r=>({users:`profile.html`,groups:`group.html?id=${encodeURIComponent(r.id)}`,events:`events.html`,posts:`feed.html?post=${encodeURIComponent(r.id)}`}[r.type]||'#');
 const labelFor=r=>r.type==='posts'?(r.text||'').slice(0,60):(r.displayName||r.name||r.title||'Untitled');
 input.addEventListener('input',()=>{
  const term=input.value.trim();
  clearTimeout(timer);
  if(term.length<2){box.innerHTML='';box.hidden=true;return}
  box.hidden=false;box.innerHTML='<div class="small muted" style="padding:10px">Searching…</div>';
  timer=setTimeout(async()=>{
   try{
    const {globalSearch}=await import('./search.js');
    const results=await globalSearch(term);
    box.innerHTML=results.length?results.map(r=>`<a class="search-result-row" href="${hrefFor(r)}"><i data-lucide="${iconFor(r.type)}"></i><span>${(labelFor(r)||'').toString().replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span><span class="small muted" style="margin-left:auto;text-transform:capitalize">${r.type}</span></a>`).join(''):'<div class="small muted" style="padding:10px">No results found.</div>';
    window.lucide?.createIcons();
   }catch(e){box.innerHTML='<div class="small muted" style="padding:10px">Search is unavailable right now.</div>'}
  },300);
 });
 input.addEventListener('blur',()=>setTimeout(()=>{box.hidden=true},200));
 input.addEventListener('focus',()=>{if(input.value.trim().length>=2)box.hidden=false});
}
}
subscribeAuth((u,p)=>{if($('[data-app-root]'))renderShell(p)});

function mountNotificationBadge(){
 const links=[...document.querySelectorAll('a[href*="notifications.html"]')];
 if(!links.length)return;
 watchUnreadCount(count=>links.forEach(a=>{
   let b=a.querySelector(".nav-badge");
   if(!b){b=document.createElement("span");b.className="nav-badge";a.appendChild(b);}
   b.textContent=count>99?"99+":String(count);b.hidden=count===0;
 }));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountNotificationBadge);else mountNotificationBadge();
