import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Download, MoreHorizontal, Pencil, Plus, Table2, Trash2, Upload, Wallet } from 'lucide-react';
import { useStore, memberName } from '../lib/store';
import { createSheet, deleteSheet, importEvents, updateSheet, type ImportedEvent } from '../lib/actions';
import { fmtDate, money } from '../lib/format';
import { cellRaw, useLedger, useWorkbook } from '../lib/workbook';
import { financeStats } from '../lib/financeStats';
import { BalanceChart, Kpi, MonthlyChart, PLTable, ShareList, pct } from './financeCharts';
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
        rows.forEach((_row, r) => {
          aoa.push(
            s.columns.map((c, ci) => {
              const raw = cellRaw(s, rows, r, ci);
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
              <>
                <button className="btn" onClick={() => setEntry('in')}>
                  <Plus /> Record income
                </button>
                <button className="btn btn-primary" onClick={() => setEntry('out')}>
                  <Plus /> Record expense
                </button>
              </>
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
  const { entries } = useLedger();
  const hasLedger = store.sheets.some((s) => s.isLedger);
  const st = useMemo(() => financeStats(entries, store.projectMap), [entries, store.projectMap]);
  const titleOf = (pid: string) => {
    const p = store.projectMap.get(pid);
    if (p) return { title: p.title, href: `/app/${p.kind === 'competition' ? 'competitions' : 'projects'}/${p.id}` };
    return { title: pid ? 'Deleted project' : 'Not tied to a project' };
  };
  const recent = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10);
  const budgeted = st.byProject
    .map((r) => ({ r, p: store.projectMap.get(r.projectId) }))
    .filter((x) => (x.p?.budgetPlanned ?? 0) > 0)
    .concat(
      store.projects
        .filter((p) => p.budgetPlanned > 0 && !st.byProject.some((r) => r.projectId === p.id))
        .map((p) => ({ r: { projectId: p.id, revenue: 0, costs: 0, profit: 0, margin: null, roi: null, date: '' }, p })),
    );
  const outCount = entries.filter((e) => e.direction === 'out').length;
  const receiptShare = st.receipts.amountShare;

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
      <div className="kpis">
        <Kpi label="Revenue" value={money(st.revenue, { compact: true })} title={money(st.revenue)} sub={`from ${st.earners} ${st.earners === 1 ? 'event' : 'events'} that sold something`} />
        <Kpi label="Costs" value={money(st.costs, { compact: true })} title={money(st.costs)} sub={`${outCount} ${outCount === 1 ? 'payment' : 'payments'}`} />
        <Kpi label="Profit" value={money(st.profit, { compact: true, sign: true })} title={money(st.profit)} tone={st.profit < 0 ? 'neg' : 'pos'} sub={`${pct(st.margin, 1)} of revenue kept`} />
        <Kpi
          label="Return on spending"
          value={st.revenuePerCost === null ? 'n/a' : `${st.revenuePerCost.toFixed(2)}x`}
          sub={st.revenuePerCost === null ? 'Nothing spent yet' : `Every ${money(1000)} spent brought back ${money(Math.round(st.revenuePerCost * 1000))}`}
        />
        <Kpi
          label="Best event"
          value={<span className="kpi-name">{st.best ? titleOf(st.best.projectId).title : 'n/a'}</span>}
          sub={st.best ? `${money(st.best.profit, { compact: true, sign: true })} profit, ${pct(st.best.margin)} margin` : undefined}
        />
        <Kpi
          label="Spending with a receipt"
          value={pct(receiptShare)}
          tone={receiptShare !== null && receiptShare < 0.5 ? 'warn' : undefined}
          sub={`${st.receipts.count} of ${st.receipts.of} payments have a photo`}
        />
      </div>

      {st.months.length > 0 && (st.datedShare ?? 0) >= 0.8 ? (
      <div className="fin-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Revenue and costs by month</h2>
            {st.undated > 0 && <span className="small faint">{st.undated} without a date left out</span>}
          </div>
          <div className="panel-body">{st.months.length ? <MonthlyChart months={st.months} /> : <p className="faint">Add dates to entries, or to their projects, to see this.</p>}</div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Balance over time</h2>
          </div>
          <div className="panel-body">{st.months.length ? <BalanceChart months={st.months} /> : <p className="faint">Nothing dated yet.</p>}</div>
        </section>
      </div>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Revenue and costs over time</h2>
          </div>
          <div className="panel-body undated">
            <p>
              {st.undated} of {entries.length} entries have no date, and neither do the events they belong to, so a monthly chart would only show {(st.datedShare ?? 0) < 0.01 ? 'almost none' : pct(st.datedShare)} of the money. Give each event its date and the
              monthly charts appear here.
            </p>
            <ul className="undated-list">
              {st.undatedProjects.map(({ projectId, count }) => {
                const t = titleOf(projectId);
                return (
                  <li key={projectId || 'general'}>
                    {t.href ? <Link to={t.href}>{t.title}</Link> : <span>{t.title}</span>}
                    <span className="small faint">
                      {count} {count === 1 ? 'entry' : 'entries'}
                      {projectId ? ': set the dates with Edit on the project page' : ': add a date in the ledger'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2 className="h3">Profit by event</h2>
        </div>
        {(st.avgProfitPerEarner !== null || st.topShare !== null) && (
          <p className="small muted pl-note">
            {st.avgProfitPerEarner !== null && <>Events that sold something made {money(st.avgProfitPerEarner, { compact: true, sign: true })} each on average. </>}
            {st.topShare !== null && st.earners > 1 && <>The biggest earner brought in {pct(st.topShare)} of all revenue.</>}
          </p>
        )}
        {st.byProject.length ? <PLTable rows={st.byProject} totals={st} titleOf={titleOf} /> : <Empty title="Nothing recorded yet" />}
      </section>

      <div className="fin-grid even">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Where revenue comes from</h2>
            {store.canFinance && (
              <button className="btn btn-sm" onClick={() => onRecord('in')}>
                <Plus /> Record income
              </button>
            )}
          </div>
          <div className="panel-body">
            <ShareList items={st.revenueBySource} total={st.revenue} tone="rev" empty="No revenue recorded yet." />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Where the money goes</h2>
            {store.canFinance && (
              <button className="btn btn-sm" onClick={() => onRecord('out')}>
                <Plus /> Record expense
              </button>
            )}
          </div>
          <div className="panel-body">
            <ShareList items={st.costsByCategory} total={st.costs} tone="cost" empty="No spending yet." />
          </div>
        </section>
      </div>

      <div className="fin-grid even">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h3">Biggest costs</h2>
          </div>
          {st.biggestCosts.length ? (
            <ul className="list">
              {st.biggestCosts.map((e) => (
                <li key={e.sheetId + e.rowId}>
                  <Link to={`/app/finance/${e.sheetId}`} className="row-link">
                    <span className="row-main">
                      <span className="title">{e.description || 'No description'}</span>
                      <span className="small faint">{[store.projectMap.get(e.projectId)?.title, e.category].filter(Boolean).join(' · ') || 'No project'}</span>
                    </span>
                    <span className="num">{money(e.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No spending yet" />
          )}
        </section>
        {budgeted.length > 0 ? (
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Budgets</h2>
              <span className="small faint">Bar: spent. Line: budget.</span>
            </div>
            <div className="panel-body">
              <div className="bars">
                {budgeted.map(({ r, p }) => {
                  const budget = p?.budgetPlanned ?? 0;
                  const max = Math.max(budget, r.costs, 1);
                  const over = r.costs > budget;
                  return (
                    <div className="bar-row" key={r.projectId}>
                      <span className="ellipsis">{p ? <Link to={`/app/projects/${p.id}`}>{p.title}</Link> : ''}</span>
                      <span className="bar-track" style={{ position: 'relative' }}>
                        <span className="bar-fill" style={{ display: 'block', width: `${(r.costs / max) * 100}%`, ['--c' as string]: over ? 'var(--neg)' : p?.color ?? 'var(--ink-3)' }} />
                        <span style={{ position: 'absolute', top: -3, bottom: -3, width: 2, background: 'var(--ink)', left: `calc(${(budget / max) * 100}% - 1px)` }} title={`Budget ${money(budget)}`} />
                      </span>
                      <span className={`num small ${over ? 'neg' : ''}`} style={{ textAlign: 'right' }}>
                        {money(r.costs, { compact: true })}
                        <span className="faint"> / {money(budget, { compact: true })}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-head">
              <h2 className="h3">Keeping the books clean</h2>
            </div>
            <ul className="tidy">
              <li className={st.undated ? 'todo' : 'ok'}>
                {st.undated ? `${st.undated} ${st.undated === 1 ? 'entry has' : 'entries have'} no date, and neither does their project.` : 'Every entry has a date, or its project does.'}
              </li>
              <li className={st.uncategorised.count ? 'todo' : 'ok'}>
                {st.uncategorised.count
                  ? `${st.uncategorised.count} ${st.uncategorised.count === 1 ? 'entry is' : 'entries are'} under Other or have no category (${money(st.uncategorised.amount, { compact: true })}). A real category makes the charts above more useful.`
                  : 'Every entry has a category.'}
              </li>
              <li className={receiptShare !== null && receiptShare < 0.9 ? 'todo' : 'ok'}>
                {st.receipts.of - st.receipts.count > 0 ? `${st.receipts.of - st.receipts.count} payments have no receipt photo.` : 'Every payment has a receipt photo.'}
              </li>
            </ul>
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2 className="h3">Latest entries</h2>
        </div>
        {recent.length === 0 ? (
          <Empty title="Nothing recorded yet">{store.canFinance ? 'Use Record income or Record expense, or type straight into the ledger sheet.' : null}</Empty>
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
