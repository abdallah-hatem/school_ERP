import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import type { SearchParamsRecord } from '@/modules/hr/employees';
// Server-only screen: kept out of the module's index, which client components import.
import { EmployeeHistoryScreen } from '@/modules/hr/employees/history-screen';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Employee profile — the "History" tab: who changed what on this employee, by month. */
export default async function EmployeeHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <EmployeeHistoryScreen locale={locale} employeeId={id} searchParams={query} />;
}
