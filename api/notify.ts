/* Emails sent when something happens in the workspace. The browser calls this
   with the signed-in member's Firebase ID token; the server checks who they are
   before sending anything.
   GET  -> { configured } so the workspace can say whether email is set up.
   POST { type: 'test' }                     email yourself a sample reminder
   POST { type: 'task', taskId }             tell the assignee about a new task
   POST { type: 'announcement', id }         exec only: email an announcement
   POST { type: 'meeting', id }              email meeting notes to who was there */
import { announcementEmail, assignedEmail, digestEmail, digestFor, meetingEmail, vnToday, type MailMeeting, type MailTask } from './_lib/emails.js';
import { HttpError, OWNER_EMAIL, adminAuth, brand, db, fail, header, loadMembers, mailConfigured, projectTitles, send, type Req, type Res } from './_lib/server.js';

type Body = { type?: string; taskId?: string; id?: string };

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, configured: mailConfigured() });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Use POST' });
    return;
  }
  try {
    const token = header(req, 'authorization').replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in first');
    const decoded = await adminAuth()
      .verifyIdToken(token)
      .catch(() => {
        throw new HttpError(401, 'Your sign-in has expired. Reload the page and try again.');
      });
    const me = (decoded.email || '').toLowerCase();
    if (!me || !decoded.email_verified) throw new HttpError(403, 'Your Google account email is not verified');
    const members = await loadMembers();
    const meMember = members.get(me);
    if (!meMember && me !== OWNER_EMAIL) throw new HttpError(403, 'You are not on the member list');
    const isExec = me === OWNER_EMAIL || meMember?.role === 'exec';
    const isGuest = me !== OWNER_EMAIL && meMember?.role === 'guest';
    const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}) as Body;
    const b = await brand();
    const nameOf = (email: string) => members.get(email)?.name || email.split('@')[0];

    switch (body.type) {
      case 'test': {
        const snap = await db().collection('tasks').where('assigneeEmail', '==', me).get();
        const tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MailTask, 'id'>) }));
        const d = digestFor(tasks, vnToday());
        const has = d.today.length + d.tomorrow.length + d.overdue.length > 0;
        const mail = has
          ? digestEmail(b, meMember ?? { email: me }, d, await projectTitles())
          : announcementEmail(b, { title: 'Email is working', body: `This is a test from the ${b.clubName} workspace. You have nothing due today, tomorrow or overdue, so a real reminder would not be sent today.` }, undefined);
        await send(b, { ...mail, subject: `[Test] ${mail.subject}` }, { to: me });
        res.status(200).json({ ok: true, sent: 1 });
        return;
      }

      case 'task': {
        if (!body.taskId) throw new HttpError(400, 'taskId is missing');
        const ref = db().doc(`tasks/${body.taskId}`);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpError(404, 'Task not found');
        const t = { id: snap.id, ...(snap.data() as Omit<MailTask, 'id'> & { notifiedTo?: string }) };
        const to = t.assigneeEmail;
        const target = to ? members.get(to) : undefined;
        if (!to || to === me || t.status === 'done' || t.notifiedTo === to || !target || target.emailOff) {
          res.status(200).json({ ok: true, sent: 0 });
          return;
        }
        const projects = await projectTitles();
        await send(b, assignedEmail(b, target, t, nameOf(me), projects.get(t.projectId) || ''), { to }, me);
        await ref.update({ notifiedTo: to });
        res.status(200).json({ ok: true, sent: 1 });
        return;
      }

      case 'announcement': {
        if (!isExec) throw new HttpError(403, 'Only the exec team can email the club');
        if (!body.id) throw new HttpError(400, 'id is missing');
        const ref = db().doc(`announcements/${body.id}`);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpError(404, 'Announcement not found');
        const a = snap.data() as { title: string; body: string; audience?: string; createdBy?: string; emailedAt?: number };
        if (a.emailedAt) {
          res.status(200).json({ ok: true, sent: 0, already: true });
          return;
        }
        const audience = a.audience || 'all';
        // guests are not in the club, so club announcements never go to them
        const to = [...members.values()]
          .filter((m) => m.role !== 'guest')
          .filter((m) => (audience === 'all' ? true : audience === 'exec' ? m.role === 'exec' : audience.startsWith('team:') ? m.team === audience.slice(5) : false))
          .map((m) => m.email);
        if (!to.length) throw new HttpError(400, 'Nobody is in that group');
        await send(b, announcementEmail(b, a, members.get(a.createdBy || me)), { bcc: to }, a.createdBy || me);
        await ref.update({ emailedAt: Date.now(), recipientCount: to.length });
        res.status(200).json({ ok: true, sent: to.length });
        return;
      }

      case 'meeting': {
        if (!body.id) throw new HttpError(400, 'id is missing');
        const ref = db().doc(`meetings/${body.id}`);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpError(404, 'Meeting not found');
        const m = snap.data() as MailMeeting & { attendees?: string[]; createdBy?: string };
        let lead = '';
        if (m.projectId) lead = ((await db().doc(`projects/${m.projectId}`).get()).get('leadEmail') as string) || '';
        if (isGuest || (!isExec && m.createdBy !== me && lead !== me)) throw new HttpError(403, 'Only whoever wrote the notes, the project lead or the exec team can email them');
        const to = [...new Set([...(m.attendees || []), ...(m.actionItems || []).map((i) => i.assigneeEmail)].filter((e) => e && members.has(e)))];
        if (!to.length) throw new HttpError(400, 'Add who attended first');
        const projects = await projectTitles();
        await send(b, meetingEmail(b, { ...m, actionItems: m.actionItems || [] }, projects.get(m.projectId) || '', nameOf), { bcc: to }, me);
        await ref.update({ emailedAt: Date.now() });
        res.status(200).json({ ok: true, sent: to.length });
        return;
      }

      default:
        throw new HttpError(400, 'Unknown email type');
    }
  } catch (e) {
    fail(res, e);
  }
}
