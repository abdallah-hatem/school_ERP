import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PERMISSION_KEYS,
  PERMISSION_MODULES,
  PERMISSIONS,
  hasPermissions,
  isPermissionKey,
  permissionsByModule,
} from '../src';

type Tree = { [k: string]: string | Tree };

const load = (lang: string): Tree =>
  JSON.parse(
    readFileSync(join(__dirname, '..', 'locales', lang, 'permissions.json'), 'utf8'),
  ) as Tree;

/** A dot path in a message tree, the way both apps look messages up (`keys.hr.payroll.approve`). */
function at(tree: Tree, path: string): string | Tree | undefined {
  return path
    .split('.')
    .reduce<string | Tree | undefined>(
      (node, part) => (node && typeof node === 'object' ? node[part] : undefined),
      tree,
    );
}

describe('permission registry (R1)', () => {
  const en = load('en');
  const ar = load('ar');

  it('every key is <module>.<area>.<action> and starts with its module', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
      const { module } = PERMISSIONS[key];
      expect(PERMISSION_MODULES).toContain(module);
      expect(key.startsWith(`${module}.`)).toBe(true);
    }
  });

  it('holds the keys the spec names', () => {
    expect(PERMISSION_KEYS).toEqual(
      expect.arrayContaining([
        'core.audit.view',
        'hr.employees.view_salary',
        'hr.penalties.approve',
        'hr.payroll.approve',
      ]),
    );
  });

  it.each(PERMISSION_KEYS)('%s has an English and an Arabic label and description', (key) => {
    for (const field of ['label', 'description']) {
      const textEn = at(en, `keys.${key}.${field}`);
      const textAr = at(ar, `keys.${key}.${field}`);
      expect(typeof textEn).toBe('string');
      expect(typeof textAr).toBe('string');
      expect((textEn as string).trim()).not.toBe('');
      // The Arabic text is Arabic, not a copy of the English one.
      expect(textAr).toMatch(/[؀-ۿ]/);
    }
  });

  it('the locale files hold no label for a key that is not in the registry', () => {
    const permissionPaths = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) =>
        typeof v === 'object' && typeof v.label === 'string'
          ? [`${prefix}${k}`]
          : typeof v === 'object'
            ? permissionPaths(v, `${prefix}${k}.`)
            : [],
      );
    for (const tree of [en, ar]) {
      expect(permissionPaths(at(tree, 'keys') as Tree).sort()).toEqual(
        [...PERMISSION_KEYS].sort(),
      );
    }
  });

  it('every module has a name in both languages', () => {
    for (const tree of [en, ar]) {
      for (const m of PERMISSION_MODULES) expect(typeof at(tree, `modules.${m}`)).toBe('string');
    }
  });

  it('groups every key under its module, in registry order', () => {
    const groups = permissionsByModule();
    expect(Object.keys(groups)).toEqual([...PERMISSION_MODULES]);
    expect(Object.values(groups).flat()).toEqual(PERMISSION_KEYS);
    expect(groups.core).toContain('core.audit.view');
    expect(groups.hr).not.toContain('core.audit.view');
  });

  it('isPermissionKey rejects unknown keys', () => {
    expect(isPermissionKey('hr.payroll.approve')).toBe(true);
    expect(isPermissionKey('hr.payroll.delete')).toBe(false);
    expect(isPermissionKey('toString')).toBe(false);
    expect(isPermissionKey(undefined)).toBe(false);
  });

  it('hasPermissions needs every required key', () => {
    const granted = ['hr.penalties.view', 'hr.penalties.record'];
    expect(hasPermissions(granted, 'hr.penalties.record')).toBe(true);
    expect(hasPermissions(granted, ['hr.penalties.view', 'hr.penalties.record'])).toBe(true);
    // Edge case 9 — can record, can't approve.
    expect(hasPermissions(granted, 'hr.penalties.approve')).toBe(false);
    expect(hasPermissions(granted, ['hr.penalties.view', 'hr.penalties.approve'])).toBe(false);
    expect(hasPermissions(new Set(granted), 'hr.penalties.view')).toBe(true);
    expect(hasPermissions([], 'hr.penalties.view')).toBe(false);
  });
});
