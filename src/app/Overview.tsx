import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Megaphone, Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import { fmtRange, money, todayISO } from '../lib/format';
import { STAGE_LABEL } from '../lib/constants';
import { useLedger, projectMoney } from '../lib/workbook';
import type { Task } from '../lib/types';
import { Empty } from '../components/ui';
import { EmptyArt } from '../components/Art';
import { TaskForm, TaskRow, sortTasks } from './tasks';
import { ActivityLine } from './Activity';
import { taskProgress } from './Projects';
import { QuickLinksPanel, SchoolCalendarPanel } from './planning';
import { AnnouncementModal, AnnouncementsPanel } from './announcements';

const VN_SURNAMES = new Set(['nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do', 'ho', 'ngo', 'duong', 'ly', 'dinh', 'truong', 'mai', 'lam', 'trinh', 'cao', 'luu', 'ha', 'ta']);

/** "Nguyễn Minh Quân" -> "Quân", "Quan Nguyen" -> "Quan" */
function givenName(full: string) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  return parts.length > 1 && VN_SURNAMES.has(plain(parts[0])) ? parts[parts.length - 1] : parts[0];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Overview() {
  const store = useStore();
  const { entries, balance } = useLedger();
  const [open, setOpen] = useState<Task | 'new' | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const today = todayISO();
  const soon = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const myTasks = useMemo(() => store.tasks.filter((t) => t.assigneeEmail === store.myEmail && t.status !== 'done').sort(sortTasks), [store.tasks, store.myEmail]);
  const overdue = store.tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today);
  const running = store.projects.filter((p) => p.stage === 'active' || p.stage === 'planning');
  const upcoming = store.projects
    .filter((p) => p.stage !== 'done' && ((p.startDate && p.startDate <= soon && (p.endDate || p.startDate) >= today) || p.stage === 'active'))
    .sort((a, b) => (a.startDate || '0').localeCompare(b.startDate || '0'));
  const budgetWatch = store.projects
    .filter((p) => p.budgetPlanned > 0 && p.stage !== 'done')
    .map((p) => ({ p, ...projectMoney(entries, p.id) }))
    .filter((x) => x.spent / x.p.budgetPlanned >= 0.8)
    .sort((a, b) => b.spent / b.p.budgetPlanned - a.spent / a.p.budgetPlanned);
  const firstName = givenName(store.me?.name || '');

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <h1 className="greet">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="muted">{format(new Date(), 'EEEE d MMMM')}</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setOpen('new')}>
            <Plus /> Task
          </button>
          <Link to="/app/meetings/new" className="btn">
            <Plus /> Meeting notes
          </Link>
          {store.isExec && (
            <button className="btn" onClick={() => setAnnouncing(true)}>
              <Megaphone /> Announce
            </button>
          )}
        </div>
      </header>

      <AnnouncementsPanel />

      <div className="figures">
        <Link to="/app/tasks" className="figure">
          <span className="val num">{myTasks.length}</span>
          <span className="lbl">Your open tasks</span>
        </Link>
        <Link to="/app/tasks?scope=all" className="figure">
          <span className={`val num ${overdue.length ? 'neg' : ''}`}>{overdue.length}</span>
          <span className="lbl">Overdue across the club</span>
        </Link>
        <Link to="/app/projects" className="figure">
          <span className="val num">{running.length}</span>
          <span className="lbl">Projects in motion</span>
        </Link>
        <Link to="/app/finance" className="figure">
          <span className={`val num ${balance < 0 ? 'neg' : ''}`}>{money(balance, { compact: Math.abs(balance) >= 10_000_000 })}</span>
          <span className="lbl">Club balance</span>
        </Link>
      </div>

      <div className="ov-grid">
        <div className="ov-stack">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Your tasks</h2>
              <Link to="/app/tasks" className="btn btn-sm btn-ghost">
                See all
              </Link>
            </div>
            {myTasks.length === 0 ? (
              <Empty art={<EmptyArt.tasks />} title="You're clear">Nothing assigned to you right now.</Empty>
            ) : (
              myTasks.slice(0, 7).map((t) => <TaskRow key={t.id} task={t} onOpen={setOpen} />)
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Coming up in the next 30 days</h2>
              <Link to="/app/projects" className="btn btn-sm btn-ghost">
                All projects
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <Empty title="Nothing scheduled">{store.isExec ? 'Give your projects dates and they show up here.' : null}</Empty>
            ) : (
              <ul className="list">
                {upcoming.map((p) => {
                  const prog = taskProgress(store.tasks, p.id);
                  return (
                    <li key={p.id}>
                      <Link to={`/app/projects/${p.id}`} className="row-link">
                        <span className="dot" style={{ ['--c' as string]: p.color }} />
                        <span className="row-main">
                          <span className="title">{p.title}</span>
                          <span className="small faint">
                            {fmtRange(p.startDate, p.endDate)}
                            {p.location ? `, ${p.location}` : ''}
                          </span>
                        </span>
                        {prog.total > 0 && (
                          <span className="small muted ov-prog" style={{ width: 90 }}>
                            <span className="progress" style={{ ['--c' as string]: p.color, display: 'block', marginBottom: 4 }}>
                              <span style={{ width: `${prog.pct}%` }} />
                            </span>
                            {prog.done}/{prog.total} tasks
                          </span>
                        )}
                        <span className="chip">{STAGE_LABEL[p.stage]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="ov-stack">
          <SchoolCalendarPanel />
          <QuickLinksPanel />
          {budgetWatch.length > 0 && (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h3">Budgets to watch</h2>
              </div>
              <ul className="list">
                {budgetWatch.map(({ p, spent }) => {
                  const pct = Math.round((spent / p.budgetPlanned) * 100);
                  return (
                    <li key={p.id}>
                      <Link to={`/app/projects/${p.id}`} className="row-link" style={{ display: 'grid', gap: 4 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span className="title">{p.title}</span>
                          <span className={`small num ${pct > 100 ? 'neg' : 'muted'}`}>{pct}% used</span>
                        </span>
                        <span className="budget-bar" style={{ margin: 0, height: 8 }}>
                          <span className={pct > 100 ? 'over' : ''} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Latest changes</h2>
              <Link to="/app/activity" className="btn btn-sm btn-ghost">
                Activity
              </Link>
            </div>
            {store.activity.length === 0 ? (
              <Empty title="Quiet so far" />
            ) : (
              <ul className="feed">
                {store.activity.slice(0, 9).map((a) => (
                  <ActivityLine key={a.id} a={a} compact />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {open && <TaskForm task={open === 'new' ? undefined : open} onClose={() => setOpen(null)} />}
      {announcing && <AnnouncementModal onClose={() => setAnnouncing(false)} />}
    </div>
  );
}
