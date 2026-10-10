import { describe, it, expect } from 'vitest';
import { Evaluator, parseLooseNumber, shiftFormula, isErr, colToLetters, lettersToCol, adjustRefs, offsetAllRows, type EngineSheet } from './formula';

function sheet(name: string, grid: string[][]): EngineSheet {
  return {
    id: name,
    name,
    rowCount: grid.length,
    colCount: Math.max(...grid.map((r) => r.length), 1),
    raw: (r, c) => grid[r]?.[c] ?? '',
  };
}
function evalIn(grid: string[][], r: number, c: number, extra: EngineSheet[] = []) {
  const ev = new Evaluator({ sheets: [sheet('Main', grid), ...extra], today: '2026-10-10' });
  return ev.value(0, r, c);
}

describe('numbers', () => {
  it('parses VND and US formats', () => {
    expect(parseLooseNumber('1.250.000')).toBe(1250000);
    expect(parseLooseNumber('1,250,000')).toBe(1250000);
    expect(parseLooseNumber('1.250.000 ₫')).toBe(1250000);
    expect(parseLooseNumber('$12.50')).toBe(12.5);
    expect(parseLooseNumber('(500)')).toBe(-500);
    expect(parseLooseNumber('12%')).toBe(0.12);
    expect(parseLooseNumber('500k')).toBe(null);
    expect(parseLooseNumber('abc')).toBe(null);
    expect(parseLooseNumber('3.5')).toBe(3.5);
    expect(parseLooseNumber('250.000')).toBe(250000);
  });
  it('letters', () => {
    expect(colToLetters(0)).toBe('A');
    expect(colToLetters(25)).toBe('Z');
    expect(colToLetters(26)).toBe('AA');
    expect(lettersToCol('AA')).toBe(26);
  });
});

describe('formulas', () => {
  const g = [
    ['Food', '100000', 'Out'],
    ['Printing', '50.000', 'Out'],
    ['Sponsor', '1.000.000', 'In'],
    ['Food', '20000', 'Out'],
    ['=SUM(B1:B4)', '=SUMIF(A1:A4,"Food",B1:B4)', '=SUMIFS(B1:B4,C1:C4,"Out",B1:B4,">30000")'],
    ['=B3-SUMIF(C1:C4,"Out",B1:B4)', '=COUNTIF(A:A,"Food")', '=IF(A5>1000000,"over","ok")'],
    ['=AVERAGE(B1:B2)', '=1/0', '=IFERROR(B7,"none")'],
    ['=A8', '="Total: "&A5', '=ROUND(10/3,2)'],
    ['=VLOOKUP("Sponsor",A1:C4,2,FALSE)', '=-B1+5^2*2', '=Ledger!A1+Main!B1'],
    ["='Event budget'!B1*2", '=UNKNOWN(1)', '=SUM(A1:Z1)'],
  ];
  const extra = [sheet('Ledger', [['7']]), sheet('Event budget', [['x', '40']])];
  const v = (r: number, c: number) => evalIn(g, r, c, extra);
  it('sum and conditional sums', () => {
    expect(v(4, 0)).toBe(1170000);
    expect(v(4, 1)).toBe(120000);
    expect(v(4, 2)).toBe(150000);
    expect(v(5, 0)).toBe(830000);
    expect(v(5, 1)).toBe(2);
    expect(v(5, 2)).toBe('over');
  });
  it('errors', () => {
    expect(v(6, 0)).toBe(75000);
    expect(isErr(v(6, 1)) && (v(6, 1) as { code: string }).code).toBe('#DIV/0!');
    expect(v(6, 2)).toBe('none');
    expect(isErr(v(7, 0))).toBe(true); // self reference
    expect((v(9, 1) as { code: string }).code).toBe('#NAME?');
    expect((v(9, 2) as { code: string }).code).toBe('#REF!');
  });
  it('text, rounding, lookup, precedence, cross-sheet', () => {
    expect(v(7, 1)).toBe('Total: 1170000');
    expect(v(7, 2)).toBe(3.33);
    expect(v(8, 0)).toBe(1000000);
    expect(v(8, 1)).toBe(-100000 + 50);
    expect(v(8, 2)).toBe(100007);
    expect(v(9, 0)).toBe(80);
  });
  it('adjusts refs on insert and delete', () => {
    expect(adjustRefs('=SUM(F1:F30)+A5', 'Ledger', 'Ledger', 'row', 3, 2)).toBe('=SUM(F1:F32)+A7');
    expect(adjustRefs('=SUM(F1:F30)+A2', 'Ledger', 'Ledger', 'row', 3, 2)).toBe('=SUM(F1:F32)+A2');
    expect(adjustRefs('=A5+B9', 'Ledger', 'Ledger', 'row', 4, -1)).toBe('=#REF!+B8');
    expect(adjustRefs('=SUM(B2:B10)', 'Ledger', 'Ledger', 'row', 0, -3)).toBe('=SUM(B1:B7)');
    expect(adjustRefs('=Ledger!B2+B2', 'Budget', 'Ledger', 'row', 0, 1)).toBe('=Ledger!B3+B2');
    expect(adjustRefs("='My sheet'!C1*2", 'X', 'My sheet', 'col', 1, 1)).toBe("='My sheet'!D1*2");
    expect(adjustRefs('=SUMIF(C1:C9,"Out",F1:F9)', 'L', 'L', 'col', 3, -1)).toBe('=SUMIF(C1:C9,"Out",E1:E9)');
    expect(adjustRefs('=LOG10(A1)', 'L', 'L', 'row', 0, 1)).toBe('=LOG10(A2)');
    expect(offsetAllRows('=SUM($B$1:B4)+"A1"', 1)).toBe('=SUM($B$2:B5)+"A1"');
  });
  it('shifts relative refs only', () => {
    expect(shiftFormula('=SUM(B1:B4)+$C$1+"A1"', 1, 1)).toBe('=SUM(C2:C5)+$C$1+"A1"');
    expect(shiftFormula('=Ledger!A1', 2, 0)).toBe('=Ledger!A3');
  });
});
