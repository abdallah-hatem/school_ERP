'use client';

import { shiftMonth, type Month } from '@school-erp/shared';
import { Button } from '@/shared/components/ui/button';
import { CalendarIcon, ChevronEndIcon, ChevronStartIcon } from '@/shared/components/ui/icons';
import { formatMonth } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/**
 * Previous / current / next month. Used by monthly screens (lateness, payroll, penalties filter).
 * `max` disables stepping past a month (e.g. the current one). Chevrons flip in Arabic.
 */
export function MonthStepper({
  month,
  onChange,
  max,
  min,
  disabled = false,
  label,
  className,
}: {
  month: Month;
  onChange: (month: Month) => void;
  max?: Month;
  min?: Month;
  disabled?: boolean;
  /** Accessible name of the group, e.g. "Month". */
  label: string;
  className?: string;
}) {
  const { t, locale } = useTranslation();
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-xs', className)}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer disabled:cursor-not-allowed"
        aria-label={t('ui.form.previousMonth')}
        disabled={disabled || (min !== undefined && prev < min)}
        onClick={() => onChange(prev)}
      >
        <ChevronStartIcon className="flip-rtl" />
      </Button>
      <span aria-live="polite" className="flex min-w-36 items-center justify-center gap-2 px-2 text-sm font-bold">
        <CalendarIcon className="size-4 text-primary" />
        {formatMonth(month, locale)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer disabled:cursor-not-allowed"
        aria-label={t('ui.form.nextMonth')}
        disabled={disabled || (max !== undefined && next > max)}
        onClick={() => onChange(next)}
      >
        <ChevronEndIcon className="flip-rtl" />
      </Button>
    </div>
  );
}
