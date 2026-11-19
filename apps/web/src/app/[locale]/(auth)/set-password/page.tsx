import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SetPasswordPage } from '@/core/auth';
import { getAuthMessages } from '@/core/auth/i18n';
import { titleTemplateFor } from '@/core/settings';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { isLocale } from '@/shared/lib/i18n';

/** "Set a new password · <school name>" in the current language. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { template } = titleTemplateFor(await getSchoolBranding(), locale);
  return { title: { absolute: template.replace('%s', getAuthMessages(locale).setPassword.pageTitle) } };
}

/** The forced "Set a new password" step after a temporary password (R9, spec P3). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ locale }, { next }] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  return <SetPasswordPage locale={locale} next={typeof next === 'string' ? next : undefined} />;
}
