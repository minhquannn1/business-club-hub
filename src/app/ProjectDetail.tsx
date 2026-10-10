import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, MoreHorizontal, Pencil, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { useStore, memberName } from '../lib/store';
import { createTask, deleteProject, updateProject } from '../lib/actions';
import { KIND_LABEL, STAGES, STAGE_LABEL, TASK_STATUSES } from '../lib/constants';
import { fmtDate, fmtRange, money } from '../lib/format';
import { useLedger, projectMoney } from '../lib/workbook';
import type { ProjectReview, Stage, Task } from '../lib/types';
import { Avatar, Empty, Field, useConfirm, useMenu, useRun } from '../components/ui';
import { PageHead } from './Shell';
import { ProjectForm } from './projectForm';
import { TaskForm, TaskRow, sortTasks } from './tasks';
import { LedgerEntryForm } from './ledgerEntry';
import { taskProgress } from './Projects';
import { ProjectLinks } from './projectLinks';

type Tab = 'overview' | 'tasks' | 'money' | 'meetings' | 'review';

export function ProjectDetail() {
  const { id = '' } = useParams();
  const store = useStore();
  const p = store.projectMap.get(id);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [taskOpen, setTaskOpen] = useState<Task | 'new' | null>(null);
  const [entry, setEntry] = useState<'in' | 'out' | null>(null);
  const run = useRun();
  const confirm = useConfirm();
  const menu = useMenu();
  const nav = useNavigate();
  const { entries } = useLedger();

  const tasks = useMemo(() => store.tasks.filter((t) => t.projectId === id).sort(sortTasks), [store.tasks, id]);
  const meetings = store.meetings.filter((m) => m.projectId === id);
  const projEntries = entries.filter((e) => e.projectId === id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!p)
    return (
      <div className="page">
        <Link to="/app/projects" className="crumb">
          <ArrowLeft size={15} /> Projects
        </Link>
        <div className="panel" style={{ marginTop: 14 }}>
          <Empty title={store.ready ? 'This project no longer exists' : 'Loading...'}>{store.ready ? 'It may have been deleted.' : null}</Empty>
        </div>
      </div>
    );

  const canEdit = store.isExec || p.leadEmail === store.myEmail;
  const prog = taskProgress(store.tasks, p.id);
  const m = projectMoney(entries, p.id);
  const pct = p.budgetPlanned ? Math.min(100, Math.round((m.spent / p.budgetPlanned) * 100)) : 0;
  const over = p.budgetPlanned > 0 && m.spent > p.budgetPlanned;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'Tasks', count: tasks.filter((t) => t.status !== 'done').length },
    { key: 'money', label: 'Money' },
    { key: 'meetings', label: 'Meetings', count: meetings.length },
    { key: 'review', label: 'Review' },
  ];

  return (
    <div className="page">
      <PageHead
        back={
          <Link to="/app/projects" className="crumb">
            <ArrowLeft size={15} /> Projects
          </Link>
        }
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span className="dot" style={{ ['--c' as string]: p.color, width: 14, height: 14 }} />
            {p.title}
          </span>
        }
        sub={p.summary || undefined}
        actions={
          <>
            {canEdit ? (
              <select
                className="select"
                style={{ width: 'auto', minHeight: 36 }}
                value={p.stage}
                aria-label="Stage"
                onChange={(e) => run(() => updateProject(p, { stage: e.target.value as Stage }, 'moved', `to ${STAGE_LABEL[e.target.value as Stage]}`))}
              >
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip">{STAGE_LABEL[p.stage]}</span>
            )}
            {canEdit && (
              <button className="btn" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </button>
            )}
            {store.isExec && (
              <button
                className="btn btn-icon"
                aria-label="More actions"
                onClick={(e) =>
                  menu.open(e.currentTarget, [
                    ...(p.isPublic ? [{ label: 'View on public website', icon: <ExternalLink />, onSelect: () => window.open(`/p/${p.id}`, '_blank') }] : []),
                    {
                      label: 'Delete project',
                      icon: <Trash2 />,
                      danger: true,
                      onSelect: async () => {
                        if (
                          await confirm({
                            title: `Delete ${p.title}?`,
                            body: `This removes the project and its ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} for everyone. Ledger rows that mention it stay in Finance.`,
                            confirm: 'Delete project',
                            danger: true,
                          })
                        ) {
                          await run(() => deleteProject(p, store.tasks), 'Project deleted');
                          nav('/app/projects');
                        }
                      },
                    },
                  ])
                }
              >
                <MoreHorizontal />
              </button>
            )}
          </>
        }
      />

      <div className="pd-grid">
        <div>
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
                {!!t.count && <span className="count">{t.count}</span>}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="section-gap">
              <section className="panel">
                <div className="panel-head">
                  <h2 className="h3">Next up</h2>
                  <button className="btn btn-sm btn-ghost" onClick={() => setTab('tasks')}>
                    All tasks
                  </button>
                </div>
                {tasks.filter((t) => t.status !== 'done').length ? (
                  tasks
                    .filter((t) => t.status !== 'done')
                    .slice(0, 5)
                    .map((t) => <TaskRow key={t.id} task={t} onOpen={setTaskOpen} showProject={false} />)
                ) : (
                  <Empty title="No open tasks">{canEdit ? 'Break the work into tasks and give each one an owner and a date.' : null}</Empty>
                )}
              </section>
              {p.goals ? (
                <section className="panel">
                  <div className="panel-head">
                    <h2 className="h3">Goals</h2>
                  </div>
                  <div className="panel-body">
                    <p className="prose">{p.goals}</p>
                  </div>
                </section>
              ) : null}
              {p.description ? (
                <section className="panel">
                  <div className="panel-head">
                    <h2 className="h3">Details</h2>
                  </div>
                  <div className="panel-body">
                    <p className="prose">{p.description}</p>
                  </div>
                </section>
              ) : null}
              {canEdit && (!p.goals || !p.description) && (
                <button className="add-hint" onClick={() => setEditing(true)}>
                  <Plus /> {!p.goals && !p.description ? 'Add goals and details' : !p.goals ? 'Add goals' : 'Add details'}
                  <span>Goals are a couple of numbers you can check afterwards. Details are the plan: what, where, who.</span>
                </button>
              )}
            </div>
          )}

          {tab === 'tasks' && <ProjectTasks tasks={tasks} canEdit={canEdit} projectId={p.id} onOpen={setTaskOpen} />}

          {tab === 'money' && (
            <div className="section-gap">
              <section className="panel">
                <div className="panel-head">
                  <h2 className="h3">Ledger entries for this project</h2>
                  {store.isExec && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => setEntry('in')}>
                        Record income
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => setEntry('out')}>
                        <Plus /> Record expense
                      </button>
                    </div>
                  )}
                </div>
                {projEntries.length === 0 ? (
                  <Empty title="Nothing recorded yet">Money in and out for this project appears here once it's in the club ledger with this project selected.</Empty>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>What</th>
                          <th>Category</th>
                          <th>By</th>
                          <th className="r">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projEntries.map((e) => (
                          <tr key={e.rowId}>
                            <td className="small">{fmtDate(e.date) || <span className="faint">No date</span>}</td>
                            <td>{e.description || <span className="faint">No description</span>}</td>
                            <td className="small muted">{e.category}</td>
                            <td className="small muted">{e.payer ? memberName(store, e.payer) : ''}</td>
                            <td className={`r num ${e.direction === 'in' ? 'pos' : ''}`}>
                              {e.direction === 'in' ? '+' : '−'}
                              {money(e.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <Link to="/app/finance" className="small">
                Open the full ledger in Finance
              </Link>
            </div>
          )}

          {tab === 'meetings' && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h3">Meeting notes</h2>
                <Link to={`/app/meetings/new?project=${p.id}`} className="btn btn-sm">
                  <Plus /> New notes
                </Link>
              </div>
              {meetings.length === 0 ? (
                <Empty title="No meetings logged">Write up what was decided and who's doing what; action items become tasks automatically.</Empty>
              ) : (
                <ul className="list">
                  {meetings.map((mt) => (
                    <li key={mt.id}>
                      <Link to={`/app/meetings/${mt.id}`} className="row-link">
                        <span className="row-main">
                          <span className="title">{mt.title}</span>
                          <span className="small faint">
                            {fmtDate(mt.date)}, {mt.actionItems.length} action {mt.actionItems.length === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'review' && <Review projectId={p.id} canEdit={canEdit} />}
        </div>

        <aside className="section-gap">
          <section className="panel">
            <div className="panel-body">
              <dl className="facts">
                <div>
                  <dt>Type</dt>
                  <dd>{KIND_LABEL[p.kind] ?? 'Project'}</dd>
                </div>
                <div>
                  <dt>Dates</dt>
                  <dd>{fmtRange(p.startDate, p.endDate)}</dd>
                </div>
                {p.location && (
                  <div>
                    <dt>Location</dt>
                    <dd>{p.location}</dd>
                  </div>
                )}
                <div>
                  <dt>Lead</dt>
                  <dd>
                    {p.leadEmail ? (
                      <>
                        <Avatar member={store.memberMap.get(p.leadEmail)} email={p.leadEmail} size={24} />
                        <span className="ellipsis" style={{ minWidth: 0, flex: 1 }}>
                          {memberName(store, p.leadEmail)}
                        </span>
                      </>
                    ) : (
                      <span className="faint">Nobody yet</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Team</dt>
                  <dd>
                    {p.teamEmails?.length ? (
                      <span className="avatar-stack">
                        {p.teamEmails.map((e) => (
                          <Avatar key={e} member={store.memberMap.get(e)} email={e} size={26} />
                        ))}
                      </span>
                    ) : (
                      <span className="faint">Just the lead</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Tasks</dt>
                  <dd>{prog.total ? `${prog.done} of ${prog.total} done` : <span className="faint">None yet</span>}</dd>
                </div>
                <div>
                  <dt>Website</dt>
                  <dd>
                    {p.isPublic ? (
                      <a href={`/p/${p.id}`} target="_blank" rel="noreferrer">
                        Public page
                      </a>
                    ) : (
                      <span className="faint">Not shown</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <ProjectLinks project={p} canEdit={canEdit} />
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={16} /> Budget
              </h2>
              <button className="btn btn-sm btn-ghost" onClick={() => setTab('money')}>
                Details
              </button>
            </div>
            <div className="panel-body">
              {p.budgetPlanned > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong className={`num ${over ? 'neg' : ''}`} style={{ fontSize: 20 }}>
                      {money(m.spent)}
                    </strong>
                    <span className="small muted">of {money(p.budgetPlanned)}</span>
                  </div>
                  <div className="budget-bar" aria-label={`${pct}% of budget spent`}>
                    <span className={over ? 'over' : ''} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`small ${over ? 'neg' : 'muted'}`}>{over ? `${money(m.spent - p.budgetPlanned)} over budget` : `${money(p.budgetPlanned - m.spent)} left`}</p>
                </>
              ) : (
                <div className="money-row">
                  <span className="muted">Spent</span>
                  <strong className="num">{money(m.spent)}</strong>
                </div>
              )}
              {m.raised > 0 && (
                <div className="money-row">
                  <span className="muted">Raised</span>
                  <strong className="num pos">{money(m.raised)}</strong>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} />}
      {taskOpen && <TaskForm task={taskOpen === 'new' ? undefined : taskOpen} defaults={{ projectId: p.id }} onClose={() => setTaskOpen(null)} />}
      {entry && <LedgerEntryForm projectId={p.id} direction={entry} onClose={() => setEntry(null)} />}
      {menu.node}
    </div>
  );
}

function ProjectTasks({ tasks, canEdit, projectId, onOpen }: { tasks: Task[]; canEdit: boolean; projectId: string; onOpen: (t: Task | 'new') => void }) {
  const store = useStore();
  const run = useRun();
  const [title, setTitle] = useState('');
  const [who, setWho] = useState(store.myEmail);
  const add = async () => {
    const t = title.trim();
    if (!t) return;
    setTitle('');
    await run(() => createTask({ title: t, notes: '', projectId, assigneeEmail: canEdit ? who : store.myEmail, dueDate: '', priority: 'med', status: 'todo' }));
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3">Tasks</h2>
        <button className="btn btn-sm" onClick={() => onOpen('new')}>
          <Plus /> New task
        </button>
      </div>
      {(canEdit || store.isExec) && (
        <form
          className="quick-add"
          style={{ borderTop: 0, borderBottom: '1px solid var(--rule-soft)' }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task and press Enter" aria-label="New task title" />
          <select className="select" style={{ width: 170, minHeight: 34, height: 34, paddingTop: 4, paddingBottom: 4 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assign to">
            <option value="">Unassigned</option>
            {store.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </form>
      )}
      {tasks.length === 0 ? (
        <Empty title="No tasks yet" />
      ) : (
        TASK_STATUSES.map((s) => {
          const list = tasks.filter((t) => t.status === s.key);
          if (!list.length) return null;
          return (
            <div key={s.key}>
              <div className="group-label">
                <span>{s.label}</span>
                <span className="faint">{list.length}</span>
              </div>
              {list.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} showProject={false} />
              ))}
            </div>
          );
        })
      )}
    </section>
  );
}

function Review({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const store = useStore();
  const p = store.projectMap.get(projectId)!;
  const run = useRun();
  const [r, setR] = useState<ProjectReview>(() => ({ attendance: 0, result: '', rating: 0, wentWell: '', improve: '', notes: '', ...(p.review ?? {}) }));
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof ProjectReview>(k: K, v: ProjectReview[K]) => {
    setR((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const save = async () => {
    const ok = await run(() => updateProject(p, { review: r }, 'wrote the review for'), 'Review saved');
    if (ok !== undefined) setDirty(false);
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="h3">Review</h2>
          <p className="small muted">Write this while it's fresh, so whoever runs it next year starts ahead.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          {p.kind === 'competition' ? (
            <Field label="Result" hint={p.isPublic ? 'Shown on the public website.' : 'e.g. Finalist, 2nd place, Best pitch'}>
              <input className="input" value={r.result ?? ''} onChange={(e) => set('result', e.target.value)} disabled={!canEdit} placeholder="e.g. 2nd place" />
            </Field>
          ) : (
            <Field label="How many people came" hint={p.isPublic ? 'Shown on the public website.' : undefined}>
              <input className="input num" type="number" min={0} value={r.attendance || ''} onChange={(e) => set('attendance', Math.max(0, parseInt(e.target.value || '0', 10)))} disabled={!canEdit} />
            </Field>
          )}
          <div className="field">
            <span>Overall</span>
            <div className="stars" role="radiogroup" aria-label="Rating out of 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={r.rating === n} aria-label={`${n} out of 5`} className={(r.rating ?? 0) >= n ? 'on' : ''} disabled={!canEdit} onClick={() => set('rating', r.rating === n ? 0 : n)}>
                  <Star fill="currentColor" />
                </button>
              ))}
            </div>
          </div>
          <Field label="What worked" className="full">
            <textarea className="textarea" value={r.wentWell} onChange={(e) => set('wentWell', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="What to change next time" className="full">
            <textarea className="textarea" value={r.improve} onChange={(e) => set('improve', e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="Anything else" className="full">
            <textarea className="textarea" value={r.notes} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} style={{ minHeight: 70 }} />
          </Field>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" disabled={!dirty} onClick={save}>
              Save review
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
