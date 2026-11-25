'use client';

import { useCan } from '@/core/auth';
import {
  ErrorCode,
  latenessDays,
  type LatenessRule,
  type LatenessRow,
  type LatenessTotals,
  type Month,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { EmployeeLink } from '@/core/employees';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { ClearFilters, SearchInput } from '@/shared/components/form/filter-controls';
import { MonthStepper } from '@/shared/components/form/month-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Days } from '@/shared/components/ui/figures';
import { GroupedNumberInput } from '@/shared/components/ui/grouped-number-input';
import { BlockedIcon, ErrorIcon, LatenessIcon, RetryIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Skeleton, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount, formatDayCount, formatMonth } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { PUT_LATENESS } from './apis';
import { describeLatenessRule } from './describe-rule';
import { gridState, MINUTES_MAX, viewEntry, type Drafts } from './lateness-entries';
import { latenessHref } from './lateness-month';

const SEARCH_DEBOUNCE_MS = 300;
const NO_TOTALS: LatenessTotals = { employees: 0, minutes: 0, days: 0 };

export interface LatenessBoardProps {
  month: Month;
  /** Latest month that can be picked (this month). */
  maxMonth: Month;
  /**
   * One page of the month, as the API paged and searched it; `null` when it failed to load;
   * `undefined` on first load (the route's skeleton).
   */
  rows: LatenessRow[] | null | undefined;
  /** The rule the list came with; `null` when it is missing; `undefined` on first load. */
  rule: LatenessRule | null | undefined;
  /** The month's payroll is approved: open read-only. */
  locked: boolean;
  /** The URL's search (the API searched with it). */
  search: string;
  /** Employees matching the search (all pages), this page and its size. */
  total: number;
  page: number;
  limit: number;
  /** The month's totals over every employee (the summary line); `null` when not loaded. */
  totals: LatenessTotals | null;
}

/**
 * The month's lateness grid: minutes per active employee, one page at a time as the API pages and
 * searches it (`?search&page` in the URL), days computed live from the shared rule while typing,
 * "Save all" sends only the changed rows — typed on any page or under any search. The summary is
 * the month's totals from the API, moved by the unsaved changes. A locked month (approved payroll)
 * opens read-only; a 409 `PAYROLL_APPROVED` on save turns it read-only too.
 */
export function LatenessBoard({
  month,
  maxMonth,
  rows: serverRows,
  rule: serverRule,
  locked: serverLocked,
  search: urlSearch,
  total,
  page,
  limit,
  totals: serverTotals,
}: LatenessBoardProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();

  // A save's answer (the saved minutes, the month's totals, lock and rule) shows over the page it
  // was saved on until the re-read page arrives — the rule comes with each answer, so the preview
  // always matches the saved days.
  const [saved, setSaved] = useState<{
    on: LatenessRow[] | null | undefined;
    minutes: Record<string, number>;
    totals: LatenessTotals;
    rule: LatenessRule | null;
  } | null>(null);
  const overlay = saved && saved.on === serverRows ? saved : null;
  const rule = overlay ? overlay.rule : serverRule;
  const rows = useMemo(
    () =>
      overlay && serverRows
        ? serverRows.map((r) => {
            const minutes = overlay.minutes[r.employee.id];
            return minutes === undefined ? r : { ...r, minutes, days: rule ? latenessDays(minutes, rule) : r.days };
          })
        : serverRows,
    [overlay, serverRows, rule],
  );
  const totals = overlay?.totals ?? serverTotals ?? NO_TOTALS;
  const loading = rows === undefined;
  const [drafts, setDrafts] = useState<Drafts>({});
  const [search, setSearch] = useState(urlSearch);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  // A 409 on save locks the month at once; otherwise the month's own lock.
  const [lockedBySave, setLockedBySave] = useState(false);
  const locked = serverLocked || lockedBySave;
  // R6: without `hr.lateness.edit` the month is read-only (no inputs, no Save).
  const canEdit = useCan()('hr.lateness.edit');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingMonth, setPendingMonth] = useState<Month | null>(null);

  const state = useMemo(() => gridState(drafts, totals, rule ?? null), [drafts, totals, rule]);
  const dirty = state.entries.length > 0 || state.invalidCount > 0;
  const monthLabel = formatMonth(month, locale);

  function goTo(next: Month) {
    startNavigation(() => router.push(`?month=${next}`, { scroll: false }));
  }

  /** The search and the page live in the URL; the API answers with the page. Typed minutes stay. */
  function goSearch(next: { search?: string; page?: number }) {
    startNavigation(() => router.push(latenessHref(month, next), { scroll: false }));
  }

  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      goSearch({ search: text.trim() || undefined });
    }, SEARCH_DEBOUNCE_MS);
  }

  function requestMonth(next: Month) {
    if (dirty && !locked) setPendingMonth(next);
    else goTo(next);
  }

  function retry() {
    startRetry(() => router.refresh());
  }

  async function saveAll() {
    if (savingRef.current || locked || state.invalidCount > 0 || state.entries.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await callApi(PUT_LATENESS(month, { entries: state.entries }), {
        showSuccessToast: true,
        successMessage: t('lateness.saved'),
      });
      // A 401 is handled by callApi (sign-in redirect); check it before `success`.
      if (res.unauthorized) return;
      if (res.success) {
        const sent = Object.fromEntries(state.entries.map((e) => [e.employeeId, e.minutes]));
        if (res.data && res.data.totals) {
          const answer = res.data;
          setSaved({ on: serverRows, minutes: sent, totals: answer.totals, rule: answer.rule ?? rule ?? null });
          if (answer.locked) setLockedBySave(true);
        }
        setDrafts({});
        // Re-read this page (and its totals) from the API.
        startNavigation(() => router.refresh());
      } else if (res.status === 409 && res.error === ErrorCode.PAYROLL_APPROVED) {
        setLockedBySave(true);
        setDrafts({});
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const columns: DataTableColumn<LatenessRow>[] = [
    {
      id: 'code',
      header: t('lateness.columns.code'),
      className: 'w-28',
      card: 'hidden',
      skeleton: <SkeletonText width="w-16" />,
      cell: (row) => <bdi className="tabular text-muted-foreground">{row.employee.code}</bdi>,
    },
    {
      id: 'employee',
      header: t('lateness.columns.employee'),
      className: 'min-w-48 whitespace-normal',
      card: 'title',
      skeleton: (
        <span className="flex min-w-0 flex-col">
          <SkeletonText className="font-bold" width="w-32" />
          <SkeletonText className="text-xs @min-[740px]:hidden" width="w-16" />
        </span>
      ),
      cell: (row) => (
        <span className="flex min-w-0 flex-col items-start">
          <EmployeeLink employeeId={row.employee.id} name={nameIn(row.employee, locale)} className="font-bold" />
          <bdi className="tabular text-xs text-muted-foreground @min-[740px]:hidden">{row.employee.code}</bdi>
        </span>
      ),
    },
    {
      id: 'department',
      header: t('lateness.columns.department'),
      className: 'min-w-36 whitespace-normal',
      cell: (row) => nameIn(row.department, locale),
    },
    {
      id: 'minutes',
      header: t('lateness.columns.minutes'),
      className: 'w-44',
      skeleton: <Skeleton className="h-10 w-28 rounded-lg" />,
      cell: (row) => (
        <MinutesInput
          row={row}
          draft={drafts[row.employee.id]?.text}
          readOnly={locked || !canEdit}
          onChange={(text) => setDrafts((prev) => ({ ...prev, [row.employee.id]: { text, row: prev[row.employee.id]?.row ?? row } }))}
        />
      ),
    },
    {
      id: 'days',
      header: t('lateness.columns.days'),
      align: 'end',
      className: 'w-32',
      // One figure with its unit, laid out invisibly in the figure's own face: in Arabic its line box
      // is 2px taller than a plain text bar's, which a phone card shows.
      skeleton: (
        <SkeletonProse>
          <Days value={1} />
        </SkeletonProse>
      ),
      cell: (row) => {
        const view = viewEntry(row, drafts[row.employee.id]?.text, rule ?? null);
        return (
          <span data-testid={`days-${row.employee.id}`} aria-live="polite">
            {view.days === null ? '—' : <Days value={view.days} />}
          </span>
        );
      },
    },
  ];

  const searching = urlSearch.trim().length > 0 || search.trim().length > 0;
  /** Search and page in one URL update; typed minutes stay in memory. */
  function clearSearch() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setSearch('');
    goSearch({});
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t('lateness.title')}
        description={t('lateness.description')}
        status={
          locked ? (
            <StatusPill tone="danger" icon={BlockedIcon}>
              {t('lateness.locked.title')}
            </StatusPill>
          ) : null
        }
        actions={
          <>
            <MonthStepper
              month={month}
              max={maxMonth}
              onChange={requestMonth}
              disabled={navigating || saving || loading}
              label={t('lateness.month')}
            />
            {locked || !canEdit ? null : (
              <Button
                variant="primary"
                className="cursor-pointer"
                loading={saving}
                disabled={state.invalidCount > 0 || state.entries.length === 0 || navigating || !rows}
                onClick={() => void saveAll()}
              >
                {state.entries.length > 0
                  ? t('lateness.saveCount', { count: formatCount(state.entries.length) })
                  : t('lateness.save')}
              </Button>
            )}
          </>
        }
      />

      {locked ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-destructive-soft px-4 py-3.5 text-destructive-ink">
          <BlockedIcon className="mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <p className="font-bold">{t('lateness.locked.title')}</p>
            <p className="text-sm">{t('lateness.locked.body', { month: monthLabel })}</p>
          </div>
        </div>
      ) : null}

      {rule === null && rows ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-warning-ink">
          <ErrorIcon className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">{t('lateness.settingsError')}</p>
          <Button size="sm" className="cursor-pointer" onClick={retry} loading={retrying}>
            {retrying ? null : <RetryIcon />}
            {t('ui.states.retry')}
          </Button>
        </div>
      ) : null}

      <DataTable
        label={t('lateness.tableLabel', { month: monthLabel })}
        columns={columns}
        rows={rows ?? undefined}
        loading={loading}
        getRowId={(row) => row.employee.id}
        error={rows === null}
        onRetry={retry}
        retrying={retrying}
        refreshing={navigating}
        rowTone={(row) => (viewEntry(row, drafts[row.employee.id]?.text, rule ?? null).invalid ? 'danger' : undefined)}
        empty={
          searching ? (
            <EmptyState
              icon={SearchIcon}
              title={t('lateness.noResults.title')}
              description={t('lateness.noResults.body')}
              action={<ClearFilters placement="empty" count={1} onClear={clearSearch} />}
            />
          ) : (
            <EmptyState icon={LatenessIcon} title={t('lateness.empty.title')} description={t('lateness.empty.body')} />
          )
        }
        toolbar={
          rows === null ? null : (
            <>
              <SearchInput
                wrapperClassName="w-full max-w-sm basis-56"
                aria-label={t('lateness.search.label')}
                placeholder={t('lateness.search.placeholder')}
                value={search}
                disabled={loading}
                loading={navigating}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              <ClearFilters count={searching ? 1 : 0} onClear={clearSearch} disabled={loading} />
              {rows ? (
                <p data-testid="lateness-summary" className="ms-auto text-sm font-semibold text-muted-foreground">
                  {t('lateness.summary', {
                    // Each count agrees with its own noun (Arabic plural forms).
                    employees: t('lateness.summaryEmployees', { count: formatCount(totals.employees) }),
                    minutes: t('lateness.summaryMinutes', { count: formatCount(state.totalMinutes) }),
                    days: state.totalDays === null ? '—' : formatDayCount(state.totalDays, locale),
                  })}
                </p>
              ) : (
                <SkeletonText className="ms-auto text-sm" width="w-56" />
              )}
              {rule ? <p className="w-full text-xs text-muted-foreground">{t('lateness.rule', { rule: describeLatenessRule(rule, t, locale) })}</p> : null}
              {rule === undefined ? (
                // The rule sentence: one line on a wide table, two on a phone.
                <span className="flex w-full flex-col text-xs">
                  <SkeletonText width="w-96" />
                  <SkeletonText className="@min-[600px]:hidden" width="w-40" />
                </span>
              ) : null}
            </>
          )
        }
        pagination={
          rows === null
            ? undefined
            : {
                page,
                limit,
                total,
                onPageChange: (next) => goSearch({ search: urlSearch || undefined, page: next }),
              }
        }
      />

      <ConfirmDialog
        open={pendingMonth !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMonth(null);
        }}
        title={t('lateness.discard.title')}
        description={t('lateness.discard.body', {
          count: formatCount(state.entries.length + state.invalidCount),
          month: monthLabel,
        })}
        confirmLabel={t('lateness.discard.confirm')}
        tone="destructive"
        onConfirm={() => {
          if (pendingMonth) goTo(pendingMonth);
          setPendingMonth(null);
        }}
      />
    </div>
  );
}

function MinutesInput({
  row,
  draft,
  readOnly,
  onChange,
}: {
  row: LatenessRow;
  draft: string | undefined;
  readOnly: boolean;
  onChange: (text: string) => void;
}) {
  const { t, locale } = useTranslation();
  const view = viewEntry(row, draft, null);
  const errorId = useId();
  const errorText = t('lateness.invalidMinutes', { max: formatCount(MINUTES_MAX) });
  // The error stays beside the input (an icon that opens the message), so an invalid row keeps
  // the height of the others and the Days column stays in line.
  return (
    <div className="flex items-center gap-2">
      <GroupedNumberInput
        aria-label={t('lateness.minutesLabel', { name: nameIn(row.employee, locale) })}
        aria-invalid={view.invalid || undefined}
        aria-describedby={view.invalid ? errorId : undefined}
        placeholder={t('lateness.minutesPlaceholder')}
        value={draft ?? formatCount(row.minutes)}
        readOnly={readOnly}
        disabled={readOnly}
        onValueChange={onChange}
        className="h-10 w-28 text-end rtl:text-end"
      />
      {view.invalid ? (
        <>
          <span id={errorId} className="sr-only">
            {errorText}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={errorText}
                aria-label={errorText}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-destructive-ink transition-colors duration-150 hover:bg-destructive-soft"
              >
                <ErrorIcon className="size-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="max-w-60 text-xs text-destructive-ink" data-minutes-error="">
              {errorText}
            </PopoverContent>
          </Popover>
        </>
      ) : view.changed ? (
        <span className="size-2 shrink-0 rounded-full bg-accent" title={t('lateness.changed')}>
          <span className="sr-only">{t('lateness.changed')}</span>
        </span>
      ) : null}
    </div>
  );
}
