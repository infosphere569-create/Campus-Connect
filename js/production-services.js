import {db,auth} from "./firebase.js";
import {doc,getDoc,setDoc,deleteDoc,addDoc,collection,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const uid=()=>auth.currentUser?.uid;
export async function togglePostLike(postId){
 const u=uid();if(!u)throw Error("Please sign in.");
 const ref=doc(db,"posts",postId,"likes",u), snap=await getDoc(ref);
 if(snap.exists()) await deleteDoc(ref); else await setDoc(ref,{uid:u,createdAt:serverTimestamp()});
 return !snap.exists();
}
export async function togglePostSave(postId){
 const u=uid();if(!u)throw Error("Please sign in.");
 const ref=doc(db,"users",u,"savedPosts",postId),snap=await getDoc(ref);
 if(snap.exists()) await deleteDoc(ref); else await setDoc(ref,{postId,createdAt:serverTimestamp()});
 return !snap.exists();
}
export async function addPostComment(postId,text,parentId=null){
 const u=uid();if(!u)throw Error("Please sign in.");
 const clean=String(text||"").trim();if(!clean)throw Error("Comment cannot be empty.");
 return addDoc(collection(db,"posts",postId,"comments"),{authorUid:u,text:clean,parentId:parentId||null,createdAt:serverTimestamp()});
}
export async function toggleEventInterest(eventId){
 const u=uid();if(!u)throw Error("Please sign in.");
 const ref=doc(db,"events",eventId,"interested",u),snap=await getDoc(ref);
 if(snap.exists()) await deleteDoc(ref); else await setDoc(ref,{uid:u,createdAt:serverTimestamp()});
 return !snap.exists();
}
