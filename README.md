# Campus Connect

**Your Campus. Your Community.**

Campus Connect is a responsive student community web platform built with HTML, CSS, modern JavaScript and Firebase. It combines a campus social feed, communities, events, anonymous issue reporting and moderation tools in one coherent application.

## v0.2 highlights

- Premium responsive application shell
- Firebase Auth architecture with email/password and Google support
- Firestore-backed posts, comments, likes and saved-post records
- Firebase Storage image uploads
- Group discovery, category filters and membership requests
- Anonymous issue system with separated public/private issue data
- Issue support voting
- Events and notifications surfaces
- Admin reports, group approval and issue moderation
- Light / Dark / System themes
- Accessibility, loading, empty and error states
- Cloudflare Pages + GitHub compatible static deployment

## Setup

1. Create a Firebase project.
2. Enable Email/Password and optionally Google sign-in in Authentication.
3. Create Firestore and Storage.
4. Add a Firebase Web App.
5. Copy its web configuration into `js/firebase.js`.
6. Deploy `firestore.rules`, `storage.rules` and `firestore.indexes.json` with the Firebase CLI.
7. For production, use Cloud Functions for trusted fan-out, sensitive moderation workflows, notifications and other privileged operations.

Never place Firebase Admin SDK credentials or service account keys in the frontend repository.

## Local development

Use a local HTTP server because the project uses ES modules.

```bash
python -m http.server 5500
```

Then open `http://localhost:5500/`.

## Project structure

See `css/`, `js/`, `assets/`, `functions/` and the root HTML pages.

Core JavaScript modules:

- `firebase.js` — client Firebase initialization
- `auth.js` — authentication and profile bootstrap
- `app.js` — shared application shell
- `services.js` — reusable Firestore/Storage operations
- `algorithm.js` — feed ranking logic
- `theme.js` — Light/Dark/System theme
- page-specific modules for feed, groups, issues, events, profile and admin

## Deployment

### GitHub

Push the repository to GitHub. Do not commit service account files, private secrets or local environment files.

### Cloudflare Pages

Use the GitHub repository as the source.

Build command: none
Output directory: `/`

The app is intended to be hosted as a static frontend communicating with Firebase.

## Firebase indexes and rules

Deploy:

- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`

Review these rules before public launch and adapt them to your exact moderation policy.

## Anonymous issues

Public issue documents deliberately omit the author's UID and profile identity. A separate `issuePrivate/{issueId}` record stores internal metadata and is restricted by Firestore rules.

Do not put a student's identity into the public issue document, issue URL or public UI.

## Production checklist

- Configure authorized domains in Firebase Authentication.
- Review Firestore and Storage rules.
- Enable App Check where appropriate.
- Add Cloud Functions for sensitive server-side workflows.
- Add real Privacy Policy, Terms and Community Guidelines pages.
- Replace sample/demo content with production data.
- Run security, accessibility and performance audits.
- Change the canonical URL in `index.html` and `sitemap.xml` to the real deployed domain.


## Final build
This cumulative release is **v1.8.0**. See `DEPLOYMENT.md` and `FINAL-CHECKLIST.md` before production deployment.
