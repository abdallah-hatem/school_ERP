import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeeContractsScreen, type SearchParamsRecord } from '@/modules/hr/contracts';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Employee profile — the "Contracts" tab: every contract, newest first, and the current one's decisions. */
export default async function EmployeeContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employeeContracts');
  return <EmployeeContractsScreen locale={locale} employeeId={id} searchParams={query} />;
}
