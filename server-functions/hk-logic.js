"use strict";
// Business logic for the Hackathons backend. Kept free of firebase-functions imports so it can be unit tested
// with a fake Firestore (see tools/test-hk-logic.js). index.js wires these into callable functions and triggers.
const { renderEmail, KINDS, FROM_ADDRESS, FROM_NAME } = require("./hk-templates");

class HkError extends Error { constructor(code, message) { super(message); this.code = code; } }
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mask = e => String(e).replace(/^(.).*(@.*)$/, "$1•••$2");
const MAIL_COOLDOWN_MS = 20 * 1000;

async function getDoc(db, col, id) { const s = await db.collection(col).doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; }

async function isStaff(db, uid) { const u = await getDoc(db, "users", uid); return !!u && ["platformAdmin", "moderator"].includes(u.role); }

// status -> email kind for automatic status emails
const STATUS_KIND = { shortlisted: "shortlisted", selected: "selected", waitlisted: "waitlisted", rejected: "rejected" };

async function deliver({ db, send, now, hk, reg, kind, note, roundName, by, auto }) {
  const mail = renderEmail(kind, { hackathon: hk, hackathonId: hk.id, reg, round: roundName, note });
  await send({ to: reg.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: (hk.organiser && hk.organiser.email) || hk.contactEmail || undefined });
  await db.collection("hkMailLog").add({ hackathonId: hk.id, hostUid: hk.hostUid, registrationId: reg.id, to: reg.email, kind, subject: mail.subject, by: by || "system", auto: !!auto, createdAtMs: now });
  await db.collection("hkRegistrations").doc(reg.id).update({ lastMailAtMs: now, lastMailKind: kind });
  if (reg.uid) {
    await db.collection("hkNotifications").add({ toUid: reg.uid, fromUid: by || "system", hackathonId: hk.id, type: "status", title: mail.subject, body: note ? clean(note, 160) : `An email was sent to ${mask(reg.email)}.`, read: false, createdAtMs: now });
  }
  return mail;
}

// Host presses "Notify Team": sends a status-update template to the team leader (the registrant).
async function notifyTeamCore({ db, send, now = Date.now(), auth, data }) {
  if (!auth) throw new HkError("unauthenticated", "Sign in required.");
  const d = data || {};
  const regId = clean(d.registrationId, 200), kind = clean(d.kind, 40);
  if (!regId) throw new HkError("invalid-argument", "Pick a participant first.");
  if (!KINDS[kind]) throw new HkError("invalid-argument", "Choose an email template.");
  const reg = await getDoc(db, "hkRegistrations", regId);
  if (!reg) throw new HkError("not-found", "Registration not found.");
  const hk = await getDoc(db, "hkHackathons", reg.hackathonId);
  if (!hk) throw new HkError("not-found", "Hackathon not found.");
  if (hk.hostUid !== auth.uid && !(await isStaff(db, auth.uid))) throw new HkError("permission-denied", "Only the host of this hackathon can send team emails.");
  if (!EMAIL.test(reg.email || "")) throw new HkError("failed-precondition", "This team leader has no valid email address.");
  if (reg.lastMailAtMs && now - reg.lastMailAtMs < MAIL_COOLDOWN_MS) throw new HkError("resource-exhausted", "An email was just sent to this team. Please wait a few seconds.");
  const note = clean(d.note, 1500);
  if (kind === "custom" && note.length < 3) throw new HkError("invalid-argument", "Write your message for a custom email.");
  const names = (hk.rounds || []).map(r => r.name);
  const roundName = names.includes(d.roundName) ? d.roundName : (hk.rounds || [])[Math.min(reg.stage || 0, Math.max(0, names.length - 1))]?.name || "";
  await deliver({ db, send, now, hk, reg, kind, note, roundName, by: auth.uid, auto: false });
  return { ok: true, to: mask(reg.email), kind };
}

// Firestore trigger: a new registration -> confirmation email to the team leader.
async function onRegistrationCreatedCore({ db, send, now = Date.now(), id, reg }) {
  if (!reg || !EMAIL.test(reg.email || "")) return { skipped: "no-email" };
  const hk = await getDoc(db, "hkHackathons", reg.hackathonId);
  if (!hk || hk.autoEmail === false) return { skipped: "disabled" };
  await deliver({ db, send, now, hk, reg: { ...reg, id }, kind: "registration_confirmation", auto: true });
  return { sent: true };
}

// Firestore trigger: status or round changed -> automatic status email (unless the host turned it off).
async function onRegistrationUpdatedCore({ db, send, now = Date.now(), id, before, after }) {
  if (!before || !after || !EMAIL.test(after.email || "")) return { skipped: "no-email" };
  if (before.lastMailAtMs !== after.lastMailAtMs) return { skipped: "own-write" }; // our own bookkeeping update
  const hk = await getDoc(db, "hkHackathons", after.hackathonId);
  if (!hk || hk.autoEmail === false) return { skipped: "disabled" };
  let kind = null, roundName = "";
  if (before.status !== after.status) kind = STATUS_KIND[after.status] || null;
  else if ((before.stage || 0) !== (after.stage || 0) && after.status !== "rejected") { kind = "shortlisted"; }
  if (!kind) return { skipped: "no-change" };
  roundName = ((hk.rounds || [])[after.stage || 0] || {}).name || "";
  await deliver({ db, send, now, hk, reg: { ...after, id }, kind, roundName, auto: true });
  return { sent: true, kind };
}

/* ---------------- tests (screening quizzes) ---------------- */
async function loadTestFor({ db, auth, hid, now }) {
  if (!auth) throw new HkError("unauthenticated", "Sign in required.");
  const reg = await getDoc(db, "hkRegistrations", `${hid}_${auth.uid}`);
  if (!reg || reg.status === "rejected") throw new HkError("permission-denied", "Only registered participants can take this test.");
  const meta = await getDoc(db, "hkTests", hid);
  const keys = await getDoc(db, "hkTestKeys", hid);
  if (!meta || !keys || !Array.isArray(keys.questions) || !keys.questions.length) throw new HkError("not-found", "No test is set up for this hackathon.");
  if (meta.startMs && now < meta.startMs) throw new HkError("failed-precondition", "The test has not started yet.");
  if (meta.endMs && now > meta.endMs) throw new HkError("failed-precondition", "The test window is over.");
  return { reg, meta, keys };
}

async function startTestCore({ db, now = Date.now(), auth, data }) {
  const hid = clean(data && data.hackathonId, 200);
  const { meta, keys } = await loadTestFor({ db, auth, hid, now });
  const aid = `${hid}_${auth.uid}`;
  let att = await getDoc(db, "hkAttempts", aid);
  if (att && att.submittedAtMs) throw new HkError("already-exists", "You have already submitted this test.");
  if (!att) {
    att = { hackathonId: hid, hostUid: meta.hostUid, uid: auth.uid, startedAtMs: now, submittedAtMs: 0, score: null, total: keys.questions.reduce((s, q) => s + (+q.marks || 1), 0) };
    await db.collection("hkAttempts").doc(aid).set(att);
  }
  const limit = (+meta.durationMin || 30) * 60 * 1000;
  const questions = keys.questions.map(q => ({ id: q.id, text: q.text, options: q.options, marks: +q.marks || 1 }));
  return { questions, startedAtMs: att.startedAtMs, deadlineMs: Math.min(att.startedAtMs + limit, meta.endMs || Infinity), title: meta.title || "Screening test" };
}

async function submitTestCore({ db, now = Date.now(), auth, data }) {
  const hid = clean(data && data.hackathonId, 200);
  const { meta, keys } = await loadTestFor({ db, auth, hid, now: now - 60 * 1000 }); // 1 min grace after the window
  const aid = `${hid}_${auth.uid}`;
  const att = await getDoc(db, "hkAttempts", aid);
  if (!att) throw new HkError("failed-precondition", "Start the test first.");
  if (att.submittedAtMs) throw new HkError("already-exists", "You have already submitted this test.");
  const limit = (+meta.durationMin || 30) * 60 * 1000;
  if (now > att.startedAtMs + limit + 60 * 1000) throw new HkError("deadline-exceeded", "Time is up. Your attempt was not accepted.");
  const ans = (data && data.answers) || {};
  let score = 0, total = 0;
  for (const q of keys.questions) { const m = +q.marks || 1; total += m; if (Number.isInteger(ans[q.id]) && ans[q.id] === keys.answers[q.id]) score += m; }
  await db.collection("hkAttempts").doc(aid).update({ answers: ans, score, total, submittedAtMs: now });
  return { score, total };
}

/* ---------------- public stats for the landing page ---------------- */
async function publicStatsCore({ db, now = Date.now() }) {
  const cached = await getDoc(db, "publicStats", "summary");
  if (cached && now - (cached.updatedAtMs || 0) < 10 * 60 * 1000) return pick(cached);
  const c = async q => (await q.count().get()).data().count;
  let students = await c(db.collection("users").where("isActive", "==", true));
  if (!students) students = await c(db.collection("users"));
  const clubs = await c(db.collection("groups").where("status", "==", "approved"));
  const resolvedIssues = await c(db.collection("issues").where("status", "==", "Resolved"));
  const hackathons = await c(db.collection("hkHackathons").where("status", "==", "approved"));
  const out = { students, clubs, resolvedIssues, hackathons, updatedAtMs: now };
  await db.collection("publicStats").doc("summary").set(out);
  return pick(out);
}
const pick = s => ({ students: s.students || 0, clubs: s.clubs || 0, resolvedIssues: s.resolvedIssues || 0, hackathons: s.hackathons || 0, updatedAtMs: s.updatedAtMs || 0 });

module.exports = { HkError, notifyTeamCore, onRegistrationCreatedCore, onRegistrationUpdatedCore, startTestCore, submitTestCore, publicStatsCore, FROM_ADDRESS, FROM_NAME };
