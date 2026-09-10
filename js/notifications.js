import {watchMyNotifications} from "./realtime.js";
import './theme.js';import {db} from './firebase.js';import {subscribeAuth,requireAuth,currentUser} from './auth.js';import {getNotifications,markNotificationRead} from './services.js';import { $, escapeHtml,timeAgo,toast } from './utils.js';
function icon(type){return {like:'heart',comment:'message-circle',group:'users-round',event:'calendar-days',issue:'circle-alert',system:'bell'}[type]||'bell'}
async function load(){
 if(!db){$('#notificationList').innerHTML='<div class="card empty"><i data-lucide="wifi-off"></i><h3>Not connected</h3><p class="muted">Connect Firebase to see real notifications.</p></div>';window.lucide?.createIcons();return}
 let items=[];try{items=await getNotifications(currentUser.uid)}catch(e){toast('Could not load notifications.','error')}
 if(!items.length){$('#notificationList').innerHTML='<div class="card empty"><i data-lucide="bell"></i><h3>You\u2019re all caught up</h3><p class="muted">New activity from your communities will show up here.</p></div>';window.lucide?.createIcons();return}
 $('#notificationList').innerHTML=items.map(n=>`<button class="notification-item ${n.read?'read':''}" data-notification="${escapeHtml(n.id)}"><span class="notif-icon"><i data-lucide="${icon(n.type)}"></i></span><span class="notification-copy"><strong>${escapeHtml(n.title||'Campus Connect')}</strong><span>${escapeHtml(n.body||n.text||'')}</span><small>${timeAgo(n.createdAt)}</small></span>${n.read?'':'<span class="unread-dot"></span>'}</button>`).join('');window.lucide?.createIcons()}
document.addEventListener('click',async e=>{const n=e.target.closest('[data-notification]');if(!n||n.dataset.notification.startsWith('demo'))return;try{await markNotificationRead(currentUser.uid,n.dataset.notification);n.classList.add('read')}catch(err){toast(err.message,'error')}});subscribeAuth((u,p)=>{if(!requireAuth())return;load()});

export function startLiveNotifications(render){
 return watchMyNotifications(items=>render(items));
}
