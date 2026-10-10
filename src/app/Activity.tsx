import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import { useStore, memberName } from '../lib/store';
import type { Activity } from '../lib/types';
import { Avatar, Empty } from '../components/ui';
import { PageHead } from './Shell';

const NOUN: Record<Activity['targetType'], string> = { project: '', task: 'task', meeting: 'notes', member: '', sheet: 'sheet', site: '', receipt: '' };

function linkFor(a: Activity): string | null {
  switch (a.targetType) {
    case 'project':
      return a.verb === 'deleted' ? null : `/app/projects/${a.targetId}`;
    case 'task':
      return a.verb === 'deleted' ? null : `/app/tasks?open=${a.targetId}&scope=all`;
    case 'meeting':
      return a.verb === 'deleted' ? null : `/app/meetings/${a.targetId}`;
    case 'member':
      return a.verb === 'removed' ? null : `/app/members?open=${encodeURIComponent(a.targetId)}`;
    case 'sheet':
      return a.verb === 'deleted' ? null : `/app/finance/${a.targetId}`;
    case 'site':
      return '/app/website';
    default:
      return null;
  }
}

export function ActivityLine({ a, compact }: { a: Activity; compact?: boolean }) {
  const store = useStore();
  const to = linkFor(a);
  const noun = NOUN[a.targetType];
  const title = a.targetType === 'member' ? memberName(store, a.targetId) : a.targetTitle;
  return (
    <li>
      <Avatar member={store.memberMap.get(a.actorEmail)} email={a.actorEmail} size={compact ? 24 : 28} />
      <span className="what">
        <strong>{a.actorEmail === store.myEmail ? 'You' : memberName(store, a.actorEmail)}</strong> {a.verb} {noun && `${noun} `}
        {to ? <Link to={to}>{title}</Link> : <strong>{title}</strong>}
        {a.detail && <span className="muted"> {a.detail}</span>}
      </span>
      <time dateTime={new Date(a.at).toISOString()} title={format(a.at, 'd MMM yyyy, HH:mm')}>
        {format(a.at, 'HH:mm')}
      </time>
    </li>
  );
}

export function ActivityPage() {
  const store = useStore();
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');
  const list = store.activity.filter((a) => (!who || a.actorEmail === who) && (!kind || a.targetType === kind));
  const days = useMemo(() => {
    const m = new Map<string, Activity[]>();
    for (const a of list) {
      const k = format(a.at, 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return [...m.entries()];
  }, [list]);
  const dayLabel = (k: string) => {
    const d = new Date(k + 'T12:00:00');
    return isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE d MMMM');
  };
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead title="Activity" sub="Who changed what, most recent first." />
      <div className="toolbar">
        <select className="select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          {store.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.email}
            </option>
          ))}
        </select>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
          <option value="">Everything</option>
          <option value="project">Projects</option>
          <option value="task">Tasks</option>
          <option value="meeting">Meetings</option>
          <option value="sheet">Finance</option>
          <option value="member">Members</option>
          <option value="site">Website</option>
        </select>
      </div>
      <div className="panel">
        {days.length === 0 ? (
          <Empty title="Nothing yet">Changes to projects, tasks, meetings and money show up here.</Empty>
        ) : (
          days.map(([k, items]) => (
            <section key={k}>
              <div className="day-label">{dayLabel(k)}</div>
              <ul className="feed">
                {items.map((a) => (
                  <ActivityLine key={a.id} a={a} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
