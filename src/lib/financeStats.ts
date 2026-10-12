import type { LedgerEntry } from './workbook';

/* Everything the Finance summary shows, worked out from the ledger in one place
   so it can be tested without the UI. */

export interface ProjectInfo {
  title: string;
  startDate?: string;
  endDate?: string;
  budgetPlanned?: number;
}

export interface ProjectPL {
  projectId: string; // '' = money not tied to a project
  revenue: number;
  costs: number;
  profit: number;
  margin: number | null; // profit / revenue
  roi: number | null; // profit / costs
  date: string; // when it happened, for sorting
}

export interface MonthRow {
  month: string; // yyyy-MM
  revenue: number;
  costs: number;
  profit: number;
  balance: number; // running total up to the end of this month
}

export interface FinanceStats {
  revenue: number;
  costs: number;
  profit: number;
  margin: number | null;
  /** money that came back for every 1 spent */
  revenuePerCost: number | null;
  byProject: ProjectPL[];
  earners: number; // projects that brought money in
  avgProfitPerEarner: number | null;
  best?: ProjectPL;
  worst?: ProjectPL;
  /** share of all revenue that came from the biggest earner */
  topShare: number | null;
  revenueBySource: [string, number][];
  costsByCategory: [string, number][];
  months: MonthRow[];
  undated: number; // entries with no date of their own or from their project
  /** share of all money moved (in and out) that has a date, so time charts can be trusted */
  datedShare: number | null;
  /** projects whose entries have no date, with how many; '' = entries not tied to a project */
  undatedProjects: { projectId: string; count: number }[];
  receipts: { count: number; of: number; amountShare: number | null };
  uncategorised: { count: number; amount: number };
  biggestCosts: LedgerEntry[];
}

const UNCATEGORISED = new Set(['', 'other', 'uncategorised', 'uncategorized', 'misc']);

/** The entry's own date, or failing that the end (or start) of its project. */
export function effectiveDate(e: LedgerEntry, projects: Map<string, ProjectInfo>): string {
  const own = /^\d{4}-\d{2}-\d{2}/.test(e.date) ? e.date.slice(0, 10) : '';
  if (own) return own;
  const p = projects.get(e.projectId);
  const d = p?.endDate || p?.startDate || '';
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '';
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

function addMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}

export function financeStats(entries: LedgerEntry[], projects: Map<string, ProjectInfo>): FinanceStats {
  let revenue = 0;
  let costs = 0;
  const pl = new Map<string, ProjectPL>();
  const src = new Map<string, number>();
  const cat = new Map<string, number>();
  const monthly = new Map<string, { revenue: number; costs: number }>();
  let undated = 0;
  let datedAmount = 0;
  const undatedBy = new Map<string, number>();
  let receiptCount = 0;
  let receiptAmount = 0;
  let outCount = 0;
  const uncategorised = { count: 0, amount: 0 };

  for (const e of entries) {
    const inflow = e.direction === 'in';
    if (inflow) revenue += e.amount;
    else costs += e.amount;

    const k = e.projectId || '';
    const row = pl.get(k) ?? { projectId: k, revenue: 0, costs: 0, profit: 0, margin: null, roi: null, date: '' };
    if (inflow) row.revenue += e.amount;
    else row.costs += e.amount;
    const d = effectiveDate(e, projects);
    if (d && d > row.date) row.date = d;
    pl.set(k, row);

    const label = e.category.trim() || 'Uncategorised';
    if (inflow) src.set(label, (src.get(label) ?? 0) + e.amount);
    else cat.set(label, (cat.get(label) ?? 0) + e.amount);
    if (UNCATEGORISED.has(e.category.trim().toLowerCase())) {
      uncategorised.count++;
      uncategorised.amount += e.amount;
    }

    if (d) {
      const m = d.slice(0, 7);
      const x = monthly.get(m) ?? { revenue: 0, costs: 0 };
      if (inflow) x.revenue += e.amount;
      else x.costs += e.amount;
      monthly.set(m, x);
      datedAmount += e.amount;
    } else {
      undated++;
      undatedBy.set(k, (undatedBy.get(k) ?? 0) + 1);
    }

    if (!inflow) {
      outCount++;
      if (e.receipt) {
        receiptCount++;
        receiptAmount += e.amount;
      }
    }
  }

  const byProject = [...pl.values()]
    .map((r) => ({ ...r, profit: r.revenue - r.costs, margin: ratio(r.revenue - r.costs, r.revenue), roi: ratio(r.revenue - r.costs, r.costs) }))
    .sort((a, b) => b.profit - a.profit);
  const projectRows = byProject.filter((r) => r.projectId);
  const earners = projectRows.filter((r) => r.revenue > 0);

  // a continuous run of months, so gaps show as empty rather than disappearing
  const keys = [...monthly.keys()].sort();
  const months: MonthRow[] = [];
  if (keys.length) {
    let balance = 0;
    for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonth(m)) {
      const x = monthly.get(m) ?? { revenue: 0, costs: 0 };
      balance += x.revenue - x.costs;
      months.push({ month: m, revenue: x.revenue, costs: x.costs, profit: x.revenue - x.costs, balance });
    }
  }

  const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    revenue,
    costs,
    profit: revenue - costs,
    margin: ratio(revenue - costs, revenue),
    revenuePerCost: ratio(revenue, costs),
    byProject,
    earners: earners.length,
    avgProfitPerEarner: earners.length ? earners.reduce((s, r) => s + r.profit, 0) / earners.length : null,
    best: projectRows[0],
    worst: projectRows.length > 1 ? projectRows[projectRows.length - 1] : undefined,
    topShare: earners.length ? ratio(Math.max(...earners.map((r) => r.revenue)), revenue) : null,
    revenueBySource: sortDesc(src),
    costsByCategory: sortDesc(cat),
    months,
    undated,
    datedShare: ratio(datedAmount, revenue + costs),
    undatedProjects: [...undatedBy.entries()].map(([projectId, count]) => ({ projectId, count })).sort((a, b) => b.count - a.count),
    receipts: { count: receiptCount, of: outCount, amountShare: ratio(receiptAmount, costs) },
    uncategorised,
    biggestCosts: entries.filter((e) => e.direction === 'out').sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

/** Nice round tick values from 0 up to at least max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Ticks for a range that may go below zero, always including 0. */
export function niceRange(min: number, max: number, count = 4): number[] {
  if (min >= 0) return niceTicks(max, count);
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v < max + step * 0.999; v += step) out.push(Math.round(v));
  return out;
}
