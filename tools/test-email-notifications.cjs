// Unit tests for Automated Event-Driven Email Notification Engine & Coordinator.
// Run: node tools/test-email-notifications.cjs
const assert = require("assert");
const E = require("../server-functions/email-notifications");
const T = require("../server-functions/email-triggers");

function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  let seq = 0;
  const col = (name) => (data[name] = data[name] || {});
  return {
    _data: data,
    collection: (name) => ({
      doc: (id) => ({
        get: async () => ({
          exists: Boolean(col(name)[id]),
          id,
          data: () => ({ ...col(name)[id] })
        }),
        set: async (v, opts) => {
          col(name)[id] = opts && opts.merge ? { ...(col(name)[id] || {}), ...v } : { ...v };
        }
      }),
      add: async (v) => {
        const id = "log_" + ++seq;
        col(name)[id] = { ...v };
        return { id };
      }
    })
  };
}

(async () => {
  // 1. Explicit alias detection & status promotion
  assert.strictEqual(E.detectEventType({ eventType: "eventRegistration" }).eventType, "event_registration");
  assert.strictEqual(E.detectEventType({ type: "group_join_request" }).eventType, "community_join_request");
  assert.strictEqual(E.detectEventType({ eventType: "issue_update", status: "Resolved" }).eventType, "issue_resolved");

  // 2. Collection + action auto-detection
  assert.strictEqual(E.detectEventType({ collection: "eventInterest", eventId: "e1", uid: "u1" }).eventType, "event_registration");
  assert.strictEqual(E.detectEventType({ collection: "issues", action: "create", status: "Open", title: "Broken light" }).eventType, "issue_created");
  assert.strictEqual(E.detectEventType({ collection: "issues", action: "update", status: "In Progress", adminResponse: "Working on it" }).eventType, "issue_update");
  assert.strictEqual(E.detectEventType({ collection: "issues", action: "update", status: "Resolved" }).eventType, "issue_resolved");
  assert.strictEqual(E.detectEventType({ collection: "groupRequests", action: "create", status: "pending" }).eventType, "community_join_request");
  assert.strictEqual(E.detectEventType({ collection: "groupRequests", action: "update", status: "approved" }).eventType, "community_join_approved");
  assert.strictEqual(E.detectEventType({ collection: "groupRequests", action: "update", status: "rejected" }).eventType, "community_join_rejected");

  // 3. Heuristic detection from raw JSON payloads with NO explicit eventType or collection
  assert.strictEqual(E.detectEventType({ eventTitle: "AI Summit", eventVenue: "Audi", registrationId: "R-10" }).eventType, "event_registration");
  assert.strictEqual(E.detectEventType({ issueTitle: "Slow Wi-Fi", adminResponse: "Router replaced", status: "Resolved" }).eventType, "issue_resolved");
  assert.strictEqual(E.detectEventType({ issueTitle: "Slow Wi-Fi", previousStatus: "Open", status: "In Progress" }).eventType, "issue_update");
  assert.strictEqual(E.detectEventType({ communityName: "Campus Coders", requesterName: "Ananya", status: "pending" }).eventType, "community_join_request");
  assert.strictEqual(E.detectEventType({ groupName: "Robotics Club", requesterName: "Aarav", status: "approved" }).eventType, "community_join_approved");

  // 4. Placeholder interpolation, raw {{placeholder}} blueprint mode & XSS safety
  for (const key of Object.keys(E.EVENT_TYPES)) {
    const rawTpl = E.generateNotificationEmail({}, { eventType: key, keepPlaceholders: true });
    assert(rawTpl.html.includes("{{recipientName}}"), `raw template ${key} must keep {{recipientName}}`);
    assert(rawTpl.subject.includes("{{"), `raw subject ${key} should contain placeholder token`);
    assert(rawTpl.text.includes("{{actionUrl}}"), `raw text ${key} must keep {{actionUrl}}`);
  }

  const personalized = E.generateNotificationEmail({
    eventTitle: 'Hacknight <script>alert(1)</script>',
    recipientName: 'Aarav "Ace" Sharma',
    recipientEmail: 'aarav@campus.edu',
    eventVenue: 'Main Lab B',
    organiserNote: 'Line 1\n<img src=x onerror=alert(1)>',
    actionUrl: 'javascript:alert(1)'
  }, { eventType: 'event_registration' });

  assert(personalized.subject.includes('Hacknight <script>alert(1)</script>'));
  assert(!personalized.html.includes('<script>'), 'script tags must be escaped in HTML');
  assert(!personalized.html.includes('<img src=x'), 'img tags in notes must be escaped in HTML');
  assert(!personalized.html.includes('javascript:alert'), 'unsafe javascript: URLs must be rejected');
  assert(personalized.html.includes('Aarav &quot;Ace&quot; Sharma'));
  assert(personalized.html.includes('Line 1<br>&lt;img src=x'));

  // 5. Mock Firestore enrichment + SMTP dispatch via email-triggers coordinator
  const db = fakeDb({
    users: {
      u_stu: { displayName: "Meera Nair", email: "meera@campus.edu", course: "B.Tech", branch: "IT", year: "3rd Year" },
      u_lead: { displayName: "Rohan Verma", email: "rohan@campus.edu" }
    },
    events: {
      ev_1: { title: "Open Source Sprint", organizer: "FOSS Club", venue: "Seminar Hall 1", date: "2026-11-22T11:00:00+05:30" }
    },
    issues: {
      iss_1: { title: "Projector flickering in Room 204", category: "Classroom", location: "Room 204", status: "Resolved", adminResponse: "HDMI cable and lamp replaced." }
    },
    issuePrivate: {
      iss_1: { issueId: "iss_1", authorUid: "u_stu" }
    },
    groups: {
      grp_1: { name: "Campus Coders", category: "Technology", createdBy: "u_lead" }
    }
  });

  const sent = [];
  const send = async (m) => sent.push(m);

  // A. Event interest trigger payload
  const evRes = await T.processAutomatedEmail({
    db, send,
    payload: { collection: "eventInterest", action: "create", eventId: "ev_1", uid: "u_stu" },
    sendNow: true,
    source: "test:eventInterest"
  });
  assert.strictEqual(evRes.ok, true);
  assert.strictEqual(evRes.dispatched, true);
  assert.strictEqual(evRes.eventType, "event_registration");
  assert.strictEqual(sent[0].to, "meera@campus.edu");
  assert(sent[0].html.includes("Open Source Sprint") && sent[0].html.includes("Seminar Hall 1"));

  // B. Anonymous issue resolved lookup via issuePrivate -> users
  const issRes = await T.processAutomatedEmail({
    db, send,
    payload: { collection: "issues", action: "update", issueId: "iss_1", status: "Resolved", previousStatus: "In Progress", adminResponse: "HDMI cable and lamp replaced." },
    sendNow: true,
    source: "test:issueResolved"
  });
  assert.strictEqual(issRes.dispatched, true);
  assert.strictEqual(issRes.eventType, "issue_resolved");
  assert.strictEqual(sent[1].to, "meera@campus.edu");
  assert(sent[1].html.includes("HDMI cable and lamp replaced."));

  // C. Community join request notifies group leader
  const grpReqRes = await T.processAutomatedEmail({
    db, send,
    payload: { collection: "groupRequests", action: "create", groupId: "grp_1", uid: "u_stu", status: "pending" },
    sendNow: true,
    source: "test:groupRequest"
  });
  assert.strictEqual(grpReqRes.dispatched, true);
  assert.strictEqual(grpReqRes.eventType, "community_join_request");
  assert.strictEqual(sent[2].to, "rohan@campus.edu");
  assert(sent[2].html.includes("Meera Nair") && sent[2].html.includes("Campus Coders"));

  assert.strictEqual(Object.keys(db._data.emailNotificationLogs).length, 3);
  console.log("All automated email notification tests passed!");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
