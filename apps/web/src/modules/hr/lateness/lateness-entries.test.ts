import { SETTING_DEFAULTS, type LatenessRule, type LatenessRow } from '@school-erp/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./apis', () => ({}));

import { gridState, parseMinutes } from './lateness-entries';
import { resolveMonth } from './lateness-screen';

const RULE: LatenessRule = {
  graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
  steps: SETTING_DEFAULTS['hr.lateness.steps'],
  extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
};

const department = { id: 'd', nameEn: 'D', nameAr: 'د' };
const rows: LatenessRow[] = [
  { employee: { id: 'a', code: 'EMP-0001', nameEn: 'A', nameAr: 'أ' }, department, minutes: 10, days: 0.25 },
  { employee: { id: 'b', code: 'EMP-0002', nameEn: 'B', nameAr: 'ب' }, department, minutes: 0, days: 0 },
];

describe('lateness entries', () => {
  it('minutes are whole numbers from 0 to 6,000; empty counts as 0', () => {
    expect(parseMinutes('')).toBe(0);
    expect(parseMinutes(' 45 ')).toBe(45);
    expect(parseMinutes('6,000')).toBe(6000);
    expect(parseMinutes('6000')).toBe(6000);
    expect(parseMinutes('6001')).toBeNull();
    expect(parseMinutes('-1')).toBeNull();
    expect(parseMinutes('1.5')).toBeNull();
    expect(parseMinutes('abc')).toBeNull();
  });

  it('only changed rows are sent; an invalid row blocks the totals', () => {
    expect(gridState(rows, { a: '10', b: '61' }, RULE)).toEqual({
      invalidCount: 0,
      entries: [{ employeeId: 'b', minutes: 61 }],
      totalMinutes: 71,
      totalDays: 1,
    });
    expect(gridState(rows, { b: '-3' }, RULE)).toMatchObject({ invalidCount: 1, totalDays: null });
  });

  it('?month falls back to this month when missing, malformed or in the future', () => {
    expect(resolveMonth('2026-10', '2026-11')).toBe('2026-10');
    expect(resolveMonth(undefined, '2026-11')).toBe('2026-11');
    expect(resolveMonth('2026-13', '2026-11')).toBe('2026-11');
    expect(resolveMonth('2026-12', '2026-11')).toBe('2026-11');
    expect(resolveMonth(['2026-09', '2026-08'], '2026-11')).toBe('2026-09');
  });
});
