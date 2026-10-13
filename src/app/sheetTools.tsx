import { useMemo, useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { isErr, type Scalar } from '../lib/formula';
import { money, plainNumber } from '../lib/format';
import type { Column, ColumnTotal, Sheet } from '../lib/types';
import { Empty, Field, Modal, useToast } from '../components/ui';

/* Things that let people use the finance sheets without writing formulas:
   a totals row, a group-by summary, and filters you tick instead of type. */

export type Filt = { text: string; values: string[] };
export const EMPTY_FILTER: Filt = { text: '', values: [] };
export const filterActive = (f?: Filt) => !!f && (!!f.text.trim() || f.values.length > 0);

export const TOTAL_LABEL: Record<ColumnTotal, string> = {
  none: 'Nothing',
  sum: 'Sum',
  avg: 'Average',
  count: 'Count',
  min: 'Smallest',
  max: 'Largest',
  net: 'In minus out',
};

const isNumeric = (c: Column) => c.type === 'number' || c.type === 'currency';

export function defaultTotal(sheet: Sheet, col: Column): ColumnTotal {
  if (col.total) return col.total;
  if (sheet.isLedger && col.role === 'amount') return 'net';
  if (col.calc && (col.calc.op === 'running' || col.calc.op === 'balance')) return 'none';
  return isNumeric(col) ? 'sum' : 'none';
}

export function totalChoices(sheet: Sheet, col: Column): ColumnTotal[] {
  const base: ColumnTotal[] = isNumeric(col) ? ['sum', 'avg', 'min', 'max', 'count', 'none'] : ['count', 'none'];
  return sheet.isLedger && col.role === 'amount' ? ['net', ...base] : base;
}

export interface TotalCell {
  v: Scalar;
  raw: string;
  dir?: string;
}

/** A total over the rows on screen. Rows that are themselves totals of this column (like =SUM(F1:F20)) are skipped. */
export function columnTotal(kind: ColumnTotal, cells: TotalCell[], letter: string): { value: number | null; inSum?: number; outSum?: number } {
  if (kind === 'none') return { value: null };
  const selfTotal = new RegExp(`(^|[^A-Z$])\\$?${letter}\\$?\\d+:\\$?${letter}\\$?\\d+`, 'i');
  const keep = cells.filter((c) => !(c.raw.startsWith('=') && selfTotal.test(c.raw)));
  if (kind === 'count') return { value: keep.filter((c) => c.v !== null && c.v !== '' && !isErr(c.v)).length };
  const nums = keep.filter((c) => typeof c.v === 'number') as (TotalCell & { v: number })[];
  if (kind === 'net') {
    let inSum = 0;
    let outSum = 0;
    for (const c of nums) {
      const d = (c.dir ?? '').trim().toLowerCase();
      if (d === 'in' || d === 'income' || d === 'thu') inSum += Math.abs(c.v);
      else if (d === 'out' || d === 'expense' || d === 'chi') outSum += Math.abs(c.v);
    }
    return { value: inSum - outSum, inSum, outSum };
  }
  if (!nums.length) return { value: null };
  const vals = nums.map((c) => c.v);
  if (kind === 'sum') return { value: vals.reduce((a, b) => a + b, 0) };
  if (kind === 'avg') return { value: vals.reduce((a, b) => a + b, 0) / vals.length };
  if (kind === 'min') return { value: Math.min(...vals) };
  return { value: Math.max(...vals) };
}

export const fmtFor = (col: Column, n: number, kind?: ColumnTotal) => (kind === 'count' ? plainNumber(n) : col.type === 'currency' || kind === 'net' ? money(n) : plainNumber(Math.round(n * 100) / 100));

/* ---------- filter by ticking values ---------- */

export function FilterModal({ col, letter, options, value, onClose, onApply }: { col: Column; letter: string; options: { label: string; count: number }[]; value: Filt; onClose: () => void; onApply: (v: Filt) => void }) {
  const [text, setText] = useState(value.text);
  const [picked, setPicked] = useState<string[]>(value.values);
  const [q, setQ] = useState('');
  const pickable = options.length > 0 && options.length <= 200;
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title={`Filter ${col.name || `column ${letter}`}`}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          {filterActive(value) && (
            <button className="btn" onClick={() => onApply(EMPTY_FILTER)}>
              Clear filter
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => onApply(picked.length ? { text: '', values: picked } : { text, values: [] })}>
            Apply
          </button>
        </>
      }
    >
      {pickable && (
        <div className="fpick">
          <div className="fpick-head">
            <span className="small muted">Show rows where it is</span>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPicked(shown.map((o) => o.label))}>
              All
            </button>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPicked([])}>
              None
            </button>
          </div>
          {options.length > 8 && <input className="input input-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a value" aria-label="Find a value" />}
          <ul className="fpick-list">
            {shown.map((o) => (
              <li key={o.label}>
                <label className="check">
                  <input type="checkbox" checked={picked.includes(o.label)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.label] : p.filter((x) => x !== o.label)))} />
                  <span className="ellipsis">{o.label || <span className="faint">(empty)</span>}</span>
                  <span className="small faint">{o.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply({ text, values: [] });
        }}
        style={{ marginTop: pickable ? 14 : 0 }}
      >
        <Field label={pickable ? 'Or rows that contain' : 'Show rows where this column contains'} hint="Only changes what you see. Other people's view is untouched.">
          <input
            className="input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setPicked([]);
            }}
            autoFocus={!pickable}
          />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------- summary: totals per group, no formulas ---------- */

export function SummaryModal({
  sheet,
  rows,
  groupKey,
  displayText,
  value,
  onClose,
}: {
  sheet: Sheet;
  rows: number[]; // the rows on screen
  groupKey: string;
  displayText: (r: number, c: number) => string;
  value: (r: number, c: number) => Scalar;
  onClose: () => void;
}) {
  const toast = useToast();
  const cols = sheet.columns;
  const groupable = cols.map((c, i) => ({ c, i })).filter(({ c }) => !isNumeric(c) && c.type !== 'receipt');
  const numeric = cols.map((c, i) => ({ c, i })).filter(({ c }) => isNumeric(c) && !(c.calc && (c.calc.op === 'running' || c.calc.op === 'balance')));
  const dirIdx = cols.findIndex((c) => c.role === 'direction');
  const amtIdx = cols.findIndex((c) => c.role === 'amount');
  const [g, setG] = useState(() => {
    const i = cols.findIndex((c) => c.key === groupKey);
    if (i >= 0 && groupable.some((x) => x.i === i)) return i;
    const cat = cols.findIndex((c) => c.role === 'category');
    return cat >= 0 ? cat : groupable[0]?.i ?? -1;
  });
  const [n, setN] = useState(() => (amtIdx >= 0 ? amtIdx : numeric[0]?.i ?? -1));
  const ledgerMode = sheet.isLedger && n === amtIdx && dirIdx >= 0;

  const groups = useMemo(() => {
    const m = new Map<string, { rows: number; total: number; inSum: number; outSum: number }>();
    if (g < 0) return [];
    for (const r of rows) {
      const v = n >= 0 ? value(r, n) : null;
      const hasRow = cols.some((_, c) => displayText(r, c) !== '');
      if (!hasRow) continue;
      let label = displayText(r, g);
      if (cols[g].type === 'date') {
        const raw = value(r, g);
        label = typeof raw === 'string' && /^\d{4}-\d{2}/.test(raw) ? new Date(`${raw.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : label;
      }
      const k = label || '(empty)';
      const x = m.get(k) ?? { rows: 0, total: 0, inSum: 0, outSum: 0 };
      x.rows++;
      if (typeof v === 'number') {
        if (ledgerMode) {
          const d = displayText(r, dirIdx).trim().toLowerCase();
          if (d === 'in') x.inSum += Math.abs(v);
          else if (d === 'out') x.outSum += Math.abs(v);
          else continue; // a summary row, not money moving
          x.total = x.inSum - x.outSum;
        } else x.total += v;
      }
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => (ledgerMode ? b[1].inSum + b[1].outSum - (a[1].inSum + a[1].outSum) : b[1].total - a[1].total));
  }, [rows, g, n, value, displayText, cols, ledgerMode, dirIdx]);

  const sum = groups.reduce((s, [, x]) => ({ rows: s.rows + x.rows, total: s.total + x.total, inSum: s.inSum + x.inSum, outSum: s.outSum + x.outSum }), { rows: 0, total: 0, inSum: 0, outSum: 0 });
  const col = n >= 0 ? cols[n] : undefined;
  const fmt = (x: number) => (col ? fmtFor(col, x) : plainNumber(x));

  const copy = () => {
    const head = ledgerMode ? ['Group', 'Rows', 'In', 'Out', 'Net'] : ['Group', 'Rows', col?.name || 'Total', 'Share'];
    const lines = groups.map(([k, x]) => (ledgerMode ? [k, x.rows, x.inSum, x.outSum, x.total] : [k, x.rows, x.total, sum.total ? `${Math.round((x.total / sum.total) * 100)}%` : '']).join('\t'));
    navigator.clipboard?.writeText([head.join('\t'), ...lines].join('\n')).then(() => toast('Copied. Paste it into Sheets, Excel or a doc.'));
  };

  return (
    <Modal
      title="Summary"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <span className="small faint">Uses the rows on screen, so filters apply.</span>
          <span className="spacer" />
          <button className="btn" onClick={copy} disabled={!groups.length}>
            <ClipboardCopy /> Copy table
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="sum-pick">
        <Field label="Group rows by">
          <select className="select" value={g} onChange={(e) => setG(Number(e.target.value))}>
            {groupable.map(({ c, i }) => (
              <option key={c.key} value={i}>
                {c.name || `Column ${i + 1}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Add up">
          <select className="select" value={n} onChange={(e) => setN(Number(e.target.value))}>
            {numeric.map(({ c, i }) => (
              <option key={c.key} value={i}>
                {c.name || `Column ${i + 1}`}
              </option>
            ))}
            <option value={-1}>Just count rows</option>
          </select>
        </Field>
      </div>
      {!groups.length ? (
        <Empty title="Nothing to summarise">There are no rows with data on screen.</Empty>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table sum-table">
            <thead>
              <tr>
                <th>{cols[g]?.name || 'Group'}</th>
                <th className="r">Rows</th>
                {ledgerMode ? (
                  <>
                    <th className="r">In</th>
                    <th className="r">Out</th>
                    <th className="r">Net</th>
                  </>
                ) : n >= 0 ? (
                  <>
                    <th className="r">{col?.name || 'Total'}</th>
                    <th className="r">Share</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {groups.map(([k, x]) => (
                <tr key={k}>
                  <td>{k === '(empty)' ? <span className="faint">(empty)</span> : k}</td>
                  <td className="r num">{x.rows}</td>
                  {ledgerMode ? (
                    <>
                      <td className="r num">{x.inSum ? fmt(x.inSum) : ''}</td>
                      <td className="r num">{x.outSum ? fmt(x.outSum) : ''}</td>
                      <td className={`r num ${x.total < 0 ? 'neg' : ''}`}>{fmt(x.total)}</td>
                    </>
                  ) : n >= 0 ? (
                    <>
                      <td className="r num">{fmt(x.total)}</td>
                      <td className="r num">
                        <span className="sum-share">
                          <span style={{ width: `${sum.total ? Math.max(0, (x.total / sum.total) * 100) : 0}%` }} />
                        </span>
                        {sum.total ? `${Math.round((x.total / sum.total) * 100)}%` : ''}
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="r num">{sum.rows}</td>
                {ledgerMode ? (
                  <>
                    <td className="r num">{fmt(sum.inSum)}</td>
                    <td className="r num">{fmt(sum.outSum)}</td>
                    <td className={`r num ${sum.total < 0 ? 'neg' : ''}`}>{fmt(sum.total)}</td>
                  </>
                ) : n >= 0 ? (
                  <>
                    <td className="r num">{fmt(sum.total)}</td>
                    <td className="r num">100%</td>
                  </>
                ) : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}
