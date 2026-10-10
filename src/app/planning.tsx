import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, ExternalLink, Link2, Plus, X } from 'lucide-react';
import { addDays, format } from 'date-fns';
import { useStore } from '../lib/store';
import { deleteLink, importBundle, planForSchoolDate, saveLink, type ImportBundle } from '../lib/actions';
import { fmtDate, fmtRange, todayISO } from '../lib/format';
import type { SchoolDate } from '../lib/types';
import { Empty, Field, Modal, useConfirm, useRun } from '../components/ui';
import { PageHead } from './Shell';

const KIND_LABEL: Record<SchoolDate['kind'], string> = { booth: 'Booth chance', holiday: 'No school', school: 'School' };

function safeUrl(u: string) {
  const v = u.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Upcoming dates from the school calendar, with a one-click "plan it" for booth chances. */
export function SchoolCalendarPanel({ days = 75, max = 6 }: { days?: number; max?: number }) {
  const store = useStore();
  const run = useRun();
  const nav = useNavigate();
  const today = todayISO();
  const until = format(addDays(new Date(), days), 'yyyy-MM-dd');
  const list = store.schoolDates.filter((d) => (d.endDate || d.date) >= today && d.date <= until).slice(0, max);
  if (!store.schoolDates.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={16} /> School calendar
        </h2>
        <Link to="/app/projects?view=calendar" className="btn btn-sm btn-ghost">
          Calendar
        </Link>
      </div>
      {list.length === 0 ? (
        <Empty title="Nothing on the school calendar soon" />
      ) : (
        <ul className="list school-list">
          {list.map((d) => {
            const project = d.projectId ? store.projectMap.get(d.projectId) : undefined;
            return (
              <li key={d.id} className={`school-row k-${d.kind}`}>
                <span className="school-date">
                  <strong>{fmtDate(d.date, 'd')}</strong>
                  <span>{fmtDate(d.date, 'MMM')}</span>
                </span>
                <span className="row-main">
                  <span className="title">{d.title}</span>
                  <span className="small faint">
                    {d.endDate && d.endDate !== d.date ? fmtRange(d.date, d.endDate) : fmtDate(d.date, 'EEEE')}
                    {d.note ? `, ${d.note}` : ''}
                  </span>
                </span>
                {project ? (
                  <Link to={`/app/projects/${project.id}`} className="chip chip-link">
                    {project.title}
                  </Link>
                ) : d.kind === 'booth' && store.isExec ? (
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      let id = '';
                      const ok = await run(async () => {
                        id = await planForSchoolDate(d, store.projects.length);
                        return true;
                      }, 'Added to Projects as an idea');
                      if (ok && id) nav(`/app/projects/${id}`);
                    }}
                  >
                    <Plus /> Plan a booth
                  </button>
                ) : (
                  <span className={`chip kind-chip k-${d.kind}`}>{KIND_LABEL[d.kind]}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Links pinned to the workspace: masterplans, shared sheets, forms. */
export function QuickLinksPanel() {
  const store = useStore();
  const run = useRun();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  if (!store.links.length && !store.isExec) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={16} /> Links
        </h2>
        {store.isExec && (
          <button className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
            <Plus /> Add
          </button>
        )}
      </div>
      {store.links.length === 0 ? (
        <Empty title="No links yet">Pin the masterplans and shared sheets the club uses.</Empty>
      ) : (
        <ul className="list">
          {store.links.map((l) => (
            <li key={l.id} className="link-row">
              <a href={l.url} target="_blank" rel="noreferrer" className="row-link">
                <ExternalLink size={15} aria-hidden="true" />
                <span className="title ellipsis">{l.label}</span>
              </a>
              {store.isExec && (
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={`Remove ${l.label}`}
                  onClick={async () => {
                    if (await confirm({ title: `Remove ${l.label}?`, body: 'Only the link is removed. The file itself is not touched.', confirm: 'Remove', danger: true })) await run(() => deleteLink(l.id), 'Link removed');
                  }}
                >
                  <X />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && <LinkModal onClose={() => setAdding(false)} order={store.links.length} />}
    </section>
  );
}

function LinkModal({ onClose, order }: { onClose: () => void; order: number }) {
  const run = useRun();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const save = async () => {
    const ok = await run(async () => {
      await saveLink({ label: label.trim() || url.trim(), url: safeUrl(url), order });
      return true;
    }, 'Link added');
    if (ok) onClose();
  };
  return (
    <Modal
      title="Add a link"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!url.trim()} onClick={save}>
            Add link
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" className="full">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sport Day masterplan" autoFocus />
        </Field>
        <Field label="Link" className="full">
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/..." inputMode="url" />
        </Field>
      </div>
    </Modal>
  );
}

/** Exec-only bulk import of projects, school dates and links. */
export function ImportPage() {
  const store = useStore();
  const run = useRun();
  const [text, setText] = useState('');
  const [done, setDone] = useState<string[] | null>(null);
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return { b: JSON.parse(text) as ImportBundle };
    } catch {
      return { error: "That isn't valid import data." };
    }
  }, [text]);
  if (!store.isExec) return <Navigate to="/app" replace />;
  const b = parsed && 'b' in parsed ? parsed.b : null;
  const summary = b
    ? [
        b.events?.length && `${b.events.length} past events`,
        b.projects?.length && `${b.projects.length} projects (${b.projects.reduce((s, p) => s + (p.tasks?.length ?? 0), 0)} tasks)`,
        b.schoolDates?.length && `${b.schoolDates.length} school dates`,
        b.links?.length && `${b.links.length} links`,
        b.ledgers?.length && `${b.ledgers.length} ledgers`,
      ].filter(Boolean)
    : [];
  return (
    <div className="page">
      <PageHead title="Import" sub="Bring projects, school dates and links in from other files. Exec only." />
      <section className="panel">
        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
          <textarea className="textarea mono" style={{ minHeight: 160, fontSize: 12 }} value={text} onChange={(e) => (setText(e.target.value), setDone(null))} aria-label="Import data" placeholder="{ &quot;projects&quot;: [...], &quot;schoolDates&quot;: [...] }" />
          {parsed && 'error' in parsed && (
            <p className="notice" role="alert">
              {parsed.error}
            </p>
          )}
          {summary.length > 0 && <p>Ready to add: {summary.join(', ')}.</p>}
          {done && <p className="notice info">Added {done.join(', ')}.</p>}
          <div>
            <button
              className="btn btn-primary"
              disabled={!summary.length || !!done}
              onClick={async () => {
                let report: string[] = [];
                const ok = await run(async () => {
                  report = await importBundle(b!, store.projects.length + store.sheets.length + 20);
                  return true;
                }, 'Imported');
                if (ok) setDone(report);
              }}
            >
              Import
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
