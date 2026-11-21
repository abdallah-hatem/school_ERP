'use client';

import { monthOf, PAGINATION, PAYROLL_PAGINATION, PayrollStatus, type IsoDate, type IsoDateTime } from '@school-erp/shared';
import { formatDate, formatMonth } from '@/shared/lib/format';
import { useParams, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { RecordHistorySkeleton } from '@/core/audit';
import { DataTable } from '@/shared/components/data-table/data-table';
import { PageHeader } from '@/shared/components/layout/page-header';
import { ExportIcon } from '@/shared/components/ui/icons';
import { SkeletonButton, SkeletonPill, SkeletonProse } from '@/shared/components/ui/skeleton';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { parseRunQuery, parseRunsQuery } from '../lib/run-query';
import { PayrollI18n } from '../messages';
import { EmployeePayroll } from './employee-payroll';
import { PayslipSkeleton as PayslipSkeletonBody } from './payslip-view';
import { RulesPanel } from './rules-panel';
import { RUN_COLUMN_IDS, RUN_LINES_CARDS_BELOW, RunLinesToolbar, RunTiles, runColumn } from './run-page';
import { RunTabs } from './run-shell';
import { RunsList } from './runs-list';

/*
 * Route skeletons (`loading.tsx`). Each draws the screen's own pieces in their loading state —
 * same header, tiles, toolbar, columns, row heights and panels — so nothing moves when the data
 * arrives. They read the URL for the parts the screen shows from it (page, filters).
 */

const noop = () => undefined;

/**
 * A run's approval time as the rules panel's skeleton words it ("calculated on 21 Nov 2026,
 * 10:30"): fixed, so the server's and the browser's skeleton read the same (no clock, no zone).
 */
const TYPICAL_APPROVED_AT = '2026-11-21T08:30:00.000Z' as IsoDateTime;

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

/** The run layout's header and tabs while the run loads, over the opened tab's skeleton. */
function RunShellSkeleton({ children }: { children: ReactNode }) {
  const { t, locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const basePath = `/${locale}/payroll`;
  // The title and sentence of a typical run (this month's, approved today), drawn as their own
  // text so they wrap — and push the pill and the button — where the loaded ones do.
  const today = new Date().toISOString().slice(0, 10) as IsoDate;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<SkeletonProse>{t('payroll.runTitle', { month: formatMonth(monthOf(new Date()), locale) })}</SkeletonProse>}
        // An approved run, as most runs opened are (every month but the one being worked on): its
        // pill and its one button, Export bank sheet (a draft adds Recalculate and Approve).
        status={<SkeletonPill>{t(`common.enums.payrollStatus.${PayrollStatus.APPROVED}`)}</SkeletonPill>}
        description={<SkeletonProse>{t('payroll.runDescriptionApproved', { date: formatDate(today, locale) })}</SkeletonProse>}
        breadcrumbs={[{ label: t('payroll.title'), href: basePath }, { label: ' ' }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          <SkeletonButton>
            <ExportIcon />
            {t('payroll.actions.exportBankSheet')}
          </SkeletonButton>
        }
      />
      <RunTabs runHref={`${basePath}/${id}`} />
      {children}
    </div>
  );
}

/** The Employees tab's body while it loads: the four tiles, the lines table and the rules panel. */
function RunLinesSkeletonBody() {
  const { t, locale } = useTranslation();
  const params = useSearchParams();
  const query = parseRunQuery(Object.fromEntries(params));
  return (
    <>
      <RunTiles totals={undefined} />
      <div className="grid items-start gap-5 @min-[1380px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <DataTable
            label={t('ui.states.loading')}
            loading
            rows={undefined}
            getRowId={String}
            cardsBelow={RUN_LINES_CARDS_BELOW}
            columns={RUN_COLUMN_IDS.map((id) => ({ ...runColumn(id, t), cell: () => null }))}
            toolbar={
              <RunLinesToolbar
                count={null}
                search={query.search ?? ''}
                onSearchChange={noop}
                query={query}
                onFilter={noop}
                disabled
              />
            }
            pagination={{
              page: 1,
              limit: PAGINATION.defaultLimit,
              total: 0,
              onPageChange: noop,
              pageSizes: PAYROLL_PAGINATION.pageSizes,
              onLimitChange: noop,
            }}
            scrollHeight="screen"
          />
        </div>
        {/* An approved run's panel (today's rules, "calculated on …"), as the header traces. */}
        <RulesPanel rules={undefined} settingsHref={`/${locale}/settings`} approvedAt={TYPICAL_APPROVED_AT} />
      </div>
    </>
  );
}

/** The History tab's body while it loads: the record History's skeleton, with the run's sentence. */
function RunHistorySkeletonBody() {
  const { t } = useTranslation();
  return <RecordHistorySkeleton description={t('payroll.tabs.historyDescription')} />;
}

/** A run's first load: header and tabs over the Employees tab (tiles, lines table, rules panel). */
export function RunPageSkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <RunShellSkeleton>
        <RunLinesSkeletonBody />
      </RunShellSkeleton>
    </PayrollI18n>
  );
}

/** A run's History opened directly: header and tabs over the History tab's skeleton. */
export function RunHistoryPageSkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <RunShellSkeleton>
        <RunHistorySkeletonBody />
      </RunShellSkeleton>
    </PayrollI18n>
  );
}

/** Switching to the Employees tab: only the tab's body (the run layout's header stays). */
export function RunLinesSkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <RunLinesSkeletonBody />
    </PayrollI18n>
  );
}

/** Switching to the History tab: only the tab's body (the run layout's header stays). */
export function RunHistorySkeleton() {
  const { locale } = useTranslation();
  return (
    <PayrollI18n locale={locale}>
      <RunHistorySkeletonBody />
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

/** The profile's "Payroll" tab while it loads: the tab's table with skeleton rows (the header stays). */
export function EmployeePayrollSkeleton() {
  const { locale } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const query = parseRunsQuery(Object.fromEntries(useSearchParams()));
  return (
    <PayrollI18n locale={locale}>
      <EmployeePayroll
        payrollPath={`/${locale}/payroll`}
        tabPath={`/${locale}/employees/${id}/payroll`}
        rows={undefined}
        total={0}
        page={query.page}
        limit={query.limit}
      />
    </PayrollI18n>
  );
}
