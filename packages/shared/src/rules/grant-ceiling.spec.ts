import { describe, expect, it } from 'vitest';
import { PermissionScope, type PermissionScope as Scope } from '../permissions';
import type { RoleGrant } from '../types/core';
import { actsOnPay, firstGrantOverCeiling, grantWithinCeiling, scopeCovers, type HeldGrants } from './grant-ceiling';

const { ALL, OWN_STAGE, OWN_TEAM, SELF } = PermissionScope;
const g = (key: RoleGrant['key'], scope: Scope): RoleGrant => ({ key, scope });

describe('H1/H2 grant ceiling — scopeCovers (the partial scope order)', () => {
  it('all covers every scope', () => {
    for (const s of [ALL, OWN_STAGE, OWN_TEAM, SELF]) expect(scopeCovers(ALL, s)).toBe(true);
  });
  it('own_stage covers own_stage and self, not all and not own_team', () => {
    expect(scopeCovers(OWN_STAGE, OWN_STAGE)).toBe(true);
    expect(scopeCovers(OWN_STAGE, SELF)).toBe(true);
    expect(scopeCovers(OWN_STAGE, ALL)).toBe(false);
    expect(scopeCovers(OWN_STAGE, OWN_TEAM)).toBe(false);
  });
  it('own_team covers own_team and self, not all and not own_stage', () => {
    expect(scopeCovers(OWN_TEAM, OWN_TEAM)).toBe(true);
    expect(scopeCovers(OWN_TEAM, SELF)).toBe(true);
    expect(scopeCovers(OWN_TEAM, ALL)).toBe(false);
    expect(scopeCovers(OWN_TEAM, OWN_STAGE)).toBe(false);
  });
  it('self covers only self', () => {
    expect(scopeCovers(SELF, SELF)).toBe(true);
    for (const s of [ALL, OWN_STAGE, OWN_TEAM]) expect(scopeCovers(SELF, s)).toBe(false);
  });
  it('an unknown stored scope covers nothing', () => {
    expect(scopeCovers('everyone' as Scope, SELF)).toBe(false);
  });
});

describe('M2 — actsOnPay (an account holding these must be linked to its employee record)', () => {
  it('the pay and penalty keys act on pay', () => {
    for (const key of [
      'hr.payroll.adjust',
      'hr.payroll.approve',
      'hr.lateness.edit',
      'hr.penalties.review',
      'hr.penalties.approve',
      'hr.penalties.cancel',
    ] as const) {
      expect(actsOnPay([{ key }])).toBe(true);
    }
  });
  it('L-a — editing employees counts on its own (work system, insurance); adding them does not', () => {
    expect(actsOnPay([{ key: 'hr.employees.edit' }])).toBe(true);
    expect(actsOnPay([{ key: 'hr.employees.create' }, { key: 'hr.employees.view_salary' }])).toBe(false);
  });
  it('viewing and recording do not', () => {
    expect(actsOnPay([{ key: 'hr.payroll.view' }, { key: 'hr.penalties.record' }, { key: 'hr.employees.view' }])).toBe(false);
    expect(actsOnPay([])).toBe(false);
  });
});

describe('H1/H2 grant ceiling — grantWithinCeiling / firstGrantOverCeiling', () => {
  const officer: HeldGrants = {
    isSystemAdmin: false,
    grants: [g('hr.employees.view', ALL), g('hr.penalties.view', OWN_STAGE), g('hr.penalties.view', OWN_TEAM)],
  };

  it('a System admin may give anything', () => {
    const admin: HeldGrants = { isSystemAdmin: true, grants: [] };
    expect(grantWithinCeiling(admin, g('core.roles.manage', ALL))).toBe(true);
    expect(firstGrantOverCeiling(admin, [g('core.users.manage', ALL), g('hr.payroll.approve', ALL)])).toBeNull();
  });

  it('a key the actor lacks is over the ceiling', () => {
    expect(grantWithinCeiling(officer, g('hr.payroll.approve', ALL))).toBe(false);
  });

  it('the same key, same or narrower scope, is within', () => {
    expect(grantWithinCeiling(officer, g('hr.employees.view', ALL))).toBe(true);
    expect(grantWithinCeiling(officer, g('hr.employees.view', OWN_STAGE))).toBe(true);
    expect(grantWithinCeiling(officer, g('hr.employees.view', SELF))).toBe(true);
  });

  it('a wider scope than held is over the ceiling', () => {
    expect(grantWithinCeiling(officer, g('hr.penalties.view', ALL))).toBe(false);
  });

  it('every grant of every role counts, not only the widest: own_stage and own_team via two roles both give', () => {
    expect(grantWithinCeiling(officer, g('hr.penalties.view', OWN_STAGE))).toBe(true);
    expect(grantWithinCeiling(officer, g('hr.penalties.view', OWN_TEAM))).toBe(true);
    expect(grantWithinCeiling(officer, g('hr.penalties.view', SELF))).toBe(true);
  });

  it('a stage-only holder can’t give the team scope (they don’t cover each other)', () => {
    const head: HeldGrants = { isSystemAdmin: false, grants: [g('hr.penalties.view', OWN_STAGE)] };
    expect(grantWithinCeiling(head, g('hr.penalties.view', OWN_TEAM))).toBe(false);
  });

  it('firstGrantOverCeiling names the first one over, or null when all are within', () => {
    expect(firstGrantOverCeiling(officer, [g('hr.employees.view', SELF)])).toBeNull();
    expect(firstGrantOverCeiling(officer, [])).toBeNull();
    expect(
      firstGrantOverCeiling(officer, [g('hr.employees.view', ALL), g('hr.penalties.view', ALL), g('core.users.manage', ALL)]),
    ).toEqual(g('hr.penalties.view', ALL));
  });
});
