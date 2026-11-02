import {watchMyNotifications} from "./realtime.js";
import './theme.js';
import {db} from './firebase.js';
import {subscribeAuth,requireAuth,currentUser} from './auth.js';
import {getNotifications,markNotificationRead} from './services.js';
import { $, escapeHtml, timeAgo, toast } from './utils.js';

const DEMO_NOTIFICATIONS = [
  { id: 'notif-1', type: 'system', title: 'Welcome to Campus Connect', body: 'Discover groups, join discussions and raise campus issues with full privacy.', createdAt: new Date(Date.now() - 3600000 * 2), read: false },
  { id: 'notif-2', type: 'group', title: 'New event in Campus Coders', body: 'Campus Hacknight 2026 has been scheduled for this weekend.', targetId: 'demo-grp-coders', createdAt: new Date(Date.now() - 3600000 * 6), read: false },
  { id: 'notif-3', type: 'issue', title: 'Campus Issue Update', body: 'Your raised issue regarding Library Wi-Fi has received 60+ student supports.', createdAt: new Date(Date.now() - 3600000 * 12), read: true }
];

let localNotifs = [...DEMO_NOTIFICATIONS];

function icon(type){
  return {like:'heart',comment:'message-circle',group:'users-round',event:'calendar-days',issue:'circle-alert',system:'bell'}[type]||'bell';
}

async function load(){
  const box = $('#notificationList');
  if(!box) return;

  let items = [];
  if(db && currentUser?.uid){
    try{
      items = await getNotifications(currentUser.uid);
    }catch(e){
      items = localNotifs;
    }
  }
  if(!items.length) items = localNotifs;

  box.innerHTML = items.map(n => `<button class="notification-item ${n.read?'read':''}" data-notification="${escapeHtml(n.id)}" data-type="${escapeHtml(n.type||'')}" data-target="${escapeHtml(n.targetId||'')}">
    <span class="notif-icon"><i data-lucide="${icon(n.type)}"></i></span>
    <span class="notification-copy">
      <strong>${escapeHtml(n.title||'Campus Connect')}</strong>
      <span>${escapeHtml(n.body||n.text||'')}</span>
      <small>${timeAgo(n.createdAt)}</small>
    </span>
    ${n.read?'':'<span class="unread-dot"></span>'}
  </button>`).join('');
  window.lucide?.createIcons();
}

document.addEventListener('click', async e => {
  const n = e.target.closest('[data-notification]');
  if(!n) return;
  const id = n.dataset.notification;
  n.classList.add('read');
  n.querySelector('.unread-dot')?.remove();

  if(db && currentUser?.uid && !id.startsWith('notif-')){
    try{
      await markNotificationRead(currentUser.uid, id);
    }catch(err){}
  } else {
    const item = localNotifs.find(x => x.id === id);
    if(item) item.read = true;
  }

  // Optional navigation to target
  const targetId = n.dataset.target;
  const type = n.dataset.type;
  if (targetId && type === 'group') {
    location.href = `group.html?id=${encodeURIComponent(targetId)}`;
  } else if (targetId && type === 'event') {
    location.href = `events.html`;
  } else if (targetId && type === 'issue') {
    location.href = `issues.html`;
  }
});

subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export function startLiveNotifications(render){
  return watchMyNotifications(items=>render(items));
}
