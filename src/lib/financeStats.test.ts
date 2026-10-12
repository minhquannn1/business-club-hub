import { describe, expect, it } from 'vitest';
import { effectiveDate, financeStats, niceRange, niceTicks, type ProjectInfo } from './financeStats';
import type { LedgerEntry } from './workbook';

const e = (over: Partial<LedgerEntry>): LedgerEntry => ({ sheetId: 's', rowId: Math.random().toString(36), date: '', description: '', direction: 'out', category: '', projectId: '', amount: 0, payer: '', receipt: '', ...over });

const projects = new Map<string, ProjectInfo>([
  ['hal', { title: 'Halloween', endDate: '2025-10-31' }],
  ['xmas', { title: 'Christmas', startDate: '2025-12-12' }],
  ['flop', { title: 'Flop', endDate: '2026-02-01' }],
]);

const entries = [
  e({ projectId: 'hal', direction: 'in', category: 'Product sales', amount: 11_000_000 }),
  e({ projectId: 'hal', category: 'Food & drinks', amount: 4_000_000, receipt: 'r1' }),
  e({ projectId: 'hal', category: 'Other', amount: 1_000_000 }),
  e({ projectId: 'xmas', direction: 'in', category: 'Product sales', amount: 5_000_000 }),
  e({ projectId: 'xmas', direction: 'in', category: 'Sponsorship', amount: 1_000_000 }),
  e({ projectId: 'xmas', category: 'Supplies', amount: 3_000_000 }),
  e({ projectId: 'flop', category: 'Printing', amount: 500_000 }),
  e({ date: '2026-10-10', category: 'Miscellaneous', amount: 150_000, receipt: 'r2' }),
  e({ category: 'Supplies', amount: 50_000 }),
];

describe('finance stats', () => {
  const s = financeStats(entries, projects);
  it('adds up revenue, costs, profit and margin', () => {
    expect(s.revenue).toBe(17_000_000);
    expect(s.costs).toBe(8_700_000);
    expect(s.profit).toBe(8_300_000);
    expect(s.margin).toBeCloseTo(8.3 / 17);
    expect(s.revenuePerCost).toBeCloseTo(17 / 8.7);
  });
  it('builds a profit and loss line per project, best first', () => {
    expect(s.byProject.map((r) => r.projectId)).toEqual(['hal', 'xmas', '', 'flop']);
    const hal = s.byProject[0];
    expect(hal).toMatchObject({ revenue: 11_000_000, costs: 5_000_000, profit: 6_000_000 });
    expect(hal.margin).toBeCloseTo(6 / 11);
    expect(hal.roi).toBeCloseTo(6 / 5);
    expect(s.best?.projectId).toBe('hal');
    expect(s.worst?.projectId).toBe('flop');
    expect(s.byProject.find((r) => r.projectId === 'flop')?.margin).toBeNull();
  });
  it('averages profit over the projects that earned money', () => {
    expect(s.earners).toBe(2);
    expect(s.avgProfitPerEarner).toBe((6_000_000 + 3_000_000) / 2);
    expect(s.topShare).toBeCloseTo(11 / 17);
  });
  it('splits revenue by source and costs by category', () => {
    expect(s.revenueBySource).toEqual([
      ['Product sales', 16_000_000],
      ['Sponsorship', 1_000_000],
    ]);
    expect(s.costsByCategory[0]).toEqual(['Food & drinks', 4_000_000]);
  });
  it('dates entries by their project when they have no date, with no gaps between months', () => {
    expect(effectiveDate(entries[0], projects)).toBe('2025-10-31');
    expect(effectiveDate(entries[7], projects)).toBe('2026-10-10');
    expect(s.months[0]).toMatchObject({ month: '2025-10', revenue: 11_000_000, costs: 5_000_000, balance: 6_000_000 });
    expect(s.months.map((m) => m.month)).toContain('2025-11');
    expect(s.months.at(-1)?.month).toBe('2026-10');
    expect(s.months.at(-1)?.balance).toBe(8_350_000);
    expect(s.undated).toBe(1);
  });
  it('tracks receipts and uncategorised spending', () => {
    expect(s.receipts.count).toBe(2);
    expect(s.receipts.of).toBe(6);
    expect(s.receipts.amountShare).toBeCloseTo(4.15 / 8.7);
    expect(s.uncategorised).toEqual({ count: 1, amount: 1_000_000 });
    expect(s.biggestCosts[0].amount).toBe(4_000_000);
  });
  it('copes with an empty ledger', () => {
    const z = financeStats([], projects);
    expect(z.margin).toBeNull();
    expect(z.months).toEqual([]);
    expect(z.best).toBeUndefined();
  });
});

describe('axis ticks', () => {
  it('rounds to clean steps', () => {
    expect(niceTicks(11_000_000)).toEqual([0, 5_000_000, 10_000_000, 15_000_000]);
    expect(niceTicks(0)).toEqual([0]);
    expect(niceRange(-2_000_000, 9_000_000)).toContain(0);
    expect(niceRange(-2_000_000, 9_000_000)[0]).toBeLessThanOrEqual(-2_000_000);
  });
});
