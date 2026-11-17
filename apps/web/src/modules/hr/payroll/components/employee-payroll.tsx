'use client';

import { PayrollStatus } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { PayrollIcon, PayslipIcon } from '@/shared/components/ui/icons';
import { formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import type { EmployeePayrollRow } from '../lib/load';
import { adjustmentNet } from '../lib/run-query';
import { DeductionAmount, LineStatus, RunStatusPill, SignedAmount } from './payroll-bits';

const PAGE_SIZES = [12, 24];

/**
 * The profile's "Payroll" tab: the employee's line in each run, newest month first, with a link to
 * the payslip once the run is approved (a draft links to the run instead).
 */
export function EmployeePayroll({ payrollPath, rows }: { payrollPath: string; rows: EmployeePayrollRow[] | null }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZES[0] ?? 12);

  const all = rows ?? [];
  const pageCount = Math.max(1, Math.ceil(all.length / limit));
  const current = Math.min(page, pageCount);
  const pageRows = all.slice((current - 1) * limit, current * limit);

  const columns: DataTableColumn<EmployeePayrollRow>[] = [
    {
      id: 'month',
      header: t('payroll.list.columns.month'),
      className: 'min-w-40',
      card: 'title',
      cell: ({ run }) => <span className="font-bold">{formatMonth(run.month, locale)}</span>,
    },
    {
      id: 'status',
      header: t('payroll.list.columns.status'),
      className: 'w-32',
      card: 'status',
      cell: ({ run, line }) => (
        <span className="inline-flex flex-col items-start gap-1">
          <RunStatusPill status={run.status} />
          {line.flags.length > 0 ? <LineStatus flags={line.flags} /> : null}
        </span>
      ),
    },
    {
      id: 'monthSalary',
      header: t('payroll.table.columns.monthSalary'),
      align: 'end',
      className: 'w-32',
      cell: ({ line }) => <Money value={line.monthSalary} currency={false} />,
    },
    {
      id: 'deductions',
      header: t('payroll.tiles.deductions'),
      align: 'end',
      className: 'w-36',
      cell: ({ line }) => <DeductionAmount value={line.penaltyAmount + line.latenessAmount} />,
    },
    {
      id: 'adjustments',
      header: t('payroll.table.columns.adjustments'),
      align: 'end',
      className: 'w-32',
      cell: ({ line }) => <SignedAmount value={adjustmentNet(line)} />,
    },
    {
      id: 'net',
      header: t('payroll.table.columns.net'),
      align: 'end',
      className: 'w-36',
      card: 'highlight',
      cell: ({ line }) => <Money value={line.net} currency={false} className="font-extrabold" />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('payroll.table.columns.actions')}</span>,
      cardLabel: t('payroll.table.columns.actions'),
      align: 'end',
      className: 'w-40',
      cell: ({ run, line }) =>
        run.status === PayrollStatus.APPROVED ? (
          <Button asChild size="sm" variant="soft" className="cursor-pointer">
            <Link href={`${payrollPath}/${run.id}/payslip/${line.id}`}>
              <PayslipIcon />
              {t('payroll.table.payslip')}
            </Link>
          </Button>
        ) : (
          <span className="inline-flex flex-col items-end gap-0.5">
            <Link
              href={`${payrollPath}/${run.id}`}
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
      rows={rows === null ? undefined : pageRows}
      getRowId={({ line }) => line.id}
      error={rows === null}
      onRetry={() => startRetry(() => router.refresh())}
      retrying={retrying}
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
              page: current,
              limit,
              total: all.length,
              onPageChange: setPage,
              onLimitChange: (next) => {
                setLimit(next);
                setPage(1);
              },
              limitOptions: PAGE_SIZES,
            }
      }
    />
  );
}
