import { notFound } from 'next/navigation';
import { getCommonMessages, isLocale } from '@/shared/lib/i18n';

/** Placeholder until the shell (T3) and dashboard (T15) land. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getCommonMessages(locale);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-2 px-4">
      <h1 className="text-2xl font-semibold">{t.app.name}</h1>
      <p className="text-muted-foreground">{t.app.comingSoon}</p>
    </main>
  );
}
