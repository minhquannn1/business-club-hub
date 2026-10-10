/** guest: outside the club, only on certain projects */
export type Role = 'exec' | 'member' | 'guest';
/** Extra things an exec member can be allowed to edit. Admins can do all of them. */
export type Perm = 'finance' | 'website';
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
  invitedAt?: number; // when the sign-in email was last sent (set by the server)
  admin?: boolean; // exec only: can also manage people, roles and delete projects
  perms?: Perm[]; // exec only: money and/or website
  hidden?: boolean; // backup account: keeps access but is left out of lists and pickers
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

/* ---------- competition deliverables ---------- */

export type DeliverableStatus = 'todo' | 'drafting' | 'review' | 'final' | 'submitted';
export type DocFont = 'Times New Roman' | 'Arial' | 'Calibri' | 'Georgia';

/** How the document looks on the page and when exported. */
export interface DocFormat {
  font: DocFont;
  size: number; // pt
  lineHeight: number; // 1 = single, 2 = double
  margin: number; // inches, all sides
  paper: 'letter' | 'a4';
  pageNumbers?: boolean;
}

/** What the competition does not allow in this document. */
export interface DocRules {
  noImages?: boolean;
  noLinks?: boolean;
  noTables?: boolean;
  maxMB?: number;
}

/** Something a competition team has to hand in: a written document or a file. */
export interface Deliverable {
  id: string;
  projectId: string;
  title: string;
  kind: 'doc' | 'file';
  status: DeliverableStatus;
  ownerEmail: string;
  roundId?: string; // the competition deadline it is due for
  dueDate?: string; // used when there is no round
  instructions?: string; // the competition's rules for it
  format: DocFormat;
  rules?: DocRules;
  link?: string; // the file, or where it was submitted
  words?: number;
  order: number;
  templateKey?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
  submittedAt?: number;
  submittedBy?: string;
}

/** One part of a deliverable, with its own word limit and writer. */
export interface DocSection {
  id: string;
  title: string;
  order: number;
  limit?: number; // words, 0 or missing = no limit
  hint?: string;
  content: string; // editor JSON as a string
  words: number;
  writerEmail?: string;
  printTitle?: boolean; // show the title as a heading in the export
  pageBreakBefore?: boolean;
  rev: number;
  updatedAt?: number;
  updatedBy?: string;
  lock?: { email: string; at: number } | null;
}

export interface DocVersion {
  id: string;
  at: number;
  by: string;
  label: string;
  sections: Pick<DocSection, 'title' | 'order' | 'limit' | 'hint' | 'content' | 'words' | 'writerEmail' | 'printTitle' | 'pageBreakBefore'>[];
}

export interface DocComment {
  id: string;
  sectionId: string;
  quote?: string;
  body: string;
  by: string;
  at: number;
  resolved?: boolean;
  resolvedBy?: string;
}
