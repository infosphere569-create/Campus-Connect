import { getSavedPosts, getMyGroups, getMyEventInterest } from "./data-layer.js";
import { getMyReposts, uploadImage } from "./services.js";
import './theme.js';
import { db } from './firebase.js';
import { subscribeAuth, requireAuth, currentProfile, currentUser } from './auth.js';
import { doc, updateDoc, deleteDoc, serverTimestamp, collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import { $, escapeHtml, linkifyHtml, initials, timeAgo, toast, showModal } from './utils.js';

let profile;

function render(p) {
  profile = p;
  $('[data-profile-name]').textContent = p.displayName || 'Student';
  $('[data-profile-bio]').textContent = p.bio || 'Part of the Campus Connect One community.';
  $('[data-profile-avatar]').innerHTML = p.photoURL ? `<img src="${escapeHtml(p.photoURL)}" alt="Profile photo">` : escapeHtml(initials(p.displayName));
  $('[data-profile-academic]').textContent = [p.course, p.branch, p.year].filter(Boolean).join(' • ') || 'Student';
  $('#profileCollege').textContent = p.college || 'Nitra Technical Campus';
  const sectionEl = $('#profileSection');
  if (sectionEl) sectionEl.textContent = p.section ? `Section ${p.section}` : '';
}

function edit() {
  showModal('Edit profile', `<form class="form" id="profileForm">
    <div class="field"><label>Name</label><input name="displayName" value="${escapeHtml(profile.displayName || '')}" required></div>
    <div class="field"><label>College / Institution</label><input name="college" value="${escapeHtml(profile.college || 'Nitra Technical Campus')}" required placeholder="e.g. Nitra Technical Campus"></div>
    <div class="field"><label>Bio</label><textarea name="bio" maxlength="250">${escapeHtml(profile.bio || '')}</textarea></div>
    <div class="field"><label>Profile photo</label><input id="profilePhoto" type="file" accept="image/*"><div id="profileUploadStatus" class="small muted">Use a clear image under 8 MB.</div></div>
    <div class="grid grid-2">
      <div class="field"><label>Course</label><input name="course" value="${escapeHtml(profile.course || 'B.Tech')}"></div>
      <div class="field"><label>Branch</label><input name="branch" value="${escapeHtml(profile.branch || 'CSE')}"></div>
      <div class="field"><label>Year</label><input name="year" value="${escapeHtml(profile.year || '1st Year')}"></div>
      <div class="field"><label>Section</label><input name="section" value="${escapeHtml(profile.section || 'A')}"></div>
    </div>
    <div style="text-align:right"><button class="btn primary" type="submit">Save changes</button></div>
  </form>`);

  $('#profileForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    btn.disabled = true;
    const fd = new FormData(e.currentTarget);
    try {
      let photoURL = profile.photoURL || '';
      const file = $('#profilePhoto').files[0];
      if (file) {
        try {
          photoURL = await uploadImage(file, `users/${currentUser.uid}/avatar-${Date.now()}`, p => $('#profileUploadStatus').textContent = `Uploading… ${p}%`);
        } catch (upErr) {
          console.warn('Avatar upload fallback:', upErr);
        }
      }
      const collegeName = String(fd.get('college') || 'Nitra Technical Campus').trim();
      const values = {
        displayName: String(fd.get('displayName')).trim(),
        college: collegeName,
        collegeKey: collegeName.toLowerCase(),
        bio: String(fd.get('bio') || '').trim(),
        course: String(fd.get('course') || '').trim(),
        branch: String(fd.get('branch') || '').trim(),
        year: String(fd.get('year') || '').trim(),
        section: String(fd.get('section') || '').trim(),
        photoURL,
        updatedAt: serverTimestamp()
      };
      if (db && currentUser?.uid && currentUser.uid !== 'demo-user') {
        await updateDoc(doc(db, 'users', profile.uid), values);
      }
      Object.assign(profile, values);
      render(profile);
      document.querySelector('.modal-backdrop')?.remove();
      toast('Profile updated');
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  });
}

function empty(icon, title, body) {
  return `<div class="card empty"><i data-lucide="${icon}"></i><h3>${title}</h3><p class="muted">${body}</p></div>`;
}

const DEMO_SAVED = [
  { id: 'demo-p-1', text: 'Central Library silent reading room schedule during exam month.', createdAt: new Date(Date.now() - 3600000 * 5) }
];

const DEMO_GROUPS = [
  { id: 'demo-grp-coders', name: 'Campus Coders', category: 'Coding' },
  { id: 'demo-grp-placement', name: 'Placement Prep 2026', category: 'Placement' }
];

async function loadPosts() {
  const box = $('[data-ptab-panel="posts"]');
  if (!box) return;
  let posts = [];
  if (db && currentUser?.uid && currentUser.uid !== 'demo-user') {
    try {
      const [snap, reposts] = await Promise.all([
        getDocs(query(collection(db, 'posts'), where('authorId', '==', currentUser.uid), orderBy('createdAt', 'desc'), limit(30))),
        getMyReposts(currentUser.uid).catch(() => [])
      ]);
      posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const combined = [...posts, ...reposts].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      $('[data-stat-posts]').textContent = combined.length;

      box.innerHTML = combined.length ? combined.map(p => `
        <article class="card post-card" data-post-id="${p.id}">
          ${p._reposted ? `<div class="small muted row" style="gap:4px;margin-bottom:6px"><i data-lucide="repeat-2"></i>You reposted</div>` : ''}
          <div class="split" style="margin-bottom:8px">
            <div class="row" style="gap:8px">
              <span class="badge primary">${escapeHtml(profile?.college || 'Nitra Technical Campus')}</span>
              <span class="small muted">${timeAgo(p.createdAt)}</span>
            </div>
            ${!p._reposted ? `<button class="btn icon ghost danger sm" data-delete-my-post="${p.id}" title="Delete post"><i data-lucide="trash-2"></i></button>` : ''}
          </div>
          <div class="post-text">${linkifyHtml(p.text || '')}</div>
          ${p.imageURL ? `<img class="post-media" src="${escapeHtml(p.imageURL)}" alt="Post image">` : ''}
          <div class="small muted" style="margin-top:8px">${p.likes || 0} likes · ${p.comments || 0} comments</div>
        </article>
      `).join('') : empty('pen-line', 'No posts yet', 'Share your first update with your campus.');
      window.lucide?.createIcons();
      return;
    } catch (e) {
      console.warn('Error loading posts:', e);
    }
  }

  $('[data-stat-posts]').textContent = '1';
  box.innerHTML = `
    <article class="card post-card">
      <div class="split" style="margin-bottom:8px">
        <div class="row" style="gap:8px">
          <span class="badge primary">${escapeHtml(profile?.college || 'Nitra Technical Campus')}</span>
          <span class="small muted">Just now</span>
        </div>
      </div>
      <div class="post-text">Excited to be using Campus Connect One for college collaboration!</div>
      <div class="small muted" style="margin-top:8px">4 likes · 1 comment</div>
    </article>
  `;
  window.lucide?.createIcons();
}

async function loadGroups() {
  const box = $('[data-ptab-panel="groups"]');
  if (!box) return;
  let groups = [];
  if (db && currentUser?.uid && currentUser.uid !== 'demo-user') {
    try {
      groups = await getMyGroups();
    } catch (e) {}
  }
  if (!groups.length) groups = DEMO_GROUPS;
  $('[data-stat-groups]').textContent = groups.length;
  box.innerHTML = groups.length ? groups.map(g => `<a class="card" href="group.html?id=${encodeURIComponent(g.id)}"><strong>${escapeHtml(g.name || 'Group')}</strong><div class="small muted">${escapeHtml(g.category || '')}</div></a>`).join('') : empty('users-round', 'No groups yet', 'Join a community from the Groups tab.');
  window.lucide?.createIcons();
}

async function loadSaved() {
  const box = $('[data-ptab-panel="saved"]');
  if (!box) return;
  let posts = [];
  if (db && currentUser?.uid && currentUser.uid !== 'demo-user') {
    try {
      posts = await getSavedPosts();
    } catch (e) {}
  }
  if (!posts.length) posts = DEMO_SAVED;
  $('[data-stat-saved]').textContent = posts.length;
  box.innerHTML = posts.length ? posts.map(p => `<article class="card post-card"><div class="post-text">${linkifyHtml(p.text || '')}</div><div class="small muted" style="margin-top:8px">${timeAgo(p.createdAt)}</div></article>`).join('') : empty('bookmark', 'No saved posts', 'Tap Save on a post in the feed to keep it here.');
  window.lucide?.createIcons();
}

async function loadEvents() {
  const box = $('[data-ptab-panel="events"]');
  if (!box) return;
  let events = [];
  if (db && currentUser?.uid && currentUser.uid !== 'demo-user') {
    try {
      events = await getMyEventInterest();
    } catch (e) {}
  }
  if (!events.length) events = [{ id: 'demo-ev-1', title: 'Campus Hacknight 2026', venue: 'Main Lab Block B' }];
  box.innerHTML = events.length ? events.map(e => `<a class="card" href="events.html"><strong>${escapeHtml(e.title || 'Event')}</strong><div class="small muted">${escapeHtml(e.venue || '')}</div></a>`).join('') : empty('calendar-days', 'No events yet', 'Mark yourself interested in an event to see it here.');
  window.lucide?.createIcons();
}

const tabLoaders = { posts: loadPosts, groups: loadGroups, saved: loadSaved, events: loadEvents };
const loadedTabs = new Set();
function activateTab(name) {
  for (const btn of document.querySelectorAll('[data-profile-tabs] .tab')) btn.classList.toggle('active', btn.dataset.ptab === name);
  for (const panel of document.querySelectorAll('[data-ptab-panel]')) panel.hidden = panel.dataset.ptabPanel !== name;
  if (!loadedTabs.has(name)) { loadedTabs.add(name); tabLoaders[name]?.(); }
}

document.addEventListener('click', async e => {
  if (e.target.closest('[data-edit-profile]')) edit();
  
  const delBtn = e.target.closest('[data-delete-my-post]');
  if (delBtn) {
    const postId = delBtn.dataset.deleteMyPost;
    if (confirm('Are you sure you want to delete this post?')) {
      try {
        if (db && postId) {
          await deleteDoc(doc(db, 'posts', postId));
        }
        toast('Post deleted successfully');
        loadPosts();
      } catch (err) {
        toast(err.message || 'Could not delete post', 'error');
      }
    }
    return;
  }

  const tabBtn = e.target.closest('[data-profile-tabs] .tab');
  if (tabBtn) activateTab(tabBtn.dataset.ptab);
});

subscribeAuth((u, p) => {
  if (!requireAuth()) return;
  render(p);
  activateTab('posts');
  loadGroups();
  loadSaved();
});
