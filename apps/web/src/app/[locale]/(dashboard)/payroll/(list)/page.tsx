import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
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
  return <PayrollRunsScreen locale={locale} searchParams={query} />;
}
