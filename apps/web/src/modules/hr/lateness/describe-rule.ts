import type { LatenessRule } from '@school-erp/shared';
import { formatCount, formatDayCount, formatDays } from '@/shared/lib/format';
import type { Locale, Translate } from '@/shared/lib/i18n';

/**
 * The lateness rule in one line (`hour 1 = 0.25 d · hour 2 = 0.5 d · each later hour = 0.5 d`),
 * from the `lateness` namespace. Used by the lateness grid and the payroll "rules applied" panel.
 */
export function describeLatenessRule(rule: LatenessRule, t: Translate, locale: Locale): string {
  // English keeps the compact `0.25 d`; Arabic spells the agreeing noun (`{dayCount}`).
  const days = (value: number) => ({ days: formatDays(value), dayCount: formatDayCount(value, locale) });
  const parts = [...rule.steps]
    .sort((a, b) => a.hour - b.hour)
    .map((step) => t('lateness.ruleStep', { hour: step.hour, ...days(step.days) }));
  parts.push(t('lateness.ruleExtra', days(rule.extraHourDays)));
  if (rule.graceMinutes > 0) parts.unshift(t('lateness.ruleGrace', { count: formatCount(rule.graceMinutes) }));
  return parts.join(' · ');
}
