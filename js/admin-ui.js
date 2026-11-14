import {getDashboardSnapshot} from "./admin-dashboard.js";
import {setUserSuspension,setUserRole,approveGroup} from "./admin-control.js";

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function renderAdminDashboard(root){
 if(!root)return;
 root.innerHTML='<div class="loading-state">Loading management data…</div>';
 try{
  const d=await getDashboardSnapshot();
  root.innerHTML=`
  <div class="metric-grid">
   ${Object.entries({Students:d.metrics.users,Posts:d.metrics.posts,Groups:d.metrics.groups,Events:d.metrics.events,"Open reports":d.metrics.reportsOpen,"Active issues":d.metrics.issuesActive})
   .map(([k,v])=>`<article class="metric-card"><span class="muted">${esc(k)}</span><strong>${v}</strong></article>`).join("")}
  </div>
  <div class="admin-columns">
   <section class="card"><div class="section-heading"><h3>Pending groups</h3></div>
   ${d.groups.filter(x=>x.approvalStatus==="pending").slice(0,12).map(g=>`<div class="admin-row"><div><strong>${esc(g.name)}</strong><span class="muted">${esc(g.category||"")}</span></div><button class="btn btn-primary" data-approve="${g.id}">Approve</button></div>`).join("")||'<p class="muted">No pending groups.</p>'}</section>
   <section class="card"><div class="section-heading"><h3>Users</h3></div>
   ${d.users.slice(0,15).map(u=>`<div class="admin-row"><div><strong>${esc(u.name||"Student")}</strong><span class="muted">${esc(u.role||"student")}${u.suspended?" · suspended":""}</span></div><button class="btn btn-ghost" data-suspend="${u.uid||u.id}" data-state="${!!u.suspended}">${u.suspended?"Reactivate":"Suspend"}</button></div>`).join("")}</section>
  </div>`;
  root.querySelectorAll("[data-approve]").forEach(b=>b.onclick=async()=>{b.disabled=true;await approveGroup(b.dataset.approve);await renderAdminDashboard(root);});
  root.querySelectorAll("[data-suspend]").forEach(b=>b.onclick=async()=>{b.disabled=true;await setUserSuspension(b.dataset.suspend,b.dataset.state!=="true");await renderAdminDashboard(root);});
 }catch(e){root.innerHTML=`<div class="empty-state"><strong>Could not load admin data.</strong><p>${esc(e.message)}</p></div>`;}
}
