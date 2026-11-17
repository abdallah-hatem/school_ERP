'use client';

import { PayrollStatus, type EmployeePayrollLine } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Money } from '@/shared/components/ui/figures';
import { OpenIcon, PayrollIcon, PayslipIcon } from '@/shared/components/ui/icons';
import { formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { runsQueryString } from '../lib/run-query';
import { RunStatusPill } from './payroll-bits';

export interface EmployeePayrollProps {
  /** `/ar/payroll`. */
  payrollPath: string;
  /** `/ar/employees/<id>/payroll` — pagination pushes `?page&limit` onto it. */
  tabPath: string;
  /** `null` when the history failed to load; `undefined` while the tab loads (skeleton rows). */
  rows: EmployeePayrollLine[] | null | undefined;
  total: number;
  page: number;
  limit: number;
}

/**
 * The profile's "Payroll" tab: the employee's line in each run, newest month first (one paginated
 * request, page in the URL), with a link to the payslip once the run is approved (a draft links
 * to the run instead).
 */
export function EmployeePayroll({ payrollPath, tabPath, rows, total, page, limit }: EmployeePayrollProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(nextPage: number, nextLimit: number) {
    const qs = runsQueryString({ page: nextPage, limit: nextLimit });
    startTransition(() => router.push(`${tabPath}${qs}`, { scroll: false }));
  }

  const columns: DataTableColumn<EmployeePayrollLine>[] = [
    {
      id: 'month',
      header: t('payroll.list.columns.month'),
      className: 'min-w-40',
      card: 'title',
      cell: ({ month }) => <span className="font-bold">{formatMonth(month, locale)}</span>,
    },
    {
      id: 'status',
      header: t('payroll.list.columns.status'),
      className: 'w-32',
      card: 'status',
      cell: ({ status }) => <RunStatusPill status={status} />,
    },
    {
      id: 'net',
      header: t('payroll.table.columns.net'),
      align: 'end',
      className: 'w-36',
      card: 'highlight',
      cell: ({ net }) => <Money value={net} currency={false} className="font-extrabold" />,
    },
    rowActionsColumn(t('payroll.table.columns.actions'), ({ runId, lineId, status, month }) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: formatMonth(month, locale) })}
        actions={[
          {
            id: 'payslip',
            label: t('payroll.table.payslip'),
            icon: PayslipIcon,
            hidden: status !== PayrollStatus.APPROVED,
            href: `${payrollPath}/${runId}/payslip/${lineId}`,
          },
          { id: 'open', label: t('payroll.profile.openRun'), icon: OpenIcon, href: `${payrollPath}/${runId}` },
        ]}
      />
    )),
  ];

  return (
    <DataTable
      label={t('payroll.profile.tableLabel')}
      columns={columns}
      rows={rows ?? undefined}
      loading={rows === undefined}
      getRowId={({ lineId }) => lineId}
      refreshing={pending}
      error={rows === null}
      onRetry={() => startTransition(() => router.refresh())}
      retrying={pending && rows === null}
      empty={
        <EmptyState
          icon={PayrollIcon}
          title={t('payroll.profile.empty.title')}
          description={t('payroll.profile.empty.body')}
        />
      }
      pagination={
        rows === null
          ? undefined
          : {
              page,
              limit,
              total,
              onPageChange: (p) => go(p, limit),
            }
      }
    />
  );
}
