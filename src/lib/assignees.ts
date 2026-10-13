import type { Task } from './types';

/* A task can have several people on it. assigneeEmails holds all of them;
   assigneeEmail keeps the first one so older tasks, queries and rules still work. */

type Who = Pick<Task, 'assigneeEmail'> & { assigneeEmails?: string[] };

export function assigneesOf(t: Who): string[] {
  const list = t.assigneeEmails?.length ? t.assigneeEmails : t.assigneeEmail ? [t.assigneeEmail] : [];
  return [...new Set(list.filter(Boolean))];
}

export const isAssigned = (t: Who, email: string) => !!email && assigneesOf(t).includes(email);

/** What to store for a list of people. */
export function assigneeFields(list: string[]): { assigneeEmail: string; assigneeEmails: string[] } {
  const l = [...new Set(list.filter(Boolean))];
  return { assigneeEmail: l[0] ?? '', assigneeEmails: l };
}
