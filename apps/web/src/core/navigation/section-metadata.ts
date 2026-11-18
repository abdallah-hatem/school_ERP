import type { Metadata } from 'next';
import { titleTemplateFor } from '@/core/settings/branding';
import { getSchoolBranding } from '@/core/settings/get-branding';
import { getCommonMessages, isLocale } from '@/shared/lib/i18n';
import type { NavItem } from './nav-items';

/**
 * A page's `generateMetadata`: `"<section> · <school name>"` as the tab title, the school name from
 * settings (`titleTemplateFor`). Absolute rather than left to the signed-in layout's template:
 * Next.js doesn't apply a layout's template to the page in its own segment, so the dashboard (the
 * `(dashboard)` layout's own page) read just "Dashboard".
 */
export function sectionMetadata(key: NavItem['key'] | 'account') {
  return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    if (!isLocale(locale)) return {};
    const { template } = titleTemplateFor(await getSchoolBranding(), locale);
    return { title: { absolute: template.replace('%s', getCommonMessages(locale).nav[key]) } };
  };
}
