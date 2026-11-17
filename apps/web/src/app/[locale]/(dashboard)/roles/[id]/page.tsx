import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { RoleScreen } from '@/modules/access';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('roles');

/** A role's page: its names, permissions with scopes and who holds it. */
export default async function RolePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  return <RoleScreen locale={locale} id={id} />;
}
