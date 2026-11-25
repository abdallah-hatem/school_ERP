import type { Locale, MessageTree } from '@/shared/lib/i18n';
import { I18nProvider } from '@/shared/providers/i18n-provider';
import { SettingsScreen } from '../components/settings-screen';
import { getSettingsMessages } from '../i18n';
import { parseSection, type SectionSlots } from '../sections';

/** Settings (§7): the module's namespace on top of the base translations, then the screen. */
export function SettingsPage({
  locale,
  section,
  slots,
}: {
  locale: Locale;
  section?: string | string[];
  /** Sections another module owns, composed in by the route (Contract templates: HR's). */
  slots?: SectionSlots;
}) {
  return (
    <I18nProvider messages={{ settings: getSettingsMessages(locale) } as unknown as MessageTree}>
      <SettingsScreen initialSection={parseSection(section)} slots={slots} />
    </I18nProvider>
  );
}
