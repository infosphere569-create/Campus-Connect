import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {collection,query,where,orderBy,limit,onSnapshot} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const host=document.querySelector("#notificationsList,[data-notifications]");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
onAuthStateChanged(auth,u=>{
 if(!u){location.href="login.html";return}
 if(!host)return;
 const q=query(collection(db,"notifications"),where("uid","==",u.uid),orderBy("createdAt","desc"),limit(50));
 onSnapshot(q,snap=>{
  host.innerHTML=snap.empty?'<p class="muted">You’re all caught up.</p>':snap.docs.map(d=>{
   const n=d.data();return `<article class="notification-item ${n.read?"":"unread"}"><strong>${esc(n.title||notificationTitle(n.type))}</strong><p>${esc(n.message||"You have a new Campus Connect update.")}</p></article>`;
  }).join("");
 });
});
function notificationTitle(t){return ({group_request_approved:"Group request approved",issue_status:"Issue updated",report_reviewed:"Report reviewed",comment:"New comment",like:"Someone liked your post"})[t]||"Campus Connect update"}
