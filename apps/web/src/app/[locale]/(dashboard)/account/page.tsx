import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { AccountScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('account');

/** My account: every signed-in user's own sign-in details and password. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <AccountScreen locale={locale} />;
}
