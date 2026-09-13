import './theme.js';
import {db} from './firebase.js';
import {doc,updateDoc,deleteDoc,increment,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {subscribeAuth,requireAuth,currentProfile,currentUser} from './auth.js';
import {getLatestPosts,createPost,togglePostLike,getPostComments,addComment,editComment,deleteComment,toggleSave,toggleRepost,uploadImage} from './services.js';
import {paginatePosts} from './content-actions.js';
import { $, $$, escapeHtml, linkifyHtml, initials, timeAgo, toast, showModal, isDemo } from './utils.js';
import {rankPosts} from './algorithm.js';
let profile;
let feedCursor=null, feedLoading=false, feedExhausted=false;
function postTemplate(p){const liked=Boolean(p._liked),saved=Boolean(p._saved),reposted=Boolean(p._reposted);const sameCollege=p.college&&profile?.college&&String(p.college).toLowerCase()===String(profile.college).toLowerCase();return `<article class="card post-card" data-post-id="${escapeHtml(p.id||'')}" data-author-id="${escapeHtml(p.authorId||'')}"><div class="post-head"><div class="avatar">${p.photoURL?`<img src="${escapeHtml(p.photoURL)}" alt="">`:initials(p.authorName)}</div><div class="post-meta"><strong>${escapeHtml(p.authorName||'Campus Student')}${p.role==='platformAdmin'?` <span class="badge primary">Official</span>`:''}</strong><span>${escapeHtml(p.branch||'Student')}${p.college?` · ${escapeHtml(p.college)}`:''} · ${timeAgo(p.createdAt)}</span></div>${sameCollege?'<span class="badge success" style="flex:0 0 auto">Your campus</span>':''}<button class="btn icon ghost" data-post-menu aria-label="More post actions"><i data-lucide="more-horizontal"></i></button></div><div class="post-text" data-raw="${escapeHtml(p.text||'')}">${linkifyHtml(p.text||'')}</div>${p.imageURL?`<img class="post-media" src="${escapeHtml(p.imageURL)}" alt="Post image">`:''}<div class="post-actions"><button class="action ${liked?'active':''}" data-like><i data-lucide="heart"></i><span>${p.likes||0}</span></button><button class="action" data-comment><i data-lucide="message-circle"></i><span>${p.comments||0}</span></button><button class="action ${reposted?'active':''}" data-repost><i data-lucide="repeat-2"></i><span>${p.reposts||0}</span></button><button class="action" data-share><i data-lucide="share-2"></i>Share</button><button class="action ${saved?'active':''}" data-save><i data-lucide="bookmark"></i><span>${saved?'Saved':'Save'}</span></button></div></article>`}
function emptyState(icon,title,body){return `<div class="card empty" id="feedEmpty"><i data-lucide="${icon}"></i><h3>${title}</h3><p class="muted">${body}</p></div>`}
async function loadPosts(){const box=$('[data-feed]');
 // loadPosts() and "Load more" used to run two completely separate, uncoordinated
 // queries (getLatestPosts here, paginatePosts for Load More) -- Load More always
 // restarted from the newest post, so it re-fetched and re-appended posts already
 // on screen. Both now share the same cursor, so Load More always continues from
 // exactly where this initial load stopped.
 feedCursor=null;feedExhausted=false;
 const loadMoreBtn=document.getElementById('loadMoreFeed');
 if(loadMoreBtn){loadMoreBtn.disabled=false;loadMoreBtn.textContent='Load more';loadMoreBtn.hidden=false}
 if(!db){box.innerHTML=emptyState('rss','Feed not connected','Connect Firebase to see real posts from your campus community.');window.lucide?.createIcons();if(loadMoreBtn)loadMoreBtn.hidden=true;return}
 let page;try{page=await paginatePosts(40,null);feedCursor=page.lastDoc;feedExhausted=!page.hasMore}catch(e){toast('Could not load the live feed.','error');box.innerHTML=emptyState('wifi-off','Could not load the feed','Check your connection and try again.');window.lucide?.createIcons();if(loadMoreBtn)loadMoreBtn.hidden=true;return}
 if(!page.items.length){box.innerHTML=emptyState('pen-line','No posts yet','Be the first to share an update, question or idea with your campus.');window.lucide?.createIcons();if(loadMoreBtn)loadMoreBtn.hidden=true;return}
 const posts=rankPosts(page.items,profile||{});box.innerHTML=posts.map(postTemplate).join('');window.lucide?.createIcons();
 if(loadMoreBtn&&feedExhausted){loadMoreBtn.textContent='No more posts';loadMoreBtn.disabled=true}
}
function composer(){showModal('Create a post','<form class="form" id="postForm"><div class="composer-row"><div class="avatar">'+initials(profile?.displayName)+'</div><textarea name="text" id="postText" required maxlength="2000" rows="6" style="min-height:160px" placeholder="Share an update, ask a question or start a discussion..."></textarea></div><label class="upload-box" id="uploadBox"><input id="postImage" type="file" accept="image/*" hidden><i data-lucide="image"></i><span id="uploadLabel">Add a photo</span></label><div id="uploadPreviewWrap"></div><div id="uploadStatus" class="small muted"></div><div class="notice small">Keep posts useful and respectful. Report content that breaks the community rules.</div><div class="toolbar" style="justify-content:flex-end"><button class="btn primary" type="submit"><i data-lucide="send"></i>Publish post</button></div></form>',{wide:true});window.lucide?.createIcons();
 $('#postImage').addEventListener('change',()=>{
  const file=$('#postImage').files[0];
  if(!file)return;
  $('#uploadLabel').textContent=file.name;
  const reader=new FileReader();
  reader.onload=ev=>{$('#uploadPreviewWrap').innerHTML=`<img src="${ev.target.result}" alt="Selected image" style="max-width:100%;max-height:220px;border-radius:12px;margin-top:8px;display:block">`};
  reader.readAsDataURL(file);
  $('#uploadStatus').textContent='';
 });
 $('#postForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),text=String(fd.get('text')||'').trim(),file=$('#postImage').files[0];if(!text)return;const submitBtn=e.currentTarget.querySelector('button[type="submit"]');submitBtn.disabled=true;try{let imageURL='';if(file){$('#uploadStatus').textContent='Uploading image… 0%';imageURL=await uploadImage(file,`posts/${currentUser.uid}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,pct=>$('#uploadStatus').textContent=`Uploading image… ${pct}%`);$('#uploadStatus').innerHTML=`<span style="color:var(--success)">\u2713 Uploaded ${escapeHtml(file.name)}</span>`}if(!db){toast('Demo mode: connect Firebase to publish.','warning');submitBtn.disabled=false;return}await createPost({text,imageURL,authorId:currentUser.uid,authorName:profile.displayName,photoURL:profile.photoURL||'',branch:profile.branch||'',college:profile.college||'',category:profile.branch||'community',originalityScore:.65});document.querySelector('.modal-backdrop')?.remove();toast('Post published');loadPosts()}catch(err){submitBtn.disabled=false;toast(err.message||'Could not publish post.','error')}})}
function commentNode(c,depth){
 const indent=depth>0?`style="margin-left:${Math.min(depth,3)*28}px"`:'';
 const isMine=currentUser&&c.authorId===currentUser.uid;
 const ownActions=isMine?`<button class="muted-link" data-edit-comment="${escapeHtml(c.id)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit">Edit</button><button class="muted-link" data-delete-comment="${escapeHtml(c.id)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:var(--danger)">Delete</button>`:'';
 return `<div class="comment" ${indent} data-comment-id="${escapeHtml(c.id)}" data-raw="${escapeHtml(c.text)}"><div class="avatar sm">${initials(c.authorName)}</div><div style="flex:1"><strong>${escapeHtml(c.authorName)}</strong><div class="comment-text-body">${linkifyHtml(c.text)}</div><div class="row small muted" style="gap:10px"><span>${timeAgo(c.createdAt)}${c.edited?' · edited':''}</span><button class="muted-link" data-reply-to="${escapeHtml(c.id)}" data-reply-name="${escapeHtml(c.authorName)}" style="background:none;border:0;padding:0;cursor:pointer;font:inherit;color:inherit">Reply</button>${ownActions}</div></div></div>`;
}
function renderCommentTree(comments){
 const byParent=new Map();
 for(const c of comments){const p=c.parentId||'_root';if(!byParent.has(p))byParent.set(p,[]);byParent.get(p).push(c)}
 let html='';
 (function walk(parent,depth){
  for(const c of byParent.get(parent)||[]) {html+=commentNode(c,depth);walk(c.id,depth+1)}
 })('_root',0);
 return html;
}
async function openComments(postId){let commentList=[],loadFailed=false;if(db){try{commentList=await getPostComments(postId)}catch(e){loadFailed=true}}
 const body=loadFailed
  ?'<div class="empty"><i data-lucide="wifi-off"></i><h3>Couldn\u2019t load comments</h3><p>Check your connection and reopen this post.</p></div>'
  :(commentList.length?renderCommentTree(commentList):'<div class="empty"><i data-lucide="message-circle"></i><h3>No comments yet</h3><p>Start the conversation.</p></div>');
 showModal('Comments',`<div class="comment-list">${body}</div><form id="commentForm" class="form" style="margin-top:15px"><div id="replyingBanner" class="small muted" hidden style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span></span><button type="button" id="cancelReply" class="muted-link" style="background:none;border:0;cursor:pointer">Cancel</button></div><div class="field"><label for="commentText">Add a comment</label><textarea id="commentText" maxlength="800" required placeholder="Write something useful..."></textarea></div><div style="text-align:right"><button class="btn primary" type="submit">Comment</button></div></form>`);
 window.lucide?.createIcons();
 let replyTo=null;
 $('.comment-list').addEventListener('click',async e=>{
  const r=e.target.closest('[data-reply-to]');
  if(r){
   replyTo=r.dataset.replyTo;
   const banner=document.getElementById('replyingBanner');
   banner.hidden=false;banner.querySelector('span').textContent=`Replying to ${r.dataset.replyName}`;
   document.getElementById('commentText').focus();
   return;
  }
  const editBtn=e.target.closest('[data-edit-comment]');
  if(editBtn){
   const row=editBtn.closest('[data-comment-id]');
   const commentId=row.dataset.commentId;
   const textBody=row.querySelector('.comment-text-body');
   const raw=row.dataset.raw||'';
   textBody.innerHTML=`<form class="form" data-inline-edit style="margin-top:4px"><textarea rows="3" maxlength="800" required>${escapeHtml(raw)}</textarea><div class="toolbar" style="justify-content:flex-end;margin-top:6px"><button type="button" class="btn sm" data-cancel-edit>Cancel</button><button type="submit" class="btn sm primary">Save</button></div></form>`;
   row.querySelector('[data-cancel-edit]').addEventListener('click',()=>{textBody.innerHTML=linkifyHtml(raw)});
   row.querySelector('[data-inline-edit]').addEventListener('submit',async ev=>{
    ev.preventDefault();
    const newText=ev.currentTarget.querySelector('textarea').value.trim();if(!newText)return;
    try{await editComment(postId,commentId,newText);row.dataset.raw=newText;textBody.innerHTML=linkifyHtml(newText);toast('Comment updated')}
    catch(err){toast(err.message||'Could not update comment.','error')}
   });
   return;
  }
  const delBtn=e.target.closest('[data-delete-comment]');
  if(delBtn){
   if(!confirm('Delete this comment?'))return;
   const commentId=delBtn.closest('[data-comment-id]').dataset.commentId;
   try{await deleteComment(postId,commentId);toast('Comment deleted');document.querySelector('.modal-backdrop')?.remove();await loadPosts();await openComments(postId)}
   catch(err){toast(err.message||'Could not delete comment.','error')}
  }
 });
 document.getElementById('cancelReply').addEventListener('click',()=>{replyTo=null;document.getElementById('replyingBanner').hidden=true});
 $('#commentForm').addEventListener('submit',async e=>{e.preventDefault();if(!db){toast('Connect Firebase to comment.','warning');return}const btn=e.currentTarget.querySelector('button[type="submit"]');if(btn)btn.disabled=true;try{await addComment(postId,{authorId:currentUser.uid,authorName:profile.displayName,photoURL:profile.photoURL||'',parentId:replyTo||null,text:$('#commentText').value.trim()});toast(replyTo?'Reply added':'Comment added');document.querySelector('.modal-backdrop')?.remove();await loadPosts()}catch(err){toast(err.message,'error');if(btn)btn.disabled=false}})}
async function moreMenu(post){
 const id=post.dataset.postId;
 if(id.startsWith('demo')){toast('Demo post cannot be modified.','warning');return}
 // Ownership used to be guessed by comparing displayed name TEXT, which is
 // fragile (two people can share a first name, and the "Official" badge text
 // gets appended to the same element) -- now compares the actual authorId
 // stored on the card.
 const isMine=post.dataset.authorId&&currentUser&&post.dataset.authorId===currentUser.uid;
 showModal('Post actions',`<div class="stack"><a class="btn" href="report.html?type=post&targetId=${encodeURIComponent(id)}"><i data-lucide="flag"></i>Report post</a>${isMine?'<button class="btn" id="editPost"><i data-lucide="pencil"></i>Edit post</button><button class="btn danger" id="deletePost"><i data-lucide="trash-2"></i>Delete post</button>':''}</div>`);
 window.lucide?.createIcons();
 $('#deletePost')?.addEventListener('click',async()=>{
  if(!confirm('Delete this post? This cannot be undone.'))return;
  try{await deleteDoc(doc(db,'posts',id));document.querySelector('.modal-backdrop')?.remove();toast('Post deleted');loadPosts()}
  catch(e){toast(e.message||'Could not delete this post.','error')}
 });
 $('#editPost')?.addEventListener('click',()=>{
  document.querySelector('.modal-backdrop')?.remove();
  const currentText=post.querySelector('.post-text')?.dataset.raw||post.querySelector('.post-text')?.textContent||'';
  showModal('Edit post',`<form class="form" id="editPostForm"><div class="field"><textarea id="editPostText" rows="6" maxlength="2000" required>${escapeHtml(currentText)}</textarea></div><div id="editPostError" class="small" style="color:var(--danger)"></div><div style="text-align:right"><button class="btn primary" type="submit">Save changes</button></div></form>`);
  window.lucide?.createIcons();
  document.getElementById('editPostForm').addEventListener('submit',async ev=>{
   ev.preventDefault();
   const text=document.getElementById('editPostText').value.trim();if(!text)return;
   const btn=ev.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;
   try{
    await updateDoc(doc(db,'posts',id),{text,searchText:text.toLowerCase(),edited:true,updatedAt:serverTimestamp()});
    document.querySelector('.modal-backdrop')?.remove();
    toast('Post updated');
    loadPosts();
   }catch(err){document.getElementById('editPostError').textContent=err.message||'Could not update this post.';btn.disabled=false}
  });
 });
}
document.addEventListener('click',async e=>{
 if(e.target.closest('[data-create-post]'))return composer();
 const post=e.target.closest('[data-post-id]');if(!post)return;const id=post.dataset.postId;

 if(e.target.closest('[data-like]')){
  if(isDemo()||id.startsWith('demo'))return toast('Connect Firebase to save likes.','warning');
  const btn=e.target.closest('[data-like]'),span=btn.querySelector('span'),n=Number(span.textContent||0);
  try{const active=await togglePostLike(id,currentUser.uid);span.textContent=String(Math.max(0,n+(active?1:-1)));btn.classList.toggle('active',active)}
  catch(err){toast(err.message||'Could not like this post.','error')}
  return;
 }
 if(e.target.closest('[data-comment]'))return openComments(id);
 if(e.target.closest('[data-repost]')){
  if(isDemo()||id.startsWith('demo'))return toast('Connect Firebase to repost.','warning');
  const btn=e.target.closest('[data-repost]'),span=btn.querySelector('span'),n=Number(span.textContent||0);
  try{const active=await toggleRepost(id,currentUser.uid,profile?.displayName);span.textContent=String(Math.max(0,n+(active?1:-1)));btn.classList.toggle('active',active);toast(active?'Reposted to your profile':'Repost removed')}
  catch(err){toast(err.message||'Could not repost.','error')}
  return;
 }
 if(e.target.closest('[data-save]')){
  if(isDemo()||id.startsWith('demo'))return toast('Connect Firebase to save posts.','warning');
  const btn=e.target.closest('[data-save]');
  try{const saved=await toggleSave(id,currentUser.uid);btn.classList.toggle('active',saved);const sp=btn.querySelector('span');if(sp)sp.textContent=saved?'Saved':'Save';toast(saved?'Post saved':'Removed from saved')}
  catch(err){toast(err.message||'Could not save this post.','error')}
  return;
 }
 if(e.target.closest('[data-share]')){
  const url=new URL('feed.html',location.href);url.searchParams.set('post',id);
  try{
   if(!isDemo()&&!id.startsWith('demo'))await updateDoc(doc(db,'posts',id),{shares:increment(1)}).catch(()=>{});
   if(navigator.share)await navigator.share({title:'Campus Connect',text:'See this on Campus Connect',url:url.href});
   else{await navigator.clipboard.writeText(url.href);toast('Post link copied')}
  }catch{}
  return;
 }
 if(e.target.closest('[data-post-menu]'))moreMenu(post);
});
subscribeAuth((u,p)=>{if(!requireAuth())return;profile=p;loadPosts();
 // Home's "What's on your mind?" prompt links here with ?compose=1 so tapping
 // it opens the composer immediately instead of just landing on the feed.
 if(new URLSearchParams(location.search).get('compose')==='1'){composer();history.replaceState(null,'','feed.html')}
});

export async function loadMoreFeed(){
 if(feedLoading||feedExhausted||!db)return;
 feedLoading=true;
 const btn=document.getElementById('loadMoreFeed');
 if(btn){btn.disabled=true;btn.textContent='Loading…'}
 try{
  const page=await paginatePosts(20,feedCursor); feedCursor=page.lastDoc;
  const host=document.querySelector('[data-feed]');
  if(host&&page.items.length){
   const frag=document.createElement('div');
   frag.innerHTML=page.items.map(postTemplate).join('');
   while(frag.firstChild)host.appendChild(frag.firstChild);
   window.lucide?.createIcons();
  }
  if(!page.hasMore){feedExhausted=true;if(btn){btn.textContent='No more posts';btn.disabled=true}}
  else if(btn){btn.disabled=false;btn.textContent='Load more'}
 }catch(e){toast('Could not load more posts.','error');if(btn){btn.disabled=false;btn.textContent='Load more'}}
 finally{feedLoading=false}
}
