import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoginPage } from '@/core/auth';
import { getAuthMessages } from '@/core/auth/i18n';
import { titleTemplateFor } from '@/core/settings';
import { getPublicSchoolBranding } from '@/core/settings/get-branding';
import { isLocale } from '@/shared/lib/i18n';

/** "Sign in · <school name>" in the current language (product name as fallback). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { template } = titleTemplateFor(await getPublicSchoolBranding(), locale);
  return { title: { absolute: template.replace('%s', getAuthMessages(locale).login.title) } };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <LoginPage locale={locale} next={typeof next === 'string' ? next : undefined} />;
}
