import {
  contractYearRange,
  formatContractYear,
  notificationDedupeKey,
  type IsoDate,
  type SchoolCalendarDates,
  type Month,
  type NotificationSubject,
  type ReminderRule,
} from '@school-erp/shared';

/*
 * HR's scheduled reminders (§11, spec → "The first types", plan N3). Pure: given the school's
 * today, the reminder timings and the facts, which reminders are due and which open ones no longer
 * hold. No database, no clock — the daily job (`hr-reminders.job.ts`) reads the facts and sends.
 *
 * "Due" is due **today or overdue** (N16): a contract within its window, a month past its check
 * day. Sending is idempotent through the dedupe keys (N9), so a missed day is caught up once.
 */

/** The reminder types HR sends from its daily job. */
export const REMINDER_TYPES = [
  'hr.contract.ending_soon',
  'hr.probation.ending_soon',
  'hr.lateness.not_entered',
  'hr.payroll.not_prepared',
  'hr.payroll.not_approved',
  // Contracts (spec 2026-11-24): the renewal season.
  'hr.contract.renewals_due',
  'hr.contract.notice_window_opens',
  'hr.contract.notice_window_closing',
] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

/** The subjects' entity types. Employees are scoped (stage / team); months and runs are whole-school. */
export const ReminderEntity = {
  EMPLOYEE: 'employee',
  LATENESS_MONTH: 'lateness_month',
  PAYROLL_MONTH: 'payroll_month',
  PAYROLL_RUN: 'payroll_run',
  /** A contract year's renewal season (`2026` = 2026/27): whole-school. */
  CONTRACT_YEAR: 'contract_year',
} as const;

/** An active employee's dates the contract and probation reminders look at. */
export interface ReminderEmployee {
  id: string;
  nameEn: string;
  nameAr: string;
  contractEnd: IsoDate;
  probationEnd: IsoDate | null;
  /**
   * Contracts (spec 2026-11-24): the current contract has a decision (renewed, not renewed, ended)
   * — "contract ends soon" goes away and isn't sent.
   */
  contractDecided?: boolean;
  /** The current contract ended early: no more reminders about them (edge case 10). */
  contractEndedEarly?: boolean;
}

/** A month as the lateness and payroll reminders see it. */
export interface ReminderMonth {
  /** Its lateness was saved at least once, even with all zeros (§11 GUESS). */
  latenessSaved: boolean;
  run: { id: string; status: 'DRAFT' | 'APPROVED' } | null;
}

/** An item still open, whoever received it (`NotificationsService.openItems`). */
export interface OpenReminder {
  entityType: string;
  entityId: string;
  dedupeKey: string;
}

export interface DueReminder {
  type: ReminderType;
  subject: NotificationSubject;
  dedupeKey: string;
  params: Record<string, unknown>;
  /** Items of one key join one notification while it is unread (N17). */
  groupKey: string;
}

export interface StaleReminder {
  type: ReminderType;
  subject: Pick<NotificationSubject, 'entityType' | 'entityId'>;
  dedupeKey: string;
}

export interface ReminderPlan {
  /** Open items whose condition no longer holds: resolved as `done` first. */
  resolve: StaleReminder[];
  /** What is due: sent after the resolves (a repeat is a no-op, N9). */
  notify: DueReminder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (both `YYYY-MM-DD`): negative when `to` is before `from`. */
export function daysUntil(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The month's day a check day falls on: a day past the month's end is its last day (31 → 28 Feb). */
export function effectiveCheckDay(month: Month, checkDay: number): number {
  const [y = 0, m = 1] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.min(checkDay, lastDay);
}

/** Whether `today` is on or after the month's check day — in the same month (days of the current month). */
export function pastCheckDay(today: IsoDate, checkDay: number): boolean {
  const month = today.slice(0, 7);
  return Number(today.slice(8, 10)) >= effectiveCheckDay(month, checkDay);
}

const employeeSubject = (id: string): NotificationSubject => ({
  entityType: ReminderEntity.EMPLOYEE,
  entityId: id,
  employeeId: id,
});

const names = (e: ReminderEmployee) => ({ en: e.nameEn, ar: e.nameAr });

const stale = (type: ReminderType, o: OpenReminder): StaleReminder => ({
  type,
  subject: { entityType: o.entityType, entityId: o.entityId },
  dedupeKey: o.dedupeKey,
});

/** The parts after the type's prefix: `contract_end:<id>:<date>:<days>` → `[id, date, days]`. */
const keyParts = (key: string): string[] => key.split(':').slice(1);

/**
 * Contract ends soon (`hr.contract.ending_soon`): an active employee's contract ends within
 * `contractEndDays` (30), and again within `contractEndSecondDays` (7; 0 = no second). Dedupe
 * `contract_end:<employeeId>:<contractEnd>:<days>`.
 *
 * - Ends today → due (0 days); ended yesterday → none, and an open one is resolved (GUESS: overdue
 *   contracts are not chased).
 * - Within the second window → the second reminder, and the first one is resolved (`done`).
 * - The contract end moved, or the employee was deactivated → the open item is resolved; a new
 *   date inside a window is a new item (new key).
 * - A timing changed: an item already sent stays open while its own date holds (spec GUESS), and
 *   no second item of the same stage is sent for that date.
 */
export function contractReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'contractEndDays' | 'contractEndSecondDays'>,
  employees: readonly ReminderEmployee[],
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.contract.ending_soon' as const;
  const first = rule.contractEndDays;
  const second = rule.contractEndSecondDays;
  // A contract with a decision isn't chased (spec 2026-11-24, §11).
  const undecided = employees.filter((e) => !e.contractDecided && !e.contractEndedEarly);
  const byId = new Map(undecided.map((e) => [e.id, e]));
  const inSecond = (d: number) => second > 0 && d >= 0 && d <= second;

  const resolve: StaleReminder[] = [];
  /** Items left open, per `<employeeId>:<date>`, with the window they were sent for. */
  const stillOpen = new Map<string, number[]>();
  for (const o of open) {
    const [id = '', date = '', windowText = ''] = keyParts(o.dedupeKey);
    const window = Number(windowText);
    const e = byId.get(id);
    const d = e ? daysUntil(today, e.contractEnd) : -1;
    const holds = !!e && e.contractEnd === date && d >= 0;
    // A first-stage item is done once the second reminder is due (owner 2026-11-18).
    const superseded = holds && inSecond(d) && window > second;
    if (!holds || superseded) resolve.push(stale(type, o));
    else stillOpen.set(`${id}:${date}`, [...(stillOpen.get(`${id}:${date}`) ?? []), window]);
  }

  const notify: DueReminder[] = [];
  for (const e of undecided) {
    const d = daysUntil(today, e.contractEnd);
    if (d < 0) continue;
    const stage = inSecond(d) ? 'second' : d <= first ? 'first' : null;
    if (!stage) continue;
    const window = stage === 'second' ? second : first;
    const sent = stillOpen.get(`${e.id}:${e.contractEnd}`) ?? [];
    // Already told for this date at this stage (perhaps under an older timing): nothing new.
    if (stage === 'second' ? sent.some((w) => w <= second) : sent.length > 0) continue;
    notify.push({
      type,
      subject: employeeSubject(e.id),
      dedupeKey: notificationDedupeKey(type, e.id, e.contractEnd, window),
      params: { employee: names(e), date: e.contractEnd, count: d, days: window },
      // "12 contracts end within 30 days" and "… within 7 days" are separate groups.
      groupKey: `${today}:${window}`,
    });
  }
  return { resolve, notify };
}

/**
 * Probation ends soon (`hr.probation.ending_soon`): an active employee's probation end (N0) is
 * within `probationEndDays` (7). Dedupe `probation_end:<employeeId>:<probationEnd>`. An empty
 * probation end → none. Resolved when the date passes, moves or is cleared, or the employee is
 * deactivated.
 */
export function probationReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'probationEndDays'>,
  employees: readonly ReminderEmployee[],
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.probation.ending_soon' as const;
  // A contract ended early takes the employee's future reminders with it (edge case 10).
  const current = employees.filter((e) => !e.contractEndedEarly);
  const byId = new Map(current.map((e) => [e.id, e]));
  const resolve = open
    .filter((o) => {
      const [id = '', date = ''] = keyParts(o.dedupeKey);
      const e = byId.get(id);
      return !e || e.probationEnd !== date || daysUntil(today, date) < 0;
    })
    .map((o) => stale(type, o));

  const notify: DueReminder[] = [];
  for (const e of current) {
    if (!e.probationEnd) continue;
    const d = daysUntil(today, e.probationEnd);
    if (d < 0 || d > rule.probationEndDays) continue;
    notify.push({
      type,
      subject: employeeSubject(e.id),
      dedupeKey: notificationDedupeKey(type, e.id, e.probationEnd),
      params: { employee: names(e), date: e.probationEnd, count: d, days: rule.probationEndDays },
      groupKey: today,
    });
  }
  return { resolve, notify };
}

/** The month an open month reminder is about: the last part of its dedupe key. */
export const monthOfKey = (key: string): Month => keyParts(key).at(-1) ?? '';

/** The months the month reminders need facts for: this month and every open item's. */
export function reminderMonths(today: IsoDate, open: readonly OpenReminder[]): Month[] {
  return [...new Set([today.slice(0, 7), ...open.map((o) => monthOfKey(o.dedupeKey))])].sort();
}

const NO_MONTH: ReminderMonth = { latenessSaved: false, run: null };

/**
 * Lateness not entered (`hr.lateness.not_entered`): from the check day (25) of the current month,
 * while the month's lateness was never saved and its payroll isn't approved. Dedupe
 * `lateness_missing:<month>`. Resolved once the month is saved or its payroll approved (§5: then
 * it's locked). Only the current month is sent; an open one from an earlier month stays until it
 * clears.
 */
export function latenessReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'latenessCheckDay'>,
  months: ReadonlyMap<Month, ReminderMonth>,
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.lateness.not_entered' as const;
  const clears = (m: ReminderMonth) => m.latenessSaved || m.run?.status === 'APPROVED';
  const resolve = open
    .filter((o) => clears(months.get(monthOfKey(o.dedupeKey)) ?? NO_MONTH))
    .map((o) => stale(type, o));

  const month = today.slice(0, 7);
  const facts = months.get(month) ?? NO_MONTH;
  const notify: DueReminder[] =
    pastCheckDay(today, rule.latenessCheckDay) && !clears(facts)
      ? [
          {
            type,
            subject: { entityType: ReminderEntity.LATENESS_MONTH, entityId: month },
            dedupeKey: notificationDedupeKey(type, month),
            params: { month },
            groupKey: today,
          },
        ]
      : [];
  return { resolve, notify };
}

/**
 * Payroll not prepared (`hr.payroll.not_prepared`): from the payroll check day (28), while the
 * current month has no run. Dedupe `payroll_missing:<month>`. Resolved once a run exists.
 */
export function payrollNotPreparedReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'payrollCheckDay'>,
  months: ReadonlyMap<Month, ReminderMonth>,
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.payroll.not_prepared' as const;
  const resolve = open
    .filter((o) => (months.get(monthOfKey(o.dedupeKey)) ?? NO_MONTH).run !== null)
    .map((o) => stale(type, o));

  const month = today.slice(0, 7);
  const notify: DueReminder[] =
    pastCheckDay(today, rule.payrollCheckDay) && !(months.get(month) ?? NO_MONTH).run
      ? [
          {
            type,
            subject: { entityType: ReminderEntity.PAYROLL_MONTH, entityId: month },
            dedupeKey: notificationDedupeKey(type, month),
            params: { month },
            groupKey: today,
          },
        ]
      : [];
  return { resolve, notify };
}

/**
 * Payroll still a draft (`hr.payroll.not_approved`): from the payroll check day (28), while the
 * current month's run is a draft. About the run (its link). Dedupe `payroll_unapproved:<month>`.
 * Resolved once that run is approved (or is no longer the month's run).
 */
export function payrollNotApprovedReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'payrollCheckDay'>,
  months: ReadonlyMap<Month, ReminderMonth>,
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.payroll.not_approved' as const;
  const resolve = open
    .filter((o) => {
      const run = (months.get(monthOfKey(o.dedupeKey)) ?? NO_MONTH).run;
      return !run || run.id !== o.entityId || run.status !== 'DRAFT';
    })
    .map((o) => stale(type, o));

  const month = today.slice(0, 7);
  const run = (months.get(month) ?? NO_MONTH).run;
  const notify: DueReminder[] =
    pastCheckDay(today, rule.payrollCheckDay) && run?.status === 'DRAFT'
      ? [
          {
            type,
            subject: { entityType: ReminderEntity.PAYROLL_RUN, entityId: run.id },
            dedupeKey: notificationDedupeKey(type, month),
            params: { month },
            groupKey: today,
          },
        ]
      : [];
  return { resolve, notify };
}

/** The facts of one contract year's renewal season (spec 2026-11-24, §11). */
export interface RenewalSeason {
  /** The contract year (`2026` = 2026/27). */
  year: number;
  /** Active contracts of active employees ending in it, from today, with no decision. */
  undecided: number;
  calendar: SchoolCalendarDates | null;
}

const seasonSubject = (year: number) => ({ entityType: ReminderEntity.CONTRACT_YEAR, entityId: String(year) });
const yearOfKey = (key: string): number => Number(keyParts(key)[0]);

/**
 * Renewal decisions due (`hr.contract.renewals_due`): from `renewalDecisionsDays` (91 = 1 March)
 * before the season's end (31 May) to that end, while contracts ending in it have no decision.
 * Dedupe `renewals_due:<year>`. Resolved once every one has a decision, or the season is over.
 */
export function renewalsDueReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'renewalDecisionsDays'>,
  season: RenewalSeason,
  open: readonly OpenReminder[],
): ReminderPlan {
  const type = 'hr.contract.renewals_due' as const;
  const end = contractYearRange(season.year).end;
  const d = daysUntil(today, end);
  const due = d >= 0 && d <= rule.renewalDecisionsDays && season.undecided > 0;
  const resolve = open
    .filter((o) => yearOfKey(o.dedupeKey) !== season.year || !due)
    .map((o) => stale(type, o));
  const notify: DueReminder[] = due
    ? [
        {
          type,
          subject: seasonSubject(season.year),
          dedupeKey: notificationDedupeKey(type, season.year),
          params: { season: formatContractYear(season.year), count: season.undecided },
          groupKey: today,
        },
      ]
    : [];
  return { resolve, notify };
}

/**
 * The non-renewal window (spec 2026-11-24, §11): "opens" on the first day of term 2 and "closes
 * soon" `noticeWindowCloseDays` (7) before the deadline (30 April) — each once per season, read
 * and done; resolved once the deadline has passed. Nothing without the year's calendar.
 */
export function noticeWindowReminders(
  today: IsoDate,
  rule: Pick<ReminderRule, 'noticeWindowCloseDays'>,
  season: RenewalSeason,
  open: readonly OpenReminder[],
  which: 'hr.contract.notice_window_opens' | 'hr.contract.notice_window_closing',
): ReminderPlan {
  const cal = season.calendar;
  const resolve = open
    .filter((o) => yearOfKey(o.dedupeKey) !== season.year || !cal || today > cal.nonRenewalDeadline)
    .map((o) => stale(which, o));
  if (!cal || today > cal.nonRenewalDeadline) return { resolve, notify: [] };
  const from =
    which === 'hr.contract.notice_window_opens'
      ? cal.term2Start
      : daysUntil(today, cal.nonRenewalDeadline) <= rule.noticeWindowCloseDays
        ? today
        : null;
  if (!from || today < from) return { resolve, notify: [] };
  return {
    resolve,
    notify: [
      {
        type: which,
        subject: seasonSubject(season.year),
        dedupeKey: notificationDedupeKey(which, season.year),
        params: { season: formatContractYear(season.year), date: cal.nonRenewalDeadline },
        groupKey: today,
      },
    ],
  };
}
