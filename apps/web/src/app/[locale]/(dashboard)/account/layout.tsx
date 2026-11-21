import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AccountLayout } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

/**
 * My account: the header and the Profile / Notifications tabs. A layout stays mounted across its
 * tabs, so switching renders only the tab (each has its own `loading.tsx`), never the header again.
 */
export default async function AccountRouteLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string }>;
  children: ReactNode;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountLayout locale={locale}>{children}</AccountLayout>;
}
