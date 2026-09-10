import {db} from "./firebase.js";
import {collection,getDocs,query,where,orderBy,limit} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
export async function getOpenReports(max=50){
 const s=await getDocs(query(collection(db,"reports"),where("status","==","open"),orderBy("createdAt","desc"),limit(max)));
 return s.docs.map(d=>({id:d.id,...d.data()}));
}
export async function getPendingGroups(max=50){
 const s=await getDocs(query(collection(db,"groups"),where("status","==","pending"),orderBy("createdAt","desc"),limit(max)));
 return s.docs.map(d=>({id:d.id,...d.data()}));
}
export async function getOpenIssues(max=50){
 const s=await getDocs(query(collection(db,"issues"),where("status","in",["Open","Under Review","In Progress"]),orderBy("createdAt","desc"),limit(max)));
 return s.docs.map(d=>({id:d.id,...d.data()}));
}
