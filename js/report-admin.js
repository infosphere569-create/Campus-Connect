import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-functions.js";
export const reviewReport=httpsCallable(getFunctions(),"reviewReport");
