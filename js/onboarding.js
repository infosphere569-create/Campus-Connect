import {auth,db} from "./firebase.js";
import {onAuthStateChanged,updateProfile} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {doc,setDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import {uploadImage} from "./services.js";
import {initials} from "./utils.js";

const form=document.querySelector("#onboardingForm"),status=document.querySelector("#status");
const avatarWrap=document.querySelector("#avatarPreviewWrap"),avatarInitials=document.querySelector("#avatarInitials"),avatarInput=document.querySelector("#avatarInput");
let selectedFile=null;

avatarWrap.addEventListener('click',()=>avatarInput.click());
avatarInput.addEventListener('change',()=>{
 const file=avatarInput.files[0];if(!file)return;selectedFile=file;
 const reader=new FileReader();
 reader.onload=ev=>{avatarWrap.innerHTML=`<img src="${ev.target.result}" alt="Selected photo"><span class="cam-badge"><i data-lucide="camera"></i></span>`;window.lucide?.createIcons()};
 reader.readAsDataURL(file);
});
document.querySelector('#fullName').addEventListener('input',e=>{if(!selectedFile)avatarInitials.textContent=initials(e.target.value)||'+'});

// Live progress bar across the 4 sections, purely cosmetic feedback as the form fills in.
function updateProgress(){
 const fields=['fullName','course','branch','year','section','college','bio'];
 const filled=fields.filter(id=>document.getElementById(id).value.trim()).length;
 const pct=Math.max(15,Math.round((filled/fields.length)*100));
 const bar=document.getElementById('onbProgress');if(bar)bar.style.width=pct+'%';
}
form.addEventListener('input',updateProgress);
updateProgress();

onAuthStateChanged(auth,async user=>{
 if(!user){location.href="login.html";return;}
 const ref=doc(db,"users",user.uid);
 form.addEventListener("submit",async e=>{
  e.preventDefault(); status.textContent="Saving…";
  const submitBtn=form.querySelector('button[type="submit"]');submitBtn.disabled=true;
  const value=id=>document.querySelector("#"+id).value.trim();
  try{
   const displayName=value("fullName")||user.displayName||"Student";
   let photoURL=user.photoURL||'';
   if(selectedFile){
    status.textContent="Uploading photo…";
    photoURL=await uploadImage(selectedFile,`users/${user.uid}/avatar-${Date.now()}`,pct=>status.textContent=`Uploading photo… ${pct}%`);
   }
   status.textContent="Saving…";
   const college=value("college");
   // displayName here used to only be written to a separate "name" field that
   // nothing else in the app reads -- profile.displayName (used for post
   // authorship, avatars, greetings everywhere) never actually updated from
   // this form. Fixed to write displayName directly, plus searchName/collegeKey
   // so search and the college-matching feed algorithm both work off this data.
   await setDoc(ref,{uid:user.uid,displayName,name:displayName,photoURL,
    course:value("course"),branch:value("branch"),year:value("year"),section:value("section"),
    college,collegeKey:college.toLowerCase(),bio:value("bio"),
    searchName:displayName.toLowerCase(),updatedAt:serverTimestamp()},{merge:true});
   if(auth.currentUser)await updateProfile(auth.currentUser,{displayName,photoURL:photoURL||undefined}).catch(()=>{});
   status.textContent="Profile saved.";
   setTimeout(()=>location.href="home.html",400);
  }catch(err){status.textContent=err.message||"Could not save profile.";submitBtn.disabled=false;}
 });
});
