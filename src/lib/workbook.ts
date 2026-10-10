import { useMemo } from 'react';
import { Evaluator, defaultLiteral, isErr, parseLooseNumber, type EngineSheet, type Scalar } from './formula';
import type { Column, Row, Sheet } from './types';
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

export function toEngineSheet(sheet: Sheet, rows: Row[]): EngineSheet {
  return {
    id: sheet.id,
    name: sheet.name,
    colCount: sheet.columns.length,
    rowCount: rows.length,
    raw: (r, c) => rows[r]?.cells?.[sheet.columns[c]?.key] ?? '',
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
        else direction = v < 0 ? 'out' : 'in';
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
