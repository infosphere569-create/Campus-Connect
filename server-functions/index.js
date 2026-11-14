const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {onDocumentCreated,onDocumentUpdated}=require("firebase-functions/v2/firestore");
const {defineSecret,defineString}=require("firebase-functions/params");
const admin=require("firebase-admin");
admin.initializeApp();
const db=admin.firestore();


// Wraps a callable handler so any *unexpected* thrown error (a real bug, a
// Firestore hiccup, etc) still reaches the client as a readable message
// instead of the SDK's generic "internal" with zero context. Errors already
// thrown as HttpsError (our own validation/permission checks) pass through
// unchanged -- this only adds a safety net around genuine surprises.
function safe(handler){
  return async (request) => {
    try { return await handler(request); }
    catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("Unhandled error in callable function:", err);
      throw new HttpsError("internal", err && err.message ? err.message : "Something went wrong. Please try again.");
    }
  };
}

exports.healthCheck=onCall({cors:true,invoker:"public"},()=>({ok:true,service:"Campus Connect One"}));

exports.submitAnonymousIssue=onCall({cors:true,invoker:"public"},safe(async(request)=>{
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
}));

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
exports.setUserSuspension=onCall({cors:true,invoker:"public"},safe(async(request)=>{
  const {uid:actor}=await requireStaff(request), d=request.data||{}, target=String(d.uid||"");
  if(!target) throw new HttpsError("invalid-argument","User id required.");
  if(target===actor) throw new HttpsError("failed-precondition","You cannot suspend yourself.");
  const suspended=Boolean(d.suspended);
  await db.collection("users").doc(target).set({suspended,moderationUpdatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:suspended?"suspend_user":"reactivate_user",targetId:target,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,suspended};
}));
exports.setUserRole=onCall({cors:true,invoker:"public"},safe(async(request)=>{
  const {uid:actor,role:actorRoleName}=await requireStaff(request);
  if(actorRoleName!=="platformAdmin") throw new HttpsError("permission-denied","Platform admin required.");
  const d=request.data||{}, target=String(d.uid||""), role=String(d.role||"student");
  if(!target||!["student","moderator","platformAdmin"].includes(role)) throw new HttpsError("invalid-argument","Invalid user or role.");
  await db.collection("users").doc(target).set({role,roleUpdatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:"set_user_role",targetId:target,role,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true,role};
}));
exports.approveGroup=onCall({cors:true,invoker:"public"},safe(async(request)=>{
  const {uid:actor}=await requireStaff(request), d=request.data||{}, id=String(d.groupId||"");
  if(!id) throw new HttpsError("invalid-argument","Group id required.");
  // groups.js's public list and admin.js's own approve button both key off "status", not
  // "approvalStatus" -- this used to write a field nothing ever read.
  await db.collection("groups").doc(id).set({status:"approved",moderatedBy:actor,moderatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  await db.collection("auditLogs").add({action:"approve_group",targetId:id,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
  return {ok:true};
}));

exports.reviewReport=onCall({cors:true,invoker:"public"},safe(async(request)=>{
 const {uid:actor}=await requireStaff(request); const d=request.data||{}, id=String(d.reportId||""), status=String(d.status||"");
 if(!id||!["reviewed","resolved","dismissed"].includes(status)) throw new HttpsError("invalid-argument","Invalid report review.");
 await db.collection("reports").doc(id).set({status,moderatorNote:String(d.note||"").slice(0,500),reviewedBy:actor,reviewedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 await db.collection("auditLogs").add({action:"review_report",targetId:id,status,actorUid:actor,createdAt:admin.firestore.FieldValue.serverTimestamp()});
 return {ok:true};
}));
exports.reviewGroupRequest=onCall({cors:true,invoker:"public"},safe(async(request)=>{
 const {uid:actor}=await requireStaff(request); const d=request.data||{}, id=String(d.requestId||""), decision=String(d.decision||"");
 if(!id||!["approved","rejected"].includes(decision)) throw new HttpsError("invalid-argument","Invalid membership decision.");
 const ref=db.collection("groupRequests").doc(id), snap=await ref.get(); if(!snap.exists) throw new HttpsError("not-found","Request not found.");
 const r=snap.data(); await ref.set({status:decision,reviewedBy:actor,reviewedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
 if(decision==="approved"){ const member=db.collection("groupMembers").doc(`${r.groupId}_${r.uid}`); await member.set({groupId:r.groupId,uid:r.uid,role:"member",joinedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}); await db.collection("groups").doc(r.groupId).update({memberCount:admin.firestore.FieldValue.increment(1)}).catch(()=>{}); await db.collection("notifications").add({uid:r.uid,type:"group",title:"Group request approved",body:"Your membership request was approved.",targetId:r.groupId,read:false,createdAt:admin.firestore.FieldValue.serverTimestamp()}); }
 return {ok:true,decision};
}));
exports.broadcastGroupMessage=onCall({cors:true,invoker:"public"},safe(async(request)=>{
 if(!request.auth) throw new HttpsError("unauthenticated","Sign in required.");
 const d=request.data||{}, groupId=String(d.groupId||""), text=String(d.text||"").trim().slice(0,2000);
 if(!groupId||!text) throw new HttpsError("invalid-argument","Group id and message are required.");
 const groupSnap=await db.collection("groups").doc(groupId).get();
 if(!groupSnap.exists) throw new HttpsError("not-found","Group not found.");
 const role=await actorRole(request.auth.uid);
 const isLeader=groupSnap.data().createdBy===request.auth.uid;
 if(!isLeader && !["moderator","platformAdmin"].includes(role)) throw new HttpsError("permission-denied","Only the group leader or staff can broadcast to all members.");
 const userSnap=await db.collection("users").doc(request.auth.uid).get();
 const authorName=userSnap.exists ? (userSnap.data().displayName||"Group leader") : "Group leader";
 const now=admin.firestore.FieldValue.serverTimestamp();
 const msgRef=db.collection("groups").doc(groupId).collection("messages").doc();
 await msgRef.set({text,authorId:request.auth.uid,authorName,broadcast:true,pinned:false,createdAt:now});
 const members=await db.collection("groupMembers").where("groupId","==",groupId).get();
 const batch=db.batch();
 members.forEach(m=>{
  const uid=m.data().uid; if(!uid||uid===request.auth.uid) return;
  const ref=db.collection("notifications").doc();
  batch.set(ref,{uid,type:"group_broadcast",title:`Announcement in ${groupSnap.data().name||"your group"}`,body:text.slice(0,140),targetId:groupId,read:false,createdAt:now});
 });
 if(!members.empty) await batch.commit();
 return {ok:true,id:msgRef.id};
}));

// NOTE: this file used to also export approveGroupMember/rejectGroupMember/removeGroupMember,
// a SECOND, entirely different group-membership system built on groups/{id}/members/{uid} and
// groups/{id}/joinRequests/{uid} subcollections. It was never called from any page (group.html /
// admin.html only ever use groupRequests + groupMembers, above), it also referenced an undefined
// `FieldValue` (would have crashed at runtime instead of the imported `admin.firestore.FieldValue`),
// and it disagreed with firestore.rules and every client query about where membership data lives.
// Removed rather than fixed, per "do not maintain two competing systems": groupRequests +
// groupMembers (flat top-level collections, reviewed via reviewGroupRequest above) is the one
// architecture every page, the rules, and this file now agree on.

exports.subscribeNewsletter = onCall({cors: true, invoker: "public"}, safe(async (request) => {
  const data = request.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  await db.collection("newsletterSubscribers").add({
    email: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return {ok: true};
}));

exports.submitContactForm = onCall({cors: [/https:\/\/campusconnectone\.online$/], invoker: "public"}, safe(async (request) => {
  const data = request.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  // Save to a specific collection that the Firebase "Trigger Email" extension listens to
  await db.collection("mail").add({
    to: "support@campusconnectone.online",
    message: {
      subject: `New Contact Request: ${data.category || "General Inquiry"}`,
      text: `Name: ${data.name}\nEmail: ${data.email}\n\nMessage:\n${data.message}`,
    },
  });

  return {ok: true};
}));


/* =====================================================================
   HACKATHONS MODULE
   Mail goes out from team@campusconnectone.online through your SMTP provider.
   Configure once (see HACKATHONS.md):
     firebase functions:secrets:set SMTP_PASS          (the mailbox password / app password)
     SMTP_HOST, SMTP_PORT, SMTP_USER are asked for at deploy time (params).
   ===================================================================== */
const hk=require("./hk-logic");
const {FROM_ADDRESS,FROM_NAME}=require("./hk-templates");
const SMTP_PASS=defineSecret("SMTP_PASS");
const SMTP_HOST=defineString("SMTP_HOST",{description:"SMTP server for team@campusconnectone.online, e.g. smtp.zoho.com"});
const SMTP_PORT=defineString("SMTP_PORT",{default:"465"});
const SMTP_USER=defineString("SMTP_USER",{default:FROM_ADDRESS});

let transporter=null;
function getTransport(){
  if(transporter) return transporter;
  const nodemailer=require("nodemailer");
  const port=parseInt(SMTP_PORT.value(),10)||465;
  transporter=nodemailer.createTransport({host:SMTP_HOST.value(),port,secure:port===465,auth:{user:SMTP_USER.value(),pass:SMTP_PASS.value()}});
  return transporter;
}
// Always sent *from* team@campusconnectone.online; replies go to the host.
const send=async({to,subject,html,text,replyTo})=>{
  await getTransport().sendMail({from:`"${FROM_NAME}" <${FROM_ADDRESS}>`,to,subject,html,text,replyTo});
};
// Maps logic-layer errors onto Firebase HttpsError so the client sees a readable message.
const wrap=fn=>async(request)=>{
  try{ return await fn(request); }
  catch(e){
    if(e instanceof HttpsError) throw e;
    if(e instanceof hk.HkError) throw new HttpsError(e.code,e.message);
    console.error("hackathons function error:",e);
    throw new HttpsError("internal",e&&e.message?e.message:"Something went wrong. Please try again.");
  }
};

exports.hkNotifyTeam=onCall({cors:true,secrets:[SMTP_PASS]},wrap(r=>hk.notifyTeamCore({db,send,auth:r.auth,data:r.data})));
exports.hkStartTest=onCall({cors:true},wrap(r=>hk.startTestCore({db,auth:r.auth,data:r.data})));
exports.hkSubmitTest=onCall({cors:true},wrap(r=>hk.submitTestCore({db,auth:r.auth,data:r.data})));
exports.hkPublicStats=onCall({cors:true,invoker:"public"},wrap(()=>hk.publicStatsCore({db})));

exports.hkOnRegistrationCreated=onDocumentCreated({document:"hkRegistrations/{id}",secrets:[SMTP_PASS]},async(event)=>{
  try{ await hk.onRegistrationCreatedCore({db,send,id:event.params.id,reg:event.data&&event.data.data()}); }
  catch(e){ console.error("registration email failed:",e); }
});
exports.hkOnRegistrationUpdated=onDocumentUpdated({document:"hkRegistrations/{id}",secrets:[SMTP_PASS]},async(event)=>{
  try{ await hk.onRegistrationUpdatedCore({db,send,id:event.params.id,before:event.data.before.data(),after:event.data.after.data()}); }
  catch(e){ console.error("status email failed:",e); }
});
