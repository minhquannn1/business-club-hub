/* The metrics pdfmake needs for the built-in PDF fonts. They are plain text
   files from Adobe's Core 14 set, loaded only when someone exports a PDF. */
import timesR from './fonts/Times-Roman.afm?raw';
import timesB from './fonts/Times-Bold.afm?raw';
import timesI from './fonts/Times-Italic.afm?raw';
import timesBI from './fonts/Times-BoldItalic.afm?raw';
import helv from './fonts/Helvetica.afm?raw';
import helvB from './fonts/Helvetica-Bold.afm?raw';
import helvI from './fonts/Helvetica-Oblique.afm?raw';
import helvBI from './fonts/Helvetica-BoldOblique.afm?raw';

export const STANDARD_VFS: Record<string, string> = {
  'data/Times-Roman.afm': timesR,
  'data/Times-Bold.afm': timesB,
  'data/Times-Italic.afm': timesI,
  'data/Times-BoldItalic.afm': timesBI,
  'data/Helvetica.afm': helv,
  'data/Helvetica-Bold.afm': helvB,
  'data/Helvetica-Oblique.afm': helvI,
  'data/Helvetica-BoldOblique.afm': helvBI,
};

export const STANDARD_FONTS = {
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};
