'use client';

import { ErrorCode, type LatenessRule, type LatenessRow, type Month } from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { callApi } from '@/lib/callApi';
import { DataTable, type DataTableColumn } from '@/shared/components/data-table/data-table';
import { SearchInput } from '@/shared/components/form/filter-controls';
import { MonthStepper } from '@/shared/components/form/month-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import { Days } from '@/shared/components/ui/figures';
import { BlockedIcon, ErrorIcon, LatenessIcon, RetryIcon, SearchIcon } from '@/shared/components/ui/icons';
import { Input } from '@/shared/components/ui/input';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount, formatDays, formatMonth } from '@/shared/lib/format';
import { nameIn } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { PUT_LATENESS } from './apis';
import { describeLatenessRule } from './describe-rule';
import { gridState, matchesSearch, MINUTES_MAX, viewEntry, type Drafts } from './lateness-entries';

const PAGE_SIZES = [20, 50, 100];

export interface LatenessBoardProps {
  month: Month;
  /** Latest month that can be picked (this month). */
  maxMonth: Month;
  /** `null` when the list failed to load. */
  rows: LatenessRow[] | null;
  /** `null` when the HR settings failed to load. */
  rule: LatenessRule | null;
  /** The month's payroll is approved: open read-only. */
  locked: boolean;
}

/**
 * The month's lateness grid: minutes per active employee, days computed live from the shared rule
 * while typing, "Save all" sends only the changed rows. A locked month (approved payroll) opens
 * read-only; a 409 `PAYROLL_APPROVED` on save turns it read-only too.
 */
export function LatenessBoard({ month, maxMonth, rows: initialRows, rule, locked: initialLocked }: LatenessBoardProps) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [retrying, startRetry] = useTransition();

  const [rows, setRows] = useState<LatenessRow[] | null>(initialRows);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZES[0] ?? 20);
  const [locked, setLocked] = useState(initialLocked);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingMonth, setPendingMonth] = useState<Month | null>(null);

  const state = useMemo(() => gridState(rows ?? [], drafts, rule), [rows, drafts, rule]);
  const filtered = useMemo(() => (rows ?? []).filter((row) => matchesSearch(row, search)), [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * limit, currentPage * limit);
  const dirty = state.entries.length > 0 || state.invalidCount > 0;
  const monthLabel = formatMonth(month, locale);

  function goTo(next: Month) {
    startNavigation(() => router.push(`?month=${next}`, { scroll: false }));
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
        if (res.data && Array.isArray(res.data.rows)) {
          setRows(res.data.rows);
          setLocked(res.data.locked);
        }
        setDrafts({});
      } else if (res.status === 409 && res.error === ErrorCode.PAYROLL_APPROVED) {
        setLocked(true);
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
      cell: (row) => <bdi className="tabular text-muted-foreground">{row.employee.code}</bdi>,
    },
    {
      id: 'employee',
      header: t('lateness.columns.employee'),
      className: 'min-w-48 whitespace-normal',
      card: 'title',
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-bold break-words">{nameIn(row.employee, locale)}</span>
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
      cell: (row) => (
        <MinutesInput
          row={row}
          draft={drafts[row.employee.id]}
          readOnly={locked}
          onChange={(text) => setDrafts((prev) => ({ ...prev, [row.employee.id]: text }))}
        />
      ),
    },
    {
      id: 'days',
      header: t('lateness.columns.days'),
      align: 'end',
      className: 'w-32',
      cell: (row) => {
        const view = viewEntry(row, drafts[row.employee.id], rule);
        return (
          <span data-testid={`days-${row.employee.id}`} aria-live="polite">
            {view.days === null ? '—' : <Days value={view.days} />}
          </span>
        );
      },
    },
  ];

  const searching = search.trim().length > 0;

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
              disabled={navigating || saving}
              label={t('lateness.month')}
            />
            {locked ? null : (
              <Button
                variant="primary"
                className="cursor-pointer"
                loading={saving}
                disabled={state.invalidCount > 0 || state.entries.length === 0 || navigating || rows === null}
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

      {rule === null && rows !== null ? (
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
        rows={rows === null ? undefined : pageRows}
        getRowId={(row) => row.employee.id}
        error={rows === null}
        onRetry={retry}
        retrying={retrying}
        refreshing={navigating}
        rowTone={(row) => (viewEntry(row, drafts[row.employee.id], rule).invalid ? 'danger' : undefined)}
        empty={
          searching ? (
            <EmptyState icon={SearchIcon} title={t('lateness.noResults.title')} description={t('lateness.noResults.body')} />
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <p data-testid="lateness-summary" className="ms-auto text-sm font-semibold text-muted-foreground">
                {t('lateness.summary', {
                  employees: formatCount(rows.length),
                  minutes: formatCount(state.totalMinutes),
                  days: state.totalDays === null ? '—' : formatDays(state.totalDays),
                })}
              </p>
              {rule ? <p className="w-full text-xs text-muted-foreground">{t('lateness.rule', { rule: describeLatenessRule(rule, t) })}</p> : null}
            </>
          )
        }
        pagination={
          rows === null
            ? undefined
            : {
                page: currentPage,
                limit,
                total: filtered.length,
                onPageChange: setPage,
                onLimitChange: (next) => {
                  setLimit(next);
                  setPage(1);
                },
                limitOptions: PAGE_SIZES,
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
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={t('lateness.minutesLabel', { name: nameIn(row.employee, locale) })}
          aria-invalid={view.invalid || undefined}
          aria-describedby={view.invalid ? errorId : undefined}
          placeholder={t('lateness.minutesPlaceholder')}
          value={draft ?? String(row.minutes)}
          readOnly={readOnly}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-10 w-28 text-end"
          dir="ltr"
        />
        {view.changed ? (
          <span className="size-2 shrink-0 rounded-full bg-accent" title={t('lateness.changed')}>
            <span className="sr-only">{t('lateness.changed')}</span>
          </span>
        ) : null}
      </div>
      {view.invalid ? (
        <p id={errorId} className="text-xs whitespace-normal text-destructive-ink">
          {t('lateness.invalidMinutes', { max: formatCount(MINUTES_MAX) })}
        </p>
      ) : null}
    </div>
  );
}
