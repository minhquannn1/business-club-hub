import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileText, Link2, Plus } from 'lucide-react';
import { useStore } from '../../lib/store';
import { canWriteDeliverables, createDeliverable, STATUS_LABEL } from '../../lib/deliverables';
import { templatesFor, type DocTemplate } from '../../lib/docTemplates';
import { fmtDate } from '../../lib/format';
import type { Deliverable, Project } from '../../lib/types';
import { Avatar, Empty, Modal, useRun } from '../../components/ui';
import { deadlineLabel } from '../deadline';

/** When a deliverable is due: its competition deadline, or its own date. */
export function dueOf(d: Deliverable, p: Project | undefined): string {
  return (p?.rounds ?? []).find((r) => r.id === d.roundId)?.date || d.dueDate || '';
}

export function DeliverableRow({ d, p, showProject = false }: { d: Deliverable; p: Project | undefined; showProject?: boolean }) {
  const store = useStore();
  const due = dueOf(d, p);
  const dl = due && d.status !== 'submitted' ? deadlineLabel(due) : null;
  const round = (p?.rounds ?? []).find((r) => r.id === d.roundId);
  return (
    <Link to={`/app/competitions/${d.projectId}/d/${d.id}`} className="row-link deliv-row">
      <span className={`deliv-icon ${d.status}`} aria-hidden="true">
        {d.status === 'submitted' ? <CheckCircle2 size={18} /> : d.kind === 'file' ? <Link2 size={18} /> : <FileText size={18} />}
      </span>
      <span className="row-main">
        <span className="title">{d.title}</span>
        <span className="small faint ellipsis">
          {[showProject ? p?.title : '', round ? round.name : '', due ? fmtDate(due, 'd MMM') : 'No date', d.kind === 'doc' ? `${d.words ?? 0} words` : d.link ? 'Link added' : 'No link yet'].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`chip deliv-status ${d.status}`}>{STATUS_LABEL[d.status]}</span>
      {dl && <span className={`chip ${dl.tone} hide-sm`}>{dl.text}</span>}
      <Avatar member={store.memberMap.get(d.ownerEmail)} email={d.ownerEmail} size={24} />
    </Link>
  );
}

/** The Deliverables tab of a competition. */
export function DeliverablesPanel({ p, list, loading }: { p: Project; list: Deliverable[]; loading: boolean }) {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const canWrite = canWriteDeliverables(p, store.myEmail, store.isExec);
  const sorted = [...list].sort((a, b) => (dueOf(a, p) || '9999').localeCompare(dueOf(b, p) || '9999') || a.order - b.order);
  const done = list.filter((d) => d.status === 'submitted').length;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h3">Deliverables</h2>
        {list.length > 0 && (
          <span className="small faint">
            {done} of {list.length} submitted
          </span>
        )}
        {canWrite && (
          <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
            <Plus /> New deliverable
          </button>
        )}
      </div>
      {loading && !list.length ? (
        <p className="muted panel-body">Loading...</p>
      ) : !list.length ? (
        <Empty title="Nothing to hand in yet">
          {canWrite ? 'Add what the competition asks for: a report, a pitch script, a form answer or a file. Each written one gets its own document you can export as PDF or Word.' : 'The team has not added any yet.'}
        </Empty>
      ) : (
        <ul className="list">
          {sorted.map((d) => (
            <li key={d.id}>
              <DeliverableRow d={d} p={p} />
            </li>
          ))}
        </ul>
      )}
      {adding && <NewDeliverableModal p={p} existing={list} onClose={() => setAdding(false)} />}
    </section>
  );
}

function NewDeliverableModal({ p, existing, onClose }: { p: Project; existing: Deliverable[]; onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const { own, general } = templatesFor(p.title);
  const have = new Set(existing.map((d) => d.templateKey));
  const add = async (t: DocTemplate) => {
    setBusy(t.key);
    const id = await run(() => createDeliverable(p, t, store.myEmail, existing.length), `${t.title} added`);
    setBusy('');
    if (id) {
      onClose();
      nav(`/app/competitions/${p.id}/d/${id}`);
    }
  };
  const item = (t: DocTemplate) => (
    <li key={t.key}>
      <button className={`tpl ${busy === t.key ? 'is-busy' : ''}`} disabled={!!busy} onClick={() => void add(t)}>
        <span className="tpl-icon" aria-hidden="true">
          {t.kind === 'file' ? <Link2 size={18} /> : <FileText size={18} />}
        </span>
        <span className="row-main">
          <span className="title">
            {t.title}
            {have.has(t.key) && <span className="chip"> Already added</span>}
          </span>
          <span className="small muted">{t.blurb}</span>
        </span>
      </button>
    </li>
  );
  return (
    <Modal title="New deliverable" onClose={onClose}>
      {own.length > 0 && (
        <>
          <p className="tpl-head">For {p.title}</p>
          <p className="small muted" style={{ marginBottom: 8 }}>
            Set up with the official sections, word limits, page format and deadline.
          </p>
          <ul className="tpl-list">{own.map(item)}</ul>
        </>
      )}
      <p className="tpl-head">{own.length ? 'Something else' : 'Start from'}</p>
      <ul className="tpl-list">{general.map(item)}</ul>
    </Modal>
  );
}
