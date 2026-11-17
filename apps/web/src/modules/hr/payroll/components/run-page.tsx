'use client';

import {
  AdjustmentType,
  PAGINATION,
  PayrollFlag,
  PayrollStatus,
  PenaltyStatus,
  type Department,
  type HrSettings,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunQuery,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { callApi } from '@/lib/callApi';
import { RowActions, RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { FilterSelect, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Money } from '@/shared/components/ui/figures';
import {
  AdjustIcon,
  ApproveIcon,
  BlockedIcon,
  CloseIcon,
  DeductionsIcon,
  EmployeesIcon,
  ExportIcon,
  GrossIcon,
  NetPayIcon,
  PayrollIcon,
  PayslipIcon,
  PendingIcon,
  RecalculateIcon,
  SearchIcon,
} from '@/shared/components/ui/icons';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatTile, StatTileSubSkeleton } from '@/shared/components/ui/stat-tile';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { Switch } from '@/shared/components/ui/switch';
import { apiErrorText } from '@/shared/lib/api-error';
import { saveDownloadedFile } from '@/shared/lib/download';
import { formatCount, formatDate, formatMoney, formatMonth } from '@/shared/lib/format';
import { localName, nameIn } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { APPROVE_PAYROLL_RUN, GET_BANK_SHEET, RECALCULATE_PAYROLL_RUN } from '../apis';
import { adjustmentNet, adjustmentsOf, hasRunFilters, notAppliedAdjustments, runQueryString } from '../lib/run-query';
import { AdjustmentsDialog, type AdjustmentsTarget } from './adjustments-dialog';
import { DeductionAmount, LineStatus, RunStatusPill, SignedAmount } from './payroll-bits';
import { RulesPanel } from './rules-panel';

const SEARCH_DEBOUNCE_MS = 300;

export interface RunPageProps {
  /** `/ar/payroll`. */
  basePath: string;
  /** `/ar/settings` — the rules panel links there. */
  settingsHref: string;
  /** `/ar/penalties` — the pending-penalties notice links to this month's pending ones. */
  penaltiesHref: string;
  run: PayrollRun;
  departments: Department[];
  settings: HrSettings | null;
  query: PayrollRunQuery;
}

/**
 * One month's run (as the mockup): status, Recalculate / Export bank sheet / Approve, four tiles,
 * the employees table (cards on narrow containers) filtered by the API, and the rules panel.
 * A draft is editable; an approved run is read-only with the bank sheet and payslips.
 * Approve is never blocked by client logic: the server decides (409 `PENDING_PENALTIES`).
 */
export function RunPage({
  basePath,
  settingsHref,
  penaltiesHref,
  run: initialRun,
  departments,
  settings,
  query,
}: RunPageProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();

  // Server data, replaced by each mutation's response until the next server render brings new props.
  const [run, setRun] = useState(initialRun);
  const [prevRun, setPrevRun] = useState(initialRun);
  if (prevRun !== initialRun) {
    setPrevRun(initialRun);
    setRun(initialRun);
  }

  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const [page, setPage] = useState(1);
  const limit = PAGINATION.defaultLimit;

  const [recalculating, setRecalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustmentsTarget | null>(null);
  const busyRef = useRef(false);

  const draft = run.status === PayrollStatus.DRAFT;
  const monthLabel = formatMonth(run.month, locale);
  const filtered = hasRunFilters(query);
  const notApplied = useMemo(() => notAppliedAdjustments(run.adjustments), [run.adjustments]);
  // The live count comes from the server; the lines' flags only reflect the last calculation.
  const staleFlags = useMemo(
    () => run.lines.some((line) => line.flags.includes(PayrollFlag.PENDING_PENALTIES)),
    [run.lines],
  );
  const pendingNotice = !draft || approveError ? null : run.pendingPenalties > 0 ? 'pending' : staleFlags ? 'stale' : null;
  const pendingTitleId = useId();

  const pageCount = Math.max(1, Math.ceil(run.lines.length / limit));
  const currentPage = Math.min(page, pageCount);
  const pageLines = run.lines.slice((currentPage - 1) * limit, currentPage * limit);

  // ── Filters live in the URL; the API filters the lines ────────────────────
  function go(next: PayrollRunQuery) {
    setPage(1);
    startNavigation(() =>
      router.push(`${basePath}/${run.id}${runQueryString(next)}`, {
        scroll: false,
      }),
    );
  }
  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => go({ ...query, search: text.trim() || undefined }), SEARCH_DEBOUNCE_MS);
  }
  function clearFilters() {
    setSearch('');
    go({});
  }

  /** A mutation returned the whole (unfiltered) run: show it, then refetch the filtered lines. */
  function applyRun(next: PayrollRun) {
    if (filtered) {
      setRun({ ...next, lines: run.lines });
      startNavigation(() => router.refresh());
    } else {
      setRun(next);
    }
  }

  async function recalculate() {
    if (busyRef.current) return;
    busyRef.current = true;
    setRecalculating(true);
    try {
      const res = await callApi(RECALCULATE_PAYROLL_RUN(run.id), {
        showSuccessToast: true,
        successMessage: t('payroll.actions.recalculated'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) applyRun(res.data);
      else if (res.success === false && res.status === 409) startNavigation(() => router.refresh());
    } finally {
      busyRef.current = false;
      setRecalculating(false);
    }
  }

  async function approve() {
    if (busyRef.current) return;
    busyRef.current = true;
    setApproveError(null);
    try {
      // The server's message is shown on the page (e.g. 409 PENDING_PENALTIES), not as a toast.
      const res = await callApi(APPROVE_PAYROLL_RUN(run.id), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('payroll.actions.approved'),
      });
      if (res.unauthorized) return;
      if (res.success && res.data) applyRun(res.data);
      else if (res.success === false) setApproveError(apiErrorText(res, { t, has }));
    } finally {
      busyRef.current = false;
    }
  }

  async function exportBankSheet() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await callApi(GET_BANK_SHEET(run.id));
      if (res.success && res.data) saveDownloadedFile(res.data);
    } finally {
      setExporting(false);
    }
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  const columns: DataTableColumn<PayrollLine>[] = [
    {
      ...runColumn('employee', t),
      cell: (line) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-bold break-words">{localName(line, locale)}</span>
          <span className="text-muted-foreground text-xs">
            <bdi dir="ltr" className="tabular">
              {line.employeeCode}
            </bdi>
            <span aria-hidden="true"> · </span>
            {locale === 'ar' ? line.departmentNameAr : line.departmentNameEn}
          </span>
        </span>
      ),
    },
    {
      ...runColumn('monthSalary', t),
      cell: (line) => <Money value={line.monthSalary} currency={false} />,
    },
    {
      ...runColumn('penalties', t),
      cell: (line) => <DeductionAmount value={line.penaltyAmount} />,
    },
    {
      ...runColumn('lateness', t),
      cell: (line) => <DeductionAmount value={line.latenessAmount} />,
    },
    {
      ...runColumn('adjustments', t),
      cell: (line) => <SignedAmount value={adjustmentNet(line)} />,
    },
    {
      ...runColumn('net', t),
      cell: (line) => <Money value={line.net} currency={false} className="font-extrabold" />,
    },
    {
      ...runColumn('status', t),
      cell: (line) => <LineStatus flags={line.flags} />,
    },
    {
      ...runColumn('actions', t),
      cell: (line) => {
        const name = localName(line, locale);
        const count = adjustmentsOf(run.adjustments, line.employeeId).length;
        return (
          <RowActions
            label={t('ui.table.actionsFor', { name })}
            actions={[
              // Draft: adjust. Approved: recorded adjustments stay viewable; with none, nothing to show.
              {
                id: 'adjust',
                label: draft ? t('payroll.table.adjust') : t('payroll.table.columns.adjustments'),
                icon: AdjustIcon,
                count,
                hidden: !draft && count === 0,
                onSelect: () => setAdjusting({ employeeId: line.employeeId, name }),
              },
              {
                id: 'payslip',
                label: t('payroll.table.payslip'),
                icon: PayslipIcon,
                hidden: draft,
                href: `${basePath}/${run.id}/payslip/${line.id}`,
              },
            ]}
          />
        );
      },
    },
  ];

  const totals = run.totals;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('payroll.runTitle', { month: monthLabel })}
        status={<RunStatusPill status={run.status} />}
        description={
          draft
            ? t('payroll.runDescription')
            : t('payroll.runDescriptionApproved', {
                date: run.approvedAt ? formatDate(run.approvedAt.slice(0, 10), locale) : '',
              })
        }
        breadcrumbs={[{ label: t('payroll.title'), href: basePath }, { label: monthLabel }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={
          <>
            {draft ? (
              <Button className="cursor-pointer" loading={recalculating} onClick={() => void recalculate()}>
                {recalculating ? null : <RecalculateIcon />}
                {t('payroll.actions.recalculate')}
              </Button>
            ) : null}
            <Button
              className={draft ? 'cursor-not-allowed' : 'cursor-pointer'}
              disabled={draft}
              title={draft ? t('payroll.actions.bankSheetAfterApproval') : undefined}
              loading={exporting}
              onClick={() => void exportBankSheet()}
            >
              {exporting ? null : <ExportIcon />}
              {t('payroll.actions.exportBankSheet')}
            </Button>
            {draft ? (
              <Button variant="primary" className="cursor-pointer" onClick={() => setApproveOpen(true)}>
                <ApproveIcon />
                {t('payroll.actions.approve')}
              </Button>
            ) : null}
          </>
        }
      />

      {pendingNotice === 'pending' ? (
        // Told before Approve is pressed; the button still sends (the server decides, 409).
        <div
          role="note"
          aria-labelledby={pendingTitleId}
          className="bg-warning-soft text-warning-ink flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5"
        >
          <PendingIcon className="mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <p id={pendingTitleId} className="font-bold">
              {t('payroll.approve.pendingTitle')}
            </p>
            <p className="text-sm">{t('payroll.approve.pendingBody', { count: formatCount(run.pendingPenalties) })}</p>
          </div>
          <Button asChild size="sm" variant="secondary" className="cursor-pointer">
            <Link href={`${penaltiesHref}?${new URLSearchParams({ month: run.month, status: PenaltyStatus.PENDING }).toString()}`}>
              {t('payroll.approve.pendingLink')}
            </Link>
          </Button>
        </div>
      ) : null}

      {pendingNotice === 'stale' ? (
        // No penalty is pending any more, but the lines were calculated while some were.
        <div
          role="note"
          aria-labelledby={pendingTitleId}
          className="bg-info-soft text-info-ink flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5"
        >
          <RecalculateIcon className="mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <p id={pendingTitleId} className="font-bold">
              {t('payroll.approve.staleTitle')}
            </p>
            <p className="text-sm">{t('payroll.approve.staleBody')}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="cursor-pointer"
            loading={recalculating}
            onClick={() => void recalculate()}
          >
            {t('payroll.approve.staleAction')}
          </Button>
        </div>
      ) : null}

      {approveError && draft ? (
        <div
          role="alert"
          className="bg-destructive-soft text-destructive-ink flex items-start gap-3 rounded-2xl px-4 py-3.5"
        >
          <BlockedIcon className="mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="font-bold">{t('payroll.approve.failed')}</p>
            <p className="text-sm">{approveError}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="cursor-pointer"
            aria-label={t('ui.dialog.close')}
            onClick={() => setApproveError(null)}
          >
            <CloseIcon />
          </Button>
        </div>
      ) : null}

      <RunTiles totals={totals} />

      {/* Rules panel beside the table only when all eight columns still fit next to it; below it otherwise. */}
      <div className="grid items-start gap-5 @min-[1380px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <DataTable
            label={t('payroll.table.label', { month: monthLabel })}
            columns={columns}
            rows={pageLines}
            getRowId={(line) => line.id}
            refreshing={navigating}
            rowTone={(line) => (line.flags.length > 0 ? 'warning' : undefined)}
            empty={
              filtered ? (
                <EmptyState
                  icon={SearchIcon}
                  title={t('payroll.noResults.title')}
                  description={t('payroll.noResults.body')}
                  action={
                    <Button className="cursor-pointer" onClick={clearFilters}>
                      <CloseIcon />
                      {t('payroll.filters.clear')}
                    </Button>
                  }
                />
              ) : (
                <EmptyState icon={PayrollIcon} title={t('payroll.empty.title')} description={t('payroll.empty.body')} />
              )
            }
            toolbar={
              <RunLinesToolbar
                count={t('payroll.table.count', {
                  shown: formatCount(run.lines.length),
                  total: formatCount(totals.employees),
                })}
                search={search}
                onSearchChange={onSearchChange}
                departments={departments}
                query={query}
                onFilter={go}
              />
            }
            pagination={{
              page: currentPage,
              limit,
              total: run.lines.length,
              onPageChange: setPage,
            }}
          />

          {notApplied.length > 0 ? (
            <section
              aria-labelledby="not-applied-title"
              className="bg-card shadow-card flex flex-col gap-3 rounded-3xl p-5"
            >
              <div className="flex flex-col gap-0.5">
                <h2 id="not-applied-title" className="font-display text-lg font-extrabold">
                  {t('payroll.notApplied.title')}
                </h2>
                <p className="text-muted-foreground text-sm">{t('payroll.notApplied.body')}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {notApplied.map((a) => (
                  <li
                    key={a.id}
                    className="bg-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-3"
                  >
                    <StatusPill tone="neutral">{t('payroll.notApplied.label')}</StatusPill>
                    <span className="text-sm font-semibold">{t(`common.enums.adjustmentType.${a.type}`)}</span>
                    <Money
                      value={a.amount}
                      className={cn(
                        'font-bold',
                        a.type === AdjustmentType.DEDUCTION ? 'text-destructive-ink' : 'text-success-ink',
                      )}
                    />
                    <span className="text-muted-foreground min-w-0 flex-1 basis-48 text-sm break-words">
                      <BidiText>{a.reason}</BidiText>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t('payroll.notApplied.employee', { name: `${nameIn(a, locale)} (${a.employeeCode})` })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <RulesPanel settings={settings} settingsHref={settingsHref} approvedAt={draft ? null : run.approvedAt} />
      </div>

      <AdjustmentsDialog
        runId={run.id}
        month={run.month}
        editable={draft}
        target={adjusting}
        adjustments={adjusting ? adjustmentsOf(run.adjustments, adjusting.employeeId) : []}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
        onRunChange={applyRun}
      />

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={t('payroll.approve.title', { month: monthLabel })}
        description={t('payroll.approve.body')}
        confirmLabel={t('payroll.approve.confirm')}
        onConfirm={approve}
      />
    </div>
  );
}

// ── Pieces shared with the route's skeleton (same markup, so nothing moves on load) ──────────

type RunColumnId = 'employee' | 'monthSalary' | 'penalties' | 'lateness' | 'adjustments' | 'net' | 'status' | 'actions';
type Translate = ReturnType<typeof useTranslation>['t'];

export const RUN_COLUMN_IDS: RunColumnId[] = ['employee', 'monthSalary', 'penalties', 'lateness', 'adjustments', 'net', 'status', 'actions'];

const RUN_COLUMN_LAYOUT: Record<RunColumnId, Omit<DataTableColumn<PayrollLine>, 'id' | 'header' | 'cell'>> = {
  employee: {
    className: 'min-w-44 whitespace-normal',
    card: 'title',
    skeleton: (
      <span className="flex flex-col">
        <SkeletonText className="font-bold" width="w-32" />
        <SkeletonText className="text-xs" width="w-24" />
      </span>
    ),
  },
  monthSalary: { align: 'end', className: 'w-28' },
  penalties: { align: 'end', className: 'w-28' },
  lateness: { align: 'end', className: 'w-28' },
  adjustments: { align: 'end', className: 'w-28' },
  net: { align: 'end', className: 'w-32', card: 'highlight' },
  status: { className: 'w-36', card: 'status', skeleton: <SkeletonPill /> },
  actions: { align: 'end', className: 'w-16', card: 'menu', skeleton: <RowActionsSkeleton /> },
};

/** A line column's id, header and layout (the cell is the caller's). */
export function runColumn(id: RunColumnId, t: Translate) {
  const label = t(`payroll.table.columns.${id}`);
  return {
    id,
    ...RUN_COLUMN_LAYOUT[id],
    ...(id === 'actions' ? { header: <span className="sr-only">{label}</span>, cardLabel: label } : { header: label }),
  };
}

/** The four figures (Net first on phones); `undefined` while the run loads. */
export function RunTiles({ totals }: { totals: PayrollRun['totals'] | undefined }) {
  const { t } = useTranslation();
  const money = (value: number) => `${t('ui.units.currency')} ${formatMoney(value)}`;
  const loading = totals === undefined;
  /** The sub line, or bars in its place (one per line the loaded text usually takes). */
  // While loading: as many bars as the text usually takes, more in a half-width phone tile.
  const sub = (text: (x: PayrollRun['totals']) => string, lines: number, narrowLines: number, feature = false) =>
    totals ? text(totals) : <StatTileSubSkeleton lines={lines} narrowLines={narrowLines} feature={feature} />;
  return (
    // Two by two from phone width (Net first), four across on wide screens — like the dashboard.
    <div className="grid grid-cols-1 gap-3 @min-[320px]:grid-cols-2 @min-[520px]:gap-4 @min-[1080px]:grid-cols-4">
      <StatTile
        icon={EmployeesIcon}
        tone="info"
        label={t('payroll.tiles.employees')}
        value={totals ? formatCount(totals.employees) : null}
        sub={sub((x) =>
          t('payroll.tiles.employeesSub', {
            ready: formatCount(x.employees - x.flagged),
            review: formatCount(x.flagged),
          }),
          1,
          3,
        )}
        loading={loading}
      />
      <StatTile
        icon={GrossIcon}
        tone="primary"
        label={t('payroll.tiles.gross')}
        unit={t('ui.units.currency')}
        value={totals ? formatMoney(totals.monthSalary) : null}
        sub={sub(() => t('payroll.tiles.grossSub'), 1, 2)}
        loading={loading}
      />
      <StatTile
        icon={DeductionsIcon}
        tone="danger"
        label={t('payroll.tiles.deductions')}
        unit={t('ui.units.currency')}
        value={totals ? formatMoney(totals.penaltyAmount + totals.latenessAmount + totals.adjustmentDeductions) : null}
        sub={sub(
          (x) =>
            t('payroll.tiles.deductionsSub', {
              penalties: money(x.penaltyAmount),
              lateness: money(x.latenessAmount),
              adjustments: money(x.adjustmentDeductions),
            }),
          2,
          3,
        )}
        loading={loading}
      />
      <StatTile
        icon={NetPayIcon}
        tone="feature"
        className="order-first @min-[1080px]:order-none"
        label={t('payroll.tiles.net')}
        unit={t('ui.units.currency')}
        value={totals ? formatMoney(totals.net) : null}
        sub={sub((x) => t('payroll.tiles.netSub', { additions: money(x.adjustmentAdditions) }), 1, 3, true)}
        loading={loading}
      />
    </div>
  );
}

/** The table's title row and filters. */
export function RunLinesToolbar({
  count,
  search,
  onSearchChange,
  departments,
  query,
  onFilter,
  disabled = false,
}: {
  /** "Showing x of y"; `null` while loading. */
  count: string | null;
  search: string;
  onSearchChange: (text: string) => void;
  departments: Department[];
  query: PayrollRunQuery;
  onFilter: (next: PayrollRunQuery) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  return (
    <>
      <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-extrabold">{t('payroll.table.heading')}</h2>
        {count === null ? (
          <SkeletonText className="text-sm" width="w-32" />
        ) : (
          <p data-testid="lines-count" className="text-muted-foreground text-sm">
            {count}
          </p>
        )}
      </div>
      <div role="search" className="flex w-full flex-wrap items-center gap-2.5">
        <SearchInput
          aria-label={t('payroll.filters.searchLabel')}
          placeholder={t('payroll.filters.searchPlaceholder')}
          value={search}
          disabled={disabled}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <FilterSelect
          label={t('payroll.filters.department')}
          allLabel={t('payroll.filters.allDepartments')}
          value={query.departmentId}
          disabled={disabled}
          options={[...departments]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((d) => ({
              value: d.id,
              label: localName(d, locale),
              keywords: [d.nameEn, d.nameAr],
            }))}
          searchable
          onChange={(departmentId) => onFilter({ ...query, departmentId })}
        />
        <label className="flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm font-semibold">
          <Switch
            checked={Boolean(query.flagged)}
            disabled={disabled}
            onCheckedChange={(on) => onFilter({ ...query, flagged: on || undefined })}
          />
          {t('payroll.filters.needsReview')}
        </label>
      </div>
    </>
  );
}
