import { notFound } from 'next/navigation';
import { DashboardScreen } from '@/modules/hr/dashboard';
import { isLocale } from '@/shared/lib/i18n';

/** HR dashboard: headcount, this month's payroll run, this month's penalties, quick links. */
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <DashboardScreen locale={locale} />;
}
