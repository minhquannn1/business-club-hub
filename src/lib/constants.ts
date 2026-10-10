import type { Stage, TaskStatus, Priority, SiteContent } from './types';

/** The club owner. Always has exec rights, even before being added to the member list. Mirrored in firestore.rules. */
export const OWNER_EMAIL = 'ngocminhquannguyen@gmail.com';

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'idea', label: 'Idea', hint: 'Worth talking about' },
  { key: 'planning', label: 'Planning', hint: 'Owner, dates and budget being set' },
  { key: 'active', label: 'Running', hint: 'Happening now' },
  { key: 'done', label: 'Wrapped', hint: 'Finished and reviewed' },
];

export const STAGE_LABEL: Record<Stage, string> = { idea: 'Idea', planning: 'Planning', active: 'Running', done: 'Wrapped' };

export const TASK_STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };

export const PRIORITIES: { key: Priority; label: string }[] = [
  { key: 'high', label: 'High' },
  { key: 'med', label: 'Normal' },
  { key: 'low', label: 'Low' },
];
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', med: 'Normal', low: 'Low' };

/** Project colour swatches: each reads on white and on the dark surface. */
export const PROJECT_COLORS = ['#2F6FDE', '#1E8A5A', '#C2410C', '#9333EA', '#B4235A', '#0E7490', '#A16207', '#475569'];

export const TEAMS = ['Leadership', 'Events', 'Marketing', 'Finance', 'Partnerships', 'Content'];

export const DEFAULT_SITE: SiteContent = {
  clubName: 'Business Club',
  shortName: 'Business Club',
  school: '',
  tagline: 'Students running real projects, with real budgets and real deadlines.',
  about:
    'We are a student-run club for anyone curious about how businesses work. We plan events, run small ventures and invite people from industry to talk to students.',
  mission: 'Learn business by doing it: pitch an idea, find the money, ship it, then count what worked.',
  joinText: 'Membership is open to every secondary student. Come to a meeting or send us a message.',
  joinLink: '',
  contactEmail: '',
  instagram: '',
  currency: 'VND',
  year: '2026–27',
};

export const EXPENSE_CATEGORIES = ['Food & drinks', 'Printing', 'Prizes', 'Decorations', 'Transport', 'Venue', 'Marketing', 'Supplies', 'Other'];
export const INCOME_CATEGORIES = ['Sponsorship', 'Ticket sales', 'Product sales', 'School funding', 'Donations', 'Other'];
export const LEDGER_CATEGORIES = [...INCOME_CATEGORIES.filter((c) => c !== 'Other'), ...EXPENSE_CATEGORIES];
