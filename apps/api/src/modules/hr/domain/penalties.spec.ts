import { countPriorInWindow, repetitionWindowStart, resolvePenalty, type CatalogueLevel } from '.';

const levels5: CatalogueLevel[] = [
  { level: 1, action: 'NOTICE', days: null },
  { level: 2, action: 'WARNING', days: null },
  { level: 3, action: 'DEDUCT_DAYS', days: 1 },
  { level: 4, action: 'DEDUCT_DAYS', days: 2 },
  { level: 5, action: 'DEDUCT_DAYS', days: 5 },
];

describe('repetitionWindowStart (§4, §7)', () => {
  it('CONTRACT_YEAR starts on 1 June of the contract year', () => {
    expect(repetitionWindowStart('2026-11-17', 'CONTRACT_YEAR')).toBe('2026-06-01');
    expect(repetitionWindowStart('2026-05-31', 'CONTRACT_YEAR')).toBe('2025-06-01');
    expect(repetitionWindowStart('2026-06-01', 'CONTRACT_YEAR')).toBe('2026-06-01');
  });
  it('CALENDAR_YEAR starts on 1 January', () => {
    expect(repetitionWindowStart('2026-01-01', 'CALENDAR_YEAR')).toBe('2026-01-01');
    expect(repetitionWindowStart('2026-12-31', 'CALENDAR_YEAR')).toBe('2026-01-01');
  });
  it('ROLLING_12_MONTHS starts on the same day a year earlier (29 Feb → 28 Feb)', () => {
    expect(repetitionWindowStart('2026-11-17', 'ROLLING_12_MONTHS')).toBe('2025-11-17');
    expect(repetitionWindowStart('2028-02-29', 'ROLLING_12_MONTHS')).toBe('2027-02-28');
  });
});

describe('countPriorInWindow (§4 GUESS: strictly earlier dates, inside the window)', () => {
  it('contract year: an approved record from 31 May does not count on 1 June', () => {
    expect(countPriorInWindow('2026-06-01', 'CONTRACT_YEAR', ['2026-05-31'])).toBe(0);
    expect(countPriorInWindow('2026-05-31', 'CONTRACT_YEAR', ['2025-06-01'])).toBe(1);
  });
  it('calendar year: 31 Dec does not count on 1 Jan', () => {
    expect(countPriorInWindow('2026-01-01', 'CALENDAR_YEAR', ['2025-12-31'])).toBe(0);
  });
  it('rolling 12 months: 2025-11-17 counts on 2026-11-16, not on 2026-11-18', () => {
    expect(countPriorInWindow('2026-11-16', 'ROLLING_12_MONTHS', ['2025-11-17'])).toBe(1);
    expect(countPriorInWindow('2026-11-18', 'ROLLING_12_MONTHS', ['2025-11-17'])).toBe(0);
  });
  it('same date and later dates never count', () => {
    expect(countPriorInWindow('2026-11-10', 'CONTRACT_YEAR', ['2026-11-10', '2026-11-12'])).toBe(0);
    expect(countPriorInWindow('2026-11-10', 'CONTRACT_YEAR', ['2026-11-03', '2026-11-09'])).toBe(2);
  });
});

describe('resolvePenalty', () => {
  it('copies the level’s action and days', () => {
    expect(resolvePenalty(0, levels5)).toEqual({ level: 1, action: 'NOTICE', days: null });
    expect(resolvePenalty(2, levels5)).toEqual({ level: 3, action: 'DEDUCT_DAYS', days: 1 });
  });
  it('"doubles on repeat": level 5 with 7 prior → level-5 days, not doubled', () => {
    expect(resolvePenalty(7, levels5)).toEqual({ level: 5, action: 'DEDUCT_DAYS', days: 5 });
  });
});
