import type { Deliverable, DocFormat, DocSection } from './types';
import { paraGapEm, parseDoc, PAPER, sortSections, type DocNode } from './docModel';

/* Editor JSON -> pdfmake document. Kept free of the pdfmake runtime so it can be
   tested in Node; the browser side loads pdfmake and the fonts only on export. */

type Obj = Record<string, unknown>;

/** Latin text that the built-in PDF fonts (Times, Helvetica) can show. */
const WIN_ANSI = /^[\n\r\t -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;

export function needsUnicodeFont(sections: DocSection[], title = ''): boolean {
  const all = title + sections.map((s) => s.title + s.content).join('');
  // only the text values matter; JSON punctuation is plain ASCII anyway
  return !WIN_ANSI.test(all);
}

/** Which pdfmake font family to use for a document font. */
export function pdfFamily(font: DocFormat['font'], unicode: boolean): 'Times' | 'Helvetica' | 'Roboto' {
  if (unicode) return 'Roboto';
  return font === 'Arial' || font === 'Calibri' ? 'Helvetica' : 'Times';
}

/* pdfmake's single line is the font's ascent + descent, which is tighter than
   Word's single spacing (about 1.15 em). Scale so "double" means the same thing
   in the PDF, the Word file and the editor. */
const LINE_EM: Record<string, number> = { Times: 0.9, Helvetica: 0.925, Roboto: 1.172 };
export const pdfLineHeight = (lineHeight: number, family: string) => Math.round(((lineHeight * 1.15) / (LINE_EM[family] ?? 1)) * 1000) / 1000;

const pt = (inches: number) => Math.round(inches * 72 * 100) / 100;

export function contentWidth(f: DocFormat): number {
  return pt(PAPER[f.paper].w) - 2 * pt(f.margin);
}

function inlineRuns(nodes: DocNode[] | undefined): Obj[] {
  const out: Obj[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out.push({ text: '\n' });
      continue;
    }
    if (n.type !== 'text') {
      out.push(...inlineRuns(n.content));
      continue;
    }
    const run: Obj = { text: n.text ?? '' };
    const deco: string[] = [];
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') run.bold = true;
      if (m.type === 'italic') run.italics = true;
      if (m.type === 'underline') deco.push('underline');
      if (m.type === 'strike') deco.push('lineThrough');
      if (m.type === 'highlight') run.background = '#fff59d';
      if (m.type === 'link' && /^(https?:|mailto:)/i.test(String(m.attrs?.href ?? ''))) {
        run.link = String(m.attrs?.href);
        run.color = '#1a0dab';
        if (!deco.includes('underline')) deco.push('underline');
      }
    }
    if (deco.length) run.decoration = deco[0];
    out.push(run);
  }
  return out;
}

function alignOf(n: DocNode): string | undefined {
  const a = n.attrs?.textAlign;
  return a === 'center' || a === 'right' || a === 'justify' ? String(a) : undefined;
}

function blocks(nodes: DocNode[] | undefined, f: DocFormat, ctx: { width: number; inList?: boolean }): Obj[] {
  const gap = paraGapEm(f) * f.size;
  const out: Obj[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'paragraph': {
        const runs = inlineRuns(n.content);
        out.push({ text: runs.length ? runs : ' ', alignment: alignOf(n), margin: [0, 0, 0, ctx.inList ? 0 : gap] });
        break;
      }
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
        const scale = level === 1 ? 1.5 : level === 2 ? 1.25 : 1.1;
        out.push({ text: inlineRuns(n.content), bold: true, fontSize: Math.round(f.size * scale * 10) / 10, alignment: alignOf(n), margin: [0, f.size * 0.6, 0, f.size * 0.3], headlineLevel: level });
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const items = (n.content ?? []).map((item) => {
          const inner = blocks(item.content, f, { width: ctx.width - 24, inList: true });
          return inner.length === 1 ? inner[0] : { stack: inner };
        });
        const list: Obj = n.type === 'bulletList' ? { ul: items } : { ol: items, start: Number(n.attrs?.start ?? 1) };
        list.margin = [0, 0, 0, ctx.inList ? 0 : gap];
        out.push(list);
        break;
      }
      case 'blockquote':
        out.push({ stack: blocks(n.content, f, { width: ctx.width - 24 }), margin: [24, 0, 0, 0], color: '#333333' });
        break;
      case 'horizontalRule':
        out.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: ctx.width, y2: 4, lineWidth: 0.6 }], margin: [0, 4, 0, 8] });
        break;
      case 'image': {
        const src = String(n.attrs?.src ?? '');
        if (/^data:image\/(png|jpe?g);base64,/.test(src)) out.push({ image: src, fit: [ctx.width, ctx.width * 1.2], margin: [0, 2, 0, gap || 6] });
        break;
      }
      case 'table': {
        const rows = n.content ?? [];
        const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((s, c) => s + Number(c.attrs?.colspan ?? 1), 0)));
        let headerRows = 0;
        while (headerRows < rows.length && (rows[headerRows].content ?? []).every((c) => c.type === 'tableHeader')) headerRows++;
        const body = rows.map((r) => {
          const cells: Obj[] = [];
          for (const c of r.content ?? []) {
            const span = Number(c.attrs?.colspan ?? 1);
            const inner = blocks(c.content, { ...f, lineHeight: 1 }, { width: ctx.width / cols, inList: true });
            const cell: Obj = { stack: inner.length ? inner : [{ text: ' ' }] };
            if (c.type === 'tableHeader') {
              cell.bold = true;
              cell.fillColor = '#eeeeee';
            }
            if (span > 1) cell.colSpan = span;
            if (Number(c.attrs?.rowspan ?? 1) > 1) cell.rowSpan = Number(c.attrs?.rowspan);
            cells.push(cell);
            for (let k = 1; k < span; k++) cells.push({});
          }
          while (cells.length < cols) cells.push({ text: '' });
          return cells;
        });
        out.push({ table: { headerRows, widths: Array(cols).fill('*'), body }, lineHeight: 1.25, margin: [0, 2, 0, 10] });
        break;
      }
      default:
        if (n.content) out.push(...blocks(n.content, f, ctx));
    }
  }
  return out;
}

/** The full pdfmake definition. `family` comes from pdfFamily(). */
export function pdfDefinition(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[], family: string): Obj {
  const f = d.format;
  const width = contentWidth(f);
  const content: Obj[] = [];
  for (const s of sortSections(sections)) {
    const part: Obj[] = [];
    if (s.printTitle) part.push({ text: s.title, bold: true, fontSize: Math.round(f.size * 1.15 * 10) / 10, margin: [0, 0, 0, f.size * 0.4], headlineLevel: 1 });
    part.push(...blocks(parseDoc(s.content).content, f, { width }));
    if (!part.length) continue;
    const between = f.lineHeight >= 1.5 ? 0 : f.size * 0.8;
    content.push({ stack: part, pageBreak: s.pageBreakBefore && content.length ? 'before' : undefined, margin: [0, content.length && !s.pageBreakBefore ? between : 0, 0, 0] });
  }
  return {
    info: { title: d.title, creator: 'Business Club workspace' },
    pageSize: f.paper === 'a4' ? 'A4' : 'LETTER',
    pageMargins: [pt(f.margin), pt(f.margin), pt(f.margin), pt(f.margin)],
    defaultStyle: { font: family, fontSize: f.size, lineHeight: pdfLineHeight(f.lineHeight, family) },
    footer: f.pageNumbers ? (page: number) => ({ text: String(page), alignment: 'center', fontSize: Math.max(8, f.size - 2), margin: [0, pt(f.margin) / 2 - 6, 0, 0] }) : undefined,
    content: content.length ? content : [{ text: ' ' }],
  };
}
