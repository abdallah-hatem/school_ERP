import { isMonth } from '@school-erp/shared';
import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { PayrollTaxesMonthScreen } from '@/modules/accounting';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payrollTaxes');

/** One approved month's payroll taxes statement (§10), printable. `:month` is `YYYY-MM`. */
export default async function PayrollTaxesMonthPage({ params }: { params: Promise<{ locale: string; month: string }> }) {
  const { locale, month } = await params;
  if (!isLocale(locale) || !isMonth(month)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payrollTaxesMonth');
  return <PayrollTaxesMonthScreen locale={locale} month={month} />;
}
