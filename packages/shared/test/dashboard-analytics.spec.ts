import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANALYTICS_RANGE,
  PENALTY_ACTIONS,
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
  it('notice and warning; day deductions; everything else is other', () => {
    expect(penaltyKindOf('NOTICE')).toBe('notice');
    expect(penaltyKindOf('WARNING')).toBe('notice');
    expect(penaltyKindOf('DEDUCT_DAYS')).toBe('deduct');
    const other = PENALTY_ACTIONS.filter((a) => !['NOTICE', 'WARNING', 'DEDUCT_DAYS'].includes(a));
    expect(other.length).toBeGreaterThan(0);
    for (const a of other) expect(penaltyKindOf(a)).toBe('other');
  });
});
