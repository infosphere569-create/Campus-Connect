import './theme.js';
import {db} from './firebase.js';
import {doc,getDoc,updateDoc,deleteDoc,increment,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {subscribeAuth,requireAuth,currentProfile,currentUser} from './auth.js';
import {getLatestPosts,createPost,togglePostLike,getPostComments,addComment,editComment,deleteComment,toggleSave,toggleRepost,uploadImage} from './services.js';
import {paginatePosts} from './content-actions.js';
import { $, $$, escapeHtml, linkifyHtml, initials, timeAgo, toast, showModal, isDemo, getQuery, isSameInstitution } from './utils.js';
import {observeLazyImages} from './performance.js';
import {rankPosts} from './algorithm.js';

let profile;
let allFetchedPosts = [];
let activeTab = 'For You';
let feedCursor = null, feedLoading = false, feedExhausted = false;

const FALLBACK_POSTS = [
  {
    id: 'demo-post-1',
    authorName: 'Aarav Sharma',
    authorId: 'demo-aarav',
    branch: 'CSE',
    college: 'NITRA Technical Campus',
    text: 'Building a student team for the National Smart India Hackathon! We need someone proficient with React / Node.js and UI/UX design. Drop a comment if interested!',
    likes: 38,
    comments: 12,
    reposts: 4,
    shares: 6,
    saves: 9,
    createdAt: new Date(Date.now() - 3600000 * 2)
  },
  {
    id: 'demo-post-2',
    authorName: 'Sneha Verma',
    authorId: 'demo-sneha',
    branch: 'ECE',
    college: 'NITRA Technical Campus',
    text: 'Reminder: The Central Library silent reading room is extending its hours until 10 PM starting this Monday for mid-term preparations.',
    likes: 54,
    comments: 7,
    reposts: 2,
    shares: 8,
    saves: 15,
    createdAt: new Date(Date.now() - 3600000 * 5)
  },
  {
    id: 'demo-post-3',
    authorName: 'Campus Placement Cell',
    authorId: 'official-placement',
    role: 'platformAdmin',
    branch: 'Career Development',
    college: 'NITRA Technical Campus',
    text: 'Upcoming campus drive: Tech Mahindra and TCS aptitude screening registrations close tonight at 11:59 PM. Make sure your resume is updated in your profile!',
    likes: 89,
    comments: 26,
    reposts: 19,
    shares: 32,
    saves: 44,
    createdAt: new Date(Date.now() - 3600000 * 8)
  }
];

function postTemplate(p){
  const liked = Boolean(p._liked);
  const saved = Boolean(p._saved);
  const reposted = Boolean(p._reposted);
  const sameCollege = p.college && profile?.college && isSameInstitution(p.college, profile.college);

  return `<article class="card post-card" data-post-id="${escapeHtml(p.id||'')}" data-author-id="${escapeHtml(p.authorId||'')}">
    <div class="post-head">
      <div class="avatar">${p.photoURL?`<img data-src="${escapeHtml(p.photoURL)}" alt="" loading="lazy" decoding="async">`:initials(p.authorName)}</div>
      <div class="post-meta">
        <strong>${escapeHtml(p.authorName||'Campus Student')}${p.role==='platformAdmin'?` <span class="badge primary">Official</span>`:''}</strong>
        <span>${escapeHtml(p.branch||'Student')}${p.college?` · ${escapeHtml(p.college)}`:''} · ${timeAgo(p.createdAt)}</span>
      </div>
      ${sameCollege?'<span class="badge success" style="flex:0 0 auto">Your campus</span>':''}
      <button class="btn icon ghost" data-post-menu aria-label="More post actions"><i data-lucide="more-horizontal"></i></button>
    </div>
    <div class="post-text" data-raw="${escapeHtml(p.text||'')}">${linkifyHtml(p.text||'')}</div>
    ${p.imageURL?`<img class="post-media" data-src="${escapeHtml(p.imageURL)}" alt="Post image" loading="lazy" decoding="async">`:''}
    <div class="post-actions">
      <button class="action ${liked?'active':''}" data-like><i data-lucide="heart"></i><span>${p.likes||0}</span></button>
      <button class="action" data-comment><i data-lucide="message-circle"></i><span>${p.comments||0}</span></button>
      <button class="action ${reposted?'active':''}" data-repost><i data-lucide="repeat-2"></i><span>${p.reposts||0}</span></button>
      <button class="action" data-share><i data-lucide="share-2"></i>Share</button>
      <button class="action ${saved?'active':''}" data-save><i data-lucide="bookmark"></i><span>${saved?'Saved':'Save'}</span></button>
    </div>
  </article>`;
}

function emptyState(icon,title,body){
  return `<div class="card empty" id="feedEmpty"><i data-lucide="${icon}"></i><h3>${title}</h3><p class="muted">${body}</p></div>`;
}

function renderActivePosts(){
  const box = $('[data-feed]');
  if (!box) return;

  let filtered = [...allFetchedPosts];
  if (activeTab === 'Following') {
    filtered = filtered.filter(p => isSameInstitution(p.college, profile?.college) || p.authorId === currentUser?.uid || p.role === 'platformAdmin');
    if (!filtered.length) filtered = allFetchedPosts.slice(0, 5);
  } else if (activeTab === 'Latest') {
    filtered.sort((a,b) => (b.createdAt?.toMillis?.() || new Date(b.createdAt).getTime() || 0) - (a.createdAt?.toMillis?.() || new Date(a.createdAt).getTime() || 0));
  } else {
    // For You
    filtered = rankPosts(filtered, profile || {});
  }

  if (!filtered.length) {
    box.innerHTML = emptyState('pen-line', 'No posts yet', 'Be the first to share an update, question or idea with your campus.');
  } else {
    box.innerHTML = filtered.map(postTemplate).join('');
  }
  window.lucide?.createIcons();
  observeLazyImages(box);
}

async function loadPosts(){
  const box = $('[data-feed]');
  feedCursor = null;
  feedExhausted = false;
  const loadMoreBtn = document.getElementById('loadMoreFeed');
  if(loadMoreBtn){ loadMoreBtn.disabled = false; loadMoreBtn.textContent = 'Load more'; loadMoreBtn.hidden = false; }

  let items = [];
  if (db) {
    try {
      const page = await paginatePosts(20, null);
      feedCursor = page.lastDoc;
      feedExhausted = !page.hasMore;
      items = page.items;
    } catch(e) {
      console.warn('Feed load error:', e);
      items = FALLBACK_POSTS;
    }
  }
  if (!items.length) {
    items = FALLBACK_POSTS;
  }

  allFetchedPosts = items;
  renderActivePosts();

  if(loadMoreBtn && feedExhausted){ loadMoreBtn.textContent = 'No more posts'; loadMoreBtn.disabled = true; }

  // Deep link post check
  const targetPostId = getQuery('post');
  if (targetPostId) {
    setTimeout(() => {
      const el = document.querySelector(`[data-post-id="${targetPostId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid var(--primary)';
        setTimeout(() => el.style.outline = '', 3000);
      }
      openComments(targetPostId);
    }, 400);
  }
}

function composer(){
  showModal('Create a post', `<form class="form" id="postForm">
    <div class="composer-row">
      <div class="avatar">${initials(profile?.displayName)}</div>
      <textarea name="text" id="postText" required maxlength="2000" rows="6" style="min-height:160px" placeholder="Share an update, ask a question or start a discussion..."></textarea>
    </div>
    <label class="upload-box" id="uploadBox">
      <input id="postImage" type="file" accept="image/*" hidden>
      <i data-lucide="image"></i><span id="uploadLabel">Add a photo</span>
    </label>
    <div id="uploadPreviewWrap"></div>
    <div id="uploadStatus" class="small muted"></div>
    <div class="notice small">Keep posts useful and respectful. Report content that breaks community guidelines.</div>
    <div class="toolbar" style="justify-content:flex-end">
      <button class="btn primary" type="submit"><i data-lucide="send"></i>Publish post</button>
    </div>
  </form>`, { wide: true });
  window.lucide?.createIcons();

  $('#postImage')?.addEventListener('change', () => {
    const file = $('#postImage').files[0];
    if(!file) return;
    $('#uploadLabel').textContent = file.name;
    const reader = new FileReader();
    reader.onload = ev => {
      $('#uploadPreviewWrap').innerHTML = `<img src="${ev.target.result}" alt="Selected image" style="max-width:100%;max-height:220px;border-radius:12px;margin-top:8px;display:block">`;
    };
    reader.readAsDataURL(file);
    $('#uploadStatus').textContent = '';
  });

  $('#postForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = String(fd.get('text')||'').trim();
    const file = $('#postImage')?.files?.[0];
    if(!text) return;

    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      let imageURL = '';
      if(file){
        try {
          $('#uploadStatus').textContent = 'Uploading image… 0%';
          imageURL = await uploadImage(file, `posts/${currentUser?.uid||'demo'}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`, pct => {
            $('#uploadStatus').textContent = `Uploading image… ${pct}%`;
          });
          $('#uploadStatus').innerHTML = `<span style="color:var(--success)">\u2713 Uploaded</span>`;
        } catch(uploadErr) {
          console.warn('Image upload fallback:', uploadErr);
          // if upload fails, still allow the post text to go through
        }
      }

      if(!db || isDemo()){
        const newLocalPost = {
          id: `local-${Date.now()}`,
          text,
          imageURL,
          authorId: currentUser?.uid || 'demo-user',
          authorName: profile?.displayName || 'Campus Student',
          photoURL: profile?.photoURL || '',
          branch: profile?.branch || 'Student',
          college: profile?.college || 'Campus',
          likes: 0,
          comments: 0,
          reposts: 0,
          shares: 0,
          saves: 0,
          createdAt: new Date()
        };
        allFetchedPosts.unshift(newLocalPost);
        document.querySelector('.modal-backdrop')?.remove();
        toast('Post published!');
        renderActivePosts();
        return;
      }

      await createPost({
        text,
        imageURL,
        authorId: currentUser.uid,
        authorName: profile.displayName,
        photoURL: profile.photoURL||'',
        branch: profile.branch||'',
        college: profile.college||'',
        category: profile.branch||'community',
        originalityScore: 0.7
      });
      document.querySelector('.modal-backdrop')?.remove();
      toast('Post published');
      loadPosts();
    } catch(err) {
      submitBtn.disabled = false;
      toast(err.message||'Could not publish post.','error');
    }
  });
}

function commentNode(c, depth){
  const indent = depth > 0 ? `style="margin-left:${Math.min(depth,3)*28}px"` : '';
  const isMine = currentUser && c.authorId === currentUser.uid;
  const ownActions = isMine ? `<button class="muted-link" data-edit-comment="${escapeHtml(c.id)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit">Edit</button><button class="muted-link" data-delete-comment="${escapeHtml(c.id)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--danger)">Delete</button>` : '';

  return `<div class="comment" ${indent} data-comment-id="${escapeHtml(c.id)}" data-raw="${escapeHtml(c.text)}">
    <div class="avatar sm">${initials(c.authorName)}</div>
    <div style="flex:1">
      <strong>${escapeHtml(c.authorName)}</strong>
      <div class="comment-text-body">${linkifyHtml(c.text)}</div>
      <div class="row small muted" style="gap:10px">
        <span>${timeAgo(c.createdAt)}${c.edited?' · edited':''}</span>
        <button class="muted-link" data-reply-to="${escapeHtml(c.id)}" data-reply-name="${escapeHtml(c.authorName)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit">Reply</button>
        ${ownActions}
      </div>
    </div>
  </div>`;
}

function renderCommentTree(comments){
  const byParent = new Map();
  for(const c of comments){
    const p = c.parentId || '_root';
    if(!byParent.has(p)) byParent.set(p,[]);
    byParent.get(p).push(c);
  }
  let html = '';
  (function walk(parent, depth){
    for(const c of byParent.get(parent)||[]) {
      html += commentNode(c, depth);
      walk(c.id, depth + 1);
    }
  })('_root', 0);
  return html;
}

const LOCAL_COMMENTS = new Map();

async function openComments(postId){
  let commentList = [], loadFailed = false;
  if(db && !postId.startsWith('demo') && !postId.startsWith('local')){
    try {
      commentList = await getPostComments(postId);
    } catch(e) {
      loadFailed = true;
    }
  } else {
    commentList = LOCAL_COMMENTS.get(postId) || [
      { id: 'c-1', authorName: 'Kavita Roy', text: 'Great point! Let us connect on this.', createdAt: new Date(Date.now() - 3600000) }
    ];
  }

  const body = loadFailed
    ? '<div class="empty"><i data-lucide="wifi-off"></i><h3>Could not load comments</h3><p>Check connection and try again.</p></div>'
    : (commentList.length ? renderCommentTree(commentList) : '<div class="empty"><i data-lucide="message-circle"></i><h3>No comments yet</h3><p>Start the conversation.</p></div>');

  showModal('Comments', `<div class="comment-list">${body}</div>
    <form id="commentForm" class="form" style="margin-top:15px">
      <div id="replyingBanner" class="small muted" hidden style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span></span>
        <button type="button" id="cancelReply" class="muted-link" style="background:none;border:0;cursor:pointer">Cancel</button>
      </div>
      <div class="field">
        <label for="commentText">Add a comment</label>
        <textarea id="commentText" maxlength="800" required placeholder="Write something useful..."></textarea>
      </div>
      <div style="text-align:right">
        <button class="btn primary" type="submit">Comment</button>
      </div>
    </form>`);
  window.lucide?.createIcons();

  let replyTo = null;
  $('.comment-list')?.addEventListener('click', async e => {
    const r = e.target.closest('[data-reply-to]');
    if(r){
      replyTo = r.dataset.replyTo;
      const banner = document.getElementById('replyingBanner');
      if (banner) {
        banner.hidden = false;
        banner.querySelector('span').textContent = `Replying to ${r.dataset.replyName}`;
      }
      document.getElementById('commentText')?.focus();
      return;
    }
    const editBtn = e.target.closest('[data-edit-comment]');
    if(editBtn){
      const row = editBtn.closest('[data-comment-id]');
      const commentId = row.dataset.commentId;
      const textBody = row.querySelector('.comment-text-body');
      const raw = row.dataset.raw || '';
      textBody.innerHTML = `<form class="form" data-inline-edit style="margin-top:4px"><textarea rows="3" maxlength="800" required>${escapeHtml(raw)}</textarea><div class="toolbar" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn sm" data-cancel-edit>Cancel</button><button type="submit" class="btn sm primary">Save</button></div></form>`;
      row.querySelector('[data-cancel-edit]').addEventListener('click', () => { textBody.innerHTML = linkifyHtml(raw); });
      row.querySelector('[data-inline-edit]').addEventListener('submit', async ev => {
        ev.preventDefault();
        const newText = ev.currentTarget.querySelector('textarea').value.trim();
        if(!newText) return;
        try {
          if (db && !postId.startsWith('demo')) await editComment(postId, commentId, newText);
          row.dataset.raw = newText;
          textBody.innerHTML = linkifyHtml(newText);
          toast('Comment updated');
        } catch(err) {
          toast(err.message||'Could not update comment.','error');
        }
      });
      return;
    }
    const delBtn = e.target.closest('[data-delete-comment]');
    if(delBtn){
      if(!confirm('Delete this comment?')) return;
      const commentId = delBtn.closest('[data-comment-id]').dataset.commentId;
      try {
        if (db && !postId.startsWith('demo')) await deleteComment(postId, commentId);
        toast('Comment deleted');
        document.querySelector('.modal-backdrop')?.remove();
        await loadPosts();
        await openComments(postId);
      } catch(err) {
        toast(err.message||'Could not delete comment.','error');
      }
    }
  });

  document.getElementById('cancelReply')?.addEventListener('click', () => {
    replyTo = null;
    const b = document.getElementById('replyingBanner');
    if (b) b.hidden = true;
  });

  $('#commentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const commentInput = $('#commentText');
    const textVal = commentInput.value.trim();
    if (!textVal) return;
    const btn = e.currentTarget.querySelector('button[type="submit"]');
    if(btn) btn.disabled = true;

    try {
      if(!db || postId.startsWith('demo') || postId.startsWith('local')){
        const currentList = LOCAL_COMMENTS.get(postId) || [];
        currentList.push({
          id: `local-c-${Date.now()}`,
          authorName: profile?.displayName || 'Campus Student',
          authorId: currentUser?.uid || 'demo-user',
          text: textVal,
          parentId: replyTo || null,
          createdAt: new Date()
        });
        LOCAL_COMMENTS.set(postId, currentList);
        toast(replyTo ? 'Reply added' : 'Comment added');
        document.querySelector('.modal-backdrop')?.remove();
        openComments(postId);
        return;
      }

      await addComment(postId, {
        authorId: currentUser.uid,
        authorName: profile.displayName,
        photoURL: profile.photoURL||'',
        parentId: replyTo || null,
        text: textVal
      });
      toast(replyTo ? 'Reply added' : 'Comment added');
      document.querySelector('.modal-backdrop')?.remove();
      await loadPosts();
    } catch(err) {
      toast(err.message, 'error');
      if(btn) btn.disabled = false;
    }
  });
}

async function moreMenu(post){
  const id = post.dataset.postId;
  const isMine = (post.dataset.authorId && currentUser && post.dataset.authorId === currentUser.uid) || id.startsWith('local');
  showModal('Post actions', `<div class="stack">
    <a class="btn" href="report.html?type=post&targetId=${encodeURIComponent(id)}"><i data-lucide="flag"></i>Report post</a>
    ${isMine ? `<button class="btn" id="editPost"><i data-lucide="pencil"></i>Edit post</button><button class="btn danger" id="deletePost"><i data-lucide="trash-2"></i>Delete post</button>` : ''}
  </div>`);
  window.lucide?.createIcons();

  $('#deletePost')?.addEventListener('click', async () => {
    if(!confirm('Delete this post? This cannot be undone.')) return;
    try {
      if (db && !id.startsWith('local')) {
        await deleteDoc(doc(db, 'posts', id));
      }
      allFetchedPosts = allFetchedPosts.filter(x => x.id !== id);
      document.querySelector('.modal-backdrop')?.remove();
      toast('Post deleted');
      renderActivePosts();
    } catch(e) {
      toast(e.message||'Could not delete this post.', 'error');
    }
  });

  $('#editPost')?.addEventListener('click', () => {
    document.querySelector('.modal-backdrop')?.remove();
    const currentText = post.querySelector('.post-text')?.dataset.raw || post.querySelector('.post-text')?.textContent || '';
    showModal('Edit post', `<form class="form" id="editPostForm">
      <div class="field"><textarea id="editPostText" rows="6" maxlength="2000" required>${escapeHtml(currentText)}</textarea></div>
      <div id="editPostError" class="small" style="color:var(--danger)"></div>
      <div style="text-align:right"><button class="btn primary" type="submit">Save changes</button></div>
    </form>`);
    window.lucide?.createIcons();

    document.getElementById('editPostForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const text = document.getElementById('editPostText').value.trim();
      if(!text) return;
      const btn = ev.currentTarget.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (db && !id.startsWith('local')) {
          await updateDoc(doc(db,'posts',id), { text, searchText: text.toLowerCase(), edited: true, updatedAt: serverTimestamp() });
        }
        const item = allFetchedPosts.find(x => x.id === id);
        if (item) { item.text = text; }
        document.querySelector('.modal-backdrop')?.remove();
        toast('Post updated');
        renderActivePosts();
      } catch(err) {
        document.getElementById('editPostError').textContent = err.message||'Could not update this post.';
        btn.disabled = false;
      }
    });
  });
}

// Global click delegation
document.addEventListener('click', async e => {
  // Tabs: For You, Following, Latest
  const tabBtn = e.target.closest('.feed-toolbar .tab');
  if (tabBtn) {
    $$('.feed-toolbar .tab').forEach(t => t.classList.remove('active'));
    tabBtn.classList.add('active');
    activeTab = tabBtn.textContent.trim();
    renderActivePosts();
    return;
  }

  if(e.target.closest('[data-create-post]')) return composer();
  const post = e.target.closest('[data-post-id]');
  if(!post) return;
  const id = post.dataset.postId;

  if(e.target.closest('[data-like]')){
    const btn = e.target.closest('[data-like]');
    const span = btn.querySelector('span');
    const n = Number(span.textContent||0);
    const wasActive = btn.classList.contains('active');
    const nextActive = !wasActive;

    btn.classList.toggle('active', nextActive);
    span.textContent = String(Math.max(0, n + (nextActive ? 1 : -1)));

    if (db && !id.startsWith('demo') && !id.startsWith('local')) {
      togglePostLike(id, currentUser.uid).catch(err => {
        btn.classList.toggle('active', wasActive);
        span.textContent = String(n);
        toast(err.message||'Could not save like.','error');
      });
    }
    return;
  }

  if(e.target.closest('[data-comment]')) return openComments(id);

  if(e.target.closest('[data-repost]')){
    const btn = e.target.closest('[data-repost]');
    const span = btn.querySelector('span');
    const n = Number(span.textContent||0);
    const wasActive = btn.classList.contains('active');
    const nextActive = !wasActive;

    btn.classList.toggle('active', nextActive);
    span.textContent = String(Math.max(0, n + (nextActive ? 1 : -1)));
    toast(nextActive ? 'Reposted to your profile' : 'Repost removed');

    if (db && !id.startsWith('demo') && !id.startsWith('local')) {
      toggleRepost(id, currentUser.uid, profile?.displayName).catch(err => {
        btn.classList.toggle('active', wasActive);
        span.textContent = String(n);
        toast(err.message||'Could not save repost.','error');
      });
    }
    return;
  }

  if(e.target.closest('[data-save]')){
    const btn = e.target.closest('[data-save]');
    const wasActive = btn.classList.contains('active');
    const nextActive = !wasActive;
    btn.classList.toggle('active', nextActive);
    const sp = btn.querySelector('span');
    if(sp) sp.textContent = nextActive ? 'Saved' : 'Save';
    toast(nextActive ? 'Post saved' : 'Removed from saved');

    if (db && !id.startsWith('demo') && !id.startsWith('local')) {
      toggleSave(id, currentUser.uid).catch(err => {
        btn.classList.toggle('active', wasActive);
        if(sp) sp.textContent = wasActive ? 'Saved' : 'Save';
        toast(err.message||'Could not save post.','error');
      });
    }
    return;
  }

  if(e.target.closest('[data-share]')){
    const url = new URL('feed.html', location.href);
    url.searchParams.set('post', id);
    try {
      if(db && !id.startsWith('demo') && !id.startsWith('local')) {
        updateDoc(doc(db,'posts',id),{shares:increment(1)}).catch(()=>{});
      }
      if(navigator.share) {
        await navigator.share({title:'Campus Connect', text:'See this discussion on Campus Connect', url:url.href});
      } else {
        await navigator.clipboard.writeText(url.href);
        toast('Post link copied to clipboard');
      }
    } catch{}
    return;
  }

  if(e.target.closest('[data-post-menu]')) moreMenu(post);
});

subscribeAuth((u,p)=>{
  if(!requireAuth()) return;
  profile = p;
  loadPosts();

  if(new URLSearchParams(location.search).get('compose') === '1'){
    composer();
    history.replaceState(null, '', 'feed.html');
  }
});

export async function loadMoreFeed(){
  if(feedLoading || feedExhausted) return;
  feedLoading = true;
  const btn = document.getElementById('loadMoreFeed');
  if(btn){ btn.disabled = true; btn.textContent = 'Loading…'; }
  try {
    if (db && feedCursor) {
      const page = await paginatePosts(20, feedCursor);
      feedCursor = page.lastDoc;
      if (page.items.length) {
        allFetchedPosts.push(...page.items);
        renderActivePosts();
      }
      if(!page.hasMore){
        feedExhausted = true;
        if(btn){ btn.textContent = 'No more posts'; btn.disabled = true; }
      } else if(btn) {
        btn.disabled = false; btn.textContent = 'Load more';
      }
    } else {
      if(btn){ btn.textContent = 'All caught up'; btn.disabled = true; }
    }
  } catch(e) {
    toast('Could not load more posts.', 'error');
    if(btn){ btn.disabled = false; btn.textContent = 'Load more'; }
  } finally {
    feedLoading = false;
  }
}
