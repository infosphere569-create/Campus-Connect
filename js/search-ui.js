import {globalSearch} from "./search.js";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function bindSearch(input,results){
 if(!input||!results)return;
 let timer;
 input.addEventListener("input",()=>{
  clearTimeout(timer);const value=input.value.trim();
  timer=setTimeout(async()=>{
   if(value.length<2){results.innerHTML="";return;}
   results.innerHTML='<p class="muted">Searching…</p>';
   const items=await globalSearch(value);
   results.innerHTML=items.length?items.map(x=>{
    const label=x.name||x.title||x.text||"Result";
    return `<a class="search-result" href="${x.type==="groups"?"group.html?id="+x.id:x.type==="events"?"events.html":"#"}"><strong>${esc(label)}</strong><span>${esc(x.type)}</span></a>`;
   }).join(""):'<p class="muted">No results found.</p>';
  },280);
 });
}
