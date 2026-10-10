import type { Stage, TaskStatus, Priority, SiteContent } from './types';

/** The club owner. Always has exec rights, even before being added to the member list. Mirrored in firestore.rules. */
export const OWNER_EMAIL = 'minhquan.n.student@isph.edu.vn';

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'idea', label: 'Idea', hint: 'Worth talking about' },
  { key: 'planning', label: 'Planning', hint: 'Owner, dates and budget being set' },
  { key: 'active', label: 'Running', hint: 'Happening now' },
  { key: 'done', label: 'Done', hint: 'Finished and reviewed' },
];

export const STAGE_LABEL: Record<Stage, string> = { idea: 'Idea', planning: 'Planning', active: 'Running', done: 'Done' };

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

/** The exec roles, in the order they appear on the website. */
export const ROLES = ['President', 'Vice President', 'Treasurer', 'Head of Marketing'];
export const roleRank = (title?: string) => {
  const i = ROLES.findIndex((r) => r.toLowerCase() === (title ?? '').trim().toLowerCase());
  return i < 0 ? ROLES.length : i;
};

/** Stage names as they read for a competition. */
export const COMP_STAGE_LABEL: Record<Stage, string> = { idea: 'Thinking about it', planning: 'Signed up', active: 'Competing', done: 'Finished' };

export interface CompetitionTemplate {
  key: string;
  title: string;
  organizer: string;
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
  website: string;
  rounds: { name: string; date: string }[];
}

/** Known competitions, with their official dates. Checked against the organiser's page. */
export const COMPETITION_TEMPLATES: CompetitionTemplate[] = [
  {
    key: 'wharton-2026',
    title: 'Wharton Investment Competition 2026-27',
    organizer: 'Wharton Global Youth Program',
    summary: 'Teams of 4 to 6 manage a virtual portfolio for a client case and write up the strategy.',
    description:
      'Wharton Global High School Investment Competition 2026-27.\n\nTeams: 4 to 6 students in grades 9 to 12, with a teacher from the school as advisor. Free to enter.\n\nJudged on the strategy: how well it fits the client in the case, the research and how clearly it is written. Portfolio returns are not what wins.\n\nTools: SurveyMonkey Apply for the case, updates and submissions; the Wharton Investment Simulator (WInS) for the portfolio.\n\nDeadlines are 5:00 p.m. New York time, which is 4:00 or 5:00 a.m. the next morning in Vietnam. Submit on the evening of the deadline day to be safe.\n\nAfter the final report, judges pick 50 semifinalists for virtual semifinals; the top 10 go to the Global Finale in Philadelphia.',
    startDate: '2026-09-28',
    endDate: '2026-12-04',
    website: 'https://globalyouth.wharton.upenn.edu/competitions/investment-competition/',
    rounds: [
      { name: 'Trading starts on WInS', date: '2026-09-28' },
      { name: 'Official team roster', date: '2026-10-09' },
      { name: 'Trading Notes Analysis', date: '2026-10-23' },
      { name: 'Investment Policy Statement (IPS)', date: '2026-11-06' },
      { name: 'Final report and school documents', date: '2026-12-04' },
      { name: 'Top 50 semifinalists announced', date: '' },
      { name: 'Global Finale in Philadelphia (top 10)', date: '2027-04-29' },
    ],
  },
];

export const KIND_LABEL: Record<string, string> = { event: 'Event', project: 'Ongoing project', competition: 'Competition' };

export const TEAMS = ['Leadership', 'MAC (Marketing & Content)', 'Finance & Accounting', 'Logistics & Operations', 'Technical'];

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
    { icon: 'competitions', title: 'Competitions', text: 'We put teams into business competitions: case challenges, pitch rounds and business plans.' },
    { icon: 'pitch', title: 'Pitch days', text: 'Got an idea? Three minutes to sell it to the club, then we vote on what to build.' },
    { icon: 'workshop', title: 'Workshops', text: 'Short hands-on sessions on budgeting, marketing and making a simple sales sheet.' },
    { icon: 'talks', title: 'Guest talks', text: 'People who run real businesses come in and answer anything we ask.' },
  ],
};

export const EXPENSE_CATEGORIES = ['Food & drinks', 'Supplies', 'Decorations', 'Printing', 'Marketing', 'Prizes', 'Transport', 'Venue', 'Cash float', 'Miscellaneous'];
export const INCOME_CATEGORIES = ['Sponsorship', 'Ticket sales', 'Product sales', 'School funding', 'Donations', 'Other'];
export const LEDGER_CATEGORIES = [...INCOME_CATEGORIES.filter((c) => c !== 'Other'), ...EXPENSE_CATEGORIES];
