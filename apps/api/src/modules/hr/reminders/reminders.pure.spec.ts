import { schoolDayOf } from '@school-erp/shared';
import {
  reminderEmployeeOf,
  contractReminders,
  daysUntil,
  effectiveCheckDay,
  latenessReminders,
  noticeWindowReminders,
  pastCheckDay,
  renewalsDueReminders,
  payrollNotApprovedReminders,
  payrollNotPreparedReminders,
  probationReminders,
  reminderMonths,
  type OpenReminder,
  type ReminderEmployee,
  type ReminderMonth,
} from './reminders.pure';

/* HR reminders' pure rules — plan N3 edge cases (docs/plans/2026-11-18-notifications-plan.md). */

const RULE = {
  contractEndDays: 30,
  contractEndSecondDays: 7,
  probationEndDays: 7,
  latenessCheckDay: 25,
  payrollCheckDay: 28,
  renewalDecisionsDays: 91,
  noticeWindowCloseDays: 7,
};

const emp = (id: string, contractEnd: string, probationEnd: string | null = null): ReminderEmployee => ({
  id,
  nameEn: `Name ${id}`,
  nameAr: `اسم ${id}`,
  contractEnd,
  probationEnd,
});

const openItem = (entityType: string, entityId: string, dedupeKey: string): OpenReminder => ({
  entityType,
  entityId,
  dedupeKey,
});
const openContract = (id: string, date: string, days: number) =>
  openItem('employee', id, `contract_end:${id}:${date}:${days}`);
const openProbation = (id: string, date: string) => openItem('employee', id, `probation_end:${id}:${date}`);

const keys = (plan: { notify: { dedupeKey: string }[] }) => plan.notify.map((n) => n.dedupeKey);
const resolvedKeys = (plan: { resolve: { dedupeKey: string }[] }) => plan.resolve.map((r) => r.dedupeKey);

describe('dates', () => {
  it('daysUntil counts whole calendar days, across months and years', () => {
    expect(daysUntil('2027-05-01', '2027-05-31')).toBe(30);
    expect(daysUntil('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysUntil('2026-11-18', '2026-11-17')).toBe(-1);
    expect(daysUntil('2028-02-28', '2028-03-01')).toBe(2); // leap year
  });

  it('edge 6 — a check day past the month’s end is its last day: 31 → 28 Feb, 29 Feb in 2028', () => {
    expect(effectiveCheckDay('2027-02', 31)).toBe(28);
    expect(effectiveCheckDay('2028-02', 31)).toBe(29);
    expect(effectiveCheckDay('2026-11', 31)).toBe(30);
    expect(effectiveCheckDay('2026-12', 31)).toBe(31);
    expect(effectiveCheckDay('2026-11', 25)).toBe(25);
    expect(pastCheckDay('2027-02-28', 31)).toBe(true);
    expect(pastCheckDay('2027-02-27', 31)).toBe(false);
  });

  it('edge 5 — 00:30 Cairo on 1 December (22:30 UTC on 30 November) is 1 December: the new month', () => {
    const today = schoolDayOf(new Date('2026-11-30T22:30:00Z'));
    expect(today).toBe('2026-12-01');
    expect(reminderMonths(today, [])).toEqual(['2026-12']);
    // November's check day is not December's: nothing due on the 1st.
    const months = new Map<string, ReminderMonth>([['2026-12', { latenessSaved: false, run: null }]]);
    expect(latenessReminders(today, RULE, months, []).notify).toEqual([]);
  });
});

describe('contract ends soon (hr.contract.ending_soon)', () => {
  it('edge 1 — ends in 30 days → reminder; in 31 → none; ended yesterday → none; ends today → due (0 days)', () => {
    const today = '2027-05-01';
    const plan = contractReminders(
      today,
      RULE,
      [emp('a', '2027-05-31'), emp('b', '2027-06-01'), emp('c', '2027-04-30'), emp('d', '2027-05-01')],
      [],
    );
    expect(keys(plan)).toEqual(['contract_end:a:2027-05-31:30', 'contract_end:d:2027-05-01:7']);
    expect(plan.notify[0]).toMatchObject({
      type: 'hr.contract.ending_soon',
      subject: { entityType: 'employee', entityId: 'a', employeeId: 'a' },
      params: { employee: { en: 'Name a', ar: 'اسم a' }, date: '2027-05-31', count: 30, days: 30 },
      groupKey: '2027-05-01:30',
    });
    expect(plan.notify[1]?.params).toMatchObject({ count: 0, days: 7 });
  });

  it('edge 1 — within 7 days → the second reminder (…:7) and the open 30-day item is resolved as done', () => {
    const plan = contractReminders('2027-05-24', RULE, [emp('a', '2027-05-31')], [
      openContract('a', '2027-05-31', 30),
    ]);
    expect(resolvedKeys(plan)).toEqual(['contract_end:a:2027-05-31:30']);
    expect(keys(plan)).toEqual(['contract_end:a:2027-05-31:7']);
    expect(plan.notify[0]?.params).toMatchObject({ count: 7, days: 7 });
  });

  it('edge 1 — the day after the second reminder: the 7-day item stays open, nothing new', () => {
    const plan = contractReminders('2027-05-25', RULE, [emp('a', '2027-05-31')], [
      openContract('a', '2027-05-31', 7),
    ]);
    expect(plan.resolve).toEqual([]);
    expect(plan.notify).toEqual([]);
  });

  it('edge 1 — second reminder 0 → no second one; the 30-day item stays open to the end', () => {
    const rule = { ...RULE, contractEndSecondDays: 0 };
    const plan = contractReminders('2027-05-28', rule, [emp('a', '2027-05-31')], [
      openContract('a', '2027-05-31', 30),
    ]);
    expect(plan.resolve).toEqual([]);
    expect(plan.notify).toEqual([]);
  });

  it('edge 1 — the contract ended: the open item is resolved, nothing sent (overdue contracts are not chased)', () => {
    const plan = contractReminders('2027-06-01', RULE, [emp('a', '2027-05-31')], [
      openContract('a', '2027-05-31', 7),
    ]);
    expect(resolvedKeys(plan)).toEqual(['contract_end:a:2027-05-31:7']);
    expect(plan.notify).toEqual([]);
  });

  it('edge 2 — moved to a later date outside the window → open item resolved, none sent', () => {
    const plan = contractReminders('2027-05-01', RULE, [emp('a', '2028-05-31')], [
      openContract('a', '2027-05-31', 30),
    ]);
    expect(resolvedKeys(plan)).toEqual(['contract_end:a:2027-05-31:30']);
    expect(plan.notify).toEqual([]);
  });

  it('edge 2 — moved to another date inside the window → old resolved, a new one (new key)', () => {
    const plan = contractReminders('2027-05-01', RULE, [emp('a', '2027-05-20')], [
      openContract('a', '2027-05-31', 30),
    ]);
    expect(resolvedKeys(plan)).toEqual(['contract_end:a:2027-05-31:30']);
    expect(keys(plan)).toEqual(['contract_end:a:2027-05-20:30']);
  });

  it('edge 3 / 4 — a re-run the same day or the next day gives the same keys (core drops the repeat); a missed day is caught up', () => {
    const employees = [emp('a', '2027-05-31')];
    // The check day (1 May, 30 days) was missed; on 2 May (29 days) the 30-day reminder is still due, once.
    expect(keys(contractReminders('2027-05-02', RULE, employees, []))).toEqual([
      'contract_end:a:2027-05-31:30',
    ]);
    // Once it is open, the next runs send nothing new.
    const open = [openContract('a', '2027-05-31', 30)];
    expect(contractReminders('2027-05-02', RULE, employees, open).notify).toEqual([]);
    expect(contractReminders('2027-05-03', RULE, employees, open).notify).toEqual([]);
  });

  it('edge 12 — an employee no longer active (not in the list) → open reminder resolved, none sent', () => {
    const plan = contractReminders('2027-05-01', RULE, [], [openContract('a', '2027-05-31', 30)]);
    expect(resolvedKeys(plan)).toEqual(['contract_end:a:2027-05-31:30']);
    expect(plan.notify).toEqual([]);
  });

  it('edge 16 — a timing changed: the reminder already sent stays, and no second one of the same stage is sent', () => {
    const rule = { ...RULE, contractEndDays: 45 };
    const plan = contractReminders('2027-05-01', rule, [emp('a', '2027-05-31')], [
      openContract('a', '2027-05-31', 30),
    ]);
    expect(plan.resolve).toEqual([]);
    expect(plan.notify).toEqual([]);
    // A contract not reminded yet follows the new timing at once.
    expect(keys(contractReminders('2027-05-01', rule, [emp('b', '2027-06-10')], []))).toEqual([
      'contract_end:b:2027-06-10:45',
    ]);
  });

  it('edge 17 — 38 contracts ending 31 May: 38 items in one group on 1 May, 38 more in another on 24 May', () => {
    const employees = Array.from({ length: 38 }, (_, i) => emp(`e${i}`, '2027-05-31'));
    const first = contractReminders('2027-05-01', RULE, employees, []);
    expect(first.notify).toHaveLength(38);
    expect(new Set(first.notify.map((n) => n.groupKey))).toEqual(new Set(['2027-05-01:30']));
    const open = first.notify.map((n) => openContract(n.subject.entityId, '2027-05-31', 30));
    const second = contractReminders('2027-05-24', RULE, employees, open);
    expect(second.resolve).toHaveLength(38);
    expect(second.notify).toHaveLength(38);
    expect(new Set(second.notify.map((n) => n.groupKey))).toEqual(new Set(['2027-05-24:7']));
  });
});

describe('probation ends soon (hr.probation.ending_soon)', () => {
  it('edge 11 — probation end 30 Nov → reminder on 23 Nov (7 days), not on 22 Nov', () => {
    const employees = [emp('a', '2027-05-31', '2026-11-30')];
    expect(probationReminders('2026-11-22', RULE, employees, []).notify).toEqual([]);
    const plan = probationReminders('2026-11-23', RULE, employees, []);
    expect(keys(plan)).toEqual(['probation_end:a:2026-11-30']);
    expect(plan.notify[0]).toMatchObject({
      subject: { entityType: 'employee', entityId: 'a', employeeId: 'a' },
      params: { employee: { en: 'Name a', ar: 'اسم a' }, date: '2026-11-30', count: 7, days: 7 },
      groupKey: '2026-11-23',
    });
  });

  it('edge 11 — an empty probation end → no reminder', () => {
    expect(probationReminders('2026-11-23', RULE, [emp('a', '2027-05-31', null)], []).notify).toEqual([]);
  });

  it('edge 11 / spec 20 — moved to 31 Dec → the open item resolved; the new one on 24 Dec', () => {
    const employees = [emp('a', '2027-05-31', '2026-12-31')];
    const now = probationReminders('2026-11-24', RULE, employees, [openProbation('a', '2026-11-30')]);
    expect(resolvedKeys(now)).toEqual(['probation_end:a:2026-11-30']);
    expect(now.notify).toEqual([]);
    expect(keys(probationReminders('2026-12-24', RULE, employees, []))).toEqual(['probation_end:a:2026-12-31']);
  });

  it('the date passes → resolved; cleared → resolved; deactivated (not listed) → resolved', () => {
    expect(
      resolvedKeys(probationReminders('2026-12-01', RULE, [emp('a', '2027-05-31', '2026-11-30')], [
        openProbation('a', '2026-11-30'),
      ])),
    ).toEqual(['probation_end:a:2026-11-30']);
    expect(
      resolvedKeys(probationReminders('2026-11-25', RULE, [emp('a', '2027-05-31', null)], [
        openProbation('a', '2026-11-30'),
      ])),
    ).toEqual(['probation_end:a:2026-11-30']);
    expect(resolvedKeys(probationReminders('2026-11-25', RULE, [], [openProbation('a', '2026-11-30')]))).toEqual([
      'probation_end:a:2026-11-30',
    ]);
  });

  it('still within the window and unchanged → stays open (the repeat send is a core no-op)', () => {
    const plan = probationReminders('2026-11-25', RULE, [emp('a', '2027-05-31', '2026-11-30')], [
      openProbation('a', '2026-11-30'),
    ]);
    expect(plan.resolve).toEqual([]);
    expect(keys(plan)).toEqual(['probation_end:a:2026-11-30']);
  });
});

describe('lateness not entered (hr.lateness.not_entered)', () => {
  const month = (over: Partial<ReminderMonth> = {}): ReminderMonth => ({
    latenessSaved: false,
    run: null,
    ...over,
  });

  it('from the 25th, while never saved → due once per month; before the 25th → none', () => {
    const months = new Map([['2026-11', month()]]);
    expect(latenessReminders('2026-11-24', RULE, months, []).notify).toEqual([]);
    const plan = latenessReminders('2026-11-25', RULE, months, []);
    expect(plan.notify).toEqual([
      {
        type: 'hr.lateness.not_entered',
        subject: { entityType: 'lateness_month', entityId: '2026-11' },
        dedupeKey: 'lateness_missing:2026-11',
        params: { month: '2026-11' },
        groupKey: '2026-11-25',
      },
    ]);
    // Edge 4 — server down on the 25th: the 26th sends it (same key, so once).
    expect(keys(latenessReminders('2026-11-26', RULE, months, []))).toEqual(['lateness_missing:2026-11']);
  });

  it('edge 7 — saved on the 20th (even all zeros) → no reminder', () => {
    const months = new Map([['2026-11', month({ latenessSaved: true })]]);
    expect(latenessReminders('2026-11-25', RULE, months, []).notify).toEqual([]);
  });

  it('edge 8 — saved after the reminder → resolved', () => {
    const months = new Map([['2026-11', month({ latenessSaved: true })]]);
    const plan = latenessReminders('2026-11-27', RULE, months, [
      openItem('lateness_month', '2026-11', 'lateness_missing:2026-11'),
    ]);
    expect(resolvedKeys(plan)).toEqual(['lateness_missing:2026-11']);
  });

  it('edge 9 — the month’s payroll approved without lateness ever saved → none sent; an open one resolved', () => {
    const months = new Map([['2026-11', month({ run: { id: 'r1', status: 'APPROVED' } })]]);
    expect(latenessReminders('2026-11-26', RULE, months, []).notify).toEqual([]);
    expect(
      resolvedKeys(latenessReminders('2026-11-26', RULE, months, [
        openItem('lateness_month', '2026-11', 'lateness_missing:2026-11'),
      ])),
    ).toEqual(['lateness_missing:2026-11']);
  });

  it('a previous month’s open reminder stays while its lateness is still missing; the new month is checked from its own 25th', () => {
    const open = [openItem('lateness_month', '2026-11', 'lateness_missing:2026-11')];
    expect(reminderMonths('2026-12-01', open)).toEqual(['2026-11', '2026-12']);
    const months = new Map([
      ['2026-11', month()],
      ['2026-12', month()],
    ]);
    const plan = latenessReminders('2026-12-01', RULE, months, open);
    expect(plan.resolve).toEqual([]);
    expect(plan.notify).toEqual([]);
  });

  it('edge 6 — check day 31 in February fires on the 28th (29th in 2028)', () => {
    const rule = { ...RULE, latenessCheckDay: 31 };
    expect(keys(latenessReminders('2027-02-28', rule, new Map([['2027-02', month()]]), []))).toEqual([
      'lateness_missing:2027-02',
    ]);
    expect(latenessReminders('2028-02-28', rule, new Map([['2028-02', month()]]), []).notify).toEqual([]);
    expect(keys(latenessReminders('2028-02-29', rule, new Map([['2028-02', month()]]), []))).toEqual([
      'lateness_missing:2028-02',
    ]);
  });
});

describe('payroll not prepared / still a draft', () => {
  const months = (run: ReminderMonth['run']) => new Map([['2026-11', { latenessSaved: true, run }]]);

  it('edge 10 — no run by the 28th → "not prepared"; nothing before the 28th', () => {
    expect(payrollNotPreparedReminders('2026-11-27', RULE, months(null), []).notify).toEqual([]);
    expect(payrollNotPreparedReminders('2026-11-28', RULE, months(null), []).notify).toEqual([
      {
        type: 'hr.payroll.not_prepared',
        subject: { entityType: 'payroll_month', entityId: '2026-11' },
        dedupeKey: 'payroll_missing:2026-11',
        params: { month: '2026-11' },
        groupKey: '2026-11-28',
      },
    ]);
    expect(payrollNotApprovedReminders('2026-11-28', RULE, months(null), []).notify).toEqual([]);
  });

  it('edge 10 — a draft by the 28th → "still a draft" about the run; not "not prepared"', () => {
    const draft = months({ id: 'r1', status: 'DRAFT' });
    expect(payrollNotPreparedReminders('2026-11-28', RULE, draft, []).notify).toEqual([]);
    expect(payrollNotApprovedReminders('2026-11-28', RULE, draft, []).notify).toEqual([
      {
        type: 'hr.payroll.not_approved',
        subject: { entityType: 'payroll_run', entityId: 'r1' },
        dedupeKey: 'payroll_unapproved:2026-11',
        params: { month: '2026-11' },
        groupKey: '2026-11-28',
      },
    ]);
  });

  it('edge 10 — approved before the 28th → nothing', () => {
    const approved = months({ id: 'r1', status: 'APPROVED' });
    expect(payrollNotPreparedReminders('2026-11-28', RULE, approved, []).notify).toEqual([]);
    expect(payrollNotApprovedReminders('2026-11-28', RULE, approved, []).notify).toEqual([]);
  });

  it('a run created → "not prepared" resolved; the run approved → "still a draft" resolved', () => {
    const draft = months({ id: 'r1', status: 'DRAFT' });
    expect(
      resolvedKeys(payrollNotPreparedReminders('2026-11-29', RULE, draft, [
        openItem('payroll_month', '2026-11', 'payroll_missing:2026-11'),
      ])),
    ).toEqual(['payroll_missing:2026-11']);
    const openDraft = [openItem('payroll_run', 'r1', 'payroll_unapproved:2026-11')];
    expect(payrollNotApprovedReminders('2026-11-29', RULE, draft, openDraft).resolve).toEqual([]);
    expect(
      resolvedKeys(payrollNotApprovedReminders('2026-11-29', RULE, months({ id: 'r1', status: 'APPROVED' }), openDraft)),
    ).toEqual(['payroll_unapproved:2026-11']);
  });

  it('edge 6 — payroll check day 31 in February fires on the 28th', () => {
    const rule = { ...RULE, payrollCheckDay: 31 };
    const feb = new Map([['2027-02', { latenessSaved: true, run: null }]]);
    expect(keys(payrollNotPreparedReminders('2027-02-28', rule, feb, []))).toEqual(['payroll_missing:2027-02']);
  });
});

describe('contracts (spec 2026-11-24, §11) — the renewal season', () => {
  const CAL = { term1Start: '2026-09-15', term1End: '2027-01-28', term2Start: '2027-02-07', nonRenewalDeadline: '2027-04-30' };
  const season = (undecided: number, calendar: typeof CAL | null = CAL) => ({ year: 2026, undecided, calendar });
  const openOf = (type: string, year: number): OpenReminder => ({
    entityType: 'contract_year',
    entityId: String(year),
    dedupeKey: `${type}:${year}`,
  });

  it('"Contract ends soon" goes away once a decision is made, and isn\'t sent for a decided contract', () => {
    const decided = { ...emp('a', '2027-05-31'), contractDecided: true };
    const open = [{ entityType: 'employee', entityId: 'a', dedupeKey: 'contract_end:a:2027-05-31:30' }];
    const plan = contractReminders('2027-05-05', RULE, [decided], open);
    expect(plan.resolve.map((r) => r.dedupeKey)).toEqual(['contract_end:a:2027-05-31:30']);
    expect(plan.notify).toEqual([]);
  });

  it('edge 10 — a contract ended early takes the probation reminder too', () => {
    const ended = { ...emp('a', '2026-12-31', '2026-12-05'), contractDecided: true, contractEndedEarly: true };
    expect(probationReminders('2026-12-01', RULE, [ended], []).notify).toEqual([]);
  });

  const seasons = (...list: ReturnType<typeof season>[]) => new Map(list.map((x) => [x.year, x]));

  it('renewal decisions due from 1 March (91 days before 31 May) while contracts have no decision', () => {
    expect(renewalsDueReminders('2027-02-28', RULE, seasons(season(15)), 2026, []).notify).toEqual([]);
    const plan = renewalsDueReminders('2027-03-01', RULE, seasons(season(15)), 2026, []);
    expect(plan.notify).toEqual([
      expect.objectContaining({
        dedupeKey: 'renewals_due:2026',
        subject: { entityType: 'contract_year', entityId: '2026' },
        params: { season: '2026/27', count: 15 },
      }),
    ]);
  });

  it('every one decided → the open reminder is done; while some are undecided it stays', () => {
    const open = [openOf('renewals_due', 2026)];
    expect(renewalsDueReminders('2027-04-01', RULE, seasons(season(0)), 2026, open).resolve).toHaveLength(1);
    expect(renewalsDueReminders('2027-04-01', RULE, seasons(season(3)), 2026, open).resolve).toEqual([]);
  });

  it('review 5 — on 1 June last season\'s reminder stays open while its contracts (ended with no decision) remain undecided', () => {
    const open = [openOf('renewals_due', 2026)];
    const june = renewalsDueReminders('2027-06-01', RULE, seasons(season(2), { ...season(40), year: 2027 }), 2027, open);
    expect(june.resolve).toEqual([]);
    // The new season isn't due before its own 1 March.
    expect(june.notify).toEqual([]);
    // Once they are decided, it is done.
    expect(renewalsDueReminders('2027-06-02', RULE, seasons(season(0), { ...season(40), year: 2027 }), 2027, open).resolve).toHaveLength(1);
  });

  it('review 13 — a withdrawn notice re-arms "contract ends soon": a new key, sent again for the same end', () => {
    const rearmed = { ...emp('a', '2027-05-31'), contractRearmedAt: 1795000000000 };
    const plan = contractReminders('2027-05-05', RULE, [rearmed], []);
    expect(plan.notify.map((n) => n.dedupeKey)).toEqual(['contract_end:a:2027-05-31:30:1795000000000']);
    // An item of the re-armed key still open is not sent twice.
    const open = [{ entityType: 'employee', entityId: 'a', dedupeKey: 'contract_end:a:2027-05-31:30:1795000000000' }];
    expect(contractReminders('2027-05-06', RULE, [rearmed], open).notify).toEqual([]);
  });

  it('the window opens on the first day of term 2, and closes soon 7 days before 30 April', () => {
    expect(noticeWindowReminders('2027-02-06', RULE, season(1), [], 'hr.contract.notice_window_opens').notify).toEqual([]);
    expect(
      noticeWindowReminders('2027-02-07', RULE, season(1), [], 'hr.contract.notice_window_opens').notify.map((n) => n.dedupeKey),
    ).toEqual(['notice_window_opens:2026']);
    expect(noticeWindowReminders('2027-04-22', RULE, season(1), [], 'hr.contract.notice_window_closing').notify).toEqual([]);
    expect(
      noticeWindowReminders('2027-04-23', RULE, season(1), [], 'hr.contract.notice_window_closing').notify[0],
    ).toMatchObject({ dedupeKey: 'notice_window_closing:2026', params: { season: '2026/27', date: '2027-04-30' } });
  });

  it('edge 7 — no calendar for the year: no window reminders; after the deadline the open ones are done', () => {
    expect(noticeWindowReminders('2027-03-01', RULE, season(1, null), [], 'hr.contract.notice_window_opens').notify).toEqual([]);
    const open = [openOf('notice_window_opens', 2026)];
    expect(noticeWindowReminders('2027-05-01', RULE, season(1), open, 'hr.contract.notice_window_opens').resolve).toHaveLength(1);
  });
});

/*
 * Bug 2026-11-24, walked over time: one employee's 2026/27 renewed in November into 2027/28. The
 * reminders must follow the contract in force, not the latest one by start date.
 */
describe('contract ends soon over time — the contract in force decides (bug 2026-11-24)', () => {
  const rule = { contractEndDays: 30, contractEndSecondDays: 7 };
  const base = { id: 'e1', nameEn: 'Mona', nameAr: 'منى', contractEnd: '2027-05-31', probationEnd: null };
  const renewed = { status: 'RENEWED', startsOn: '2026-06-01', endsOn: '2027-05-31', endedOn: null, remindersRearmedAt: null } as const;
  const next = { status: 'ACTIVE', startsOn: '2027-06-01', endsOn: '2028-05-31', endedOn: null, remindersRearmedAt: null } as const;
  const send = (today: string, contracts: Parameters<typeof reminderEmployeeOf>[0]['contracts']) =>
    contractReminders(today, rule, [reminderEmployeeOf({ ...base, contracts }, today)], []).notify.map((n) => n.dedupeKey);

  it('step 1 — before the renewal: the undecided 2026/27 is chased 30 days before 31 May', () => {
    expect(send('2027-05-01', [{ ...renewed, status: 'ACTIVE' }])).toEqual(['contract_end:e1:2027-05-31:30']);
  });

  it('step 2 — renewed in November: on 1 May 2027 the in-force 2026/27 is RENEWED, so no "Contract ends soon" for 31 May', () => {
    expect(reminderEmployeeOf({ ...base, contracts: [renewed, next] }, '2027-05-01')).toMatchObject({
      contractEnd: '2027-05-31',
      contractDecided: true,
    });
    expect(send('2027-05-01', [renewed, next])).toEqual([]);
    expect(send('2027-05-24', [renewed, next])).toEqual([]);
  });

  it('step 3 — from 1 June 2027 2027/28 is in force: chased from its own end, 31 May 2028', () => {
    expect(reminderEmployeeOf({ ...base, contracts: [renewed, next] }, '2027-06-01')).toMatchObject({
      contractEnd: '2028-05-31',
      contractDecided: false,
    });
    expect(send('2028-05-01', [renewed, next])).toEqual(['contract_end:e1:2028-05-31:30']);
  });

  it('step 4 — the renewed contract ended in April: the next one cancelled, nothing more about them', () => {
    const ended = { ...renewed, status: 'ENDED_EARLY', endedOn: '2027-04-15' } as const;
    const cancelled = { ...next, status: 'CANCELLED' } as const;
    expect(reminderEmployeeOf({ ...base, contracts: [ended, cancelled] }, '2027-04-10')).toMatchObject({
      contractEnd: '2027-04-15',
      contractEndedEarly: true,
    });
    expect(send('2027-04-10', [ended, cancelled])).toEqual([]);
    expect(send('2028-05-01', [ended, cancelled])).toEqual([]);
  });
});
