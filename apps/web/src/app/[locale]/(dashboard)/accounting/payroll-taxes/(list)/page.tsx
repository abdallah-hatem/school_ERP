import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { PayrollTaxesScreen } from '@/modules/accounting';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payrollTaxes');

/** Payroll taxes (§10): the year board. `?year`. */
export default async function PayrollTaxesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payrollTaxes');
  return <PayrollTaxesScreen locale={locale} searchParams={query} />;
}
