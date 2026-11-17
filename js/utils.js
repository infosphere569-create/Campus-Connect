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
  if(IMAGE_EXT_RE.test(url)){
   return `<a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="Shared image" style="max-width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin-top:6px;display:block"></a>`;
  }
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
 });
}

export function formatDate(value){const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'Just now':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(d)}
export function formatDateTime(value){const d=value?.toDate?value.toDate():new Date(value);return Number.isNaN(d.getTime())?'Just now':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d)}
export function timeAgo(value){const d=value?.toDate?value.toDate():new Date(value);const s=Math.floor((Date.now()-d.getTime())/1000);if(!Number.isFinite(s)||s<0)return'Just now';if(s<60)return `${s}s`;if(s<3600)return `${Math.floor(s/60)}m`;if(s<86400)return `${Math.floor(s/3600)}h`;if(s<604800)return `${Math.floor(s/86400)}d`;return formatDate(d)}
export function initials(name='Campus Connect One'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'CC'}
export function slugify(value=''){return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,80)}

export function toast(message,type='success'){
  let wrap=$('.toast-wrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.className='toast-wrap';
    document.body.appendChild(wrap);
  }
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  const icon = type==='error'?'circle-x':type==='warning'?'triangle-alert':type==='info'?'info':'check-circle-2';
  el.innerHTML=`<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  wrap.appendChild(el);
  window.lucide?.createIcons();
  
  const remove = () => {
    el.classList.add('is-leaving');
    setTimeout(()=>el.remove(),300);
  };
  
  el.onclick = remove;
  setTimeout(remove,4000);
}

export function showModal(title,content,options={}){
  const back=document.createElement('div');
  back.className='modal-backdrop';
  back.innerHTML=`<section class="modal ${options.wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h3 id="modal-title">${escapeHtml(title)}</h3>${options.subtitle?`<div class="small muted">${escapeHtml(options.subtitle)}</div>`:''}</div><button class="btn icon ghost" data-close aria-label="Close"><i data-lucide="x"></i></button></div><div>${content}</div></section>`;
  document.body.appendChild(back);
  window.lucide?.createIcons();
  back.addEventListener('click',e=>{if(e.target===back||e.target.closest('[data-close]'))back.remove()});
  return back;
}

export function getQuery(name){return new URLSearchParams(location.search).get(name)}
export function setPageMeta(title,description='Campus Connect One — Your Campus. Your Community.'){document.title=title;const m=document.querySelector('meta[name="description"]');if(m)m.content=description}

export function isDemo() {
  return sessionStorage.getItem('cc-demo') === '1' || localStorage.getItem('cc-demo') === '1';
}

export function demoProfile() {
  return {
    uid: 'demo-user',
    displayName: 'Ayush Kumar',
    email: 'ayush@campusconnect.edu',
    college: 'Campus Connect One Institute of Technology',
    course: 'B.Tech',
    branch: 'Computer Science & Engineering',
    year: '3rd Year',
    bio: 'Tech enthusiast, code lover & student community lead.',
    role: 'student',
    photoURL: '',
    createdAt: new Date().toISOString()
  };
}

export function normalizeInstitutionKey(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSameInstitution(collegeA, collegeB) {
  if (!collegeA || !collegeB) return false;
  const a = normalizeInstitutionKey(collegeA);
  const b = normalizeInstitutionKey(collegeB);
  if (!a || !b) return false;

  if (a === b) return true;
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;

  const stopWords = new Set(['college', 'institute', 'institution', 'institutions', 'university', 'campus', 'school', 'of', 'and', 'the', 'in', 'at', 'for', 'dept', 'department', 'engineering', 'technology', 'tech', 'group', 'management', 'science', 'sciences', 'studies', 'research']);
  const wordsA = a.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
  const wordsB = b.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));

  if (wordsA.length === 0 || wordsB.length === 0) {
    return a.includes(b) || b.includes(a);
  }

  return wordsA.some(w => wordsB.includes(w));
}

export function showGlobalProgress(pct){
  let bar=document.getElementById('globalProgressBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='globalProgressBar';
    document.body.prepend(bar);
  }
  bar.style.width=pct+'%';
  bar.style.opacity='1';
  if(pct>=100){
    setTimeout(()=>{bar.style.opacity='0';setTimeout(()=>{bar.style.width='0%'},300)},400);
  }
}

// Global Interaction Feedback (Clipboard, etc.)
document.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    const text = copyBtn.dataset.copy;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard!', 'success');
      
      const icon = copyBtn.querySelector('i');
      if (icon) {
        const orig = icon.getAttribute('data-lucide');
        icon.setAttribute('data-lucide', 'check');
        window.lucide?.createIcons({ root: copyBtn });
        setTimeout(() => {
          icon.setAttribute('data-lucide', orig);
          window.lucide?.createIcons({ root: copyBtn });
        }, 2000);
      }
    } catch (err) {
      toast('Failed to copy', 'error');
    }
  }
});

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>showGlobalProgress(100));
}else{
  showGlobalProgress(100);
}
