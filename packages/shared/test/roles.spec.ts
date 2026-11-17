import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ROLES,
  PERMISSION_KEYS,
  PERMISSION_SCOPES,
  SEED_ADMIN_ROLES,
  SYSTEM_ADMIN_ROLE,
  isPermissionKey,
  isPermissionScope,
  widerScope,
  type PermissionKey,
} from '../src';

/*
 * The starting roles against the spec table (docs/specs/2026-11-17-roles-permissions.md →
 * Starting roles). The P2 migration copies BUILT_IN_ROLES into the database; the api's e2e checks
 * the migrated rows equal it.
 */

const role = (key: string) => {
  const found = BUILT_IN_ROLES.find((r) => r.key === key);
  if (!found) throw new Error(`no role ${key}`);
  return found;
};
const keysOf = (key: string) => Object.keys(role(key).permissions).sort() as PermissionKey[];
const holders = (permission: PermissionKey) =>
  BUILT_IN_ROLES.filter((r) => permission in r.permissions)
    .map((r) => r.key)
    .sort();

describe('starting roles (spec table, GUESS)', () => {
  it('seeds the seven roles the spec names, with English and Arabic names', () => {
    expect(BUILT_IN_ROLES.map((r) => r.key)).toEqual([
      'system_admin',
      'hr_manager',
      'hr_officer',
      'accountant',
      'principal',
      'stage_head',
      'direct_manager',
    ]);
    for (const r of BUILT_IN_ROLES) {
      expect(r.key).toMatch(/^[a-z_]+$/);
      expect(r.nameEn.trim()).not.toBe('');
      expect(r.nameAr).toMatch(/[؀-ۿ]/);
    }
  });

  it('every granted key is a registry key with a known scope', () => {
    for (const r of BUILT_IN_ROLES) {
      for (const [key, scope] of Object.entries(r.permissions)) {
        expect(isPermissionKey(key)).toBe(true);
        expect(isPermissionScope(scope)).toBe(true);
      }
    }
  });

  it('System admin: everything, scope all', () => {
    expect(keysOf(SYSTEM_ADMIN_ROLE)).toEqual([...PERMISSION_KEYS].sort());
    expect(new Set(Object.values(role(SYSTEM_ADMIN_ROLE).permissions))).toEqual(new Set(['all']));
  });

  it('only the System admin manages users, roles and school settings', () => {
    for (const k of [
      'core.users.view',
      'core.users.manage',
      'core.roles.view',
      'core.roles.manage',
      'core.settings.edit',
    ] as const) {
      expect(holders(k)).toEqual(['system_admin']);
    }
  });

  it('HR manager: all of HR plus the Activity log, scope all', () => {
    const hr = PERMISSION_KEYS.filter((k) => k.startsWith('hr.'));
    expect(keysOf('hr_manager')).toEqual(expect.arrayContaining([...hr, 'core.audit.view']));
    expect(new Set(Object.values(role('hr_manager').permissions))).toEqual(new Set(['all']));
  });

  it('salaries: System admin, HR manager, HR officer and Accountant only (§2 GUESS)', () => {
    expect(holders('hr.employees.view_salary')).toEqual(
      ['accountant', 'hr_manager', 'hr_officer', 'system_admin'].sort(),
    );
  });

  it('penalties are recorded by officer, stage head, direct manager; approved by HR manager or principal', () => {
    expect(holders('hr.penalties.record')).toEqual(
      ['direct_manager', 'hr_manager', 'hr_officer', 'stage_head', 'system_admin'].sort(),
    );
    expect(holders('hr.penalties.approve')).toEqual(
      ['hr_manager', 'principal', 'system_admin'].sort(),
    );
    expect(holders('hr.penalties.cancel')).toEqual(
      ['hr_manager', 'principal', 'system_admin'].sort(),
    );
  });

  it('payroll is prepared by the officer, approved by the HR manager; the accountant views and exports', () => {
    expect(holders('hr.payroll.create')).toEqual(['hr_manager', 'hr_officer', 'system_admin']);
    expect(holders('hr.payroll.approve')).toEqual(['hr_manager', 'system_admin']);
    expect(holders('hr.payroll.export_bank_sheet')).toEqual([
      'accountant',
      'hr_manager',
      'system_admin',
    ]);
    expect(keysOf('accountant')).toEqual(
      [
        'hr.employees.view',
        'hr.employees.view_salary',
        'hr.payroll.view',
        'hr.payroll.export_bank_sheet',
      ].sort(),
    );
  });

  it('HR officer: no approvals, no rules or catalogue edits', () => {
    const officer = keysOf('hr_officer');
    for (const k of [
      'hr.penalties.approve',
      'hr.payroll.approve',
      'hr.settings.edit',
      'hr.penalty_catalogue.manage',
      'hr.lists.manage',
    ] as const) {
      expect(officer).not.toContain(k);
    }
  });

  it('stage head and direct manager see their own people and record penalties, scoped', () => {
    for (const [key, scope] of [
      ['stage_head', 'own_stage'],
      ['direct_manager', 'own_team'],
    ] as const) {
      const p = role(key).permissions;
      expect(p['hr.employees.view']).toBe(scope);
      expect(p['hr.penalties.view']).toBe(scope);
      expect(p['hr.penalties.record']).toBe(scope);
      expect(p['hr.employees.view_salary']).toBeUndefined();
      expect(p['hr.penalties.approve']).toBeUndefined();
    }
  });

  it('the seeded admin becomes System admin + HR manager', () => {
    expect(SEED_ADMIN_ROLES).toEqual(['system_admin', 'hr_manager']);
  });
});

describe('scopes (R5)', () => {
  it('are listed widest first', () => {
    expect(PERMISSION_SCOPES).toEqual(['all', 'own_stage', 'own_team', 'self']);
  });

  it('edge case 2 — the widest scope wins, whatever the order', () => {
    expect(widerScope('own_team', 'all')).toBe('all');
    expect(widerScope('all', 'self')).toBe('all');
    expect(widerScope('own_team', 'own_stage')).toBe('own_stage');
    expect(widerScope('self', 'own_team')).toBe('own_team');
    expect(widerScope('self', 'self')).toBe('self');
  });

  it('isPermissionScope rejects anything else', () => {
    expect(isPermissionScope('own_team')).toBe(true);
    expect(isPermissionScope('ALL')).toBe(false);
    expect(isPermissionScope(undefined)).toBe(false);
  });
});
