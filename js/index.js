import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
import { subscribeAuth } from './auth.js';
import './pwa.js';

const root=$('[data-landing]');
if(root){
  root.querySelector('[data-theme-label]')?.setAttribute('title',`Theme: ${getTheme()}`);
}

// If already signed in, skip landing page and jump straight to the dashboard
subscribeAuth((user)=>{
  const isDemo = sessionStorage.getItem('cc-demo') === '1';
  if(user || isDemo){
    location.replace('home.html');
  }
});
