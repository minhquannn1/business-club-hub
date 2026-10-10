/* Server-side plumbing for the email functions: Firebase Admin, the Gmail
   sender and small request helpers. Secrets come from Vercel env vars:
   FIREBASE_SERVICE_ACCOUNT (the key JSON), GMAIL_USER, GMAIL_APP_PASSWORD. */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Brand, Email, MailMember } from './emails.js';

export const OWNER_EMAIL = 'minhquan.n.student@isph.edu.vn';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, string | string[]>;
}
export interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.FIREBASE_SERVICE_ACCOUNT);
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) throw new HttpError(503, 'Email is not set up yet (FIREBASE_SERVICE_ACCOUNT is missing).');
  let key: Record<string, string>;
  try {
    key = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  return initializeApp({ credential: cert(key as Parameters<typeof cert>[0]) });
}

export const db = () => getFirestore(app());
export const adminAuth = () => getAuth(app());

let transport: Transporter | null = null;
function mailer(): Transporter {
  if (transport) return transport;
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) throw new HttpError(503, 'Email is not set up yet (GMAIL_USER or GMAIL_APP_PASSWORD is missing).');
  transport = nodemailer.createTransport({ service: 'gmail', pool: true, maxConnections: 2, auth: { user, pass } });
  return transport;
}

export async function brand(): Promise<Brand> {
  const snap = await db().doc('site/content').get();
  const clubName = (snap.get('clubName') as string) || 'Business Club';
  return { clubName, siteUrl: (process.env.SITE_URL || 'https://isphbusiness.club').replace(/\/$/, '') };
}

/** Send to one person, or to many people at once in Bcc. */
export async function send(b: Brand, mail: Email, to: { to?: string; bcc?: string[] }, replyTo?: string) {
  const from = { name: b.clubName, address: process.env.GMAIL_USER as string };
  const t = mailer();
  if (to.bcc?.length) {
    for (let i = 0; i < to.bcc.length; i += 50) {
      await t.sendMail({ from, to: from.address, bcc: to.bcc.slice(i, i + 50), replyTo, subject: mail.subject, html: mail.html, text: mail.text });
    }
  } else if (to.to) {
    await t.sendMail({ from, to: to.to, replyTo, subject: mail.subject, html: mail.html, text: mail.text });
  }
}

export async function loadMembers(): Promise<Map<string, MailMember>> {
  const snap = await db().collection('members').get();
  return new Map(snap.docs.map((d) => [d.id, { email: d.id, ...(d.data() as Omit<MailMember, 'email'>) }]));
}

export async function projectTitles(): Promise<Map<string, string>> {
  const snap = await db().collection('projects').get();
  return new Map(snap.docs.map((d) => [d.id, (d.get('title') as string) || '']));
}

export function header(req: Req, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] || '' : v || '';
}

export function fail(res: Res, e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error ? e.message : String(e);
  if (status >= 500) console.error('[mail]', e);
  res.status(status).json({ ok: false, error: message });
}
