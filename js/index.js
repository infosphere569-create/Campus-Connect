import './theme.js';
import { getTheme } from './theme.js';
import { $ } from './utils.js';
import { subscribeAuth } from './auth.js';
import { subscribeNewsletter } from './services.js';
import { toast } from './utils.js';
import { initChatbot } from './chatbot.js';
import './pwa.js';

initChatbot();

const root = $('[data-landing]');
if (root) {
  root.querySelector('[data-theme-label]')?.setAttribute('title', `Theme: ${getTheme()}`);
}

// If already signed in, skip landing page and jump straight to the dashboard
subscribeAuth((user) => {
  const isDemo = sessionStorage.getItem('cc-demo') === '1';
  if (user || isDemo) {
    location.replace('home.html');
  }
});

// Working Newsletter Subscription Listener
const nForm = document.getElementById('newsletterForm');
if (nForm) {
  nForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('newsletterEmail');
    const msgDiv = document.getElementById('newsletterMsg');
    const subBtn = nForm.querySelector('button[type="submit"]');
    const email = emailInput?.value?.trim();

    if (!email) return;

    subBtn.disabled = true;
    const origText = subBtn.innerHTML;
    subBtn.innerHTML = '<span class="btn-spinner"></span> Subscribing…';

    try {
      await subscribeNewsletter(email);
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--success, #1f9d69)';
        msgDiv.textContent = '🎉 Successfully subscribed to campus updates!';
      }
      toast('Subscribed to campus newsletter!', 'success');
      emailInput.value = '';
    } catch (err) {
      if (msgDiv) {
        msgDiv.hidden = false;
        msgDiv.style.color = 'var(--danger, #c44949)';
        msgDiv.textContent = err.message || 'Failed to subscribe.';
      }
      toast(err.message || 'Subscription failed', 'error');
    } finally {
      subBtn.disabled = false;
      subBtn.innerHTML = origText;
    }
  });
}



