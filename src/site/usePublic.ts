import { roleRank } from '../lib/constants';
import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, firebaseConfigured } from '../lib/firebase';
import type { PublicMember, PublicProject } from '../lib/types';

export function usePublicData() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [team, setTeam] = useState<PublicMember[]>([]);
  const [loaded, setLoaded] = useState({ p: !firebaseConfigured, t: !firebaseConfigured });
  useEffect(() => {
    if (import.meta.env.DEV && /[?&]demo/.test(window.location.search + (sessionStorage.getItem('demo') ? '&demo' : ''))) {
      import('../lib/demo').then(({ demoData }) => {
        const d = demoData();
        setProjects(
          d.projects
            .filter((p) => p.isPublic)
            .map((p) => ({ id: p.id, title: p.title, kind: p.kind, blurb: p.publicBlurb || p.summary, stage: p.stage, startDate: p.startDate, endDate: p.endDate, location: p.location, color: p.color, attendance: p.review?.attendance ?? 0, description: p.description, updatedAt: 0 })),
        );
        setTeam(d.members.filter((m) => m.role === 'exec').map((m, i) => ({ id: m.id, name: m.name, title: m.title ?? '', team: m.team ?? '', bio: i === 0 ? 'Runs the club and the spreadsheet nobody else wants.' : '', order: i })));
        setLoaded({ p: true, t: true });
      });
      return;
    }
    if (!firebaseConfigured) return;
    const a = onSnapshot(
      collection(db, 'publicProjects'),
      (s) => {
        setProjects(s.docs.map((d) => ({ ...(d.data() as PublicProject), id: d.id })));
        setLoaded((l) => ({ ...l, p: true }));
      },
      () => setLoaded((l) => ({ ...l, p: true })),
    );
    const b = onSnapshot(
      collection(db, 'publicTeam'),
      (s) => {
        setTeam(s.docs.map((d) => ({ ...(d.data() as PublicMember), id: d.id })).sort((x, y) => roleRank(x.title) - roleRank(y.title) || x.order - y.order || x.name.localeCompare(y.name)));
        setLoaded((l) => ({ ...l, t: true }));
      },
      () => setLoaded((l) => ({ ...l, t: true })),
    );
    return () => {
      a();
      b();
    };
  }, []);
  return { projects, team, loaded: loaded.p && loaded.t };
}
