import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { LatenessScreen } from '@/modules/hr/lateness';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('lateness');

/** Monthly lateness (§5). `?month=YYYY-MM`, this month by default. */
export default async function LatenessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const [{ locale }, { month }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <LatenessScreen locale={locale} month={month} />;
}
