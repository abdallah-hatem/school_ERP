import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { DashboardScreen } from '@/modules/hr/dashboard';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('dashboard');

/** HR dashboard: headcount, this month's payroll run, this month's penalties, quick links. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen (SCREENS).
  await requireScreen('dashboard');
  return <DashboardScreen locale={locale} />;
}
