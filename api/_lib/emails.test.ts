import { describe, expect, it } from 'vitest';
import { announcementEmail, assignedEmail, daysBetween, digestEmail, digestFor, inviteEmail, meetingEmail, nagToday, roundsToMention, vnToday, type MailTask } from './emails';

const brand = { clubName: 'Business Club', siteUrl: 'https://isphbusiness.club' };
const t = (id: string, dueDate: string, status = 'todo'): MailTask => ({ id, title: `Task ${id}`, projectId: 'p1', assigneeEmail: 'a@x.com', dueDate, status });
const projects = new Map([['p1', 'Sport Day booth']]);

describe('dates', () => {
  it('uses Vietnam time for today', () => {
    // 18:30 UTC on 10 Oct is already 01:30 on 11 Oct in Vietnam
    expect(vnToday(new Date('2026-10-10T18:30:00Z'))).toBe('2026-10-11');
    expect(vnToday(new Date('2026-10-10T16:00:00Z'))).toBe('2026-10-10');
  });
  it('counts days', () => {
    expect(daysBetween('2026-10-10', '2026-10-11')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-10-12', '2026-10-10')).toBe(-2);
  });
});

describe('digest', () => {
  const today = '2026-10-10';
  it('groups due today, tomorrow and overdue, ignoring done and later tasks', () => {
    const d = digestFor([t('a', '2026-10-10'), t('b', '2026-10-11'), t('c', '2026-10-09'), t('d', '2026-10-10', 'done'), t('e', '2026-10-20'), t('f', '')], today);
    expect(d.today.map((x) => x.id)).toEqual(['a']);
    expect(d.tomorrow.map((x) => x.id)).toEqual(['b']);
    expect(d.overdue.map((x) => x.id)).toEqual(['c']);
    expect(d.send).toBe(true);
  });
  it('nags about overdue work on day 1, 3, 7 then weekly for a month', () => {
    expect([1, 2, 3, 4, 7, 8, 14, 21, 28, 35].map(nagToday)).toEqual([true, false, true, false, true, false, true, true, true, false]);
    expect(digestFor([t('c', '2026-10-08')], today).send).toBe(false); // 2 days late
    expect(digestFor([t('c', '2026-10-07')], today).send).toBe(true); // 3 days late
  });
  it('sends nothing when only far-off tasks exist', () => {
    expect(digestFor([t('e', '2026-10-20')], today).send).toBe(false);
  });
});

describe('emails', () => {
  it('writes a reminder with the project name and a link', () => {
    const d = digestFor([t('a', '2026-10-10'), t('c', '2026-10-09')], '2026-10-10');
    const m = digestEmail(brand, { email: 'a@x.com', name: 'Nguyễn Minh Quân' }, d, projects);
    expect(m.subject).toBe('1 task due today');
    expect(m.text).toContain('Hi Quân');
    expect(m.text).toContain('Task a (Sport Day booth)');
    expect(m.text).toContain('was due 9 Oct');
    expect(m.html).toContain('https://isphbusiness.club/app/tasks');
  });
  it('names a single task in the subject', () => {
    const m = digestEmail(brand, { email: 'a@x.com' }, digestFor([t('b', '2026-10-11')], '2026-10-10'), projects);
    expect(m.subject).toBe('Due tomorrow: Task b');
  });
  it('escapes what members type', () => {
    const m = announcementEmail(brand, { title: 'Hi', body: 'Bring <b>snacks</b> & cups\n\nSee you' }, { email: 'p@x.com', name: 'Quân', title: 'President' });
    expect(m.html).toContain('Bring &lt;b&gt;snacks&lt;/b&gt; &amp; cups');
    expect(m.html).not.toContain('<b>snacks');
    expect(m.text).toContain('Quân, President');
  });
  it('describes an assigned task', () => {
    const m = assignedEmail(brand, { email: 'a@x.com', name: 'Linh' }, { ...t('a', '2026-10-30'), notes: 'PIC: Seo' }, 'Quân', 'Sport Day booth');
    expect(m.subject).toBe('New task: Task a');
    expect(m.text).toContain('Quân gave you a task');
    expect(m.text).toContain('Due: Friday 30 October');
    expect(m.html).toContain('/app/projects/p1');
  });
  it('lists meeting action items with names', () => {
    const m = meetingEmail(
      brand,
      { title: 'Sport Day planning', date: '2026-10-10', projectId: 'p1', notes: 'We picked drinks.', decisions: '', actionItems: [{ text: 'Buy ice', assigneeEmail: 'a@x.com', dueDate: '2026-10-28' }, { text: ' ', assigneeEmail: '', dueDate: '' }] },
      'Sport Day booth',
      () => 'Bình',
    );
    expect(m.subject).toBe('Notes: Sport Day planning');
    expect(m.text).toContain('- Buy ice (Bình, by 28 Oct)');
    expect(m.text).not.toContain('Decisions');
  });
});

describe('competition deadlines', () => {
  const rounds = [
    { name: 'IPS', date: '2026-10-17' },
    { name: 'Trading notes', date: '2026-10-13' },
    { name: 'Roster', date: '2026-10-11' },
    { name: 'Final report', date: '2026-12-04' },
    { name: 'Done one', date: '2026-10-11', done: true },
    { name: 'No date', date: '' },
  ];
  it('mentions deadlines 7, 3 and 1 days ahead and on the day', () => {
    const r = roundsToMention(rounds, 'Wharton', 'p1', '2026-10-10');
    expect(r.map((x) => [x.name, x.daysLeft])).toEqual([
      ['IPS', 7],
      ['Trading notes', 3],
      ['Roster', 1],
    ]);
  });
  it('can send a reminder with only competition deadlines', () => {
    const r = roundsToMention(rounds, 'Wharton', 'p1', '2026-10-10');
    const m = digestEmail(brand, { email: 'a@x.com', name: 'Linh' }, digestFor([], '2026-10-10'), projects, r);
    expect(m.subject).toBe('Wharton: Roster tomorrow');
    expect(m.text).toContain('Competition deadlines');
    expect(m.text).toContain('- IPS (Wharton, in 7 days, 17 Oct)');
    expect(m.html).toContain('/app/competitions');
  });
});

describe('invites', () => {
  it('tells a guest which project and which email to sign in with', () => {
    const m = inviteEmail(brand, { email: 'khanh@school.vn', role: 'guest' }, 'Minh Quan', ['Wharton Investment Competition 2026-27']);
    expect(m.subject).toBe("You're invited to work on Wharton Investment Competition 2026-27");
    expect(m.text).toContain('Minh Quan added you to the');
    expect(m.text).toContain('as a guest');
    expect(m.text).toContain('- Wharton Investment Competition 2026-27');
    expect(m.text).toContain('Use this email: khanh@school.vn');
    expect(m.html).toContain('https://isphbusiness.club/login');
  });
  it('invites a club member to the workspace', () => {
    const m = inviteEmail(brand, { email: 'a@x.com', role: 'member' }, 'Minh Quan', []);
    expect(m.subject).toContain('workspace');
    expect(m.text).not.toContain('guest');
  });
});
