import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { UserScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('users');

/** Add a user: a full page with a temporary password to give them. */
export default async function NewUserPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <UserScreen locale={locale} />;
}
