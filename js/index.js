import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
import { subscribeAuth } from './auth.js';
const root=$('[data-landing]');
if(root){root.querySelector('[data-theme-label]')?.setAttribute('title',`Theme: ${getTheme()}`)}
// manifest.json's start_url points here (a public page, not an auth-gated one,
// so the installed app always opens successfully) -- if the installed app is
// launched by someone already signed in, send them straight to their feed
// instead of showing the marketing landing page again.
subscribeAuth((user)=>{if(user&&user.uid!=='demo-user')location.href='home.html'});
