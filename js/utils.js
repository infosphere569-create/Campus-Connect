export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
// Turns plain URLs in user text into safe clickable links, and renders a
// direct image URL (ending .jpg/.png/.gif/.webp etc) as an inline image
// instead of just a link -- used anywhere user-typed text is shown (posts,
// comments, event descriptions, issue descriptions).
const URL_RE=/(https?:\/\/[^\s<>"']+)/gi;
const IMAGE_EXT_RE=/\.(png|jpe?g|gif|webp|avif)(\?[^\s<>"']*)?$/i;
export function linkifyHtml(text=''){
 const escaped=escapeHtml(text);
 return escaped.replace(URL_RE,(url)=>{
  // escapeHtml already turned raw & into &amp; inside URLs picked up by the regex; fine for href use.
  if(IMAGE_EXT_RE.test(url)){
   return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="Shared image" style="max-width:100%;border-radius:12px;margin-top:6px;display:block"></a>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
 });
}
export function formatDate(value){const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'Just now':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(d)}
export function formatDateTime(value){const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'Just now':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d)}
export function timeAgo(value){const d=value?.toDate?value.toDate():new Date(value);const s=Math.floor((Date.now()-d.getTime())/1000);if(!Number.isFinite(s)||s<0)return'Just now';if(s<60)return `${s}s`;if(s<3600)return `${Math.floor(s/60)}m`;if(s<86400)return `${Math.floor(s/3600)}h`;if(s<604800)return `${Math.floor(s/86400)}d`;return formatDate(d)}
export function initials(name='Campus Connect'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'CC'}
export function slugify(value=''){return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80)}
export function toast(message,type='success'){let wrap=$('.toast-wrap');if(!wrap){wrap=document.createElement('div');wrap.className='toast-wrap';document.body.appendChild(wrap)}const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`<i data-lucide="${type==='error'?'circle-x':type==='warning'?'triangle-alert':'check-circle-2'}"></i><span>${escapeHtml(message)}</span>`;wrap.appendChild(el);window.lucide?.createIcons();setTimeout(()=>el.remove(),3400)}
export function showModal(title,content,options={}){const back=document.createElement('div');back.className='modal-backdrop';back.innerHTML=`<section class="modal ${options.wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h3 id="modal-title">${escapeHtml(title)}</h3>${options.subtitle?`<div class="small muted">${escapeHtml(options.subtitle)}</div>`:''}</div><button class="btn icon ghost" data-close aria-label="Close"><i data-lucide="x"></i></button></div><div>${content}</div></section>`;document.body.appendChild(back);window.lucide?.createIcons();back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))back.remove()});return back}
export function getQuery(name){return new URLSearchParams(location.search).get(name)}
export function setPageMeta(title,description='Campus Connect — Your Campus. Your Community.'){document.title=title;const m=document.querySelector('meta[name="description"]');if(m)m.content=description}
export function demoProfile(){return {uid:'demo-user',displayName:'Ayush Kumar',photoURL:'',course:'B.Tech',branch:'CSE',year:'1st Year',section:'A',college:'NITRA Technical Campus',role:'student',interests:['CSE','coding','placement'],isActive:true}}
export function isDemo(){return !document.documentElement.dataset.firebaseReady}
export function safeNumber(v){const n=Number(v);return Number.isFinite(n)?n:0}
