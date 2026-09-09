import {auth} from "./firebase.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {getSettings,saveSettings} from "./settings.js";
const f=document.querySelector("#settingsForm"),s=document.querySelector("#status");
onAuthStateChanged(auth,async u=>{
 if(!u){location.href="login.html";return}
 const x=await getSettings();if(x){
  profileVisibility.value=x.privacy.profileVisibility;showEmail.checked=!!x.privacy.showEmail;
  for(const k of ["likes","comments","groups","events"])document.querySelector("#"+k).checked=x.notifications[k]!==false;
 }
 f.onsubmit=async e=>{e.preventDefault();s.textContent="Saving…";try{
  await saveSettings({privacy:{profileVisibility:profileVisibility.value,showEmail:showEmail.checked},
   notifications:Object.fromEntries(["likes","comments","groups","events"].map(k=>[k,document.querySelector("#"+k).checked]))});
  s.textContent="Settings saved.";
 }catch(err){s.textContent=err.message||"Could not save settings.";}}
});
