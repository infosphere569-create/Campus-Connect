import {db,auth} from "./firebase.js";
import {collection,query,where,orderBy,limit,onSnapshot} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export function watchMyNotifications(callback){
 const uid=auth.currentUser?.uid;if(!uid)return ()=>{};
 const q=query(collection(db,"notifications"),where("uid","==",uid),orderBy("createdAt","desc"),limit(30));
 return onSnapshot(q,snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))),()=>callback([]));
}
export function watchUnreadCount(callback){
 return watchMyNotifications(items=>callback(items.filter(x=>!x.read).length));
}
