import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { EmployeePenaltiesScreen, type SearchParamsRecord } from '@/modules/hr/penalties';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('employees');

/** Employee profile — the "Penalties" tab: every month, newest first. */
export default async function EmployeePenaltiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('employeePenalties');
  return <EmployeePenaltiesScreen locale={locale} employeeId={id} searchParams={query} />;
}
