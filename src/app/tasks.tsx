import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Plus, Search, Trash2 } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { useStore, memberName } from '../lib/store';
import { createTask, deleteTask, updateTask } from '../lib/actions';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES } from '../lib/constants';
import { dueLabel, toDate } from '../lib/format';
import type { Priority, Task, TaskStatus } from '../lib/types';
import { Avatar, Empty, Field, Modal, Seg, useConfirm, useRun } from '../components/ui';
import { PageHead } from './Shell';

export function useTaskPerms() {
  const { isExec, myEmail, projectMap } = useStore();
  return useMemo(() => {
    const isLead = (projectId: string) => !!projectId && projectMap.get(projectId)?.leadEmail === myEmail;
    return {
      canEdit: (t: Pick<Task, 'projectId' | 'createdBy' | 'assigneeEmail'>) => isExec || isLead(t.projectId) || (t.createdBy === myEmail && t.assigneeEmail === myEmail),
      canTick: (t: Task) => isExec || isLead(t.projectId) || t.assigneeEmail === myEmail,
      canAssignOthers: (projectId: string) => isExec || isLead(projectId),
    };
  }, [isExec, myEmail, projectMap]);
}

const nextStatus: Record<TaskStatus, TaskStatus> = { todo: 'done', doing: 'done', done: 'todo' };

export function TaskRow({ task, onOpen, showProject = true }: { task: Task; onOpen: (t: Task) => void; showProject?: boolean }) {
  const store = useStore();
  const perms = useTaskPerms();
  const run = useRun();
  const project = task.projectId ? store.projectMap.get(task.projectId) : undefined;
  const due = dueLabel(task.dueDate);
  const done = task.status === 'done';
  const canTick = perms.canTick(task);
  return (
    <div className="task-row">
      <span className={`prio ${task.priority}`} title={`${PRIORITY_LABEL[task.priority]} priority`} />
      <button
        className="task-check"
        data-status={task.status}
        disabled={!canTick}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        title={canTick ? (done ? 'Mark as not done' : 'Mark as done') : 'Only the person assigned can tick this off'}
        onClick={() => run(() => updateTask(task, { status: nextStatus[task.status] }))}
      >
        <Check strokeWidth={3} />
      </button>
      <button className="task-title" onClick={() => onOpen(task)}>
        <span className={`t ${done ? 'done' : ''}`}>{task.title}</span>
        <span className="sub">
          {showProject && project && (
            <span className="ellipsis" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="dot" style={{ ['--c' as string]: project.color }} />
              {project.title}
            </span>
          )}
          {task.status === 'doing' && <span>In progress</span>}
        </span>
      </button>
      <span className="task-meta">
        {!done && task.dueDate && <span className={`chip ${due.tone === 'late' ? 'late' : due.tone === 'soon' ? 'soon' : ''}`}>{due.text}</span>}
        <Avatar member={store.memberMap.get(task.assigneeEmail)} email={task.assigneeEmail || '?'} size={26} title={memberName(store, task.assigneeEmail)} />
      </span>
    </div>
  );
}

export function TaskForm({ task, defaults, onClose }: { task?: Task; defaults?: Partial<Task>; onClose: () => void }) {
  const store = useStore();
  const perms = useTaskPerms();
  const run = useRun();
  const confirm = useConfirm();
  const [f, setF] = useState<Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'updatedAt'>>({
    title: task?.title ?? defaults?.title ?? '',
    notes: task?.notes ?? defaults?.notes ?? '',
    projectId: task?.projectId ?? defaults?.projectId ?? '',
    assigneeEmail: task?.assigneeEmail ?? defaults?.assigneeEmail ?? store.myEmail,
    dueDate: task?.dueDate ?? defaults?.dueDate ?? '',
    priority: task?.priority ?? defaults?.priority ?? 'med',
    status: task?.status ?? defaults?.status ?? 'todo',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const editable = task ? perms.canEdit(task) : true;
  const statusOnly = !!task && !editable && perms.canTick(task);
  const canAssign = perms.canAssignOthers(f.projectId);
  const readOnly = !!task && !editable && !statusOnly;
  // projects a non-exec member can file tasks under: ones they lead, plus "none"
  const projectOptions = store.isExec ? store.projects : store.projects.filter((p) => p.leadEmail === store.myEmail || p.id === f.projectId || p.teamEmails?.includes(store.myEmail));

  const save = async () => {
    if (!f.title.trim()) return;
    const data = { ...f, title: f.title.trim(), assigneeEmail: canAssign ? f.assigneeEmail : store.myEmail };
    const ok = await run(async () => {
      if (!task) await createTask(data);
      else if (statusOnly) await updateTask(task, { status: f.status });
      else await updateTask(task, data);
      return true;
    }, task ? 'Task saved' : 'Task added');
    if (ok) onClose();
  };

  return (
    <Modal
      title={task ? (readOnly ? 'Task' : 'Edit task') : 'New task'}
      onClose={onClose}
      footer={
        <>
          {task && editable && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (await confirm({ title: 'Delete this task?', body: `"${task.title}" will be removed for everyone.`, confirm: 'Delete task', danger: true })) {
                  await run(() => deleteTask(task), 'Task deleted');
                  onClose();
                }
              }}
            >
              <Trash2 /> Delete
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={save} disabled={!f.title.trim()}>
              {task ? 'Save task' : 'Add task'}
            </button>
          )}
        </>
      }
    >
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="What needs doing" className="full">
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} disabled={!editable} placeholder="e.g. Book the hall for Wednesday assembly" />
        </Field>
        <Field label="Project">
          <select className="select" value={f.projectId} onChange={(e) => set('projectId', e.target.value)} disabled={!editable}>
            <option value="">No project</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Assigned to" hint={!canAssign && editable ? 'Only exec members and project leads can assign tasks to other people.' : undefined}>
          <select className="select" value={canAssign ? f.assigneeEmail : store.myEmail} onChange={(e) => set('assigneeEmail', e.target.value)} disabled={!editable || !canAssign}>
            <option value="">Nobody yet</option>
            {store.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
                {m.id === store.myEmail ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due">
          <input type="date" className="input" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Priority">
          <select className="select" value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)} disabled={!editable}>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" className="full">
          <Seg label="Status" value={f.status} onChange={(v) => !readOnly && set('status', v)} options={TASK_STATUSES} />
        </Field>
        <Field label="Notes" className="full">
          <textarea className="textarea" value={f.notes} onChange={(e) => set('notes', e.target.value)} disabled={!editable} placeholder="Links, contacts, anything the next person needs" />
        </Field>
        {task && (
          <p className="full tiny faint">
            Added by {memberName(store, task.createdBy)}
            {task.meetingId && (
              <>
                {' '}
                in <Link to={`/app/meetings/${task.meetingId}`}>a meeting</Link>
              </>
            )}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

type Bucket = 'late' | 'today' | 'week' | 'later' | 'none' | 'done';
const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'late', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No due date' },
  { key: 'done', label: 'Done' },
];

export function bucketOf(t: Task): Bucket {
  if (t.status === 'done') return 'done';
  const d = toDate(t.dueDate);
  if (!d) return 'none';
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < 0) return 'late';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

const prioRank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
export function sortTasks(a: Task, b: Task) {
  return (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || prioRank[a.priority] - prioRank[b.priority] || a.createdAt - b.createdAt;
}

export function TasksPage() {
  const store = useStore();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<'mine' | 'all'>(() => (params.get('scope') === 'all' ? 'all' : 'mine'));
  const [project, setProject] = useState('');
  const [person, setPerson] = useState('');
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [quick, setQuick] = useState('');
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const run = useRun();

  useEffect(() => {
    if (params.get('new')) setOpen('new');
    const id = params.get('open');
    if (id) {
      const t = store.tasks.find((x) => x.id === id);
      if (t) setOpen(t);
    }
  }, [params, store.tasks]);
  const close = () => {
    setOpen(null);
    if (params.get('new') || params.get('open')) setParams({}, { replace: true });
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return store.tasks
      .filter((t) => (scope === 'mine' ? t.assigneeEmail === store.myEmail : true))
      .filter((t) => !project || (project === '_none' ? !t.projectId : t.projectId === project))
      .filter((t) => scope === 'mine' || !person || (person === '_none' ? !t.assigneeEmail : t.assigneeEmail === person))
      .filter((t) => !s || t.title.toLowerCase().includes(s) || t.notes?.toLowerCase().includes(s))
      .sort(sortTasks);
  }, [store.tasks, scope, project, person, q, store.myEmail]);

  const groups = useMemo(() => {
    const g = new Map<Bucket, Task[]>();
    for (const t of filtered) {
      const b = bucketOf(t);
      if (!g.has(b)) g.set(b, []);
      g.get(b)!.push(t);
    }
    const done = g.get('done');
    if (done) done.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
    return g;
  }, [filtered]);

  const openCount = filtered.filter((t) => t.status !== 'done').length;
  const quickAdd = async () => {
    const title = quick.trim();
    if (!title) return;
    setQuick('');
    await run(() =>
      createTask({ title, notes: '', projectId: project && project !== '_none' && (store.isExec || store.projectMap.get(project)?.leadEmail === store.myEmail) ? project : '', assigneeEmail: store.myEmail, dueDate: '', priority: 'med', status: 'todo' }),
    );
  };

  return (
    <div className="page">
      <PageHead
        title="Tasks"
        sub={scope === 'mine' ? `You have ${openCount} open ${openCount === 1 ? 'task' : 'tasks'}.` : `${openCount} open across the club.`}
        actions={
          <button className="btn btn-primary" onClick={() => setOpen('new')}>
            <Plus /> New task
          </button>
        }
      />
      <div className="toolbar">
        <Seg
          label="Whose tasks"
          value={scope}
          onChange={setScope}
          options={[
            { key: 'mine', label: 'Mine' },
            { key: 'all', label: 'Everyone' },
          ]}
        />
        <select className="select" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Filter by project">
          <option value="">All projects</option>
          <option value="_none">No project</option>
          {store.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        {scope === 'all' && (
          <select className="select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
            <option value="">Anyone</option>
            <option value="_none">Unassigned</option>
            {store.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        )}
        <div className="search-input">
          <Search />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
        </div>
        <span className="grow" />
        <label className="check small">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done
        </label>
      </div>

      <div className="panel">
        <form
          className="quick-add"
          style={{ borderTop: 0, borderBottom: '1px solid var(--rule-soft)' }}
          onSubmit={(e) => {
            e.preventDefault();
            quickAdd();
          }}
        >
          <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task for yourself and press Enter" aria-label="Quick add task" />
          <button className="btn btn-sm" type="submit" disabled={!quick.trim()} style={{ height: 34 }}>
            Add
          </button>
        </form>
        {filtered.filter((t) => showDone || t.status !== 'done').length === 0 ? (
          <Empty title={scope === 'mine' ? 'Nothing on your plate' : 'No tasks match'}>
            {scope === 'mine' ? 'Tasks assigned to you show up here. Add one above, or check what the rest of the club is doing.' : 'Try another filter, or add the first task.'}
          </Empty>
        ) : (
          BUCKETS.filter((b) => (b.key !== 'done' || showDone) && groups.get(b.key)?.length).map((b) => (
            <section key={b.key}>
              <div className="group-label">
                <span className={b.key === 'late' ? 'neg' : ''}>{b.label}</span>
                <span className="faint">{groups.get(b.key)!.length}</span>
              </div>
              {groups.get(b.key)!.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={setOpen} />
              ))}
            </section>
          ))
        )}
      </div>
      {open && <TaskForm task={open === 'new' ? undefined : open} defaults={open === 'new' && project && project !== '_none' ? { projectId: project } : undefined} onClose={close} />}
    </div>
  );
}
