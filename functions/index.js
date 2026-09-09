const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {onDocumentCreated}=require("firebase-functions/v2/firestore");
const admin=require("firebase-admin");
admin.initializeApp();
const db=admin.firestore();

exports.healthCheck=onCall(()=>({ok:true,service:"Campus Connect"}));

exports.submitAnonymousIssue=onCall(async (request)=>{
  if(!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
  const d=request.data||{};
  const clean=(v,max)=>String(v??"").trim().slice(0,max);
  const title=clean(d.title,140), description=clean(d.description,3000);
  if(!title||!description) throw new HttpsError("invalid-argument","Title and description are required.");
  const issueRef=db.collection("issues").doc();
  const privateRef=db.collection("issuePrivate").doc(issueRef.id);
  const now=admin.firestore.FieldValue.serverTimestamp();
  const publicIssue={
    title,description,category:clean(d.category,60)||"Other",
    location:clean(d.location,120),severity:clean(d.severity,30)||"Medium",
    status:"Open",supportCount:0,createdAt:now,updatedAt:now,
    displayName:"Anonymous Student",isAnonymous:true
  };
  const privateData={
    issueId:issueRef.id,authorUid:request.auth.uid,
    createdAt:now
  };
  const batch=db.batch();
  batch.set(issueRef,publicIssue); batch.set(privateRef,privateData);
  await batch.commit();
  return {id:issueRef.id};
});

exports.onIssueCreated=onDocumentCreated("issues/{issueId}",async(event)=>{
  const data=event.data?.data(); if(!data)return;
  const admins=await db.collection("users").where("role","in",["moderator","platformAdmin"]).get();
  const batch=db.batch();
  admins.forEach(u=>{const ref=db.collection("notifications").doc();
    batch.set(ref,{uid:u.id,type:"issue",title:"New campus issue",body:data.title,targetId:event.params.issueId,read:false,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  if(!admins.empty) await batch.commit();
});

exports.onReportCreated=onDocumentCreated("reports/{reportId}",async(event)=>{
  const data=event.data?.data(); if(!data)return;
  const admins=await db.collection("users").where("role","in",["moderator","platformAdmin"]).get();
  const batch=db.batch();
  admins.forEach(u=>{const ref=db.collection("notifications").doc();
    batch.set(ref,{uid:u.id,type:"report",title:"New moderation report",body:data.category||"A new report needs review",targetId:event.params.reportId,read:false,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  });
  if(!admins.empty) await batch.commit();
});

async function actorRole(uid){
  const snap=await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.data().role || "student") : "student";
}
async function requireStaff(request){
  if(!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
  const role=await actorRole(request.auth.uid);
  if(!["moderator","platformAdmin"].includes(role)) throw new HttpsError("permission-denied","Staff access required.");
  return {uid:request.auth.uid,role};
}
exports.setUserSuspension=onCall(async(request)=>{
  const {uid:actor}=await requireStaff(request), d=request.data||{}, target=String(d.uid||"");
  if(!target) throw new HttpsError("invalid-argument","User id required.");
  if(target===actor) throw new HttpsError("failed-precondition","You cannot suspend yourself.");
  const suspended=Boolean(d.suspended);
  await db.collection("users").doc(target).set({suspended,moderationUpdatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:suspended?"suspend_user":"reactivate_user",targetId:target,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,suspended};
});
exports.setUserRole=onCall(async(request)=>{
  const {uid:actor,role:actorRoleName}=await requireStaff(request);
  if(actorRoleName!=="platformAdmin") throw new HttpsError("permission-denied","Platform admin required.");
  const d=request.data||{}, target=String(d.uid||""), role=String(d.role||"student");
  if(!target||!["student","moderator","platformAdmin"].includes(role)) throw new HttpsError("invalid-argument","Invalid user or role.");
  await db.collection("users").doc(target).set({role,roleUpdatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:"set_user_role",targetId:target,role,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,role};
});
exports.approveGroup=onCall(async(request)=>{
  const {uid:actor}=await requireStaff(request), d=request.data||{}, id=String(d.groupId||"");
  if(!id) throw new HttpsError("invalid-argument","Group id required.");
  await db.collection("groups").doc(id).set({approvalStatus:"approved",moderatedBy:actor,moderatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:"approve_group",targetId:id,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true};
});

exports.reviewReport=onCall(async(request)=>{
 const {uid:actor}=await requireStaff(request); const d=request.data||{}, id=String(d.reportId||""), status=String(d.status||"");
 if(!id||!["reviewed","resolved","dismissed"].includes(status)) throw new HttpsError("invalid-argument","Invalid report review.");
 await db.collection("reports").doc(id).set({status,moderatorNote:String(d.note||"").slice(0,500),reviewedBy:actor,reviewedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 await db.collection("auditLogs").add({action:"review_report",targetId:id,status,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 return {ok:true};
});
exports.reviewGroupRequest=onCall(async(request)=>{
 const {uid:actor}=await requireStaff(request); const d=request.data||{}, id=String(d.requestId||""), decision=String(d.decision||"");
 if(!id||!["approved","rejected"].includes(decision)) throw new HttpsError("invalid-argument","Invalid membership decision.");
 const ref=db.collection("groupRequests").doc(id), snap=await ref.get(); if(!snap.exists) throw new HttpsError("not-found","Request not found.");
 const r=snap.data(); await ref.set({status:decision,reviewedBy:actor,reviewedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 if(decision==="approved"){ const member=db.collection("groupMembers").doc(`${r.groupId}_${r.uid}`); await member.set({groupId:r.groupId,uid:r.uid,role:"member",joinedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}); await db.collection("notifications").add({uid:r.uid,type:"group",title:"Group request approved",body:"Your membership request was approved.",targetId:r.groupId,read:false,createdAt:admin.firestore.FieldValue.serverTimestamp()}); }
 return {ok:true,decision};
});

const groupAdminRole = async (uid, groupId) => {
  const userSnap = await db.doc(`users/${uid}`).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role === "platformAdmin") return true;
  const member = await db.doc(`groups/${groupId}/members/${uid}`).get();
  return member.exists && ["owner","admin","moderator"].includes(member.data().role);
};
exports.approveGroupMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
  const {groupId, uid} = request.data || {};
  if (!groupId || !uid) throw new HttpsError("invalid-argument","groupId and uid are required.");
  if (!(await groupAdminRole(request.auth.uid, groupId))) throw new HttpsError("permission-denied","Group admin access required.");
  await db.doc(`groups/${groupId}/members/${uid}`).set({uid,role:"member",joinedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.doc(`groups/${groupId}/joinRequests/${uid}`).delete();
  await db.collection("notifications").add({uid,type:"group_request_approved",groupId,createdAt:FieldValue.serverTimestamp(),read:false});
  return {ok:true};
});
exports.rejectGroupMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
  const {groupId, uid} = request.data || {};
  if (!groupId || !uid) throw new HttpsError("invalid-argument","groupId and uid are required.");
  if (!(await groupAdminRole(request.auth.uid, groupId))) throw new HttpsError("permission-denied","Group admin access required.");
  await db.doc(`groups/${groupId}/joinRequests/${uid}`).delete();
  return {ok:true};
});
exports.removeGroupMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
  const {groupId, uid} = request.data || {};
  if (!groupId || !uid) throw new HttpsError("invalid-argument","groupId and uid are required.");
  if (!(await groupAdminRole(request.auth.uid, groupId))) throw new HttpsError("permission-denied","Group admin access required.");
  await db.doc(`groups/${groupId}/members/${uid}`).delete();
  return {ok:true};
});
