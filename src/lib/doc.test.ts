import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { checkDeliverable, countWords, deliverableHTML, deliverableText, docFacts, docHTML, docText, parseDoc } from './docModel';
import { needsUnicodeFont, pdfDefinition, pdfFamily } from './docPdf';
import { docxDocument } from './docDocx';
import { DOC_FORMATS, DOC_TEMPLATES, docJSON, para, seedSections, table, templatesFor } from './docTemplates';
import type { DocSection } from './types';

const sample = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our plan' }] },
    {
      type: 'paragraph',
      attrs: { textAlign: 'justify' },
      content: [
        { type: 'text', text: 'Laura invests ' },
        { type: 'text', text: '$300k', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' in 2027 <safely>.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Growth' }] }] },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Reserve' }] },
            { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bonds' }] }] }] },
          ],
        },
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'See the site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
    table(['Year', 'Cash'], [['2027', '$300k']]),
  ],
});

const section = (over: Partial<DocSection> = {}): DocSection => ({ id: 's1', title: 'IPS', order: 0, content: sample, words: 0, rev: 0, printTitle: true, ...over });

describe('reading documents', () => {
  it('turns the editor JSON into plain text with lists and tables', () => {
    const t = docText(parseDoc(sample));
    expect(t).toContain('Our plan');
    expect(t).toContain('Laura invests $300k in 2027 <safely>.');
    expect(t).toContain('- Growth');
    expect(t).toContain('- Reserve');
    expect(t).toContain('1. Bonds');
    expect(t).toContain('Year\tCash');
  });
  it('counts words like a word processor', () => {
    expect(countWords('  Hello   world, it\'s me  ')).toBe(4);
    expect(countWords('')).toBe(0);
  });
  it('escapes text and drops unsafe links in HTML', () => {
    const html = docHTML(parseDoc(sample));
    expect(html).toContain('&lt;safely&gt;');
    expect(html).toContain('<strong>$300k</strong>');
    expect(html).toContain('style="text-align:justify"');
    expect(docHTML({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] })).not.toContain('href');
  });
  it('survives broken content', () => {
    expect(docText(parseDoc('not json'))).toBe('');
    expect(deliverableHTML([section({ content: '' })])).toContain('<h2 class="section-title">IPS</h2>');
  });
  it('finds images, links and tables', () => {
    expect(docFacts(parseDoc(sample))).toEqual({ images: 0, links: 1, tables: 1 });
  });
  it('flags word limits and things the competition does not allow', () => {
    const issues = checkDeliverable({ kind: 'doc', rules: { noLinks: true, noTables: true } }, [section({ limit: 5 })]);
    const text = issues.map((i) => i.text).join(' | ');
    expect(text).toMatch(/IPS has \d+ words. The limit is 5/);
    expect(text).toContain('Links are not allowed');
    expect(text).toContain('Tables are not allowed');
    expect(checkDeliverable({ kind: 'file' }, [])[0].text).toContain('No file');
  });
  it('joins sections into one text with titles', () => {
    const t = deliverableText([section({ id: 'b', order: 1, title: 'Second', content: docJSON([para('two')]) }), section({ id: 'a', title: 'First', content: docJSON([para('one')]) })]);
    expect(t.indexOf('FIRST')).toBeLessThan(t.indexOf('SECOND'));
  });
});

describe('templates', () => {
  it('offers the Wharton deliverables for the Wharton competition', () => {
    const t = templatesFor('Wharton Investment Competition 2026-27');
    expect(t.own.map((x) => x.key)).toEqual(['wharton-tna', 'wharton-ips', 'wharton-final', 'wharton-log', 'wharton-school']);
    expect(templatesFor('VNEC 2026').own).toEqual([]);
  });
  it('sets up the IPS with the official limits and format', () => {
    const ips = DOC_TEMPLATES.find((x) => x.key === 'wharton-ips')!;
    expect(ips.format).toEqual(DOC_FORMATS.wharton);
    const s = seedSections(ips);
    expect(s.map((x) => x.limit)).toEqual([0, 50, 500]);
    expect(s[1].pageBreakBefore).toBe(true);
    expect(docText(parseDoc(s[0].content))).toContain('ISPH Traders');
  });
  it('has valid starter JSON in every template', () => {
    for (const t of DOC_TEMPLATES) for (const s of seedSections(t)) expect(parseDoc(s.content).type).toBe('doc');
  });
});

describe('PDF', () => {
  it('uses the built-in fonts unless the text needs more', () => {
    expect(needsUnicodeFont([section()])).toBe(false);
    expect(needsUnicodeFont([section({ content: docJSON([para('Nguyễn Minh Quân')]) })])).toBe(true);
    expect(pdfFamily('Times New Roman', false)).toBe('Times');
    expect(pdfFamily('Calibri', false)).toBe('Helvetica');
    expect(pdfFamily('Arial', true)).toBe('Roboto');
  });
  it('builds a Letter page with 1 inch margins and double spacing for Wharton', () => {
    const def = pdfDefinition({ title: 'IPS', format: DOC_FORMATS.wharton }, [section(), section({ id: 's2', order: 1, title: 'Pitch', pageBreakBefore: true })], 'Times') as Record<string, unknown>;
    expect(def.pageSize).toBe('LETTER');
    expect(def.pageMargins).toEqual([72, 72, 72, 72]);
    expect(def.defaultStyle).toEqual({ font: 'Times', fontSize: 12, lineHeight: 2.556 });
    const content = def.content as { pageBreak?: string }[];
    expect(content[1].pageBreak).toBe('before');
  });
  it('renders to a real PDF', async () => {
    // pdfmake's Node printer reads the same standard fonts the browser bundle gets
    const { default: Printer } = (await import('pdfmake')) as unknown as { default: new (fonts: object) => { createPdfKitDocument: (d: object) => NodeJS.EventEmitter & { end: () => void } } };
    const printer = new Printer({ Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' } });
    const def = pdfDefinition({ title: 'IPS', format: { ...DOC_FORMATS.wharton, pageNumbers: true } }, [section()], 'Times');
    const pdf = printer.createPdfKitDocument(def);
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise((r) => pdf.on('end', r));
    pdf.end();
    await done;
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe('Word', () => {
  it('writes a .docx with the page format and the text', async () => {
    const doc = docxDocument({ title: 'IPS', format: DOC_FORMATS.wharton }, [section(), section({ id: 's2', order: 1, title: 'Pitch', pageBreakBefore: true, content: docJSON([para('Short pitch')]) })]);
    const buf = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Laura invests');
    expect(xml).toContain('Short pitch');
    expect(xml).toContain('w:pageBreakBefore');
    expect(xml).toMatch(/w:pgSz w:w="12240" w:h="15840"/);
    expect(xml).toMatch(/w:left="1440"/);
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toContain('Times New Roman');
    expect(styles).toMatch(/w:line="480"/);
  });
});
