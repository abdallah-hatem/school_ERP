import { latenessDays, SETTING_DEFAULTS, type LatenessRule } from '@school-erp/shared';
import { describe, expect, it } from 'vitest';

// The screens' live "days" preview uses the shared rule — the same implementation as the API
// (apps/api/src/modules/hr/domain/domain.spec.ts runs the same table).
const rule: LatenessRule = {
  graceMinutes: SETTING_DEFAULTS['hr.lateness.graceMinutes'],
  steps: SETTING_DEFAULTS['hr.lateness.steps'],
  extraHourDays: SETTING_DEFAULTS['hr.lateness.extraHourDays'],
};

describe('shared latenessDays in the web build', () => {
  it.each([
    [0, 0],
    [1, 0.25],
    [60, 0.25],
    [61, 0.75],
    [120, 0.75],
    [121, 1.25],
    [180, 1.25],
    [181, 1.75],
  ])('lateness %i min → %d days in the web build', (minutes, days) => {
    expect(latenessDays(minutes, rule)).toBe(days);
  });
});
