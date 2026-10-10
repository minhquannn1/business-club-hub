import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type WriteBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Activity, Announcement, Column, Meeting, Member, Project, ProjectLink, PublicMember, PublicProject, QuickLink, Row, SchoolDate, Sheet, SiteContent, Task } from './types';
import { LEDGER_CATEGORIES } from './constants';
import { uid } from './format';
import { notify } from './notify';

let actor = '';
export function setActor(email: string) {
  actor = email;
}

export function log(verb: string, targetType: Activity['targetType'], targetId: string, targetTitle: string, detail = '') {
  if (!actor) return;
  const a: Omit<Activity, 'id'> = { at: Date.now(), actorEmail: actor, verb, targetType, targetId, targetTitle, detail };
  addDoc(collection(db, 'activity'), a).catch((e) => console.warn('[club] activity', e));
}

/* ---------------- projects ---------------- */

function publicMirror(p: Project): PublicProject {
  return {
    id: p.id,
    title: p.title,
    kind: p.kind,
    blurb: p.publicBlurb || p.summary,
    stage: p.stage,
    startDate: p.startDate,
    endDate: p.endDate,
    location: p.location,
    color: p.color,
    attendance: p.review?.attendance ?? 0,
    result: p.review?.result ?? '',
    description: p.description,
    updatedAt: Date.now(),
  };
}

async function syncPublicProject(p: Project) {
  const ref = doc(db, 'publicProjects', p.id);
  if (p.isPublic) await setDoc(ref, publicMirror(p));
  else await deleteDoc(ref).catch(() => {});
}

export async function createProject(data: Omit<Project, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(db, 'projects'), { ...data, createdAt: now, createdBy: actor, updatedAt: now });
  const p = { ...data, id: ref.id, createdAt: now, createdBy: actor, updatedAt: now } as Project;
  await syncPublicProject(p).catch((e) => console.warn(e));
  log('created', 'project', ref.id, data.title);
  return ref.id;
}

export async function updateProject(prev: Project, patch: Partial<Project>, verb = 'updated', detail = '') {
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  const { id: _id, ...rest } = { ...patch, updatedAt: next.updatedAt } as Partial<Project>;
  void _id;
  await updateDoc(doc(db, 'projects', prev.id), rest as DocumentData);
  const publicKeys: (keyof Project)[] = ['isPublic', 'title', 'kind', 'publicBlurb', 'summary', 'stage', 'startDate', 'endDate', 'location', 'color', 'review', 'description'];
  if (publicKeys.some((k) => k in patch) && (next.isPublic || prev.isPublic)) await syncPublicProject(next).catch((e) => console.warn(e));
  if (verb) log(verb, 'project', prev.id, next.title, detail);
}

export async function deleteProject(p: Project, tasks: Task[]) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'projects', p.id));
  for (const t of tasks.filter((t) => t.projectId === p.id)) batch.delete(doc(db, 'tasks', t.id));
  await batch.commit();
  await deleteDoc(doc(db, 'publicProjects', p.id)).catch(() => {});
  log('deleted', 'project', p.id, p.title);
}

/* ---------------- tasks ---------------- */

export async function createTask(data: Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>, quiet = false): Promise<string> {
  const now = Date.now();
  const ref = await addDoc(collection(db, 'tasks'), { ...data, createdAt: now, createdBy: actor, updatedAt: now });
  if (!quiet) log('created', 'task', ref.id, data.title, data.assigneeEmail ? `for ${data.assigneeEmail}` : '');
  // email the assignee; the server skips people who assigned themselves
  if (data.assigneeEmail && data.assigneeEmail !== actor && data.status !== 'done') void notify({ type: 'task', taskId: ref.id });
  return ref.id;
}

export async function updateTask(prev: Task, patch: Partial<Task>) {
  const p: DocumentData = { ...patch, updatedAt: Date.now() };
  delete p.id;
  if (patch.status === 'done' && prev.status !== 'done') p.completedAt = Date.now();
  if (patch.status && patch.status !== 'done' && prev.status === 'done') p.completedAt = deleteField();
  await updateDoc(doc(db, 'tasks', prev.id), p);
  if (patch.assigneeEmail && patch.assigneeEmail !== prev.assigneeEmail && patch.assigneeEmail !== actor) void notify({ type: 'task', taskId: prev.id });
  if (patch.status && patch.status !== prev.status) log(patch.status === 'done' ? 'completed' : 'moved', 'task', prev.id, prev.title, patch.status === 'done' ? '' : `to ${patch.status === 'doing' ? 'in progress' : 'to do'}`);
  else if (Object.keys(patch).length) log('updated', 'task', prev.id, patch.title ?? prev.title);
}

/** Exec: give someone else every open task of one member (when roles change or someone leaves). */
export async function handOverTasks(tasks: Task[], toEmail: string, fromName: string, toName: string) {
  const now = Date.now();
  for (let i = 0; i < tasks.length; i += 400) {
    const batch = writeBatch(db);
    for (const t of tasks.slice(i, i + 400)) batch.update(doc(db, 'tasks', t.id), { assigneeEmail: toEmail, updatedAt: now });
    await batch.commit();
  }
  log('gave', 'member', toEmail, toName, `${tasks.length} open ${tasks.length === 1 ? 'task' : 'tasks'} from ${fromName}`);
}

export async function deleteTask(t: Task) {
  await deleteDoc(doc(db, 'tasks', t.id));
  log('deleted', 'task', t.id, t.title);
}

/* ---------------- meetings ---------------- */

export async function saveMeeting(m: Omit<Meeting, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>, existing?: Meeting): Promise<string> {
  const now = Date.now();
  // turn new action items into tasks, keep linked tasks in sync
  const items = [];
  for (const it of m.actionItems) {
    if (!it.text.trim()) continue;
    if (!it.taskId) {
      const taskId = await createTask(
        {
          title: it.text.trim(),
          notes: `From meeting: ${m.title}`,
          projectId: m.projectId,
          assigneeEmail: it.assigneeEmail,
          dueDate: it.dueDate,
          priority: 'med',
          status: 'todo',
          meetingId: existing?.id ?? '',
        },
        true,
      );
      items.push({ ...it, taskId });
    } else items.push(it);
  }
  const data = { ...m, actionItems: items, updatedAt: now } as DocumentData;
  delete data.id;
  let id: string;
  if (existing) {
    id = existing.id;
    await updateDoc(doc(db, 'meetings', id), data);
    log('updated', 'meeting', id, m.title);
  } else {
    data.createdAt = now;
    data.createdBy = actor;
    const ref = await addDoc(collection(db, 'meetings'), data);
    id = ref.id;
    log('created', 'meeting', id, m.title);
  }
  // back-link new tasks to the meeting
  const newLinks = items.filter((it) => !m.actionItems.find((x) => x.id === it.id)?.taskId);
  await Promise.all(newLinks.map((it) => updateDoc(doc(db, 'tasks', it.taskId!), { meetingId: id }).catch(() => {})));
  return id;
}

export async function deleteMeeting(m: Meeting) {
  await deleteDoc(doc(db, 'meetings', m.id));
  log('deleted', 'meeting', m.id, m.title);
}

/* ---------------- members ---------------- */

async function syncPublicMember(m: Member, order: number) {
  const ref = doc(db, 'publicTeam', m.id.replace(/[^a-z0-9]/g, '_'));
  if (m.showOnSite && m.name) {
    const pm: Omit<PublicMember, 'id'> = { name: m.name, title: m.title ?? '', team: m.team ?? '', photoURL: m.sitePhoto || m.photoURL || '', bio: m.bio ?? '', order };
    await setDoc(ref, pm);
  } else await deleteDoc(ref).catch(() => {});
}

export async function inviteMember(m: Omit<Member, 'id'>): Promise<string> {
  const id = m.email.trim().toLowerCase();
  const ref = doc(db, 'members', id);
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) throw new Error(`${id} is already on the member list.`);
  await setDoc(ref, { ...m, email: id, joinedAt: Date.now() });
  await syncPublicMember({ ...m, id }, m.role === 'exec' ? 0 : 1).catch(() => {});
  log('invited', 'member', id, m.name || id);
  return id;
}

export async function updateMember(prev: Member, patch: Partial<Member>, self = false) {
  const p = { ...patch } as DocumentData;
  delete p.id;
  await updateDoc(doc(db, 'members', prev.id), p);
  const next = { ...prev, ...patch };
  if (!self || 'showOnSite' in patch || 'name' in patch || 'bio' in patch || 'sitePhoto' in patch)
    await syncPublicMember(next, next.role === 'exec' ? 0 : 1).catch(() => {});
  log(patch.role && patch.role !== prev.role ? (patch.role === 'exec' ? 'promoted' : 'changed role of') : 'updated', 'member', prev.id, next.name || prev.id);
}

export async function removeMember(m: Member) {
  await deleteDoc(doc(db, 'members', m.id));
  await deleteDoc(doc(db, 'publicTeam', m.id.replace(/[^a-z0-9]/g, '_'))).catch(() => {});
  log('removed', 'member', m.id, m.name || m.id);
}

/* ---------------- site ---------------- */

export async function saveSite(content: SiteContent) {
  await setDoc(doc(db, 'site', 'content'), content);
  log('updated', 'site', 'content', 'public website');
}

/* ---------------- sheets ---------------- */

export function ledgerColumns(): Column[] {
  return [
    { key: 'date', name: 'Date', type: 'date', role: 'date', width: 118 },
    { key: 'desc', name: 'Description', type: 'text', role: 'description', width: 240 },
    { key: 'dir', name: 'In / Out', type: 'select', role: 'direction', width: 92, options: ['In', 'Out'] },
    { key: 'cat', name: 'Category', type: 'select', role: 'category', width: 148, options: LEDGER_CATEGORIES },
    { key: 'proj', name: 'Project', type: 'project', role: 'project', width: 170 },
    { key: 'amt', name: 'Amount', type: 'currency', role: 'amount', width: 140 },
    { key: 'payer', name: 'Paid / received by', type: 'member', role: 'payer', width: 160 },
    { key: 'rcpt', name: 'Receipt', type: 'receipt', role: 'receipt', width: 96 },
    { key: 'note', name: 'Notes', type: 'text', width: 220 },
  ];
}

export function blankColumns(n = 8): Column[] {
  return Array.from({ length: n }, (_, i) => ({ key: uid('c'), name: '', type: 'text' as const, width: i === 0 ? 180 : 120 }));
}

export async function createSheet(name: string, kind: 'ledger' | 'blank' | 'budget', order: number, projectName = ''): Promise<string> {
  const columns =
    kind === 'ledger'
      ? ledgerColumns()
      : kind === 'budget'
        ? [
            { key: uid('c'), name: 'Item', type: 'text' as const, width: 220 },
            { key: uid('c'), name: 'Quantity', type: 'number' as const, width: 100 },
            { key: uid('c'), name: 'Unit cost', type: 'currency' as const, width: 130 },
            { key: uid('c'), name: 'Total', type: 'currency' as const, width: 140 },
            { key: uid('c'), name: 'Notes', type: 'text' as const, width: 220 },
          ]
        : blankColumns();
  const sheet: Omit<Sheet, 'id'> = { name, order, isLedger: kind === 'ledger', columns, createdAt: Date.now(), createdBy: actor };
  const ref = await addDoc(collection(db, 'sheets'), sheet);
  const batch = writeBatch(db);
  const n = kind === 'ledger' ? 30 : 20;
  for (let i = 0; i < n; i++) {
    const cells: Record<string, string> = {};
    if (kind === 'budget') {
      const [, q, u, t] = columns;
      if (i === 0) cells[columns[0].key] = projectName ? `Budget for ${projectName}` : '';
      cells[t.key] = i > 0 && i < n - 1 ? `=B${i + 1}*C${i + 1}` : '';
      void q;
      void u;
      if (i === n - 1) {
        cells[columns[0].key] = 'Total';
        cells[t.key] = `=SUM(D2:D${n - 1})`;
      }
    }
    batch.set(doc(collection(db, 'sheets', ref.id, 'rows')), { order: (i + 1) * 1024, cells, updatedAt: Date.now(), updatedBy: actor });
  }
  await batch.commit();
  log('created', 'sheet', ref.id, name);
  return ref.id;
}

export async function updateSheet(sheetId: string, patch: Partial<Sheet>, title?: string) {
  const p = { ...patch } as DocumentData;
  delete p.id;
  await updateDoc(doc(db, 'sheets', sheetId), p);
  if (title) log('updated', 'sheet', sheetId, title, patch.name ? 'renamed' : 'columns');
}

export async function deleteSheet(sheet: Sheet) {
  const rows = await getDocs(collection(db, 'sheets', sheet.id, 'rows'));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of rows.docs) {
    batch.delete(d.ref);
    if (++n % 450 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  batch.delete(doc(db, 'sheets', sheet.id));
  await batch.commit();
  log('deleted', 'sheet', sheet.id, sheet.name);
}

export interface CellWrite {
  rowId: string;
  colKey: string;
  value: string;
}

/** Writes many cells at once; each cell is its own field so two people editing different cells of one row never collide. */
export async function writeCells(sheetId: string, writes: CellWrite[]) {
  if (!writes.length) return;
  const byRow = new Map<string, DocumentData>();
  for (const w of writes) {
    if (!byRow.has(w.rowId)) byRow.set(w.rowId, { updatedAt: Date.now(), updatedBy: actor });
    byRow.get(w.rowId)![`cells.${w.colKey}`] = w.value === '' ? deleteField() : w.value;
  }
  let batch: WriteBatch = writeBatch(db);
  let n = 0;
  for (const [rowId, patch] of byRow) {
    batch.update(doc(db, 'sheets', sheetId, 'rows', rowId), patch);
    if (++n % 450 === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  await batch.commit();
}

export async function addRows(sheetId: string, afterOrder: number, beforeOrder: number | null, count: number, cells: Record<string, string>[] = []): Promise<string[]> {
  const batch = writeBatch(db);
  const ids: string[] = [];
  const end = beforeOrder ?? afterOrder + 1024 * (count + 1);
  const step = (end - afterOrder) / (count + 1);
  for (let i = 0; i < count; i++) {
    const ref = doc(collection(db, 'sheets', sheetId, 'rows'));
    ids.push(ref.id);
    batch.set(ref, { order: afterOrder + step * (i + 1), cells: cells[i] ?? {}, updatedAt: Date.now(), updatedBy: actor });
  }
  await batch.commit();
  return ids;
}

export async function deleteRows(sheetId: string, rowIds: string[]) {
  const batch = writeBatch(db);
  for (const id of rowIds) batch.delete(doc(db, 'sheets', sheetId, 'rows', id));
  await batch.commit();
}

export async function reorderRows(sheetId: string, rows: Row[]) {
  const batch = writeBatch(db);
  rows.forEach((r, i) => batch.update(doc(db, 'sheets', sheetId, 'rows', r.id), { order: (i + 1) * 1024 }));
  await batch.commit();
}

/* ---------------- receipts ---------------- */

export async function saveReceipt(dataUrl: string, name: string, sheetName: string): Promise<string> {
  const ref = await addDoc(collection(db, 'receipts'), { dataUrl, name, at: Date.now(), by: actor });
  log('attached a receipt to', 'receipt', ref.id, sheetName, name);
  return ref.id;
}

export async function loadReceipt(id: string): Promise<{ dataUrl: string; name: string } | null> {
  const s = await getDoc(doc(db, 'receipts', id));
  return s.exists() ? (s.data() as { dataUrl: string; name: string }) : null;
}

/** Shrinks a photo so it fits comfortably in a Firestore document (under ~400 KB). */
export async function compressImage(file: File, maxSide = 1400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not an image we can read.'));
      i.src = url;
    });
    let { width, height } = img;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    let q = 0.8;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > 520_000 && q > 0.35) {
      q -= 0.1;
      out = canvas.toDataURL('image/jpeg', q);
    }
    if (out.length > 900_000) throw new Error('This image is too large even after shrinking. Try a smaller photo.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Centre-crops an image to a square and returns a small jpeg data URL (about 30 to 60 KB). */
export async function compressSquare(file: File, side = 480): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not an image we can read.'));
      i.src = url;
    });
    const s = Math.min(img.width, img.height);
    const size = Math.min(side, s);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    let q = 0.82;
    let out = canvas.toDataURL('image/jpeg', q);
    while (out.length > 90_000 && q > 0.4) {
      q -= 0.08;
      out = canvas.toDataURL('image/jpeg', q);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------------- import ---------------- */

export interface ImportedEvent {
  title: string;
  kind: 'event' | 'project';
  color?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  summary?: string;
  /** ledger rows; amounts in VND as plain digits */
  rows: { desc: string; dir: 'In' | 'Out'; cat?: string; amt?: string; note?: string }[];
}

/** Creates a finished project and its own ledger sheet for each event. */
export async function importEvents(events: ImportedEvent[], firstOrder: number) {
  const now = Date.now();
  let i = 0;
  for (const e of events) {
    const inSum = e.rows.filter((r) => r.dir === 'In').reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const outSum = e.rows.filter((r) => r.dir === 'Out').reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const projectId = await createProject({
      title: e.title,
      kind: e.kind,
      summary: e.summary ?? '',
      description: '',
      goals: '',
      stage: 'done',
      leadEmail: actor,
      teamEmails: [],
      startDate: e.startDate ?? '',
      endDate: e.endDate ?? '',
      location: e.location ?? '',
      color: e.color || '#1E3FD8',
      budgetPlanned: 0,
      isPublic: false,
      publicBlurb: '',
      review: { notes: `Imported from the club's P/L sheet. Money in ${inSum.toLocaleString('en-US')} VND, money out ${outSum.toLocaleString('en-US')} VND, profit ${(inSum - outSum).toLocaleString('en-US')} VND.` },
      order: firstOrder + i,
    });
    const sheet: Omit<Sheet, 'id'> = { name: e.title, order: firstOrder + i, isLedger: true, columns: ledgerColumns(), createdAt: now + i, createdBy: actor };
    const ref = await addDoc(collection(db, 'sheets'), sheet);
    const batch = writeBatch(db);
    const n = e.rows.length;
    const put = (k: number, cells: Record<string, string>) =>
      batch.set(doc(collection(db, 'sheets', ref.id, 'rows')), { order: (k + 1) * 1024, cells, updatedAt: now, updatedBy: actor });
    e.rows.forEach((r, k) => put(k, { desc: r.desc, dir: r.dir, cat: r.cat ?? '', proj: projectId, amt: r.amt ?? '', note: r.note ?? '' }));
    put(n, {});
    put(n + 1, { desc: 'Profit', amt: `=SUMIF(C1:C${n},"In",F1:F${n})-SUMIF(C1:C${n},"Out",F1:F${n})` });
    for (let k = n + 2; k < n + 12; k++) put(k, {});
    await batch.commit();
    log('created', 'sheet', ref.id, e.title, 'imported');
    i++;
  }
}

/* ---------------- school calendar and links ---------------- */

export async function saveSchoolDate(d: Omit<SchoolDate, 'id'> & { id?: string }) {
  const { id, ...data } = d;
  if (id) await setDoc(doc(db, 'schoolDates', id), data);
  else await addDoc(collection(db, 'schoolDates'), data);
}

export async function deleteSchoolDate(id: string) {
  await deleteDoc(doc(db, 'schoolDates', id));
}

/** Starts an Idea-stage project for a school date and links the two. */
export async function planForSchoolDate(d: SchoolDate, order: number): Promise<string> {
  const id = await createProject({
    title: /booth|stall|fair/i.test(d.title) ? d.title : `${d.title} booth`,
    kind: 'event',
    summary: '',
    description: d.note ?? '',
    goals: '',
    stage: 'idea',
    leadEmail: actor,
    teamEmails: [],
    startDate: d.date,
    endDate: d.endDate || d.date,
    location: 'ISPH',
    color: '#1E3FD8',
    budgetPlanned: 0,
    isPublic: false,
    publicBlurb: '',
    order,
  });
  await updateDoc(doc(db, 'schoolDates', d.id), { projectId: id });
  return id;
}

export async function saveLink(l: Omit<QuickLink, 'id'> & { id?: string }) {
  const { id, ...data } = l;
  if (id) await setDoc(doc(db, 'links', id), data);
  else await addDoc(collection(db, 'links'), data);
}

export async function deleteLink(id: string) {
  await deleteDoc(doc(db, 'links', id));
}

/* ---------------- bulk import (exec only) ---------------- */

export interface PlannedProject {
  title: string;
  kind?: 'event' | 'project';
  stage?: Project['stage'];
  startDate?: string;
  endDate?: string;
  location?: string;
  summary?: string;
  description?: string;
  goals?: string;
  color?: string;
  budgetPlanned?: number;
  links?: ProjectLink[];
  tasks?: { title: string; dueDate?: string; notes?: string; mine?: boolean }[];
  /** budget lines become a budget sheet named after the project */
  budget?: { item: string; qty?: number; unit?: number; notes?: string }[];
}

export interface ImportBundle {
  events?: ImportedEvent[];
  projects?: PlannedProject[];
  /** linkTo: title of a project in this bundle to attach the date to */
  schoolDates?: (Omit<SchoolDate, 'id'> & { linkTo?: string })[];
  links?: Omit<QuickLink, 'id'>[];
  ledgers?: string[]; // empty ledger sheets to create
}

export async function importBundle(b: ImportBundle, baseOrder: number) {
  let order = baseOrder;
  const report: string[] = [];
  const made = new Map<string, string>();
  if (b.events?.length) {
    await importEvents(b.events, order);
    order += b.events.length;
    report.push(`${b.events.length} past events`);
  }
  for (const pp of b.projects ?? []) {
    const id = await createProject({
      title: pp.title,
      kind: pp.kind ?? 'event',
      summary: pp.summary ?? '',
      description: pp.description ?? '',
      goals: pp.goals ?? '',
      stage: pp.stage ?? 'planning',
      leadEmail: actor,
      teamEmails: [],
      startDate: pp.startDate ?? '',
      endDate: pp.endDate ?? pp.startDate ?? '',
      location: pp.location ?? '',
      color: pp.color || '#1E3FD8',
      budgetPlanned: pp.budgetPlanned ?? 0,
      isPublic: false,
      publicBlurb: '',
      links: pp.links ?? [],
      order: order++,
    });
    made.set(pp.title, id);
    for (const t of pp.tasks ?? []) {
      await createTask({ title: t.title, notes: t.notes ?? '', projectId: id, assigneeEmail: t.mine ? actor : '', dueDate: t.dueDate ?? '', priority: 'med', status: 'todo' }, true);
    }
    if (pp.budget?.length) {
      const sheetId = await createSheet(`${pp.title} budget`, 'budget', order++, pp.title);
      const sheet = await getDoc(doc(db, 'sheets', sheetId));
      const cols = (sheet.data() as Sheet).columns;
      const rows = (await getDocs(collection(db, 'sheets', sheetId, 'rows'))).docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Row, 'id'>) })).sort((a, b) => a.order - b.order);
      const batch = writeBatch(db);
      pp.budget.forEach((line, i) => {
        const r = rows[i + 1];
        if (!r) return;
        const cells: Record<string, string> = { ...r.cells, [cols[0].key]: line.item, [cols[4].key]: line.notes ?? '' };
        if (line.qty != null) cells[cols[1].key] = String(line.qty);
        if (line.unit != null) cells[cols[2].key] = String(line.unit);
        batch.update(doc(db, 'sheets', sheetId, 'rows', r.id), { cells });
      });
      await batch.commit();
    }
    report.push(pp.title);
  }
  for (const { linkTo, ...d } of b.schoolDates ?? []) await saveSchoolDate(linkTo && made.get(linkTo) ? { ...d, projectId: made.get(linkTo) } : d);
  if (b.schoolDates?.length) report.push(`${b.schoolDates.length} school dates`);
  for (const l of b.links ?? []) await saveLink(l);
  if (b.links?.length) report.push(`${b.links.length} links`);
  for (const name of b.ledgers ?? []) {
    await createSheet(name, 'ledger', order++);
    report.push(`${name} ledger`);
  }
  return report;
}

/* ---------------- announcements ---------------- */

export async function createAnnouncement(a: Pick<Announcement, 'title' | 'body' | 'audience'>): Promise<string> {
  const ref = await addDoc(collection(db, 'announcements'), { ...a, createdBy: actor, createdAt: Date.now() });
  return ref.id;
}

export async function deleteAnnouncement(id: string) {
  await deleteDoc(doc(db, 'announcements', id));
}
