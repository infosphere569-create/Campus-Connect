# Hackathons module

Pages (all use the same Firebase project / login as Campus Connect One):

| Route | File | Who |
|---|---|---|
| `/hackthons` | `hackthons.html` | public landing |
| `/login-hackthons` | `login-hackthons.html` | login + role cards (Participant / Host) |
| `/hackthons-portal` | `hackthons-portal.html` | participant + host app (sidebar, bottom nav on mobile) |
| `/hackthons-admin` | `hackthons-admin.html` | staff only (`role` = `platformAdmin` or `moderator`) |

Code: `css/hackathons.css`, `js/hackathons/*` (`hk-core` data/geo/ranking, `hk-ui` cards, `hk-portal`, `hk-host`, `hk-admin`, `hk-bg` animated background).

## Deploy checklist
1. `firebase deploy --only firestore:rules` (collections: `hkProfiles`, `hkHackathons`, `hkRegistrations`, `hkNotifications`, `hkSubmissions`, `hkTests`, `hkTestKeys`, `hkAttempts`, `hkMailLog`, `publicStats`).
2. **Cloud Functions** (needs the Blaze plan) for email, server-graded tests and live landing counters:
   ```
   cd server-functions && npm install
   firebase functions:params:set   # or enter when prompted on deploy: SMTP_HOST, SMTP_PORT, SMTP_USER
   firebase functions:secrets:set SMTP_PASS
   firebase deploy --only functions
   ```
   Mail is sent from `team@campusconnectone.online` through your SMTP mailbox (SMTP_USER = that mailbox). Add SPF/DKIM for the domain so mails do not land in spam. Reply-To is the organiser's contact email and every mail is signed with the organiser name.
   Functions added: `hkNotifyTeam`, `hkStartTest`, `hkSubmitTest`, `hkPublicStats`, `hkOnRegistrationCreated`, `hkOnRegistrationUpdated`.
3. Firebase Storage rules: add (do not replace existing rules):
   ```
   match /hackathons/{uid}/{hid}/{file} {
     allow read: if true;
     allow write: if request.auth != null && request.auth.uid == uid
                  && request.resource.size < 8 * 1024 * 1024
                  && request.resource.contentType.matches('image/.*');
   }
   ```
4. Make yourself admin: set `role: "platformAdmin"` on your doc in `users/{uid}`.
5. Backend self-test (no network): `node tools/test-hk-logic.cjs`.

## Flow
**Role is fixed at login.** Log out and log in again to use the other side (no switching inside the portal).

Participant: Login -> one-time profile form (builds the dashboard) -> Home (Your campus -> Trending -> Nearest) -> Detail -> Register solo or as a team (leader adds members) -> confirmation email -> **My dashboard** per hackathon: round tracker, timed screening test, **Project submission** (idea + repo / demo / video / PPT links), team, key dates.

Host / organiser: Login -> one-time organiser form (name, role, org, contacts; used on every hackathon and email signature) -> Create (6 steps: media -> details -> when/where -> rounds & submissions -> prizes/contact -> review) -> submit for approval -> live -> **Manage**: registrations table (search, filter by status/round, bulk status / round), per-row **Notify Team** mail button (white -> green once a template is chosen; sends to the team leader), submissions review (score + feedback), test builder + results, end registration, announce, CSV and print-ready PDF export.

Emails: automatic on registration and on status / round change (toggle per hackathon: `autoEmail`), plus manual Notify Team with an optional note.
