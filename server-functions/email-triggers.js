"use strict";
// Cloud Functions coordination layer for Automated Event-Driven Emails.
// Enriches partial Firestore event payloads with recipient emails & entity details,
// generates the personalized HTML template via email-notifications.js, dispatches
// via Nodemailer SMTP, and records an audit trail in emailNotificationLogs.

let admin = null;
try { admin = require("firebase-admin"); } catch {}
const serverTimestamp = () =>
  admin && admin.firestore && admin.firestore.FieldValue
    ? admin.firestore.FieldValue.serverTimestamp()
    : new Date();
const {
  detectEventType,
  generateNotificationEmail,
  fmtDate
} = require("./email-notifications");

async function safeGetDoc(db, col, id) {
  if (!db || !col || !id) return null;
  try {
    const snap = await db.collection(col).doc(String(id)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.warn(`[auto-email] Failed reading ${col}/${id}:`, err.message);
    return null;
  }
}

/**
 * Enriches an incoming event payload from Firestore collections (users, events, issues, issuePrivate, groups)
 * so both Firestore document triggers and Admin Studio test calls receive full personalized data.
 */
async function enrichPayload(db, rawPayload = {}, context = {}) {
  const src = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};
  const detection = detectEventType(src, context);
  const eventType = detection.eventType;

  // 1. Event enrichment (eventInterest or events)
  if ((eventType === "event_registration" || eventType === "event_approved") && src.eventId && !src.eventTitle) {
    const ev = await safeGetDoc(db, "events", src.eventId);
    if (ev) {
      src.eventTitle = ev.title || src.eventTitle;
      src.eventOrganizer = ev.organizer || src.eventOrganizer;
      src.eventDate = ev.date || src.eventDate;
      src.eventVenue = ev.venue || src.eventVenue;
      src.eventStatus = ev.status || src.eventStatus;
    }
  }
  if (eventType === "event_registration" && (src.uid || src.userId) && (!src.recipientEmail || !src.recipientName)) {
    const u = await safeGetDoc(db, "users", src.uid || src.userId);
    if (u) {
      src.recipientName = src.recipientName || u.displayName || "Student";
      src.recipientEmail = src.recipientEmail || u.email || "";
      src.course = src.course || u.course;
      src.branch = src.branch || u.branch;
      src.year = src.year || u.year;
    }
  }
  if (eventType === "event_approved" && src.createdBy && (!src.recipientEmail || !src.recipientName)) {
    const host = await safeGetDoc(db, "users", src.createdBy);
    if (host) {
      src.recipientName = src.recipientName || host.displayName || "Event Organizer";
      src.recipientEmail = src.recipientEmail || host.email || "";
    }
  }

  // 2. Issue enrichment (respects anonymous issue privacy: looks up issuePrivate only on server)
  if (eventType === "issue_update" || eventType === "issue_resolved" || eventType === "issue_created") {
    const issueId = src.issueId || src.id;
    if (issueId && !src.issueTitle && !src.title) {
      const iss = await safeGetDoc(db, "issues", issueId);
      if (iss) {
        src.issueTitle = iss.title;
        src.issueCategory = iss.category;
        src.issueSeverity = iss.severity;
        src.issueLocation = iss.location;
        src.issueStatus = src.issueStatus || iss.status;
        src.adminResponse = src.adminResponse || iss.adminResponse;
        src.issueDescription = iss.description;
      }
    }
    if ((eventType === "issue_update" || eventType === "issue_resolved") && issueId && !src.recipientEmail) {
      let reporterUid = src.authorUid || "";
      if (!reporterUid) {
        const priv = await safeGetDoc(db, "issuePrivate", issueId);
        if (priv && priv.authorUid) reporterUid = priv.authorUid;
      }
      if (!reporterUid) {
        const iss = await safeGetDoc(db, "issues", issueId);
        if (iss && iss.authorUid) reporterUid = iss.authorUid;
      }
      if (reporterUid && reporterUid !== "anon") {
        const u = await safeGetDoc(db, "users", reporterUid);
        if (u) {
          src.recipientName = src.recipientName || u.displayName || "Campus Student";
          src.recipientEmail = src.recipientEmail || u.email || "";
        }
      }
    }
  }

  // 3. Community / Group join request enrichment
  if (
    eventType === "community_join_request" ||
    eventType === "community_join_approved" ||
    eventType === "community_join_rejected"
  ) {
    let grp = null;
    if (src.groupId && (!src.communityName || !src.groupName || eventType === "community_join_request")) {
      grp = await safeGetDoc(db, "groups", src.groupId);
      if (grp) {
        src.communityName = src.communityName || grp.name;
        src.communityCategory = src.communityCategory || grp.category;
      }
    }
    if (src.uid && (!src.requesterName || (eventType !== "community_join_request" && !src.recipientEmail))) {
      const memberUser = await safeGetDoc(db, "users", src.uid);
      if (memberUser) {
        src.requesterName = src.requesterName || src.displayName || memberUser.displayName || "Student";
        src.course = src.course || memberUser.course;
        src.branch = src.branch || memberUser.branch;
        src.year = src.year || memberUser.year;
        if (eventType !== "community_join_request") {
          src.recipientName = src.recipientName || memberUser.displayName || "Student";
          src.recipientEmail = src.recipientEmail || memberUser.email || "";
        }
      }
    }
    // For new join request, email goes to group leader/creator
    if (eventType === "community_join_request" && grp && grp.createdBy && !src.recipientEmail) {
      const leader = await safeGetDoc(db, "users", grp.createdBy);
      if (leader) {
        src.recipientName = src.recipientName || leader.displayName || "Community Leader";
        src.recipientEmail = src.recipientEmail || leader.email || "";
      }
    }
  }

  return { enriched: src, detection };
}

async function logAutoEmail(db, { eventType, to, subject, status, actorUid, source, error = "" }) {
  if (!db) return;
  try {
    await db.collection("emailNotificationLogs").add({
      eventType,
      recipientEmail: to || "",
      subject: String(subject || "").slice(0, 200),
      status, // 'sent' | 'skipped_no_email' | 'preview' | 'failed'
      source: source || "trigger",
      actorUid: actorUid || "system",
      error: error ? String(error).slice(0, 300) : "",
      createdAt: serverTimestamp(),
      createdAtMs: Date.now()
    });
  } catch (e) {
    console.warn("[auto-email] Log write skipped:", e.message);
  }
}

/**
 * Generates & optionally sends an automated notification email for a given event payload.
 */
async function processAutomatedEmail({
  db,
  send,
  payload = {},
  context = {},
  overrides = {},
  placeholders = {},
  keepPlaceholders = false,
  sendNow = false,
  actorUid = "system",
  source = "trigger"
}) {
  const { enriched } = await enrichPayload(db, payload, context);
  const generated = generateNotificationEmail(enriched, {
    eventType: context.eventType || payload.eventType,
    context,
    overrides,
    placeholders,
    keepPlaceholders
  });

  const to = String(
    (placeholders && placeholders.recipientEmail) ||
      enriched.recipientEmail ||
      generated.variables.recipientEmail ||
      ""
  ).trim();

  if (!sendNow) {
    return {
      ok: true,
      dispatched: false,
      recipientEmail: to,
      ...generated
    };
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await logAutoEmail(db, {
      eventType: generated.eventType,
      to,
      subject: generated.subject,
      status: "skipped_no_email",
      actorUid,
      source
    });
    return {
      ok: false,
      dispatched: false,
      reason: "Recipient email address missing or invalid.",
      recipientEmail: to,
      ...generated
    };
  }

  try {
    await send({
      to,
      subject: generated.subject,
      html: generated.html,
      text: generated.text
    });
    await logAutoEmail(db, {
      eventType: generated.eventType,
      to,
      subject: generated.subject,
      status: "sent",
      actorUid,
      source
    });
    return {
      ok: true,
      dispatched: true,
      recipientEmail: to,
      ...generated
    };
  } catch (err) {
    await logAutoEmail(db, {
      eventType: generated.eventType,
      to,
      subject: generated.subject,
      status: "failed",
      actorUid,
      source,
      error: err && err.message ? err.message : String(err)
    });
    throw err;
  }
}

module.exports = {
  enrichPayload,
  processAutomatedEmail,
  logAutoEmail,
  fmtDate
};
