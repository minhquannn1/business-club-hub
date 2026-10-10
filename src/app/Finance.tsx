import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Download, MoreHorizontal, Pencil, Plus, Table2, Trash2, Upload, Wallet } from 'lucide-react';
import { useStore, memberName } from '../lib/store';
import { createSheet, deleteSheet, importEvents, updateSheet, type ImportedEvent } from '../lib/actions';
import { fmtDate, money } from '../lib/format';
import { useLedger, useWorkbook } from '../lib/workbook';
import { colToLetters, isErr, offsetAllRows, FUNCTIONS } from '../lib/formula';
import type { Sheet } from '../lib/types';
import { Empty, Field, Modal, Seg, useConfirm, useMenu, useRun } from '../components/ui';
import { PageHead } from './Shell';
import { EmptyArt } from '../components/Art';
import { SheetGrid } from './SheetGrid';
import { LedgerEntryForm } from './ledgerEntry';

export function FinancePage() {
  const { sheetId } = useParams();
  const store = useStore();
  const sheet = sheetId ? store.sheets.find((s) => s.id === sheetId) : undefined;
  const [newSheet, setNewSheet] = useState(false);
  const [entry, setEntry] = useState<'in' | 'out' | null>(null);
  const [help, setHelp] = useState(false);
  const [renaming, setRenaming] = useState<Sheet | null>(null);
  const [importing, setImporting] = useState(false);
  const wb = useWorkbook();
  const run = useRun();
  const confirm = useConfirm();
  const menu = useMenu();
  const nav = useNavigate();

  const exportXlsx = async () => {
    await run(async () => {
      const XLSX = await import('xlsx');
      const book = XLSX.utils.book_new();
      store.sheets.forEach((s, si) => {
        const rows = store.rows.get(s.id) ?? [];
        const aoa: unknown[][] = [s.columns.map((c, i) => c.name || colToLetters(i))];
        rows.forEach((row, r) => {
          aoa.push(
            s.columns.map((c, ci) => {
              const raw = row.cells?.[c.key] ?? '';
              const v = wb.evaluator.value(si, r, ci);
              const shown = isErr(v) ? v.code : c.type === 'project' && typeof v === 'string' ? store.projectMap.get(v)?.title ?? v : c.type === 'member' && typeof v === 'string' ? memberName(store, v) : v;
              if (raw.startsWith('=')) return { f: offsetAllRows(raw, 1).slice(1), v: shown ?? '', t: typeof shown === 'number' ? 'n' : 's' };
              return shown ?? '';
            }),
          );
        });
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!cols'] = s.columns.map((c) => ({ wpx: c.width }));
        XLSX.utils.book_append_sheet(book, ws, s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
      });
      XLSX.writeFile(book, `${store.site.shortName || 'Club'} finance ${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  const sheetMenu = (el: HTMLElement, s: Sheet) =>
    menu.open(el, [
      { label: 'Rename', icon: <Pencil />, onSelect: () => setRenaming(s) },
      {
        label: 'Delete sheet',
        icon: <Trash2 />,
        danger: true,
        onSelect: async () => {
          const n = (store.rows.get(s.id) ?? []).filter((r) => Object.values(r.cells ?? {}).some(Boolean)).length;
          if (await confirm({ title: `Delete ${s.name}?`, body: `${n} rows with data will be deleted for everyone.${s.isLedger ? ' Finance totals and project budgets stop counting it.' : ''} This can't be undone.`, confirm: 'Delete sheet', danger: true })) {
            await run(() => deleteSheet(s), 'Sheet deleted');
            nav('/app/finance');
          }
        },
      },
    ]);

  return (
    <div className={`page ${sheet ? 'page-full' : ''}`} style={sheet ? { paddingBottom: 16 } : undefined}>
      <PageHead
        title="Finance"
        sub={sheet ? undefined : "The club's money: one ledger everyone can read. Only the people in charge of money edit it."}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setHelp(true)}>
              <BookOpen /> Formulas
            </button>
            {store.canFinance && !sheet && (
              <button className="btn btn-ghost" onClick={() => setImporting(true)}>
                <Upload /> Import events
              </button>
            )}
            {store.sheets.length > 0 && (
              <button className="btn" onClick={exportXlsx}>
                <Download /> Export to Excel
              </button>
            )}
            {store.canFinance && !sheet && store.sheets.some((s) => s.isLedger) && (
              <button className="btn btn-primary" onClick={() => setEntry('out')}>
                <Plus /> Record expense
              </button>
            )}
          </>
        }
      />
      <div className="sheet-tabs" role="tablist" aria-label="Finance sheets">
        <NavLink to="/app/finance" end className={({ isActive }) => `sheet-tab ${isActive ? 'active' : ''}`}>
          <Wallet /> Summary
        </NavLink>
        {store.sheets.map((s) => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <NavLink to={`/app/finance/${s.id}`} className={({ isActive }) => `sheet-tab ${isActive ? 'active' : ''}`} onContextMenu={(e) => store.canFinance && (e.preventDefault(), sheetMenu(e.currentTarget, s))}>
              <Table2 /> {s.name}
              {store.canFinance && sheet?.id === s.id && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.name} options`}
                  className="btn btn-ghost btn-sm btn-icon"
                  style={{ width: 22, height: 22, marginRight: -6 }}
                  onClick={(e) => {
                    e.preventDefault();
                    sheetMenu(e.currentTarget, s);
                  }}
                >
                  <MoreHorizontal />
                </span>
              )}
            </NavLink>
          </span>
        ))}
        {store.canFinance && (
          <button className="sheet-tab" onClick={() => setNewSheet(true)} aria-label="New sheet">
            <Plus /> Sheet
          </button>
        )}
      </div>

      {sheetId && !sheet ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <Empty title={store.ready ? 'This sheet no longer exists' : 'Loading...'} />
        </div>
      ) : sheet ? (
        <SheetGrid sheet={sheet} onRecord={(d) => setEntry(d)} />
      ) : (
        <Summary onNewLedger={() => setNewSheet(true)} onRecord={(d) => setEntry(d)} />
      )}

      {newSheet && <NewSheetModal onClose={() => setNewSheet(false)} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {entry && <LedgerEntryForm direction={entry} onClose={() => setEntry(null)} />}
      {help && <FormulaHelp onClose={() => setHelp(false)} />}
      {renaming && <RenameSheet sheet={renaming} onClose={() => setRenaming(null)} />}
      {menu.node}
    </div>
  );
}

function Summary({ onNewLedger, onRecord }: { onNewLedger: () => void; onRecord: (d: 'in' | 'out') => void }) {
  const store = useStore();
  const { entries, income, expense, balance } = useLedger();
  const hasLedger = store.sheets.some((s) => s.isLedger);

  const byProject = useMemo(() => {
    const m = new Map<string, { spent: number; raised: number }>();
    for (const e of entries) {
      const k = e.projectId || '';
      if (!m.has(k)) m.set(k, { spent: 0, raised: 0 });
      const x = m.get(k)!;
      if (e.direction === 'out') x.spent += e.amount;
      else x.raised += e.amount;
    }
    return [...m.entries()].sort((a, b) => b[1].spent - a[1].spent);
  }, [entries]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.direction === 'out') m.set(e.category || 'Uncategorised', (m.get(e.category || 'Uncategorised') ?? 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const recent = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
  const maxProj = Math.max(1, ...byProject.map(([k, v]) => Math.max(v.spent, store.projectMap.get(k)?.budgetPlanned ?? 0)));
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v));

  if (!hasLedger)
    return (
      <div className="panel" style={{ marginTop: 16 }}>
        <Empty art={<EmptyArt.money />}
          title="No ledger yet"
          action={
            store.canFinance ? (
              <button className="btn btn-primary" onClick={onNewLedger}>
                <Plus /> Create the club ledger
              </button>
            ) : undefined
          }
        >
          {store.canFinance
            ? 'The ledger is a spreadsheet where every payment in or out gets a row: date, what for, which project, how much, and a photo of the receipt. Totals and project budgets update from it.'
            : 'Nobody has set up the ledger yet.'}
        </Empty>
      </div>
    );

  return (
    <div style={{ marginTop: 18 }} className="section-gap">
      <div className="figures fin-figures" style={{ marginBottom: 0 }}>
        <div className="figure">
          <span className="val num pos">{money(income)}</span>
          <span className="lbl">Money in</span>
        </div>
        <div className="figure">
          <span className="val num">{money(expense)}</span>
          <span className="lbl">Money out</span>
        </div>
        <div className="figure">
          <span className={`val num ${balance < 0 ? 'neg' : ''}`}>{money(balance)}</span>
          <span className="lbl">Balance</span>
        </div>
        <div className="figure">
          <span className="val num">{entries.length}</span>
          <span className="lbl">Entries</span>
        </div>
      </div>

      <div className="ov-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Spending by project</h2>
            <span className="small faint">Bar: spent. Line: budget.</span>
          </div>
          <div className="panel-body">
            {byProject.length === 0 ? (
              <p className="faint">Nothing recorded yet.</p>
            ) : (
              <div className="bars">
                {byProject.map(([pid, v]) => {
                  const p = store.projectMap.get(pid);
                  const budget = p?.budgetPlanned ?? 0;
                  const over = budget > 0 && v.spent > budget;
                  return (
                    <div className="bar-row" key={pid || 'general'}>
                      <span className="ellipsis">{p ? <Link to={`/app/projects/${p.id}`}>{p.title}</Link> : pid ? 'Deleted project' : 'General club money'}</span>
                      <span className="bar-track" style={{ position: 'relative' }}>
                        <span className="bar-fill" style={{ display: 'block', width: `${(v.spent / maxProj) * 100}%`, ['--c' as string]: over ? 'var(--neg)' : p?.color ?? 'var(--ink-3)' }} />
                        {budget > 0 && <span style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: 'var(--ink)', left: `calc(${(budget / maxProj) * 100}% - 1px)` }} title={`Budget ${money(budget)}`} />}
                      </span>
                      <span className={`num small ${over ? 'neg' : ''}`} style={{ textAlign: 'right' }}>
                        {money(v.spent, { compact: true })}
                        {budget > 0 && <span className="faint"> / {money(budget, { compact: true })}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Where the money goes</h2>
          </div>
          <div className="panel-body">
            {byCat.length === 0 ? (
              <p className="faint">No spending yet.</p>
            ) : (
              <div className="bars">
                {byCat.map(([cat, v]) => (
                  <div className="bar-row" key={cat}>
                    <span className="ellipsis">{cat}</span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ display: 'block', width: `${(v / maxCat) * 100}%`, ['--c' as string]: 'var(--ink)' }} />
                    </span>
                    <span className="num small">{Math.round((v / expense) * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="h3">Latest entries</h2>
          {store.canFinance && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => onRecord('in')}>
                Record income
              </button>
            </div>
          )}
        </div>
        {recent.length === 0 ? (
          <Empty title="Nothing recorded yet">{store.canFinance ? 'Use Record expense, or type straight into the ledger sheet.' : null}</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th className="hide-sm">Project</th>
                  <th className="hide-sm">Category</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.sheetId + e.rowId}>
                    <td className="small">{fmtDate(e.date) || <span className="faint">No date</span>}</td>
                    <td>
                      <Link to={`/app/finance/${e.sheetId}`}>{e.description || 'No description'}</Link>
                    </td>
                    <td className="small muted hide-sm">{store.projectMap.get(e.projectId)?.title ?? ''}</td>
                    <td className="small muted hide-sm">{e.category}</td>
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
    </div>
  );
}

function NewSheetModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const nav = useNavigate();
  const hasLedger = store.sheets.some((s) => s.isLedger);
  const [kind, setKind] = useState<'ledger' | 'budget' | 'blank'>(hasLedger ? 'budget' : 'ledger');
  const [project, setProject] = useState('');
  const [name, setName] = useState(hasLedger ? '' : 'Ledger');
  const projectTitle = store.projectMap.get(project)?.title ?? '';
  const finalName = name.trim() || (kind === 'budget' && projectTitle ? `${projectTitle} budget` : kind === 'ledger' ? 'Ledger' : 'Sheet');
  const taken = store.sheets.some((s) => s.name.toLowerCase() === finalName.toLowerCase());
  const create = async () => {
    const id = await run(() => createSheet(finalName, kind, (store.sheets.at(-1)?.order ?? 0) + 1, projectTitle), 'Sheet created');
    if (id) {
      onClose();
      nav(`/app/finance/${id}`);
    }
  };
  return (
    <Modal
      title="New sheet"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={taken} onClick={create}>
            Create sheet
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Field label="Start from">
          <Seg
            label="Template"
            value={kind}
            onChange={setKind}
            options={[
              { key: 'ledger', label: 'Ledger' },
              { key: 'budget', label: 'Budget plan' },
              { key: 'blank', label: 'Blank' },
            ]}
          />
        </Field>
        <p className="small muted">
          {kind === 'ledger'
            ? 'Columns for date, description, in/out, category, project, amount, who paid and a receipt photo. Finance totals and project budgets read from ledgers.'
            : kind === 'budget'
              ? 'Item, quantity, unit cost and a Total column with formulas already filled in, for planning what an event will cost.'
              : 'An empty grid with eight columns. Name the columns and pick their types from the column header.'}
        </p>
        {kind === 'budget' && (
          <Field label="For project">
            <select className="select" value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">None</option>
              {store.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Sheet name" hint={taken ? <span className="neg">There's already a sheet called {finalName}.</span> : 'Formulas on other sheets refer to it by this name.'}>
          <input className="input" value={name} placeholder={finalName} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function RenameSheet({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const [name, setName] = useState(sheet.name);
  const taken = store.sheets.some((s) => s.id !== sheet.id && s.name.toLowerCase() === name.trim().toLowerCase());
  const save = async () => {
    const n = name.trim();
    if (!n || taken) return;
    const ok = await run(async () => {
      await updateSheet(sheet.id, { name: n }, sheet.name);
      return true;
    }, 'Sheet renamed');
    if (ok) onClose();
  };
  return (
    <Modal
      title="Rename sheet"
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim() || taken} onClick={save}>
            Rename
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name" hint={taken ? <span className="neg">That name is taken.</span> : 'Formulas on other sheets that use the old name need updating by hand.'}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}

const FN_DOCS: [string, string][] = [
  ['SUM(F1:F30)', 'Adds up a range.'],
  ['SUMIF(C1:C30, "Out", F1:F30)', 'Adds F where C says Out.'],
  ['SUMIFS(F:F, C:C, "Out", D:D, "Printing")', 'Adds F where every condition matches.'],
  ['COUNTIF(D:D, "Food*")', 'Counts cells that match. * matches anything.'],
  ['AVERAGE, MIN, MAX, MEDIAN', 'The usual statistics over a range.'],
  ['IF(F2>500000, "Check", "OK")', 'Picks a value based on a condition.'],
  ['IFERROR(B2/C2, 0)', 'Falls back when a formula errors.'],
  ['ROUND(B2*1.1, -3)', 'Rounds; -3 rounds to the nearest thousand.'],
  ['VLOOKUP("Food", A1:B9, 2, FALSE)', 'Finds a row by its first column and returns another column.'],
  ["Ledger!F2  or  'Event budget'!D21", 'Refers to a cell on another sheet. Quote names with spaces.'],
  ['TODAY()', "Today's date."],
  ['A1 & " " & B1', 'Joins text.'],
];

function FormulaHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Formulas" onClose={onClose} size="wide">
      <div className="fn-help">
        <p>
          Start a cell with <code>=</code>. Cells are named by column letter and row number, like <code>F2</code>. While typing a formula, click cells to insert them. Drag the small square at the corner of a selection to copy a formula down; references move with it unless you
          pin them with <code>$</code>, as in <code>$F$1</code>.
        </p>
        <dl>
          {FN_DOCS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>
                <code>{k}</code>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="small faint" style={{ marginTop: 14 }}>
          All functions: {Object.keys(FUNCTIONS).sort().join(', ')}.
        </p>
        <p className="small faint" style={{ marginTop: 8 }}>
          Shortcuts: arrows move, Shift+arrows select, Enter edits, Tab moves right, Delete clears, Ctrl+C / Ctrl+V copy and paste (also from Excel or Google Sheets), Ctrl+Z undoes your last change.
        </p>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const run = useRun();
  const [text, setText] = useState('');
  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const v = JSON.parse(text) as ImportedEvent[];
      if (!Array.isArray(v) || v.some((e) => !e.title || !Array.isArray(e.rows))) return { error: 'Each event needs a title and a list of rows.' };
      return { events: v };
    } catch {
      return { error: "That isn't valid import data." };
    }
  }, [text]);
  const events: ImportedEvent[] = (parsed && 'events' in parsed && parsed.events) || [];
  const sum = (e: ImportedEvent, dir: 'In' | 'Out') => e.rows.filter((r) => r.dir === dir).reduce((s, r) => s + (Number(r.amt) || 0), 0);
  const go = async () => {
    const ok = await run(async () => {
      await importEvents(events, store.sheets.length + store.projects.length + 10);
      return true;
    }, `Imported ${events.length} ${events.length === 1 ? 'event' : 'events'}`);
    if (ok) onClose();
  };
  return (
    <Modal
      title="Import events"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!events.length} onClick={go}>
            Import {events.length || ''} {events.length === 1 ? 'event' : 'events'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginBottom: 12 }}>
        Each event becomes a finished project with its own ledger sheet. Paste the import data below.
      </p>
      <textarea className="textarea mono" style={{ minHeight: 120, fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="[ { &quot;title&quot;: ..., &quot;rows&quot;: [...] } ]" aria-label="Import data" />
      {parsed && 'error' in parsed && (
        <p className="notice" role="alert" style={{ marginTop: 10 }}>
          {parsed.error}
        </p>
      )}
      {events.length > 0 && (
        <table className="import-preview">
          <thead>
            <tr>
              <th>Event</th>
              <th>In</th>
              <th>Out</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.title}>
                <td>{e.title}</td>
                <td>{money(sum(e, 'In'))}</td>
                <td>{money(sum(e, 'Out'))}</td>
                <td>{money(sum(e, 'In') - sum(e, 'Out'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
