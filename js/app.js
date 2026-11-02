import {watchUnreadCount} from "./realtime.js";
import './theme.js';import {subscribeAuth} from './auth.js';import {initials,escapeHtml,$} from './utils.js';
export function renderShell(profile){
 const root=$('[data-app-root]');
 if(!root)return;
 const page=document.body.dataset.page;

 if(root.dataset.shellMounted==='true'){
  const avatarEl=root.querySelector('.top-actions .avatar');
  if(avatarEl){
   avatarEl.innerHTML=profile?.photoURL?`<img src="${escapeHtml(profile.photoURL)}" alt="">`:initials(profile?.displayName);
  }
  return;
 }
 root.dataset.shellMounted='true';

 const nav=[['home.html','house','Home','home'],['feed.html','rss','Feed','feed'],['grouplist.html','users-round','Groups','groups'],['issues.html','circle-alert','Issues','issues'],['events.html','calendar-days','Events','events'],['notifications.html','bell','Notifications','notifications'],['profile.html','user-round','Profile','profile']];
 const desktop=nav.map(([href,icon,label,key])=>`<a class="nav-item ${page===key?'active':''}" href="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('');
 const admin=(profile?.role==='platformAdmin'||profile?.role==='moderator')?`<a class="nav-item ${page==='admin'?'active':''}" href="admin.html"><i data-lucide="shield"></i><span>Admin</span></a>`:'';
 const mobile=nav.filter((_,i)=>[0,1,2,3,6].includes(i)).map(([href,icon,label,key])=>`<a class="${page===key?'active':''}" href="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`).join('');
  const top=`<header class="topbar"><div class="topbar-inner"><a class="brand" href="home.html"><span class="brand-mark"><i data-lucide="sparkles"></i></span><span class="brand-name">Campus Connect</span></a><button class="mobile-search-btn btn icon ghost" data-open-search aria-label="Search"><i data-lucide="search"></i></button><label class="top-search"><i data-lucide="search" class="icon"></i><input id="globalSearch" autocomplete="off" placeholder="Search campus, groups, posts..." aria-label="Search"></label><div class="top-actions"><button class="btn icon ghost" id="themeToggleBtn" title="Switch theme (System / Light / Dark)" aria-label="Switch theme"><i data-lucide="sun-moon"></i></button><a class="btn icon ghost hide-mobile" href="feed.html" title="Create post"><i data-lucide="plus"></i></a><div class="notif-container" style="position:relative"><button class="btn icon ghost notif-link" id="notifDropdownBtn" title="Notifications" aria-label="Notifications"><i data-lucide="bell"></i><span class="nav-badge" data-unread-dot hidden></span></button><div class="notif-dropdown" id="notifDropdown" hidden><div class="notif-head">Recent Activity</div><div class="notif-list" id="notifList"></div><a class="notif-footer" href="notifications.html">View all notifications</a></div></div></div></div></header>`;
 const mainContent=document.querySelector('[data-app-main]');
 if(mainContent&&mainContent.parentNode)mainContent.parentNode.removeChild(mainContent);
 const shell=`<div class="app-shell"><aside class="sidebar"><div class="side-nav">${desktop}${admin}</div><div class="sidebar-footer"><button class="nav-item" style="width:100%" data-logout><i data-lucide="log-out"></i><span>Logout</span></button></div></aside><main class="main" data-shell-slot></main><button class="quick-post-fab" id="quickPostFab" aria-label="Quick Action"><i data-lucide="plus"></i></button></div><nav class="bottom-nav">${mobile}</nav>`;
 root.innerHTML=top+shell;
 const slot=root.querySelector('[data-shell-slot]');
 if(mainContent&&slot)slot.appendChild(mainContent);
 window.lucide?.createIcons();
 document.getElementById('themeToggleBtn')?.addEventListener('click',async()=>{
   const {getTheme,setTheme}=await import('./theme.js');
   const current=getTheme();
   const next=current==='system'?'light':current==='light'?'dark':'system';
   setTheme(next);
   const {toast}=await import('./utils.js');
   toast(`Theme: ${next.charAt(0).toUpperCase()+next.slice(1)} mode`);
 });
  if (profile?.uid) {
    import('./realtime.js').then(({ watchMyNotifications }) => {
      const notifBtn = root.querySelector('#notifDropdownBtn');
      const notifDropdown = root.querySelector('#notifDropdown');
      const notifList = root.querySelector('#notifList');
      const notifDot = root.querySelector('[data-unread-dot]');

      notifBtn?.addEventListener('click', () => {
        notifDropdown.hidden = !notifDropdown.hidden;
      });

      document.addEventListener('click', (e) => {
        if (notifBtn && !notifBtn.contains(e.target) && notifDropdown && !notifDropdown.contains(e.target)) {
          notifDropdown.hidden = true;
        }
      });

      watchMyNotifications((notifications) => {
        const unread = notifications.filter(n => !n.read);
        if (notifDot) notifDot.hidden = unread.length === 0;

        notifList.innerHTML = notifications.length ? notifications.slice(0, 5).map(n => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div class="notif-text">${escapeHtml(n.text || n.message || 'New notification')}</div>
            <div class="notif-time">${new Date(n.createdAt?.toDate?.() || n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        `).join('') : '<div class="small muted" style="padding:10px">No recent notifications</div>';
        
        window.lucide?.createIcons();
      });
    });
  }

 document.querySelector('[data-open-search]')?.addEventListener('click',()=>{const panel=document.createElement('div');panel.className='search-overlay';panel.innerHTML='<div class="search-dialog"><div class="split"><h2>Search Campus Connect</h2><button class="btn icon ghost" data-close><i data-lucide="x"></i></button></div><input id="mobileSearch" autocomplete="off" placeholder="Search people, groups, posts or events..."><div id="mobileSearchResults" class="search-results"></div></div>';document.body.appendChild(panel);window.lucide?.createIcons();panel.addEventListener('click',e=>{if(e.target===panel||e.target.closest('[data-close]'))panel.remove()});const escHandler=e=>{if(e.key==='Escape'){panel.remove();document.removeEventListener('keydown',escHandler)}};document.addEventListener('keydown',escHandler);panel.querySelector('input').focus();wireSearch('mobileSearch','mobileSearchResults')});
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
 input.addEventListener('blur',()=>setTimeout(()=>{box.hidden=true},250));
 input.addEventListener('focus',()=>{if(input.value.trim().length>=2)box.hidden=false});
}
}
subscribeAuth((u,p)=>{if($('[data-app-root]'))renderShell(p);mountNotificationBadge()});

function mountNotificationBadge(){
 const links=[...document.querySelectorAll('a[href*="notifications.html"]')];
 if(!links.length)return;
 watchUnreadCount(count=>links.forEach(a=>{
   let b=a.querySelector(".nav-badge");
   if(!b){b=document.createElement("span");b.className="nav-badge";a.appendChild(b);}
   b.textContent=count>99?"99+":String(count);b.hidden=count===0;
   const dot=document.querySelector('[data-unread-dot]');
   if(dot)dot.hidden=count===0;
 }));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mountNotificationBadge);else mountNotificationBadge();

document.addEventListener('click', e => {
  if (e.target.closest('#quickPostFab')) {
    import('./utils.js').then(({ showModal }) => {
      showModal('Quick Action', `<div class="stack" style="gap:12px">
        <button class="btn primary" id="quickNewPost" style="width:100%;height:56px;justify-content:center"><i data-lucide="plus-circle"></i>Create a New Post</button>
        <button class="btn" id="quickRaiseIssue" style="width:100%;height:56px;justify-content:center;border:1px dashed var(--border)"><i data-lucide="shield-alert"></i>Raise Anonymous Issue</button>
      </div>`);
      window.lucide?.createIcons();
      
      document.getElementById('quickNewPost')?.addEventListener('click', () => {
        document.querySelector('.modal-backdrop')?.remove();
        if (location.pathname.includes('feed.html')) {
          document.querySelector('[data-create-post]')?.click();
        } else {
          location.href = 'feed.html?compose=1';
        }
      });

      document.getElementById('quickRaiseIssue')?.addEventListener('click', () => {
        document.querySelector('.modal-backdrop')?.remove();
        location.href = 'issues.html?action=new';
      });
    });
  }
});
import('./pwa.js').catch(()=>{});

