import { isMonth } from '@school-erp/shared';
import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { AccountingPayrollMonthScreen } from '@/modules/accounting';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('accountingPayroll');

/** One approved month in Accounting → Payroll (§10). `:month` is `YYYY-MM`. */
export default async function AccountingPayrollMonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; month: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale, month }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale) || !isMonth(month)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('accountingPayrollMonth');
  return <AccountingPayrollMonthScreen locale={locale} month={month} searchParams={query} />;
}
