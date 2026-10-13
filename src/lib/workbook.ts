import { useMemo } from 'react';
import { Evaluator, colToLetters, defaultLiteral, isErr, parseLooseNumber, type EngineSheet, type Scalar } from './formula';
import type { CalcOp, Column, ColumnCalc, Row, Sheet } from './types';
import { useStore } from './store';

export function literalFor(col: Column | undefined, raw: string): Scalar {
  if (raw === '') return null;
  if (!col) return defaultLiteral(raw);
  if (col.type === 'number' || col.type === 'currency') {
    const n = parseLooseNumber(raw);
    return n === null ? raw : n;
  }
  if (col.type === 'text' || col.type === 'select' || col.type === 'project' || col.type === 'member' || col.type === 'receipt' || col.type === 'date')
    return col.type === 'text' ? defaultLiteral(raw) : raw;
  return defaultLiteral(raw);
}

export const CALC_LABEL: Record<CalcOp, string> = {
  mul: 'multiplied by',
  add: 'plus',
  sub: 'minus',
  div: 'divided by',
  running: 'Running total of',
  balance: 'Running balance (money in minus money out)',
};

/** Plain-language description of a calculated column, e.g. "Quantity × Unit cost". */
export function describeCalc(sheet: Sheet, calc: ColumnCalc): string {
  const name = (key?: string) => {
    const i = sheet.columns.findIndex((c) => c.key === key);
    return i < 0 ? '?' : sheet.columns[i].name || `column ${colToLetters(i)}`;
  };
  switch (calc.op) {
    case 'mul':
      return `${name(calc.a)} × ${name(calc.b)}`;
    case 'add':
      return `${name(calc.a)} + ${name(calc.b)}`;
    case 'sub':
      return `${name(calc.a)} − ${name(calc.b)}`;
    case 'div':
      return `${name(calc.a)} ÷ ${name(calc.b)}`;
    case 'running':
      return `Running total of ${name(calc.a)}`;
    case 'balance':
      return 'Running balance: money in minus money out';
  }
}

/** The formula a calculated column stands for in row r, or '' when the row is empty. */
export function calcFormula(sheet: Sheet, rows: Row[], r: number, calc: ColumnCalc): string {
  const cols = sheet.columns;
  const idx = (key?: string) => cols.findIndex((c) => c.key === key);
  const cell = (i: number) => (i < 0 ? '' : rows[r]?.cells?.[cols[i].key] ?? '');
  const L = (i: number) => colToLetters(i);
  const n = r + 1;
  const rowHasData = Object.entries(rows[r]?.cells ?? {}).some(([k, v]) => v && !cols.find((c) => c.key === k)?.calc);
  switch (calc.op) {
    case 'mul':
    case 'add':
    case 'sub':
    case 'div': {
      const ia = idx(calc.a);
      const ib = idx(calc.b);
      if (ia < 0 || ib < 0 || (!cell(ia) && !cell(ib))) return '';
      const a = `${L(ia)}${n}`;
      const b = `${L(ib)}${n}`;
      if (calc.op === 'div') return `=IFERROR(${a}/${b},"")`;
      return `=${a}${calc.op === 'mul' ? '*' : calc.op === 'add' ? '+' : '-'}${b}`;
    }
    case 'running': {
      const ia = idx(calc.a);
      if (ia < 0 || !rowHasData) return '';
      return `=SUM(${L(ia)}$1:${L(ia)}${n})`;
    }
    case 'balance': {
      const id = cols.findIndex((c) => c.role === 'direction');
      const im = cols.findIndex((c) => c.role === 'amount');
      if (id < 0 || im < 0 || !rowHasData) return '';
      const d = `${L(id)}$1:${L(id)}${n}`;
      const m = `${L(im)}$1:${L(im)}${n}`;
      return `=SUMIF(${d},"In",${m})-SUMIF(${d},"Out",${m})`;
    }
  }
}

/** What a cell holds: what was typed, or the formula of its calculated column. */
export function cellRaw(sheet: Sheet, rows: Row[], r: number, c: number): string {
  const col = sheet.columns[c];
  if (!col) return '';
  if (col.calc) return calcFormula(sheet, rows, r, col.calc);
  return rows[r]?.cells?.[col.key] ?? '';
}

export function toEngineSheet(sheet: Sheet, rows: Row[]): EngineSheet {
  return {
    id: sheet.id,
    name: sheet.name,
    colCount: sheet.columns.length,
    rowCount: rows.length,
    raw: (r, c) => cellRaw(sheet, rows, r, c),
    parseLiteral: (raw, c) => literalFor(sheet.columns[c], raw),
  };
}

export interface WorkbookView {
  evaluator: Evaluator;
  sheetIndex: Map<string, number>;
  value: (sheetId: string, row: number, col: number) => Scalar;
}

export function useWorkbook(): WorkbookView {
  const { sheets, rows } = useStore();
  return useMemo(() => {
    const engineSheets = sheets.map((s) => toEngineSheet(s, rows.get(s.id) ?? []));
    const evaluator = new Evaluator({ sheets: engineSheets });
    const sheetIndex = new Map(sheets.map((s, i) => [s.id, i]));
    return {
      evaluator,
      sheetIndex,
      value: (sheetId, r, c) => {
        const i = sheetIndex.get(sheetId);
        return i === undefined ? null : evaluator.value(i, r, c);
      },
    };
  }, [sheets, rows]);
}

export interface LedgerEntry {
  sheetId: string;
  rowId: string;
  date: string;
  description: string;
  direction: 'in' | 'out';
  category: string;
  projectId: string;
  amount: number; // always positive
  payer: string;
  receipt: string;
}

/** Reads every ledger sheet through the formula engine and returns its money movements. */
export function useLedger(): { entries: LedgerEntry[]; income: number; expense: number; balance: number } {
  const { sheets, rows } = useStore();
  const wb = useWorkbook();
  return useMemo(() => {
    const entries: LedgerEntry[] = [];
    for (const sheet of sheets) {
      if (!sheet.isLedger) continue;
      const roleIdx = (role: string) => sheet.columns.findIndex((c) => c.role === role);
      const iAmt = roleIdx('amount');
      if (iAmt < 0) continue;
      const iDir = roleIdx('direction');
      const iDate = roleIdx('date');
      const iDesc = roleIdx('description');
      const iCat = roleIdx('category');
      const iProj = roleIdx('project');
      const iPayer = roleIdx('payer');
      const iRcpt = roleIdx('receipt');
      const list = rows.get(sheet.id) ?? [];
      list.forEach((row, r) => {
        const v = wb.value(sheet.id, r, iAmt);
        if (typeof v !== 'number' || isErr(v) || v === 0) return;
        const txt = (i: number) => {
          if (i < 0) return '';
          const x = wb.value(sheet.id, r, i);
          return x === null || isErr(x) ? '' : String(x);
        };
        const dirRaw = txt(iDir).trim().toLowerCase();
        let direction: 'in' | 'out';
        if (dirRaw === 'in' || dirRaw === 'income' || dirRaw === 'thu') direction = 'in';
        else if (dirRaw === 'out' || dirRaw === 'expense' || dirRaw === 'chi') direction = 'out';
        else {
          // a formula amount with no In/Out is a summary row (e.g. "Total out"), not money moving
          const amtRaw = row.cells?.[sheet.columns[iAmt].key] ?? '';
          if (iDir >= 0 && amtRaw.startsWith('=')) return;
          direction = v < 0 ? 'out' : 'in';
        }
        entries.push({
          sheetId: sheet.id,
          rowId: row.id,
          date: txt(iDate),
          description: txt(iDesc),
          direction,
          category: txt(iCat),
          projectId: txt(iProj),
          amount: Math.abs(v),
          payer: txt(iPayer),
          receipt: txt(iRcpt),
        });
      });
    }
    const income = entries.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0);
    return { entries, income, expense, balance: income - expense };
  }, [sheets, rows, wb]);
}

export function projectMoney(entries: LedgerEntry[], projectId: string) {
  let spent = 0;
  let raised = 0;
  for (const e of entries) {
    if (e.projectId !== projectId) continue;
    if (e.direction === 'out') spent += e.amount;
    else raised += e.amount;
  }
  return { spent, raised };
}
