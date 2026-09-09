import {db,storage,auth} from './firebase.js';
import {doc,getDoc,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {ref,uploadBytes,getDownloadURL} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';
export async function getMyProfile(uid=auth.currentUser?.uid){if(!uid)throw new Error('Not authenticated');const s=await getDoc(doc(db,'users',uid));return s.exists()?s.data():null;}
export async function updateMyProfile(fields,uid=auth.currentUser?.uid){if(!uid)throw new Error('Not authenticated');const safe={...fields,updatedAt:serverTimestamp()};delete safe.role;delete safe.email;delete safe.uid;await updateDoc(doc(db,'users',uid),safe);}
export async function uploadProfileImage(file,uid=auth.currentUser?.uid){if(!uid)throw new Error('Not authenticated');if(!file||!file.type.startsWith('image/'))throw new Error('Please select an image.');if(file.size>5*1024*1024)throw new Error('Image must be under 5 MB.');const r=ref(storage,`users/${uid}/avatar-${Date.now()}`);await uploadBytes(r,file,{contentType:file.type});return getDownloadURL(r);}
