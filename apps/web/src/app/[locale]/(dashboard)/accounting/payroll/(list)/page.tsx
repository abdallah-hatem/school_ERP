import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { AccountingPayrollScreen } from '@/modules/accounting';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('accountingPayroll');

/** Accounting → Payroll (§10): HR's approved months with insurance and taxes. `?page&limit`. */
export default async function AccountingPayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('accountingPayroll');
  return <AccountingPayrollScreen locale={locale} searchParams={query} />;
}
