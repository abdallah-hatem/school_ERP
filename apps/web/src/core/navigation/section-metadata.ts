import type { Metadata } from 'next';
import { getCommonMessages, isLocale } from '@/shared/lib/i18n';
import type { NavItem } from './nav-items';

/**
 * A page's `generateMetadata`: its section's name as the tab title, which the signed-in layout's
 * template turns into `"<page> · <school name>"` (`titleTemplateFor`).
 */
export function sectionMetadata(key: NavItem['key']) {
  return async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
    const { locale } = await params;
    return isLocale(locale) ? { title: getCommonMessages(locale).nav[key] } : {};
  };
}
