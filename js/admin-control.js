import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
const call=name=>httpsCallable(getFunctions(),name);
export async function setUserSuspension(uid,suspended){return (await call("setUserSuspension")({uid,suspended})).data;}
export async function setUserRole(uid,role){return (await call("setUserRole")({uid,role})).data;}
export async function approveGroup(groupId){return (await call("approveGroup")({groupId})).data;}
