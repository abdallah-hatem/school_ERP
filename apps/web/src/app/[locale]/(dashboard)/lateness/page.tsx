import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/core/auth';
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
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requirePermission('hr.lateness.view');
  return <LatenessScreen locale={locale} month={month} />;
}
