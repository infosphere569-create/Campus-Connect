import { db, auth } from './firebase.js';
import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { toggleEventInterest } from './interactions.js';
import { isEventInterested } from './data-layer.js';
import { $, $$, escapeHtml, formatDateTime, toast } from './utils.js';

const STORAGE_KEY = 'cc-quick-rsvps';
let delegationBound = false;

export const DEMO_EVENTS = [
  {
    id: 'demo-ev-1',
    title: 'Campus Hacknight 2026',
    organizer: 'Campus Coders',
    venue: 'Main Lab Block B',
    date: new Date(Date.now() + 86400000 * 2),
    interestedCount: 78,
    status: 'approved'
  },
  {
    id: 'demo-ev-2',
    title: 'Placement Talk: Tech Career Roadmap',
    organizer: 'Placement Cell',
    venue: 'Auditorium A',
    date: new Date(Date.now() + 86400000 * 5),
    interestedCount: 145,
    status: 'approved'
  },
  {
    id: 'demo-ev-3',
    title: 'Annual Cultural Fest Auditions',
    organizer: 'Music & Arts Society',
    venue: 'Open Amphitheatre',
    date: new Date(Date.now() + 86400000 * 9),
    interestedCount: 92,
    status: 'approved'
  }
];

export function getLocalRsvpMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setLocalRsvp(eventId, joined, count) {
  try {
    const map = getLocalRsvpMap();
    map[eventId] = {
      joined: Boolean(joined),
      count: Math.max(0, Number(count) || 0),
      updatedAt: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function isLiveFirestoreEvent(eventId) {
  return Boolean(
    db &&
    auth?.currentUser?.uid &&
    eventId &&
    !String(eventId).startsWith('demo') &&
    !String(eventId).startsWith('preview-')
  );
}

function getButtonCount(btn) {
  const countEl = btn.querySelector('.rsvp-count');
  if (countEl) {
    const parsed = Number(countEl.textContent.replace(/[^\d]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  const base = Number(btn.dataset.baseCount || 0);
  return Number.isFinite(base) ? base : 0;
}

export function applyQuickRsvpButtonState(btn, joined, count) {
  if (!btn) return;
  const isJoined = Boolean(joined);
  const safeCount = Math.max(0, Number(count) || 0);
  btn.classList.toggle('is-joined', isJoined);
  btn.setAttribute('aria-pressed', isJoined ? 'true' : 'false');
  btn.title = isJoined ? 'Click to cancel RSVP' : 'Register / RSVP in one click';
  btn.innerHTML = `<i data-lucide="${isJoined ? 'check' : 'calendar-plus'}"></i><span class="rsvp-label">${isJoined ? 'Going' : 'Quick RSVP'}</span><span class="rsvp-count">${safeCount}</span>`;
  window.lucide?.createIcons({ root: btn });
}

function syncAllButtonsForEvent(eventId, joined, count) {
  const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(eventId) : eventId;
  $$(`[data-quick-rsvp="${esc}"]`).forEach(btn => {
    applyQuickRsvpButtonState(btn, joined, count);
  });
}

export async function hydrateQuickRsvpButtons(root = document) {
  const scope = root instanceof Element || root instanceof Document ? root : document;
  const buttons = [...scope.querySelectorAll('[data-quick-rsvp]')];
  if (!buttons.length) return;

  const localMap = getLocalRsvpMap();
  const seenIds = new Set();

  for (const btn of buttons) {
    const eventId = btn.dataset.quickRsvp;
    if (!eventId) continue;
    const baseCount = Math.max(0, Number(btn.dataset.baseCount || getButtonCount(btn)) || 0);
    const localEntry = localMap[eventId];
    if (localEntry && typeof localEntry.joined === 'boolean') {
      const nextCount = typeof localEntry.count === 'number' ? localEntry.count : baseCount + (localEntry.joined ? 1 : 0);
      applyQuickRsvpButtonState(btn, localEntry.joined, nextCount);
    } else {
      applyQuickRsvpButtonState(btn, btn.classList.contains('is-joined'), baseCount);
    }
    seenIds.add(eventId);
  }

  // Upgrade with authoritative Firestore state for real signed-in users & live events
  await Promise.all([...seenIds].map(async (eventId) => {
    if (!isLiveFirestoreEvent(eventId)) return;
    try {
      const joined = await isEventInterested(eventId);
      const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(eventId) : eventId;
      $$(`[data-quick-rsvp="${esc}"]`).forEach(btn => {
        const baseCount = Math.max(0, Number(btn.dataset.baseCount || getButtonCount(btn)) || 0);
        applyQuickRsvpButtonState(btn, joined, baseCount);
      });
    } catch {
      // Keep current rendered fallback state if network is temporarily unavailable
    }
  }));
}

export function initQuickRsvp() {
  if (delegationBound) return;
  delegationBound = true;

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quick-rsvp]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    if (btn.disabled || btn.dataset.busy === '1') return;

    const eventId = btn.dataset.quickRsvp;
    if (!eventId) return;

    const title = btn.dataset.rsvpTitle || 'this event';
    const wasJoined = btn.classList.contains('is-joined');
    const prevCount = getButtonCount(btn);
    const nextJoined = !wasJoined;
    const nextCount = Math.max(0, prevCount + (nextJoined ? 1 : -1));

    // Optimistic update immediately (< 16ms) across all matching cards
    btn.dataset.busy = '1';
    btn.classList.add('is-busy');
    syncAllButtonsForEvent(eventId, nextJoined, nextCount);
    setLocalRsvp(eventId, nextJoined, nextCount);

    toast(
      nextJoined ? `RSVP confirmed for ${title}!` : `RSVP cancelled for ${title}`,
      nextJoined ? 'success' : 'info'
    );

    if (isLiveFirestoreEvent(eventId)) {
      try {
        const serverJoined = await toggleEventInterest(eventId);
        // If server state disagrees with optimistic toggle, align cleanly
        if (serverJoined !== nextJoined) {
          const correctedCount = Math.max(0, prevCount + (serverJoined === wasJoined ? 0 : (serverJoined ? 1 : -1)));
          syncAllButtonsForEvent(eventId, serverJoined, correctedCount);
          setLocalRsvp(eventId, serverJoined, correctedCount);
        }
      } catch (err) {
        // Rollback optimistic update on failure
        syncAllButtonsForEvent(eventId, wasJoined, prevCount);
        setLocalRsvp(eventId, wasJoined, prevCount);
        toast(err?.message || 'Could not update RSVP. Please try again.', 'error');
      }
    }

    btn.dataset.busy = '0';
    btn.classList.remove('is-busy');

    window.dispatchEvent(new CustomEvent('cc:rsvp-changed', {
      detail: { eventId, joined: nextJoined, count: nextCount }
    }));
  });
}

export async function fetchUpcomingEventPreviews(limitCount = 3) {
  let items = [];
  if (db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'events'),
          where('status', '==', 'approved'),
          orderBy('date', 'asc'),
          limit(limitCount)
        )
      );
      items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      items = [];
    }
  }
  if (!items.length) {
    items = DEMO_EVENTS.slice(0, limitCount);
  }
  return items;
}

export function renderEventPreviewCard(ev) {
  const d = ev.date?.toDate ? ev.date.toDate() : new Date(ev.date);
  const validDate = !Number.isNaN(d.getTime());
  const monthLabel = validDate ? d.toLocaleString(undefined, { month: 'short' }).toUpperCase() : 'SOON';
  const dayLabel = validDate ? String(d.getDate()) : '—';
  const baseCount = Math.max(0, Number(ev.interestedCount ?? ev.rsvpCount ?? 0) || 0);
  const localEntry = getLocalRsvpMap()[ev.id];
  const initialJoined = localEntry ? Boolean(localEntry.joined) : false;
  const initialCount = localEntry && typeof localEntry.count === 'number' ? localEntry.count : baseCount;
  const title = ev.title || 'Untitled event';
  const venue = ev.venue || 'Campus';
  const organizer = ev.organizer || 'Campus event';
  const timeText = formatDateTime(ev.date);

  return `<article class="event-preview-row" data-preview-event-id="${escapeHtml(ev.id)}">
    <div class="event-preview-top">
      <div class="event-date" aria-hidden="true">
        <span class="small">${escapeHtml(monthLabel)}</span>
        <strong>${escapeHtml(dayLabel)}</strong>
      </div>
      <div class="event-preview-copy">
        <strong class="event-preview-title">${escapeHtml(title)}</strong>
        <div class="small muted event-preview-meta">${escapeHtml(venue)} · ${escapeHtml(timeText)}</div>
      </div>
    </div>
    <div class="event-preview-foot">
      <span class="small muted event-preview-org">${escapeHtml(organizer)}</span>
      <button
        type="button"
        class="quick-rsvp-badge ${initialJoined ? 'is-joined' : ''}"
        data-quick-rsvp="${escapeHtml(ev.id)}"
        data-rsvp-title="${escapeHtml(title)}"
        data-base-count="${baseCount}"
        aria-pressed="${initialJoined ? 'true' : 'false'}"
        title="${initialJoined ? 'Click to cancel RSVP' : 'Register / RSVP in one click'}">
        <i data-lucide="${initialJoined ? 'check' : 'calendar-plus'}"></i>
        <span class="rsvp-label">${initialJoined ? 'Going' : 'Quick RSVP'}</span>
        <span class="rsvp-count">${initialCount}</span>
      </button>
    </div>
  </article>`;
}

export function renderMobileFeaturedEvent(ev) {
  if (!ev) return '';
  const d = ev.date?.toDate ? ev.date.toDate() : new Date(ev.date);
  const validDate = !Number.isNaN(d.getTime());
  const dateLabel = validDate
    ? `${d.toLocaleString(undefined, { month: 'short' }).toUpperCase()} ${d.getDate()}`
    : 'UPCOMING';
  const baseCount = Math.max(0, Number(ev.interestedCount ?? ev.rsvpCount ?? 0) || 0);
  const localEntry = getLocalRsvpMap()[ev.id];
  const initialJoined = localEntry ? Boolean(localEntry.joined) : false;
  const initialCount = localEntry && typeof localEntry.count === 'number' ? localEntry.count : baseCount;
  const title = ev.title || 'Untitled event';

  return `<div class="card feed-event-spotlight" data-preview-event-id="${escapeHtml(ev.id)}">
    <div class="feed-event-spotlight-body">
      <div class="kicker">Next on campus · ${escapeHtml(dateLabel)}</div>
      <strong class="feed-event-spotlight-title">${escapeHtml(title)}</strong>
      <div class="small muted">${escapeHtml(ev.venue || 'Campus')} · ${formatDateTime(ev.date)}</div>
    </div>
    <div class="feed-event-spotlight-action">
      <button
        type="button"
        class="quick-rsvp-badge ${initialJoined ? 'is-joined' : ''}"
        data-quick-rsvp="${escapeHtml(ev.id)}"
        data-rsvp-title="${escapeHtml(title)}"
        data-base-count="${baseCount}"
        aria-pressed="${initialJoined ? 'true' : 'false'}">
        <i data-lucide="${initialJoined ? 'check' : 'calendar-plus'}"></i>
        <span class="rsvp-label">${initialJoined ? 'Going' : 'Quick RSVP'}</span>
        <span class="rsvp-count">${initialCount}</span>
      </button>
    </div>
  </div>`;
}

export async function loadEventPreviewsInto({ listSelector, mobileSelector, limitCount = 3 } = {}) {
  initQuickRsvp();
  const listEl = listSelector ? $(listSelector) : null;
  const mobileEl = mobileSelector ? $(mobileSelector) : null;
  if (!listEl && !mobileEl) return;

  const items = await fetchUpcomingEventPreviews(limitCount);

  if (listEl) {
    listEl.innerHTML = items.length
      ? items.map(renderEventPreviewCard).join('')
      : '<div class="small muted">No upcoming events right now.</div>';
    window.lucide?.createIcons({ root: listEl });
    hydrateQuickRsvpButtons(listEl);
  }

  if (mobileEl) {
    mobileEl.innerHTML = items.length ? renderMobileFeaturedEvent(items[0]) : '';
    window.lucide?.createIcons({ root: mobileEl });
    hydrateQuickRsvpButtons(mobileEl);
  }
}
