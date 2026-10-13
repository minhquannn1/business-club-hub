import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileText,
  History,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Printer,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useStore, memberName } from '../../lib/store';
import { log, saveRounds } from '../../lib/actions';
import { canWriteDeliverables, lockedBy, repo, restoreVersion, saveVersion, STATUSES, STATUS_LABEL, useDeliverable, usePresence, type Presence } from '../../lib/deliverables';
import { checkDeliverable, cssFont, deliverableHTML, paraGapEm, PAPER, sortSections, type DocIssue } from '../../lib/docModel';
import { DOC_FORMATS, FONTS, LINE_HEIGHTS, docJSON } from '../../lib/docTemplates';
import { ago, fmtDate } from '../../lib/format';
import type { Deliverable, DeliverableStatus, DocComment, DocFormat, DocRules, DocSection, DocVersion, Project } from '../../lib/types';
import { Avatar, Empty, Field, Modal, useConfirm, useMenu, useRun, useToast } from '../../components/ui';
import { deadlineLabel } from '../deadline';
import { SectionEditor, type SaveState } from './SectionEditor';
import { Toolbar } from './Toolbar';
import { copyAll, copySection, downloadDocx, downloadPDF, printDeliverable } from './exporters';
import '../../styles/doc.css';

export default function DeliverablePage() {
  const { id = '', did = '' } = useParams();
  const store = useStore();
  const p = store.projectMap.get(id);
  const { d, sections: rawSections, comments } = useDeliverable(did);
  const sections = useMemo(() => sortSections(rawSections), [rawSections]);

  if (d === undefined || (!p && !store.ready))
    return (
      <div className="page">
        <div className="panel">
          <Empty title="Loading..." />
        </div>
      </div>
    );
  if (!d || !p)
    return (
      <div className="page">
        <Link to={p ? `/app/competitions/${p.id}?tab=deliverables` : '/app/competitions'} className="crumb">
          <ArrowLeft size={15} /> {p?.title ?? 'Competitions'}
        </Link>
        <div className="panel" style={{ marginTop: 14 }}>
          <Empty title="This deliverable no longer exists">It may have been deleted.</Empty>
        </div>
      </div>
    );
  return <DocWorkspace p={p} d={d} sections={sections} comments={comments} />;
}

type Modal_ = null | 'format' | 'versions' | 'export' | { section: DocSection };

function DocWorkspace({ p, d, sections, comments }: { p: Project; d: Deliverable; sections: DocSection[]; comments: DocComment[] }) {
  const store = useStore();
  const me = store.myEmail;
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const menu = useMenu();
  const canWrite = canWriteDeliverables(p, me, store.isExec);
  const [title, setTitle] = useState(d.title);
  const [active, setActive] = useState<{ editor: Editor; sectionId: string } | null>(null);
  const [words, setWords] = useState<Record<string, number>>({});
  const [states, setStates] = useState<Record<string, { s: SaveState; info?: string }>>({});
  const [modal, setModal] = useState<Modal_>(null);
  const [showComments, setShowComments] = useState(() => typeof window !== 'undefined' && window.innerWidth > 1240 && comments.some((c) => !c.resolved));
  const [draft, setDraft] = useState<{ sectionId: string; quote: string } | null>(null);
  const flushers = useRef(new Map<string, () => Promise<void>>());

  useEffect(() => setTitle(d.title), [d.title]);
  useEffect(() => {
    document.title = `${d.title} | Workspace`;
  }, [d.title]);

  const nameOf = useCallback((email: string) => memberName(store, email), [store]);
  const onActive = useCallback((editor: Editor, sectionId: string) => setActive({ editor, sectionId }), []);
  const onWords = useCallback((sid: string, n: number) => setWords((w) => (w[sid] === n ? w : { ...w, [sid]: n })), []);
  const onState = useCallback((sid: string, s: SaveState, info?: string) => setStates((m) => ({ ...m, [sid]: { s, info } })), []);
  const registerFlush = useCallback((sid: string, f: (() => Promise<void>) | null) => {
    if (f) flushers.current.set(sid, f);
    else flushers.current.delete(sid);
  }, []);
  const flushAll = useCallback(async () => {
    await Promise.all([...flushers.current.values()].map((f) => f()));
  }, []);

  const wordsOf = (s: DocSection) => words[s.id] ?? s.words ?? 0;
  const total = sections.reduce((n, s) => n + wordsOf(s), 0);
  const list = Object.values(states);
  const overall: SaveState = list.some((x) => x.s === 'conflict') ? 'conflict' : list.some((x) => x.s === 'error') ? 'error' : list.some((x) => x.s === 'saving' || x.s === 'dirty') ? 'saving' : 'saved';
  const errorInfo = list.find((x) => x.s === 'error')?.info;
  const written = sections.some((s) => s.rev > 0);

  // warn before leaving with unsaved text
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (overall !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [overall]);

  // keep the word total on the deliverable (for lists) and move it to Drafting once writing starts
  useEffect(() => {
    if (!canWrite || overall !== 'saved' || d.kind !== 'doc') return;
    const patch: Partial<Deliverable> = {};
    if ((d.words ?? 0) !== total) patch.words = total;
    // starter text from the template does not count as starting; someone has to have saved a change
    if (d.status === 'todo' && total > 0 && written) patch.status = 'drafting';
    if (!Object.keys(patch).length) return;
    const t = window.setTimeout(() => void repo.update(d.id, { ...patch, updatedAt: Date.now(), updatedBy: me }).catch(() => {}), 3000);
    return () => window.clearTimeout(t);
  }, [canWrite, overall, total, written, d.words, d.status, d.id, d.kind, me]);

  const rounds = p.rounds ?? [];
  const round = rounds.find((r) => r.id === d.roundId);
  const due = round?.date || d.dueDate || '';
  const dl = due ? deadlineLabel(due) : null;
  const people = Array.from(new Set([p.leadEmail, ...(p.teamEmails ?? []), d.ownerEmail, me].filter(Boolean)));
  const openComments = comments.filter((c) => !c.resolved);
  const here = usePresence(d.id, me, active?.sectionId);
  const sectionTitle = (sid?: string) => sections.find((s) => s.id === sid)?.title ?? '';
  const writingIn = (email: string) => sections.find((s) => s.lock?.email === email && lockedBy(s, me) === email);
  const issues = useMemo(() => checkDeliverable(d, sections), [d, sections]);
  const update = (patch: Partial<Deliverable>, ok?: string) => run(() => repo.update(d.id, { ...patch, updatedAt: Date.now(), updatedBy: me }), ok);

  const setStatus = async (st: DeliverableStatus) => {
    if (st === d.status) return;
    if (st === 'submitted') {
      const ok = await confirm({
        title: `Mark ${d.title} as submitted?`,
        body: `A copy of what you sent is kept under Versions.${round && !round.done ? ` The deadline "${round.name}" is ticked off too.` : ''}`,
        confirm: 'Mark as submitted',
      });
      if (!ok) return;
      await flushAll();
      const done = await run(async () => {
        if (d.kind === 'doc') await saveVersion(d, sections, 'Submitted', me);
        await repo.update(d.id, { status: st, submittedAt: Date.now(), submittedBy: me, updatedAt: Date.now(), updatedBy: me });
        if (round && !round.done) await saveRounds(p, rounds.map((r) => (r.id === round.id ? { ...r, done: true } : r)), 'ticked off', round.name);
        log('submitted', 'project', p.id, p.title, d.title);
        return true;
      });
      if (done) toast(`${d.title} is marked as submitted`);
      return;
    }
    await update({ status: st });
  };

  const addSection = async () => {
    const order = (sections[sections.length - 1]?.order ?? -1) + 1;
    const sid = await run(() => repo.addSection(d.id, { title: 'New section', order, limit: 0, hint: '', printTitle: true, pageBreakBefore: false, content: docJSON(), words: 0, rev: 0, lock: null }));
    if (sid) setTimeout(() => document.getElementById(`sec-${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
  };

  const moveSection = async (s: DocSection, dir: -1 | 1) => {
    const i = sections.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    const other = sections[j];
    await run(async () => {
      await repo.updateSection(d.id, s.id, { order: other.order });
      await repo.updateSection(d.id, other.id, { order: s.order === other.order ? s.order + dir : s.order });
    });
  };

  const startComment = () => {
    const sel = window.getSelection();
    const node = sel?.anchorNode ?? null;
    const el = node ? ((node instanceof Element ? node : node.parentElement)?.closest('[data-section]') as HTMLElement | null) : null;
    const sectionId = el?.dataset.section ?? active?.sectionId ?? sections[0]?.id ?? '';
    setDraft({ sectionId, quote: (sel?.toString() ?? '').trim().replace(/\s+/g, ' ').slice(0, 300) });
    setShowComments(true);
  };

  const sectionMenu = (s: DocSection, at: HTMLElement) =>
    menu.open(at, [
      { label: 'Section settings', icon: <Settings2 />, onSelect: () => setModal({ section: s }) },
      { label: 'Copy this section', icon: <ClipboardCopy />, onSelect: () => void copySection(s).then(() => toast(`${s.title} copied`), () => toast('Copying failed', { kind: 'error' })) },
      { label: 'Comment on this section', icon: <MessageSquare />, onSelect: () => (setDraft({ sectionId: s.id, quote: '' }), setShowComments(true)) },
      ...(canWrite
        ? [
            { label: 'Move up', icon: <ArrowUp />, disabled: sections[0]?.id === s.id, onSelect: () => void moveSection(s, -1) },
            { label: 'Move down', icon: <ArrowDown />, disabled: sections[sections.length - 1]?.id === s.id, onSelect: () => void moveSection(s, 1) },
            {
              label: 'Delete section',
              icon: <Trash2 />,
              danger: true,
              divider: true,
              onSelect: async () => {
                if (await confirm({ title: `Delete "${s.title}"?`, body: 'Its text is deleted for everyone. Save a version first if you might want it back.', confirm: 'Delete section', danger: true }))
                  await run(() => repo.removeSection(d.id, s.id), 'Section deleted');
              },
            },
          ]
        : []),
    ]);

  const f = d.format;
  const paper = PAPER[f.paper];
  const paperStyle = {
    ['--doc-w' as string]: `${paper.w}in`,
    ['--doc-margin' as string]: `${f.margin}in`,
    ['--doc-font' as string]: cssFont(f.font),
    ['--doc-size' as string]: `${f.size}pt`,
    ['--doc-lh' as string]: String(f.lineHeight * 1.15),
    ['--doc-gap' as string]: `${paraGapEm(f)}em`,
    ['--doc-secgap' as string]: f.lineHeight >= 1.5 ? '0px' : '0.8em',
  };

  return (
    <div className="page doc-page">
      <Link to={`/app/competitions/${p.id}?tab=deliverables`} className="crumb">
        <ArrowLeft size={15} /> {p.title}
      </Link>

      <header className="doc-head">
        <div className="doc-head-main">
          {canWrite ? (
            <input
              className="doc-title"
              value={title}
              aria-label="Title"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== d.title && void update({ title: title.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1 className="doc-title">{d.title}</h1>
          )}
          <div className="doc-meta">
            <label className="doc-meta-item">
              <span className="sr-only">Status</span>
              <select className={`select select-sm status-${d.status}`} value={d.status} disabled={!canWrite} onChange={(e) => void setStatus(e.target.value as DeliverableStatus)} aria-label="Status">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="doc-meta-item">
              <span className="sr-only">Due</span>
              <select
                className="select select-sm"
                aria-label="Due for"
                disabled={!canWrite}
                value={d.roundId ? `r:${d.roundId}` : 'own'}
                onChange={(e) => void update(e.target.value === 'own' ? { roundId: '' } : { roundId: e.target.value.slice(2) })}
              >
                {rounds.map((r) => (
                  <option key={r.id} value={`r:${r.id}`}>
                    {r.name}
                    {r.date ? `, ${fmtDate(r.date, 'd MMM')}` : ''}
                  </option>
                ))}
                <option value="own">Own date</option>
              </select>
            </label>
            {!d.roundId && <input className="input input-sm" type="date" value={d.dueDate ?? ''} disabled={!canWrite} onChange={(e) => void update({ dueDate: e.target.value })} aria-label="Due date" />}
            {dl && d.status !== 'submitted' && <span className={`chip ${dl.tone}`}>{dl.text}</span>}
            <label className="doc-meta-item doc-owner">
              <Avatar member={store.memberMap.get(d.ownerEmail)} email={d.ownerEmail} size={22} />
              <select className="select select-sm" value={d.ownerEmail} disabled={!canWrite} onChange={(e) => void update({ ownerEmail: e.target.value })} aria-label="Person in charge">
                {people.map((e) => (
                  <option key={e} value={e}>
                    {nameOf(e)}
                  </option>
                ))}
              </select>
            </label>
            {d.kind === 'doc' && (
              <span className="doc-words">
                {total} {total === 1 ? 'word' : 'words'}
              </span>
            )}
            {d.kind === 'doc' && canWrite && (
              <span className={`doc-saved ${overall}`} role="status" title={errorInfo}>
                {overall === 'saved' ? (
                  <>
                    <Check size={14} /> Saved
                  </>
                ) : overall === 'saving' ? (
                  'Saving...'
                ) : overall === 'conflict' ? (
                  'Pick a version below'
                ) : (
                  errorInfo || 'Not saved'
                )}
              </span>
            )}
          </div>
        </div>
        <div className="doc-head-actions">
          {here.length > 0 && <HereNow people={here} nameOf={nameOf} sectionTitle={sectionTitle} writingIn={writingIn} />}
          {d.kind === 'doc' && (
            <>
              <button className={`btn ${showComments ? 'is-on' : ''}`} onClick={() => setShowComments((v) => !v)} aria-pressed={showComments}>
                <MessageSquare /> <span className="hide-sm">Comments</span>
                {openComments.length > 0 && <span className="count">{openComments.length}</span>}
              </button>
              <button className="btn" onClick={() => setModal('versions')}>
                <History /> <span className="hide-sm">Versions</span>
              </button>
              <button className="btn" onClick={() => setModal('format')}>
                <Settings2 /> <span className="hide-sm">Format</span>
              </button>
              <button className="btn btn-primary" onClick={() => void flushAll().then(() => setModal('export'))}>
                <Download /> Export
              </button>
            </>
          )}
          <button
            className="btn btn-icon"
            aria-label="More"
            onClick={(e) =>
              menu.open(e.currentTarget, [
                ...(d.kind === 'doc' ? [{ label: 'Copy all text', icon: <ClipboardCopy />, onSelect: () => void flushAll().then(() => copyAll(sections)).then(() => toast('Copied. Paste it into Google Docs, Word or a form.'), () => toast('Copying failed', { kind: 'error' })) }] : []),
                ...(store.isExec || p.leadEmail === me
                  ? [
                      {
                        label: 'Delete deliverable',
                        icon: <Trash2 />,
                        danger: true,
                        onSelect: async () => {
                          if (!(await confirm({ title: `Delete ${d.title}?`, body: 'The document, its comments and saved versions are deleted for everyone.', confirm: 'Delete', danger: true }))) return;
                          const ok = await run(async () => (await repo.remove(d.id), true), 'Deliverable deleted');
                          if (ok) nav(`/app/competitions/${p.id}?tab=deliverables`);
                        },
                      },
                    ]
                  : []),
              ])
            }
          >
            <MoreHorizontal />
          </button>
        </div>
      </header>

      {d.status === 'submitted' && (
        <p className="doc-banner good">
          <CheckCircle2 size={16} /> Submitted {d.submittedAt ? fmtDate(new Date(d.submittedAt).toISOString().slice(0, 10), 'd MMM yyyy') : ''}
          {d.submittedBy ? ` by ${nameOf(d.submittedBy)}` : ''}. {d.kind === 'doc' ? 'Changes made now are not part of what was sent. The submitted copy is under Versions.' : ''}
        </p>
      )}

      {d.instructions ? (
        <details className="doc-brief" open={total === 0 && d.kind === 'doc'}>
          <summary>What the competition asks for</summary>
          <div className="prose">{d.instructions}</div>
        </details>
      ) : null}

      {d.kind === 'file' ? (
        <FilePanel d={d} canWrite={canWrite} onSave={(link) => update({ link }, 'Link saved')} />
      ) : (
        <div className={`doc-layout ${showComments ? 'with-comments' : ''}`}>
          <nav className="doc-outline" aria-label="Sections">
            <p className="doc-outline-head">Sections</p>
            <ol>
              {sections.map((s) => {
                const w = wordsOf(s);
                const over = !!s.limit && w > s.limit;
                const n = openComments.filter((c) => c.sectionId === s.id).length;
                return (
                  <li key={s.id}>
                    <button onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className={over ? 'over' : w ? 'has' : ''}>
                      <span className="ellipsis">{s.title}</span>
                      <span className="doc-outline-n">
                        {n > 0 && (
                          <span className="doc-outline-c" aria-label={`${n} comments`}>
                            <MessageSquare size={11} />
                            {n}
                          </span>
                        )}
                        {s.limit ? `${w}/${s.limit}` : w}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {canWrite && (
              <button className="btn btn-ghost btn-sm" onClick={() => void addSection()}>
                <Plus /> Add section
              </button>
            )}
            {issues.some((i) => i.level === 'error') && (
              <p className="doc-outline-warn">
                <AlertTriangle size={13} /> {issues.filter((i) => i.level === 'error').length} to fix before export
              </p>
            )}
          </nav>

          <div className="doc-center">
            <Toolbar editor={active?.editor ?? null} rules={d.rules} onComment={startComment} canWrite={canWrite} />
            <div className="doc-paper" style={paperStyle}>
              {sections.length === 0 && <Empty title="No sections yet">{canWrite ? 'Add one to start writing.' : null}</Empty>}
              {sections.map((s, i) => {
                const w = wordsOf(s);
                const over = !!s.limit && w > s.limit;
                const st = states[s.id]?.s;
                const n = openComments.filter((c) => c.sectionId === s.id).length;
                return (
                  <section key={s.id} id={`sec-${s.id}`} className={`dsec ${active?.sectionId === s.id ? 'is-active' : ''}`} data-section={s.id}>
                    {s.pageBreakBefore && i > 0 && (
                      <div className="dsec-break" aria-label="Page break">
                        <span>New page</span>
                      </div>
                    )}
                    <div className="dsec-bar">
                      <button className="dsec-name" onClick={() => setModal({ section: s })} title="Section settings">
                        {s.title}
                      </button>
                      <span className={`dsec-words ${over ? 'over' : ''}`} title={s.limit ? `Limit ${s.limit} words` : undefined}>
                        {w}
                        {s.limit ? ` / ${s.limit}` : ''} words
                      </span>
                      {s.writerEmail && <Avatar member={store.memberMap.get(s.writerEmail)} email={s.writerEmail} size={20} title={`Written by ${nameOf(s.writerEmail)}`} />}
                      {st === 'saving' && <span className="dsec-state">Saving</span>}
                      {st === 'error' && <span className="dsec-state bad">Not saved</span>}
                      {here
                        .filter((x) => x.sectionId === s.id)
                        .map((x) => (
                          <span key={x.email} className="dsec-here" title={`${nameOf(x.email)} ${s.lock?.email === x.email && lockedBy(s, me) ? 'is writing here' : 'is looking at this section'}`}>
                            <Avatar member={store.memberMap.get(x.email)} email={x.email} size={20} />
                          </span>
                        ))}
                      <span className="spacer" />
                      {n > 0 && (
                        <button className="dsec-c" onClick={() => setShowComments(true)} aria-label={`${n} open comments`}>
                          <MessageSquare size={13} /> {n}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-icon btn-xs" aria-label={`${s.title} options`} onClick={(e) => sectionMenu(s, e.currentTarget)}>
                        <MoreHorizontal />
                      </button>
                    </div>
                    {s.printTitle && <h2 className="dsec-title">{s.title}</h2>}
                    <SectionEditor
                      deliverableId={d.id}
                      section={s}
                      me={me}
                      canWrite={canWrite}
                      nameOf={nameOf}
                      onActive={onActive}
                      onWords={onWords}
                      onState={onState}
                      registerFlush={registerFlush}
                    />
                  </section>
                );
              })}
              {canWrite && sections.length > 0 && (
                <button className="doc-add" onClick={() => void addSection()}>
                  <Plus /> Add a section
                </button>
              )}
            </div>
            {!canWrite && <p className="small muted doc-readonly">You can read and comment. The competition team and the exec team edit it.</p>}
          </div>

          {showComments && (
            <CommentsPanel
              d={d}
              sections={sections}
              comments={comments}
              draft={draft}
              setDraft={setDraft}
              canWrite={canWrite}
              onClose={() => setShowComments(false)}
            />
          )}
        </div>
      )}

      {modal === 'format' && <FormatModal d={d} canWrite={canWrite} onClose={() => setModal(null)} />}
      {modal === 'versions' && <VersionsModal d={d} sections={sections} canWrite={canWrite} flushAll={flushAll} onClose={() => setModal(null)} />}
      {modal === 'export' && <ExportModal d={d} sections={sections} issues={issues} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <SectionModal d={d} s={modal.section} people={people} canWrite={canWrite} onClose={() => setModal(null)} />}
      {menu.node}
    </div>
  );
}

/* ---------- file deliverables ---------- */

function FilePanel({ d, canWrite, onSave }: { d: Deliverable; canWrite: boolean; onSave: (link: string) => void }) {
  const [link, setLink] = useState(d.link ?? '');
  useEffect(() => setLink(d.link ?? ''), [d.link]);
  const valid = /^https?:\/\/\S+$/.test(link.trim());
  return (
    <section className="panel doc-file">
      <div className="panel-head">
        <h2 className="h3">
          <FileText size={17} /> The file
        </h2>
      </div>
      <div className="panel-body">
        <p className="small muted" style={{ marginBottom: 10 }}>
          Put the file in Google Drive (or wherever the team keeps it), share it with the team, and paste the link here so everyone opens the same one.
        </p>
        <form
          className="doc-file-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid || !link.trim()) onSave(link.trim());
          }}
        >
          <input className="input" value={link} disabled={!canWrite} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/..." aria-label="Link to the file" />
          {canWrite && (
            <button className="btn" type="submit" disabled={link.trim() === (d.link ?? '') || (!!link.trim() && !valid)}>
              Save
            </button>
          )}
          {d.link && (
            <a className="btn btn-primary" href={d.link} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          )}
        </form>
        {!!link.trim() && !valid && <p className="small neg">Paste the full link, starting with https://</p>}
      </div>
    </section>
  );
}

/* ---------- comments ---------- */

function CommentsPanel({
  d,
  sections,
  comments,
  draft,
  setDraft,
  canWrite,
  onClose,
}: {
  d: Deliverable;
  sections: DocSection[];
  comments: DocComment[];
  draft: { sectionId: string; quote: string } | null;
  setDraft: (v: { sectionId: string; quote: string } | null) => void;
  canWrite: boolean;
  onClose: () => void;
}) {
  const store = useStore();
  const run = useRun();
  const [body, setBody] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const title = (sid: string) => sections.find((s) => s.id === sid)?.title ?? 'Removed section';
  const shown = comments.filter((c) => (showResolved ? c.resolved : !c.resolved)).sort((a, b) => sections.findIndex((s) => s.id === a.sectionId) - sections.findIndex((s) => s.id === b.sectionId) || a.at - b.at);
  const post = async () => {
    if (!draft || !body.trim()) return;
    const ok = await run(async () => (await repo.addComment(d.id, { sectionId: draft.sectionId, quote: draft.quote || '', body: body.trim(), by: store.myEmail, at: Date.now() }), true));
    if (ok) {
      setBody('');
      setDraft(null);
    }
  };
  return (
    <aside className="doc-comments" aria-label="Comments">
      <div className="doc-comments-head">
        <strong>Comments</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? 'Show open' : `Resolved (${comments.filter((c) => c.resolved).length})`}
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close comments">
          <X />
        </button>
      </div>
      {draft ? (
        <form
          className="doc-comment new"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <select className="select select-sm" value={draft.sectionId} onChange={(e) => setDraft({ ...draft, sectionId: e.target.value })} aria-label="Section">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          {draft.quote && <blockquote>{draft.quote}</blockquote>}
          <textarea className="textarea" autoFocus value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should change?" rows={3} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void post()} />
          <div className="doc-comment-actions">
            <button className="btn btn-sm" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button className="btn btn-sm btn-primary" type="submit" disabled={!body.trim()}>
              Comment
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-sm doc-comments-add" onClick={() => setDraft({ sectionId: sections[0]?.id ?? '', quote: '' })} disabled={!sections.length}>
          <Plus /> Add a comment
        </button>
      )}
      {!shown.length && !draft && <p className="small muted doc-comments-empty">{showResolved ? 'Nothing resolved yet.' : 'No open comments. Select some text and press Comment to ask about it.'}</p>}
      {shown.map((c) => (
        <article key={c.id} className={`doc-comment ${c.resolved ? 'is-resolved' : ''}`}>
          <button className="doc-comment-sec" onClick={() => document.getElementById(`sec-${c.sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {title(c.sectionId)}
          </button>
          {c.quote && <blockquote>{c.quote}</blockquote>}
          <p>{c.body}</p>
          <footer>
            <Avatar member={store.memberMap.get(c.by)} email={c.by} size={18} />
            <span className="small">{memberName(store, c.by)}</span>
            <span className="small faint">{ago(c.at)}</span>
            <span className="spacer" />
            {(canWrite || c.by === store.myEmail) && (
              <button className="btn btn-ghost btn-xs" onClick={() => void run(() => repo.updateComment(d.id, c.id, c.resolved ? { resolved: false } : { resolved: true, resolvedBy: store.myEmail }))}>
                {c.resolved ? 'Reopen' : 'Resolve'}
              </button>
            )}
            {(store.isExec || c.by === store.myEmail) && (
              <button className="btn btn-ghost btn-icon btn-xs" aria-label="Delete comment" onClick={() => void run(() => repo.removeComment(d.id, c.id))}>
                <Trash2 />
              </button>
            )}
          </footer>
        </article>
      ))}
    </aside>
  );
}

/* ---------- format ---------- */

function FormatModal({ d, canWrite, onClose }: { d: Deliverable; canWrite: boolean; onClose: () => void }) {
  const run = useRun();
  const store = useStore();
  const [f, setF] = useState<DocFormat>(d.format);
  const [rules, setRules] = useState<DocRules>(d.rules ?? {});
  const [instructions, setInstructions] = useState(d.instructions ?? '');
  const set = <K extends keyof DocFormat>(k: K, v: DocFormat[K]) => setF((x) => ({ ...x, [k]: v }));
  const preset = (Object.keys(DOC_FORMATS) as (keyof typeof DOC_FORMATS)[]).find((k) => JSON.stringify({ ...DOC_FORMATS[k], pageNumbers: !!f.pageNumbers }) === JSON.stringify({ ...f, pageNumbers: !!f.pageNumbers }));
  return (
    <Modal
      title="Format and rules"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {canWrite ? 'Cancel' : 'Close'}
          </button>
          {canWrite && (
            <button
              className="btn btn-primary"
              onClick={async () => {
                const ok = await run(async () => (await repo.update(d.id, { format: f, rules, instructions, updatedAt: Date.now(), updatedBy: store.myEmail }), true), 'Format saved');
                if (ok) onClose();
              }}
            >
              Save
            </button>
          )}
        </>
      }
    >
      <div className="form-grid">
        <div className="field full">
          <span>Start from</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" aria-pressed={preset === 'wharton'} disabled={!canWrite} onClick={() => setF({ ...DOC_FORMATS.wharton, pageNumbers: f.pageNumbers })}>
              Times New Roman 12, double, Letter
            </button>
            <button type="button" className="btn btn-sm" aria-pressed={preset === 'standard'} disabled={!canWrite} onClick={() => setF({ ...DOC_FORMATS.standard, pageNumbers: f.pageNumbers })}>
              Arial 11, 1.15, A4
            </button>
          </div>
        </div>
        <Field label="Font">
          <select className="select" value={f.font} disabled={!canWrite} onChange={(e) => set('font', e.target.value as DocFormat['font'])}>
            {FONTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <select className="select" value={f.size} disabled={!canWrite} onChange={(e) => set('size', Number(e.target.value))}>
            {[10, 10.5, 11, 12, 13, 14].map((x) => (
              <option key={x} value={x}>
                {x} pt
              </option>
            ))}
          </select>
        </Field>
        <Field label="Line spacing">
          <select className="select" value={f.lineHeight} disabled={!canWrite} onChange={(e) => set('lineHeight', Number(e.target.value))}>
            {LINE_HEIGHTS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Margins">
          <select className="select" value={f.margin} disabled={!canWrite} onChange={(e) => set('margin', Number(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5].map((x) => (
              <option key={x} value={x}>
                {x} inch{x === 1 ? '' : 'es'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paper">
          <select className="select" value={f.paper} disabled={!canWrite} onChange={(e) => set('paper', e.target.value as DocFormat['paper'])}>
            <option value="letter">{PAPER.letter.label}</option>
            <option value="a4">{PAPER.a4.label}</option>
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={!!f.pageNumbers} disabled={!canWrite} onChange={(e) => set('pageNumbers', e.target.checked)} />
          Page numbers
        </label>
        <div className="field full">
          <span>Not allowed in this document</span>
          <div className="perm-list">
            {(
              [
                ['noImages', 'Images and charts'],
                ['noLinks', 'Links'],
                ['noTables', 'Tables'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={!!rules[k]} disabled={!canWrite} onChange={(e) => setRules((r) => ({ ...r, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
          <small className="hint">The buttons for these are hidden and Export warns if any are left in.</small>
        </div>
        <Field label="Largest file allowed (MB)">
          <input className="input" type="number" min={0} step={0.5} value={rules.maxMB ?? ''} disabled={!canWrite} onChange={(e) => setRules((r) => ({ ...r, maxMB: e.target.value ? Number(e.target.value) : undefined }))} placeholder="No limit" />
        </Field>
        <Field label="What the competition asks for" className="full">
          <textarea className="textarea" rows={6} value={instructions} disabled={!canWrite} onChange={(e) => setInstructions(e.target.value)} placeholder="Paste the official instructions so the team writes to them." />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------- section settings ---------- */

function SectionModal({ d, s, people, canWrite, onClose }: { d: Deliverable; s: DocSection; people: string[]; canWrite: boolean; onClose: () => void }) {
  const run = useRun();
  const store = useStore();
  const [f, setF] = useState({ title: s.title, limit: s.limit ?? 0, hint: s.hint ?? '', writerEmail: s.writerEmail ?? '', printTitle: !!s.printTitle, pageBreakBefore: !!s.pageBreakBefore });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title="Section"
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {canWrite ? 'Cancel' : 'Close'}
          </button>
          {canWrite && (
            <button
              className="btn btn-primary"
              disabled={!f.title.trim()}
              onClick={async () => {
                const ok = await run(async () => (await repo.updateSection(d.id, s.id, { ...f, title: f.title.trim(), limit: Math.max(0, Math.round(f.limit || 0)) }), true));
                if (ok) onClose();
              }}
            >
              Save
            </button>
          )}
        </>
      }
    >
      <div className="form-grid">
        <Field label="Title" className="full">
          <input className="input" value={f.title} disabled={!canWrite} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Word limit" hint="0 means no limit">
          <input className="input" type="number" min={0} value={f.limit} disabled={!canWrite} onChange={(e) => set('limit', Number(e.target.value))} />
        </Field>
        <Field label="Who writes it">
          <select className="select" value={f.writerEmail} disabled={!canWrite} onChange={(e) => set('writerEmail', e.target.value)}>
            <option value="">Anyone</option>
            {people.map((e) => (
              <option key={e} value={e}>
                {memberName(store, e)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note for the writer" className="full" hint="Shown while the section is empty. Not exported.">
          <textarea className="textarea" rows={3} value={f.hint} disabled={!canWrite} onChange={(e) => set('hint', e.target.value)} />
        </Field>
        <label className="check full">
          <input type="checkbox" checked={f.printTitle} disabled={!canWrite} onChange={(e) => set('printTitle', e.target.checked)} />
          Show the title as a heading in the document
        </label>
        <label className="check full">
          <input type="checkbox" checked={f.pageBreakBefore} disabled={!canWrite} onChange={(e) => set('pageBreakBefore', e.target.checked)} />
          Start this section on a new page
        </label>
      </div>
    </Modal>
  );
}

/* ---------- versions ---------- */

function VersionsModal({ d, sections, canWrite, flushAll, onClose }: { d: Deliverable; sections: DocSection[]; canWrite: boolean; flushAll: () => Promise<void>; onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const confirm = useConfirm();
  const [list, setList] = useState<DocVersion[] | null>(null);
  const [label, setLabel] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    repo.versions(d.id).then(setList, () => setList([]));
  }, [d.id]);
  useEffect(load, [load]);
  return (
    <Modal title="Versions" size="wide" onClose={onClose}>
      {canWrite && (
        <form
          className="doc-version-new"
          onSubmit={async (e) => {
            e.preventDefault();
            await flushAll();
            const ok = await run(async () => (await saveVersion(d, sections, label.trim() || `Saved ${new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, store.myEmail), true), 'Version saved');
            if (ok) {
              setLabel('');
              load();
            }
          }}
        >
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this version, e.g. Draft for Mr Billy" aria-label="Version name" />
          <button className="btn btn-primary" type="submit">
            Save current version
          </button>
        </form>
      )}
      <p className="small muted" style={{ margin: '10px 0 14px' }}>
        A version is a copy of every section at that moment. One is saved automatically when the deliverable is marked as submitted and before an old version is restored.
      </p>
      {list === null ? (
        <p className="muted">Loading...</p>
      ) : !list.length ? (
        <Empty title="No versions yet">Save one before big changes, or before sending it to someone to check.</Empty>
      ) : (
        <ul className="list doc-versions">
          {list.map((v) => (
            <li key={v.id}>
              <div className="doc-version">
                <span className="row-main">
                  <span className="title">{v.label}</span>
                  <span className="small faint">
                    {memberName(store, v.by)}, {new Date(v.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}, {v.sections.reduce((n, s) => n + (s.words || 0), 0)} words
                  </span>
                </span>
                <button className="btn btn-sm btn-ghost" onClick={() => setOpen(open === v.id ? null : v.id)}>
                  {open === v.id ? 'Hide' : 'View'}
                </button>
                {canWrite && (
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!(await confirm({ title: `Restore "${v.label}"?`, body: 'Every section goes back to this version. What is there now is saved as a version first, so nothing is lost.', confirm: 'Restore' }))) return;
                      await flushAll();
                      const ok = await run(async () => (await restoreVersion(d, sections, v, store.myEmail), true), 'Version restored');
                      if (ok) onClose();
                    }}
                  >
                    Restore
                  </button>
                )}
              </div>
              {open === v.id && <VersionPreview v={v} />}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function VersionPreview({ v }: { v: DocVersion }) {
  const html = useMemo(() => deliverableHTML(v.sections.map((s, i) => ({ ...s, id: String(i), rev: 0 }))), [v]);
  // built by our own escaping converter, never raw user HTML
  return <div className="doc-version-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- export ---------- */

function ExportModal({ d, sections, issues, onClose }: { d: Deliverable; sections: DocSection[]; issues: DocIssue[]; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'' | 'pdf' | 'docx'>('');
  const [result, setResult] = useState('');
  const f = d.format;
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const maxMB = d.rules?.maxMB;
  const jump = (sid?: string) => {
    onClose();
    if (sid) setTimeout(() => document.getElementById(`sec-${sid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const go = async (kind: 'pdf' | 'docx') => {
    setBusy(kind);
    setResult('');
    try {
      if (kind === 'pdf') {
        const r = await downloadPDF(d, sections);
        const mb = r.bytes / 1024 / 1024;
        setResult(`PDF downloaded, ${mb < 0.1 ? `${Math.max(1, Math.round(r.bytes / 1024))} KB` : `${mb.toFixed(1)} MB`}.${maxMB && mb > maxMB ? ` That is over the ${maxMB} MB limit: use smaller images.` : ''}${r.font === 'Roboto' ? ' The text has letters Times and Arial cannot show in a PDF, so it uses Roboto.' : ''}`);
      } else {
        const bytes = await downloadDocx(d, sections);
        setResult(`Word file downloaded, ${Math.max(1, Math.round(bytes / 1024))} KB. It opens in Word and Google Docs.`);
      }
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, { kind: 'error' });
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal title="Export" onClose={onClose}>
      <p className="small muted" style={{ marginBottom: 12 }}>
        {f.font} {f.size} pt, {LINE_HEIGHTS.find((x) => x.value === f.lineHeight)?.label.toLowerCase() ?? f.lineHeight} spacing, {f.margin} inch margins, {PAPER[f.paper].label}
        {f.pageNumbers ? ', page numbers' : ''}. Change it under Format.
      </p>
      {issues.length > 0 ? (
        <ul className="doc-issues">
          {[...errors, ...warns].map((i, k) => (
            <li key={k} className={i.level}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{i.text}</span>
              {i.sectionId && (
                <button className="btn btn-ghost btn-xs" onClick={() => jump(i.sectionId)}>
                  Go there
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="doc-issues-ok">
          <CheckCircle2 size={16} /> Word limits and rules are all met.
        </p>
      )}
      <div className="doc-export-grid">
        <button className={`doc-export ${busy === 'pdf' ? 'is-busy' : ''}`} disabled={!!busy} onClick={() => void go('pdf')}>
          <Download />
          <strong>PDF</strong>
          <span>To submit. Times New Roman documents use Times, which has the same letter shapes and spacing.</span>
        </button>
        <button className={`doc-export ${busy === 'docx' ? 'is-busy' : ''}`} disabled={!!busy} onClick={() => void go('docx')}>
          <FileText />
          <strong>Word (.docx)</strong>
          <span>To keep editing in Word or Google Docs, or if the form asks for Word.</span>
        </button>
        <button
          className="doc-export"
          onClick={() =>
            void copyAll(sections).then(
              () => setResult('Copied. Paste it into Google Docs, Word or a submission form.'),
              () => toast('Copying failed', { kind: 'error' }),
            )
          }
        >
          <ClipboardCopy />
          <strong>Copy text</strong>
          <span>For forms like SurveyMonkey. Each section also has its own Copy in its menu.</span>
        </button>
        <button
          className="doc-export"
          onClick={() => {
            try {
              printDeliverable(d, sections);
            } catch (e) {
              toast((e as Error).message, { kind: 'error' });
            }
          }}
        >
          <Printer />
          <strong>Print</strong>
          <span>On paper. In the print box, turn off Headers and footers.</span>
        </button>
      </div>
      {result && (
        <p className="doc-export-result" role="status">
          <Check size={15} /> {result}
        </p>
      )}
    </Modal>
  );
}

/* ---------- who else has it open ---------- */

function HereNow({ people, nameOf, sectionTitle, writingIn }: { people: Presence[]; nameOf: (e: string) => string; sectionTitle: (sid?: string) => string; writingIn: (e: string) => DocSection | undefined }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const shown = people.slice(0, 4);
  const line = (p: Presence) => {
    const w = writingIn(p.email);
    return w ? `writing in ${w.title}` : p.sectionId && sectionTitle(p.sectionId) ? `in ${sectionTitle(p.sectionId)}` : 'reading';
  };
  return (
    <div className="here-now" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="here-faces"
        aria-expanded={open}
        aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'} here: ${people.map((p) => nameOf(p.email)).join(', ')}`}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
      >
        {shown.map((p) => (
          <span key={p.email} className={`here-face ${writingIn(p.email) ? 'writing' : ''}`}>
            <Avatar member={store.memberMap.get(p.email)} email={p.email} size={30} title={`${nameOf(p.email)}, ${line(p)}`} />
          </span>
        ))}
        {people.length > 4 && <span className="here-more">+{people.length - 4}</span>}
      </button>
      {open && (
        <div className="here-pop" role="status">
          <strong>Here now</strong>
          {people.map((p) => (
            <span key={p.email} className="here-row">
              <Avatar member={store.memberMap.get(p.email)} email={p.email} size={22} />
              <span className="ellipsis">{nameOf(p.email)}</span>
              <span className="small faint">{line(p)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
