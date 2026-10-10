import { differenceInCalendarDays } from 'date-fns';
import { toDate } from '../lib/format';

/** "Today", "Tomorrow", "In 13 days", "3 days late", "Date TBC" */
export function deadlineLabel(date: string): { text: string; tone: '' | 'soon' | 'late' } {
  const d = toDate(date);
  if (!d) return { text: 'Date TBC', tone: '' };
  const diff = differenceInCalendarDays(d, new Date());
  if (diff < -1) return { text: `${-diff} days late`, tone: 'late' };
  if (diff === -1) return { text: 'Yesterday', tone: 'late' };
  if (diff === 0) return { text: 'Today', tone: 'soon' };
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (diff <= 7) return { text: `In ${diff} days`, tone: 'soon' };
  return { text: `In ${diff} days`, tone: '' };
}
