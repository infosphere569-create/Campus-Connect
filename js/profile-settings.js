import {auth} from './firebase.js';
import {uploadImage} from './services.js';

export async function uploadProfileImage(file,uid=auth.currentUser?.uid){
  if(!uid)throw new Error('Not authenticated');
  return uploadImage(file,`users/${uid}/avatar-${Date.now()}`);
}
