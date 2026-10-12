import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import type { FinanceStats, MonthRow, ProjectPL } from '../lib/financeStats';
import { niceRange, niceTicks } from '../lib/financeStats';
import { money } from '../lib/format';

/* Small hand-made charts for the Finance summary. Revenue is the accent,
   costs a quiet gray, profit green above zero and red below; every value is
   also in a tooltip or a table, so colour is never the only way to read it. */

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const pct = (x: number | null, digits = 0) => (x === null ? 'n/a' : `${(x * 100).toFixed(digits)}%`);
const monthLabel = (m: string, withYear = false) => format(parseISO(`${m}-01`), withYear ? 'MMM yyyy' : 'MMM');

/** Width of an element in CSS pixels, so the charts draw at their real size and text never stretches. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Full amount on wide screens, short one on phones. */
function Amount({ n, sign }: { n: number; sign?: boolean }) {
  return (
    <>
      <span className="amt-full">{money(n, { sign })}</span>
      <span className="amt-short">{money(n, { compact: true, sign })}</span>
    </>
  );
}

/** Column with a 4 px rounded top and a square base. */
function colPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function Kpi({ label, value, sub, tone, title }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg' | 'warn'; title?: string }) {
  return (
    <div className="kpi" title={title}>
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone ?? ''}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

/* ---------- revenue and costs per month ---------- */

export function MonthlyChart({ months }: { months: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const [box, W] = useWidth(640);
  const H = 230;
  const m = { l: 44, r: 8, t: 10, b: 26 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const ticks = niceTicks(Math.max(1, ...months.map((x) => Math.max(x.revenue, x.costs))));
  const top = ticks[ticks.length - 1] || 1;
  const y = (v: number) => m.t + ph - (v / top) * ph;
  const band = pw / Math.max(1, months.length);
  const bw = Math.min(24, Math.max(4, band * 0.3));
  const maxLabels = Math.max(3, Math.floor(pw / 56));
  const h = hover === null ? null : months[hover];
  return (
    <div className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="sw sw-rev" /> Revenue
        </span>
        <span>
          <i className="sw sw-cost" /> Costs
        </span>
      </div>
      <div className="chart-box" ref={box} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>Revenue and costs by month. The table below the chart has the numbers.</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className="grid" />
              <text x={m.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {compact.format(t)}
              </text>
            </g>
          ))}
          {months.map((x, i) => {
            const cx = m.l + band * i + band / 2;
            const dim = hover !== null && hover !== i;
            return (
              <g key={x.month} opacity={dim ? 0.4 : 1}>
                <path d={colPath(cx - bw - 1, y(x.revenue), bw, y(0) - y(x.revenue))} className="bar-rev" />
                <path d={colPath(cx + 1, y(x.costs), bw, y(0) - y(x.costs))} className="bar-cost" />
                {(months.length <= maxLabels || i % Math.ceil(months.length / maxLabels) === 0) && (
                  <text x={cx} y={H - 8} className="tick" textAnchor="middle">
                    {monthLabel(x.month)}
                    {i === 0 || x.month.endsWith('-01') ? ` ${x.month.slice(2, 4)}` : ''}
                  </text>
                )}
                <rect x={m.l + band * i} y={m.t} width={band} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${monthLabel(x.month, true)}: revenue ${money(x.revenue)}, costs ${money(x.costs)}`} />
              </g>
            );
          })}
          <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} className="axis" />
        </svg>
        {h && hover !== null && (
          <div className="chart-tip" style={{ left: `${((m.l + band * hover + band / 2) / W) * 100}%` }} role="status">
            <strong>{monthLabel(h.month, true)}</strong>
            <span>
              <i className="sw sw-rev" /> Revenue <b>{money(h.revenue)}</b>
            </span>
            <span>
              <i className="sw sw-cost" /> Costs <b>{money(h.costs)}</b>
            </span>
            <span className="tip-sum">
              Profit <b>{money(h.profit, { sign: true })}</b>
            </span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Revenue and costs by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Revenue</th>
            <th>Costs</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {months.map((x) => (
            <tr key={x.month}>
              <td>{monthLabel(x.month, true)}</td>
              <td>{money(x.revenue)}</td>
              <td>{money(x.costs)}</td>
              <td>{money(x.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- running balance ---------- */

export function BalanceChart({ months }: { months: MonthRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const [box, W] = useWidth(360);
  const H = 230;
  const m = { l: 44, r: 16, t: 22, b: 26 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const vals = months.map((x) => x.balance);
  const ticks = niceRange(Math.min(0, ...vals), Math.max(1, ...vals));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1] || 1;
  const y = (v: number) => m.t + ph - ((v - lo) / (hi - lo || 1)) * ph;
  const x = (i: number) => m.l + (months.length <= 1 ? pw / 2 : (i / (months.length - 1)) * pw);
  const line = months.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.balance)}`).join('');
  const area = months.length > 1 ? `${line}L${x(months.length - 1)},${y(Math.max(lo, 0))}L${x(0)},${y(Math.max(lo, 0))}Z` : '';
  const last = months[months.length - 1];
  const h = hover === null ? null : months[hover];
  return (
    <div className="chart">
      <div className="chart-box" ref={box} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{`Balance at the end of each month${last ? `, now ${money(last.balance)}` : ''}.`}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={m.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {compact.format(t)}
              </text>
            </g>
          ))}
          {area && <path d={area} className="bal-area" />}
          <path d={line} className="bal-line" />
          {months.length > 0 && (
            <>
              <text x={m.l} y={H - 8} className="tick" textAnchor="start">
                {monthLabel(months[0].month)} {months[0].month.slice(2, 4)}
              </text>
              {months.length > 1 && (
                <text x={W - m.r} y={H - 8} className="tick" textAnchor="end">
                  {monthLabel(last.month)} {last.month.slice(2, 4)}
                </text>
              )}
              <circle cx={x(months.length - 1)} cy={y(last.balance)} r={4.5} className="bal-dot" />
              <text x={x(months.length - 1)} y={y(last.balance) - 10} className="end-label" textAnchor="end">
                {money(last.balance, { compact: true })}
              </text>
            </>
          )}
          {h && hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + ph} className="cross" />
              <circle cx={x(hover)} cy={y(h.balance)} r={4.5} className="bal-dot" />
            </>
          )}
          {months.map((p, i) => {
            const w = pw / Math.max(1, months.length - 1);
            return <rect key={p.month} x={x(i) - w / 2} y={m.t} width={w} height={ph} fill="transparent" onMouseEnter={() => setHover(i)} />;
          })}
        </svg>
        {h && hover !== null && (
          <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }} role="status">
            <strong>End of {monthLabel(h.month, true)}</strong>
            <span>
              Balance <b>{money(h.balance)}</b>
            </span>
            <span className="tip-sum">
              That month <b>{money(h.profit, { sign: true })}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- profit and loss by project ---------- */

export function PLTable({ rows, totals, titleOf }: { rows: ProjectPL[]; totals: Pick<FinanceStats, 'revenue' | 'costs' | 'profit' | 'margin'>; titleOf: (projectId: string) => { title: string; href?: string } }) {
  const lo = Math.min(0, ...rows.map((r) => r.profit));
  const hi = Math.max(1, ...rows.map((r) => r.profit));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table pl-table">
        <thead>
          <tr>
            <th>Event or project</th>
            <th className="r">Revenue</th>
            <th className="r hide-sm">Costs</th>
            <th className="pl-bar-h hide-sm" aria-hidden="true" />
            <th className="r">Profit</th>
            <th className="r hide-sm" title="Profit as a share of revenue">
              Margin
            </th>
            <th className="r hide-sm" title="Profit for every 1 spent">
              Return on cost
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = titleOf(r.projectId);
            const w = (Math.abs(r.profit) / span) * 100;
            return (
              <tr key={r.projectId || 'general'}>
                <td className="pl-name">
                  {t.href ? <Link to={t.href}>{t.title}</Link> : <span className="muted">{t.title}</span>}
                  {r.date && <span className="small faint"> {format(parseISO(r.date), 'MMM yyyy')}</span>}
                </td>
                <td className="r num">{r.revenue ? <Amount n={r.revenue} /> : <span className="faint">0</span>}</td>
                <td className="r num hide-sm">{money(r.costs)}</td>
                <td className="pl-bar hide-sm" aria-hidden="true">
                  <span className="pl-track">
                    <span className="pl-zero" style={{ left: `${zero}%` }} />
                    <span className={`pl-fill ${r.profit < 0 ? 'neg' : 'pos'}`} style={r.profit < 0 ? { right: `${100 - zero}%`, width: `${w}%` } : { left: `${zero}%`, width: `${w}%` }} />
                  </span>
                </td>
                <td className="r num pl-profit">
                  <Amount n={r.profit} sign />
                </td>
                <td className="r num hide-sm">{r.revenue ? pct(r.margin) : <span className="faint">No sales</span>}</td>
                <td className="r num hide-sm">{r.costs ? pct(r.roi) : <span className="faint">No costs</span>}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="r num">
              <Amount n={totals.revenue} />
            </td>
            <td className="r num hide-sm">{money(totals.costs)}</td>
            <td className="hide-sm" />
            <td className="r num">
              <Amount n={totals.profit} sign />
            </td>
            <td className="r num hide-sm">{pct(totals.margin)}</td>
            <td className="r num hide-sm">{pct(totals.costs ? totals.profit / totals.costs : null)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ---------- part of a whole, as one bar per item ---------- */

export function ShareList({ items, total, tone, empty }: { items: [string, number][]; total: number; tone: 'rev' | 'cost'; empty: string }) {
  const max = Math.max(1, ...items.map(([, v]) => v));
  const shown = useMemo(() => {
    if (items.length <= 7) return items;
    const head = items.slice(0, 6);
    const rest = items.slice(6).reduce((s, [, v]) => s + v, 0);
    return [...head, ['Everything else', rest] as [string, number]];
  }, [items]);
  if (!items.length) return <p className="faint">{empty}</p>;
  return (
    <div className="share-list">
      {shown.map(([label, v]) => (
        <div className="share-row" key={label}>
          <span className="share-label ellipsis">{label}</span>
          <span className="share-track">
            <span className={`share-fill ${tone}`} style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="share-val num">{money(v, { compact: true })}</span>
          <span className="share-pct num">{total ? pct(v / total) : ''}</span>
        </div>
      ))}
    </div>
  );
}
