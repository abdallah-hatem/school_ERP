import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { PayrollRunScreen } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payroll');

/** One month's payroll run. `?search&departmentId&flagged` filter its lines (API-side). */
export default async function PayrollRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <PayrollRunScreen locale={locale} id={id} searchParams={query} />;
}
