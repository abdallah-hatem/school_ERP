'use client';

import { PayrollStatus, type EmployeePayrollLine } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { PayrollIcon, PayslipIcon } from '@/shared/components/ui/icons';
import { formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { runsQueryString } from '../lib/run-query';
import { RunStatusPill } from './payroll-bits';

export interface EmployeePayrollProps {
  /** `/ar/payroll`. */
  payrollPath: string;
  /** `/ar/employees/<id>/payroll` — pagination pushes `?page&limit` onto it. */
  tabPath: string;
  /** `null` when the history failed to load. */
  rows: EmployeePayrollLine[] | null;
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
    {
      id: 'actions',
      header: <span className="sr-only">{t('payroll.table.columns.actions')}</span>,
      cardLabel: t('payroll.table.columns.actions'),
      align: 'end',
      className: 'w-40',
      cell: ({ runId, lineId, status }) =>
        status === PayrollStatus.APPROVED ? (
          <Button asChild size="sm" variant="soft" className="cursor-pointer">
            <Link href={`${payrollPath}/${runId}/payslip/${lineId}`}>
              <PayslipIcon />
              {t('payroll.table.payslip')}
            </Link>
          </Button>
        ) : (
          <span className="inline-flex flex-col items-end gap-0.5">
            <Link
              href={`${payrollPath}/${runId}`}
              className="text-primary cursor-pointer text-sm font-bold hover:underline"
            >
              {t('payroll.profile.openRun')}
            </Link>
            <span className="text-muted-foreground text-xs">{t('payroll.profile.draftNote')}</span>
          </span>
        ),
    },
  ];

  return (
    <DataTable
      label={t('payroll.profile.tableLabel')}
      columns={columns}
      rows={rows === null ? undefined : rows}
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
              onLimitChange: (l) => go(1, l),
            }
      }
    />
  );
}
