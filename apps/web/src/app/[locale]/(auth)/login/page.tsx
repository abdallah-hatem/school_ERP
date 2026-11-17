import { notFound } from 'next/navigation';
import { LoginPage } from '@/core/auth';
import { isLocale } from '@/shared/lib/i18n';

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
