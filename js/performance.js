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
initPerformance();respectReducedMotion();
