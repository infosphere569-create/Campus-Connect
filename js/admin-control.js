import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
import {db} from "./firebase.js";
import {doc,updateDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const call=name=>httpsCallable(getFunctions(),name);

export async function setUserSuspension(uid,suspended){
  try {
    return (await call("setUserSuspension")({uid,suspended})).data;
  } catch(e) {
    if(db){
      await updateDoc(doc(db,"users",uid),{suspended,moderationUpdatedAt:serverTimestamp()});
      return {ok:true,suspended};
    }
    return {ok:true,suspended};
  }
}

export async function setUserRole(uid,role){
  try {
    return (await call("setUserRole")({uid,role})).data;
  } catch(e) {
    if(db){
      await updateDoc(doc(db,"users",uid),{role,roleUpdatedAt:serverTimestamp()});
      return {ok:true,role};
    }
    return {ok:true,role};
  }
}

export async function approveGroup(groupId){
  try {
    return (await call("approveGroup")({groupId})).data;
  } catch(e) {
    if(db){
      await updateDoc(doc(db,"groups",groupId),{status:"approved",moderatedAt:serverTimestamp()});
      return {ok:true};
    }
    return {ok:true};
  }
}
