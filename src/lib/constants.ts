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
export const PROJECT_COLORS = ['#1E3FD8', '#FF6B2C', '#0E9F6E', '#8B3FD9', '#D6336C', '#0B7285', '#B7791F', '#475569'];

export const TEAMS = ['Leadership', 'Events', 'Marketing', 'Finance', 'Partnerships', 'Content'];

export const DEFAULT_SITE: SiteContent = {
  clubName: 'Business Club',
  shortName: 'Business Club',
  school: 'ISPH',
  tagline: 'Learn business by running one.',
  about:
    'We are students who like the business side of things. We run booths at school events, plan our own projects and bring in people who run real businesses to talk to us.',
  mission: 'Learn by doing: come up with an idea, sell it at a booth, count the money, then do it better next time.',
  joinText: '',
  joinLink: '',
  contactEmail: '',
  instagram: '',
  currency: 'VND',
  year: '2026–27',
  founded: '',
  partnerText: 'Teachers, alumni and local businesses: sponsor an event, give a talk, or bring us a real problem to work on.',
  activities: [
    { icon: 'ventures', title: 'School booths', text: 'Halloween, Christmas, fairs. We pick what to sell, set the prices and run the stall ourselves.' },
    { icon: 'pitch', title: 'Pitch days', text: 'Got an idea? Three minutes to sell it to the club, then we vote on what to build.' },
    { icon: 'workshop', title: 'Workshops', text: 'Short hands-on sessions on budgeting, marketing and making a simple sales sheet.' },
    { icon: 'talks', title: 'Guest talks', text: 'People who run real businesses come in and answer anything we ask.' },
  ],
};

export const EXPENSE_CATEGORIES = ['Food & drinks', 'Printing', 'Prizes', 'Decorations', 'Transport', 'Venue', 'Marketing', 'Supplies', 'Other'];
export const INCOME_CATEGORIES = ['Sponsorship', 'Ticket sales', 'Product sales', 'School funding', 'Donations', 'Other'];
export const LEDGER_CATEGORIES = [...INCOME_CATEGORIES.filter((c) => c !== 'Other'), ...EXPENSE_CATEGORIES];
