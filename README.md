# Business Club Hub

The club's public website plus a members-only workspace for projects, tasks, meetings, members and finance.

- `/` public site, `/p/:id` public project pages
- `/app` workspace (Google sign-in; only emails on the member list get in)

## Stack

React + Vite + TypeScript, Firebase Auth (Google) and Cloud Firestore, deployed on Vercel.

## Environment variables (Vercel > Settings > Environment Variables)

Copy the values from Firebase console > Project settings > Your apps > SDK setup and configuration > Config.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Security rules

`firestore.rules` holds the Firestore rules. Paste them into Firebase console > Firestore > Rules and publish after any change. The owner email in the rules must match `OWNER_EMAIL` in `src/lib/constants.ts`.

## Develop

```
npm install
npm run dev
npm test
```
