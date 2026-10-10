import { describe, expect, it } from 'vitest';
import { accessFields, hasPerm, levelOf } from './access';
import { OWNER_EMAIL } from './constants';

describe('access', () => {
  it('reads the level from role and the admin flag', () => {
    expect(levelOf({ id: 'a@x', role: 'exec', admin: true })).toBe('admin');
    expect(levelOf({ id: 'a@x', role: 'exec' })).toBe('exec');
    expect(levelOf({ id: 'a@x', role: 'member', admin: true })).toBe('member');
    expect(levelOf({ id: OWNER_EMAIL, role: 'member' })).toBe('admin');
  });
  it('gives money and website only to admins and exec who have them', () => {
    expect(hasPerm({ id: 'a@x', role: 'exec', perms: ['finance'] }, 'finance')).toBe(true);
    expect(hasPerm({ id: 'a@x', role: 'exec', perms: ['finance'] }, 'website')).toBe(false);
    expect(hasPerm({ id: 'a@x', role: 'member', perms: ['finance'] }, 'finance')).toBe(false);
    expect(hasPerm({ id: 'a@x', role: 'exec', admin: true }, 'website')).toBe(true);
  });
  it('saves a level as role, admin and perms', () => {
    expect(accessFields('admin', ['finance'])).toEqual({ role: 'exec', admin: true, perms: [] });
    expect(accessFields('exec', ['website'])).toEqual({ role: 'exec', admin: false, perms: ['website'] });
    expect(accessFields('guest', ['website'])).toEqual({ role: 'guest', admin: false, perms: [] });
  });
});
