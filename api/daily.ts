/* Daily reminders. Vercel Cron calls this every morning (see vercel.json).
   Each member with a task due today or tomorrow, an overdue task, or a competition
   deadline coming up for a team they are on gets one email.
   It runs at most once per Vietnam day, so calling it again does nothing. */
import { assigneesOf, digestEmail, digestFor, roundsToMention, vnToday, type MailRound, type MailTask } from './_lib/emails.js';
import { brand, db, fail, header, loadMembers, send, type Req, type Res } from './_lib/server.js';

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

    const [members, projectSnap, b, taskSnap] = await Promise.all([loadMembers(), db().collection('projects').get(), brand(), db().collection('tasks').where('status', 'in', ['todo', 'doing']).get()]);
    const projects = new Map(projectSnap.docs.map((d) => [d.id, (d.get('title') as string) || '']));

    // competition deadlines go to the lead and the team
    const roundsFor = new Map<string, MailRound[]>();
    for (const d of projectSnap.docs) {
      const p = d.data() as { kind?: string; stage?: string; title?: string; leadEmail?: string; teamEmails?: string[]; rounds?: { name: string; date: string; done?: boolean }[] };
      if (p.kind !== 'competition' || p.stage === 'done' || !p.rounds?.length) continue;
      const due = roundsToMention(p.rounds, p.title || 'Competition', d.id, today);
      if (!due.length) continue;
      for (const email of new Set([p.leadEmail, ...(p.teamEmails ?? [])].filter(Boolean) as string[])) roundsFor.set(email, [...(roundsFor.get(email) ?? []), ...due]);
    }
    const byPerson = new Map<string, MailTask[]>();
    for (const d of taskSnap.docs) {
      const t = { id: d.id, ...(d.data() as Omit<MailTask, 'id'>) };
      if (!t.dueDate) continue;
      for (const who of assigneesOf(t)) {
        const list = byPerson.get(who) ?? [];
        list.push(t);
        byPerson.set(who, list);
      }
    }

    const sent: string[] = [];
    const failed: string[] = [];
    for (const email of new Set([...byPerson.keys(), ...roundsFor.keys()])) {
      const m = members.get(email);
      if (!m || m.emailOff) continue;
      const d = digestFor(byPerson.get(email) ?? [], today);
      const rounds = roundsFor.get(email) ?? [];
      if (!d.send && !rounds.length) continue;
      try {
        await send(b, digestEmail(b, m, d, projects, rounds), { to: email });
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
