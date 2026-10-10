// Fixture data for local UI checks only (npm run dev, then open /app?demo). Never shipped: guarded by import.meta.env.DEV.
import { format, addDays } from 'date-fns';
import type { Activity, Meeting, Member, Project, Row, Sheet, Task } from './types';
import { ledgerColumns } from './actions';
import { OWNER_EMAIL } from './constants';

const d = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');
const now = Date.now();

export function demoData() {
  const members: Member[] = [
    { id: OWNER_EMAIL, email: OWNER_EMAIL, name: 'Nguyễn Minh Quân', role: 'exec', title: 'President', team: 'Leadership', showOnSite: true, uid: 'u1', lastSeenAt: now },
    { id: 'linh@school.vn', email: 'linh@school.vn', name: 'Trần Khánh Linh', role: 'exec', title: 'Vice President', team: 'Leadership', uid: 'u2', lastSeenAt: now - 3600e3 },
    { id: 'an@school.vn', email: 'an@school.vn', name: 'Phạm Bảo An', role: 'exec', title: 'Treasurer', team: 'Finance', uid: 'u3' },
    { id: 'minh@school.vn', email: 'minh@school.vn', name: 'Lê Đức Minh', role: 'member', team: 'Marketing', uid: 'u4' },
    { id: 'chi@school.vn', email: 'chi@school.vn', name: 'Võ Mai Chi', role: 'member', team: 'Content' },
  ];
  const base = { description: '', goals: '', teamEmails: [] as string[], location: '', isPublic: false, publicBlurb: '', order: 0, createdAt: now, createdBy: OWNER_EMAIL, updatedAt: now };
  const projects: Project[] = [
    { ...base, id: 'bw', title: 'Business Week', kind: 'event', summary: 'Four lunchtime activities and a Wednesday assembly talk.', stage: 'planning', leadEmail: OWNER_EMAIL, teamEmails: ['an@school.vn', 'minh@school.vn'], startDate: d(9), endDate: d(13), location: 'Canteen and main hall', color: '#2F6FDE', budgetPlanned: 3_000_000, isPublic: true, goals: '200 students take part across the week.\nAt least 3 teachers judge the pitch contest.' },
    { ...base, id: 'bake', title: 'Bake sale for charity', kind: 'event', summary: 'Sell homemade snacks at break time.', stage: 'idea', leadEmail: 'chi@school.vn', startDate: '', endDate: '', color: '#C2410C', budgetPlanned: 0 },
    { ...base, id: 'pod', title: 'Founder interview podcast', kind: 'project', summary: 'Monthly interviews with local business owners.', stage: 'active', leadEmail: 'minh@school.vn', startDate: d(-20), endDate: d(60), color: '#9333EA', budgetPlanned: 800_000 },
    { ...base, id: 'fair', title: 'Careers fair stall', kind: 'event', summary: 'Club stand at the school careers fair.', stage: 'done', leadEmail: 'an@school.vn', startDate: d(-30), endDate: d(-30), color: '#1E8A5A', budgetPlanned: 500_000, review: { attendance: 140, rating: 4, wentWell: 'Quiz drew a crowd', improve: 'Print fewer flyers' }, isPublic: true },
  ];
  const t = (id: string, title: string, projectId: string, who: string, due: string, status: Task['status'] = 'todo', priority: Task['priority'] = 'med'): Task => ({ id, title, notes: '', projectId, assigneeEmail: who, dueDate: due, priority, status, createdBy: OWNER_EMAIL, createdAt: now, updatedAt: now });
  const tasks: Task[] = [
    t('t1', 'Book the main hall for Wednesday assembly', 'bw', OWNER_EMAIL, d(-1), 'todo', 'high'),
    t('t2', 'Design posters for Business Week', 'bw', 'minh@school.vn', d(2), 'doing'),
    t('t3', 'Email three teachers to judge the pitch contest', 'bw', OWNER_EMAIL, d(0)),
    t('t4', 'Write the assembly script', 'bw', 'an@school.vn', d(6)),
    t('t5', 'Record episode 3', 'pod', 'minh@school.vn', d(12)),
    t('t6', 'Buy prizes', 'bw', 'linh@school.vn', d(5), 'done'),
    t('t7', 'Update the club Instagram bio', '', OWNER_EMAIL, ''),
  ];
  const meetings: Meeting[] = [
    { id: 'm1', title: 'Business Week planning #1', date: d(-3), projectId: 'bw', attendees: [OWNER_EMAIL, 'an@school.vn', 'linh@school.vn'], notes: 'Agreed on four lunchtime slots.', decisions: 'Pitch contest on Thursday\nBudget cap 3m', actionItems: [{ id: 'a1', text: 'Book the main hall for Wednesday assembly', assigneeEmail: OWNER_EMAIL, dueDate: d(-1), taskId: 't1' }], createdBy: OWNER_EMAIL, createdAt: now, updatedAt: now },
  ];
  const cols = ledgerColumns();
  const k = Object.fromEntries(cols.map((c) => [c.role ?? c.key, c.key]));
  const sheets: Sheet[] = [{ id: 'ledger', name: 'Ledger', order: 0, isLedger: true, columns: cols, createdAt: now, createdBy: OWNER_EMAIL }];
  const r = (i: number, cells: Record<string, string>): Row => ({ id: 'r' + i, order: (i + 1) * 1024, cells, updatedAt: now - i * 60000, updatedBy: 'linh@school.vn' });
  const rowsList: Row[] = [
    r(0, { [k.date]: d(-40), [k.description]: 'School club funding', [k.direction]: 'In', [k.category]: 'School funding', [k.amount]: '5000000', [k.payer]: 'linh@school.vn' }),
    r(1, { [k.date]: d(-31), [k.description]: 'Flyers for careers fair', [k.direction]: 'Out', [k.category]: 'Printing', [k.project]: 'fair', [k.amount]: '320000', [k.payer]: 'an@school.vn' }),
    r(2, { [k.date]: d(-6), [k.description]: 'Prizes for pitch contest', [k.direction]: 'Out', [k.category]: 'Prizes', [k.project]: 'bw', [k.amount]: '1.250.000', [k.payer]: 'linh@school.vn', [k.receipt]: 'x' }),
    r(3, { [k.date]: d(-4), [k.description]: 'Sponsorship from café', [k.direction]: 'In', [k.category]: 'Sponsorship', [k.project]: 'bw', [k.amount]: '2000000' }),
    r(4, { [k.date]: d(-2), [k.description]: 'Microphone rental', [k.direction]: 'Out', [k.category]: 'Supplies', [k.project]: 'pod', [k.amount]: '700000' }),
    r(5, { [k.description]: 'Total out', [k.amount]: '=SUMIF(C1:C5,"Out",F1:F5)' }),
    ...Array.from({ length: 12 }, (_, i) => r(6 + i, {})),
  ];
  const activity: Activity[] = [
    { id: 'x1', at: now - 120e3, actorEmail: 'linh@school.vn', verb: 'completed', targetType: 'task', targetId: 't6', targetTitle: 'Buy prizes' },
    { id: 'x2', at: now - 3600e3, actorEmail: OWNER_EMAIL, verb: 'moved', targetType: 'project', targetId: 'bw', targetTitle: 'Business Week', detail: 'to Planning' },
    { id: 'x3', at: now - 86400e3, actorEmail: 'an@school.vn', verb: 'created', targetType: 'meeting', targetId: 'm1', targetTitle: 'Business Week planning #1' },
  ];
  return { members, projects, tasks, meetings, sheets, rows: rowsList.map((row) => ({ sheetId: 'ledger', row })), activity };
}
