import { OWNER_EMAIL } from './constants';
import type { Member, Perm, Role } from './types';

/** What someone can do, from most to least. Stored as role + admin flag. */
export type Level = 'admin' | 'exec' | 'member' | 'guest';

export const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: 'member', label: 'Member', hint: 'Sees everything. Edits their own tasks, meeting notes and the projects they lead.' },
  { key: 'exec', label: 'Exec', hint: 'Also creates projects, gives tasks to anyone and sends announcements. Money and the website only if ticked below.' },
  { key: 'admin', label: 'Admin', hint: 'Can change everything, including people, roles, money, the website and deleting projects.' },
  { key: 'guest', label: 'Guest', hint: 'Not in the club. Only sees the projects they are on, their own tasks and the meetings they attended.' },
];

export const PERMS: { key: Perm; label: string; tag: string }[] = [
  { key: 'finance', label: 'Can edit money (ledger and receipts)', tag: 'Money' },
  { key: 'website', label: 'Can edit the public website', tag: 'Website' },
];

type Who = Pick<Member, 'id' | 'role'> & Partial<Pick<Member, 'admin' | 'perms'>>;

export function levelOf(m: Who | null | undefined): Level {
  if (!m) return 'member';
  if (m.id === OWNER_EMAIL) return 'admin';
  if (m.role === 'exec') return m.admin ? 'admin' : 'exec';
  return m.role;
}

export function hasPerm(m: Who | null | undefined, perm: Perm): boolean {
  const l = levelOf(m);
  return l === 'admin' || (l === 'exec' && !!m?.perms?.includes(perm));
}

/** The fields to save for a level. Admins get every permission, so their list is cleared. */
export function accessFields(level: Level, perms: Perm[] = []): { role: Role; admin: boolean; perms: Perm[] } {
  if (level === 'admin') return { role: 'exec', admin: true, perms: [] };
  if (level === 'exec') return { role: 'exec', admin: false, perms };
  return { role: level, admin: false, perms: [] };
}
