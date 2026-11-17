import {
  countPriorInWindow,
  isEarlierPenalty,
  penaltyLevel,
  repetitionWindowStart,
  resolvePenalty,
  type CatalogueLevel,
  type PenaltyTarget,
  type RecordedPenalty,
} from '.';

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

const PAIR = { employeeId: 'e1', violationId: 'late' };

/** A recorded penalty of PAIR dated `date`, recorded at `time` that day (or at a full ISO). */
const rec = (
  id: string,
  date: string,
  time = '08:00',
  over: Partial<RecordedPenalty> = {},
): RecordedPenalty => ({
  ...PAIR,
  id,
  date,
  recordedAt: new Date(time.includes('T') ? time : `${date}T${time}:00Z`),
  status: 'APPROVED',
  ...over,
});
/** Approved records of PAIR on these dates — for the window cases, where order on a day is moot. */
const dated = (...dates: string[]) => dates.map((d, i) => rec(`p${i}`, d));
/** A penalty of PAIR not recorded yet (preview / the moment of recording). */
const unrecorded = (date: string): PenaltyTarget => ({ ...PAIR, date });

describe('countPriorInWindow (§4 DECIDED: earlier date, or same date and recorded earlier)', () => {
  describe('window boundary unchanged', () => {
    it('contract year: an approved record from 31 May does not count on 1 June', () => {
      expect(countPriorInWindow(unrecorded('2026-06-01'), 'CONTRACT_YEAR', dated('2026-05-31'))).toBe(
        0,
      );
      expect(countPriorInWindow(unrecorded('2026-05-31'), 'CONTRACT_YEAR', dated('2025-06-01'))).toBe(
        1,
      );
    });
    it('calendar year: 31 Dec does not count on 1 Jan', () => {
      expect(countPriorInWindow(unrecorded('2026-01-01'), 'CALENDAR_YEAR', dated('2025-12-31'))).toBe(
        0,
      );
    });
    it('rolling 12 months: 2025-11-17 counts on 2026-11-16, not on 2026-11-18', () => {
      const approved = dated('2025-11-17');
      expect(countPriorInWindow(unrecorded('2026-11-16'), 'ROLLING_12_MONTHS', approved)).toBe(1);
      expect(countPriorInWindow(unrecorded('2026-11-18'), 'ROLLING_12_MONTHS', approved)).toBe(0);
    });
    it('a recorded penalty on 1 June ignores 31 May but counts 1 June recorded earlier', () => {
      const target = rec('t', '2026-06-01', '12:00', { status: 'PENDING' });
      const approved = [rec('a', '2026-05-31', '07:00'), rec('b', '2026-06-01', '07:00')];
      expect(countPriorInWindow(target, 'CONTRACT_YEAR', approved)).toBe(1);
    });
  });

  it('earlier date still counts (even if recorded later); a later date never does', () => {
    const target = rec('t', '2026-11-10', '08:00', { status: 'PENDING' });
    // Dated 3 Nov but entered after the target: the date decides.
    const earlierDate = rec('a', '2026-11-03', '2026-11-12T10:00:00Z');
    const laterDate = rec('b', '2026-11-12', '07:00');
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [earlierDate, laterDate])).toBe(1);
  });

  it('two approved same day → 1 then 2', () => {
    const first = rec('a', '2026-11-10', '08:00', { status: 'PENDING' });
    const second = rec('b', '2026-11-10', '09:00', { status: 'PENDING' });
    // Approving the first: nothing approved yet → level 1.
    const firstLevel = penaltyLevel(countPriorInWindow(first, 'CONTRACT_YEAR', []), levels5);
    expect(firstLevel).toBe(1);
    // Approving the second: the first is approved, same date, recorded earlier → level 2.
    const approvedFirst = { ...first, status: 'APPROVED' as const };
    expect(penaltyLevel(countPriorInWindow(second, 'CONTRACT_YEAR', [approvedFirst]), levels5)).toBe(
      2,
    );
  });

  it('same day but recorded later than the one being approved doesn’t count', () => {
    const target = rec('a', '2026-11-10', '08:00', { status: 'PENDING' });
    const laterSameDay = rec('b', '2026-11-10', '09:00');
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [laterSameDay])).toBe(0);
  });

  it('same day, same instant: the lower id comes first (final tie-break)', () => {
    const at = '2026-11-10T08:00:00.000Z';
    const a = rec('0b1c0000-0000-4000-8000-00000000000a', '2026-11-10', at);
    const b = rec('0b1c0000-0000-4000-8000-00000000000b', '2026-11-10', at);
    expect(countPriorInWindow(b, 'CONTRACT_YEAR', [a])).toBe(1);
    expect(countPriorInWindow(a, 'CONTRACT_YEAR', [b])).toBe(0);
  });

  it('the penalty itself never counts', () => {
    const target = rec('a', '2026-11-10');
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [target])).toBe(0);
  });

  it('cancelled same day doesn’t count', () => {
    const target = rec('t', '2026-11-10', '09:00', { status: 'PENDING' });
    const cancelled = rec('c', '2026-11-10', '07:00', { status: 'CANCELLED' });
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [cancelled])).toBe(0);
    expect(countPriorInWindow(unrecorded('2026-11-10'), 'CONTRACT_YEAR', [cancelled])).toBe(0);
  });

  it('pending doesn’t count', () => {
    const target = rec('t', '2026-11-10', '09:00', { status: 'PENDING' });
    const pending = [rec('p', '2026-11-10', '07:00', { status: 'PENDING' })];
    pending.push(rec('q', '2026-11-03', '07:00', { status: 'PENDING' }));
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', pending)).toBe(0);
  });

  it('different violation same day doesn’t count (nor another employee’s)', () => {
    const target = rec('t', '2026-11-10', '09:00', { status: 'PENDING' });
    const others = [
      rec('o', '2026-11-10', '07:00', { violationId: 'phone' }),
      rec('x', '2026-11-10', '07:00', { employeeId: 'e2' }),
    ];
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', others)).toBe(0);
  });

  it('preview on a day that already has 2 approved → level 3', () => {
    // Not recorded yet: it will be recorded after both, so both count.
    const approved = [rec('a', '2026-11-10', '08:00'), rec('b', '2026-11-10', '23:59')];
    const prior = countPriorInWindow(unrecorded('2026-11-10'), 'CONTRACT_YEAR', approved);
    expect(prior).toBe(2);
    expect(penaltyLevel(prior, levels5)).toBe(3);
  });
});

describe('isEarlierPenalty (the repeat order)', () => {
  it('orders by date, then when recorded, then id', () => {
    const t = rec('m', '2026-11-10', '09:00');
    expect(isEarlierPenalty(rec('z', '2026-11-09', '23:59'), t)).toBe(true);
    expect(isEarlierPenalty(rec('a', '2026-11-11', '00:00'), t)).toBe(false);
    expect(isEarlierPenalty(rec('z', '2026-11-10', '08:59'), t)).toBe(true);
    expect(isEarlierPenalty(rec('a', '2026-11-10', '09:01'), t)).toBe(false);
    expect(isEarlierPenalty(rec('a', '2026-11-10', '09:00'), t)).toBe(true);
    expect(isEarlierPenalty(rec('z', '2026-11-10', '09:00'), t)).toBe(false);
  });
  it('a not-yet-recorded penalty comes after every one on its date', () => {
    expect(isEarlierPenalty(rec('z', '2026-11-10', '23:59'), unrecorded('2026-11-10'))).toBe(true);
    expect(isEarlierPenalty(rec('a', '2026-11-11', '00:00'), unrecorded('2026-11-10'))).toBe(false);
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
