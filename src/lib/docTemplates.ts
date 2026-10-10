import type { DocFormat, DocRules, DocSection } from './types';

/* Ready-made deliverables. Competition ones carry the official rules so the
   team starts from the right structure, word limits and page format. */

export const DOC_FORMATS: Record<'wharton' | 'standard', DocFormat> = {
  wharton: { font: 'Times New Roman', size: 12, lineHeight: 2, margin: 1, paper: 'letter' },
  standard: { font: 'Arial', size: 11, lineHeight: 1.15, margin: 1, paper: 'a4' },
};

export const FONTS: DocFormat['font'][] = ['Times New Roman', 'Arial', 'Calibri', 'Georgia'];
export const LINE_HEIGHTS: { value: number; label: string }[] = [
  { value: 1, label: 'Single' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: 'Double' },
];

export type SectionSeed = Pick<DocSection, 'title'> & Partial<Pick<DocSection, 'limit' | 'hint' | 'printTitle' | 'pageBreakBefore'>> & { starter?: Block[] };

export interface DocTemplate {
  key: string;
  title: string;
  /** shown for competitions whose title contains this */
  competition?: string;
  /** links it to the competition deadline whose name contains this */
  roundMatch?: string;
  kind: 'doc' | 'file';
  blurb: string;
  instructions: string;
  format: DocFormat;
  rules?: DocRules;
  sections: SectionSeed[];
}

/* ---------- tiny builders for starter content (editor JSON) ---------- */

type Block = { type: string; attrs?: Record<string, unknown>; content?: unknown[] };
const text = (t: string, bold = false) => (bold ? { type: 'text', text: t, marks: [{ type: 'bold' }] } : { type: 'text', text: t });
export const para = (t = '', bold = false): Block => ({ type: 'paragraph', content: t ? [text(t, bold)] : undefined });
const cell = (t: string, header: boolean): Block => ({ type: header ? 'tableHeader' : 'tableCell', content: [para(t)] });
export const table = (head: string[], rows: string[][]): Block => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: head.map((h) => cell(h, true)) },
    ...rows.map((r) => ({ type: 'tableRow', content: r.map((c) => cell(c, false)) })),
  ],
});
export const docJSON = (blocks: Block[] = []): string => JSON.stringify({ type: 'doc', content: blocks.length ? blocks : [para()] });

/* ---------- Wharton Global High School Investment Competition ---------- */

const WHARTON = 'Wharton';
const ET = 'Deadlines are 5:00 p.m. New York time, which is 4:00 or 5:00 a.m. the next morning in Vietnam.';

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    key: 'wharton-tna',
    title: 'Trading Notes Analysis',
    competition: WHARTON,
    roundMatch: 'Trading Notes',
    kind: 'doc',
    blurb: '3 Trading Notes from WInS and a reflection of up to 100 words on each.',
    instructions: [
      'Submitted through the SurveyMonkey Apply form, not as a PDF. Draft here, then use Copy text on each section to paste it into the form.',
      'Exactly 3 Trading Notes from trades we actually made in WInS (Wharton checks them), pasted exactly as they appear. Together they should show one strategy, not 3 separate picks. A note can be for a position we later sold.',
      'Each reflection is at most 100 words: why we made the decision, how it fits our strategy, and how it supports Laura\'s goals, funding needs or risk. It must match the strategy in the IPS. Graded on reasoning, not on whether the trade made money.',
      ET,
    ].join('\n\n'),
    format: DOC_FORMATS.standard,
    rules: { noImages: true, noTables: true },
    sections: [1, 2, 3].flatMap((n) => [
      { title: `Trading Note ${n}`, printTitle: true, hint: 'Paste it exactly as it appears in WInS.' },
      { title: `Reflection ${n}`, printTitle: true, limit: 100, hint: 'Why we made this trade, how it fits our strategy, and how it helps Laura.' },
    ]),
  },
  {
    key: 'wharton-ips',
    title: 'Investment Policy Statement',
    competition: WHARTON,
    roundMatch: 'Investment Policy Statement',
    kind: 'doc',
    blurb: 'Cover page, elevator pitch (50 words) and IPS (500 words), Times New Roman 12, double spaced.',
    instructions: [
      'Page 1: team name, team members as First Name Last Initial (exactly as on the roster) and our WInS username. Pages 2 and 3: the elevator pitch (max 50 words) and the IPS (max 500 words).',
      'Times New Roman 12, double spaced, 1 inch margins, PDF under 5 MB. No charts, images, links, footnotes or citations.',
      'It must show how we balance growth, liquidity, funding reliability, risk and flexibility, how the allocation changes as the 2033 payments get closer, and the reserve\'s asset mix over time.',
      'Trading ends at the deadline and the IPS cannot be changed after it is submitted. ' + ET,
    ].join('\n\n'),
    format: DOC_FORMATS.wharton,
    rules: { noImages: true, noLinks: true, noTables: true, maxMB: 5 },
    sections: [
      {
        title: 'Cover page',
        printTitle: false,
        hint: 'Team name, members as First Name Last Initial, WInS username.',
        starter: [para('Team name: ISPH Traders'), para('Team members: '), para('WInS username: ')],
      },
      { title: 'Elevator Pitch', printTitle: true, pageBreakBefore: true, limit: 50, hint: 'Who Laura is, what she needs, and how our portfolio gets her there.' },
      {
        title: 'Investment Policy Statement',
        printTitle: true,
        limit: 500,
        hint: 'Growth, liquidity, funding reliability, risk and flexibility. How the allocation changes as 2033 gets closer. The reserve\'s asset mix over time.',
      },
    ],
  },
  {
    key: 'wharton-final',
    title: 'Final Report',
    competition: WHARTON,
    roundMatch: 'Final Report',
    kind: 'doc',
    blurb: 'The report the top 50 are picked from, with the sections Wharton asks for.',
    instructions: [
      'Detailed instructions come out on Monday 9 November. Update these sections and the format when they do.',
      'The top 50 semifinalists are picked from the IPS and this report, so it matters most. The school letter is a separate file, not part of this report.',
      ET,
    ].join('\n\n'),
    format: DOC_FORMATS.wharton,
    sections: [
      { title: 'How we carried out the IPS', printTitle: true },
      { title: 'The operating reserve', printTitle: true, hint: 'Size at the start of 2033, the first asset mix, how it changes as payments are made, what high funding certainty means and how we measured it.' },
      { title: 'The facility contribution in 2033', printTitle: true, hint: 'How much of the rest Laura can put toward the residency while keeping some flexibility.' },
      { title: 'The co-sponsor range for 2031', printTitle: true, hint: 'The range, how confident we are in it, and how good and bad markets change it.' },
      { title: 'Fundraising text for co-sponsors', printTitle: true, hint: 'A draft Laura could send.' },
      { title: 'Our competition experience', printTitle: true, hint: 'From the decision log, including decisions we changed our minds on.' },
      { title: 'Assumptions', printTitle: true },
      { title: 'Sources', printTitle: true },
    ],
  },
  {
    key: 'wharton-log',
    title: 'Decision log',
    competition: WHARTON,
    kind: 'doc',
    blurb: 'Every decision and why, for the Competition Experience part of the Final Report.',
    instructions: 'Write down every decision when we make it, including the ones we later change. It is the material for the Competition Experience part of the Final Report.',
    format: DOC_FORMATS.standard,
    sections: [{ title: 'Decisions', printTitle: false, starter: [table(['Date', 'Decision', 'Why', 'Changed later?'], [['', '', '', '']])] }],
  },
  {
    key: 'wharton-school',
    title: 'School documentation',
    competition: WHARTON,
    roundMatch: 'School documentation',
    kind: 'file',
    blurb: 'The letter from ISPH. Keep the file link here and tick it off when uploaded.',
    instructions:
      'An official letter on ISPH letterhead confirming the school lets the team compete, that all students and the advisor belong to ISPH, and that the students are eligible. Wharton\'s sample letter is on the Deliverables page of SurveyMonkey Apply. Upload it as a separate file, not inside the Final Report. Without it we cannot be a semifinalist.',
    format: DOC_FORMATS.standard,
    sections: [],
  },

  /* ---------- any competition ---------- */
  {
    key: 'blank',
    title: 'Blank document',
    kind: 'doc',
    blurb: 'Start from an empty page and add your own sections.',
    instructions: '',
    format: DOC_FORMATS.standard,
    sections: [{ title: 'Main text', printTitle: false }],
  },
  {
    key: 'business-plan',
    title: 'Business plan',
    kind: 'doc',
    blurb: 'The usual sections of a business plan competition entry.',
    instructions: 'Check the competition\'s page limit and format, then set them under Format.',
    format: DOC_FORMATS.standard,
    sections: [
      { title: 'Executive summary', printTitle: true, limit: 300, hint: 'The whole plan in one page: problem, solution, customers, money, team.' },
      { title: 'The problem', printTitle: true },
      { title: 'Our solution', printTitle: true },
      { title: 'Market and customers', printTitle: true, hint: 'Who buys, how many of them, and what they use today.' },
      { title: 'Business model', printTitle: true, hint: 'What we charge, what it costs us, how we make money.' },
      { title: 'Marketing and sales', printTitle: true },
      { title: 'Operations', printTitle: true },
      { title: 'Team', printTitle: true },
      { title: 'Financial plan', printTitle: true, hint: 'Start-up costs, monthly costs, sales forecast, break-even.' },
      { title: 'Risks', printTitle: true },
    ],
  },
  {
    key: 'pitch-script',
    title: 'Pitch script',
    kind: 'doc',
    blurb: 'What each speaker says, timed. About 130 spoken words a minute.',
    instructions: 'Read it aloud with a timer. At a normal pace people say about 130 words a minute, so a 3 minute pitch is about 390 words.',
    format: DOC_FORMATS.standard,
    sections: [
      { title: 'Opening', printTitle: true, limit: 60, hint: 'One story or number that makes the judges care.' },
      { title: 'Problem', printTitle: true, limit: 60 },
      { title: 'Solution', printTitle: true, limit: 70 },
      { title: 'Market and business model', printTitle: true, limit: 70 },
      { title: 'Traction and team', printTitle: true, limit: 60 },
      { title: 'The ask', printTitle: true, limit: 40 },
    ],
  },
  {
    key: 'case-report',
    title: 'Case report',
    kind: 'doc',
    blurb: 'For case competitions: analysis, options and one recommendation.',
    instructions: 'Lead with the recommendation. Every number should say where it came from.',
    format: DOC_FORMATS.standard,
    sections: [
      { title: 'Executive summary', printTitle: true, limit: 250 },
      { title: 'Situation', printTitle: true },
      { title: 'Analysis', printTitle: true },
      { title: 'Options', printTitle: true },
      { title: 'Recommendation', printTitle: true },
      { title: 'Implementation and risks', printTitle: true },
      { title: 'Appendix', printTitle: true, pageBreakBefore: true },
    ],
  },
  {
    key: 'file',
    title: 'File or link',
    kind: 'file',
    blurb: 'Something made elsewhere, like a slide deck, a video or a signed form.',
    instructions: '',
    format: DOC_FORMATS.standard,
    sections: [],
  },
];

/** Templates for this competition first, then the general ones. */
export function templatesFor(competitionTitle: string): { own: DocTemplate[]; general: DocTemplate[] } {
  const t = competitionTitle.toLowerCase();
  return {
    own: DOC_TEMPLATES.filter((x) => x.competition && t.includes(x.competition.toLowerCase())),
    general: DOC_TEMPLATES.filter((x) => !x.competition),
  };
}

export function seedSections(tpl: DocTemplate): Omit<DocSection, 'id'>[] {
  return tpl.sections.map((s, i) => ({
    title: s.title,
    order: i,
    limit: s.limit ?? 0,
    hint: s.hint ?? '',
    printTitle: s.printTitle ?? true,
    pageBreakBefore: s.pageBreakBefore ?? false,
    content: docJSON(s.starter),
    words: 0,
    rev: 0,
    lock: null,
  }));
}
