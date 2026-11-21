import { SETTING_DEFAULTS, type LatenessMonth } from '@school-erp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the lateness list is mocked: a call to any other endpoint (HR settings) would fail here.
const apis = vi.hoisted(() => ({ GET_LATENESS: vi.fn() }));
vi.mock('./apis', () => apis);

import { loadLateness } from './load-lateness';

const RULE = {
  graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
  steps: SETTING_DEFAULTS['hr.lateness.steps'],
  extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
};

beforeEach(() => apis.GET_LATENESS.mockReset());

describe('loadLateness', () => {
  it('takes the rule from the month list — one read, no HR settings (a Principal holds no hr.settings.view)', async () => {
    const totals = { employees: 0, minutes: 0, days: 0 };
    const month: LatenessMonth = { locked: true, rule: { ...RULE, graceMinutes: 10 }, items: [], total: 0, page: 2, limit: 10, totals };
    apis.GET_LATENESS.mockResolvedValue({ success: true, status: 200, data: month });
    expect(await loadLateness('2026-11', { search: 'mona', page: 2 })).toEqual({
      rows: [],
      locked: true,
      rule: month.rule,
      total: 0,
      page: 2,
      limit: 10,
      totals,
    });
    expect(apis.GET_LATENESS).toHaveBeenCalledTimes(1);
    // The API searches and pages the month.
    expect(apis.GET_LATENESS).toHaveBeenCalledWith('2026-11', { search: 'mona', page: 2 });
  });

  it('a failed list is an error state: no rows and no rule', async () => {
    apis.GET_LATENESS.mockResolvedValue({ success: false, status: 502, message: 'x' });
    expect(await loadLateness('2026-11')).toMatchObject({ rows: null, locked: false, rule: null, totals: null });
  });
});
