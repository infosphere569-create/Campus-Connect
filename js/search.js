import {db} from "./firebase.js";
import {collection,getDocs,query,where,orderBy,limit} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
const norm=s=>String(s||"").trim().toLowerCase();
async function prefix(name,field,text,n=8){
 const q=norm(text);if(!q)return[];
 const end=q+"\uf8ff";
 try{
  const s=await getDocs(query(collection(db,name),where(field,">=",q),where(field,"<=",end),limit(n)));
  return s.docs.map(d=>({id:d.id,type:name,...d.data()}));
 }catch(e){return[];}
}
export async function globalSearch(text){
 const q=norm(text);if(q.length<2)return[];
 const [users,groups,events,posts]=await Promise.all([
  prefix("users","searchName",q),prefix("groups","searchName",q),prefix("events","searchName",q),prefix("posts","searchText",q)
 ]);
 return [...users,...groups,...events,...posts].slice(0,30);
}
