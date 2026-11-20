import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
// Server-only screen: kept out of the module's index, which client components import.
import { PayrollRunHistoryScreen } from '@/modules/hr/payroll/history-screen';
import type { SearchParamsRecord } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payroll');

/** One month's run — the "History" tab: who did what on the run, by month. */
export default async function PayrollRunHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payrollRunHistory');
  return <PayrollRunHistoryScreen locale={locale} runId={id} searchParams={query} />;
}
