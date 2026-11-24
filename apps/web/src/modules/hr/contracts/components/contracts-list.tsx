'use client';

import {
  CONTRACT_DECISIONS,
  ContractDecision,
  contractYearRange,
  formatContractYear,
  PAGINATION,
  renewedContractDates,
  type Contract,
  type ContractDecisionFilter,
  type ContractTotals,
  type ListItem,
  type SchoolCalendarDates,
} from '@school-erp/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useCan } from '@/core/auth';
import { callApi } from '@/lib/callApi';
import { ClearFilters, FilterSelect, SearchInput } from '@/shared/components/form/filter-controls';
import { YearStepper } from '@/shared/components/form/year-stepper';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { ConfirmDialog } from '@/shared/components/ui/confirm-dialog';
import {
  CalendarIcon,
  ContractEndIcon,
  DeactivateIcon,
  EmailIcon,
  PendingIcon,
  ReadyIcon,
  RecalculateIcon,
  SearchIcon,
  SettingsIcon,
} from '@/shared/components/ui/icons';
import { StatTile, StatTileSubSkeleton } from '@/shared/components/ui/stat-tile';
import { formatCount, formatDate } from '@/shared/lib/format';
import { localName } from '@/shared/lib/i18n';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_STAGES } from '../../employees/apis';
import { useListItemOptions } from '../../employees/lib/list-item-options';
import { RENEW_CONTRACTS } from '../apis';
import { abilitiesOf, contractError, refusedRows } from '../lib/contract-text';
import { contractsQueryString, YEAR_MAX, YEAR_MIN, type ContractsListQuery } from '../lib/list-query';
import { ContractsTable, type ContractSelection } from './contracts-table';

const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_SELECTION = new Map<string, Contract>();

/** Typical figures the tiles lay out invisibly while they load (same width as loaded). */
const TYPICAL = { ending: 42, decided: 27, open: 15, notices: 3, toDeactivate: 1 };

export interface ContractsListProps {
  /** `/ar/contracts`. */
  basePath: string;
  /** `/ar/employees`: a row's "Contract history" opens `<employeesPath>/<id>/contracts`. */
  employeesPath: string;
  query: ContractsListQuery;
  /** The contract year holding the school's today: the default year. */
  currentYear: number;
  /** The school's today (`YYYY-MM-DD`, Cairo). */
  today: string;
  /** `undefined` on first load (the route's skeleton): skeleton tiles and rows, controls disabled. */
  rows: Contract[] | undefined;
  total: number;
  totals?: ContractTotals;
  /** The year's school calendar; null: not set (the banner). Undefined while loading. */
  calendar?: SchoolCalendarDates | null;
  error?: boolean;
  /** The stage filter's chosen stage (its name shows before the picker's first answer). */
  selectedStage?: ListItem | null;
}

type Tile = { key: keyof typeof TYPICAL; filter: ContractDecisionFilter | undefined };
const TILES: Tile[] = [
  { key: 'ending', filter: undefined },
  { key: 'decided', filter: 'DECIDED' },
  { key: 'open', filter: 'OPEN' },
  { key: 'notices', filter: ContractDecision.NOTICE },
  { key: 'toDeactivate', filter: 'TO_DEACTIVATE' },
];

/**
 * Contract renewals (spec → Screens, option A): the contract year, five tiles that filter the list,
 * the list with a decision per row, and "Renew selected" for the ticked rows. The API pages,
 * searches, filters and orders the list ("needs action first") and counts the tiles; this shows the
 * page it got.
 */
export function ContractsList({
  basePath,
  employeesPath,
  query,
  currentYear,
  today,
  rows,
  total,
  totals,
  calendar,
  error = false,
  selectedStage = null,
}: ContractsListProps) {
  const { t, has, locale } = useTranslation();
  const router = useRouter();
  const can = useCan();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The ticked rows belong to the page on screen: a new page, year or filter starts empty.
  const [ticked, setTicked] = useState<{ rows: Contract[] | undefined; map: Map<string, Contract> }>({ rows, map: new Map() });
  const selected = ticked.rows === rows ? ticked.map : EMPTY_SELECTION;
  const setSelected = (update: Map<string, Contract> | ((prev: Map<string, Contract>) => Map<string, Contract>)) =>
    setTicked((prev) => {
      const base = prev.rows === rows ? prev.map : EMPTY_SELECTION;
      return { rows, map: typeof update === 'function' ? update(base) : update };
    });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkError, setBulkError] = useState<{ message: string; refused: string[] } | null>(null);
  const bulkStale = useRef(false);
  const loading = rows === undefined;
  const manage = can('hr.contracts.manage');
  const changeStatus = can('hr.employees.change_status');

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  // Every list control updates the URL in place: no scroll to top, the rows dim while it loads.
  function go(next: ContractsListQuery) {
    startTransition(() => router.push(`${basePath}${contractsQueryString(next, currentYear)}`, { scroll: false }));
  }

  function onSearchChange(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => go({ ...query, search: text.trim() || undefined, page: PAGINATION.defaultPage }),
      SEARCH_DEBOUNCE_MS,
    );
  }

  /** Search, stage, decision and the page in one URL update; the year is the period, not a filter. */
  function clearFilters() {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch('');
    go({ year: query.year, page: PAGINATION.defaultPage, limit: query.limit });
  }

  const filterCount = (query.search ? 1 : 0) + (query.decision ? 1 : 0) + (query.stageId ? 1 : 0);
  const stageOptions = useListItemOptions(GET_STAGES, locale, { includeHidden: true, selected: selectedStage });
  const yearText = formatContractYear(query.year);

  // ── Selection ("Renew selected") ────────────────────────────────────────────
  const selectable = (c: Contract) => abilitiesOf(c, { manage, changeStatus, today }).renew;
  const pageSelectable = (rows ?? []).filter(selectable);
  const pickedCount = pageSelectable.filter((c) => selected.has(c.id)).length;
  const selection: ContractSelection | undefined = manage
    ? {
        selectable,
        isSelected: (id) => selected.has(id),
        toggle: (c, on) =>
          setSelected((prev) => {
            const next = new Map(prev);
            if (on) next.set(c.id, c);
            else next.delete(c.id);
            return next;
          }),
        pageState: pickedCount === 0 ? false : pickedCount === pageSelectable.length ? true : 'indeterminate',
        togglePage: (on) => setSelected(new Map(on ? pageSelectable.map((c) => [c.id, c] as const) : [])),
        pageEmpty: pageSelectable.length === 0,
      }
    : undefined;
  const picked = [...selected.values()];
  const ends = new Set(picked.map((c) => c.endsOn));
  const sameEnd = ends.size === 1 ? renewedContractDates(picked[0]!.endsOn) : null;

  async function renewSelected() {
    setBulkError(null);
    const res = await callApi(RENEW_CONTRACTS(picked.map((c) => c.id)), {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage: t('contracts.renew.bulkDone', { count: formatCount(picked.length) }),
    });
    if (res.unauthorized) return false;
    if (res.success) {
      setSelected(new Map());
      router.refresh();
      return true;
    }
    bulkStale.current = true;
    const refused = refusedRows(res);
    const withCount = refused.length && !(res as { params?: unknown }).params ? { ...res, params: { count: refused.length } } : res;
    setBulkError({
      message: contractError(withCount, { t, has, locale }, t('errors.INTERNAL_ERROR')),
      refused: refused.map((r) => {
        const row = selected.get(r.contractId);
        const name = row ? localName(row.employee, locale) : r.contractId;
        const reason = has(`errors.${r.code}`) ? t(`errors.${r.code}`) : r.code;
        return t('contracts.renew.refusedItem', { name, reason });
      }),
    });
    return false;
  }

  // ── Tiles ───────────────────────────────────────────────────────────────────
  const tileValue = (key: Tile['key']) => {
    if (!totals) return null;
    const value = { ending: totals.ending, decided: totals.decided, open: totals.open, notices: totals.notices, toDeactivate: totals.toDeactivate }[key];
    return formatCount(value);
  };
  const tileSub = (key: Tile['key']) => {
    if (!totals) return <StatTileSubSkeleton />;
    switch (key) {
      case 'ending':
        return t('contracts.tiles.endingSub', { count: formatCount(totals.activeContracts) });
      case 'decided':
        return t('contracts.tiles.decidedSub', { renewing: formatCount(totals.renewing), notRenewing: formatCount(totals.notRenewing) });
      case 'open':
        return t('contracts.tiles.openSub', { count: formatCount(totals.endedNoDecision) });
      case 'notices':
        return t('contracts.tiles.noticesSub', { early: formatCount(totals.noticesEarly), late: formatCount(totals.noticesLate) });
      case 'toDeactivate':
        return t('contracts.tiles.toDeactivateSub');
    }
  };
  const TILE_LOOK = {
    ending: { icon: CalendarIcon, tone: 'primary' },
    decided: { icon: ReadyIcon, tone: 'primary' },
    open: { icon: PendingIcon, tone: 'warning' },
    notices: { icon: EmailIcon, tone: 'info' },
    toDeactivate: { icon: DeactivateIcon, tone: 'danger' },
  } as const;

  const decisionOptions = [
    { value: 'OPEN', label: t('contracts.filters.open') },
    { value: 'DECIDED', label: t('contracts.filters.decided') },
    { value: 'TO_DEACTIVATE', label: t('contracts.filters.toDeactivate') },
    ...CONTRACT_DECISIONS.map((d) => ({ value: d, label: t(`common.enums.contractDecision.${d}`) })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('contracts.title')}
        description={t('contracts.description')}
        actions={
          <YearStepper
            year={query.year}
            onChange={(year) => go({ ...query, year, page: PAGINATION.defaultPage })}
            label={t('contracts.year.label')}
            previousLabel={t('contracts.year.previous')}
            nextLabel={t('contracts.year.next')}
            format={formatContractYear}
            sub={t('contracts.year.ends', { date: formatDate(contractYearRange(query.year).end, locale) })}
            min={YEAR_MIN}
            max={YEAR_MAX}
            disabled={pending || loading}
          />
        }
      />

      {calendar === null && !loading ? (
        <section
          role="status"
          data-testid="calendar-missing"
          className="flex flex-col gap-3 rounded-3xl border border-accent bg-accent-soft p-5 sm:flex-row sm:items-center"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-card text-accent-foreground">
            <CalendarIcon className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-bold">{t('contracts.calendar.missingTitle', { year: yearText })}</p>
            <p className="text-sm">{t('contracts.calendar.missingBody')}</p>
          </div>
          {can('hr.settings.view') ? (
            <Button asChild variant="secondary" className="cursor-pointer">
              <Link href={`/${locale}/settings?section=hrRules`}>
                <SettingsIcon />
                {t('contracts.calendar.set')}
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <section aria-label={t('contracts.tiles.label')} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {TILES.map((tile) => (
          <StatTile
            key={tile.key}
            icon={TILE_LOOK[tile.key].icon}
            tone={TILE_LOOK[tile.key].tone}
            label={t(`contracts.tiles.${tile.key}`)}
            value={tileValue(tile.key)}
            placeholder={formatCount(TYPICAL[tile.key])}
            sub={tileSub(tile.key)}
            loading={loading}
            pressed={tile.filter === undefined ? false : query.decision === tile.filter}
            onSelect={() =>
              go({
                ...query,
                // A tile filters by its group; pressed again (or "Ending this year") shows them all.
                decision: tile.filter === undefined || query.decision === tile.filter ? undefined : tile.filter,
                page: PAGINATION.defaultPage,
              })
            }
            className={tile.key === 'ending' ? 'col-span-2 md:col-span-1' : undefined}
          />
        ))}
      </section>

      <ContractsTable
        label={t('contracts.list.tableLabel', { year: yearText })}
        rows={rows}
        today={today}
        year={query.year}
        calendar={calendar}
        historyHref={(id) => `${employeesPath}/${id}/contracts`}
        selection={selection}
        refreshing={pending}
        error={error}
        retrying={pending && error}
        onRetry={() => startTransition(() => router.refresh())}
        empty={
          filterCount > 0 ? (
            <EmptyState
              icon={SearchIcon}
              title={t('contracts.list.noResultsTitle')}
              description={t('contracts.list.noResultsBody')}
              action={<ClearFilters placement="empty" count={filterCount} onClear={clearFilters} />}
            />
          ) : (
            <EmptyState icon={ContractEndIcon} title={t('contracts.list.emptyTitle')} description={t('contracts.list.emptyBody')} />
          )
        }
        pagination={{
          page: query.page,
          limit: query.limit,
          total,
          onPageChange: (page) => go({ ...query, page }),
        }}
        toolbar={
          <div className="flex w-full flex-col gap-3">
            <div role="search" className="flex w-full flex-wrap items-center gap-2.5">
              <SearchInput
                aria-label={t('contracts.filters.searchLabel')}
                placeholder={t('contracts.filters.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                disabled={loading}
                loading={pending}
              />
              <FilterSelect
                label={t('contracts.filters.stage')}
                allLabel={t('contracts.filters.allStages')}
                value={query.stageId}
                server={stageOptions}
                onChange={(v) => go({ ...query, stageId: v, page: PAGINATION.defaultPage })}
                disabled={loading}
              />
              <FilterSelect
                label={t('contracts.filters.decision')}
                allLabel={t('contracts.filters.allDecisions')}
                value={query.decision}
                options={decisionOptions}
                onChange={(v) => go({ ...query, decision: v as ContractDecisionFilter | undefined, page: PAGINATION.defaultPage })}
                disabled={loading}
              />
            </div>
            <div className="flex min-h-9 flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
              <span data-testid="contracts-count" className="tabular">
                {loading ? <span className="invisible">{t('contracts.filters.count', { count: formatCount(TYPICAL.ending) })}</span> : t('contracts.filters.count', { count: formatCount(total) })}
              </span>
              <ClearFilters count={filterCount} onClear={clearFilters} disabled={loading || pending} className="ms-auto" />
            </div>
          </div>
        }
      />

      {picked.length > 0 ? (
        <section
          aria-label={t('contracts.bulk.label')}
          data-testid="bulk-bar"
          className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-card shadow-raised"
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-bold">{t('contracts.bulk.selected', { count: formatCount(picked.length) })}</span>
            <span className="text-xs opacity-80">
              {sameEnd
                ? t('contracts.bulk.eachGets', { start: formatDate(sameEnd.startsOn, locale), end: formatDate(sameEnd.endsOn, locale) })
                : t('contracts.bulk.eachGetsOwn')}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="cursor-pointer text-card hover:bg-card/10 hover:text-card" onClick={() => setSelected(new Map())}>
            {t('contracts.bulk.clear')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="cursor-pointer bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={() => {
              setBulkError(null);
              setBulkOpen(true);
            }}
          >
            <RecalculateIcon />
            {t('contracts.bulk.renew')}
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={(open) => {
          setBulkOpen(open);
          if (!open && bulkStale.current) {
            bulkStale.current = false;
            router.refresh();
          }
        }}
        title={t('contracts.renew.bulkTitle', { count: formatCount(picked.length) })}
        description={
          <>
            {t('contracts.renew.bulkBody')}
            {bulkError ? (
              <span role="alert" className="mt-3 flex flex-col gap-1.5 rounded-xl bg-destructive-soft px-3.5 py-2.5 font-semibold text-destructive-ink">
                <span>{bulkError.message}</span>
                {bulkError.refused.length ? (
                  <span aria-label={t('contracts.renew.refusedLabel')} role="list" className="flex flex-col gap-1 font-normal" data-testid="refused-rows">
                    {bulkError.refused.map((line) => (
                      <span role="listitem" key={line} className="break-words">
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
          </>
        }
        confirmLabel={t('contracts.renew.bulkConfirm', { count: formatCount(picked.length) })}
        onConfirm={renewSelected}
      />
    </div>
  );
}
