import { sectionMetadata } from '@/core/navigation/section-metadata';
import { notFound } from 'next/navigation';
import { requireScreen } from '@/core/auth';
import { TemplateEditorScreen } from '@/modules/hr/contract-templates';
import { isLocale } from '@/shared/lib/i18n';

export const generateMetadata = sectionMetadata('settings');

/** Settings → Contract templates → New template (spec 2026-11-24-contract-templates). */
export default async function NewContractTemplatePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // R6: a page the viewer's roles can't open is the not-found screen (SCREENS).
  await requireScreen('contractTemplateNew');
  return <TemplateEditorScreen locale={locale} />;
}
