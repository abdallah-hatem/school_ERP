'use client';

import { ANALYTICS_RANGES, type AnalyticsRange } from '@school-erp/shared';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useTransition, type ReactNode } from 'react';
import { MonthsLongIcon, MonthsShortIcon } from '@/shared/components/ui/icons';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/** The range on screen and whether the next one is loading (the charts dim meanwhile). */
interface RangeState {
  range: AnalyticsRange;
  pending: boolean;
  choose: (range: AnalyticsRange) => void;
}
const RangeContext = createContext<RangeState | null>(null);

/** Holds the dashboard's 6 / 12 months: the switch in the header and the charts below share it. */
export function AnalyticsRangeProvider({ range, children }: { range: AnalyticsRange; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const choose = (next: AnalyticsRange) => {
    if (next === range) return;
    // The URL holds the range; the page stays where it is while the charts reload.
    startTransition(() => router.push(`${pathname}?months=${next}`, { scroll: false }));
  };
  return <RangeContext.Provider value={{ range, pending, choose }}>{children}</RangeContext.Provider>;
}

export function useAnalyticsRange(): RangeState | null {
  return useContext(RangeContext);
}

const ICONS = { 6: MonthsShortIcon, 12: MonthsLongIcon } as const;

/** The 6 months / 12 months switch (a segmented pair of toggle buttons). `inert`: its skeleton. */
export function RangeSwitch({ inert = false }: { inert?: boolean }) {
  const { t } = useTranslation();
  const state = useAnalyticsRange();
  const current = state?.range;
  return (
    <div
      role="group"
      aria-label={t('dashboard.charts.range.label')}
      aria-hidden={inert || undefined}
      inert={inert}
      className={cn(
        'inline-flex gap-0.5 rounded-xl border border-border bg-card p-[3px]',
        inert && 'skeleton-mask',
      )}
    >
      {ANALYTICS_RANGES.map((r) => {
        const Icon = ICONS[r];
        const on = current === r;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            disabled={state?.pending}
            onClick={() => state?.choose(r)}
            className={cn(
              'tap-target inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[11px] px-3.5 text-sm font-bold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed',
              on ? 'bg-primary text-primary-foreground shadow-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-4.5" />
            {t(`dashboard.charts.range.${r}`)}
          </button>
        );
      })}
    </div>
  );
}
