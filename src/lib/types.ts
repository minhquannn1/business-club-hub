export type Role = 'exec' | 'member';
export type Stage = 'idea' | 'planning' | 'active' | 'done';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'med' | 'high';
export type ProjectKind = 'event' | 'project' | 'competition';

export interface Member {
  id: string; // lowercase email
  email: string;
  name: string;
  photoURL?: string; // from Google, refreshed on sign-in
  sitePhoto?: string; // uploaded for the website (small jpeg data URL)
  role: Role;
  title?: string; // President, Treasurer...
  team?: string; // Marketing, Finance, Events...
  showOnSite?: boolean;
  bio?: string;
  uid?: string;
  joinedAt?: number;
  lastSeenAt?: number;
  emailOff?: boolean; // no task reminder emails
}

export interface ProjectReview {
  attendance?: number;
  result?: string; // competitions: placing or award
  rating?: number; // 1..5
  wentWell?: string;
  improve?: string;
  notes?: string;
}

export interface Project {
  id: string;
  title: string;
  kind: ProjectKind;
  summary: string;
  description: string;
  goals: string;
  stage: Stage;
  leadEmail: string;
  teamEmails: string[];
  startDate: string; // yyyy-MM-dd or ''
  endDate: string;
  location: string;
  color: string;
  budgetPlanned: number;
  isPublic: boolean;
  publicBlurb: string;
  review?: ProjectReview;
  links?: ProjectLink[];
  organizer?: string; // competitions: who runs it
  rounds?: Round[]; // competitions: official deadlines and rounds
  order: number;
  createdAt: number;
  createdBy: string;
  updatedAt: number;
}

/** One official deadline or stage of a competition. */
export interface Round {
  id: string;
  name: string;
  date: string; // yyyy-MM-dd, '' when not announced yet
  done?: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  projectId: string; // '' if none
  assigneeEmail: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  meetingId?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface ActionItem {
  id: string;
  text: string;
  assigneeEmail: string;
  dueDate: string;
  taskId?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  projectId: string;
  attendees: string[];
  notes: string;
  decisions: string;
  actionItems: ActionItem[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  emailedAt?: number;
}

export interface Activity {
  id: string;
  at: number;
  actorEmail: string;
  verb: string; // i18n key suffix
  targetType: 'project' | 'task' | 'meeting' | 'member' | 'sheet' | 'site' | 'receipt';
  targetId: string;
  targetTitle: string;
  detail?: string;
}

export type ColType = 'text' | 'number' | 'currency' | 'date' | 'select' | 'project' | 'member' | 'receipt';
export type ColRole = 'date' | 'amount' | 'direction' | 'project' | 'category' | 'payer' | 'receipt' | 'description' | '';

export interface Column {
  key: string; // stable id
  name: string;
  type: ColType;
  role?: ColRole;
  width: number;
  options?: string[];
}

export interface Sheet {
  id: string;
  name: string;
  order: number;
  isLedger: boolean;
  columns: Column[];
  createdAt: number;
  createdBy: string;
}

export interface Row {
  id: string;
  order: number;
  cells: Record<string, string>; // colKey -> raw text (formulas start with '=')
  updatedAt?: number;
  updatedBy?: string;
}

export interface SiteContent {
  clubName: string;
  shortName: string;
  school: string;
  tagline: string;
  about: string;
  mission: string;
  joinText: string;
  joinLink: string;
  contactEmail: string;
  instagram: string;
  currency: string; // ISO code, e.g. VND
  year: string;
  activities: Activity2[];
  partnerText: string;
  founded: string;
  showTeam?: boolean; // the Meet the team section on the website
}

export interface Activity2 {
  icon: string; // key in Pictograms
  title: string;
  text: string;
}

export interface PublicProject {
  id: string;
  title: string;
  kind: ProjectKind;
  blurb: string;
  stage: Stage;
  startDate: string;
  endDate: string;
  location: string;
  color: string;
  attendance?: number;
  result?: string;
  description: string;
  updatedAt: number;
}

export interface PublicMember {
  id: string;
  name: string;
  title: string;
  team: string;
  photoURL?: string;
  bio?: string;
  order: number;
}

export interface ProjectLink {
  label: string;
  url: string;
}

/** A date on the school calendar (not a club project). */
export interface SchoolDate {
  id: string;
  title: string;
  date: string; // yyyy-MM-dd
  endDate?: string;
  kind: 'school' | 'holiday' | 'booth'; // booth = a chance for the club to run a stall
  note?: string;
  projectId?: string; // set once the club plans something for it
}

/** A link pinned to the workspace overview (masterplans, shared sheets...). */
export interface QuickLink {
  id: string;
  label: string;
  url: string;
  order: number;
}

/** A message from the exec team, shown on the Overview and optionally emailed. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string; // 'all' | 'exec' | 'team:<name>'
  createdBy: string;
  createdAt: number;
  emailedAt?: number;
  recipientCount?: number;
}
