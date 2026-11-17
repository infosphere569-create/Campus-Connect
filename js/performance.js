let imageObserver = null;

function getImageObserver(){
  if (!imageObserver && "IntersectionObserver" in window) {
    imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
          }
          img.classList.add('is-loaded');
          observer.unobserve(img);
        }
      });
    }, { rootMargin: "250px 0px" });
  }
  return imageObserver;
}

export function observeLazyImages(container = document){
  const obs = getImageObserver();
  const imgs = container.querySelectorAll ? container.querySelectorAll("img[data-src], img.post-media") : [];
  imgs.forEach(img => {
    img.loading = "lazy";
    img.decoding = "async";
    if (img.dataset.src) {
      if (obs) {
        obs.observe(img);
      } else {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        img.classList.add('is-loaded');
      }
    } else if (img.src) {
      img.classList.add('is-loaded');
    }
  });
}

export function initPerformance(){
  observeLazyImages(document);
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

  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a');
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;

    try {
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!url.protocol.startsWith('http')) return;

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
