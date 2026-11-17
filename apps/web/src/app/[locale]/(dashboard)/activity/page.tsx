import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { ActivityScreen, type SearchParamsRecord } from '@/modules/activity';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('activity');

/** Activity (audit log): filters, search and page live in the URL; the server fetches with them. */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <ActivityScreen locale={locale} searchParams={query} />;
}
