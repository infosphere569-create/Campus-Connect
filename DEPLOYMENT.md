# Campus Connect — Deployment Checklist

## 1. Firebase
1. Create a Firebase project.
2. Enable Authentication: Email/Password (and Google only if you want it).
3. Create Firestore Database and Storage.
4. Put your Firebase web config in `js/firebase.js`.
5. Deploy rules and indexes:
   - `firebase deploy --only firestore:rules,firestore:indexes`
6. Install/deploy Functions from `functions/`:
   - `cd functions`
   - `npm install`
   - `cd ..`
   - `firebase deploy --only functions`

## 2. GitHub
Upload the **contents of this ZIP's project folder**, not the ZIP itself:
- `index.html`, all other HTML pages
- `css/`
- `js/`
- `firebase/`
- `functions/`
- `firebase.json`
- `firestore.indexes.json`
- `_headers`, `_redirects`
- `robots.txt`, `sitemap.xml`
- `README.md`, `DEPLOYMENT.md`

Do NOT commit:
- private keys
- service-account JSON
- `.env` secrets
- Firebase Admin credentials

## 3. Cloudflare Pages
Connect the GitHub repository to Cloudflare Pages.
For a static frontend, the build command can be empty and the output directory should be the project root (where `index.html` is).
After deployment, test login, onboarding, posts, groups, issues, events, reports and admin access.

## Important
`js/firebase.js` contains the browser Firebase configuration. Firebase web config is normally public; security comes from Authentication + Firestore/Storage rules + trusted Functions. Never put Admin SDK/service-account credentials in browser files.
