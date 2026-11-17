import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { dirFor, getCommonMessages, isLocale, LOCALES } from '@/shared/lib/i18n';
import '../globals.css';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getCommonMessages(locale).app.name };
}

/** Root layout: sets `lang` and `dir` from the locale segment (en | ar). */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
