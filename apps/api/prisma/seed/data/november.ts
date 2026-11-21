import type { AdjustmentType, Month, PenaltyStatus } from '@school-erp/shared';
import type { StageKey } from './lists';
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
  /**
   * Where it ends up (§4 two steps, owner 2026-11-21). Recorded by the system, a penalty in a stage
   * with a demo stage head starts PENDING_REVIEW and is reviewed by that head (`STAGE_HEADS`); in a
   * stage without one it starts WAITING_HR. REJECTED needs `rejectedAt` and `rejectReason`.
   */
  status: PenaltyStatus;
  /** The stage where it happened — only for an employee with several stages (else their only one). */
  stage?: StageKey;
  note?: string;
  cancelReason?: string;
  rejectedAt?: 'REVIEW' | 'HR';
  rejectReason?: string;
}

/**
 * Demo stage heads (owner 2026-11-21): a sign-in account with the Stage head role for these
 * employees (the vice principals of primary and prep), so the demo has penalties waiting for a
 * stage review. Kindergarten has none: its penalties go straight to HR. Email `<key>@school.local`,
 * the admin's password (`SEED_ADMIN_PASSWORD`).
 */
export const STAGE_HEADS: { employee: number; email: string; name: string }[] = [];

/**
 * Recorded in date order and approved through the penalties service, so repeats get their level
 * from the earlier approved ones (employee 14 reaches level 3, employee 16 level 2 plus a pending
 * third, employee 12 levels 1 and 2 on the same day). Never hard-coded levels.
 */
export const PENALTIES: SeedPenalty[] = [
  { employee: 33, violation: 'chewing-gum', date: '2026-11-02', status: 'APPROVED' },
  { employee: 14, violation: 'unexcused-absence', date: '2026-11-03', status: 'APPROVED' },
  { employee: 16, violation: 'late-to-class', date: '2026-11-04', status: 'APPROVED' },
  { employee: 20, violation: 'phone-in-class', date: '2026-11-05', status: 'APPROVED' },
  { employee: 12, violation: 'late-to-class', date: '2026-11-06', status: 'APPROVED' },
  { employee: 12, violation: 'late-to-class', date: '2026-11-06', status: 'APPROVED', note: 'المرة الثانية في نفس اليوم' },
  { employee: 30, violation: 'dress', date: '2026-11-08', status: 'CANCELLED', cancelReason: 'سُجّلت على موظف آخر بالخطأ' },
  { employee: 21, violation: 'dress', date: '2026-11-09', status: 'APPROVED' },
  { employee: 14, violation: 'unexcused-absence', date: '2026-11-10', status: 'APPROVED' },
  { employee: 26, violation: 'not-signing-attendance', date: '2026-11-11', status: 'WAITING_HR' },
  { employee: 16, violation: 'late-to-class', date: '2026-11-12', status: 'APPROVED' },
  { employee: 16, violation: 'late-to-class', date: '2026-11-15', status: 'WAITING_HR', note: 'المرة الثالثة هذا الشهر' },
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
