import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, runTransaction, updateDoc, where, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from './firebase';
import { DEMO } from './store';
import { log } from './actions';
import { seedSections, type DocTemplate } from './docTemplates';
import type { Deliverable, DeliverableStatus, DocComment, DocSection, DocVersion, Project } from './types';

/* Deliverables live in their own collection, with sections, comments and saved
   versions as subcollections. Each section is its own document so two people
   can write different sections at the same time. The demo mode uses an
   in-memory copy with the same interface. */

export const STATUS_LABEL: Record<DeliverableStatus, string> = {
  todo: 'Not started',
  drafting: 'Drafting',
  review: 'Ready for review',
  final: 'Final',
  submitted: 'Submitted',
};
export const STATUSES = Object.keys(STATUS_LABEL) as DeliverableStatus[];

/** A section someone touched less than this long ago is theirs. */
export const LOCK_MS = 45_000;
export const lockedBy = (s: DocSection, me: string, now = Date.now()) => (s.lock && s.lock.email !== me && now - s.lock.at < LOCK_MS ? s.lock.email : '');

export type SaveResult = { ok: true; rev: number } | { ok: false; theirs: DocSection };

type Unsub = () => void;
interface Repo {
  watchProject(projectId: string, cb: (list: Deliverable[]) => void): Unsub;
  watchOne(id: string, cb: (d: Deliverable | null) => void): Unsub;
  watchSections(id: string, cb: (list: DocSection[]) => void): Unsub;
  watchComments(id: string, cb: (list: DocComment[]) => void): Unsub;
  versions(id: string): Promise<DocVersion[]>;
  create(d: Omit<Deliverable, 'id'>, sections: Omit<DocSection, 'id'>[]): Promise<string>;
  update(id: string, patch: Partial<Deliverable>): Promise<void>;
  remove(id: string): Promise<void>;
  addSection(id: string, s: Omit<DocSection, 'id'>): Promise<string>;
  updateSection(id: string, sid: string, patch: Partial<DocSection>): Promise<void>;
  removeSection(id: string, sid: string): Promise<void>;
  saveContent(id: string, sid: string, content: string, words: number, baseRev: number, me: string, force?: boolean): Promise<SaveResult>;
  lock(id: string, sid: string, me: string): Promise<string>; // '' when it's yours, else who has it
  unlock(id: string, sid: string, me: string): Promise<void>;
  addVersion(id: string, v: Omit<DocVersion, 'id'>): Promise<void>;
  addComment(id: string, c: Omit<DocComment, 'id'>): Promise<void>;
  updateComment(id: string, cid: string, patch: Partial<DocComment>): Promise<void>;
  removeComment(id: string, cid: string): Promise<void>;
}

const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
const withId = <T,>(d: { id: string; data: () => DocumentData }) => ({ id: d.id, ...(d.data() as object) }) as T;

/* ---------- Firestore ---------- */

const fire: Repo = {
  watchProject(projectId, cb) {
    return onSnapshot(
      query(collection(db, 'deliverables'), where('projectId', '==', projectId)),
      (s) => cb(s.docs.map((d) => withId<Deliverable>(d)).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)),
      (e) => {
        console.warn('[club] deliverables', e);
        cb([]);
      },
    );
  },
  watchOne(id, cb) {
    return onSnapshot(
      doc(db, 'deliverables', id),
      (s) => cb(s.exists() ? withId<Deliverable>(s) : null),
      () => cb(null),
    );
  },
  watchSections(id, cb) {
    return onSnapshot(query(collection(db, 'deliverables', id, 'sections'), orderBy('order')), (s) => cb(s.docs.map((d) => withId<DocSection>(d))), (e) => console.warn('[club] sections', e));
  },
  watchComments(id, cb) {
    return onSnapshot(query(collection(db, 'deliverables', id, 'comments'), orderBy('at')), (s) => cb(s.docs.map((d) => withId<DocComment>(d))), (e) => console.warn('[club] comments', e));
  },
  async versions(id) {
    const s = await getDocs(query(collection(db, 'deliverables', id, 'versions'), orderBy('at', 'desc')));
    return s.docs.map((d) => withId<DocVersion>(d));
  },
  async create(d, sections) {
    const ref = await addDoc(collection(db, 'deliverables'), clean(d));
    // sections check the deliverable's project, so they go in once it exists
    if (sections.length) {
      const batch = writeBatch(db);
      for (const s of sections) batch.set(doc(collection(db, 'deliverables', ref.id, 'sections')), clean(s));
      await batch.commit();
    }
    return ref.id;
  },
  async update(id, patch) {
    const p = { ...patch } as Partial<Deliverable>;
    delete p.id;
    await updateDoc(doc(db, 'deliverables', id), clean(p) as DocumentData);
  },
  async remove(id) {
    for (const sub of ['sections', 'comments', 'versions']) {
      const s = await getDocs(collection(db, 'deliverables', id, sub));
      for (let i = 0; i < s.docs.length; i += 400) {
        const batch = writeBatch(db);
        s.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'deliverables', id));
  },
  async addSection(id, s) {
    const ref = await addDoc(collection(db, 'deliverables', id, 'sections'), clean(s));
    return ref.id;
  },
  async updateSection(id, sid, patch) {
    const p = { ...patch } as Partial<DocSection>;
    delete p.id;
    await updateDoc(doc(db, 'deliverables', id, 'sections', sid), clean(p) as DocumentData);
  },
  async removeSection(id, sid) {
    await deleteDoc(doc(db, 'deliverables', id, 'sections', sid));
  },
  async saveContent(id, sid, content, words, baseRev, me, force) {
    const ref = doc(db, 'deliverables', id, 'sections', sid);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('This section was removed.');
      const cur = withId<DocSection>(snap);
      if (!force && cur.rev !== baseRev && cur.updatedBy !== me) return { ok: false as const, theirs: cur };
      const rev = (cur.rev ?? 0) + 1;
      tx.update(ref, { content, words, rev, updatedAt: Date.now(), updatedBy: me, lock: { email: me, at: Date.now() } });
      return { ok: true as const, rev };
    });
  },
  async lock(id, sid, me) {
    const ref = doc(db, 'deliverables', id, 'sections', sid);
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return '';
      const who = lockedBy(withId<DocSection>(snap), me);
      if (who) return who;
      tx.update(ref, { lock: { email: me, at: Date.now() } });
      return '';
    });
  },
  async unlock(id, sid, me) {
    const ref = doc(db, 'deliverables', id, 'sections', sid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists() && (snap.get('lock') as DocSection['lock'])?.email === me) tx.update(ref, { lock: null });
    }).catch(() => {});
  },
  async addVersion(id, v) {
    await addDoc(collection(db, 'deliverables', id, 'versions'), v);
  },
  async addComment(id, c) {
    await addDoc(collection(db, 'deliverables', id, 'comments'), clean(c));
  },
  async updateComment(id, cid, patch) {
    await updateDoc(doc(db, 'deliverables', id, 'comments', cid), clean(patch) as DocumentData);
  },
  async removeComment(id, cid) {
    await deleteDoc(doc(db, 'deliverables', id, 'comments', cid));
  },
};

/* ---------- in memory (demo) ---------- */

function memoryRepo(): Repo {
  let n = 0;
  const nid = (p: string) => `${p}${++n}`;
  const dels = new Map<string, Deliverable>();
  const secs = new Map<string, Map<string, DocSection>>();
  const coms = new Map<string, Map<string, DocComment>>();
  const vers = new Map<string, DocVersion[]>();
  const subs = new Set<() => void>();
  const emit = () => setTimeout(() => subs.forEach((f) => f()), 0);
  const watch = (f: () => void): Unsub => {
    subs.add(f);
    setTimeout(f, 0);
    return () => subs.delete(f);
  };
  const sec = (id: string) => secs.get(id) ?? secs.set(id, new Map()).get(id)!;
  const com = (id: string) => coms.get(id) ?? coms.set(id, new Map()).get(id)!;
  return {
    watchProject: (pid, cb) => watch(() => cb([...dels.values()].filter((d) => d.projectId === pid).sort((a, b) => a.order - b.order))),
    watchOne: (id, cb) => watch(() => cb(dels.get(id) ? { ...dels.get(id)! } : null)),
    watchSections: (id, cb) => watch(() => cb([...sec(id).values()].map((s) => ({ ...s })).sort((a, b) => a.order - b.order))),
    watchComments: (id, cb) => watch(() => cb([...com(id).values()].sort((a, b) => a.at - b.at))),
    versions: async (id) => [...(vers.get(id) ?? [])].sort((a, b) => b.at - a.at),
    async create(d, sections) {
      const id = nid('d');
      dels.set(id, { ...d, id });
      for (const s of sections) {
        const sid = nid('s');
        sec(id).set(sid, { ...s, id: sid });
      }
      emit();
      return id;
    },
    async update(id, patch) {
      const d = dels.get(id);
      if (d) dels.set(id, { ...d, ...clean(patch), id });
      emit();
    },
    async remove(id) {
      dels.delete(id);
      emit();
    },
    async addSection(id, s) {
      const sid = nid('s');
      sec(id).set(sid, { ...s, id: sid });
      emit();
      return sid;
    },
    async updateSection(id, sid, patch) {
      const s = sec(id).get(sid);
      if (s) sec(id).set(sid, { ...s, ...clean(patch), id: sid });
      emit();
    },
    async removeSection(id, sid) {
      sec(id).delete(sid);
      emit();
    },
    async saveContent(id, sid, content, words, baseRev, me, force) {
      const s = sec(id).get(sid);
      if (!s) throw new Error('This section was removed.');
      if (!force && s.rev !== baseRev && s.updatedBy !== me) return { ok: false, theirs: { ...s } };
      const rev = s.rev + 1;
      sec(id).set(sid, { ...s, content, words, rev, updatedAt: Date.now(), updatedBy: me, lock: { email: me, at: Date.now() } });
      emit();
      return { ok: true, rev };
    },
    async lock(id, sid, me) {
      const s = sec(id).get(sid);
      if (!s) return '';
      const who = lockedBy(s, me);
      if (who) return who;
      sec(id).set(sid, { ...s, lock: { email: me, at: Date.now() } });
      emit();
      return '';
    },
    async unlock(id, sid, me) {
      const s = sec(id).get(sid);
      if (s?.lock?.email === me) sec(id).set(sid, { ...s, lock: null });
      emit();
    },
    async addVersion(id, v) {
      vers.set(id, [...(vers.get(id) ?? []), { ...v, id: nid('v') }]);
    },
    async addComment(id, c) {
      const cid = nid('c');
      com(id).set(cid, { ...c, id: cid });
      emit();
    },
    async updateComment(id, cid, patch) {
      const c = com(id).get(cid);
      if (c) com(id).set(cid, { ...c, ...clean(patch) });
      emit();
    },
    async removeComment(id, cid) {
      com(id).delete(cid);
      emit();
    },
  };
}

export const repo: Repo = DEMO ? memoryRepo() : fire;

/* ---------- hooks ---------- */

export function useDeliverables(projectIds: string[]): { list: Deliverable[]; loading: boolean } {
  const key = projectIds.join(',');
  const [byProject, setByProject] = useState<Record<string, Deliverable[]>>({});
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    setByProject({});
    const unsubs = ids.map((pid) => repo.watchProject(pid, (list) => setByProject((m) => ({ ...m, [pid]: list }))));
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return useMemo(() => {
    const ids = key ? key.split(',') : [];
    return { list: ids.flatMap((id) => byProject[id] ?? []), loading: ids.some((id) => !byProject[id]) };
  }, [byProject, key]);
}

export function useDeliverable(id: string) {
  const [d, setD] = useState<Deliverable | null | undefined>(undefined);
  const [sections, setSections] = useState<DocSection[]>([]);
  const [comments, setComments] = useState<DocComment[]>([]);
  useEffect(() => {
    const u = [repo.watchOne(id, setD), repo.watchSections(id, setSections), repo.watchComments(id, setComments)];
    return () => u.forEach((f) => f());
  }, [id]);
  return { d, sections, comments };
}

/* ---------- actions ---------- */

/** Who can write it: the exec team, the competition's lead and its team. */
export function canWriteDeliverables(p: Project | undefined, me: string, isExec: boolean): boolean {
  if (!p) return false;
  return isExec || p.leadEmail === me || (p.teamEmails ?? []).includes(me);
}

export async function createDeliverable(p: Project, tpl: DocTemplate, me: string, order: number): Promise<string> {
  const round = tpl.roundMatch ? (p.rounds ?? []).find((r) => r.name.toLowerCase().includes(tpl.roundMatch!.toLowerCase())) : undefined;
  const now = Date.now();
  const id = await repo.create(
    {
      projectId: p.id,
      title: tpl.title,
      kind: tpl.kind,
      status: 'todo',
      ownerEmail: me,
      roundId: round?.id,
      instructions: tpl.instructions,
      format: tpl.format,
      rules: tpl.rules ?? {},
      order,
      templateKey: tpl.key,
      words: 0,
      createdBy: me,
      createdAt: now,
      updatedAt: now,
      updatedBy: me,
    },
    seedSections(tpl),
  );
  log('created', 'project', p.id, p.title, `the deliverable ${tpl.title}`);
  return id;
}

export async function saveVersion(d: Deliverable, sections: DocSection[], label: string, me: string) {
  await repo.addVersion(d.id, {
    at: Date.now(),
    by: me,
    label,
    sections: sections.map((s) => ({
      title: s.title,
      order: s.order,
      limit: s.limit ?? 0,
      hint: s.hint ?? '',
      content: s.content,
      words: s.words,
      writerEmail: s.writerEmail ?? '',
      printTitle: !!s.printTitle,
      pageBreakBefore: !!s.pageBreakBefore,
    })),
  });
}

/** Put an old version back. What is there now is saved as a version first. */
export async function restoreVersion(d: Deliverable, current: DocSection[], v: DocVersion, me: string) {
  await saveVersion(d, current, 'Before restoring an older version', me);
  for (const s of current) await repo.removeSection(d.id, s.id);
  for (const s of v.sections) await repo.addSection(d.id, { ...s, rev: 0, lock: null, updatedAt: Date.now(), updatedBy: me });
  await repo.update(d.id, { updatedAt: Date.now(), updatedBy: me, words: v.sections.reduce((n, s) => n + (s.words || 0), 0) });
}

/** Read an image file and shrink it so a section stays well under Firestore's 1 MB limit. */
export async function imageToDataURL(file: File, maxW = 1400): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) throw new Error('Use a PNG or JPG image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That image could not be read.'));
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // charts and screenshots stay sharp as PNG when that is small enough
    const png = file.type === 'image/png' ? c.toDataURL('image/png') : '';
    const out = png && png.length < 350_000 ? png : c.toDataURL('image/jpeg', 0.82);
    if (out.length > 600_000) throw new Error('That image is too big even after shrinking. Try a smaller one.');
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
