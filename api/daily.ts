/* Daily task reminders. Vercel Cron calls this every morning (see vercel.json).
   Each member with something due today or tomorrow, or overdue, gets one email.
   It runs at most once per Vietnam day, so calling it again does nothing. */
import { digestEmail, digestFor, vnToday, type MailTask } from './_lib/emails.js';
import { brand, db, fail, header, loadMembers, projectTitles, send, type Req, type Res } from './_lib/server.js';

export default async function handler(req: Req, res: Res) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && header(req, 'authorization') !== `Bearer ${secret}`) {
      res.status(401).json({ ok: false, error: 'Not allowed' });
      return;
    }
    const today = vnToday();
    const logRef = db().doc(`mailLog/daily-${today}`);
    try {
      await logRef.create({ startedAt: Date.now() });
    } catch {
      res.status(200).json({ ok: true, skipped: `Reminders for ${today} were already sent` });
      return;
    }

    const [members, projects, b, taskSnap] = await Promise.all([loadMembers(), projectTitles(), brand(), db().collection('tasks').where('status', 'in', ['todo', 'doing']).get()]);
    const byPerson = new Map<string, MailTask[]>();
    for (const d of taskSnap.docs) {
      const t = { id: d.id, ...(d.data() as Omit<MailTask, 'id'>) };
      if (!t.assigneeEmail || !t.dueDate) continue;
      const list = byPerson.get(t.assigneeEmail) ?? [];
      list.push(t);
      byPerson.set(t.assigneeEmail, list);
    }

    const sent: string[] = [];
    const failed: string[] = [];
    for (const [email, tasks] of byPerson) {
      const m = members.get(email);
      if (!m || m.emailOff) continue;
      const d = digestFor(tasks, today);
      if (!d.send) continue;
      try {
        await send(b, digestEmail(b, m, d, projects), { to: email });
        sent.push(email);
      } catch (e) {
        console.error('[mail] digest', email, e);
        failed.push(email);
      }
    }
    await logRef.set({ finishedAt: Date.now(), sent: sent.length, failed }, { merge: true });
    res.status(200).json({ ok: true, date: today, sent: sent.length, failed: failed.length });
  } catch (e) {
    fail(res, e);
  }
}
