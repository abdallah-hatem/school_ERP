import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireScreen } from '@/core/auth';
import { PayrollRunLayout } from '@/modules/hr/payroll';
import { isLocale } from '@/shared/lib/i18n';

/**
 * One month's run: loads the run once and draws the header, actions, notices and tabs (Employees,
 * History). A layout stays mounted across its tabs and the lines' filters, so switching tabs
 * renders only the tab (its own `loading.tsx`); the run is read again only on `router.refresh()`.
 */
export default async function PayrollRunRouteLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string; id: string }>;
  children: ReactNode;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('payrollRun');
  return (
    <PayrollRunLayout locale={locale} id={id}>
      {children}
    </PayrollRunLayout>
  );
}
