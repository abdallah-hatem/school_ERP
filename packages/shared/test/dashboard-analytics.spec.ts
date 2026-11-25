import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYTICS_RANGE,
  PENALTY_ACTIONS,
  SEEDED_PENALTY_ACTIONS,
  dashboardAnalyticsQuerySchema,
  parseAnalyticsRange,
  penaltyKindOf,
} from '../src';

describe('dashboard analytics query (zod)', () => {
  it('accepts 6 and 12, as query strings', () => {
    expect(dashboardAnalyticsQuerySchema.parse({ months: '6' })).toEqual({ months: 6 });
    expect(dashboardAnalyticsQuerySchema.parse({ months: '12' })).toEqual({ months: 12 });
  });

  it('defaults to 6 months', () => {
    expect(dashboardAnalyticsQuerySchema.parse({})).toEqual({ months: DEFAULT_ANALYTICS_RANGE });
    expect(DEFAULT_ANALYTICS_RANGE).toBe(6);
  });

  it('refuses any other range, a number, and unknown parameters', () => {
    for (const months of ['0', '1', '5', '7', '11', '13', '24', '-6', '6.0', ' 6', 'abc', '']) {
      expect(dashboardAnalyticsQuerySchema.safeParse({ months }).success).toBe(false);
    }
    expect(dashboardAnalyticsQuerySchema.safeParse({ months: 6 }).success).toBe(false);
    expect(dashboardAnalyticsQuerySchema.safeParse({ months: ['6', '12'] }).success).toBe(false);
    expect(dashboardAnalyticsQuerySchema.safeParse({ months: '6', page: '1' }).success).toBe(false);
  });

  it('parseAnalyticsRange (web URL): a valid range or undefined', () => {
    expect(parseAnalyticsRange('12')).toBe(12);
    expect(parseAnalyticsRange('6')).toBe(6);
    expect(parseAnalyticsRange('7')).toBeUndefined();
    expect(parseAnalyticsRange(undefined)).toBeUndefined();
    expect(parseAnalyticsRange(['6'])).toBeUndefined();
  });
});

describe('penalty kinds', () => {
  it('notice and warning; day deductions; everything else of the seeded ten is other', () => {
    const seeded = (code: string) => SEEDED_PENALTY_ACTIONS.find((a) => a.code === code)!;
    const kind = (code: string, days: number | null = null) => penaltyKindOf({ code: seeded(code).code, effect: seeded(code).effect, days });
    expect(kind('NOTICE')).toBe('notice');
    expect(kind('WARNING')).toBe('notice');
    expect(kind('DEDUCT_DAYS', 1)).toBe('deduct');
    const other = PENALTY_ACTIONS.filter((a) => !['NOTICE', 'WARNING', 'DEDUCT_DAYS'].includes(a));
    expect(other.length).toBeGreaterThan(0);
    for (const a of other) expect(kind(a)).toBe('other');
  });

  it('edge case 31: a school-added Record-only action counts as "Other"; any deducting effect as "Pay deductions"', () => {
    expect(penaltyKindOf({ code: null, effect: 'RECORD_ONLY', days: null })).toBe('other');
    expect(penaltyKindOf({ code: null, effect: 'DEDUCT_PERCENT', days: null })).toBe('deduct');
    expect(penaltyKindOf({ code: null, effect: 'DEDUCT_AMOUNT', days: null })).toBe('deduct');
    expect(penaltyKindOf({ code: null, effect: 'DEDUCT_DAYS', days: 0.5 })).toBe('deduct');
    // Investigation with days costs pay (moved from "Other", spec GUESS); without days it doesn't.
    expect(penaltyKindOf({ code: 'INVESTIGATION', effect: 'INVESTIGATION', days: 2 })).toBe('deduct');
    expect(penaltyKindOf({ code: 'INVESTIGATION', effect: 'INVESTIGATION', days: null })).toBe('other');
  });
});
