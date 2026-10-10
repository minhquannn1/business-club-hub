import { format, parseISO, isValid, differenceInCalendarDays, formatDistanceToNowStrict } from 'date-fns';

let currency = 'VND';
export function setCurrency(c: string) {
  currency = c || 'VND';
}
export function getCurrency() {
  return currency;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions) {
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === 'VND' ? 'vi-VN' : 'en-US', opts);
    fmtCache.set(key, f);
  }
  return f;
}

export function money(n: number, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '–';
  const digits = currency === 'VND' ? 0 : 2;
  const f = nf(`${currency}-${opts.compact}-${opts.sign}`, {
    style: 'currency',
    currency,
    maximumFractionDigits: opts.compact ? 1 : digits,
    minimumFractionDigits: opts.compact ? 0 : digits,
    notation: opts.compact ? 'compact' : 'standard',
    signDisplay: opts.sign ? 'exceptZero' : 'auto',
  });
  return f.format(n);
}

export function plainNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return nf(`${currency}-plain`, { maximumFractionDigits: 6 }).format(n);
}

export function toDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

export function fmtDate(s: string | undefined | null, pattern = 'd MMM yyyy'): string {
  const d = toDate(s);
  return d ? format(d, pattern) : '';
}

export function fmtRange(a: string, b: string): string {
  const da = toDate(a);
  const dbb = toDate(b);
  if (!da && !dbb) return 'No dates yet';
  if (da && !dbb) return format(da, 'd MMM yyyy');
  if (!da && dbb) return `Until ${format(dbb, 'd MMM yyyy')}`;
  if (format(da!, 'yyyy-MM-dd') === format(dbb!, 'yyyy-MM-dd')) return format(da!, 'd MMM yyyy');
  if (format(da!, 'yyyy-MM') === format(dbb!, 'yyyy-MM')) return `${format(da!, 'd')}–${format(dbb!, 'd MMM yyyy')}`;
  if (format(da!, 'yyyy') === format(dbb!, 'yyyy')) return `${format(da!, 'd MMM')} – ${format(dbb!, 'd MMM yyyy')}`;
  return `${format(da!, 'd MMM yyyy')} – ${format(dbb!, 'd MMM yyyy')}`;
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** "Today", "Tomorrow", "In 3 days", "2 days late" */
export function dueLabel(s: string): { text: string; tone: 'late' | 'soon' | 'later' | 'none' } {
  const d = toDate(s);
  if (!d) return { text: 'No due date', tone: 'none' };
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < -1) return { text: `${-diff} days late`, tone: 'late' };
  if (diff === -1) return { text: 'Yesterday', tone: 'late' };
  if (diff === 0) return { text: 'Today', tone: 'soon' };
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (diff < 7) return { text: format(d, 'EEEE'), tone: 'soon' };
  return { text: format(d, 'd MMM'), tone: 'later' };
}

export function ago(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 45_000) return 'just now';
  return formatDistanceToNowStrict(ms, { addSuffix: true });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function uid(prefix = ''): string {
  const a = crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}
