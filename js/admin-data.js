import {db} from "./firebase.js";
import {collection,getDocs,query,orderBy,limit} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
async function list(name,n=50){
 const s=await getDocs(query(collection(db,name),orderBy("createdAt","desc"),limit(n)));
 return s.docs.map(d=>({id:d.id,...d.data()}));
}
export const listUsers=()=>list("users");
export const listReports=()=>list("reports");
export const listIssues=()=>list("issues");
export const listGroups=()=>list("groups");
export const listEvents=()=>list("events");
export const listAuditLogs=()=>list("auditLogs");
