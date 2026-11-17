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

  it('every error code has a translated message', () => {
    const errorKeys = Object.keys(load('en', 'common.json').errors as Tree);
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
