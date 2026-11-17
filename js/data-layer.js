import {db,auth} from "./firebase.js";
import {collection,doc,getDoc,getDocs,query,where,orderBy,limit,serverTimestamp,setDoc,deleteDoc}
from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const uid=()=>auth.currentUser?.uid;
export async function getMyProfile(){const u=uid();if(!u)return null;const s=await getDoc(doc(db,"users",u));return s.exists()?s.data():null;}
export async function getSavedPosts(max=30){
 const u=uid();if(!u)return [];
 // services.js's toggleSave() (the live Save-button path in feed.js) writes to the
 // subcollection savedPosts/{uid}/items/{postId} -- matching firestore.rules exactly.
 // This used to query a flat top-level "savedPosts" collection instead, which never
 // contained anything, so the Profile "Saved" tab was always empty even after saving.
 const snap=await getDocs(query(collection(db,"savedPosts",u,"items"),orderBy("createdAt","desc"),limit(max)));
 return Promise.all(snap.docs.map(async d=>{const p=d.data();const ps=await getDoc(doc(db,"posts",p.postId||d.id));return ps.exists()?{id:ps.id,...ps.data()}:null;})).then(a=>a.filter(Boolean));
}
export async function getMyGroups(max=30){
 const u=uid();if(!u)return [];
 const snap=await getDocs(query(collection(db,"groupMembers"),where("uid","==",u),limit(max)));
 return Promise.all(snap.docs.map(async d=>{const x=d.data();const g=await getDoc(doc(db,"groups",x.groupId));return g.exists()?{id:g.id,...g.data()}:null;})).then(a=>a.filter(Boolean));
}
export async function getMyEventInterest(max=30){
 const u=uid();if(!u)return [];
 const snap=await getDocs(query(collection(db,"eventInterest"),where("uid","==",u),limit(max)));
 return Promise.all(snap.docs.map(async d=>{const x=d.data();const e=await getDoc(doc(db,"events",x.eventId));return e.exists()?{id:e.id,...e.data()}:null;})).then(a=>a.filter(Boolean));
}
export async function isEventInterested(eventId){
 const u=uid();if(!u)return false;
 return (await getDoc(doc(db,"eventInterest",`${eventId}_${u}`))).exists();
}
export async function isGroupMember(groupId){
 const u=uid();if(!u)return false;
 return (await getDoc(doc(db,"groupMembers",`${groupId}_${u}`))).exists();
}
export async function hasGroupRequest(groupId){
 const u=uid();if(!u)return false;
 return (await getDoc(doc(db,"groupRequests",`${groupId}_${u}`))).exists();
}
export async function createDirectNotification(targetUid,type,title,body,targetId=""){
 if(!uid()||!targetUid)return;
 await setDoc(doc(collection(db,"notifications")),{uid:targetUid,type,title,body,targetId,read:false,createdAt:serverTimestamp()});
}
