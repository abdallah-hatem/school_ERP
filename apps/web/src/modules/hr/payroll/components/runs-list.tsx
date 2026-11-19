'use client';

import { useCan } from '@/core/auth';
import { PAYROLL_PAGINATION, type Month, type PayrollRunSummary } from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { RowActions, rowActionsColumn } from '@/shared/components/data-table/row-actions';
import { MonthStepper } from '@/shared/components/form/month-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/shared/components/ui/dialog';
import { Money } from '@/shared/components/ui/figures';
import { AddIcon, BlockedIcon, OpenIcon, PayrollIcon } from '@/shared/components/ui/icons';
import { SkeletonPill } from '@/shared/components/ui/skeleton';
import { apiErrorText } from '@/shared/lib/api-error';
import { formatCount, formatDate, formatMonth } from '@/shared/lib/format';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { CREATE_PAYROLL_RUN } from '../apis';
import { runsQueryString, type RunsListQuery } from '../lib/run-query';
import { RunStatusPill } from './payroll-bits';

export interface RunsListProps {
  /** `/ar/payroll` — the list's own path. */
  basePath: string;
  query: RunsListQuery;
  /** `null` when the list failed to load; `undefined` on first load (skeleton rows). */
  runs: PayrollRunSummary[] | null | undefined;
  total: number;
  /** This month (the latest a run can be created for). */
  currentMonth: Month;
}

/** The monthly runs, newest first, and "Create run" for a month. */
export function RunsList({ basePath, query, runs, total, currentMonth }: RunsListProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);

  function go(next: RunsListQuery) {
    startTransition(() => router.push(`${basePath}${runsQueryString(next)}`, { scroll: false }));
  }

  const columns: DataTableColumn<PayrollRunSummary>[] = [
    {
      id: 'month',
      header: t('payroll.list.columns.month'),
      className: 'min-w-44',
      card: 'title',
      cell: (run) => (
        <Link
          href={`${basePath}/${run.id}`}
          aria-label={t('payroll.list.open', {
            month: formatMonth(run.month, locale),
          })}
          className="text-primary cursor-pointer font-bold hover:underline"
        >
          {formatMonth(run.month, locale)}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('payroll.list.columns.status'),
      className: 'w-36',
      card: 'status',
      skeleton: <SkeletonPill />,
      cell: (run) => <RunStatusPill status={run.status} transferred={run.transferredAt !== null} />,
    },
    {
      id: 'employees',
      header: t('payroll.list.columns.employees'),
      align: 'end',
      className: 'w-32',
      cell: (run) => <span className="tabular">{formatCount(run.totals.employees)}</span>,
    },
    {
      id: 'net',
      header: t('payroll.list.columns.net'),
      align: 'end',
      className: 'w-48',
      card: 'highlight',
      cell: (run) => <Money value={run.totals.net} currency={false} className="font-bold" />,
    },
    {
      id: 'approvedAt',
      header: t('payroll.list.columns.approvedAt'),
      className: 'w-40',
      cell: (run) =>
        run.approvedAt ? (
          <bdi className="tabular">
            {formatDate(run.approvedAt.slice(0, 10), locale)}
          </bdi>
        ) : (
          <span className="text-muted-foreground">{t('payroll.list.notApproved')}</span>
        ),
    },
    rowActionsColumn(t('payroll.table.columns.actions'), (run) => (
      <RowActions
        label={t('ui.table.actionsFor', { name: formatMonth(run.month, locale) })}
        actions={[{ id: 'open', label: t('payroll.profile.openRun'), icon: OpenIcon, href: `${basePath}/${run.id}` }]}
      />
    )),
  ];

  // R6: only someone who may create a run sees the button.
  const createButton = useCan()('hr.payroll.create') ? (
    <Button variant="primary" className="cursor-pointer" disabled={runs === undefined} onClick={() => setCreating(true)}>
      <AddIcon />
      {t('payroll.create.action')}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('payroll.title')} description={t('payroll.description')} actions={createButton} />
      <DataTable
        label={t('payroll.list.tableLabel')}
        columns={columns}
        rows={runs ?? undefined}
        getRowId={(run) => run.id}
        loading={runs === undefined}
        error={runs === null}
        onRetry={() => startTransition(() => router.refresh())}
        retrying={pending}
        refreshing={pending && runs !== null}
        empty={
          <EmptyState
            icon={PayrollIcon}
            title={t('payroll.list.empty.title')}
            description={t('payroll.list.empty.body')}
            action={createButton}
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
      <CreateRunDialog
        open={creating}
        onOpenChange={setCreating}
        currentMonth={currentMonth}
        onCreated={(id) => router.push(`${basePath}/${id}`)}
      />
    </div>
  );
}

/**
 * Pick a month (this month or earlier) and create its draft run. A month that already has a run
 * comes back 409 `PAYROLL_RUN_EXISTS`; the server's message is shown in the dialog.
 */
export function CreateRunDialog({
  open,
  onOpenChange,
  currentMonth,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: Month;
  onCreated: (runId: string) => void;
}) {
  const { t, has, locale } = useTranslation();
  const [month, setMonth] = useState<Month>(currentMonth);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  function change(next: boolean) {
    if (busyRef.current) return;
    if (!next) {
      setError(null);
      setMonth(currentMonth);
    }
    onOpenChange(next);
  }

  async function create() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await callApi(CREATE_PAYROLL_RUN(month), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('payroll.create.created'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) {
        onCreated(res.data.id);
        return;
      }
      if (!res.success) setError(apiErrorText(res, { t, has }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        size="sm"
        title={t('payroll.create.title')}
        description={t('payroll.create.body')}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={busy}>
                {t('ui.dialog.cancel')}
              </Button>
            </DialogClose>
            <Button variant="primary" loading={busy} onClick={() => void create()}>
              {t('payroll.create.confirm', {
                month: formatMonth(month, locale),
              })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-start gap-4">
          <MonthStepper
            month={month}
            max={currentMonth}
            onChange={(next) => {
              setMonth(next);
              setError(null);
            }}
            disabled={busy}
            label={t('payroll.create.month')}
          />
          {error ? (
            <p
              role="alert"
              className="bg-destructive-soft text-destructive-ink flex w-full items-start gap-2 rounded-xl px-3.5 py-3 text-sm"
            >
              <BlockedIcon className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
