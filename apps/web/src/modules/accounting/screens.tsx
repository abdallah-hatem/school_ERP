import { monthOf, type Month, type TaxRule } from '@school-erp/shared';
import { notFound } from 'next/navigation';
import { can, getSession } from '@/core/auth';
import { GET_ACCOUNTING_SETTINGS } from '@/modules/settings';
import type { Locale } from '@/shared/lib/i18n';
import { GET_PAYROLL_TAXES_MONTH, GET_PAYROLL_TAXES_YEAR } from './apis';
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
