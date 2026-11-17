'use client';

import type { Days as DayCount, Piastres } from '@school-erp/shared';
import { formatDays, formatMoney } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/*
 * Figures render through these, never by hand: Latin tabular digits, isolated left-to-right inside
 * Arabic text, the currency label in the screen's language.
 */

/** Integer piastres → `EGP 14,000.00` (`14,000.00 ج.م` in Arabic). */
export function Money({
  value,
  currency = true,
  className,
}: {
  value: Piastres;
  /** Show the currency label (hide it in table columns whose header already says EGP). */
  currency?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  // The label always sits left of the figure: "EGP 14,000.00" reads LTR, "14,000.00 ج.م" reads RTL.
  return (
    <span dir="ltr" className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      {currency ? <span className="text-[0.85em] font-semibold opacity-75">{t('ui.units.currency')}</span> : null}
      <span className="tabular">{formatMoney(value)}</span>
    </span>
  );
}

/** Day count in steps of 0.25 → `1.25 days`. */
export function Days({
  value,
  unit = true,
  className,
}: {
  value: DayCount;
  unit?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <bdi dir="ltr" className="tabular">
        {formatDays(value)}
      </bdi>
      {unit ? <span className="text-[0.9em] opacity-75">{t('ui.units.days')}</span> : null}
    </span>
  );
}
