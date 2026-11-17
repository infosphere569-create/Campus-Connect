import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
const fn=getFunctions();
export const approveGroupMember=httpsCallable(fn,"approveGroupMember");
export const rejectGroupMember=httpsCallable(fn,"rejectGroupMember");
export const removeGroupMember=httpsCallable(fn,"removeGroupMember");
