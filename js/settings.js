import {db,auth} from "./firebase.js";
import {doc,getDoc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

export async function getSettings(){
 const u=auth.currentUser?.uid;if(!u)return null;
 const s=await getDoc(doc(db,"users",u));const d=s.exists()?s.data():{};
 return {privacy:d.privacy||{profileVisibility:"campus",showEmail:false},notifications:d.notifications||{likes:true,comments:true,groups:true,events:true}};
}
export async function saveSettings(settings){
 const u=auth.currentUser?.uid;if(!u)throw Error("Please sign in.");
 await setDoc(doc(db,"users",u),{privacy:settings.privacy,notifications:settings.notifications,updatedAt:serverTimestamp()},{merge:true});
}
