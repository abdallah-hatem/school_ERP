import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { ContractsScreen, type SearchParamsRecord } from '@/modules/hr/contracts';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('contracts');

/** Contract renewals (spec 2026-11-24): `?year&decision&stageId&search&page&limit` live in the URL. */
export default async function ContractsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('contracts');
  return <ContractsScreen locale={locale} searchParams={query} />;
}
