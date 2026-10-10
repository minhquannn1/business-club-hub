import { auth } from './firebase';

export type NotifyBody = { type: 'test' } | { type: 'task'; taskId: string } | { type: 'announcement'; id: string } | { type: 'meeting'; id: string } | { type: 'invite'; email: string };

export interface NotifyResult {
  ok: boolean;
  sent?: number;
  already?: boolean;
  error?: string;
}

/** Ask the server to send an email. Never throws; check `ok`. */
export async function notify(body: NotifyBody): Promise<NotifyResult> {
  try {
    const user = auth.currentUser;
    if (!user) return { ok: false, error: 'Sign in first' };
    const token = await user.getIdToken();
    const r = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = (await r.json().catch(() => ({}))) as NotifyResult;
    return r.ok ? { ...data, ok: true } : { ok: false, error: data.error || `Email failed (${r.status})` };
  } catch {
    return { ok: false, error: 'Could not reach the email service' };
  }
}

let cached: Promise<boolean> | null = null;
/** Whether the Gmail sender is set up on the server. */
export function emailReady(): Promise<boolean> {
  if (!cached)
    cached = fetch('/api/notify', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((d: { configured?: boolean }) => Boolean(d.configured))
      .catch(() => false);
  return cached;
}
