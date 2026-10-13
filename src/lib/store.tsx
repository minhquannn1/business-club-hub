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
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, firebaseConfigured } from './firebase';
import { OWNER_EMAIL, DEFAULT_SITE, LEDGER_CATEGORIES } from './constants';
import type { Activity, Announcement, Meeting, Member, Project, Row, Sheet, SiteContent, Task, SchoolDate, QuickLink } from './types';
import { setCurrency } from './format';
import { hasPerm, levelOf } from './access';
import { isAssigned } from './assignees';

export type Access = 'loading' | 'signedOut' | 'noAccess' | 'ok' | 'error';

interface Store {
  access: Access;
  error: string;
  user: User | null;
  me: Member | null;
  myEmail: string;
  isExec: boolean;
  /** can manage people and roles, delete projects and import */
  isAdmin: boolean;
  /** can edit the ledger, sheets and receipts */
  canFinance: boolean;
  /** can edit the public website */
  canWebsite: boolean;
  isOwner: boolean;
  /** outside the club: sees only their projects, their tasks and meetings they attended */
  isGuest: boolean;
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
  schoolDates: SchoolDate[];
  links: QuickLink[];
  announcements: Announcement[];
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

export const DEMO = import.meta.env.DEV && typeof window !== 'undefined' && /[?&]demo/.test(window.location.search + (sessionStorage.getItem('demo') ? '&demo' : ''));
// ?demo=guest previews the workspace as a guest
const DEMO_GUEST = DEMO && (/[?&]demo=guest/.test(window.location.search) || sessionStorage.getItem('demo') === 'guest');
const DEMO_GUEST_EMAIL = 'khoa@school.vn';

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
  const [schoolDates, setSchoolDates] = useState<SchoolDate[]>([]);
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [site, setSite] = useState<SiteContent>(DEFAULT_SITE);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const touched = useRef(false);

  const markLoaded = (k: string) => setLoaded((l) => (l[k] ? l : { ...l, [k]: true }));

  // Local UI check mode (dev server only)
  useEffect(() => {
    if (!DEMO) return;
    sessionStorage.setItem('demo', DEMO_GUEST ? 'guest' : '1');
    import('./demo').then(({ demoData }) => {
      const dd = demoData();
      setMembers(dd.members);
      if (DEMO_GUEST) {
        const g = DEMO_GUEST_EMAIL;
        setMe(dd.members.find((m) => m.id === g) ?? null);
        setProjects(dd.projects.filter((p) => p.leadEmail === g || p.teamEmails.includes(g)));
        setTasks(dd.tasks.filter((t) => isAssigned(t, g)));
        setMeetings(dd.meetings.filter((m) => m.attendees.includes(g)));
        setLoaded({ members: true, projects: true, tasks: true, meetings: true, sheets: true, rows: true });
        setError('');
        setAccess('ok');
        return;
      }
      setMe(dd.members[0]);
      setProjects(dd.projects);
      setTasks(dd.tasks);
      setMeetings(dd.meetings);
      setSheets(dd.sheets);
      setRowsFlat(dd.rows);
      setActivity(dd.activity);
      setAnnouncements(dd.announcements);
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
  const guest = me?.role === 'guest' && emailKey(user?.email) !== OWNER_EMAIL;
  useEffect(() => {
    if (access !== 'ok' || DEMO) return;
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
    if (guest) {
      // guests may only ask for what is theirs
      const me = emailKey(user?.email);
      let byTeam: Project[] = [];
      let byLead: Project[] = [];
      const merge = () => setProjects([...new Map([...byTeam, ...byLead].map((p) => [p.id, p])).values()]);
      sub<Project>('projects', query(collection(db, 'projects'), where('teamEmails', 'array-contains', me)), (v) => ((byTeam = v), merge()));
      sub<Project>('projectsLed', query(collection(db, 'projects'), where('leadEmail', '==', me)), (v) => ((byLead = v), merge()));
      // tasks given to them: older tasks only have assigneeEmail, newer ones list everyone in assigneeEmails
      let mineOld: Task[] = [];
      let mineNew: Task[] = [];
      const mergeTasks = () => setTasks([...new Map([...mineOld, ...mineNew].map((t) => [t.id, t])).values()]);
      sub<Task>('tasks', query(collection(db, 'tasks'), where('assigneeEmail', '==', me)), (v) => ((mineOld = v), mergeTasks()));
      sub<Task>('tasksShared', query(collection(db, 'tasks'), where('assigneeEmails', 'array-contains', me)), (v) => ((mineNew = v), mergeTasks()));
      sub<Meeting>('meetings', query(collection(db, 'meetings'), where('attendees', 'array-contains', me)), setMeetings);
      setLoaded((l) => ({ ...l, sheets: true, rows: true }));
      return () => subs.forEach((u) => u());
    }
    sub<Project>('projects', collection(db, 'projects'), setProjects);
    sub<Task>('tasks', collection(db, 'tasks'), setTasks);
    sub<Meeting>('meetings', collection(db, 'meetings'), setMeetings);
    sub<Activity>('activity', query(collection(db, 'activity'), orderBy('at', 'desc'), limit(300)), setActivity);
    sub<Sheet>('sheets', collection(db, 'sheets'), setSheets);
    sub<SchoolDate>('schoolDates', collection(db, 'schoolDates'), setSchoolDates);
    sub<QuickLink>('links', collection(db, 'links'), setLinks);
    sub<Announcement>('announcements', query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(20)), setAnnouncements);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access, guest]);

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
    const myEmail = DEMO ? (DEMO_GUEST ? DEMO_GUEST_EMAIL : OWNER_EMAIL) : emailKey(user?.email);
    const isOwner = myEmail === OWNER_EMAIL;
    const isExec = isOwner || me?.role === 'exec';
    const meWho = me ?? (isOwner ? { id: myEmail, role: 'exec' as const } : null);
    const isAdmin = isOwner || levelOf(meWho) === 'admin';
    const isGuest = !isOwner && me?.role === 'guest';
    const rows = new Map<string, Row[]>();
    for (const { sheetId, row } of rowsFlat) {
      if (!rows.has(sheetId)) rows.set(sheetId, []);
      rows.get(sheetId)!.push(row);
    }
    rows.forEach((list) => list.sort((a, b) => a.order - b.order));
    const order = { admin: 0, exec: 1, member: 2, guest: 3 };
    const sortedMembers = [...members].sort((a, b) => order[levelOf(a)] - order[levelOf(b)] || (a.name || a.email).localeCompare(b.name || b.email));
    const sortedProjects = [...projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return {
      access,
      error,
      user,
      me,
      myEmail,
      isExec,
      isAdmin,
      canFinance: isOwner || hasPerm(meWho, 'finance'),
      canWebsite: isOwner || hasPerm(meWho, 'website'),
      isOwner,
      isGuest,
      ready: ['members', 'projects', 'tasks', 'meetings', 'sheets', 'rows'].every((k) => loaded[k]),
      // backup accounts keep access but stay out of lists and pickers
      members: sortedMembers.filter((m) => !m.hidden || m.id === myEmail),
      memberMap: new Map(members.map((m) => [m.id, m])),
      projects: sortedProjects,
      projectMap: new Map(projects.map((p) => [p.id, p])),
      tasks,
      meetings: [...meetings].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      activity,
      // ledgers made before a category was added still offer it
      sheets: [...sheets]
        .sort((a, b) => a.order - b.order)
        .map((s) => (s.isLedger ? { ...s, columns: s.columns.map((c) => (c.role === 'category' ? { ...c, options: Array.from(new Set([...(c.options ?? []), ...LEDGER_CATEGORIES])) } : c)) } : s)),
      rows,
      schoolDates: [...schoolDates].sort((a, b) => a.date.localeCompare(b.date)),
      links: [...links].sort((a, b) => a.order - b.order),
      announcements,
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
  }, [access, error, user, me, members, projects, tasks, meetings, activity, sheets, rowsFlat, schoolDates, links, announcements, site, loaded]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function memberName(store: Pick<Store, 'memberMap'>, email: string | undefined): string {
  if (!email) return 'Unassigned';
  const m = store.memberMap.get(email);
  return m?.name || email.split('@')[0];
}
