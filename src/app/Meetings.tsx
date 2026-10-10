import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Mail, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useStore, memberName } from '../lib/store';
import { deleteMeeting, saveMeeting } from '../lib/actions';
import { fmtDate, todayISO, uid } from '../lib/format';
import type { ActionItem, Meeting } from '../lib/types';
import { Avatar, Empty, Field, useConfirm, useRun, useToast } from '../components/ui';
import { emailReady, notify } from '../lib/notify';
import { PageHead } from './Shell';
import { EmptyArt } from '../components/Art';
import { useTaskPerms } from './tasks';

export function MeetingsPage() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [project, setProject] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return store.meetings.filter((m) => (!project || m.projectId === project) && (!s || m.title.toLowerCase().includes(s) || m.notes.toLowerCase().includes(s) || m.decisions.toLowerCase().includes(s)));
  }, [store.meetings, q, project]);
  return (
    <div className="page">
      <PageHead
        title="Meetings"
        sub="Notes, decisions and who's doing what. Action items turn into tasks."
        actions={
          <Link to="/app/meetings/new" className="btn btn-primary">
            <Plus /> New notes
          </Link>
        }
      />
      <div className="toolbar">
        <div className="search-input">
          <Search />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
        </div>
        <select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
          <option value="">All projects</option>
          {store.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div className="panel">
        {list.length === 0 ? (
          <Empty art={<EmptyArt.notes />}
            title={store.meetings.length ? 'No notes match' : 'No meetings written up yet'}
            action={
              !store.meetings.length ? (
                <Link to="/app/meetings/new" className="btn">
                  <Plus /> Write the first one
                </Link>
              ) : undefined
            }
          >
            {store.meetings.length ? null : 'After your next meeting, write down what was decided and who is doing what.'}
          </Empty>
        ) : (
          <ul className="list">
            {list.map((m) => {
              const p = store.projectMap.get(m.projectId);
              const open = m.actionItems.filter((a) => a.taskId && store.tasks.find((t) => t.id === a.taskId)?.status !== 'done').length;
              return (
                <li key={m.id}>
                  <Link to={`/app/meetings/${m.id}`} className="row-link">
                    <div style={{ width: 54, flex: 'none', textAlign: 'center', lineHeight: 1.1 }}>
                      <strong style={{ fontSize: 20, display: 'block' }}>{fmtDate(m.date, 'd')}</strong>
                      <span className="small faint">{fmtDate(m.date, 'MMM')}</span>
                    </div>
                    <span className="row-main">
                      <span className="title">{m.title}</span>
                      <span className="small faint ellipsis">
                        {p ? p.title : 'General'}
                        {m.attendees.length ? `, ${m.attendees.length} attended` : ''}
                      </span>
                    </span>
                    {open > 0 && <span className="chip soon">{open} open</span>}
                    <span className="avatar-stack">
                      {m.attendees.slice(0, 5).map((e) => (
                        <Avatar key={e} member={store.memberMap.get(e)} email={e} size={24} />
                      ))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type Draft = Omit<Meeting, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>;

export function MeetingPage() {
  const { id = 'new' } = useParams();
  const [params] = useSearchParams();
  const store = useStore();
  const existing = id === 'new' ? undefined : store.meetings.find((m) => m.id === id);
  const [editing, setEditing] = useState(id === 'new');
  const nav = useNavigate();
  const run = useRun();
  const confirm = useConfirm();
  const perms = useTaskPerms();
  const blank = (): Draft => ({
    title: '',
    date: todayISO(),
    projectId: params.get('project') ?? '',
    attendees: [store.myEmail],
    notes: '',
    decisions: '',
    actionItems: [{ id: uid('a'), text: '', assigneeEmail: '', dueDate: '' }],
  });
  const [d, setD] = useState<Draft>(() => (existing ? { ...existing } : blank()));
  useEffect(() => {
    if (existing && !editing) setD({ ...existing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.updatedAt, editing]);

  if (id !== 'new' && !existing)
    return (
      <div className="page">
        <Link to="/app/meetings" className="crumb">
          <ArrowLeft size={15} /> Meetings
        </Link>
        <div className="panel" style={{ marginTop: 14 }}>
          <Empty title={store.ready ? 'These notes no longer exist' : 'Loading...'} />
        </div>
      </div>
    );

  const canEdit = !existing || store.isExec || existing.createdBy === store.myEmail || store.projectMap.get(existing.projectId)?.leadEmail === store.myEmail;
  const canAssign = perms.canAssignOthers(d.projectId);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setItem = (i: number, patch: Partial<ActionItem>) => set('actionItems', d.actionItems.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const toggleAttendee = (e: string) => set('attendees', d.attendees.includes(e) ? d.attendees.filter((x) => x !== e) : [...d.attendees, e]);

  const save = async () => {
    if (!d.title.trim()) return;
    const items = d.actionItems.filter((a) => a.text.trim()).map((a) => (a.taskId || canAssign ? a : { ...a, assigneeEmail: store.myEmail }));
    const savedId = await run(() => saveMeeting({ ...d, title: d.title.trim(), actionItems: items }, existing), 'Notes saved');
    if (savedId) {
      setEditing(false);
      if (!existing) nav(`/app/meetings/${savedId}`, { replace: true });
    }
  };

  if (!editing && existing) {
    const p = store.projectMap.get(existing.projectId);
    return (
      <div className="page" style={{ maxWidth: 920 }}>
        <PageHead
          back={
            <Link to="/app/meetings" className="crumb">
              <ArrowLeft size={15} /> Meetings
            </Link>
          }
          title={existing.title}
          sub={
            <>
              {fmtDate(existing.date, 'EEEE d MMMM yyyy')}
              {p && (
                <>
                  {', '}
                  <Link to={`/app/projects/${p.id}`}>{p.title}</Link>
                </>
              )}
            </>
          }
          actions={
            canEdit && (
              <>
                <button
                  className="btn btn-icon btn-danger"
                  aria-label="Delete notes"
                  onClick={async () => {
                    if (await confirm({ title: 'Delete these notes?', body: 'Tasks created from the action items stay on the task list.', confirm: 'Delete notes', danger: true })) {
                      await run(() => deleteMeeting(existing), 'Notes deleted');
                      nav('/app/meetings');
                    }
                  }}
                >
                  <Trash2 />
                </button>
                <EmailNotesButton meeting={existing} />
                <button className="btn" onClick={() => setEditing(true)}>
                  <Pencil /> Edit
                </button>
              </>
            )
          }
        />
        <div className="section-gap">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Action items</h2>
            </div>
            {existing.actionItems.length === 0 ? (
              <Empty title="No action items" />
            ) : (
              <ul className="list">
                {existing.actionItems.map((a) => {
                  const t = store.tasks.find((x) => x.id === a.taskId);
                  return (
                    <li key={a.id} className="task-row">
                      <span className="task-check" data-status={t?.status ?? 'todo'} aria-hidden="true">
                        <Check strokeWidth={3} />
                      </span>
                      <span className="task-title" style={{ cursor: 'default' }}>
                        <span className={`t ${t?.status === 'done' ? 'done' : ''}`}>{a.text}</span>
                        <span className="sub">
                          {memberName(store, a.assigneeEmail)}
                          {a.dueDate && `, due ${fmtDate(a.dueDate)}`}
                        </span>
                      </span>
                      {t && (
                        <Link to={`/app/tasks?open=${t.id}&scope=all`} className="btn btn-sm btn-ghost">
                          Open task
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {existing.decisions && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h3">Decisions</h2>
              </div>
              <div className="panel-body prose">{existing.decisions}</div>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Notes</h2>
            </div>
            <div className="panel-body prose">{existing.notes || <span className="faint">No notes.</span>}</div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Who was there</h2>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {existing.attendees.length === 0 && <span className="faint">Not recorded</span>}
              {existing.attendees.map((e) => (
                <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Avatar member={store.memberMap.get(e)} email={e} size={26} /> {memberName(store, e)}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <PageHead
        back={
          <Link to="/app/meetings" className="crumb">
            <ArrowLeft size={15} /> Meetings
          </Link>
        }
        title={existing ? 'Edit notes' : 'New meeting notes'}
        actions={
          <>
            <button className="btn" onClick={() => (existing ? setEditing(false) : nav('/app/meetings'))}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!d.title.trim()}>
              Save notes
            </button>
          </>
        }
      />
      <div className="section-gap">
        <section className="panel">
          <div className="panel-body form-grid">
            <Field label="Meeting" className="full">
              <input className="input" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Business Week planning #2" />
            </Field>
            <Field label="Date">
              <input type="date" className="input" value={d.date} onChange={(e) => set('date', e.target.value)} />
            </Field>
            <Field label="Project">
              <select className="select" value={d.projectId} onChange={(e) => set('projectId', e.target.value)}>
                <option value="">General club meeting</option>
                {store.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field full">
              <span>Who was there</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {store.members.map((m) => {
                  const on = d.attendees.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      className="chip"
                      aria-pressed={on}
                      onClick={() => toggleAttendee(m.id)}
                      style={{ height: 30, cursor: 'pointer', paddingLeft: 4, border: `1px solid ${on ? 'var(--ink)' : 'transparent'}`, background: on ? 'var(--marker-soft)' : undefined, color: on ? 'var(--ink)' : undefined }}
                    >
                      <Avatar member={m} size={22} /> {m.name || m.email}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2 className="h3">Action items</h2>
              <p className="small muted">Each one becomes a task for that person when you save.{!canAssign && ' Only exec members and project leads can assign to others, so these will be yours.'}</p>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: 8 }}>
            {d.actionItems.map((a, i) => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 170px 150px auto', gap: 8, alignItems: 'center' }} className="action-item-row">
                <input className="input" value={a.text} onChange={(e) => setItem(i, { text: e.target.value })} placeholder="What needs to happen" disabled={!!a.taskId} aria-label="Action item" />
                <select className="select" value={a.assigneeEmail} onChange={(e) => setItem(i, { assigneeEmail: e.target.value })} disabled={!!a.taskId || !canAssign} aria-label="Who">
                  <option value="">{canAssign ? 'Who?' : 'You'}</option>
                  {store.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <input type="date" className="input" value={a.dueDate} onChange={(e) => setItem(i, { dueDate: e.target.value })} disabled={!!a.taskId} aria-label="Due date" />
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove action item" onClick={() => set('actionItems', d.actionItems.filter((_, j) => j !== i))}>
                  <X />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-sm" onClick={() => set('actionItems', [...d.actionItems, { id: uid('a'), text: '', assigneeEmail: '', dueDate: '' }])}>
                <Plus /> Add action item
              </button>
            </div>
            {d.actionItems.some((a) => a.taskId) && <p className="tiny faint">Items already turned into tasks are edited from the task itself.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-body form-grid">
            <Field label="Decisions" className="full" hint="One per line works well.">
              <textarea className="textarea" value={d.decisions} onChange={(e) => set('decisions', e.target.value)} />
            </Field>
            <Field label="Notes" className="full">
              <textarea className="textarea" style={{ minHeight: 200 }} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Sends the notes and action items to everyone who attended. */
function EmailNotesButton({ meeting }: { meeting: Meeting }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    emailReady().then(setReady);
  }, []);
  if (!ready) return null;
  const people = new Set([...meeting.attendees, ...meeting.actionItems.map((a) => a.assigneeEmail)].filter(Boolean)).size;
  return (
    <button
      className={`btn ${busy ? 'is-busy' : ''}`}
      disabled={busy || people === 0}
      title={people === 0 ? 'Add who attended first' : undefined}
      onClick={async () => {
        if (meeting.emailedAt && !(await confirm({ title: 'Email these notes again?', body: `They were already emailed ${fmtDate(new Date(meeting.emailedAt).toISOString().slice(0, 10), 'd MMM')}.`, confirm: 'Send again' }))) return;
        setBusy(true);
        const r = await notify({ type: 'meeting', id: meeting.id });
        setBusy(false);
        toast(r.ok ? `Emailed to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}` : r.error || 'Email failed', r.ok ? undefined : { kind: 'error' });
      }}
    >
      <Mail /> {meeting.emailedAt ? 'Email again' : 'Email notes'}
    </button>
  );
}
