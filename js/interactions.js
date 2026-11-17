import { db, auth } from "./firebase.js";
import { addDoc, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment }
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export async function togglePostReaction(postId,type="like"){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const key=`${postId}_${uid}_${type}`, ref=doc(db,"postReactions",key), snap=await getDoc(ref);
 if(snap.exists()){await deleteDoc(ref);await updateDoc(doc(db,"posts",postId),{[`${type}Count`]:increment(-1)});return false;}
 await setDoc(ref,{postId,uid,type,createdAt:serverTimestamp()});
 await updateDoc(doc(db,"posts",postId),{[`${type}Count`]:increment(1)});return true;
}
export async function toggleSave(postId){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const ref=doc(db,"savedPosts",`${uid}_${postId}`),snap=await getDoc(ref);
 if(snap.exists()){await deleteDoc(ref);return false;}
 await setDoc(ref,{uid,postId,createdAt:serverTimestamp()});return true;
}
export async function addComment(postId,text,parentId=null){
 const uid=auth.currentUser?.uid;if(!uid||!text?.trim())throw Error("Comment cannot be empty.");
 return addDoc(collection(db,"comments"),{postId,authorUid:uid,text:text.trim(),parentId,createdAt:serverTimestamp(),likeCount:0,isDeleted:false});
}
export async function toggleEventInterest(eventId){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const ref=doc(db,"eventInterest",`${eventId}_${uid}`),snap=await getDoc(ref);
 if(snap.exists()){await deleteDoc(ref);await updateDoc(doc(db,"events",eventId),{interestedCount:increment(-1)});return false;}
 await setDoc(ref,{eventId,uid,createdAt:serverTimestamp()});await updateDoc(doc(db,"events",eventId),{interestedCount:increment(1)});return true;
}
export async function markNotificationRead(id){
 const uid=auth.currentUser?.uid;if(!uid)return;const ref=doc(db,"notifications",id),snap=await getDoc(ref);
 if(snap.exists()&&snap.data().uid===uid)await updateDoc(ref,{read:true});
}
export async function requestGroupMembership(groupId){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 await setDoc(doc(db,"groupRequests",`${groupId}_${uid}`),{groupId,uid,status:"pending",createdAt:serverTimestamp()});
 return true;
}
