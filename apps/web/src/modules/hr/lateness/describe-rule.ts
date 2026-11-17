import type { LatenessRule } from '@school-erp/shared';
import { formatCount, formatDays } from '@/shared/lib/format';
import type { Translate } from '@/shared/lib/i18n';

/**
 * The lateness rule in one line (`hour 1 = 0.25 d · hour 2 = 0.5 d · each later hour = 0.5 d`),
 * from the `lateness` namespace. Used by the lateness grid and the payroll "rules applied" panel.
 */
export function describeLatenessRule(rule: LatenessRule, t: Translate): string {
  const parts = [...rule.steps]
    .sort((a, b) => a.hour - b.hour)
    .map((step) => t('lateness.ruleStep', { hour: step.hour, days: formatDays(step.days) }));
  parts.push(t('lateness.ruleExtra', { days: formatDays(rule.extraHourDays) }));
  if (rule.graceMinutes > 0) parts.unshift(t('lateness.ruleGrace', { minutes: formatCount(rule.graceMinutes) }));
  return parts.join(' · ');
}
