import {auth,db} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {doc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const form=document.querySelector("#onboardingForm"),status=document.querySelector("#status");
onAuthStateChanged(auth,async user=>{
 if(!user){location.href="login.html";return;}
 const ref=doc(db,"users",user.uid);
 form.addEventListener("submit",async e=>{
  e.preventDefault(); status.textContent="Saving…";
  const value=id=>document.querySelector("#"+id).value.trim();
  try{
   await setDoc(ref,{uid:user.uid,name:value("fullName")||user.displayName||"Student",
    course:value("course"),branch:value("branch"),year:value("year"),section:value("section"),
    college:value("college"),bio:value("bio"),updatedAt:serverTimestamp()},{merge:true});
   status.textContent="Profile saved.";
   setTimeout(()=>location.href="home.html",400);
  }catch(err){status.textContent=err.message||"Could not save profile.";}
 });
});
