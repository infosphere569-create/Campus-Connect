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

export async function getLatestPosts(n=25){if(!db)return[];const snap=await getDocs(query(collection(db,'posts'),orderBy('createdAt','desc'),limit(n)));return snap.docs.map(d=>({id:d.id,...d.data()}))}
export async function createPost(data){if(!db)throw new Error('Firebase is not configured.');const ref=await addDoc(collection(db,'posts'),{...data,likes:0,comments:0,shares:0,saves:0,reportCount:0,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});return ref.id}
export async function togglePostLike(postId,userId){if(!db)throw new Error('Firebase is not configured.');const vote=doc(db,'postLikes',postId,'users',userId);const snap=await getDoc(vote);if(snap.exists()){await deleteDoc(vote);await updateDoc(doc(db,'posts',postId),{likes:increment(-1)});return false}await setDoc(vote,{uid:userId,postId,createdAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{likes:increment(1)});return true}
export async function getPostComments(postId,n=20){if(!db)return[];const snap=await getDocs(query(collection(db,'comments'),where('postId','==',postId),orderBy('createdAt','asc'),limit(n)));return snap.docs.map(d=>({id:d.id,...d.data()}))}
export async function addComment(postId,data){if(!db)throw new Error('Firebase is not configured.');const id=await addDoc(collection(db,'comments'),{postId,...data,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{comments:increment(1)});return id.id}
export async function toggleSave(postId,userId){if(!db)throw new Error('Firebase is not configured.');const ref=doc(db,'savedPosts',userId,'items',postId);const snap=await getDoc(ref);if(snap.exists()){await deleteDoc(ref);return false}await setDoc(ref,{postId,createdAt:serverTimestamp()});await updateDoc(doc(db,'posts',postId),{saves:increment(1)});return true}
export async function requestMembership(groupId,userId){if(!db)throw new Error('Firebase is not configured.');const ref=doc(db,'groupRequests',`${groupId}_${userId}`);await setDoc(ref,{groupId,userId,status:'pending',createdAt:serverTimestamp()});return ref.id}
export async function supportIssue(issueId,userId){if(!db)throw new Error('Firebase is not configured.');const vote=doc(db,'issueVotes',`${issueId}_${userId}`);const snap=await getDoc(vote);if(snap.exists()){await deleteDoc(vote);await updateDoc(doc(db,'issues',issueId),{supportCount:increment(-1)});return false}await setDoc(vote,{issueId,userId,createdAt:serverTimestamp()});await updateDoc(doc(db,'issues',issueId),{supportCount:increment(1)});return true}
export async function createNotification(recipientId,data){if(!db)return;await addDoc(collection(db,'notifications',recipientId,'items'),{...data,read:false,createdAt:serverTimestamp()})}
export async function getNotifications(uid,n=30){if(!db)return[];const snap=await getDocs(query(collection(db,'notifications'),orderBy('createdAt','desc'),limit(n)));return snap.docs.map(d=>({id:d.id,...d.data()}))}
export async function markNotificationRead(uid,id){if(!db)return;await updateDoc(doc(db,'notifications',id),{read:true})}
export async function getCounts(names){const out={};for(const name of names){try{out[name]=(await getDocs(query(collection(db,name),limit(1)))).size? '1':'0'}catch{out[name]='—'}}return out}
