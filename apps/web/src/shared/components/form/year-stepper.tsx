'use client';

import type { ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { ChevronEndIcon, ChevronStartIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';

/**
 * Previous / current / next year, with an optional line under the year ("Ends 31 May 2027") — the
 * contract year on the renewals screen and on Settings → School calendar. The caller words the
 * year (`2026/27`) and the buttons' names; chevrons flip in Arabic, like `MonthStepper`.
 */
export function YearStepper({
  year,
  onChange,
  label,
  previousLabel,
  nextLabel,
  format = String,
  sub,
  min,
  max,
  disabled = false,
  className,
}: {
  year: number;
  onChange: (year: number) => void;
  /** Accessible name of the group, e.g. "Contract year". */
  label: string;
  previousLabel: string;
  nextLabel: string;
  format?: (year: number) => string;
  sub?: ReactNode;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}) {
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
        aria-label={previousLabel}
        disabled={disabled || (min !== undefined && year - 1 < min)}
        onClick={() => onChange(year - 1)}
      >
        <ChevronStartIcon className="flip-rtl" />
      </Button>
      <span aria-live="polite" className="flex min-w-32 flex-1 flex-col items-center px-2 leading-tight">
        <bdi dir="ltr" className="tabular text-sm font-bold">
          {format(year)}
        </bdi>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer disabled:cursor-not-allowed"
        aria-label={nextLabel}
        disabled={disabled || (max !== undefined && year + 1 > max)}
        onClick={() => onChange(year + 1)}
      >
        <ChevronEndIcon className="flip-rtl" />
      </Button>
    </div>
  );
}
