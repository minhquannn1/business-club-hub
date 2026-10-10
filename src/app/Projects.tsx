import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, GanttChart, List, Plus } from 'lucide-react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { useStore, memberName } from '../lib/store';
import { updateProject } from '../lib/actions';
import { STAGES, STAGE_LABEL } from '../lib/constants';
import { fmtRange, money, toDate } from '../lib/format';
import { useLedger, projectMoney } from '../lib/workbook';
import type { Project, Stage, Task } from '../lib/types';
import { Avatar, Empty, Seg, useRun } from '../components/ui';
import { PageHead } from './Shell';
import { EmptyArt } from '../components/Art';
import { ProjectForm } from './projectForm';

type View = 'board' | 'timeline' | 'calendar' | 'list';

function loadView(): View {
  const q = new URLSearchParams(window.location.search).get('view');
  if (q === 'board' || q === 'timeline' || q === 'calendar' || q === 'list') return q;
  try {
    return (localStorage.getItem('projects.view') as View) || 'board';
  } catch {
    return 'board';
  }
}

export function taskProgress(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId);
  const done = list.filter((t) => t.status === 'done').length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export function ProjectsPage() {
  const store = useStore();
  const [view, setView] = useState<View>(loadView);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<Stage | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    try {
      localStorage.setItem('projects.view', view);
    } catch {
      /* ignore */
    }
  }, [view]);
  useEffect(() => {
    if (params.get('new') && store.isExec) {
      setCreating('idea');
      setParams({}, { replace: true });
    }
  }, [params, setParams, store.isExec]);

  return (
    <div className={`page ${view === 'board' || view === 'timeline' ? 'page-full' : ''}`}>
      <PageHead
        title="Projects and events"
        sub={`${store.projects.filter((p) => p.stage !== 'done').length} active, ${store.projects.filter((p) => p.stage === 'done').length} done`}
        actions={
          <>
            <Seg<View>
              label="View"
              value={view}
              onChange={setView}
              options={[
                { key: 'board', label: 'Board', icon: <Columns3 /> },
                { key: 'timeline', label: 'Timeline', icon: <GanttChart /> },
                { key: 'calendar', label: 'Calendar', icon: <CalendarDays /> },
                { key: 'list', label: 'List', icon: <List /> },
              ]}
            />
            {store.isExec && (
              <button className="btn btn-primary" onClick={() => setCreating('idea')}>
                <Plus /> New
              </button>
            )}
          </>
        }
      />
      {store.projects.length === 0 ? (
        <div className="panel">
          <Empty art={<EmptyArt.board />}
            title="No projects yet"
            action={
              store.isExec ? (
                <button className="btn btn-primary" onClick={() => setCreating('idea')}>
                  <Plus /> Create the first one
                </button>
              ) : undefined
            }
          >
            {store.isExec ? 'Start with whatever is next on the calendar, like Business Week. Tasks, budget and meeting notes all hang off a project.' : 'When the exec team creates a project, it shows up here.'}
          </Empty>
        </div>
      ) : view === 'board' ? (
        <Board onNew={(s) => setCreating(s)} />
      ) : view === 'timeline' ? (
        <Timeline />
      ) : view === 'calendar' ? (
        <ProjectCalendar />
      ) : (
        <ProjectList />
      )}
      {creating && <ProjectForm stage={creating} onClose={() => setCreating(null)} onCreated={(id) => nav(`/app/projects/${id}`)} />}
    </div>
  );
}

/* ---------------- board ---------------- */

function ProjectCard({ p, dragging, overlay }: { p: Project; dragging?: boolean; overlay?: boolean }) {
  const store = useStore();
  const prog = taskProgress(store.tasks, p.id);
  return (
    <div className={`pcard ${dragging ? 'dragging' : ''} ${overlay ? 'overlay-card' : ''}`} style={{ ['--c' as string]: p.color }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <span className="pcard-title">{p.title}</span>
        {p.isPublic && (
          <span className="chip" title="Shown on the public website" style={{ height: 20, fontSize: 11.5 }}>
            Public
          </span>
        )}
      </div>
      {p.summary && <span className="small muted clamp-2">{p.summary}</span>}
      {prog.total > 0 && (
        <div className="progress" style={{ ['--c' as string]: p.color }} aria-label={`${prog.done} of ${prog.total} tasks done`}>
          <span style={{ width: `${prog.pct}%` }} />
        </div>
      )}
      <div className="pcard-foot">
        <span>{p.startDate ? fmtRange(p.startDate, p.endDate) : p.kind === 'project' ? 'Ongoing' : 'Date not set'}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {prog.total > 0 && (
            <span>
              {prog.done}/{prog.total}
            </span>
          )}
          {p.leadEmail && <Avatar member={store.memberMap.get(p.leadEmail)} email={p.leadEmail} size={22} title={`Lead: ${memberName(store, p.leadEmail)}`} />}
        </span>
      </div>
    </div>
  );
}

function DraggableCard({ p, canDrag }: { p: Project; canDrag: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled: !canDrag });
  return (
    <Link ref={setNodeRef} to={`/app/projects/${p.id}`} {...(canDrag ? listeners : {})} {...(canDrag ? attributes : {})} style={{ textDecoration: 'none', display: 'block', cursor: canDrag ? 'grab' : 'pointer' }} aria-roledescription={canDrag ? 'draggable project' : undefined}>
      <ProjectCard p={p} dragging={isDragging} />
    </Link>
  );
}

function Column({ stage, label, hint, projects, onNew, canDrag }: { stage: Stage; label: string; hint: string; projects: Project[]; onNew: () => void; canDrag: (p: Project) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const { isExec } = useStore();
  return (
    <section ref={setNodeRef} className={`board-col ${isOver ? 'over' : ''}`} aria-label={label}>
      <div className="board-col-head">
        <strong title={hint}>{label}</strong>
        <span className="faint small">{projects.length}</span>
      </div>
      <div className="board-cards">
        {projects.map((p) => (
          <DraggableCard key={p.id} p={p} canDrag={canDrag(p)} />
        ))}
        {isExec && (
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start', color: 'var(--ink-3)' }} onClick={onNew}>
            <Plus /> Add
          </button>
        )}
      </div>
    </section>
  );
}

function Board({ onNew }: { onNew: (s: Stage) => void }) {
  const store = useStore();
  const run = useRun();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const canDrag = (p: Project) => store.isExec || p.leadEmail === store.myEmail;
  const byStage = useMemo(() => {
    const m = new Map<Stage, Project[]>(STAGES.map((s) => [s.key, []]));
    for (const p of store.projects) m.get(p.stage)?.push(p);
    m.forEach((list, k) => list.sort((a, b) => (k === 'done' ? (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '') : (a.startDate || '9999').localeCompare(b.startDate || '9999'))));
    return m;
  }, [store.projects]);
  const active = activeId ? store.projectMap.get(activeId) : undefined;

  const onEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const p = store.projectMap.get(String(e.active.id));
    const to = e.over?.id as Stage | undefined;
    if (!p || !to || p.stage === to) return;
    run(() => updateProject(p, { stage: to }, 'moved', `to ${STAGE_LABEL[to]}`), `Moved to ${STAGE_LABEL[to]}`);
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onEnd} onDragCancel={() => setActiveId(null)}>
      <div className="board">
        {STAGES.map((s) => (
          <Column key={s.key} stage={s.key} label={s.label} hint={s.hint} projects={byStage.get(s.key) ?? []} onNew={() => onNew(s.key)} canDrag={canDrag} />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{active ? <ProjectCard p={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

/* ---------------- timeline ---------------- */

const WEEK_W = 72;

function Timeline() {
  const store = useStore();
  const dated = store.projects.filter((p) => p.startDate || p.endDate);
  const undated = store.projects.filter((p) => !p.startDate && !p.endDate);
  const today = new Date();
  const dates = dated.flatMap((p) => [toDate(p.startDate), toDate(p.endDate)]).filter(Boolean) as Date[];
  const min = startOfWeek(addDays(dates.length ? new Date(Math.min(...dates.map(Number), +today)) : today, -7), { weekStartsOn: 1 });
  const maxD = dates.length ? new Date(Math.max(...dates.map(Number), +today)) : today;
  let max = endOfWeek(addDays(maxD, 21), { weekStartsOn: 1 });
  if (differenceInCalendarDays(max, min) < 7 * 14) max = addDays(min, 7 * 14 - 1);
  const weeks = Math.ceil((differenceInCalendarDays(max, min) + 1) / 7);
  const dayW = WEEK_W / 7;
  const x = (d: Date) => differenceInCalendarDays(d, min) * dayW;
  const rows = [...dated].sort((a, b) => (a.startDate || a.endDate).localeCompare(b.startDate || b.endDate));

  useEffect(() => {
    const el = document.querySelector('.timeline');
    if (el) el.scrollLeft = Math.max(0, x(today) - 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="timeline">
      <div className="tl-inner">
        <div className="tl-head">
          <div className="tl-label-col" />
          {Array.from({ length: weeks }, (_, i) => {
            const d = addDays(min, i * 7);
            const monthStart = i === 0 || d.getMonth() !== addDays(d, -7).getMonth();
            return (
              <div key={i} className={`tl-week ${monthStart ? 'month-start' : ''}`} style={{ width: WEEK_W }}>
                <strong>{monthStart ? format(d, 'MMM') : ' '}</strong>
                {format(d, 'd')}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'relative' }}>
          <div className="tl-today" style={{ left: 220 + x(today) + dayW / 2 }} title="Today" />
          {rows.map((p) => {
            const s = toDate(p.startDate) ?? toDate(p.endDate)!;
            const e = toDate(p.endDate) ?? s;
            const left = x(s);
            const width = Math.max(dayW * (differenceInCalendarDays(e, s) + 1), 26);
            return (
              <div className="tl-row" key={p.id}>
                <Link to={`/app/projects/${p.id}`} className="tl-label-col">
                  <span className="dot" style={{ ['--c' as string]: p.color }} />
                  <span className="ellipsis">{p.title}</span>
                </Link>
                <div className="tl-track" style={{ width: weeks * WEEK_W }}>
                  <Link to={`/app/projects/${p.id}`} className="tl-bar" style={{ left, width, ['--c' as string]: p.color }} title={`${p.title}: ${fmtRange(p.startDate, p.endDate)}`}>
                    {width > 90 ? p.title : ''}
                  </Link>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div className="tl-undated">No project has dates yet. Add start and end dates to see them here.</div>}
        </div>
      </div>
      {undated.length > 0 && (
        <div className="tl-undated">
          Without dates:{' '}
          {undated.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link to={`/app/projects/${p.id}`}>{p.title}</Link>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- calendar ---------------- */

function ProjectCalendar() {
  const store = useStore();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [showTasks, setShowTasks] = useState(true);
  const [showSchool, setShowSchool] = useState(true);
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const key = (d: Date) => format(d, 'yyyy-MM-dd');
  const byDay = useMemo(() => {
    type Item = { id: string; label: string; color: string; to: string; task?: boolean; done?: boolean; school?: string };
    const m = new Map<string, Item[]>();
    const add = (k: string, it: Item) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    };
    for (const p of store.projects) {
      const s = toDate(p.startDate) ?? toDate(p.endDate);
      if (!s) continue;
      const e = toDate(p.endDate) ?? s;
      if (e < s) continue;
      for (const d of eachDayOfInterval({ start: s, end: e })) add(key(d), { id: p.id, label: p.title, color: p.color, to: `/app/projects/${p.id}` });
    }
    if (showSchool)
      for (const d of store.schoolDates) {
        const s = toDate(d.date);
        if (!s) continue;
        const e = toDate(d.endDate || d.date) ?? s;
        if (e < s) continue;
        for (const day of eachDayOfInterval({ start: s, end: e }))
          add(key(day), { id: `s-${d.id}`, label: d.title, color: 'var(--ink-3)', to: d.projectId ? `/app/projects/${d.projectId}` : '', school: d.kind });
      }
    if (showTasks)
      for (const t of store.tasks) {
        if (!t.dueDate) continue;
        add(t.dueDate, { id: t.id, label: t.title, color: store.projectMap.get(t.projectId)?.color ?? 'var(--ink-3)', to: `/app/tasks?open=${t.id}&scope=all`, task: true, done: t.status === 'done' });
      }
    return m;
  }, [store.projects, store.tasks, store.projectMap, store.schoolDates, showTasks, showSchool]);

  return (
    <div className="cal">
      <div className="cal-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft />
          </button>
          <strong style={{ minWidth: 130, textAlign: 'center' }}>{format(month, 'MMMM yyyy')}</strong>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
            <ChevronRight />
          </button>
          <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>
            Today
          </button>
        </div>
        <span style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {store.schoolDates.length > 0 && (
            <label className="check small">
              <input type="checkbox" checked={showSchool} onChange={(e) => setShowSchool(e.target.checked)} /> School calendar
            </label>
          )}
          <label className="check small">
            <input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} /> Task deadlines
          </label>
        </span>
      </div>
      <div className="cal-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const items = byDay.get(key(d)) ?? [];
          const shown = items.slice(0, 4);
          return (
            <div key={key(d)} className={`cal-day ${isSameMonth(d, month) ? '' : 'other'} ${isToday(d) ? 'today' : ''}`}>
              <span className="cal-num">{format(d, 'd')}</span>
              {shown.map((it) =>
                it.school && !it.to ? (
                  <span key={it.id} className={`cal-item school k-${it.school}`} title={it.label}>
                    {it.label}
                  </span>
                ) : (
                  <Link key={it.id} to={it.to} className={`cal-item ${it.task ? 'task' : ''} ${it.done ? 'done' : ''} ${it.school ? `school k-${it.school}` : ''}`} style={{ ['--c' as string]: it.color }} title={it.label}>
                    {it.label}
                  </Link>
                ),
              )}
              {items.length > shown.length && <span className="cal-more">+{items.length - shown.length} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- list ---------------- */

function ProjectList() {
  const store = useStore();
  const { entries } = useLedger();
  const [sort, setSort] = useState<{ k: 'title' | 'stage' | 'date' | 'budget'; dir: 1 | -1 }>({ k: 'date', dir: 1 });
  const stageRank: Record<Stage, number> = { idea: 0, planning: 1, active: 2, done: 3 };
  const rows = [...store.projects].sort((a, b) => {
    let c = 0;
    if (sort.k === 'title') c = a.title.localeCompare(b.title);
    if (sort.k === 'stage') c = stageRank[a.stage] - stageRank[b.stage];
    if (sort.k === 'date') c = (a.startDate || '9999').localeCompare(b.startDate || '9999');
    if (sort.k === 'budget') c = a.budgetPlanned - b.budgetPlanned;
    return c * sort.dir;
  });
  const th = (k: typeof sort.k, label: string, right = false) => (
    <th className={right ? 'r' : ''} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label}
        {sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {th('title', 'Project')}
            {th('stage', 'Stage')}
            <th>Lead</th>
            {th('date', 'Dates')}
            <th>Tasks</th>
            {th('budget', 'Budget', true)}
            <th className="r">Spent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const prog = taskProgress(store.tasks, p.id);
            const m = projectMoney(entries, p.id);
            const over = p.budgetPlanned > 0 && m.spent > p.budgetPlanned;
            return (
              <tr key={p.id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                    <span className="dot" style={{ ['--c' as string]: p.color }} />
                    <Link to={`/app/projects/${p.id}`}>{p.title}</Link>
                  </span>
                </td>
                <td>
                  <span className="chip">{STAGE_LABEL[p.stage]}</span>
                </td>
                <td>{p.leadEmail ? memberName(store, p.leadEmail) : <span className="faint">None</span>}</td>
                <td className="small">{fmtRange(p.startDate, p.endDate)}</td>
                <td className="small">{prog.total ? `${prog.done} of ${prog.total}` : <span className="faint">None</span>}</td>
                <td className="r num">{p.budgetPlanned ? money(p.budgetPlanned) : <span className="faint">Not set</span>}</td>
                <td className={`r num ${over ? 'neg' : ''}`}>{m.spent ? money(m.spent) : <span className="faint">0</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
