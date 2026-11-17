'use client';

import { monthOf, PAGINATION } from '@school-erp/shared';
import { useSearchParams } from 'next/navigation';
import { DataTable } from '@/shared/components/data-table/data-table';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Skeleton, SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseRunQuery, parseRunsQuery } from '../lib/run-query';
import { PayrollI18n } from '../messages';
import { PayslipSkeleton as PayslipSkeletonBody } from './payslip-view';
import { RulesPanel } from './rules-panel';
import { RUN_COLUMN_IDS, RunLinesToolbar, RunTiles, runColumn } from './run-page';
import { RunsList } from './runs-list';

/*
 * Route skeletons (`loading.tsx`). Each draws the screen's own pieces in their loading state —
 * same header, tiles, toolbar, columns, row heights and panels — so nothing moves when the data
 * arrives. They read the URL for the parts the screen shows from it (page, filters).
 */

const noop = () => undefined;

/** The runs list while it loads: the list itself with skeleton rows. */
export function RunsListSkeleton() {
  const { locale } = useTranslation();
  const params = useSearchParams();
  return (
    <PayrollI18n locale={locale}>
      <RunsList
        basePath={`/${locale}/payroll`}
        query={parseRunsQuery(Object.fromEntries(params))}
        runs={undefined}
        total={0}
        currentMonth={monthOf(new Date())}
      />
    </PayrollI18n>
  );
}

function RunPageSkeletonBody() {
  const { t, locale } = useTranslation();
  const params = useSearchParams();
  const query = parseRunQuery(Object.fromEntries(params));
  const basePath = `/${locale}/payroll`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<SkeletonText width="w-56" />}
        status={<SkeletonPill />}
        description={
          // One line on a wide screen, two on a phone (as the loaded sentence wraps).
          <span className="flex flex-col">
            <SkeletonText width="w-96" />
            <SkeletonText className="md:hidden" width="w-40" />
          </span>
        }
        breadcrumbs={[{ label: t('payroll.title'), href: basePath }, { label: ' ' }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          <>
            <Skeleton className="h-11 w-40 rounded-lg" />
            <Skeleton className="h-11 w-48 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
          </>
        }
      />
      <RunTiles totals={undefined} />
      <div className="grid items-start gap-5 @min-[1380px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <DataTable
            label={t('ui.states.loading')}
            loading
            rows={undefined}
            getRowId={String}
            columns={RUN_COLUMN_IDS.map((id) => ({ ...runColumn(id, t), cell: () => null }))}
            toolbar={
              <RunLinesToolbar
                count={null}
                search={query.search ?? ''}
                onSearchChange={noop}
                departments={[]}
                query={query}
                onFilter={noop}
                disabled
              />
            }
            pagination={{ page: 1, limit: PAGINATION.defaultLimit, total: 0, onPageChange: noop }}
          />
        </div>
        <RulesPanel settings={undefined} settingsHref={`/${locale}/settings`} />
      </div>
    </div>
  );
}

/** A run while it loads: header, the four tiles, the lines table and the rules panel. */
export function RunPageSkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <RunPageSkeletonBody />
    </PayrollI18n>
  );
}

/** The payslip while it loads: the A4 card in its shape. */
export function PayslipSkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <PayslipSkeletonBody />
    </PayrollI18n>
  );
}
