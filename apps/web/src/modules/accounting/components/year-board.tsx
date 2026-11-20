'use client';

import {
  AccountingMonthState,
  ACCOUNTING_YEAR_RANGE,
  type AccountingPayrollYear,
  type AccountingPayrollYearMonth,
  type Month,
} from '@school-erp/shared';
import Link from 'next/link';
import { useCan } from '@/core/auth';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import { CheckIcon, ChevronEndIcon, ChevronStartIcon, LockedIcon, PayrollTaxesIcon } from '@/shared/components/ui/icons';
import { SkeletonPill, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { formatCount, formatMonthName } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';

/*
 * The payroll taxes year board (§10, mockup C): the year's twelve months as tiles — approved (its
 * gross, opens the statement), a draft in HR (dashed: it shows here once HR approves it), or
 * nothing yet — so a gap in the year is visible. `data` undefined: its own skeleton.
 */

const TILE = 'flex min-h-30 flex-col gap-2 rounded-2xl p-3.5 @min-[640px]:min-h-36 @min-[640px]:rounded-[1.25rem] @min-[640px]:p-4.5';

export interface YearBoardProps {
  year: number;
  data: AccountingPayrollYear | undefined;
  /** `/<locale>/accounting/payroll-taxes`. */
  basePath: string;
  /** HR payroll, offered from the empty state. */
  payrollHref: string;
  /** This month (`YYYY-MM`): later months with no run are "not started", earlier ones "no payroll". */
  currentMonth: Month;
}

export function YearBoard({ year, data, basePath, payrollHref, currentMonth }: YearBoardProps) {
  const { t } = useTranslation();
  const can = useCan();
  const noneApproved = data !== undefined && !data.months.some((m) => m.state === AccountingMonthState.APPROVED);
  const thisYear = Number(currentMonth.slice(0, 4));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('accounting.payrollTaxes.title')}
        description={<span className="hidden md:inline">{t('accounting.payrollTaxes.description')}</span>}
        actions={<YearSwitch year={year} basePath={basePath} latest={Math.max(thisYear, ACCOUNTING_YEAR_RANGE.min)} />}
      />
      {noneApproved ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-primary-soft px-4 py-3.5 text-primary">
          <PayrollTaxesIcon className="mt-0.5 size-5 shrink-0" />
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="font-bold">{t('accounting.payrollTaxes.empty.title', { year: String(year) })}</p>
            <p className="text-foreground">
              {t('accounting.payrollTaxes.empty.body')}{' '}
              {can('hr.payroll.view') ? (
                <Link href={payrollHref} className="font-bold text-primary underline-offset-3 hover:underline">
                  {t('accounting.payrollTaxes.empty.action')}
                </Link>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}
      <section
        aria-label={t('accounting.payrollTaxes.board.label', { year: String(year) })}
        aria-busy={data ? undefined : true}
        data-skeleton-block="year-board"
        // Its rows grow with what each month holds (an approved tile is taller): the tiles are measured.
        data-skeleton-measure="width"
        className="grid grid-cols-2 gap-2.5 @min-[640px]:grid-cols-3 @min-[640px]:gap-3.5 @min-[960px]:grid-cols-4"
      >
        {data ? null : (
          <span role="status" className="sr-only">
            {t('ui.states.loading')}
          </span>
        )}
        {(data?.months ?? placeholderMonths(year)).map((m) =>
          data ? (
            <MonthTile key={m.month} month={m} basePath={basePath} future={m.month > currentMonth} />
          ) : (
            <TileSkeleton key={m.month} />
          ),
        )}
      </section>
    </div>
  );
}

function placeholderMonths(year: number): AccountingPayrollYearMonth[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    state: AccountingMonthState.NONE,
  }));
}

/** Previous / next year; never past this year (nothing is approved ahead of time). */
function YearSwitch({ year, basePath, latest }: { year: number; basePath: string; latest: number }) {
  const { t } = useTranslation();
  const href = (y: number) => `${basePath}?year=${y}`;
  const canBack = year > ACCOUNTING_YEAR_RANGE.min;
  const canForward = year < latest;
  return (
    <div data-skeleton-block="year-switch" className="flex items-center gap-2">
      <YearStep href={canBack ? href(year - 1) : undefined} label={t('accounting.payrollTaxes.year.previous')}>
        <ChevronStartIcon className="flip-rtl" />
      </YearStep>
      <span
        aria-label={`${t('accounting.payrollTaxes.year.label')} ${year}`}
        className="min-w-18 text-center font-display text-xl font-extrabold tabular"
      >
        {year}
      </span>
      <YearStep href={canForward ? href(year + 1) : undefined} label={t('accounting.payrollTaxes.year.next')}>
        <ChevronEndIcon className="flip-rtl" />
      </YearStep>
    </div>
  );
}

function YearStep({ href, label, children }: { href: string | undefined; label: string; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="secondary" size="icon" disabled aria-label={label} title={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="icon" className="cursor-pointer">
      {/* A year is a period, not a filter: the board stays where it is. */}
      <Link href={href} scroll={false} aria-label={label} title={label}>
        {children}
      </Link>
    </Button>
  );
}

function MonthTile({ month, basePath, future }: { month: AccountingPayrollYearMonth; basePath: string; future: boolean }) {
  const { t, locale } = useTranslation();
  const name = formatMonthName(month.month, locale);

  if (month.state === AccountingMonthState.APPROVED) {
    const summary = month.summary;
    return (
      <Link
        href={`${basePath}/${month.month}`}
        data-skeleton-block="month-tile"
        data-skeleton-each
        data-state="approved"
        className={cn(
          TILE,
          'cursor-pointer bg-card shadow-card transition-shadow duration-150',
          'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring/55',
          '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[var(--shadow-card),0_0_0_2px_var(--primary-soft)]',
        )}
      >
        <TileHead name={name}>
          <StatusPill tone="success" icon={CheckIcon}>
            {t('accounting.payrollTaxes.board.approved')}
          </StatusPill>
        </TileHead>
        {summary ? (
          <span className="text-xs text-muted-foreground">
            {t('accounting.payrollTaxes.board.employees', { count: formatCount(summary.totals.employees) })}
          </span>
        ) : null}
        {/* A size container: the gross follows the tile's width (16px in a 390px phone's half tile,
            20px on wide screens), so EGP 146,934,120.74 still fits a 320px phone's half tile. */}
        <div className="@container/gross mt-auto flex min-w-0 flex-col gap-0.5">
          {!summary ? (
            <span className="text-sm font-bold text-primary">{t('accounting.payrollTaxes.board.notWorkedOut')}</span>
          ) : summary.salaryVisible ? (
            <>
              <span className="text-xs text-muted-foreground">{t('accounting.payrollTaxes.board.gross')}</span>
              <Money
                value={summary.totals.gross}
                className="text-[clamp(0.8125rem,11cqi,1.25rem)] font-extrabold text-primary"
              />
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <LockedIcon className="size-4" />
              {t('accounting.payrollTaxes.board.totalsHidden')}
            </span>
          )}
        </div>
      </Link>
    );
  }

  const draft = month.state === AccountingMonthState.DRAFT;
  return (
    <div
      data-skeleton-block="month-tile"
      data-skeleton-each
      data-state={draft ? 'draft' : 'none'}
      className={cn(
        TILE,
        draft ? 'border-2 border-dashed border-input bg-card/50' : 'border border-border bg-card/40',
      )}
    >
      <TileHead name={name} muted>
        {draft ? (
          // Wraps in the narrowest tile ("مسودة في الموارد البشرية" in a 320px phone's half tile).
          <StatusPill tone="accent" className="whitespace-normal">
            {t('accounting.payrollTaxes.board.draft')}
          </StatusPill>
        ) : null}
      </TileHead>
      <span className="mt-auto text-xs text-muted-foreground">
        {draft
          ? t('accounting.payrollTaxes.board.draftHint')
          : future
            ? t('accounting.payrollTaxes.board.notStarted')
            : t('accounting.payrollTaxes.board.none')}
      </span>
    </div>
  );
}

/** The month's name, and its status pill (wraps under the name on a narrow tile). */
function TileHead({ name, muted = false, children }: { name: string; muted?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className={cn('font-display text-base font-extrabold', muted && 'text-muted-foreground')}>{name}</span>
      {children ? <span className="ms-auto">{children}</span> : null}
    </div>
  );
}

function TileSkeleton() {
  return (
    <div data-skeleton-block="month-tile" data-skeleton-each aria-hidden="true" className={cn(TILE, 'border border-border bg-card/40')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <SkeletonText className="font-display text-base" width="w-20" />
        <SkeletonPill className="ms-auto" />
      </div>
      <SkeletonText className="mt-auto text-xs" width="w-28" />
    </div>
  );
}
