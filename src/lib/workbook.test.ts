import { describe, expect, it } from 'vitest';
import { Evaluator } from './formula';
import { calcFormula, cellRaw, describeCalc, toEngineSheet } from './workbook';
import type { Column, Row, Sheet } from './types';

const col = (key: string, over: Partial<Column> = {}): Column => ({ key, name: key, type: 'number', width: 100, ...over });
const row = (i: number, cells: Record<string, string>): Row => ({ id: `r${i}`, order: i, cells, updatedAt: 0, updatedBy: '' });

describe('calculated columns', () => {
  const budget: Sheet = {
    id: 's1',
    name: 'Budget',
    order: 0,
    isLedger: false,
    createdAt: 0,
    createdBy: '',
    columns: [col('item', { type: 'text', name: 'Item' }), col('qty', { name: 'Quantity' }), col('cost', { name: 'Unit cost', type: 'currency' }), col('total', { name: 'Total', type: 'currency', calc: { op: 'mul', a: 'qty', b: 'cost' } }), col('run', { calc: { op: 'running', a: 'total' } })],
  };
  const rows = [row(0, { item: 'Cups', qty: '100', cost: '2000' }), row(1, { item: 'Ice', qty: '5', cost: '15000' }), row(2, {})];
  const ev = new Evaluator({ sheets: [toEngineSheet(budget, rows)] });

  it('multiplies per row without anyone writing a formula', () => {
    expect(cellRaw(budget, rows, 0, 3)).toBe('=B1*C1');
    expect(ev.value(0, 0, 3)).toBe(200_000);
    expect(ev.value(0, 1, 3)).toBe(75_000);
  });
  it('leaves empty rows empty', () => {
    expect(cellRaw(budget, rows, 2, 3)).toBe('');
    expect(cellRaw(budget, rows, 2, 4)).toBe('');
  });
  it('keeps a running total', () => {
    expect(ev.value(0, 1, 4)).toBe(275_000);
  });
  it('describes itself in plain words', () => {
    expect(describeCalc(budget, budget.columns[3].calc!)).toBe('Quantity × Unit cost');
  });
  it('runs a ledger balance from in and out', () => {
    const ledger: Sheet = {
      ...budget,
      id: 's2',
      name: 'Ledger',
      isLedger: true,
      columns: [col('dir', { type: 'select', role: 'direction' }), col('amt', { type: 'currency', role: 'amount' }), col('bal', { type: 'currency', calc: { op: 'balance' } })],
    };
    const lr = [row(0, { dir: 'In', amt: '1000000' }), row(1, { dir: 'Out', amt: '300000' }), row(2, { dir: 'out', amt: '50000' })];
    const e2 = new Evaluator({ sheets: [toEngineSheet(ledger, lr)] });
    expect(calcFormula(ledger, lr, 1, { op: 'balance' })).toBe('=SUMIF(A$1:A2,"In",B$1:B2)-SUMIF(A$1:A2,"Out",B$1:B2)');
    expect(e2.value(0, 0, 2)).toBe(1_000_000);
    expect(e2.value(0, 1, 2)).toBe(700_000);
    expect(e2.value(0, 2, 2)).toBe(650_000);
  });
});
