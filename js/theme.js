const KEY='cc-theme';
function applyTheme(value){
  const resolved=value==='system' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : value;
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themePreference=value;
  document.querySelectorAll('[data-theme-choice]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.themeChoice===value?'true':'false'));
}
export function getTheme(){return localStorage.getItem(KEY)||'system'}
export function setTheme(value){localStorage.setItem(KEY,value);applyTheme(value)}
applyTheme(getTheme());
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(getTheme()==='system')applyTheme('system')});
document.addEventListener('click',e=>{const el=e.target.closest('[data-theme-choice]');if(el)setTheme(el.dataset.themeChoice)});
export function themeControl(){return `<div class="toolbar" aria-label="Theme"><button class="btn sm ghost" data-theme-choice="system">System</button><button class="btn sm ghost" data-theme-choice="light">Light</button><button class="btn sm ghost" data-theme-choice="dark">Dark</button></div>`}
