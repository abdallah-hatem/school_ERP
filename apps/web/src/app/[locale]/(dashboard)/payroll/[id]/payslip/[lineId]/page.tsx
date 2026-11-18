import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { PayslipScreen } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('payroll');

/** Printable payslip of one line of an approved run (A4, in the page's language). */
export default async function PayslipPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; lineId: string }>;
}) {
  const { locale, id, lineId } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payslip');
  return <PayslipScreen locale={locale} id={id} lineId={lineId} />;
}
