import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  PENALTY_ACTIONS,
  SETTING_DEFAULTS,
  SETTING_LIMITS,
  WORK_SYSTEMS,
} from '../src';

type Tree = { [k: string]: string | Tree };

const LOCALES = join(__dirname, '..', 'locales');

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

function load(lang: string, file: string): Tree {
  return JSON.parse(readFileSync(join(LOCALES, lang, file), 'utf8')) as Tree;
}

describe('locales', () => {
  const files = readdirSync(join(LOCALES, 'en'));

  it('en and ar ship the same namespace files', () => {
    expect(readdirSync(join(LOCALES, 'ar')).sort()).toEqual(files.sort());
  });

  it.each(files)('%s has identical key sets in en and ar', (file) => {
    expect(keys(load('ar', file)).sort()).toEqual(keys(load('en', file)).sort());
  });

  /*
   * Arabic counts agree with their noun ("10 مخالفات", "11 مخالفة", "38 موظفًا"), so a message that
   * puts {count} before a noun must be plural forms — zero, one, two, few (3–10), many (11–99),
   * other — picked by `Intl.PluralRules('ar')`. The few listed here use {count} as a bare number.
   */
  const PLURAL_FORMS = ['few', 'many', 'one', 'other', 'two', 'zero'];
  const BARE_COUNTS = [
    'access.json:roleForm.groupCount',
    'audit.json:filters.openCount',
    'audit.json:timeline.more',
    'lateness.json:saveCount',
    'payroll.json:approve.pendingBody',
    'ui.json:filters.clearCount',
    'ui.json:form.counter',
    'ui.json:table.pageOf',
  ];

  function walk(tree: Tree, visit: (path: string, node: string | Tree) => void, prefix = ''): void {
    for (const [k, v] of Object.entries(tree)) {
      const path = `${prefix}${k}`;
      visit(path, v);
      if (typeof v === 'object' && typeof v.other !== 'string') walk(v, visit, `${path}.`);
    }
  }

  it.each(files)('%s: every Arabic count before a noun has the six plural forms', (file) => {
    const bare: string[] = [];
    walk(load('ar', file), (path, node) => {
      if (typeof node === 'string' && /\{count\}/.test(node) && !BARE_COUNTS.includes(`${file}:${path}`)) {
        bare.push(`${path}: ${node}`);
      }
    });
    expect(bare).toEqual([]);
  });

  it.each(files)('%s: plural messages have all six forms in both languages', (file) => {
    for (const lang of ['en', 'ar']) {
      walk(load(lang, file), (path, node) => {
        if (typeof node === 'object' && typeof node.other === 'string') {
          expect({ path, forms: Object.keys(node).sort() }).toEqual({ path, forms: PLURAL_FORMS });
        }
      });
    }
  });

  it('every error code has a translated message', () => {
    const errorKeys = Object.keys(load('en', 'errors.json'));
    expect(errorKeys.sort()).toEqual([...ERROR_CODES].sort());
  });

  it('every enum value has a label', () => {
    const enums = load('en', 'common.json').enums as Tree;
    expect(Object.keys(enums.workSystem as Tree).sort()).toEqual([...WORK_SYSTEMS].sort());
    expect(Object.keys(enums.penaltyAction as Tree).sort()).toEqual([...PENALTY_ACTIONS].sort());
  });
});

describe('setting defaults (§7)', () => {
  it('part-time percentages and divisor sit inside the validation bounds', () => {
    const pt = SETTING_DEFAULTS['hr.payroll.partTime'];
    for (const pct of Object.values(pt)) {
      expect(pct).toBeGreaterThanOrEqual(SETTING_LIMITS.percentMin);
      expect(pct).toBeLessThanOrEqual(SETTING_LIMITS.percentMax);
    }
    expect(SETTING_DEFAULTS['hr.payroll.dayDivisor']).toBe(30);
  });

  it('lateness step days are quarter steps', () => {
    for (const s of SETTING_DEFAULTS['hr.lateness.steps']) {
      expect((s.days / SETTING_LIMITS.daysStep) % 1).toBe(0);
    }
  });
});
