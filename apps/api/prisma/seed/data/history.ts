import type { Month } from '@school-erp/shared';
import type { DemoViolationKey } from './types';

/*
 * Approved months before the demo month, so the dashboard charts (owner, 2026-11-21) have trends
 * to draw: each month's lateness and a few approved penalties, then its payroll run, approved
 * (accounting works its taxes out from the approval). Generic figures, no client material.
 *
 * The penalties go to employees with none in November, so November's repeat levels (the demo's
 * level 2 and 3 cases, §4) are exactly as before.
 */

export interface HistoryMonth {
  month: Month;
  /** [employee seed number, minutes late]. */
  lateness: [number, number][];
  /** Approved penalties: [employee seed number, violation, day of the month]. */
  penalties: [number, DemoViolationKey, number][];
}

/** Oldest first: each is approved before the next is prepared. */
export const HISTORY_MONTHS: HistoryMonth[] = [
  {
    month: '2026-05',
    lateness: [[3, 60], [5, 25], [9, 140], [11, 45], [17, 90], [23, 30], [27, 75]],
    penalties: [[3, 'late-to-class', 6], [9, 'dress', 12], [17, 'chewing-gum', 20]],
  },
  {
    month: '2026-06',
    lateness: [[3, 35], [9, 50], [11, 20], [19, 15]],
    penalties: [[5, 'phone-in-class', 9]],
  },
  {
    month: '2026-07',
    lateness: [[9, 10], [27, 20]],
    penalties: [],
  },
  {
    month: '2026-08',
    lateness: [[3, 40], [5, 15], [11, 55], [23, 25]],
    penalties: [[11, 'late-to-class', 25]],
  },
  {
    month: '2026-09',
    lateness: [[3, 120], [5, 80], [9, 165], [11, 95], [17, 140], [19, 60], [23, 110], [25, 45], [27, 130]],
    penalties: [[3, 'unexcused-absence', 15], [9, 'late-to-class', 17], [19, 'dress', 22], [25, 'chewing-gum', 23], [27, 'not-signing-attendance', 28]],
  },
  {
    month: '2026-10',
    lateness: [[3, 90], [5, 70], [9, 120], [11, 60], [17, 115], [19, 40], [23, 85], [27, 100]],
    penalties: [[5, 'late-to-class', 7], [17, 'unexcused-absence', 13], [23, 'phone-in-class', 21], [25, 'dress', 27]],
  },
];
