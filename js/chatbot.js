/**
 * Campus Connect One AI Assistant
 * Multimodal multi-turn chat interface using Gemini 3.8 Flash with full draggable & repositionable FAB & widget
 */

import { escapeHtml } from './utils.js';

let chatHistory = [];
let isOpen = false;

const SYSTEM_GREETING = "Hi there! I'm your Campus Connect One Assistant. How can I help you today? I can suggest clubs, events, or help you navigate the platform!";

const CHATBOT_CSS = `
/* ========== Campus Connect One AI Assistant ========== */
#chatbotWrap {
  position: relative;
  z-index: 10000;
}
.chatbot-fab {
  position: fixed;
  right: 20px;
  bottom: calc(70px + 20px);
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: linear-gradient(135deg, var(--primary), var(--primary-2));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(91, 92, 240, 0.4);
  cursor: grab;
  z-index: 10000;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, opacity 0.3s ease;
  will-change: transform, left, top;
}
.chatbot-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 12px 32px rgba(91, 92, 240, 0.55);
}
.chatbot-fab.is-dragging {
  cursor: grabbing !important;
  transform: scale(1.14) !important;
  box-shadow: 0 18px 40px rgba(91, 92, 240, 0.7) !important;
  transition: none !important;
}
.chatbot-fab i { 
  width: 24px; 
  height: 24px; 
  pointer-events: none; 
}
.chatbot-fab-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid var(--surface);
  pointer-events: none;
}

.chat-container {
  position: fixed;
  right: 20px;
  bottom: calc(70px + 85px);
  width: min(390px, calc(100vw - 32px));
  height: min(520px, 75vh);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 24px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10001;
  opacity: 0;
  transform: translateY(20px) scale(0.95);
  pointer-events: none;
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}
.chat-container.is-open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
.chat-container.is-dragging {
  transition: none !important;
  box-shadow: 0 26px 60px rgba(0, 0, 0, 0.4) !important;
}

.chat-header {
  padding: 14px 18px;
  background: linear-gradient(90deg, var(--primary), var(--primary-2));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.chat-header:active {
  cursor: grabbing;
}
.chat-header-info { 
  display: flex; 
  align-items: center; 
  gap: 12px;
  pointer-events: none;
}
.chat-header-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.22);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.chat-header-avatar i { width: 18px; height: 18px; }
.chat-header-title { font-weight: 800; font-size: 0.95rem; line-height: 1.2; }
.chat-header-sub { font-size: 0.75rem; opacity: 0.85; font-weight: 500; }

.chat-header-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
}
.chat-header-btn {
  background: rgba(255, 255, 255, 0.15);
  border: 0;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.1s ease;
}
.chat-header-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}
.chat-header-btn i { width: 15px; height: 15px; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
}
.chat-message {
  max-width: 86%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 0.9rem;
  line-height: 1.45;
  word-break: break-word;
}
.chat-message.ai {
  align-self: flex-start;
  background: var(--surface-2);
  color: var(--text);
  border-bottom-left-radius: 4px;
  border: 1px solid var(--border);
}
.chat-message.user {
  align-self: flex-end;
  background: var(--primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-suggestions {
  display: flex;
  gap: 8px;
  padding: 0 18px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  background: var(--surface);
}
.chat-suggestions::-webkit-scrollbar { display: none; }
.chat-suggestion {
  white-space: nowrap;
  padding: 6px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  transition: all 0.2s ease;
}
.chat-suggestion:hover { 
  background: var(--surface); 
  border-color: var(--primary); 
  transform: translateY(-1px);
}

.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.chat-form { display: flex; gap: 8px; align-items: center; }
.chat-input {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s ease;
}
.chat-input:focus {
  border-color: var(--primary);
}
.chat-send-btn {
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.chat-send-btn:hover {
  transform: scale(1.05);
}
.chat-send-btn:active {
  transform: scale(0.95);
}

.chat-typing-indicator {
  padding: 10px 14px;
  background: var(--surface-2);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  display: flex;
  gap: 4px;
  width: fit-content;
  border: 1px solid var(--border);
}
.chat-typing-dot {
  width: 6px;
  height: 6px;
  background: var(--muted);
  border-radius: 50%;
  animation: chat-typing 1.4s infinite ease-in-out;
}
.chat-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.chat-typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes chat-typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}

@media (max-width: 720px) {
  .chat-container {
    bottom: 0 !important;
    right: 0 !important;
    left: 0 !important;
    top: auto !important;
    width: 100% !important;
    height: 80vh !important;
    border-radius: 24px 24px 0 0 !important;
    border-bottom: 0 !important;
  }
  .chat-header {
    cursor: default;
  }
}
`;

export function initChatbot() {
  if (document.getElementById('chatbotWrap')) return;

  const style = document.createElement('style');
  style.id = 'chatbotStyles';
  style.textContent = CHATBOT_CSS;
  document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.id = 'chatbotWrap';
  wrap.innerHTML = `
    <div class="chatbot-fab" id="chatbotFab" title="Drag to reposition • Tap to chat" aria-label="Campus Connect One Assistant">
      <i data-lucide="sparkles"></i>
      <span class="chatbot-fab-badge" title="Online"></span>
    </div>
    <div class="chat-container" id="chatContainer">
      <div class="chat-header" id="chatHeader" title="Drag header to move window">
        <div class="chat-header-info">
          <div class="chat-header-avatar"><i data-lucide="bot"></i></div>
          <div>
            <div class="chat-header-title">Campus Connect One Assistant</div>
            <div class="chat-header-sub">AI Campus Guide • Drag to move</div>
          </div>
        </div>
        <div class="chat-header-toolbar">
          <button class="chat-header-btn" id="resetPosBtn" title="Reset Widget Position" aria-label="Reset Widget Position">
            <i data-lucide="crosshair"></i>
          </button>
          <button class="chat-header-btn" id="resetChatBtn" title="Reset Conversation" aria-label="Reset Conversation">
            <i data-lucide="rotate-ccw"></i>
          </button>
          <button class="chat-header-btn" id="closeChatBtn" title="Close" aria-label="Close">
            <i data-lucide="chevron-down"></i>
          </button>
        </div>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="chat-message ai">${escapeHtml(SYSTEM_GREETING)}</div>
      </div>
      <div class="chat-suggestions" id="chatSuggestions">
        <div class="chat-suggestion" data-q="What clubs can I join on Campus Connect One?">Explore Clubs</div>
        <div class="chat-suggestion" data-q="How do I report an issue or concern?">Report Issue</div>
        <div class="chat-suggestion" data-q="Give me study tips and campus resources">Study Tips</div>
        <div class="chat-suggestion" data-q="What upcoming campus events are scheduled?">Upcoming Events</div>
      </div>
      <div class="chat-input-area">
        <form class="chat-form" id="chatForm">
          <input type="text" class="chat-input" id="chatInput" placeholder="Ask anything..." autocomplete="off">
          <button type="submit" class="chat-send-btn" id="chatSendBtn" aria-label="Send Message">
            <i data-lucide="send"></i>
          </button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  window.lucide?.createIcons({ root: wrap });

  const fab = document.getElementById('chatbotFab');
  const container = document.getElementById('chatContainer');
  const chatHeader = document.getElementById('chatHeader');
  const closeBtn = document.getElementById('closeChatBtn');
  const resetBtn = document.getElementById('resetChatBtn');
  const resetPosBtn = document.getElementById('resetPosBtn');
  const form = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const messagesBox = document.getElementById('chatMessages');
  const suggestionsBox = document.getElementById('chatSuggestions');

  const MARGIN = 12;
  const DRAG_THRESHOLD = 6; // px movement before committing to drag state

  // Restore saved position if valid
  function restoreSavedPosition() {
    try {
      const savedPos = JSON.parse(localStorage.getItem('cc-chatbot-pos') || 'null');
      if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
        const fabW = fab.offsetWidth || 56;
        const fabH = fab.offsetHeight || 56;
        const maxX = window.innerWidth - fabW - MARGIN;
        const maxY = window.innerHeight - fabH - MARGIN;
        const clampedX = Math.max(MARGIN, Math.min(savedPos.x, maxX));
        const clampedY = Math.max(MARGIN, Math.min(savedPos.y, maxY));

        fab.style.left = `${clampedX}px`;
        fab.style.top = `${clampedY}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        if (isOpen) updateContainerPosition(clampedX, clampedY);
      }
    } catch (e) {}
  }

  function resetFabPosition() {
    localStorage.removeItem('cc-chatbot-pos');
    fab.style.left = '';
    fab.style.top = '';
    fab.style.right = '20px';
    fab.style.bottom = 'calc(70px + 20px)';
    container.style.left = '';
    container.style.top = '';
    container.style.right = '20px';
    container.style.bottom = 'calc(70px + 85px)';
  }

  function updateContainerPosition(fabX, fabY) {
    if (window.innerWidth <= 720) {
      // Let mobile bottom sheet CSS handle it
      container.style.left = '';
      container.style.top = '';
      container.style.right = '';
      container.style.bottom = '';
      return;
    }

    const containerWidth = Math.min(390, window.innerWidth - 32);
    const containerHeight = Math.min(520, window.innerHeight * 0.75);

    // Default: dock above the FAB aligned with its right edge
    let left = fabX - containerWidth + 56;
    let top = fabY - containerHeight - 16;

    // Boundary checks
    if (left < MARGIN) left = MARGIN;
    if (left + containerWidth > window.innerWidth - MARGIN) {
      left = window.innerWidth - containerWidth - MARGIN;
    }

    // If not enough room on top, position below FAB
    if (top < MARGIN) {
      top = fabY + 68;
    }
    // If still overflowing bottom, clamp to bottom edge
    if (top + containerHeight > window.innerHeight - MARGIN) {
      top = window.innerHeight - containerHeight - MARGIN;
    }

    container.style.left = `${Math.round(left)}px`;
    container.style.top = `${Math.round(top)}px`;
    container.style.right = 'auto';
    container.style.bottom = 'auto';
  }

  // ==========================================
  // DRAGGABLE FAB IMPLEMENTATION (Pointer Events)
  // ==========================================
  let isPointerDown = false;
  let isDragging = false;
  let hasMoved = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let startFabLeft = 0;
  let startFabTop = 0;

  fab.addEventListener('pointerdown', (e) => {
    // Only primary button
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    isPointerDown = true;
    isDragging = false;
    hasMoved = false;
    startPointerX = e.clientX;
    startPointerY = e.clientY;

    const rect = fab.getBoundingClientRect();
    startFabLeft = rect.left;
    startFabTop = rect.top;

    try {
      fab.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  fab.addEventListener('pointermove', (e) => {
    if (!isPointerDown) return;

    const deltaX = e.clientX - startPointerX;
    const deltaY = e.clientY - startPointerY;
    const distance = Math.hypot(deltaX, deltaY);

    if (!isDragging && distance > DRAG_THRESHOLD) {
      isDragging = true;
      hasMoved = true;
      fab.classList.add('is-dragging');
    }

    if (isDragging) {
      e.preventDefault();
      const fabW = fab.offsetWidth || 56;
      const fabH = fab.offsetHeight || 56;
      const maxX = window.innerWidth - fabW - MARGIN;
      const maxY = window.innerHeight - fabH - MARGIN;

      let newX = Math.max(MARGIN, Math.min(startFabLeft + deltaX, maxX));
      let newY = Math.max(MARGIN, Math.min(startFabTop + deltaY, maxY));

      fab.style.left = `${newX}px`;
      fab.style.top = `${newY}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';

      if (isOpen) {
        updateContainerPosition(newX, newY);
      }
    }
  });

  const onFabPointerEnd = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      fab.releasePointerCapture(e.pointerId);
    } catch (err) {}

    if (isDragging) {
      fab.classList.remove('is-dragging');
      isDragging = false;

      // Save position in localStorage
      const rect = fab.getBoundingClientRect();
      try {
        localStorage.setItem('cc-chatbot-pos', JSON.stringify({
          x: Math.round(rect.left),
          y: Math.round(rect.top)
        }));
      } catch (err) {}

      // Suppress the click event triggered right after drag ends
      setTimeout(() => {
        hasMoved = false;
      }, 80);
    } else {
      hasMoved = false;
    }
  };

  fab.addEventListener('pointerup', onFabPointerEnd);
  fab.addEventListener('pointercancel', onFabPointerEnd);

  // Toggle chat on click/tap (only when not dragged)
  fab.addEventListener('click', (e) => {
    if (!hasMoved && !isDragging) {
      toggleChat();
    }
  });

  // Double click resets position to default
  fab.addEventListener('dblclick', () => {
    resetFabPosition();
  });

  // ==========================================
  // DRAGGABLE CONTAINER HEADER (Desktop)
  // ==========================================
  let isHeaderPointerDown = false;
  let isHeaderDragging = false;
  let startHeaderX = 0, startHeaderY = 0;
  let startContainerLeft = 0, startContainerTop = 0;

  chatHeader.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= 720) return; // Disable on mobile sheet
    if (e.target.closest('button')) return; // Ignore buttons
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    isHeaderPointerDown = true;
    isHeaderDragging = false;
    startHeaderX = e.clientX;
    startHeaderY = e.clientY;

    const rect = container.getBoundingClientRect();
    startContainerLeft = rect.left;
    startContainerTop = rect.top;

    try {
      chatHeader.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  chatHeader.addEventListener('pointermove', (e) => {
    if (!isHeaderPointerDown) return;
    const deltaX = e.clientX - startHeaderX;
    const deltaY = e.clientY - startHeaderY;

    if (!isHeaderDragging && Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) {
      isHeaderDragging = true;
      container.classList.add('is-dragging');
    }

    if (isHeaderDragging) {
      e.preventDefault();
      const contW = container.offsetWidth || 390;
      const contH = container.offsetHeight || 520;
      const maxX = window.innerWidth - contW - MARGIN;
      const maxY = window.innerHeight - contH - MARGIN;

      let newX = Math.max(MARGIN, Math.min(startContainerLeft + deltaX, maxX));
      let newY = Math.max(MARGIN, Math.min(startContainerTop + deltaY, maxY));

      container.style.left = `${newX}px`;
      container.style.top = `${newY}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }
  });

  const onHeaderPointerEnd = (e) => {
    if (!isHeaderPointerDown) return;
    isHeaderPointerDown = false;
    try {
      chatHeader.releasePointerCapture(e.pointerId);
    } catch (err) {}
    if (isHeaderDragging) {
      container.classList.remove('is-dragging');
      isHeaderDragging = false;
    }
  };

  chatHeader.addEventListener('pointerup', onHeaderPointerEnd);
  chatHeader.addEventListener('pointercancel', onHeaderPointerEnd);

  // Resize listener to re-clamp within bounds
  window.addEventListener('resize', () => {
    if (fab.style.left && fab.style.left !== 'auto') {
      const rect = fab.getBoundingClientRect();
      const maxX = window.innerWidth - (fab.offsetWidth || 56) - MARGIN;
      const maxY = window.innerHeight - (fab.offsetHeight || 56) - MARGIN;
      const clampedX = Math.max(MARGIN, Math.min(rect.left, maxX));
      const clampedY = Math.max(MARGIN, Math.min(rect.top, maxY));

      fab.style.left = `${clampedX}px`;
      fab.style.top = `${clampedY}px`;

      if (isOpen) {
        updateContainerPosition(clampedX, clampedY);
      }
    }
  });

  // Chat toggle functionality
  const toggleChat = (forceClose = false) => {
    isOpen = forceClose ? false : !isOpen;
    container.classList.toggle('is-open', isOpen);

    if (isOpen) {
      const rect = fab.getBoundingClientRect();
      updateContainerPosition(rect.left, rect.top);
      input.focus();
      scrollToBottom();
    }
  };

  closeBtn.addEventListener('click', () => toggleChat(true));
  resetPosBtn.addEventListener('click', () => resetFabPosition());

  resetBtn.addEventListener('click', () => {
    chatHistory = [];
    messagesBox.innerHTML = `<div class="chat-message ai">${escapeHtml(SYSTEM_GREETING)}</div>`;
  });

  suggestionsBox.querySelectorAll('.chat-suggestion').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.q;
      if (q) {
        input.value = q;
        form.dispatchEvent(new Event('submit'));
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    appendMessage('user', text);
    input.value = '';

    const typingId = showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          history: chatHistory
        })
      });

      const data = await response.json();
      removeTypingIndicator(typingId);

      if (data.error) {
        const isApiKeyError = data.error.includes('Secrets') || data.error.includes('API key');
        if (isApiKeyError) {
          appendMessage('ai', `**Configuration Required:** ${data.error}\n\n1. Go to the **Settings** (gear icon) in the AI Studio sidebar.\n2. Open the **Secrets** panel.\n3. Select a valid **Gemini API Key**.\n4. Refresh this page to start chatting!`);
        } else {
          appendMessage('ai', data.error);
        }
      } else {
        appendMessage('ai', data.content);
        chatHistory = data.history;
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      appendMessage('ai', "I'm having trouble connecting to the campus network right now. Please ensure your Gemini API key is selected in the **Settings > Secrets** panel and try refreshing the page.");
    }
  });

  function appendMessage(role, content) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${role}`;
    msg.textContent = content;
    messagesBox.appendChild(msg);
    scrollToBottom();
  }

  function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const indicator = document.createElement('div');
    indicator.id = id;
    indicator.className = 'chat-typing-indicator';
    indicator.innerHTML = `<div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div>`;
    messagesBox.appendChild(indicator);
    scrollToBottom();
    return id;
  }

  function removeTypingIndicator(id) {
    document.getElementById(id)?.remove();
  }

  function scrollToBottom() {
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  // Initialize position from storage
  restoreSavedPosition();
}
