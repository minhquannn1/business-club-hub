import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut, type User } from 'firebase/auth';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider, firebaseConfigured } from './firebase';
import { OWNER_EMAIL, DEFAULT_SITE } from './constants';
import type { Activity, Meeting, Member, Project, Row, Sheet, SiteContent, Task } from './types';
import { setCurrency } from './format';

export type Access = 'loading' | 'signedOut' | 'noAccess' | 'ok' | 'error';

interface Store {
  access: Access;
  error: string;
  user: User | null;
  me: Member | null;
  myEmail: string;
  isExec: boolean;
  isOwner: boolean;
  ready: boolean;
  members: Member[];
  memberMap: Map<string, Member>;
  projects: Project[];
  projectMap: Map<string, Project>;
  tasks: Task[];
  meetings: Meeting[];
  activity: Activity[];
  sheets: Sheet[];
  rows: Map<string, Row[]>; // sheetId -> rows sorted by order
  site: SiteContent;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

const emailKey = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

const DEMO = import.meta.env.DEV && typeof window !== 'undefined' && /[?&]demo/.test(window.location.search + (sessionStorage.getItem('demo') ? '&demo' : ''));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access>(firebaseConfigured ? 'loading' : 'error');
  const [error, setError] = useState(firebaseConfigured ? '' : 'Firebase is not configured for this deployment.');
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [rowsFlat, setRowsFlat] = useState<{ sheetId: string; row: Row }[]>([]);
  const [site, setSite] = useState<SiteContent>(DEFAULT_SITE);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const touched = useRef(false);

  const markLoaded = (k: string) => setLoaded((l) => (l[k] ? l : { ...l, [k]: true }));

  // Local UI check mode (dev server only)
  useEffect(() => {
    if (!DEMO) return;
    sessionStorage.setItem('demo', '1');
    import('./demo').then(({ demoData }) => {
      const dd = demoData();
      setMembers(dd.members);
      setMe(dd.members[0]);
      setProjects(dd.projects);
      setTasks(dd.tasks);
      setMeetings(dd.meetings);
      setSheets(dd.sheets);
      setRowsFlat(dd.rows);
      setActivity(dd.activity);
      setLoaded({ members: true, projects: true, tasks: true, meetings: true, sheets: true, rows: true });
      setError('');
      setAccess('ok');
    });
  }, []);

  // Auth
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      touched.current = false;
      if (!u) {
        setMe(null);
        setAccess('signedOut');
      } else setAccess('loading');
    });
  }, []);

  // Membership lookup
  useEffect(() => {
    if (!user) return;
    const key = emailKey(user.email);
    const ref = doc(db, 'members', key);
    let cancelled = false;
    const run = async () => {
      try {
        const snap = await getDoc(ref).catch(() => null);
        if (!snap?.exists()) {
          if (key === OWNER_EMAIL) {
            const owner: Omit<Member, 'id'> = {
              email: key,
              name: user.displayName ?? 'Club owner',
              photoURL: user.photoURL ?? '',
              role: 'exec',
              title: 'President',
              team: 'Leadership',
              showOnSite: true,
              uid: user.uid,
              joinedAt: Date.now(),
              lastSeenAt: Date.now(),
            };
            await setDoc(ref, owner);
          } else {
            if (!cancelled) setAccess('noAccess');
            return;
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(String((e as Error).message ?? e));
          setAccess('error');
        }
        return;
      }
      if (cancelled) return;
      return onSnapshot(
        ref,
        (s) => {
          if (!s.exists()) {
            setMe(null);
            setAccess('noAccess');
            return;
          }
          const m = { id: s.id, ...(s.data() as Omit<Member, 'id'>) };
          setMe(m);
          setAccess('ok');
          if (!touched.current) {
            touched.current = true;
            const patch: Partial<Member> = { uid: user.uid, lastSeenAt: Date.now() };
            if (!m.name) patch.name = user.displayName ?? '';
            if (user.photoURL && m.photoURL !== user.photoURL) patch.photoURL = user.photoURL;
            updateDoc(ref, patch).catch(() => {});
          }
        },
        () => setAccess('noAccess'),
      );
    };
    let unsub: (() => void) | undefined;
    run().then((u) => {
      if (cancelled) u?.();
      else unsub = u;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user]);

  // Workspace data
  useEffect(() => {
    if (access !== 'ok') return;
    const subs: (() => void)[] = [];
    const sub = <T,>(name: string, q: Parameters<typeof onSnapshot>[0], set: (v: T[]) => void) => {
      subs.push(
        onSnapshot(
          q as never,
          (snap: { docs: { id: string; data: () => unknown }[] }) => {
            set(snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }) as T));
            markLoaded(name);
          },
          (e: Error) => {
            console.error(`[club] ${name}`, e);
            markLoaded(name);
          },
        ),
      );
    };
    sub<Member>('members', collection(db, 'members'), setMembers);
    sub<Project>('projects', collection(db, 'projects'), setProjects);
    sub<Task>('tasks', collection(db, 'tasks'), setTasks);
    sub<Meeting>('meetings', collection(db, 'meetings'), setMeetings);
    sub<Activity>('activity', query(collection(db, 'activity'), orderBy('at', 'desc'), limit(300)), setActivity);
    sub<Sheet>('sheets', collection(db, 'sheets'), setSheets);
    subs.push(
      onSnapshot(
        collectionGroup(db, 'rows'),
        (snap) => {
          setRowsFlat(snap.docs.map((d) => ({ sheetId: d.ref.parent.parent?.id ?? '', row: { id: d.id, ...(d.data() as Omit<Row, 'id'>) } })));
          markLoaded('rows');
        },
        (e) => {
          console.error('[club] rows', e);
          markLoaded('rows');
        },
      ),
    );
    return () => subs.forEach((u) => u());
  }, [access]);

  // Site content is public; read it everywhere
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onSnapshot(
      doc(db, 'site', 'content'),
      (s) => {
        const v = { ...DEFAULT_SITE, ...((s.data() as Partial<SiteContent>) ?? {}) };
        setSite(v);
        setCurrency(v.currency);
      },
      () => {},
    );
  }, []);

  const value = useMemo<Store>(() => {
    const myEmail = DEMO ? OWNER_EMAIL : emailKey(user?.email);
    const isOwner = myEmail === OWNER_EMAIL;
    const isExec = isOwner || me?.role === 'exec';
    const rows = new Map<string, Row[]>();
    for (const { sheetId, row } of rowsFlat) {
      if (!rows.has(sheetId)) rows.set(sheetId, []);
      rows.get(sheetId)!.push(row);
    }
    rows.forEach((list) => list.sort((a, b) => a.order - b.order));
    const sortedMembers = [...members].sort((a, b) => (a.role === b.role ? (a.name || a.email).localeCompare(b.name || b.email) : a.role === 'exec' ? -1 : 1));
    const sortedProjects = [...projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return {
      access,
      error,
      user,
      me,
      myEmail,
      isExec,
      isOwner,
      ready: ['members', 'projects', 'tasks', 'meetings', 'sheets', 'rows'].every((k) => loaded[k]),
      members: sortedMembers,
      memberMap: new Map(members.map((m) => [m.id, m])),
      projects: sortedProjects,
      projectMap: new Map(projects.map((p) => [p.id, p])),
      tasks,
      meetings: [...meetings].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      activity,
      sheets: [...sheets].sort((a, b) => a.order - b.order),
      rows,
      site,
      signIn: async () => {
        setError('');
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (e) {
          const code = (e as { code?: string }).code ?? '';
          if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
          if (code === 'auth/popup-blocked') setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
          else if (code === 'auth/unauthorized-domain') setError('This web address is not allowed to sign in yet. Add it under Authentication > Settings > Authorized domains in Firebase.');
          else setError((e as Error).message);
        }
      },
      signOut: async () => {
        await fbSignOut(auth);
      },
    };
  }, [access, error, user, me, members, projects, tasks, meetings, activity, sheets, rowsFlat, site, loaded]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function memberName(store: Pick<Store, 'memberMap'>, email: string | undefined): string {
  if (!email) return 'Unassigned';
  const m = store.memberMap.get(email);
  return m?.name || email.split('@')[0];
}
