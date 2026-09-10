import {db,auth} from "./firebase.js";
import {
 collection,addDoc,doc,setDoc,deleteDoc,getDocs,getDoc,query,where,orderBy,limit,startAfter,serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export async function createComment(postId,text,parentId=null){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const clean=String(text||"").trim();if(!clean)throw Error("Comment cannot be empty.");
 return addDoc(collection(db,"posts",postId,"comments"),{
  authorId:uid,text:clean,parentId:parentId||null,createdAt:serverTimestamp()
 });
}
export async function deleteOwnComment(postId,commentId){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const ref=doc(db,"posts",postId,"comments",commentId),snap=await getDoc(ref);
 if(!snap.exists()||snap.data().authorId!==uid)throw Error("You can only delete your own comment.");
 await deleteDoc(ref);
}
export async function editOwnPost(postId,text){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const ref=doc(db,"posts",postId),snap=await getDoc(ref);
 if(!snap.exists()||snap.data().authorId!==uid)throw Error("You can only edit your own post.");
 await setDoc(ref,{text:String(text||"").trim(),editedAt:serverTimestamp()},{merge:true});
}
export async function deleteOwnPost(postId){
 const uid=auth.currentUser?.uid;if(!uid)throw Error("Please sign in.");
 const ref=doc(db,"posts",postId),snap=await getDoc(ref);
 if(!snap.exists()||snap.data().authorId!==uid)throw Error("You can only delete your own post.");
 await deleteDoc(ref);
}
export async function paginatePosts(pageSize=20,lastDoc=null){
 const base=[collection(db,"posts"),orderBy("createdAt","desc"),limit(pageSize)];
 if(lastDoc)base.splice(2,0,startAfter(lastDoc));
 const snap=await getDocs(query(...base));
 return {items:snap.docs.map(d=>({id:d.id,...d.data()})),lastDoc:snap.docs.at(-1)||null,hasMore:snap.docs.length===pageSize};
}
