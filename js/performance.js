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
 if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;

 window.addEventListener('pageshow', () => {
  document.body.classList.remove('cc-navigating');
 });

 document.addEventListener('click', (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;

  try {
   const url = new URL(a.href, window.location.href);
   if (url.origin !== window.location.origin) return;

   // Same page hash navigation - skip fade
   if (url.pathname === window.location.pathname && url.search === window.location.search) {
    if (url.hash) return;
   }

   if (!url.protocol.startsWith('http')) return;

   e.preventDefault();
   document.body.classList.add('cc-navigating');

   if (document.startViewTransition) {
    document.startViewTransition(() => {
     window.location.href = url.href;
    });
   } else {
    setTimeout(() => {
     window.location.href = url.href;
    }, 110);
   }
  } catch(err) {}
 });
}

initPerformance();
respectReducedMotion();
initSmoothNavigation();
