import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ExternalLink, FileText, Flag, Plus, Trash2, Trophy } from 'lucide-react';
import { useStore } from '../lib/store';
import { createCompetition, saveRounds } from '../lib/actions';
import { COMP_STAGE_LABEL, COMPETITION_TEMPLATES } from '../lib/constants';
import { fmtDate, uid } from '../lib/format';
import type { Deliverable, Project, Round } from '../lib/types';
import { STATUS_LABEL, useDeliverables } from '../lib/deliverables';
import { DeliverableRow, dueOf } from './deliverables/DeliverablesPanel';
import { Avatar, Empty, useConfirm, useRun } from '../components/ui';
import { PageHead } from './Shell';
import { ProjectForm } from './projectForm';

import { deadlineLabel } from './deadline';
export { deadlineLabel };

/** Rounds are kept in the order they happen; "date TBC" rounds stay where they were put. */
export function nextRound(p: Project): Round | undefined {
  return (p.rounds ?? []).find((r) => !r.done);
}

/** Put a new round before the first dated round that comes after it. */
function insertByDate(list: Round[], r: Round): Round[] {
  if (!r.date) return [...list, r];
  const i = list.findIndex((x) => x.date && x.date > r.date);
  return i < 0 ? [...list, r] : [...list.slice(0, i), r, ...list.slice(i)];
}

export function CompetitionsPage() {
  const store = useStore();
  const run = useRun();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const comps = store.projects.filter((p) => p.kind === 'competition');
  const live = comps.filter((p) => p.stage !== 'done');
  const finished = comps.filter((p) => p.stage === 'done').sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
  const usedTemplates = new Set(comps.map((p) => p.title));
  const { list: delivs } = useDeliverables(live.map((p) => p.id));
  const openDelivs = delivs
    .filter((d) => d.status !== 'submitted')
    .sort((a, b) => (dueOf(a, store.projectMap.get(a.projectId)) || '9999').localeCompare(dueOf(b, store.projectMap.get(b.projectId)) || '9999'))
    .slice(0, 8);
  const templates = COMPETITION_TEMPLATES.filter((t) => !usedTemplates.has(t.title));

  const deadlines = useMemo(
    () =>
      live
        .flatMap((p) => (p.rounds ?? []).filter((r) => !r.done && r.date).map((r) => ({ p, r })))
        .sort((a, b) => a.r.date.localeCompare(b.r.date))
        .slice(0, 6),
    [live],
  );

  return (
    <div className="page">
      <PageHead
        title="Competitions"
        sub={`${live.length} on the go, ${finished.length} finished`}
        actions={
          store.isExec && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus /> New competition
            </button>
          )
        }
      />

      {deadlines.length > 0 && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2 className="h3">Next deadlines</h2>
          </div>
          <ul className="list">
            {deadlines.map(({ p, r }) => {
              const dl = deadlineLabel(r.date);
              return (
                <li key={p.id + r.id}>
                  <Link to={`/app/competitions/${p.id}`} className="row-link deadline-row">
                    <span className="school-date">
                      <strong>{fmtDate(r.date, 'd')}</strong>
                      <span>{fmtDate(r.date, 'MMM')}</span>
                    </span>
                    <span className="row-main">
                      <span className="title">{r.name}</span>
                      <span className="small faint">{p.title}</span>
                    </span>
                    <span className={`chip ${dl.tone}`}>{dl.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openDelivs.length > 0 && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <h2 className="h3">Deliverables to hand in</h2>
          </div>
          <ul className="list">
            {openDelivs.map((d) => (
              <li key={d.id}>
                <DeliverableRow d={d} p={store.projectMap.get(d.projectId)} showProject={live.length > 1} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.length === 0 && templates.length === 0 && finished.length === 0 && (
        <div className="panel">
          <Empty title="No competitions yet">{store.isExec ? 'Add one with New competition. Put in its deadlines and the team, and everyone on it gets reminders.' : 'When the club enters a competition, it shows up here.'}</Empty>
        </div>
      )}

      {live.length > 0 && (
        <div className="comp-grid">
          {live.map((p) => (
            <CompetitionCard key={p.id} p={p} delivs={delivs.filter((d) => d.projectId === p.id)} />
          ))}
        </div>
      )}

      {store.isExec && templates.length > 0 && (
        <section className="comp-templates">
          <h2 className="h3">Start from a known competition</h2>
          <p className="small muted">The official deadlines are filled in for you. Then add the team.</p>
          <div className="comp-template-list">
            {templates.map((t) => (
              <div key={t.key} className="comp-template">
                <span className="row-main">
                  <span className="title">{t.title}</span>
                  <span className="small faint">
                    {t.organizer}, {t.rounds.length} deadlines
                  </span>
                </span>
                <a className="btn btn-sm btn-ghost" href={t.website} target="_blank" rel="noreferrer">
                  <ExternalLink /> Official page
                </a>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    const id = await run(() => createCompetition(t, store.projects.length, store.myEmail), 'Competition added');
                    if (id) nav(`/app/competitions/${id}`);
                  }}
                >
                  <Plus /> Add
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head">
            <h2 className="h3">Results</h2>
          </div>
          <ul className="list">
            {finished.map((p) => (
              <li key={p.id}>
                <Link to={`/app/competitions/${p.id}`} className="row-link">
                  <Trophy size={18} className="comp-trophy" aria-hidden="true" />
                  <span className="row-main">
                    <span className="title">{p.title}</span>
                    <span className="small faint">{[p.organizer, fmtDate(p.endDate || p.startDate, 'MMM yyyy')].filter(Boolean).join(', ')}</span>
                  </span>
                  {p.review?.result ? <span className="chip good">{p.review.result}</span> : <span className="small faint">No result written</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {creating && <ProjectForm kind="competition" stage="planning" onClose={() => setCreating(false)} onCreated={(id) => nav(`/app/competitions/${id}`)} />}
    </div>
  );
}

function CompetitionCard({ p, delivs = [] }: { p: Project; delivs?: Deliverable[] }) {
  const store = useStore();
  const rounds = p.rounds ?? [];
  const done = rounds.filter((r) => r.done).length;
  const next = nextRound(p);
  const dl = next ? deadlineLabel(next.date) : null;
  const people = [p.leadEmail, ...(p.teamEmails ?? [])].filter(Boolean);
  return (
    <Link to={`/app/competitions/${p.id}`} className="comp-card" style={{ ['--c' as string]: p.color }}>
      <span className="comp-top">
        <span className="chip">{COMP_STAGE_LABEL[p.stage]}</span>
        {p.organizer && <span className="small faint ellipsis">{p.organizer}</span>}
      </span>
      <strong className="comp-title">{p.title}</strong>
      {next ? (
        <span className="comp-next">
          <Flag size={15} aria-hidden="true" />
          <span className="ellipsis">{next.name}</span>
          {dl && <span className={`chip ${dl.tone}`}>{dl.text}</span>}
        </span>
      ) : (
        <span className="comp-next faint">{rounds.length ? 'Every deadline is done' : 'No deadlines added yet'}</span>
      )}
      {rounds.length > 0 && (
        <span className="progress" style={{ ['--c' as string]: p.color }} aria-label={`${done} of ${rounds.length} deadlines done`}>
          <span style={{ width: `${(done / rounds.length) * 100}%` }} />
        </span>
      )}
      {delivs.length > 0 && (
        <span className="small faint comp-delivs">
          <FileText size={13} aria-hidden="true" /> {delivs.filter((d) => d.status === 'submitted').length} of {delivs.length} deliverables submitted
        </span>
      )}
      <span className="comp-people">
        {people.length ? people.slice(0, 7).map((e) => <Avatar key={e} member={store.memberMap.get(e)} email={e} size={26} />) : <span className="small faint">No team yet</span>}
      </span>
    </Link>
  );
}

/** Deadlines of one competition, shown on its project page. The lead and the exec team can edit. */
export function RoundsPanel({ p, canEdit, deliverables = [] }: { p: Project; canEdit: boolean; deliverables?: Deliverable[] }) {
  const run = useRun();
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const rounds = p.rounds ?? [];
  const next = nextRound(p);

  const save = (list: Round[], verb = '', detail = '') => run(() => saveRounds(p, list, verb, detail));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3">Deadlines</h2>
        {rounds.length > 0 && (
          <span className="small faint">
            {rounds.filter((r) => r.done).length} of {rounds.length} done
          </span>
        )}
      </div>
      {rounds.length === 0 && !canEdit ? (
        <Empty title="No deadlines yet" />
      ) : (
        <ol className="rounds">
          {rounds.map((r) => {
            const dl = deadlineLabel(r.date);
            return (
              <li key={r.id} className={`round ${r.done ? 'is-done' : ''} ${next?.id === r.id ? 'is-next' : ''}`}>
                <button
                  className="round-check"
                  disabled={!canEdit}
                  aria-label={r.done ? `Mark ${r.name} as not done` : `Mark ${r.name} as done`}
                  onClick={() => save((p.rounds ?? []).map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)), r.done ? '' : 'ticked off', r.done ? '' : r.name)}
                >
                  <Check strokeWidth={3} />
                </button>
                <span className="round-main">
                  <span className="round-name">{r.name}</span>
                  <span className="small faint">{r.date ? fmtDate(r.date, 'EEEE d MMMM yyyy') : 'Date not announced yet'}</span>
                  {deliverables
                    .filter((d) => d.roundId === r.id)
                    .map((d) => (
                      <Link key={d.id} to={`/app/competitions/${p.id}/d/${d.id}`} className="round-deliv">
                        <FileText size={13} aria-hidden="true" /> {d.title} <span className={`deliv-status ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                      </Link>
                    ))}
                </span>
                {!r.done && <span className={`chip ${dl.tone}`}>{dl.text}</span>}
                {canEdit && (
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={`Remove ${r.name}`}
                    onClick={async () => {
                      if (await confirm({ title: `Remove "${r.name}"?`, body: 'Only this deadline is removed.', confirm: 'Remove', danger: true }))
                        save((p.rounds ?? []).filter((x) => x.id !== r.id));
                    }}
                  >
                    <Trash2 />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canEdit && (
        <form
          className="round-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            save(insertByDate(p.rounds ?? [], { id: uid('r'), name: name.trim(), date, done: false }));
            setName('');
            setDate('');
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a deadline, e.g. Round 1 submission" aria-label="Deadline name" />
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Deadline date" />
          <button className="btn" type="submit" disabled={!name.trim()}>
            <Plus /> Add
          </button>
        </form>
      )}
    </section>
  );
}
