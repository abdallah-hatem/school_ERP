import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { PayrollRunsScreen } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payroll');

/** Payroll runs (§6). `?page&limit`. */
export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payroll');
  return <PayrollRunsScreen locale={locale} searchParams={query} />;
}
