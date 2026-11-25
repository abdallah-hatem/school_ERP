import {
  SEEDED_PENALTY_ACTIONS,
  type PenaltyAction,
  type PenaltyActionItem,
  type PenaltyActionRef,
  type ViolationLevel,
} from '@school-erp/shared';

/**
 * Test fixtures for penalty actions (spec 2026-11-25): the ten seeded actions with the migration's
 * fixed ids, as levels and penalties name them, and as the Penalty actions list sends them.
 */
export const ACTION = Object.fromEntries(
  SEEDED_PENALTY_ACTIONS.map((a, i) => [
    a.code,
    {
      id: `5eed0000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
      nameEn: a.nameEn,
      nameAr: a.nameAr,
      effect: a.effect,
      percentBase: null,
      isActive: true,
    },
  ]),
) as Record<PenaltyAction, PenaltyActionRef & { isActive: boolean }>;

/** A school-added % action and a fixed-amount one. */
export const PERCENT_ACTION: PenaltyActionRef & { isActive: boolean } = {
  id: '9a000000-0000-4000-8000-000000000001',
  nameEn: 'Salary deduction %',
  nameAr: 'خصم نسبة من الراتب',
  effect: 'DEDUCT_PERCENT',
  percentBase: 'MONTH_SALARY',
  isActive: true,
};
export const AMOUNT_ACTION: PenaltyActionRef & { isActive: boolean } = {
  id: '9a000000-0000-4000-8000-000000000002',
  nameEn: 'Fixed deduction',
  nameAr: 'خصم مبلغ ثابت',
  effect: 'DEDUCT_AMOUNT',
  percentBase: null,
  isActive: true,
};

/** A catalogue level with a seeded action and days. */
export function lvl(level: number, code: PenaltyAction, days: number | null = null): ViolationLevel {
  return { level, action: ACTION[code], days, percent: null, amount: null };
}

/** An item of `GET /hr/penalty-actions`. */
export function actionItem(action: PenaltyActionRef & { isActive?: boolean }, over: Partial<PenaltyActionItem> = {}): PenaltyActionItem {
  return {
    id: action.id,
    code: null,
    nameEn: action.nameEn,
    nameAr: action.nameAr,
    effect: action.effect,
    percentBase: action.percentBase,
    sortOrder: 1,
    isActive: action.isActive ?? true,
    levelsUsing: 0,
    violationsUsing: 0,
    ...over,
  };
}

/** The ten seeded actions as the list sends them (visible, in order). */
export const SEEDED_ITEMS: PenaltyActionItem[] = SEEDED_PENALTY_ACTIONS.map((a, i) =>
  actionItem(ACTION[a.code], { code: a.code, sortOrder: i + 1 }),
);
