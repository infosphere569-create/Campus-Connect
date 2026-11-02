export function initPerformance(){
 document.querySelectorAll("img").forEach(img=>{img.loading=img.loading||"lazy";img.decoding=img.decoding||"async"});
 if("IntersectionObserver" in window){
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const el=e.target;if(el.dataset.src){el.src=el.dataset.src;el.removeAttribute("data-src")}io.unobserve(el)}}),{rootMargin:"200px"});
  document.querySelectorAll("img[data-src]").forEach(x=>io.observe(x));
 }
}

export function respectReducedMotion(){
 if(matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.dataset.reducedMotion="true";
}

export function initSmoothNavigation(){
 const clearNavState=()=>{
  if(document.body) document.body.classList.remove('cc-navigating');
 };

 window.addEventListener('pageshow', clearNavState);
 window.addEventListener('DOMContentLoaded', clearNavState);
 window.addEventListener('load', clearNavState);

 // Auto-clear safety timeout
 document.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;

  try {
   const url = new URL(a.href, window.location.href);
   if (url.origin !== window.location.origin) return;

   // Same-page or hash jump or tab click: never trigger navigating state
   if (url.pathname === window.location.pathname && url.search === window.location.search) return;
   if (!url.protocol.startsWith('http')) return;

   // Subtle visual hint without event hijacking or blocking clicks
   document.body.classList.add('cc-navigating');
   setTimeout(clearNavState, 400);
  } catch(err) {
   clearNavState();
  }
 });
}

initPerformance();
respectReducedMotion();
initSmoothNavigation();
