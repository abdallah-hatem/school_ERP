'use client';

import {
  AdjustmentType,
  PAGINATION,
  PAYROLL_PAGINATION,
  PayrollStatus,
  type ListItem,
  type PayrollLine,
  type PayrollRun,
  type PayrollRunQuery,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useCan } from '@/core/auth';
import { EmployeeLink } from '@/core/employees';
import { RowActions, RowActionsSkeleton } from '@/shared/components/data-table/row-actions';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { ClearFilters, FilterSelect, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { BidiText } from '@/shared/components/ui/bidi-text';
import { Money } from '@/shared/components/ui/figures';
import {
  AdjustIcon,
  DeductionsIcon,
  EmployeesIcon,
  GrossIcon,
  NetPayIcon,
  PayrollIcon,
  PayslipIcon,
  SearchIcon,
} from '@/shared/components/ui/icons';
import { SkeletonPill, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { SlotText, TEXT_SLOT } from '@/shared/components/ui/slot-text';
import { StatTile } from '@/shared/components/ui/stat-tile';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { Switch } from '@/shared/components/ui/switch';
import { formatCount, formatMoney, formatMoneyText, formatMonth, sumMoney } from '@/shared/lib/format';
import { localName, nameIn } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_DEPARTMENTS } from '../../employees/apis';
import { useListItemOptions } from '../../employees/lib/list-item-options';
import {
  adjustmentNet,
  adjustmentsOf,
  needsOwnLines,
  notAppliedAdjustments,
  runFilterCount,
  runQueryString,
} from '../lib/run-query';
import { AdjustmentsDialog, type AdjustmentsTarget } from './adjustments-dialog';
import { DeductionAmount, LineStatus, SignedAmount } from './payroll-bits';
import { RulesPanel } from './rules-panel';
import { useRunState } from './run-shell';

const SEARCH_DEBOUNCE_MS = 300;

export interface RunLinesProps {
  /** `/ar/payroll`. */
  basePath: string;
  /** `/ar/settings` — the rules panel links there. */
  settingsHref: string;
  /**
   * With search, filters or a page in the URL: the run read with them (its lines are that page of
   * the matching ones), and the server's clock before that read. Without: null — the lines are
   * the layout's run's (page 1).
   */
  filtered: { run: PayrollRun; asOf: number } | null;
  /** The department the filter names; the API searches the others. */
  selectedDepartment?: ListItem | null;
  query: PayrollRunQuery;
}

/**
 * The run's "Employees" tab (as the mockup): four tiles, the employees table (cards on narrow
 * containers) filtered by the API, the adjustments not applied and the rules panel. The run comes
 * from the run layout (`useRunState`); only the filtered lines are this tab's own read. A draft is
 * editable; an approved run is read-only with the payslips.
 */
export function RunLines({ basePath, settingsHref, filtered: filteredRead, selectedDepartment = null, query }: RunLinesProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const { run, lastWrite, applyRun, mutating, whenIdle } = useRunState();

  const filterCount = runFilterCount(query);
  const filtered = filterCount > 0;
  const ownLines = needsOwnLines(query);
  // A write answered after this tab's lines were read: they're re-read for the current URL (the
  // write's answer holds the first page, unfiltered).
  const filteredAsOf = filteredRead?.asOf ?? 0;
  useEffect(() => {
    if (ownLines && filteredRead && lastWrite > filteredAsOf) startNavigation(() => router.refresh());
  }, [ownLines, filteredRead, filteredAsOf, lastWrite, router]);
  // One page of the matching lines, as the API sent it.
  const shownRun = ownLines && filteredRead ? filteredRead.run : run;
  const lines = shownRun.lines;
  const linesPage = shownRun.linesPage;

  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const [adjusting, setAdjusting] = useState<AdjustmentsTarget | null>(null);
  const canAdjust = useCan()('hr.payroll.adjust');

  const draft = run.status === PayrollStatus.DRAFT;
  const monthLabel = formatMonth(run.month, locale);
  const notApplied = useMemo(() => notAppliedAdjustments(run.adjustments), [run.adjustments]);

  // ── Filters and the page live in the URL; the API filters and pages the lines ──
  function go(next: PayrollRunQuery) {
    startNavigation(() =>
      router.push(`${basePath}/${run.id}${runQueryString(next)}`, {
        scroll: false,
      }),
    );
  }
  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      // Never mid-write: a search typed during Recalculate / Approve goes once it answers.
      whenIdle(() => go({ ...query, search: text.trim() || undefined, page: undefined }));
    }, SEARCH_DEBOUNCE_MS);
  }
  /** Search, both filters and the page, in one URL update. */
  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setSearch('');
    go({ limit: query.limit });
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  const columns: DataTableColumn<PayrollLine>[] = [
    {
      ...runColumn('employee', t),
      cell: (line) => (
        <EmployeeLink
          employeeId={line.employeeId}
          name={localName(line, locale)}
          code={line.employeeCode}
          detail={locale === 'ar' ? line.departmentNameAr : line.departmentNameEn}
          className="font-bold"
        />
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
                label: draft && canAdjust ? t('payroll.table.adjust') : t('payroll.table.columns.adjustments'),
                icon: AdjustIcon,
                count,
                // R6: adjusting needs `hr.payroll.adjust`; without it a draft's adjustments are only viewable.
                hidden: (!draft || !canAdjust) && count === 0,
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
    <>
      <RunTiles totals={totals} />

      {/* Rules panel beside the table only when all eight columns still fit next to it; below it otherwise. */}
      <div className="grid items-start gap-5 @min-[1380px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <DataTable
            label={t('payroll.table.label', { month: monthLabel })}
            columns={columns}
            rows={lines}
            getRowId={(line) => line.id}
            refreshing={navigating}
            rowTone={(line) => (line.flags.length > 0 ? 'warning' : undefined)}
            cardsBelow={RUN_LINES_CARDS_BELOW}
            empty={
              filtered ? (
                <EmptyState
                  icon={SearchIcon}
                  title={t('payroll.noResults.title')}
                  description={t('payroll.noResults.body')}
                  action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} disabled={mutating} />}
                />
              ) : (
                <EmptyState icon={PayrollIcon} title={t('payroll.empty.title')} description={t('payroll.empty.body')} />
              )
            }
            toolbar={
              <RunLinesToolbar
                count={t('payroll.table.count', {
                  shown: formatCount(linesPage.total),
                  total: formatCount(totals.employees),
                })}
                search={search}
                onSearchChange={onSearchChange}
                selectedDepartment={selectedDepartment}
                query={query}
                onFilter={(next) => go({ ...next, page: undefined })}
                onClear={clearFilters}
                busy={navigating}
                disabled={mutating}
              />
            }
            pagination={{
              page: linesPage.page,
              limit: linesPage.limit,
              total: linesPage.total,
              onPageChange: (page) => go({ ...query, page: page === PAGINATION.defaultPage ? undefined : page }),
              pageSizes: PAYROLL_PAGINATION.pageSizes,
              onLimitChange: (next) => go({ ...query, page: undefined, limit: next === PAGINATION.defaultLimit ? undefined : next }),
            }}
            scrollHeight="screen"
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
                      <SlotText
                        text={t('payroll.notApplied.employee', { name: TEXT_SLOT })}
                        slot={<EmployeeLink employeeId={a.employeeId} name={`${nameIn(a, locale)} (${a.employeeCode})`} />}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <RulesPanel rules={run.rules ?? null} settingsHref={settingsHref} approvedAt={draft ? null : run.approvedAt} />
      </div>

      <AdjustmentsDialog
        runId={run.id}
        month={run.month}
        editable={draft && canAdjust}
        readOnlyReason={draft ? 'permission' : 'approved'}
        target={adjusting}
        adjustments={adjusting ? adjustmentsOf(run.adjustments, adjusting.employeeId) : []}
        onOpenChange={(open) => {
          if (!open) setAdjusting(null);
        }}
        onRunChange={applyRun}
      />
    </>
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

/**
 * The lines' columns need ~900px once a line holds eight-digit amounts (EGP 21,474,836.47, the
 * largest salary allowed): narrower, the table scrolled sideways and squeezed the name to one word
 * a line. Below it the lines are cards. The skeleton passes the same value.
 */
export const RUN_LINES_CARDS_BELOW = 900;

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
/** A month's totals as a school's usually read (the tiles' loading shape). */
const TYPICAL_TOTALS: PayrollRun['totals'] = {
  employees: 40,
  flagged: 2,
  monthSalary: 35_158_000,
  penaltyAmount: 128_000,
  latenessAmount: 268_502,
  adjustmentAdditions: 75_000,
  adjustmentDeductions: 30_000,
  net: 34_806_498,
};

export function RunTiles({ totals }: { totals: PayrollRun['totals'] | undefined }) {
  const { t, locale } = useTranslation();
  const money = (value: number | undefined) => formatMoneyText(value, locale, t('ui.units.currency'));
  const loading = totals === undefined;
  // While loading: each sub line is its own sentence worded with typical figures, drawn as bars,
  // so it wraps onto as many lines as the loaded one in every tile width and language.
  const sub = (text: (x: PayrollRun['totals']) => string, feature = false) =>
    totals ? text(totals) : <SkeletonProse className={feature ? 'bg-primary-foreground/20' : undefined}>{text(TYPICAL_TOTALS)}</SkeletonProse>;
  return (
    // Two by two from phone width (Net first), four across on wide screens — like the dashboard.
    <div data-skeleton-block="tiles" className="grid grid-cols-1 gap-3 @min-[320px]:grid-cols-2 @min-[520px]:gap-4 @min-[1080px]:grid-cols-4">
      <StatTile
        icon={EmployeesIcon}
        tone="info"
        label={t('payroll.tiles.employees')}
        value={totals ? formatCount(totals.employees) : null}
        placeholder={formatCount(TYPICAL_TOTALS.employees)}
        sub={sub((x) =>
          t('payroll.tiles.employeesSub', {
            ready: formatCount(x.employees - x.flagged),
            review: formatCount(x.flagged),
          }),
        )}
        loading={loading}
      />
      <StatTile
        icon={GrossIcon}
        tone="primary"
        label={t('payroll.tiles.gross')}
        unit={t('ui.units.currency')}
        value={totals ? formatMoney(totals.monthSalary) : null}
        placeholder={formatMoney(TYPICAL_TOTALS.monthSalary)}
        sub={sub(() => t('payroll.tiles.grossSub'))}
        loading={loading}
      />
      <StatTile
        icon={DeductionsIcon}
        tone="danger"
        label={t('payroll.tiles.deductions')}
        unit={t('ui.units.currency')}
        value={totals ? formatMoney(sumMoney(totals.penaltyAmount, totals.latenessAmount, totals.adjustmentDeductions)) : null}
        placeholder={formatMoney(sumMoney(TYPICAL_TOTALS.penaltyAmount, TYPICAL_TOTALS.latenessAmount, TYPICAL_TOTALS.adjustmentDeductions))}
        sub={sub(
          (x) =>
            t('payroll.tiles.deductionsSub', {
              penalties: money(x.penaltyAmount),
              lateness: money(x.latenessAmount),
              adjustments: money(x.adjustmentDeductions),
            }),
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
        placeholder={formatMoney(TYPICAL_TOTALS.net)}
        sub={sub((x) => t('payroll.tiles.netSub', { additions: money(x.adjustmentAdditions) }), true)}
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
  selectedDepartment = null,
  query,
  onFilter,
  onClear,
  busy = false,
  disabled = false,
}: {
  /** "Showing x of y"; `null` while loading. */
  count: string | null;
  search: string;
  onSearchChange: (text: string) => void;
  /** The department the filter names (hidden ones too); the API searches the choices. */
  selectedDepartment?: ListItem | null;
  query: PayrollRunQuery;
  onFilter: (next: PayrollRunQuery) => void;
  /** "Clear filters · n": search and both filters at once (absent while loading). */
  onClear?: () => void;
  /** The filtered lines are loading: "Clear filters" waits. */
  busy?: boolean;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  // Hidden departments too: a line keeps the department it had.
  const departmentOptions = useListItemOptions(GET_DEPARTMENTS, locale, { includeHidden: true, selected: selectedDepartment });
  return (
    <>
      <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-extrabold">{t('payroll.table.heading')}</h2>
        {count === null ? (
          // "38 of 38": short, so it stays beside the heading as the loaded count does.
          <SkeletonText className="text-sm" width="w-16" />
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
          loading={busy}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <FilterSelect
          label={t('payroll.filters.department')}
          allLabel={t('payroll.filters.allDepartments')}
          value={query.departmentId}
          disabled={disabled}
          server={departmentOptions}
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
        {onClear ? (
          <ClearFilters count={runFilterCount(query)} onClear={onClear} disabled={disabled || busy} className="ms-auto" />
        ) : null}
      </div>
    </>
  );
}
