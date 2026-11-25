import {
  formatAmountShort,
  formatPercent,
  PenaltyEffect,
  PenaltySalaryBase,
  type PenaltyActionRef,
  type PenaltyLevelNumbers,
} from '@school-erp/shared';
import { formatDayCount } from '@/shared/lib/format';
import { nameIn, type Locale, type Translate } from '@/shared/lib/i18n';

/** A level's or a penalty's numbers; any may be missing (a catalogue level that holds none). */
export type ActionNumbers = Partial<PenaltyLevelNumbers>;

/**
 * How a level's or a penalty's action reads (spec 2026-11-25): the three deducting effects as what
 * they take — "Deduct 0.5 day" / "خصم 0.5 يوم", "خصم يومين" (the noun follows خصم, `formatDayCount`
 * oblique), "Deduct 10% of the salary for the month", "Deduct EGP 200"; record-only by the action's
 * name ("Warning"); an investigation by its name, with days "{name}, 2 days deducted". `{name}` is
 * the snapshot (or today's action) in the screen's language. Percents with no trailing zeros.
 */
export function describeAction(
  t: Translate,
  locale: Locale,
  action: Pick<PenaltyActionRef, 'nameEn' | 'nameAr' | 'effect' | 'percentBase'>,
  numbers: ActionNumbers,
): string {
  const name = nameIn(action, locale);
  const days = numbers.days != null && numbers.days > 0 ? formatDayCount(numbers.days, locale, { case: 'oblique' }) : null;
  switch (action.effect) {
    case PenaltyEffect.DEDUCT_DAYS:
      return days ? t('common.penaltyLabel.deduct', { days }) : name;
    case PenaltyEffect.INVESTIGATION:
      return days ? t('common.penaltyLabel.investigation', { name, days }) : name;
    case PenaltyEffect.DEDUCT_PERCENT:
      if (numbers.percent == null) return name;
      return t(action.percentBase === PenaltySalaryBase.BASIC_SALARY ? 'common.penaltyLabel.percentBasic' : 'common.penaltyLabel.percentMonth', {
        percent: formatPercent(numbers.percent),
      });
    case PenaltyEffect.DEDUCT_AMOUNT:
      return numbers.amount == null ? name : t('common.penaltyLabel.amount', { amount: formatAmountShort(numbers.amount) });
    case PenaltyEffect.RECORD_ONLY:
      return name;
  }
}

/** Whether a penalty with this action and number costs pay (shown in the destructive tone). */
export function deductsPay(effect: PenaltyEffect, numbers: ActionNumbers): boolean {
  if (effect === PenaltyEffect.DEDUCT_PERCENT || effect === PenaltyEffect.DEDUCT_AMOUNT) return true;
  return (effect === PenaltyEffect.DEDUCT_DAYS || effect === PenaltyEffect.INVESTIGATION) && (numbers.days ?? 0) > 0;
}
