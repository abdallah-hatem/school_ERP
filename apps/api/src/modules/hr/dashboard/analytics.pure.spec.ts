import { analyticsMonths, buildAnalytics, deductionsOf, shareOf, type AnalyticsInputs } from './analytics.pure';

const base = (over: Partial<AnalyticsInputs> = {}): AnalyticsInputs => ({
  current: '2026-11',
  range: 6,
  approvedMonths: 0,
  approvedInRange: [],
  payroll: [],
  stages: [],
  employees: [],
  penalties: [],
  lateness: [],
  workedOut: [],
  ...over,
});

describe('dashboard analytics — the time axis and its range', () => {
  it('6 or 12 months ending with this month, oldest first, across a year end', () => {
    expect(analyticsMonths('2026-11', 6)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    const twelve = analyticsMonths('2026-03', 12);
    expect(twelve).toHaveLength(12);
    expect(twelve[0]).toBe('2025-04');
    expect(twelve[11]).toBe('2026-03');
  });

  it('every series has one entry per month of the range, and nothing outside it', () => {
    const a = buildAnalytics(
      base({
        range: 12,
        approvedInRange: ['2025-11', '2025-12', '2026-11'],
        payroll: [
          { month: '2025-11', net: 1, employees: 1 }, // the month before the range: only for the change
          { month: '2025-12', net: 100, employees: 2 },
        ],
        lateness: [{ month: '2025-11', minutes: 99 }],
      }),
    );
    expect(a.months[0]).toBe('2025-12');
    for (const series of [a.payroll, a.flow, a.penalties, a.lateness]) expect(series).toHaveLength(12);
    expect(a.payroll![0]).toEqual({ month: '2025-12', net: 100, employees: 2, change: 99 });
    expect(a.lateness!.every((l) => l.minutes === 0)).toBe(true);
    expect(a.latestApproved).toBe('2026-11');
  });
});

describe('dashboard analytics — payroll', () => {
  it('months with no approved run are null (a gap), and no change is made up around them', () => {
    const a = buildAnalytics(
      base({
        approvedMonths: 2,
        approvedInRange: ['2026-07', '2026-09'],
        payroll: [
          { month: '2026-07', net: 500_00, employees: 3 },
          { month: '2026-09', net: 700_00, employees: 4 },
        ],
      }),
    );
    expect(a.payroll!.map((p) => p.net)).toEqual([null, 500_00, null, 700_00, null, null]);
    expect(a.payroll!.map((p) => p.change)).toEqual([null, null, null, null, null, null]);
    expect(a.payroll![1].employees).toBe(3);
    expect(a.payroll![0].employees).toBeNull();
    expect(a.latestApproved).toBe('2026-09');
  });

  it('only one approved month: it is the latest, with no change; the count says under two', () => {
    const a = buildAnalytics(
      base({ approvedMonths: 1, approvedInRange: ['2026-10'], payroll: [{ month: '2026-10', net: 42, employees: 1 }] }),
    );
    expect(a.approvedMonths).toBe(1);
    expect(a.latestApproved).toBe('2026-10');
    expect(a.payroll!.find((p) => p.month === '2026-10')).toEqual({ month: '2026-10', net: 42, employees: 1, change: null });
  });

  it('consecutive approved months carry the change from the month before (it can be negative)', () => {
    const a = buildAnalytics(
      base({
        approvedInRange: ['2026-10', '2026-11'],
        payroll: [
          { month: '2026-10', net: 1_000, employees: 2 },
          { month: '2026-11', net: 900, employees: 2 },
        ],
      }),
    );
    expect(a.payroll![5].change).toBe(-100);
  });

  it('no approved run at all: no latest month, every month null', () => {
    const a = buildAnalytics(base());
    expect(a.latestApproved).toBeNull();
    expect(a.payroll!.every((p) => p.net === null)).toBe(true);
  });

  it('a part the viewer may not see stays null', () => {
    const a = buildAnalytics(
      base({ payroll: null, stages: null, employees: null, penalties: null, lateness: null, workedOut: null }),
    );
    expect(a).toMatchObject({
      payroll: null,
      headcountByStage: null,
      flow: null,
      penalties: null,
      lateness: null,
      deductions: null,
      deductionTrend: null,
    });
  });
});

describe('dashboard analytics — joiners, leavers and headcount', () => {
  const people = [
    { hireDate: '2020-01-01', deactivatedOn: null, active: true }, // always there
    { hireDate: '2026-08-01', deactivatedOn: null, active: true }, // joined on the 1st of August
    { hireDate: '2026-07-31', deactivatedOn: null, active: true }, // joined on the last day of July
    { hireDate: '2019-05-05', deactivatedOn: '2026-09-30', active: false }, // left on the last day of September
    { hireDate: '2019-05-05', deactivatedOn: '2026-10-01', active: false }, // left on the 1st of October
    { hireDate: '2019-05-05', deactivatedOn: '2025-01-15', active: false }, // left long before the range
    { hireDate: '2019-05-05', deactivatedOn: null, active: false }, // inactive, day unknown: gone
  ];

  it('a joiner counts in the month of their hire date and a leaver in the month they left — the 1st and the last day too', () => {
    const flow = buildAnalytics(base({ employees: people })).flow!;
    const at = (m: string) => flow.find((f) => f.month === m)!;
    expect(at('2026-07')).toMatchObject({ joiners: 1, leavers: 0 });
    expect(at('2026-08')).toMatchObject({ joiners: 1, leavers: 0 });
    expect(at('2026-09')).toMatchObject({ joiners: 0, leavers: 1 });
    expect(at('2026-10')).toMatchObject({ joiners: 0, leavers: 1 });
    expect(at('2026-06')).toMatchObject({ joiners: 0, leavers: 0 });
  });

  it('headcount at each month end: hired by then and not yet gone; this month is today’s active count', () => {
    const flow = buildAnalytics(base({ employees: people })).flow!;
    expect(flow.map((f) => [f.month, f.headcountEnd])).toEqual([
      ['2026-06', 3], // the long-timer and the two who left in September/October
      ['2026-07', 4], // + the 31 July joiner
      ['2026-08', 5], // + the 1 August joiner
      ['2026-09', 4], // the 30 September leaver is gone at September's end
      ['2026-10', 3], // the 1 October leaver too
      ['2026-11', 3], // today: the three active
    ]);
  });

  it('a reactivated employee is active again (no leaving day): never a leaver', () => {
    const flow = buildAnalytics(base({ employees: [{ hireDate: '2020-01-01', deactivatedOn: null, active: true }] })).flow!;
    expect(flow.every((f) => f.leavers === 0 && f.headcountEnd === 1)).toBe(true);
  });

  it('headcount by stage carries each stage’s share of the total', () => {
    const stage = (id: string) => ({ id, nameEn: id, nameAr: id });
    const a = buildAnalytics(
      base({ stages: [{ stage: stage('kg'), count: 1, noStage: false }, { stage: stage('none'), count: 3, noStage: true }] }),
    );
    expect(a.headcountByStage).toEqual([
      { stage: stage('kg'), count: 1, share: 0.25, noStage: false },
      { stage: stage('none'), count: 3, share: 0.75, noStage: true },
    ]);
  });
});

describe('dashboard analytics — penalties and lateness', () => {
  it('penalties count in the month of the violation date (not when approved), stacked by kind', () => {
    const a = buildAnalytics(
      base({
        penalties: [
          { date: '2026-10-31', action: 'NOTICE', count: 2 },
          { date: '2026-11-01', action: 'WARNING', count: 1 },
          { date: '2026-11-01', action: 'DEDUCT_DAYS', count: 3 },
          { date: '2026-11-20', action: 'DISMISSAL', count: 1 },
          { date: '2026-05-31', action: 'NOTICE', count: 9 }, // before the range
        ],
      }),
    );
    const at = (m: string) => a.penalties!.find((p) => p.month === m)!;
    expect(at('2026-10')).toEqual({ month: '2026-10', notice: 2, deduct: 0, other: 0, total: 2 });
    expect(at('2026-11')).toEqual({ month: '2026-11', notice: 1, deduct: 3, other: 1, total: 5 });
    expect(a.penalties!.reduce((n, p) => n + p.total, 0)).toBe(7);
  });

  it('lateness: the month’s minutes, 0 for a month with none', () => {
    const a = buildAnalytics(base({ lateness: [{ month: '2026-09', minutes: 130 }] }));
    expect(a.lateness!.map((l) => l.minutes)).toEqual([0, 0, 0, 130, 0, 0]);
  });
});

describe('dashboard analytics — deductions vs net', () => {
  const worked = (month: string, over = {}) => ({
    month,
    net: 800_000,
    penaltyAmount: 5_000,
    latenessAmount: 5_000,
    insurance: 100_000,
    incomeTax: 85_000,
    martyrTax: 5_000,
    ...over,
  });

  it('the newest worked-out month split into net, insurance, income tax (with the fund) and penalties; shares of the gross', () => {
    const a = buildAnalytics(base({ workedOut: [worked('2026-10'), worked('2026-09', { net: 1 })] }));
    expect(a.deductions).toEqual({
      month: '2026-10',
      gross: 1_000_000,
      parts: [
        { part: 'net', amount: 800_000, share: 0.8 },
        { part: 'insurance', amount: 100_000, share: 0.1 },
        { part: 'incomeTax', amount: 90_000, share: 0.09 },
        { part: 'penalties', amount: 10_000, share: 0.01 },
      ],
    });
    // Newest first.
    expect(a.deductionTrend!.map((t) => [t.month, t.share])).toEqual([
      ['2026-10', 0.2],
      ['2026-09', expect.any(Number)],
    ]);
    expect(a.deductionTrend![0]).toMatchObject({ insurance: 0.1, incomeTax: 0.09, penalties: 0.01, amount: 200_000 });
  });

  it('the trend lists at most the six newest worked-out months', () => {
    const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const a = buildAnalytics(base({ range: 12, workedOut: months.map((m) => worked(m)) }));
    expect(a.deductionTrend!.map((t) => t.month)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
    expect(a.deductions!.month).toBe('2026-10');
  });

  it('no worked-out month: no snapshot, an empty trend; a month outside the range is left out', () => {
    expect(buildAnalytics(base()).deductions).toBeNull();
    const a = buildAnalytics(base({ workedOut: [worked('2025-01')] }));
    expect(a.deductions).toBeNull();
    expect(a.deductionTrend).toEqual([]);
  });

  it('a month with nothing paid has 0 shares, never NaN', () => {
    const d = deductionsOf(worked('2026-10', { net: 0, penaltyAmount: 0, latenessAmount: 0, insurance: 0, incomeTax: 0, martyrTax: 0 }));
    expect(d.gross).toBe(0);
    expect(d.parts.every((p) => p.share === 0)).toBe(true);
    expect(shareOf(1, 3)).toBe(0.3333);
  });
});
