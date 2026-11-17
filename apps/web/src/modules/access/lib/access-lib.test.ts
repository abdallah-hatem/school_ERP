import { describe, expect, it } from 'vitest';
import { checkNewPassword, passwordStrength } from '@/core/auth/password-rules';
import { createTranslator, getBaseMessages } from '@/shared/lib/i18n';
import en from '@school-erp/shared/locales/en/access.json';
import { changedCount, setModule, setScope, toGrantMap, toGrants, toggle } from './role-grants';
import { formatSignIn } from './sign-in-time';
import { generateTemporaryPassword } from './temp-password';
import { changedFields, formToUpdate, type UserFormValues } from './user-form';
import { hasActiveFilters, parseUsersQuery, usersQueryString } from './users-query';

describe('users list URL', () => {
  it('keeps known filters, drops a malformed role id, a bad status and page', () => {
    const roleId = '00000000-0000-4000-8000-000000000101';
    expect(parseUsersQuery({ page: '2', roleId, status: 'inactive', search: ' mona ' })).toEqual({
      page: 2,
      limit: 10,
      search: 'mona',
      roleId,
      status: 'inactive',
    });
    expect(parseUsersQuery({ page: '-1', roleId: 'x', status: 'gone' })).toEqual({
      page: 1,
      limit: 10,
      search: undefined,
      roleId: undefined,
      status: undefined,
    });
  });

  it('writes short URLs and knows when a filter is on', () => {
    expect(usersQueryString(parseUsersQuery({}))).toBe('');
    expect(usersQueryString({ ...parseUsersQuery({}), status: 'active', page: 3 })).toBe('?status=active&page=3');
    expect(hasActiveFilters(parseUsersQuery({}))).toBe(false);
    expect(hasActiveFilters(parseUsersQuery({ status: 'active' }))).toBe(true);
  });
});

describe('role grants', () => {
  const saved = toGrantMap([{ key: 'hr.employees.view', scope: 'own_stage' }]);

  it('counts each permission switched or re-scoped once; back to saved is no change', () => {
    let next = toggle(saved, 'hr.penalties.view', true);
    expect(changedCount(saved, next)).toBe(1);
    next = setScope(next, 'hr.employees.view', 'all');
    expect(changedCount(saved, next)).toBe(2);
    next = setScope(toggle(next, 'hr.penalties.view', false), 'hr.employees.view', 'own_stage');
    expect(changedCount(saved, next)).toBe(0);
  });

  it('a whole-school permission stays "all"; an off one takes no scope', () => {
    const on = toggle({}, 'hr.payroll.approve', true);
    expect(setScope(on, 'hr.payroll.approve', 'own_team')['hr.payroll.approve']).toBe('all');
    expect(setScope({}, 'hr.employees.view', 'self')).toEqual({});
  });

  it('a module on keeps chosen scopes; the list comes out in registry order', () => {
    const all = setModule(saved, 'hr', true);
    expect(all['hr.employees.view']).toBe('own_stage');
    expect(toGrants(all)[0]).toEqual({ key: 'hr.dashboard.view', scope: 'all' });
    expect(toGrants(setModule(all, 'hr', false))).toEqual([]);
  });
});

describe('user form diff', () => {
  const saved: UserFormValues = { name: 'Mona', email: 'mona@school.test', roleIds: ['a', 'b'], employee: null };

  it('role order and email case are not changes; only what changed is sent', () => {
    expect(changedFields(saved, { ...saved, roleIds: ['b', 'a'], email: 'MONA@school.test' })).toEqual([]);
    const next = { ...saved, roleIds: ['a'], employee: { id: 'e', code: 'E', nameEn: 'E', nameAr: 'E' } };
    expect(formToUpdate(saved, next)).toEqual({ roleIds: ['a'], employeeId: 'e' });
    expect(formToUpdate(next, saved)).toEqual({ roleIds: ['a', 'b'], employeeId: null });
  });
});

describe('temporary password', () => {
  it('two words and four digits, long enough, from the random numbers given', () => {
    const fixed = (n: number) => new Uint32Array(n).fill(7);
    expect(generateTemporaryPassword(fixed)).toBe('Ember-1007-Ember');
    for (let i = 0; i < 50; i += 1) {
      expect(generateTemporaryPassword()).toMatch(/^[A-Z][a-z]+-\d{4}-[A-Z][a-z]+$/);
      expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('new password rules', () => {
  it('length and match decide; strength is a hint', () => {
    expect(checkNewPassword({ next: 'short', confirm: 'short' })).toEqual({ longEnough: false, matches: true, ok: false });
    expect(checkNewPassword({ next: 'long-enough-1', confirm: 'long-enough-2' }).ok).toBe(false);
    expect(checkNewPassword({ next: 'long-enough-1', confirm: 'long-enough-1' }).ok).toBe(true);
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('short')).toBe(1);
    expect(passwordStrength('Correct-Horse-42')).toBe(4);
  });
});

describe('last sign-in', () => {
  const t = createTranslator({ ...getBaseMessages('en'), access: en } as never, 'en');
  const now = '2026-11-17T12:00:00.000Z';
  it('never / today with the school time / another day / another year', () => {
    expect(formatSignIn(null, now, 'en', t)).toBe('Never');
    expect(formatSignIn('2026-11-17T07:12:00.000Z', now, 'en', t)).toBe('Today, 09:12');
    expect(formatSignIn('2026-11-14T08:30:00.000Z', now, 'en', t)).toBe('14 Nov, 10:30');
    expect(formatSignIn('2025-10-02T10:45:00.000Z', now, 'en', t)).toBe('2 Oct 2025, 13:45');
  });
});
