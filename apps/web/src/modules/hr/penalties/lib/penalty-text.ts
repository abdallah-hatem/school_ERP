import {
  ErrorCode,
  isOpenPenaltyStatus,
  PenaltyAction,
  PenaltyStatus,
  type Days,
  type PermissionKey,
  type EmployeeSummary,
  type PenaltyGroup,
  type PenaltyRecord,
  type PenaltyRecountChange,
} from '@school-erp/shared';
import type { SelectOption, SelectOptionGroup } from '@/shared/components/form/fields';
import { formatDate, formatDateTime, formatDayCount, formatMonth } from '@/shared/lib/format';
import { nameIn, type Locale, type Translate } from '@/shared/lib/i18n';

/*
 * Pure helpers for the penalties screens: how an action reads, which violations can be picked, and
 * which server errors have their own translated message.
 */

/**
 * `DEDUCT_DAYS` + 0.5 → "Deduct 0.5 day" / "خصم 0.5 يوم", + 2 → "خصم يومين" (the noun agrees with
 * the number and follows خصم, `formatDayCount` oblique); an investigation with days says both; others by name.
 */
export function describeAction(t: Translate, locale: Locale, action: PenaltyAction, days: Days | null): string {
  if (days != null && days > 0) {
    // The count follows خصم, so the Arabic dual is oblique: "خصم يومين".
    const value = formatDayCount(days, locale, { case: 'oblique' });
    if (action === PenaltyAction.DEDUCT_DAYS) return t('penalties.action.deduct', { days: value });
    if (action === PenaltyAction.INVESTIGATION) return t('penalties.action.investigation', { days: value });
  }
  return t(`common.enums.penaltyAction.${action}`);
}

/**
 * The violation picker's sections, as the API answered (`GET_PENALTY_GROUPS`: what can be recorded
 * now, in the catalogue's order, searched there): one per group with its violations.
 */
export function violationGroups(groups: PenaltyGroup[], locale: Locale): SelectOptionGroup[] {
  return groups.map((g) => ({
    key: g.id,
    label: nameIn(g, locale),
    options: g.violations.map((v) => ({ value: v.id, label: nameIn(v, locale) })),
  }));
}

/** An employee as the picker's choice: "Name · code". The API lists the active ones as the person types. */
export function employeeChoice(e: Pick<EmployeeSummary, 'id' | 'code' | 'nameEn' | 'nameAr'>, locale: Locale): SelectOption {
  return { value: e.id, label: `${nameIn(e, locale)} · ${e.code}` };
}

/**
 * The message for a failed request: the translated `errors.<CODE>` when the code has one
 * (`PAYROLL_APPROVED`, `PENALTY_CANCELLED`, `VIOLATION_RETIRED`, `EMPLOYEE_INACTIVE`…), else the
 * server's own (already translated) message, else `fallback`. The envelope's `params` fill the
 * message (`PENALTY_EARLIER_PENDING`'s `{date}`), an ISO date read as a date in `locale`.
 */
export function errorMessage(
  res: { error?: unknown; message?: unknown; params?: unknown },
  t: Translate,
  has: (key: string) => boolean,
  fallback: string,
  locale: Locale = 'en',
): string {
  const key = typeof res.error === 'string' ? `errors.${res.error}` : '';
  if (key && has(key)) return t(key, errorParams(res.params, locale));
  return typeof res.message === 'string' && res.message ? res.message : fallback;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * An error envelope's `params` as `t()` values: strings and numbers, ISO dates and months
 * (`2026-10` → "October 2026") formatted.
 */
function errorParams(params: unknown, locale: Locale): Record<string, string | number> | undefined {
  if (!params || typeof params !== 'object') return undefined;
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === 'number') values[name] = value;
    else if (typeof value === 'string')
      values[name] = ISO_DATE.test(value)
        ? formatDate(value, locale)
        : MONTH.test(value)
          ? formatMonth(value, locale)
          : value;
  }
  return values;
}

/**
 * Why a pending penalty can't be approved yet, or null: an earlier one of the violation is still
 * pending (§4 approve in date order — the server's 409 `PENALTY_EARLIER_PENDING`, naming its date),
 * or approving it would recount an approved penalty in a month whose payroll is approved (§4
 * backdated penalty — `PENALTY_RECOUNT_MONTH_LOCKED`, naming the month).
 */
export function approveBlockedReason(
  record: Pick<PenaltyRecord, 'status' | 'earlierPending' | 'recountLockedMonth'>,
  t: Translate,
  locale: Locale,
): string | null {
  if (!isOpenPenaltyStatus(record.status)) return null;
  if (record.earlierPending) {
    return t('errors.PENALTY_EARLIER_PENDING', { date: formatDate(record.earlierPending.date, locale) });
  }
  if (record.recountLockedMonth) {
    return t('errors.PENALTY_RECOUNT_MONTH_LOCKED', { month: formatMonth(record.recountLockedMonth, locale) });
  }
  return null;
}

/**
 * One approved penalty a backdated approval moves up, as the heads-up lists it (§4, owner
 * 2026-11-20): "19 Nov 2026: level 1 → 2, Deduct 0.5 day → Deduct 1 day". The action is said once
 * when it doesn't change.
 */
export function recountItem(change: PenaltyRecountChange, t: Translate, locale: Locale): string {
  const from = describeAction(t, locale, change.before.action, change.before.days);
  const to = describeAction(t, locale, change.after.action, change.after.days);
  return t('penalties.recount.item', {
    date: formatDate(change.date, locale),
    from: change.before.level,
    to: change.after.level,
    action: from === to ? to : t('penalties.recount.actionChange', { from, to }),
  });
}

/** The 409 of an unconfirmed or stale recount carries the fresh list (`data.recount`), else null. */
export function recountFromConflict(res: { error?: unknown; data?: unknown }): PenaltyRecountChange[] | null {
  if (res.error !== ErrorCode.PENALTY_RECOUNT_UNCONFIRMED && res.error !== ErrorCode.PENALTY_RECOUNT_CHANGED) return null;
  const recount = (res.data as { recount?: unknown } | null | undefined)?.recount;
  return Array.isArray(recount) ? (recount as PenaltyRecountChange[]) : null;
}

/**
 * Which of a penalty's actions the signed-in user may take (§4 two steps, owner 2026-11-21) —
 * view only, the API decides:
 * - `review`: the stage review's approve / reject (Pending stage review, `hr.penalties.review`);
 * - `hrApprove`: HR's approve / reject (Waiting for HR — or Pending stage review when nobody can
 *   review it any more — `hr.penalties.approve`);
 * - `cancel`: while waiting at either step or approved (`hr.penalties.cancel`).
 * Never review or HR actions on one's own penalty.
 */
export function penaltySteps(
  record: Pick<PenaltyRecord, 'status' | 'hrMayDecide' | 'ownPenalty'>,
  can: (key: PermissionKey) => boolean,
): { review: boolean; hrApprove: boolean; cancel: boolean } {
  const own = record.ownPenalty;
  const review = !own && record.status === PenaltyStatus.PENDING_REVIEW && can('hr.penalties.review');
  const hrApprove =
    !own &&
    !review &&
    can('hr.penalties.approve') &&
    (record.status === PenaltyStatus.WAITING_HR || (record.status === PenaltyStatus.PENDING_REVIEW && record.hrMayDecide));
  const cancel =
    can('hr.penalties.cancel') && (isOpenPenaltyStatus(record.status) || record.status === PenaltyStatus.APPROVED);
  return { review, hrApprove, cancel };
}

/** One line of a penalty's steps (the details dialog): what happened, and a note or reason under it. */
export interface PenaltyStepLine {
  key: string;
  text: string;
  at: string | null;
  detail: string | null;
  tone: 'done' | 'waiting' | 'rejected' | 'cancelled';
}

/**
 * A penalty's two steps in words, in order (§4, owner 2026-11-21): recorded; the stage review
 * (approved by …, or skipped and why, or waiting for that stage's head, or rejected with the
 * reason); HR (approved by …, waiting, or rejected with the reason); cancelled. Times are 12-hour.
 */
export function penaltyStepLines(record: PenaltyRecord, t: Translate, locale: Locale): PenaltyStepLine[] {
  const when = (at: string | null) => (at ? formatDateTime(at, locale) : null);
  const who = (u: { name: string } | null) => u?.name ?? t('penalties.steps.someone');
  const lines: PenaltyStepLine[] = [
    {
      key: 'recorded',
      text: record.createdBy ? t('penalties.steps.recorded', { name: record.createdBy.name }) : t('penalties.steps.recordedBySystem'),
      at: when(record.createdAt),
      detail: null,
      tone: 'done',
    },
  ];
  const rejectedAt = (step: 'REVIEW' | 'HR') => record.status === PenaltyStatus.REJECTED && record.rejectedStep === step;
  const rejection = (step: 'REVIEW' | 'HR'): PenaltyStepLine => ({
    key: `rejected-${step}`,
    text: t(`penalties.steps.rejected${step}`, { name: who(record.rejectedBy) }),
    at: when(record.rejectedAt),
    detail: record.rejectionReason ? t('penalties.steps.reason', { reason: record.rejectionReason }) : null,
    tone: 'rejected',
  });
  const stage = nameIn(record.stage, locale);
  // The stage review.
  if (record.reviewSkip) {
    lines.push({ key: 'skip', text: t(`penalties.steps.skip.${record.reviewSkip}`), at: null, detail: null, tone: 'done' });
  } else if (record.reviewedAt) {
    lines.push({
      key: 'reviewed',
      text: t('penalties.steps.reviewed', { name: who(record.reviewedBy) }),
      at: when(record.reviewedAt),
      detail: record.reviewNote ? t('penalties.steps.note', { note: record.reviewNote }) : null,
      tone: 'done',
    });
  } else if (rejectedAt('REVIEW')) {
    lines.push(rejection('REVIEW'));
  } else if (record.status === PenaltyStatus.PENDING_REVIEW) {
    lines.push({
      key: 'waiting-review',
      text: t('penalties.steps.waitingReview', { stage }),
      at: null,
      detail: record.hrMayDecide ? t('penalties.hrMayDecide', { stage }) : null,
      tone: 'waiting',
    });
  }
  // HR.
  if (record.status === PenaltyStatus.APPROVED || record.approvedAt) {
    lines.push({
      key: 'approved',
      text: t('penalties.steps.approved', { name: who(record.approvedBy) }),
      at: when(record.approvedAt),
      detail: record.approvalNote ? t('penalties.steps.note', { note: record.approvalNote }) : null,
      tone: 'done',
    });
  } else if (rejectedAt('HR')) {
    lines.push(rejection('HR'));
  } else if (record.status === PenaltyStatus.WAITING_HR) {
    lines.push({ key: 'waiting-hr', text: t('penalties.steps.waitingHr'), at: null, detail: null, tone: 'waiting' });
  }
  if (record.status === PenaltyStatus.CANCELLED) {
    lines.push({
      key: 'cancelled',
      text: t('penalties.steps.cancelled'),
      at: when(record.cancelledAt),
      detail: record.cancelReason ? t('penalties.steps.reason', { reason: record.cancelReason }) : null,
      tone: 'cancelled',
    });
  }
  return lines;
}
