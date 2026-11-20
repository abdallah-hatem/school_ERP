import { monthOf, type Month, type TaxRule } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import { can, getSession } from '@/core/auth';
import { GET_ACCOUNTING_SETTINGS } from '@/modules/settings';
import type { Locale } from '@/shared/lib/i18n';
import { GET_ACCOUNTING_PAYROLL, GET_PAYROLL_TAXES_MONTH, GET_PAYROLL_TAXES_YEAR } from './apis';
import { parseListQuery } from './lib/accounting-payroll';
import { PayrollList } from './components/payroll-list';
import { PayrollMonth } from './components/payroll-month';
import { Statement } from './components/statement';
import { YearBoard } from './components/year-board';
import { parseYear, type SearchParamsRecord } from './lib/payroll-taxes';
import { AccountingI18n } from './messages';

/** Server screens rendered by the `accounting/payroll-taxes` routes (§10). */

export const payrollTaxesPath = (locale: Locale) => `/${locale}/accounting/payroll-taxes`;

/** The year board for `?year=` (this year by default). A failed read throws to the route's error boundary. */
export async function PayrollTaxesScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  const year = parseYear(searchParams);
  const res = await GET_PAYROLL_TAXES_YEAR(year);
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payroll taxes failed to load');
  return (
    <AccountingI18n locale={locale}>
      <YearBoard
        year={year}
        data={res.data}
        basePath={payrollTaxesPath(locale)}
        payrollHref={`/${locale}/payroll`}
        currentMonth={monthOf(new Date())}
      />
    </AccountingI18n>
  );
}

/**
 * One month's statement. A month HR hasn't approved (or a malformed one) is the not-found page.
 * Today's tax rule is read only by someone who may view it (Settings → Accounting), for the
 * "Same as today's rule" badge; without it there is no badge.
 */
export async function PayrollTaxesMonthScreen({ locale, month }: { locale: Locale; month: Month }) {
  const session = await getSession();
  const [res, settings] = await Promise.all([
    GET_PAYROLL_TAXES_MONTH(month),
    can(session, 'accounting.settings.view') ? GET_ACCOUNTING_SETTINGS() : null,
  ]);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payroll taxes failed to load');
  const todayRule: TaxRule | null = settings?.success && settings.data ? settings.data.payroll : null;
  return (
    <AccountingI18n locale={locale}>
      <Statement monthKey={month} month={res.data} todayRule={todayRule} basePath={payrollTaxesPath(locale)} />
    </AccountingI18n>
  );
}

// ── Accounting → Payroll: HR's approved months, HR-style, with insurance and taxes ──────────

export const accountingPayrollPath = (locale: Locale) => `/${locale}/accounting/payroll`;

/** The approved months, newest first (`?page&limit`). A failed read is the table's error state. */
export async function AccountingPayrollScreen({ locale, searchParams }: { locale: Locale; searchParams: SearchParamsRecord }) {
  const query = parseListQuery(searchParams);
  const res = await GET_ACCOUNTING_PAYROLL(query);
  const ok = res.success && Array.isArray(res.data);
  return (
    <AccountingI18n locale={locale}>
      <PayrollList
        basePath={accountingPayrollPath(locale)}
        hrPayrollHref={`/${locale}/payroll`}
        query={query}
        months={ok ? res.data : null}
        total={ok ? (res.meta?.total ?? res.data!.length) : 0}
      />
    </AccountingI18n>
  );
}

/** One approved month, HR's columns plus taxes. A month HR hasn't approved is the not-found page. */
export async function AccountingPayrollMonthScreen({ locale, month }: { locale: Locale; month: Month }) {
  const res = await GET_PAYROLL_TAXES_MONTH(month);
  if (res.success === false && (res.status === 404 || res.status === 400)) notFound();
  if (!res.success || !res.data) throw new Error(res.message ?? 'Payroll failed to load');
  return (
    <AccountingI18n locale={locale}>
      <PayrollMonth monthKey={month} month={res.data} basePath={accountingPayrollPath(locale)} />
    </AccountingI18n>
  );
}
