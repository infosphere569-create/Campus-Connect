import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
const root=$('[data-landing]');
if(root){root.querySelector('[data-theme-label]')?.setAttribute('title',`Theme: ${getTheme()}`)}
