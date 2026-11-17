import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { UserScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('users');

/** A user's page: edit (with `core.users.manage`) or read it. */
export default async function UserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <UserScreen locale={locale} id={id} />;
}
