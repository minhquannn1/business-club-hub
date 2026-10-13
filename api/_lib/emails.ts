/* Pure helpers for the club's emails: which tasks to remind about, and what
   each email says. No Firebase or network here, so it can be unit tested. */

export interface MailTask {
  id: string;
  title: string;
  projectId: string;
  assigneeEmail: string;
  assigneeEmails?: string[];
  dueDate: string;
  status: string;
  notes?: string;
}

/** Everyone on a task. Older tasks only have assigneeEmail. */
export function assigneesOf(t: Pick<MailTask, 'assigneeEmail' | 'assigneeEmails'>): string[] {
  const list = t.assigneeEmails?.length ? t.assigneeEmails : t.assigneeEmail ? [t.assigneeEmail] : [];
  return [...new Set(list.filter(Boolean))];
}

export interface MailMember {
  email: string;
  name?: string;
  role?: string;
  title?: string;
  team?: string;
  emailOff?: boolean;
  uid?: string;
  invitedAt?: number;
  admin?: boolean;
  hidden?: boolean;
}

export interface Email {
  subject: string;
  html: string;
  text: string;
}

export interface Brand {
  clubName: string;
  siteUrl: string;
}

/* ---------- dates ---------- */

/** Today's date in Vietnam as yyyy-mm-dd. */
export function vnToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Whole days from a to b (both yyyy-mm-dd). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function shortDate(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

export function longDate(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));
}

/* ---------- which tasks to remind about ---------- */

export interface Digest {
  overdue: MailTask[];
  today: MailTask[];
  tomorrow: MailTask[];
  send: boolean;
}

/** Overdue tasks nag on day 1, 3 and 7, then once a week for a month. */
export function nagToday(daysLate: number): boolean {
  if (daysLate === 1 || daysLate === 3 || daysLate === 7) return true;
  return daysLate > 7 && daysLate <= 28 && daysLate % 7 === 0;
}

export function digestFor(tasks: MailTask[], today: string): Digest {
  const open = tasks.filter((t) => t.status !== 'done' && t.dueDate);
  const by = (a: MailTask, b: MailTask) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title);
  const overdue = open.filter((t) => daysBetween(t.dueDate, today) > 0).sort(by);
  const dueToday = open.filter((t) => t.dueDate === today).sort(by);
  const tomorrow = open.filter((t) => daysBetween(today, t.dueDate) === 1).sort(by);
  const send = dueToday.length > 0 || tomorrow.length > 0 || overdue.some((t) => nagToday(daysBetween(t.dueDate, today)));
  return { overdue, today: dueToday, tomorrow, send };
}

/* ---------- competition deadlines ---------- */

export interface MailRound {
  name: string;
  date: string;
  competition: string;
  projectId: string;
  daysLeft: number;
}

/** Team members hear about a deadline a week before, 3 days before, the day before and on the day. */
export function roundsToMention(rounds: { name: string; date: string; done?: boolean }[], competition: string, projectId: string, today: string): MailRound[] {
  return rounds
    .filter((r) => !r.done && r.date)
    .map((r) => ({ name: r.name, date: r.date, competition, projectId, daysLeft: daysBetween(today, r.date) }))
    .filter((r) => [0, 1, 3, 7].includes(r.daysLeft));
}

/* ---------- html ---------- */

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function paragraphs(s: string): string {
  return esc(s.trim())
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const firstName = (m?: MailMember) => (m?.name || '').trim().split(/\s+/).pop() || 'there';

function layout(brand: Brand, title: string, inner: string, cta?: { label: string; url: string }, footer = ''): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;font-family:Helvetica,Arial,sans-serif;color:#111;font-size:15px">
<tr><td style="padding:22px 28px 0;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:#1f3dff">${esc(brand.clubName)}</td></tr>
<tr><td style="padding:10px 28px 4px"><h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:bold">${esc(title)}</h1></td></tr>
<tr><td style="padding:12px 28px 8px">${inner}</td></tr>
${cta ? `<tr><td style="padding:4px 28px 26px"><a href="${esc(cta.url)}" style="display:inline-block;background:#1f3dff;color:#fff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:999px">${esc(cta.label)}</a></td></tr>` : ''}
</table>
<p style="max-width:560px;margin:14px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#777">${footer || `Sent by the ${esc(brand.clubName)} workspace.`}</p>
</td></tr></table></body></html>`;
}

function taskList(tasks: MailTask[], projects: Map<string, string>, showDue: boolean): { html: string; text: string } {
  const html = tasks
    .map((t) => {
      const proj = projects.get(t.projectId);
      const meta = [proj, showDue && t.dueDate ? `was due ${shortDate(t.dueDate)}` : ''].filter(Boolean).join(', ');
      return `<li style="margin:0 0 6px;line-height:1.5"><strong>${esc(t.title)}</strong>${meta ? `<span style="color:#666"> &middot; ${esc(meta)}</span>` : ''}</li>`;
    })
    .join('');
  const text = tasks
    .map((t) => {
      const proj = projects.get(t.projectId);
      const meta = [proj, showDue && t.dueDate ? `was due ${shortDate(t.dueDate)}` : ''].filter(Boolean).join(', ');
      return `- ${t.title}${meta ? ` (${meta})` : ''}`;
    })
    .join('\n');
  return { html: `<ul style="margin:0 0 16px;padding-left:20px">${html}</ul>`, text };
}

const reminderFooter = (brand: Brand) =>
  `You get these because you're on the ${esc(brand.clubName)} workspace. To stop task emails, open your profile in the workspace and turn off email reminders.`;

/* ---------- the emails ---------- */

export function digestEmail(brand: Brand, member: MailMember, d: Digest, projects: Map<string, string>, rounds: MailRound[] = []): Email {
  const groups: [string, MailTask[], boolean][] = [
    ['Due today', d.today, false],
    ['Due tomorrow', d.tomorrow, false],
    ['Overdue', d.overdue, true],
  ];
  const all = [...d.today, ...d.tomorrow, ...d.overdue];
  const soonest = [...rounds].sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const whenText = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  const subject =
    all.length === 0 && soonest
      ? `${soonest.competition}: ${soonest.name} ${whenText(soonest.daysLeft)}`
      : all.length === 1
      ? `${d.today.length ? 'Due today' : d.tomorrow.length ? 'Due tomorrow' : 'Overdue'}: ${all[0].title}`
      : d.today.length
        ? `${d.today.length} task${d.today.length > 1 ? 's' : ''} due today`
        : `${all.length} tasks need you`;
  let html = `<p style="margin:0 0 16px;line-height:1.6">Hi ${esc(firstName(member))}, here's what's on your list.</p>`;
  let text = `Hi ${firstName(member)}, here's what's on your list.\n`;
  if (rounds.length) {
    const sorted = [...rounds].sort((a, b) => a.daysLeft - b.daysLeft);
    const li = sorted.map((r) => ({
      html: `<li style="margin:0 0 6px;line-height:1.5"><strong>${esc(r.name)}</strong><span style="color:#666"> &middot; ${esc(r.competition)}, ${esc(whenText(r.daysLeft))} (${esc(shortDate(r.date))})</span></li>`,
      text: `- ${r.name} (${r.competition}, ${whenText(r.daysLeft)}, ${shortDate(r.date)})`,
    }));
    html += `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#1f3dff">Competition deadlines</p><ul style="margin:0 0 16px;padding-left:20px">${li.map((x) => x.html).join('')}</ul>`;
    text += `\nCompetition deadlines\n${li.map((x) => x.text).join('\n')}\n`;
  }
  for (const [label, list, showDue] of groups) {
    if (!list.length) continue;
    const l = taskList(list, projects, showDue);
    html += `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:${label === 'Overdue' ? '#c62828' : '#444'}">${label}</p>${l.html}`;
    text += `\n${label}\n${l.text}\n`;
  }
  const onlyRounds = all.length === 0 && rounds.length > 0;
  const url = onlyRounds ? `${brand.siteUrl}/app/competitions` : `${brand.siteUrl}/app/tasks`;
  const cta = onlyRounds ? 'Open competitions' : 'Open your tasks';
  text += `\n${cta}: ${url}\n`;
  return { subject, html: layout(brand, subject, html, { label: cta, url }, reminderFooter(brand)), text };
}

export function assignedEmail(brand: Brand, member: MailMember | undefined, task: MailTask, by: string, projectTitle: string, others: string[] = []): Email {
  const subject = `New task: ${task.title}`;
  const rows: [string, string][] = [
    ['Project', projectTitle],
    ['Due', task.dueDate ? longDate(task.dueDate) : ''],
    ['From', by],
    ['With', others.join(', ')],
  ];
  const facts = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#777;font-size:13px">${k}</td><td style="padding:3px 0">${esc(v)}</td></tr>`)
    .join('');
  const notes = task.notes?.trim() ? paragraphs(task.notes) : '';
  const url = `${brand.siteUrl}/app/tasks?open=${encodeURIComponent(task.id)}`;
  const html = `<p style="margin:0 0 14px;line-height:1.6">Hi ${esc(firstName(member))}, ${esc(by)} gave you a task.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${facts}</table>${notes}`;
  const text = [`Hi ${firstName(member)}, ${by} gave you a task.`, '', task.title, ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), task.notes?.trim() ? `\n${task.notes.trim()}` : '', '', `Open it: ${url}`].join('\n');
  return { subject, html: layout(brand, task.title, html, { label: 'Open it', url }, reminderFooter(brand)), text };
}

export function announcementEmail(brand: Brand, a: { title: string; body: string }, author: MailMember | undefined): Email {
  const sign = author ? [author.name, author.title].filter(Boolean).join(', ') : '';
  const html = `${paragraphs(a.body)}${sign ? `<p style="margin:0 0 14px;color:#555">${esc(sign)}</p>` : ''}`;
  const url = `${brand.siteUrl}/app`;
  const text = `${a.body.trim()}\n\n${sign}\n\nWorkspace: ${url}`;
  return { subject: a.title, html: layout(brand, a.title, html, { label: 'Open the workspace', url }), text };
}

/** Sent when someone is added to the workspace, with the link to sign in. */
export function inviteEmail(brand: Brand, invitee: MailMember, by: string, projects: string[]): Email {
  const guest = invitee.role === 'guest';
  const url = `${brand.siteUrl}/login`;
  const subject =
    guest && projects.length === 1
      ? `You're invited to work on ${projects[0]}`
      : guest && projects.length > 1
        ? `You're invited to work on ${projects.length} projects with ${brand.clubName}`
        : `You're invited to the ${brand.clubName} workspace`;
  const intro = `${by} added you to the ${brand.clubName} workspace${guest ? ' as a guest' : ''}.`;
  const what = guest
    ? `There you can see your tasks, deadlines and meeting notes for ${projects.length === 1 ? 'it' : 'them'}. You also get an email when you're given a task or something is due.`
    : `It's where the club keeps its projects, tasks and meetings. You also get an email when you're given a task or something is due.`;
  const how = 'To sign in, open the link and choose Sign in with Google. Use this email:';
  const list = projects.length
    ? `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#444">${projects.length === 1 ? 'Your project' : 'Your projects'}</p><ul style="margin:0 0 16px;padding-left:20px">${projects.map((p) => `<li style="margin:0 0 6px;line-height:1.5"><strong>${esc(p)}</strong></li>`).join('')}</ul>`
    : '';
  const html = `<p style="margin:0 0 14px;line-height:1.6">Hi, ${esc(intro)}</p>${list}<p style="margin:0 0 14px;line-height:1.6">${esc(what)}</p>
<p style="margin:0 0 14px;line-height:1.6">${esc(how)} <strong>${esc(invitee.email)}</strong></p>`;
  const text = [`Hi, ${intro}`, projects.length ? `\n${projects.length === 1 ? 'Your project' : 'Your projects'}:\n${projects.map((p) => `- ${p}`).join('\n')}` : '', '', what, '', `${how} ${invitee.email}`, '', `Sign in: ${url}`].join('\n');
  const footer = `You got this because ${esc(by)} added ${esc(invitee.email)} to the ${esc(brand.clubName)} workspace. If you weren't expecting it, you can ignore this email.`;
  return { subject, html: layout(brand, subject, html, { label: 'Sign in', url }, footer), text };
}

export interface MailMeeting {
  title: string;
  date: string;
  projectId: string;
  notes: string;
  decisions: string;
  actionItems: { text: string; assigneeEmail: string; dueDate: string }[];
}

export function meetingEmail(brand: Brand, m: MailMeeting, projectTitle: string, nameOf: (email: string) => string): Email {
  const subject = `Notes: ${m.title}`;
  const meta = [m.date ? longDate(m.date) : '', projectTitle].filter(Boolean).join(' · ');
  let html = meta ? `<p style="margin:0 0 16px;color:#666;font-size:13px">${esc(meta)}</p>` : '';
  let text = meta ? `${meta}\n` : '';
  const section = (label: string, body: string) => {
    if (!body.trim()) return;
    html += `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#444">${label}</p>${paragraphs(body)}`;
    text += `\n${label}\n${body.trim()}\n`;
  };
  section('Notes', m.notes || '');
  section('Decisions', m.decisions || '');
  const items = m.actionItems.filter((i) => i.text.trim());
  if (items.length) {
    const li = items
      .map((i) => {
        const meta2 = [i.assigneeEmail ? nameOf(i.assigneeEmail) : '', i.dueDate ? `by ${shortDate(i.dueDate)}` : ''].filter(Boolean).join(', ');
        return { html: `<li style="margin:0 0 6px;line-height:1.5"><strong>${esc(i.text.trim())}</strong>${meta2 ? `<span style="color:#666"> &middot; ${esc(meta2)}</span>` : ''}</li>`, text: `- ${i.text.trim()}${meta2 ? ` (${meta2})` : ''}` };
      });
    html += `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#444">Who's doing what</p><ul style="margin:0 0 16px;padding-left:20px">${li.map((x) => x.html).join('')}</ul>`;
    text += `\nWho's doing what\n${li.map((x) => x.text).join('\n')}\n`;
  }
  const url = `${brand.siteUrl}/app/meetings`;
  text += `\nMeeting notes: ${url}\n`;
  return { subject, html: layout(brand, m.title, html, { label: 'Open the notes', url }), text };
}
