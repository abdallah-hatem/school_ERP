import type { AdjustmentType, Month, PenaltyStatus } from '@school-erp/shared';
import type { DemoViolationKey } from './types';

/** The demo month: lateness, penalties and a DRAFT payroll run with adjustments. */
export const DEMO_MONTH: Month = '2026-11';

/** [employee seed number, accumulated late + early-leave minutes]. */
export const LATENESS: [number, number][] = [
  [7, 45],
  [12, 75],
  [14, 130],
  [15, 20],
  [16, 95],
  [18, 200],
  [20, 60],
  [21, 15],
  [22, 110],
  [24, 35],
  [26, 180],
  [29, 50],
  [30, 140],
  [33, 10],
  [37, 0],
];

export interface SeedPenalty {
  employee: number;
  violation: DemoViolationKey;
  date: string;
  status: PenaltyStatus;
  note?: string;
  cancelReason?: string;
}

/**
 * Recorded in date order and approved through the penalties service, so repeats get their level
 * from the earlier approved ones (employee 14 reaches level 3, employee 16 level 2 plus a pending
 * third). Never hard-coded levels.
 */
export const PENALTIES: SeedPenalty[] = [
  { employee: 33, violation: 'chewing-gum', date: '2026-11-02', status: 'APPROVED' },
  { employee: 14, violation: 'unexcused-absence', date: '2026-11-03', status: 'APPROVED' },
  { employee: 16, violation: 'late-to-class', date: '2026-11-04', status: 'APPROVED' },
  { employee: 20, violation: 'phone-in-class', date: '2026-11-05', status: 'APPROVED' },
  {
    employee: 30,
    violation: 'dress',
    date: '2026-11-08',
    status: 'CANCELLED',
    cancelReason: 'سُجّلت على موظف آخر بالخطأ',
  },
  { employee: 21, violation: 'dress', date: '2026-11-09', status: 'APPROVED' },
  { employee: 14, violation: 'unexcused-absence', date: '2026-11-10', status: 'APPROVED' },
  { employee: 26, violation: 'not-signing-attendance', date: '2026-11-11', status: 'PENDING' },
  { employee: 16, violation: 'late-to-class', date: '2026-11-12', status: 'APPROVED' },
  {
    employee: 16,
    violation: 'late-to-class',
    date: '2026-11-15',
    status: 'PENDING',
    note: 'المرة الثالثة هذا الشهر',
  },
  { employee: 14, violation: 'unexcused-absence', date: '2026-11-16', status: 'APPROVED' },
];

export interface SeedAdjustment {
  employee: number;
  type: AdjustmentType;
  /** Piastres. */
  amount: number;
  reason: string;
}

export const ADJUSTMENTS: SeedAdjustment[] = [
  { employee: 8, type: 'ADDITION', amount: 75_000, reason: 'تغطية حصص إضافية في نوفمبر' },
  { employee: 22, type: 'DEDUCTION', amount: 30_000, reason: 'سداد سلفة على الراتب' },
];
