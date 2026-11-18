import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { UserScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('users');

/** A user's page: edit (with `core.users.manage`) or read it. */
export default async function UserPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen (SCREENS).
  await requireScreen('user');
  return <UserScreen locale={locale} id={id} />;
}
