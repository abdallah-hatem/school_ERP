'use client';

import {
  AccountingPayrollStatus,
  PAGINATION,
  PAYROLL_PAGINATION,
  type AccountingPayrollLine,
  type AccountingPayrollMonth,
  type Month,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useCan } from '@/core/auth';
import { EmployeeLink } from '@/core/employees';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn, type DataTableFooter } from '@/shared/components/data-table/data-table';
import { ClearFilters, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Money } from '@/shared/components/ui/figures';
import {
  ApproveIcon,
  ExcelIcon,
  GrossIcon,
  InsuredIcon,
  LockedIcon,
  NetPayIcon,
  PayrollIcon,
  PayrollTaxesIcon,
  PdfIcon,
  RestoreIcon,
  SearchIcon,
} from '@/shared/components/ui/icons';
import { SkeletonButton, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatTile } from '@/shared/components/ui/stat-tile';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { saveDownloadedFile } from '@/shared/lib/download';
import { formatCount, formatDate, formatMoney, formatMoneyText, formatMonth } from '@/shared/lib/format';
import { localName, type Locale, type Translate } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { FINALIZE_PAYROLL_MONTH, GET_PAYROLL_TAXES_EXCEL, RETURN_PAYROLL_MONTH } from '../apis';
import { adjustmentNet, taxesOf } from '../lib/accounting-payroll';
import { matchesLine } from '../lib/payroll-taxes';

/*
 * One approved month in Accounting → Payroll (§10): HR's run page, read only — the four tiles and
 * the employees with HR's columns (salary, penalties, lateness, adjustments, net) — then what the
 * school pays on top (insurance share, income tax, martyrs' fund) and the gross. Amounts only
 * within the viewer's salary scope; totals only with every salary (§2, P4). `month` undefined:
 * its own skeleton.
 */

/** Ten money columns need room: cards below 1100px of page. */
export const MONTH_LINES_CARDS_BELOW = 1100;


/** Print: landscape A4 with no app chrome; the table lists everyone (`printRows`). */
const PRINT_CSS = `@page { size: A4 landscape; margin: 10mm; }
@media print {
  html, body { background: var(--card) !important; }
  main { padding: 0 !important; }
  tr { break-inside: avoid; }
}`;

export interface PayrollMonthProps {
  /** `YYYY-MM`, known before the data (the title while it loads). */
  monthKey: Month;
  month: AccountingPayrollMonth | undefined;
  /** `/<locale>/accounting/payroll`. */
  basePath: string;
}

export function PayrollMonth({ monthKey, month: serverMonth, basePath }: PayrollMonthProps) {
  const { t, locale } = useTranslation();
  // Finalizing answers with the month as it is now; shown in place of the server's.
  const [updated, setUpdated] = useState<AccountingPayrollMonth | null>(null);
  const month = updated ?? serverMonth;
  const loading = month === undefined;
  const monthLabel = formatMonth(monthKey, locale);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(PAGINATION.defaultLimit);
  const searching = search.trim().length > 0;
  const lines = month?.lines;
  const shown = useMemo(() => (lines ?? []).filter((l) => matchesLine(l, search)), [lines, search]);
  const pageCount = Math.max(1, Math.ceil(shown.length / limit));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageLines = shown.slice((currentPage - 1) * limit, currentPage * limit);
  const columns = monthColumns(t, locale);

  function onSearch(text: string) {
    setSearch(text);
    setPage(1);
  }

  const totalsShown = month?.salaryVisible ?? true;
  const footer: DataTableFooter | undefined = month
    ? totalsShown
      ? {
          label: t('accounting.payrollTaxes.statement.subtotalAll', { count: formatCount(month.lines.length) }),
          cells: {
            net: <Money value={month.totals.net} currency={false} className="font-extrabold" />,
            insuranceAmount: <Money value={month.totals.insuranceAmount} currency={false} />,
            incomeTax: <Money value={month.totals.incomeTax} currency={false} />,
            martyrTax: <Money value={month.totals.martyrTax} currency={false} />,
            gross: <Money value={month.totals.gross} currency={false} className="font-extrabold text-primary" />,
          },
        }
      : {
          label: t('accounting.payrollTaxes.statement.subtotal'),
          note: (
            <span className="inline-flex items-center gap-1.5">
              <LockedIcon className="size-4" />
              {t('accounting.payroll.month.totalsHidden')}
            </span>
          ),
        }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <style>{PRINT_CSS}</style>
      <PageHeader
        title={t('accounting.payroll.month.title', { month: monthLabel })}
        status={month ? <MonthStatusPill status={month.status} /> : undefined}
        description={t('accounting.payroll.month.description')}
        breadcrumbs={[{ label: t('accounting.payroll.month.actions.back'), href: basePath }, { label: monthLabel }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        className="no-print"
        actions={
          month ? (
            <MonthActions month={month} basePath={basePath} onFinalized={setUpdated} />
          ) : (
            <ActionsSkeleton />
          )
        }
      />

      {month?.status === AccountingPayrollStatus.FINALIZED && month.finalizedAt ? (
        <p role="note" className="flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-sm text-success-ink">
          <LockedIcon className="mt-0.5 size-5 shrink-0" />
          <span>{t('accounting.payroll.month.finalizedNote', { date: formatDate(month.finalizedAt.slice(0, 10), locale) })}</span>
        </p>
      ) : null}

      <MonthTiles month={month} />

      <DataTable
        label={t('accounting.payroll.month.tableLabel', { month: monthLabel })}
        columns={columns}
        rows={lines ? pageLines : undefined}
        printRows={lines}
        loading={loading}
        getRowId={(l) => l.employeeId}
        footer={footer}
        cardsBelow={MONTH_LINES_CARDS_BELOW}
        toolbar={
          <>
            <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-display text-lg font-extrabold">{t('accounting.payroll.month.heading')}</h2>
              {lines ? (
                <p data-testid="lines-count" className="text-sm text-muted-foreground">
                  {t('accounting.payroll.month.count', { shown: formatCount(shown.length), total: formatCount(lines.length) })}
                </p>
              ) : (
                <SkeletonText className="text-sm" width="w-16" />
              )}
            </div>
            <div role="search" className="no-print flex w-full flex-wrap items-center gap-2.5">
              <SearchInput
                aria-label={t('accounting.payroll.month.searchLabel')}
                placeholder={t('accounting.payroll.month.searchPlaceholder')}
                value={search}
                disabled={loading}
                onChange={(e) => onSearch(e.target.value)}
              />
              <ClearFilters count={searching ? 1 : 0} onClear={() => onSearch('')} disabled={loading} className="ms-auto" />
            </div>
          </>
        }
        empty={
          searching && lines?.length ? (
            <EmptyState
              icon={SearchIcon}
              title={t('accounting.payroll.month.noMatch.title')}
              description={t('accounting.payroll.month.noMatch.body')}
              action={<ClearFilters placement="empty" count={1} onClear={() => onSearch('')} />}
            />
          ) : (
            <EmptyState
              icon={PayrollIcon}
              title={t('accounting.payroll.month.empty.title')}
              description={t('accounting.payroll.month.empty.body')}
            />
          )
        }
        pagination={{
          page: currentPage,
          limit,
          total: shown.length,
          onPageChange: setPage,
          pageSizes: PAYROLL_PAGINATION.pageSizes,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
        }}
        scrollHeight="screen"
      />
    </div>
  );
}

function ActionsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <SkeletonButton className="h-11 w-24" />
      <SkeletonButton className="h-11 w-36" />
    </div>
  );
}

/** Pending transfer (sunflower, in progress) or Finalized · transferred (done). */
export function MonthStatusPill({ status }: { status: AccountingPayrollMonth['status'] }) {
  const { t } = useTranslation();
  return (
    <StatusPill tone={status === AccountingPayrollStatus.FINALIZED ? 'success' : 'accent'}>
      {t(`accounting.payroll.month.status.${status}`)}
    </StatusPill>
  );
}

/**
 * Excel and print → PDF; while the month is pending, "Return to HR" (with a reason) and
 * "Finalize" — each only for someone holding its permission (the API decides: 409 once finalized).
 */
function MonthActions({
  month,
  basePath,
  onFinalized,
}: {
  month: AccountingPayrollMonth;
  basePath: string;
  onFinalized: (month: AccountingPayrollMonth) => void;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const can = useCan();
  const [exporting, setExporting] = useState(false);
  const [returning, setReturning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const pending = month.status === AccountingPayrollStatus.PENDING;
  const monthLabel = formatMonth(month.month, locale);

  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await callApi(GET_PAYROLL_TAXES_EXCEL(month.month));
      if (res.success && res.data) saveDownloadedFile(res.data);
    } finally {
      setExporting(false);
    }
  }

  async function returnToHr(reason?: string) {
    const res = await callApi(RETURN_PAYROLL_MONTH(month.month, month.hrRunId, { reason: reason ?? '' }), {
      showSuccessToast: true,
      successMessage: t('accounting.payroll.month.return.done', { month: monthLabel }),
    });
    if (res.unauthorized) return false;
    if (!res.success) {
      // Finalized meanwhile (409): show it as it is now.
      router.refresh();
      return true;
    }
    // The month left accounting until HR approves it again: back to the list.
    router.push(basePath);
    router.refresh();
    return true;
  }

  async function finalize() {
    const res = await callApi(FINALIZE_PAYROLL_MONTH(month.month, month.hrRunId), {
      showSuccessToast: true,
      successMessage: t('accounting.payroll.month.finalize.done', { month: monthLabel }),
    });
    if (res.unauthorized) return false;
    if (res.success && res.data) onFinalized(res.data);
    else router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pending && can('accounting.payroll.return') ? (
        <Button variant="secondary" className="cursor-pointer" onClick={() => setReturning(true)}>
          <RestoreIcon />
          {t('accounting.payroll.month.actions.returnToHr')}
        </Button>
      ) : null}
      <Button variant="secondary" className="cursor-pointer" loading={exporting} onClick={() => void exportExcel()}>
        <ExcelIcon />
        {t('accounting.payroll.month.actions.excel')}
      </Button>
      <Button variant={pending && can('accounting.payroll.finalize') ? 'secondary' : 'primary'} className="cursor-pointer" onClick={() => window.print()}>
        <PdfIcon />
        {t('accounting.payroll.month.actions.print')}
      </Button>
      {pending && can('accounting.payroll.finalize') ? (
        <Button variant="primary" className="cursor-pointer" onClick={() => setFinalizing(true)}>
          <ApproveIcon />
          {t('accounting.payroll.month.actions.finalize')}
        </Button>
      ) : null}

      <ConfirmDialog
        open={returning}
        onOpenChange={setReturning}
        title={t('accounting.payroll.month.return.title', { month: monthLabel })}
        description={t('accounting.payroll.month.return.body')}
        confirmLabel={t('accounting.payroll.month.return.confirm')}
        tone="destructive"
        requireReason
        reasonLabel={t('accounting.payroll.month.return.reasonLabel')}
        reasonPlaceholder={t('accounting.payroll.month.return.reasonPlaceholder')}
        onConfirm={returnToHr}
      />
      <ConfirmDialog
        open={finalizing}
        onOpenChange={setFinalizing}
        title={t('accounting.payroll.month.finalize.title', { month: monthLabel })}
        description={t('accounting.payroll.month.finalize.body')}
        confirmLabel={t('accounting.payroll.month.finalize.confirm')}
        onConfirm={finalize}
      />
    </div>
  );
}

/** A month's totals as a school's usually read (the tiles' loading shape). */
const TYPICAL = { net: 34_806_498, insuranceAmount: 1_650_000, incomeTax: 2_480_000, martyrTax: 19_000, gross: 38_955_498 };

/** Net, insurance share, taxes, gross — Gross first on phones. Hidden totals: a dash. */
function MonthTiles({ month }: { month: AccountingPayrollMonth | undefined }) {
  const { t, locale } = useTranslation();
  const loading = month === undefined;
  const totals = month?.totals;
  const unit = t('ui.units.currency');
  const sub = (text: string, feature = false) =>
    loading ? <SkeletonProse className={feature ? 'bg-primary-foreground/20' : undefined}>{text}</SkeletonProse> : text;
  const value = (v: number | undefined) => (totals ? formatMoney(v) : null);
  const taxes = totals ?? TYPICAL;
  return (
    <div className="grid grid-cols-1 gap-3 @min-[320px]:grid-cols-2 @min-[520px]:gap-4 @min-[1080px]:grid-cols-4">
      <StatTile
        icon={NetPayIcon}
        tone="info"
        label={t('accounting.payroll.month.tiles.net')}
        unit={unit}
        value={value(totals?.net)}
        placeholder={formatMoney(TYPICAL.net)}
        sub={sub(t('accounting.payroll.month.tiles.netSub'))}
        loading={loading}
      />
      <StatTile
        icon={InsuredIcon}
        tone="primary"
        label={t('accounting.payroll.month.tiles.insurance')}
        unit={unit}
        value={value(totals?.insuranceAmount)}
        placeholder={formatMoney(TYPICAL.insuranceAmount)}
        sub={sub(t('accounting.payroll.month.tiles.insuranceSub'))}
        loading={loading}
      />
      <StatTile
        icon={PayrollTaxesIcon}
        tone="danger"
        label={t('accounting.payroll.month.tiles.taxes')}
        unit={unit}
        value={totals ? formatMoney(taxesOf(totals)) : null}
        placeholder={formatMoney(taxesOf(TYPICAL))}
        sub={sub(
          t('accounting.payroll.month.tiles.taxesSub', {
            incomeTax: formatMoneyText(taxes.incomeTax, locale, unit),
            martyrTax: formatMoneyText(taxes.martyrTax, locale, unit),
          }),
        )}
        loading={loading}
      />
      <StatTile
        icon={GrossIcon}
        tone="feature"
        className="order-first @min-[1080px]:order-none"
        label={t('accounting.payroll.month.tiles.gross')}
        unit={unit}
        value={value(totals?.gross)}
        placeholder={formatMoney(TYPICAL.gross)}
        sub={sub(t('accounting.payroll.month.tiles.grossSub'), true)}
        loading={loading}
      />
    </div>
  );
}

/** A deduction: red when it costs something, muted at 0 (as on HR's run page). */
function DeductionAmount({ value }: { value: number | undefined }) {
  return (
    <Money
      value={value}
      currency={false}
      className={cn((value ?? 0) > 0 ? 'font-semibold text-destructive-ink' : 'text-muted-foreground')}
    />
  );
}

/** Additions − deductions with its sign, muted at 0 (as on HR's run page). */
function SignedAmount({ value }: { value: number | undefined }) {
  if (value === undefined) return <Money value={undefined} currency={false} />;
  return (
    <span
      dir="ltr"
      className={cn(
        'tabular whitespace-nowrap',
        value > 0 && 'font-semibold text-success-ink',
        value < 0 && 'font-semibold text-destructive-ink',
        value === 0 && 'text-muted-foreground',
      )}
    >
      {value > 0 ? '+' : ''}
      <Money value={value} currency={false} />
    </span>
  );
}

function monthColumns(t: Translate, locale: Locale): DataTableColumn<AccountingPayrollLine>[] {
  const header = (id: string) => t(`accounting.payroll.month.columns.${id}`);
  const seen = (line: AccountingPayrollLine, v: number | undefined) => (line.salaryVisible ? v : undefined);
  const col = (
    id: string,
    cell: (line: AccountingPayrollLine) => ReactNode,
    extra: Partial<DataTableColumn<AccountingPayrollLine>> = {},
  ): DataTableColumn<AccountingPayrollLine> => ({ id, header: header(id), align: 'end', className: 'w-28', cell, ...extra });
  return [
    {
      id: 'employee',
      header: header('employee'),
      card: 'title',
      className: 'min-w-44 whitespace-normal',
      skeleton: (
        <span className="flex flex-col">
          <SkeletonText className="font-bold" width="w-32" />
          <SkeletonText className="text-xs" width="w-24" />
        </span>
      ),
      cell: (line) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <EmployeeLink
            employeeId={line.employeeId}
            name={localName(line, locale)}
            code={line.employeeCode}
            detail={line.hr ? (locale === 'ar' ? line.hr.departmentNameAr : line.hr.departmentNameEn) : undefined}
            className="font-bold"
          />
          {!line.salaryVisible ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LockedIcon className="size-3.5" />
              {t('accounting.payroll.month.salaryHidden')}
            </span>
          ) : null}
        </span>
      ),
    },
    col('monthSalary', (line) => <Money value={seen(line, line.hr?.monthSalary)} currency={false} />),
    col('penalties', (line) => <DeductionAmount value={seen(line, line.hr?.penaltyAmount)} />),
    col('lateness', (line) => <DeductionAmount value={seen(line, line.hr?.latenessAmount)} />),
    col('adjustments', (line) => <SignedAmount value={seen(line, adjustmentNet(line))} />),
    col('net', (line) => <Money value={seen(line, line.net)} currency={false} className="font-bold" />, { className: 'w-32' }),
    col('insuranceAmount', (line) => <Money value={seen(line, line.insuranceAmount)} currency={false} />),
    col('incomeTax', (line) => <Money value={seen(line, line.incomeTax)} currency={false} />),
    col('martyrTax', (line) => <Money value={seen(line, line.martyrTax)} currency={false} />),
    col(
      'gross',
      (line) => <Money value={seen(line, line.gross)} currency={false} className="font-extrabold text-primary" />,
      { className: 'w-32', card: 'highlight' },
    ),
  ];
}
