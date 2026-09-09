import {db} from "./firebase.js";
import {collection,getDocs,limit,query} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const read=async name=>{
 const s=await getDocs(query(collection(db,name),limit(500)));
 return s.docs.map(d=>({id:d.id,...d.data()}));
};
export async function getDashboardSnapshot(){
 const [users,posts,groups,reports,issues,events]=await Promise.all(
  ["users","posts","groups","reports","issues","events"].map(read)
 );
 return {
  users,posts,groups,reports,issues,events,
  metrics:{
   users:users.length,posts:posts.length,groups:groups.length,
   events:events.length,reportsOpen:reports.filter(x=>["open","pending"].includes(x.status)).length,
   issuesActive:issues.filter(x=>["Open","Under Review","In Progress"].includes(x.status)).length
  }
 };
}
