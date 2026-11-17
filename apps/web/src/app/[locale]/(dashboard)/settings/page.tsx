import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
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
  return <SettingsPage locale={locale} section={section} />;
}
