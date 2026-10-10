import type { Deliverable, DocSection } from '../../lib/types';
import { deliverableHTML, deliverableText, docHTML, docText, escapeHTML, parseDoc, printCSS, sortSections, type DocNode } from '../../lib/docModel';
import type { ImageInfo } from '../../lib/docDocx';

/* Browser side of exporting: loads the heavy libraries only when used. */

export function fileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Document';
  return `${base}.${ext}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface PdfResult {
  bytes: number;
  font: string;
}

export async function makePDF(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[]): Promise<Blob & { font?: string }> {
  const [pm, docPdf] = await Promise.all([import('pdfmake/build/pdfmake'), import('../../lib/docPdf')]);
  const pdfMake = (pm as unknown as { default?: unknown }).default ?? pm;
  const unicode = docPdf.needsUnicodeFont(sections, d.title);
  const family = docPdf.pdfFamily(d.format.font, unicode);
  let vfs: Record<string, string>;
  let fonts: Record<string, Record<string, string>>;
  if (family === 'Roboto') {
    const m = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: Record<string, string> } & Record<string, unknown>;
    vfs = (m.default ?? (m as unknown as Record<string, string>)) as Record<string, string>;
    fonts = { Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } };
  } else {
    const f = await import('../../lib/pdfFonts');
    vfs = f.STANDARD_VFS;
    fonts = { [family]: f.STANDARD_FONTS[family] };
  }
  const def = docPdf.pdfDefinition(d, sections, family);
  const doc = (pdfMake as { createPdf: (d: unknown, t?: unknown, f?: unknown, v?: unknown) => { getBlob: (cb: (b: Blob) => void) => void } }).createPdf(def, undefined, fonts, vfs);
  const blob = await new Promise<Blob>((res, rej) => {
    try {
      doc.getBlob(res);
    } catch (e) {
      rej(e);
    }
  });
  return Object.assign(blob, { font: family === 'Times' ? 'Times' : family === 'Helvetica' ? 'Helvetica' : 'Roboto' });
}

export async function downloadPDF(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[]): Promise<PdfResult> {
  const blob = await makePDF(d, sections);
  saveBlob(blob, fileName(d.title, 'pdf'));
  return { bytes: blob.size, font: blob.font ?? '' };
}

function imageNodes(n: DocNode, out: DocNode[] = []): DocNode[] {
  if (n.type === 'image') out.push(n);
  n.content?.forEach((c) => imageNodes(c, out));
  return out;
}

async function loadImages(sections: DocSection[]): Promise<Map<string, ImageInfo>> {
  const map = new Map<string, ImageInfo>();
  const srcs = new Set(sections.flatMap((s) => imageNodes(parseDoc(s.content)).map((n) => String(n.attrs?.src ?? ''))));
  for (const src of srcs) {
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(src);
    if (!m) continue;
    const size = await new Promise<{ w: number; h: number }>((res) => {
      const i = new Image();
      i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res({ w: 0, h: 0 });
      i.src = src;
    });
    if (!size.w) continue;
    const bin = atob(m[2]);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    map.set(src, { data, type: m[1] === 'png' ? 'png' : 'jpg', width: size.w, height: size.h });
  }
  return map;
}

export async function downloadDocx(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[]): Promise<number> {
  const [{ Packer }, { docxDocument }, images] = await Promise.all([import('docx'), import('../../lib/docDocx'), loadImages(sections)]);
  const blob = await Packer.toBlob(docxDocument(d, sections, images));
  saveBlob(blob, fileName(d.title, 'docx'));
  return blob.size;
}

/** Opens the document in a new tab laid out like the PDF and starts printing. */
export function printDeliverable(d: Pick<Deliverable, 'title' | 'format'>, sections: DocSection[]) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups for this site and try again.');
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHTML(d.title)}</title><style>${printCSS(d.format)}</style></head><body>${deliverableHTML(sections)}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/** Copies with formatting where the browser allows it, so it pastes well into Google Docs and plain forms. */
export async function copyRich(html: string, text: string) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    } catch {
      /* fall back to plain text */
    }
  }
  await navigator.clipboard.writeText(text);
}

export const copySection = (s: DocSection) => copyRich(docHTML(parseDoc(s.content)), docText(parseDoc(s.content)));
export const copyAll = (sections: DocSection[]) => copyRich(deliverableHTML(sortSections(sections)), deliverableText(sections));
