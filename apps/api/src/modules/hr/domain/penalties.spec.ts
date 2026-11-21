import {
  countPriorInWindow,
  earlierPendingPenalty,
  isEarlierPenalty,
  penaltyLevel,
  recountAcknowledged,
  recountAfterApproval,
  recountLockedMonth,
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
      const target = rec('t', '2026-06-01', '12:00', { status: 'WAITING_HR' });
      const approved = [rec('a', '2026-05-31', '07:00'), rec('b', '2026-06-01', '07:00')];
      expect(countPriorInWindow(target, 'CONTRACT_YEAR', approved)).toBe(1);
    });
  });

  it('earlier date still counts (even if recorded later); a later date never does', () => {
    const target = rec('t', '2026-11-10', '08:00', { status: 'WAITING_HR' });
    // Dated 3 Nov but entered after the target: the date decides.
    const earlierDate = rec('a', '2026-11-03', '2026-11-12T10:00:00Z');
    const laterDate = rec('b', '2026-11-12', '07:00');
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [earlierDate, laterDate])).toBe(1);
  });

  it('two approved same day → 1 then 2', () => {
    const first = rec('a', '2026-11-10', '08:00', { status: 'WAITING_HR' });
    const second = rec('b', '2026-11-10', '09:00', { status: 'WAITING_HR' });
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
    const target = rec('a', '2026-11-10', '08:00', { status: 'WAITING_HR' });
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
    const target = rec('t', '2026-11-10', '09:00', { status: 'WAITING_HR' });
    const cancelled = rec('c', '2026-11-10', '07:00', { status: 'CANCELLED' });
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', [cancelled])).toBe(0);
    expect(countPriorInWindow(unrecorded('2026-11-10'), 'CONTRACT_YEAR', [cancelled])).toBe(0);
  });

  it('pending doesn’t count', () => {
    const target = rec('t', '2026-11-10', '09:00', { status: 'WAITING_HR' });
    const pending = [rec('p', '2026-11-10', '07:00', { status: 'WAITING_HR' })];
    pending.push(rec('q', '2026-11-03', '07:00', { status: 'WAITING_HR' }));
    expect(countPriorInWindow(target, 'CONTRACT_YEAR', pending)).toBe(0);
  });

  it('different violation same day doesn’t count (nor another employee’s)', () => {
    const target = rec('t', '2026-11-10', '09:00', { status: 'WAITING_HR' });
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

describe('earlierPendingPenalty (§4 DECIDED 2026-11-20: approve in date order)', () => {
  const pending = (id: string, date: string, time = '08:00', over: Partial<RecordedPenalty> = {}) =>
    rec(id, date, time, { status: 'WAITING_HR', ...over });
  const w = 'CONTRACT_YEAR' as const;

  it("the owner's scenario: 18 approved, 19 + 20 pending → 20 waits for 19; 19 can go", () => {
    const d18 = rec('a18', '2026-11-18');
    const d19 = pending('a19', '2026-11-19');
    const d20 = pending('a20', '2026-11-20');
    const all = [d18, d19, d20];
    expect(earlierPendingPenalty(d20, w, all)).toBe(d19);
    expect(earlierPendingPenalty(d19, w, all)).toBeNull();
    // Once 19 is approved, 20 is free — and its level counts 18 and 19.
    const after = [d18, { ...d19, status: 'APPROVED' as const }, d20];
    expect(earlierPendingPenalty(d20, w, after)).toBeNull();
    expect(penaltyLevel(countPriorInWindow(d20, w, after), levels5)).toBe(3);
  });

  it('refuses for an earlier date pending', () => {
    const target = pending('t', '2026-11-20');
    expect(earlierPendingPenalty(target, w, [pending('e', '2026-11-02'), target])?.id).toBe('e');
  });

  it('refuses for a same-date penalty recorded earlier (then by id at the same instant)', () => {
    const target = pending('m', '2026-11-20', '09:00');
    expect(earlierPendingPenalty(target, w, [pending('z', '2026-11-20', '08:59')])?.id).toBe('z');
    expect(earlierPendingPenalty(target, w, [pending('a', '2026-11-20', '09:00')])?.id).toBe('a');
  });

  it('a same-date penalty recorded later does not block the earlier one', () => {
    const target = pending('m', '2026-11-20', '09:00');
    expect(earlierPendingPenalty(target, w, [pending('x', '2026-11-20', '09:01')])).toBeNull();
    expect(earlierPendingPenalty(target, w, [pending('z', '2026-11-20', '09:00')])).toBeNull();
  });

  it('a later date never blocks', () => {
    expect(earlierPendingPenalty(pending('t', '2026-11-19'), w, [pending('l', '2026-11-20')])).toBeNull();
  });

  it('an earlier approved or cancelled penalty does not block', () => {
    const target = pending('t', '2026-11-20');
    expect(earlierPendingPenalty(target, w, [rec('a', '2026-11-19')])).toBeNull();
    expect(earlierPendingPenalty(target, w, [rec('c', '2026-11-19', '08:00', { status: 'CANCELLED' })])).toBeNull();
  });

  it('other violations and other employees do not block', () => {
    const target = pending('t', '2026-11-20');
    expect(
      earlierPendingPenalty(target, w, [
        pending('v', '2026-11-19', '08:00', { violationId: 'absent' }),
        pending('e', '2026-11-19', '08:00', { employeeId: 'e2' }),
      ]),
    ).toBeNull();
  });

  it('the penalty itself never blocks', () => {
    const target = pending('t', '2026-11-20');
    expect(earlierPendingPenalty(target, w, [target])).toBeNull();
  });

  it('names the earliest of several earlier pending ones', () => {
    const target = pending('t', '2026-11-20');
    const records = [pending('b', '2026-11-19'), pending('a', '2026-11-18', '10:00'), pending('c', '2026-11-18', '11:00')];
    expect(earlierPendingPenalty(target, w, records)?.id).toBe('a');
  });

  it('a pending penalty before the repetition window does not block (it would not count either)', () => {
    const target = pending('t', '2026-06-01');
    expect(earlierPendingPenalty(target, w, [pending('may', '2026-05-31')])).toBeNull();
    expect(earlierPendingPenalty(target, 'ROLLING_12_MONTHS', [pending('may', '2026-05-31')])?.id).toBe('may');
  });

  it('a not-yet-recorded penalty is after every one on its date', () => {
    expect(earlierPendingPenalty(unrecorded('2026-11-20'), w, [pending('z', '2026-11-20', '23:59')])?.id).toBe('z');
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

describe('recountAfterApproval (§4 DECIDED 2026-11-20: a backdated penalty recounts the later approved ones)', () => {
  const w = 'CONTRACT_YEAR' as const;
  /** An APPROVED record of PAIR with its fixed level (the action and days of that level in levels5). */
  const fixed = (id: string, date: string, level: number, over: Partial<RecordedPenalty> = {}, time = '08:00') => {
    const entry = levels5.find((l) => l.level === level)!;
    return { ...rec(id, date, time, over), level, action: entry.action, days: entry.days };
  };
  /** The recorded backdated penalty: recorded after the others (on 21 Nov). */
  const backdated = (date: string): PenaltyTarget => ({
    ...PAIR,
    id: 'new',
    date,
    recordedAt: new Date('2026-11-21T10:00:00Z'),
  });
  const summary = (changes: ReturnType<typeof recountAfterApproval>) =>
    changes.map((c) => `${c.record.id}:${c.before.level}→${c.after.level}`);

  it("the owner's case: 19 Nov L1 and 20 Nov L2 approved; approving 18 Nov moves them to L2 and L3, with the new levels' action and days", () => {
    const records = [fixed('d20', '2026-11-20', 2), fixed('d19', '2026-11-19', 1)];
    expect(recountAfterApproval(backdated('2026-11-18'), w, records, levels5)).toEqual([
      {
        record: expect.objectContaining({ id: 'd19' }),
        before: { level: 1, action: 'NOTICE', days: null },
        after: { level: 2, action: 'WARNING', days: null },
      },
      {
        record: expect.objectContaining({ id: 'd20' }),
        before: { level: 2, action: 'WARNING', days: null },
        after: { level: 3, action: 'DEDUCT_DAYS', days: 1 },
      },
    ]);
    // The 18th itself gets level 1 (nothing approved before it): 18/19/20 → 1/2/3.
    expect(countPriorInWindow(backdated('2026-11-18'), w, records)).toBe(0);
  });

  it('the same answer before it is recorded (preview / recording): later dates move', () => {
    const records = [fixed('d19', '2026-11-19', 1), fixed('d20', '2026-11-20', 2)];
    expect(summary(recountAfterApproval(unrecorded('2026-11-18'), w, records, levels5))).toEqual(['d19:1→2', 'd20:2→3']);
  });

  it('pending and cancelled ones are never changed; approved ones around them still move', () => {
    const records = [
      fixed('d19', '2026-11-19', 1),
      fixed('p20', '2026-11-20', 2, { status: 'WAITING_HR' }),
      fixed('c21', '2026-11-21', 2, { status: 'CANCELLED' }),
      fixed('d22', '2026-11-22', 2),
    ];
    expect(summary(recountAfterApproval(backdated('2026-11-18'), w, records, levels5))).toEqual(['d19:1→2', 'd22:2→3']);
  });

  it('a gap left by a cancellation stays: each later one moves up exactly one level', () => {
    // 19 L1, 20 L2 approved; 19 cancelled (20 keeps L2, §4); then 18 approved → 20 becomes L3.
    const records = [fixed('d19', '2026-11-19', 1, { status: 'CANCELLED' }), fixed('d20', '2026-11-20', 2)];
    expect(summary(recountAfterApproval(backdated('2026-11-18'), w, records, levels5))).toEqual(['d20:2→3']);
  });

  it('earlier ones, other violations and other employees are untouched', () => {
    const records = [
      fixed('d10', '2026-11-10', 1),
      fixed('otherV', '2026-11-20', 1, { violationId: 'other' }),
      fixed('otherE', '2026-11-20', 1, { employeeId: 'e2' }),
      fixed('d20', '2026-11-20', 2),
    ];
    expect(summary(recountAfterApproval(backdated('2026-11-18'), w, records, levels5))).toEqual(['d20:2→3']);
  });

  it('outside the window untouched: 31 May does not move 1 June (contract year); rolling 12 months it does', () => {
    const records = [fixed('jun', '2026-06-01', 1)];
    expect(recountAfterApproval(backdated('2026-05-31'), w, records, levels5)).toEqual([]);
    expect(summary(recountAfterApproval(backdated('2026-05-31'), 'ROLLING_12_MONTHS', records, levels5))).toEqual(['jun:1→2']);
    // Rolling: more than a year earlier is outside that one's window.
    expect(recountAfterApproval(backdated('2025-05-31'), 'ROLLING_12_MONTHS', records, levels5)).toEqual([]);
  });

  it('no later approved penalty → nothing', () => {
    expect(recountAfterApproval(backdated('2026-11-18'), w, [], levels5)).toEqual([]);
    expect(recountAfterApproval(backdated('2026-11-18'), w, [fixed('d10', '2026-11-10', 1)], levels5)).toEqual([]);
  });

  it('same date: one recorded before the target is not moved (it stays earlier); one recorded after it is', () => {
    const records = [
      fixed('before', '2026-11-18', 1, {}, '2026-11-18T07:00:00Z'),
      fixed('after', '2026-11-18', 2, {}, '2026-11-22T07:00:00Z'),
    ];
    expect(summary(recountAfterApproval(backdated('2026-11-18'), w, records, levels5))).toEqual(['after:2→3']);
    // Not recorded yet: every same-date one comes before it, so none moves.
    expect(recountAfterApproval(unrecorded('2026-11-18'), w, records, levels5)).toEqual([]);
  });

  it('the target itself never moves', () => {
    expect(recountAfterApproval(backdated('2026-11-18'), w, [fixed('new', '2026-11-18', 1)], levels5)).toEqual([]);
  });

  it('capped at the last level: a level-5 one stays and is not listed; one above today’s last level never goes down', () => {
    const records = [fixed('l4', '2026-11-19', 4), fixed('l5', '2026-11-20', 5)];
    expect(summary(recountAfterApproval(backdated('2026-11-18'), w, records, levels5))).toEqual(['l4:4→5']);
    expect(recountAfterApproval(backdated('2026-11-18'), w, [fixed('l3', '2026-11-19', 3)], levels5.slice(0, 2))).toEqual([]);
  });

  it('action and days come from the catalogue given (today’s), not the stored ones', () => {
    const edited = levels5.map((l) => (l.level === 2 ? { ...l, action: 'DEDUCT_DAYS' as const, days: 0.5 } : l));
    const [change] = recountAfterApproval(backdated('2026-11-18'), w, [fixed('d19', '2026-11-19', 1)], edited);
    expect(change?.after).toEqual({ level: 2, action: 'DEDUCT_DAYS', days: 0.5 });
  });
});

describe('recountLockedMonth (§4: an approved month cannot be recounted)', () => {
  const change = (id: string, date: string) => ({
    record: { ...rec(id, date), level: 1, action: 'NOTICE' as const, days: null },
    before: { level: 1, action: 'NOTICE' as const, days: null },
    after: { level: 2, action: 'WARNING' as const, days: null },
  });

  it('names the earliest locked month among the changes', () => {
    const changes = [change('a', '2026-11-20'), change('b', '2026-10-05'), change('c', '2026-12-01')];
    expect(recountLockedMonth(changes, new Set(['2026-11', '2026-10']))).toBe('2026-10');
    expect(recountLockedMonth(changes, new Set(['2026-12']))).toBe('2026-12');
  });

  it('none locked, or nothing changes → null', () => {
    expect(recountLockedMonth([change('a', '2026-11-20')], new Set(['2026-09']))).toBeNull();
    expect(recountLockedMonth([], new Set(['2026-11']))).toBeNull();
  });
});

describe('recountAcknowledged (§4: the approval names what it changes)', () => {
  const change = (id: string, level: number, days: number | null = null) => ({
    record: { ...rec(id, '2026-11-20'), level: level - 1, action: 'NOTICE' as const, days: null },
    before: { level: level - 1, action: 'NOTICE' as const, days: null },
    after: { level, action: days ? ('DEDUCT_DAYS' as const) : ('WARNING' as const), days },
  });
  const ack = (id: string, level: number, days: number | null = null) => ({
    id,
    level,
    action: days ? ('DEDUCT_DAYS' as const) : ('WARNING' as const),
    days,
  });

  it('nothing changes: no confirmation needed, an empty one matches too', () => {
    expect(recountAcknowledged([], undefined)).toBe(true);
    expect(recountAcknowledged([], [])).toBe(true);
  });

  it('changes need the confirmation: missing → false; the same list in any order → true', () => {
    const changes = [change('a', 2), change('b', 3, 1)];
    expect(recountAcknowledged(changes, undefined)).toBe(false);
    expect(recountAcknowledged(changes, [ack('b', 3, 1), ack('a', 2)])).toBe(true);
  });

  it('a stale confirmation → false: a missing or extra penalty, another level, action or days, a duplicate', () => {
    const changes = [change('a', 2), change('b', 3, 1)];
    expect(recountAcknowledged(changes, [ack('a', 2)])).toBe(false);
    expect(recountAcknowledged(changes, [ack('a', 2), ack('b', 3, 1), ack('c', 2)])).toBe(false);
    expect(recountAcknowledged(changes, [ack('a', 3), ack('b', 3, 1)])).toBe(false);
    expect(recountAcknowledged(changes, [ack('a', 2), ack('b', 3, 2)])).toBe(false);
    expect(recountAcknowledged(changes, [ack('a', 2), { ...ack('b', 3, 1), action: 'INVESTIGATION' as const }])).toBe(false);
    expect(recountAcknowledged(changes, [ack('a', 2), ack('a', 2)])).toBe(false);
    expect(recountAcknowledged([], [ack('a', 2)])).toBe(false);
  });
});
