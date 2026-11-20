'use client';

import { PAYROLL_PAGINATION, type AccountingPayrollMonthSummary } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { OpenIcon, PayrollIcon } from '@/shared/components/ui/icons';
import { SkeletonPill } from '@/shared/components/ui/skeleton';
import { formatCount, formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { listQueryString, taxesOf, type AccountingPayrollListQuery } from '../lib/accounting-payroll';
import { MonthStatusPill } from './payroll-month';

export interface PayrollListProps {
  /** `/ar/accounting/payroll` — the list's own path. */
  basePath: string;
  /** `/ar/payroll` — HR's payroll, from the empty state. */
  hrPayrollHref: string;
  query: AccountingPayrollListQuery;
  /** `null` when the list failed to load; `undefined` on first load (skeleton rows). */
  months: AccountingPayrollMonthSummary[] | null | undefined;
  total: number;
}

/**
 * Accounting → Payroll (§10): HR's approved months, newest first, laid out like HR's runs list,
 * with what the school pays on top of the net. Read only. Money only for someone who sees every
 * salary (§2, P4) — otherwise a dash.
 */
export function PayrollList({ basePath, hrPayrollHref, query, months, total }: PayrollListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(next: AccountingPayrollListQuery) {
    startTransition(() => router.push(`${basePath}${listQueryString(next)}`, { scroll: false }));
  }

  const money = (value: number | undefined, bold = false) => (
    <Money value={value} currency={false} className={bold ? 'font-bold' : undefined} />
  );

  const columns: DataTableColumn<AccountingPayrollMonthSummary>[] = [
    {
      id: 'month',
      header: t('accounting.payroll.list.columns.month'),
      className: 'min-w-44',
      card: 'title',
      cell: (m) => (
        <Link
          href={`${basePath}/${m.month}`}
          aria-label={t('accounting.payroll.list.open', { month: formatMonth(m.month, locale) })}
          className="cursor-pointer font-bold text-primary hover:underline"
        >
          {formatMonth(m.month, locale)}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('accounting.payroll.list.columns.status'),
      className: 'w-44',
      card: 'status',
      skeleton: <SkeletonPill />,
      cell: (m) => <MonthStatusPill status={m.status} />,
    },
    {
      id: 'employees',
      header: t('accounting.payroll.list.columns.employees'),
      align: 'end',
      className: 'w-28',
      cell: (m) => <span className="tabular">{formatCount(m.totals.employees)}</span>,
    },
    {
      id: 'net',
      header: t('accounting.payroll.list.columns.net'),
      align: 'end',
      className: 'w-40',
      cell: (m) => money(m.totals.net),
    },
    {
      id: 'insurance',
      header: t('accounting.payroll.list.columns.insurance'),
      align: 'end',
      className: 'w-40',
      cell: (m) => money(m.totals.insuranceAmount),
    },
    {
      id: 'taxes',
      header: t('accounting.payroll.list.columns.taxes'),
      align: 'end',
      className: 'w-40',
      cell: (m) => money(taxesOf(m.totals)),
    },
    {
      id: 'gross',
      header: t('accounting.payroll.list.columns.gross'),
      align: 'end',
      className: 'w-44',
      card: 'highlight',
      cell: (m) => money(m.totals.gross, true),
    },
    rowActionsColumn(t('accounting.payroll.list.columns.actions'), (m) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: formatMonth(m.month, locale) })}
        actions={[
          {
            id: 'open',
            label: t('accounting.payroll.list.open', { month: formatMonth(m.month, locale) }),
            icon: OpenIcon,
            href: `${basePath}/${m.month}`,
          },
        ]}
      />
    )),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('accounting.payroll.title')} description={t('accounting.payroll.description')} />
      <DataTable
        label={t('accounting.payroll.list.tableLabel')}
        columns={columns}
        rows={months ?? undefined}
        getRowId={(m) => m.month}
        loading={months === undefined}
        error={months === null}
        onRetry={() => startTransition(() => router.refresh())}
        retrying={pending}
        refreshing={pending && months !== null}
        cardsBelow={900}
        empty={
          <EmptyState
            icon={PayrollIcon}
            title={t('accounting.payroll.list.empty.title')}
            description={t('accounting.payroll.list.empty.body')}
            action={
              <Button asChild variant="secondary" className="cursor-pointer">
                <Link href={hrPayrollHref}>{t('accounting.payroll.list.empty.action')}</Link>
              </Button>
            }
          />
        }
        pagination={{
          page: query.page,
          limit: query.limit,
          total,
          onPageChange: (page) => go({ ...query, page }),
          pageSizes: PAYROLL_PAGINATION.pageSizes,
          onLimitChange: (limit) => go({ page: 1, limit }),
        }}
        scrollHeight="screen"
      />
    </div>
  );
}
