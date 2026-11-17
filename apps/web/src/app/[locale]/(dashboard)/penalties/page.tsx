import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { PenaltiesScreen, type SearchParamsRecord } from '@/modules/hr/penalties';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('penalties');

/** Penalties (§4): `?month&status&search&page&limit` live in the URL; the server fetches with them. */
export default async function PenaltiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <PenaltiesScreen locale={locale} searchParams={query} />;
}
