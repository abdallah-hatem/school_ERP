'use client';

import { can, useSession } from '@/core/auth';
import { TableIcon } from '@/shared/components/ui/icons';
import { Skeleton, SkeletonButton, SkeletonText } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CHART_CARD, CHART_GRID, ChartCardHeader } from './analytics-section';

/** A card's frame while it loads: its real title and line, the Table button, then `children`. */
function CardSkeleton({ block, title, sub, children }: { block: string; title: string; sub: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <section data-skeleton-block={block} data-skeleton-measure="width" className={CHART_CARD}>
      <ChartCardHeader
        title={<SkeletonText className="font-display text-base leading-snug" width="w-36" />}
        sub={<SkeletonText className="text-xs" width="w-52" />}
        action={
          <SkeletonButton size="sm" className="h-8 gap-1.5 rounded-[11px] px-2.5 text-xs">
            <TableIcon className="size-4" />
            {t('dashboard.charts.table')}
          </SkeletonButton>
        }
      />
      <span className="sr-only">
        {title} {sub}
      </span>
      {children}
    </section>
  );
}

const Legend = ({ items }: { items: number }) => (
  <span className="flex gap-4">
    {Array.from({ length: items }, (_, i) => (
      <SkeletonText key={i} className="text-xs" width="w-20" />
    ))}
  </span>
);
const Rule = () => <div aria-hidden="true" className="h-px bg-border" />;

/**
 * The charts' first load, in the loaded shape: the same grid and cards (by the viewer's
 * permissions, as the API decides), titles, Table buttons and chart heights. Typical content
 * (five stages, six deduction months) — the cards' heights follow the data, so the skeleton spec
 * measures their widths.
 */
export function AnalyticsSkeleton({ announce = true }: { announce?: boolean }) {
  const { t } = useTranslation();
  const user = useSession();
  const shows = {
    payroll: can(user, 'hr.payroll.view'),
    headcount: can(user, 'hr.employees.view'),
    penalties: can(user, 'hr.penalties.view') || can(user, 'hr.lateness.view'),
    deductions: can(user, 'hr.payroll.view') && can(user, 'hr.employees.view_salary'),
  };
  if (!Object.values(shows).some(Boolean)) return null;
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      {announce ? (
        <span role="status" className="sr-only">
          {t('ui.states.loading')}
        </span>
      ) : null}
      <div data-skeleton-block="charts" data-skeleton-measure="width" className={CHART_GRID}>
        {shows.payroll ? (
          <CardSkeleton block="chart-payroll" title={t('dashboard.charts.payroll.title')} sub={t('dashboard.charts.payroll.sub')}>
            <Skeleton className="h-[230px] w-full rounded-xl xl:h-auto xl:min-h-[300px] xl:flex-1" />
          </CardSkeleton>
        ) : null}
        {shows.headcount ? (
          <CardSkeleton block="chart-headcount" title={t('dashboard.charts.headcount.title')} sub={t('dashboard.charts.headcount.sub')}>
            <ul className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2.5 text-sm">
                  <SkeletonText className="text-sm" width="w-16" />
                  <Skeleton className={cn('h-3.5 rounded-e-[4px]', ['w-1/2', 'w-full', 'w-2/3', 'w-1/2', 'w-1/6'][i])} />
                </li>
              ))}
            </ul>
            <Rule />
            <SkeletonText className="-mb-1 text-sm" width="w-32" />
            <Legend items={2} />
            <Skeleton className="h-[150px] w-full rounded-xl" />
          </CardSkeleton>
        ) : null}
        {shows.penalties ? (
          <CardSkeleton block="chart-penalties" title={t('dashboard.charts.penalties.title')} sub={t('dashboard.charts.penalties.sub')}>
            <Legend items={3} />
            <Skeleton className="h-[160px] w-full rounded-xl xl:h-[170px]" />
            <Rule />
            <SkeletonText className="-mb-1 text-sm" width="w-40" />
            <Skeleton className="h-[130px] w-full rounded-xl" />
          </CardSkeleton>
        ) : null}
        {shows.deductions ? (
          <CardSkeleton block="chart-deductions" title={t('dashboard.charts.deductions.title')} sub={t('dashboard.charts.deductions.subNone')}>
            <Skeleton className="h-7 w-full rounded-[4px]" />
            <div className="grid grid-cols-2 gap-x-4.5 gap-y-2">
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} className="flex flex-col gap-1">
                  <SkeletonText className="text-xs" width="w-24" />
                  <SkeletonText className="text-sm" width="w-20" />
                </span>
              ))}
            </div>
            <Rule />
            <SkeletonText className="-mb-1 text-sm" width="w-44" />
            <span className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonText key={i} className="text-xs" width="w-full" />
              ))}
            </span>
          </CardSkeleton>
        ) : null}
      </div>
    </div>
  );
}
