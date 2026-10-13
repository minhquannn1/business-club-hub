/*
 * A small spreadsheet formula engine.
 * Supports: numbers, strings, booleans, cell refs (A1, $A$1), ranges (A1:B5, A:A),
 * cross-sheet refs (Expenses!B2, 'Event budget'!A1:A9), operators + - * / ^ & % = <> < > <= >=,
 * and the functions listed in FUNCTIONS below.
 */

export type ErrCode = '#REF!' | '#NAME?' | '#DIV/0!' | '#VALUE!' | '#CYCLE!' | '#ERROR!' | '#N/A';
export class FErr {
  constructor(public code: ErrCode, public msg = '') {}
  toString() {
    return this.code;
  }
}
export type Scalar = number | string | boolean | null | FErr;
export type RangeVal = { kind: 'range'; values: Scalar[][] };
export type Val = Scalar | RangeVal;

export interface EngineSheet {
  id: string;
  name: string;
  colCount: number;
  rowCount: number;
  /** raw text at zero-based (row, col); '' when empty */
  raw(row: number, col: number): string;
  /** how to read a non-formula raw value */
  parseLiteral?(raw: string, col: number): Scalar;
}

/* ---------- addressing helpers ---------- */

export function colToLetters(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
export function lettersToCol(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function cellName(row: number, col: number) {
  return colToLetters(col) + (row + 1);
}

/* ---------- tokenizer ---------- */

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'ref'; sheet?: string; a: string; b?: string }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; } | { t: ')'; } | { t: ','; };

const REF_PART = /^\$?[A-Za-z]{1,3}\$?\d+|^\$?[A-Za-z]{1,3}(?=:)/;

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const peekRef = (s: string): { a: string; b?: string; len: number } | null => {
    // A1, A1:B2, A:A
    const m = /^(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/.exec(s);
    if (m && !/^[A-Za-z]{1,3}\d+[A-Za-z_(]/.test(s.slice(0, m[0].length + 1)))
      return { a: m[1].replace(/\$/g, ''), b: m[2]?.replace(/\$/g, ''), len: m[0].length };
    const w = /^(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![A-Za-z0-9_])/.exec(s);
    if (w) return { a: w[1].replace(/\$/g, ''), b: w[2].replace(/\$/g, ''), len: w[0].length };
    return null;
  };
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      toks.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length) {
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            s += '"';
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      if (j >= src.length) throw new FErr('#ERROR!', 'Unclosed text');
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (ch === "'") {
      // quoted sheet name
      const end = src.indexOf("'!", i + 1);
      if (end < 0) throw new FErr('#ERROR!', 'Bad sheet reference');
      const sheet = src.slice(i + 1, end);
      const r = peekRef(src.slice(end + 2));
      if (!r) throw new FErr('#REF!', 'Bad reference');
      toks.push({ t: 'ref', sheet, a: r.a, b: r.b });
      i = end + 2 + r.len;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      // sheet!ref, function name, bool, or ref
      const sm = /^([A-Za-z_][A-Za-z0-9_]*)!/.exec(src.slice(i));
      if (sm) {
        const r = peekRef(src.slice(i + sm[0].length));
        if (!r) throw new FErr('#REF!', 'Bad reference');
        toks.push({ t: 'ref', sheet: sm[1], a: r.a, b: r.b });
        i += sm[0].length + r.len;
        continue;
      }
      const r = peekRef(src.slice(i));
      if (r && REF_PART.test(src.slice(i))) {
        toks.push({ t: 'ref', a: r.a, b: r.b });
        i += r.len;
        continue;
      }
      const wm = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
      const word = wm[0].toUpperCase();
      i += wm[0].length;
      let k = i;
      while (/\s/.test(src[k] ?? '')) k++;
      if (src[k] === '(') {
        toks.push({ t: 'fn', v: word });
        continue;
      }
      if (word === 'TRUE' || word === 'FALSE') {
        toks.push({ t: 'bool', v: word === 'TRUE' });
        continue;
      }
      throw new FErr('#NAME?', `Unknown name ${wm[0]}`);
    }
    const two = src.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      toks.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^&=<>%'.includes(ch)) {
      toks.push({ t: 'op', v: ch });
      i++;
      continue;
    }
    if (ch === '(') toks.push({ t: '(' });
    else if (ch === ')') toks.push({ t: ')' });
    else if (ch === ',' || ch === ';') toks.push({ t: ',' });
    else throw new FErr('#ERROR!', `Unexpected "${ch}"`);
    i++;
  }
  return toks;
}

/* ---------- parser (to AST) ---------- */

type Node =
  | { k: 'lit'; v: Scalar }
  | { k: 'ref'; sheet?: string; a: string; b?: string }
  | { k: 'un'; op: string; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'pct'; e: Node }
  | { k: 'call'; name: string; args: Node[] };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (...ops: string[]) => {
    const t = toks[p];
    return t && t.t === 'op' && ops.includes(t.v);
  };
  const expect = (t: Tok['t']) => {
    if (toks[p]?.t !== t) throw new FErr('#ERROR!', `Expected ${t}`);
    p++;
  };
  const comparison = (): Node => {
    let l = concat();
    while (isOp('=', '<>', '<', '>', '<=', '>=')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: concat() };
    }
    return l;
  };
  const concat = (): Node => {
    let l = additive();
    while (isOp('&')) {
      p++;
      l = { k: 'bin', op: '&', l, r: additive() };
    }
    return l;
  };
  const additive = (): Node => {
    let l = term();
    while (isOp('+', '-')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: term() };
    }
    return l;
  };
  const term = (): Node => {
    let l = power();
    while (isOp('*', '/')) {
      const op = (toks[p++] as { v: string }).v;
      l = { k: 'bin', op, l, r: power() };
    }
    return l;
  };
  const power = (): Node => {
    let l = unary();
    while (isOp('^')) {
      p++;
      l = { k: 'bin', op: '^', l, r: unary() };
    }
    return l;
  };
  const unary = (): Node => {
    if (isOp('-', '+')) {
      const op = (toks[p++] as { v: string }).v;
      return { k: 'un', op, e: unary() };
    }
    let e = primary();
    while (isOp('%')) {
      p++;
      e = { k: 'pct', e };
    }
    return e;
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new FErr('#ERROR!', 'Formula ends too early');
    p++;
    switch (t.t) {
      case 'num':
        return { k: 'lit', v: t.v };
      case 'str':
        return { k: 'lit', v: t.v };
      case 'bool':
        return { k: 'lit', v: t.v };
      case 'ref':
        return { k: 'ref', sheet: t.sheet, a: t.a, b: t.b };
      case '(': {
        const e = comparison();
        expect(')');
        return e;
      }
      case 'fn': {
        expect('(');
        const args: Node[] = [];
        if (peek()?.t !== ')') {
          for (;;) {
            if (peek()?.t === ',' || peek()?.t === ')') args.push({ k: 'lit', v: null });
            else args.push(comparison());
            if (peek()?.t === ',') {
              p++;
              continue;
            }
            break;
          }
        }
        expect(')');
        return { k: 'call', name: t.v, args };
      }
      default:
        throw new FErr('#ERROR!', 'Unexpected symbol');
    }
  };
  const root = comparison();
  if (p < toks.length) throw new FErr('#ERROR!', 'Unexpected extra input');
  return root;
}

const astCache = new Map<string, Node | FErr>();
export function compile(formula: string): Node | FErr {
  const hit = astCache.get(formula);
  if (hit) return hit;
  let res: Node | FErr;
  try {
    res = parse(tokenize(formula.replace(/^=/, '')));
  } catch (e) {
    res = e instanceof FErr ? e : new FErr('#ERROR!', String(e));
  }
  if (astCache.size > 5000) astCache.clear();
  astCache.set(formula, res);
  return res;
}

/* ---------- coercion ---------- */

export function isErr(v: unknown): v is FErr {
  return v instanceof FErr;
}
function toNum(v: Scalar): number | FErr {
  if (isErr(v)) return v;
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseLooseNumber(v);
  return n === null ? new FErr('#VALUE!', `"${v}" is not a number`) : n;
}
function toStr(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(+v.toFixed(10));
  return String(v);
}
function toBool(v: Scalar): boolean | FErr {
  if (isErr(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (v === null || v === '') return false;
  const u = v.toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  return new FErr('#VALUE!');
}

const SHORTHAND: [RegExp, number][] = [
  [/^(.*\d)\s*(k|nghìn|ngàn|ng)$/i, 1e3],
  [/^(.*\d)\s*(tr|triệu|trieu|m|mil)$/i, 1e6],
  [/^(.*\d)\s*(tỷ|tỉ|ty|ti|b|bn)$/i, 1e9],
];

/** What someone typed into an amount: everything parseLooseNumber reads, plus short forms like 50k, 1.5tr, 2m, 1 tỷ. */
export function parseAmountInput(s: string): number | null {
  const t = s.replace(/[₫đ$]|VND/gi, '').trim();
  for (const [re, mult] of SHORTHAND) {
    const m = re.exec(t);
    if (m) {
      const base = parseLooseNumber(m[1]);
      return base === null ? null : Math.round(base * mult * 100) / 100;
    }
  }
  return parseLooseNumber(s);
}

/** Accepts 1,250,000 / 1.250.000 / 1 250 000 ₫ / $12.50 / (500) / 12% */
export function parseLooseNumber(s: string): number | null {
  let t = s.trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  const pct = t.endsWith('%');
  if (pct) t = t.slice(0, -1);
  t = t.replace(/[₫$€£đ\s]|VND|USD/gi, '');
  if (t.startsWith('-')) {
    neg = !neg;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const dots = (t.match(/\./g) || []).length;
  const commas = (t.match(/,/g) || []).length;
  if (dots > 1 && commas === 0) t = t.replace(/\./g, '');
  else if (commas > 1 && dots === 0) t = t.replace(/,/g, '');
  else if (dots && commas) {
    // whichever comes last is the decimal separator
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (commas === 1) {
    const [, dec] = t.split(',');
    t = dec.length === 3 ? t.replace(',', '') : t.replace(',', '.');
  } else if (dots === 1) {
    const [, dec] = t.split('.');
    if (dec.length === 3 && t.split('.')[0].length <= 3 && t.split('.')[0] !== '0') t = t.replace('.', '');
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const v = pct ? n / 100 : n;
  return neg ? -v : v;
}

function flatten(vals: Val[]): Scalar[] {
  const out: Scalar[] = [];
  for (const v of vals) {
    if (v && typeof v === 'object' && 'kind' in v) for (const row of v.values) out.push(...row);
    else out.push(v as Scalar);
  }
  return out;
}

/* ---------- criteria (SUMIF, COUNTIF...) ---------- */

function makeCriterion(c: Scalar): (v: Scalar) => boolean {
  if (typeof c === 'number' || typeof c === 'boolean') return (v) => v === c || (typeof v === 'string' && parseLooseNumber(v) === c);
  const s = toStr(c);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!;
  const op = m[1] || '=';
  const rhs = m[2];
  const rn = parseLooseNumber(rhs);
  const wildcard = /[*?]/.test(rhs);
  const re = wildcard
    ? new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
    : null;
  return (v) => {
    if (isErr(v)) return false;
    const vn = typeof v === 'number' ? v : typeof v === 'string' ? parseLooseNumber(v) : null;
    if (rn !== null && vn !== null && rhs.trim() !== '') {
      switch (op) {
        case '=':
          return vn === rn;
        case '<>':
          return vn !== rn;
        case '<':
          return vn < rn;
        case '>':
          return vn > rn;
        case '<=':
          return vn <= rn;
        case '>=':
          return vn >= rn;
      }
    }
    const vs = toStr(v).toLowerCase();
    const rs = rhs.toLowerCase();
    switch (op) {
      case '=':
        return re ? re.test(toStr(v)) : vs === rs;
      case '<>':
        return re ? !re.test(toStr(v)) : vs !== rs;
      case '<':
        return vs !== '' && vs < rs;
      case '>':
        return vs !== '' && vs > rs;
      case '<=':
        return vs !== '' && vs <= rs;
      case '>=':
        return vs !== '' && vs >= rs;
    }
    return false;
  };
}

/* ---------- functions ---------- */

type Fn = (args: Val[], ctx: { today: string }) => Scalar;

const nums = (args: Val[]): number[] | FErr => {
  const out: number[] = [];
  for (const a of args) {
    if (a && typeof a === 'object' && 'kind' in a) {
      for (const row of a.values)
        for (const v of row) {
          if (isErr(v)) return v;
          if (typeof v === 'number') out.push(v);
        }
    } else {
      const n = toNum(a as Scalar);
      if (isErr(n)) return n;
      out.push(n);
    }
  }
  return out;
};
const scalar = (v: Val | undefined): Scalar => {
  if (v === undefined) return null;
  if (v && typeof v === 'object' && 'kind' in v) return v.values[0]?.[0] ?? null;
  return v as Scalar;
};
const round = (n: number, d: number, mode: 'round' | 'up' | 'down') => {
  const f = Math.pow(10, d);
  const x = n * f;
  const r = mode === 'round' ? Math.sign(x) * Math.round(Math.abs(x) + 1e-9) : mode === 'up' ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9) : Math.trunc(x);
  return r / f;
};
const rangeOf = (v: Val | undefined): Scalar[][] | FErr => {
  if (v && typeof v === 'object' && 'kind' in v) return v.values;
  if (isErr(v)) return v as FErr;
  return [[(v ?? null) as Scalar]];
};
const sumIfs = (sumR: Scalar[][], pairs: [Scalar[][], Scalar][], mode: 'sum' | 'count' | 'avg'): Scalar => {
  const preds = pairs.map(([r, c]) => [r, makeCriterion(c)] as const);
  let total = 0;
  let count = 0;
  for (let i = 0; i < sumR.length; i++)
    for (let j = 0; j < (sumR[i]?.length ?? 0); j++) {
      if (!preds.every(([r, f]) => f(r[i]?.[j] ?? null))) continue;
      count++;
      const v = sumR[i][j];
      if (typeof v === 'number') total += v;
      else if (typeof v === 'string') {
        const n = parseLooseNumber(v);
        if (n !== null) total += n;
      }
    }
  if (mode === 'count') return count;
  if (mode === 'avg') return count ? total / count : new FErr('#DIV/0!');
  return total;
};

export const FUNCTIONS: Record<string, Fn> = {
  SUM: (a) => {
    const n = nums(a);
    return isErr(n) ? n : n.reduce((s, x) => s + x, 0);
  },
  AVERAGE: (a) => {
    const n = nums(a);
    if (isErr(n)) return n;
    return n.length ? n.reduce((s, x) => s + x, 0) / n.length : new FErr('#DIV/0!');
  },
  MIN: (a) => {
    const n = nums(a);
    return isErr(n) ? n : n.length ? Math.min(...n) : 0;
  },
  MAX: (a) => {
    const n = nums(a);
    return isErr(n) ? n : n.length ? Math.max(...n) : 0;
  },
  MEDIAN: (a) => {
    const n = nums(a);
    if (isErr(n)) return n;
    if (!n.length) return new FErr('#N/A');
    const s = [...n].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  },
  PRODUCT: (a) => {
    const n = nums(a);
    return isErr(n) ? n : n.reduce((s, x) => s * x, 1);
  },
  COUNT: (a) => flatten(a).filter((v) => typeof v === 'number').length,
  COUNTA: (a) => flatten(a).filter((v) => v !== null && v !== '').length,
  COUNTBLANK: (a) => flatten(a).filter((v) => v === null || v === '').length,
  SUMIF: (a) => {
    const r = rangeOf(a[0]);
    if (isErr(r)) return r;
    const s = a[2] !== undefined ? rangeOf(a[2]) : r;
    if (isErr(s)) return s;
    return sumIfs(s, [[r, scalar(a[1])]], 'sum');
  },
  SUMIFS: (a) => {
    const s = rangeOf(a[0]);
    if (isErr(s)) return s;
    const pairs: [Scalar[][], Scalar][] = [];
    for (let i = 1; i + 1 < a.length; i += 2) {
      const r = rangeOf(a[i]);
      if (isErr(r)) return r;
      pairs.push([r, scalar(a[i + 1])]);
    }
    return sumIfs(s, pairs, 'sum');
  },
  COUNTIF: (a) => {
    const r = rangeOf(a[0]);
    if (isErr(r)) return r;
    return sumIfs(r, [[r, scalar(a[1])]], 'count');
  },
  COUNTIFS: (a) => {
    const first = rangeOf(a[0]);
    if (isErr(first)) return first;
    const pairs: [Scalar[][], Scalar][] = [];
    for (let i = 0; i + 1 < a.length; i += 2) {
      const r = rangeOf(a[i]);
      if (isErr(r)) return r;
      pairs.push([r, scalar(a[i + 1])]);
    }
    return sumIfs(first, pairs, 'count');
  },
  AVERAGEIF: (a) => {
    const r = rangeOf(a[0]);
    if (isErr(r)) return r;
    const s = a[2] !== undefined ? rangeOf(a[2]) : r;
    if (isErr(s)) return s;
    return sumIfs(s, [[r, scalar(a[1])]], 'avg');
  },
  IF: (a) => {
    const c = toBool(scalar(a[0]));
    if (isErr(c)) return c;
    return c ? scalar(a[1]) ?? true : a.length > 2 ? scalar(a[2]) : false;
  },
  IFERROR: (a) => {
    const v = scalar(a[0]);
    return isErr(v) ? scalar(a[1]) : v;
  },
  AND: (a) => {
    for (const v of flatten(a)) {
      const b = toBool(v);
      if (isErr(b)) return b;
      if (!b) return false;
    }
    return true;
  },
  OR: (a) => {
    for (const v of flatten(a)) {
      const b = toBool(v);
      if (isErr(b)) return b;
      if (b) return true;
    }
    return false;
  },
  NOT: (a) => {
    const b = toBool(scalar(a[0]));
    return isErr(b) ? b : !b;
  },
  ROUND: (a) => {
    const n = toNum(scalar(a[0]));
    const d = toNum(scalar(a[1]) ?? 0);
    return isErr(n) ? n : isErr(d) ? d : round(n, d, 'round');
  },
  ROUNDUP: (a) => {
    const n = toNum(scalar(a[0]));
    const d = toNum(scalar(a[1]) ?? 0);
    return isErr(n) ? n : isErr(d) ? d : round(n, d, 'up');
  },
  ROUNDDOWN: (a) => {
    const n = toNum(scalar(a[0]));
    const d = toNum(scalar(a[1]) ?? 0);
    return isErr(n) ? n : isErr(d) ? d : round(n, d, 'down');
  },
  ABS: (a) => {
    const n = toNum(scalar(a[0]));
    return isErr(n) ? n : Math.abs(n);
  },
  CONCAT: (a) => flatten(a).map(toStr).join(''),
  CONCATENATE: (a) => flatten(a).map(toStr).join(''),
  LEN: (a) => toStr(scalar(a[0])).length,
  UPPER: (a) => toStr(scalar(a[0])).toUpperCase(),
  LOWER: (a) => toStr(scalar(a[0])).toLowerCase(),
  TRIM: (a) => toStr(scalar(a[0])).trim().replace(/\s+/g, ' '),
  TODAY: (_a, ctx) => ctx.today,
  VLOOKUP: (a) => {
    const key = scalar(a[0]);
    const r = rangeOf(a[1]);
    if (isErr(r)) return r;
    const idx = toNum(scalar(a[2]));
    if (isErr(idx)) return idx;
    if (idx < 1 || idx > (r[0]?.length ?? 0)) return new FErr('#REF!');
    const match = makeCriterion(key);
    for (const row of r) if (match(row[0])) return row[idx - 1] ?? null;
    return new FErr('#N/A');
  },
};

/* ---------- evaluation ---------- */

export interface Workbook {
  sheets: EngineSheet[];
  today?: string;
}

export class Evaluator {
  private memo = new Map<string, Scalar>();
  private visiting = new Set<string>();
  private byName = new Map<string, number>();
  private today: string;
  constructor(private wb: Workbook) {
    wb.sheets.forEach((s, i) => this.byName.set(s.name.toLowerCase(), i));
    this.today = wb.today ?? new Date().toISOString().slice(0, 10);
  }

  value(sheetIdx: number, row: number, col: number): Scalar {
    const key = `${sheetIdx}:${row}:${col}`;
    if (this.memo.has(key)) return this.memo.get(key)!;
    const sheet = this.wb.sheets[sheetIdx];
    if (!sheet || row < 0 || col < 0 || col >= sheet.colCount) return new FErr('#REF!');
    if (row >= sheet.rowCount) return null;
    const raw = sheet.raw(row, col);
    let v: Scalar;
    if (raw.startsWith('=') && raw.length > 1) {
      if (this.visiting.has(key)) return new FErr('#CYCLE!', 'This formula refers to itself');
      this.visiting.add(key);
      const ast = compile(raw);
      try {
        v = isErr(ast) ? ast : this.scalarOf(this.eval(ast, sheetIdx));
      } catch (e) {
        v = e instanceof FErr ? e : new FErr('#ERROR!', String(e));
      }
      this.visiting.delete(key);
    } else {
      v = sheet.parseLiteral ? sheet.parseLiteral(raw, col) : defaultLiteral(raw);
    }
    this.memo.set(key, v);
    return v;
  }

  private scalarOf(v: Val): Scalar {
    if (v && typeof v === 'object' && 'kind' in v) {
      if (v.values.length === 1 && v.values[0].length === 1) return v.values[0][0];
      return new FErr('#VALUE!', 'A range cannot go into one cell; wrap it in SUM()');
    }
    return v as Scalar;
  }

  private resolveSheet(name: string | undefined, current: number): number {
    if (name === undefined) return current;
    const idx = this.byName.get(name.toLowerCase());
    if (idx === undefined) throw new FErr('#REF!', `No sheet named ${name}`);
    return idx;
  }

  private parseAddr(a: string): { row: number | null; col: number } {
    const m = /^([A-Za-z]+)(\d+)?$/.exec(a)!;
    return { col: lettersToCol(m[1]), row: m[2] ? parseInt(m[2], 10) - 1 : null };
  }

  private eval(n: Node, si: number): Val {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'ref': {
        const s = this.resolveSheet(n.sheet, si);
        const sheet = this.wb.sheets[s];
        const a = this.parseAddr(n.a);
        if (!n.b) {
          if (a.row === null) throw new FErr('#REF!');
          return this.value(s, a.row, a.col);
        }
        const b = this.parseAddr(n.b);
        const r0 = a.row ?? 0;
        const r1 = b.row ?? Math.max(sheet.rowCount - 1, 0);
        const c0 = Math.min(a.col, b.col);
        const c1 = Math.max(a.col, b.col);
        const rs = Math.min(r0, r1);
        const re = Math.min(Math.max(r0, r1), Math.max(sheet.rowCount - 1, rs));
        if (c1 >= sheet.colCount) throw new FErr('#REF!', 'Range goes past the last column');
        const values: Scalar[][] = [];
        for (let r = rs; r <= re; r++) {
          const row: Scalar[] = [];
          for (let c = c0; c <= c1; c++) row.push(this.value(s, r, c));
          values.push(row);
        }
        return { kind: 'range', values };
      }
      case 'un': {
        const v = toNum(this.scalarOf(this.eval(n.e, si)));
        if (isErr(v)) return v;
        return n.op === '-' ? -v : v;
      }
      case 'pct': {
        const v = toNum(this.scalarOf(this.eval(n.e, si)));
        return isErr(v) ? v : v / 100;
      }
      case 'bin': {
        const l = this.scalarOf(this.eval(n.l, si));
        const r = this.scalarOf(this.eval(n.r, si));
        if (isErr(l)) return l;
        if (isErr(r)) return r;
        if (n.op === '&') return toStr(l) + toStr(r);
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.op)) return compare(n.op, l, r);
        const a = toNum(l);
        const b = toNum(r);
        if (isErr(a)) return a;
        if (isErr(b)) return b;
        switch (n.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return b === 0 ? new FErr('#DIV/0!', 'Division by zero') : a / b;
          case '^':
            return Math.pow(a, b);
        }
        return new FErr('#ERROR!');
      }
      case 'call': {
        const fn = FUNCTIONS[n.name];
        if (!fn) throw new FErr('#NAME?', `Unknown function ${n.name}`);
        // lazy IF / IFERROR so the unused branch can't raise
        if (n.name === 'IF') {
          const c = toBool(this.scalarOf(this.eval(n.args[0] ?? { k: 'lit', v: null }, si)));
          if (isErr(c)) return c;
          if (c) return n.args[1] ? this.scalarOf(this.eval(n.args[1], si)) : true;
          return n.args[2] ? this.scalarOf(this.eval(n.args[2], si)) : false;
        }
        if (n.name === 'IFERROR') {
          let v: Scalar;
          try {
            v = this.scalarOf(this.eval(n.args[0], si));
          } catch (e) {
            v = e instanceof FErr ? e : new FErr('#ERROR!');
          }
          return isErr(v) ? (n.args[1] ? this.scalarOf(this.eval(n.args[1], si)) : '') : v;
        }
        const args = n.args.map((x) => this.eval(x, si));
        return fn(args, { today: this.today });
      }
    }
  }
}

function compare(op: string, l: Scalar, r: Scalar): boolean {
  const ln = typeof l === 'number' ? l : null;
  const rn = typeof r === 'number' ? r : null;
  let c: number;
  if (ln !== null && rn !== null) c = ln - rn;
  else if ((l === null || l === '') && rn !== null) c = 0 - rn;
  else if ((r === null || r === '') && ln !== null) c = ln;
  else {
    const a = toStr(l).toLowerCase();
    const b = toStr(r).toLowerCase();
    c = a < b ? -1 : a > b ? 1 : 0;
  }
  switch (op) {
    case '=':
      return c === 0;
    case '<>':
      return c !== 0;
    case '<':
      return c < 0;
    case '>':
      return c > 0;
    case '<=':
      return c <= 0;
    default:
      return c >= 0;
  }
}

export function defaultLiteral(raw: string): Scalar {
  if (raw === '') return null;
  const n = parseLooseNumber(raw);
  if (n !== null && /^[\s(+\-$₫]*[\d.,]/.test(raw)) return n;
  const u = raw.toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  return raw;
}

/** Rewrites relative refs in a formula by (dRow, dCol), used when copy-pasting formulas. */
export function shiftFormula(formula: string, dRow: number, dCol: number): string {
  if (!formula.startsWith('=')) return formula;
  let out = '';
  let i = 0;
  const s = formula;
  while (i < s.length) {
    if (s[i] === '"') {
      const j = s.indexOf('"', i + 1);
      const end = j < 0 ? s.length : j + 1;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    const m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/.exec(s.slice(i));
    const prev = s[i - 1] ?? '';
    if (m && !/[A-Za-z0-9_]/.test(prev)) {
      const [whole, cAbs, letters, rAbs, digits] = m;
      const col = cAbs ? letters : colToLetters(Math.max(0, lettersToCol(letters) + dCol));
      const row = rAbs ? digits : String(Math.max(1, parseInt(digits, 10) + dRow));
      out += `${cAbs}${col}${rAbs}${row}`;
      i += whole.length;
      continue;
    }
    out += s[i++];
  }
  return out;
}

/**
 * Rewrites references after rows or columns are inserted/deleted in one sheet, like a spreadsheet does.
 * `homeSheet` is the sheet the formula lives in; `target` is the sheet whose rows/cols changed.
 * delta > 0 inserts `delta` lines before index `at`; delta < 0 deletes -delta lines starting at `at` (zero-based).
 */
export function adjustRefs(formula: string, homeSheet: string, target: string, axis: 'row' | 'col', at: number, delta: number): string {
  if (!formula.startsWith('=')) return formula;
  const s = formula;
  let out = '';
  let i = 0;
  let changed = false;
  const delEnd = at - delta; // exclusive end of deleted block when delta < 0
  const moveIndex = (idx: number, isEnd: boolean): number | null => {
    if (delta > 0) return idx >= at ? idx + delta : idx;
    if (idx < at) return idx;
    if (idx >= delEnd) return idx + delta;
    // inside deleted block
    return isEnd ? at - 1 : at;
  };
  const refRe = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)/;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      const j = s.indexOf('"', i + 1);
      const end = j < 0 ? s.length : j + 1;
      out += s.slice(i, end);
      i = end;
      continue;
    }
    // optional sheet prefix
    let sheet: string | null = null;
    let prefix = '';
    let k = i;
    if (ch === "'") {
      const end = s.indexOf("'!", i + 1);
      if (end > 0) {
        sheet = s.slice(i + 1, end);
        prefix = s.slice(i, end + 2);
        k = end + 2;
      }
    } else {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)!/.exec(s.slice(i));
      if (m && !/[A-Za-z0-9_]/.test(s[i - 1] ?? '')) {
        sheet = m[1];
        prefix = m[0];
        k = i + m[0].length;
      }
    }
    const prev = s[i - 1] ?? '';
    const a = refRe.exec(s.slice(k));
    if (a && (prefix || !/[A-Za-z0-9_$]/.test(prev)) && !/[A-Za-z0-9_(]/.test(s[k + a[0].length] ?? '')) {
      const refSheet = (sheet ?? homeSheet).toLowerCase();
      let len = a[0].length;
      let b: RegExpExecArray | null = null;
      if (s[k + len] === ':') {
        b = refRe.exec(s.slice(k + len + 1));
        if (b) len += 1 + b[0].length;
      }
      if (refSheet !== target.toLowerCase()) {
        out += prefix + s.slice(k, k + len);
        i = k + len;
        continue;
      }
      const parts = [a, b].filter(Boolean) as RegExpExecArray[];
      const moved: { col: number; row: number; ca: string; ra: string }[] = parts.map((p) => ({ ca: p[1], col: lettersToCol(p[2]), ra: p[3], row: parseInt(p[4], 10) - 1 }));
      let broken = false;
      if (moved.length === 1) {
        const m0 = moved[0];
        const idx = axis === 'row' ? m0.row : m0.col;
        if (delta < 0 && idx >= at && idx < delEnd) broken = true;
        else if (axis === 'row') m0.row = moveIndex(m0.row, false)!;
        else m0.col = moveIndex(m0.col, false)!;
      } else {
        const [p, q] = moved;
        if (axis === 'row') {
          const lo = Math.min(p.row, q.row);
          const hi = Math.max(p.row, q.row);
          const nlo = moveIndex(lo, false)!;
          const nhi = moveIndex(hi, true)!;
          if (nhi < nlo) broken = true;
          p.row = nlo;
          q.row = nhi;
        } else {
          const lo = Math.min(p.col, q.col);
          const hi = Math.max(p.col, q.col);
          const nlo = moveIndex(lo, false)!;
          const nhi = moveIndex(hi, true)!;
          if (nhi < nlo) broken = true;
          p.col = nlo;
          q.col = nhi;
        }
      }
      if (broken) {
        out += '#REF!';
        changed = true;
      } else {
        const txt = moved.map((m) => `${m.ca}${colToLetters(m.col)}${m.ra}${m.row + 1}`).join(':');
        if (txt !== s.slice(k, k + len)) changed = true;
        out += prefix + txt;
      }
      i = k + len;
      continue;
    }
    if (prefix) {
      out += prefix;
      i = k;
      continue;
    }
    out += s[i++];
  }
  return changed ? out : formula;
}

/** Shifts every reference (absolute ones too) down by `rows`; used when exporting with a header row. */
export function offsetAllRows(formula: string, rows: number): string {
  if (!formula.startsWith('=')) return formula;
  return formula.replace(/("[^"]*")|(\$?[A-Za-z]{1,3}\$?)(\d+)(?![A-Za-z0-9_(])/g, (m, str, colPart, digits, offset, whole) => {
    if (str) return str;
    const prev = whole[offset - 1] ?? '';
    if (/[A-Za-z0-9_]/.test(prev)) return m;
    return `${colPart}${parseInt(digits, 10) + rows}`;
  });
}

export function formatErrorHint(v: Scalar): string {
  return isErr(v) ? v.msg || v.code : '';
}
