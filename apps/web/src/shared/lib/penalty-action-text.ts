import {
  formatAmountShort,
  formatMoney,
  formatPercent,
  PenaltyEffect,
  PenaltySalaryBase,
  SEEDED_PENALTY_ACTIONS,
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

/**
 * The payslip's label for a penalty (owner Q12, Q13, 2026-11-26): the effect's text, then the
 * action's own name in brackets when it isn't the effect's default name — "Deduct EGP 200 (Late
 * uniform fine)"; a % of the basic salary says the base it was taken from — "Deduct 10% of the basic
 * salary (12,345.67)". Record-only actions and investigations already read by their name.
 */
export function payslipActionLabel(
  t: Translate,
  locale: Locale,
  action: Pick<PenaltyActionRef, 'nameEn' | 'nameAr' | 'effect' | 'percentBase'>,
  numbers: ActionNumbers,
  basicSalary: number | undefined,
): string {
  const ofBasic =
    action.effect === PenaltyEffect.DEDUCT_PERCENT &&
    action.percentBase === PenaltySalaryBase.BASIC_SALARY &&
    numbers.percent != null &&
    basicSalary !== undefined;
  const text = ofBasic
    ? t('common.penaltyLabel.percentBasicWithBase', { percent: formatPercent(numbers.percent!), base: formatMoney(basicSalary) })
    : describeAction(t, locale, action, numbers);
  const deducting =
    action.effect === PenaltyEffect.DEDUCT_DAYS ||
    action.effect === PenaltyEffect.DEDUCT_PERCENT ||
    action.effect === PenaltyEffect.DEDUCT_AMOUNT;
  const name = nameIn(action, locale);
  // The effect's default words, and a seeded action's own name, are never added (only a school's
  // own or renamed action shows its name — owner Q12, review 2026-11-26).
  const defaults = new Set([
    t(`common.enums.penaltyEffect.${action.effect}`),
    ...SEEDED_PENALTY_ACTIONS.filter((a) => a.effect === action.effect).map((a) => nameIn(a, locale)),
  ]);
  return deducting && !defaults.has(name) ? `${text} (${name})` : text;
}

/**
 * A payroll line's deducting penalties by kind, for a viewer without salary access (owner Q9):
 * "2 penalties: 0.5 day, 5%" — days, percents and catalogue amounts, never the EGP taken.
 */
export function penaltyKinds(
  t: Translate,
  locale: Locale,
  penalties: readonly (ActionNumbers & { effect: PenaltyEffect })[],
): string {
  const kinds = penalties.map((p) => {
    if (p.effect === PenaltyEffect.DEDUCT_PERCENT && p.percent != null) return `${formatPercent(p.percent)}%`;
    if (p.effect === PenaltyEffect.DEDUCT_AMOUNT && p.amount != null) {
      const amount = formatAmountShort(p.amount);
      return locale === 'ar' ? `${amount} ${t('ui.units.currency')}` : `${t('ui.units.currency')} ${amount}`;
    }
    return formatDayCount(p.days ?? 0, locale);
  });
  return t('payroll.penaltyKinds', { count: penalties.length, kinds: kinds.join(locale === 'ar' ? '، ' : ', ') });
}
