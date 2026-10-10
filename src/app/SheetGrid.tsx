import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent as RKeyboardEvent, type MouseEvent as RMouseEvent } from 'react';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ClipboardCopy,
  Eraser,
  Filter,
  Paperclip,
  Plus,
  Rows3,
  Settings2,
  Trash2,
  Undo2,
  X,
  ArrowLeftToLine,
  ArrowRightToLine,
} from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import { useStore, memberName } from '../lib/store';
import { addRows, compressImage, deleteRows, loadReceipt, reorderRows, saveReceipt, updateSheet, writeCells, type CellWrite } from '../lib/actions';
import { adjustRefs, cellName, colToLetters, isErr, shiftFormula, FErr, type Scalar } from '../lib/formula';
import { useWorkbook } from '../lib/workbook';
import { ago, fmtDate, money, plainNumber, uid } from '../lib/format';
import type { ColRole, ColType, Column, Row, Sheet } from '../lib/types';
import { Field, Modal, useConfirm, useMenu, useRun, useToast } from '../components/ui';
import '../styles/sheet.css';

type Pos = { r: number; c: number };
type Editing = { r: number; c: number; value: string; mode: 'type' | 'edit'; from: 'cell' | 'bar' };

const NUMERIC: ColType[] = ['number', 'currency'];
const PICKER: ColType[] = ['select', 'project', 'member'];

export const COL_TYPES: { key: ColType; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'number', label: 'Number' },
  { key: 'currency', label: 'Money' },
  { key: 'date', label: 'Date' },
  { key: 'select', label: 'Dropdown' },
  { key: 'project', label: 'Project' },
  { key: 'member', label: 'Person' },
  { key: 'receipt', label: 'Receipt photo' },
];

const ROLE_LABEL: Record<Exclude<ColRole, ''>, string> = {
  date: 'Date of the entry',
  description: 'Description',
  direction: 'In or out',
  category: 'Category',
  project: 'Project',
  amount: 'Amount',
  payer: 'Paid / received by',
  receipt: 'Receipt',
};

function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  const t = text.replace(/\r\n?/g, '\n');
  while (i < t.length) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
    i++;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toTSV(grid: string[][]): string {
  return grid.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join('\t')).join('\n');
}

function normalizeDate(raw: string): string {
  const s = raw.trim();
  if (!s || s.startsWith('=')) return s;
  if (/^today$/i.test(s)) return format(new Date(), 'yyyy-MM-dd');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  for (const p of ['d/M/yyyy', 'd/M/yy', 'd-M-yyyy', 'd.M.yyyy', 'd MMM yyyy', 'd MMMM yyyy', 'MMM d, yyyy', 'd/M']) {
    const d = parse(s, p, new Date());
    if (isValid(d) && d.getFullYear() > 1900) return format(d, 'yyyy-MM-dd');
  }
  return s;
}

export function SheetGrid({ sheet, onRecord }: { sheet: Sheet; onRecord?: (dir: 'in' | 'out') => void }) {
  const store = useStore();
  const wb = useWorkbook();
  const run = useRun();
  const toast = useToast();
  const confirm = useConfirm();
  const menu = useMenu();
  const rows: Row[] = useMemo(() => store.rows.get(sheet.id) ?? [], [store.rows, sheet.id]);
  const cols = sheet.columns;
  const canEdit = store.canFinance;

  const [a, setA] = useState<Pos>({ r: 0, c: 0 }); // active cell / anchor
  const [h, setH] = useState<Pos>({ r: 0, c: 0 }); // moving corner
  const [editing, setEditing] = useState<Editing | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fillTo, setFillTo] = useState<Pos | null>(null);
  const [colModal, setColModal] = useState<number | null>(null);
  const [filterModal, setFilterModal] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<{ r: number; c: number } | null>(null);
  const [refHint, setRefHint] = useState<Pos[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement | null>(null);
  const barRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingReceipt = useRef<Pos | null>(null);
  const undoStack = useRef<CellWrite[][]>([]);
  const drag = useRef<null | { kind: 'select' } | { kind: 'fill' } | { kind: 'ref'; start: Pos; base: string }>(null);
  const resize = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // reset when switching sheets
  useEffect(() => {
    setA({ r: 0, c: 0 });
    setH({ r: 0, c: 0 });
    setEditing(null);
    setFilters({});
    undoStack.current = [];
  }, [sheet.id]);

  const width = (c: Column) => widths[c.key] ?? c.width ?? 120;
  const raw = useCallback((r: number, c: number) => rows[r]?.cells?.[cols[c]?.key] ?? '', [rows, cols]);
  const value = useCallback((r: number, c: number): Scalar => wb.value(sheet.id, r, c), [wb, sheet.id]);

  const displayText = useCallback(
    (r: number, c: number): string => {
      const col = cols[c];
      const v = value(r, c);
      if (v === null || v === '') return '';
      if (isErr(v)) return v.code;
      if (col.type === 'project' && typeof v === 'string') return store.projectMap.get(v)?.title ?? v;
      if (col.type === 'member' && typeof v === 'string') return store.memberMap.has(v) ? memberName(store, v) : v;
      if (col.type === 'currency' && typeof v === 'number') return money(v);
      if (col.type === 'date' && typeof v === 'string') return fmtDate(v) || v;
      if (typeof v === 'number') return plainNumber(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return String(v);
    },
    [cols, value, store],
  );

  const visible = useMemo(() => {
    const active = Object.entries(filters).filter(([, f]) => f.trim());
    if (!active.length) return rows.map((_, i) => i);
    return rows
      .map((_, i) => i)
      .filter((i) =>
        active.every(([key, f]) => {
          const c = cols.findIndex((x) => x.key === key);
          if (c < 0) return true;
          const needle = f.trim().toLowerCase();
          return displayText(i, c).toLowerCase().includes(needle) || raw(i, c).toLowerCase().includes(needle);
        }),
      );
  }, [rows, filters, cols, displayText, raw]);
  const posIndex = useMemo(() => new Map(visible.map((r, i) => [r, i])), [visible]);

  const rect = useMemo(() => {
    const r0 = Math.min(a.r, h.r);
    const r1 = Math.max(a.r, h.r);
    const c0 = Math.min(a.c, h.c);
    const c1 = Math.max(a.c, h.c);
    return { r0, r1, c0, c1 };
  }, [a, h]);
  const inRange = (r: number, c: number) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  const focusGrid = () => requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));

  const scrollTo = (p: Pos) =>
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector(`[data-cell="${p.r}:${p.c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

  /* ---------- writing ---------- */

  const normalize = useCallback(
    (col: Column, v: string): string => {
      const s = v.replace(/\r?\n$/, '');
      if (s.startsWith('=')) return s;
      const t = s.trim();
      if (!t) return '';
      if (col.type === 'date') return normalizeDate(t);
      if (col.type === 'project') {
        if (store.projectMap.has(t)) return t;
        const p = store.projects.find((x) => x.title.toLowerCase() === t.toLowerCase());
        return p ? p.id : t;
      }
      if (col.type === 'member') {
        if (store.memberMap.has(t.toLowerCase())) return t.toLowerCase();
        const m = store.members.find((x) => x.name?.toLowerCase() === t.toLowerCase() || x.email === t.toLowerCase());
        return m ? m.id : t;
      }
      if (col.type === 'select' && col.options) {
        const o = col.options.find((x) => x.toLowerCase() === t.toLowerCase());
        return o ?? t;
      }
      return s;
    },
    [store],
  );

  const commitCells = useCallback(
    async (list: { r: number; c: number; value: string }[], recordUndo = true) => {
      if (!canEdit) return;
      const writes: CellWrite[] = [];
      const prev: CellWrite[] = [];
      const extra: Record<number, Record<string, string>> = {};
      for (const w of list) {
        const col = cols[w.c];
        if (!col) continue;
        const v = normalize(col, w.value);
        const row = rows[w.r];
        if (!row) {
          if (v) (extra[w.r] ??= {})[col.key] = v;
          continue;
        }
        const old = row.cells?.[col.key] ?? '';
        if (old === v) continue;
        writes.push({ rowId: row.id, colKey: col.key, value: v });
        prev.push({ rowId: row.id, colKey: col.key, value: old });
      }
      if (recordUndo && prev.length) undoStack.current.push(prev);
      if (undoStack.current.length > 60) undoStack.current.shift();
      await run(async () => {
        await writeCells(sheet.id, writes);
        const need = Object.keys(extra).map(Number);
        if (need.length) {
          const maxR = Math.max(...need);
          const count = maxR - rows.length + 1;
          const cells = Array.from({ length: count }, (_, i) => extra[rows.length + i] ?? {});
          await addRows(sheet.id, rows.length ? rows[rows.length - 1].order : 0, null, count, cells);
        }
      });
    },
    [canEdit, cols, rows, normalize, run, sheet.id],
  );

  const undo = () => {
    const last = undoStack.current.pop();
    if (!last) {
      toast('Nothing to undo');
      return;
    }
    run(() => writeCells(sheet.id, last));
  };

  /* ---------- editing ---------- */

  const startEdit = (p: Pos, mode: Editing['mode'], initial?: string, from: Editing['from'] = 'cell') => {
    if (!canEdit || !cols[p.c]) return;
    const col = cols[p.c];
    if (col.type === 'receipt') {
      openReceipt(p);
      return;
    }
    setEditing({ r: p.r, c: p.c, mode, from, value: initial ?? raw(p.r, p.c) });
  };

  const finishEdit = async (move?: 'down' | 'up' | 'right' | 'left', override?: string) => {
    if (!editing) return;
    const e = editing;
    setEditing(null);
    setRefHint(null);
    await commitCells([{ r: e.r, c: e.c, value: override ?? e.value }]);
    if (move) moveBy(move === 'down' ? 1 : move === 'up' ? -1 : 0, move === 'right' ? 1 : move === 'left' ? -1 : 0, false, { r: e.r, c: e.c });
    focusGrid();
  };
  const cancelEdit = () => {
    setEditing(null);
    setRefHint(null);
    focusGrid();
  };

  useEffect(() => {
    if (editing?.from === 'cell') {
      const el = editorRef.current;
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && el.type === 'text') {
          const n = el.value.length;
          el.setSelectionRange(n, n);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.r, editing?.c, editing?.from]);

  const wantsRef = (v: string) => v.startsWith('=') && /[=(,;+\-*/^&<>:]\s*$/.test(v);

  /* ---------- movement ---------- */

  const moveBy = (dr: number, dc: number, extend: boolean, from?: Pos) => {
    const base = from ?? (extend ? h : a);
    const vi = posIndex.get(base.r) ?? 0;
    const nvi = Math.max(0, Math.min(visible.length - 1, vi + dr));
    const next = { r: visible[nvi] ?? 0, c: Math.max(0, Math.min(cols.length - 1, base.c + dc)) };
    if (extend) setH(next);
    else {
      setA(next);
      setH(next);
    }
    scrollTo(next);
  };

  const selectAllCells = () => {
    if (!visible.length) return;
    setA({ r: visible[0], c: 0 });
    setH({ r: visible[visible.length - 1], c: cols.length - 1 });
  };

  /* ---------- keyboard ---------- */

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && k.toLowerCase() === 'z') {
      e.preventDefault();
      if (canEdit) undo();
      return;
    }
    if (mod && k.toLowerCase() === 'a') {
      e.preventDefault();
      selectAllCells();
      return;
    }
    if (mod) return; // let copy/paste/cut events through
    switch (k) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const dir = k === 'ArrowDown' ? 1 : -1;
        moveBy(e.altKey ? dir * 20 : dir, 0, e.shiftKey);
        return;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault();
        moveBy(0, k === 'ArrowRight' ? 1 : -1, e.shiftKey);
        return;
      case 'PageDown':
      case 'PageUp':
        e.preventDefault();
        moveBy(k === 'PageDown' ? 15 : -15, 0, e.shiftKey);
        return;
      case 'Home':
        e.preventDefault();
        moveBy(0, -cols.length, e.shiftKey);
        return;
      case 'End':
        e.preventDefault();
        moveBy(0, cols.length, e.shiftKey);
        return;
      case 'Tab':
        e.preventDefault();
        moveBy(0, e.shiftKey ? -1 : 1, false);
        return;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) moveBy(-1, 0, false);
        else if (canEdit) startEdit(a, 'edit');
        else if (cols[a.c]?.type === 'receipt') openReceipt(a);
        else moveBy(1, 0, false);
        return;
      case 'F2':
        e.preventDefault();
        startEdit(a, 'edit');
        return;
      case 'Escape':
        setH(a);
        return;
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        if (!canEdit) return;
        const list = [];
        for (let r = rect.r0; r <= rect.r1; r++) if (posIndex.has(r)) for (let c = rect.c0; c <= rect.c1; c++) list.push({ r, c, value: '' });
        commitCells(list);
        return;
      }
    }
    if (k.length === 1 && canEdit && !e.altKey) {
      const col = cols[a.c];
      if (!col) return;
      e.preventDefault();
      if (PICKER.includes(col.type) && k !== '=') startEdit(a, 'edit');
      else if (col.type === 'date' && k !== '=') startEdit(a, 'type', k);
      else startEdit(a, 'type', k);
    }
  };

  /* ---------- clipboard ---------- */

  const rangeRaw = (): string[][] => {
    const out: string[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      if (!posIndex.has(r)) continue;
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) line.push(raw(r, c));
      out.push(line);
    }
    return out;
  };
  const rangeDisplay = (): string[][] => {
    const out: string[][] = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      if (!posIndex.has(r)) continue;
      const line: string[] = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = cols[c];
        const v = value(r, c);
        if (NUMERIC.includes(col.type) && typeof v === 'number') line.push(String(v));
        else line.push(displayText(r, c));
      }
      out.push(line);
    }
    return out;
  };

  const lastCopy = useRef<{ text: string; origin: Pos; grid: string[][] } | null>(null);
  const onCopy = (e: ClipboardEvent<HTMLDivElement>, cut = false) => {
    if (editing) return;
    e.preventDefault();
    const grid = rangeRaw();
    const text = toTSV(rangeDisplay());
    e.clipboardData.setData('text/plain', text);
    lastCopy.current = { text, origin: { r: rect.r0, c: rect.c0 }, grid };
    if (cut && canEdit) {
      const list = [];
      for (let r = rect.r0; r <= rect.r1; r++) if (posIndex.has(r)) for (let c = rect.c0; c <= rect.c1; c++) list.push({ r, c, value: '' });
      commitCells(list);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    if (editing || !canEdit) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const internal = lastCopy.current && lastCopy.current.text === text ? lastCopy.current : null;
    const grid = internal ? internal.grid : parseTSV(text);
    const list: { r: number; c: number; value: string }[] = [];
    // a single copied cell pasted onto a range fills the range
    const fillRange = grid.length === 1 && grid[0].length === 1 && (rect.r1 > rect.r0 || rect.c1 > rect.c0);
    const targetRows = fillRange ? rect.r1 - rect.r0 + 1 : grid.length;
    const targetCols = fillRange ? rect.c1 - rect.c0 + 1 : Math.max(...grid.map((g) => g.length));
    let r = rect.r0;
    for (let i = 0; i < targetRows; i++, r++) {
      for (let j = 0; j < targetCols; j++) {
        const c = rect.c0 + j;
        if (c >= cols.length) continue;
        let v = fillRange ? grid[0][0] : grid[i]?.[j] ?? '';
        if (internal && v.startsWith('=')) {
          const srcR = internal.origin.r + (fillRange ? 0 : i);
          const srcC = internal.origin.c + (fillRange ? 0 : j);
          v = shiftFormula(v, r - srcR, c - srcC);
        }
        list.push({ r, c, value: v });
      }
    }
    commitCells(list);
    setH({ r: rect.r0 + targetRows - 1, c: Math.min(cols.length - 1, rect.c0 + targetCols - 1) });
    if (!fillRange && rect.r0 + targetRows > rows.length) toast(`Added ${rect.r0 + targetRows - rows.length} rows for the pasted data`);
  };

  /* ---------- mouse ---------- */

  useEffect(() => {
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (d?.kind === 'fill' && fillTo) applyFill(fillTo);
      setFillTo(null);
      if (resize.current) {
        const { key } = resize.current;
        resize.current = null;
        const w = widths[key];
        if (w && canEdit) updateSheet(sheet.id, { columns: cols.map((c) => (c.key === key ? { ...c, width: w } : c)) }).catch(() => {});
      }
    };
    const move = (e: MouseEvent) => {
      if (!resize.current) return;
      const { key, startX, startW } = resize.current;
      setWidths((w) => ({ ...w, [key]: Math.max(56, Math.min(600, startW + e.clientX - startX)) }));
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('mousemove', move);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillTo, widths, cols, canEdit, sheet.id]);

  const refText = (s: Pos, e: Pos) => {
    const r0 = Math.min(s.r, e.r);
    const r1 = Math.max(s.r, e.r);
    const c0 = Math.min(s.c, e.c);
    const c1 = Math.max(s.c, e.c);
    return r0 === r1 && c0 === c1 ? cellName(r0, c0) : `${cellName(r0, c0)}:${cellName(r1, c1)}`;
  };

  const onCellMouseDown = (e: RMouseEvent, p: Pos) => {
    if (e.button !== 0) return;
    if (editing && wantsRef(editing.value) && !(editing.r === p.r && editing.c === p.c)) {
      e.preventDefault();
      drag.current = { kind: 'ref', start: p, base: editing.value };
      setEditing({ ...editing, value: editing.value + cellName(p.r, p.c) });
      setRefHint([p]);
      return;
    }
    if (editing) {
      if (editing.r === p.r && editing.c === p.c) return;
      finishEdit();
    }
    e.preventDefault();
    scrollRef.current?.focus({ preventScroll: true });
    if (e.shiftKey) setH(p);
    else {
      setA(p);
      setH(p);
    }
    drag.current = { kind: 'select' };
  };
  const onCellEnter = (p: Pos) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'select') setH(p);
    else if (d.kind === 'fill') setFillTo(p);
    else if (d.kind === 'ref' && editing) {
      setEditing({ ...editing, value: d.base + refText(d.start, p) });
      setRefHint([d.start, p]);
    }
  };

  const applyFill = (to: Pos) => {
    if (!canEdit) return;
    const h0 = rect.r1 - rect.r0 + 1;
    const w0 = rect.c1 - rect.c0 + 1;
    const list: { r: number; c: number; value: string }[] = [];
    const down = to.r > rect.r1;
    const up = to.r < rect.r0;
    const right = to.c > rect.c1;
    const left = to.c < rect.c0;
    if (down || up) {
      const rows2 = down ? range(rect.r1 + 1, to.r) : range(to.r, rect.r0 - 1);
      for (const r of rows2) {
        const srcR = rect.r0 + (((r - rect.r0) % h0) + h0) % h0;
        for (let c = rect.c0; c <= rect.c1; c++) list.push({ r, c, value: shiftFormula(raw(srcR, c), r - srcR, 0) });
      }
    } else if (right || left) {
      const cs = right ? range(rect.c1 + 1, to.c) : range(to.c, rect.c0 - 1);
      for (const c of cs) {
        const srcC = rect.c0 + (((c - rect.c0) % w0) + w0) % w0;
        for (let r = rect.r0; r <= rect.r1; r++) list.push({ r, c, value: shiftFormula(raw(r, srcC), 0, c - srcC) });
      }
    }
    if (!list.length) return;
    commitCells(list);
    const rs = list.map((x) => x.r);
    const csx = list.map((x) => x.c);
    setA({ r: Math.min(rect.r0, ...rs), c: Math.min(rect.c0, ...csx) });
    setH({ r: Math.max(rect.r1, ...rs), c: Math.max(rect.c1, ...csx) });
  };

  /* ---------- structure: rows & columns ---------- */

  const rewriteAllFormulas = async (axis: 'row' | 'col', at: number, delta: number) => {
    for (const s of store.sheets) {
      const list = store.rows.get(s.id) ?? [];
      const writes: CellWrite[] = [];
      for (const row of list) {
        if (s.id === sheet.id && axis === 'row' && delta < 0) {
          const idx = rows.findIndex((x) => x.id === row.id);
          if (idx >= at && idx < at - delta) continue; // being deleted
        }
        for (const [key, v] of Object.entries(row.cells ?? {})) {
          if (!v.startsWith('=')) continue;
          const nv = adjustRefs(v, s.name, sheet.name, axis, at, delta);
          if (nv !== v) writes.push({ rowId: row.id, colKey: key, value: nv });
        }
      }
      if (writes.length) await writeCells(s.id, writes);
    }
  };

  const insertRows = (at: number, n = 1) =>
    run(async () => {
      const after = at > 0 ? rows[at - 1].order : (rows[0]?.order ?? 1024) - 1024;
      const before = rows[at]?.order ?? null;
      await addRows(sheet.id, after, before, n);
      if (at < rows.length) await rewriteAllFormulas('row', at, n);
    });

  const removeRows = async (r0: number, r1: number) => {
    const ids = rows.slice(r0, r1 + 1).map((r) => r.id);
    const filled = rows.slice(r0, r1 + 1).filter((r) => Object.values(r.cells ?? {}).some(Boolean)).length;
    if (filled && !(await confirm({ title: `Delete ${ids.length === 1 ? 'this row' : `${ids.length} rows`}?`, body: `${filled} of them ${filled === 1 ? 'has' : 'have'} data in it. You can't undo this.`, confirm: 'Delete', danger: true }))) return;
    await run(async () => {
      await deleteRows(sheet.id, ids);
      await rewriteAllFormulas('row', r0, -ids.length);
    });
    const r = Math.min(r0, rows.length - ids.length - 1);
    setA({ r: Math.max(0, r), c: a.c });
    setH({ r: Math.max(0, r), c: a.c });
  };

  const insertCol = (at: number) =>
    run(async () => {
      const next = [...cols];
      next.splice(at, 0, { key: uid('c'), name: '', type: 'text', width: 120 });
      await updateSheet(sheet.id, { columns: next }, sheet.name);
      await rewriteAllFormulas('col', at, 1);
    });

  const removeCol = async (c: number) => {
    const col = cols[c];
    const hasData = rows.some((r) => r.cells?.[col.key]);
    const warn = col.role === 'amount' ? ' This is the Amount column, so Finance totals will stop counting this sheet.' : '';
    if (!(await confirm({ title: `Delete column ${colToLetters(c)}${col.name ? ` (${col.name})` : ''}?`, body: `${hasData ? 'Its data goes with it.' : 'It is empty.'}${warn}`, confirm: 'Delete column', danger: true }))) return;
    await run(async () => {
      const next = cols.filter((_, i) => i !== c);
      await updateSheet(sheet.id, { columns: next }, sheet.name);
      await rewriteAllFormulas('col', c, -1);
    });
    setA({ r: a.r, c: Math.max(0, Math.min(c, cols.length - 2)) });
    setH({ r: a.r, c: Math.max(0, Math.min(c, cols.length - 2)) });
  };

  const sortBy = async (c: number, dir: 1 | -1) => {
    if (!(await confirm({ title: `Sort the sheet by ${cols[c].name || `column ${colToLetters(c)}`}?`, body: 'Rows are reordered for everyone. Formulas that point at specific cells keep pointing at the same positions, so check totals afterwards.', confirm: 'Sort sheet' }))) return;
    const keyed = rows.map((row, i) => ({ row, v: value(i, c), empty: !Object.values(row.cells ?? {}).some(Boolean) }));
    keyed.sort((x, y) => {
      if (x.empty !== y.empty) return x.empty ? 1 : -1;
      const xv = x.v;
      const yv = y.v;
      if (xv === null || xv === '' || isErr(xv)) return 1;
      if (yv === null || yv === '' || isErr(yv)) return -1;
      if (typeof xv === 'number' && typeof yv === 'number') return (xv - yv) * dir;
      return String(xv).localeCompare(String(yv), undefined, { numeric: true }) * dir;
    });
    await run(() => reorderRows(sheet.id, keyed.map((k) => k.row)), 'Sheet sorted');
  };

  /* ---------- receipts ---------- */

  const openReceipt = (p: Pos) => {
    const v = raw(p.r, p.c);
    if (v) setReceipt(p);
    else if (canEdit) {
      pendingReceipt.current = p;
      fileRef.current?.click();
    }
  };

  /* ---------- menus ---------- */

  const cellMenu = (e: RMouseEvent, p: Pos) => {
    e.preventDefault();
    if (!inRange(p.r, p.c)) {
      setA(p);
      setH(p);
    }
    const r0 = inRange(p.r, p.c) ? rect.r0 : p.r;
    const r1 = inRange(p.r, p.c) ? rect.r1 : p.r;
    const n = r1 - r0 + 1;
    menu.open(e, [
      {
        label: 'Copy',
        icon: <ClipboardCopy />,
        onSelect: () => {
          navigator.clipboard?.writeText(toTSV(rangeDisplay())).then(() => toast('Copied'));
        },
      },
      ...(canEdit
        ? [
            { label: n > 1 ? `Insert ${n} rows above` : 'Insert row above', icon: <Rows3 />, onSelect: () => insertRows(r0, n), divider: true },
            { label: n > 1 ? `Insert ${n} rows below` : 'Insert row below', icon: <Rows3 />, onSelect: () => insertRows(r1 + 1, n) },
            {
              label: 'Clear cells',
              icon: <Eraser />,
              onSelect: () => {
                const list = [];
                for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) list.push({ r, c, value: '' });
                commitCells(list);
              },
            },
            { label: n > 1 ? `Delete ${n} rows` : 'Delete row', icon: <Trash2 />, danger: true, onSelect: () => removeRows(r0, r1) },
          ]
        : []),
    ]);
  };

  const colMenu = (e: RMouseEvent | HTMLElement, c: number) => {
    menu.open(e instanceof HTMLElement ? e : (e as RMouseEvent), [
      ...(canEdit ? [{ label: 'Edit column', icon: <Settings2 />, onSelect: () => setColModal(c) }] : []),
      { label: 'Filter by this column', icon: <Filter />, onSelect: () => setFilterModal(c) },
      ...(canEdit
        ? [
            { label: 'Sort sheet A to Z', icon: <ArrowDownAZ />, onSelect: () => sortBy(c, 1), divider: true },
            { label: 'Sort sheet Z to A', icon: <ArrowUpAZ />, onSelect: () => sortBy(c, -1) },
            { label: 'Insert column left', icon: <ArrowLeftToLine />, onSelect: () => insertCol(c), divider: true },
            { label: 'Insert column right', icon: <ArrowRightToLine />, onSelect: () => insertCol(c + 1) },
            { label: 'Delete column', icon: <Trash2 />, danger: true, onSelect: () => removeCol(c) },
          ]
        : []),
    ]);
  };

  /* ---------- status ---------- */

  const status = useMemo(() => {
    const single = rect.r0 === rect.r1 && rect.c0 === rect.c1;
    if (single) return null;
    let sum = 0;
    let count = 0;
    let filled = 0;
    let isMoney = false;
    for (let r = rect.r0; r <= rect.r1; r++) {
      if (!posIndex.has(r)) continue;
      for (let c = rect.c0; c <= rect.c1; c++) {
        const v = value(r, c);
        if (v !== null && v !== '') filled++;
        if (typeof v === 'number') {
          sum += v;
          count++;
          if (cols[c]?.type === 'currency') isMoney = true;
        }
      }
    }
    return { sum, count, filled, avg: count ? sum / count : 0, isMoney };
  }, [rect, value, posIndex, cols]);

  const activeRow = rows[a.r];
  const activeRaw = raw(a.r, a.c);
  const activeVal = rows.length ? value(a.r, a.c) : null;
  const barValue = editing ? editing.value : activeRaw;
  const filterList = Object.entries(filters).filter(([, v]) => v.trim());
  const totalWidth = 46 + cols.reduce((s, c) => s + width(c), 0);

  const renderCell = (r: number, c: number) => {
    const col = cols[c];
    const v = value(r, c);
    const isActive = a.r === r && a.c === c;
    const isEditing = editing && editing.r === r && editing.c === c;
    const right = NUMERIC.includes(col.type) || (typeof v === 'number' && col.type === 'text');
    const cls = ['cell', right ? 'right' : '', inRange(r, c) && !(rect.r0 === rect.r1 && rect.c0 === rect.c1) ? 'in-range' : '', isActive ? 'active' : '', refHint && inRect(refHint, r, c) ? 'formula-ref' : '', isEditing ? 'editing' : '']
      .filter(Boolean)
      .join(' ');
    let content: JSX.Element | string = '';
    if (isErr(v)) content = <span className="err" title={(v as FErr).msg || (v as FErr).code}>{(v as FErr).code}</span>;
    else if (col.type === 'receipt') {
      const id = raw(r, c);
      content = id ? (
        <span className="rcpt" onClick={(e) => (e.stopPropagation(), openReceipt({ r, c }))}>
          <Paperclip /> View
        </span>
      ) : canEdit ? (
        <span className="rcpt rcpt-empty" onClick={(e) => (e.stopPropagation(), openReceipt({ r, c }))}>
          <Plus /> Attach
        </span>
      ) : (
        ''
      );
    } else if (col.role === 'direction' && typeof v === 'string') {
      const lv = v.toLowerCase();
      content = <span className={`opt ${lv === 'in' ? 'opt-in' : lv === 'out' ? 'opt-out' : ''}`}>{v}</span>;
    } else if (col.type === 'project' && typeof v === 'string' && v) {
      const p = store.projectMap.get(v);
      content = (
        <span className="opt">
          {p && <span className="dot" style={{ ['--c' as string]: p.color }} />}
          {p?.title ?? v}
        </span>
      );
    } else if (col.type === 'currency' && typeof v === 'number') content = <span className={v < 0 ? 'neg' : ''}>{money(v)}</span>;
    else content = displayText(r, c);

    return (
      <td
        key={col.key}
        className={cls}
        data-cell={`${r}:${c}`}
        style={{ overflow: isEditing ? 'visible' : undefined }}
        onMouseDown={(e) => onCellMouseDown(e, { r, c })}
        onMouseEnter={() => onCellEnter({ r, c })}
        onDoubleClick={() => startEdit({ r, c }, 'edit')}
        onContextMenu={(e) => cellMenu(e, { r, c })}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch' && isActive && !editing && canEdit) startEdit({ r, c }, 'edit');
        }}
        title={typeof content === 'string' && content.length > 18 ? content : undefined}
      >
        {!isEditing && content}
        {isEditing && editing && <CellEditor col={col} editing={editing} width={width(col)} inputRef={editorRef} onChange={(val) => setEditing({ ...editing, value: val })} onDone={finishEdit} onCancel={cancelEdit} wantsRef={wantsRef} />}
        {canEdit && !editing && r === rect.r1 && c === rect.c1 && (
          <span
            className="fill-handle"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              drag.current = { kind: 'fill' };
            }}
            title="Drag to fill"
          />
        )}
      </td>
    );
  };

  return (
    <div className="sheet-shell">
      <div className="sheet-toolbar">
        {canEdit && sheet.isLedger && onRecord && (
          <>
            <button className="btn btn-sm btn-primary" onClick={() => onRecord('out')}>
              <Plus /> Expense
            </button>
            <button className="btn btn-sm" onClick={() => onRecord('in')}>
              <Plus /> Income
            </button>
          </>
        )}
        {canEdit && (
          <button className="btn btn-sm btn-ghost" onClick={undo} title="Undo your last change (Ctrl+Z)">
            <Undo2 /> Undo
          </button>
        )}
        {filterList.map(([key, f]) => {
          const c = cols.findIndex((x) => x.key === key);
          return (
            <span key={key} className="filter-pill">
              {cols[c]?.name || colToLetters(c)} contains "{f}"
              <button onClick={() => setFilters((x) => ({ ...x, [key]: '' }))} aria-label="Remove filter">
                <X size={14} />
              </button>
            </span>
          );
        })}
        <span style={{ flex: 1 }} />
        {!canEdit && <span className="small faint">View only. The people in charge of money edit it.</span>}
      </div>
      <div className="fbar">
        <div className="fbar-name">{rows.length ? (rect.r0 === rect.r1 && rect.c0 === rect.c1 ? cellName(a.r, a.c) : refText({ r: rect.r0, c: rect.c0 }, { r: rect.r1, c: rect.c1 })) : ''}</div>
        <div className="fbar-fx">fx</div>
        <input
          ref={barRef}
          value={barValue}
          disabled={!canEdit || !rows.length || cols[a.c]?.type === 'receipt'}
          aria-label="Cell contents"
          onFocus={() => {
            if (!editing && canEdit) setEditing({ r: a.r, c: a.c, mode: 'edit', from: 'bar', value: activeRaw });
          }}
          onChange={(e) => editing && setEditing({ ...editing, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finishEdit('down');
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelEdit();
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              finishEdit('right');
            }
          }}
          onBlur={(e) => {
            if (editing?.from === 'bar' && !scrollRef.current?.contains(e.relatedTarget as Node)) finishEdit();
          }}
          placeholder={canEdit ? 'Type a value, or a formula like =SUM(F1:F30)' : ''}
        />
      </div>
      <div ref={scrollRef} className="grid-scroll" tabIndex={0} onKeyDown={onKeyDown} onCopy={(e) => onCopy(e)} onCut={(e) => onCopy(e, true)} onPaste={onPaste} style={{ scrollPadding: '44px 0 0 46px' }} aria-label={`${sheet.name} grid`}>
        <table className="grid" style={{ width: totalWidth }}>
          <colgroup>
            <col style={{ width: 46 }} />
            {cols.map((c) => (
              <col key={c.key} style={{ width: width(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="rn" onClick={selectAllCells} title="Select all" />
              {cols.map((col, c) => (
                <th key={col.key} className={c >= rect.c0 && c <= rect.c1 ? 'col-sel' : ''} onContextMenu={(e) => (e.preventDefault(), colMenu(e, c))}>
                  <div
                    className="col-head"
                    onClick={(e) => {
                      if (!visible.length) return;
                      if (e.shiftKey) setH({ r: visible[visible.length - 1], c });
                      else {
                        setA({ r: visible[0], c });
                        setH({ r: visible[visible.length - 1], c });
                      }
                      scrollRef.current?.focus({ preventScroll: true });
                    }}
                    onDoubleClick={() => canEdit && setColModal(c)}
                    title={col.name ? `${col.name} (${COL_TYPES.find((t) => t.key === col.type)?.label})` : undefined}
                  >
                    <span className="letter">{colToLetters(c)}</span>
                    <span className="name">
                      {col.name || <span className="faint">&nbsp;</span>}
                      {filters[col.key]?.trim() && <Filter />}
                    </span>
                  </div>
                  <span
                    className={`col-resize ${resize.current?.key === col.key ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      resize.current = { key: col.key, startX: e.clientX, startW: width(col) };
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={rows[r].id}>
                <td
                  className={`rn ${r >= rect.r0 && r <= rect.r1 ? 'row-sel' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (editing) finishEdit();
                    scrollRef.current?.focus({ preventScroll: true });
                    if (e.shiftKey) setH({ r, c: cols.length - 1 });
                    else {
                      setA({ r, c: 0 });
                      setH({ r, c: cols.length - 1 });
                    }
                  }}
                  onContextMenu={(e) => cellMenu(e, { r, c: 0 })}
                >
                  {r + 1}
                </td>
                {cols.map((_, c) => renderCell(r, c))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && rows.length > 0 && <p className="small muted" style={{ padding: '16px 56px' }}>No rows match the filter.</p>}
        {canEdit && (
          <div className="add-rows">
            <button className="btn btn-sm" onClick={() => run(() => addRows(sheet.id, rows.length ? rows[rows.length - 1].order : 0, null, 10).then(() => undefined))}>
              <Plus /> Add 10 rows
            </button>
          </div>
        )}
      </div>
      <div className="sheet-status">
        <span>
          {status ? (
            <span className="stats">
              {status.count > 0 && (
                <>
                  <span>
                    Sum <strong className="num">{status.isMoney ? money(status.sum) : plainNumber(status.sum)}</strong>
                  </span>
                  <span>
                    Average <strong className="num">{status.isMoney ? money(status.avg) : plainNumber(+status.avg.toFixed(2))}</strong>
                  </span>
                </>
              )}
              <span>
                Count <strong className="num">{status.filled}</strong>
              </span>
            </span>
          ) : isErr(activeVal) ? (
            <span className="neg">{(activeVal as FErr).msg || (activeVal as FErr).code}</span>
          ) : activeRaw.startsWith('=') ? (
            <span>
              Result <strong>{displayText(a.r, a.c)}</strong>
            </span>
          ) : null}
        </span>
        <span className="faint">{activeRow?.updatedBy && activeRow.updatedAt ? `Row ${a.r + 1} last edited by ${memberName(store, activeRow.updatedBy)} ${ago(activeRow.updatedAt)}` : `${rows.length} rows`}</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          const p = pendingReceipt.current;
          pendingReceipt.current = null;
          if (!file || !p) return;
          await run(async () => {
            const dataUrl = await compressImage(file);
            const id = await saveReceipt(dataUrl, file.name, sheet.name);
            await commitCells([{ r: p.r, c: p.c, value: id }]);
          }, 'Receipt attached');
        }}
      />
      {receipt && (
        <ReceiptModal
          id={raw(receipt.r, receipt.c)}
          canEdit={canEdit}
          onClose={() => setReceipt(null)}
          onReplace={() => {
            pendingReceipt.current = receipt;
            setReceipt(null);
            fileRef.current?.click();
          }}
          onRemove={() => {
            commitCells([{ r: receipt.r, c: receipt.c, value: '' }]);
            setReceipt(null);
          }}
        />
      )}
      {colModal !== null && cols[colModal] && <ColumnModal sheet={sheet} index={colModal} onClose={() => setColModal(null)} />}
      {filterModal !== null && cols[filterModal] && (
        <FilterModal
          col={cols[filterModal]}
          letter={colToLetters(filterModal)}
          value={filters[cols[filterModal].key] ?? ''}
          onClose={() => setFilterModal(null)}
          onApply={(v) => {
            setFilters((f) => ({ ...f, [cols[filterModal].key]: v }));
            setFilterModal(null);
          }}
        />
      )}
      {menu.node}
    </div>
  );
}

function range(a: number, b: number) {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
function inRect(ps: Pos[], r: number, c: number) {
  const [s, e = s] = ps;
  return r >= Math.min(s.r, e.r) && r <= Math.max(s.r, e.r) && c >= Math.min(s.c, e.c) && c <= Math.max(s.c, e.c);
}

/* ---------- cell editor ---------- */

function CellEditor({
  col,
  editing,
  width,
  inputRef,
  onChange,
  onDone,
  onCancel,
  wantsRef,
}: {
  col: Column;
  editing: Editing;
  width: number;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  onDone: (move?: 'down' | 'up' | 'right' | 'left', value?: string) => void;
  onCancel: () => void;
  wantsRef: (v: string) => boolean;
}) {
  const store = useStore();
  const isFormula = editing.value.startsWith('=');
  const style = { left: -1, top: -1, minWidth: width + 2, width: isFormula ? Math.max(width + 2, 260) : width + 2, height: 34 } as const;
  const keys = (e: RKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      onDone(e.shiftKey ? 'up' : 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onDone(e.shiftKey ? 'left' : 'right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (editing.mode === 'type' && !isFormula && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      onDone(e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowLeft' ? 'left' : 'right');
    }
  };
  const blur = () => {
    // keep the editor open while the user clicks cells to build a formula
    if (wantsRef(editing.value)) return;
    onDone();
  };

  if (PICKER.includes(col.type) && !isFormula) {
    const options: { v: string; label: string }[] =
      col.type === 'project'
        ? store.projects.map((p) => ({ v: p.id, label: p.title }))
        : col.type === 'member'
          ? store.members.map((m) => ({ v: m.id, label: m.name || m.email }))
          : (col.options ?? []).map((o) => ({ v: o, label: o }));
    const known = options.some((o) => o.v === editing.value);
    return (
      <div className="cell-editor" style={style}>
        <select
          ref={inputRef as unknown as React.MutableRefObject<HTMLSelectElement>}
          value={editing.value}
          onChange={(e) => {
            onChange(e.target.value);
            onDone(undefined, e.target.value);
          }}
          onKeyDown={keys}
          onBlur={blur}
          aria-label={col.name || 'Choose a value'}
        >
          <option value="">Empty</option>
          {!known && editing.value && <option value={editing.value}>{editing.value}</option>}
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (col.type === 'date' && !isFormula && editing.mode === 'edit') {
    return (
      <div className="cell-editor" style={style}>
        <input ref={inputRef} type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(editing.value) ? editing.value : ''} onChange={(e) => onChange(e.target.value)} onKeyDown={keys} onBlur={blur} aria-label={col.name || 'Date'} />
      </div>
    );
  }
  return (
    <div className={`cell-editor ${isFormula ? 'formula' : ''}`} style={style}>
      <input ref={inputRef} type="text" value={editing.value} onChange={(e) => onChange(e.target.value)} onKeyDown={keys} onBlur={blur} spellCheck={false} aria-label={col.name || 'Cell'} />
    </div>
  );
}

/* ---------- modals ---------- */

function ReceiptModal({ id, canEdit, onClose, onReplace, onRemove }: { id: string; canEdit: boolean; onClose: () => void; onReplace: () => void; onRemove: () => void }) {
  const [img, setImg] = useState<{ dataUrl: string; name: string } | null | 'missing'>(null);
  useEffect(() => {
    loadReceipt(id)
      .then((r) => setImg(r ?? 'missing'))
      .catch(() => setImg('missing'));
  }, [id]);
  return (
    <Modal
      title="Receipt"
      size="wide"
      onClose={onClose}
      footer={
        <>
          {canEdit && (
            <>
              <button className="btn btn-danger" onClick={onRemove}>
                Remove from cell
              </button>
              <button className="btn" onClick={onReplace}>
                Replace
              </button>
            </>
          )}
          <span className="spacer" />
          {img && img !== 'missing' && (
            <a className="btn" href={img.dataUrl} download={img.name.replace(/\.[^.]+$/, '') + '.jpg'}>
              Download
            </a>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="receipt-view">
        {img === null ? <div className="spinner" /> : img === 'missing' ? <p className="muted">This receipt can't be found. It may have been removed.</p> : <img src={img.dataUrl} alt={img.name} />}
      </div>
    </Modal>
  );
}

function ColumnModal({ sheet, index, onClose }: { sheet: Sheet; index: number; onClose: () => void }) {
  const run = useRun();
  const col = sheet.columns[index];
  const [name, setName] = useState(col.name);
  const [type, setType] = useState<ColType>(col.type);
  const [options, setOptions] = useState((col.options ?? []).join('\n'));
  const [role, setRole] = useState<ColRole>(col.role ?? '');
  const save = async () => {
    const next: Column = { ...col, name: name.trim(), type, role: role || undefined, options: type === 'select' ? options.split('\n').map((s) => s.trim()).filter(Boolean) : undefined };
    if (!next.role) delete next.role;
    if (!next.options) delete next.options;
    const columns = sheet.columns.map((c, i) => (i === index ? next : role && c.role === role ? { ...c, role: undefined } : c)).map((c) => {
      const x = { ...c };
      if (!x.role) delete x.role;
      return x;
    });
    const ok = await run(async () => {
      await updateSheet(sheet.id, { columns }, sheet.name);
      return true;
    }, 'Column saved');
    if (ok) onClose();
  };
  return (
    <Modal
      title={`Column ${colToLetters(index)}`}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save column
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amount" />
        </Field>
        <Field label="Type" hint={type === 'project' || type === 'member' ? 'Cells show a dropdown of the club\'s projects or people.' : type === 'receipt' ? 'Cells hold a photo of a receipt.' : undefined}>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as ColType)}>
            {COL_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {type === 'select' && (
          <Field label="Choices" hint="One per line.">
            <textarea className="textarea" value={options} onChange={(e) => setOptions(e.target.value)} />
          </Field>
        )}
        {sheet.isLedger && (
          <Field label="Used by Finance as" hint="Tells the summary and project budgets which column means what.">
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as ColRole)}>
              <option value="">Nothing special</option>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function FilterModal({ col, letter, value, onClose, onApply }: { col: Column; letter: string; value: string; onClose: () => void; onApply: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <Modal
      title={`Filter ${col.name || `column ${letter}`}`}
      size="narrow"
      onClose={onClose}
      footer={
        <>
          {value && (
            <button className="btn" onClick={() => onApply('')}>
              Clear filter
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => onApply(v)}>
            Apply
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(v);
        }}
      >
        <Field label="Show rows where this column contains" hint="Only changes what you see. Other people's view is untouched.">
          <input className="input" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}
