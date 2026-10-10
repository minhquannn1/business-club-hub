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

## Email (Gmail)

The workspace sends email through a club Gmail account from two Vercel functions:

- `api/daily.ts` runs every morning at about 7:00 Vietnam time (Vercel Cron, see `vercel.json`) and sends each member one reminder when they have tasks due today, due tomorrow, or overdue (overdue tasks are mentioned on day 1, 3 and 7, then weekly for a month).
- `api/notify.ts` sends emails when something happens: a task is given to someone, the exec team posts an announcement with "Also email it", someone clicks "Email notes" on a meeting, or a member clicks "Send me a test email" in their profile.

Set these in Vercel > Settings > Environment Variables (Production), then redeploy:

| Name | Value |
| --- | --- |
| `GMAIL_USER` | the club Gmail address that sends the emails |
| `GMAIL_APP_PASSWORD` | a 16-character App Password for that account (needs 2-Step Verification) |
| `FIREBASE_SERVICE_ACCOUNT` | the whole JSON key from Firebase console > Project settings > Service accounts > Generate new private key |
| `CRON_SECRET` | optional; any long random string |

Members can turn task emails off in their profile. Gmail allows about 500 emails a day from a normal account.
