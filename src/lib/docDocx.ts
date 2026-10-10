import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { Deliverable, DocFormat, DocSection } from './types';
import { paraGapEm, parseDoc, PAPER, sortSections, type DocNode } from './docModel';

/* Editor JSON -> Word document, with the deliverable's page format as the
   document defaults so it opens in Word or Google Docs looking the same. */

const TWIP = 1440; // per inch
type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

const alignOf = (n: DocNode): Align | undefined => {
  switch (n.attrs?.textAlign) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return undefined;
  }
};

export interface ImageInfo {
  data: Uint8Array;
  type: 'png' | 'jpg';
  width: number; // px
  height: number;
}

interface Ctx {
  f: DocFormat;
  images: Map<string, ImageInfo>;
  widthPx: number;
  list?: { ref: 'bullets' | 'numbers'; level: number; instance: number };
  nextInstance: () => number;
  tableCell?: boolean;
  indent?: number; // twips from the left, for quotes and the rest of a list item
  depth?: number; // list nesting, 0 = top level list
}

function runs(nodes: DocNode[] | undefined, extra: { bold?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }));
      continue;
    }
    if (n.type !== 'text') {
      out.push(...runs(n.content, extra));
      continue;
    }
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    const link = n.marks?.find((m) => m.type === 'link');
    const href = String(link?.attrs?.href ?? '');
    const run = new TextRun({
      text: n.text ?? '',
      bold: marks.has('bold') || extra.bold || undefined,
      italics: marks.has('italic') || undefined,
      underline: marks.has('underline') ? {} : undefined,
      strike: marks.has('strike') || undefined,
      highlight: marks.has('highlight') ? 'yellow' : undefined,
      style: link && /^(https?:|mailto:)/i.test(href) ? 'Hyperlink' : undefined,
    });
    out.push(link && /^(https?:|mailto:)/i.test(href) ? new ExternalHyperlink({ link: href, children: [run] }) : run);
  }
  return out;
}

function blocks(nodes: DocNode[] | undefined, ctx: Ctx): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const gap = ctx.tableCell || ctx.list ? 0 : Math.round(paraGapEm(ctx.f) * ctx.f.size * 20);
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: runs(n.content),
            alignment: alignOf(n),
            spacing: { after: gap, ...(ctx.tableCell ? { line: 240 } : {}) },
            numbering: ctx.list ? { reference: ctx.list.ref, level: ctx.list.level, instance: ctx.list.instance } : undefined,
            indent: !ctx.list && ctx.indent ? { left: ctx.indent } : undefined,
          }),
        );
        // only the first paragraph of a list item gets the bullet; the rest line up under its text
        if (ctx.list) ctx = { ...ctx, indent: 720 + ctx.list.level * 360, list: undefined };
        break;
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
        out.push(new Paragraph({ children: runs(n.content), alignment: alignOf(n), heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3 }));
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const ref = n.type === 'bulletList' ? 'bullets' : 'numbers';
        const level = Math.min((ctx.depth ?? -1) + 1, 5);
        const instance = n.type === 'orderedList' ? ctx.nextInstance() : 0;
        for (const item of n.content ?? []) out.push(...blocks(item.content, { ...ctx, indent: undefined, depth: level, list: { ref, level, instance } }));
        break;
      }
      case 'blockquote':
        out.push(...blocks(n.content, { ...ctx, indent: (ctx.indent ?? 0) + 720 }));
        break;
      case 'horizontalRule':
        out.push(new Paragraph({ children: [], border: { bottom: { color: '000000', space: 1, style: BorderStyle.SINGLE, size: 6 } }, spacing: { after: 120 } }));
        break;
      case 'image': {
        const img = ctx.images.get(String(n.attrs?.src ?? ''));
        if (!img) break;
        const scale = Math.min(1, ctx.widthPx / img.width);
        out.push(
          new Paragraph({
            children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
            spacing: { after: gap || 120 },
          }),
        );
        break;
      }
      case 'table': {
        const rows = n.content ?? [];
        const cols = Math.max(1, ...rows.map((r) => (r.content ?? []).reduce((s, c) => s + Number(c.attrs?.colspan ?? 1), 0)));
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows.map(
              (r) =>
                new TableRow({
                  tableHeader: (r.content ?? []).every((c) => c.type === 'tableHeader') || undefined,
                  children: (r.content ?? []).map((c) => {
                    const head = c.type === 'tableHeader';
                    const inner = blocks(c.content, { ...ctx, tableCell: true, list: undefined, widthPx: ctx.widthPx / cols });
                    const kids = inner.length ? inner : [new Paragraph({ children: [] })];
                    return new TableCell({
                      children: kids,
                      columnSpan: Number(c.attrs?.colspan ?? 1) > 1 ? Number(c.attrs?.colspan) : undefined,
                      rowSpan: Number(c.attrs?.rowspan ?? 1) > 1 ? Number(c.attrs?.rowspan) : undefined,
                      shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EEEEEE' } : undefined,
                      margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    });
                  }),
                }),
            ),
          }),
        );
        out.push(new Paragraph({ children: [], spacing: { after: 0 } }));
        break;
      }
      default:
        if (n.content) out.push(...blocks(n.content, ctx));
    }
  }
  return out;
}

const bulletLevels = ['•', '◦', '▪', '•', '◦', '▪'].map((text, level) => ({
  level,
  format: LevelFormat.BULLET,
  text,
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
}));
const numberLevels = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN].map((format, level) => ({
  level,
  format,
  text: `%${level + 1}.`,
  alignment: AlignmentType.LEFT,
  style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
}));

export function docxDocument(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[], images: Map<string, ImageInfo> = new Map()): Document {
  const f = d.format;
  const paper = PAPER[f.paper];
  const font = f.font;
  const size = Math.round(f.size * 2);
  const line = Math.round(240 * f.lineHeight);
  const widthPx = Math.round((paper.w - 2 * f.margin) * 96);
  let instance = 1;
  const children: (Paragraph | Table)[] = [];
  for (const s of sortSections(sections)) {
    const ctx: Ctx = { f, images, widthPx, nextInstance: () => instance++ };
    const part: (Paragraph | Table)[] = [];
    if (s.printTitle) part.push(new Paragraph({ style: 'SectionTitle', children: [new TextRun(s.title)] }));
    part.push(...blocks(parseDoc(s.content).content, ctx));
    if (!part.length) continue;
    if (s.pageBreakBefore && children.length) children.push(new Paragraph({ children: [], pageBreakBefore: true, spacing: { after: 0, line: 240 } }));
    else if (children.length && f.lineHeight < 1.5) children.push(new Paragraph({ children: [], spacing: { after: 0, line: 240 } }));
    children.push(...part);
  }
  const heading = (id: string, name: string, scale: number) => ({
    id,
    name,
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { font, size: Math.round(size * scale), bold: true, color: '000000' },
    paragraph: { spacing: { before: Math.round(f.size * 12), after: Math.round(f.size * 6), line }, keepNext: true },
  });
  return new Document({
    title: d.title,
    creator: 'Business Club workspace',
    styles: {
      default: {
        document: { run: { font, size }, paragraph: { spacing: { line, after: Math.round(paraGapEm(f) * f.size * 20) } } },
        heading1: { run: { font, size: Math.round(size * 1.5), bold: true, color: '000000' }, paragraph: { spacing: { before: Math.round(f.size * 12), after: Math.round(f.size * 6), line } } },
        heading2: { run: { font, size: Math.round(size * 1.25), bold: true, color: '000000' }, paragraph: { spacing: { before: Math.round(f.size * 12), after: Math.round(f.size * 6), line } } },
        heading3: { run: { font, size: Math.round(size * 1.1), bold: true, color: '000000' }, paragraph: { spacing: { before: Math.round(f.size * 12), after: Math.round(f.size * 6), line } } },
      },
      paragraphStyles: [{ ...heading('SectionTitle', 'Section Title', 1.15), paragraph: { spacing: { before: 0, after: Math.round(f.size * 8), line }, keepNext: true } }],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: bulletLevels },
        { reference: 'numbers', levels: numberLevels },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(paper.w * TWIP), height: Math.round(paper.h * TWIP) },
            margin: { top: Math.round(f.margin * TWIP), right: Math.round(f.margin * TWIP), bottom: Math.round(f.margin * TWIP), left: Math.round(f.margin * TWIP) },
          },
        },
        footers: f.pageNumbers ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) } : undefined,
        children: children.length ? children : [new Paragraph({ children: [] })],
      },
    ],
  });
}
