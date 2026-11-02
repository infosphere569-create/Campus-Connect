import {db} from './firebase.js';
import {collection,addDoc,setDoc,getDoc,getDocs,query,where,orderBy,limit,doc,updateDoc,deleteDoc,serverTimestamp,increment,writeBatch,startAfter} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
const CLOUDINARY_CLOUD_NAME='bqwj7eos';
const CLOUDINARY_UPLOAD_PRESET='campus_connect_unsigned';

export async function uploadImage(file,path,onProgress){
  if(!file||!file.type?.startsWith('image/'))throw new Error('Please choose an image file.');
  if(file.size>8*1024*1024)throw new Error('Image must be smaller than 8 MB.');
  onProgress?.(5);
  const body=new FormData();
  body.append('file',file);
  body.append('upload_preset',CLOUDINARY_UPLOAD_PRESET);
  body.append('folder','campus-connect');
  try{
    const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,{method:'POST',body});
    const data=await res.json();
    if(!res.ok)throw new Error(data?.error?.message||'Cloudinary image upload failed.');
    onProgress?.(100);
    return data.secure_url||data.url;
  }catch(err){throw new Error(err?.message||'Could not upload image.');}
}

export async function getLatestPosts(n=25){
  if(!db) return [
    { id: 'demo-p-1', authorName: 'Aarav Sharma', branch: 'CSE 3rd Year', text: 'Anyone forming teams for the upcoming inter-college hackathon? We need a frontend dev and designer!', likes: 24, comments: 8, createdAt: new Date(Date.now() - 3600000 * 2) },
    { id: 'demo-p-2', authorName: 'Priya Patel', branch: 'ECE 2nd Year', text: 'Library 2nd floor silent study room is now open until 10 PM throughout exam week.', likes: 42, comments: 5, createdAt: new Date(Date.now() - 3600000 * 5) }
  ];
  const snap=await getDocs(query(collection(db,'posts'),orderBy('createdAt','desc'),limit(n)));
  return snap.docs.map(d=>({id:d.id,...d.data()}))
}
export async function createPost(data){if(!db)throw new Error('Firebase is not configured.');
  // firestore.rules checks authorUid on create; some older callers used authorId.
  // Both fields are written with the same value so either rule version is satisfied.
  // Normalize both so a post always carries the field the rules check.
  const authorId=data.authorId||data.authorUid;
  const searchText=String(data.text||'').trim().toLowerCase();const ref=await addDoc(collection(db,'posts'),{...data,authorId,authorUid:authorId,searchText,likes:0,comments:0,shares:0,saves:0,reposts:0,reportCount:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});return ref.id}
export async function togglePostLike(postId,userId){if(!db)throw new Error('Firebase is not configured.');const vote=doc(db,'postLikes',postId,'users',userId);const snap=await getDoc(vote);if(snap.exists()){await deleteDoc(vote);await updateDoc(doc(db,'posts',postId),{likes:increment(-1)});return false}await setDoc(vote,{uid:userId,postId,createdAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{likes:increment(1)});return true}
// firestore.rules puts comments at posts/{postId}/comments/{commentId} -- a
// SUBCOLLECTION, not a flat top-level "comments" collection. Reading/writing
// the flat collection (the old code below) is denied outright by the rules'
// default-deny catch-all, which is exactly why comments never loaded.
export async function getPostComments(postId,n=20){if(!db)return[];const snap=await getDocs(query(collection(db,'posts',postId,'comments'),orderBy('createdAt','asc'),limit(n)));return snap.docs.map(d=>({id:d.id,...d.data()}))}
export async function addComment(postId,data){if(!db)throw new Error('Firebase is not configured.');
  const authorId=data.authorId||data.authorUid;
  const id=await addDoc(collection(db,'posts',postId,'comments'),{...data,authorId,authorUid:authorId,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{comments:increment(1)});return id.id}
export async function editComment(postId,commentId,text){if(!db)throw new Error('Firebase is not configured.');await updateDoc(doc(db,'posts',postId,'comments',commentId),{text,edited:true,updatedAt:serverTimestamp()})}
export async function deleteComment(postId,commentId){if(!db)throw new Error('Firebase is not configured.');await deleteDoc(doc(db,'posts',postId,'comments',commentId));await updateDoc(doc(db,'posts',postId),{comments:increment(-1)})}
export async function toggleSave(postId,userId){if(!db)throw new Error('Firebase is not configured.');const ref=doc(db,'savedPosts',userId,'items',postId);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);return false}await setDoc(ref,{postId,createdAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{saves:increment(1)});return true}
// Twitter/Instagram-style repost: creates a lightweight pointer doc back to
// the original post (not a copy) so it can show up on the reposter's own
// profile, and keeps a count on the original. Toggling again removes it.
export async function toggleRepost(postId,userId,authorName){if(!db)throw new Error('Firebase is not configured.');const ref=doc(db,'reposts',`${postId}_${userId}`);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);await updateDoc(doc(db,'posts',postId),{reposts:increment(-1)});return false}await setDoc(ref,{postId,uid:userId,authorName:authorName||'',createdAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{reposts:increment(1)});return true}
export async function getMyReposts(userId,max=30){if(!db)return[];const snap=await getDocs(query(collection(db,'reposts'),where('uid','==',userId),orderBy('createdAt','desc'),limit(max)));const postIds=snap.docs.map(d=>d.data().postId);const posts=await Promise.all(postIds.map(async id=>{const p=await getDoc(doc(db,'posts',id));return p.exists()?{id:p.id,...p.data(),_reposted:true}:null}));return posts.filter(Boolean)}
export async function isReposted(postId,userId){if(!db||!userId)return false;const s=await getDoc(doc(db,'reposts',`${postId}_${userId}`));return s.exists()}
export async function requestMembership(groupId,userId){if(!db)throw new Error('Firebase is not configured.');
  // firestore.rules requires field "uid" on groupRequests create (and the
  // reviewGroupRequest Cloud Function reads r.uid to build the membership doc).
  // This used to write "userId" instead, so Firestore rejected every single
  // group-join request with permission-denied before it ever reached the server.
  const ref=doc(db,'groupRequests',`${groupId}_${userId}`);await setDoc(ref,{groupId,uid:userId,status:'pending',createdAt:serverTimestamp()});return ref.id}
export async function supportIssue(issueId,userId){if(!db)throw new Error('Firebase is not configured.');
  // Same mismatch as groupRequests: firestore.rules requires "uid" on issueVotes
  // create; this wrote "userId", so support/upvote silently failed for every user.
  const vote=doc(db,'issueVotes',`${issueId}_${userId}`);const snap=await getDoc(vote);if(snap.exists()){await deleteDoc(vote);await updateDoc(doc(db,'issues',issueId),{supportCount:increment(-1)});return false}await setDoc(vote,{issueId,uid:userId,createdAt:serverTimestamp()});await updateDoc(doc(db,'issues',issueId),{supportCount:increment(1)});return true}
// Notifications live as FLAT top-level docs in "notifications" with a "uid" field
// identifying the recipient -- this is the model every Cloud Function in
// functions/index.js already writes (onIssueCreated, onReportCreated,
// reviewGroupRequest, approveGroupMember all do db.collection("notifications").add/doc()
// with a plain "uid" field). The old code here wrote to a nested
// notifications/{recipientId}/items subcollection that nothing else ever read from,
// and read from the flat collection with NO uid filter at all (returning every
// user's notifications to everyone). Both bugs are fixed below.
export async function createNotification(recipientId,data){if(!db)return;await addDoc(collection(db,'notifications'),{uid:recipientId,...data,read:false,createdAt:serverTimestamp()})}
export async function getNotifications(uid,n=30){if(!db||!uid)return[];const snap=await getDocs(query(collection(db,'notifications'),where('uid','==',uid),orderBy('createdAt','desc'),limit(n)));return snap.docs.map(d=>({id:d.id,...d.data()}))}
export async function markNotificationRead(uid,id){if(!db)return;await updateDoc(doc(db,'notifications',id),{read:true})}
export async function getCounts(names){const out={};for(const name of names){try{out[name]=(await getDocs(query(collection(db,name),limit(1)))).size? '1':'0'}catch{out[name]='—'}}return out}

// Newsletter & Campus Broadcast Services
export async function subscribeNewsletter(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    throw new Error('Please enter a valid email address.');
  }

  if (!db) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem('cc-newsletter-subscribers') || '[]'); } catch(e) {}
    if (!list.includes(cleanEmail)) {
      list.push(cleanEmail);
      localStorage.setItem('cc-newsletter-subscribers', JSON.stringify(list));
    }
    return { email: cleanEmail, status: 'subscribed', count: list.length };
  }

  const subId = cleanEmail.replace(/[^a-z0-9]/gi, '_');
  const ref = doc(db, 'subscribers', subId);
  await setDoc(ref, {
    email: cleanEmail,
    active: true,
    source: 'web_footer',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  return { email: cleanEmail, status: 'subscribed', id: subId };
}

export async function getNewsletterSubscribers() {
  if (!db) {
    try {
      const list = JSON.parse(localStorage.getItem('cc-newsletter-subscribers') || '[]');
      return list.map(e => ({ id: e, email: e, active: true }));
    } catch(e) {
      return [];
    }
  }
  const snap = await getDocs(query(collection(db, 'subscribers'), orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function broadcastNewsletter({ subject, message, senderName }) {
  if (!subject || !message) {
    throw new Error('Subject and message content are required for broadcast.');
  }

  const subs = await getNewsletterSubscribers();
  
  if (db) {
    await addDoc(collection(db, 'announcements'), {
      title: subject,
      body: message,
      type: 'newsletter',
      recipientCount: subs.length || 1,
      authorName: senderName || 'Campus Administration',
      createdAt: serverTimestamp()
    });
  }

  return {
    subject,
    recipientCount: subs.length || 1,
    sentAt: new Date().toISOString()
  };
}

export async function getLatestIssues(n=3){
  if(!db) return [
    { id: 'demo-is-1', title: 'Water cooler broken in Block C', description: 'It has been leaking for 3 days and now it stopped cooling.', status: 'Open', category: 'Infrastructure', supportCount: 15, createdAt: new Date() },
    { id: 'demo-is-2', title: 'Library Wi-Fi very slow', description: 'Cannot even open Google Docs in the evening.', status: 'In Progress', category: 'IT Services', supportCount: 42, createdAt: new Date(Date.now() - 86400000) }
  ];
  const snap=await getDocs(query(collection(db,'issues'),orderBy('createdAt','desc'),limit(n)));
  return snap.docs.map(d=>({id:d.id,...d.data()}))
}

