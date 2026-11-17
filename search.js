// Campus Connect One - Client-Side Search Indexing Engine
// Fast, real-time searchable content mapping for Clubs, Events, and Campus Issues.

import { db } from './js/firebase.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

// Pre-indexed JSON dataset mapping campus content to their respective URLs
export const SEARCH_INDEX = {
  clubs: [
    { title: "Campus Coders", category: "Club", url: "grouplist.html?q=coders", desc: "Coding club, competitive programming, and hackathon teams." },
    { title: "Placement & Career Cell", category: "Club", url: "grouplist.html?q=placement", desc: "Mock interviews, resume clinics, and campus recruitment guides." },
    { title: "Music & Acoustic Society", category: "Club", url: "grouplist.html?q=music", desc: "Jamming sessions, inter-college music competitions, and audio production." },
    { title: "Robotics & IoT Lab", category: "Club", url: "grouplist.html?q=robotics", desc: "Hardware development, drones, microcontrollers, and automation." },
    { title: "Design & UX Collective", category: "Club", url: "grouplist.html?q=design", desc: "Figma workshops, graphic design, and UI/UX product sprints." },
    { title: "Sports & Athletics Council", category: "Club", url: "grouplist.html?q=sports", desc: "Cricket, football, badminton, and annual campus athletics meet." },
    { title: "Debate & Literary Society", category: "Club", url: "grouplist.html?q=debate", desc: "Model UN, parliamentary debate, and creative writing circles." }
  ],
  events: [
    { title: "Campus Hacknight 2026", category: "Event", url: "events.html", desc: "48-hour prototype sprint across Web, AI, and Hardware tracks." },
    { title: "Placement Talk: Tech Career Roadmap", category: "Event", url: "events.html", desc: "Auditorium A session with visiting alumni engineers and tech leads." },
    { title: "Annual Cultural Fest Auditions", category: "Event", url: "events.html", desc: "Stage auditions for music, choreography, and campus theatre." },
    { title: "AI Workshop & Generative Models", category: "Event", url: "events.html", desc: "Hands-on modern AI tool integration workshop for students." },
    { title: "Inter-Branch Cricket Championship", category: "Event", url: "events.html", desc: "Weekend tournament at the campus main sports ground." }
  ],
  issues: [
    { title: "Wi-Fi in Block A & Hostels", category: "Issue", url: "issues.html", desc: "Signal strength and intermittent connectivity in study blocks." },
    { title: "Library Extended Study Hours", category: "Issue", url: "issues.html", desc: "Request to extend silent reading room access until midnight during exams." },
    { title: "Science Wing Water Dispenser Maintenance", category: "Issue", url: "issues.html", desc: "Filter overhaul request for 2nd floor laboratory corridor." },
    { title: "Evening Shuttle Timing Realignment", category: "Issue", url: "issues.html", desc: "Shuttle departure synchronization with 5:30 PM lab completion." },
    { title: "Canteen Food Quality & Variety", category: "Issue", url: "issues.html", desc: "Student feedback on lunch hour menu diversity and hygiene standards." }
  ]
};

// Flattened in-memory cache and live database sync
let dynamicIndex = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

export async function getSearchIndex() {
  const now = Date.now();
  if (dynamicIndex && (now - lastCacheUpdate < CACHE_DURATION)) {
    return dynamicIndex;
  }

  // Start with default verified campus index
  const items = [
    ...SEARCH_INDEX.clubs,
    ...SEARCH_INDEX.events,
    ...SEARCH_INDEX.issues
  ];

  // If Firebase is available, dynamically merge live community data
  if (db) {
    try {
      const [groupsSnap, eventsSnap, issuesSnap] = await Promise.all([
        getDocs(collection(db, "groups")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "events")).catch(() => ({ docs: [] })),
        getDocs(collection(db, "issues")).catch(() => ({ docs: [] }))
      ]);

      const seenUrls = new Set(items.map(i => i.url));

      groupsSnap.docs?.forEach(d => {
        const data = d.data();
        const url = `group.html?id=${encodeURIComponent(d.id)}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({
            title: data.name || data.title || "Campus Community",
            category: "Club",
            url,
            desc: data.description || "Active student campus community."
          });
        }
      });

      eventsSnap.docs?.forEach(d => {
        const data = d.data();
        const url = `events.html?id=${encodeURIComponent(d.id)}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({
            title: data.title || "Campus Event",
            category: "Event",
            url,
            desc: data.venue ? `At ${data.venue} · ${data.description || 'Campus activity'}` : (data.description || "Campus event")
          });
        }
      });

      issuesSnap.docs?.forEach(d => {
        const data = d.data();
        const url = `issues.html?id=${encodeURIComponent(d.id)}`;
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({
            title: data.title || "Campus Issue",
            category: "Issue",
            url,
            desc: data.description || "Community-reported campus concern."
          });
        }
      });
    } catch (err) {
      console.warn("[Search] Firestore live sync notice (using pre-indexed dataset):", err);
    }
  }

  dynamicIndex = items;
  lastCacheUpdate = now;
  return dynamicIndex;
}

// Search algorithm: Ranked matching across title, category, and description
export async function searchContent(queryStr, activeCategory = 'All') {
  const q = String(queryStr || "").trim().toLowerCase();
  if (!q) return [];

  const index = await getSearchIndex();

  return index
    .filter(item => {
      if (activeCategory !== 'All' && item.category !== activeCategory) {
        return false;
      }
      const title = (item.title || "").toLowerCase();
      const desc = (item.desc || "").toLowerCase();
      const cat = (item.category || "").toLowerCase();
      return title.includes(q) || desc.includes(q) || cat.includes(q);
    })
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      // Prioritize title exact or prefix matches
      if (aTitle === q) return -1;
      if (bTitle === q) return 1;
      if (aTitle.startsWith(q) && !bTitle.startsWith(q)) return -1;
      if (!aTitle.startsWith(q) && bTitle.startsWith(q)) return 1;
      return 0;
    })
    .slice(0, 10);
}

// Helper: Escape HTML strings for safe dropdown rendering
function escapeHtml(str) {
  return String(str || "").replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// Icon mapping per category
function getCategoryIcon(cat) {
  switch (cat) {
    case 'Club':
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    case 'Event':
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    case 'Issue':
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  }
}

// Category badge color class
function getCategoryBadgeClass(cat) {
  switch (cat) {
    case 'Club': return 'cat-badge-club';
    case 'Event': return 'cat-badge-event';
    case 'Issue': return 'cat-badge-issue';
    default: return 'cat-badge-default';
  }
}

// Highlight matched substring
function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escapedText = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapedText.replace(regex, '<mark class="search-match">$1</mark>');
}

// Self-initializing Dropdown Controller for index.html Header
export function initHeaderSearch(options = {}) {
  const input = document.getElementById(options.inputId || 'landingSearchInput');
  const dropdown = document.getElementById(options.dropdownId || 'landingSearchResults');
  const wrapper = document.getElementById(options.wrapperId || 'headerSearchWrap');
  if (!input || !dropdown) return;

  let activeCategory = 'All';
  let debounceTimer = null;
  let activeIndex = -1;
  let currentResults = [];

  async function renderResults() {
    const query = input.value.trim();
    if (query.length < 1) {
      dropdown.hidden = true;
      dropdown.innerHTML = '';
      activeIndex = -1;
      return;
    }

    dropdown.hidden = false;
    dropdown.innerHTML = `
      <div class="search-dropdown-loading">
        <span class="btn-spinner"></span>
        <span>Searching clubs, events, and issues...</span>
      </div>
    `;

    currentResults = await searchContent(query, activeCategory);

    // Build filter tabs
    const categories = ['All', 'Club', 'Event', 'Issue'];
    const filterTabs = `
      <div class="search-dropdown-header">
        <span class="search-dropdown-count">${currentResults.length} ${currentResults.length === 1 ? 'match' : 'matches'}</span>
        <div class="search-dropdown-tabs">
          ${categories.map(cat => `
            <button type="button" class="search-cat-tab ${activeCategory === cat ? 'active' : ''}" data-cat="${cat}">
              ${cat === 'All' ? 'All' : cat + 's'}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    if (!currentResults.length) {
      dropdown.innerHTML = `
        ${filterTabs}
        <div class="search-dropdown-empty">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <div class="search-empty-title">No results found for "${escapeHtml(query)}"</div>
          <div class="search-empty-desc">Try checking spelling or switching categories to find what you're looking for.</div>
        </div>
      `;
      wireCategoryTabs();
      return;
    }

    const itemsList = currentResults.map((item, idx) => `
      <a href="${escapeHtml(item.url)}" class="search-dropdown-item ${idx === activeIndex ? 'is-selected' : ''}" data-index="${idx}">
        <span class="search-item-icon ${getCategoryBadgeClass(item.category)}">
          ${getCategoryIcon(item.category)}
        </span>
        <div class="search-item-content">
          <div class="search-item-title-row">
            <span class="search-item-title">${highlightMatch(item.title, query)}</span>
            <span class="search-item-badge ${getCategoryBadgeClass(item.category)}">${escapeHtml(item.category)}</span>
          </div>
          <div class="search-item-desc">${highlightMatch(item.desc, query)}</div>
        </div>
        <span class="search-item-arrow" aria-hidden="true">→</span>
      </a>
    `).join('');

    dropdown.innerHTML = `
      ${filterTabs}
      <div class="search-dropdown-list" role="listbox">
        ${itemsList}
      </div>
      <div class="search-dropdown-footer">
        <span class="search-footer-hint"><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
        <span class="search-footer-hint"><kbd>↵</kbd> to select</span>
        <span class="search-footer-hint"><kbd>esc</kbd> to close</span>
      </div>
    `;

    wireCategoryTabs();
  }

  function wireCategoryTabs() {
    dropdown.querySelectorAll('.search-cat-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        activeCategory = tab.dataset.cat;
        renderResults();
      });
    });
  }

  // Input event with debounce
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderResults, 120);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 1) {
      renderResults();
    }
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    if (dropdown.hidden || !currentResults.length) {
      if (e.key === 'Escape') {
        input.blur();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentResults.length;
      updateActiveItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
      updateActiveItem();
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < currentResults.length) {
        e.preventDefault();
        window.location.href = currentResults[activeIndex].url;
      }
    } else if (e.key === 'Escape') {
      dropdown.hidden = true;
      input.blur();
    }
  });

  function updateActiveItem() {
    dropdown.querySelectorAll('.search-dropdown-item').forEach((item, idx) => {
      item.classList.toggle('is-selected', idx === activeIndex);
      if (idx === activeIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Click outside to dismiss
  document.addEventListener('click', (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.hidden = true;
    }
  });

  // Global hotkey: press '/' or 'Ctrl+K' / 'Cmd+K' to focus search
  document.addEventListener('keydown', (e) => {
    if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'k')) &&
        document.activeElement !== input &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
}

// Auto-run when imported in index.html
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initHeaderSearch());
  } else {
    initHeaderSearch();
  }
}
