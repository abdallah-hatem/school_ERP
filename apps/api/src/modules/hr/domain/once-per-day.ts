import { PenaltyStatus } from '@school-erp/shared';

/** When the once-per-day rule is checked (§4): recording a penalty, or approving one. */
export type OncePerDayStage = 'record' | 'approve';

/**
 * The once-per-day rule (§4 DECIDED, owner 2026-11-18). For a violation marked "once per day", an
 * employee gets at most one penalty for it per date:
 * - **record** — refused while another penalty of the same violation, employee and date is
 *   PENDING or APPROVED (a cancelled one frees the day);
 * - **approve** — checked again: refused while another one that day is already APPROVED, so two
 *   pending records of one day (both recorded before the flag was turned on) can't both be approved.
 *
 * `sameDayOthers` are the statuses of the OTHER penalties of the same violation, employee and
 * date. A violation without the flag (one that repeats within a day) is never refused here.
 *
 * @example oncePerDayRefuses(true, ['CANCELLED'], 'record') // false
 * @example oncePerDayRefuses(true, ['PENDING'], 'record')   // true
 * @example oncePerDayRefuses(true, ['PENDING'], 'approve')  // false
 */
export function oncePerDayRefuses(
  oncePerDay: boolean,
  sameDayOthers: readonly PenaltyStatus[],
  stage: OncePerDayStage,
): boolean {
  if (!oncePerDay) return false;
  const holding: readonly PenaltyStatus[] =
    stage === 'record'
      ? [PenaltyStatus.PENDING, PenaltyStatus.APPROVED]
      : [PenaltyStatus.APPROVED];
  return sameDayOthers.some((s) => holding.includes(s));
}
