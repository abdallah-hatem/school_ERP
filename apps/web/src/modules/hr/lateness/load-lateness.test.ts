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
    const month: LatenessMonth = { locked: true, rule: { ...RULE, graceMinutes: 10 }, rows: [] };
    apis.GET_LATENESS.mockResolvedValue({ success: true, status: 200, data: month });
    expect(await loadLateness('2026-11')).toEqual({ rows: [], locked: true, rule: month.rule });
    expect(apis.GET_LATENESS).toHaveBeenCalledTimes(1);
  });

  it('a failed list is an error state: no rows and no rule', async () => {
    apis.GET_LATENESS.mockResolvedValue({ success: false, status: 502, message: 'x' });
    expect(await loadLateness('2026-11')).toEqual({ rows: null, locked: false, rule: null });
  });
});
