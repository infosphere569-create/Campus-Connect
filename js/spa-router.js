// Campus Connect One - High-Performance Reactive Single Page App (SPA) Engine
// Delivers 0ms instant tab switching, persistent app shell, scroll state restoration,
// and 60fps hardware-accelerated animations (Instagram / WhatsApp native feel).

import { currentUser, currentProfile } from './auth.js';

// Pre-compiled In-Memory View Templates
// ZERO network fetch required when navigating between views in the PWA/App!
export const VIEW_TEMPLATES = {
  'home.html': `
    <div class="content-grid">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Campus overview</div>
            <h1 data-greeting>Good day</h1>
            <p class="muted">Here's what's happening around your campus.</p>
          </div>
        </div>
        <div class="quick-grid" style="grid-template-columns:1fr">
          <a class="quick-action primary" href="issues.html">
            <i data-lucide="shield-plus"></i>
            <span><strong>Raise anonymous issue</strong><small>Something on campus needs fixing? Your identity stays private.</small></span>
          </a>
        </div>
        <div data-home-content>
          <div class="stack" style="margin-top:16px">
            <div class="skeleton" style="height:170px"></div>
            <div class="skeleton" style="height:170px"></div>
          </div>
        </div>
      </section>
      <aside class="desktop-aside">
        <div class="card">
          <div class="section-title" style="margin-top:0">
            <h2>Upcoming</h2>
            <a class="muted-link small" href="events.html">See all</a>
          </div>
          <div data-event-list class="stack"></div>
        </div>
        <div class="card pulse-card" style="margin-top:14px;overflow:hidden">
          <div class="kicker">Campus pulse</div>
          <h3 style="margin-bottom:12px">Weekly Activity Trends</h3>
          <div id="campusPulseChart" style="width:100%;height:180px;position:relative">
            <div class="skeleton" style="height:100%;border-radius:8px"></div>
          </div>
          <div class="toolbar small muted" style="margin-top:12px;justify-content:space-between">
            <span><i data-lucide="trending-up"></i> New Posts</span>
            <span><i data-lucide="circle-alert"></i> Active Issues</span>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="kicker">Quick Action</div>
          <h3>Spotted a problem?</h3>
          <p class="small muted">Report it instantly — your identity stays anonymous.</p>
          <a class="btn sm" href="issues.html">Raise an issue</a>
        </div>
      </aside>
    </div>
  `,

  'feed.html': `
    <div class="content-grid">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Community pulse</div>
            <h1>Campus Feed</h1>
            <p class="muted">What students are talking about right now.</p>
          </div>
          <button class="btn primary" data-create-post><i data-lucide="pen-line"></i>Create post</button>
        </div>
        
        <div class="card feed-toolbar" style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;margin-bottom:14px">
          <div class="tabs" style="display:flex;gap:8px">
            <button class="tab active">For You</button>
            <button class="tab">Following</button>
            <button class="tab">Latest</button>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <span class="small muted hide-mobile"><i data-lucide="sparkles"></i> Personalized</span>
            <button class="btn icon ghost sm" id="refreshFeedBtn" title="Refresh Feed"><i data-lucide="refresh-cw"></i></button>
          </div>
        </div>

        <div class="stack" data-feed>
          <div class="card empty">
            <div class="btn-spinner"></div>
            <h3>Loading campus feed…</h3>
            <p class="muted">Connecting to Campus Connect One network</p>
          </div>
        </div>
        
        <button class="btn" id="loadMoreFeed" style="width:100%;margin-top:14px">Load more</button>
      </section>
      
      <aside class="desktop-aside">
        <div class="card">
          <div class="kicker">Discover</div>
          <h3>Trending communities</h3>
          <div class="link-grid">
            <a href="grouplist.html">Campus Coders <span>→</span></a>
            <a href="grouplist.html">Placement Prep <span>→</span></a>
            <a href="grouplist.html">Music Society <span>→</span></a>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="kicker">Community note</div>
          <p class="small muted">A good feed is useful, diverse and respectful. You can report content anytime.</p>
          <a class="btn sm" href="report.html">Report content</a>
        </div>
      </aside>
    </div>
  `,

  'grouplist.html': `
    <div class="content-grid no-aside">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Communities</div>
            <h1>Find your people.</h1>
            <p class="muted">Discover student groups built around interests, goals and campus life.</p>
          </div>
          <button class="btn primary" data-create-group><i data-lucide="plus"></i>Create group</button>
        </div>
        <div class="search-card">
          <i data-lucide="search"></i>
          <input id="groupSearch" autocomplete="off" placeholder="Search groups, interests or topics..." aria-label="Search groups">
        </div>
        <div class="chips" style="margin:14px 0">
          <button class="chip active" data-category="All">All</button>
          <button class="chip" data-category="Coding">Coding</button>
          <button class="chip" data-category="Placement">Placement</button>
          <button class="chip" data-category="Study">Study</button>
          <button class="chip" data-category="Music">Music</button>
          <button class="chip" data-category="Sports">Sports</button>
          <button class="chip" data-category="Gaming">Gaming</button>
          <button class="chip" data-category="Clubs">Clubs</button>
          <button class="chip" data-category="Department">Departments</button>
        </div>
        <div class="split section-title">
          <div>
            <h2>Discover communities</h2>
            <span class="small muted" data-group-count></span>
          </div>
        </div>
        <div class="grid grid-3" data-groups>
          <div class="skeleton" style="height:310px"></div>
          <div class="skeleton" style="height:310px"></div>
          <div class="skeleton" style="height:310px"></div>
        </div>
      </section>
    </div>
  `,

  'group.html': `
    <div class="content-grid">
      <section>
        <div class="group-hero card">
          <div class="group-hero-cover" data-group-cover>
            <label class="cover-label" id="coverUploadLabel" hidden>
              <input id="coverInput" type="file" accept="image/*" hidden>
              <span class="btn sm ghost" style="background:rgba(0,0,0,.4);color:#fff"><i data-lucide="camera"></i>Change cover</span>
            </label>
          </div>
          <div class="group-hero-body">
            <div class="group-avatar large" data-group-avatar>CC</div>
            <div class="split" style="align-items:flex-end">
              <div>
                <div class="kicker" data-group-category>Community</div>
                <h1 data-group-name>Community</h1>
                <p class="muted" data-group-description></p>
                <div class="small muted" data-member-count></div>
              </div>
              <div class="toolbar">
                <button class="btn" data-group-invite hidden><i data-lucide="link"></i>Invite</button>
                <button class="btn primary" data-group-join><i data-lucide="user-plus"></i>Join group</button>
              </div>
            </div>
          </div>
        </div>
        <div class="tabs card-tabs" data-group-tabs>
          <button class="tab active" data-gtab="chat">Chat</button>
          <button class="tab" data-gtab="discussion">Discussion</button>
          <button class="tab" data-gtab="members">Members</button>
          <button class="tab" data-gtab="about">About</button>
        </div>
        <div data-gtab-panel="chat">
          <div id="pinnedMessageBar" hidden></div>
          <div class="chat-window" id="chatWindow">
            <div class="skeleton" style="height:200px"></div>
          </div>
          <form id="chatForm" class="chat-composer">
            <input id="chatInput" maxlength="2000" autocomplete="off" placeholder="Message this group...">
            <button type="submit" class="btn icon primary" aria-label="Send"><i data-lucide="send"></i></button>
          </form>
          <label class="row small muted" id="broadcastOption" hidden style="gap:6px;margin-top:6px">
            <input type="checkbox" id="broadcastCheck"> Send as announcement to all members (notifies everyone)
          </label>
        </div>
        <div data-gtab-panel="discussion" hidden>
          <div class="section-title">
            <h2>Discussion</h2>
            <button class="btn sm" data-group-post><i data-lucide="pen-line"></i>Post</button>
          </div>
          <div class="stack" data-group-posts>
            <div class="skeleton" style="height:180px"></div>
          </div>
        </div>
        <div data-gtab-panel="members" hidden>
          <div id="leaderRequestsBox" hidden>
            <div class="section-title"><h2>Pending requests</h2></div>
            <div class="stack" data-group-pending-requests></div>
          </div>
          <div class="section-title"><h2>Members</h2></div>
          <div class="stack" data-members-main></div>
        </div>
        <div data-gtab-panel="about" hidden>
          <div class="card">
            <div class="kicker">Community rules</div>
            <h3>Keep it useful.</h3>
            <p class="small muted" data-group-rules>Be useful, respectful and on-topic.</p>
          </div>
        </div>
      </section>
    </div>
  `,

  'events.html': `
    <div class="content-grid no-aside">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Campus calendar</div>
            <h1>What's happening?</h1>
            <p class="muted">Discover workshops, clubs, competitions and campus moments.</p>
          </div>
          <div class="toolbar">
            <button class="btn primary" id="proposeEventBtn"><i data-lucide="calendar-plus"></i>Propose an event</button>
          </div>
        </div>
        <div class="section-title">
          <h2>Upcoming events</h2>
        </div>
        <div class="stack" id="eventList">
          <div class="skeleton" style="height:180px"></div>
          <div class="skeleton" style="height:180px"></div>
        </div>
      </section>
    </div>
  `,

  'issues.html': `
    <div class="content-grid">
      <section>
        <div class="issue-hero">
          <div class="eyebrow">CAMPUS ISSUE HUB</div>
          <div class="issue-hero-layout">
            <div>
              <h2>Something on campus needs fixing?</h2>
              <p class="muted">Raise a concern. Your identity stays private from the public community.</p>
              <button class="btn primary" data-raise-issue><i data-lucide="shield-plus"></i>Raise an anonymous issue</button>
            </div>
          </div>
        </div>
        <div class="section-title">
          <div>
            <div class="kicker">Community reports</div>
            <h2>Campus issues</h2>
          </div>
        </div>
        <div class="issue-filter-row">
          <div class="chips">
            <button class="chip issue-filter active" data-status="All">All</button>
            <button class="chip issue-filter" data-status="Open">Open</button>
            <button class="chip issue-filter" data-status="Under Review">Under Review</button>
            <button class="chip issue-filter" data-status="In Progress">In Progress</button>
            <button class="chip issue-filter" data-status="Resolved">Resolved</button>
          </div>
          <div class="issue-search">
            <i data-lucide="search"></i>
            <input id="issueSearch" autocomplete="off" placeholder="Search issues...">
          </div>
          <select id="issueCategory">
            <option>All</option>
            <option>Classroom</option>
            <option>Faculty</option>
            <option>Hostel</option>
            <option>Library</option>
            <option>Wi-Fi</option>
            <option>Infrastructure</option>
            <option>Transport</option>
            <option>Safety</option>
            <option>Canteen</option>
            <option>Academic</option>
          </select>
        </div>
        <div class="stack" style="margin-top:14px" data-issues>
          <div class="skeleton" style="height:220px"></div>
          <div class="skeleton" style="height:220px"></div>
        </div>
      </section>
      <aside class="desktop-aside">
        <div class="card">
          <div class="kicker">Privacy by design</div>
          <h2>Anonymous means anonymous.</h2>
          <p class="muted small">The public issue feed never requests the private author metadata.</p>
          <div class="danger-box small">Avoid putting your own name or identifying details inside the issue description.</div>
        </div>
      </aside>
    </div>
  `,

  'notifications.html': `
    <div class="content-grid no-aside">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Stay in the loop</div>
            <h1>Notifications</h1>
            <p class="muted">Updates from your communities and Campus Connect One.</p>
          </div>
          <button class="btn sm" id="markAllReadBtn">Mark all read</button>
        </div>
        <div class="card notification-tabs">
          <button class="tab active" data-ntab="All">All</button>
          <button class="tab" data-ntab="Mentions">Mentions</button>
          <button class="tab" data-ntab="Groups">Groups</button>
          <button class="tab" data-ntab="System">System</button>
        </div>
        <div class="notification-list" id="notificationList">
          <div class="skeleton" style="height:80px"></div>
          <div class="skeleton" style="height:80px"></div>
        </div>
      </section>
    </div>
  `,

  'profile.html': `
    <div class="content-grid">
      <section>
        <div class="surface" style="overflow:hidden">
          <div class="profile-cover"></div>
          <div class="profile-main">
            <div class="row" style="align-items:flex-end">
              <div class="avatar profile-avatar-lg" data-profile-avatar>AK</div>
              <div style="padding-bottom:2px">
                <h1 style="margin:0" data-profile-name>Student</h1>
                <div class="muted small" data-profile-academic>Student</div>
                <div class="muted small" id="profileCollege"></div>
                <div class="muted small" id="profileSection"></div>
              </div>
              <button class="btn" data-edit-profile style="margin-left:auto"><i data-lucide="pencil"></i>Edit profile</button>
            </div>
            <p class="muted" data-profile-bio style="margin-bottom:0"></p>
          </div>
        </div>
        <div class="profile-stat-grid">
          <div class="stat"><span class="muted small">Posts</span><strong data-stat-posts>—</strong></div>
          <div class="stat"><span class="muted small">Groups</span><strong data-stat-groups>—</strong></div>
          <div class="stat"><span class="muted small">Saved</span><strong data-stat-saved>—</strong></div>
        </div>
        <div class="card profile-logout-card" style="margin-top:14px;display:flex;align-items:center;justify-content:space-between">
          <div>
            <strong>Session & Account</strong>
            <div class="small muted">Sign out of Campus Connect One on this device</div>
          </div>
          <button class="btn danger sm" data-logout><i data-lucide="log-out"></i>Log out</button>
        </div>
        <div class="card-tabs" data-profile-tabs style="margin-top:14px">
          <button class="tab active" data-ptab="posts">Posts</button>
          <button class="tab" data-ptab="groups">Groups</button>
          <button class="tab" data-ptab="saved">Saved</button>
          <button class="tab" data-ptab="events">Events</button>
        </div>
        <div data-ptab-panel="posts" class="stack"><div class="skeleton" style="height:100px"></div></div>
        <div data-ptab-panel="groups" class="stack" hidden><div class="skeleton" style="height:100px"></div></div>
        <div data-ptab-panel="saved" class="stack" hidden><div class="skeleton" style="height:100px"></div></div>
        <div data-ptab-panel="events" class="stack" hidden><div class="skeleton" style="height:100px"></div></div>
      </section>
      <aside class="desktop-aside">
        <div class="card">
          <div class="kicker">Account overview</div>
          <h3>Your Campus Identity</h3>
          <p class="muted small">Your profile helps club leads and classmates connect with you across campus initiatives.</p>
        </div>
      </aside>
    </div>
  `,

  'saved.html': `
    <div class="content-grid no-aside">
      <section>
        <div class="page-head">
          <div>
            <div class="kicker">Bookmarks</div>
            <h1>Saved Posts</h1>
            <p class="muted">Access and review all discussions and updates you've bookmarked.</p>
          </div>
        </div>
        <div class="stack" id="savedPostsList">
          <div class="skeleton" style="height:100px"></div>
          <div class="skeleton" style="height:100px"></div>
        </div>
      </section>
    </div>
  `,

  'settings.html': `
    <div class="content-grid no-aside">
      <section class="narrow-content">
        <div class="page-head">
          <div>
            <div class="kicker">Preferences</div>
            <h1>Settings</h1>
            <p class="muted">Configure notifications, privacy and display preferences.</p>
          </div>
        </div>
        <div class="card">
          <form id="settingsForm" class="stack" style="gap:16px">
            <h3>Privacy</h3>
            <label>Profile visibility
              <select id="profileVisibility">
                <option value="campus">Campus</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label class="check-row"><input type="checkbox" id="showEmail"> Show email on profile</label>
            <h3>Notifications</h3>
            <label class="check-row"><input type="checkbox" id="likes"> Likes</label>
            <label class="check-row"><input type="checkbox" id="comments"> Comments</label>
            <label class="check-row"><input type="checkbox" id="groups"> Groups</label>
            <label class="check-row"><input type="checkbox" id="events"> Events</label>
            <br>
            <button class="btn primary">Save settings</button>
          </form>
        </div>
      </section>
    </div>
  `,

  'contact.html': `
    <div class="content-grid no-aside">
      <div class="contact-container" style="max-width:860px;margin:0 auto;padding-block:16px 40px">
        <div class="page-head" style="margin-bottom:24px">
          <div>
            <div class="kicker">SUPPORT & CAMPUS COMMUNITY</div>
            <h1 style="margin:4px 0 8px">Get in Touch</h1>
            <p class="muted" style="max-width:540px;line-height:1.6;margin:0">
              We're here to help the campus community. Reach out for platform support, bug reports, or student organization partnerships.
            </p>
          </div>
          <a href="mailto:support@campusconnectone.online" class="badge primary" style="padding:10px 18px;font-weight:700;display:inline-flex;align-items:center;gap:10px;text-decoration:none;border-radius:12px">
            <i data-lucide="mail"></i><span>support@campusconnectone.online</span>
          </a>
        </div>
        <div id="contactFormContainer">
          <div class="card" style="padding:32px">
            <form id="contactForm" class="form" style="gap:22px" novalidate>
              <div class="grid grid-2">
                <div class="field">
                  <label for="contactName">Full Name <span style="color:var(--danger)">*</span></label>
                  <input type="text" id="contactName" name="name" required placeholder="e.g. Rahul Sharma" autocomplete="name">
                </div>
                <div class="field">
                  <label for="contactEmail">Student Email <span style="color:var(--danger)">*</span></label>
                  <input type="email" id="contactEmail" name="email" required placeholder="name@college.edu" autocomplete="email">
                </div>
              </div>
              <div class="field">
                <label for="contactCategory">Subject / Category <span style="color:var(--danger)">*</span></label>
                <select id="contactCategory" name="category" required>
                  <option value="Technical Issue">Technical Issue</option>
                  <option value="Campus Community">Campus Community</option>
                  <option value="Bug Report">Bug Report</option>
                  <option value="General Inquiry">General Inquiry</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </div>
              <div class="field">
                <label for="contactMessage"><span>Message <span style="color:var(--danger)">*</span></span> <span class="hint" id="messageCharCount">Min 10 characters</span></label>
                <textarea id="contactMessage" name="message" required minlength="10" rows="5" placeholder="Please describe how we can help you with detail..."></textarea>
              </div>
              <div class="split" style="margin-top:8px;flex-wrap:wrap;gap:14px">
                <span class="small muted"><i data-lucide="info" style="width:16px;height:16px;vertical-align:middle;display:inline-block"></i> Forwards directly to <strong>support@campusconnectone.online</strong></span>
                <button type="submit" class="btn primary" id="contactSubmitBtn"><i data-lucide="send"></i><span>Send Message</span></button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `
};

// Title registry for instant seamless header updates
const PAGE_TITLES = {
  'home.html': 'Home · Campus Connect One',
  'feed.html': 'Campus Feed · Campus Connect One',
  'grouplist.html': 'Student Groups & Communities · Campus Connect One',
  'group.html': 'Community Group · Campus Connect One',
  'events.html': 'Campus Events & Activities · Campus Connect One',
  'issues.html': 'Campus Issues & Anonymous Reporting · Campus Connect One',
  'notifications.html': 'Notifications · Campus Connect One',
  'profile.html': 'Student Profile · Campus Connect One',
  'settings.html': 'Settings · Campus Connect One',
  'saved.html': 'Saved Posts · Campus Connect One',
  'contact.html': 'Contact Us · Campus Connect One'
};

// Scroll position memory (preserves exact feed scroll position like Instagram)
const SCROLL_MEMORY = new Map();
let currentActivePage = 'home.html';
let isNavigating = false;

// Cached controller modules (imported once, re-run instantly on tab switch)
const CONTROLLERS = {
  'home.html': async () => {
    const m = await import('./home.js');
    if (typeof m.load === 'function') m.load();
  },
  'feed.html': async () => {
    const m = await import('./feed.js');
    if (typeof m.loadPosts === 'function') m.loadPosts();
    else if (typeof m.load === 'function') m.load();
  },
  'grouplist.html': async () => {
    const m = await import('./groups.js');
    if (typeof m.load === 'function') m.load();
  },
  'group.html': async () => {
    const m = await import('./group.js');
    if (typeof m.load === 'function') m.load();
  },
  'events.html': async () => {
    const m = await import('./events.js');
    if (typeof m.load === 'function') m.load();
  },
  'issues.html': async () => {
    const m = await import('./issues.js');
    if (typeof m.load === 'function') m.load();
  },
  'notifications.html': async () => {
    const m = await import('./notifications.js');
    if (typeof m.load === 'function') m.load();
  },
  'profile.html': async () => {
    const m = await import('./profile.js');
    if (typeof m.load === 'function') m.load();
  },
  'settings.html': async () => {
    const m = await import('./settings-page.js');
    if (typeof m.load === 'function') m.load();
  },
  'contact.html': async () => {
    const m = await import('./contact.js');
    if (typeof m.initContactForm === 'function') m.initContactForm();
  },
  'saved.html': async () => {
    try {
      const { getSavedPosts } = await import('./data-layer.js');
      const { linkifyHtml, timeAgo, escapeHtml } = await import('./utils.js');
      const box = document.getElementById('savedPostsList');
      if (!box) return;
      const posts = await getSavedPosts();
      if (!posts || !posts.length) {
        box.innerHTML = `<div class="card empty" style="text-align:center;padding:40px 16px">
          <i data-lucide="bookmark"></i>
          <h3>No saved posts</h3>
          <p class="muted">When you see something helpful in your feed, tap "Save" to keep it here.</p>
          <a class="btn primary sm" href="feed.html" style="margin-top:12px">Explore feed</a>
        </div>`;
      } else {
        box.innerHTML = posts.map(p => `
          <article class="card post-card" data-post-id="${escapeHtml(p.id)}">
            <div class="split" style="margin-bottom:8px">
              <span class="badge primary">${escapeHtml(p.branch || p.college || 'Campus')}</span>
              <span class="small muted">${timeAgo(p.createdAt)}</span>
            </div>
            <div class="post-text">${linkifyHtml(p.text || '')}</div>
            ${p.imageURL ? `<img class="post-media" src="${escapeHtml(p.imageURL)}" alt="Post image" style="border-radius:12px;margin-top:8px;max-height:260px;object-fit:cover">` : ''}
            <div class="toolbar" style="margin-top:12px;justify-content:space-between">
              <span class="small muted">${p.likes || 0} likes · ${p.comments || 0} comments</span>
              <a class="btn sm" href="feed.html?post=${encodeURIComponent(p.id)}">Open discussion →</a>
            </div>
          </article>
        `).join('');
      }
      window.lucide?.createIcons({ root: box });
    } catch (e) {
      console.warn('Saved posts load notice:', e);
    }
  }
};

function normalizePageName(urlStr) {
  try {
    const url = new URL(urlStr, window.location.href);
    const path = url.pathname.split('/').pop() || 'home.html';
    const page = path.endsWith('.html') ? path : (path ? `${path}.html` : 'home.html');
    return page === '' ? 'home.html' : page;
  } catch (e) {
    return 'home.html';
  }
}

function updateActiveNav(pageName) {
  const pageKey = pageName.replace('.html', '').replace('grouplist', 'groups');
  const isMatch = (key) => pageKey === key || (key === 'groups' && pageKey === 'group');

  // Update Desktop Sidebar
  document.querySelectorAll('.side-nav .nav-item').forEach(el => {
    const href = el.getAttribute('href') || '';
    const key = href.replace('.html', '').replace('grouplist', 'groups');
    el.classList.toggle('active', isMatch(key));
  });

  // Update Mobile Bottom Navigation
  document.querySelectorAll('.bottom-nav a').forEach(el => {
    const href = el.getAttribute('href') || '';
    const key = href.replace('.html', '').replace('grouplist', 'groups');
    el.classList.toggle('active', isMatch(key));
  });
}

// 0ms Instant View Transition Function
export async function navigateTo(urlStr, pushHistory = true) {
  if (isNavigating) return;
  
  const targetUrl = new URL(urlStr, window.location.href);
  const targetPage = normalizePageName(urlStr);

  // Leave SPA for auth or external landing pages
  const EXTERNAL_PAGES = ['index.html', 'login.html', 'onboarding.html', 'about.html', 'privacy.html', 'terms.html', 'safety.html', 'institutional.html', 'student-life.html'];
  if (EXTERNAL_PAGES.includes(targetPage) || targetUrl.origin !== window.location.origin) {
    window.location.href = urlStr;
    return;
  }

  const slot = document.querySelector('[data-shell-slot]');
  if (!slot) {
    // If shell not rendered yet, allow direct load
    window.location.href = urlStr;
    return;
  }

  isNavigating = true;

  try {
    // 1. Save scroll position of current active page
    SCROLL_MEMORY.set(currentActivePage, window.scrollY);

    // 2. Fetch in-memory template (0ms instant!)
    let template = VIEW_TEMPLATES[targetPage];
    if (!template) {
      // Fallback: fetch over HTTP if non-standard page
      try {
        const resp = await fetch(targetUrl.pathname, { credentials: 'same-origin' });
        if (resp.ok) {
          const text = await resp.text();
          const doc = new DOMParser().parseFromString(text, 'text/html');
          const extracted = doc.querySelector('[data-app-main]') || doc.querySelector('main');
          if (extracted) {
            template = extracted.innerHTML;
            VIEW_TEMPLATES[targetPage] = template;
          }
        }
      } catch (err) {
        console.warn('Fallback fetch warning:', err);
      }
    }

    if (!template) {
      window.location.href = urlStr;
      return;
    }

    // 3. Update Browser URL and History
    if (pushHistory) {
      history.pushState({ page: targetPage }, '', targetUrl.pathname + targetUrl.search);
    }

    // 4. Update Document Title & Body Page Key
    const title = PAGE_TITLES[targetPage] || 'Campus Connect One';
    document.title = title;
    const pageKey = targetPage.replace('.html', '').replace('grouplist', 'groups');
    document.body.dataset.page = pageKey;
    currentActivePage = targetPage;

    // 5. Update Navigation Tabs Active Pill
    updateActiveNav(targetPage);

    // 6. Smooth Hardware-Accelerated View Replacement
    slot.innerHTML = template;
    slot.classList.remove('spa-view-enter');
    void slot.offsetWidth; // Trigger reflow for instantaneous CSS animation
    slot.classList.add('spa-view-enter');

    // 7. Refresh Lucide Icons inside active slot
    window.lucide?.createIcons({ root: slot });

    // 8. Restore Scroll Position or scroll to top
    const savedScroll = SCROLL_MEMORY.get(targetPage);
    if (savedScroll !== undefined && targetPage === 'feed.html') {
      window.scrollTo({ top: savedScroll, behavior: 'instant' });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // 9. Run View Controller Logic (0ms data population)
    const controller = CONTROLLERS[targetPage];
    if (controller) {
      controller().catch(err => console.warn(`[SPA Controller] ${targetPage} load warning:`, err));
    }

  } catch (err) {
    console.warn('[SPA Navigation] Error during transition, fallback to link:', err);
    window.location.href = urlStr;
  } finally {
    isNavigating = false;
  }
}

// Global SPA Click and History Listener
export function initSPARouter() {
  if (window.__spaRouterInitialized) return;
  window.__spaRouterInitialized = true;

  // Set current initial page
  currentActivePage = normalizePageName(window.location.href);
  updateActiveNav(currentActivePage);

  // Intercept all internal navigation clicks
  document.addEventListener('click', (e) => {
    // Ignore middle-clicks, cmd/ctrl clicks, or already prevented clicks
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    if (link.hasAttribute('download') || link.getAttribute('target') === '_blank') return;

    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const pageName = normalizePageName(url.pathname);

      // If page is an internal SPA view, navigate smoothly in 0ms!
      if (pageName in VIEW_TEMPLATES) {
        e.preventDefault();
        navigateTo(href, true);
      }
    } catch (err) {}
  });

  // Handle browser back and forward buttons
  window.addEventListener('popstate', (e) => {
    navigateTo(window.location.href, false);
  });
}
