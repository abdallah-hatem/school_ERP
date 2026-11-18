import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { SettingsPage } from '@/modules/settings';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('settings');

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const [{ locale }, { section }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen.
  await requireScreen('settings');
  return <SettingsPage locale={locale} section={section} />;
}
