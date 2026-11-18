'use client';

import type { Days as DayCount, Piastres } from '@school-erp/shared';
import { formatDayCount, formatDays, formatMoney } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/*
 * Figures render through these, never by hand: Latin tabular digits, isolated left-to-right inside
 * Arabic text, the currency label in the screen's language.
 */

/**
 * Integer piastres → `EGP 14,000.00` (`14,000.00 ج.م` in Arabic). `undefined` is an amount the API
 * left out because the viewer may not see it (R7): a muted dash, read out as "Amount hidden".
 */
export function Money({
  value,
  currency = true,
  className,
}: {
  value: Piastres | undefined;
  /** Show the currency label (hide it in table columns whose header already says EGP). */
  currency?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  if (value === undefined) {
    return (
      <span className={cn('text-muted-foreground', className)} aria-label={t('ui.units.amountHidden')} title={t('ui.units.amountHidden')}>
        —
      </span>
    );
  }
  // The label always sits left of the figure: "EGP 14,000.00" reads LTR, "14,000.00 ج.م" reads RTL.
  // Where the box is too narrow for both (EGP 99,999,999.99 in a half-width tile or a sum term),
  // the label moves onto its own line above the figure; the figure itself never breaks or overflows
  // its own line (`whitespace-nowrap` on each part). Wrapped lines keep to the reading start.
  return (
    <span
      dir="ltr"
      className={cn('inline-flex max-w-full flex-wrap items-baseline gap-x-1 rtl:justify-end', className)}
    >
      {currency ? (
        <span className="text-[0.85em] font-semibold whitespace-nowrap opacity-75">{t('ui.units.currency')}</span>
      ) : null}
      <span className="tabular whitespace-nowrap">{formatMoney(value)}</span>
    </span>
  );
}

/**
 * Day count in steps of 0.25. With its unit the noun agrees with the number in the screen's
 * language (`formatDayCount`: "2 days", "يومان", "3 أيام", "0.5 يوم"); without it, the bare figure.
 */
export function Days({
  value,
  unit = true,
  className,
}: {
  value: DayCount;
  unit?: boolean;
  className?: string;
}) {
  const { locale } = useTranslation();
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      {unit ? (
        <span className="tabular">{formatDayCount(value, locale)}</span>
      ) : (
        <bdi dir="ltr" className="tabular">
          {formatDays(value)}
        </bdi>
      )}
    </span>
  );
}
