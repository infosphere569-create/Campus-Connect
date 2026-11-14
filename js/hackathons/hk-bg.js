// Light, calm background for the Hackathons module: three very soft green glows drifting slowly + a few faint dots.
// (The dotted grid itself is pure CSS.) Pauses when the tab is hidden, honours reduced-motion, ~20fps to stay cheap on phones.
const PALETTES = {
  light: { blobs: [[47, 174, 118, .16], [130, 214, 170, .20], [240, 191, 76, .08]], dot: [23, 138, 84] },
  dark: { blobs: [[47, 174, 118, .12], [20, 110, 72, .18], [232, 176, 58, .05]], dot: [120, 220, 170] }
};
export function initBg(canvas){
  if(!canvas) return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  let w = 0, h = 0, dpr = 1, raf = 0, last = 0, running = false;
  const theme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const blobs = [
    { fx: 5e-5, fy: 4e-5, px: 0, py: 1, ax: .18, ay: .12, cx: .15, cy: .18, r: .55 },
    { fx: 4e-5, fy: 6e-5, px: 2, py: 3, ax: .16, ay: .14, cx: .85, cy: .3, r: .5 },
    { fx: 6e-5, fy: 5e-5, px: 4, py: 5, ax: .2, ay: .1, cx: .55, cy: .9, r: .45 }
  ];
  const dots = Array.from({ length: 12 }, () => ({ x: Math.random(), y: Math.random(), s: 1.5 + Math.random() * 2.5, v: 2e-5 + Math.random() * 4e-5, sw: Math.random() * 6.28, a: .1 + Math.random() * .14 }));
  function resize(){
    dpr = Math.min(devicePixelRatio || 1, 1.25);
    w = canvas.clientWidth || innerWidth; h = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(performance.now());
  }
  function draw(t){
    const P = PALETTES[theme()], R = Math.max(w, h);
    ctx.clearRect(0, 0, w, h);
    blobs.forEach((b, i) => {
      const c = P.blobs[i], x = (b.cx + Math.sin(t * b.fx + b.px) * b.ax) * w, y = (b.cy + Math.cos(t * b.fy + b.py) * b.ay) * h, r = b.r * R * (w < 700 ? .9 : .65);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    const d0 = P.dot;
    dots.forEach(d => {
      const x = (d.x + Math.sin(t * 3e-4 + d.sw) * .012) * w, y = d.y * h, tw = .6 + Math.sin(t * 9e-4 + d.sw) * .4;
      ctx.fillStyle = `rgba(${d0[0]},${d0[1]},${d0[2]},${d.a * tw})`; ctx.beginPath(); ctx.arc(x, y, d.s, 0, 6.2832); ctx.fill();
    });
  }
  function step(t){
    if(!running) return;
    raf = requestAnimationFrame(step);
    if(t - last < 48) return; const dt = Math.min(t - last, 100); last = t;
    for(const d of dots){ d.y -= d.v * dt; if(d.y < -.04){ d.y = 1.04; d.x = Math.random(); } }
    draw(t);
  }
  const start = () => { if(running || mq.matches || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(step); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const onVis = () => (document.hidden ? stop() : start());
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  mq.addEventListener?.('change', () => { stop(); mq.matches ? draw(performance.now()) : start(); });
  new MutationObserver(() => draw(performance.now())).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize(); start();
  return () => { stop(); removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); };
}
