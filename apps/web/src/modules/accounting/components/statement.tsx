'use client';

import {
  DEFAULT_TAX_RULE,
  PAGINATION,
  PAYROLL_PAGINATION,
  InsuranceStatus,
  type AccountingPayrollLine,
  type AccountingPayrollLinesPage,
  type AccountingPayrollMonth,
  type Month,
  type Piastres,
  type TaxRule,
} from '@school-erp/shared';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { callApi } from '@/lib/callApi';
import { EmployeeLink } from '@/core/employees';
import { useSchoolBranding } from '@/core/settings';
import { DataTable, type DataTableColumn, type DataTableFooter } from '@/shared/components/data-table/data-table';
import { ClearFilters, SearchInput } from '@/shared/components/form/filter-controls';
import { EmptyState } from '@/shared/components/layout/empty-state';
import { PageHeader } from '@/shared/components/layout/page-header';
import { Button } from '@/shared/components/ui/button';
import { Money } from '@/shared/components/ui/figures';
import {
  ExcelIcon,
  HideIcon,
  InsuredIcon,
  LockedIcon,
  OtherRuleIcon,
  PdfIcon,
  SameRuleIcon,
  SearchIcon,
} from '@/shared/components/ui/icons';
import { SkeletonButton, SkeletonPill, SkeletonProse, SkeletonText } from '@/shared/components/ui/skeleton';
import { StatusPill } from '@/shared/components/ui/status-pill';
import { saveDownloadedFile } from '@/shared/lib/download';
import { formatCount, formatMoney, formatMonth } from '@/shared/lib/format';
import { localName, nameIn, type Locale, type Translate } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/providers/i18n-provider';
import { GET_PAYROLL_TAXES_EXCEL } from '../apis';
import { statementQueryString, type StatementQuery, type TablePage } from '../lib/lines-query';
import { formatPercent, ruleSlices, sameRule, SUBTOTAL_FIELDS, type SubtotalField } from '../lib/payroll-taxes';
import { loadEveryLine } from '../lib/print-lines';
import { usePrintEveryLine } from '../lib/use-print-every-line';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_QUERY: StatementQuery = {
  insured: { page: PAGINATION.defaultPage, limit: PAGINATION.defaultLimit },
  notInsured: { page: PAGINATION.defaultPage, limit: PAGINATION.defaultLimit },
};

const isSubtotalField = (id: string): id is SubtotalField => (SUBTOTAL_FIELDS as readonly string[]).includes(id);

/*
 * One approved month as a printable statement (§10, mockup C): the sum net + insurance share +
 * income tax + martyrs' fund = gross across the top, the employees in two DataTables (insured /
 * not insured) with a subtotal row, then the tax rule the month was worked out with and how each
 * line is worked out. Amounts only within the viewer's salary scope; totals only with every
 * salary (§2, P4). `month` undefined: its own skeleton.
 */

/**
 * Print: one landscape A4 per page (seven columns stay a table), no app chrome (the shell's and
 * this page's `no-print` parts), the statement flat on white.
 */
export const STATEMENT_PRINT_CSS = `@page { size: A4 landscape; margin: 10mm; }
@media print {
  html, body { background: var(--card) !important; }
  main { padding: 0 !important; }
  [data-statement] { box-shadow: none !important; padding: 0 !important; max-width: none !important; border-radius: 0 !important; }
  [data-statement] section[data-skeleton-block="table"] { box-shadow: none !important; break-inside: auto; }
  [data-statement] tr { break-inside: avoid; }
  [data-statement-sum] { break-inside: avoid; }
}`;

export interface StatementProps {
  /** `YYYY-MM`, known before the data (the title while it loads). */
  monthKey: Month;
  month: AccountingPayrollMonth | undefined;
  /**
   * Today's tax rule (Settings → Accounting), to say whether the month's rule is still the same.
   * `null`: the viewer can't read it (or it failed) — no badge.
   */
  todayRule: TaxRule | null;
  /** `/<locale>/accounting/payroll-taxes`. */
  basePath: string;
  /** The URL's search and each group's page (the API answered the groups for it). */
  query?: StatementQuery;
  /** Each group's page as the API paged, searched and summed it; `undefined` while loading. */
  insured?: AccountingPayrollLinesPage;
  notInsured?: AccountingPayrollLinesPage;
  /** How many employees each group holds, whatever the search ("3 of 12"). */
  groupSizes?: { insured: number; notInsured: number };
}

export function Statement({
  monthKey,
  month,
  todayRule,
  basePath,
  query = DEFAULT_QUERY,
  insured,
  notInsured,
  groupSizes,
}: StatementProps) {
  const { t, locale } = useTranslation();
  const { branding } = useSchoolBranding();
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const title = formatMonth(monthKey, locale);
  const loading = month === undefined || insured === undefined || notInsured === undefined;
  const seen = month?.visibleLines ?? 0;
  const school = nameIn(branding, locale) || t('ui.shell.productName');
  // The search, each group's page and size live in the URL; the API pages, searches and sums the
  // groups. Print lists every line of both groups, read from the API.
  const [search, setSearch] = useState(query.search ?? '');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const searching = Boolean(query.search) || search.trim().length > 0;
  const printing = usePrintEveryLine(async () => {
    const [ins, not] = await Promise.all([
      loadEveryLine(monthKey, InsuranceStatus.INSURED),
      loadEveryLine(monthKey, InsuranceStatus.NOT_INSURED),
    ]);
    return ins && not ? { insured: ins, notInsured: not } : null;
  });
  function go(next: StatementQuery) {
    startNavigation(() => router.push(`${basePath}/${monthKey}${statementQueryString(next)}`, { scroll: false }));
  }
  function onSearch(text: string) {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const next = text.trim();
    const run = () =>
      go({
        ...(next ? { search: next } : {}),
        insured: { ...query.insured, page: PAGINATION.defaultPage },
        notInsured: { ...query.notInsured, page: PAGINATION.defaultPage },
      });
    if (!next) {
      searchTimer.current = null;
      run();
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      run();
    }, SEARCH_DEBOUNCE_MS);
  }
  function clearSearch() {
    onSearch('');
  }
  const groupPage = (key: 'insured' | 'notInsured') => (next: TablePage) => go({ ...query, [key]: next });

  return (
    <div className="flex flex-col gap-6">
      <style>{STATEMENT_PRINT_CSS}</style>
      <PageHeader
        className="no-print"
        title={title}
        breadcrumbs={[{ label: t('accounting.payrollTaxes.actions.backToYear'), href: `${basePath}?year=${monthKey.slice(0, 4)}` }, { label: title }]}
        breadcrumbsLabel={t('ui.shell.breadcrumbs')}
        actions={loading ? <ActionsSkeleton /> : <StatementActions month={monthKey} onPrint={() => void printing.print()} printing={printing.busy} />}
      />

      <article
        data-statement=""
        // Its height follows the employees listed.
        data-skeleton-block="statement"
        data-skeleton-measure="width"
        aria-label={t('accounting.payrollTaxes.statement.label')}
        className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 rounded-3xl bg-card p-4 shadow-card @min-[740px]:gap-7 @min-[740px]:p-8"
      >
        <header
          data-skeleton-block="statement-head"
          className="flex items-start gap-4 border-b-2 border-foreground pb-4"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm break-words text-muted-foreground">
              {/* The school's name is known while loading: drawn as its own text, it wraps the same way. */}
              {loading ? (
                <SkeletonProse>{t('accounting.payrollTaxes.statement.kicker', { school })}</SkeletonProse>
              ) : (
                t('accounting.payrollTaxes.statement.kicker', { school })
              )}
            </p>
            <h2 className="font-display text-xl leading-tight font-extrabold @min-[740px]:text-2xl">{title}</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? (
                <SkeletonText className="text-sm" width="w-24" />
              ) : (
                t('accounting.payrollTaxes.board.employees', { count: formatCount(month.totals.employees) })
              )}
            </p>
          </div>
          <span className="shrink-0 -rotate-3 rounded-2xl print:me-2 border-2 border-success bg-success-soft px-3 py-1.5 text-center text-xs font-extrabold text-success-ink rtl:rotate-3">
            {t('accounting.payrollTaxes.statement.approvedOn')}
          </span>
        </header>

        <div data-skeleton-block="statement-sum" data-statement-sum="">
          {loading || month.salaryVisible ? (
            <SumLine month={month} t={t} />
          ) : (
            <div role="note" className="flex items-start gap-3 rounded-2xl bg-info-soft px-4 py-3.5 text-sm text-info-ink">
              <HideIcon className="mt-0.5 size-5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <p className="font-bold">
                  {t('accounting.payrollTaxes.statement.limitedTitle', {
                    seen: formatCount(seen),
                    total: formatCount(month.totals.employees),
                  })}
                </p>
                <p>{t('accounting.payrollTaxes.statement.limitedBody')}</p>
              </div>
            </div>
          )}
        </div>

        <div data-skeleton-block="statement-search" role="search" className="no-print flex flex-wrap items-center gap-2.5">
          <SearchInput
            aria-label={t('accounting.payrollTaxes.statement.search.label')}
            placeholder={t('accounting.payrollTaxes.statement.search.placeholder')}
            value={search}
            disabled={loading}
            loading={navigating}
            onChange={(e) => onSearch(e.target.value)}
          />
          <ClearFilters count={searching ? 1 : 0} onClear={clearSearch} disabled={loading} />
        </div>

        <Group
          title={t('accounting.payrollTaxes.statement.insured')}
          page={loading ? undefined : insured}
          size={groupSizes?.insured ?? insured?.total ?? 0}
          printRows={printing.rows?.insured}
          insured
          everySalary={month?.salaryVisible ?? true}
          searching={searching}
          onClearSearch={clearSearch}
          table={query.insured}
          onTableChange={groupPage('insured')}
          refreshing={navigating}
        />
        <Group
          title={t('accounting.payrollTaxes.statement.notInsured')}
          page={loading ? undefined : notInsured}
          size={groupSizes?.notInsured ?? notInsured?.total ?? 0}
          printRows={printing.rows?.notInsured}
          insured={false}
          everySalary={month?.salaryVisible ?? true}
          searching={searching}
          onClearSearch={clearSearch}
          table={query.notInsured}
          onTableChange={groupPage('notInsured')}
          refreshing={navigating}
        />

        <footer
          data-skeleton-block="statement-foot"
          className="grid gap-6 border-t border-border pt-5 @min-[740px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] @min-[740px]:gap-8"
        >
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="font-display text-sm font-extrabold">{t('accounting.payrollTaxes.statement.ruleTitle')}</h3>
            <RuleList rule={month?.taxRule ?? DEFAULT_TAX_RULE} skeleton={loading} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="font-display text-sm font-extrabold">{t('accounting.payrollTaxes.statement.methodTitle')}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {loading ? (
                <SkeletonProse>{t('accounting.payrollTaxes.statement.method')}</SkeletonProse>
              ) : (
                t('accounting.payrollTaxes.statement.method')
              )}
            </p>
            {!loading && todayRule ? (
              <span className="no-print mt-1">
                {sameRule(month.taxRule, todayRule) ? (
                  <StatusPill tone="success" icon={SameRuleIcon}>
                    {t('accounting.payrollTaxes.statement.sameRule')}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning" icon={OtherRuleIcon}>
                    {t('accounting.payrollTaxes.statement.otherRule')}
                  </StatusPill>
                )}
              </span>
            ) : loading ? (
              // The badge's place: the Accountant and the System admin, who open this, see it.
              <span className="mt-1">
                <SkeletonPill className="w-40" />
              </span>
            ) : null}
          </div>
        </footer>
        <p className="hidden text-xs text-muted-foreground print:block">{t('accounting.payrollTaxes.statement.printNote')}</p>
      </article>
    </div>
  );
}

/** Excel and Download PDF while the statement loads: the loaded buttons' boxes, labels invisible. */
function ActionsSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <SkeletonButton>
        <ExcelIcon />
        {t('accounting.payrollTaxes.actions.excel')}
      </SkeletonButton>
      <SkeletonButton>
        <PdfIcon />
        {t('accounting.payrollTaxes.actions.print')}
      </SkeletonButton>
    </div>
  );
}

/** Excel of every line as the viewer sees it (+ the rule), and print → PDF of every line (both read from the API). */
function StatementActions({ month, onPrint, printing }: { month: Month; onPrint: () => void; printing: boolean }) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await callApi(GET_PAYROLL_TAXES_EXCEL(month));
      if (res.success && res.data) saveDownloadedFile(res.data);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className="cursor-pointer" loading={exporting} onClick={() => void exportExcel()}>
        <ExcelIcon />
        {t('accounting.payrollTaxes.actions.excel')}
      </Button>
      <Button variant="primary" className="cursor-pointer" loading={printing} onClick={onPrint}>
        <PdfIcon />
        {t('accounting.payrollTaxes.actions.print')}
      </Button>
    </div>
  );
}

/** net + insurance share + income tax + martyrs' fund = gross (the month's totals). */
function SumLine({ month, t }: { month: AccountingPayrollMonth | undefined; t: Translate }) {
  const terms: { field: SubtotalField; label: string }[] = [
    { field: 'net', label: t('accounting.payrollTaxes.columns.net') },
    { field: 'insuranceAmount', label: t('accounting.payrollTaxes.columns.insuranceAmount') },
    { field: 'incomeTax', label: t('accounting.payrollTaxes.columns.incomeTax') },
    { field: 'martyrTax', label: t('accounting.payrollTaxes.columns.martyrTax') },
  ];
  const value = (field: SubtotalField) =>
    month ? <Money value={month.totals[field]} /> : <SkeletonText className="text-base" width="w-28" />;
  // Phone: a list (label at the start, figure at the end). From 740px of page (676 of the sum's
  // own width, inside the statement's padding): the sum as terms — the four
  // across with the gross as a band under them, and all five on one line only from 960px, where a
  // month of EGP 99,999,999.99 still fits each term (narrower, the figures overflowed their terms).
  return (
    <div className="@container/sum">
      <div className="flex flex-col @min-[676px]/sum:flex-row @min-[676px]/sum:flex-wrap @min-[676px]/sum:items-stretch @min-[676px]/sum:gap-2 @min-[960px]/sum:flex-nowrap">
        {terms.map((term, i) => (
          <Fragment key={term.field}>
            {i > 0 ? <Operator>+</Operator> : null}
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 border-b border-border px-0.5 py-2.5 @min-[676px]/sum:flex-1 @min-[676px]/sum:flex-col @min-[676px]/sum:flex-nowrap @min-[676px]/sum:items-stretch @min-[676px]/sum:justify-start @min-[676px]/sum:gap-1 @min-[676px]/sum:rounded-2xl @min-[676px]/sum:border @min-[676px]/sum:bg-muted @min-[676px]/sum:px-3.5 @min-[676px]/sum:py-3">
              <span className="text-xs font-semibold text-muted-foreground">{term.label}</span>
              {/* Bottom of the term: a figure whose label wrapped above it still lines up with the others. */}
              <span className="min-w-0 text-base font-extrabold @min-[676px]/sum:mt-auto">{value(term.field)}</span>
            </div>
          </Fragment>
        ))}
        <Operator wide>=</Operator>
        <div className="relative mt-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 overflow-hidden rounded-2xl bg-primary px-3.5 py-3 text-primary-foreground @min-[676px]/sum:mt-0 @min-[676px]/sum:basis-full @min-[960px]/sum:basis-0 @min-[960px]/sum:flex-[1.3] @min-[960px]/sum:flex-col @min-[960px]/sum:flex-nowrap @min-[960px]/sum:items-stretch @min-[960px]/sum:justify-start @min-[960px]/sum:gap-1 print:border print:border-foreground print:bg-card print:text-foreground">
          <span
            aria-hidden="true"
            // A band (phone, and under the terms): a small circle off the label's corner; a term on
            // their line: the feature tile's corner circle.
            className="absolute -start-4 -top-6 size-11 rounded-full bg-accent/85 print:hidden @min-[960px]/sum:start-auto @min-[960px]/sum:-end-7 @min-[960px]/sum:-top-11 @min-[960px]/sum:size-22"
          />
          <span className="relative text-xs font-semibold opacity-85">{t('accounting.payrollTaxes.columns.gross')}</span>
          <span className="relative min-w-0 text-lg font-extrabold @min-[676px]/sum:text-xl">{value('gross')}</span>
        </div>
      </div>
    </div>
  );
}

/** `+` between the terms; `=` (`wide`) only once the gross shares their line. */
function Operator({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'hidden w-4.5 shrink-0 place-items-center text-xl font-extrabold text-muted-foreground',
        wide ? '@min-[960px]/sum:grid' : '@min-[676px]/sum:grid',
      )}
    >
      {children}
    </span>
  );
}


/**
 * One insurance group: its heading and count, its DataTable showing the page the API sent (the
 * search's matches), and the subtotal row — the API's sums over every matching line of the group,
 * never the page, and saying how many. Print lists the whole group (`printRows`, read from the API).
 */
function Group({
  title,
  page,
  size,
  printRows,
  insured,
  everySalary,
  searching,
  onClearSearch,
  table,
  onTableChange,
  refreshing,
}: {
  title: string;
  /** The group's page from the API; `undefined` while loading. */
  page: AccountingPayrollLinesPage | undefined;
  /** How many employees the group holds, whatever the search. */
  size: number;
  printRows: AccountingPayrollLine[] | undefined;
  insured: boolean;
  everySalary: boolean;
  searching: boolean;
  onClearSearch: () => void;
  table: TablePage;
  onTableChange: (next: TablePage) => void;
  refreshing: boolean;
}) {
  const { t, locale } = useTranslation();
  const columns = groupColumns(t, locale, insured);
  const sums = page && everySalary ? page.totals : null;
  const footer: DataTableFooter = {
    label: page
      ? t('accounting.payrollTaxes.statement.subtotalAll', { count: formatCount(printRows ? size : page.total) })
      : t('accounting.payrollTaxes.statement.subtotal'),
    ...(sums
      ? {
          cells: Object.fromEntries(
            columns
              .filter((c) => isSubtotalField(c.id))
              .map((c) => [c.id, <Money key={c.id} value={sums[c.id as SubtotalField]} currency={false} />]),
          ),
        }
      : page
        ? {
            note: (
              <span className="inline-flex items-center gap-1.5">
                <LockedIcon className="size-4" />
                {t('accounting.payrollTaxes.statement.totalsHidden')}
              </span>
            ),
          }
        : { cells: Object.fromEntries(columns.filter((c) => isSubtotalField(c.id)).map((c) => [c.id, ''])) }),
  };
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <h3 className="font-display text-base font-extrabold">{title}</h3>
        <span className="text-sm text-muted-foreground tabular">
          {!page ? (
            <SkeletonText className="text-sm" width="w-6" />
          ) : searching ? (
            t('accounting.payrollTaxes.statement.groupCount', { shown: formatCount(page.total), total: formatCount(size) })
          ) : (
            formatCount(page.total)
          )}
        </span>
      </div>
      <DataTable
        label={title}
        columns={columns}
        rows={page?.items}
        printRows={printRows}
        loading={!page}
        refreshing={refreshing}
        getRowId={(l) => l.employeeId}
        footer={footer}
        pagination={{
          page: page?.page ?? table.page,
          limit: page?.limit ?? table.limit,
          total: page?.total ?? 0,
          onPageChange: (next) => onTableChange({ ...table, page: next }),
          pageSizes: PAYROLL_PAGINATION.pageSizes,
          onLimitChange: (next) => onTableChange({ page: PAGINATION.defaultPage, limit: next }),
        }}
        scrollHeight="screen"
        // A group can be empty one month (an empty state) and full the next: no skeleton can know,
        // so the tables are measured as part of the statement (width only).
        skeletonBlocks={false}
        cardsBelow={insured ? 960 : 740}
        empty={
          searching && size > 0 ? (
            <EmptyState
              className="py-8"
              icon={SearchIcon}
              title={t('accounting.payrollTaxes.statement.noMatch.title')}
              description={t('accounting.payrollTaxes.statement.noMatch.body')}
              action={<ClearFilters placement="empty" count={1} onClear={onClearSearch} />}
            />
          ) : (
            <EmptyState className="py-8" title={t('accounting.payrollTaxes.statement.noneInGroup')} description="" />
          )
        }
        className="border border-border shadow-none"
      />
    </section>
  );
}

function amount(field: SubtotalField | 'insuredSalary', line: AccountingPayrollLine): ReactNode {
  const value = line[field];
  if (field === 'insuredSalary' && line.salaryVisible && value == null) return <span className="text-muted-foreground">—</span>;
  return <Money value={line.salaryVisible ? ((value ?? 0) as Piastres) : undefined} currency={false} />;
}

function groupColumns(t: Translate, locale: Locale, insured: boolean): DataTableColumn<AccountingPayrollLine>[] {
  const money = (id: SubtotalField | 'insuredSalary', extra: Partial<DataTableColumn<AccountingPayrollLine>> = {}): DataTableColumn<AccountingPayrollLine> => ({
    id,
    header: t(`accounting.payrollTaxes.columns.${id}`),
    cell: (line) => amount(id, line),
    align: 'end',
    className: 'w-36 min-w-32',
    ...extra,
  });
  return [
    {
      id: 'employee',
      header: t('accounting.payrollTaxes.columns.employee'),
      card: 'title',
      cell: (line) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <EmployeeLink employeeId={line.employeeId} name={localName(line, locale)} code={line.employeeCode} className="font-bold" />
          {!line.salaryVisible ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LockedIcon className="size-3.5" />
              {t('accounting.payrollTaxes.statement.salaryHidden')}
            </span>
          ) : null}
        </span>
      ),
      skeleton: (
        <span className="flex flex-col">
          <SkeletonText className="text-sm" width="w-32" />
          <SkeletonText className="text-xs" width="w-16" />
        </span>
      ),
      className: 'min-w-48 whitespace-normal',
    },
    {
      // The group's heading says it in the table; on a phone card it is the card's status pill.
      id: 'insurance',
      header: t('accounting.payrollTaxes.columns.insurance'),
      card: 'status',
      cell: () =>
        insured ? (
          <StatusPill tone="info" icon={InsuredIcon}>
            {t('accounting.payrollTaxes.statement.insuredOne')}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">{t('accounting.payrollTaxes.statement.notInsuredOne')}</StatusPill>
        ),
      className: 'hidden',
    },
    ...(insured ? [money('insuredSalary')] : []),
    money('net', {
      cell: (line) =>
        line.salaryVisible && line.net === 0 ? (
          <span className="flex flex-col items-end gap-0.5">
            <Money value={0} currency={false} className="font-bold" />
            <span className="text-xs whitespace-normal text-warning-ink">{t('accounting.payrollTaxes.statement.netZero')}</span>
          </span>
        ) : (
          <Money value={line.salaryVisible ? line.net : undefined} currency={false} className="font-bold" />
        ),
    }),
    ...(insured ? [money('insuranceAmount')] : []),
    money('incomeTax'),
    money('martyrTax'),
    money('gross', {
      card: 'highlight',
      cell: (line) => <Money value={line.salaryVisible ? line.gross : undefined} currency={false} className="font-extrabold text-primary" />,
    }),
  ];
}

/** The rule's slices and rates, as the statement prints them. `skeleton`: the default rule drawn as bars. */
function RuleList({ rule, skeleton }: { rule: TaxRule; skeleton: boolean }) {
  const { t } = useTranslation();
  const rows: { label: string; value: string }[] = [
    ...ruleSlices(rule).map((slice) => ({
      label: t(`accounting.payrollTaxes.rule.${slice.kind}`, { amount: formatMoney(slice.amount) }),
      value: formatPercent(slice.percent),
    })),
    { label: t('accounting.payrollTaxes.rule.insurance'), value: formatPercent(rule.insurancePercent) },
    { label: t('accounting.payrollTaxes.rule.martyr'), value: formatPercent(rule.martyrPercent) },
  ];
  const text = (s: string) => (skeleton ? <SkeletonProse>{s}</SkeletonProse> : s);
  return (
    <dl className="flex flex-col text-sm">
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 last:border-b-0">
          <dt className="min-w-0">{text(row.label)}</dt>
          <dd className={cn('shrink-0 font-bold tabular')}>{text(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
