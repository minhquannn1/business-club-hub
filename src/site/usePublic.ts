import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, firebaseConfigured } from '../lib/firebase';
import type { PublicMember, PublicProject } from '../lib/types';

export function usePublicData() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [team, setTeam] = useState<PublicMember[]>([]);
  const [loaded, setLoaded] = useState({ p: !firebaseConfigured, t: !firebaseConfigured });
  useEffect(() => {
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
        setTeam(s.docs.map((d) => ({ ...(d.data() as PublicMember), id: d.id })).sort((x, y) => x.order - y.order || x.name.localeCompare(y.name)));
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
