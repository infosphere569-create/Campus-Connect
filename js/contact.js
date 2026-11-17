// Campus Connect One - Contact Us Logic
import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { toast, escapeHtml } from './utils.js';
import { currentUser, currentProfile } from './auth.js';

let isSubmitting = false;

export function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  // Prefill user details if available
  const nameInput = document.getElementById('contactName');
  const emailInput = document.getElementById('contactEmail');
  const messageInput = document.getElementById('contactMessage');
  const charHint = document.getElementById('messageCharCount');

  if (nameInput && !nameInput.value) {
    if (currentProfile?.displayName) nameInput.value = currentProfile.displayName;
    else if (currentUser?.displayName) nameInput.value = currentUser.displayName;
  }

  if (emailInput && !emailInput.value) {
    if (currentUser?.email) emailInput.value = currentUser.email;
  }

  // Live character counter
  if (messageInput && charHint && !messageInput.dataset.counterAttached) {
    messageInput.dataset.counterAttached = 'true';
    const updateCount = () => {
      const len = messageInput.value.trim().length;
      if (len >= 10) {
        charHint.innerHTML = `<span style="color:var(--success)">${len} characters (meets min. 10)</span>`;
      } else {
        charHint.innerHTML = `<span style="color:var(--muted)">${len} / 10 min characters</span>`;
      }
    };
    messageInput.addEventListener('input', updateCount);
    updateCount();
  }
}

export async function handleContactSubmit(form) {
  if (isSubmitting) return;

  const submitBtn = document.getElementById('contactSubmitBtn') || form.querySelector('button[type="submit"]');
  const nameInput = document.getElementById('contactName');
  const emailInput = document.getElementById('contactEmail');
  const categorySelect = document.getElementById('contactCategory');
  const messageInput = document.getElementById('contactMessage');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const category = categorySelect ? categorySelect.value : '';
  const message = messageInput ? messageInput.value.trim() : '';

  // Validation
  if (!name) {
    toast('Please enter your full name.', 'warning');
    nameInput?.focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    toast('Please enter a valid student email address.', 'warning');
    emailInput?.focus();
    return;
  }

  if (!category) {
    toast('Please select a subject / category.', 'warning');
    categorySelect?.focus();
    return;
  }

  if (!message || message.length < 10) {
    toast('Please enter a message of at least 10 characters.', 'warning');
    messageInput?.focus();
    return;
  }

  isSubmitting = true;

  // 1. Button state changes to loading/animating with a spinner
  let originalBtnHtml = '';
  if (submitBtn) {
    originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Sending...';
  }

  const supportData = {
    name,
    email,
    category,
    message,
    status: 'unread',
    targetEmail: 'support@campusconnectone.online'
  };

  try {
    // 2. Submit to Firebase callable function for server-side email forwarding
    const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js');
    const { functions } = await import('./firebase.js');
    const submitContactForm = httpsCallable(functions, 'submitContactForm');
    
    await submitContactForm(supportData);

    // 3. Save message to Firestore collection supportMessages as backup
    if (db) {
      try {
        await addDoc(collection(db, 'supportMessages'), {
          ...supportData,
          createdAt: serverTimestamp()
        });
      } catch (firestoreErr) {
        console.warn('[Contact] Firestore save warning:', firestoreErr);
      }
    }

    // 4. Smoothly fade out / animate away form
    form.style.transform = 'scale(0.95)';
    form.style.opacity = '0';
    form.style.transition = 'all 0.35s ease';
    form.style.pointerEvents = 'none';

    // 5. Replace with sleek, animated green confirmation box
    setTimeout(() => {
      const container = document.getElementById('contactFormContainer') || form.parentElement;
      container.innerHTML = `
        <div class="card contact-success-box" style="background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 2px solid var(--success); border-radius: 20px; padding: 32px; text-align: center; animation: slideUp .4s ease;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: var(--success); color: white; display: grid; place-items: center; margin: 0 auto 16px; font-size: 28px;">✓</div>
          <h2 style="color: var(--text); margin: 0 0 8px;">Message Sent Successfully!</h2>
          <p style="color: var(--muted); max-width: 460px; margin: 0 auto 20px;">
            Your message has been forwarded to <strong>support@campusconnectone.online</strong>. Our campus support team will review your query and reply to your email shortly.
          </p>
          <div class="toolbar" style="justify-content: center;">
            <a href="home.html" class="btn primary">Return to Home</a>
            <button class="btn ghost" onclick="location.reload()">Send Another Message</button>
          </div>
        </div>
      `;
      window.lucide?.createIcons();
    }, 350);

  } catch (err) {
    console.error('[Contact] Submission error:', err);
    toast(err.message || 'Something went wrong. Please try again.', 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  } finally {
    isSubmitting = false;
  }
}

// Global form submission listener via event delegation
document.addEventListener('submit', (e) => {
  const form = e.target.closest('#contactForm');
  if (form) {
    e.preventDefault();
    handleContactSubmit(form);
  }
});

// Run initial prefill on DOM ready or direct load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContactForm);
} else {
  initContactForm();
}
