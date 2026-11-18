import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ROLES,
  PERMISSION_KEYS,
  SCREENS,
  SCREEN_IDS,
  SETTINGS_SECTIONS,
  SIDEBAR_SCREENS,
  canOpenScreen,
  isPermissionKey,
  visibleSettingsSections,
} from '../src';

describe('SCREENS (who may open each page)', () => {
  it('names only real permission keys', () => {
    for (const id of SCREEN_IDS) {
      for (const req of SCREENS[id].anyOf ?? []) {
        for (const key of typeof req === 'string' ? [req] : req) expect(isPermissionKey(key), `${id}: ${key}`).toBe(true);
      }
    }
  });

  it('every signed-in user opens the dashboard and My account; nobody without keys opens anything else', () => {
    expect(SCREEN_IDS.filter((id) => canOpenScreen([], id))).toEqual(['dashboard', 'account', 'accountNotifications']);
  });

  it('all keys open every screen and every Settings section', () => {
    expect(SCREEN_IDS.every((id) => canOpenScreen(PERMISSION_KEYS, id))).toBe(true);
    expect(visibleSettingsSections(PERMISSION_KEYS)).toEqual(SETTINGS_SECTIONS);
  });

  it('a profile tab needs the profile as well as what the tab shows', () => {
    expect(canOpenScreen(['hr.payroll.view'], 'employeePayroll')).toBe(false);
    expect(canOpenScreen(['hr.payroll.view', 'hr.employees.view'], 'employeePayroll')).toBe(true);
  });

  it('every sidebar screen is a screen; every built-in role sees at least one page besides the dashboard', () => {
    for (const id of SIDEBAR_SCREENS) expect(SCREENS[id]).toBeDefined();
    for (const role of BUILT_IN_ROLES) {
      const keys = Object.keys(role.permissions);
      expect(SIDEBAR_SCREENS.filter((id) => id !== 'dashboard' && canOpenScreen(keys, id)).length, role.key).toBeGreaterThan(0);
    }
  });
});
