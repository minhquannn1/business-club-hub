import type { Deliverable, DocFormat, DocSection } from './types';

/* Reading the editor's JSON without the editor: plain text, word counts,
   HTML for printing and copying, and the checks run before export. */

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
}

export function parseDoc(content: string | undefined | null): DocNode {
  if (!content) return { type: 'doc', content: [] };
  try {
    const n = JSON.parse(content) as DocNode;
    return n && n.type === 'doc' ? n : { type: 'doc', content: [] };
  } catch {
    return { type: 'doc', content: [] };
  }
}

/** Plain text: one line per paragraph, "- " and "1. " for lists, tabs between table cells. */
export function docText(node: DocNode): string {
  const out: string[] = [];
  const inline = (n: DocNode): string => {
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'hardBreak') return '\n';
    return (n.content ?? []).map(inline).join('');
  };
  const walk = (n: DocNode, prefix = '') => {
    switch (n.type) {
      case 'doc':
      case 'blockquote':
        (n.content ?? []).forEach((c) => walk(c, prefix));
        return;
      case 'paragraph':
      case 'heading':
        out.push(prefix + inline(n));
        return;
      case 'bulletList':
      case 'orderedList': {
        let i = Number(n.attrs?.start ?? 1);
        for (const item of n.content ?? []) {
          const mark = n.type === 'bulletList' ? '- ' : `${i++}. `;
          (item.content ?? []).forEach((c, j) => walk(c, prefix + (j === 0 ? mark : '   ')));
        }
        return;
      }
      case 'table':
        for (const row of n.content ?? []) out.push(prefix + (row.content ?? []).map((cell) => docText({ type: 'doc', content: cell.content }).replace(/\n/g, ' ')).join('\t'));
        return;
      case 'horizontalRule':
        out.push('');
        return;
      case 'image':
        return;
      default:
        if (n.content) n.content.forEach((c) => walk(c, prefix));
        else if (n.text) out.push(prefix + n.text);
    }
  };
  walk(node);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Words the way Word and Google Docs count them: runs of non-space characters. */
export function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function docFacts(node: DocNode): { images: number; links: number; tables: number } {
  const f = { images: 0, links: 0, tables: 0 };
  const walk = (n: DocNode) => {
    if (n.type === 'image') f.images++;
    if (n.type === 'table') f.tables++;
    if (n.marks?.some((m) => m.type === 'link')) f.links++;
    n.content?.forEach(walk);
  };
  walk(node);
  return f;
}

/* ---------- HTML (print and copy) ---------- */

export function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const safeHref = (h: unknown) => {
  const s = String(h ?? '');
  return /^(https?:|mailto:)/i.test(s) ? s : '';
};

export function docHTML(node: DocNode): string {
  const align = (n: DocNode) => (n.attrs?.textAlign && n.attrs.textAlign !== 'left' ? ` style="text-align:${String(n.attrs.textAlign).replace(/[^a-z]/g, '')}"` : '');
  const inline = (n: DocNode): string => {
    if (n.type === 'hardBreak') return '<br>';
    if (n.type !== 'text') return (n.content ?? []).map(inline).join('');
    let s = escapeHTML(n.text ?? '');
    for (const m of n.marks ?? []) {
      if (m.type === 'bold') s = `<strong>${s}</strong>`;
      else if (m.type === 'italic') s = `<em>${s}</em>`;
      else if (m.type === 'underline') s = `<u>${s}</u>`;
      else if (m.type === 'strike') s = `<s>${s}</s>`;
      else if (m.type === 'highlight') s = `<mark>${s}</mark>`;
      else if (m.type === 'link' && safeHref(m.attrs?.href)) s = `<a href="${escapeHTML(safeHref(m.attrs?.href))}">${s}</a>`;
    }
    return s;
  };
  const block = (n: DocNode): string => {
    const kids = () => (n.content ?? []).map(block).join('');
    switch (n.type) {
      case 'doc':
        return kids();
      case 'paragraph':
        return `<p${align(n)}>${(n.content ?? []).map(inline).join('') || '<br>'}</p>`;
      case 'heading': {
        const l = Math.min(3, Math.max(1, Number(n.attrs?.level ?? 2)));
        return `<h${l}${align(n)}>${(n.content ?? []).map(inline).join('')}</h${l}>`;
      }
      case 'bulletList':
        return `<ul>${kids()}</ul>`;
      case 'orderedList':
        return `<ol${n.attrs?.start && n.attrs.start !== 1 ? ` start="${Number(n.attrs.start)}"` : ''}>${kids()}</ol>`;
      case 'listItem':
        return `<li>${kids()}</li>`;
      case 'blockquote':
        return `<blockquote>${kids()}</blockquote>`;
      case 'horizontalRule':
        return '<hr>';
      case 'image':
        return /^data:image\/|^https:/.test(String(n.attrs?.src ?? '')) ? `<img src="${escapeHTML(String(n.attrs?.src))}" alt="${escapeHTML(String(n.attrs?.alt ?? ''))}">` : '';
      case 'table':
        return `<table>${kids()}</table>`;
      case 'tableRow':
        return `<tr>${kids()}</tr>`;
      case 'tableHeader':
      case 'tableCell': {
        const tag = n.type === 'tableHeader' ? 'th' : 'td';
        const span = `${Number(n.attrs?.colspan ?? 1) > 1 ? ` colspan="${Number(n.attrs?.colspan)}"` : ''}${Number(n.attrs?.rowspan ?? 1) > 1 ? ` rowspan="${Number(n.attrs?.rowspan)}"` : ''}`;
        return `<${tag}${span}>${kids()}</${tag}>`;
      }
      default:
        return n.content ? kids() : n.text ? escapeHTML(n.text) : '';
    }
  };
  return block(node);
}

export const sortSections = (list: DocSection[]) => [...list].sort((a, b) => a.order - b.order);

/** The whole deliverable as one HTML body, section titles included where they print. */
export function deliverableHTML(sections: DocSection[]): string {
  return sortSections(sections)
    .map((s) => {
      const brk = s.pageBreakBefore ? ' style="break-before:page;page-break-before:always"' : '';
      return `<section${brk}>${s.printTitle ? `<h2 class="section-title">${escapeHTML(s.title)}</h2>` : ''}${docHTML(parseDoc(s.content))}</section>`;
    })
    .join('');
}

export function deliverableText(sections: DocSection[]): string {
  return sortSections(sections)
    .map((s) => [s.printTitle ? s.title.toUpperCase() : '', docText(parseDoc(s.content))].filter(Boolean).join('\n\n'))
    .filter(Boolean)
    .join('\n\n\n');
}

/* ---------- format ---------- */

export const PAPER = {
  letter: { w: 8.5, h: 11, label: 'Letter (US)' },
  a4: { w: 8.27, h: 11.69, label: 'A4' },
} as const;

export function cssFont(font: DocFormat['font']): string {
  switch (font) {
    case 'Arial':
      return 'Arial, "Liberation Sans", Helvetica, sans-serif';
    case 'Calibri':
      return 'Calibri, Carlito, Arial, sans-serif';
    case 'Georgia':
      return 'Georgia, "Times New Roman", serif';
    default:
      return '"Times New Roman", Tinos, "Liberation Serif", Times, serif';
  }
}

/** Space after a paragraph, in em. Double-spaced papers do not add any. */
export const paraGapEm = (f: DocFormat) => (f.lineHeight >= 1.5 ? 0 : 0.6);

/** The CSS that makes a printed page match the PDF and Word exports. */
export function printCSS(f: DocFormat): string {
  const p = PAPER[f.paper];
  return `@page{size:${p.w}in ${p.h}in;margin:${f.margin}in}
html,body{margin:0;background:#fff;color:#000}
body{font-family:${cssFont(f.font)};font-size:${f.size}pt;line-height:${(f.lineHeight * 1.15).toFixed(3)}}
p{margin:0 0 ${paraGapEm(f)}em}
h1{font-size:1.5em;margin:.6em 0 .3em}h2{font-size:1.25em;margin:.6em 0 .3em}h3{font-size:1.1em;margin:.6em 0 .3em}
h2.section-title{font-size:1.15em;margin:0 0 .4em}
section+section{margin-top:${f.lineHeight >= 1.5 ? 0 : 0.8}em}
ul,ol{margin:0 0 ${paraGapEm(f)}em;padding-left:1.6em}
blockquote{margin:0 0 ${paraGapEm(f)}em 1.6em;color:#333}
table{border-collapse:collapse;width:100%;margin:0 0 .8em;line-height:1.3}
th,td{border:1px solid #444;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#eee}
th p,td p{margin:0}
img{max-width:100%;height:auto}
mark{background:#fff59d}
a{color:#1a0dab}
hr{border:0;border-top:1px solid #000;margin:.6em 0}`;
}

/* ---------- checks before export ---------- */

export interface DocIssue {
  level: 'error' | 'warn';
  text: string;
  sectionId?: string;
}

export function checkDeliverable(d: Pick<Deliverable, 'rules' | 'kind' | 'link'>, sections: DocSection[]): DocIssue[] {
  const issues: DocIssue[] = [];
  if (d.kind === 'file') {
    if (!d.link) issues.push({ level: 'warn', text: 'No file or link added yet.' });
    return issues;
  }
  const r = d.rules ?? {};
  for (const s of sortSections(sections)) {
    const n = parseDoc(s.content);
    const words = countWords(docText(n));
    if (s.limit && words > s.limit) issues.push({ level: 'error', sectionId: s.id, text: `${s.title} has ${words} words. The limit is ${s.limit}.` });
    if (words === 0) issues.push({ level: 'warn', sectionId: s.id, text: `${s.title} is empty.` });
    const f = docFacts(n);
    if (r.noImages && f.images) issues.push({ level: 'error', sectionId: s.id, text: `${s.title} has ${f.images === 1 ? 'an image' : `${f.images} images`}. Images and charts are not allowed.` });
    if (r.noLinks && f.links) issues.push({ level: 'error', sectionId: s.id, text: `${s.title} has ${f.links === 1 ? 'a link' : `${f.links} links`}. Links are not allowed.` });
    if (r.noTables && f.tables) issues.push({ level: 'error', sectionId: s.id, text: `${s.title} has ${f.tables === 1 ? 'a table' : `${f.tables} tables`}. Tables are not allowed.` });
    if (/\[\d+\]|\(\s*[A-Z][a-z]+,?\s+\d{4}\s*\)/.test(docText(n)) && r.noLinks) issues.push({ level: 'warn', sectionId: s.id, text: `${s.title} looks like it has a citation. Check whether citations are allowed.` });
  }
  return issues;
}
