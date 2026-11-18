import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { sectionMetadata } from '@/core/navigation/section-metadata';
import { AccountNotificationsScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('account');

/** My account → Notifications: every signed-in user's own switches, one per kind (§11). */
export default async function AccountNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  await requireScreen('accountNotifications');
  return <AccountNotificationsScreen locale={locale} />;
}
